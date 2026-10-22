process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { addDays, midnight } = await import('../src/model.mjs');
const { viewFromSnapshot } = await import('../src/ledger-view.mjs');
const { focusSpans, focusSummary } = await import('../src/site-filter.mjs');
const { presetRange, timelineDay } = await import('../src/range.mjs');
const { clipDaySessions, daySessionCopy } = await import('../src/day-sessions.mjs');

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const pieceMs = pieces => pieces.reduce((sum, piece) => sum + piece.to - piece.from, 0);
const timelineMs = (spans, day, site) => {
  const start = midnight(day);
  const end = addDays(start, 1);
  return focusSpans(spans, site)
    .filter(span => span.end > start && span.start < end)
    .reduce((sum, span) => sum + Math.min(span.end, end) - Math.max(span.start, start), 0);
};

const today = at(10, 20);
const now = at(10, 20, 16);
const yesterday = at(10, 19);
const selected = 'github.com';

const data = {
  enabled: true,
  since: at(9, 1),
  visits: [
    { domain: 'www.github.com', at: at(10, 19, 9, 12) },
    { domain: 'github.com', at: at(10, 19, 14, 30) },
    { domain: 'youtube.com', at: at(10, 19, 14) },
    { domain: 'github.com', at: at(10, 20, 9) },
  ],
  spans: [
    { domain: 'www.github.com', start: at(10, 19, 9, 12), end: at(10, 19, 10, 5) },
    { domain: 'github.com', start: at(10, 19, 14, 30), end: at(10, 19, 15, 2) },
    { domain: 'github.com', start: at(10, 19, 23), end: at(10, 20, 1, 30) },
    { domain: 'youtube.com', start: at(10, 19, 14), end: at(10, 19, 16) },
    { domain: 'github.com', start: at(10, 20, 9), end: at(10, 20, 10) },
  ],
};

function openSessions(range, site) {
  const view = viewFromSnapshot(data, { ...range, today });
  const day = timelineDay(range, today);
  const sessions = view.spans.filter(span => (span.site ?? span.domain) === site);
  return { view, day, sessions, pieces: clipDaySessions(sessions, day) };
}

test('yesterday’s sessions stay on that day and add up to the timeline', () => {
  const range = { preset: 'custom', start: yesterday, end: today };
  const { view, day, sessions, pieces } = openSessions(range, selected);
  assert.equal(day, yesterday);
  assert.equal(daySessionCopy(day, now).today, false);
  assert.deepEqual(pieces.map(piece => [piece.from, piece.to]), [
    [at(10, 19, 9, 12), at(10, 19, 10, 5)],
    [at(10, 19, 14, 30), at(10, 19, 15, 2)],
    [at(10, 19, 23), today],
  ]);
  assert.equal(pieceMs(pieces), timelineMs(view.spans, day, selected));
  assert.equal(pieceMs(pieces), focusSummary(view.stats, selected).ms);
  const endedYesterday = sessions.filter(span => span.end <= today);
  assert.deepEqual(clipDaySessions(endedYesterday, today), []);
  for (const piece of pieces) assert.ok(piece.to > piece.from);
  const frozen = sessions.map(span => ({ ...span }));
  clipDaySessions(sessions, day);
  assert.deepEqual(sessions, frozen);
});

test('today keeps today’s slice, including the part after midnight', () => {
  const range = presetRange('today', today);
  const { view, day, pieces } = openSessions(range, selected);
  assert.equal(day, today);
  assert.deepEqual(daySessionCopy(day, now), { today: true, titleKey: 'detail.todaySessions', emptyKey: 'detail.noSessions' });
  assert.deepEqual(pieces.map(piece => [piece.from, piece.to]), [
    [today, at(10, 20, 1, 30)],
    [at(10, 20, 9), at(10, 20, 10)],
  ]);
  assert.equal(pieceMs(pieces), timelineMs(view.spans, day, selected));
  assert.equal(pieceMs(pieces), focusSummary(view.stats, selected).ms);
  const week = presetRange('7d', today);
  assert.equal(timelineDay(week, today), today);
  assert.equal(daySessionCopy(timelineDay(week, today), now).today, true);
});

test('a session that crosses midnight is split across the two days', () => {
  const crossing = { domain: 'github.com', site: 'github.com', start: at(10, 19, 23), end: at(10, 20, 1, 30) };
  const before = clipDaySessions([crossing], yesterday);
  const after = clipDaySessions([crossing], today);
  assert.deepEqual(before, [{ ...crossing, from: at(10, 19, 23), to: today }]);
  assert.deepEqual(after, [{ ...crossing, from: today, to: at(10, 20, 1, 30) }]);
  assert.equal(pieceMs(before) + pieceMs(after), crossing.end - crossing.start);

  const fallback = { domain: 'github.com', site: 'github.com', start: at(10, 31, 23), end: at(11, 1, 3) };
  const fallBefore = clipDaySessions([fallback], at(10, 31));
  const fallAfter = clipDaySessions([fallback], at(11, 1));
  assert.equal(fallBefore[0].to, at(11, 1));
  assert.equal(fallAfter[0].from, at(11, 1));
  assert.equal(pieceMs(fallBefore) + pieceMs(fallAfter), fallback.end - fallback.start);
  assert.equal(at(11, 1) - at(10, 31), 24 * 3_600_000);
  assert.equal(at(11, 2) - at(11, 1), 25 * 3_600_000);

  const spring = { domain: 'github.com', site: 'github.com', start: at(3, 7, 23), end: at(3, 8, 3) };
  const springBefore = clipDaySessions([spring], at(3, 7));
  const springAfter = clipDaySessions([spring], at(3, 8));
  assert.equal(pieceMs(springBefore) + pieceMs(springAfter), spring.end - spring.start);
  assert.equal(at(3, 9) - at(3, 8), 23 * 3_600_000);
});

test('paging with a site filter keeps the open site on the chart day', () => {
  const range = { preset: 'custom', start: yesterday, end: today, site: 'youtube.com' };
  const view = viewFromSnapshot(data, { ...range, today });
  const day = timelineDay(range, today);
  assert.equal(day, yesterday);
  assert.ok(view.spans.some(span => span.site === 'youtube.com'));
  assert.ok(view.spans.some(span => span.site === selected));
  const sessions = view.spans.filter(span => (span.site ?? span.domain) === selected);
  const pieces = clipDaySessions(sessions, day);
  assert.deepEqual(pieces.map(piece => piece.domain), ['www.github.com', 'github.com', 'github.com']);
  assert.equal(pieceMs(pieces), timelineMs(view.spans, day, selected));
  assert.equal(pieceMs(clipDaySessions(view.spans.filter(span => span.site === 'youtube.com'), day)), 2 * 3_600_000);
  assert.equal(focusSummary(view.stats, selected).ms, pieceMs(pieces));
  assert.notEqual(pieceMs(pieces), focusSummary(view.stats, 'youtube.com').ms);
});
