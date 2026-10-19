import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  clearLedger, commitTick, daysBetween, hoursBetween, ledgerTx, openLedger, pruneDetail, readDomains, readHead,
  recentVisits, reopening, siteDays, siteHours, spansBetween, toggleRecording,
} from '../src/ledger.mjs';
import { addDays, dateKey, detailCutoff, DETAIL_DAYS, HOUR, splitByHour } from '../src/model.mjs';

const fresh = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const at = (month, day, hour = 0, minute = 0, second = 0) => new Date(2026, month - 1, day, hour, minute, second).getTime();
const tick = async (db, { now, span = null, visit = null, cursor = null }) =>
  commitTick(db, { expect: await readHead(db), now, span, visit, cursor });
const counts = async db => Object.fromEntries(await Promise.all(db.tables.map(async table => [table.name, await table.count()])));
const idOf = async (db, host) => (await db.domains.where('host').equals(host).first()).id;

test('a failing write rolls back every table written earlier in the same transaction', async () => {
  const db = fresh();
  await assert.rejects(ledgerTx(db, {
    write: t => [
      t.domains.add({ id: 1, host: 'a.test' }),
      t.days.put({ date: '2026-10-18', domainId: 1, ms: 5, visits: 0 }),
      t.spans.add({ domainId: 1, start: 1, end: 6 }),
      t.meta.put({ key: 'cursor', value: { domain: 'a.test' } }),
      t.hours.put({ date: '2026-10-18', domainId: 1, ms: 5 }),
    ],
  }), { name: 'DataError' });
  assert.deepEqual(await counts(db), { meta: 0, domains: 0, days: 0, hours: 0, spans: 0, visits: 0 });
});

test('a tick planned from a stale head commits nothing', async () => {
  const db = fresh();
  const stale = await readHead(db);
  await tick(db, { now: at(10, 18, 9), cursor: { domain: 'a.test', since: at(10, 18, 9) } });
  const before = await counts(db);
  await assert.rejects(commitTick(db, { expect: stale, now: at(10, 18, 9, 1), span: { domain: 'a.test', start: at(10, 18, 9), end: at(10, 18, 9, 1) }, cursor: null }), /ledger changed/);
  assert.deepEqual(await counts(db), before);
  assert.equal((await readHead(db)).cursor.domain, 'a.test');
});

test('ledgerTx: a foreign await in the read phase fails before any write lands', async () => {
  const db = fresh();
  await assert.rejects(ledgerTx(db, {
    async read(t) { await t.meta.get('state'); await sleep(10); return 1; },
    write: t => [t.meta.put({ key: 'state', value: { enabled: false, since: 1 } })],
  }), { name: 'TransactionInactiveError' });
  assert.equal(await db.meta.count(), 0);
});

test('ledgerTx: an asynchronous write phase is refused and its first write is rolled back', async () => {
  const db = fresh();
  await assert.rejects(ledgerTx(db, {
    async write(t) {
      t.meta.put({ key: 'a', value: 1 });
      await sleep(10);
      t.meta.put({ key: 'b', value: 2 });
    },
  }), /write must synchronously return/);
  await sleep(30);
  assert.equal(await db.meta.count(), 0);
});

test('source guard: only ledgerTx opens a transaction, and the background never touches Dexie or liveQuery', () => {
  const ledger = readFileSync(new URL('../src/ledger.mjs', import.meta.url), 'utf8');
  const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  assert.equal(ledger.match(/\.transaction\(/g).length, 1);
  assert.match(ledger, /export function ledgerTx\(db, \{ read = \(\) => undefined, write \}\) \{\n {2}return db\.transaction\('rw'/);
  assert.doesNotMatch(ledger, /\b(browser|chrome)\.|setTimeout|liveQuery|Dexie\.waitFor|fetch\(/);
  assert.doesNotMatch(background, /from 'dexie'|\.transaction\(|ledgerTx|liveQuery|\bdb\.table\(/);
});

test('splitByHour cuts at every local hour and midnight without losing time', () => {
  const pieces = splitByHour(at(10, 18, 23, 30), at(10, 19, 1, 15));
  assert.deepEqual(pieces.map(({ date, hour }) => [date, hour]), [['2026-10-18', 23], ['2026-10-19', 0], ['2026-10-19', 1]]);
  assert.deepEqual(pieces.map(p => p.end - p.start), [30 * 60_000, HOUR, 15 * 60_000]);
  assert.equal(pieces[0].end, pieces[1].start);
  assert.deepEqual(splitByHour(at(10, 18, 9, 10), at(10, 18, 9, 20)).map(p => p.hour), [9]);
  assert.deepEqual(splitByHour(5, 5), []);
});

test('a span across hours and midnight lands in the right day and hour rows, split into one span per day', async () => {
  const db = fresh();
  const start = at(10, 18, 23, 59, 30);
  await tick(db, { now: start, cursor: { domain: 'a.test', since: start } });
  await tick(db, { now: start + 60_000, span: { domain: 'a.test', start, end: start + 60_000 } });
  const id = await idOf(db, 'a.test');
  const days = await daysBetween(db, '2026-10-18', '2026-10-19');
  assert.deepEqual(days.map(d => [d.date, d.domainId, d.ms]), [['2026-10-18', id, 30_000], ['2026-10-19', id, 30_000]]);
  const hours = await hoursBetween(db, '2026-10-18', '2026-10-19');
  assert.deepEqual(hours.map(h => [h.date, h.hour, h.ms]), [['2026-10-18', 23, 30_000], ['2026-10-19', 0, 30_000]]);
  const spans = await db.spans.orderBy('start').toArray();
  assert.deepEqual(spans.map(s => [s.start, s.end]), [[start, at(10, 19)], [at(10, 19), start + 60_000]]);
});

test('continuous same-site ticks extend one span; a gap or another site starts a new one', async () => {
  const db = fresh();
  const t0 = at(10, 18, 10);
  const span = (domain, start, end) => tick(db, { now: end, span: { domain, start, end } });
  await span('a.test', t0, t0 + 30_000);
  await span('a.test', t0 + 30_000, t0 + 60_000);
  await span('a.test', t0 + 70_000, t0 + 80_000);
  await span('b.test', t0 + 80_000, t0 + 90_000);
  await span('a.test', t0 + 90_000, t0 + 90_000);
  const spans = await db.spans.orderBy('start').toArray();
  assert.deepEqual(spans.map(s => [s.start - t0, s.end - t0]), [[0, 60_000], [70_000, 80_000], [80_000, 90_000]]);
  assert.equal(spans[2].domainId, await idOf(db, 'b.test'));
});

test('hour buckets of each day and site add up to the day total, and hours stay sparse', async () => {
  const db = fresh();
  let now = at(10, 16, 22, 50);
  const sites = ['a.test', 'b.test', 'c.test'];
  for (let i = 0; i < 400; i++) {
    const end = now + 20_000 + (i % 7) * 10_000;
    await tick(db, { now: end, span: i % 5 === 4 ? null : { domain: sites[i % 3], start: now, end }, visit: i % 9 === 0 ? { domain: sites[(i + 1) % 3], at: now } : null });
    now = end + (i % 11 === 0 ? HOUR : 0);
  }
  const days = await daysBetween(db, '2026-01-01', '2026-12-31');
  const hours = await hoursBetween(db, '2026-01-01', '2026-12-31');
  assert.ok(new Set(days.map(d => d.date)).size >= 3);
  assert.ok(hours.every(h => h.ms > 0));
  for (const day of days) {
    const sum = hours.filter(h => h.date === day.date && h.domainId === day.domainId).reduce((total, h) => total + h.ms, 0);
    assert.equal(sum, day.ms, `${day.date} ${day.domainId}`);
  }
  const spans = await db.spans.toArray();
  assert.equal(spans.reduce((total, s) => total + s.end - s.start, 0), days.reduce((total, d) => total + d.ms, 0));
  assert.equal((await db.visits.count()), days.reduce((total, d) => total + d.visits, 0));
});

test('a visit adds a visit row and counts on its day, even without time', async () => {
  const db = fresh();
  await tick(db, { now: at(10, 18, 8), visit: { domain: 'v.test', at: at(10, 18, 8) } });
  const [day] = await daysBetween(db, '2026-10-18', '2026-10-18');
  assert.deepEqual({ ms: day.ms, visits: day.visits }, { ms: 0, visits: 1 });
  assert.equal(await db.hours.count(), 0);
  assert.equal((await db.visits.toArray())[0].domainId, await idOf(db, 'v.test'));
});

test('the first tick creates the recording state; toggle and clear keep it consistent', async () => {
  const db = fresh();
  await tick(db, { now: 1_000, span: { domain: 'a.test', start: 0, end: 1_000 }, visit: { domain: 'a.test', at: 0 }, cursor: { domain: 'a.test', since: 1_000 } });
  assert.deepEqual((await readHead(db)).state, { enabled: true, since: 1_000 });
  await toggleRecording(db, 2_000);
  assert.deepEqual(await readHead(db), { state: { enabled: false, since: 1_000 }, cursor: undefined, lastEnd: 1_000 });
  await clearLedger(db, 3_000);
  assert.deepEqual(await counts(db), { meta: 1, domains: 0, days: 0, hours: 0, spans: 0, visits: 0 });
  assert.deepEqual((await readHead(db)).state, { enabled: false, since: 3_000 });
  await toggleRecording(db, 4_000);
  assert.deepEqual((await readHead(db)).state, { enabled: true, since: 3_000 });
});

test('31-day cleanup removes old spans and visits in batches, keeps totals, and is idempotent', async () => {
  const db = fresh();
  const now = at(10, 18, 15);
  const cutoff = detailCutoff(now);
  assert.equal(cutoff, at(9, 18));
  assert.equal(dateKey(addDays(cutoff, DETAIL_DAYS - 1)), dateKey(now));
  await tick(db, { now: cutoff - 60_000, span: { domain: 'old.test', start: cutoff - 120_000, end: cutoff - 60_000 } });
  await tick(db, { now: cutoff + 60_000, span: { domain: 'new.test', start: cutoff, end: cutoff + 60_000 }, visit: { domain: 'new.test', at: cutoff } });
  await db.spans.bulkAdd(Array.from({ length: 1_100 }, (_, i) => ({ domainId: 1, start: cutoff - 10 * HOUR + i * 10, end: cutoff - 10 * HOUR + i * 10 + 5 })));
  await db.visits.bulkAdd(Array.from({ length: 30 }, (_, i) => ({ domainId: 1, at: cutoff - 1 - i })));
  const totals = { days: await db.days.toArray(), hours: await db.hours.toArray() };
  const transaction = db.transaction.bind(db);
  let transactions = 0;
  db.transaction = (...args) => { transactions += 1; return transaction(...args); };
  assert.equal(await pruneDetail(db, cutoff, 500), 1_101 + 30);
  assert.equal(transactions, 3 + 1);
  assert.deepEqual((await db.spans.toArray()).map(s => s.start), [cutoff]);
  assert.deepEqual((await db.visits.toArray()).map(v => v.at), [cutoff]);
  assert.deepEqual({ days: await db.days.toArray(), hours: await db.hours.toArray() }, totals);
  assert.equal(await pruneDetail(db, cutoff, 500), 0);
  assert.deepEqual((await db.spans.toArray()).map(s => s.start), [cutoff]);
});

test('date-range and site queries use the compound indexes', async () => {
  const db = fresh();
  for (let day = 1; day <= 10; day++) {
    for (const [i, domain] of ['a.test', 'b.test', 'c.test'].entries()) {
      const start = at(10, day, 9 + i);
      await tick(db, { now: start + 60_000, span: { domain, start, end: start + 60_000 * (i + 1) }, visit: { domain, at: start } });
    }
  }
  const range = await daysBetween(db, '2026-10-03', '2026-10-05');
  assert.equal(range.length, 9);
  assert.deepEqual([...new Set(range.map(d => d.date))], ['2026-10-03', '2026-10-04', '2026-10-05']);
  const b = await idOf(db, 'b.test');
  const trend = await siteDays(db, b, '2026-10-02', '2026-10-08');
  assert.deepEqual(trend.map(d => [d.date, d.ms, d.visits]), Array.from({ length: 7 }, (_, i) => [`2026-10-0${i + 2}`, 120_000, 1]));
  const bHours = await siteHours(db, b, '2026-10-02', '2026-10-08');
  assert.deepEqual(bHours.map(h => [h.date, h.hour, h.ms]), Array.from({ length: 7 }, (_, i) => [`2026-10-0${i + 2}`, 10, 120_000]));
  assert.deepEqual((await hoursBetween(db, '2026-10-04', '2026-10-04')).map(h => h.hour), [9, 10, 11]);
  assert.deepEqual((await spansBetween(db, at(10, 4), at(10, 5))).map(s => s.start), [at(10, 4, 9), at(10, 4, 10), at(10, 4, 11)]);
  const visits = await recentVisits(db, at(10, 1), at(10, 11), new Set([b]), 3);
  assert.deepEqual(visits.map(v => v.at), [at(10, 10, 10), at(10, 9, 10), at(10, 8, 10)]);
  assert.deepEqual((await readDomains(db)).map(d => d.host).sort(), ['a.test', 'b.test', 'c.test']);
});

test('after the database closes, reopening retries the write once and it lands', async () => {
  const db = fresh();
  await tick(db, { now: 1_000, cursor: { domain: 'a.test', since: 1_000 } });
  db.close();
  await assert.rejects(tick(db, { now: 2_000 }), { name: 'DatabaseClosedError' });
  await reopening(db, () => tick(db, { now: 3_000, span: { domain: 'a.test', start: 1_000, end: 3_000 } }));
  assert.equal(db.isOpen(), true);
  assert.deepEqual((await db.spans.toArray()).map(s => [s.start, s.end]), [[1_000, 3_000]]);
  let calls = 0;
  await assert.rejects(reopening(db, async () => { calls += 1; throw new Error('quota'); }), /quota/);
  assert.equal(calls, 1);
});
