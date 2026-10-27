process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { readFileSync, readdirSync } = await import('node:fs');
const { presetRange, timelineDay, timelineUsesHours } = await import('../src/range.mjs');
const { spansOnDay } = await import('../src/timeline-select.mjs');
const { timelineCopy } = await import('../src/timeline-copy.mjs');

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const today = at(10, 20);
const now = at(10, 20, 16);
const yesterday = at(10, 19);
const week = presetRange('7d', today);

function nextMidnight(day) {
  const date = new Date(day);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const span = { domain: 'github.com', site: 'github.com', start: at(10, 19, 10), end: at(10, 19, 11, 30) };

// The empty sentence is the session timeline's. Hour bars occupy that slot themselves.
function emptyKey(day, spans, hoursMode) {
  const copy = timelineCopy(day, today);
  if (hoursMode || spansOnDay(spans, day).length) return { ...copy, emptyKey: null };
  return copy;
}

const todayKeys = { today: true, titleKey: 'timeline.title', labelKey: 'timeline.label', emptyKey: 'timeline.empty' };
const dayKeys = { today: false, titleKey: 'timeline.dayTitle', labelKey: 'timeline.dayLabel', emptyKey: 'timeline.dayEmpty' };

test('today keeps the existing timeline title and empty copy', () => {
  const day = timelineDay(presetRange('today', today), today);
  assert.equal(day, today);
  assert.equal(timelineUsesHours(day, now), false);
  assert.deepEqual(emptyKey(day, [], false), todayKeys);
});

test('yesterday with spans uses the day title and hides the empty line', () => {
  const range = { preset: 'custom', start: yesterday, end: today };
  const day = timelineDay(range, today);
  assert.equal(day, yesterday);
  assert.equal(timelineUsesHours(day, now), false);
  assert.equal(spansOnDay([span], day).length, 1);
  assert.deepEqual(emptyKey(day, [span], false), { ...dayKeys, emptyKey: null });
});

test('an empty yesterday shows the dated empty line', () => {
  const range = { preset: 'custom', start: yesterday, end: today };
  const day = timelineDay(range, today);
  assert.deepEqual(emptyKey(day, [], false), dayKeys);
  assert.deepEqual(emptyKey(day, [{ ...span, start: today, end: at(10, 20, 1) }], false), dayKeys);
});

test('a multi-day range keeps today’s timeline copy', () => {
  const day = timelineDay(week, today);
  assert.equal(day, today);
  assert.deepEqual(emptyKey(day, [], false), todayKeys);
  assert.deepEqual(timelineCopy(day, today), todayKeys);
});

test('a single day past detail retention keeps the day title and does not add the timeline empty line', () => {
  const old = at(9, 19);
  const range = { preset: 'custom', start: old, end: nextMidnight(old) };
  const day = timelineDay(range, today);
  assert.equal(day, old);
  assert.equal(timelineUsesHours(day, now), true);
  assert.deepEqual(timelineCopy(day, today), dayKeys);
  assert.equal(emptyKey(day, [], true).emptyKey, null);
  assert.equal(emptyKey(day, [span], true).emptyKey, null);
});

const todayWord = {
  en: /today/i,
  'zh-CN': /今日|今天/,
  'zh-TW': /今日|今天/,
  ja: /今日/,
  ko: /오늘/,
  de: /heut(?:ig)?e/i,
  es: /hoy/i,
  fr: /aujourd|du jour/i,
  'pt-BR': /hoje/i,
  ru: /сегодня/i,
};

test('every locale names another day without saying today, and keeps today’s strings', () => {
  const dir = new URL('../src/locales/', import.meta.url);
  const codes = readdirSync(dir).filter(file => file.endsWith('.json')).map(file => file.replace(/\.json$/, ''));
  assert.deepEqual(codes.sort(), Object.keys(todayWord).sort());
  for (const code of codes) {
    const timeline = JSON.parse(readFileSync(new URL(`${code}.json`, dir), 'utf8')).timeline;
    const dayLabels = Object.keys(timeline).filter(key => key.startsWith('dayLabel_'));
    const todayLabels = Object.keys(timeline).filter(key => /^label_/.test(key));
    assert.deepEqual(dayLabels.sort(), todayLabels.map(key => `day${key[0].toUpperCase()}${key.slice(1)}`).sort(), code);
    for (const key of ['dayTitle', 'dayEmpty', ...dayLabels]) assert.doesNotMatch(timeline[key], todayWord[code], `${code} ${key}`);
    for (const key of ['title', 'empty', ...todayLabels]) assert.match(timeline[key], todayWord[code], `${code} ${key}`);
    assert.match(timeline.dayEmpty, /\{\{date\}\}/);
    assert.doesNotMatch(timeline.dayTitle, /\{\{/);
    for (const key of dayLabels) {
      assert.match(timeline[key], /\{\{date\}\}/);
      assert.match(timeline[key], /\{\{count\}\}/);
    }
  }
});

test('the chart title follows the selected day, and hour bars do not add a second empty line', () => {
  const overview = readFileSync(new URL('../src/overview.jsx', import.meta.url), 'utf8');
  const charts = readFileSync(new URL('../src/charts.jsx', import.meta.url), 'utf8');
  const timeline = charts.slice(charts.indexOf('export function Timeline'), charts.indexOf('export function Breakdown'));
  const hours = overview.slice(overview.indexOf('hoursMode ? ('), overview.indexOf(': (showTimeline'));
  assert.match(overview, /const copy = timelineCopy\(chartDay, today\)/);
  assert.match(overview, /const timelineTitle = t\(copy\.titleKey\)/);
  assert.match(overview, /<h2(?: className="sr-only")?>\{chart === 'timeline' \? timelineTitle : trendTitle\}<\/h2>/);
  assert.match(overview, /showEmpty labelKey=\{copy\.labelKey\} emptyKey=\{copy\.emptyKey\} date=\{timelineDate\}/);
  assert.doesNotMatch(overview, /t\('timeline\.title'\)|midnight\(chartDay\) === midnight\(today\)/);
  assert.doesNotMatch(hours, /<Timeline|timeline-empty/);
  assert.match(hours, /<DayHourChart /);
  assert.match(timeline, /label=\{t\(labelKey,\{count:today\.length,date\}\)\}/);
  assert.match(timeline, /\{showEmpty&&!today\.length&&<p className="timeline-empty">\{t\(emptyKey,\{date\}\)\}<\/p>\}/);
  assert.doesNotMatch(timeline, /t\('timeline\.label'|t\('timeline\.empty'/);
});
