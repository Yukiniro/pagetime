import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_ERROR_KEY } from '../src/ledger.mjs';
import { createHarness } from './helpers/fake-browser.mjs';

const total = data => data.spans.reduce((sum, span) => sum + span.end - span.start, 0);

test('background counts main-frame visits, ignores private/internal pages, and stores only domains', async () => {
  const h = await createHarness();
  const commit = (url, frameId = 0) => h.browser.webNavigation.onCommitted.fire({ url, frameId, tabId: 1, timeStamp: h.now });
  commit('https://example.com/private?key=secret');
  commit('https://sub.test', 1);
  let data = (await h.command('snapshot')).data;
  assert.equal(data.visits.length, 1);
  assert.equal(data.visits[0].domain, 'example.com');
  assert.ok(!JSON.stringify(data).includes('secret'));
  assert.ok(!JSON.stringify(await Promise.all(h.db.tables.map(table => table.toArray()))).includes('secret'));
  h.setTab({ incognito: true });
  commit('https://private.test');
  commit('chrome://settings');
  data = (await h.command('snapshot')).data;
  assert.equal(data.visits.length, 1);
});

test('background stops at loss of focus, idle and pause; resumes and clears without stale intervals', async () => {
  const h = await createHarness();
  h.advance(10_000);
  h.setFocus(false);
  await h.message('snapshot');
  h.advance(20_000);
  assert.equal(total((await h.command('snapshot')).data), 10_000);
  h.setFocus(true);
  await h.message('snapshot');
  h.advance(5_000);
  h.setIdle('idle');
  await h.message('snapshot');
  h.advance(20_000);
  assert.equal(total((await h.command('snapshot')).data), 15_000);
  h.setIdle('active');
  await h.message('snapshot');
  await h.message('toggle');
  h.advance(50_000);
  assert.equal(total((await h.command('snapshot')).data), 15_000);
  await h.message('toggle');
  h.advance(2_000);
  assert.equal((await h.command('snapshot')).data.spans.at(-1).end - h.now, 0);
  const cleared = (await h.command('clear')).data;
  assert.equal(cleared.spans.length, 0);
  assert.equal(cleared.visits.length, 0);
  assert.equal(await h.db.days.count(), 0);
  assert.equal(await h.db.domains.count(), 0);
  h.advance(3_000);
  const resumed = (await h.command('snapshot')).data;
  assert.equal(resumed.spans[0].end - resumed.spans[0].start, 3_000);
});

test('a normal 30s checkpoint credits the full 30s', async () => {
  const h = await createHarness();
  h.advance(30_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), 30_000);
});

test('a checkpoint delayed to 95s credits 90,000ms', async () => {
  const h = await createHarness();
  h.advance(95_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), 90_000);
});

test('a 2h gap credits at most 90,000ms', async () => {
  const h = await createHarness();
  h.advance(2 * 60 * 60 * 1_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), 90_000);
});

test('a clock moved backwards credits 0', async () => {
  const h = await createHarness();
  h.advance(-15_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), 0);
});

test('the old storage.local data key is never read, rewritten or deleted; the ledger starts empty', async () => {
  const h = await createHarness();
  const legacy = { visits: [{ domain: 'old.test', at: 1 }], spans: [{ domain: 'old.test', start: 1, end: 2 }], enabled: false, since: 1 };
  await h.browser.storage.local.set({ data: legacy, settings: { schema: 1, idleSeconds: 300, countAudible: true } });
  await h.restartWorker();
  h.advance(5_000);
  for (const type of ['snapshot', 'toggle', 'toggle', 'clear', 'snapshot']) assert.deepEqual({ ...await h.message(type) }, { ok: true });
  assert.deepEqual(h.local.data, legacy);
  const data = await h.read();
  assert.equal(data.enabled, true);
  assert.equal(data.spans.some(span => span.domain === 'old.test'), false);
  assert.equal(h.detectionIntervals.at(-1), 300);
});

test('a failed ledger write is reported, logged and marked; the next successful write clears the marker', async () => {
  const h = await createHarness();
  const db = h.workerDb;
  db.transaction = () => Promise.reject(Object.assign(new Error('disk full'), { name: 'QuotaExceededError' }));
  h.advance(5_000);
  assert.deepEqual({ ...await h.message('snapshot') }, { error: 'save' });
  assert.deepEqual(h.local[LEDGER_ERROR_KEY], { at: h.now, name: 'QuotaExceededError' });
  assert.ok(h.errors.some(([label, error]) => label === 'PageTime recording failed' && error.name === 'QuotaExceededError'));
  delete db.transaction;
  assert.deepEqual({ ...await h.message('snapshot') }, { ok: true });
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
  assert.equal(total(await h.read()), 5_000);
});

test('a failed prune is logged without marking the ledger, and the tick is still recorded', async () => {
  const h = await createHarness();
  h.failPrune(Object.assign(new Error('prune broke'), { name: 'UnknownError' }));
  h.advance(10_000);
  await h.restartWorker();
  assert.equal(total(await h.read()), 10_000);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
  assert.ok(h.errors.some(([label, error]) => label === 'PageTime prune failed' && error.name === 'UnknownError'));
  assert.equal(h.errors.some(([label]) => label === 'PageTime recording failed'), false);
  h.advance(5_000);
  assert.deepEqual({ ...await h.message('snapshot') }, { ok: true });
  assert.equal(total(await h.read()), 15_000);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
});

test('after the database closes, the worker reopens it and the checkpoint still lands', async () => {
  const h = await createHarness();
  h.advance(10_000);
  await h.fireAlarm();
  h.workerDb.close();
  h.advance(10_000);
  await h.fireAlarm();
  assert.equal(h.workerDb.isOpen(), true);
  assert.equal(total(await h.read()), 20_000);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
  assert.deepEqual(h.errors, []);
});
