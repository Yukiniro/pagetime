import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { EXPORT_FORMAT, EXPORT_ROW_FIELDS, EXPORT_SCHEMA_VERSION, EXPORT_TABLES, toLedgerJson } from '../src/export.mjs';
import { ImportError, KNOWN_SCHEMA_VERSIONS, PARSE_CHUNK, parseLedgerBackup, parseLedgerBackupPaused, replaceLedger, restoreLedger } from '../src/import.mjs';
import { clearLedger, commitTick, openLedger, readHead, readLedgerSnapshot } from '../src/ledger.mjs';
import { dateKey, detailCutoff } from '../src/model.mjs';
import { DEFAULT_SETTINGS } from '../src/settings.mjs';

const fresh = () => openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const tick = async (db, { now, span = null, visit = null, cursor = null }) =>
  commitTick(db, { expect: await readHead(db), now, span, visit, cursor });
const meta = {
  exportedAt: at(10, 20, 8),
  timeZone: 'Asia/Shanghai',
  appVersion: '1.2.3',
  settings: { ...DEFAULT_SETTINGS, ignored: ['skip.test'], allowed: ['keep.test'], recordMode: 'whitelist', theme: 'dark', badge: false, idleSeconds: 300, countAudible: false },
};
const withoutExportedAt = text => text.replace(/"exportedAt": "[^"]+"/, '"exportedAt": ""');

async function seed(db) {
  let now = at(10, 18, 9, 30);
  const sites = ['www.a.test', 'b.test', 'gist.c.test'];
  for (let i = 0; i < 24; i++) {
    const end = now + 20_000 + (i % 4) * 15_000;
    const domain = sites[i % sites.length];
    await tick(db, {
      now: end,
      span: { domain, start: now, end },
      visit: i % 3 === 0 ? { domain, at: now } : null,
      cursor: i === 23 ? { tabId: 1, domain, since: end, session: 's' } : null,
    });
    now = end + (i % 5 === 0 ? 3 * 60 * 60_000 : 1_000);
  }
  return now;
}

const codeOf = error => {
  assert.equal(error instanceof ImportError, true);
  return error.code;
};

test('a ledger export round-trips through clear and restore, except exportedAt', async () => {
  const db = fresh();
  await seed(db);
  const original = toLedgerJson(await readLedgerSnapshot(db), meta);
  assert.equal(JSON.parse(original).format, EXPORT_FORMAT);
  for (const name of EXPORT_TABLES) {
    const row = JSON.parse(original).tables[name][0];
    assert.ok(row, name);
    assert.deepEqual(Object.keys(row), EXPORT_ROW_FIELDS[name], name);
  }
  await clearLedger(db, at(10, 21, 12));
  assert.equal(await db.table('domains').count(), 0);
  const restored = await restoreLedger(db, original, at(10, 21, 12));
  assert.deepEqual(restored.settings, meta.settings);
  const legacy = JSON.parse(original);
  legacy.settings.siteMerge = 'registrable';
  const dropped = await restoreLedger(db, JSON.stringify(legacy), at(10, 21, 13));
  assert.equal(Object.hasOwn(dropped.settings, 'siteMerge'), false);
  assert.deepEqual(dropped.settings, meta.settings);
  assert.deepEqual(restored.recording, JSON.parse(original).recording);
  const again = toLedgerJson(await readLedgerSnapshot(db), { ...meta, exportedAt: meta.exportedAt + 60_000, settings: restored.settings });
  assert.notEqual(again, original);
  assert.equal(withoutExportedAt(again), withoutExportedAt(original));
  assert.equal((await readHead(db)).cursor, undefined);
});

test('restore overwrites an existing ledger and keeps a later tick from colliding on ids', async () => {
  const db = fresh();
  await seed(db);
  const document = {
    format: EXPORT_FORMAT,
    schemaVersion: 1,
    recording: { enabled: false, since: 0 },
    settings: { theme: 'sepia', idleSeconds: 15, badge: false, ignored: ['ok.com', 'not a host', 'ok.com'] },
    tables: {
      domains: [{ id: 7, host: 'restored.test', title: 'drop me' }],
      days: [{ date: '2026-10-21', domainId: 7, ms: 0, visits: 0, url: 'https://secret.example/path' }],
      hours: [{ date: '2026-10-21', hour: 0, domainId: 7, ms: 0 }],
      spans: [{ id: 4, domainId: 7, start: at(10, 21, 0, 1), end: at(10, 21, 0, 1) }],
      visits: [{ id: 9, domainId: 7, at: at(10, 21, 0, 1) }],
    },
  };
  const file = parseLedgerBackup(document);
  assert.equal(file.format, EXPORT_FORMAT);
  assert.equal(file.schemaVersion, 1);
  assert.deepEqual(Object.keys(file.tables.domains[0]), ['id', 'host']);
  assert.equal(file.tables.days[0].ms, 0);
  assert.equal(file.tables.days[0].visits, 0);
  assert.equal(file.tables.hours[0].hour, 0);
  assert.equal(file.recording.since, 0);
  assert.equal(file.recording.enabled, false);
  assert.equal(file.settings.theme, 'system');
  assert.equal(file.settings.idleSeconds, 60);
  assert.equal(file.settings.badge, false);
  assert.deepEqual(file.settings.ignored, ['ok.com']);
  // The page sends this parsed object. The worker parses it again before it writes.
  await restoreLedger(db, file, at(10, 21, 12));
  assert.deepEqual(await db.table('domains').toArray(), [{ id: 7, host: 'restored.test' }]);
  assert.equal((await db.table('days').toArray())[0].ms, 0);
  assert.equal((await db.table('days').toArray())[0].visits, 0);
  assert.equal((await db.table('hours').toArray())[0].hour, 0);
  assert.equal((await readHead(db)).state.since, 0);
  assert.equal((await readHead(db)).state.enabled, false);
  const added = at(10, 21, 13);
  await tick(db, { now: added, span: { domain: 'new.test', start: added - 1_000, end: added }, visit: { domain: 'new.test', at: added } });
  const hosts = await db.table('domains').toArray();
  assert.deepEqual(hosts.map(row => row.host).sort(), ['new.test', 'restored.test']);
  assert.equal(hosts.find(row => row.host === 'new.test').id, 8);
  const addedId = hosts.find(row => row.host === 'new.test').id;
  assert.ok((await db.table('spans').toArray()).some(row => row.domainId === addedId && row.id > 4));
});

test('spans and visits older than the detail window are pruned and day totals stay', async () => {
  const db = fresh();
  await tick(db, { now: at(10, 21, 8), span: { domain: 'old.test', start: at(10, 21, 8), end: at(10, 21, 8, 1) } });
  const now = at(10, 21, 15);
  const old = at(8, 1, 12);
  const recent = at(10, 20, 11);
  assert.ok(old < detailCutoff(now));
  assert.ok(recent >= detailCutoff(now));
  const file = {
    format: 'pagetime-ledger',
    schemaVersion: EXPORT_SCHEMA_VERSION,
    recording: { enabled: true, since: old },
    tables: {
      domains: [{ id: 1, host: 'kept.test' }, { id: 2, host: 'aged.test' }],
      days: [
        { date: dateKey(old), domainId: 2, ms: 5_000, visits: 1 },
        { date: dateKey(recent), domainId: 1, ms: 8_000, visits: 1 },
      ],
      hours: [
        { date: dateKey(old), hour: 12, domainId: 2, ms: 5_000 },
        { date: dateKey(recent), hour: 11, domainId: 1, ms: 8_000 },
      ],
      spans: [
        { id: 1, domainId: 2, start: old, end: old + 5_000 },
        { id: 2, domainId: 1, start: recent, end: recent + 8_000 },
      ],
      visits: [{ id: 1, domainId: 2, at: old }, { id: 2, domainId: 1, at: recent }],
    },
  };
  await restoreLedger(db, file, now);
  assert.deepEqual((await db.table('spans').toArray()).map(row => row.id), [2]);
  assert.deepEqual((await db.table('visits').toArray()).map(row => row.id), [2]);
  assert.equal(await db.table('days').count(), 2);
  assert.equal(await db.table('hours').count(), 2);
  assert.equal((await db.table('days').toArray()).find(row => row.domainId === 2).ms, 5_000);
  assert.equal(await db.table('domains').count(), 2);
  assert.equal((await db.table('domains').get(1))?.host, 'kept.test');
});

test('a rejected file or a failed write leaves the ledger, recording state, and cursor in place', async () => {
  const db = fresh();
  await seed(db);
  const before = await readLedgerSnapshot(db);
  const head = await readHead(db);
  assert.ok(head.cursor);
  const bom = parseLedgerBackup(`\uFEFF${toLedgerJson(before, meta)}`);
  assert.equal(bom.tables.domains.length, before.domains.length);
  for (const input of ['date,host,active_ms,visits\r\n', '{', 'null', '{}', JSON.stringify({ format: 'other', schemaVersion: 1 })]) {
    await assert.rejects(restoreLedger(db, input), error => codeOf(error) === 'format');
  }
  const version = JSON.parse(toLedgerJson(before, meta));
  version.schemaVersion = 2;
  await assert.rejects(restoreLedger(db, version), error => codeOf(error) === 'version');
  version.schemaVersion = '1';
  await assert.rejects(restoreLedger(db, version), error => codeOf(error) === 'version');
  const broken = JSON.parse(toLedgerJson(before, meta));
  delete broken.tables.visits;
  await assert.rejects(restoreLedger(db, broken), error => codeOf(error) === 'structure');
  broken.tables.visits = [{ id: 1, domainId: 999, at: 1 }];
  await assert.rejects(restoreLedger(db, JSON.stringify(broken)), error => codeOf(error) === 'structure');
  const duplicate = parseLedgerBackup(toLedgerJson(before, meta));
  duplicate.tables.domains.push({ id: 99, host: duplicate.tables.domains[0].host });
  await assert.rejects(replaceLedger(db, duplicate));
  assert.deepEqual(await readLedgerSnapshot(db), before);
  assert.deepEqual(await readHead(db), head);
  assert.deepEqual(KNOWN_SCHEMA_VERSIONS, [1]);
});

test('more rows than one put chunk all land in the same replacement', async () => {
  const db = fresh();
  await tick(db, { now: at(10, 21, 8), span: { domain: 'gone.test', start: at(10, 21, 8), end: at(10, 21, 8, 1) } });
  const count = 5_001;
  const domains = Array.from({ length: count }, (_, index) => ({ id: index + 1, host: `h${index}.test` }));
  await restoreLedger(db, {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    recording: { enabled: true, since: null },
    tables: {
      domains,
      days: [{ date: '2026-10-21', domainId: count, ms: 0, visits: 0 }],
      hours: [],
      spans: [],
      visits: [],
    },
  }, at(10, 21, 12));
  assert.equal(await db.table('domains').count(), count);
  assert.equal((await db.table('domains').get(count)).host, `h${count - 1}.test`);
  assert.equal(await db.table('domains').where('host').equals('gone.test').count(), 0);
  assert.equal((await readHead(db)).state.since, null);
});

test('a span that ends on the next local midnight restores, and one that runs past it does not open a write', async () => {
  const db = fresh();
  const start = at(10, 18, 23, 59) + 30_000;
  await tick(db, { now: start, cursor: { domain: 'a.test', since: start } });
  await tick(db, { now: start + 60_000, span: { domain: 'a.test', start, end: start + 60_000 } });
  const parsed = parseLedgerBackup(toLedgerJson(await readLedgerSnapshot(db), meta));
  assert.deepEqual(
    parsed.tables.spans.map(row => [row.start, row.end]).sort((a, b) => a[0] - b[0]),
    [[start, at(10, 19)], [at(10, 19), start + 60_000]],
  );
  const domainId = parsed.tables.domains[0].id;
  const fullDay = structuredClone(parsed);
  fullDay.tables.spans = [{ id: 8, domainId, start: at(10, 18), end: at(10, 19) }];
  assert.equal(parseLedgerBackup(fullDay).tables.spans[0].end, at(10, 19));
  const before = await readLedgerSnapshot(db);
  const crossed = structuredClone(parsed);
  crossed.tables.spans[0].end = at(10, 19) + 1;
  await assert.rejects(restoreLedger(db, crossed, at(10, 21, 12)), error => codeOf(error) === 'structure');
  const later = structuredClone(parsed);
  later.tables.spans = [{ id: 1, domainId, start: at(10, 18, 23), end: at(10, 19, 1) }];
  await assert.rejects(restoreLedger(db, JSON.stringify(later), at(10, 21, 12)), error => codeOf(error) === 'structure');
  assert.deepEqual(await readLedgerSnapshot(db), before);
});

test('a timestamp outside the Date range is rejected before a write, and the Date limit is accepted', async () => {
  const db = fresh();
  await tick(db, { now: at(10, 21, 8), span: { domain: 'kept.test', start: at(10, 21, 8), end: at(10, 21, 8, 1) } });
  const before = await readLedgerSnapshot(db);
  const head = await readHead(db);
  const parsed = parseLedgerBackup(toLedgerJson(before, meta));
  const domainId = parsed.tables.domains[0].id;
  const limit = 8.64e15;
  const overflow = 9_000_000_000_000_000;
  assert.equal(new Date(limit).getTime(), limit);
  assert.equal(new Date(-limit).getTime(), -limit);
  assert.ok(Number.isNaN(new Date(overflow).getTime()));
  assert.ok(Number.isNaN(new Date(limit + 1).getTime()));

  const spanOverflow = structuredClone(parsed);
  spanOverflow.tables.spans = [{ id: 1, domainId, start: overflow, end: overflow }];
  const visitOverflow = structuredClone(parsed);
  visitOverflow.tables.spans = [];
  visitOverflow.tables.visits = [{ id: 1, domainId, at: limit + 1 }];
  const sinceOverflow = structuredClone(parsed);
  sinceOverflow.recording = { enabled: true, since: overflow };
  const sinceBelow = structuredClone(parsed);
  sinceBelow.recording = { enabled: false, since: -limit - 1 };
  for (const input of [spanOverflow, visitOverflow, sinceOverflow, sinceBelow]) {
    await assert.rejects(restoreLedger(db, input), error => codeOf(error) === 'structure');
  }
  await assert.rejects(
    async () => replaceLedger(db, { ...parsed, recording: { enabled: true, since: overflow } }),
    error => codeOf(error) === 'structure',
  );

  const edge = structuredClone(parsed);
  edge.recording = { enabled: true, since: limit };
  edge.tables.spans = [{ id: 9, domainId, start: -limit, end: -limit }, { id: 10, domainId, start: limit, end: limit }];
  edge.tables.visits = [{ id: 9, domainId, at: -limit }, { id: 10, domainId, at: limit }];
  const accepted = parseLedgerBackup(edge);
  assert.equal(accepted.recording.since, limit);
  assert.deepEqual(accepted.tables.spans.map(row => [row.start, row.end]), [[-limit, -limit], [limit, limit]]);
  assert.deepEqual(accepted.tables.visits.map(row => row.at), [-limit, limit]);
  const zero = structuredClone(parsed);
  zero.recording = { enabled: false, since: 0 };
  assert.equal(parseLedgerBackup(zero).recording.since, 0);
  assert.deepEqual(await readLedgerSnapshot(db), before);
  assert.deepEqual(await readHead(db), head);
});

test('validating a large backup yields between row chunks and still rejects a bad later row', async () => {
  const domains = Array.from({ length: PARSE_CHUNK }, (_, index) => ({ id: index + 1, host: `h${index}.test` }));
  const start = at(10, 18, 23);
  const document = {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    tables: {
      domains,
      days: [],
      hours: [],
      spans: [{ id: 1, domainId: 1, start, end: at(10, 19, 1) }],
      visits: [],
    },
  };
  let ran = false;
  await assert.rejects(
    parseLedgerBackupPaused(document, () => new Promise(resolve => { setTimeout(() => { ran = true; resolve(); }, 0); })),
    error => codeOf(error) === 'structure',
  );
  assert.equal(ran, true);
  const accepted = await parseLedgerBackupPaused({
    ...document,
    tables: { ...document.tables, spans: [{ id: 1, domainId: 1, start, end: at(10, 19) }] },
  }, () => new Promise(resolve => { setTimeout(resolve); }));
  assert.equal(accepted.tables.domains.length, PARSE_CHUNK);
  assert.equal(accepted.tables.spans[0].end, at(10, 19));
});

test('the import source schedules no network and no foreign wait inside the ledger transaction', () => {
  const source = readFileSync(new URL('../src/import.mjs', import.meta.url), 'utf8');
  assert.equal(source.match(/\.transaction\(/g)?.length ?? 0, 0);
  assert.match(source, /ledgerTx\(db,/);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|setTimeout|Dexie\.waitFor/);
});
