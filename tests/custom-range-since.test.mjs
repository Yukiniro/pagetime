process.env.TZ = 'UTC';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const { dateKey, midnight } = await import('../src/model.mjs');
const { applyCustomRange, customRange, presetRange } = await import('../src/range.mjs');

const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test('a custom range before since is rejected and does not call onChange', () => {
  const since = at(15, 15, 30);
  const calls = [];
  const onChange = (range) => calls.push(range);
  assert.equal(applyCustomRange('2026-10-01', '2026-10-20', since, onChange), false);
  assert.equal(applyCustomRange('2026-10-01', '2026-10-15', since, onChange), false);
  assert.equal(applyCustomRange('2026-10-14', '2026-10-14', since, onChange), false);
  assert.equal(customRange('2026-10-01', '2026-10-20', since), null);
  assert.deepEqual(calls, []);
});

test('the local day of since can be applied and is not clamped', () => {
  const since = at(15, 23, 59);
  const calls = [];
  assert.equal(applyCustomRange('2026-10-15', '2026-10-21', since, (range) => calls.push(range)), true);
  assert.deepEqual(calls, [{ preset: 'custom', start: at(15), end: at(22) }]);
  assert.equal(dateKey(calls[0].start), '2026-10-15');
  assert.equal(midnight(since), calls[0].start);
  const single = customRange('2026-10-16', '2026-10-16', since);
  assert.equal(single.start, at(16));
  assert.notEqual(single.start, midnight(since));
});

test('an end day before the start day is still rejected', () => {
  const since = at(1);
  const calls = [];
  assert.equal(customRange('2026-10-19', '2026-10-18', since), null);
  assert.equal(applyCustomRange('2026-10-19', '2026-10-18', since, () => calls.push('called')), false);
  assert.equal(customRange('2026-02-31', '2026-10-18', since), null);
  assert.deepEqual(calls, []);
});

test('presets stay unbounded and omitting since still builds the closed interval', () => {
  const today = at(21, 12);
  const since = at(15, 15);
  const month = presetRange('30d', today);
  assert.equal(month.preset, '30d');
  assert.ok(month.start < midnight(since));
  const early = customRange('2026-10-01', '2026-10-02');
  assert.equal(early.start, at(1));
  assert.equal(early.end, at(3));
  assert.equal(customRange('2026-10-01', '2026-10-02', since), null);
});

test('a non-finite since is rejected and timestamp 0 is a real lower bound', () => {
  const calls = [];
  const onChange = () => calls.push('called');
  assert.equal(applyCustomRange('2026-10-21', '2026-10-21', Number.NaN, onChange), false);
  assert.equal(customRange('2026-10-21', '2026-10-21', Number.POSITIVE_INFINITY), null);
  assert.equal(customRange('1970-01-01', '1970-01-02', 0).start, Date.parse('1970-01-01T00:00:00Z'));
  assert.equal(customRange('1969-12-31', '1970-01-02', 0), null);
  const later = at(22, 1);
  assert.equal(customRange('2026-10-21', '2026-10-21', later), null);
  assert.equal(customRange('2026-10-22', '2026-10-22', later).start, at(22));
  assert.deepEqual(calls, []);
});

test('RangeControl limits both custom date inputs to the since day and today', () => {
  const source = readFileSync(new URL('../src/RangeControl.jsx', import.meta.url), 'utf8');
  assert.equal(source.match(/min=\{dateKey\(since\)\}/g).length, 2);
  assert.equal(source.match(/max=\{dateKey\(today\)\}/g).length, 2);
  const apply = source.match(/function applyCustom\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(apply, /applyCustomRange\(draftStart, draftEnd, since, onChange\)/);
  assert.match(apply, /if \(!applyCustomRange\(draftStart, draftEnd, since, onChange\)\) return;/);
  assert.ok(apply.indexOf('onChange') < apply.indexOf('setDrafting(false)'));
  assert.equal(apply.match(/onChange/g).length, 1);
  assert.match(source, /disabled=\{!draftRange\}/);
});
