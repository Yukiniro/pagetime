import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { commitTick, deleteDay, deleteSite, openLedger, readHead } from '../src/ledger.mjs';
import { daySummary, daySummaryFromSnapshot } from '../src/ledger-view.mjs';
import { dateKey, openCredit } from '../src/model.mjs';
import { hostsToDelete } from '../src/site.mjs';

const fresh = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const at = (month, day, hour = 0, minute = 0, second = 0) => new Date(2026, month - 1, day, hour, minute, second).getTime();
const tick = async (db, { now, span = null, visit = null, cursor = null }) =>
  commitTick(db, { expect: await readHead(db), now, span, visit, cursor });
const cursorFor = (domain, since) => ({ domain, since, tabId: 1, session: 's' });

async function seed(db) {
  const start = at(10, 18, 9);
  await tick(db, {
    now: start + 60_000,
    span: { domain: 'a.test', start, end: start + 60_000 },
    visit: { domain: 'a.test', at: start },
    cursor: cursorFor('a.test', start + 60_000),
  });
  const other = at(10, 19, 11);
  await tick(db, {
    now: other + 30_000,
    span: { domain: 'b.test', start: other, end: other + 30_000 },
    visit: { domain: 'b.test', at: other },
    cursor: cursorFor('b.test', other + 30_000),
  });
  return { start, other };
}

test('deleting a site removes its rows from days, hours, spans and visits, and the domain entry', async () => {
  const db = fresh();
  await seed(db);
  const original = db.transaction.bind(db);
  let transactions = 0;
  db.transaction = (...args) => { transactions += 1; return original(...args); };
  const state = (await readHead(db)).state;
  await deleteSite(db, 'a.test', at(10, 19, 12));
  assert.equal(transactions, 1);
  assert.deepEqual((await db.domains.toArray()).map(row => row.host), ['b.test']);
  assert.deepEqual((await db.days.toArray()).map(row => row.date), ['2026-10-19']);
  assert.deepEqual((await db.hours.toArray()).map(row => [row.date, row.hour]), [['2026-10-19', 11]]);
  assert.deepEqual((await db.spans.toArray()).map(row => row.domainId), [await db.domains.where('host').equals('b.test').primaryKeys().then(keys => keys[0])]);
  assert.equal((await db.visits.toArray()).length, 1);
  assert.equal((await db.visits.toArray())[0].domainId, (await db.domains.toArray())[0].id);
  assert.deepEqual((await readHead(db)).state, state);
});

test('deleting a day removes only that day, including visits on its midnight and not the next', async () => {
  const db = fresh();
  const start = at(10, 18, 22);
  await tick(db, {
    now: start + 3 * 60 * 60_000,
    span: { domain: 'a.test', start, end: start + 3 * 60 * 60_000 },
    visit: { domain: 'a.test', at: start },
    cursor: cursorFor('a.test', start + 3 * 60 * 60_000),
  });
  const nextMidnight = at(10, 19);
  await db.visits.add({ domainId: (await db.domains.toArray())[0].id, at: nextMidnight });
  await db.days.where('[date+domainId]').equals(['2026-10-19', 1]).modify(row => { row.visits += 1; });
  await deleteDay(db, '2026-10-18', at(10, 20, 8));
  assert.deepEqual((await db.days.toArray()).map(row => [row.date, row.ms]), [['2026-10-19', 60 * 60_000]]);
  assert.deepEqual((await db.hours.toArray()).map(row => [row.date, row.hour]), [['2026-10-19', 0]]);
  assert.deepEqual((await db.spans.toArray()).map(row => [row.start, row.end]), [[nextMidnight, start + 3 * 60 * 60_000]]);
  assert.deepEqual((await db.visits.toArray()).map(row => row.at), [nextMidnight]);
  assert.equal(await db.domains.count(), 1);
});

test('a span that crosses midnight keeps the part outside the deleted day', async () => {
  const db = fresh();
  const id = await db.domains.add({ host: 'a.test' });
  const before = at(10, 17, 23);
  const after = at(10, 19, 1);
  await db.spans.add({ domainId: id, start: before, end: after });
  await db.spans.add({ domainId: id, start: at(10, 18, 10), end: at(10, 18, 11) });
  await db.days.bulkAdd([
    { date: '2026-10-17', domainId: id, ms: 60 * 60_000, visits: 0 },
    { date: '2026-10-18', domainId: id, ms: 24 * 60 * 60_000, visits: 1 },
    { date: '2026-10-19', domainId: id, ms: 60 * 60_000, visits: 0 },
  ]);
  await db.hours.bulkAdd([
    { date: '2026-10-17', hour: 23, domainId: id, ms: 60 * 60_000 },
    { date: '2026-10-18', hour: 10, domainId: id, ms: 60 * 60_000 },
    { date: '2026-10-19', hour: 0, domainId: id, ms: 60 * 60_000 },
  ]);
  await db.visits.add({ domainId: id, at: at(10, 18, 10) });
  await deleteDay(db, '2026-10-18', at(10, 20, 9));
  assert.deepEqual((await db.spans.orderBy('start').toArray()).map(row => [row.start, row.end]), [[before, at(10, 18)], [at(10, 19), after]]);
  assert.deepEqual((await db.days.toArray()).map(row => row.date).sort(), ['2026-10-17', '2026-10-19']);
  assert.deepEqual((await db.hours.toArray()).map(row => row.date).sort(), ['2026-10-17', '2026-10-19']);
  assert.equal(await db.visits.count(), 0);
});

test('a failure inside the delete transaction rolls back every table and the cursor', async () => {
  const db = fresh();
  const since = at(10, 18, 9);
  await tick(db, {
    now: since + 10_000,
    span: { domain: 'a.test', start: since, end: since + 10_000 },
    visit: { domain: 'a.test', at: since },
    cursor: cursorFor('a.test', since + 10_000),
  });
  const before = {
    domains: await db.domains.toArray(),
    days: await db.days.toArray(),
    hours: await db.hours.toArray(),
    spans: await db.spans.toArray(),
    visits: await db.visits.toArray(),
    cursor: (await readHead(db)).cursor,
  };
  db.visits.hook('deleting', () => { throw new Error('boom'); });
  await assert.rejects(deleteSite(db, 'a.test', since + 20_000), /boom/);
  assert.deepEqual({
    domains: await db.domains.toArray(),
    days: await db.days.toArray(),
    hours: await db.hours.toArray(),
    spans: await db.spans.toArray(),
    visits: await db.visits.toArray(),
    cursor: (await readHead(db)).cursor,
  }, before);
});

test('deleting the current cursor site does not credit the unflushed interval on the next tick', async () => {
  const db = fresh();
  const start = at(10, 18, 10);
  await tick(db, { now: start + 30_000, span: { domain: 'a.test', start, end: start + 30_000 }, cursor: cursorFor('a.test', start + 30_000) });
  const deletedAt = start + 50_000;
  await deleteSite(db, 'a.test', deletedAt);
  const head = await readHead(db);
  assert.equal(head.cursor.since, deletedAt);
  assert.equal(head.cursor.domain, 'a.test');
  const next = deletedAt + 20_000;
  const credit = openCredit(head.cursor, head.lastEnd, next);
  assert.deepEqual(credit, { domain: 'a.test', start: deletedAt, end: next });
  await tick(db, { now: next, span: credit, cursor: { ...head.cursor, since: next } });
  assert.equal((await db.days.toArray()).reduce((sum, row) => sum + row.ms, 0), 20_000);
});

test('deleting another site leaves the cursor so the next tick still credits that site', async () => {
  const db = fresh();
  const start = at(10, 18, 10);
  await tick(db, { now: start + 30_000, span: { domain: 'a.test', start, end: start + 30_000 }, cursor: cursorFor('a.test', start + 30_000) });
  await tick(db, { now: start + 40_000, span: { domain: 'b.test', start: start + 30_000, end: start + 40_000 }, cursor: cursorFor('a.test', start + 40_000) });
  const deletedAt = start + 55_000;
  await deleteSite(db, 'b.test', deletedAt);
  const head = await readHead(db);
  assert.equal(head.cursor.since, start + 40_000);
  const credit = openCredit(head.cursor, head.lastEnd, deletedAt);
  assert.equal(credit.end - credit.start, 15_000);
  assert.equal(credit.domain, 'a.test');
});

test('a cursor that crosses midnight keeps only the time outside the deleted day', async () => {
  const msOn = async (db, date) => (await db.days.toArray()).filter(row => row.date === date).reduce((sum, row) => sum + row.ms, 0);
  const hourOn = async (db, date) => (await db.hours.toArray()).filter(row => row.date === date).reduce((sum, row) => sum + row.ms, 0);
  const boundary = at(10, 19);
  const since = boundary - 40_000;
  const now = boundary + 25_000;
  const seedCursor = async db => tick(db, {
    now: since,
    span: { domain: 'a.test', start: since - 20_000, end: since },
    cursor: cursorFor('a.test', since),
  });

  const yesterday = fresh();
  await seedCursor(yesterday);
  await deleteDay(yesterday, '2026-10-18', now);
  let head = await readHead(yesterday);
  assert.equal(head.cursor.domain, 'a.test');
  assert.equal(head.cursor.since, now);
  assert.equal(await msOn(yesterday, '2026-10-18'), 0);
  assert.equal(await msOn(yesterday, '2026-10-19'), 25_000);
  assert.equal(await hourOn(yesterday, '2026-10-19'), 25_000);
  assert.deepEqual((await yesterday.spans.toArray()).map(span => [span.start, span.end]), [[boundary, now]]);
  const next = now + 10_000;
  let credit = openCredit(head.cursor, head.lastEnd, next);
  assert.equal(credit.start, now);
  await tick(yesterday, { now: next, span: credit, cursor: { ...head.cursor, since: next } });
  assert.equal(await msOn(yesterday, '2026-10-18'), 0);
  assert.equal(await msOn(yesterday, '2026-10-19'), 35_000);

  const today = fresh();
  await seedCursor(today);
  await deleteDay(today, '2026-10-19', now);
  head = await readHead(today);
  assert.equal(head.cursor.since, now);
  assert.equal(await msOn(today, '2026-10-18'), 60_000);
  assert.equal(await hourOn(today, '2026-10-18'), 60_000);
  assert.equal(await msOn(today, '2026-10-19'), 0);
  assert.deepEqual((await today.spans.toArray()).map(span => [span.start, span.end]), [[since - 20_000, boundary]]);
  credit = openCredit(head.cursor, head.lastEnd, next);
  assert.equal(credit.start, now);
  await tick(today, { now: next, span: credit, cursor: { ...head.cursor, since: next } });
  assert.equal(await msOn(today, '2026-10-18'), 60_000);
  assert.equal(await msOn(today, '2026-10-19'), 10_000);
});

test('deleting today resets the cursor; deleting another day does not', async () => {
  const db = fresh();
  const since = at(10, 19, 11, 50);
  await tick(db, { now: since, cursor: cursorFor('a.test', since) });
  await deleteDay(db, '2026-10-18', at(10, 19, 12));
  assert.equal((await readHead(db)).cursor.since, since);
  const now = at(10, 19, 12);
  await deleteDay(db, dateKey(now), now);
  assert.equal((await readHead(db)).cursor.since, now);
  assert.equal((await readHead(db)).cursor.domain, 'a.test');
});

test('deleting a missing site or day is idempotent', async () => {
  const db = fresh();
  await deleteSite(db, 'missing.test', at(10, 18, 9));
  await deleteDay(db, '2020-01-01', at(10, 18, 9));
  assert.equal(await db.domains.count(), 0);
  await seed(db);
  await deleteSite(db, 'a.test', at(10, 19, 15));
  await deleteSite(db, 'a.test', at(10, 19, 16));
  await deleteDay(db, '2026-10-19', at(10, 20, 9));
  await deleteDay(db, '2026-10-19', at(10, 20, 10));
  assert.equal(await db.days.count(), 0);
  assert.equal(await db.spans.count(), 0);
  assert.equal(await db.visits.count(), 0);
  assert.deepEqual((await db.domains.toArray()).map(row => row.host), ['b.test']);
  await deleteSite(db, '', at(10, 20, 11));
  await assert.rejects(deleteDay(db, '2026-02-31', at(10, 20, 11)), /invalid date/);
});

test('a grouped site resolves to the stored hostnames, including the open cursor host', () => {
  assert.deepEqual(hostsToDelete('youtube.com', 'prefix', ['www.youtube.com', 'm.youtube.com', 'gist.github.com'], 'mobile.youtube.com'), ['www.youtube.com', 'm.youtube.com', 'mobile.youtube.com']);
  assert.deepEqual(hostsToDelete('www.youtube.com', 'none', ['www.youtube.com', 'youtube.com']), ['www.youtube.com']);
  assert.deepEqual(hostsToDelete('github.io', 'registrable', ['user.github.io', 'github.io', 'gist.github.com']), ['user.github.io', 'github.io']);
  assert.deepEqual(hostsToDelete('solo.test', 'prefix', []), ['solo.test']);
});

test('one day summary counts grouped hosts and still-open time on that day', () => {
  const domains = [{ id: 1, host: 'www.youtube.com' }, { id: 2, host: 'm.youtube.com' }, { id: 3, host: 'b.test' }];
  const days = [
    { date: '2026-10-18', domainId: 1, ms: 60_000, visits: 1 },
    { date: '2026-10-18', domainId: 2, ms: 30_000, visits: 0 },
    { date: '2026-10-18', domainId: 3, ms: 0, visits: 2 },
    { date: '2026-10-19', domainId: 1, ms: 5_000, visits: 0 },
  ];
  assert.deepEqual(daySummary({ domains, days, date: '2026-10-18', siteMerge: 'prefix' }), { ms: 90_000, sites: 2 });
  const segment = { domain: 'www.youtube.com', start: at(10, 18, 23, 59), end: at(10, 19, 0, 1) };
  assert.deepEqual(daySummary({ domains, days, segment, date: '2026-10-19', siteMerge: 'prefix' }), { ms: 5_000 + 60_000, sites: 1 });
  const snapshot = {
    visits: [{ domain: 'b.test', at: at(10, 18, 8) }],
    spans: [{ domain: 'www.youtube.com', start: at(10, 18, 9), end: at(10, 18, 10) }, { domain: 'm.youtube.com', start: at(10, 18, 10), end: at(10, 18, 10, 30) }],
  };
  assert.deepEqual(daySummaryFromSnapshot(snapshot, '2026-10-18', 'prefix'), { ms: 5_400_000, sites: 2 });
});
