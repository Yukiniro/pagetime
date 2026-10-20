import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  CSV_COLUMNS, EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, EXPORT_TABLES, csvField, dailyCsvParts, exportFileName,
  ledgerJsonParts, previewSnapshot, toDailyCsv, toLedgerJson,
} from '../src/export.mjs';
import { commitTick, daysBetween, deleteDay, deleteSite, openLedger, readDomains, readHead, readLedgerSnapshot } from '../src/ledger.mjs';
import { viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';
import { addDays, dateKey, HOUR } from '../src/model.mjs';
import { DEFAULT_SETTINGS } from '../src/settings.mjs';

const fresh = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const at = (month, day, hour = 0, minute = 0, second = 0) => new Date(2026, month - 1, day, hour, minute, second).getTime();
const tick = async (db, { now, span = null, visit = null, cursor = null }) =>
  commitTick(db, { expect: await readHead(db), now, span, visit, cursor });
const meta = { exportedAt: at(10, 20, 8), timeZone: 'Asia/Shanghai', appVersion: '1.2.3', settings: { ...DEFAULT_SETTINGS, ignored: ['skip.test'], recordMode: 'blacklist', siteMerge: 'registrable' } };

// Parses RFC 4180 text: quoted fields may hold commas, doubled quotes, and line breaks.
function parseCsv(text) {
  assert.equal(text[0], '\uFEFF');
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 1; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { rows.at(-1).push(field); field = ''; }
    else if (char === '\r' && text[i + 1] === '\n') { rows.at(-1).push(field); field = ''; rows.push([]); i++; }
    else field += char;
  }
  assert.deepEqual(rows.pop(), [], 'the file ends with CRLF');
  return rows;
}

const csvRecords = text => {
  const [header, ...rows] = parseCsv(text);
  assert.deepEqual(header, CSV_COLUMNS);
  return rows.map(([date, host, ms, visits]) => ({ date, host, ms: Number(ms), visits: Number(visits) }));
};

// Several sites over a week, with spans that cross hours and midnight, plus visits without time.
async function seedWeek(db) {
  const sites = ['www.a.test', 'a.test', 'b.test', 'gist.c.test'];
  let now = at(10, 12, 22, 40);
  for (let i = 0; i < 160; i++) {
    const end = now + 25_000 + (i % 5) * 20_000;
    const domain = sites[i % sites.length];
    await tick(db, { now: end, span: i % 6 === 5 ? null : { domain, start: now, end }, visit: i % 4 === 0 ? { domain: sites[(i + 1) % sites.length], at: now } : null });
    now = end + (i % 9 === 0 ? 3 * HOUR : 0);
  }
  return now;
}

test('JSON carries the format header, recording state, settings, and all five tables', async () => {
  const db = fresh();
  await seedWeek(db);
  const document = JSON.parse(toLedgerJson(await readLedgerSnapshot(db), meta));
  assert.deepEqual(Object.keys(document), ['format', 'schemaVersion', 'exportedAt', 'timeZone', 'appVersion', 'recording', 'settings', 'tables']);
  assert.equal(document.format, EXPORT_FORMAT);
  assert.equal(document.format, 'pagetime-ledger');
  assert.equal(document.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(document.exportedAt, new Date(meta.exportedAt).toISOString());
  assert.equal(document.timeZone, 'Asia/Shanghai');
  assert.equal(document.appVersion, '1.2.3');
  assert.deepEqual(document.recording, (await readHead(db)).state);
  assert.deepEqual(document.settings, meta.settings);
  assert.deepEqual(Object.keys(document.tables), EXPORT_TABLES);
  for (const name of EXPORT_TABLES) assert.equal(document.tables[name].length, await db.table(name).count(), name);
  assert.deepEqual(Object.keys(document.tables.days[0]), ['date', 'domainId', 'ms', 'visits']);
  assert.deepEqual(Object.keys(document.tables.hours[0]), ['date', 'hour', 'domainId', 'ms']);
  assert.deepEqual(Object.keys(document.tables.spans[0]), ['id', 'domainId', 'start', 'end']);
  assert.deepEqual(Object.keys(document.tables.visits[0]), ['id', 'domainId', 'at']);
  assert.deepEqual(Object.keys(document.tables.domains[0]), ['id', 'host']);
});

test('JSON rows are sorted by primary key whatever order they arrive in, and stray fields are dropped', () => {
  const snapshot = {
    domains: [{ id: 2, host: 'b.test' }, { id: 1, host: 'a.test', extra: 'x' }],
    days: [{ date: '2026-10-02', domainId: 1, ms: 5, visits: 0 }, { date: '2026-10-01', domainId: 2, ms: 3, visits: 1 }, { date: '2026-10-01', domainId: 1, ms: 4, visits: 0 }],
    hours: [{ date: '2026-10-01', hour: 9, domainId: 1, ms: 4 }, { date: '2026-10-01', hour: 8, domainId: 2, ms: 3 }, { date: '2026-10-02', hour: 0, domainId: 1, ms: 5 }],
    spans: [{ id: 3, domainId: 1, start: 9, end: 10 }, { id: 1, domainId: 2, start: 1, end: 2 }],
    visits: [{ domainId: 2, at: 5, id: 2 }, { domainId: 1, at: 1, id: 1 }],
  };
  const { tables, recording } = JSON.parse(toLedgerJson(snapshot, meta));
  assert.deepEqual(recording, { enabled: true, since: null });
  assert.deepEqual(tables.domains, [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }]);
  assert.deepEqual(tables.days.map(d => [d.date, d.domainId]), [['2026-10-01', 1], ['2026-10-01', 2], ['2026-10-02', 1]]);
  assert.deepEqual(tables.hours.map(h => [h.date, h.hour, h.domainId]), [['2026-10-01', 8, 2], ['2026-10-01', 9, 1], ['2026-10-02', 0, 1]]);
  assert.deepEqual(tables.spans.map(s => s.id), [1, 3]);
  assert.deepEqual(tables.visits, [{ id: 1, domainId: 1, at: 1 }, { id: 2, domainId: 2, at: 5 }]);
  const empty = JSON.parse(toLedgerJson({ domains: [], days: [], hours: [], spans: [], visits: [] }, meta));
  for (const name of EXPORT_TABLES) assert.deepEqual(empty.tables[name], []);
});

test('two exports of the same ledger differ only in exportedAt', async () => {
  const db = fresh();
  await seedWeek(db);
  const first = toLedgerJson(await readLedgerSnapshot(db, 7), meta);
  const second = toLedgerJson(await readLedgerSnapshot(db), { ...meta, exportedAt: meta.exportedAt + 60_000 });
  assert.notEqual(first, second);
  const without = text => text.replace(/"exportedAt": "[^"]+"/, '');
  assert.equal(without(first), without(second));
  assert.equal(first.split('\n').filter(line => line.includes('exportedAt')).length, 1);
});

test('the snapshot pages each table by primary key without losing or repeating a row', async () => {
  const db = fresh();
  await seedWeek(db);
  const whole = await readLedgerSnapshot(db, 100_000);
  for (const batch of [1, 2, 3, 50]) assert.deepEqual(await readLedgerSnapshot(db, batch), whole, `batch ${batch}`);
  assert.deepEqual(whole.days, await db.table('days').toArray());
  assert.deepEqual(whole.hours, await db.table('hours').toArray());
  assert.equal(whole.cursor, undefined);
});

test('CSV has a BOM, a header, CRLF lines, raw hostnames, local dates, and RFC 4180 escaping', () => {
  assert.equal(csvField('plain.test'), 'plain.test');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('cr\rhere'), '"cr\rhere"');
  assert.equal(csvField(0), '0');
  const snapshot = {
    domains: [{ id: 1, host: 'www.example.com' }, { id: 2, host: 'odd,"host"' }, { id: 3, host: '例子.测试' }, { id: 4, host: 'gone.test' }],
    days: [
      { date: '2026-10-02', domainId: 1, ms: 1_000, visits: 2 },
      { date: '2026-10-01', domainId: 3, ms: 500, visits: 0 },
      { date: '2026-10-01', domainId: 2, ms: 250, visits: 1 },
      { date: '2026-10-01', domainId: 9, ms: 1, visits: 1 },
    ],
  };
  const text = toDailyCsv(snapshot);
  assert.ok(text.startsWith('\uFEFFdate,host,active_ms,visits\r\n'));
  assert.equal(Buffer.from(text, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
  assert.equal(text, '\uFEFFdate,host,active_ms,visits\r\n2026-10-01,"odd,""host""",250,1\r\n2026-10-01,例子.测试,500,0\r\n2026-10-02,www.example.com,1000,2\r\n');
  assert.deepEqual(csvRecords(text).map(row => row.host), ['odd,"host"', '例子.测试', 'www.example.com']);
  assert.equal(toDailyCsv({ domains: [], days: [] }), '\uFEFFdate,host,active_ms,visits\r\n');
});

test('CSV active_ms over a range equals the overview KPI without grouping or a filter; visits match too', async () => {
  const db = fresh();
  const last = await seedWeek(db);
  const records = csvRecords(toDailyCsv(await readLedgerSnapshot(db)));
  const head = await readHead(db);
  const domains = await readDomains(db);
  const today = addDays(last, 0);
  const firstDay = at(10, 12);
  assert.ok(new Set(records.map(row => row.date)).size >= 3);
  for (let from = firstDay; from <= today; from = addDays(from, 1)) {
    for (const length of [1, 2, 7]) {
      const start = from, end = addDays(from, length);
      const kpi = viewFromLedger({ state: head.state, domains, days: await daysBetween(db, dateKey(start), dateKey(addDays(end, -1))), spans: [], visits: [], cursor: null, lastEnd: head.lastEnd },
        { start, end, today, search: '', site: '', siteMerge: 'none', now: last }).stats;
      const inRange = records.filter(row => row.date >= dateKey(start) && row.date < dateKey(end));
      assert.equal(inRange.reduce((sum, row) => sum + row.ms, 0), kpi.ms, `${dateKey(start)} +${length}`);
      assert.equal(inRange.reduce((sum, row) => sum + row.visits, 0), kpi.visits, `${dateKey(start)} +${length} visits`);
    }
  }
});

test('JSON hour buckets of each day and host add up to that day row', async () => {
  const db = fresh();
  await seedWeek(db);
  const { tables } = JSON.parse(toLedgerJson(await readLedgerSnapshot(db), meta));
  const hourSums = new Map();
  for (const row of tables.hours) hourSums.set(`${row.date}|${row.domainId}`, (hourSums.get(`${row.date}|${row.domainId}`) ?? 0) + row.ms);
  assert.ok(tables.days.length > 10);
  for (const day of tables.days) assert.equal(hourSums.get(`${day.date}|${day.domainId}`) ?? 0, day.ms, `${day.date} ${day.domainId}`);
  assert.equal(tables.spans.reduce((sum, span) => sum + span.end - span.start, 0), tables.days.reduce((sum, day) => sum + day.ms, 0));
  assert.equal(tables.visits.length, tables.days.reduce((sum, day) => sum + day.visits, 0));
});

test('a write that starts during the export lands wholly after the snapshot', async () => {
  const db = fresh();
  const last = await seedWeek(db);
  const before = await readLedgerSnapshot(db);
  const head = await readHead(db);
  const reading = readLedgerSnapshot(db, 1);
  const writing = commitTick(db, { expect: head, now: last + 60_000, span: { domain: 'late.test', start: last, end: last + 60_000 }, visit: { domain: 'late.test', at: last } });
  const [during] = await Promise.all([reading, writing]);
  assert.deepEqual(during, before);
  const after = await readLedgerSnapshot(db, 1);
  assert.ok(after.domains.some(row => row.host === 'late.test'));
  assert.equal(after.visits.length, before.visits.length + 1);
});

test('a snapshot that starts while a write is pending sees all of that write, never part of it', async () => {
  const db = fresh();
  const last = await seedWeek(db);
  const head = await readHead(db);
  const writing = commitTick(db, { expect: head, now: last + 60_000, span: { domain: 'late.test', start: last, end: last + 60_000 }, visit: { domain: 'late.test', at: last } });
  const reading = readLedgerSnapshot(db, 1);
  const [, during] = await Promise.all([writing, reading]);
  const id = during.domains.find(row => row.host === 'late.test')?.id;
  assert.ok(id, 'the domain row is in the snapshot');
  assert.equal(during.days.filter(row => row.domainId === id).reduce((sum, row) => sum + row.ms, 0), 60_000);
  assert.equal(during.hours.filter(row => row.domainId === id).reduce((sum, row) => sum + row.ms, 0), 60_000);
  assert.equal(during.visits.filter(row => row.domainId === id).length, 1);
  assert.equal(during.spans.filter(row => row.domainId === id).length, 1);
});

test('deleted sites and days do not appear in either export', async () => {
  const db = fresh();
  await seedWeek(db);
  const removedDay = '2026-10-13';
  const snapshotBefore = await readLedgerSnapshot(db);
  assert.ok(snapshotBefore.days.some(row => row.date === removedDay));
  assert.ok(snapshotBefore.domains.some(row => row.host === 'b.test'));
  await deleteSite(db, ['b.test'], at(10, 20));
  await deleteDay(db, removedDay, at(10, 20));
  const snapshot = await readLedgerSnapshot(db);
  const json = toLedgerJson(snapshot, meta);
  const csv = toDailyCsv(snapshot);
  assert.doesNotMatch(json, /"b\.test"/);
  assert.doesNotMatch(csv, /(^|,)b\.test,/m);
  assert.doesNotMatch(csv, new RegExp(`^${removedDay},`, 'm'));
  const { tables } = JSON.parse(json);
  const dayStart = at(10, 13), dayEnd = at(10, 14);
  assert.ok(tables.days.every(row => row.date !== removedDay));
  assert.ok(tables.hours.every(row => row.date !== removedDay));
  assert.ok(tables.spans.every(row => row.end <= dayStart || row.start >= dayEnd));
  assert.ok(tables.visits.every(row => row.at < dayStart || row.at >= dayEnd));
  assert.ok(tables.days.length > 0);
});

test('preview data becomes the same tables: spans split at midnight, totals match the preview KPI', () => {
  const start = at(10, 18, 23, 30);
  const data = {
    enabled: true,
    since: at(10, 1),
    spans: [{ domain: 'b.test', start: at(10, 19, 9), end: at(10, 19, 9, 10) }, { domain: 'a.test', start, end: start + HOUR }],
    visits: [{ domain: 'b.test', at: at(10, 19, 9) }, { domain: 'a.test', at: start }, { domain: 'c.test', at: at(10, 19, 12) }],
  };
  const snapshot = previewSnapshot(data);
  assert.deepEqual(snapshot.state, { enabled: true, since: at(10, 1) });
  assert.deepEqual(snapshot.domains, [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }, { id: 3, host: 'c.test' }]);
  assert.deepEqual(snapshot.spans, [
    { id: 1, domainId: 1, start, end: at(10, 19) },
    { id: 2, domainId: 1, start: at(10, 19), end: start + HOUR },
    { id: 3, domainId: 2, start: at(10, 19, 9), end: at(10, 19, 9, 10) },
  ]);
  assert.deepEqual(snapshot.visits.map(v => [v.id, v.domainId]), [[1, 1], [2, 2], [3, 3]]);
  const records = csvRecords(toDailyCsv(snapshot));
  for (const day of [at(10, 18), at(10, 19)]) {
    const kpi = viewFromSnapshot(data, { start: day, end: addDays(day, 1), today: day, siteMerge: 'none' }).stats;
    const rows = records.filter(row => row.date === dateKey(day));
    assert.equal(rows.reduce((sum, row) => sum + row.ms, 0), kpi.ms);
    assert.equal(rows.reduce((sum, row) => sum + row.visits, 0), kpi.visits);
  }
  const { tables } = JSON.parse(toLedgerJson(snapshot, meta));
  for (const day of tables.days) {
    assert.equal(tables.hours.filter(h => h.date === day.date && h.domainId === day.domainId).reduce((sum, h) => sum + h.ms, 0), day.ms);
  }
});

test('file names use the local date', () => {
  assert.equal(exportFileName('json', at(10, 20, 23, 59)), 'pagetime-2026-10-20.json');
  assert.equal(exportFileName('csv', at(1, 2, 0, 1)), 'pagetime-2026-01-02.csv');
});

test('scale: one year × 200 sites builds in many short parts, so the page can paint between them', () => {
  const SITES = 200, DAYS = 365, HOURS = 6;
  const first = at(1, 1);
  const domains = Array.from({ length: SITES }, (_, i) => ({ id: i + 1, host: `site-${i}.example.com` }));
  const days = [], hours = [], spans = [], visits = [];
  for (let d = 0; d < DAYS; d++) {
    const date = dateKey(addDays(first, d));
    for (const { id } of domains) {
      days.push({ date, domainId: id, ms: HOURS * 600_000, visits: 4 });
      for (let h = 0; h < HOURS; h++) hours.push({ date, hour: h * 4, domainId: id, ms: 600_000 });
    }
  }
  for (let i = 0; i < 31 * SITES * 5; i++) {
    spans.push({ id: i + 1, domainId: (i % SITES) + 1, start: first + i * 1_000, end: first + i * 1_000 + 500 });
    visits.push({ id: i + 1, domainId: (i % SITES) + 1, at: first + i * 1_000 });
  }
  const snapshot = { state: { enabled: true, since: first }, domains, days, hours, spans, visits };
  const measure = parts => {
    let slowest = 0, total = 0, size = 0, count = 0;
    let since = performance.now();
    for (const part of parts) {
      const now = performance.now();
      slowest = Math.max(slowest, now - since);
      total += now - since;
      size += part.length;
      count += 1;
      since = performance.now();
    }
    return { slowest, total, size, count };
  };
  const json = measure(ledgerJsonParts(snapshot, meta));
  const csv = measure(dailyCsvParts(snapshot));
  console.log(`scale: ${days.length} day rows, ${hours.length} hour rows; JSON ${(json.size / 1e6).toFixed(1)} MB in ${json.count} parts, ${Math.round(json.total)} ms total, slowest part ${Math.round(json.slowest)} ms; CSV ${(csv.size / 1e6).toFixed(1)} MB, ${Math.round(csv.total)} ms total, slowest part ${Math.round(csv.slowest)} ms`);
  assert.equal(days.length, 73_000);
  assert.ok(json.count > 100, 'JSON is split into many parts');
  assert.ok(json.total < 10_000, `JSON took ${json.total} ms`);
  assert.ok(csv.total < 5_000, `CSV took ${csv.total} ms`);
  assert.ok(json.slowest < 1_000, `slowest JSON part ${json.slowest} ms`);
  assert.ok(csv.slowest < 1_000, `slowest CSV part ${csv.slowest} ms`);
  assert.equal(csvRecords(toDailyCsv(snapshot)).length, days.length);
});
