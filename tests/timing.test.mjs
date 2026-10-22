import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, WINDOW_ID_NONE, ALARM_PERIOD } from './helpers/fake-browser.mjs';
import { daily, dateKey, DAY, DETAIL_DAYS, GAP_LIMIT_MS } from '../src/model.mjs';
import { daysBetween } from '../src/ledger.mjs';

const total = data => data.spans.reduce((sum, span) => sum + span.end - span.start, 0);

function durations(data) {
  const totals = new Map();
  let cursor = null;
  for (const span of data.spans) {
    assert.ok(span.end >= span.start, JSON.stringify(span));
    if (cursor !== null) assert.ok(span.start >= cursor, 'spans overlap ' + JSON.stringify(data.spans));
    cursor = span.end;
    totals.set(span.domain, (totals.get(span.domain) ?? 0) + span.end - span.start);
  }
  return totals;
}

const ms = (data, domain) => durations(data).get(domain) ?? 0;

test('S1 alarm checkpoint during a 25s stay credits a.com for 25s', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  await h.fireAlarm();
  await h.advance(15_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 25_000);
  assert.equal(data.spans.length, 1);
});

test('scheduled alarms fire while advance moves the clock', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(35_000, { alarms: true });
  assert.equal(total(await h.read()), 30_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 35_000);
});

test('S2 switching tabs splits a.com and b.com without a gap or overlap', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const tabB = h.openTab(1, 'https://b.com/');
  await h.advance(10_000);
  await h.activate(tabB);
  await h.advance(15_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 10_000);
  assert.equal(ms(data, 'b.com'), 15_000);
  assert.equal(data.spans[0].end, data.spans[1].start);
});

test('S3 cross-site navigation splits the span; a same-site history update does not', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  await h.navigate(1, 'https://b.com/page');
  await h.advance(8_000);
  const afterCommit = await h.read();
  assert.equal(afterCommit.visits.filter(visit => visit.domain === 'b.com').length, 1);
  await h.navigate(1, 'https://b.com/app', { history: true });
  await h.advance(5_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 10_000);
  assert.equal(ms(data, 'b.com'), 13_000);
  assert.equal(data.visits.filter(visit => visit.domain === 'b.com').length, 1);
  assert.equal(data.spans[0].end, data.spans[1].start);
});

test('S4 internal and extension pages are not counted, then http resumes', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(6_000);
  await h.navigate(1, 'chrome://settings');
  await h.advance(10_000);
  await h.navigate(1, 'chrome-extension://jilan/dashboard.html');
  await h.advance(4_000);
  await h.navigate(1, 'https://a.com/back');
  await h.advance(3_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 9_000);
  assert.equal(total(data), 9_000);
  assert.equal(data.visits.length, 1);
});

test('S5 only the focused window active tab is counted', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const second = h.openWindow({ url: 'https://b.com/' });
  await h.advance(10_000);
  await h.focus(second.windowId);
  await h.advance(12_000);
  await h.focus(1);
  await h.advance(3_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 13_000);
  assert.equal(ms(data, 'b.com'), 12_000);
});

test('S6 focus flicker keeps the total; a sub-second hole is allowed', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const second = h.openWindow({ url: 'https://b.com/' });
  await h.advance(10_000);
  // Same timestamp: NONE, then the new window. Each event re-reads getAll().
  await flicker(h, second.windowId, 0);
  await h.advance(10_000);
  const sameTick = (await h.snapshot()).data;
  assert.equal(total(sameTick), 20_000);
  assert.equal(ms(sameTick, 'a.com') + ms(sameTick, 'b.com'), 20_000);

  const gapped = await createHarness({ url: 'https://a.com/' });
  const other = gapped.openWindow({ url: 'https://b.com/' });
  await gapped.advance(10_000);
  await flicker(gapped, other.windowId, 400);
  await gapped.advance(10_000);
  const data = (await gapped.snapshot()).data;
  assert.equal(total(data), 20_000);
  assert.ok(data.spans[1].start - data.spans[0].end <= 1_000);
  assert.equal(data.spans[1].start - data.spans[0].end, 400);
});

async function flicker(h, windowId, gapMs) {
  await h.focus(WINDOW_ID_NONE);
  if (gapMs) await h.advance(gapMs);
  await h.focus(windowId);
}

test('S6 known behavior: a stale focused flag ignores WINDOW_ID_NONE (issue #6 risk 4)', async () => {
  // Accepted on some platforms: onFocusChanged does not trust the event id. If getAll() still reports the
  // previous window focused, timing continues on that window. See docs/timing-coverage.md (S6).
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(5_000);
  h.browser.windows.onFocusChanged.fire(WINDOW_ID_NONE);
  await h.settle();
  await h.advance(5_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 10_000);
});

test('S7 minimizing or focusing nothing stops timing until focus returns', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(9_000);
  await h.focus(WINDOW_ID_NONE);
  await h.advance(20_000);
  await h.focus(1);
  await h.advance(3_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 12_000);
  assert.equal(total(data), 12_000);
});

test('S7 a bounds event resumes a restored window even if getAll() still says minimized', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(4_000);
  h.setFocus(false);
  await h.settle();
  await h.advance(6_000);
  assert.equal(await h.cursor(), null);
  const [win] = await h.browser.windows.getAll();
  assert.equal(win.focused, false);
  assert.equal(win.state, 'minimized');
  h.browser.windows.onFocusChanged.fire(win.id);
  await h.settle();
  assert.equal(await h.cursor(), null);
  await h.restoreWindow(win.id);
  assert.equal((await h.cursor())?.domain, 'a.com');
  await h.advance(3_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 7_000);
});

test('S8 known behavior: a focused devtools window stops timing (issue #6 risk 3)', async () => {
  // Accepted product behavior: windows.getAll() omits devtools, so a focused inspector looks like no focused window.
  // See docs/timing-coverage.md (S8).
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(5_000);
  const devtools = h.openWindow({ type: 'devtools', url: 'devtools://devtools/bundled/inspector.html' });
  await h.focus(devtools.windowId);
  await h.advance(20_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 5_000);
  assert.equal(total(data), 5_000);
});

test('S9 idle and locked stop timing from the idle event', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(8_000);
  await h.setIdle('idle');
  await h.advance(30_000);
  await h.setIdle('active');
  await h.advance(4_000);
  await h.setIdle('locked');
  await h.advance(15_000);
  await h.setIdle('active');
  await h.advance(2_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 14_000);
});

test('S10 audible playback keeps counting through idle, then stops when the sound stops', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.setAudible(1, true);
  await h.advance(10_000);
  await h.setIdle('idle');
  await h.advance(20_000);
  const playing = (await h.snapshot()).data;
  assert.equal((await h.cursor())?.domain, 'a.com');
  assert.equal(ms(playing, 'a.com'), 30_000);
  await h.setAudible(1, false);
  assert.equal(await h.cursor(), null);
  await h.advance(15_000);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 30_000);
});

test('S21 turning audio counting off stops timing while idle', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.message('settings', { settings: { schema: 1, idleSeconds: 60, countAudible: false } });
  await h.setAudible(1, true);
  await h.advance(9_000);
  await h.setIdle('idle');
  await h.advance(30_000);
  assert.equal(await h.cursor(), null);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 9_000);
});

test('S22 a muted tab does not count, and muting stops timing immediately', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.setAudible(1, true);
  await h.setMuted(1, true);
  await h.advance(7_000);
  await h.setIdle('idle');
  await h.advance(18_000);
  assert.equal(await h.cursor(), null);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 7_000);
  await h.setIdle('active');
  await h.setMuted(1, false);
  await h.advance(4_000);
  await h.setIdle('idle');
  await h.advance(9_000);
  assert.equal((await h.cursor())?.domain, 'a.com');
  await h.setMuted(1, true);
  assert.equal(await h.cursor(), null);
  const stopped = ms(await h.read(), 'a.com');
  await h.advance(15_000);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), stopped);
});

test('S23 locked does not count even while audio is playing', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.setAudible(1, true);
  await h.advance(6_000);
  await h.setIdle('locked');
  await h.advance(25_000);
  assert.equal(await h.cursor(), null);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 6_000);
});

test('S24 audio in a background tab or an unfocused window does not count', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  h.openTab(1, 'https://video.test/watch', { audible: true });
  h.openWindow({ url: 'https://other.test/watch', audible: true });
  await h.advance(5_000);
  await h.setIdle('idle');
  await h.advance(20_000);
  const data = (await h.snapshot()).data;
  assert.equal(await h.cursor(), null);
  assert.equal(ms(data, 'a.com'), 5_000);
  assert.equal(ms(data, 'video.test'), 0);
  assert.equal(ms(data, 'other.test'), 0);
});

test('S25 idleSeconds is passed to setDetectionInterval and queryState; invalid settings fall back', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  assert.equal(h.detectionIntervals.at(-1), 60);
  const saved = await h.message('settings', { settings: { schema: 1, idleSeconds: 300, countAudible: true } });
  assert.deepEqual(saved.settings, { schema: 1, idleSeconds: 300, countAudible: true, recordMode: 'blacklist', ignored: [], allowed: [], badge: true, theme: 'system' });
  const grouped = await h.message('settings', { settings: { schema: 1, idleSeconds: 300, countAudible: true, siteMerge: 'registrable' } });
  assert.equal(Object.hasOwn(grouped.settings, 'siteMerge'), false);
  assert.equal(grouped.settings.idleSeconds, 300);
  assert.equal(Object.hasOwn((await h.browser.storage.local.get('settings')).settings, 'siteMerge'), false);
  assert.equal(h.detectionIntervals.at(-1), 300);
  assert.equal(h.idleQueries.at(-1), 300);
  const fallback = await h.message('settings', { settings: { schema: 9, idleSeconds: 90, countAudible: 'yes' } });
  assert.deepEqual(fallback.settings, { schema: 1, idleSeconds: 60, countAudible: true, recordMode: 'blacklist', ignored: [], allowed: [], badge: true, theme: 'system' });
  assert.deepEqual((await h.browser.storage.local.get('settings')).settings, fallback.settings);
  assert.equal(h.detectionIntervals.includes(90), false);
  assert.equal(h.idleQueries.includes(90), false);
  const ignored = h.browser.runtime.onMessage.listeners[0](
    { type: 'settings', settings: { schema: 1, idleSeconds: 600, countAudible: false } },
    { id: 'other', url: 'https://evil.test/dashboard.html' },
    () => { throw new Error('responded'); },
  );
  assert.equal(ignored, undefined);
  await h.settle();
  assert.deepEqual((await h.browser.storage.local.get('settings')).settings, fallback.settings);
});

test('S11 a service worker restarted within 30s continues the session cursor', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  assert.equal((await h.cursor())?.domain, 'a.com');
  h.killWorker();
  await h.advance(15_000);
  await h.restartWorker();
  assert.equal(total(await h.read()), 25_000);
  await h.advance(5_000);
  await h.fireAlarm();
  const data = await h.read();
  assert.equal(ms(data, 'a.com'), 30_000);
  assert.equal(data.spans.length, 1);
});

test('S12 a dead worker with no event for over 90s credits at most GAP_LIMIT_MS', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  h.killWorker();
  await h.advance(120_000);
  await h.restartWorker();
  assert.equal(total(await h.read()), GAP_LIMIT_MS);
});

test('S13 checkpoints 95s apart credit 90s, not the whole gap and not zero', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(95_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), GAP_LIMIT_MS);
  assert.ok(total(await h.read()) >= 90_000);
});

test('S14 a 2h sleep credits the 90s cap, then timing resumes', async () => {
  // Sleep and a late alarm are the same gap. The cap is the shipped behavior (PR #8),
  // not the ideal of crediting nothing while the machine is asleep.
  const h = await createHarness({ url: 'https://a.com/' });
  h.killWorker();
  await h.advance(2 * 60 * 60 * 1_000);
  await h.restartWorker();
  assert.equal(total(await h.read()), GAP_LIMIT_MS);
  await h.advance(10_000);
  await h.fireAlarm();
  assert.equal(total(await h.read()), GAP_LIMIT_MS + 10_000);
});

test('S15 browser restart keeps flushed spans and does not credit the time it was closed', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  await h.fireAlarm();
  await h.advance(4_000);
  h.killWorker();
  await h.advance(60 * 60 * 1_000);
  await h.restartBrowser();
  assert.equal(total(await h.read()), 10_000);
  await h.advance(8_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 18_000);
});

test('S16 known behavior: extension reload drops the unflushed tail, at most one checkpoint (issue #6 risk 5)', async () => {
  // Accepted product behavior: storage.session is cleared on reload/update; cursor is not flushed first.
  // See docs/timing-coverage.md (S16).
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(20_000);
  await h.fireAlarm();
  await h.advance(12_000);
  assert.ok(12_000 <= ALARM_PERIOD);
  await h.reloadExtension();
  assert.equal(total(await h.read()), 20_000);
  await h.advance(7_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 27_000);
});

test('S17 pause credits nothing; clear does not backfill the old cursor', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  await h.snapshot();
  await h.message('toggle');
  await h.advance(50_000);
  assert.equal(total((await h.snapshot()).data), 10_000);
  await h.message('toggle');
  await h.advance(2_000);
  const resumed = (await h.snapshot()).data;
  assert.equal(resumed.spans.at(-1).end, h.now);
  const cleared = (await h.command('clear')).data;
  assert.equal(cleared.spans.length, 0);
  assert.equal(cleared.visits.length, 0);
  assert.equal(cleared.enabled, true);
  await h.advance(3_000);
  const again = (await h.snapshot()).data;
  assert.equal(again.spans.length, 1);
  assert.equal(again.spans[0].end - again.spans[0].start, 3_000);
});

test('S18 rollback creates no negative span; a span crossing midnight splits in daily()', async () => {
  const h = await createHarness({ url: 'https://a.com/', now: 10_000_000 });
  await h.advance(10_000);
  await h.fireAlarm();
  h.setNow(h.now - 15_000);
  await h.fireAlarm();
  const rolled = await h.read();
  assert.equal(total(rolled), 10_000);
  for (const span of rolled.spans) assert.ok(span.end >= span.start && span.end - span.start < GAP_LIMIT_MS + 1);

  h.setNow(10_010_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 10_000);

  h.setNow(10_013_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 13_000);

  const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const crossed = await createHarness({ url: 'https://a.com/', now: midnight - 10_000 });
  await crossed.advance(20_000);
  await crossed.fireAlarm();
  const days = daily(await crossed.read(), midnight - DAY, midnight + DAY);
  assert.equal(days.find(day => day.at === midnight - DAY).ms, 10_000);
  assert.equal(days.find(day => day.at === midnight).ms, 10_000);
  const stored = await daysBetween(crossed.db, dateKey(midnight - DAY), dateKey(midnight));
  assert.deepEqual(stored.map(day => [day.date, day.ms]), [[dateKey(midnight - DAY), 10_000], [dateKey(midnight), 10_000]]);
});

test('S19 a focused incognito window is not counted and stores no visit', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const incognito = h.openWindow({ url: 'https://secret.test/path?token=abc', incognito: true });
  await h.advance(4_000);
  await h.focus(incognito.windowId);
  await h.advance(10_000);
  await h.navigate(incognito.tabId, 'https://secret.test/other?token=abc');
  await h.focus(1);
  await h.advance(2_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 6_000);
  assert.equal(ms(data, 'secret.test'), 0);
  assert.equal(data.visits.some(visit => visit.domain === 'secret.test'), false);
  assert.equal(JSON.stringify(data).includes('token'), false);
});

const BASELINE_ROWS = 20_000;

test('S20 baseline: one checkpoint over 20_000 stored spans and visits is one transaction; logs time', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const base = h.now;
  await h.db.domains.add({ id: 1, host: 'a.com' });
  await h.db.visits.bulkAdd(Array.from({ length: BASELINE_ROWS }, (_, index) => ({ domainId: 1, at: base - BASELINE_ROWS + index })));
  await h.db.spans.bulkAdd(Array.from({ length: BASELINE_ROWS }, (_, index) => ({ domainId: 1, start: base - 2 * BASELINE_ROWS + index * 2, end: base - 2 * BASELINE_ROWS + index * 2 + 1 })));
  h.resetTicks();
  await h.advance(30_000);
  const started = performance.now();
  await h.fireAlarm();
  const elapsed = performance.now() - started;
  const stored = await h.read();
  console.log(`S20 baseline: ${elapsed.toFixed(2)} ms, transactions=${h.ticks}`);
  assert.equal(h.ticks, 1);
  assert.equal(stored.spans.length, BASELINE_ROWS + 1);
  assert.equal(stored.visits.length, BASELINE_ROWS);
  assert.equal(total(stored), BASELINE_ROWS + 30_000);
});

test('a main-frame commit records the visit and the time in one transaction, and a wake updates again', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(4_000);
  h.resetTicks();
  h.browser.webNavigation.onCommitted.fire({ url: 'https://b.com/', frameId: 0, tabId: 1, timeStamp: h.now });
  await h.settle();
  assert.equal(h.ticks, 1);
  const data = await h.read();
  assert.deepEqual(data.visits, [{ domain: 'b.com', at: h.now }]);
  assert.equal(ms(data, 'a.com'), 4_000);
  h.resetTicks();
  await h.restartWorker();
  assert.ok(h.ticks >= 1);
});

test('detail has no count cap inside 31 days; older spans and visits are pruned while day and hour totals stay', async () => {
  const today = new Date(2026, 9, 18, 12).getTime();
  const h = await createHarness({ url: 'https://a.com/', now: today });
  await h.db.domains.bulkAdd([{ id: 1, host: 'a.com' }, { id: 2, host: 'oldest.test' }]);
  const recent = today - 10 * DAY;
  await h.db.spans.bulkAdd(Array.from({ length: BASELINE_ROWS + 1 }, (_, index) => ({ domainId: 1, start: recent + index * 2, end: recent + index * 2 + 1 })));
  const old = today - DETAIL_DAYS * DAY;
  await h.db.spans.add({ domainId: 2, start: old, end: old + 60_000 });
  await h.db.visits.add({ domainId: 2, at: old });
  await h.db.days.add({ date: dateKey(old), domainId: 2, ms: 60_000, visits: 1 });
  await h.db.hours.add({ date: dateKey(old), hour: new Date(old).getHours(), domainId: 2, ms: 60_000 });
  await h.restartWorker();
  const stored = await h.read();
  assert.equal(stored.spans.length, BASELINE_ROWS + 1);
  assert.equal(stored.spans.some(span => span.domain === 'oldest.test'), false);
  assert.equal(stored.visits.length, 0);
  assert.deepEqual((await daysBetween(h.db, dateKey(old), dateKey(old))).map(day => [day.ms, day.visits]), [[60_000, 1]]);
  assert.equal(await h.db.hours.count(), 1);
});

const baseSettings = { schema: 1, idleSeconds: 60, countAudible: true };

test('an ignored foreground site ends the previous span and records no time or visit', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.message('settings', { settings: { ...baseSettings, ignored: ['b.com'] } });
  await h.advance(10_000);
  await h.navigate(1, 'https://b.com/secret');
  await h.advance(8_000);
  await h.navigate(1, 'https://mail.b.com/inbox');
  await h.advance(4_000);
  await h.navigate(1, 'https://a.com/back');
  await h.advance(3_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'a.com'), 13_000);
  assert.equal(ms(data, 'b.com'), 0);
  assert.equal(ms(data, 'mail.b.com'), 0);
  assert.equal(total(data), 13_000);
  assert.equal(data.visits.filter(visit => visit.domain === 'b.com' || visit.domain === 'mail.b.com').length, 0);
  assert.equal(data.visits.filter(visit => visit.domain === 'a.com').length, 1);
});

test('ignoring mail.example.com does not ignore example.com', async () => {
  const h = await createHarness({ url: 'https://example.com/' });
  await h.message('settings', { settings: { ...baseSettings, ignored: ['mail.example.com'] } });
  await h.advance(5_000);
  await h.navigate(1, 'https://mail.example.com/');
  await h.advance(9_000);
  await h.navigate(1, 'https://example.com/inbox');
  await h.advance(2_000);
  const data = (await h.snapshot()).data;
  assert.equal(ms(data, 'example.com'), 7_000);
  assert.equal(ms(data, 'mail.example.com'), 0);
  assert.equal(data.visits.filter(visit => visit.domain === 'mail.example.com').length, 0);
  assert.equal(data.visits.filter(visit => visit.domain === 'example.com').length, 1);
});

test('adding an ignore while that site is timing stops at the settings save and keeps history', async () => {
  const h = await createHarness({ url: 'https://a.com/account' });
  await h.advance(10_000);
  await h.navigate(1, 'https://a.com/refresh');
  await h.advance(4_000);
  const before = await h.read();
  assert.equal(ms(before, 'a.com'), 10_000);
  assert.equal(before.visits.length, 1);
  const saved = await h.message('settings', { settings: { ...baseSettings, ignored: ['https://A.com/path'] } });
  assert.deepEqual(saved.settings.ignored, ['a.com']);
  assert.equal(await h.cursor(), null);
  const stopped = await h.read();
  assert.equal(ms(stopped, 'a.com'), 14_000);
  assert.deepEqual(stopped.visits, before.visits);
  assert.equal(stopped.spans[0].domain, 'a.com');
  await h.advance(20_000);
  await h.fireAlarm();
  const held = await h.read();
  assert.equal(ms(held, 'a.com'), 14_000);
  assert.deepEqual(held.visits, before.visits);
  assert.deepEqual(held.spans, stopped.spans);
  await h.message('settings', { settings: { ...baseSettings, ignored: [] } });
  assert.equal((await h.cursor())?.domain, 'a.com');
  await h.advance(5_000);
  const resumed = await h.snapshot();
  assert.equal(ms(resumed.data, 'a.com'), 19_000);
  assert.deepEqual(resumed.data.visits, before.visits);
});

test('ignoring a parent stops a subdomain that is currently timing', async () => {
  const h = await createHarness({ url: 'https://mail.a.com/' });
  await h.advance(6_000);
  await h.message('settings', { settings: { ...baseSettings, ignored: ['a.com'] } });
  assert.equal(await h.cursor(), null);
  await h.advance(10_000);
  assert.equal(ms(await h.read(), 'mail.a.com'), 6_000);
});

test('an empty whitelist records no time or visit, and a hit records the host and its subdomains', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.message('settings', { settings: { ...baseSettings, recordMode: 'whitelist', allowed: [], ignored: ['keep.example'] } });
  assert.equal(await h.cursor(), null);
  await h.advance(8_000);
  await h.navigate(1, 'https://b.com/');
  await h.advance(4_000);
  const empty = await h.read();
  assert.equal(total(empty), 0);
  assert.equal(empty.visits.length, 0);
  const saved = await h.message('settings', { settings: { ...baseSettings, recordMode: 'whitelist', allowed: ['b.com'], ignored: ['keep.example'] } });
  assert.deepEqual(saved.settings.ignored, ['keep.example']);
  assert.deepEqual(saved.settings.allowed, ['b.com']);
  assert.equal((await h.cursor())?.domain, 'b.com');
  await h.navigate(1, 'https://c.com/out');
  await h.advance(2_000);
  await h.navigate(1, 'https://b.com/again');
  await h.advance(5_000);
  await h.navigate(1, 'https://mail.b.com/');
  await h.advance(3_000);
  await h.navigate(1, 'https://a.com/');
  await h.advance(6_000);
  const data = await h.read();
  assert.equal(ms(data, 'b.com'), 5_000);
  assert.equal(ms(data, 'mail.b.com'), 3_000);
  assert.equal(ms(data, 'a.com'), 0);
  assert.equal(ms(data, 'c.com'), 0);
  assert.equal(data.visits.filter(visit => visit.domain === 'b.com').length, 1);
  assert.equal(data.visits.filter(visit => visit.domain === 'mail.b.com').length, 1);
  assert.equal(data.visits.filter(visit => visit.domain === 'a.com' || visit.domain === 'c.com').length, 0);
});

test('a whitelist entry for mail.example.com does not record example.com', async () => {
  const h = await createHarness({ url: 'https://example.com/' });
  await h.message('settings', { settings: { ...baseSettings, recordMode: 'whitelist', allowed: ['mail.example.com'] } });
  assert.equal(await h.cursor(), null);
  await h.advance(5_000);
  await h.navigate(1, 'https://mail.example.com/');
  await h.advance(9_000);
  await h.navigate(1, 'https://example.com/inbox');
  await h.advance(2_000);
  const data = await h.read();
  assert.equal(ms(data, 'mail.example.com'), 9_000);
  assert.equal(ms(data, 'example.com'), 0);
  assert.equal(data.visits.filter(visit => visit.domain === 'mail.example.com').length, 1);
  assert.equal(data.visits.filter(visit => visit.domain === 'example.com').length, 0);
});

test('switching to a whitelist that misses the foreground site stops immediately and keeps both lists', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  const saved = await h.message('settings', { settings: { ...baseSettings, recordMode: 'whitelist', ignored: ['keep.example'], allowed: ['other.com'] } });
  assert.equal(saved.settings.recordMode, 'whitelist');
  assert.deepEqual(saved.settings.ignored, ['keep.example']);
  assert.deepEqual(saved.settings.allowed, ['other.com']);
  assert.equal(await h.cursor(), null);
  assert.equal(ms(await h.read(), 'a.com'), 10_000);
  await h.advance(20_000);
  await h.fireAlarm();
  assert.equal(ms(await h.read(), 'a.com'), 10_000);
  assert.equal((await h.read()).visits.length, 0);
  const back = await h.message('settings', { settings: { ...saved.settings, recordMode: 'blacklist' } });
  assert.equal(back.settings.recordMode, 'blacklist');
  assert.deepEqual(back.settings.ignored, ['keep.example']);
  assert.deepEqual(back.settings.allowed, ['other.com']);
  assert.equal((await h.cursor())?.domain, 'a.com');
  await h.advance(4_000);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 14_000);
});
