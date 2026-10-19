import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { commitTick, daysBetween, openLedger, readDomains, readHead, siteDays, siteHours } from '../src/ledger.mjs';
import { siteSeries, siteSeriesFromSnapshot, viewFromLedger, viewFromSnapshot } from '../src/ledger-view.mjs';
import { addDays, breakdown, dateKey, summarize } from '../src/model.mjs';
import { siteOf } from '../src/site.mjs';
import { DEFAULT_SETTINGS, validateSettings } from '../src/settings.mjs';

globalThis.location = { protocol: 'http:' };
const { colorOf, iconHost } = await import('../src/data.js');

const modes = ['none', 'prefix', 'registrable'];
const keyOf = mode => domain => siteOf(domain, mode);

test('siteOf strips only leading www, m and mobile labels', () => {
  assert.equal(siteOf('www.github.com', 'prefix'), 'github.com');
  assert.equal(siteOf('m.youtube.com', 'prefix'), 'youtube.com');
  assert.equal(siteOf('mobile.youtube.com', 'prefix'), 'youtube.com');
  assert.equal(siteOf('www.m.mobile.youtube.com', 'prefix'), 'youtube.com');
  assert.equal(siteOf('WWW.YouTube.com', 'prefix'), 'YouTube.com');
  assert.equal(siteOf('gist.github.com', 'prefix'), 'gist.github.com');
  assert.equal(siteOf('notwww.example.com', 'prefix'), 'notwww.example.com');
  assert.equal(siteOf('www', 'prefix'), 'www');
  assert.equal(siteOf('m', 'prefix'), 'm');
  assert.equal(siteOf('www.example.co.uk', 'prefix'), 'example.co.uk');
  assert.equal(siteOf('a.b.example.co.uk', 'prefix'), 'a.b.example.co.uk');
});

test('siteOf registrable mode uses the ICANN public suffix and keeps unresolved hosts', () => {
  assert.equal(siteOf('a.b.example.co.uk', 'registrable'), 'example.co.uk');
  assert.equal(siteOf('www.example.co.uk', 'registrable'), 'example.co.uk');
  assert.equal(siteOf('foo.github.io', 'registrable'), 'github.io');
  assert.equal(siteOf('blog.user.github.io', 'registrable'), 'github.io');
  assert.equal(siteOf('foo.github.io', 'prefix'), 'foo.github.io');
  assert.equal(siteOf('foo.github.io', 'none'), 'foo.github.io');
  assert.equal(siteOf('co.uk', 'registrable'), 'co.uk');
  assert.equal(siteOf('com', 'registrable'), 'com');
  for (const host of ['127.0.0.1', '192.168.0.1', '::1', '[::1]', 'localhost']) {
    for (const mode of modes) assert.equal(siteOf(host, mode), host, `${mode} ${host}`);
  }
});

test('siteOf keeps IDN and punycode in the form it was given', () => {
  assert.equal(siteOf('www.münchen.de', 'none'), 'www.münchen.de');
  assert.equal(siteOf('www.münchen.de', 'prefix'), 'münchen.de');
  assert.equal(siteOf('www.münchen.de', 'registrable'), 'münchen.de');
  assert.equal(siteOf('www.xn--mnchen-3ya.de', 'prefix'), 'xn--mnchen-3ya.de');
  assert.equal(siteOf('www.xn--mnchen-3ya.de', 'registrable'), 'xn--mnchen-3ya.de');
  assert.equal(siteOf('m.食狮.com.cn', 'registrable'), '食狮.com.cn');
  assert.equal(siteOf('www.例子.中国', 'prefix'), '例子.中国');
  assert.equal(siteOf('www.例子.中国', 'registrable'), '例子.中国');
  assert.equal(siteOf('www.youtube.com', 'nope'), 'www.youtube.com');
  assert.equal(siteOf('www.youtube.com', 'prefix'), siteOf('www.youtube.com', 'prefix'));
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
  assert.equal(colorOf(siteOf('www.youtube.com', 'prefix')), colorOf(siteOf('m.youtube.com', 'prefix')));
  assert.equal(colorOf(siteOf('www.youtube.com', 'prefix')), colorOf('youtube.com'));
});

test('invalid siteMerge falls back to prefix and the other choices are kept', () => {
  assert.equal(DEFAULT_SETTINGS.siteMerge, 'prefix');
  assert.equal(validateSettings({ schema: 1, idleSeconds: 60, countAudible: true }).siteMerge, 'prefix');
  assert.equal(validateSettings({ siteMerge: 'none' }).siteMerge, 'none');
  assert.equal(validateSettings({ siteMerge: 'registrable' }).siteMerge, 'registrable');
  assert.equal(validateSettings({ siteMerge: 'all' }).siteMerge, 'prefix');
});

test('summarize grouping changes rows but not total time or visits', () => {
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
  const stats = Object.fromEntries(modes.map(mode => [mode, summarize(data, start, end, keyOf(mode))]));
  assert.deepEqual(data, before);
  assert.equal(stats.none.ms, stats.prefix.ms);
  assert.equal(stats.none.visits, stats.prefix.visits);
  assert.equal(stats.none.ms, stats.registrable.ms);
  assert.equal(stats.none.visits, stats.registrable.visits);
  assert.equal(stats.none.rows.length, 9);
  const youtube = stats.prefix.rows.find(row => row.domain === 'youtube.com');
  assert.deepEqual(youtube.hosts.map(host => host.domain), ['m.youtube.com', 'www.youtube.com', 'mobile.youtube.com']);
  assert.equal(youtube.ms, youtube.hosts.reduce((sum, host) => sum + host.ms, 0));
  assert.equal(youtube.visits, 2);
  assert.equal(stats.prefix.rows.some(row => row.domain === 'gist.github.com'), true);
  assert.deepEqual(stats.registrable.rows.find(row => row.domain === 'example.co.uk').hosts.map(host => host.domain).sort(), ['a.b.example.co.uk', 'www.example.co.uk']);
  assert.deepEqual(stats.registrable.rows.find(row => row.domain === 'github.com').hosts.map(host => host.domain).sort(), ['gist.github.com', 'github.com', 'www.github.com']);
  assert.equal(stats.registrable.rows.find(row => row.domain === '127.0.0.1').hosts.length, 1);
  const parts = breakdown(data, start, end, 'youtube.com', keyOf('prefix'));
  assert.equal(parts.ms, youtube.ms);
  assert.equal(parts.visits, youtube.visits);
  assert.deepEqual(parts.rows, youtube.hosts);
  assert.equal(breakdown(data, start, end, 'gist.github.com', keyOf('prefix')).rows.length, 1);
  assert.equal(summarize(data, start, end).rows.length, stats.none.rows.length);
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
  const prefix = viewFromSnapshot(data, { start, end, today: start, site: 'github.com', siteMerge: 'prefix' });
  assert.deepEqual(prefix.visits.map(visit => visit.domain), ['www.github.com', 'github.com']);
  assert.deepEqual(prefix.visits.map(visit => visit.site), ['github.com', 'github.com']);
  const registrable = viewFromSnapshot(data, { start, end, today: start, site: 'github.com', siteMerge: 'registrable' });
  assert.deepEqual(registrable.visits.map(visit => visit.domain), ['www.github.com', 'gist.github.com', 'github.com']);
  const typed = viewFromSnapshot(data, { start, end, today: start, search: 'github.com', siteMerge: 'prefix' });
  assert.equal(typed.visits.length, 3);
  const timeline = viewFromSnapshot(data, { start, end, today: start, siteMerge: 'prefix' });
  assert.deepEqual(timeline.spans.map(span => span.site), ['youtube.com', 'youtube.com']);
  assert.deepEqual(timeline.spans.map(span => span.domain), ['www.youtube.com', 'm.youtube.com']);
  const totals = modes.map(mode => viewFromSnapshot(data, { start, end, today: start, siteMerge: mode }).stats);
  assert.equal(totals[0].ms, totals[1].ms);
  assert.equal(totals[0].visits, totals[2].visits);
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
  const views = Object.fromEntries(modes.map(mode => [mode, viewFromLedger({ state: { enabled: true, since: at }, domains, days, spans: [], visits: [] }, { ...range, siteMerge: mode })]));
  assert.equal(views.none.stats.ms, views.prefix.stats.ms);
  assert.equal(views.none.stats.visits, views.registrable.stats.visits);
  assert.equal(views.prefix.stats.rows.find(row => row.domain === 'youtube.com').ms, 140);
  assert.equal(views.prefix.stats.rows.find(row => row.domain === 'gist.github.com').visits, 4);
  assert.equal(views.registrable.stats.rows.find(row => row.domain === 'github.com').visits, 4);
  assert.equal(views.prefix.stats.rows.find(row => row.domain === 'youtube.com').hosts.length, 2);
  const filtered = viewFromLedger({
    state: { enabled: true, since: at },
    domains,
    days,
    spans: [],
    visits: [{ domainId: 1, at }, { domainId: 3, at: at + 1 }],
  }, { ...range, site: 'youtube.com', siteMerge: 'prefix' });
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
  const load = async (site, siteMerge) => {
    const ids = domains.filter(row => siteOf(row.host, siteMerge) === site).map(row => row.id);
    const [dayRows, hourRows] = await Promise.all([
      Promise.all(ids.map(id => siteDays(db, id, from, to))),
      Promise.all(ids.map(id => siteHours(db, id, from, to))),
    ]);
    return { dayRows: dayRows.flat(), hourRows: hourRows.flat() };
  };
  const rowsFor = (site, siteMerge) => load(site, siteMerge).then(({ dayRows, hourRows }) => ({
    series: siteSeries({ domains, days: dayRows, hours: hourRows, state: head.state }, { site, siteMerge, start, end, now: at(19, 12) }),
    header: viewFromLedger({
      state: head.state, domains, days, spans: [], visits: [],
    }, { start, end, today: at(19), siteMerge, now: at(19, 12) }).stats.rows.find(row => row.domain === site)?.ms ?? 0,
  }));
  const youtube = await rowsFor('youtube.com', 'prefix');
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

  const today = await load('youtube.com', 'prefix').then(({ dayRows, hourRows }) => siteSeries(
    { domains, days: dayRows, hours: hourRows, state: head.state },
    { site: 'youtube.com', siteMerge: 'prefix', start: at(19), end: at(20), now: at(19, 12) },
  ));
  assert.equal(today.days.length, 1);
  assert.equal(today.days[0].ms, 1_800_000);
  assert.equal(sum(today.hours), 1_800_000);

  const separate = await rowsFor('www.youtube.com', 'none');
  assert.equal(separate.header, 7_200_000);
  assert.equal(sum(separate.series.days), separate.header);
  assert.equal(sum(separate.series.hours), separate.header);
  const mobile = await rowsFor('m.youtube.com', 'none');
  assert.equal(mobile.header, 1_800_000);
  assert.equal(sum(mobile.series.hours), mobile.header);

  const prefixGitHub = await rowsFor('github.com', 'prefix');
  const registrableGitHub = await rowsFor('github.com', 'registrable');
  assert.equal(prefixGitHub.header, 600_000);
  assert.equal(sum(prefixGitHub.series.days), prefixGitHub.header);
  assert.equal(registrableGitHub.header, 1_800_000);
  assert.equal(sum(registrableGitHub.series.days), registrableGitHub.header);
  assert.equal(sum(registrableGitHub.series.hours), registrableGitHub.header);

  const creditStart = at(19, 12);
  const creditedNow = at(19, 12, 0) + 45_000;
  const creditedSeries = siteSeries({
    domains,
    days: (await load('youtube.com', 'prefix')).dayRows,
    hours: (await load('youtube.com', 'prefix')).hourRows,
    state: head.state,
    cursor: { domain: 'm.youtube.com', since: creditStart },
    lastEnd: creditStart,
  }, { site: 'youtube.com', siteMerge: 'prefix', start, end, now: creditedNow });
  const creditedHeader = viewFromLedger({
    state: head.state, domains, days, spans: [], visits: [],
    cursor: { domain: 'm.youtube.com', since: creditStart }, lastEnd: creditStart,
  }, { start, end, today: at(19), siteMerge: 'prefix', now: creditedNow }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(creditedHeader, 9_045_000);
  assert.equal(sum(creditedSeries.days), creditedHeader);
  assert.equal(sum(creditedSeries.hours), creditedHeader);
  assert.equal(creditedSeries.days.find(day => dateKey(day.at) === '2026-10-19').ms, 1_845_000);
  assert.equal(creditedSeries.hours[12].ms, 45_000);
  const paused = siteSeries({
    domains,
    days: (await load('youtube.com', 'prefix')).dayRows,
    hours: (await load('youtube.com', 'prefix')).hourRows,
    state: { ...head.state, enabled: false },
    cursor: { domain: 'm.youtube.com', since: creditStart },
    lastEnd: creditStart,
  }, { site: 'youtube.com', siteMerge: 'prefix', start, end, now: creditedNow });
  const pausedHeader = viewFromLedger({
    state: { ...head.state, enabled: false }, domains, days, spans: [], visits: [],
    cursor: { domain: 'm.youtube.com', since: creditStart }, lastEnd: creditStart,
  }, { start, end, today: at(19), siteMerge: 'prefix', now: creditedNow }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(pausedHeader, 9_000_000);
  assert.equal(sum(paused.days), pausedHeader);
  assert.equal(sum(paused.hours), pausedHeader);

  const snapshot = {
    enabled: true,
    since: at(17, 10),
    visits: [{ domain: 'www.youtube.com', at: at(17, 9) }],
    spans: spans.map(([domain, spanStart, spanEnd]) => ({ domain, start: spanStart, end: spanEnd })),
  };
  const preview = siteSeriesFromSnapshot(snapshot, { site: 'youtube.com', siteMerge: 'prefix', start, end, now: at(19, 12) });
  const previewHeader = viewFromSnapshot(snapshot, { start, end, today: at(19), siteMerge: 'prefix' }).stats.rows.find(row => row.domain === 'youtube.com').ms;
  assert.equal(previewHeader, 9_000_000);
  assert.equal(sum(preview.days), previewHeader);
  assert.equal(sum(preview.hours), previewHeader);
  assert.equal(preview.days.find(day => dateKey(day.at) === '2026-10-16').recorded, false);
  assert.equal(preview.days.find(day => dateKey(day.at) === '2026-10-20').ms, 0);
  const empty = siteSeriesFromSnapshot(
    { enabled: true, since: start, visits: [{ domain: 'example.com', at: start + 1 }], spans: [] },
    { site: 'example.com', siteMerge: 'prefix', start, end, now: end },
  );
  assert.equal(empty.days.length, 6);
  assert.equal(empty.hours.length, 24);
  assert.equal(sum(empty.days), 0);
  assert.equal(sum(empty.hours), 0);
  assert.equal(viewFromSnapshot(
    { enabled: true, since: start, visits: [{ domain: 'example.com', at: start + 1 }], spans: [] },
    { start, end, today: at(19), siteMerge: 'prefix' },
  ).stats.rows.find(row => row.domain === 'example.com').ms, 0);
});

test('timing notes and the readme describe the three groupings and raw storage', () => {
  const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  assert.match(en.howItWorks.merge.storage, /original hostname/);
  assert.match(en.howItWorks.merge.prefix, /www/);
  assert.match(en.howItWorks.merge.registrable, /example\.co\.uk/);
  assert.match(en.howItWorks.merge.registrable, /github\.io/);
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  for (const text of [readme, changelog]) {
    assert.match(text, /www/);
    assert.match(text, /主机名/);
    assert.match(text, /example\.co\.uk/);
  }
  const background = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../src/ledger.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(background, /tldts|site\.mjs|siteOf/);
  assert.doesNotMatch(ledger, /tldts|siteOf/);
});
