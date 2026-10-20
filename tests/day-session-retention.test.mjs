process.env.TZ = 'America/New_York';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { addDays, dateKey } = await import('../src/model.mjs');
const { clipDaySessions, daySessionCopy } = await import('../src/day-sessions.mjs');

const at = (month, day, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const today = at(10, 20);
const now = at(10, 20, 16);
const sessionOn = day => [{ domain: 'github.com', site: 'github.com', start: day + 9 * 3_600_000, end: day + 10 * 3_600_000 }];

test('a single day 31 days before today omits the session block', () => {
  const day = addDays(today, -31);
  assert.equal(dateKey(day), '2026-09-19');
  assert.equal(daySessionCopy(day, now), null);
  assert.equal(clipDaySessions(sessionOn(day), day).length, 1);
});

test('the oldest day that still has session rows keeps a dated empty state', () => {
  const day = addDays(today, -30);
  assert.equal(dateKey(day), '2026-09-20');
  assert.deepEqual(daySessionCopy(day, now), { today: false, titleKey: 'detail.daySessions', emptyKey: 'detail.noDaySessions' });
  assert.equal(clipDaySessions(sessionOn(day), day)[0].from, day + 9 * 3_600_000);
  assert.deepEqual(clipDaySessions(sessionOn(today), day), []);
  assert.deepEqual(daySessionCopy(today, now), { today: true, titleKey: 'detail.todaySessions', emptyKey: 'detail.noSessions' });
});
