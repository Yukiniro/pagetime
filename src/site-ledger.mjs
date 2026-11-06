// The ledger's own list state. The denominator is the selected range's active time
// (`stats.ms`), not the filtered site and not the longest row.

export const SITE_LEDGER_LIMIT = 8;

const byTime = (a, b) => b.ms - a.ms || b.visits - a.visits || String(a.domain).localeCompare(String(b.domain));
const byVisits = (a, b) => b.visits - a.visits || b.ms - a.ms || String(a.domain).localeCompare(String(b.domain));

export function orderSites(rows, metric = 'time') {
  return [...rows].sort(metric === 'visits' ? byVisits : byTime);
}

export function formatSiteShare(ms, total) {
  if (!(total > 0)) return '—';
  if (!(ms > 0)) return '0%';
  const percent = (ms * 100) / total;
  if (!Number.isFinite(percent)) return '—';
  if (percent < 0.1) return '<0.1%';
  return `${percent.toFixed(1)}%`;
}

export function siteShareWidth(ms, total) {
  if (!(total > 0) || !(ms > 0)) return 0;
  const width = (ms * 100) / total;
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.min(100, width);
}

export function visibleSites(rows, { metric = 'time', query = '', expanded = false } = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  const ordered = orderSites(Array.isArray(rows) ? rows : [], metric);
  const matched = needle ? ordered.filter(row => String(row.domain).toLowerCase().includes(needle)) : ordered;
  const clipped = !needle && !expanded && matched.length > SITE_LEDGER_LIMIT;
  return { rows: clipped ? matched.slice(0, SITE_LEDGER_LIMIT) : matched, total: matched.length, clipped };
}
