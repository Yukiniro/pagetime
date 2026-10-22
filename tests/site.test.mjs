import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { commitTick, daysBetween, openLedger, readDomains, readHead, siteDays, siteHours } from '../src/ledger.mjs';
import { siteSeries, siteSeriesFromSnapshot, viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';
import { addDays, breakdown, dateKey, summarize } from '../src/model.mjs';
import { siteOf } from '../src/site.mjs';

globalThis.location = { protocol: 'http:' };
const { iconHost } = await import('../src/data.js');

test('siteOf strips only leading www, m and mobile labels', () => {
  assert.equal(siteOf('www.github.com'), 'github.com');
  assert.equal(siteOf('m.youtube.com'), 'youtube.com');
  assert.equal(siteOf('mobile.youtube.com'), 'youtube.com');
  assert.equal(siteOf('www.m.mobile.youtube.com'), 'youtube.com');
  assert.equal(siteOf('WWW.YouTube.com'), 'YouTube.com');
  assert.equal(siteOf('gist.github.com'), 'gist.github.com');
  assert.equal(siteOf('notwww.example.com'), 'notwww.example.com');
  assert.equal(siteOf('www'), 'www');
  assert.equal(siteOf('m'), 'm');
  assert.equal(siteOf('www.example.co.uk'), 'example.co.uk');
  assert.equal(siteOf('a.b.example.co.uk'), 'a.b.example.co.uk');
  assert.equal(siteOf('foo.github.io'), 'foo.github.io');
  for (const host of ['127.0.0.1', '192.168.0.1', '::1', '[::1]', 'localhost']) {
    assert.equal(siteOf(host), host);
  }
});

test('siteOf keeps IDN and punycode in the form it was given', () => {
  assert.equal(siteOf('www.münchen.de'), 'münchen.de');
  assert.equal(siteOf('www.xn--mnchen-3ya.de'), 'xn--mnchen-3ya.de');
  assert.equal(siteOf('m.食狮.com.cn'), '食狮.com.cn');
  assert.equal(siteOf('www.例子.中国'), '例子.中国');
  assert.equal(siteOf('www.youtube.com'), siteOf('www.youtube.com'));
});

test('merged sites share a known icon and one timeline color', async () => {
  assert.equal(iconHost('www.youtube.com'), 'youtube.com');
  assert.equal(iconHost('m.youtube.com', 'youtube.com'), 'youtube.com');
  assert.equal(iconHost('gist.github.com', 'gist.github.com'), '');
  assert.equal(iconHost('developer.mozilla.org', 'mozilla.org'), 'developer.mozilla.org');
  const { iconForSite } = await import('../src/data.js');
  assert.equal(iconForSite('mozilla.org', [{ domain: 'developer.mozilla.org' }]), 'developer.mozilla.org');
  assert.equal(iconForSite('youtube.com', [{ domain: 'www.youtube.com' }, { domain: 'm.youtube.com' }]), 'youtube.com');
  assert.equal(iconForSite('example.com', [{ domain: 'www.example.com' }, { domain: 'm.example.com' }]), '');
  const site = siteOf('www.youtube.com');
  assert.equal(site, siteOf('m.youtube.com'));
  assert.equal(site, 'youtube.com');
  const { colorsFor } = await import('../src/timeline-colors.mjs');
  const { timelineSwatchesFor } = await import('../src/theme.mjs');
  const swatches = timelineSwatchesFor(false);
  const colors = colorsFor([
    { domain: site, ms: 100, visits: 2 },
    { domain: 'github.com', ms: 40, visits: 1 },
  ], swatches);
  assert.equal(colors.size, 2);
  assert.equal(colors.get(site), swatches.ranks[0]);
  assert.notEqual(colors.get(site), colors.get('github.com'));
});

test('summarize merges leading prefixes without changing total time or visits', () => {
  const start = 1_000_000;
  const end = start + 100_000;
  const data = {
    visits: [
      { domain: 'www.youtube.com', at: start + 1 },
      { domain: 'm.youtube.com', at: start + 2 },
      { domain: 'gist.github.com', at: start + 3 },
      { domain: 'www.github.com', at: start + 4 },
      { domain: 'github.com', at: start + 5 },
      { domain: 'a.b.example.co.uk', at: start + 6 },
      { domain: '127.0.0.1', at: start + 7 },
    ],
    spans: [
      { domain: 'www.youtube.com', start, end: start + 30_000 },
      { domain: 'm.youtube.com', start: start + 10_000, end: start + 40_000 },
      { domain: 'mobile.youtube.com', start: start - 5_000, end: start + 5_000 },
      { domain: 'gist.github.com', start: start + 5_000, end: start + 15_000 },
      { domain: 'www.github.com', start: start + 1_000, end: start + 4_000 },
      { domain: 'a.b.example.co.uk', start: start + 1_000, end: start + 11_000 },
      { domain: 'www.example.co.uk', start: start + 2_000, end: start + 8_000 },
      { domain: '127.0.0.1', start: start + 3_000, end: start + 4_000 },
    ],
  };
  const before = structuredClone(data);
  const stats = summarize(data, start, end, siteOf);
  const raw = summarize(data, start, end);
  assert.deepEqual(data, before);
  assert.equal(stats.ms, raw.ms);
  assert.equal(stats.visits, raw.visits);
  assert.equal(raw.rows.length, 9);
  const youtube = stats.rows.find(row => row.domain === 'youtube.com');
  assert.deepEqual(youtube.hosts.map(host => host.domain), ['m.youtube.com', 'www.youtube.com', 'mobile.youtube.com']);
  assert.equal(youtube.ms, youtube.hosts.reduce((sum, host) => sum + host.ms, 0));
  assert.equal(youtube.visits, 2);
  assert.equal(stats.rows.some(row => row.domain === 'gist.github.com'), true);
  assert.equal(stats.rows.some(row => row.domain === 'a.b.example.co.uk'), true);
  assert.equal(stats.rows.some(row => row.domain === 'www.example.co.uk'), false);
  assert.equal(stats.rows.find(row => row.domain === 'example.co.uk').hosts.length, 1);
  assert.equal(stats.rows.find(row => row.domain === '127.0.0.1').hosts.length, 1);
  const parts = breakdown(data, start, end, 'youtube.com', siteOf);
  assert.equal(parts.ms, youtube.ms);
  assert.equal(parts.visits, youtube.visits);
  assert.deepEqual(parts.rows, youtube.hosts);
  assert.equal(breakdown(data, start, end, 'gist.github.com', siteOf).rows.length, 1);
});

test('visits stay on the raw hostname and a merged site filter includes only its hosts', () => {
  const start = 1_000_000;
  const end = start + 10_000;
  const data = {
    enabled: true,
    since: start,
    visits: [
      { domain: 'www.github.com', at: start + 3 },
      { domain: 'gist.github.com', at: start + 2 },
      { domain: 'github.com', at: start + 1 },
    ],
    spans: [
      { domain: 'www.youtube.com', start, end: start + 2_000 },
      { domain: 'm.youtube.com', start: start + 2_000, end: start + 4_000 },
    ],
  };
  const grouped = viewFromSnapshot(data, { start, end, today: start, site: 'github.com' });
  assert.deepEqual(grouped.visits.map(visit => visit.domain), ['www.github.com', 'github.com']);
  assert.deepEqual(grouped.visits.map(visit => visit.site), ['github.com', 'github.com']);
  const typed = viewFromSnapshot(data, { start, end, today: start, search: 'github.com' });
  assert.equal(typed.visits.length, 3);
  const timeline = viewFromSnapshot(data, { start, end, today: start });
  assert.deepEqual(timeline.spans.map(span => span.site), ['youtube.com', 'youtube.com']);
  assert.deepEqual(timeline.spans.map(span => span.domain), ['www.youtube.com', 'm.youtube.com']);
  assert.equal(timeline.stats.ms, timeline.stats.rows.reduce((sum, row) => sum + row.ms, 0));
  assert.equal(timeline.stats.visits, 3);
});

test('ledger rows stay raw while the query view groups them', async () => {
  const db = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  const at = new Date(2026, 9, 19, 9, 0, 0).getTime();
  await commitTick(db, {
    expect: await readHead(db),
    now: at,
    span: { domain: 'www.youtube.com', start: at, end: at + 1_000 },
    visit: { domain: 'm.youtube.com', at },
    cursor: null,
  });
  assert.deepEqual((await readDomains(db)).map(row => row.host).sort(), ['m.youtube.com', 'www.youtube.com']);
  const domains = [
    { id: 1, host: 'www.youtube.com' },
    { id: 2, host: 'm.youtube.com' },
    { id: 3, host: 'gist.github.com' },
  ];
  const days = [
    { date: '2026-10-19', domainId: 1, ms: 100, visits: 1 },
    { date: '2026-10-19', domainId: 2, ms: 40, visits: 2 },
    { date: '2026-10-19', domainId: 3, ms: 10, visits: 4 },
  ];
  const range = { start: new Date(2026, 9, 19).getTime(), end: new Date(2026, 9, 20).getTime(), today: new Date(2026, 9, 19).getTime(), now: at };
  const view = viewFromLedger({ state: { enabled: true, since: at }, domains, days, spans: [], visits: [] }, range);
  assert.equal(view.stats.rows.find(row => row.domain === 'youtube.com').ms, 140);
  assert.equal(view.stats.rows.find(row => row.domain === 'gist.github.com').visits, 4);
  assert.equal(view.stats.rows.find(row => row.domain === 'youtube.com').hosts.length, 2);
  const filtered = viewFromLedger({
    state: { enabled: true, since: at },
    domains,
    days,
    spans: [],
    visits: [{ domainId: 1, at }, { domainId: 3, at: at + 1 }],
  }, { ...range, site: 'youtube.com' });
  assert.deepEqual(filtered.visits.map(visit => visit.domain), ['www.youtube.com']);
  assert.equal(filtered.visitCount, 3);
});

const sum = rows => rows.reduce((total, row) => total + row.ms, 0);
const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

test('site daily bars and the 24 hour bars equal the detail header for merged hosts', async () => {
  const db = openLedger({ indexedDB: new IDBFactory(), IDBKeyRange });
  const spans = [
    ['www.youtube.com', at(17, 9), at(17, 10)],
    ['m.youtube.com', at(17, 10, 30), at(17, 11)],
    ['www.youtube.com', at(18, 23, 30), at(19, 0, 30)],
    ['gist.github.com', at(17, 9), at(17, 9, 10)],
    ['docs.github.com', at(17, 8), at(17, 8, 10)],
    ['github.com', at(17, 8, 10), at(17, 8, 20)],
  ];
  for (const [domain, start, end] of spans) {
    await commitTick(db, { expect: await readHead(db), now: end, span: { domain, start, end }, cursor: null });
  }
  const start = at(15);
  const end = at(21);
  const from = dateKey(start);
  const to = dateKey(addDays(end, -1));
  const domains = await readDomains(db);
  const head = await readHead(db);
  const days = await daysBetween(db, from, to);
  const load = async site => {
    const ids = domains.filter(row => siteOf(row.host) === site).map(row => row.id);
    const [dayRows, hourRows] = await Promise.all([
      Promise.all(ids.map(id => siteDays(db, id, from, to))),
      Promise.all(ids.map(id => siteHours(db, id, from, to))),
    ]);
    return { dayRows: dayRows.flat(), hourRows: hourRows.flat() };
  };
  const rowsFor = site => load(site).then(({ dayRows, hourRows }) => ({
    series: siteSeries({ domains, days: dayRows, hours: hourRows, state: head.state }, { site, start, end, now: at(19, 12) }),
    header: viewFromLedger({
      state: head.state, domains, days, spans: [], visits: [],
    }, { start, end, today: at(19), now: at(19, 12) }).stats.rows.find(row => row.domain === site)?.ms ?? 0,
  }));
  const youtube = await rowsFor('youtube.com');
  assert.equal(head.state.since, at(17, 10));
  assert.deepEqual(youtube.series.days.map(day => [dateKey(day.at), day.ms, day.recorded]), [
    ['2026-10-15', 0, false],
    ['2026-10-16', 0, false],
    ['2026-10-17', 5_400_000, true],
    ['2026-10-18', 1_800_000, true],
    ['2026-10-19', 1_800_000, true],
    ['2026-10-20', 0, true],
  ]);
  assert.deepEqual(youtube.series.hours.map(hour => hour.ms), Array.from({ length: 24 }, (_, hour) => (
    hour === 0 || hour === 10 || hour === 23 ? 1_800_000 : hour === 9 ? 3_600_000 : 0
  )));
  assert.equal(youtube.header, 9_000_000);
  assert.equal(sum(youtube.series.days), youtube.header);
  assert.equal(sum(youtube.series.hours), youtube.header);
  const overview = viewFromLedger({
    state: head.state, domains, days, spans: [], visits: [],
  }, { start, end, today: at(19), now: at(19, 12) });
  assert.deepEqual(overview.days.map(day => [dateKey(day.at), day.recorded]), youtube.series.days.map(day => [dateKey(day.at), day.recorded]));

  const today = await load('youtube.com').then(({ dayRows, hourRows }) => siteSeries(
    { domains, days: dayRows, hours: hourRows, state: head.state },
    { site: 'youtube.com', start: at(19), end: at(20), now: at(19, 12) },
  ));
  assert.equal(today.days.length, 1);
  assert.equal(today.days[0].ms, 1_800_000);
  assert.equal(sum(today.hours), 1_800_000);

  const github = await rowsFor('github.com');
  assert.equal(github.header, 600_000);
  assert.equal(sum(github.series.days), github.header);
  assert.equal(sum(github.series.hours), github.header);
  const gist = await rowsFor('gist.github.com');
  assert.equal(gist.header, 600_000);
  assert.equal(sum(gist.series.days), gist.header);

  const creditStart = at(19, 12);
  const creditedNow = at(19, 12, 0) + 45_000;
  const creditedSeries = siteSeries({
    domains,
    days: (await load('youtube.com')).dayRows,
    hours: (await load('youtube.com')).hourRows,
    state: head.state,
    cursor: { domain: 'm.youtube.com', since: creditStart },
    lastEnd: creditStart,
  }, { site: 'youtube.com', start, end, now: creditedNow });
  const creditedHeader = viewFromLedger({
    state: head.state, domains, days, spans: [], visits: [],
    cursor: { domain: 'm.youtube.com', since: creditStart }, lastEnd: creditStart,
  }, { start, end, today: at(19), now: creditedNow }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(creditedHeader, 9_045_000);
  assert.equal(sum(creditedSeries.days), creditedHeader);
  assert.equal(sum(creditedSeries.hours), creditedHeader);
  assert.equal(creditedSeries.days.find(day => dateKey(day.at) === '2026-10-19').ms, 1_845_000);
  assert.equal(creditedSeries.hours[12].ms, 45_000);
  const paused = siteSeries({
    domains,
    days: (await load('youtube.com')).dayRows,
    hours: (await load('youtube.com')).hourRows,
    state: { ...head.state, enabled: false },
    cursor: { domain: 'm.youtube.com', since: creditStart },
    lastEnd: creditStart,
  }, { site: 'youtube.com', start, end, now: creditedNow });
  const pausedHeader = viewFromLedger({
    state: { ...head.state, enabled: false }, domains, days, spans: [], visits: [],
    cursor: { domain: 'm.youtube.com', since: creditStart }, lastEnd: creditStart,
  }, { start, end, today: at(19), now: creditedNow }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(pausedHeader, 9_000_000);
  assert.equal(sum(paused.days), pausedHeader);
  assert.equal(sum(paused.hours), pausedHeader);

  const snapshot = {
    enabled: true,
    since: at(17, 10),
    visits: [{ domain: 'www.youtube.com', at: at(17, 9) }],
    spans: spans.map(([domain, spanStart, spanEnd]) => ({ domain, start: spanStart, end: spanEnd })),
  };
  const preview = siteSeriesFromSnapshot(snapshot, { site: 'youtube.com', start, end, now: at(19, 12) });
  const previewHeader = viewFromSnapshot(snapshot, { start, end, today: at(19) }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(previewHeader, 9_000_000);
  assert.equal(sum(preview.days), previewHeader);
  assert.equal(sum(preview.hours), previewHeader);
  assert.equal(preview.days.find(day => dateKey(day.at) === '2026-10-16').recorded, false);
  assert.equal(preview.days.find(day => dateKey(day.at) === '2026-10-20').ms, 0);
  const empty = siteSeriesFromSnapshot(
    { enabled: true, since: start, visits: [{ domain: 'example.com', at: start + 1 }], spans: [] },
    { site: 'example.com', start, end, now: end },
  );
  assert.equal(empty.days.length, 6);
  assert.equal(empty.hours.length, 24);
  assert.equal(sum(empty.days), 0);
  assert.equal(sum(empty.hours), 0);
  assert.equal(viewFromSnapshot(
    { enabled: true, since: start, visits: [{ domain: 'example.com', at: start + 1 }], spans: [] },
    { start, end, today: at(19) },
  ).stats.rows.find(row => row.domain === 'example.com').ms, 0);
});

test('timing notes and the readme describe prefix grouping and raw storage', () => {
  const timing = readFileSync(new URL('../docs/timing.md', import.meta.url), 'utf8');
  const chinese = readFileSync(new URL('../docs/timing.zh-CN.md', import.meta.url), 'utf8');
  for (const text of [timing, chinese]) {
    assert.match(text, /www\.youtube\.com/);
    assert.match(text, /gist\.github\.com/);
    assert.doesNotMatch(text, /Public Suffix List|ICANN|registrable/);
  }
  assert.match(timing, /original hostname/);
  assert.match(chinese, /原始主机名/);
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /www/);
  assert.match(readme, /主机名/);
  assert.doesNotMatch(readme, /可注册域名|Public Suffix List/);
  const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../src/ledger.mjs', import.meta.url), 'utf8');
  const site = readFileSync(new URL('../src/site.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(background, /tldts|site\.mjs|siteOf/);
  assert.doesNotMatch(ledger, /tldts|siteOf/);
  assert.doesNotMatch(site, /tldts|registrable/);
});
