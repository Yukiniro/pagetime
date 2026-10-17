import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankData } from '../src/model.mjs';
import { createHarness } from './helpers/fake-browser.mjs';

const total = data => data.spans.reduce((sum, span) => sum + span.end - span.start, 0);

test('background counts main-frame visits, ignores private/internal pages, and stores only domains', async () => {
  const h = await createHarness();
  const commit = (url, frameId = 0) => h.browser.webNavigation.onCommitted.fire({ url, frameId, tabId: 1, timeStamp: h.now });
  commit('https://example.com/private?key=secret');
  commit('https://sub.test', 1);
  let data = (await h.message('snapshot')).data;
  assert.equal(data.visits.length, 1);
  assert.equal(data.visits[0].domain, 'example.com');
  assert.ok(!JSON.stringify(data).includes('secret'));
  h.setTab({ incognito: true });
  commit('https://private.test');
  commit('chrome://settings');
  data = (await h.message('snapshot')).data;
  assert.equal(data.visits.length, 1);
});

test('background stops at loss of focus, idle and pause; resumes and clears without stale intervals', async () => {
  const h = await createHarness();
  h.advance(10_000);
  h.setFocus(false);
  await h.message('snapshot');
  h.advance(20_000);
  assert.equal(total((await h.message('snapshot')).data), 10_000);
  h.setFocus(true);
  await h.message('snapshot');
  h.advance(5_000);
  h.setIdle('idle');
  await h.message('snapshot');
  h.advance(20_000);
  assert.equal(total((await h.message('snapshot')).data), 15_000);
  h.setIdle('active');
  await h.message('snapshot');
  await h.message('toggle');
  h.advance(50_000);
  assert.equal(total((await h.message('snapshot')).data), 15_000);
  await h.message('toggle');
  h.advance(2_000);
  assert.equal((await h.message('snapshot')).data.spans.at(-1).end - h.now, 0);
  const cleared = (await h.message('clear')).data;
  assert.equal(cleared.spans.length, 0);
  assert.equal(cleared.visits.length, 0);
  h.advance(3_000);
  const resumed = (await h.message('snapshot')).data;
  assert.equal(resumed.spans[0].end - resumed.spans[0].start, 3_000);
});

test('a normal 30s checkpoint credits the full 30s', async () => {
  const h = await createHarness();
  h.advance(30_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), 30_000);
});

test('a checkpoint delayed to 95s credits 90,000ms', async () => {
  const h = await createHarness();
  h.advance(95_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), 90_000);
});

test('a 2h gap credits at most 90,000ms', async () => {
  const h = await createHarness();
  h.advance(2 * 60 * 60 * 1_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), 90_000);
});

test('a clock moved backwards credits 0', async () => {
  const h = await createHarness();
  h.advance(-15_000);
  await h.fireAlarm();
  assert.equal(total(h.read()), 0);
});

test('invalid stored records are rejected by every command without overwriting them; retry recovers', async () => {
  const h = await createHarness();
  for (const raw of [null, { enabled: true, since: 1 }, { visits: [{ domain: 'example.com/path', at: 1 }], spans: [], enabled: true, since: 1 }]) {
    await h.browser.storage.local.set({ data: raw });
    for (const type of ['snapshot', 'toggle', 'clear']) {
      assert.equal((await h.message(type)).error, 'data');
      assert.deepEqual((await h.browser.storage.local.get('data')).data, raw);
    }
  }
  assert.equal(h.errors.length, 9);
  await h.browser.storage.local.set({ data: blankData() });
  assert.equal((await h.message('snapshot')).data.enabled, true);
});
