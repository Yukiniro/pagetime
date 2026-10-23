import { addDays, dateKey, dateKeyStart, midnight, splitByHour } from './model.mjs';

export const EXPORT_FORMAT = 'pagetime-ledger';
export const EXPORT_SCHEMA_VERSION = 1;
export const EXPORT_TABLES = ['domains', 'days', 'hours', 'spans', 'visits'];
// Field order is the JSON row order. Import keeps these fields and drops every other one.
export const EXPORT_ROW_FIELDS = {
  domains: ['id', 'host'],
  days: ['date', 'domainId', 'ms', 'visits'],
  hours: ['date', 'hour', 'domainId', 'ms'],
  spans: ['id', 'domainId', 'start', 'end'],
  visits: ['id', 'domainId', 'at'],
};
export const CSV_COLUMNS = ['date', 'host', 'active_ms', 'visits'];

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byFields = fields => (a, b) => {
  for (const field of fields) {
    const order = compare(a[field], b[field]);
    if (order) return order;
  }
  return 0;
};

// Primary keys follow src/ledger.mjs. Each row keeps only its schema fields, in a fixed order.
const rowShape = name => row => Object.fromEntries(EXPORT_ROW_FIELDS[name].map(field => [field, row[field]]));
const TABLES = {
  domains: { order: byFields(['id']), row: rowShape('domains') },
  days: { order: byFields(['date', 'domainId']), row: rowShape('days') },
  hours: { order: byFields(['date', 'hour', 'domainId']), row: rowShape('hours') },
  spans: { order: byFields(['id']), row: rowShape('spans') },
  visits: { order: byFields(['id']), row: rowShape('visits') },
};

const CHUNK_ROWS = 5_000;
const sortedRows = (snapshot, name) => [...(snapshot[name] ?? [])].sort(TABLES[name].order);

// Filled while a caller pulls export chunks, so a long day table does not build a Date for every row up front.
function noteDaySlice(span, rows) {
  for (const row of rows) {
    const date = row?.date;
    if (dateKeyStart(date) === null) continue;
    if (span.startDay === null || date < span.startDay) span.startDay = date;
    if (span.endDay === null || date > span.endDay) span.endDay = date;
  }
}
const indent = value => JSON.stringify(value, null, 2).replaceAll('\n', '\n  ');

/**
 * The whole ledger as one JSON document, in parts of at most CHUNK_ROWS rows so a caller can yield between them.
 * Rows are sorted by primary key, one row per line, so two exports of the same ledger differ only in `exportedAt`.
 * @param {{ state?: { enabled: boolean, since: number }, domains: object[], days: object[], hours: object[], spans: object[], visits: object[] }} snapshot
 * @param {{ exportedAt: number, timeZone: string, appVersion: string, settings: object }} meta
 * @param {{ startDay: string | null, endDay: string | null }} [span] Day-total extrema, updated as day chunks are pulled.
 * @returns {Generator<string>}
 */
export function* ledgerJsonParts(snapshot, { exportedAt, timeZone, appVersion, settings }, span) {
  const head = {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    timeZone,
    appVersion,
    recording: { enabled: snapshot.state?.enabled ?? true, since: snapshot.state?.since ?? null },
    settings,
  };
  yield `{\n${Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${indent(value)}`).join(',\n')},\n  "tables": {\n`;
  for (const [index, name] of EXPORT_TABLES.entries()) {
    const rows = sortedRows(snapshot, name);
    yield `    ${JSON.stringify(name)}: ${rows.length ? '[\n' : '[]'}`;
    for (let from = 0; from < rows.length; from += CHUNK_ROWS) {
      const slice = rows.slice(from, from + CHUNK_ROWS);
      if (span && name === 'days') noteDaySlice(span, slice);
      const lines = slice.map(row => `      ${JSON.stringify(TABLES[name].row(row))}`);
      yield `${from ? ',\n' : ''}${lines.join(',\n')}`;
    }
    yield `${rows.length ? '\n    ]' : ''}${index < EXPORT_TABLES.length - 1 ? ',' : ''}\n`;
  }
  yield '  }\n}\n';
}

/** @param {Parameters<typeof ledgerJsonParts>[0]} snapshot @param {Parameters<typeof ledgerJsonParts>[1]} meta @param {Parameters<typeof ledgerJsonParts>[2]} [span] */
export const toLedgerJson = (snapshot, meta, span) => [...ledgerJsonParts(snapshot, meta, span)].join('');

/**
 * Read-only facts for a file that was just saved. Counts are the ledger table lengths.
 * Start and end days come from `span`, which the JSON and CSV generators fill while their chunks are pulled.
 * They stay null when that walk saw no real day-total date. JSON includes settings and the extension version. CSV leaves both out.
 * @param {{ domains?: object[], days?: { date?: string }[] }} snapshot
 * @param {{ exportedAt: number, timeZone: string, appVersion?: string }} meta
 * @param {'json' | 'csv'} kind
 * @param {{ startDay: string | null, endDay: string | null } | null} [span]
 */
export function ledgerExportSummary(snapshot, { exportedAt, timeZone, appVersion }, kind, span) {
  const days = Array.isArray(snapshot?.days) ? snapshot.days : [];
  const domains = Array.isArray(snapshot?.domains) ? snapshot.domains : [];
  const json = kind === 'json';
  return {
    exportedAt,
    timeZone,
    startDay: span?.startDay ?? null,
    endDay: span?.endDay ?? null,
    siteCount: domains.length,
    dayRows: days.length,
    includesSettings: json,
    appVersion: json ? appVersion ?? null : null,
  };
}

/** RFC 4180: a field with a comma, quote, or line break is quoted, and quotes inside it are doubled. */
export function csvField(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvLine = row => `${row.map(csvField).join(',')}\r\n`;

/**
 * One row per stored local date and raw hostname, sorted by date then host, in parts like ledgerJsonParts.
 * Starts with a UTF-8 byte order mark so spreadsheet apps detect the encoding.
 * @param {{ startDay: string | null, endDay: string | null }} [span] Day-total extrema, updated per chunk before the file text is sorted.
 * @returns {Generator<string>}
 */
export function* dailyCsvParts({ domains, days }, span) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const rows = [];
  for (let from = 0; from < days.length; from += CHUNK_ROWS) {
    const slice = days.slice(from, from + CHUNK_ROWS);
    if (span) noteDaySlice(span, slice);
    for (const day of slice) {
      const name = host.get(day.domainId);
      if (name !== undefined) rows.push([day.date, name, day.ms, day.visits]);
    }
    // Empty parts do not change the file. They give the caller a turn between day chunks, including rows the CSV later skips.
    yield '';
  }
  rows.sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
  yield `\uFEFF${csvLine(CSV_COLUMNS)}`;
  for (let from = 0; from < rows.length; from += CHUNK_ROWS) yield rows.slice(from, from + CHUNK_ROWS).map(csvLine).join('');
}

/** @param {Parameters<typeof dailyCsvParts>[0]} snapshot @param {Parameters<typeof dailyCsvParts>[1]} [span] */
export const toDailyCsv = (snapshot, span) => [...dailyCsvParts(snapshot, span)].join('');

export const exportFileName = (kind, now) => `pagetime-${dateKey(now)}.${kind}`;

/**
 * The local preview keeps `{ visits, spans, enabled, since }`. This builds the ledger tables from it:
 * spans are cut at local midnight, and day and hour totals are summed from them, as the background writes them.
 */
export function previewSnapshot({ visits, spans, enabled, since }) {
  const hosts = [...new Set([...spans.map(span => span.domain), ...visits.map(visit => visit.domain)])].sort(compare);
  const ids = new Map(hosts.map((host, i) => [host, i + 1]));
  const days = new Map();
  const hours = new Map();
  const dayRow = (date, domainId) => {
    const key = `${date}|${domainId}`;
    if (!days.has(key)) days.set(key, { date, domainId, ms: 0, visits: 0 });
    return days.get(key);
  };
  const pieces = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const domainId = ids.get(span.domain);
    for (let start = span.start; start < span.end;) {
      const end = Math.min(span.end, addDays(midnight(start), 1));
      pieces.push({ domainId, start, end });
      start = end;
    }
    for (const piece of splitByHour(span.start, span.end)) {
      const ms = piece.end - piece.start;
      dayRow(piece.date, domainId).ms += ms;
      const key = `${piece.date}|${piece.hour}|${domainId}`;
      if (!hours.has(key)) hours.set(key, { date: piece.date, hour: piece.hour, domainId, ms: 0 });
      hours.get(key).ms += ms;
    }
  }
  const sortedVisits = [...visits].sort((a, b) => a.at - b.at);
  for (const visit of sortedVisits) dayRow(dateKey(visit.at), ids.get(visit.domain)).visits += 1;
  return {
    state: { enabled, since },
    domains: hosts.map(host => ({ id: ids.get(host), host })),
    days: [...days.values()],
    hours: [...hours.values()],
    spans: pieces.map((piece, i) => ({ id: i + 1, ...piece })),
    visits: sortedVisits.map((visit, i) => ({ id: i + 1, domainId: ids.get(visit.domain), at: visit.at })),
  };
}
