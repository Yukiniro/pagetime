import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_ERROR_KEY } from '../src/ledger.mjs';
import { dateKey, detailCutoff } from '../src/model.mjs';
import { DEFAULT_SETTINGS } from '../src/settings.mjs';
import { createHarness } from './helpers/fake-browser.mjs';

test('a dashboard restore overwrites the ledger and settings, and prunes old detail rows', async () => {
  const h = await createHarness();
  const now = new Date(2026, 9, 21, 15).getTime();
  h.setNow(now);
  const old = new Date(2026, 7, 1, 12).getTime();
  const recent = new Date(2026, 9, 20, 11).getTime();
  assert.ok(old < detailCutoff(now));
  assert.ok(recent >= detailCutoff(now));
  const backup = {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    recording: { enabled: false, since: 0 },
    settings: { theme: 'sepia', idleSeconds: 300, badge: false, ignored: ['skip.restore', 'skip.restore'], countAudible: false },
    tables: {
      domains: [{ id: 3, host: 'restored.test', extra: 'no' }],
      days: [
        { date: dateKey(old), domainId: 3, ms: 4_000, visits: 1 },
        { date: dateKey(recent), domainId: 3, ms: 6_000, visits: 1 },
      ],
      hours: [{ date: dateKey(old), hour: 12, domainId: 3, ms: 4_000 }],
      spans: [
        { id: 1, domainId: 3, start: old, end: old + 4_000 },
        { id: 2, domainId: 3, start: recent, end: recent + 6_000 },
      ],
      visits: [{ id: 1, domainId: 3, at: old }, { id: 2, domainId: 3, at: recent }],
    },
  };
  assert.deepEqual({ ...await h.message('restore', { backup }) }, { ok: true });
  const data = await h.read();
  assert.equal(data.enabled, false);
  assert.equal(data.since, 0);
  assert.deepEqual(data.spans.map(span => span.domain), ['restored.test']);
  assert.equal(data.spans[0].start, recent);
  assert.deepEqual(data.visits.map(visit => visit.at), [recent]);
  const days = await h.db.table('days').toArray();
  assert.equal(days.length, 2);
  assert.equal(days.find(row => row.date === dateKey(old)).ms, 4_000);
  assert.equal((await h.db.table('domains').toArray()).some(row => row.host !== 'restored.test'), false);
  assert.equal((await h.db.table('meta').get('cursor')), undefined);
  assert.deepEqual(h.local.settings, {
    ...DEFAULT_SETTINGS,
    idleSeconds: 300,
    countAudible: false,
    badge: false,
    ignored: ['skip.restore'],
  });
  assert.equal(h.detectionIntervals.at(-1), 300);
});

test('a restore whose detail prune fails is not successful, and a later update retries the prune', async () => {
  const now = new Date(2026, 9, 21, 15).getTime();
  const h = await createHarness({ now });
  const old = new Date(2026, 7, 1, 12).getTime();
  const recent = new Date(2026, 9, 20, 11).getTime();
  assert.ok(old < detailCutoff(now));
  assert.ok(recent >= detailCutoff(now));
  h.failPrune(Object.assign(new Error('prune broke'), { name: 'UnknownError' }));
  const backup = {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    recording: { enabled: false, since: 0 },
    settings: { idleSeconds: 300, badge: false, ignored: ['skip.restore'] },
    tables: {
      domains: [{ id: 3, host: 'restored.test' }],
      days: [
        { date: dateKey(old), domainId: 3, ms: 4_000, visits: 1 },
        { date: dateKey(recent), domainId: 3, ms: 6_000, visits: 1 },
      ],
      hours: [],
      spans: [
        { id: 1, domainId: 3, start: old, end: old + 4_000 },
        { id: 2, domainId: 3, start: recent, end: recent + 6_000 },
      ],
      visits: [{ id: 1, domainId: 3, at: old }, { id: 2, domainId: 3, at: recent }],
    },
  };
  assert.deepEqual({ ...await h.message('restore', { backup }) }, { error: 'save' });
  const during = await h.read();
  assert.deepEqual(during.spans.filter(span => span.domain === 'restored.test').map(span => span.start).sort(), [old, recent]);
  assert.equal(during.enabled, false);
  assert.equal(during.since, 0);
  assert.deepEqual(h.local.settings.ignored, ['skip.restore']);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
  assert.ok(h.errors.some(([label, error]) => label === 'PageTime prune failed' && error.name === 'UnknownError'));
  assert.equal(h.errors.some(([label]) => label === 'PageTime recording failed'), false);
  h.failPrune(null);
  assert.deepEqual({ ...await h.message('snapshot') }, { ok: true });
  const after = await h.read();
  assert.deepEqual(after.spans.filter(span => span.domain === 'restored.test').map(span => span.start), [recent]);
  assert.deepEqual(after.visits.filter(visit => visit.domain === 'restored.test').map(visit => visit.at), [recent]);
  assert.equal((await h.db.table('days').toArray()).length, 2);
});

test('a span that crosses local midnight is rejected before the ledger is opened for writing', async () => {
  const h = await createHarness();
  const before = await h.read();
  const start = new Date(2026, 9, 20, 23, 30).getTime();
  const end = new Date(2026, 9, 21, 0, 30).getTime();
  assert.notEqual(dateKey(start), dateKey(end));
  const response = await h.message('restore', {
    backup: {
      format: 'pagetime-ledger',
      schemaVersion: 1,
      recording: { enabled: true, since: null },
      tables: {
        domains: [{ id: 1, host: 'night.test' }],
        days: [],
        hours: [],
        spans: [{ id: 1, domainId: 1, start, end }],
        visits: [],
      },
    },
  });
  assert.deepEqual({ ...response }, { error: 'save' });
  assert.deepEqual(await h.read(), before);
  assert.equal(h.local.settings, undefined);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
});

test('a timestamp outside the Date range is rejected before the ledger is opened for writing', async () => {
  const h = await createHarness();
  const before = await h.read();
  const overflow = 9_000_000_000_000_000;
  assert.ok(Number.isNaN(new Date(overflow).getTime()));
  const response = await h.message('restore', {
    backup: {
      format: 'pagetime-ledger',
      schemaVersion: 1,
      recording: { enabled: true, since: overflow },
      tables: {
        domains: [{ id: 1, host: 'far.test' }],
        days: [],
        hours: [],
        spans: [{ id: 1, domainId: 1, start: overflow, end: overflow }],
        visits: [{ id: 1, domainId: 1, at: overflow }],
      },
    },
  });
  assert.deepEqual({ ...response }, { error: 'save' });
  assert.deepEqual(await h.read(), before);
  assert.equal(h.local.settings, undefined);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
});

test('a bad restore message does not change the ledger or mark a write failure', async () => {
  const h = await createHarness();
  const before = await h.read();
  assert.deepEqual({ ...await h.message('restore', { backup: { format: 'pagetime-ledger', schemaVersion: 9 } }) }, { error: 'save' });
  assert.deepEqual(await h.read(), before);
  assert.equal(LEDGER_ERROR_KEY in h.local, false);
  assert.equal(h.local.settings, undefined);
});

test('the popup cannot send restore', async () => {
  const h = await createHarness();
  let replied = false;
  const handled = h.browser.runtime.onMessage.listeners[0](
    { type: 'restore', backup: { format: 'pagetime-ledger', schemaVersion: 1 } },
    { id: 'jilan', url: 'chrome-extension://jilan/popup.html' },
    () => { replied = true; },
  );
  assert.equal(handled, undefined);
  assert.equal(replied, false);
  await h.settle();
  assert.equal((await h.read()).spans.every(span => span.domain !== 'restored.test'), true);
});
