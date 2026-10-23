process.env.TZ = 'America/New_York';

const { after, before, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { addDays, midnight } = await import('../src/model.mjs');
const { visitEmptyKind } = await import('../src/range.mjs');

const hour = 3_600_000;
const now = new Date(2026, 9, 22, 16).getTime();
const today = midnight(now);
const cutoff = addDays(today, -30);
const day = offset => addDays(today, offset);
const trend = (from, to, rows = {}) => {
  const days = [];
  for (let at = day(from); at <= day(to); at = addDays(at, 1)) days.push({ at, ms: rows[at] ?? 0, visits: rows[at] ? 1 : 0 });
  return days;
};

test('a range that ends before the detail cut-off is expired whatever the filters say', () => {
  assert.equal(visitEmptyKind({ end: addDays(cutoff, 0), days: [] }, now), 'expired');
  assert.equal(visitEmptyKind({ end: day(-35), days: trend(-40, -36), filtered: true }, now), 'expired');
});

test('a range inside retention keeps the no-match copy, with or without a filter', () => {
  assert.equal(visitEmptyKind({ end: addDays(today, 1), days: trend(0, 0) }, now), 'none');
  assert.equal(visitEmptyKind({ end: addDays(today, 1), days: trend(-6, 0), filtered: true }, now), 'none');
  assert.equal(visitEmptyKind({ end: addDays(cutoff, 1), days: trend(-30, -30) }, now), 'none');
});

test('a range that reaches back past the cut-off is expired only when an older day still has totals', () => {
  const end = addDays(today, 1);
  assert.equal(visitEmptyKind({ end, days: trend(-35, 0, { [day(-33)]: hour }) }, now), 'expired');
  assert.equal(visitEmptyKind({ end, days: trend(-35, 0) }, now), 'none');
  assert.equal(visitEmptyKind({ end, days: trend(-35, 0, { [day(-5)]: hour }) }, now), 'none');
  assert.equal(visitEmptyKind({ end, days: trend(-35, 0, { [day(-33)]: hour }), filtered: true }, now), 'none');
});

const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
const memory = new Map([['pagetime-language', 'en']]);
const localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(key),
};
window.localStorage = localStorage;
window.location = { protocol: 'http:', href: 'http://127.0.0.1:4174/', hostname: '127.0.0.1', host: '127.0.0.1:4174', origin: 'http://127.0.0.1:4174', pathname: '/', search: '', hash: '' };

const previous = {};
const globals = { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, location: window.location, localStorage };
let server;
let VisitEmpty;
let i18n;

before(async () => {
  for (const [key, value] of Object.entries(globals)) {
    previous[key] = globalThis[key];
    globalThis[key] = value;
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const react = (await import('@vitejs/plugin-react')).default;
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@app': fileURLToPath(new URL('../src', import.meta.url)) } },
    plugins: [react()],
    cacheDir: '/tmp/pagetime-visit-expired-vite',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
  });
  ({ default: i18n } = await server.ssrLoadModule('/src/i18n.js'));
  ({ VisitEmpty } = await server.ssrLoadModule('/src/VisitEmpty.jsx'));
});

after(async () => {
  await server?.close();
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function render(props) {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(React.createElement(VisitEmpty, { now, filtered: false, ...props })); });
  const result = { kind: host.firstElementChild.getAttribute('data-empty'), text: host.textContent };
  await React.act(async () => { root.unmount(); });
  host.remove();
  return result;
}

test('the empty visit list says detail expired for a range before retention', async () => {
  await i18n.changeLanguage('en');
  const shown = await render({ end: addDays(day(-33), 1), days: trend(-40, -33) });
  assert.equal(shown.kind, 'expired');
  assert.equal(shown.text, 'Visit details are kept for the last 31 days only. Day totals are still on the overview.');
});

test('the empty visit list keeps the no-match copy inside retention', async () => {
  await i18n.changeLanguage('en');
  const shown = await render({ end: addDays(today, 1), days: trend(0, 0), filtered: true });
  assert.equal(shown.kind, 'none');
  assert.equal(shown.text, 'No matching visits');
});

test('the expired copy takes the plural form that 31 needs in each language', async () => {
  const expected = { ru: 'за последний 31 день', 'pt-BR': 'últimos 31 dias', zh: '最近 31 天' };
  for (const [language, phrase] of Object.entries(expected)) {
    await i18n.changeLanguage(language === 'zh' ? 'zh-CN' : language);
    const shown = await render({ end: addDays(day(-33), 1), days: [] });
    assert.ok(shown.text.includes(phrase), `${language}: ${shown.text}`);
  }
  await i18n.changeLanguage('en');
});
