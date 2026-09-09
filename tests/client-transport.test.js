const { requestTranslations } = require('../src/integrations/client-transport');
const encoder = new TextEncoder();
const sse = (text) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of encoder.encode(text)) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
afterEach(() => jest.restoreAllMocks());
const run = (options = {}) =>
  requestTranslations({
    endpoint: '/translate',
    texts: ['Hello'],
    signal: new AbortController().signal,
    onTranslation: jest.fn(),
    ...options,
  });

test('handles split SSE frames and UTF-8 and delivers indexed strings', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(sse('data: {"index":0,"translation":"Blå 😊"}\r\n\r\ndata: [DONE]\n\n'));
  const onTranslation = jest.fn();
  await run({ onTranslation });
  expect(onTranslation).toHaveBeenCalledWith(0, 'Blå 😊');
});
test.each([
  'data: {"error":"failed"}\n\n',
  'data: {"index":0,"translation":"Hei"}\n\n',
  'data: [DONE]\n\n',
  'data: {"index":4,"translation":"Hei"}\n\ndata: [DONE]\n\n',
  'data: {"index":0,"translation":"Hei"}\n\ndata: {"index":0,"translation":"Hei"}\n\ndata: [DONE]\n\n',
])('rejects failed or incomplete stream: %s', async (body) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(sse(body));
  await expect(run()).rejects.toThrow();
});
test('HTTP failures are errors instead of successful fallback', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(Response.json({ error: 'failure' }, { status: 500 }));
  await expect(run()).rejects.toThrow('HTTP 500');
});
test('partial batch failures preserve completed translations but reject the request', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      Response.json({
        translations: ['Hei', 'World'],
        error: 'Translation failed',
        failedIndices: [1],
      }),
    );
  const onTranslation = jest.fn();
  await expect(run({ texts: ['Hello', 'World'], onTranslation })).rejects.toThrow();
  expect(onTranslation.mock.calls).toEqual([[0, 'Hei']]);
});
test('chunks by text and character limits while preserving global indices', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, init) =>
      Response.json({ translations: JSON.parse(init.body).texts.map((t) => t.toUpperCase()) }),
    );
  const onTranslation = jest.fn();
  await run({
    texts: ['one', 'two', 'three', 'four'],
    maxTexts: 2,
    maxTotalChars: 7,
    onTranslation,
  });
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).texts)).toEqual([
    ['one', 'two'],
    ['three'],
    ['four'],
  ]);
  expect(onTranslation.mock.calls).toEqual([
    [0, 'ONE'],
    [1, 'TWO'],
    [2, 'THREE'],
    [3, 'FOUR'],
  ]);
});
test('cancellation stops late responses from updating content', async () => {
  const abort = new AbortController();
  jest.spyOn(global, 'fetch').mockImplementation(async () => {
    abort.abort();
    return Response.json({ translations: ['Hei'] });
  });
  const onTranslation = jest.fn();
  await expect(run({ signal: abort.signal, onTranslation })).rejects.toThrow();
  expect(onTranslation).not.toHaveBeenCalled();
});
