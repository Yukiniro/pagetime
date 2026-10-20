import { addDays, dateKeyStart, detailCutoff, midnight } from './model.mjs';

// Query windows are local midnights with an exclusive end, so a closed day interval
// [first, last] is stored as [midnight(first), midnight(last) + 1 day).
const PRESET_DAYS = { today: 1, '7d': 7, '30d': 30 };

export function dayCount(start, end) {
  let count = 0;
  for (let at = midnight(start); at < end; at = addDays(at, 1)) count += 1;
  return count;
}

export function presetRange(preset, today) {
  const days = PRESET_DAYS[preset];
  if (!days) return null;
  const startOfToday = midnight(today);
  return { preset, start: addDays(startOfToday, 1 - days), end: addDays(startOfToday, 1) };
}

// Null when a key is not a local calendar day, or the end day is before the start day.
// That range is not applied; the caller keeps the previous one.
export function customRange(startKey, endKey) {
  const start = dateKeyStart(startKey);
  const last = dateKeyStart(endKey);
  if (start === null || last === null || last < start) return null;
  return { preset: 'custom', start, end: addDays(last, 1) };
}

export function activeRange(range, today) {
  if (range?.preset === 'custom' && range.end > range.start) return { preset: 'custom', start: midnight(range.start), end: midnight(range.end) };
  const preset = range?.preset === '7d' || range?.preset === '30d' ? range.preset : 'today';
  return presetRange(preset, today);
}

// Today (exactly one local day, and that day is today) opens the timeline.
// Every other interval opens the daily trend of that interval.
export function defaultChart(range, today) {
  const startOfToday = midnight(today);
  return midnight(range.start) === startOfToday && midnight(range.end) === addDays(startOfToday, 1) ? 'timeline' : 'trend';
}

// The other tab while the range is today stays the last 7 local days.
export function trendWindow(range, today) {
  const startOfToday = midnight(today);
  if (defaultChart(range, startOfToday) === 'timeline') return { start: addDays(startOfToday, -6), end: addDays(startOfToday, 1) };
  return { start: midnight(range.start), end: midnight(range.end) };
}

// Same wall-clock time `days` calendar days away. addDays only handles midnights.
function shiftDays(at, days) {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function floorHour(at) {
  const date = new Date(at);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

// The comparison windows for a range: the previous period has the same number of calendar days and ends where the range starts.
// A range that has not ended yet is cut at the current whole hour, and the previous period at the same wall-clock hour,
// so "today so far" is never set against all of yesterday. `period` is the whole previous period, for labels.
// `cutoff` is the shared cut-off hour of the current window, or null when nothing is cut.
export function previousWindow(range, now) {
  const days = dayCount(range.start, range.end);
  const currentEnd = Math.max(range.start, Math.min(range.end, floorHour(now)));
  const truncated = currentEnd < range.end;
  const start = addDays(range.start, -days);
  return {
    days,
    truncated,
    cutoff: truncated ? currentEnd : null,
    empty: currentEnd <= range.start,
    current: { start: range.start, end: currentEnd },
    previous: { start, end: truncated ? shiftDays(currentEnd, -days) : range.start },
    period: { start, end: range.start },
  };
}

// Why a metric cannot be compared, or null when it can. Totals come from day rows and hour buckets, which only exist from
// the first recorded day on. Visit counts inside a cut day need visit rows, and those are pruned after DETAIL_DAYS.
// Site counts use visits too, so they share that limit.
export function compareBlocks(window, { since, now }) {
  const none = { ms: null, visits: null, sites: null };
  if (window.empty) return { ms: 'notStarted', visits: 'notStarted', sites: 'notStarted' };
  if (window.previous.start < midnight(since)) return { ms: 'since', visits: 'since', sites: 'since' };
  const cutDay = midnight(window.previous.end);
  if (window.truncated && cutDay < window.previous.end && cutDay < detailCutoff(now)) return { ms: null, visits: 'retention', sites: 'retention' };
  return none;
}

// { diff, percent } per metric, or { reason } when blocked. `percent` is null when the previous value is 0: only the absolute difference is meaningful.
export function compareSummary(current, previous, blocks) {
  const out = {};
  for (const key of ['ms', 'visits', 'sites']) {
    if (blocks[key]) {
      out[key] = { reason: blocks[key] };
      continue;
    }
    const diff = current[key] - previous[key];
    out[key] = { diff, percent: previous[key] === 0 ? null : diff * 100 / previous[key] };
  }
  return out;
}
