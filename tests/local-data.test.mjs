import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { clearLedger, commitTick, openLedger, pruneDetail, readHead, readLedgerStats } from '../src/ledger.mjs';
import { localDataOverview } from '../src/local-data.mjs';
import { addDays, dateKey, detailCutoff, DETAIL_DAYS } from '../src/model.mjs';

const fresh = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const tick = async (db, { now, span = null, visit = null, cursor = null }) =>
  commitTick(db, { expect: await readHead(db), now, span, visit, cursor });
const overview = async (db, now) => localDataOverview(await readLedgerStats(db), now);

test('an empty ledger has no dates to show, only the retention rule', async () => {
  const db = fresh();
  const now = at(10, 18, 15);
  assert.deepEqual(await readLedgerStats(db), {
    counts: { meta: 0, domains: 0, days: 0, hours: 0, spans: 0, visits: 0 },
    firstDay: undefined, firstSpan: undefined, firstVisit: undefined, since: undefined,
  });
  const empty = await overview(db, now);
  assert.deepEqual(empty, {
    since: null, firstDay: null, detailDays: DETAIL_DAYS, detailFrom: detailCutoff(now), firstDetail: null,
    sites: 0, rows: { days: 0, hours: 0, spans: 0, visits: 0 }, empty: true,
  });
  assert.ok(!Number.isNaN(new Date(empty.detailFrom).getTime()));
  assert.deepEqual(localDataOverview({}, now), empty);
});

test('a cleared ledger keeps only its new since', async () => {
  const db = fresh();
  await tick(db, { now: at(10, 18, 9, 1), span: { domain: 'a.test', start: at(10, 18, 9), end: at(10, 18, 9, 1) }, visit: { domain: 'a.test', at: at(10, 18, 9) } });
  assert.equal((await overview(db, at(10, 18, 10))).empty, false);
  await clearLedger(db, at(10, 18, 10));
  const cleared = await overview(db, at(10, 18, 11));
  assert.equal(cleared.since, at(10, 18, 10));
  assert.deepEqual([cleared.firstDay, cleared.firstDetail, cleared.sites, cleared.empty], [null, null, 0, true]);
});

test('since later than the earliest day total: both are reported as stored', async () => {
  const db = fresh();
  const now = at(10, 18, 0, 10);
  // The first tick creates `since` at `now`, while the span it credits started the evening before.
  await tick(db, { now, span: { domain: 'a.test', start: at(10, 17, 23, 50), end: now }, visit: { domain: 'b.test', at: at(10, 17, 23, 55) } });
  const view = await overview(db, now);
  assert.equal(view.since, now);
  assert.equal(view.firstDay, at(10, 17));
  assert.ok(view.firstDay < view.since);
  assert.equal(view.firstDetail, at(10, 17, 23, 50));
  assert.equal(view.sites, 2);
  assert.deepEqual(view.rows, { days: 3, hours: 2, spans: 2, visits: 1 });
});

test('the retention boundary is the pruneDetail cutoff; detail before it goes, day totals stay', async () => {
  const db = fresh();
  const now = at(10, 18, 15);
  const old = at(8, 30, 12);
  await tick(db, { now: old + 60_000, span: { domain: 'old.test', start: old, end: old + 60_000 }, visit: { domain: 'old.test', at: old } });
  const cutoff = detailCutoff(now);
  await tick(db, { now: cutoff - 30_000, span: { domain: 'edge.test', start: cutoff - 60_000, end: cutoff - 30_000 } });
  await tick(db, { now: cutoff + 60_000, span: { domain: 'edge.test', start: cutoff, end: cutoff + 60_000 }, visit: { domain: 'edge.test', at: cutoff } });

  const before = await overview(db, now);
  assert.equal(before.detailFrom, cutoff);
  assert.equal(dateKey(before.detailFrom), '2026-09-18');
  assert.equal(dateKey(addDays(before.detailFrom, before.detailDays - 1)), dateKey(now));
  assert.equal(before.firstDetail, old);
  assert.ok(before.firstDetail < before.detailFrom);

  await pruneDetail(db, before.detailFrom);
  const after = await overview(db, now);
  assert.equal(after.firstDetail, cutoff);
  assert.equal(after.firstDay, at(8, 30));
  assert.equal(after.since, before.since);
  assert.deepEqual(after.rows, { days: 3, hours: 3, spans: 1, visits: 1 });

  // A day later the boundary moves one local midnight forward, so the detail at the old cutoff is due next.
  assert.equal(localDataOverview(await readLedgerStats(db), addDays(now, 1)).detailFrom, addDays(cutoff, 1));
});

test('the background prunes with the same detailCutoff the overview shows', () => {
  const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  assert.match(background, /pruneDetail\(db, detailCutoff\(now\)\)/);
  const overviewSource = readFileSync(new URL('../src/local-data.mjs', import.meta.url), 'utf8');
  assert.match(overviewSource, /detailFrom: detailCutoff\(now\)/);
  assert.doesNotMatch(overviewSource, /\b31\b/);
});
