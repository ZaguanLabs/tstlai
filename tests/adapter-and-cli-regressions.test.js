const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Tstlai } = require('../src/core/Tstlai');
const { OpenAIProvider } = require('../src/providers/OpenAIProvider');
const {
  createNextIntlAdapter,
  createStreamingNextIntlAdapter,
} = require('../src/integrations/next-intl');
const { createNextStreamingRouteHandler } = require('../src/integrations/next');
const { generateTranslations, TranslationGenerationError } = require('../src/cli/generate');

function translator() {
  const t = new Tstlai({ targetLang: 'nb', provider: { type: 'custom' } });
  t.provider = {
    translate: jest.fn(async (texts) => texts.map((t) => `NB:${t}`)),
    translateStream: jest.fn(async function* (texts) {
      for (const [index, text] of texts.entries()) yield { index, translation: `NB:${text}` };
    }),
  };
  return t;
}
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('next-intl batch adapter preserves arrays and non-string values', async () => {
  const source = {
    nav: { home: 'Home' },
    items: ['One', 'Two'],
    count: 2,
    enabled: true,
    missing: null,
  };
  const result = await createNextIntlAdapter(translator(), source).getMessages('nb');
  expect(result).toEqual({
    nav: { home: 'NB:Home' },
    items: ['NB:One', 'NB:Two'],
    count: 2,
    enabled: true,
    missing: null,
  });
  expect(source.nav.home).toBe('Home');
});

test('streaming adapter snapshots stay stable as later translations arrive', async () => {
  const adapter = createStreamingNextIntlAdapter(translator(), {
    nav: { home: 'Home', about: 'About' },
  });
  const iterator = adapter.getMessagesStream('nb');
  const first = (await iterator.next()).value;
  expect(first.nav).toEqual({ home: 'NB:Home', about: 'About' });
  const second = (await iterator.next()).value;
  expect(second.nav.about).toBe('NB:About');
  expect(first.nav.about).toBe('About');
  await iterator.next();
});

test('an explicit non-streaming provider capability retains the batch fallback', async () => {
  const t = translator();
  t.provider.supportsStreaming = () => false;
  const result = await createStreamingNextIntlAdapter(t, { title: 'Hello' }).getStreamingMessages(
    'nb',
  );
  expect(result.title).toBe('NB:Hello');
  expect(t.provider.translateStream).not.toHaveBeenCalled();
});

test.each(['getMessagesStream', 'getStreamingMessages', 'createStreamingPromise'])(
  '%s bypasses source locale',
  async (method) => {
    const t = translator();
    const source = { title: 'Hello' };
    const adapter = createStreamingNextIntlAdapter(t, source);
    if (method === 'getMessagesStream') {
      const values = [];
      for await (const value of adapter[method]('en-US')) values.push(value);
      expect(values).toEqual([source]);
    } else expect(await adapter[method]('en-US')).toEqual(source);
    expect(t.provider.translateStream).not.toHaveBeenCalled();
  },
);

test.each(['getMessagesStream', 'getStreamingMessages', 'createStreamingPromise', 'route'])(
  '%s never persists a stream that fails after yielding',
  async (method) => {
    const t = translator();
    const cache = jest.spyOn(t, 'cacheTranslation');
    t.provider.translateStream.mockImplementation(async function* () {
      yield { index: 0, translation: 'Wrong' };
      throw new Error('Malformed response');
    });
    if (method === 'route') {
      const response = await createNextStreamingRouteHandler(t)(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ texts: ['Hello'] }),
        }),
      );
      const body = await response.text();
      expect(body).toContain('Translation failed');
      expect(body).not.toContain('[DONE]');
    } else {
      const adapter = createStreamingNextIntlAdapter(t, { title: 'Hello' });
      const work = async () => {
        if (method === 'getMessagesStream') {
          for await (const _value of adapter[method]('nb')) {
          }
        } else await adapter[method]('nb');
      };
      await expect(work()).rejects.toThrow('Malformed response');
    }
    expect(cache).not.toHaveBeenCalled();
  },
);

describe('CLI generation', () => {
  let directory;
  let originalKey;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tstlai-stage-one-'));
    fs.writeFileSync(
      path.join(directory, 'source.json'),
      JSON.stringify({ title: 'Hello', count: 3, contextual: { $t: 'Save', $ctx: 'button' } }),
    );
    originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-placeholder';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const options = () => ({
    inputFile: path.join(directory, 'source.json'),
    outputDir: directory,
    languages: ['nb', 'es'],
  });

  test('partial failure rejects with completed outputs while preserving existing failed-language file', async () => {
    fs.writeFileSync(path.join(directory, 'es_ES.json'), 'existing');
    jest.spyOn(OpenAIProvider.prototype, 'translate').mockImplementation(async (_texts, lang) => {
      if (lang === 'es_ES') throw new Error('Provider failed');
      return ['Hei', 'Lagre'];
    });
    const error = await generateTranslations(options()).catch((error) => error);
    expect(error).toBeInstanceOf(TranslationGenerationError);
    expect(error.failures[0].language).toBe('es_ES');
    expect(error.completed).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'nb_NO.json'), 'utf8'))).toEqual({
      title: 'Hei',
      count: 3,
      contextual: 'Lagre',
    });
    expect(fs.readFileSync(path.join(directory, 'es_ES.json'), 'utf8')).toBe('existing');
    expect(fs.readdirSync(directory).some((name) => name.endsWith('.tmp'))).toBe(false);
  });
  test('dry run never contacts the provider or writes output', async () => {
    const translate = jest.spyOn(OpenAIProvider.prototype, 'translate');
    await generateTranslations({ ...options(), dryRun: true });
    expect(translate).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual(['source.json']);
  });
  test('refuses source overwrite', async () => {
    const inputFile = path.join(directory, 'nb_NO.json');
    fs.writeFileSync(inputFile, '{"title":"Hello"}');
    await expect(generateTranslations({ ...options(), inputFile })).rejects.toThrow('overwrite');
  });

  test('the CLI process exits nonzero when the gateway rejects every language', async () => {
    const http = require('node:http');
    const { spawn } = require('node:child_process');
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: 'No provider found', type: 'invalid_request_error' } }),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            '-r',
            'ts-node/register',
            'src/cli/index.ts',
            'generate',
            '-i',
            options().inputFile,
            '-o',
            directory,
            '-l',
            'nb',
          ],
          {
            cwd: path.resolve(__dirname, '..'),
            env: {
              ...process.env,
              OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
              OPENAI_MODEL: 'test',
            },
            stdio: 'ignore',
          },
        );
        child.once('error', reject);
        child.once('exit', resolve);
      });
      expect(code).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
