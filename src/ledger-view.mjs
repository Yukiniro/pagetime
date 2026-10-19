import { addDays, daily, dateKey, groupSites, summarize } from './model.mjs';
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

export function viewFromLedger({ state, domains, days, spans, visits }, { start, end, today, search = '', site = '', siteMerge = 'prefix', now }) {
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
  return {
    enabled: state?.enabled ?? true,
    since: state?.since ?? now,
    stats: groupSites(entries, keyOf),
    todayStats: groupSites(todayEntries, keyOf),
    days: trend,
    spans: listedSpans,
    visits: listed,
    visitCount,
  };
}
