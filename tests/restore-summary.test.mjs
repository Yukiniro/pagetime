process.env.TZ = 'America/New_York';

const { after, before, describe, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');

globalThis.location = { protocol: 'chrome-extension:', href: 'chrome-extension://test/dashboard.html' };
const sent = [];
let reply = { ok: true };
globalThis.chrome = { runtime: { id: 'test', sendMessage: async message => { sent.push(message); return reply; } } };
const workers = [];
globalThis.Worker = class {
  constructor(url) { this.url = url; workers.push(this); }
  postMessage(data) { this.posted = data; }
  terminate() { this.terminated = true; }
};

const { backupSummary, ImportError, parseLedgerBackup } = await import('../src/import.mjs');
const { readBackupFile, restoreBackup } = await import('../src/import-file.js');

function backupDocument() {
  return {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    exportedAt: '2026-10-22T13:05:00.000Z',
    timeZone: 'Asia/Shanghai',
    appVersion: '1.3.0',
    recording: { enabled: true, since: new Date(2026, 9, 1).getTime() },
    settings: { recordMode: 'blacklist', ignored: ['skip.test'] },
    tables: {
      domains: [{ id: 1, host: 'a.test' }, { id: 2, host: 'www.b.test' }, { id: 3, host: 'only.test' }],
      days: [
        { date: '2026-10-20', domainId: 1, ms: 0, visits: 0 },
        { date: '2026-10-03', domainId: 2, ms: 4_000, visits: 2 },
        { date: '2026-10-21', domainId: 1, ms: 1_000, visits: 1 },
      ],
      hours: [{ date: '2026-10-03', hour: 9, domainId: 2, ms: 4_000 }, { date: '2026-10-21', hour: 0, domainId: 1, ms: 1_000 }],
      spans: [{ id: 1, domainId: 1, start: new Date(2026, 9, 21, 0, 10).getTime(), end: new Date(2026, 9, 21, 0, 10, 1).getTime() }],
      visits: [{ id: 4, domainId: 1, at: new Date(2026, 9, 21, 0, 10).getTime() }],
    },
  };
}

const summaryOf = document => backupSummary(document, parseLedgerBackup(document));

// Replies the way public/import-parse-worker.js does, then waits for the page's row checks.
async function readWith(data) {
  const pending = readBackupFile({ name: 'pagetime.json' });
  const worker = workers.at(-1);
  worker.onmessage({ data });
  return pending;
}

describe('backup summary facts', () => {
  test('a full backup reports export time, format, recorded days, row counts, settings, and version', () => {
    const summary = summaryOf(backupDocument());
    assert.deepEqual(summary, {
      exportedAt: Date.parse('2026-10-22T13:05:00.000Z'),
      schemaVersion: 1,
      startDay: '2026-10-03',
      endDay: '2026-10-21',
      rows: { domains: 3, days: 3, hours: 2, spans: 1, visits: 1 },
      includesSettings: true,
      appVersion: '1.3.0',
    });
  });

  test('a backup without settings, export time, or version says so instead of guessing', () => {
    const document = backupDocument();
    delete document.settings;
    delete document.appVersion;
    document.exportedAt = 'yesterday-ish';
    const summary = summaryOf(document);
    assert.equal(summary.includesSettings, false);
    assert.equal(summary.appVersion, null);
    assert.equal(summary.exportedAt, null);
    assert.equal(summaryOf({ ...backupDocument(), exportedAt: 1_700_000_000_000 }).exportedAt, null);
  });

  test('settings that are not an object count as missing, and an odd version string is not shown', () => {
    assert.equal(summaryOf({ ...backupDocument(), settings: ['recordMode'] }).includesSettings, false);
    assert.equal(summaryOf({ ...backupDocument(), settings: null }).includesSettings, false);
    for (const appVersion of ['', ' 1.0', '<b>1</b>', 'x'.repeat(33), 3, { major: 1 }]) {
      assert.equal(summaryOf({ ...backupDocument(), appVersion }).appVersion, null, String(appVersion));
    }
    assert.equal(summaryOf({ ...backupDocument(), appVersion: '2.0.0-beta.1' }).appVersion, '2.0.0-beta.1');
  });

  test('an empty ledger keeps zero counts and no recorded days', () => {
    const document = { ...backupDocument(), tables: { domains: [{ id: 1, host: 'only.test' }], days: [], hours: [], spans: [], visits: [] } };
    const summary = summaryOf(document);
    assert.deepEqual(summary.rows, { domains: 1, days: 0, hours: 0, spans: 0, visits: 0 });
    assert.equal(summary.startDay, null);
    assert.equal(summary.endDay, null);
  });
});

describe('check before confirm', { concurrency: false }, () => {
  test('a valid file resolves to the checked backup and its summary, and nothing is sent to the background', async () => {
    sent.length = 0;
    const { backup, summary } = await readWith({ value: backupDocument() });
    assert.equal(workers.at(-1).terminated, true);
    assert.deepEqual(backup, parseLedgerBackup(backupDocument()));
    assert.deepEqual(summary, summaryOf(backupDocument()));
    assert.deepEqual(sent, []);
  });

  for (const [name, data, code] of [
    ['a file that is not JSON', { code: 'format' }, 'format'],
    ['a file the worker could not read', { code: 'read' }, 'read'],
    ['another JSON format', { value: { format: 'something-else' } }, 'format'],
    ['an unknown schema version', { value: { ...backupDocument(), schemaVersion: 2 } }, 'version'],
    ['a row that does not match the ledger', { value: { ...backupDocument(), tables: { ...backupDocument().tables, visits: [{ id: 0 }] } } }, 'structure'],
  ]) {
    test(`${name} rejects with ${code} before any confirm, and nothing is sent`, async () => {
      sent.length = 0;
      await assert.rejects(readWith(data), error => error instanceof ImportError && error.code === code);
      assert.deepEqual(sent, []);
    });
  }

  test('a worker that cannot start is a read failure, not a write failure', async () => {
    sent.length = 0;
    const pending = readBackupFile({ name: 'pagetime.json' });
    workers.at(-1).onerror();
    await assert.rejects(pending, error => error.code === 'read');
    assert.deepEqual(sent, []);
  });

  test('confirming sends the checked backup once, as the existing restore message', async () => {
    sent.length = 0;
    reply = { ok: true };
    const { backup } = await readWith({ value: backupDocument() });
    await restoreBackup(backup);
    assert.deepEqual(sent, [{ type: 'restore', backup }]);
  });

  test('a background failure after confirm is a save error', async () => {
    sent.length = 0;
    reply = { error: 'save' };
    const { backup } = await readWith({ value: backupDocument() });
    await assert.rejects(restoreBackup(backup), error => error instanceof ImportError && error.code === 'save');
    assert.equal(sent.length, 1);
    reply = { ok: true };
  });
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
let BackupSummary;
let i18n;

describe('backup summary in the confirm dialog', { concurrency: false }, () => {
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
      cacheDir: '/tmp/pagetime-restore-summary-vite',
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
    });
    ({ default: i18n } = await server.ssrLoadModule('/src/i18n.js'));
    ({ BackupSummary } = await server.ssrLoadModule('/src/backup-summary.jsx'));
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
    await React.act(async () => { root.render(React.createElement(BackupSummary, { summary })); });
    const section = host.querySelector('section');
    const title = section ? host.querySelector(`#${section.getAttribute('aria-labelledby')}`)?.textContent : '';
    const fields = Object.fromEntries([...host.querySelectorAll('dl > div')].map(row => [
      row.getAttribute('data-field'),
      `${row.querySelector('dt').textContent}: ${row.querySelector('dd').textContent}`,
    ]));
    const result = { title, fields, status: host.querySelector('[role="status"]'), text: host.textContent };
    await React.act(async () => { root.unmount(); });
    host.remove();
    return result;
  }

  test('every summary field is labelled in English, with grouped counts', async () => {
    await i18n.changeLanguage('en');
    const summary = { ...summaryOf(backupDocument()), rows: { domains: 3, days: 1_234, hours: 25_000, spans: 0, visits: 1_000_000 } };
    const view = await render(summary);
    assert.equal(view.title, 'Backup summary');
    assert.equal(view.status, null);
    assert.deepEqual(view.fields, {
      exportedAt: 'Exported: 10/22/2026 09:05',
      format: 'Format version: 1',
      span: 'Recorded days: 10/3/2026 – 10/21/2026',
      sites: 'Sites: 3',
      days: 'Day totals: 1,234',
      hours: 'Hour totals: 25,000',
      spans: 'Active sessions: 0',
      visits: 'Visits: 1,000,000',
      settings: 'Settings: Included',
      version: 'Extension version: 1.3.0',
    });
  });

  test('missing facts read as unknown, none, or not included, and an absent version has no row', async () => {
    await i18n.changeLanguage('en');
    const view = await render({ ...summaryOf(backupDocument()), exportedAt: null, startDay: null, endDay: null, includesSettings: false, appVersion: null });
    assert.equal(view.fields.exportedAt, 'Exported: Unknown');
    assert.equal(view.fields.span, 'Recorded days: None');
    assert.equal(view.fields.settings, 'Settings: Not included, defaults apply');
    assert.equal('version' in view.fields, false);
  });

  test('Simplified Chinese labels the same facts', async () => {
    await i18n.changeLanguage('zh-CN');
    const view = await render(summaryOf(backupDocument()));
    assert.equal(view.title, '备份摘要');
    assert.equal(view.fields.exportedAt, '导出时间: 2026/10/22 09:05');
    assert.equal(view.fields.span, '记录日期: 2026/10/3 – 2026/10/21');
    assert.equal(view.fields.settings, '设置: 包含');
    assert.equal(view.fields.version, '扩展版本: 1.3.0');
    await i18n.changeLanguage('en');
  });

  test('no summary renders nothing', async () => {
    const view = await render(null);
    assert.equal(view.text, '');
  });
});
