process.env.TZ = 'America/New_York';

const { after, before, describe, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { ledgerExportSummary, toDailyCsv, toLedgerJson } = await import('../src/export.mjs');

const meta = { exportedAt: Date.parse('2026-10-23T12:05:00.000Z'), timeZone: 'Asia/Shanghai', appVersion: '1.4.0', settings: { recordMode: 'blacklist', ignored: ['skip.test'] } };
const at = new Date(2026, 9, 23, 8, 5).getTime();

const ledger = {
  domains: [{ id: 1, host: 'www.a.test' }, { id: 2, host: 'b.test' }],
  days: [
    { date: '2026-10-20', domainId: 2, ms: 0, visits: 0 },
    { date: 'not-a-day', domainId: 1, ms: 1, visits: 0 },
    { date: '2026-02-31', domainId: 1, ms: 5, visits: 1 },
    { date: '2026-10-03', domainId: 1, ms: 4, visits: 2 },
    { date: '2026-10-09', domainId: 9, ms: 8, visits: 1 },
  ],
};

test('a JSON summary matches the ledger tables and the file header', () => {
  const summary = ledgerExportSummary(ledger, meta, 'json');
  const document = JSON.parse(toLedgerJson(ledger, meta));
  assert.equal(new Date(summary.exportedAt).toISOString(), document.exportedAt);
  assert.equal(summary.exportedAt, meta.exportedAt);
  assert.equal(summary.timeZone, document.timeZone);
  assert.equal(summary.timeZone, 'Asia/Shanghai');
  assert.equal(summary.appVersion, document.appVersion);
  assert.equal(summary.appVersion, '1.4.0');
  assert.equal(summary.includesSettings, true);
  assert.equal(summary.siteCount, document.tables.domains.length);
  assert.equal(summary.siteCount, 2);
  assert.equal(summary.dayRows, document.tables.days.length);
  assert.equal(summary.dayRows, 5);
  assert.equal(summary.startDay, '2026-10-03');
  assert.equal(summary.endDay, '2026-10-20');
  assert.equal('settings' in summary, false);
});

test('a zero-millisecond day still counts and sets the recorded span', () => {
  const summary = ledgerExportSummary({
    domains: [{ id: 1, host: 'a.test' }],
    days: [{ date: '2026-10-04', domainId: 1, ms: 0, visits: 0 }],
  }, meta, 'json');
  assert.equal(summary.dayRows, 1);
  assert.equal(summary.siteCount, 1);
  assert.equal(summary.startDay, '2026-10-04');
  assert.equal(summary.endDay, '2026-10-04');
});

test('CSV keeps the same counts and omits settings and the extension version', () => {
  const json = ledgerExportSummary(ledger, meta, 'json');
  const csv = ledgerExportSummary(ledger, meta, 'csv');
  assert.equal(csv.siteCount, json.siteCount);
  assert.equal(csv.dayRows, json.dayRows);
  assert.equal(csv.startDay, json.startDay);
  assert.equal(csv.endDay, json.endDay);
  assert.equal(csv.exportedAt, json.exportedAt);
  assert.equal(csv.timeZone, json.timeZone);
  assert.equal(csv.includesSettings, false);
  assert.equal(csv.appVersion, null);
  const lines = toDailyCsv(ledger).split('\r\n').filter(line => line && !line.includes('date,host'));
  assert.deepEqual(lines.map(line => line.split(',')[0]).sort(), ['2026-02-31', '2026-10-03', '2026-10-20', 'not-a-day']);
  assert.equal(csv.dayRows, 5);
});

test('an empty ledger keeps zero counts and has no recorded days', () => {
  const summary = ledgerExportSummary({ domains: [], days: [] }, meta, 'json');
  assert.equal(summary.siteCount, 0);
  assert.equal(summary.dayRows, 0);
  assert.equal(summary.startDay, null);
  assert.equal(summary.endDay, null);
  assert.equal(summary.includesSettings, true);
  assert.equal(summary.appVersion, '1.4.0');
});

test('hostnames alone do not invent a recorded day', () => {
  const summary = ledgerExportSummary({ domains: [{ id: 1, host: 'only.test' }], days: [] }, meta, 'csv');
  assert.equal(summary.siteCount, 1);
  assert.equal(summary.dayRows, 0);
  assert.equal(summary.startDay, null);
  assert.equal(summary.endDay, null);
  assert.equal(summary.includesSettings, false);
  assert.equal(summary.appVersion, null);
});

const { window } = parseHTML('<!doctype html><html><body></body></html>');
const memory = new Map([['pagetime-language', 'en']]);
window.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(key),
};
window.location = { protocol: 'http:', href: 'http://127.0.0.1:4174/', hostname: '127.0.0.1', host: '127.0.0.1:4174', origin: 'http://127.0.0.1:4174', pathname: '/', search: '', hash: '' };

const previous = {};
const globals = { window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, location: window.location, localStorage: window.localStorage };
let server;
let ExportSummary;
let i18n;

describe('export summary list', { concurrency: false }, () => {
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
      cacheDir: '/tmp/pagetime-export-summary-vite',
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
    });
    ({ default: i18n } = await server.ssrLoadModule('/src/i18n.js'));
    ({ ExportSummary } = await server.ssrLoadModule('/src/ExportSummary.jsx'));
  });

  after(async () => {
    await server?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(summary) {
    const host = window.document.createElement('div');
    window.document.body.append(host);
    const root = createRoot(host);
    await React.act(async () => { root.render(React.createElement(ExportSummary, { summary })); });
    const list = host.querySelector('#export-summary');
    const result = {
      text: host.textContent,
      labelled: list?.getAttribute('aria-label') ?? '',
      status: host.querySelector('[role="status"]'),
      heading: host.querySelector('h1, h2, h3'),
    };
    await React.act(async () => { root.unmount(); });
    host.remove();
    return result;
  }

  const shown = ledgerExportSummary({
    domains: [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }],
    days: [
      { date: '2026-10-23', domainId: 1, ms: 10, visits: 1 },
      { date: '2026-10-01', domainId: 2, ms: 4, visits: 0 },
      { date: '2026-10-01', domainId: 1, ms: 1, visits: 1 },
    ],
  }, { ...meta, exportedAt: at }, 'json');

  test('a successful JSON summary lists the ledger facts and stays out of the status role', async () => {
    await i18n.changeLanguage('en');
    const view = await render(shown);
    assert.equal(view.status, null);
    assert.equal(view.heading, null);
    assert.equal(view.labelled, 'Export summary');
    assert.equal(view.text.includes('本地数据概况'), false);
    for (const line of [
      'Exported 10/23/2026 08:05',
      'Time zone Asia/Shanghai',
      'Recorded 10/1/2026 – 10/23/2026',
      'Sites 2',
      'Day-total rows 3',
      'Settings included',
      'Extension 1.4.0',
    ]) assert.equal(view.text.includes(line), true, line);
  });

  test('a CSV summary omits settings and the extension version', async () => {
    await i18n.changeLanguage('en');
    const view = await render({ ...shown, includesSettings: false, appVersion: null });
    assert.equal(view.text.includes('Sites 2'), true);
    assert.equal(view.text.includes('Day-total rows 3'), true);
    assert.equal(view.text.includes('Settings included'), false);
    assert.equal(view.text.includes('Extension'), false);
    assert.equal(view.text.includes('1.4.0'), false);
  });

  test('an empty ledger shows zero counts and no recorded span', async () => {
    await i18n.changeLanguage('en');
    const view = await render(ledgerExportSummary({ domains: [], days: [] }, { ...meta, exportedAt: at }, 'json'));
    assert.equal(view.text.includes('Sites 0'), true);
    assert.equal(view.text.includes('Day-total rows 0'), true);
    assert.equal(view.text.includes('Recorded'), false);
    assert.equal(view.text.includes('Settings included'), true);
  });

  test('no summary renders nothing', async () => {
    await i18n.changeLanguage('en');
    const view = await render(null);
    assert.equal(view.text, '');
    assert.equal(view.labelled, '');
  });

  test('Simplified Chinese uses the same facts', async () => {
    await i18n.changeLanguage('zh-CN');
    const view = await render(shown);
    for (const line of [
      '导出时间 2026/10/23 08:05',
      '时区 Asia/Shanghai',
      '记录 2026/10/1 – 2026/10/23',
      '站点 2',
      '日汇总行 3',
      '含设置',
      '扩展版本 1.4.0',
    ]) assert.equal(view.text.includes(line), true, line);
    await i18n.changeLanguage('en');
  });
});
