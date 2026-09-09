const http = require('node:http');
const { OpenAIProvider } = require('../src/providers/OpenAIProvider');
const { Tstlai } = require('../src/core/Tstlai');

let server;
let baseUrl;
let requests;
let respond;
let consoleError;

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    requests.push({ path: req.url, payload });
    respond(res, payload);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

afterAll(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  requests = [];
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  respond = completionResponse('{"translations":["Hei"]}');
});

afterEach(() => consoleError.mockRestore());

function completionResponse(content, finishReason = 'stop') {
  return (res, payload) => {
    if (payload.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // Split every JSON escape and delimiter across completion chunks.
      for (const character of content) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: character }, finish_reason: null }] })}\n\n`,
        );
      }
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n`,
      );
      res.end('data: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
        }),
      );
    }
  };
}

function provider(options = {}) {
  return new Tstlai({
    targetLang: 'nb',
    provider: {
      type: 'openai',
      apiKey: 'test-key',
      model: 'google/gemini-3.8-flash',
      baseUrl,
      ...options,
    },
  }).getProvider();
}

async function translate(instance, stream, texts = ['Hello']) {
  if (!stream) return instance.translate(texts, 'nb');
  const results = [];
  for await (const item of instance.translateStream(texts, 'nb')) results.push(item.translation);
  return results;
}

test.each([false, true])('preserves model and requests JSON output (stream=%s)', async (stream) => {
  await expect(translate(provider(), stream)).resolves.toEqual(['Hei']);
  expect(requests).toHaveLength(1);
  expect(requests[0].path).toBe('/v1/chat/completions');
  expect(requests[0].payload).toMatchObject({
    model: 'google/gemini-3.8-flash',
    temperature: 0.1,
    reasoning_effort: 'none',
    response_format: { type: 'json_object' },
  });
  expect(requests[0].payload).not.toHaveProperty('max_tokens');
  expect(requests[0].payload).not.toHaveProperty('max_completion_tokens');
  expect(requests[0].payload).not.toHaveProperty('tools');
});

test.each([false, true])('forwards optional generation settings (stream=%s)', async (stream) => {
  await translate(
    provider({ temperature: null, maxCompletionTokens: 8192, reasoningEffort: 'low' }),
    stream,
  );
  expect(requests[0].payload).toMatchObject({
    max_completion_tokens: 8192,
    reasoning_effort: 'low',
  });
  expect(requests[0].payload).not.toHaveProperty('temperature');
});

test('preserves an explicit zero temperature', async () => {
  await translate(provider({ temperature: 0 }), false);
  expect(requests[0].payload.temperature).toBe(0);
});

test('retains the positional provider constructor', async () => {
  const instance = new OpenAIProvider('test-key', 'google/gemini-3.8-flash', baseUrl, 1000);
  await expect(instance.translate(['Hello'], 'nb')).resolves.toEqual(['Hei']);
});

test.each([0, -1, 1.5, NaN])('rejects invalid output budget %s', (maxCompletionTokens) => {
  expect(() => provider({ maxCompletionTokens })).toThrow('positive integer');
});

test('decodes streamed quotes, backslashes, newlines and Unicode in order', async () => {
  const translations = ['Si "hei"', 'C:\\mappe\nNeste linje', 'Blåbær 😊'];
  respond = completionResponse(JSON.stringify({ translations }));
  await expect(translate(provider(), true, ['One', 'Two', 'Three'])).resolves.toEqual(translations);
});

test.each([false, true])('preserves the gateway routing error (stream=%s)', async (stream) => {
  respond = (res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'No provider found for model gemini-3.8-flash',
          type: 'invalid_request_error',
        },
      }),
    );
  };
  await expect(translate(provider(), stream)).rejects.toThrow('No provider found for model');
  expect(requests).toHaveLength(1);
});

describe.each([false, true])('response validation (stream=%s)', (stream) => {
  test.each([
    ['', 'stop'],
    ['{"translations":["Hei"', 'stop'],
    ['{"translations":[]}', 'stop'],
    ['{"translations":["Hei","Extra"]}', 'stop'],
    ['{"translations":[42]}', 'stop'],
    ['{"translations":["Hei"]}', 'length'],
    ['{"translations":["Hei"]}', 'content_filter'],
  ])('rejects invalid or incomplete output: %s (%s)', async (content, reason) => {
    respond = completionResponse(content, reason);
    await expect(translate(provider(), stream)).rejects.toThrow();
  });
});
