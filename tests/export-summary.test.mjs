process.env.TZ = 'America/New_York';

const { after, before, describe, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { dailyCsvParts, ledgerExportSummary, ledgerJsonParts, toDailyCsv, toLedgerJson } = await import('../src/export.mjs');

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

function summaryOf(snapshot, kind, exportedAt = meta.exportedAt) {
  const span = { startDay: null, endDay: null };
  const facts = { ...meta, exportedAt };
  if (kind === 'json') toLedgerJson(snapshot, facts, span);
  else toDailyCsv(snapshot, span);
  return ledgerExportSummary(snapshot, facts, kind, span);
}

test('a JSON summary matches the ledger tables and the file header', () => {
  const summary = summaryOf(ledger, 'json');
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
  const summary = summaryOf({
    domains: [{ id: 1, host: 'a.test' }],
    days: [{ date: '2026-10-04', domainId: 1, ms: 0, visits: 0 }],
  }, 'json');
  assert.equal(summary.dayRows, 1);
  assert.equal(summary.siteCount, 1);
  assert.equal(summary.startDay, '2026-10-04');
  assert.equal(summary.endDay, '2026-10-04');
});

test('CSV keeps the same counts and omits settings and the extension version', () => {
  const json = summaryOf(ledger, 'json');
  const csv = summaryOf(ledger, 'csv');
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
  const summary = summaryOf({ domains: [], days: [] }, 'json');
  assert.equal(summary.siteCount, 0);
  assert.equal(summary.dayRows, 0);
  assert.equal(summary.startDay, null);
  assert.equal(summary.endDay, null);
  assert.equal(summary.includesSettings, true);
  assert.equal(summary.appVersion, '1.4.0');
});

test('hostnames alone do not invent a recorded day', () => {
  const summary = summaryOf({ domains: [{ id: 1, host: 'only.test' }], days: [] }, 'csv');
  assert.equal(summary.siteCount, 1);
  assert.equal(summary.dayRows, 0);
  assert.equal(summary.startDay, null);
  assert.equal(summary.endDay, null);
  assert.equal(summary.includesSettings, false);
  assert.equal(summary.appVersion, null);
});

test('the summary does not walk days until export chunks are pulled', () => {
  const untouched = ledgerExportSummary(ledger, meta, 'json');
  assert.equal(untouched.startDay, null);
  assert.equal(untouched.endDay, null);
  assert.equal(untouched.dayRows, ledger.days.length);

  const days = Array.from({ length: 5001 }, (_, i) => ({
    date: i === 0 ? '2026-01-02' : i === 5000 ? '2026-12-31' : '2026-06-15',
    domainId: i === 5000 ? 9 : 1,
    ms: 0,
    visits: 0,
  }));
  const snapshot = { domains: [{ id: 1, host: 'a.test' }], days };
  const span = { startDay: null, endDay: null };
  const json = ledgerJsonParts(snapshot, meta, span);
  json.next();
  assert.equal(span.startDay, null);
  assert.equal(span.endDay, null);
  let step = json.next();
  while (!step.done && span.endDay !== '2026-12-31') step = json.next();
  assert.equal(span.startDay, '2026-01-02');
  assert.equal(span.endDay, '2026-12-31');

  const csvSpan = { startDay: null, endDay: null };
  const csv = dailyCsvParts(snapshot, csvSpan);
  csv.next();
  assert.notEqual(csvSpan.endDay, '2026-12-31');
  let csvStep = csv.next();
  while (!csvStep.done) csvStep = csv.next();
  assert.equal(csvSpan.startDay, '2026-01-02');
  assert.equal(csvSpan.endDay, '2026-12-31');
  const summary = ledgerExportSummary(snapshot, meta, 'csv', csvSpan);
  assert.equal(summary.dayRows, 5001);
  assert.equal(summary.siteCount, 1);
  assert.equal(summary.includesSettings, false);
  assert.equal(toDailyCsv(snapshot).includes('2026-12-31'), false);
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
    ({ ExportSummary } = await server.ssrLoadModule('/src/export-summary.jsx'));
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

  const shown = summaryOf({
    domains: [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }],
    days: [
      { date: '2026-10-23', domainId: 1, ms: 10, visits: 1 },
      { date: '2026-10-01', domainId: 2, ms: 4, visits: 0 },
      { date: '2026-10-01', domainId: 1, ms: 1, visits: 1 },
    ],
  }, 'json', at);

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
      '2 sites',
      '3 day-total rows',
      'Settings included',
      'Extension 1.4.0',
    ]) assert.equal(view.text.includes(line), true, line);
  });

  test('a CSV summary omits settings and the extension version', async () => {
    await i18n.changeLanguage('en');
    const view = await render({ ...shown, includesSettings: false, appVersion: null });
    assert.equal(view.text.includes('2 sites'), true);
    assert.equal(view.text.includes('3 day-total rows'), true);
    assert.equal(view.text.includes('Settings included'), false);
    assert.equal(view.text.includes('Extension'), false);
    assert.equal(view.text.includes('1.4.0'), false);
  });

  test('an empty ledger shows zero counts and no recorded span', async () => {
    await i18n.changeLanguage('en');
    const view = await render(summaryOf({ domains: [], days: [] }, 'json', at));
    assert.equal(view.text.includes('0 sites'), true);
    assert.equal(view.text.includes('0 day-total rows'), true);
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
      '2 个站点',
      '3 行日汇总',
      '含设置',
      '扩展版本 1.4.0',
    ]) assert.equal(view.text.includes(line), true, line);
    await i18n.changeLanguage('en');
  });

  test('one site and one day-total row use the singular', async () => {
    await i18n.changeLanguage('en');
    const view = await render({ ...shown, siteCount: 1, dayRows: 1 });
    assert.equal(view.text.includes('1 site'), true);
    assert.equal(view.text.includes('1 sites'), false);
    assert.equal(view.text.includes('1 day-total row'), true);
    assert.equal(view.text.includes('day-total rows'), false);
  });

  test('Russian counts use one, few, and many', async () => {
    const base = { ...shown, includesSettings: false, appVersion: null, startDay: null, endDay: null };
    await i18n.changeLanguage('ru');
    const one = await render({ ...base, siteCount: 1, dayRows: 21 });
    assert.equal(one.text.includes('1 сайт'), true);
    assert.equal(one.text.includes('21 строка дневных итогов'), true);
    const few = await render({ ...base, siteCount: 2, dayRows: 3 });
    assert.equal(few.text.includes('2 сайта'), true);
    assert.equal(few.text.includes('3 строки дневных итогов'), true);
    const many = await render({ ...base, siteCount: 5, dayRows: 0 });
    assert.equal(many.text.includes('5 сайтов'), true);
    assert.equal(many.text.includes('0 строк дневных итогов'), true);
    await i18n.changeLanguage('en');
  });
});
