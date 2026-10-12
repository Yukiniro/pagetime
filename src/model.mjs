export const DAY = 86_400_000;
export const LIMIT = 20_000;
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

export function addSpan(data, domain, start, end) {
  if (!domain || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  const last = data.spans.at(-1);
  if (last?.domain === domain && last.end === start) last.end = end;
  else data.spans.push({ domain, start, end });
}

export function prune(data, now) {
  const cutoff = now - 90 * DAY;
  data.visits = data.visits.filter(v => v.at >= cutoff).slice(-LIMIT);
  data.spans = data.spans.filter(s => s.end > cutoff).slice(-LIMIT).map(s => ({...s, start: Math.max(s.start,cutoff)}));
}

export function summarize(data, start, end) {
  const sites = new Map();
  const get = domain => {
    if (!sites.has(domain)) sites.set(domain, { domain, ms: 0, visits: 0 });
    return sites.get(domain);
  };
  for (const visit of data.visits) if (visit.at >= start && visit.at < end) get(visit.domain).visits++;
  for (const span of data.spans) {
    const ms = Math.max(0, Math.min(span.end, end) - Math.max(span.start, start));
    if (ms) get(span.domain).ms += ms;
  }
  const rows = [...sites.values()].sort((a,b) => b.ms - a.ms || b.visits - a.visits || a.domain.localeCompare(b.domain));
  return { rows, ms: rows.reduce((a,b) => a+b.ms, 0), visits: rows.reduce((a,b) => a+b.visits, 0) };
}

export function daily(data, start, end) {
  const days = [];
  for (let at = midnight(start); at < end;) {
    const next = new Date(at); next.setDate(next.getDate()+1);
    days.push({ at, ...summarize(data, Math.max(at,start), Math.min(next.getTime(),end)) });
    at = next.getTime();
  }
  return days;
}

export function duration(ms) {
  if (ms < 60_000) return ms ? '不足 1 分钟' : '0 分钟';
  const mins = Math.floor(ms / 60_000);
  return mins >= 60 ? `${Math.floor(mins/60)} 小时 ${mins%60} 分钟` : `${mins} 分钟`;
}

// shortcut: 超过90秒无检查点的区间不计时；需要连续后台硬件采样时再增加休眠检测。
export function creditUntil(cursor, now) {
  return cursor && now >= cursor.since && now - cursor.since <= 90_000 ? now : cursor?.since;
}
