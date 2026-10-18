import { validateSettings } from './settings.mjs';

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const GAP_LIMIT_MS = 90_000;
export const IDLE_SECONDS = 60;
export const CHECKPOINT_SECONDS = 30;
export const DETAIL_DAYS = 31;
export function timingCopy(settings) {
  const valid = validateSettings(settings);
  return {
    idle: valid.idleSeconds,
    checkpoint: CHECKPOINT_SECONDS,
    gap: GAP_LIMIT_MS / 1000,
    days: DETAIL_DAYS,
    countAudible: valid.countAudible,
  };
}
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

// Local-time pieces of [start, end): one per clock hour, so a piece never crosses an hour or a day.
export function splitByHour(start, end) {
  const pieces = [];
  for (let at = start; at < end;) {
    const date = new Date(at);
    date.setMinutes(0, 0, 0);
    const next = Math.min(end, date.getTime() + HOUR);
    pieces.push({ date: dateKey(at), hour: new Date(at).getHours(), start: at, end: next });
    at = next;
  }
  return pieces;
}

// Detail rows (spans, visits) that start before this local midnight are removed. Today counts as one of DETAIL_DAYS.
export const detailCutoff = now => addDays(now, 1 - DETAIL_DAYS);

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
  return rank([...sites.values()]);
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
