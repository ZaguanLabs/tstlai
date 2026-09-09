const http = require('node:http');
const { createExpressMiddleware } = require('../src/integrations/express');
const { createAstroMiddleware } = require('../src/integrations/astro');
const { createRemixHandler } = require('../src/integrations/remix');
const { createFastifyPlugin } = require('../src/integrations/fastify');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

async function serve(handler, inspect) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await inspect(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Express passes binary bytes and write/end callbacks through unchanged', async () => {
  const bytes = Buffer.from([0, 255, 128, 65]);
  const translated = jest.fn();
  const wrote = jest.fn();
  const ended = jest.fn();
  await serve(
    (req, res) => {
      createExpressMiddleware({ process: translated })(req, res, () => {
        res.setHeader('content-type', 'application/octet-stream');
        res.write(bytes, wrote);
        res.end(ended);
      });
    },
    async (url) => {
      expect(Buffer.from(await (await fetch(url)).arrayBuffer())).toEqual(bytes);
    },
  );
  expect(wrote).toHaveBeenCalledTimes(1);
  expect(ended).toHaveBeenCalledTimes(1);
  expect(translated).not.toHaveBeenCalled();
});

test('Express preserves split UTF-8 input and repairs translated response headers', async () => {
  const input = Buffer.from('<p>Blå</p>');
  const translated = jest.fn(async (text) => ({ html: text.replace('Blå', 'Blue sky') }));
  await serve(
    (req, res) => {
      createExpressMiddleware({ process: translated })(req, res, () => {
        res.setHeader('content-type', 'text/html');
        res.setHeader('content-length', input.length);
        res.setHeader('etag', 'stale');
        res.write(input.subarray(0, 6));
        res.end(input.subarray(6));
      });
    },
    async (url) => {
      const response = await fetch(url);
      expect(await response.text()).toBe('<p>Blue sky</p>');
      expect(response.headers.get('etag')).toBeNull();
      expect(response.headers.get('content-length')).toBe(
        String(Buffer.byteLength('<p>Blue sky</p>')),
      );
    },
  );
  expect(translated).toHaveBeenCalledWith('<p>Blå</p>', { signal: expect.any(AbortSignal) });
});

test('Express translation failure preserves the complete original body', async () => {
  await serve(
    (req, res) => {
      createExpressMiddleware({
        process: async () => {
          throw new Error('failure');
        },
      })(req, res, () => {
        res.setHeader('content-type', 'text/html');
        res.write('<p>');
        res.end('Hello</p>');
      });
    },
    async (url) => expect(await (await fetch(url)).text()).toBe('<p>Hello</p>'),
  );
});

test.each(['Astro', 'Remix'])(
  '%s fallback body remains readable and successful transforms invalidate headers',
  async (framework) => {
    const run = (provider, original) =>
      framework === 'Astro'
        ? createAstroMiddleware(provider)({}, async () => original)
        : createRemixHandler(provider, async () => original)();
    const source = () =>
      new Response('<p>Hello</p>', {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'text/html',
          'content-length': '12',
          etag: 'old',
          'x-custom': 'keep',
        },
      });
    const fallback = await run(
      {
        process: async () => {
          throw new Error('failure');
        },
      },
      source(),
    );
    expect(await fallback.text()).toBe('<p>Hello</p>');
    const result = await run({ process: async () => ({ html: '<p>Hei alle</p>' }) }, source());
    expect(await result.text()).toBe('<p>Hei alle</p>');
    expect(result.status).toBe(201);
    expect(result.statusText).toBe('Created');
    expect(result.headers.get('etag')).toBeNull();
    expect(result.headers.get('content-length')).toBeNull();
    expect(result.headers.get('x-custom')).toBe('keep');
  },
);

test('Fastify invalidates stale HTML headers while retaining non-HTML payloads', async () => {
  let hook;
  await createFastifyPlugin({ process: async () => ({ html: '<p>Hei</p>' }) })({
    addHook: (_name, callback) => {
      hook = callback;
    },
  });
  const headers = new Map([
    ['content-type', 'text/html'],
    ['etag', 'old'],
    ['content-length', '100'],
  ]);
  const reply = {
    getHeader: (key) => headers.get(key),
    removeHeader: (key) => headers.delete(key),
  };
  expect(await hook({}, reply, '<p>Hello</p>')).toBe('<p>Hei</p>');
  expect(headers.has('etag')).toBe(false);
  expect(headers.has('content-length')).toBe(false);
  const bytes = Buffer.from([255]);
  expect(await hook({}, reply, bytes)).toBe(bytes);
});

test.each(['Astro', 'Remix'])('%s forwards the request cancellation signal', async (framework) => {
  const controller = new AbortController();
  const provider = { process: jest.fn(async (html) => ({ html })) };
  const request = new Request('http://localhost', { signal: controller.signal });
  const original = () =>
    Promise.resolve(new Response('<p>Hello</p>', { headers: { 'content-type': 'text/html' } }));
  if (framework === 'Astro') await createAstroMiddleware(provider)({ request }, original);
  else await createRemixHandler(provider, original)(request);
  expect(provider.process.mock.calls[0][1].signal).toBe(request.signal);
});

test('Node response lifecycle cancels active work and removes its listener on disposal', () => {
  const { EventEmitter } = require('node:events');
  const { responseCancellation } = require('../src/integrations/response-cancellation');
  const response = new EventEmitter();
  const lifetime = responseCancellation(response);
  expect(lifetime.signal.aborted).toBe(false);
  response.emit('close');
  expect(lifetime.signal.aborted).toBe(true);
  lifetime.dispose();
  expect(response.listenerCount('close')).toBe(0);
  const complete = responseCancellation(response);
  complete.dispose();
  response.emit('close');
  expect(complete.signal.aborted).toBe(false);
  response.destroyed = true;
  const destroyed = responseCancellation(response);
  expect(destroyed.signal.aborted).toBe(true);
  destroyed.dispose();
});
