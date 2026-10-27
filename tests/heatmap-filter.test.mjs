import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayHourTotals, viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';
import { heatmapHasActivity, weekHourMatrix } from '../src/heatmap.mjs';

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const cell = (matrix, weekday, hour) => matrix.cells.find(item => item.weekday === weekday && item.hour === hour);
const total = matrix => matrix.cells.reduce((sum, item) => sum + item.ms, 0);

const from = at(10, 7);
const today = at(10, 18);
const to = at(10, 19);
const since = at(10, 1);
const args = [from, to, since, 1, today];

// Oct 7 and Oct 14 are the Wednesdays inside Oct 7–18. Oct 4 is before the range. Oct 19 is after today.
const rows = [
  { date: '2026-10-14', hour: 9, ms: 2 * 3_600_000, site: 'github.com' },
  { date: '2026-10-14', hour: 9, ms: 30 * 60_000, site: 'youtube.com' },
  { date: '2026-10-14', hour: 21, ms: 20 * 60_000, site: 'youtube.com' },
  { date: '2026-10-07', hour: 9, ms: 3_600_000, site: 'github.com' },
  { date: '2026-10-04', hour: 9, ms: 9_000_000, site: 'github.com' },
  { date: '2026-10-19', hour: 9, ms: 9_000_000, site: 'youtube.com' },
  { date: '2026-10-14', hour: 15, ms: 40_000 },
  { date: '2026-10-14', hour: 16, ms: 0, site: 'notion.so' },
  { date: '2026-10-14', hour: 24, ms: 80_000, site: 'github.com' },
];

test('an empty site sums every in-window row and keeps the weekday denominators', () => {
  const matrix = weekHourMatrix(rows, ...args);
  const cleared = weekHourMatrix(rows, ...args, '');
  assert.deepEqual(cleared.cells, matrix.cells);
  assert.equal(cell(matrix, 3, 9).ms, 2 * 3_600_000 + 30 * 60_000 + 3_600_000);
  assert.equal(cell(matrix, 3, 9).days, 2);
  assert.equal(cell(matrix, 3, 9).average, cell(matrix, 3, 9).ms / 2);
  assert.equal(cell(matrix, 3, 21).ms, 20 * 60_000);
  assert.equal(cell(matrix, 3, 15).ms, 40_000);
  assert.equal(cell(matrix, 3, 16).ms, 0);
  assert.equal(total(matrix), cell(matrix, 3, 9).ms + cell(matrix, 3, 21).ms + 40_000);
  assert.equal(heatmapHasActivity(rows, from, to, since, today), true);
  assert.equal(heatmapHasActivity(null, from, to, since, today, 'github.com'), false);
});

test('a site filter averages only that merged key and still divides by every weekday in the window', () => {
  const github = weekHourMatrix(rows, ...args, 'github.com');
  const youtube = weekHourMatrix(rows, ...args, 'youtube.com');
  const unfiltered = weekHourMatrix(rows, ...args);
  assert.equal(cell(github, 3, 9).ms, 3 * 3_600_000);
  assert.equal(cell(github, 3, 9).days, 2);
  assert.equal(cell(github, 3, 9).average, (3 * 3_600_000) / 2);
  assert.equal(cell(github, 3, 21).ms, 0);
  assert.equal(cell(github, 3, 15).ms, 0);
  assert.equal(cell(youtube, 3, 9).ms, 30 * 60_000);
  assert.equal(cell(youtube, 3, 21).ms, 20 * 60_000);
  assert.equal(cell(youtube, 3, 21).average, 10 * 60_000);
  assert.equal(total(github) + total(youtube) + 40_000, total(unfiltered));
  assert.ok(github.cells.every((item, index) => item.days === unfiltered.cells[index].days));
  assert.equal(heatmapHasActivity(rows, from, to, since, today, 'github.com'), true);
  const day = at(10, 14);
  const bars = dayHourTotals(rows, '2026-10-14', 'github.com');
  const oneDay = weekHourMatrix(rows, day, at(10, 15), since, 1, day, 'github.com');
  for (const bar of bars) assert.equal(cell(oneDay, 3, bar.hour).ms, bar.ms);
});

test('a filtered site with no in-window hour rows is empty while other sites stay on the unfiltered matrix', () => {
  const notion = weekHourMatrix(rows, ...args, 'notion.so');
  const unfiltered = weekHourMatrix(rows, ...args);
  assert.equal(total(notion), 0);
  assert.ok(notion.cells.every(item => item.average === 0));
  assert.ok(notion.cells.every((item, index) => item.days === unfiltered.cells[index].days && item.days > 0));
  assert.equal(heatmapHasActivity(rows, from, to, since, today, 'notion.so'), false);
  const outside = [{ date: '2026-10-04', hour: 9, ms: 3_600_000, site: 'github.com' }];
  assert.equal(heatmapHasActivity(outside, from, to, since, today, 'github.com'), false);
  assert.equal(total(weekHourMatrix(outside, ...args, 'github.com')), 0);
  assert.equal(heatmapHasActivity(rows, from, to, since, today), true);
  assert.equal(heatmapHasActivity([{ date: '2026-10-14', hour: 9, ms: 0, site: 'github.com' }], from, to, since, today, 'github.com'), false);
});

test('preview and ledger hour rows carry the merged site, including the open cursor', () => {
  const start = at(10, 14);
  const end = at(10, 15);
  const preview = viewFromSnapshot({
    enabled: true,
    since: at(10, 1),
    visits: [{ domain: 'www.youtube.com', at: at(10, 14, 9) }],
    spans: [
      { domain: 'www.youtube.com', start: at(10, 14, 9), end: at(10, 14, 10) },
      { domain: 'm.youtube.com', start: at(10, 14, 10), end: at(10, 14, 10, 30) },
      { domain: 'github.com', start: at(10, 14, 21), end: at(10, 14, 22) },
    ],
  }, { start, end, today: start });
  assert.deepEqual(preview.hourRows.map(row => row.site), ['youtube.com', 'youtube.com', 'github.com']);
  const previewArgs = [start, end, preview.since, 1, start];
  assert.equal(total(weekHourMatrix(preview.hourRows, ...previewArgs, 'youtube.com')), 90 * 60_000);
  assert.equal(total(weekHourMatrix(preview.hourRows, ...previewArgs, 'github.com')), 3_600_000);
  assert.equal(heatmapHasActivity(preview.hourRows, start, end, preview.since, start, 'notion.so'), false);
  assert.equal(heatmapHasActivity(preview.hourRows, start, end, preview.since, start, 'www.youtube.com'), false);

  const segmentStart = at(10, 18, 23, 30);
  const now = at(10, 18, 23, 50);
  const ledger = viewFromLedger({
    state: { enabled: true, since: at(10, 12) },
    domains: [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }],
    days: [],
    hours: [
      { date: '2026-10-14', hour: 14, domainId: 2, ms: 1_880_000 },
      { date: '2026-10-14', hour: 8, domainId: 9, ms: 5_000 },
    ],
    spans: [],
    visits: [],
    cursor: { domain: 'a.test', since: segmentStart, session: 's' },
    lastEnd: segmentStart,
  }, { start: at(10, 12), end: at(10, 19), today: at(10, 18), now });
  assert.ok(ledger.hourRows.some(row => row.site === 'a.test' && row.ms > 0));
  assert.ok(ledger.hourRows.some(row => row.site === '' && row.ms === 5_000));
  const window = [at(10, 12), at(10, 19), ledger.since, 1, at(10, 18)];
  const open = weekHourMatrix(ledger.hourRows, ...window, 'a.test');
  const other = weekHourMatrix(ledger.hourRows, ...window, 'b.test');
  const all = weekHourMatrix(ledger.hourRows, ...window);
  // The 20-minute cursor is credited only up to the gap cap, and that fragment keeps the cursor site.
  assert.equal(cell(open, 0, 23).ms, 90_000);
  assert.equal(cell(open, 3, 14).ms, 0);
  assert.equal(cell(other, 3, 14).ms, 1_880_000);
  assert.equal(cell(other, 0, 23).ms, 0);
  assert.equal(cell(all, 3, 8).ms, 5_000);
  assert.equal(cell(open, 3, 8).ms, 0);
  assert.equal(total(all), total(open) + total(other) + 5_000);
});

test('the overview heatmap uses the site match and the clear-filter empty state', () => {
  const overview = readFileSync(new URL('../src/overview.jsx', import.meta.url), 'utf8');
  const panel = overview.slice(overview.indexOf('heatmap-fold'));
  const charts = readFileSync(new URL('../src/charts.jsx', import.meta.url), 'utf8');
  const heatmap = charts.slice(charts.indexOf('export function Heatmap'), charts.indexOf('export function Timeline'));
  assert.match(overview, /const showHeatmap = !filtered \|\| heatmapHasActivity\(hourRows, start, end, since, today, filterSite\)/);
  assert.match(panel, /site=\{filterSite\}/);
  assert.match(panel, /<FilterEmpty domain=\{filterSite\} onClear=\{\(\) => onFilter\(''\)\} \/>/);
  assert.match(panel, /Hour cells are not a filter; filtering by hour is deferred/);
  assert.doesNotMatch(heatmap, /onClick|onSelectSite|<button/);
  assert.match(heatmap, /weekHourMatrix\(rows,start,end,since,weekStartOf\(i18n\.resolvedLanguage\),today,site\)/);
});
