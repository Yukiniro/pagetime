import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addDays, dateKey, midnight } from '../src/model.mjs';
import { viewFromLedger } from '../src/ledger-view.mjs';
import { TOP_SITES_LIMIT, dashboardAction, popupToday, popupTopSites } from '../src/popup-model.mjs';

const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
const today = midnight(now);
const key = dateKey(now);
const yesterday = dateKey(addDays(today, -1));
const domains = [
  { id: 1, host: 'github.com' },
  { id: 2, host: 'www.github.com' },
  { id: 3, host: 'news.example' },
  { id: 4, host: 'a.example' },
  { id: 5, host: 'b.example' },
  { id: 6, host: 'c.example' },
  { id: 7, host: 'quiet.example' },
  { id: 8, host: 'old.example' },
];
const days = [
  { date: key, domainId: 1, ms: 600_000, visits: 2 },
  { date: key, domainId: 2, ms: 300_000, visits: 1 },
  { date: key, domainId: 3, ms: 700_000, visits: 1 },
  { date: key, domainId: 4, ms: 200_000, visits: 1 },
  { date: key, domainId: 5, ms: 100_000, visits: 1 },
  { date: key, domainId: 6, ms: 50_000, visits: 1 },
  { date: key, domainId: 7, ms: 0, visits: 3 },
  { date: yesterday, domainId: 8, ms: 9_999_000, visits: 4 },
];
const input = { domains, days, cursor: null, lastEnd: now, now, enabled: true };

test('top sites are the first rows of the dashboard today ranking, in the same order', () => {
  const top = popupTopSites(input);
  const view = viewFromLedger({
    state: { enabled: true, since: now - 86_400_000 },
    domains, days, hours: [], spans: [], visits: [], cursor: null, lastEnd: now,
  }, { start: today, end: addDays(today, 1), today, now });
  const ranked = view.todayStats.rows.filter(row => row.ms > 0).slice(0, TOP_SITES_LIMIT);
  assert.equal(top.length, TOP_SITES_LIMIT);
  assert.deepEqual(top.map(row => [row.site, row.ms]), ranked.map(row => [row.domain, row.ms]));
  assert.deepEqual(top.map(row => row.site), ['github.com', 'news.example', 'a.example', 'b.example', 'c.example']);
});

test('www. and github.com merge into one site, and yesterday or zero time never appear', () => {
  const top = popupTopSites(input, 10);
  const sites = top.map(row => row.site);
  assert.equal(top.find(row => row.site === 'github.com').ms, 900_000);
  assert.deepEqual(top.find(row => row.site === 'github.com').hosts.map(host => host.domain), ['github.com', 'www.github.com']);
  assert.ok(!sites.includes('old.example'));
  assert.ok(!sites.includes('quiet.example'));
  assert.equal(sites.length, 5);
});

test('an open cursor counts toward today, so the list agrees with the popup total', () => {
  const open = { ...input, cursor: { domain: 'c.example', since: now - 20_000 }, lastEnd: now - 20_000 };
  const credit = popupToday(open).total - popupToday(input).total;
  assert.ok(credit > 0);
  const row = popupTopSites(open, 10).find(item => item.site === 'c.example');
  assert.equal(row.ms, 50_000 + credit);
  assert.equal(popupTopSites({ ...open, enabled: false }, 10).find(item => item.site === 'c.example').ms, 50_000);
});

test('no data today returns no rows, so the popup renders no list', () => {
  assert.deepEqual(popupTopSites({ ...input, days: [] }), []);
  assert.deepEqual(popupTopSites({ ...input, days: days.filter(row => row.date !== key) }), []);
  assert.deepEqual(popupTopSites({ domains: [], days: [], now }), []);
});

test('a row carries only the grouped site, its time, and raw hostnames, never a URL', () => {
  for (const row of popupTopSites(input)) {
    assert.deepEqual(Object.keys(row).sort(), ['hosts', 'ms', 'site']);
    assert.ok(!row.site.includes('://') && !row.site.includes('/'));
    assert.equal(dashboardAction([], 'chrome-extension://abc/dashboard.html', row.site).url, `chrome-extension://abc/dashboard.html#site=${encodeURIComponent(row.site)}`);
  }
});

test('the popup list is hidden when empty and opens the site through the shared dashboard path', () => {
  const source = readFileSync(new URL('../src/Popup.jsx', import.meta.url), 'utf8');
  assert.match(source, /top\.length > 0 && <section/);
  assert.match(source, /openSite\(row\.site\)/);
  assert.match(source, /openDashboardPage\(browser, site\)/);
  assert.doesNotMatch(source, /aria-label=\{t\('popup\.viewSite'[^}]*row/);
});
