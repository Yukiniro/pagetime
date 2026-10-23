import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location = { protocol: 'chrome-extension:', href: 'chrome-extension://test/dashboard.html' };

const workers = [];
globalThis.Worker = class {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.terminated = false;
    workers.push(this);
  }
  postMessage(data) { this.posted = data; }
  terminate() { this.terminated = true; }
};

const { ImportError, PARSE_CHUNK } = await import('../src/import.mjs');
const { readBackupFile } = await import('../src/import-file.js');

const workerScript = readFileSync(new URL('../public/import-parse-worker.js', import.meta.url), 'utf8');
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

function hostWorker(file) {
  const replies = [];
  const scope = { postMessage(data) { replies.push(data); } };
  new Function('self', workerScript)(scope);
  scope.onmessage({ data: file });
  return replies;
}

test('the parse worker returns JSON and reports read or format failures', async () => {
  const kept = hostWorker({ text: async () => `\uFEFF${JSON.stringify({ format: 'pagetime-ledger' })}` });
  const bad = hostWorker({ text: async () => '{' });
  const unread = hostWorker({ text: async () => { throw new Error('disk'); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(kept[0].value, { format: 'pagetime-ledger' });
  assert.equal(bad[0].code, 'format');
  assert.equal(unread[0].code, 'read');
});

test('the page waits on the worker, then yields between row chunks before rejecting a cross-day span', async () => {
  const file = { text: async () => { throw new Error('read on the page'); } };
  const pending = readBackupFile(file);
  const worker = workers.at(-1);
  assert.equal(String(worker.url), 'chrome-extension://test/import-parse-worker.js');
  assert.equal(worker.options, undefined);
  assert.equal(worker.posted, file);
  let waiting = false;
  await new Promise(resolve => setTimeout(() => { waiting = true; resolve(); }, 0));
  assert.equal(waiting, true);
  const domains = Array.from({ length: PARSE_CHUNK }, (_, index) => ({ id: index + 1, host: `h${index}.test` }));
  let during = false;
  setTimeout(() => { during = true; }, 0);
  worker.onmessage({
    data: {
      value: {
        format: 'pagetime-ledger',
        schemaVersion: 1,
        tables: {
          domains,
          days: [],
          hours: [],
          spans: [{ id: 1, domainId: 1, start: at(18, 23), end: at(19, 1) }],
          visits: [],
        },
      },
    },
  });
  await assert.rejects(pending, error => error instanceof ImportError && error.code === 'structure');
  assert.equal(during, true);
  assert.equal(worker.terminated, true);
});

test('a worker that fails to start rejects the file, and a second reply is ignored', async () => {
  const file = { text: async () => { throw new Error('read on the page'); } };
  let settled = 0;
  const pending = readBackupFile(file).then(() => { settled += 1; }, () => { settled += 1; });
  const worker = workers.at(-1);
  worker.onerror();
  worker.onmessage({ data: { code: 'version' } });
  await pending;
  assert.equal(settled, 1);
  assert.equal(worker.terminated, true);
});

test('the page source does not parse JSON, and the worker script does', () => {
  const page = readFileSync(new URL('../src/import-file.js', import.meta.url), 'utf8');
  assert.match(page, /new Worker\(new URL\('import-parse-worker\.js', location\.href\)\)/);
  assert.match(page, /parseLedgerBackupPaused/);
  assert.doesNotMatch(page, /JSON\.parse|\.text\s*\(/);
  assert.match(workerScript, /JSON\.parse/);
  assert.doesNotMatch(workerScript, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b/);
});
