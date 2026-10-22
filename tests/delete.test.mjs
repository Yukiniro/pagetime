import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { commitTick, deleteSite, openLedger, readHead } from '../src/ledger.mjs';
import { openCredit } from '../src/model.mjs';
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

test('deleting a missing site is idempotent and an empty host is a no-op', async () => {
  const db = fresh();
  await deleteSite(db, 'missing.test', at(10, 18, 9));
  assert.equal(await db.domains.count(), 0);
  await seed(db);
  await deleteSite(db, 'a.test', at(10, 19, 15));
  await deleteSite(db, 'a.test', at(10, 19, 16));
  assert.deepEqual((await db.domains.toArray()).map(row => row.host), ['b.test']);
  assert.deepEqual((await db.days.toArray()).map(row => row.date), ['2026-10-19']);
  const before = await db.spans.count();
  await deleteSite(db, '', at(10, 20, 11));
  assert.equal(await db.spans.count(), before);
  assert.deepEqual((await db.domains.toArray()).map(row => row.host), ['b.test']);
});

test('a grouped site resolves to the stored hostnames, including the open cursor host', () => {
  assert.deepEqual(hostsToDelete('youtube.com', ['www.youtube.com', 'm.youtube.com', 'gist.github.com'], 'mobile.youtube.com'), ['www.youtube.com', 'm.youtube.com', 'mobile.youtube.com']);
  assert.deepEqual(hostsToDelete('youtube.com', ['www.youtube.com', 'youtube.com']), ['www.youtube.com', 'youtube.com']);
  assert.deepEqual(hostsToDelete('github.io', ['user.github.io', 'github.io', 'gist.github.com']), ['github.io']);
  assert.deepEqual(hostsToDelete('solo.test', []), ['solo.test']);
});
