export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const GAP_LIMIT_MS = 90_000;
export const IDLE_SECONDS = 60;
export const CHECKPOINT_SECONDS = 30;
export const DETAIL_DAYS = 31;
export const blankData = () => ({ visits: [], spans: [], enabled: true, since: Date.now() });

export function domainOf(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : null;
  } catch { return null; }
}

export function midnight(at) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addDays(at, days) {
  const date = new Date(midnight(at));
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function dateKey(at) {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Local midnight of a YYYY-MM-DD key. Null when the key is not that calendar day.
export function dateKeyStart(key) {
  if (typeof key !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day).getTime();
  return dateKey(start) === key ? start : null;
}

// Local-time pieces of [start, end): one per clock hour, so a piece never crosses an hour or a day.
// Fall-back snaps setMinutes to the earlier copy of the repeated hour, so +1h can fail to move forward.
export function splitByHour(start, end) {
  const pieces = [];
  for (let at = start; at < end;) {
    const date = new Date(at);
    const hour = date.getHours();
    date.setMinutes(0, 0, 0);
    let next = date.getTime() + HOUR;
    if (next <= at) {
      const later = new Date(at);
      later.setHours(hour + 1, 0, 0, 0);
      next = later.getTime();
    }
    next = Math.min(end, next);
    if (next <= at) next = Math.min(end, at + HOUR);
    pieces.push({ date: dateKey(at), hour, start: at, end: next });
    at = next;
  }
  return pieces;
}

// Detail rows (spans, visits) that start before this local midnight are removed. Today counts as one of DETAIL_DAYS.
export const detailCutoff = now => addDays(now, 1 - DETAIL_DAYS);

// keyOf maps a stored hostname to the query-view site. The default keeps one row per hostname.
export function summarize(data, start, end, keyOf = domain => domain) {
  const entries = [];
  for (const visit of data.visits) if (visit.at >= start && visit.at < end) entries.push({ domain: visit.domain, ms: 0, visits: 1 });
  for (const span of data.spans) {
    const ms = Math.max(0, Math.min(span.end, end) - Math.max(span.start, start));
    if (ms) entries.push({ domain: span.domain, ms, visits: 0 });
  }
  return groupSites(entries, keyOf);
}

export function groupSites(entries, keyOf = domain => domain) {
  const sites = new Map();
  for (const entry of entries) {
    if (typeof entry.domain !== 'string') continue;
    const key = keyOf(entry.domain);
    let site = sites.get(key);
    if (!site) sites.set(key, site = { domain: key, ms: 0, visits: 0, hosts: new Map() });
    site.ms += entry.ms || 0;
    site.visits += entry.visits || 0;
    let host = site.hosts.get(entry.domain);
    if (!host) site.hosts.set(entry.domain, host = { domain: entry.domain, ms: 0, visits: 0 });
    host.ms += entry.ms || 0;
    host.visits += entry.visits || 0;
  }
  const rows = [...sites.values()].map(site => ({
    domain: site.domain,
    ms: site.ms,
    visits: site.visits,
    hosts: [...site.hosts.values()].sort((a, b) => b.ms - a.ms || b.visits - a.visits || a.domain.localeCompare(b.domain)),
  }));
  return rank(rows);
}

export function breakdown(data, start, end, site, keyOf = domain => domain) {
  const row = summarize(data, start, end, keyOf).rows.find(item => item.domain === site);
  return { domain: site, rows: row?.hosts ?? [], ms: row?.ms ?? 0, visits: row?.visits ?? 0 };
}

export function rank(rows) {
  rows.sort((a,b) => b.ms - a.ms || b.visits - a.visits || a.domain.localeCompare(b.domain));
  return { rows, ms: rows.reduce((a,b) => a+b.ms, 0), visits: rows.reduce((a,b) => a+b.visits, 0) };
}

export function daily(data, start, end) {
  const days = [];
  for (let at = midnight(start); at < end;) {
    const next = addDays(at, 1);
    days.push({ at, ...summarize(data, Math.max(at,start), Math.min(next,end)) });
    at = next;
  }
  return days;
}

// shortcut: 无游标不计；时钟回拨停在游标时刻；否则最多计入 90 秒，检查点推迟时不再整段丢弃。需要连续后台硬件采样时再增加休眠检测。
export function creditUntil(cursor, now) {
  if (!cursor) return undefined;
  if (now < cursor.since) return cursor.since;
  return Math.min(now, cursor.since + GAP_LIMIT_MS);
}

// The part of a live cursor that is not in the ledger yet. Same start rule and creditUntil cap as a background tick.
export function openCredit(cursor, lastEnd, now) {
  if (!cursor || typeof cursor.since !== 'number' || typeof cursor.domain !== 'string' || !cursor.domain) return null;
  const start = lastEnd !== undefined && lastEnd > cursor.since ? lastEnd : cursor.since;
  const end = creditUntil(cursor, now);
  if (end === undefined || end <= start) return null;
  return { domain: cursor.domain, start, end };
}

export function overlapMs(segment, start, end) {
  if (!segment) return 0;
  return Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, start));
}
