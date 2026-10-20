import { DETAIL_DAYS, dateKeyStart, detailCutoff } from './model.mjs';

export const DETAIL_TABLES = ['days', 'hours', 'spans', 'visits'];

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * What the settings page shows about the stored ledger. Times are epoch ms or null when there is nothing to show.
 * `detailFrom` is the same cutoff the background passes to pruneDetail, so a span or visit before it is due for removal.
 * @param {Awaited<ReturnType<typeof import('./ledger.mjs').readLedgerStats>>} stats
 * @param {number} now
 */
export function localDataOverview({ counts = {}, firstDay, firstSpan, firstVisit, since }, now) {
  const rows = Object.fromEntries(DETAIL_TABLES.map(name => [name, counts[name] ?? 0]));
  const sites = counts.domains ?? 0;
  const details = [finite(firstSpan), finite(firstVisit)].filter(value => value !== null);
  return {
    since: finite(since),
    firstDay: dateKeyStart(firstDay),
    detailDays: DETAIL_DAYS,
    detailFrom: detailCutoff(now),
    firstDetail: details.length ? Math.min(...details) : null,
    sites,
    rows,
    empty: sites === 0 && DETAIL_TABLES.every(name => rows[name] === 0),
  };
}
