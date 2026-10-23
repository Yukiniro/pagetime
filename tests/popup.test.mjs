import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, dateKey, midnight } from '../src/model.mjs';
import { todayFigures } from '../src/badge.mjs';
import { viewFromLedger } from '../src/ledger-view.mjs';
import { IGNORED_LIMIT } from '../src/settings.mjs';
import { activeRecordableHost, dashboardAction, listAction, openDashboardPage, popupToday, recordableHost, toggleListedHost } from '../src/popup-model.mjs';

const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
const today = midnight(now);
const key = dateKey(now);
const domains = [
  { id: 1, host: 'github.com' },
  { id: 2, host: 'www.github.com' },
  { id: 3, host: 'news.example' },
];
const days = [
  { date: key, domainId: 1, ms: 3_600_000, visits: 2 },
  { date: key, domainId: 2, ms: 60_000, visits: 1 },
  { date: key, domainId: 3, ms: 120_000, visits: 1 },
  { date: dateKey(addDays(today, -1)), domainId: 1, ms: 9_999_000, visits: 4 },
];
const cursor = { domain: 'www.github.com', since: now - 10_000 };
const lastEnd = now - 10_000;

function figures(extra = {}) {
  return popupToday({ domains, days, cursor, lastEnd, now, enabled: true, host: 'www.github.com', ...extra });
}

test('today total and the grouped site match the dashboard for the same local day', () => {
  const result = figures();
  assert.deepEqual(result, { total: 3_790_000, site: 'github.com', siteMs: 3_670_000 });
  const view = viewFromLedger({
    state: { enabled: true, since: now - 86_400_000 },
    domains,
    days,
    hours: [],
    spans: [],
    visits: [],
    cursor,
    lastEnd,
  }, { start: today, end: addDays(today, 1), today, now });
  assert.equal(view.todayStats.ms, result.total);
  assert.equal(view.todayStats.rows.find(row => row.domain === 'github.com').ms, result.siteMs);
  const badge = todayFigures({ rows: days.filter(row => row.date === key), domains, cursor, lastEnd, now, enabled: true });
  assert.equal(badge.total, result.total);
});

test('a paused ledger and a cursor that crosses midnight keep only the credited part of today', () => {
  assert.deepEqual(figures({ enabled: false }), { total: 3_780_000, site: 'github.com', siteMs: 3_660_000 });
  const start = midnight(now);
  const crossed = popupToday({
    domains, days: [], cursor: { domain: 'www.github.com', since: start - 5_000 }, lastEnd: start - 5_000,
    now: start + 7_000, enabled: true, host: 'www.github.com',
  });
  assert.deepEqual(crossed, { total: 7_000, site: 'github.com', siteMs: 7_000 });
  assert.equal(popupToday({ domains, days, cursor, lastEnd, now, host: 'nowhere.test' }).siteMs, 0);
  assert.equal(popupToday({ domains, days, cursor, lastEnd, now, host: null }).site, null);
});

test('only an http(s) hostname is recordable', () => {
  assert.equal(recordableHost('https://WWW.Example.com/a/b?q=1'), 'www.example.com');
  assert.equal(recordableHost('http://localhost:4173/dashboard'), 'localhost');
  for (const url of ['chrome://newtab/', 'about:blank', 'edge://settings', 'chrome-extension://abc/popup.html', 'file:///tmp/a.html', '', null]) {
    assert.equal(recordableHost(url), null);
  }
});

test('the list button writes the exact host and the next click removes it', () => {
  const blacklist = { recordMode: 'blacklist', ignored: [], allowed: ['kept.test'] };
  assert.deepEqual(listAction(blacklist, 'https://Example.com/path'), {
    field: 'ignored', host: 'example.com', listed: false, covered: false, label: 'ignore', disabled: false,
  });
  const added = toggleListedHost(blacklist.ignored, 'https://Example.com/path');
  assert.deepEqual(blacklist.ignored, []);
  assert.deepEqual(added, ['example.com']);
  assert.equal(listAction({ ...blacklist, ignored: added }, 'example.com').label, 'unignore');
  assert.deepEqual(toggleListedHost(added, 'example.com'), []);
  const whitelist = { recordMode: 'whitelist', ignored: ['skip.test'], allowed: [] };
  assert.equal(listAction(whitelist, 'example.com').label, 'allow');
  assert.equal(listAction({ ...whitelist, allowed: ['example.com'] }, 'example.com').label, 'unallow');
  assert.equal(listAction(whitelist, 'chrome://newtab'), null);
  const full = Array.from({ length: IGNORED_LIMIT }, (_, index) => `h${index}.test`);
  assert.equal(listAction({ recordMode: 'blacklist', ignored: full }, 'new.test').disabled, true);
  assert.equal(toggleListedHost(full, 'new.test'), full);
  assert.equal(listAction({ recordMode: 'blacklist', ignored: full }, full[0]).label, 'unignore');
});

test('the active tab contributes only its hostname', async () => {
  assert.equal(await activeRecordableHost(async () => [{ url: 'https://www.github.com/private?token=1', incognito: false }]), 'www.github.com');
  assert.equal(await activeRecordableHost(async () => [{ url: 'https://a.test/', incognito: true }]), null);
  assert.equal(await activeRecordableHost(async () => []), null);
});

test('opening the dashboard focuses an existing tab before creating one', async () => {
  const calls = [];
  const present = {
    runtime: { getURL: path => `chrome-extension://abc${path}` },
    tabs: {
      query: async () => [{ id: 4, windowId: 2, url: 'chrome-extension://abc/dashboard.html' }],
      update: async (...args) => { calls.push(['update', ...args]); },
      create: async (...args) => { calls.push(['create', ...args]); },
    },
    windows: { update: async (...args) => { calls.push(['focus', ...args]); } },
  };
  await openDashboardPage(present);
  assert.deepEqual(calls, [['update', 4, { active: true }], ['focus', 2, { focused: true }]]);
  const callsWithout = [];
  await openDashboardPage({
    runtime: present.runtime,
    tabs: { query: async () => [], update: async () => {}, create: async (...args) => { callsWithout.push(args); } },
    windows: { update: async () => {} },
  });
  assert.deepEqual(callsWithout, [[{ url: 'chrome-extension://abc/dashboard.html' }]]);
});

test('the popup shows SiteIcon beside a site and keeps the name inside 320px', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const read = path => readFileSync(join(root, path), 'utf8');
  const popup = read('src/Popup.jsx');
  assert.match(popup, /import \{ SiteIcon \} from '\.\/SiteIcon\.jsx'/);
  assert.match(popup, /figures\.site \? <span className="popup-host-icon" aria-hidden="true"><SiteIcon domain=\{host\} site=\{figures\.site\} \/><\/span> : null/);
  assert.doesNotMatch(popup, /SiteIcon domain=\{figures\.site\}/);
  assert.match(popup, /aria-label=\{t\('popup\.viewSite', \{ site: figures\.site \}\)\}/);
  assert.match(popup, /onClick=\{onOpenSite\}/);
  assert.match(popup, /t\('popup\.pause'\)/);
  assert.match(popup, /t\('popup\.resume'\)/);
  assert.match(popup, /settings\.badge\.title/);
  assert.doesNotMatch(popup, /content_scripts|executeScript|favicon\.ico|google\.com\/s2/);
  const css = read('src/popup.css');
  assert.match(css, /width: 320px/);
  assert.match(css, /\.popup-host-icon \{[^}]*flex: 0 0 24px;[^}]*width: 24px;[^}]*height: 24px;/);
  assert.match(css, /\.popup-host-name,\s*\n\.popup-host \.popup-host-link \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
  assert.match(css, /\.popup-host-link span \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;/);
  assert.match(read('wxt.config.ts'), /permissions: \['storage', 'tabs', 'webNavigation', 'idle', 'alarms', 'favicon'\]/);
  assert.doesNotMatch(read('wxt.config.ts'), /content_scripts|host_permissions/);
});

test('an open dashboard tab is focused and a missing one is created', () => {
  const url = 'chrome-extension://abc/dashboard.html';
  assert.deepEqual(dashboardAction([{ id: 4, windowId: 2, url }], url), { type: 'focus', tabId: 4, windowId: 2 });
  assert.deepEqual(dashboardAction([{ id: 5, windowId: 1, pendingUrl: url }], url), { type: 'focus', tabId: 5, windowId: 1 });
  assert.deepEqual(dashboardAction([{ id: 6, url: 'https://example.com/' }], url), { type: 'create', url });
  assert.deepEqual(dashboardAction(undefined, url), { type: 'create', url });
});
