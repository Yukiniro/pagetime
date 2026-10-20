import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// Dexie picks up the global indexedDB when it loads, and liveQuery only observes databases opened through it.
globalThis.indexedDB = new IDBFactory();
const { liveQuery } = await import('dexie');
const { clearLedger, commitTick, deleteDay, deleteSite, openLedger, readHead, readLedgerStats } = await import('../src/ledger.mjs');

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();

test('a live query of the overview follows writes, site and day deletion, and clearing', async () => {
  const db = openLedger({ IDBKeyRange });
  const seen = [];
  let wake = () => {};
  const subscription = liveQuery(() => readLedgerStats(db)).subscribe({ next: stats => { seen.push(stats); wake(); } });
  const next = count => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no update ${count}`)), 2_000);
    wake = () => { if (seen.length >= count) { clearTimeout(timer); resolve(seen.at(-1)); } };
    wake();
  });
  try {
    assert.equal((await next(1)).counts.domains, 0);
    await commitTick(db, {
      expect: await readHead(db), now: at(10, 18, 9, 1),
      span: { domain: 'a.test', start: at(10, 18, 9), end: at(10, 18, 9, 1) }, visit: { domain: 'b.test', at: at(10, 18, 9) },
    });
    const written = await next(2);
    assert.deepEqual(written.counts, { meta: 1, domains: 2, days: 2, hours: 1, spans: 1, visits: 1 });
    assert.deepEqual([written.firstDay, written.firstSpan, written.firstVisit, written.since], ['2026-10-18', at(10, 18, 9), at(10, 18, 9), at(10, 18, 9, 1)]);
    await deleteSite(db, ['b.test'], at(10, 18, 10));
    assert.deepEqual((await next(3)).counts, { meta: 1, domains: 1, days: 1, hours: 1, spans: 1, visits: 0 });
    await deleteDay(db, '2026-10-18', at(10, 18, 10));
    const dayGone = await next(4);
    assert.deepEqual(dayGone.counts, { meta: 1, domains: 1, days: 0, hours: 0, spans: 0, visits: 0 });
    assert.equal(dayGone.firstDay, undefined);
    await clearLedger(db, at(10, 18, 11));
    const cleared = await next(5);
    assert.deepEqual(cleared.counts, { meta: 1, domains: 0, days: 0, hours: 0, spans: 0, visits: 0 });
    assert.equal(cleared.since, at(10, 18, 11));
  } finally {
    subscription.unsubscribe();
  }
});
