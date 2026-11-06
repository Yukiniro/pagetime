import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupSites } from '../src/model.mjs';
import { customRange, defaultChart, presetRange } from '../src/range.mjs';
import { siteOf } from '../src/site.mjs';
import { SHARE_LIMIT, shareColor, siteShareParts } from '../src/site-share.mjs';
import { timelineSwatchesFor } from '../src/theme.mjs';

const minute = 60_000;
const swatches = timelineSwatchesFor(false);
const row = (domain, minutes, visits = 1, ms = minutes * minute) => ({ domain, ms, visits });
const byDomain = (parts, domain) => parts.find(part => part.domain === domain);

test('40, 30, 20 and 10 minutes are those shares of the whole range', () => {
  const rows = [row('a.test', 40), row('b.test', 30), row('c.test', 20), row('d.test', 10)];
  const model = siteShareParts(rows, 100 * minute, { swatches });
  assert.deepEqual(model.parts.map(part => [part.domain, part.label, part.width]), [
    ['a.test', '40.0%', 40],
    ['b.test', '30.0%', 30],
    ['c.test', '20.0%', 20],
    ['d.test', '10.0%', 10],
  ]);
  assert.equal(model.parts.some(part => part.kind === 'other'), false);
  assert.equal(Math.max(...model.parts.map(part => part.width)), 40);
});

test('every site after the fifth is included in other', () => {
  const rows = [row('a.test', 40), row('b.test', 30), row('c.test', 20), row('d.test', 10), row('e.test', 5), row('f.test', 5), row('g.test', 0, 4)];
  const model = siteShareParts(rows, 110 * minute, { swatches });
  assert.equal(model.parts.filter(part => part.kind === 'site').length, SHARE_LIMIT);
  assert.equal(model.parts.some(part => part.domain === 'f.test' || part.domain === 'g.test'), false);
  const other = model.parts.find(part => part.kind === 'other');
  assert.equal(other.ms, 5 * minute);
  assert.equal(other.label, '4.5%');
  assert.equal(other.width, (5 * minute * 100) / (110 * minute));
});

test('a zero total has no bar and no NaN, and one site is 100%', () => {
  const empty = siteShareParts([row('z.test', 0, 4)], 0, { swatches });
  assert.deepEqual(empty.parts, []);
  assert.equal(JSON.stringify(empty).includes('NaN'), false);
  assert.equal(JSON.stringify(empty).includes('100'), false);
  const only = siteShareParts([row('only.test', 12)], 12 * minute, { swatches });
  assert.equal(only.parts.length, 1);
  assert.equal(only.parts[0].label, '100.0%');
  assert.equal(only.parts[0].width, 100);
});

test('a share under 0.1% keeps its real width', () => {
  const model = siteShareParts([row('big.test', 0, 1, 10_000), row('speck.test', 0, 1, 1)], 10_001, { swatches });
  const speck = byDomain(model.parts, 'speck.test');
  assert.equal(speck.label, '<0.1%');
  assert.ok(speck.width > 0 && speck.width < 0.1);
  assert.equal(speck.ms, 1);
});

test('a filtered site keeps the full-range denominator', () => {
  const rows = [row('a.test', 40), row('b.test', 60)];
  const model = siteShareParts(rows, 100 * minute, { focus: 'a.test', swatches });
  assert.deepEqual(model.parts.map(part => [part.kind, part.label, part.width]), [
    ['site', '40.0%', 40],
    ['rest', '60.0%', 60],
  ]);
  assert.equal(model.parts[0].domain, 'a.test');
  assert.equal(model.parts[0].ms + model.parts[1].ms, 100 * minute);
  const absent = siteShareParts(rows, 100 * minute, { focus: 'missing.test', swatches });
  assert.equal(absent.parts[0].label, '0%');
  assert.equal(absent.parts[1].width, 100);
});

test('a site keeps its color when its rank changes', () => {
  const leading = siteShareParts([row('a.test', 90), row('b.test', 10)], 100 * minute, { swatches });
  const trailing = siteShareParts([row('a.test', 10), row('b.test', 90)], 100 * minute, { swatches });
  assert.equal(byDomain(leading.parts, 'a.test').color, shareColor('a.test', swatches));
  assert.equal(byDomain(leading.parts, 'a.test').color, byDomain(trailing.parts, 'a.test').color);
  assert.equal(byDomain(leading.parts, 'b.test').color, byDomain(trailing.parts, 'b.test').color);
  const other = siteShareParts(['a', 'b', 'c', 'd', 'e', 'f'].map(name => ({ domain: `${name}.test`, ms: 1, visits: 1 })), 6, { swatches });
  assert.equal(other.parts.at(-1).kind, 'other');
  assert.equal(other.parts.at(-1).color, swatches.other);
});

test('grouped www, m and mobile names share one segment and the raw name stays', () => {
  const input = [
    { domain: 'www.a.test', ms: 30 * minute, visits: 1 },
    { domain: 'm.a.test', ms: 10 * minute, visits: 2 },
    { domain: 'mobile.b.test', ms: 60 * minute, visits: 1 },
  ];
  const grouped = groupSites(input.map(entry => ({ ...entry })), siteOf);
  assert.equal(input[0].domain, 'www.a.test');
  const model = siteShareParts(grouped.rows, grouped.ms, { swatches });
  assert.equal(byDomain(model.parts, 'a.test').label, '40.0%');
  assert.equal(byDomain(model.parts, 'b.test').label, '60.0%');
  assert.equal(model.parts.some(part => String(part.domain).includes('www.')), false);
});

test('a past day and a 7-day window use stored day totals, not session rows', async () => {
  const { addDays, dateKey, midnight } = await import('../src/model.mjs');
  const { viewFromLedger } = await import('../src/ledger-view.mjs');
  const now = new Date(2026, 9, 22, 16).getTime();
  const today = midnight(now);
  const past = addDays(today, -40);
  const pastKey = dateKey(past);
  const pastView = viewFromLedger({
    state: { enabled: true, since: addDays(today, -80) },
    domains: [{ id: 1, host: 'www.a.test' }, { id: 2, host: 'b.test' }, { id: 3, host: 'c.test' }],
    days: [
      { date: pastKey, domainId: 1, ms: 40 * minute, visits: 1 },
      { date: pastKey, domainId: 2, ms: 60 * minute, visits: 1 },
      { date: pastKey, domainId: 3, ms: 0, visits: 4 },
    ],
    hours: [{ date: pastKey, hour: 9, ms: 5 * minute, domainId: 1 }],
    spans: [],
    visits: [],
  }, { start: past, end: addDays(past, 1), today, now, search: '', site: '' });
  assert.equal(pastView.spans.length, 0);
  assert.equal(pastView.stats.ms, 100 * minute);
  assert.equal(pastView.stats.rows.some(entry => entry.domain === 'c.test' && entry.ms === 0 && entry.visits === 4), true);
  const pastShare = siteShareParts(pastView.stats.rows, pastView.stats.ms, { swatches });
  assert.equal(byDomain(pastShare.parts, 'a.test').label, '40.0%');
  assert.equal(pastShare.parts.some(part => part.domain === 'c.test'), false);

  const weekView = viewFromLedger({
    state: { enabled: true, since: addDays(today, -80) },
    domains: [{ id: 1, host: 'a.test' }],
    days: [
      { date: dateKey(addDays(today, -2)), domainId: 1, ms: 10 * minute, visits: 1 },
      { date: dateKey(today), domainId: 1, ms: 30 * minute, visits: 1 },
    ],
    hours: [],
    spans: [],
    visits: [],
  }, { start: addDays(today, -6), end: addDays(today, 1), today, now, search: '', site: '' });
  assert.equal(weekView.stats.ms, 40 * minute);
  assert.equal(defaultChart(presetRange('today', today)), 'share');
  assert.equal(defaultChart(presetRange('7d', today)), 'share');
  assert.equal(defaultChart(presetRange('30d', today)), 'share');
  assert.equal(defaultChart(customRange(pastKey, pastKey)), 'share');
});

test('reduced motion drops the share segment transition', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.heatmap-caret,\.rank-bar,\.share-segment\{transition:none\}/);
});

const { after, before, describe } = await import('node:test');
const { createServer } = await import('vite');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { addDays, midnight } = await import('../src/model.mjs');

const { window } = parseHTML('<!doctype html><html><body></body></html>');
window.document.oninput = null;
Object.defineProperty(window.HTMLInputElement.prototype, 'type', {
  get() { return this.getAttribute('type') || 'text'; },
  set(value) { this.setAttribute('type', value); },
});
const memory = new Map([['pagetime-language', 'en']]);
window.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(key),
  clear: () => memory.clear(),
  key: index => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
window.location = { protocol: 'http:', href: 'http://127.0.0.1/', pathname: '/', search: '', hash: '' };
const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'Element', 'Node', 'location', 'localStorage', 'getComputedStyle', 'matchMedia', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  location: window.location,
  localStorage: window.localStorage,
  getComputedStyle: () => ({ opacity: '1', transform: 'none', width: '0px' }),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
});
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');

const now = new Date(2026, 9, 22, 16).getTime();
const today = midnight(now);
const rootDir = fileURLToPath(new URL('..', import.meta.url));

function summary(rows) {
  return { rows, ms: rows.reduce((total, entry) => total + entry.ms, 0), visits: rows.reduce((total, entry) => total + entry.visits, 0) };
}

let server;
let Overview;
let i18n;
let languages;

describe('site share chart', () => {
  before(async () => {
    const react = (await import('@vitejs/plugin-react')).default;
    server = await createServer({
      configFile: false,
      root: rootDir,
      resolve: {
        alias: {
          '@app': fileURLToPath(new URL('../src', import.meta.url)),
          'echarts/core': fileURLToPath(new URL('./helpers/echarts-click-mock.mjs', import.meta.url)),
        },
      },
      plugins: [react(), {
        name: 'stub-echarts-parts',
        resolveId(id) {
          if (id === 'echarts/charts' || id === 'echarts/components' || id === 'echarts/renderers') return `\0${id}`;
        },
        load(id) {
          if (id === '\0echarts/charts') return 'export const BarChart = {}; export const CustomChart = {}; export const HeatmapChart = {};';
          if (id === '\0echarts/components') return 'export const GridComponent = {}; export const TooltipComponent = {}; export const VisualMapComponent = {};';
          if (id === '\0echarts/renderers') return 'export const CanvasRenderer = {};';
        },
      }],
      cacheDir: '/tmp/pagetime-site-share-vite',
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
    });
    ({ Overview } = await server.ssrLoadModule('/src/overview.jsx'));
    ({ default: i18n, languages } = await server.ssrLoadModule('/src/i18n.js'));
    await i18n.changeLanguage('en');
  });

  after(async () => {
    await server?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });

  function mount() {
    const host = window.document.createElement('div');
    window.document.body.append(host);
    return { host, root: createRoot(host) };
  }

  async function render(props) {
    const view = mount();
    await React.act(async () => { view.root.render(React.createElement(Overview, props)); });
    return view;
  }

  async function unmount(view) {
    await React.act(async () => { view.root.unmount(); });
    view.host.remove();
  }

  async function click(element) {
    await React.act(async () => { element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
  }

  async function type(host, value) {
    const input = host.querySelector('#site-ledger input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }

  function props(rows, extra = {}) {
    const stats = summary(rows);
    return {
      preset: '7d',
      stats,
      trendDays: [{ at: today, ms: stats.ms, visits: stats.visits, recorded: true }],
      hourRows: [],
      since: addDays(today, -6),
      start: addDays(today, -6),
      end: addDays(today, 1),
      today,
      rangeLabel: 'Last 7 days',
      chartMode: 'share',
      trendLabel: 'Last 7 days',
      filterSite: '',
      onFilter() {},
      openSite() {},
      onSelectDay() {},
      ...extra,
    };
  }

  function line(host, domain) {
    return [...host.querySelectorAll('.share-list li')].find(item => item.textContent.includes(domain));
  }

  test('the bar and the text use the same shares, and a site opens details', async () => {
    const opened = [];
    const filtered = [];
    const view = await render(props([
      row('a.test', 40), row('b.test', 30), row('c.test', 20), row('d.test', 10),
    ], {
      onFilter: domain => filtered.push(domain),
      openSite: domain => opened.push(domain),
    }));
    assert.equal(view.host.querySelector('#chart-tab-share')?.getAttribute('aria-selected'), 'true');
    assert.equal(view.host.querySelector('#chart-tab-share')?.textContent, 'Site share');
    assert.equal(view.host.querySelector('.primary-timeline'), null);
    assert.equal(view.host.querySelector('.share-bar') instanceof window.Element, true);
    assert.deepEqual([...view.host.querySelectorAll('.share-segment')].map(segment => segment.style.width), ['40%', '30%', '20%', '10%']);
    assert.equal(line(view.host, 'a.test').querySelector('.share-percent').textContent, '40.0%');
    assert.equal(line(view.host, 'a.test').textContent.includes('40 min'), true);
    assert.equal(view.host.querySelector('.site-share').textContent.includes('NaN'), false);
    assert.equal(line(view.host, 'a.test').querySelector('button').tagName, 'BUTTON');
    assert.equal(view.host.querySelector('.share-segment').tabIndex, -1);
    await click(view.host.querySelector('.share-segment'));
    await click(line(view.host, 'b.test').querySelector('button'));
    assert.deepEqual(opened, ['a.test', 'b.test']);
    assert.deepEqual(filtered, []);
    await unmount(view);
  });

  test('other jumps to the ledger and keeps a visit-only site there', async () => {
    const opened = [];
    const view = await render(props([
      row('a.test', 40), row('b.test', 30), row('c.test', 20), row('d.test', 10), row('e.test', 5), row('f.test', 5), row('quiet.test', 0, 3),
    ], { openSite: domain => opened.push(domain) }));
    assert.equal(line(view.host, 'f.test'), undefined);
    assert.equal(view.host.querySelector('[data-kind="other"] .share-percent').textContent, '4.5%');
    assert.equal(view.host.querySelector('[data-kind="other"]').textContent.includes('View all sites'), true);
    const quiet = [...view.host.querySelectorAll('.rank-line')].find(item => item.textContent.includes('quiet.test'));
    assert.equal(quiet.querySelector('.rank-share').textContent, '0%');
    const ledger = view.host.querySelector('#site-ledger');
    const input = ledger.querySelector('input');
    let scrolled = false;
    let focused = false;
    ledger.scrollIntoView = () => { scrolled = true; };
    input.focus = () => { focused = true; };
    await click(view.host.querySelector('[data-kind="other"] button'));
    assert.deepEqual(opened, []);
    assert.equal(scrolled, true);
    assert.equal(focused, true);
    await unmount(view);
  });

  test('a filtered site stays a share of all sites while the KPI counts only that site', async () => {
    const opened = [];
    const rows = [row('a.test', 40), row('b.test', 60)];
    const view = await render(props(rows, { filterSite: 'a.test', openSite: domain => opened.push(domain) }));
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, '40 min');
    assert.equal(view.host.querySelector('.chart-caption').textContent.includes('Share of all sites'), true);
    assert.equal(view.host.querySelector('.chart-caption').textContent.includes('Last 7 days'), true);
    assert.equal(line(view.host, 'a.test').querySelector('.share-percent').textContent, '40.0%');
    assert.equal(view.host.querySelector('[data-kind="rest"] .share-percent').textContent, '60.0%');
    assert.equal(view.host.querySelector('[data-kind="rest"]').textContent.includes('Other sites'), true);
    assert.deepEqual([...view.host.querySelectorAll('.share-segment')].map(segment => segment.style.width), ['40%', '60%']);
    await click(line(view.host, 'a.test').querySelector('button'));
    assert.deepEqual(opened, ['a.test']);
    assert.equal(view.host.querySelector('.filter-chip')?.textContent.includes('a.test'), true);
    await unmount(view);
  });

  test('zero total shows no bar, and the latest figures replace the previous ones', async () => {
    const rows = [row('a.test', 40), row('b.test', 60)];
    const view = await render(props(rows));
    await type(view.host, 'a.test');
    assert.equal(view.host.querySelector('#site-ledger input').value, 'a.test');
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props([row('a.test', 10), row('b.test', 90)])));
    });
    assert.equal(line(view.host, 'a.test').querySelector('.share-percent').textContent, '10.0%');
    assert.equal(view.host.querySelector('[data-key="a.test"]').style.width, '10%');
    assert.equal(view.host.querySelector('#site-ledger input').value, 'a.test');
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props([row('quiet.test', 0, 2)], { rangeLabel: 'Today', chartMode: 'share' })));
    });
    assert.equal(view.host.querySelector('.share-bar'), null);
    assert.equal(view.host.querySelector('.share-empty').textContent, 'No active time in this range');
    assert.equal(view.host.querySelector('.site-share').textContent.includes('NaN'), false);
    assert.equal(view.host.querySelector('.site-share').textContent.includes('100%'), false);
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props(rows, { chartMode: 'trend', end: addDays(today, 2) })));
    });
    assert.equal(view.host.querySelector('#chart-tab-trend')?.getAttribute('aria-selected'), 'true');
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props([row('only.test', 8)], { start: today, end: addDays(today, 1), chartMode: 'share', rangeLabel: 'Today' })));
    });
    assert.equal(view.host.querySelector('#chart-tab-share')?.getAttribute('aria-selected'), 'true');
    assert.equal(view.host.querySelector('.share-segment').style.width, '100%');
    const dark = timelineSwatchesFor(true);
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props([row('only.test', 8)], { isDark: true })));
    });
    assert.equal(view.host.querySelector('.share-segment').style.background, shareColor('only.test', dark));
    await unmount(view);
  });

  test('a single day still names the trend tab as the last 7 days', async () => {
    const { trendLabel } = await server.ssrLoadModule('/src/range-label.mjs');
    const { presetRange: preset } = await server.ssrLoadModule('/src/range.mjs');
    const label = key => key;
    assert.equal(trendLabel(label, preset('today', today), today), 'range.last7');
    assert.equal(trendLabel(label, preset('30d', today), today), 'range.last30');
    assert.equal(trendLabel(label, preset('7d', today), today), 'range.last7');
  });

  test('the share tab title exists in every language', async () => {
    const view = await render(props([row('a.test', 40), row('b.test', 60)]));
    for (const [code] of languages) {
      await React.act(async () => { await i18n.changeLanguage(code); });
      await React.act(async () => { view.root.render(React.createElement(Overview, props([row('a.test', 40), row('b.test', 60)]))); });
      const title = i18n.t('share.title');
      assert.equal(view.host.querySelector('#chart-tab-share').textContent, title);
      assert.equal(title.includes('share.'), false);
      assert.equal(i18n.t('share.viewAllLabel').includes('share.'), false);
    }
    await React.act(async () => { await i18n.changeLanguage('en'); });
    await unmount(view);
  });
});
