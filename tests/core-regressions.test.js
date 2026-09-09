const { Tstlai } = require('../src/core/Tstlai');
const { normalizeLocaleCode } = require('../src/languages');
const {
  createNextRouteHandler,
  createNextStreamingRouteHandler,
} = require('../src/integrations/next');

function translator(config = {}) {
  const instance = new Tstlai({
    targetLang: 'nb',
    provider: {
      translate: jest.fn(async (texts) => texts.map((text) => `NB:${text}`)),
      getModelInfo: () => ({ name: 'test', capabilities: [] }),
    },
    ...config,
  });
  instance.provider = {
    translate: jest.fn(async (texts) => texts.map(() => 'Hei')),
    getModelInfo: () => ({ name: 'test', capabilities: [] }),
  };
  return instance;
}
const request = (texts, targetLang = 'nb') =>
  new Request('http://localhost', { method: 'POST', body: JSON.stringify({ texts, targetLang }) });
beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('context-distinct strings remain distinct within a batch and across cache hits', async () => {
  const t = translator();
  t.provider.translate.mockImplementation(async (texts) =>
    texts.map((text) => (text.includes('discount') ? 'Spar' : 'Lagre')),
  );
  const run = () =>
    Promise.all([
      t.translateText('Save', 'nb', 'save file'),
      t.translateText('Save', 'nb', 'discount'),
    ]);
  await expect(run()).resolves.toEqual(['Lagre', 'Spar']);
  await expect(run()).resolves.toEqual(['Lagre', 'Spar']);
  expect(t.provider.translate).toHaveBeenCalledTimes(1);
});

test('configuration differences cannot reuse another translator cache entry', async () => {
  const formal = translator({ style: 'formal' });
  const casual = translator({ style: 'casual' });
  casual.cache = formal.cache;
  await formal.cacheTranslation('text-hash', 'formal result', 'nb');
  expect(await casual.getCachedTranslation('text-hash', 'nb')).toBeNull();
  expect(await formal.getCachedTranslation('text-hash', 'nb-NO')).toBe('formal result');
});

test('failure preserves source fallback and exposes failure metadata and callback', async () => {
  const onError = jest.fn();
  const t = translator({ onError });
  t.provider.translate.mockRejectedValue(new Error('Provider failed'));
  const response = await createNextRouteHandler(t)(request(['Hello']));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    translations: ['Hello'],
    status: 'fallback',
    error: 'Translation failed',
  });
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Provider failed' }));
});

test('strict mode rejects failures', async () => {
  const t = translator({ errorMode: 'throw' });
  t.provider.translate.mockRejectedValue(new Error('Provider failed'));
  await expect(t.translateText('Hello')).rejects.toThrow('Provider failed');
});

test('a partially cached response reports partial failure', async () => {
  const t = translator();
  await t.cacheTranslation(
    require('node:crypto').createHash('sha256').update('Cached').digest('hex'),
    'Lagret',
  );
  t.provider.translate.mockRejectedValue(new Error('Provider failed'));
  const response = await createNextRouteHandler(t)(request(['Cached', 'Missing']));
  expect(await response.json()).toMatchObject({
    translations: ['Lagret', 'Missing'],
    status: 'partial',
    error: 'Translation failed',
  });
});

test.each([null, ['valid', 123], ['valid', null]])(
  'invalid input returns 400: %j',
  async (texts) => {
    expect((await createNextRouteHandler(translator())(request(texts))).status).toBe(400);
  },
);

test.each([createNextRouteHandler, createNextStreamingRouteHandler])(
  'malformed JSON and null bodies return 400',
  async (route) => {
    for (const body of ['null', '{invalid']) {
      const response = await route(translator())(
        new Request('http://localhost', { method: 'POST', body }),
      );
      expect(response.status).toBe(400);
    }
  },
);

test.each([
  ['uk', 'uk_UA'],
  ['nn', 'nn_NO'],
  ['nn_NO', 'nn_NO'],
  ['en-gb', 'en_GB'],
  ['zh-Hant', 'zh_TW'],
  ['zh-Hant-HK', 'zh_Hant_HK'],
  ['en-AU', 'en_AU'],
])('normalizes %s without losing its meaning', (input, expected) => {
  expect(normalizeLocaleCode(input)).toBe(expected);
});

test('Arabic hyphenated locale has consistent page direction', async () => {
  const t = translator({ targetLang: 'ar-SA' });
  const page = await t.process('<html><body>Hello</body></html>');
  expect(page.dir).toBe('rtl');
  expect(page.html).toContain('dir="rtl"');
});

test('HTML translation preserves per-node whitespace, structure and exclusions', async () => {
  const t = translator();
  const page = await t.process(
    '<p>Hello <b data-no-translate>Brand</b> Hello</p><script>Hello</script><code>Hello</code>',
  );
  expect(page.html).toBe(
    '<p>Hei <b data-no-translate>Brand</b> Hei</p><script>Hello</script><code>Hello</code>',
  );
  expect(t.provider.translate.mock.calls[0][0]).toEqual(['Hello']);
});

test('HTML escapes translated markup', async () => {
  const t = translator();
  t.provider.translate.mockResolvedValue(['<script>alert(1)</script>']);
  expect((await t.process('<p>Hello</p>')).html).not.toContain('<script>');
});

test('source locale bypass works in core and streaming routes', async () => {
  const t = translator({ sourceLang: 'en-US', targetLang: 'en_US' });
  expect(await t.translateText(' Hello ')).toBe(' Hello ');
  const response = await createNextStreamingRouteHandler(t)(request(['Hello'], 'en-US'));
  expect(await response.text()).toContain('Hello');
  expect(t.provider.translate).not.toHaveBeenCalled();
});
