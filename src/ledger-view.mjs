import { addDays, daily, dateKey, rank, summarize } from './model.mjs';

export const VISIT_LIST_LIMIT = 200;

// Both sources produce the same view for a range: { start, end, today } are local midnights, `search` is lower case.

export function viewFromSnapshot(data, { start, end, today, search }) {
  const visits = data.visits.filter(v => v.at >= start && v.at < end && v.domain.includes(search)).sort((a, b) => b.at - a.at);
  return {
    enabled: data.enabled,
    since: data.since,
    stats: summarize(data, start, end),
    todayStats: summarize(data, today, end),
    days: daily(data, start, end).map(({ at, ms }) => ({ at, ms })),
    spans: data.spans.filter(s => s.end > today && s.start < end),
    visits: visits.slice(0, VISIT_LIST_LIMIT),
    visitCount: visits.length,
  };
}

export function viewFromLedger({ state, domains, days, spans, visits }, { start, end, today, search, now }) {
  const host = new Map(domains.map(row => [row.id, row.host]));
  const todayKey = dateKey(today);
  const sites = new Map(), todaySites = new Map(), perDay = new Map();
  const add = (map, row) => {
    const domain = host.get(row.domainId);
    const site = map.get(domain) ?? { domain, ms: 0, visits: 0 };
    site.ms += row.ms;
    site.visits += row.visits;
    map.set(domain, site);
  };
  for (const row of days) {
    add(sites, row);
    if (row.date === todayKey) add(todaySites, row);
    perDay.set(row.date, (perDay.get(row.date) ?? 0) + row.ms);
  }
  const trend = [];
  for (let at = start; at < end; at = addDays(at, 1)) trend.push({ at, ms: perDay.get(dateKey(at)) ?? 0 });
  const stats = rank([...sites.values()]);
  return {
    enabled: state?.enabled ?? true,
    since: state?.since ?? now,
    stats,
    todayStats: rank([...todaySites.values()]),
    days: trend,
    spans: spans.map(s => ({ domain: host.get(s.domainId), start: s.start, end: s.end })),
    visits: visits.map(v => ({ domain: host.get(v.domainId), at: v.at })),
    visitCount: stats.rows.filter(row => row.domain.includes(search)).reduce((sum, row) => sum + row.visits, 0),
  };
}
