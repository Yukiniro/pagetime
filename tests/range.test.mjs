import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daily, dateKey, summarize } from '../src/model.mjs';
import { viewFromSnapshot } from '../src/ledger-view.mjs';
import { focusSummary } from '../src/site-filter.mjs';
import { activeRange, customRange, dayCount, defaultChart, presetRange, trendWindow } from '../src/range.mjs';

const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const HOUR = 3_600_000;
const today = at(19);

const data = {
  enabled: true,
  since: at(1),
  visits: [
    { domain: 'a.test', at: at(12, 12) },
    { domain: 'a.test', at: at(13, 8) },
    { domain: 'a.test', at: at(18, 23, 30) },
    { domain: 'b.test', at: at(19, 1) },
    { domain: 'b.test', at: at(20, 1) },
  ],
  spans: [
    { domain: 'a.test', start: at(12, 10), end: at(12, 11) },
    { domain: 'a.test', start: at(18, 23), end: at(19, 2) },
    { domain: 'b.test', start: at(19, 9), end: at(19, 10) },
  ],
};

function view(range) {
  return viewFromSnapshot(data, { ...range, today });
}

test('presets include today and stop at local midnights', () => {
  const one = presetRange('today', today);
  const week = presetRange('7d', today);
  const month = presetRange('30d', today);
  assert.deepEqual(one, { preset: 'today', start: at(19), end: at(20) });
  assert.deepEqual(week, { preset: '7d', start: at(13), end: at(20) });
  assert.deepEqual(month, { preset: '30d', start: at(19 - 29), end: at(20) });
  assert.equal(dateKey(month.start), '2026-09-20');
  assert.equal(dayCount(one.start, one.end), 1);
  assert.equal(dayCount(week.start, week.end), 7);
  assert.equal(dayCount(month.start, month.end), 30);
  assert.equal(activeRange({ preset: '7d' }, at(19, 15)).start, at(13));
  assert.equal(presetRange('year', today), null);
});

test('a custom range is a closed local-day interval and rejects an end before the start', () => {
  const both = customRange('2026-10-18', '2026-10-19');
  const single = customRange('2026-10-18', '2026-10-18');
  assert.deepEqual(both, { preset: 'custom', start: at(18), end: at(20) });
  assert.equal(dayCount(single.start, single.end), 1);
  assert.equal(customRange('2026-10-19', '2026-10-18'), null);
  assert.equal(customRange('2026-02-31', '2026-10-18'), null);
  assert.equal(customRange('nope', '2026-10-18'), null);
  assert.equal(activeRange(both, today).start, at(18));
});

test('summarize and the ledger view cut a span on the local midnight', () => {
  const one = presetRange('today', today);
  const week = presetRange('7d', today);
  const todayStats = summarize(data, one.start, one.end);
  const weekStats = summarize(data, week.start, week.end);
  assert.equal(todayStats.ms, 3 * HOUR);
  assert.equal(todayStats.visits, 1);
  assert.equal(weekStats.ms, 4 * HOUR);
  assert.equal(weekStats.visits, 3);
  assert.equal(summarize(data, at(12), at(13)).ms, HOUR);
  assert.equal(summarize(data, at(12), at(13)).visits, 1);

  const days = daily(data, week.start, week.end);
  assert.equal(days.length, 7);
  assert.equal(days[0].at, at(13));
  assert.equal(days.at(-1).at, today);
  assert.equal(days.find(day => day.at === at(18)).ms, HOUR);
  assert.equal(days.find(day => day.at === at(19)).ms, 3 * HOUR);
  assert.equal(view(week).stats.ms, weekStats.ms);
  assert.deepEqual(view(week).days.map(day => day.ms), days.map(day => day.ms));

  const eighteenth = customRange('2026-10-18', '2026-10-18');
  assert.equal(view(eighteenth).stats.ms, HOUR);
  assert.equal(view(eighteenth).stats.visits, 1);
  assert.equal(view(customRange('2026-10-18', '2026-10-19')).stats.ms, 4 * HOUR);
});

test('the same site filter is recomputed on the new range', () => {
  const week = focusSummary(view(presetRange('7d', today)).stats, 'a.test');
  const one = focusSummary(view(presetRange('today', today)).stats, 'a.test');
  assert.equal(week.ms, 3 * HOUR);
  assert.equal(week.visits, 2);
  assert.equal(one.ms, 2 * HOUR);
  assert.equal(one.visits, 0);
});

test('today opens the timeline and keeps a 7-day trend; other ranges open their own trend', () => {
  assert.equal(defaultChart(presetRange('today', today), today), 'timeline');
  assert.equal(defaultChart(customRange('2026-10-19', '2026-10-19'), today), 'timeline');
  assert.equal(defaultChart(presetRange('7d', today), today), 'trend');
  assert.equal(defaultChart(presetRange('30d', today), today), 'trend');
  assert.equal(defaultChart(customRange('2026-10-16', '2026-10-18'), today), 'trend');
  assert.deepEqual(trendWindow(presetRange('today', today), today), { start: at(13), end: at(20) });
  assert.deepEqual(trendWindow(presetRange('30d', today), today), { start: at(19 - 29), end: at(20) });
  const past = customRange('2026-10-12', '2026-10-12');
  assert.equal(view(past).stats.ms, HOUR);
  assert.equal(view(past).stats.visits, 1);
  assert.deepEqual(view(past).spans.map(span => span.domain).sort(), ['a.test', 'b.test']);
});
