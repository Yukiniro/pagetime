import { addDays, dateKeyStart, midnight } from './model.mjs';

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
