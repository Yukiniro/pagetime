import { EXPORT_FORMAT, EXPORT_ROW_FIELDS, EXPORT_SCHEMA_VERSION, EXPORT_TABLES } from './export.mjs';
import { ledgerTx, pruneDetail } from './ledger.mjs';
import { addDays, dateKey, dateKeyStart, detailCutoff, midnight } from './model.mjs';
import { HOST_MAX, validateSettings } from './settings.mjs';

export const KNOWN_SCHEMA_VERSIONS = [EXPORT_SCHEMA_VERSION];
const PUT_CHUNK = 5_000;

export class ImportError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ImportError';
    this.code = code;
  }
}

const fail = code => { throw new ImportError(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
// TimeClip: a number past this limit makes `new Date(ms)` invalid, and dateKey then returns NaN-NaN-NaN.
const DATE_LIMIT_MS = 8.64e15;
const instant = value => finite(value) && Math.abs(value) <= DATE_LIMIT_MS;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
// Zero is a real total, a real visit count, and a real hour. Only non-numbers are rejected.
const msOk = value => finite(value) && value >= 0;
const countOk = value => Number.isSafeInteger(value) && value >= 0;
const hourOk = value => Number.isSafeInteger(value) && value >= 0 && value <= 23;

/** @param {unknown} value @returns {{ enabled: boolean, since: number | null }} */
function recordingOf(value) {
  const source = isObject(value) ? value : {};
  if (finite(source.since) && !instant(source.since)) fail('structure');
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    since: instant(source.since) ? source.since : null,
  };
}

function parseRow(name, row, ids, hosts, seen) {
  if (!isObject(row)) fail('structure');
  const copy = {};
  for (const field of EXPORT_ROW_FIELDS[name]) copy[field] = row[field];
  if (name === 'domains') {
    if (!positiveId(copy.id) || ids.has(copy.id)) fail('structure');
    if (typeof copy.host !== 'string' || copy.host.length === 0 || copy.host.length > HOST_MAX || hosts.has(copy.host)) fail('structure');
    ids.add(copy.id);
    hosts.add(copy.host);
    return copy;
  }
  if (!positiveId(copy.domainId) || !ids.has(copy.domainId)) fail('structure');
  if (name === 'days') {
    const key = `${copy.date}|${copy.domainId}`;
    if (dateKeyStart(copy.date) === null || !msOk(copy.ms) || !countOk(copy.visits) || seen.days.has(key)) fail('structure');
    seen.days.add(key);
  } else if (name === 'hours') {
    const key = `${copy.date}|${copy.hour}|${copy.domainId}`;
    if (dateKeyStart(copy.date) === null || !hourOk(copy.hour) || !msOk(copy.ms) || seen.hours.has(key)) fail('structure');
    seen.hours.add(key);
  } else if (name === 'spans') {
    if (!positiveId(copy.id) || seen.spans.has(copy.id) || !instant(copy.start) || !instant(copy.end) || copy.end < copy.start) fail('structure');
    // Half-open [start, end). A stored span may end on the next local midnight; any later instant belongs to the next day.
    if (dateKey(copy.start) !== dateKey(copy.end) && copy.end !== addDays(midnight(copy.start), 1)) fail('structure');
    seen.spans.add(copy.id);
  } else if (!positiveId(copy.id) || seen.visits.has(copy.id) || !instant(copy.at)) fail('structure');
  else seen.visits.add(copy.id);
  return copy;
}

export const PARSE_CHUNK = 5_000;

function decodeDocument(input) {
  if (typeof input !== 'string') return input;
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  try { return JSON.parse(text); }
  catch { fail('format'); }
}

function checkedDocument(document) {
  if (!isObject(document) || document.format !== EXPORT_FORMAT) fail('format');
  if (!KNOWN_SCHEMA_VERSIONS.includes(document.schemaVersion)) fail('version');
  if (!isObject(document.tables)) fail('structure');
  return document;
}

function packBackup(document, tables) {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: document.schemaVersion,
    tables,
    recording: recordingOf(document.recording),
    settings: validateSettings(document.settings),
  };
}

// One task per chunk so a caller can run them straight through or yield between them. Row state is shared.
function chunkTasks(tablesIn) {
  const ids = new Set();
  const hosts = new Set();
  const seen = { days: new Set(), hours: new Set(), spans: new Set(), visits: new Set() };
  /** @type {Record<string, object[]>} */
  const tables = {};
  const tasks = [];
  for (const name of EXPORT_TABLES) {
    const rows = tablesIn[name];
    if (!Array.isArray(rows)) fail('structure');
    const into = [];
    tables[name] = into;
    for (let index = 0; index < rows.length; index += PARSE_CHUNK) {
      const end = Math.min(rows.length, index + PARSE_CHUNK);
      tasks.push(() => {
        for (let row = index; row < end; row += 1) into.push(parseRow(name, rows[row], ids, hosts, seen));
      });
    }
  }
  return { tables, tasks };
}

/**
 * Accepts only a PageTime ledger backup. Unknown row fields are dropped.
 * A wrong format, an unknown schemaVersion, a table that does not match the export rows, a timestamp
 * outside the JavaScript Date range, or a span that ends after the next local midnight throws, and the caller must not open a write.
 * `0` is kept for totals, visit counts, hours, and `recording.since`.
 * Illegal settings fields fall back inside validateSettings and do not throw.
 * @param {unknown} input JSON text or an already parsed value
 */
export function parseLedgerBackup(input) {
  const document = checkedDocument(decodeDocument(input));
  const { tables, tasks } = chunkTasks(document.tables);
  for (const task of tasks) task();
  return packBackup(document, tables);
}

/**
 * Same acceptance rules as parseLedgerBackup. `pause` runs before every chunk after the first,
 * so a large file can yield between real row checks. The dashboard calls this from a worker, not the page thread.
 * @param {unknown} input
 * @param {() => Promise<void>} [pause]
 */
export async function parseLedgerBackupPaused(input, pause) {
  const document = checkedDocument(decodeDocument(input));
  const { tables, tasks } = chunkTasks(document.tables);
  for (let index = 0; index < tasks.length; index += 1) {
    if (index > 0 && pause) await pause();
    tasks[index]();
  }
  return packBackup(document, tables);
}

/**
 * Replaces the five ledger tables, then `meta.state`, and deletes `cursor`, in one transaction.
 * Clear runs before each table's puts, and every await is a call on that transaction's tables.
 * A failure rejects the transaction, so the previous rows, recording state, and cursor stay.
 * @param {import('dexie').Dexie} db
 * @param {{ tables: Record<string, object[]>, recording: { enabled: boolean, since: number | null } }} backup
 */
export function replaceLedger(db, backup) {
  for (const name of EXPORT_TABLES) {
    if (!Array.isArray(backup?.tables?.[name])) fail('structure');
  }
  const recording = backup.recording;
  if (!recording || typeof recording.enabled !== 'boolean' || !(recording.since === null || instant(recording.since))) fail('structure');
  const state = { enabled: recording.enabled, since: recording.since };
  return ledgerTx(db, {
    // Ordered awaits stay on this transaction. write() cannot, because it must schedule every request before the first one settles.
    async read(t) {
      for (const name of EXPORT_TABLES) {
        await t[name].clear();
        const rows = backup.tables[name];
        for (let index = 0; index < rows.length; index += PUT_CHUNK) {
          await t[name].bulkPut(rows.slice(index, index + PUT_CHUNK));
        }
      }
      await t.meta.put({ key: 'state', value: state });
      await t.meta.delete('cursor');
    },
    write() { return []; },
  });
}

/**
 * Validates, replaces the ledger, then prunes spans and visits with the existing 31-day cutoff.
 * Day and hour totals are not pruned. Settings are returned for the caller to store; this function does not touch them.
 * @param {import('dexie').Dexie} db
 * @param {unknown} input
 * @param {number} [now]
 */
export async function restoreLedger(db, input, now = Date.now()) {
  const backup = parseLedgerBackup(input);
  await replaceLedger(db, backup);
  await pruneDetail(db, detailCutoff(now));
  return backup;
}
