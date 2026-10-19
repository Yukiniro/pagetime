import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addDays, splitByHour } from '../src/model.mjs';
import { weekHourMatrix, weekStartOf } from '../src/heatmap.mjs';
import { viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const cell = (matrix, weekday, hour) => matrix.cells.find(item => item.weekday === weekday && item.hour === hour);

test('week start follows the locale and falls back to Monday', () => {
  assert.equal(weekStartOf('en'), 0);
  assert.equal(weekStartOf('en-US'), 0);
  assert.equal(weekStartOf('zh-TW'), 0);
  assert.equal(weekStartOf('ja'), 0);
  assert.equal(weekStartOf('pt-BR'), 0);
  assert.equal(weekStartOf('zh-CN'), 1);
  assert.equal(weekStartOf('de'), 1);
  assert.equal(weekStartOf('ru'), 1);
  assert.equal(weekStartOf('not a locale'), 1);
  assert.equal(weekStartOf(undefined), 1);
});

test('each weekday-hour average uses only days after since and through today, and hour sums restore daily totals', () => {
  const from = at(10, 1);
  const today = at(10, 18);
  const to = at(10, 19);
  const since = at(10, 5, 15);
  const rows = [
    { date: '2026-10-04', hour: 14, ms: 999 },
    { date: '2026-10-07', hour: 14, ms: 1_800_000 },
    { date: '2026-10-14', hour: 14, ms: 1_000_000 },
    { date: '2026-10-14', hour: 14, ms: 1_880_000 },
    { date: '2026-10-05', hour: 9, ms: 60_000 },
    { date: '2026-10-18', hour: 23, ms: 120_000 },
    { date: '2026-10-19', hour: 10, ms: 50_000 },
    { date: '2026-10-14', hour: 24, ms: 40_000 },
    { date: '2026-10-14', hour: 1.5, ms: 40_000 },
  ];
  const matrix = weekHourMatrix(rows, from, to, since, 1, today);
  assert.deepEqual(matrix.weekdays, [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(matrix.cells.length, 7 * 24);
  assert.equal(cell(matrix, 3, 14).ms, 4_680_000);
  assert.equal(cell(matrix, 3, 14).days, 2);
  assert.equal(cell(matrix, 3, 14).average, 2_340_000);
  assert.equal(cell(matrix, 1, 9).ms, 60_000);
  assert.equal(cell(matrix, 1, 9).average, 30_000);
  assert.equal(cell(matrix, 0, 23).ms, 120_000);
  assert.equal(cell(matrix, 0, 23).average, 60_000);
  assert.equal(cell(matrix, 2, 14).ms, 0);
  assert.ok(matrix.cells.every(item => item.days === 2));
  const dailyTotal = 4_860_000;
  assert.equal(matrix.cells.reduce((sum, item) => sum + item.ms, 0), dailyTotal);
  assert.equal(matrix.cells.reduce((sum, item) => sum + item.average * item.days, 0), dailyTotal);

  const sundayFirst = weekHourMatrix(rows, from, to, since, 0, today);
  assert.deepEqual(sundayFirst.weekdays, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(cell(sundayFirst, 3, 14).row, 3);
  assert.equal(weekHourMatrix(rows, from, to, since, 9, today).weekdays[0], 1);
});

test('a one-millisecond bucket split across two days still restores the daily total', () => {
  const from = at(10, 12);
  const today = at(10, 19);
  const matrix = weekHourMatrix(
    [{ date: '2026-10-12', hour: 8, ms: 1 }],
    from, addDays(today, 1), from, 1, today,
  );
  const monday = cell(matrix, 1, 8);
  assert.equal(monday.days, 2);
  assert.equal(monday.ms, 1);
  assert.equal(monday.average * monday.days, 1);
  assert.equal(matrix.cells.reduce((sum, item) => sum + item.ms, 0), 1);
});

test('days before since and an empty range contribute no active time', () => {
  const rows = [{ date: '2026-10-01', hour: 8, ms: 5_000 }];
  const after = weekHourMatrix(rows, at(10, 1), at(10, 8), at(10, 20), 1, at(10, 7));
  assert.equal(after.cells.reduce((sum, item) => sum + item.ms, 0), 0);
  assert.ok(after.cells.every(item => item.days === 0 && item.average === 0));
  const empty = weekHourMatrix([], at(10, 12), at(10, 19), at(10, 1), 1, at(10, 18));
  assert.equal(empty.cells.length, 168);
  assert.equal(empty.cells.reduce((sum, item) => sum + item.ms, 0), 0);
});

test('preview spans and ledger hour rows, including the open segment, restore the trend total', () => {
  const start = at(10, 12);
  const today = at(10, 18);
  const end = at(10, 19);
  const spanStart = at(10, 14, 14, 10);
  const spanEnd = at(10, 14, 16, 0);
  const preview = viewFromSnapshot({
    enabled: true,
    since: at(10, 5),
    visits: [],
    spans: [{ domain: 'github.com', start: spanStart, end: spanEnd }, { domain: 'youtube.com', start: at(10, 1, 9), end: at(10, 1, 10) }],
  }, { start, end, today });
  const previewMatrix = weekHourMatrix(preview.hourRows, start, end, preview.since, 1, today);
  assert.equal(previewMatrix.cells.reduce((sum, item) => sum + item.ms, 0), spanEnd - spanStart);
  assert.equal(cell(previewMatrix, 3, 14).ms, 50 * 60_000);
  assert.equal(cell(previewMatrix, 3, 15).ms, 60 * 60_000);

  const segmentStart = at(10, 18, 23, 30);
  const now = at(10, 18, 23, 50);
  const ledger = viewFromLedger({
    state: { enabled: true, since: start },
    domains: [{ id: 1, host: 'a.test' }, { id: 2, host: 'b.test' }],
    days: [
      { date: '2026-10-14', domainId: 1, ms: 1_000_000, visits: 0 },
      { date: '2026-10-14', domainId: 2, ms: 1_880_000, visits: 0 },
      { date: '2026-10-12', domainId: 1, ms: 60_000, visits: 1 },
    ],
    hours: [
      { date: '2026-10-14', hour: 14, domainId: 1, ms: 1_000_000 },
      { date: '2026-10-14', hour: 14, domainId: 2, ms: 1_880_000 },
      { date: '2026-10-12', hour: 9, domainId: 1, ms: 60_000 },
    ],
    spans: [],
    visits: [],
    cursor: { domain: 'a.test', since: segmentStart, session: 's' },
    lastEnd: segmentStart,
  }, { start, end, today, now });
  const matrix = weekHourMatrix(ledger.hourRows, start, end, ledger.since, 1, today);
  const daily = ledger.days.reduce((sum, day) => sum + day.ms, 0);
  assert.equal(matrix.cells.reduce((sum, item) => sum + item.ms, 0), daily);
  assert.equal(matrix.cells.reduce((sum, item) => sum + item.average * item.days, 0), daily);
  assert.equal(cell(matrix, 0, 23).ms, 90_000);
  assert.equal(splitByHour(segmentStart, now).reduce((sum, piece) => sum + piece.end - piece.start, 0), now - segmentStart);
});

test('spring-forward leaves the missing hour empty and fall-back merges the repeated hour', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { splitByHour, HOUR } from './src/model.mjs';
    import { weekHourMatrix } from './src/heatmap.mjs';
    const springStart = new Date(2026, 2, 8, 1, 30).getTime();
    const springEnd = new Date(2026, 2, 8, 3, 30).getTime();
    const spring = splitByHour(springStart, springEnd);
    assert.deepEqual(spring.map(piece => piece.hour), [1, 3]);
    assert.equal(spring.reduce((sum, piece) => sum + piece.end - piece.start, 0), springEnd - springStart);
    const fallStart = Date.parse('2026-11-01T05:30:00Z');
    const fallEnd = Date.parse('2026-11-01T06:30:00Z');
    const fall = splitByHour(fallStart, fallEnd);
    assert.deepEqual(fall.map(piece => piece.hour), [1, 1]);
    assert.equal(fall.reduce((sum, piece) => sum + piece.end - piece.start, 0), HOUR);
    const day = new Date(2026, 10, 1).getTime();
    const matrix = weekHourMatrix(fall.map(piece => ({ date: piece.date, hour: piece.hour, ms: piece.end - piece.start })), day, new Date(2026, 10, 2).getTime(), day, 0, day);
    assert.equal(matrix.cells.find(item => item.weekday === 0 && item.hour === 1).ms, HOUR);
    assert.equal(matrix.cells.find(item => item.weekday === 0 && item.hour === 2).ms, 0);
    assert.equal(matrix.cells.reduce((sum, item) => sum + item.ms, 0), HOUR);
    const springDay = new Date(2026, 2, 8).getTime();
    const springMatrix = weekHourMatrix(spring.map(piece => ({ date: piece.date, hour: piece.hour, ms: piece.end - piece.start })), springDay, new Date(2026, 2, 9).getTime(), springDay, 0, springDay);
    assert.equal(springMatrix.cells.find(item => item.hour === 2).ms, 0);
    assert.equal(springMatrix.cells.find(item => item.hour === 1).ms, 1_800_000);
    assert.equal(springMatrix.cells.find(item => item.hour === 3).ms, 1_800_000);
    assert.equal(springMatrix.cells.reduce((sum, item) => sum + item.average * item.days, 0), springEnd - springStart);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
    timeout: 8_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
