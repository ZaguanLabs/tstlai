const net = require('node:net');
const { InMemoryCache } = require('../src/core/Cache');
const { RedisCache } = require('../src/core/RedisCache');

const caches = [];
afterEach(async () => {
  await Promise.all(caches.splice(0).map((cache) => cache.disconnect()));
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const memory = (...args) => {
  const cache = new InMemoryCache(...args);
  caches.push(cache);
  return cache;
};

test('memory capacity evicts least recently read entries, including overwritten keys', async () => {
  const cache = memory(0, 2);
  await cache.setMany([
    ['a', 'A'],
    ['b', 'B'],
  ]);
  expect(await cache.get('a')).toBe('A');
  await cache.set('c', 'C');
  expect(await cache.getMany(['a', 'b', 'c'])).toEqual(['A', null, 'C']);
  await cache.set('a', 'New A');
  await cache.set('d', 'D');
  expect(await cache.getMany(['a', 'c', 'd'])).toEqual(['New A', null, 'D']);
});

test('TTL expires at its boundary and idle pruning releases entries without reads', async () => {
  jest.useFakeTimers({ now: 0 });
  const cache = memory(1, 2);
  await cache.set('a', 'A');
  jest.advanceTimersByTime(999);
  expect(await cache.get('a')).toBe('A');
  jest.advanceTimersByTime(1);
  expect(cache.entries.size).toBe(0);
  expect(await cache.get('a')).toBeNull();
  await cache.disconnect();
  expect(jest.getTimerCount()).toBe(0);
});

test('zero TTL retains empty strings and disconnect releases storage', async () => {
  jest.useFakeTimers();
  const cache = memory(0);
  await cache.set('empty', '');
  jest.advanceTimersByTime(10000000);
  expect(await cache.get('empty')).toBe('');
  await cache.disconnect();
  expect(await cache.get('empty')).toBeNull();
  await cache.set('later', 'ignored');
  expect(await cache.get('later')).toBeNull();
});

test.each([
  [-1, 10],
  [NaN, 10],
  [10, 0],
  [10, 1.5],
])('invalid memory limits reject: %j %j', (ttl, max) => {
  expect(() => memory(ttl, max)).toThrow('Invalid cache');
});

/** Minimal RESP fixture exercises the installed ioredis client, including key prefixing. */
async function redisFixture() {
  const commands = [];
  const store = new Map();
  const sockets = new Set();
  let hang = false;
  let failWrites = false;
  const bulk = (value) =>
    value === null ? '$-1\r\n' : `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length) {
        const first = buffer.indexOf('\r\n');
        if (first < 0) return;
        const count = Number(buffer.subarray(1, first).toString());
        let offset = first + 2;
        const args = [];
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf('\r\n', offset);
          if (end < 0) return;
          const length = Number(buffer.subarray(offset + 1, end).toString());
          offset = end + 2;
          if (buffer.length < offset + length + 2) return;
          args.push(buffer.subarray(offset, offset + length).toString());
          offset += length + 2;
        }
        buffer = buffer.subarray(offset);
        commands.push(args);
        const command = args[0].toLowerCase();
        if (command === 'info') socket.write(bulk('redis_version:7.0.0\r\nloading:0\r\n'));
        else if (command === 'mget' && !hang) {
          socket.write(
            `*${args.length - 1}\r\n` +
              args
                .slice(1)
                .map((key) => bulk(store.get(key) ?? null))
                .join(''),
          );
        } else if (command === 'set' && !hang) {
          if (failWrites) socket.write('-ERR write rejected\r\n');
          else {
            store.set(args[1], args[2]);
            socket.write('+OK\r\n');
          }
        } else if (command !== 'set' && command !== 'mget') socket.write('+OK\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const cache = new RedisCache(`redis://127.0.0.1:${server.address().port}`, 60, 'test:', 100);
  caches.push(cache);
  await new Promise((resolve) => cache.redis.once('ready', resolve));
  return {
    cache,
    commands,
    store,
    hang: () => {
      hang = true;
    },
    failWrites: () => {
      failWrites = true;
    },
    async close() {
      await cache.disconnect();
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('Redis uses one MGET and a SET pipeline with namespace, TTL and empty values preserved', async () => {
  const fixture = await redisFixture();
  try {
    await fixture.cache.setMany([
      ['a', 'Hei'],
      ['b', ''],
    ]);
    expect(await fixture.cache.getMany(['a', 'b', 'missing'])).toEqual(['Hei', '', null]);
    const commands = fixture.commands.filter((c) => ['mget', 'set'].includes(c[0]));
    expect(commands).toEqual([
      ['set', 'test:a', 'Hei', 'EX', '60'],
      ['set', 'test:b', '', 'EX', '60'],
      ['mget', 'test:a', 'test:b', 'test:missing'],
    ]);
    await fixture.cache.setMany([]);
    expect(await fixture.cache.getMany([])).toEqual([]);
    expect(fixture.commands.filter((c) => ['mget', 'set'].includes(c[0]))).toHaveLength(3);
  } finally {
    await fixture.close();
  }
});

test('Redis read and pipeline write timeouts fail open rather than hanging translation', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const fixture = await redisFixture();
  try {
    fixture.hang();
    expect(await fixture.cache.getMany(['a', 'b'])).toEqual([null, null]);
    await fixture.cache.setMany([['a', 'value']]);
    expect(
      console.error.mock.calls
        .flat()
        .some((value) => value instanceof Error && /timeout|timed out/i.test(value.message)),
    ).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('Redis surfaces individual pipeline command errors while keeping translation available', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const fixture = await redisFixture();
  try {
    fixture.failWrites();
    await fixture.cache.setMany([['a', 'value']]);
    expect(
      console.error.mock.calls
        .flat()
        .some((value) => value instanceof Error && /write rejected/.test(value.message)),
    ).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('disconnected Redis reads miss immediately and shutdown remains idempotent', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const fixture = await redisFixture();
  await fixture.close();
  expect(await fixture.cache.getMany(['a'])).toEqual([null]);
  await fixture.cache.setMany([['a', 'value']]);
  await fixture.cache.disconnect();
});
