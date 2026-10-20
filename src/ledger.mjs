import Dexie from 'dexie';
import { addDays, dateKey, dateKeyStart, openCredit, overlapMs, spansAfterDayRemoval, splitByHour } from './model.mjs';

export const LEDGER_NAME = 'pagetime-ledger';
export const LEDGER_ERROR_KEY = 'ledgerError';
export const PRUNE_BATCH = 500;

/** @param {import('dexie').DexieOptions} [options] */
export function openLedger(options = {}) {
  const db = new Dexie(LEDGER_NAME, { chromeTransactionDurability: 'strict', ...options });
  db.version(1).stores({
    meta: 'key',
    domains: '++id, &host',
    days: '[date+domainId], [domainId+date]',
    hours: '[date+hour+domainId], [domainId+date+hour]',
    spans: '++id, start, [domainId+start]',
    visits: '++id, at, [domainId+at]',
  });
  return db;
}

/**
 * The only place that opens a read-write transaction. Both phases receive tables bound to that transaction.
 * `read` may await only operations on those tables. `write` must be synchronous and return its write promises,
 * so no write can wait behind a foreign await: such a write would land after an early commit.
 * @template T
 * @param {Dexie} db
 * @param {{ read?: (tables: Record<string, import('dexie').Table>) => Promise<T> | T, write: (tables: Record<string, import('dexie').Table>, snapshot: T) => Promise<unknown>[] }} phases
 * @returns {Promise<T>}
 */
export function ledgerTx(db, { read = () => undefined, write }) {
  return db.transaction('rw', db.tables, async tx => {
    const tables = Object.fromEntries(db.tables.map(table => [table.name, tx.table(table.name)]));
    const snapshot = await read(tables);
    const writes = write(tables, snapshot);
    if (!Array.isArray(writes)) {
      Promise.resolve(writes).catch(() => {});
      throw new TypeError('ledgerTx: write must synchronously return an array of write promises');
    }
    await Promise.all(writes);
    return snapshot;
  });
}

/**
 * @template T
 * @param {Dexie} db
 * @param {() => Promise<T>} op
 */
export async function reopening(db, op) {
  try {
    return await op();
  } catch (error) {
    if (error?.name !== Dexie.errnames.DatabaseClosed) throw error;
    if (!db.isOpen()) await db.open();
    return op();
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lastSpan = spans => spans.orderBy('start').last();

// Existing rows (copied, so they can be updated in place) or blanks, keyed by the joined primary key.
async function rowsByKey(table, keys, blank) {
  const unique = new Map(keys.map(key => [key.join('|'), key]));
  const found = await table.bulkGet([...unique.values()]);
  return new Map([...unique].map(([id, key], i) => [id, found[i] ? { ...found[i] } : blank(key)]));
}

/** @param {Dexie} db */
export async function readHead(db) {
  const [[state, cursor], last] = await Promise.all([db.table('meta').bulkGet(['state', 'cursor']), lastSpan(db.table('spans'))]);
  return { state: state?.value, cursor: cursor?.value, lastEnd: last?.end };
}

/**
 * One timing event: day totals, hour buckets, span, visit and cursor commit together or not at all.
 * `expect` is the head the caller planned from; the transaction aborts if the ledger moved since.
 * @param {Dexie} db
 * @param {{ expect: { state?: unknown, cursor?: unknown, lastEnd?: number }, now: number, span?: { domain: string, start: number, end: number } | null, visit?: { domain: string, at: number } | null, cursor?: object | null }} tick
 */
export function commitTick(db, { expect, now, span, visit, cursor }) {
  const pieces = span && span.end > span.start ? splitByHour(span.start, span.end) : [];
  const hosts = [...new Set([...(pieces.length ? [span.domain] : []), ...(visit ? [visit.domain] : [])])];
  return ledgerTx(db, {
    async read(t) {
      const [state, current] = await t.meta.bulkGet(['state', 'cursor']);
      const last = await lastSpan(t.spans);
      if (!same(state?.value, expect.state) || !same(current?.value, expect.cursor) || last?.end !== expect.lastEnd) {
        throw new Error('ledger changed while the tick was planned');
      }
      const ids = new Map((await t.domains.where('host').anyOf(hosts).toArray()).map(row => [row.host, row.id]));
      let nextId = ((await t.domains.orderBy(':id').lastKey()) ?? 0) + 1;
      const added = hosts.filter(host => !ids.has(host)).map(host => ({ id: nextId++, host }));
      for (const row of added) ids.set(row.host, row.id);
      const dayKeys = [...pieces.map(p => [p.date, ids.get(span.domain)]), ...(visit ? [[dateKey(visit.at), ids.get(visit.domain)]] : [])];
      return {
        state: state?.value, last: last && { ...last }, ids, added,
        days: await rowsByKey(t.days, dayKeys, ([date, domainId]) => ({ date, domainId, ms: 0, visits: 0 })),
        hours: await rowsByKey(t.hours, pieces.map(p => [p.date, p.hour, ids.get(span.domain)]), ([date, hour, domainId]) => ({ date, hour, domainId, ms: 0 })),
      };
    },
    write(t, s) {
      const spans = [];
      let last = s.last;
      for (const piece of pieces) {
        const domainId = s.ids.get(span.domain);
        s.days.get([piece.date, domainId].join('|')).ms += piece.end - piece.start;
        s.hours.get([piece.date, piece.hour, domainId].join('|')).ms += piece.end - piece.start;
        if (last?.domainId === domainId && last.end === piece.start && dateKey(last.start) === piece.date) last.end = piece.end;
        else last = { domainId, start: piece.start, end: piece.end };
        if (!spans.includes(last)) spans.push(last);
      }
      if (visit) s.days.get([dateKey(visit.at), s.ids.get(visit.domain)].join('|')).visits += 1;
      return [
        ...(s.added.length ? [t.domains.bulkAdd(s.added)] : []),
        t.days.bulkPut([...s.days.values()]),
        t.hours.bulkPut([...s.hours.values()]),
        t.spans.bulkPut(spans),
        ...(visit ? [t.visits.add({ domainId: s.ids.get(visit.domain), at: visit.at })] : []),
        ...(s.state === undefined ? [t.meta.put({ key: 'state', value: { enabled: true, since: now } })] : []),
        cursor ? t.meta.put({ key: 'cursor', value: cursor }) : t.meta.delete('cursor'),
      ];
    },
  });
}

/** @param {Dexie} db @param {number} now */
export function toggleRecording(db, now) {
  return ledgerTx(db, {
    read: async t => (await t.meta.get('state'))?.value,
    write: (t, state) => [
      t.meta.put({ key: 'state', value: { enabled: !(state?.enabled ?? true), since: state?.since ?? now } }),
      t.meta.delete('cursor'),
    ],
  });
}

const hostList = hosts => [...new Set((Array.isArray(hosts) ? hosts : [hosts]).filter(host => typeof host === 'string' && host))];

/**
 * Deletes every stored hostname in `hosts`. One transaction. When the cursor names one of them,
 * `since` becomes `now`, so the next tick cannot write the removed interval back.
 * @param {Dexie} db @param {string | string[]} hosts @param {number} now
 * @returns {Promise<void>}
 */
export async function deleteSite(db, hosts, now) {
  const wanted = hostList(hosts);
  if (!wanted.length) return;
  await ledgerTx(db, {
    async read(t) {
      return {
        domains: await t.domains.where('host').anyOf(wanted).toArray(),
        cursor: (await t.meta.get('cursor'))?.value,
      };
    },
    write(t, { domains, cursor }) {
      const writes = [];
      for (const domain of domains) {
        const id = domain.id;
        writes.push(
          t.days.where('[domainId+date]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete(),
          t.hours.where('[domainId+date+hour]').between([id, Dexie.minKey, Dexie.minKey], [id, Dexie.maxKey, Dexie.maxKey]).delete(),
          t.spans.where('[domainId+start]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete(),
          t.visits.where('[domainId+at]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete(),
          t.domains.delete(id),
        );
      }
      if (cursor && wanted.includes(cursor.domain)) writes.push(t.meta.put({ key: 'cursor', value: { ...cursor, since: now } }));
      return writes;
    },
  });
}

/**
 * Pending cursor time outside the deleted day, plus whether `since` must move to `now`.
 * Moving `since` drops the in-day slice; the outside slices are stored so they are not dropped with it.
 * @param {Record<string, import('dexie').Table>} t
 */
async function cursorAfterDayRemoval(t, { cursor, overlapping, dayStart, dayEnd, date, now }) {
  const last = await lastSpan(t.spans);
  const segment = openCredit(cursor, last?.end, now);
  const inside = segment ? overlapMs(segment, dayStart, dayEnd) : 0;
  const advance = Boolean(cursor && (inside > 0 || date === dateKey(now)));
  const kept = advance && segment ? spansAfterDayRemoval(segment, dayStart, dayEnd) : [];
  if (!kept.length) return { advance, added: null, days: null, hours: null, spans: [] };
  const pieces = kept.flatMap(part => splitByHour(part.start, part.end));
  const host = segment.domain;
  let domain = await t.domains.where('host').equals(host).first();
  let added = null;
  if (!domain) {
    added = { id: ((await t.domains.orderBy(':id').lastKey()) ?? 0) + 1, host };
    domain = added;
  }
  const days = await rowsByKey(t.days, pieces.map(part => [part.date, domain.id]), ([day, domainId]) => ({ date: day, domainId, ms: 0, visits: 0 }));
  const hours = await rowsByKey(t.hours, pieces.map(part => [part.date, part.hour, domain.id]), ([day, hour, domainId]) => ({ date: day, hour, domainId, ms: 0 }));
  const predecessor = last && !overlapping.some(span => span.id === last.id)
    ? { id: last.id, domainId: last.domainId, start: last.start, end: last.end }
    : null;
  let tail = predecessor?.domainId === domain.id ? predecessor : null;
  const spans = [];
  for (const piece of pieces) {
    days.get([piece.date, domain.id].join('|')).ms += piece.end - piece.start;
    hours.get([piece.date, piece.hour, domain.id].join('|')).ms += piece.end - piece.start;
    if (tail && tail.end === piece.start && dateKey(tail.start) === piece.date) tail.end = piece.end;
    else tail = { domainId: domain.id, start: piece.start, end: piece.end };
    if (!spans.includes(tail)) spans.push(tail);
  }
  return { advance, added, days, hours, spans };
}

/**
 * Deletes one local date. A span that crosses that midnight keeps the part outside the day.
 * Pending cursor time outside that day is stored in the same transaction. `since` moves to `now`
 * when that pending interval meets the day, or when the day is today, so the removed slice cannot be written again.
 * @param {Dexie} db @param {string} date @param {number} now
 * @returns {Promise<void>}
 */
export async function deleteDay(db, date, now) {
  const dayStart = dateKeyStart(date);
  if (dayStart === null) throw new TypeError('invalid date');
  const dayEnd = addDays(dayStart, 1);
  await ledgerTx(db, {
    async read(t) {
      const spans = (await t.spans.where('start').below(dayEnd).toArray()).filter(span => span.end > dayStart);
      const cursor = (await t.meta.get('cursor'))?.value;
      const carry = await cursorAfterDayRemoval(t, { cursor, overlapping: spans, dayStart, dayEnd, date, now });
      return { spans, cursor, carry };
    },
    write(t, { spans, cursor, carry }) {
      const writes = [
        t.days.where('[date+domainId]').between([date, Dexie.minKey], [date, Dexie.maxKey]).delete(),
        t.hours.where('[date+hour+domainId]').between([date, Dexie.minKey, Dexie.minKey], [date, Dexie.maxKey, Dexie.maxKey]).delete(),
        t.visits.where('at').between(dayStart, dayEnd, true, false).delete(),
      ];
      for (const span of spans) {
        const kept = spansAfterDayRemoval(span, dayStart, dayEnd);
        if (!kept.length) writes.push(t.spans.delete(span.id));
        else {
          writes.push(t.spans.put({ id: span.id, domainId: span.domainId, start: kept[0].start, end: kept[0].end }));
          if (kept[1]) writes.push(t.spans.add({ domainId: span.domainId, start: kept[1].start, end: kept[1].end }));
        }
      }
      if (carry.added) writes.push(t.domains.add(carry.added));
      if (carry.days) writes.push(t.days.bulkPut([...carry.days.values()]), t.hours.bulkPut([...carry.hours.values()]), t.spans.bulkPut(carry.spans));
      if (carry.advance) writes.push(t.meta.put({ key: 'cursor', value: { ...cursor, since: now } }));
      return writes;
    },
  });
}

/** @param {Dexie} db @param {number} now */
export function clearLedger(db, now) {
  return ledgerTx(db, {
    read: async t => (await t.meta.get('state'))?.value,
    write: (t, state) => [
      ...Object.values(t).map(table => table.clear()),
      t.meta.put({ key: 'state', value: { enabled: state?.enabled ?? true, since: now } }),
    ],
  });
}

/**
 * Removes spans and visits that start before `cutoff`, one transaction per batch. Day and hour totals stay.
 * Safe to stop and rerun: each batch deletes only rows that are still past the cutoff.
 * @param {Dexie} db @param {number} cutoff
 */
export async function pruneDetail(db, cutoff, batch = PRUNE_BATCH) {
  let removed = 0;
  for (const [name, index] of [['spans', 'start'], ['visits', 'at']]) {
    for (;;) {
      const keys = await ledgerTx(db, {
        read: t => t[name].where(index).below(cutoff).limit(batch).primaryKeys(),
        write: (t, keys) => keys.length ? [t[name].bulkDelete(keys)] : [],
      });
      removed += keys.length;
      if (keys.length < batch) break;
    }
  }
  return removed;
}

/** Day totals for every site, `from` and `to` inclusive (YYYY-MM-DD). @param {Dexie} db */
export const daysBetween = (db, from, to) =>
  db.table('days').where('[date+domainId]').between([from, Dexie.minKey], [to, Dexie.maxKey], true, true).toArray();

/** Day totals for one site, the site trend. @param {Dexie} db */
export const siteDays = (db, domainId, from, to) =>
  db.table('days').where('[domainId+date]').between([domainId, from], [domainId, to], true, true).toArray();

/** Hour buckets for one site, `from` and `to` inclusive. Hours are 0–23. @param {Dexie} db */
export const siteHours = (db, domainId, from, to) =>
  db.table('hours').where('[domainId+date+hour]').between([domainId, from, 0], [domainId, to, 23], true, true).toArray();

/** Non-empty hour buckets for every site, `from` and `to` inclusive. @param {Dexie} db */
export const hoursBetween = (db, from, to) =>
  db.table('hours').where('[date+hour+domainId]').between([from, Dexie.minKey, Dexie.minKey], [to, Dexie.maxKey, Dexie.maxKey], true, true).toArray();

/** Spans that start in [start, end). @param {Dexie} db */
export const spansBetween = (db, start, end) => db.table('spans').where('start').between(start, end, true, false).toArray();

/** Newest visits in [start, end) for the given domain ids. @param {Dexie} db */
export const recentVisits = (db, start, end, domainIds, limit) =>
  db.table('visits').where('at').between(start, end, true, false).reverse().filter(visit => domainIds.has(visit.domainId)).limit(limit).toArray();

/** @param {Dexie} db */
export const readState = async db => (await db.table('meta').get('state'))?.value;

/**
 * Read-only figures for the settings data overview: row count per table, the earliest day total,
 * the earliest span and visit start, and the recording `since`. Missing values are undefined.
 * @param {Dexie} db
 */
export async function readLedgerStats(db) {
  const [counts, firstDay, firstSpan, firstVisit, state] = await Promise.all([
    Promise.all(db.tables.map(async table => [table.name, await table.count()])),
    db.table('days').orderBy(':id').first(),
    db.table('spans').orderBy('start').first(),
    db.table('visits').orderBy('at').first(),
    readState(db),
  ]);
  return { counts: Object.fromEntries(counts), firstDay: firstDay?.date, firstSpan: firstSpan?.start, firstVisit: firstVisit?.at, since: state?.since };
}

/** @param {Dexie} db */
export const readDomains = db => db.table('domains').toArray();
