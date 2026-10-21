import { EXPORT_FORMAT, EXPORT_ROW_FIELDS, EXPORT_SCHEMA_VERSION, EXPORT_TABLES } from './export.mjs';
import { ledgerTx, pruneDetail } from './ledger.mjs';
import { dateKeyStart, detailCutoff } from './model.mjs';
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
const positiveId = value => Number.isSafeInteger(value) && value > 0;
// Zero is a real total, a real visit count, and a real hour. Only non-numbers are rejected.
const msOk = value => finite(value) && value >= 0;
const countOk = value => Number.isSafeInteger(value) && value >= 0;
const hourOk = value => Number.isSafeInteger(value) && value >= 0 && value <= 23;

/** @param {unknown} value @returns {{ enabled: boolean, since: number | null }} */
function recordingOf(value) {
  const source = isObject(value) ? value : {};
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    since: finite(source.since) ? source.since : null,
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
    if (!positiveId(copy.id) || seen.spans.has(copy.id) || !finite(copy.start) || !finite(copy.end) || copy.end < copy.start) fail('structure');
    seen.spans.add(copy.id);
  } else if (!positiveId(copy.id) || seen.visits.has(copy.id) || !finite(copy.at)) fail('structure');
  else seen.visits.add(copy.id);
  return copy;
}

function parseTables(value) {
  if (!isObject(value)) fail('structure');
  const ids = new Set();
  const hosts = new Set();
  const seen = { days: new Set(), hours: new Set(), spans: new Set(), visits: new Set() };
  /** @type {Record<string, object[]>} */
  const tables = {};
  for (const name of EXPORT_TABLES) {
    if (!Array.isArray(value[name])) fail('structure');
    tables[name] = value[name].map(row => parseRow(name, row, ids, hosts, seen));
  }
  return tables;
}

/**
 * Accepts only a PageTime ledger backup. Unknown row fields are dropped.
 * A wrong format, an unknown schemaVersion, or a table that does not match the export rows throws,
 * and the caller must not open a write. `0` is kept for totals, visit counts, hours, and `recording.since`.
 * Illegal settings fields fall back inside validateSettings and do not throw.
 * @param {unknown} input JSON text or an already parsed value
 */
export function parseLedgerBackup(input) {
  let document = input;
  if (typeof input === 'string') {
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    try { document = JSON.parse(text); }
    catch { fail('format'); }
  }
  if (!isObject(document) || document.format !== EXPORT_FORMAT) fail('format');
  if (!KNOWN_SCHEMA_VERSIONS.includes(document.schemaVersion)) fail('version');
  return {
    format: EXPORT_FORMAT,
    schemaVersion: document.schemaVersion,
    tables: parseTables(document.tables),
    recording: recordingOf(document.recording),
    settings: validateSettings(document.settings),
  };
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
  if (!recording || typeof recording.enabled !== 'boolean' || !(recording.since === null || finite(recording.since))) fail('structure');
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
