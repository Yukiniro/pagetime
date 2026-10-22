import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { commitTick, openLedger, readDomains, readHead, siteDays, siteHours } from '../src/ledger.mjs';
import { detailSeriesArgs, siteSeries, siteSeriesFromSnapshot } from '../src/ledger-view.mjs';
import { addDays, dateKey } from '../src/model.mjs';
import { presetRange, trendWindow } from '../src/range.mjs';
import { siteOf } from '../src/site.mjs';

const at = (day, hour = 0, minute = 0, second = 0) => new Date(2026, 9, day, hour, minute, second).getTime();
const sum = rows => rows.reduce((total, row) => total + row.ms, 0);
const minute = count => count * 60_000;

// Oct 14–20 is the 7-day trend ending on Oct 20. Oct 13 sits just outside it. Recording starts Oct 16.
const blocks = [
  [13, 9, 180],
  [14, 9, 20],
  [15, 10, 45],
  [17, 9, 90],
  [18, 11, 15],
  [19, 14, 120],
  [20, 9, 50],
  [21, 8, 10],
];

function snapshot() {
  const spans = blocks.map(([day, hour, minutes]) => {
    const start = at(day, hour);
    return { domain: 'github.com', start, end: start + minute(minutes) };
  });
  const youtube = at(20, 21);
  spans.push({ domain: 'youtube.com', start: youtube, end: youtube + minute(20) });
  return {
    enabled: true,
    since: at(16),
    visits: spans.map(span => ({ domain: span.domain, at: span.start })),
    spans,
  };
}

function previewDetail(range, now = at(21, 12)) {
  return siteSeriesFromSnapshot(snapshot(), detailSeriesArgs({ ...range, detail: 'github.com' }, now));
}

const yesterday = { preset: 'custom', start: at(20), end: at(21) };

function assertYesterday(series) {
  const trend = trendWindow(yesterday);
  assert.equal(series.days.length, 7);
  assert.equal(series.days.at(-1).at, addDays(trend.end, -1));
  assert.equal(series.days[0].at, trend.start);
  assert.equal(dateKey(series.days.at(-1).at), '2026-10-20');
  assert.deepEqual(series.days.map(day => [dateKey(day.at), day.ms, day.recorded]), [
    ['2026-10-14', minute(20), false],
    ['2026-10-15', minute(45), false],
    ['2026-10-16', 0, true],
    ['2026-10-17', minute(90), true],
    ['2026-10-18', minute(15), true],
    ['2026-10-19', minute(120), true],
    ['2026-10-20', minute(50), true],
  ]);
  assert.equal(series.hourDays, 1);
  assert.equal(sum(series.hours), minute(50));
  assert.equal(series.hours[9].ms, minute(50));
  assert.equal(series.hours[21].ms, 0);
  assert.equal(series.days.some(day => dateKey(day.at) === '2026-10-13'), false);
}

test('a single day opens the site detail trend on the 7 days ending that day', () => {
  assertYesterday(previewDetail(yesterday));

  const today = at(21);
  const todaySeries = previewDetail(presetRange('today', today));
  const todayTrend = trendWindow(presetRange('today', today));
  assert.equal(todaySeries.days.length, 7);
  assert.equal(todaySeries.days[0].at, todayTrend.start);
  assert.equal(todaySeries.days.at(-1).at, addDays(todayTrend.end, -1));
  assert.equal(dateKey(todaySeries.days.at(-1).at), '2026-10-21');
  assert.equal(todaySeries.days.find(day => dateKey(day.at) === '2026-10-15').recorded, false);
  assert.equal(todaySeries.days.find(day => dateKey(day.at) === '2026-10-16').recorded, true);
  assert.equal(todaySeries.days.find(day => dateKey(day.at) === '2026-10-16').ms, 0);
  assert.equal(todaySeries.hourDays, 1);
  assert.equal(sum(todaySeries.hours), minute(10));
  assert.equal(sum(todaySeries.days), minute(45 + 90 + 15 + 120 + 50 + 10));
});

test('a multi-day range keeps the detail trend and the hour chart on the selected span', () => {
  const today = at(21);
  const now = at(21, 12);
  for (const range of [presetRange('7d', today), presetRange('30d', today)]) {
    const series = previewDetail(range, now);
    const days = series.days.length;
    assert.equal(days, range.preset === '7d' ? 7 : 30);
    assert.equal(series.days[0].at, range.start);
    assert.equal(series.days.at(-1).at, addDays(range.end, -1));
    assert.equal(series.hourDays, days);
    assert.equal(sum(series.hours), sum(series.days));
    assert.equal(series.hours[21].ms, 0);
  }
  const week = previewDetail(presetRange('7d', today), now);
  assert.equal(dateKey(week.days[0].at), '2026-10-15');
  assert.equal(week.days.some(day => dateKey(day.at) === '2026-10-14'), false);
  assert.equal(sum(week.days), minute(45 + 90 + 15 + 120 + 50 + 10));
  const month = previewDetail(presetRange('30d', today), now);
  assert.equal(month.days.find(day => dateKey(day.at) === '2026-10-13').ms, minute(180));
  assert.equal(sum(month.days), minute(180 + 20 + 45 + 90 + 15 + 120 + 50 + 10));
});

test('a span crossing midnight counts in both trend days and only the selected day in the hour chart', () => {
  const data = {
    enabled: true,
    since: at(1),
    visits: [],
    spans: [{ domain: 'github.com', start: at(19, 23, 30), end: at(20, 0, 20) }],
  };
  const series = siteSeriesFromSnapshot(data, detailSeriesArgs({ ...yesterday, detail: 'github.com' }, at(21, 12)));
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-19').ms, minute(30));
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-20').ms, minute(20));
  assert.equal(series.hours[23].ms, 0);
  assert.equal(series.hours[0].ms, minute(20));
  assert.equal(sum(series.hours), minute(20));
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-19').recorded, true);
});

test('open credit on a single day updates that trend day and that day\'s hours', () => {
  const now = at(20, 0, 0, 40);
  const args = detailSeriesArgs({ ...yesterday, detail: 'github.com' }, now);
  const domains = [{ id: 1, host: 'github.com' }];
  const days = [{ date: '2026-10-19', domainId: 1, ms: minute(1) }];
  const hours = [];
  const cursor = { domain: 'github.com', since: at(19, 23, 59, 20) };
  const series = siteSeries({
    domains, days, hours, state: { enabled: true, since: at(18) }, cursor, lastEnd: cursor.since,
  }, args);
  assert.equal(series.days.length, 7);
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-17').recorded, false);
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-18').recorded, true);
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-19').ms, minute(1) + 40_000);
  assert.equal(series.days.find(day => dateKey(day.at) === '2026-10-20').ms, 40_000);
  assert.equal(series.hours[23].ms, 0);
  assert.equal(series.hours[0].ms, 40_000);
  assert.equal(series.hourDays, 1);
  const paused = siteSeries({
    domains, days, hours, state: { enabled: false, since: at(18) }, cursor, lastEnd: cursor.since,
  }, args);
  assert.equal(paused.days.find(day => dateKey(day.at) === '2026-10-19').ms, minute(1));
  assert.equal(paused.days.find(day => dateKey(day.at) === '2026-10-20').ms, 0);
  assert.equal(sum(paused.hours), 0);
});

test('the extension detail query uses the trend day keys and the selected hour keys', async () => {
  const db = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  const ordered = [[17, 9, 90], ...blocks.filter(([day]) => day !== 17)];
  for (const [day, hour, minutes] of ordered) {
    const start = at(day, hour);
    await commitTick(db, {
      expect: await readHead(db),
      now: day === 17 ? at(16) : start + minute(minutes),
      span: { domain: 'github.com', start, end: start + minute(minutes) },
      cursor: null,
    });
  }
  const youtube = at(20, 21);
  await commitTick(db, {
    expect: await readHead(db),
    now: youtube + minute(20),
    span: { domain: 'youtube.com', start: youtube, end: youtube + minute(20) },
    cursor: null,
  });
  const args = detailSeriesArgs({ ...yesterday, detail: 'github.com' }, at(21, 12));
  assert.equal(args.dayFrom, '2026-10-14');
  assert.equal(args.dayTo, '2026-10-20');
  assert.equal(dateKey(args.start), args.dayTo);
  assert.equal(dateKey(addDays(args.end, -1)), args.dayTo);
  const domains = await readDomains(db);
  const head = await readHead(db);
  const ids = domains.filter(row => siteOf(row.host, 'prefix') === 'github.com').map(row => row.id);
  const [dayRows, hourRows] = await Promise.all([
    Promise.all(ids.map(id => siteDays(db, id, args.dayFrom, args.dayTo))),
    Promise.all(ids.map(id => siteHours(db, id, dateKey(args.start), dateKey(addDays(args.end, -1))))),
  ]);
  assert.equal(dayRows.flat().some(row => row.date === '2026-10-13'), false);
  assert.equal(hourRows.flat().every(row => row.date === '2026-10-20'), true);
  const series = siteSeries({
    domains, days: dayRows.flat(), hours: hourRows.flat(), state: head.state, cursor: head.cursor, lastEnd: head.lastEnd,
  }, args);
  assert.equal(head.state.since, at(16));
  assertYesterday(series);
});

test('the dashboard feeds the trend window into detail days and keeps the hour average on the selected range', () => {
  const hook = readFileSync(new URL('../src/use-ledger.js', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/SiteDetailPanel.jsx', import.meta.url), 'utf8');
  assert.match(hook, /siteDays\(db, id, detailArgs\.dayFrom, detailArgs\.dayTo\)/);
  assert.match(hook, /siteHours\(db, id, displayFrom, displayTo\)/);
  assert.match(hook, /siteSeriesFromSnapshot\(data, detailSeriesArgs\(range, now\)\)/);
  assert.match(panel, /dayCount=\{detail\.hourDays\}/);
  const charts = readFileSync(new URL('../src/Charts.jsx', import.meta.url), 'utf8');
  const siteTrend = charts.slice(charts.indexOf('export function SiteTrend'), charts.indexOf('export function HourChart'));
  assert.doesNotMatch(siteTrend, /onClick/);
});
