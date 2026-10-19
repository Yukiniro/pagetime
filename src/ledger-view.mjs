import { addDays, daily, dateKey, groupSites, midnight, openCredit, overlapMs, splitByHour, summarize } from './model.mjs';
import { siteOf } from './site.mjs';

export const VISIT_LIST_LIMIT = 200;

// Both sources produce the same view for a range: { start, end, today } are local midnights, `search` is lower case.
// `site` is an exact merged-site filter. `siteMerge` only changes grouping; rows passed in stay raw hostnames.

const keyFor = siteMerge => domain => siteOf(domain, siteMerge);
const matches = (domain, search, site, keyOf) => site ? keyOf(domain) === site : !search || domain.includes(search);

export function viewFromSnapshot(data, { start, end, today, search = '', site = '', siteMerge = 'prefix' }) {
  const keyOf = keyFor(siteMerge);
  const visits = data.visits.filter(visit => visit.at >= start && visit.at < end && matches(visit.domain, search, site, keyOf)).sort((a, b) => b.at - a.at);
  return {
    enabled: data.enabled,
    since: data.since,
    stats: summarize(data, start, end, keyOf),
    todayStats: summarize(data, today, end, keyOf),
    days: daily(data, start, end).map(({ at, ms }) => ({ at, ms })),
    spans: data.spans.filter(span => span.end > today && span.start < end).map(span => ({ ...span, site: keyOf(span.domain) })),
    visits: visits.slice(0, VISIT_LIST_LIMIT).map(visit => ({ domain: visit.domain, site: keyOf(visit.domain), at: visit.at })),
    visitCount: visits.length,
  };
}

export function viewFromLedger({ state, domains, days, spans, visits, cursor = null, lastEnd }, { start, end, today, search = '', site = '', siteMerge = 'prefix', now }) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const keyOf = keyFor(siteMerge);
  const todayKey = dateKey(today);
  const entries = [];
  const todayEntries = [];
  const perDay = new Map();
  let visitCount = 0;
  for (const row of days) {
    const domain = host.get(row.domainId);
    if (!domain) continue;
    entries.push({ domain, ms: row.ms, visits: row.visits });
    if (row.date === todayKey) todayEntries.push({ domain, ms: row.ms, visits: row.visits });
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.ms);
    if (matches(domain, search, site, keyOf)) visitCount += row.visits;
  }
  const enabled = state?.enabled ?? true;
  const segment = enabled ? openCredit(cursor, lastEnd, now) : null;
  const from = segment ? Math.max(segment.start, start) : 0;
  const to = segment ? Math.min(segment.end, end) : 0;
  if (segment && to > from) {
    entries.push({ domain: segment.domain, ms: to - from, visits: 0 });
    for (let at = midnight(from); at < to; at = addDays(at, 1)) {
      const piece = overlapMs(segment, Math.max(from, at), Math.min(to, addDays(at, 1)));
      if (!piece) continue;
      perDay.set(dateKey(at), (perDay.get(dateKey(at)) ?? 0) + piece);
      if (dateKey(at) === todayKey) todayEntries.push({ domain: segment.domain, ms: piece, visits: 0 });
    }
  }
  const trend = [];
  for (let at = start; at < end; at = addDays(at, 1)) trend.push({ at, ms: perDay.get(dateKey(at)) ?? 0 });
  const listed = [];
  for (const visit of visits) {
    const domain = host.get(visit.domainId);
    if (!domain || !matches(domain, search, site, keyOf)) continue;
    listed.push({ domain, site: keyOf(domain), at: visit.at });
  }
  const listedSpans = [];
  for (const span of spans) {
    const domain = host.get(span.domainId);
    if (!domain) continue;
    listedSpans.push({ domain, site: keyOf(domain), start: span.start, end: span.end });
  }
  if (segment && segment.end > today && segment.start < end) {
    listedSpans.push({ domain: segment.domain, site: keyOf(segment.domain), start: segment.start, end: segment.end });
  }
  return {
    enabled,
    since: state?.since ?? now,
    stats: groupSites(entries, keyOf),
    todayStats: groupSites(todayEntries, keyOf),
    days: trend,
    spans: listedSpans,
    visits: listed,
    visitCount,
  };
}

const inRange = (date, start, end) => date >= dateKey(start) && date <= dateKey(addDays(end, -1));

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
  const dayTotals = new Map();
  const hours = [];
  for (const span of data.spans) {
    const from = Math.max(span.start, start);
    const to = Math.min(span.end, end);
    if (to <= from) continue;
    const domainId = idOf(span.domain);
    for (const piece of splitByHour(from, to)) {
      const ms = piece.end - piece.start;
      const key = `${piece.date}|${domainId}`;
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + ms);
      hours.push({ date: piece.date, hour: piece.hour, domainId, ms });
    }
  }
  return siteSeries({
    domains,
    days: [...dayTotals].map(([key, ms]) => {
      const [date, domainId] = key.split('|');
      return { date, domainId: Number(domainId), ms };
    }),
    hours,
    state: { enabled: data.enabled, since: data.since },
    cursor: null,
  }, { site, siteMerge, start, end, now });
}
