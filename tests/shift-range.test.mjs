process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { addDays, dateKey, detailCutoff, midnight } = await import('../src/model.mjs');
const { dayHourTotals, viewFromSnapshot } = await import('../src/ledger-view.mjs');
const { focusSummary } = await import('../src/site-filter.mjs');
const { customRange, defaultChart, presetRange, shiftRange, timelineDay, timelineUsesHours, trendWindow } = await import('../src/range.mjs');

const HOUR = 3_600_000;
const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const dayRange = (start, end) => ({ preset: 'custom', start, end });

test('shiftRange moves a whole period across a month boundary and becomes custom', () => {
  const today = at(2, 20);
  const since = at(1, 1);
  const week = dayRange(at(1, 26), at(2, 2));
  assert.equal(dateKey(week.start), '2026-01-26');
  assert.equal(dateKey(addDays(week.end, -1)), '2026-02-01');
  const next = shiftRange(week, 1, today, since);
  assert.deepEqual(next, { preset: 'custom', start: at(2, 2), end: at(2, 9) });
  assert.equal(dateKey(next.start), '2026-02-02');
  assert.equal(dateKey(addDays(next.end, -1)), '2026-02-08');
  const back = shiftRange(presetRange('today', today), -1, today, since);
  assert.equal(back.preset, 'custom');
  assert.deepEqual(back, dayRange(at(2, 19), at(2, 20)));
  assert.equal(shiftRange(week, 0, today, since), null);
  assert.equal(shiftRange(week, 2, today, since), null);
  const frozen = { ...week };
  shiftRange(frozen, 1, today, since);
  assert.deepEqual(frozen, week);
});

test('shiftRange keeps local midnights across spring-forward and fall-back', () => {
  const march8 = at(3, 8);
  const march9 = at(3, 9);
  const november1 = at(11, 1);
  const november2 = at(11, 2);
  assert.equal(march9 - march8, 23 * HOUR);
  assert.equal(november2 - november1, 25 * HOUR);
  const previous = shiftRange(dayRange(march8, march9), -1, march9, at(3, 1));
  assert.deepEqual(previous, { preset: 'custom', start: at(3, 7), end: march8 });
  const next = shiftRange(dayRange(at(10, 31), november1), 1, november2, at(10, 1));
  assert.deepEqual(next, { preset: 'custom', start: november1, end: november2 });
  const across = shiftRange(dayRange(at(3, 5), at(3, 12)), 1, at(3, 20), at(3, 1));
  assert.deepEqual(across, { preset: 'custom', start: at(3, 12), end: at(3, 19) });
  assert.equal(dateKey(across.start), '2026-03-12');
});

test('shiftRange stops on the local day of since and on today', () => {
  const today = at(10, 20);
  const since = at(10, 15, 15, 30);
  const sinceDay = midnight(since);
  assert.equal(shiftRange(dayRange(sinceDay, at(10, 16)), -1, today, since), null);
  assert.deepEqual(shiftRange(dayRange(at(10, 16), at(10, 17)), -1, today, since), dayRange(sinceDay, at(10, 16)));
  assert.equal(shiftRange(dayRange(at(10, 16), at(10, 23)), -1, today, since), null);
  assert.equal(shiftRange(presetRange('today', today), 1, today, since), null);
  assert.equal(shiftRange(presetRange('7d', today), 1, today, since), null);
  assert.equal(shiftRange(dayRange(at(10, 13), at(10, 20)), 1, today, since), null);
  assert.deepEqual(shiftRange(dayRange(at(10, 19), at(10, 20)), 1, today, since), dayRange(today, at(10, 21)));
  assert.equal(shiftRange(dayRange(today, at(10, 21)), 1, today, Number.NaN), null);
  assert.equal(shiftRange({ start: today, end: today }, -1, today, since), null);
});

test('a single day opens that day’s timeline and a 7-day trend ending that day', () => {
  const today = at(10, 20);
  const yesterday = customRange('2026-10-19', '2026-10-19');
  assert.equal(defaultChart(presetRange('today', today)), 'timeline');
  assert.equal(defaultChart(yesterday), 'timeline');
  assert.equal(defaultChart(presetRange('7d', today)), 'trend');
  assert.equal(defaultChart(customRange('2026-10-16', '2026-10-18')), 'trend');
  assert.deepEqual(trendWindow(presetRange('today', today)), { start: at(10, 14), end: at(10, 21) });
  assert.deepEqual(trendWindow(yesterday), { start: at(10, 13), end: at(10, 20) });
  assert.equal(timelineDay(yesterday, today), at(10, 19));
  assert.equal(timelineDay(presetRange('7d', today), today), today);
  const now = at(10, 20, 15);
  assert.equal(timelineUsesHours(at(10, 20), now), false);
  assert.equal(midnight(detailCutoff(now)), at(9, 20));
  assert.equal(timelineUsesHours(at(9, 20), now), false);
  assert.equal(timelineUsesHours(at(9, 19), now), true);
});

test('a single day’s sessions and hour bars follow that day, including a site filter', () => {
  const today = at(10, 20);
  const now = at(10, 20, 15);
  const old = addDays(today, -40);
  const hour = (day, h) => day + h * HOUR;
  const data = {
    enabled: true,
    since: addDays(today, -80),
    visits: [
      { domain: 'notion.so', at: hour(old, 10) },
      { domain: 'github.com', at: hour(old, 15) },
      { domain: 'youtube.com', at: hour(at(10, 19), 14) },
      { domain: 'github.com', at: hour(today, 9) },
    ],
    spans: [
      { domain: 'notion.so', start: hour(old, 10), end: hour(old, 12) },
      { domain: 'github.com', start: hour(old, 15), end: hour(old, 16) },
      { domain: 'youtube.com', start: hour(at(10, 19), 14), end: hour(at(10, 19), 16) + 30 * 60_000 },
      { domain: 'github.com', start: hour(today, 9), end: hour(today, 11) },
    ],
  };
  const past = viewFromSnapshot(data, { start: old, end: addDays(old, 1), today });
  const hours = dayHourTotals(past.hourRows, dateKey(old));
  assert.equal(hours.length, 24);
  assert.equal(hours.reduce((sum, row) => sum + row.ms, 0), past.stats.ms);
  assert.equal(hours[10].ms + hours[11].ms, 2 * HOUR);
  assert.equal(dayHourTotals(past.hourRows, dateKey(old), 'notion.so').reduce((sum, row) => sum + row.ms, 0), focusSummary(past.stats, 'notion.so').ms);
  assert.deepEqual(past.spans.map(span => span.domain).sort(), ['github.com', 'notion.so']);
  assert.equal(past.todayStats.ms, 2 * HOUR);
  assert.equal(timelineUsesHours(old, now), true);

  const yesterday = viewFromSnapshot(data, { ...customRange('2026-10-19', '2026-10-19'), today });
  assert.deepEqual(yesterday.spans.map(span => span.domain), ['youtube.com']);
  assert.equal(yesterday.stats.ms, 2 * HOUR + 30 * 60_000);
  assert.equal(focusSummary(yesterday.stats, 'youtube.com').ms, yesterday.stats.ms);
  assert.equal(timelineUsesHours(at(10, 19), now), false);
});
