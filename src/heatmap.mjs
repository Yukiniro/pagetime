import { addDays, dateKey, midnight } from './model.mjs';

// firstDay is 1 (Monday) … 7 (Sunday). Prefer getWeekInfo(); older engines expose weekInfo. Unknown tags fall back to Monday.
export function weekStartOf(locale) {
  try {
    const info = new Intl.Locale(locale);
    const first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
    if (first >= 1 && first <= 7) return first % 7;
  } catch { /* invalid locale tag */ }
  return 1;
}

// Average active milliseconds for each weekday × hour.
// `from` and `to` are local midnights, `to` exclusive. A day counts when it is inside that range,
// on or after the local day of `since`, and on or before `today`. `weekStart` is 0 (Sunday) … 6 (Saturday).
// `site` is the merged ranking key. An empty site sums every row. A set site keeps `row.site === site`,
// the same match as dayHourTotals. Weekday denominators stay the days in the window.
export function weekHourMatrix(rows, from, to, since, weekStart, today, site = '') {
  const startDay = Math.max(midnight(from), midnight(since));
  const lastDay = Math.min(midnight(today), addDays(midnight(to), -1));
  const counts = Array(7).fill(0);
  const included = new Set();
  for (let at = startDay; at <= lastDay; at = addDays(at, 1)) {
    included.add(dateKey(at));
    counts[new Date(at).getDay()] += 1;
  }
  const sums = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const row of rows) {
    if (!row || !included.has(row.date) || !Number.isInteger(row.hour) || row.hour < 0 || row.hour > 23 || !(row.ms > 0)) continue;
    if (site && row.site !== site) continue;
    const [year, month, day] = row.date.split('-').map(Number);
    sums[new Date(year, month - 1, day).getDay()][row.hour] += row.ms;
  }
  const first = Number.isInteger(weekStart) && weekStart >= 0 && weekStart <= 6 ? weekStart : 1;
  const weekdays = Array.from({ length: 7 }, (_, index) => (first + index) % 7);
  const cells = [];
  weekdays.forEach((weekday, row) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const ms = sums[weekday][hour];
      const days = counts[weekday];
      cells.push({ weekday, hour, row, ms, days, average: days ? ms / days : 0 });
    }
  });
  return { weekdays, cells };
}

// True when the heatmap window has active milliseconds. `site` uses the weekHourMatrix match.
export function heatmapHasActivity(rows, from, to, since, today, site = '') {
  return weekHourMatrix(rows ?? [], from, to, since, 0, today, site).cells.some(cell => cell.ms > 0);
}
