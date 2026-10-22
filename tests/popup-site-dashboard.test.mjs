import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dateKey, midnight } from '../src/model.mjs';
import { dashboardAction, dashboardSiteHash, openDashboardPage, popupToday, siteFromLocationHash } from '../src/popup-model.mjs';

const url = 'chrome-extension://abc/dashboard.html';

test('dashboardAction still focuses an open dashboard when the link carries a site', () => {
  const queried = `${url}?x=1#other`;
  assert.deepEqual(dashboardAction([{ id: 4, windowId: 2, url: queried }], url, 'github.com'), {
    type: 'focus',
    tabId: 4,
    windowId: 2,
    url: `${url}?x=1#site=github.com`,
  });
  assert.deepEqual(dashboardAction([{ id: 5, windowId: 1, pendingUrl: `${url}#kept` }], url, 'news.example'), {
    type: 'focus',
    tabId: 5,
    windowId: 1,
    url: `${url}#site=news.example`,
  });
  assert.deepEqual(dashboardAction([{ id: 6, url: 'https://example.com/dashboard.html' }], url, 'github.com'), {
    type: 'create',
    url: `${url}#site=github.com`,
  });
  assert.deepEqual(dashboardAction([{ id: 4, windowId: 2, url: `${url}#site=github.com` }], url, 'github.com'), {
    type: 'focus',
    tabId: 4,
    windowId: 2,
  });
  assert.deepEqual(dashboardAction([{ id: 4, windowId: 2, url: queried }], url), {
    type: 'focus',
    tabId: 4,
    windowId: 2,
  });
  assert.deepEqual(dashboardAction(undefined, url, 'github.com'), { type: 'create', url: `${url}#site=github.com` });
});

test('a site hash is the grouped name and never a full URL', () => {
  const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
  const today = midnight(now);
  const key = dateKey(now);
  const figures = popupToday({
    domains: [{ id: 1, host: 'github.com' }, { id: 2, host: 'www.github.com' }],
    days: [
      { date: key, domainId: 1, ms: 3_600_000, visits: 2 },
      { date: key, domainId: 2, ms: 60_000, visits: 1 },
      { date: dateKey(addDays(today, -1)), domainId: 1, ms: 9_999_000, visits: 4 },
    ],
    cursor: { domain: 'www.github.com', since: now - 10_000 },
    lastEnd: now - 10_000,
    now,
    host: 'www.github.com',
    siteMerge: 'prefix',
  });
  assert.equal(figures.site, 'github.com');
  assert.ok(figures.siteMs > 0);
  assert.equal(dashboardAction([], url, figures.site).url, `${url}#site=github.com`);
  assert.equal(dashboardAction([], url, 'https://www.github.com/private?token=1').url, url);
  assert.equal(siteFromLocationHash('#site=github.com'), 'github.com');
  assert.equal(siteFromLocationHash(`#${dashboardSiteHash('[::1]')}`), '[::1]');
  assert.equal(siteFromLocationHash('#site=https://github.com/private'), null);
  assert.equal(siteFromLocationHash('#site='), null);
  assert.equal(siteFromLocationHash(''), null);
});

test('opening a site focuses the existing dashboard instead of creating a tab', async () => {
  const calls = [];
  await openDashboardPage({
    runtime: { getURL: path => `chrome-extension://abc${path}` },
    tabs: {
      query: async () => [{ id: 4, windowId: 2, url: 'chrome-extension://abc/dashboard.html?x=1#other' }],
      update: async (...args) => { calls.push(['update', ...args]); },
      create: async (...args) => { calls.push(['create', ...args]); },
    },
    windows: { update: async (...args) => { calls.push(['focus', ...args]); } },
  }, 'github.com');
  assert.deepEqual(calls, [
    ['update', 4, { active: true, url: 'chrome-extension://abc/dashboard.html?x=1#site=github.com' }],
    ['focus', 2, { focused: true }],
  ]);
});
