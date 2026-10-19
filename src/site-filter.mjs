// View-only site focus. `site` is the merged ranking key (`keyOf` / `row.domain`), never a stored hostname.
// Clearing returns the unfiltered summary, spans, and trend the caller already has for the current range.

export function toggleSiteFilter(current, site) {
  return current === site ? '' : site;
}

export function focusSummary(summary, site) {
  if (!site) return summary ?? { ms: 0, visits: 0, rows: [] };
  const rows = (summary?.rows ?? []).filter(row => row.domain === site);
  return {
    rows,
    ms: rows.reduce((total, row) => total + row.ms, 0),
    visits: rows.reduce((total, row) => total + row.visits, 0),
  };
}

export function focusSpans(spans, site) {
  if (!site) return spans ?? [];
  return (spans ?? []).filter(span => (span.site || span.domain) === site);
}

export function timelineHasActivity(spans, today, end) {
  return (spans ?? []).some(span => span.end > today && span.start < end);
}

export function trendHasActivity(days) {
  return (days ?? []).some(day => day.ms > 0);
}
