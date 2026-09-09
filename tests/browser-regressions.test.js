const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { AutoTranslate } = require('../src/integrations/react-auto-translate');
const {
  TstlaiStreamingProvider,
  useTranslations,
  useTranslationStatus,
} = require('../src/integrations/next-client');
let dom, root;
const h = React.createElement;
const encoder = new TextEncoder();
const stream = (events) =>
  new Response(
    events
      .map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
const render = async (component) => act(async () => root.render(component));
const tick = async (ms = 0) => act(async () => jest.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  jest.useFakeTimers();
  dom = new JSDOM('<html><body><main></main><div id="react-root"></div></body></html>', {
    url: 'http://localhost',
  });
  for (const key of ['window', 'document', 'MutationObserver', 'Node', 'HTMLElement'])
    global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.getElementById('react-root'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
  dom.window.close();
  for (const key of [
    'window',
    'document',
    'MutationObserver',
    'Node',
    'HTMLElement',
    'IS_REACT_ACT_ENVIRONMENT',
  ])
    delete global[key];
});

function Consumer() {
  const t = useTranslations();
  const status = useTranslationStatus();
  return h(
    'div',
    {
      id: 'result',
      'data-error': status.error?.message || '',
      'data-progress': status.progress,
      'data-loading': status.isTranslating,
    },
    t('nav.home'),
  );
}
const provider = (source, locale = 'nb', extra = {}) =>
  h(TstlaiStreamingProvider, { sourceMessages: source, locale, ...extra }, h(Consumer));

test('buffered streaming updates never mutate frozen source messages and source locale restores them', async () => {
  const source = Object.freeze({ nav: Object.freeze({ home: 'Home' }) });
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => stream([{ index: 0, translation: 'Hjem' }, '[DONE]']));
  await render(provider(source));
  await tick();
  expect(document.getElementById('result').textContent).toBe('Hjem');
  expect(source.nav.home).toBe('Home');
  await render(provider(source, 'en'));
  expect(document.getElementById('result').textContent).toBe('Home');
  expect(document.getElementById('result').dataset.loading).toBe('false');
});

test('batch fallback uses immutable nested updates', async () => {
  const source = Object.freeze({ nav: Object.freeze({ home: 'Home' }) });
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ translations: ['Hjem'] }));
  await render(provider(source));
  await tick();
  expect(document.getElementById('result').textContent).toBe('Hjem');
  expect(source.nav.home).toBe('Home');
});

test.each([
  () => stream([{ error: 'failed' }]),
  () => stream([]),
  () => Response.json({ error: 'failed' }, { status: 500 }),
])('failed responses preserve source messages and report an error', async (response) => {
  jest.spyOn(global, 'fetch').mockImplementation(async () => response());
  await render(provider({ nav: { home: 'Home' } }));
  await tick();
  const result = document.getElementById('result');
  expect(result.textContent).toBe('Home');
  expect(result.dataset.error).not.toBe('');
  expect(result.dataset.progress).toBe('0');
  expect(result.dataset.loading).toBe('false');
});

test('switching locale aborts the previous request and ignores its late response', async () => {
  const source = { nav: { home: 'Home' } };
  let resolveFirst;
  const mock = jest
    .spyOn(global, 'fetch')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockImplementationOnce(async () => Response.json({ translations: ['Inicio'] }));
  await render(provider(source, 'nb'));
  await render(provider(source, 'es'));
  await tick();
  expect(mock.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => resolveFirst(Response.json({ translations: ['Hjem'] })));
  expect(document.getElementById('result').textContent).toBe('Inicio');
});

test('AutoTranslate chunks a page above the default route limit and honors empty exclusion attributes', async () => {
  document.querySelector('main').innerHTML =
    Array.from({ length: 101 }, (_, i) => `<span>Item ${i}</span>`).join('') +
    '<b data-no-translate>Brand</b>';
  const mock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const texts = JSON.parse(init.body).texts;
    expect(texts.length).toBeLessThanOrEqual(100);
    return Response.json({ translations: texts.map((text) => `NB:${text}`) });
  });
  await render(h(AutoTranslate, { targetLang: 'nb' }));
  await tick(200);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('span')[100].textContent).toBe('NB:Item 100');
  expect(document.querySelector('b').textContent).toBe('Brand');
});

test('AutoTranslate retranslates original source on language changes and sees characterData updates', async () => {
  document.querySelector('main').innerHTML = '<span> Hello </span>';
  const mock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const { texts, targetLang } = JSON.parse(init.body);
    return Response.json({ translations: texts.map((text) => `${targetLang}:${text}`) });
  });
  await render(h(AutoTranslate, { targetLang: 'nb' }));
  await tick(200);
  expect(document.querySelector('span').textContent).toBe(' nb:Hello ');
  await render(h(AutoTranslate, { targetLang: 'es' }));
  await tick(200);
  expect(document.querySelector('span').textContent).toBe(' es:Hello ');
  expect(JSON.parse(mock.mock.calls[1][1].body).texts).toEqual(['Hello']);
  document.querySelector('span').firstChild.nodeValue = 'Changed';
  await tick(200);
  expect(document.querySelector('span').textContent).toBe('es:Changed');
  document.querySelector('span').firstChild.nodeValue = 'Changed';
  await tick(200);
  expect(document.querySelector('span').textContent).toBe('es:Changed');
});

test('AutoTranslate retries failed nodes and preserves original text', async () => {
  document.querySelector('main').textContent = 'Hello';
  const mock = jest
    .spyOn(global, 'fetch')
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(async () => Response.json({ translations: ['Hei'] }));
  const onError = jest.fn();
  await render(h(AutoTranslate, { targetLang: 'nb', onError }));
  await tick(200);
  expect(document.querySelector('main').textContent).toBe('Hello');
  expect(onError).toHaveBeenCalledTimes(1);
  await tick(600);
  expect(document.querySelector('main').textContent).toBe('Hei');
  expect(mock).toHaveBeenCalledTimes(2);
});

test('AutoTranslate has bounded retries and cancels a request on unmount', async () => {
  document.querySelector('main').textContent = 'Hello';
  const mock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
  await render(h(AutoTranslate, { targetLang: 'nb', maxRetries: 1 }));
  await tick(5000);
  expect(mock).toHaveBeenCalledTimes(2);
  await render(null);
  expect(mock.mock.calls[0][1].signal.aborted).toBe(true);
});

test('a delayed stream still updates progressively before DONE', async () => {
  let controller;
  const response = new Response(
    new ReadableStream({
      start(c) {
        controller = c;
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  jest.spyOn(global, 'fetch').mockResolvedValue(response);
  await render(provider({ nav: { home: 'Home' } }, 'nb', { streamBuffer: 10 }));
  await act(async () =>
    controller.enqueue(encoder.encode('data: {"index":0,"translation":"Hjem"}\n\n')),
  );
  await tick(20);
  expect(document.getElementById('result').textContent).toBe('Hjem');
  expect(document.getElementById('result').dataset.loading).toBe('true');
  await act(async () => {
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  });
  expect(document.getElementById('result').dataset.loading).toBe('false');
});

test('DOM mutation translates only its affected subtree and preserves ancestor exclusions', async () => {
  document.querySelector('main').innerHTML =
    '<section id="unchanged">Original</section><section id="changed">Before</section><aside data-no-translate><span id="excluded">Private</span></aside>';
  const fetch = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, options) =>
      Response.json({ translations: JSON.parse(options.body).texts.map((text) => `NB:${text}`) }),
    );
  await render(h(AutoTranslate, { targetLang: 'nb' }));
  await tick(200);
  const unchanged = document.getElementById('unchanged');
  const visited = jest.spyOn(unchanged, 'childNodes', 'get');
  document.getElementById('changed').firstChild.textContent = 'After';
  const excluded = document.createTextNode('Still private');
  document.getElementById('excluded').appendChild(excluded);
  await tick(200);
  expect(document.getElementById('changed').textContent).toBe('NB:After');
  expect(excluded.textContent).toBe('Still private');
  expect(visited).not.toHaveBeenCalled();
  expect(JSON.parse(fetch.mock.calls.at(-1)[1].body).texts).toEqual(['After']);
});

test('nested added DOM nodes are collected once even when several mutation records overlap', async () => {
  const fetch = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, options) =>
      Response.json({ translations: JSON.parse(options.body).texts.map((text) => `NB:${text}`) }),
    );
  await render(h(AutoTranslate, { targetLang: 'nb' }));
  await tick(200);
  const section = document.createElement('section');
  document.querySelector('main').appendChild(section);
  const span = document.createElement('span');
  section.appendChild(span);
  span.textContent = 'Added';
  await tick(200);
  expect(section.textContent).toBe('NB:Added');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1].body).texts).toEqual(['Added']);
});
