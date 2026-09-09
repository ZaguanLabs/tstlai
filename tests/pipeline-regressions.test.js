const crypto = require('node:crypto');
const { Tstlai } = require('../src/core/Tstlai');
const { createNextStreamingRouteHandler } = require('../src/integrations/next');
const { createStreamingNextIntlAdapter } = require('../src/integrations/next-intl');

const instances = [];
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const items = (...texts) =>
  texts.map((text) => ({
    text,
    hash: crypto.createHash('sha256').update(text.trim()).digest('hex'),
  }));
function translator(config = {}) {
  const t = new Tstlai({ targetLang: 'nb', provider: { type: 'custom' }, ...config });
  t.provider.translate = jest.fn(async (texts) => texts.map((text) => `NB:${text}`));
  instances.push(t);
  return t;
}
async function collect(iterator) {
  const values = [];
  for await (const value of iterator) values.push(value);
  return values;
}
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(async () => {
  await Promise.all(instances.splice(0).map((t) => t.close()));
  jest.restoreAllMocks();
});

test('overlapping requests share cache lookup and in-flight provider work across normalized locales', async () => {
  const t = translator();
  const gate = deferred();
  const read = jest.spyOn(t.cache, 'getMany');
  t.provider.translate.mockImplementation(async (texts) => {
    await gate.promise;
    return texts.map((t) => `NB:${t}`);
  });
  const first = t.translateBatch(items('Same', 'Same'), 'nb');
  const second = t.translateBatch(items('Same'), 'nb-NO');
  await tick();
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0]).toHaveLength(1);
  gate.resolve();
  const results = await Promise.all([first, second]);
  expect(results.every((r) => r.translatedCount === 1 && r.status === 'complete')).toBe(true);
  const hit = await t.translateBatch(items('Same', 'Same'));
  expect(hit.cachedCount).toBe(2);
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('different target locales do not share a flight', async () => {
  const t = translator();
  await Promise.all([
    t.translateBatch(items('Hello'), 'nb'),
    t.translateBatch(items('Hello'), 'es'),
  ]);
  expect(t.provider.translate).toHaveBeenCalledTimes(2);
});

test('unique strings obey count and character budgets and concurrency is bounded', async () => {
  const t = translator({ batching: { maxTexts: 2, maxTotalChars: 5, concurrency: 2 } });
  let active = 0;
  let maximum = 0;
  const gates = [];
  t.provider.translate.mockImplementation(async (texts) => {
    active++;
    maximum = Math.max(maximum, active);
    const gate = deferred();
    gates.push(gate);
    await gate.promise;
    active--;
    return texts.map((text) => `NB:${text}`);
  });
  const result = t.translateBatch(items('aa', 'bb', 'ccc', 'dd', 'oversized', 'ee', 'ff'));
  await tick();
  expect(gates).toHaveLength(2);
  gates[0].resolve();
  await tick();
  expect(gates).toHaveLength(3);
  gates[1].resolve();
  gates[2].resolve();
  await tick();
  gates[3].resolve();
  expect((await result).translatedCount).toBe(7);
  expect(maximum).toBe(2);
  expect(t.provider.translate.mock.calls.map((c) => c[0])).toEqual([
    ['aa', 'bb'],
    ['ccc', 'dd'],
    ['oversized'],
    ['ee', 'ff'],
  ]);
});

test('stream deduplicates repeated strings while preserving every original index', async () => {
  const t = translator();
  t.provider.translateStream = jest.fn(async function* (texts) {
    for (const [index, text] of texts.entries()) yield { index, translation: `NB:${text}` };
  });
  const output = await collect(t.translateBatchStream(items('One', 'Two', 'One')));
  expect(t.provider.translateStream.mock.calls[0][0]).toEqual(['One', 'Two']);
  expect(output.map((v) => [v.index, v.translation])).toEqual([
    [0, 'NB:One'],
    [2, 'NB:One'],
    [1, 'NB:Two'],
  ]);
  expect((await t.translateBatch(items('One', 'Two'))).cachedCount).toBe(2);
});

test('stream can join a batch flight and batch can join an unfinished stream without accepting provisional data', async () => {
  const t = translator();
  const gate = deferred();
  t.provider.translateStream = jest.fn(async function* () {
    yield { index: 0, translation: 'Hei' };
    await gate.promise;
  });
  const stream = t.translateBatchStream(items('Hello'));
  expect((await stream.next()).value.translation).toBe('Hei');
  let settled = false;
  const batch = t.translateBatch(items('Hello')).then((value) => {
    settled = true;
    return value;
  });
  const rest = collect(stream);
  await tick();
  expect(settled).toBe(false);
  expect(await t.getCachedTranslation(items('Hello')[0].hash)).toBeNull();
  gate.resolve();
  expect((await batch).translations.get(items('Hello')[0].hash)).toBe('Hei');
  await rest;
  expect(t.provider.translate).not.toHaveBeenCalled();

  const secondGate = deferred();
  t.provider.translate.mockImplementation(async () => {
    await secondGate.promise;
    return ['Verden'];
  });
  const pending = t.translateBatch(items('World'));
  const streaming = collect(t.translateBatchStream(items('World')));
  await tick();
  secondGate.resolve();
  expect((await streaming)[0].translation).toBe('Verden');
  await pending;
  expect(t.provider.translateStream).toHaveBeenCalledTimes(1);
});

test('failed provisional stream is not cached and shared batch falls back; next request retries', async () => {
  const t = translator();
  const gate = deferred();
  t.provider.translateStream = jest.fn(async function* () {
    yield { index: 0, translation: 'Invalid' };
    await gate.promise;
    throw new Error('broken stream');
  });
  const stream = t.translateBatchStream(items('Hello'));
  await stream.next();
  const batch = t.translateBatch(items('Hello'));
  const rest = collect(stream).catch((e) => e);
  gate.resolve();
  expect((await rest).message).toBe('broken stream');
  expect((await batch).status).toBe('fallback');
  expect(await t.getCachedTranslation(items('Hello')[0].hash)).toBeNull();
  expect((await t.translateBatch(items('Hello'))).status).toBe('complete');
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test.each(
  [
    [{ index: -1, translation: 'bad' }],
    [{ index: 1, translation: 'bad' }],
    [
      { index: 0, translation: 'good' },
      { index: 0, translation: 'duplicate' },
    ],
    [{ index: 0, translation: 42 }],
    [],
  ].map((values) => [values]),
)('malformed stream never writes cache: %j', async (values) => {
  const t = translator();
  t.provider.translateStream = async function* () {
    yield* values;
  };
  await expect(collect(t.translateBatchStream(items('Hello')))).rejects.toThrow();
  expect(await t.getCachedTranslation(items('Hello')[0].hash)).toBeNull();
});

test('one aborted caller does not cancel a shared provider request', async () => {
  const t = translator();
  const gate = deferred();
  let signal;
  t.provider.translate.mockImplementation(async (...args) => {
    signal = args[6].signal;
    await gate.promise;
    return ['Hei'];
  });
  const controller = new AbortController();
  const cancelled = t
    .translateBatch(items('Hello'), undefined, { signal: controller.signal })
    .catch((e) => e);
  const survivor = t.translateBatch(items('Hello'));
  await tick();
  controller.abort();
  expect((await cancelled).name).toBe('AbortError');
  expect(signal.aborted).toBe(false);
  gate.resolve();
  expect((await survivor).status).toBe('complete');
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('last caller cancellation aborts upstream, skips cache writes and permits retry', async () => {
  const t = translator();
  const gate = deferred();
  let signal;
  t.provider.translate.mockImplementationOnce(async (...args) => {
    signal = args[6].signal;
    await gate.promise;
    return ['Stale'];
  });
  const controller = new AbortController();
  const work = t
    .translateBatch(items('Hello'), undefined, { signal: controller.signal })
    .catch((e) => e);
  await tick();
  controller.abort();
  expect((await work).name).toBe('AbortError');
  expect(signal.aborted).toBe(true);
  gate.resolve();
  await tick();
  expect(await t.getCachedTranslation(items('Hello')[0].hash)).toBeNull();
  expect((await t.translateBatch(items('Hello'))).status).toBe('complete');
});

test('cancelling queued work never sends it to the provider', async () => {
  const t = translator({ batching: { concurrency: 1, maxTexts: 1 } });
  const gate = deferred();
  t.provider.translate.mockImplementation(async (texts) => {
    await gate.promise;
    return texts;
  });
  const first = t.translateBatch(items('First'));
  const controller = new AbortController();
  const queued = t
    .translateBatch(items('Second'), undefined, { signal: controller.signal })
    .catch((e) => e);
  await tick();
  controller.abort();
  expect((await queued).name).toBe('AbortError');
  gate.resolve();
  await first;
  await tick();
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('automatic text batching supports per-caller cancellation and restores whitespace', async () => {
  const t = translator({ batching: { delayMs: 0 } });
  const controller = new AbortController();
  const cancelled = t
    .translateText('Hello', undefined, undefined, { signal: controller.signal })
    .catch((e) => e);
  const survivor = t.translateText(' Hello ');
  controller.abort();
  expect((await cancelled).name).toBe('AbortError');
  expect(await survivor).toBe(' NB:Hello ');
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('close releases queued and active callers, is idempotent, and rejects new work', async () => {
  const t = translator({ batching: { concurrency: 1 } });
  t.provider.translate.mockImplementation(() => new Promise(() => {}));
  const active = t.translateBatch(items('Active')).catch((e) => e);
  const queued = t.translateBatch(items('Queued')).catch((e) => e);
  const text = t.translateText('Text').catch((e) => e);
  await tick();
  await Promise.all([t.close(), t.close()]);
  expect((await active).name).toBe('AbortError');
  expect((await queued).name).toBe('AbortError');
  expect((await text).name).toBe('AbortError');
  await expect(t.translateText('New')).rejects.toThrow('closed');
  await expect(t.process('')).rejects.toThrow('closed');
  await expect(collect(t.translateBatchStream([]))).rejects.toThrow('closed');
});

test('completed chunks survive a different chunk failure in fallback mode', async () => {
  const t = translator({ batching: { maxTexts: 1 } });
  t.provider.translate.mockImplementation(async (texts) => {
    if (texts[0] === 'Bad') throw new Error('bad');
    return ['God'];
  });
  const result = await t.translateBatch(items('Good', 'Bad', 'Good'));
  expect(result).toMatchObject({ status: 'partial', translatedCount: 1, failedCount: 1 });
  expect([...result.translations.values()]).toEqual(['God']);
});

test('SSE response cancellation aborts provider and next-intl shares streamed work', async () => {
  const t = translator();
  const gate = deferred();
  let signal;
  t.provider.translateStream = jest.fn(async function* (...args) {
    signal = args[6].signal;
    yield { index: 0, translation: 'Hei' };
    await gate.promise;
  });
  const response = await createNextStreamingRouteHandler(t)(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ texts: ['Hello', ' Hello '] }),
    }),
  );
  const reader = response.body.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('Hei');
  const other = createStreamingNextIntlAdapter(t, { title: 'Hello' }).getStreamingMessages('nb');
  await tick();
  await reader.cancel();
  expect(signal.aborted).toBe(false);
  gate.resolve();
  expect(await other).toEqual({ title: 'Hei' });
  expect(t.provider.translateStream).toHaveBeenCalledTimes(1);
});

test('cancelling an SSE response with no other subscriber aborts a stalled provider', async () => {
  const t = translator();
  let signal;
  t.provider.translateStream = async function* (...args) {
    signal = args[6].signal;
    yield { index: 0, translation: 'Hei' };
    await new Promise(() => {});
  };
  const response = await createNextStreamingRouteHandler(t)(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ texts: ['Hello'] }),
    }),
  );
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  expect(signal.aborted).toBe(true);
});

test.each([{ concurrency: 0 }, { maxTexts: -1 }, { maxTotalChars: NaN }, { delayMs: -1 }])(
  'invalid scheduler limits fail immediately: %j',
  (batching) => {
    expect(() => translator({ batching })).toThrow('Invalid batching');
  },
);

test('get/set-only cache implementations remain supported with bounded parallel access', async () => {
  const t = translator({ batching: { maxTexts: 100, concurrency: 1 } });
  await t.cache.disconnect();
  const storage = new Map();
  let active = 0;
  let maximum = 0;
  t.cache = {
    async get(key) {
      active++;
      maximum = Math.max(maximum, active);
      await tick();
      active--;
      return storage.get(key) ?? null;
    },
    async set(key, value) {
      storage.set(key, value);
    },
  };
  const input = items(...Array.from({ length: 50 }, (_, i) => `Text ${i}`));
  expect((await t.translateBatch(input)).translatedCount).toBe(50);
  expect((await t.translateBatch(input)).cachedCount).toBe(50);
  expect(maximum).toBeLessThanOrEqual(16);
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('fifty simultaneous consumers of the same string produce one upstream request', async () => {
  const t = translator();
  const gate = deferred();
  t.provider.translate.mockImplementation(async () => {
    await gate.promise;
    return ['Hei'];
  });
  const requests = Array.from({ length: 50 }, () => t.translateBatch(items('Hello')));
  await tick();
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
  gate.resolve();
  expect((await Promise.all(requests)).every((result) => result.status === 'complete')).toBe(true);
});

test('an aborted incoming SSE request cancels a pending read and releases provider work', async () => {
  const t = translator();
  let upstream;
  t.provider.translateStream = async function* (...args) {
    upstream = args[6].signal;
    await new Promise(() => {});
  };
  const controller = new AbortController();
  const response = await createNextStreamingRouteHandler(t)(
    new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ texts: ['Hello'] }),
      signal: controller.signal,
    }),
  );
  const work = response.text().catch((error) => error);
  await tick();
  controller.abort();
  expect((await work).name).toBe('AbortError');
  expect(upstream.aborted).toBe(true);
});

test('warm-cache requests bypass an occupied provider queue', async () => {
  const t = translator({ batching: { concurrency: 1 } });
  await t.cacheTranslation(items('Cached')[0].hash, 'Lagret');
  const gate = deferred();
  t.provider.translate.mockImplementation(async () => {
    await gate.promise;
    return ['Hei'];
  });
  const slow = t.translateBatch(items('Slow'));
  await tick();
  let completed = false;
  const hot = t.translateBatch(items('Cached')).then((result) => {
    completed = true;
    return result;
  });
  await tick();
  expect(completed).toBe(true);
  expect((await hot).cachedCount).toBe(1);
  gate.resolve();
  await slow;
});
