import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';
import { focusSpans, focusSummary, timelineHasActivity, toggleSiteFilter, trendHasActivity } from '../src/site-filter.mjs';

const sum = rows => rows.reduce((total, row) => total + row.ms, 0);
const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

const snapshot = {
  enabled: true,
  since: at(18),
  visits: [
    { domain: 'www.youtube.com', at: at(19, 9) },
    { domain: 'm.youtube.com', at: at(19, 10) },
    { domain: 'gist.github.com', at: at(19, 11) },
    { domain: 'github.com', at: at(19, 12) },
  ],
  spans: [
    { domain: 'www.youtube.com', start: at(19, 9), end: at(19, 9, 5) },
    { domain: 'm.youtube.com', start: at(19, 10), end: at(19, 10, 4) },
    { domain: 'gist.github.com', start: at(19, 11), end: at(19, 11, 3) },
    { domain: 'github.com', start: at(19, 12), end: at(19, 12, 1) },
    { domain: 'www.youtube.com', start: at(18, 8), end: at(18, 8, 8) },
  ],
};

test('selecting a merged site keeps that site’s milliseconds and a second click clears it', () => {
  const range = { start: at(18), end: at(20), today: at(19), siteMerge: 'prefix' };
  const full = viewFromSnapshot(snapshot, range);
  assert.equal(full.stats.ms, 5 * 60_000 + 4 * 60_000 + 3 * 60_000 + 60_000 + 8 * 60_000);
  let filter = toggleSiteFilter('', 'youtube.com');
  const youtube = focusSummary(full.todayStats, filter);
  assert.equal(youtube.ms, 5 * 60_000 + 4 * 60_000);
  assert.equal(youtube.visits, 2);
  assert.equal(youtube.rows.length, 1);
  const spanMs = (spans, start, end) => spans.reduce((total, span) => total + Math.max(0, Math.min(span.end, end) - Math.max(span.start, start)), 0);
  assert.equal(spanMs(focusSpans(full.spans, filter), at(19), at(20)), youtube.ms);
  const week = viewFromSnapshot(snapshot, { start: at(13), end: at(20), today: at(19), site: filter, siteMerge: 'prefix' });
  assert.equal(sum(week.days), youtube.ms + 8 * 60_000);
  assert.equal(week.stats.ms, full.stats.ms);
  assert.equal(week.spans.length, full.spans.length);
  filter = toggleSiteFilter(filter, 'youtube.com');
  assert.equal(filter, '');
  assert.equal(focusSummary(full.todayStats, filter).ms, full.todayStats.ms);
  assert.equal(focusSummary(full.todayStats, filter).visits, full.todayStats.visits);
  assert.equal(focusSummary(full.todayStats, filter).rows.length, full.todayStats.rows.length);
});

test('registrable and none filters use the same key as the ranking row', () => {
  const today = { start: at(19), end: at(20), today: at(19) };
  const registrable = viewFromSnapshot(snapshot, { ...today, siteMerge: 'registrable' });
  const github = focusSummary(registrable.todayStats, 'github.com');
  assert.equal(github.ms, 3 * 60_000 + 60_000);
  assert.equal(github.visits, 2);
  assert.deepEqual(github.rows[0].hosts.map(host => host.domain).sort(), ['gist.github.com', 'github.com']);
  const separate = viewFromSnapshot(snapshot, { ...today, siteMerge: 'none' });
  assert.equal(focusSummary(separate.todayStats, 'www.youtube.com').ms, 5 * 60_000);
  assert.equal(focusSummary(separate.todayStats, 'youtube.com').ms, 0);
  assert.equal(focusSummary(separate.todayStats, 'youtube.com').rows.length, 0);
  assert.equal(trendHasActivity(viewFromSnapshot(snapshot, { start: at(13), end: at(20), today: at(19), site: 'missing.example', siteMerge: 'prefix' }).days), false);
  assert.equal(timelineHasActivity(focusSpans(separate.spans, 'www.youtube.com'), at(19), at(20)), true);
  assert.equal(timelineHasActivity(focusSpans(separate.spans, 'gist.github.com'), at(20), at(21)), false);
});

test('ledger trend days follow the site filter while ranking totals stay complete', () => {
  const domains = [
    { id: 1, host: 'www.youtube.com' },
    { id: 2, host: 'm.youtube.com' },
    { id: 3, host: 'gist.github.com' },
    { id: 4, host: 'github.com' },
  ];
  const days = [
    { date: '2026-10-18', domainId: 1, ms: 8 * 60_000, visits: 0 },
    { date: '2026-10-19', domainId: 1, ms: 5 * 60_000, visits: 1 },
    { date: '2026-10-19', domainId: 2, ms: 4 * 60_000, visits: 1 },
    { date: '2026-10-19', domainId: 3, ms: 3 * 60_000, visits: 1 },
    { date: '2026-10-19', domainId: 4, ms: 60_000, visits: 1 },
  ];
  const base = {
    state: { enabled: true, since: at(18) },
    domains,
    days,
    hours: [{ date: '2026-10-19', hour: 9, domainId: 1, ms: 5 * 60_000 }],
    spans: [{ domainId: 1, start: at(19, 9), end: at(19, 9, 5) }, { domainId: 3, start: at(19, 11), end: at(19, 11, 3) }],
    visits: [{ domainId: 1, at: at(19, 9) }, { domainId: 3, at: at(19, 11) }],
  };
  const range = { start: at(18), end: at(20), today: at(19), now: at(19, 12), siteMerge: 'prefix' };
  const full = viewFromLedger(base, range);
  const filtered = viewFromLedger(base, { ...range, site: 'youtube.com' });
  assert.equal(full.stats.ms, 21 * 60_000);
  assert.equal(filtered.stats.ms, full.stats.ms);
  assert.equal(filtered.stats.rows.find(row => row.domain === 'youtube.com').ms, 17 * 60_000);
  assert.equal(sum(filtered.days), 17 * 60_000);
  assert.equal(focusSummary(full.todayStats, 'youtube.com').ms, 9 * 60_000);
  assert.equal(focusSummary(full.todayStats, 'youtube.com').visits, 2);
  assert.equal(filtered.hourRows.reduce((total, row) => total + row.ms, 0), full.hourRows.reduce((total, row) => total + row.ms, 0));
  assert.equal(filtered.spans.length, full.spans.length);
  assert.deepEqual(filtered.visits.map(visit => visit.domain), ['www.youtube.com']);
  const cleared = viewFromLedger(base, { ...range, site: toggleSiteFilter('youtube.com', 'youtube.com') });
  assert.equal(sum(cleared.days), full.stats.ms);
});

test('a filtered site with only visits still has a trend, and a site with no rows does not', () => {
  const visitOnly = {
    enabled: true,
    since: at(18),
    visits: [{ domain: 'news.example', at: at(19, 9) }],
    spans: [{ domain: 'other.example', start: at(19, 8), end: at(19, 8, 5) }],
  };
  const range = { start: at(18), end: at(21), today: at(20), site: 'news.example', siteMerge: 'prefix' };
  const days = viewFromSnapshot(visitOnly, range).days;
  const hit = days.find(day => new Date(day.at).getDate() === 19);
  assert.equal(hit.ms, 0);
  assert.equal(hit.visits, 1);
  assert.equal(hit.recorded, true);
  assert.equal(trendHasActivity(days), true);
  assert.equal(days.filter(day => day.visits > 0).length, 1);
  assert.equal(trendHasActivity(viewFromSnapshot(visitOnly, { ...range, site: 'missing.example' }).days), false);
  const before = viewFromSnapshot({ ...visitOnly, since: at(20) }, range).days.find(day => new Date(day.at).getDate() === 19);
  assert.equal(before.recorded, false);
  assert.equal(before.visits, 1);
  assert.equal(trendHasActivity([before]), false);

  const ledger = viewFromLedger({
    state: { enabled: true, since: at(18) },
    domains: [{ id: 1, host: 'news.example' }, { id: 2, host: 'other.example' }],
    days: [
      { date: '2026-10-19', domainId: 1, ms: 0, visits: 2 },
      { date: '2026-10-19', domainId: 2, ms: 5 * 60_000, visits: 1 },
    ],
    hours: [],
    spans: [],
    visits: [],
  }, { start: at(18), end: at(21), today: at(20), now: at(20, 12), site: 'news.example', siteMerge: 'prefix' });
  const row = ledger.days.find(day => new Date(day.at).getDate() === 19);
  assert.equal(row.ms, 0);
  assert.equal(row.visits, 2);
  assert.equal(row.recorded, true);
  assert.equal(trendHasActivity(ledger.days), true);
  assert.equal(ledger.days.find(day => new Date(day.at).getDate() === 18).visits, 0);
});
