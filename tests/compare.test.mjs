process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
const { commitTick, openLedger, pruneDetail, readDomains, readHead } = await import('../src/ledger.mjs');
const { readComparison } = await import('../src/compare.mjs');
const { compareFromSnapshot, windowTotals, windowTotalsFromSnapshot } = await import('../src/ledger-view.mjs');
const { detailCutoff, dateKey } = await import('../src/model.mjs');
const { compareBlocks, compareSummary, customRange, presetRange, previousWindow } = await import('../src/range.mjs');

const at = (month, day, hour = 0, minute = 0, second = 0) => new Date(2026, month - 1, day, hour, minute, second).getTime();
const MIN = 60_000;
const NONE = { ms: null, visits: null, sites: null };

test('the test zone observes daylight saving time', () => {
  assert.equal(new Date(2026, 2, 8, 12).getTimezoneOffset(), 240);
  assert.equal(new Date(2026, 2, 7, 12).getTimezoneOffset(), 300);
});

test('today is compared with yesterday, both cut at the current whole hour', () => {
  const now = at(10, 19, 15, 20);
  const win = previousWindow(presetRange('today', at(10, 19)), now);
  assert.deepEqual(win.current, { start: at(10, 19), end: at(10, 19, 15) });
  assert.deepEqual(win.previous, { start: at(10, 18), end: at(10, 18, 15) });
  assert.deepEqual(win.period, { start: at(10, 18), end: at(10, 19) });
  assert.equal(win.truncated, true);
  assert.equal(win.cutoff, at(10, 19, 15));
  assert.equal(win.days, 1);
  assert.equal(win.empty, false);
});

test('7 and 30 day ranges are compared with the equal run of days right before them', () => {
  const now = at(10, 19, 9, 59);
  const week = previousWindow(presetRange('7d', at(10, 19)), now);
  assert.deepEqual(week.current, { start: at(10, 13), end: at(10, 19, 9) });
  assert.deepEqual(week.previous, { start: at(10, 6), end: at(10, 12, 9) });
  assert.deepEqual(week.period, { start: at(10, 6), end: at(10, 13) });
  const month = previousWindow(presetRange('30d', at(10, 19)), now);
  assert.deepEqual(month.period, { start: at(8, 21), end: at(9, 20) });
  assert.deepEqual(month.previous.end, at(9, 19, 9));
});

test('windows cross month and year boundaries and short months', () => {
  const week = previousWindow(presetRange('7d', at(10, 2)), at(10, 2, 12));
  assert.equal(dateKey(week.period.start), '2026-09-19');
  assert.equal(dateKey(week.period.end), '2026-09-26');
  const month = previousWindow(presetRange('30d', at(3, 3)), at(3, 3, 8));
  assert.equal(dateKey(month.current.start), '2026-02-02');
  assert.equal(dateKey(month.period.start), '2026-01-03');
  const january = previousWindow(presetRange('7d', new Date(2027, 0, 3).getTime()), new Date(2027, 0, 3, 8).getTime());
  assert.equal(dateKey(january.period.start), '2026-12-21');
});

test('a custom range inside the past is compared with the equal run of days before it, uncut', () => {
  const range = customRange('2026-10-10', '2026-10-14');
  const win = previousWindow(range, at(10, 19, 15));
  assert.equal(win.days, 5);
  assert.equal(win.truncated, false);
  assert.equal(win.cutoff, null);
  assert.deepEqual(win.current, { start: at(10, 10), end: at(10, 15) });
  assert.deepEqual(win.previous, { start: at(10, 5), end: at(10, 10) });
  const single = previousWindow(customRange('2026-10-12', '2026-10-12'), at(10, 19, 15));
  assert.deepEqual(single.previous, { start: at(10, 11), end: at(10, 12) });
});

test('a custom range that includes today is cut the same way as a preset', () => {
  const win = previousWindow(customRange('2026-10-17', '2026-10-19'), at(10, 19, 15, 59));
  assert.deepEqual(win.current, { start: at(10, 17), end: at(10, 19, 15) });
  assert.deepEqual(win.previous, { start: at(10, 14), end: at(10, 16, 15) });
});

test('windows keep the wall-clock hour across a spring-forward day', () => {
  const win = previousWindow(presetRange('today', at(3, 9)), at(3, 9, 15, 30));
  assert.deepEqual(win.previous, { start: at(3, 8), end: at(3, 8, 15) });
  assert.equal((win.previous.end - win.previous.start) / MIN, 14 * 60, 'the day lost an hour, so the same wall-clock hour is 14 elapsed hours in');
  const week = previousWindow(presetRange('7d', at(3, 12)), at(3, 12, 10));
  assert.deepEqual(week.period, { start: at(2, 27), end: at(3, 6) });
  assert.equal(week.previous.end, at(3, 5, 10));
  const across = previousWindow(presetRange('7d', at(3, 15)), at(3, 15, 10));
  assert.deepEqual(across.period, { start: at(3, 2), end: at(3, 9) });
  assert.equal(across.previous.end, at(3, 8, 10));
  assert.equal(new Date(across.previous.end).getHours(), 10);
});

test('windows keep the wall-clock hour across a fall-back day', () => {
  const win = previousWindow(presetRange('today', at(11, 2)), at(11, 2, 5, 40));
  assert.deepEqual(win.previous, { start: at(11, 1), end: at(11, 1, 5) });
  assert.equal((win.previous.end - win.previous.start) / MIN, 6 * 60, 'the day gained an hour');
  const week = previousWindow(presetRange('7d', at(11, 4)), at(11, 4, 20));
  assert.deepEqual(week.period, { start: at(10, 22), end: at(10, 29) });
  assert.equal(week.previous.end, at(10, 28, 20));
  assert.equal(week.days, 7);
  const spans = previousWindow(presetRange('7d', at(11, 1)), at(11, 1, 12));
  assert.equal(dateKey(spans.period.start), '2026-10-19');
});

test('a spring-forward gap hour lands on the first real hour after it', () => {
  const gap = previousWindow(presetRange('7d', at(3, 15)), at(3, 15, 2, 30));
  assert.equal(new Date(gap.current.end).getHours(), 2);
  assert.equal(new Date(gap.previous.end).getHours(), 3);
  assert.equal(dateKey(gap.previous.end), '2026-03-08');
});

test('a range that has fully ended is not cut', () => {
  const win = previousWindow({ preset: 'custom', start: at(10, 1), end: at(10, 8) }, at(10, 19, 15));
  assert.equal(win.truncated, false);
  assert.deepEqual(win.current, { start: at(10, 1), end: at(10, 8) });
  assert.deepEqual(win.previous, { start: at(9, 24), end: at(10, 1) });
});

test('the first hour of today has no completed hour to compare yet', () => {
  const win = previousWindow(presetRange('today', at(10, 19)), at(10, 19, 0, 30));
  assert.equal(win.empty, true);
  assert.deepEqual(compareBlocks(win, { since: at(9, 1), now: at(10, 19, 0, 30) }), { ms: 'notStarted', visits: 'notStarted', sites: 'notStarted' });
  const week = previousWindow(presetRange('7d', at(10, 19)), at(10, 19, 0, 30));
  assert.equal(week.empty, false, 'a 7-day window still has six whole days');
  assert.deepEqual(week.current, { start: at(10, 13), end: at(10, 19) });
  assert.deepEqual(week.previous, { start: at(10, 6), end: at(10, 12) });
});

test('a range that has not started yet is empty', () => {
  const win = previousWindow(customRange('2026-10-25', '2026-10-26'), at(10, 19, 9));
  assert.equal(win.empty, true);
});

test('a previous period that starts before the first recorded day cannot be compared', () => {
  const now = at(10, 19, 15);
  const win = previousWindow(presetRange('7d', at(10, 19)), now);
  const blocked = { ms: 'since', visits: 'since', sites: 'since' };
  assert.deepEqual(compareBlocks(win, { since: at(10, 7, 9), now }), blocked);
  assert.deepEqual(compareBlocks(win, { since: at(10, 8), now }), blocked);
  assert.deepEqual(compareBlocks(win, { since: at(10, 6, 23), now }), NONE, 'the first recorded day is the previous start itself');
  assert.deepEqual(compareBlocks(win, { since: at(10, 6), now }), NONE);
  const today = previousWindow(presetRange('today', at(10, 19)), now);
  assert.deepEqual(compareBlocks(today, { since: at(10, 19, 8), now }), blocked, 'installed today: no yesterday');
  assert.deepEqual(compareBlocks(today, { since: at(10, 18, 14), now }), NONE);
});

test('visit counts inside a cut day need visit rows within the retention window', () => {
  const now = at(11, 20, 15);
  const reasons = { ms: null, visits: 'retention', sites: 'retention' };
  const long = previousWindow(customRange('2026-10-01', '2026-11-20'), now);
  assert.deepEqual(compareBlocks(long, { since: at(1, 1), now }), reasons);
  const month = previousWindow(presetRange('30d', at(11, 20)), now);
  assert.equal(month.previous.end, at(10, 21, 15));
  assert.equal(at(10, 21), detailCutoff(now), 'the cut day is the oldest day whose visit rows survive pruning');
  assert.deepEqual(compareBlocks(month, { since: at(1, 1), now }), NONE);
  const edge = previousWindow(customRange('2026-10-02', '2026-11-20'), now);
  assert.deepEqual(compareBlocks(edge, { since: at(1, 1), now }), reasons);
  const past = previousWindow(customRange('2026-08-01', '2026-08-31'), now);
  assert.deepEqual(compareBlocks(past, { since: at(1, 1), now }), NONE, 'whole past days come from day rows, which are kept');
  const gone = previousWindow(customRange('2026-10-01', '2026-11-20'), now);
  assert.deepEqual(compareBlocks(gone, { since: at(10, 10), now }).ms, 'since', 'the recording start wins over retention');
});

test('compareSummary gives the absolute and percent change, or only the absolute change from zero', () => {
  const summary = compareSummary({ ms: 115, visits: 4, sites: 3 }, { ms: 100, visits: 0, sites: 4 }, NONE);
  assert.deepEqual(summary.ms, { diff: 15, percent: 15 });
  assert.deepEqual(summary.visits, { diff: 4, percent: null });
  assert.deepEqual(summary.sites, { diff: -1, percent: -25 });
  assert.deepEqual(compareSummary({ ms: 0, visits: 0, sites: 0 }, { ms: 0, visits: 0, sites: 0 }, NONE).ms, { diff: 0, percent: null });
  const partial = compareSummary({ ms: 5, visits: 1, sites: 1 }, { ms: 5, visits: 1, sites: 1 }, { ms: null, visits: 'retention', sites: 'retention' });
  assert.deepEqual(partial.ms, { diff: 0, percent: 0 });
  assert.deepEqual(partial.visits, { reason: 'retention' });
  assert.deepEqual(compareSummary(null, null, { ms: 'since', visits: 'since', sites: 'since' }).sites, { reason: 'since' });
});

const domains = [{ id: 1, host: 'www.a.test' }, { id: 2, host: 'a.test' }, { id: 3, host: 'b.test' }];
const stored = {
  domains,
  days: [
    { date: '2026-10-18', domainId: 1, ms: 99 * MIN, visits: 9 },
    { date: '2026-10-12', domainId: 1, ms: 10 * MIN, visits: 2 },
    { date: '2026-10-12', domainId: 2, ms: 5 * MIN, visits: 1 },
    { date: '2026-10-12', domainId: 3, ms: 20 * MIN, visits: 3 },
    { date: '2026-10-13', domainId: 3, ms: 7 * MIN, visits: 0 },
  ],
  hours: [
    { date: '2026-10-19', hour: 9, domainId: 1, ms: 10 * MIN },
    { date: '2026-10-19', hour: 15, domainId: 1, ms: 30 * MIN },
    { date: '2026-10-18', hour: 10, domainId: 2, ms: 20 * MIN },
    { date: '2026-10-18', hour: 14, domainId: 3, ms: 5 * MIN },
    { date: '2026-10-18', hour: 16, domainId: 3, ms: 8 * MIN },
  ],
  visits: [
    { domainId: 1, at: at(10, 19, 9, 10) },
    { domainId: 1, at: at(10, 19, 15, 10) },
    { domainId: 2, at: at(10, 18, 10) },
    { domainId: 3, at: at(10, 18, 14) },
    { domainId: 3, at: at(10, 18, 15) },
    { domainId: 3, at: at(10, 18, 16) },
  ],
};
const now = at(10, 19, 15, 20);
const today = previousWindow(presetRange('today', at(10, 19)), now);

test('a cut window reads whole days from day rows and the cut day from hour buckets and visit rows', () => {
  assert.deepEqual(windowTotals(stored, today.current), { ms: 10 * MIN, visits: 1, sites: 1 });
  assert.deepEqual(windowTotals(stored, today.previous), { ms: 25 * MIN, visits: 2, sites: 2 });
  const week = previousWindow(presetRange('7d', at(10, 19)), now);
  const last = windowTotals(stored, { start: at(10, 6), end: at(10, 13) });
  assert.deepEqual(last, { ms: 35 * MIN, visits: 6, sites: 2 }, 'a.test and www.a.test are one site under prefix grouping');
  assert.deepEqual(week.previous.start, at(10, 6));
});

test('open cursor time counts toward the cut window it overlaps, and only up to the cut', () => {
  const segment = { domain: 'a.test', start: at(10, 19, 14, 59, 30), end: at(10, 19, 15, 0, 30) };
  assert.equal(windowTotals({ ...stored, segment }, today.current).ms, 10 * MIN + 30_000);
  assert.equal(windowTotals({ ...stored, segment }, today.previous).ms, 25 * MIN);
});

test('a site filter narrows both windows, by merged site', () => {
  assert.deepEqual(windowTotals(stored, today.previous, { site: 'a.test' }), { ms: 20 * MIN, visits: 1, sites: 1 });
  assert.deepEqual(windowTotals(stored, today.previous, { site: 'b.test' }), { ms: 5 * MIN, visits: 1, sites: 1 });
  assert.deepEqual(windowTotals(stored, today.current, { site: 'b.test' }), { ms: 0, visits: 0, sites: 0 });
  assert.deepEqual(windowTotals(stored, today.previous, { site: 'www.a.test' }), { ms: 0, visits: 0, sites: 0 });
  const summary = compareSummary(windowTotals(stored, today.current, { site: 'b.test' }), windowTotals(stored, today.previous, { site: 'b.test' }), NONE);
  assert.deepEqual(summary.ms, { diff: -5 * MIN, percent: -100 });
});

test('a spring-forward cut counts the hours that exist before it', () => {
  const rows = {
    domains: [{ id: 1, host: 'a.test' }],
    days: [],
    hours: [0, 1, 3, 4].map(hour => ({ date: '2026-03-08', hour, domainId: 1, ms: MIN })),
    visits: [],
  };
  const win = previousWindow(presetRange('7d', at(3, 15)), at(3, 15, 2, 30));
  assert.equal(new Date(win.previous.end).getHours(), 3);
  assert.equal(windowTotals(rows, win.previous).ms, 2 * MIN);
  const exact = previousWindow(presetRange('7d', at(3, 15)), at(3, 15, 3, 10));
  assert.equal(windowTotals(rows, exact.previous).ms, 2 * MIN);
  const later = previousWindow(presetRange('7d', at(3, 15)), at(3, 15, 4, 10));
  assert.equal(windowTotals(rows, later.previous).ms, 3 * MIN);
});

test('the snapshot comparison matches the stored-row comparison', () => {
  const data = {
    enabled: true,
    since: at(10, 1),
    visits: [
      { domain: 'a.test', at: at(10, 19, 9, 10) }, { domain: 'a.test', at: at(10, 19, 15, 10) },
      { domain: 'a.test', at: at(10, 18, 10) }, { domain: 'b.test', at: at(10, 18, 14) }, { domain: 'b.test', at: at(10, 18, 16) },
    ],
    spans: [
      { domain: 'a.test', start: at(10, 19, 9), end: at(10, 19, 9, 10) },
      { domain: 'a.test', start: at(10, 19, 15), end: at(10, 19, 15, 20) },
      { domain: 'a.test', start: at(10, 18, 10), end: at(10, 18, 10, 20) },
      { domain: 'b.test', start: at(10, 18, 14), end: at(10, 18, 14, 5) },
      { domain: 'b.test', start: at(10, 18, 16), end: at(10, 18, 16, 8) },
    ],
  };
  const range = { ...presetRange('today', at(10, 19)), focus: '' };
  const { window, summary } = compareFromSnapshot(data, range, now);
  assert.deepEqual(window, today);
  assert.deepEqual(summary.ms, { diff: -15 * MIN, percent: -60 });
  assert.deepEqual(summary.visits, { diff: -1, percent: -50 });
  assert.deepEqual(summary.sites, { diff: -1, percent: -50 });
  const filtered = compareFromSnapshot(data, { ...range, focus: 'b.test' }, now).summary;
  assert.deepEqual(filtered.ms, { diff: -5 * MIN, percent: -100 });
  assert.deepEqual(windowTotalsFromSnapshot(data, today.previous, { site: 'b.test' }), { ms: 5 * MIN, visits: 1, sites: 1 });
  const fresh = compareFromSnapshot({ ...data, since: at(10, 19, 8) }, range, now);
  assert.deepEqual(fresh.summary.ms, { reason: 'since' });
});

const ledger = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const tick = async (db, args) => commitTick(db, { expect: await readHead(db), cursor: null, span: null, visit: null, ...args });

test('hour buckets hold time only, so a cut day needs the visit rows', async () => {
  const db = ledger();
  await tick(db, { now: at(10, 18, 10), visit: { domain: 'a.test', at: at(10, 18, 10) } });
  await tick(db, { now: at(10, 18, 10, 5), span: { domain: 'a.test', start: at(10, 18, 10), end: at(10, 18, 10, 5) } });
  const [hour] = await db.hours.toArray();
  assert.deepEqual(Object.keys(hour).sort(), ['date', 'domainId', 'hour', 'ms']);
  assert.equal((await db.days.toArray())[0].visits, 1);
  assert.equal(await db.visits.count(), 1);
});

async function seeded(since = at(10, 1, 8)) {
  const db = ledger();
  await tick(db, { now: since });
  const visit = (domain, when) => tick(db, { now: when, visit: { domain, at: when } });
  const span = (domain, start, minutes) => tick(db, { now: start + minutes * MIN, span: { domain, start, end: start + minutes * MIN } });
  await visit('a.test', at(10, 18, 10)); await span('a.test', at(10, 18, 10), 20);
  await visit('b.test', at(10, 18, 14)); await span('b.test', at(10, 18, 14), 5);
  await visit('b.test', at(10, 18, 16)); await span('b.test', at(10, 18, 16), 8);
  await visit('a.test', at(10, 19, 9, 10)); await span('a.test', at(10, 19, 9), 10);
  await visit('a.test', at(10, 19, 15, 10)); await span('a.test', at(10, 19, 15), 20);
  return db;
}

async function compareStored(db, range, when, extra = {}) {
  const head = await readHead(db);
  const domains = await readDomains(db);
  const days = await db.days.toArray();
  return readComparison(db, { range: { ...range, focus: '', ...extra }, now: when, since: head.state.since, domains, days, segment: null });
}

test('readComparison reads the same figures from a real ledger', async () => {
  const db = await seeded();
  const range = presetRange('today', at(10, 19));
  const { window, summary } = await compareStored(db, range, now);
  assert.equal(window.cutoff, at(10, 19, 15));
  assert.deepEqual(summary.ms, { diff: -15 * MIN, percent: -60 });
  assert.deepEqual(summary.visits, { diff: -1, percent: -50 });
  assert.deepEqual(summary.sites, { diff: -1, percent: -50 });
  const filtered = await compareStored(db, range, now, { focus: 'b.test' });
  assert.deepEqual(filtered.summary.ms, { diff: -5 * MIN, percent: -100 });
  assert.deepEqual(filtered.summary.visits, { diff: -1, percent: -100 });
});

test('readComparison compares whole past ranges from day rows and shows nothing across the recording start', async () => {
  const db = await seeded();
  const past = await compareStored(db, customRange('2026-10-19', '2026-10-19'), at(10, 25, 12));
  assert.equal(past.window.truncated, false);
  assert.deepEqual(past.summary.ms, { diff: 30 * MIN - 33 * MIN, percent: (30 - 33) * 100 / 33 });
  const week = await compareStored(db, presetRange('7d', at(10, 19)), now);
  assert.deepEqual(week.summary.ms, { diff: 43 * MIN, percent: null }, 'the previous week has no records, so only the absolute change');
  const early = await compareStored(db, presetRange('30d', at(10, 19)), now);
  assert.deepEqual(early.summary.ms, { reason: 'since' });
  assert.deepEqual(early.summary.visits, { reason: 'since' });
});

test('readComparison drops visits and sites for a cut day whose visit rows were pruned, and keeps time', async () => {
  const db = await seeded(at(8, 1));
  const later = at(11, 30, 15, 20);
  await tick(db, { now: at(11, 30, 9), visit: { domain: 'a.test', at: at(11, 30, 9) } });
  await tick(db, { now: at(11, 30, 9, 30), span: { domain: 'a.test', start: at(11, 30, 9), end: at(11, 30, 9, 30) } });
  await pruneDetail(db, detailCutoff(later));
  const range = customRange('2026-10-19', '2026-11-30');
  const { summary } = await compareStored(db, range, later);
  assert.equal(typeof summary.ms.diff, 'number');
  assert.deepEqual(summary.visits, { reason: 'retention' });
  assert.deepEqual(summary.sites, { reason: 'retention' });
});
