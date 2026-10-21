process.env.TZ = 'UTC';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const { dateKey, midnight } = await import('../src/model.mjs');
const { applyCustomRange, customRange, customRangeSince, earliestRecordedDay, presetRange, shiftRange } = await import('../src/range.mjs');
const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
const { openLedger, readEarliestRecordedRows, readHead } = await import('../src/ledger.mjs');

const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test('a custom range before since is rejected and does not call onChange', () => {
  const since = at(15, 15, 30);
  const calls = [];
  const onChange = (range) => calls.push(range);
  assert.equal(applyCustomRange('2026-10-01', '2026-10-20', since, onChange), false);
  assert.equal(applyCustomRange('2026-10-01', '2026-10-15', since, onChange), false);
  assert.equal(applyCustomRange('2026-10-14', '2026-10-14', since, onChange), false);
  assert.equal(customRange('2026-10-01', '2026-10-20', since), null);
  assert.deepEqual(calls, []);
});

test('the local day of since can be applied and is not clamped', () => {
  const since = at(15, 23, 59);
  const calls = [];
  assert.equal(applyCustomRange('2026-10-15', '2026-10-21', since, (range) => calls.push(range)), true);
  assert.deepEqual(calls, [{ preset: 'custom', start: at(15), end: at(22) }]);
  assert.equal(dateKey(calls[0].start), '2026-10-15');
  assert.equal(midnight(since), calls[0].start);
  const single = customRange('2026-10-16', '2026-10-16', since);
  assert.equal(single.start, at(16));
  assert.notEqual(single.start, midnight(since));
});

test('an end day before the start day is still rejected', () => {
  const since = at(1);
  const calls = [];
  assert.equal(customRange('2026-10-19', '2026-10-18', since), null);
  assert.equal(applyCustomRange('2026-10-19', '2026-10-18', since, () => calls.push('called')), false);
  assert.equal(customRange('2026-02-31', '2026-10-18', since), null);
  assert.deepEqual(calls, []);
});

test('presets stay unbounded and omitting since still builds the closed interval', () => {
  const today = at(21, 12);
  const since = at(15, 15);
  const month = presetRange('30d', today);
  assert.equal(month.preset, '30d');
  assert.ok(month.start < midnight(since));
  const early = customRange('2026-10-01', '2026-10-02');
  assert.equal(early.start, at(1));
  assert.equal(early.end, at(3));
  assert.equal(customRange('2026-10-01', '2026-10-02', since), null);
});

test('a non-finite since is rejected and timestamp 0 is a real lower bound', () => {
  const calls = [];
  const onChange = () => calls.push('called');
  assert.equal(applyCustomRange('2026-10-21', '2026-10-21', Number.NaN, onChange), false);
  assert.equal(customRange('2026-10-21', '2026-10-21', Number.POSITIVE_INFINITY), null);
  assert.equal(customRange('1970-01-01', '1970-01-02', 0).start, Date.parse('1970-01-01T00:00:00Z'));
  assert.equal(customRange('1969-12-31', '1970-01-02', 0), null);
  const later = at(22, 1);
  assert.equal(customRange('2026-10-21', '2026-10-21', later), null);
  assert.equal(customRange('2026-10-22', '2026-10-22', later).start, at(22));
  assert.deepEqual(calls, []);
});

test('a null since uses the earliest recorded local day and an empty ledger stays today', () => {
  const now = at(21, 12);
  const rows = {
    domains: [{ id: 1, host: 'a.test' }],
    days: [{ date: '2026-10-18', domainId: 1, ms: 0, visits: 0 }, { date: '2026-10-03', domainId: 1, ms: 1_000, visits: 1 }],
    hours: [{ date: '2026-10-09', hour: 4, domainId: 1, ms: 5 }],
    visits: [{ at: at(11, 23, 30) }],
    spans: [{ start: at(5, 8), end: at(5, 9) }],
  };
  const since = customRangeSince(null, rows, now);
  assert.equal(since, at(3));
  assert.equal(earliestRecordedDay({ domains: rows.domains }), null);
  const calls = [];
  assert.equal(applyCustomRange('2026-10-03', '2026-10-21', since, (range) => calls.push(range)), true);
  assert.equal(applyCustomRange('2026-10-02', '2026-10-21', since, (range) => calls.push(range)), false);
  assert.equal(customRange('2026-10-02', '2026-10-03', since), null);
  assert.equal(calls.length, 1);
  assert.equal(dateKey(calls[0].start), '2026-10-03');
  assert.equal(customRangeSince(undefined, rows, now), at(3));
  assert.equal(customRangeSince(Number.NaN, rows, now), at(3));
  assert.equal(customRangeSince(at(15, 9), rows, now), at(15, 9));
  assert.equal(customRangeSince(0, rows, now), 0);
  const today = customRangeSince(null, { domains: rows.domains }, now);
  assert.equal(today, midnight(now));
  assert.equal(applyCustomRange('2026-10-21', '2026-10-21', today, () => {}), true);
  assert.equal(applyCustomRange('2026-10-20', '2026-10-21', today, () => {}), false);
  assert.equal(dateKey(shiftRange(presetRange('today', now), -1, now, since).start), '2026-10-20');
  assert.equal(shiftRange(customRange('2026-10-03', '2026-10-03', since), -1, now, since), null);
});

test('an hour, visit, or span can be earlier than the day rows', () => {
  const now = at(21, 12);
  const hour = customRangeSince(null, { days: [{ date: '2026-10-10' }], hours: [{ date: '2026-10-01', hour: 23 }] }, now);
  assert.equal(hour, at(1));
  const visit = customRangeSince(null, { visits: [{ at: at(2, 0, 1) }] }, now);
  assert.equal(visit, at(2));
  const span = customRangeSince(null, { spans: [{ start: at(4, 23, 59), end: at(5) }] }, now);
  assert.equal(span, at(4));
  assert.equal(earliestRecordedDay({ days: [{ date: '2026-02-31' }], visits: [{ at: at(6) }] }), at(6));
  assert.equal(customRangeSince(null, null, now), midnight(now));
});

test('a restored ledger with since null applies custom on the earliest stored day and rejects the day before', async () => {
  const db = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  const now = at(21, 15);
  await db.table('meta').put({ key: 'state', value: { enabled: true, since: null } });
  await db.table('domains').put({ id: 1, host: 'a.test' });
  await db.table('days').bulkPut([
    { date: '2026-10-18', domainId: 1, ms: 10, visits: 1 },
    { date: '2026-10-03', domainId: 2, ms: 0, visits: 0 },
  ]);
  await db.table('domains').put({ id: 2, host: 'b.test' });
  await db.table('hours').put({ date: '2026-10-01', hour: 22, domainId: 1, ms: 5 });
  await db.table('visits').put({ id: 1, domainId: 1, at: at(11, 8) });
  await db.table('spans').put({ id: 1, domainId: 1, start: at(5, 9), end: at(5, 10) });
  assert.equal((await readHead(db)).state.since, null);
  const stored = await readEarliestRecordedRows(db);
  assert.equal(stored.days[0].date, '2026-10-03');
  assert.equal(stored.hours[0].date, '2026-10-01');
  assert.equal(stored.visits[0].at, at(11, 8));
  assert.equal(stored.spans[0].start, at(5, 9));
  const recordingSince = (await readHead(db)).state.since;
  const since = customRangeSince(recordingSince, Number.isFinite(recordingSince) ? undefined : stored, now);
  assert.equal(since, at(1));
  const calls = [];
  assert.equal(applyCustomRange('2026-10-01', '2026-10-01', since, (range) => calls.push(range)), true);
  assert.equal(dateKey(calls[0].start), '2026-10-01');
  assert.equal(applyCustomRange('2026-09-30', '2026-10-01', since, () => calls.push('early')), false);
  assert.deepEqual(calls, [{ preset: 'custom', start: at(1), end: at(2) }]);

  const empty = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  await empty.table('meta').put({ key: 'state', value: { enabled: true, since: null } });
  await empty.table('domains').put({ id: 1, host: 'only.test' });
  const emptySince = customRangeSince(null, await readEarliestRecordedRows(empty), now);
  assert.equal(emptySince, midnight(now));
  assert.equal(applyCustomRange(dateKey(now), dateKey(now), emptySince, () => {}), true);
  assert.equal(applyCustomRange('2026-10-20', dateKey(now), emptySince, () => {}), false);

  const started = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  await started.table('meta').put({ key: 'state', value: { enabled: true, since: at(15, 11) } });
  await started.table('days').put({ date: '2026-10-01', domainId: 1, ms: 5, visits: 1 });
  const finite = (await readHead(started)).state.since;
  const kept = customRangeSince(finite, Number.isFinite(finite) ? undefined : await readEarliestRecordedRows(started), now);
  assert.equal(kept, at(15, 11));
  assert.equal(customRange('2026-10-01', '2026-10-21', kept), null);
  assert.equal(customRange('2026-10-15', '2026-10-21', kept).start, at(15));
});

test('RangeControl receives the derived bound and limits both custom date inputs to the since day and today', () => {
  const source = readFileSync(new URL('../src/RangeControl.jsx', import.meta.url), 'utf8');
  assert.equal(source.match(/min=\{dateKey\(since\)\}/g).length, 2);
  assert.equal(source.match(/max=\{dateKey\(today\)\}/g).length, 2);
  const apply = source.match(/function applyCustom\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(apply, /applyCustomRange\(draftStart, draftEnd, since, onChange\)/);
  assert.match(apply, /if \(!applyCustomRange\(draftStart, draftEnd, since, onChange\)\) return;/);
  assert.ok(apply.indexOf('onChange') < apply.indexOf('setDrafting(false)'));
  assert.equal(apply.match(/onChange/g).length, 1);
  assert.match(source, /disabled=\{!draftRange\}/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/use-ledger.js', import.meta.url), 'utf8');
  assert.match(app, /const rangeSince = ledger\.rangeSince \?\? now;/);
  assert.match(app, /<RangeControl range=\{active\} today=\{today\} since=\{rangeSince\} onChange=\{setRange\} \/>/);
  assert.doesNotMatch(app, /since=\{view\?\.since \?\? now\}/);
  assert.match(hook, /const recordingSince = head\.state\?\.since;/);
  assert.match(hook, /customRangeSince\(\s*recordingSince,\s*Number\.isFinite\(recordingSince\) \? undefined : await readEarliestRecordedRows\(db\),\s*now,\s*\)/);
  assert.match(hook, /rangeSince: data \? customRangeSince\(data\.since, data, now\) : undefined/);
});
