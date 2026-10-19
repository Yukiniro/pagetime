import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers/fake-browser.mjs';
import {
  BADGE_COLOR, PAUSED_BADGE_COLOR, PAUSED_BADGE_TEXT, badgeLabels, badgeText, resolveLocale, todayFigures,
} from '../src/badge.mjs';
import { viewFromLedger } from '../src/ledger-view.mjs';
import { daysBetween, readDomains, readHead } from '../src/ledger.mjs';
import { addDays, dateKey, midnight, GAP_LIMIT_MS, HOUR } from '../src/model.mjs';

const MINUTE = 60_000;

// Chrome shows about four characters. Minutes are floored.
const formats = [
  [0, '0m'],
  [59_000, '0m'],
  [MINUTE, '1m'],
  [45 * MINUTE, '45m'],
  [59 * MINUTE + 59_000, '59m'],
  [HOUR, '1h00'],
  [HOUR + 5 * MINUTE, '1h05'],
  [9 * HOUR + 59 * MINUTE, '9h59'],
  [10 * HOUR, '10h'],
  [12 * HOUR, '12h'],
  [23 * HOUR + 59 * MINUTE, '23h'],
  [99 * HOUR + 59 * MINUTE, '99h'],
  [100 * HOUR, '99h+'],
];

for (const [ms, text] of formats) test(`badge text ${ms} ms is ${text}`, () => {
  assert.equal(badgeText(ms), text);
  assert.ok(text.length <= 4, text);
});

test('every duration from 0 through 100 hours stays within 4 characters', () => {
  for (let minutes = 0; minutes <= 100 * 60; minutes += 1) assert.ok(badgeText(minutes * MINUTE).length <= 4);
});

test('locale resolution follows the dashboard language, then the browser UI language', () => {
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('zh_TW'), 'zh-TW');
  assert.equal(resolveLocale('zh-HK'), 'zh-TW');
  assert.equal(resolveLocale('zh'), 'zh-CN');
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('pt-PT'), 'pt-BR');
  assert.equal(resolveLocale('ru'), 'ru');
  assert.equal(resolveLocale(''), 'en');
  assert.equal(resolveLocale(undefined), 'en');
});

function figuresOf({ now, since, lastEnd = since, domain = 'a.test', stored = 0, enabled = true, cursor = true }) {
  const rows = stored ? [{ date: dateKey(now), domainId: 1, ms: stored, visits: 1 }] : [];
  const domains = [{ id: 1, host: domain }];
  const live = cursor ? { domain, since, tabId: 1 } : null;
  const today = midnight(now);
  const view = viewFromLedger({
    state: { enabled, since: today },
    domains,
    days: rows,
    spans: [],
    visits: [],
    cursor: enabled ? live : live,
    lastEnd,
  }, { start: today, end: addDays(today, 1), today, search: '', now });
  const figures = todayFigures({ rows, domains, cursor: enabled ? live : null, lastEnd, now, enabled });
  assert.equal(figures.total, view.todayStats.ms);
  if (figures.domain) assert.equal(figures.siteMs, view.todayStats.rows.find(row => row.domain === domain)?.ms ?? 0);
  return figures;
}

test('today total matches the overview and includes only the capped, not-yet-stored cursor inside today', () => {
  const now = new Date(2026, 9, 19, 15, 0, 0).getTime();
  const open = figuresOf({ now, since: now - 45_000, stored: 3 * HOUR });
  assert.equal(open.total, 3 * HOUR + 45_000);
  assert.equal(open.domain, 'a.test');
  const capped = figuresOf({ now, since: now - 2 * HOUR, stored: HOUR });
  assert.equal(capped.total, HOUR + GAP_LIMIT_MS);
  const storedAlready = figuresOf({ now, since: now - 30_000, lastEnd: now, stored: 30_000 });
  assert.equal(storedAlready.total, 30_000);
  const midnight = new Date(2026, 9, 19, 0, 0, 20).getTime();
  const crossed = figuresOf({ now: midnight, since: new Date(2026, 9, 18, 23, 59, 40).getTime(), stored: 0 });
  assert.equal(crossed.total, 20_000);
  const paused = figuresOf({ now, since: now - 30_000, stored: HOUR, enabled: false });
  assert.equal(paused.total, HOUR);
  assert.equal(paused.domain, null);
});

async function overviewToday(h) {
  const now = h.now;
  const today = midnight(now);
  const [head, domains, days, data, cursor] = await Promise.all([
    readHead(h.db), readDomains(h.db), daysBetween(h.db, dateKey(today), dateKey(today)), h.read(), h.cursor(),
  ]);
  const live = cursor;
  const view = viewFromLedger({
    state: { enabled: data.enabled, since: data.since },
    domains, days, spans: [], visits: [], cursor: live, lastEnd: head.lastEnd,
  }, { start: today, end: addDays(today, 1), today, search: '', now });
  const figures = todayFigures({ rows: days, domains, cursor: live, lastEnd: head.lastEnd, now, enabled: data.enabled });
  assert.equal(figures.total, view.todayStats.ms);
  return figures;
}

test('the toolbar badge defaults on and shows today, including an uncommitted cursor capped at 90s', async () => {
  const h = await createHarness({ url: 'https://a.test/' });
  assert.equal(h.badge.text, '0m');
  assert.equal(h.badge.color, BADGE_COLOR);
  await h.advance(95_000);
  assert.equal((await h.read()).spans.length, 0);
  await h.browser.storage.local.set({ language: 'en' });
  await h.settle();
  const figures = await overviewToday(h);
  assert.equal(figures.total, GAP_LIMIT_MS);
  assert.equal(h.badge.text, '1m');
  assert.equal(h.badge.text, badgeText(figures.total));
  assert.equal(h.badge.title, badgeLabels({ locale: 'en', ...figures, paused: false }).title);
  assert.equal(h.badge.title, 'Today 1 min · a.test 1 min');
  assert.equal(h.badge.calls.every(call => call.tabId === undefined), true);
  await h.browser.storage.local.set({ language: 'zh-CN' });
  await h.settle();
  assert.equal(h.badge.title, '今天 1 分钟 · a.test 1 分钟');
  assert.equal((await h.read()).spans.length, 0);
});

test('stored today rows are shown, and storage.local data is not', async () => {
  const h = await createHarness({ url: 'https://example.com/private?key=secret' });
  const legacy = { visits: [{ domain: 'old.test', at: 1 }], spans: [{ domain: 'old.test', start: 1, end: HOUR }], enabled: false, since: 1 };
  await h.browser.storage.local.set({ data: legacy });
  await h.db.domains.add({ id: 1, host: 'example.com' });
  await h.db.days.add({ date: dateKey(h.now), domainId: 1, ms: HOUR + 5 * MINUTE, visits: 1 });
  await h.message('snapshot');
  assert.equal(h.badge.text, '1h05');
  assert.deepEqual(h.local.data, legacy);
  const figures = await overviewToday(h);
  assert.equal(h.badge.text, badgeText(figures.total));
});

test('pause, resume, clear and the badge switch each refresh the badge', async () => {
  const h = await createHarness({ url: 'https://a.test/' });
  await h.advance(2 * MINUTE, { alarms: true });
  assert.equal(h.badge.text, '2m');
  const beforePause = h.badge.calls.length;
  await h.message('toggle');
  assert.ok(h.badge.calls.length > beforePause);
  assert.equal(h.badge.text, PAUSED_BADGE_TEXT);
  assert.equal(h.badge.color, PAUSED_BADGE_COLOR);
  assert.equal(h.badge.title, 'Recording paused');
  await h.message('toggle');
  assert.equal(h.badge.text, '2m');
  assert.equal(h.badge.color, BADGE_COLOR);
  await h.message('clear');
  assert.equal(h.badge.text, '0m');
  assert.equal((await h.read()).spans.length, 0);
  const off = await h.message('settings', { settings: { schema: 1, idleSeconds: 60, countAudible: true, badge: false } });
  assert.equal(off.settings.badge, false);
  assert.equal(h.badge.text, '');
  assert.equal(h.badge.title, '');
  await h.message('settings', { settings: { schema: 1, idleSeconds: 60, countAudible: true, badge: true } });
  assert.equal(h.badge.text, '0m');
  const fallback = await h.message('settings', { settings: { badge: 'no', idleSeconds: 60, countAudible: true, schema: 1 } });
  assert.equal(fallback.settings.badge, true);
  assert.equal(h.badge.text, '0m');
});

test('after midnight the next checkpoint shows only the new day', async () => {
  const h = await createHarness({ url: 'https://a.test/' });
  h.setNow(new Date(2026, 9, 18, 23, 40, 0).getTime());
  await h.restartWorker();
  await h.advance(15 * MINUTE, { alarms: true });
  assert.equal(h.badge.text, '15m');
  await h.advance(10 * MINUTE, { alarms: true });
  assert.equal(h.badge.text, '5m');
  const figures = await overviewToday(h);
  assert.equal(figures.total, 5 * MINUTE);
  assert.equal(h.badge.text, badgeText(figures.total));
});
