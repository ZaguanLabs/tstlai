const { Tstlai } = require('../src/core/Tstlai');
const { OpenAIProvider } = require('../src/providers/OpenAIProvider');

const provider = () => ({
  translate: jest.fn(async (texts) => texts.map(() => 'Hei')),
  getModelInfo: () => ({ name: 'injected-provider', capabilities: [] }),
});

test('public provider and cache injection translate and reuse cached results', async () => {
  const ai = provider();
  const entries = new Map();
  const cache = {
    get: jest.fn(async (key) => entries.get(key) ?? null),
    set: jest.fn(async (key, value) => {
      entries.set(key, value);
    }),
    disconnect: jest.fn(),
  };
  const translator = new Tstlai({ targetLang: 'nb', provider: ai, cache });
  try {
    expect(await translator.translateText('Hello')).toBe('Hei');
    expect(await translator.translateText('Hello')).toBe('Hei');
    expect(ai.translate).toHaveBeenCalledTimes(1);
    expect(translator.getProvider()).toBe(ai);
    expect(cache.set).toHaveBeenCalledTimes(1);
  } finally {
    await translator.close();
  }
  expect(cache.disconnect).toHaveBeenCalledTimes(1);
});

test.each(['custom', 'anthropic', 'google', 'misspelled'])(
  'unsupported provider %s fails instead of fabricating translations',
  (type) => {
    expect(() => new Tstlai({ targetLang: 'nb', provider: { type } })).toThrow(
      'Unsupported provider',
    );
  },
);

test.each([null, {}, { translate: true }, { translate: async () => [] }])(
  'invalid provider fails at construction: %j',
  (ai) => {
    expect(() => new Tstlai({ targetLang: 'nb', provider: ai })).toThrow();
  },
);

test.each([
  { type: 'sql' },
  { type: 'misspelled' },
  { get: async () => null },
  { set: async () => {} },
])('unsupported cache fails at construction: %j', (cache) => {
  expect(() => new Tstlai({ targetLang: 'nb', provider: provider(), cache })).toThrow(/cache/i);
});

test('debug logging never prints the API key or its prefix', () => {
  const original = process.env.TSTLAI_DEBUG;
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  process.env.TSTLAI_DEBUG = '1';
  try {
    const apiKey = 'test-secret-do-not-log-this';
    new OpenAIProvider(apiKey, 'test-model');
    const output = log.mock.calls.flat().join(' ');
    expect(output).toContain('configured');
    expect(output).not.toContain(apiKey);
    expect(output).not.toContain(apiKey.substring(0, 15));
  } finally {
    log.mockRestore();
    if (original === undefined) delete process.env.TSTLAI_DEBUG;
    else process.env.TSTLAI_DEBUG = original;
  }
});

test('a TypeError does not trigger an additional retry outside the SDK', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const ai = new OpenAIProvider('test-placeholder', 'test-model');
  const request = jest.fn().mockRejectedValue(new TypeError('Bad response'));
  ai.client.chat.completions.create = request;
  try {
    await expect(ai.translate(['Hello'], 'nb')).rejects.toThrow('Bad response');
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
});
