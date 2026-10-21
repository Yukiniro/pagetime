import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location = { protocol: 'chrome-extension:', href: 'chrome-extension://test/dashboard.html' };

const replies = [];
globalThis.postMessage = data => { replies.push(data); };
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

const { backupFromFile } = await import('../src/import-worker.js');
const { ImportError } = await import('../src/import.mjs');
const { restoreBackupFile } = await import('../src/import-file.js');

const textOf = spans => JSON.stringify({
  format: 'pagetime-ledger',
  schemaVersion: 1,
  tables: {
    domains: [{ id: 1, host: 'night.test' }],
    days: [],
    hours: [],
    spans,
    visits: [],
  },
});
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test('backupFromFile accepts a span that ends on the next midnight and rejects one that crosses it', async () => {
  const kept = await backupFromFile({ text: async () => textOf([{ id: 1, domainId: 1, start: at(18, 23, 30), end: at(19, 0) }]) });
  assert.equal(kept.tables.spans[0].end, at(19, 0));
  await assert.rejects(
    backupFromFile({ text: async () => textOf([{ id: 1, domainId: 1, start: at(18, 23, 30), end: at(19, 0, 1) }]) }),
    error => error instanceof ImportError && error.code === 'structure',
  );
  await assert.rejects(
    backupFromFile({ text: async () => { throw new Error('disk'); } }),
    error => error instanceof ImportError && error.code === 'read',
  );
});

test('the worker posts a format code instead of throwing', async () => {
  globalThis.onmessage({ data: { text: async () => '{' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(replies.at(-1).code, 'format');
  assert.equal(replies.at(-1).backup, undefined);
});

test('the page parses a backup in the worker and can take a turn before the worker answers', async () => {
  const file = { text: async () => { throw new Error('read on the page'); } };
  let ran = false;
  const pending = restoreBackupFile(file);
  const worker = workers.at(-1);
  assert.equal(worker.options.type, 'module');
  assert.match(String(worker.url), /import-worker\.js$/);
  assert.equal(worker.posted, file);
  await new Promise(resolve => setTimeout(() => { ran = true; resolve(); }, 0));
  assert.equal(ran, true);
  worker.onmessage({ data: { code: 'structure' } });
  await assert.rejects(pending, error => error instanceof ImportError && error.code === 'structure');
  assert.equal(worker.terminated, true);
});

test('a worker that fails to start does not restore, and a second reply is ignored', async () => {
  const file = { text: async () => { throw new Error('read on the page'); } };
  let settled = 0;
  const pending = restoreBackupFile(file).then(() => { settled += 1; }, () => { settled += 1; });
  const worker = workers.at(-1);
  worker.onerror();
  worker.onmessage({ data: { code: 'version' } });
  await pending;
  assert.equal(settled, 1);
  assert.equal(worker.terminated, true);
});

test('the page source does not parse the backup, and the worker does', () => {
  const page = readFileSync(new URL('../src/import-file.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/import-worker.js', import.meta.url), 'utf8');
  assert.match(page, /new Worker\(new URL\('\.\/import-worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  assert.doesNotMatch(page, /parseLedgerBackup|JSON\.parse|\.text\s*\(/);
  assert.match(worker, /parseLedgerBackupPaused/);
  assert.match(worker, /setTimeout/);
  assert.doesNotMatch(worker, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b/);
});
