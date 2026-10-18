import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, WINDOW_ID_NONE, ALARM_PERIOD } from './helpers/fake-browser.mjs';
import { daily, DAY, LIMIT, GAP_LIMIT_MS } from '../src/model.mjs';

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
  assert.equal(total(h.read()), 30_000);
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
  const afterCommit = h.read();
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
  // onFocusChanged does not trust the event id. If getAll() still reports the
  // previous window focused, timing continues on that window.
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
  assert.equal(h.cursor(), null);
  const [win] = await h.browser.windows.getAll();
  assert.equal(win.focused, false);
  assert.equal(win.state, 'minimized');
  h.browser.windows.onFocusChanged.fire(win.id);
  await h.settle();
  assert.equal(h.cursor(), null);
  await h.restoreWindow(win.id);
  assert.equal(h.cursor()?.domain, 'a.com');
  await h.advance(3_000);
  await h.fireAlarm();
  assert.equal(ms(h.read(), 'a.com'), 7_000);
});

test('S8 known behavior: a focused devtools window stops timing (issue #6 risk 3)', async () => {
  // windows.getAll() omits devtools, so a focused inspector looks like no focused window.
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
  assert.equal(h.cursor()?.domain, 'a.com');
  assert.equal(ms(playing, 'a.com'), 30_000);
  await h.setAudible(1, false);
  assert.equal(h.cursor(), null);
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
  assert.equal(h.cursor(), null);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 9_000);
});

test('S22 a muted tab does not count, and muting stops timing immediately', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.setAudible(1, true);
  await h.setMuted(1, true);
  await h.advance(7_000);
  await h.setIdle('idle');
  await h.advance(18_000);
  assert.equal(h.cursor(), null);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), 7_000);
  await h.setIdle('active');
  await h.setMuted(1, false);
  await h.advance(4_000);
  await h.setIdle('idle');
  await h.advance(9_000);
  assert.equal(h.cursor()?.domain, 'a.com');
  await h.setMuted(1, true);
  assert.equal(h.cursor(), null);
  const stopped = ms(h.read(), 'a.com');
  await h.advance(15_000);
  assert.equal(ms((await h.snapshot()).data, 'a.com'), stopped);
});

test('S23 locked does not count even while audio is playing', async () => {
  const h = await createHarness({ url: 'https://a.com/watch' });
  await h.setAudible(1, true);
  await h.advance(6_000);
  await h.setIdle('locked');
  await h.advance(25_000);
  assert.equal(h.cursor(), null);
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
  assert.equal(h.cursor(), null);
  assert.equal(ms(data, 'a.com'), 5_000);
  assert.equal(ms(data, 'video.test'), 0);
  assert.equal(ms(data, 'other.test'), 0);
});

test('S25 idleSeconds is passed to setDetectionInterval and queryState; invalid settings fall back', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  assert.equal(h.detectionIntervals.at(-1), 60);
  const saved = await h.message('settings', { settings: { schema: 1, idleSeconds: 300, countAudible: true } });
  assert.deepEqual(saved.settings, { schema: 1, idleSeconds: 300, countAudible: true });
  assert.equal(h.detectionIntervals.at(-1), 300);
  assert.equal(h.idleQueries.at(-1), 300);
  const fallback = await h.message('settings', { settings: { schema: 9, idleSeconds: 90, countAudible: 'yes' } });
  assert.deepEqual(fallback.settings, { schema: 1, idleSeconds: 60, countAudible: true });
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
  assert.equal(h.cursor()?.domain, 'a.com');
  h.killWorker();
  await h.advance(15_000);
  await h.restartWorker();
  assert.equal(total(h.read()), 25_000);
  await h.advance(5_000);
  await h.fireAlarm();
  const data = h.read();
  assert.equal(ms(data, 'a.com'), 30_000);
  assert.equal(data.spans.length, 1);
});

test('S12 a dead worker with no event for over 90s credits at most GAP_LIMIT_MS', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  h.killWorker();
  await h.advance(120_000);
  await h.restartWorker();
  assert.equal(total(h.read()), GAP_LIMIT_MS);
});

test('S13 checkpoints 95s apart credit 90s, not the whole gap and not zero', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(95_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), GAP_LIMIT_MS);
  assert.ok(total(h.read()) >= 90_000);
});

test('S14 a 2h sleep credits the 90s cap, then timing resumes', async () => {
  // Sleep and a late alarm are the same gap. The cap is the shipped behavior (PR #8),
  // not the ideal of crediting nothing while the machine is asleep.
  const h = await createHarness({ url: 'https://a.com/' });
  h.killWorker();
  await h.advance(2 * 60 * 60 * 1_000);
  await h.restartWorker();
  assert.equal(total(h.read()), GAP_LIMIT_MS);
  await h.advance(10_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), GAP_LIMIT_MS + 10_000);
});

test('S15 browser restart keeps flushed spans and does not credit the time it was closed', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(10_000);
  await h.fireAlarm();
  await h.advance(4_000);
  h.killWorker();
  await h.advance(60 * 60 * 1_000);
  await h.restartBrowser();
  assert.equal(total(h.read()), 10_000);
  await h.advance(8_000);
  await h.fireAlarm();
  assert.equal(ms(h.read(), 'a.com'), 18_000);
});

test('S16 known behavior: extension reload drops the unflushed tail, at most one checkpoint (issue #6 risk 5)', async () => {
  // storage.session is cleared on reload/update. The cursor is not flushed first.
  const h = await createHarness({ url: 'https://a.com/' });
  await h.advance(20_000);
  await h.fireAlarm();
  await h.advance(12_000);
  assert.ok(12_000 <= ALARM_PERIOD);
  await h.reloadExtension();
  assert.equal(total(h.read()), 20_000);
  await h.advance(7_000);
  await h.fireAlarm();
  assert.equal(ms(h.read(), 'a.com'), 27_000);
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
  const cleared = (await h.message('clear')).data;
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
  const rolled = h.read();
  assert.equal(total(rolled), 10_000);
  for (const span of rolled.spans) assert.ok(span.end >= span.start && span.end - span.start < GAP_LIMIT_MS + 1);

  h.setNow(10_010_000);
  await h.fireAlarm();
  assert.equal(ms(h.read(), 'a.com'), 10_000);

  h.setNow(10_013_000);
  await h.fireAlarm();
  assert.equal(ms(h.read(), 'a.com'), 13_000);

  const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const crossed = await createHarness({ url: 'https://a.com/', now: midnight - 10_000 });
  await crossed.advance(20_000);
  await crossed.fireAlarm();
  const days = daily(crossed.read(), midnight - DAY, midnight + DAY);
  assert.equal(days.find(day => day.at === midnight - DAY).ms, 10_000);
  assert.equal(days.find(day => day.at === midnight).ms, 10_000);
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

test('S20 baseline: one update with 20_000 spans and visits logs time and bytes', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const data = h.read();
  const base = h.now;
  data.visits = Array.from({ length: LIMIT }, (_, index) => ({ domain: 'a.com', at: base + index }));
  data.spans = Array.from({ length: LIMIT }, (_, index) => ({ domain: 'a.com', start: base + index * 2, end: base + index * 2 + 1 }));
  h.seed(data);
  h.resetWrites();
  const started = performance.now();
  await h.fireAlarm();
  const elapsed = performance.now() - started;
  const stored = h.read();
  console.log(`S20 baseline: ${elapsed.toFixed(2)} ms, ${h.lastWriteBytes} bytes, writes=${h.localWrites}`);
  assert.equal(stored.spans.length, LIMIT);
  assert.equal(stored.visits.length, LIMIT);
  assert.equal(h.localWrites, 1);
  assert.ok(h.lastWriteBytes > 0);
  assert.equal(Number.isFinite(elapsed), true);
});

test('known behavior: onCommitted rewrites the whole store twice, and a wake updates again (issue #6 risk 6)', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  h.resetWrites();
  h.browser.webNavigation.onCommitted.fire({ url: 'https://b.com/', frameId: 0, tabId: 1, timeStamp: h.now });
  await h.settle();
  assert.equal(h.localWrites, 2);
  h.resetWrites();
  await h.restartWorker();
  assert.ok(h.localWrites >= 1);
});

test('known behavior: the 20_000 cap drops in-window spans before 90 days (issue #6 risk 7)', async () => {
  const h = await createHarness({ url: 'https://a.com/' });
  const data = h.read();
  const start = h.now - LIMIT - 10;
  data.visits = [];
  data.spans = Array.from({ length: LIMIT + 1 }, (_, index) => ({
    domain: index === 0 ? 'oldest.test' : 'a.com',
    start: start + index,
    end: start + index + 1,
  }));
  h.seed(data);
  await h.fireAlarm();
  const stored = h.read();
  assert.equal(stored.spans.length, LIMIT);
  assert.equal(stored.spans.some(span => span.domain === 'oldest.test'), false);
  assert.ok(stored.spans.every(span => h.now - span.end < 90 * DAY));
});
