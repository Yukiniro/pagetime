import { addDays, daily, dateKey, dateKeyStart, groupSites, midnight, openCredit, overlapMs, splitByHour, summarize } from './model.mjs';
import { compareBlocks, compareSummary, previousWindow, timelineDay } from './range.mjs';
import { focusSummary } from './site-filter.mjs';
import { siteOf } from './site.mjs';

export const VISIT_LIST_LIMIT = 200;

// Both sources produce the same view for a range: { start, end, today } are local midnights, `search` is lower case.
// `site` is an exact merged-site filter for the visit list and for trend day totals.
// Stats, spans, and hour rows stay complete, so a site focus can narrow KPI and the timeline
// without hiding ranking rows or the site-detail totals. Hour-cell filtering is not applied.

const keyFor = siteMerge => domain => siteOf(domain, siteMerge);
const matches = (domain, search, site, keyOf) => site ? keyOf(domain) === site : !search || domain.includes(search);
const hourPieces = (start, end) => end > start ? splitByHour(start, end).map(piece => ({ date: piece.date, hour: piece.hour, ms: piece.end - piece.start })) : [];

export function daySummaryFromSnapshot(data, date, siteMerge = 'prefix') {
  const start = dateKeyStart(date);
  if (start === null) return { ms: 0, sites: 0 };
  const summary = summarize(data, start, addDays(start, 1), keyFor(siteMerge));
  return { ms: summary.ms, sites: summary.rows.filter(row => row.ms > 0 || row.visits > 0).length };
}

// Stored day rows plus any still-open cursor time that overlaps that local day.
export function daySummary({ domains, days, segment = null, date, siteMerge = 'prefix' }) {
  const start = dateKeyStart(date);
  if (start === null) return { ms: 0, sites: 0 };
  const host = new Map(domains.map(row => [row.id, row.host]));
  const entries = [];
  for (const row of days) {
    if (row.date !== date) continue;
    const domain = host.get(row.domainId);
    if (domain) entries.push({ domain, ms: row.ms, visits: row.visits });
  }
  if (segment) {
    const ms = overlapMs(segment, start, addDays(start, 1));
    if (ms) entries.push({ domain: segment.domain, ms, visits: 0 });
  }
  const grouped = groupSites(entries, keyFor(siteMerge));
  return { ms: grouped.ms, sites: grouped.rows.filter(row => row.ms > 0 || row.visits > 0).length };
}

export function viewFromSnapshot(data, { start, end, today, search = '', site = '', siteMerge = 'prefix', day = '' }) {
  const keyOf = keyFor(siteMerge);
  const chartDay = timelineDay({ start, end }, today);
  const visits = data.visits.filter(visit => visit.at >= start && visit.at < end && matches(visit.domain, search, site, keyOf)).sort((a, b) => b.at - a.at);
  const trendData = site ? {
    visits: data.visits.filter(visit => keyOf(visit.domain) === site),
    spans: data.spans.filter(span => keyOf(span.domain) === site),
  } : data;
  return {
    enabled: data.enabled,
    since: data.since,
    stats: summarize(data, start, end, keyOf),
    todayStats: summarize(data, today, addDays(today, 1), keyOf),
    days: daily(trendData, start, end).map(({ at, ms }) => ({ at, ms, recorded: at >= midnight(data.since) })),
    hourRows: data.spans.flatMap(span => hourPieces(Math.max(span.start, start), Math.min(span.end, end)).map(piece => ({ ...piece, site: keyOf(span.domain) }))),
    // A single day shows that day's sessions. A longer range keeps today's timeline.
    spans: data.spans.filter(span => span.end > chartDay && span.start < addDays(chartDay, 1)).map(span => ({ ...span, site: keyOf(span.domain) })),
    visits: visits.slice(0, VISIT_LIST_LIMIT).map(visit => ({ domain: visit.domain, site: keyOf(visit.domain), at: visit.at })),
    visitCount: visits.length,
    hosts: [...new Set([...data.visits.map(visit => visit.domain), ...data.spans.map(span => span.domain)])],
    openDomain: null,
    day: day ? daySummaryFromSnapshot(data, day, siteMerge) : null,
  };
}

export function viewFromLedger({ state, domains, days, hours = [], spans, visits, cursor = null, lastEnd }, { start, end, today, search = '', site = '', siteMerge = 'prefix', now }) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const keyOf = keyFor(siteMerge);
  const todayKey = dateKey(today);
  const entries = [];
  const todayEntries = [];
  const perDay = new Map();
  const includeInTrend = domain => !site || keyOf(domain) === site;
  let visitCount = 0;
  // Day rows may include today even when the query range is earlier. `todayStats` stays on today.
  // A single-day chart reads that range's `stats` instead.
  const chartDay = timelineDay({ start, end }, today);
  for (const row of days) {
    const domain = host.get(row.domainId);
    if (!domain) continue;
    if (inRange(row.date, start, end)) {
      entries.push({ domain, ms: row.ms, visits: row.visits });
      if (includeInTrend(domain)) perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.ms);
      if (matches(domain, search, site, keyOf)) visitCount += row.visits;
    }
    if (row.date === todayKey) todayEntries.push({ domain, ms: row.ms, visits: row.visits });
  }
  const enabled = state?.enabled ?? true;
  const segment = enabled ? openCredit(cursor, lastEnd, now) : null;
  const from = segment ? Math.max(segment.start, start) : 0;
  const to = segment ? Math.min(segment.end, end) : 0;
  const hourRows = [];
  for (const row of hours) {
    const domain = host.get(row.domainId);
    hourRows.push({ date: row.date, hour: row.hour, ms: row.ms, site: domain ? keyOf(domain) : '' });
  }
  if (segment && to > from) {
    hourRows.push(...hourPieces(from, to).map(piece => ({ ...piece, site: keyOf(segment.domain) })));
    entries.push({ domain: segment.domain, ms: to - from, visits: 0 });
    for (let at = midnight(from); at < to; at = addDays(at, 1)) {
      const piece = overlapMs(segment, Math.max(from, at), Math.min(to, addDays(at, 1)));
      if (!piece) continue;
      if (includeInTrend(segment.domain)) perDay.set(dateKey(at), (perDay.get(dateKey(at)) ?? 0) + piece);
    }
  }
  const todayPiece = overlapMs(segment, today, addDays(today, 1));
  if (todayPiece) todayEntries.push({ domain: segment.domain, ms: todayPiece, visits: 0 });
  const trend = [];
  const recordedFrom = midnight(state?.since ?? now);
  for (let at = start; at < end; at = addDays(at, 1)) trend.push({ at, ms: perDay.get(dateKey(at)) ?? 0, recorded: at >= recordedFrom });
  const listed = [];
  for (const visit of visits) {
    const domain = host.get(visit.domainId);
    if (!domain || !matches(domain, search, site, keyOf)) continue;
    listed.push({ domain, site: keyOf(domain), at: visit.at });
  }
  const chartEnd = addDays(chartDay, 1);
  const listedSpans = [];
  for (const span of spans) {
    const domain = host.get(span.domainId);
    if (!domain || span.end <= chartDay || span.start >= chartEnd) continue;
    listedSpans.push({ domain, site: keyOf(domain), start: span.start, end: span.end });
  }
  if (segment && segment.end > chartDay && segment.start < addDays(chartDay, 1)) {
    listedSpans.push({ domain: segment.domain, site: keyOf(segment.domain), start: segment.start, end: segment.end });
  }
  return {
    enabled,
    since: state?.since ?? now,
    stats: groupSites(entries, keyOf),
    todayStats: groupSites(todayEntries, keyOf),
    days: trend,
    hourRows,
    spans: listedSpans,
    visits: listed,
    visitCount,
    hosts: domains.map(row => row.host),
    openDomain: typeof cursor?.domain === 'string' && cursor.domain ? cursor.domain : null,
    day: null,
  };
}

const inRange = (date, start, end) => date >= dateKey(start) && date <= dateKey(addDays(end, -1));

// 24 hour buckets for one local date. `site` keeps the merged ranking key; an empty site sums every row.
export function dayHourTotals(rows, date, site = '') {
  const totals = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0 }));
  for (const row of rows ?? []) {
    if (!row || row.date !== date || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23) continue;
    if (site && row.site !== site) continue;
    totals[row.hour].ms += row.ms || 0;
  }
  return totals;
}

// Daily bars and 0–23 totals for one merged site. Missing days stay in the list as 0.
// Days before `since` are marked unrecorded. Open credit uses the same rule as viewFromLedger, so the two sums match that site's header.
export function siteSeries({ domains, days, hours, state, cursor = null, lastEnd }, { site, siteMerge = 'prefix', start, end, now }) {
  const keyOf = keyFor(siteMerge);
  const host = new Map(domains.map(row => [row.id, row.host]));
  const belongs = domainId => {
    const domain = host.get(domainId);
    return Boolean(domain) && keyOf(domain) === site;
  };
  const perDay = new Map();
  for (const row of days) {
    if (!belongs(row.domainId) || !inRange(row.date, start, end)) continue;
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.ms);
  }
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0 }));
  for (const row of hours) {
    if (!belongs(row.domainId) || !inRange(row.date, start, end) || row.hour < 0 || row.hour > 23) continue;
    byHour[row.hour].ms += row.ms;
  }
  const enabled = state?.enabled ?? true;
  const segment = enabled ? openCredit(cursor, lastEnd, now) : null;
  if (segment && keyOf(segment.domain) === site) {
    const from = Math.max(segment.start, start);
    const to = Math.min(segment.end, end);
    if (to > from) {
      for (const piece of splitByHour(from, to)) {
        const ms = piece.end - piece.start;
        perDay.set(piece.date, (perDay.get(piece.date) ?? 0) + ms);
        byHour[piece.hour].ms += ms;
      }
    }
  }
  const recordedFrom = midnight(state?.since ?? now);
  const series = [];
  for (let at = start; at < end; at = addDays(at, 1)) series.push({ at, ms: perDay.get(dateKey(at)) ?? 0, recorded: at >= recordedFrom });
  return { days: series, hours: byHour };
}

// Preview snapshots store spans, not day and hour rows. The result matches siteSeries.
export function siteSeriesFromSnapshot(data, { site, siteMerge = 'prefix', start, end, now }) {
  const domains = [];
  const ids = new Map();
  const idOf = host => {
    if (ids.has(host)) return ids.get(host);
    const id = ids.size + 1;
    ids.set(host, id);
    domains.push({ id, host });
    return id;
  };
  const dayRows = [];
  const dayIndex = new Map();
  const hours = [];
  for (const span of data.spans) {
    const from = Math.max(span.start, start);
    const to = Math.min(span.end, end);
    if (to <= from) continue;
    const domainId = idOf(span.domain);
    for (const piece of splitByHour(from, to)) {
      const ms = piece.end - piece.start;
      const key = `${piece.date}|${domainId}`;
      let day = dayIndex.get(key);
      if (!day) {
        day = { date: piece.date, domainId, ms: 0 };
        dayIndex.set(key, day);
        dayRows.push(day);
      }
      day.ms += ms;
      hours.push({ date: piece.date, hour: piece.hour, domainId, ms });
    }
  }
  return siteSeries({
    domains,
    days: dayRows,
    hours,
    state: { enabled: data.enabled, since: data.since },
    cursor: null,
  }, { site, siteMerge, start, end, now });
}

const totalsOf = summary => ({ ms: summary.ms, visits: summary.visits, sites: summary.rows.filter(row => row.ms > 0 || row.visits > 0).length });

// KPI figures for [start, end) read from stored rows. Whole days come from `days` (time and visits).
// An `end` inside a day takes that day's part from `hours` (time only) and `visits` rows, because hour buckets hold no visit count.
// `segment` is the unsaved cursor time. A site filter narrows the figures the same way the KPI bar does.
export function windowTotals({ domains, days, hours = [], visits = [], segment = null }, { start, end }, { site = '', siteMerge = 'prefix' } = {}) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const entries = [];
  const cutDay = midnight(end);
  const add = (domainId, ms, count) => {
    const domain = host.get(domainId);
    if (domain) entries.push({ domain, ms, visits: count });
  };
  for (const row of days) if (inRange(row.date, start, cutDay)) add(row.domainId, row.ms, row.visits);
  if (cutDay < end) {
    const cutHour = new Date(end).getHours();
    const cutKey = dateKey(cutDay);
    for (const row of hours) if (row.date === cutKey && row.hour < cutHour) add(row.domainId, row.ms, 0);
    for (const visit of visits) if (visit.at >= cutDay && visit.at < end) add(visit.domainId, 0, 1);
  }
  const open = overlapMs(segment, start, end);
  if (open) entries.push({ domain: segment.domain, ms: open, visits: 0 });
  return totalsOf(focusSummary(groupSites(entries, keyFor(siteMerge)), site));
}

export function windowTotalsFromSnapshot(data, { start, end }, { site = '', siteMerge = 'prefix' } = {}) {
  return totalsOf(focusSummary(summarize(data, start, end, keyFor(siteMerge)), site));
}

// The preview twin of the extension's comparison: same windows, same blocks, totals from the snapshot.
export function compareFromSnapshot(data, { start, end, focus = '', siteMerge = 'prefix' }, now) {
  const window = previousWindow({ start, end }, now);
  const blocks = compareBlocks(window, { since: data.since, now });
  const options = { site: focus, siteMerge };
  const ready = !blocks.ms;
  return {
    window,
    summary: compareSummary(
      ready ? windowTotalsFromSnapshot(data, window.current, options) : null,
      ready ? windowTotalsFromSnapshot(data, window.previous, options) : null,
      blocks,
    ),
  };
}
