import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank } from '../src/model.mjs';
import { formatSiteShare, orderSites, siteShareWidth, SITE_LEDGER_LIMIT, visibleSites } from '../src/site-ledger.mjs';

const names = rows => rows.map(row => row.domain);

test('a 40 minute site in a 100 minute range is 40%, and zero totals stay readable', () => {
  assert.equal(formatSiteShare(40, 100), '40.0%');
  assert.equal(siteShareWidth(40, 100), 40);
  assert.deepEqual([1, 1, 1].map(part => formatSiteShare(part, 3)), ['33.3%', '33.3%', '33.3%']);
  assert.equal(formatSiteShare(10, 10_000), '0.1%');
  assert.equal(formatSiteShare(9, 10_000), '<0.1%');
  assert.equal(formatSiteShare(0, 100), '0%');
  assert.equal(formatSiteShare(4, 0), '—');
  assert.equal(formatSiteShare(4, -1), '—');
  assert.equal(formatSiteShare(Number.NaN, 100), '0%');
  assert.equal(formatSiteShare(1, Number.NaN).includes('NaN'), false);
  assert.equal(siteShareWidth(0, 100), 0);
  assert.equal(siteShareWidth(4, 0), 0);
});

test('time order matches the ranking, and equal values keep one order', () => {
  const tied = [
    { domain: 'm.example', ms: 10, visits: 4 },
    { domain: 'a.example', ms: 30, visits: 4 },
    { domain: 'z.example', ms: 10, visits: 4 },
  ];
  const before = names(tied);
  const ranked = rank(tied.map(row => ({ ...row })));
  assert.deepEqual(names(orderSites(tied, 'time')), names(ranked.rows));
  assert.deepEqual(names(orderSites([...tied].reverse(), 'time')), names(orderSites(tied, 'time')));
  assert.deepEqual(names(orderSites(tied, 'visits')), ['a.example', 'm.example', 'z.example']);
  assert.deepEqual(names(orderSites([...tied].reverse(), 'visits')), names(orderSites(tied, 'visits')));
  const mixed = [
    { domain: 'c.example', ms: 5, visits: 2 },
    { domain: 'b.example', ms: 9, visits: 2 },
    { domain: 'a.example', ms: 50, visits: 1 },
  ];
  assert.deepEqual(names(orderSites(mixed, 'visits')), ['b.example', 'c.example', 'a.example']);
  assert.deepEqual(names(orderSites([...mixed].reverse(), 'visits')), ['b.example', 'c.example', 'a.example']);
  assert.deepEqual(names(tied), before);
});

test('search reaches a site past the first eight, and collapsing does not drop it from the range', () => {
  const rows = Array.from({ length: 22 }, (_, index) => ({
    domain: `s${String(index + 1).padStart(2, '0')}.example`,
    ms: (30 - index) * 60_000,
    visits: index,
  }));
  const closed = visibleSites(rows, { metric: 'time' });
  assert.equal(closed.rows.length, SITE_LEDGER_LIMIT);
  assert.equal(closed.clipped, true);
  assert.equal(names(closed.rows).includes('s20.example'), false);
  const found = visibleSites(rows, { metric: 'time', query: 'S20.EXAMPLE' });
  assert.deepEqual(names(found.rows), ['s20.example']);
  assert.equal(found.clipped, false);
  assert.equal(visibleSites(rows, { metric: 'time', expanded: true }).rows.length, 22);
  assert.equal(visibleSites(rows, { metric: 'visits', query: 'missing' }).total, 0);
});

const { after, before, describe } = await import('node:test');
const { createServer } = await import('vite');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { addDays, midnight } = await import('../src/model.mjs');
const { toggleSiteFilter } = await import('../src/site-filter.mjs');

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

const minute = 60_000;
const now = new Date(2026, 9, 22, 16).getTime();
const today = midnight(now);
const rootDir = fileURLToPath(new URL('..', import.meta.url));

function site(domain, minutes, visits, ms = minutes * minute) {
  return { domain, ms, visits, hosts: [{ domain, ms }] };
}

function summary(rows) {
  return { rows, ms: rows.reduce((total, row) => total + row.ms, 0), visits: rows.reduce((total, row) => total + row.visits, 0) };
}

let server;
let Overview;

describe('site ledger', () => {
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
      cacheDir: '/tmp/pagetime-site-ledger-vite',
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
    });
    ({ Overview } = await server.ssrLoadModule('/src/overview.jsx'));
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
    const input = host.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }

  function props(rows, extra = {}) {
    const stats = summary(rows);
    return {
      preset: 'today',
      todayStats: stats,
      stats,
      trendDays: [{ at: today, ms: stats.ms, visits: stats.visits, recorded: true }],
      spans: [],
      hourRows: [],
      since: today,
      start: today,
      end: addDays(today, 1),
      today,
      now,
      rangeLabel: 'Today',
      chartMode: 'timeline',
      trendLabel: 'Last 7 days',
      filterSite: '',
      onFilter() {},
      openSite() {},
      onSelectDay() {},
      ...extra,
    };
  }

  function domains(host) {
    return [...host.querySelectorAll('.rank-line')].map(line => line.querySelector('.rank-main').lastElementChild.textContent);
  }

  function button(host, label) {
    return [...host.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label);
  }

  test('the ledger shows one time-ordered list, a 40% share, and a zero row', async () => {
    const rows = [site('alpha.test', 40, 1), site('beta.test', 60, 9), site('zero.test', 0, 3)];
    const view = await render(props(rows));
    assert.equal(view.host.querySelectorAll('.rank-list').length, 1);
    assert.equal(view.host.querySelector('.rank-grid'), null);
    assert.deepEqual(domains(view.host), ['beta.test', 'alpha.test', 'zero.test']);
    const alpha = [...view.host.querySelectorAll('.rank-line')].find(line => line.textContent.includes('alpha.test'));
    assert.equal(alpha.querySelector('.rank-value').textContent, '40 min');
    assert.equal(alpha.querySelector('.rank-share').textContent, '40.0%');
    assert.equal(alpha.querySelector('.rank-secondary').textContent, '1 visit');
    assert.equal(alpha.querySelector('.rank-bar').style.width, '40%');
    const beta = [...view.host.querySelectorAll('.rank-line')].find(line => line.textContent.includes('beta.test'));
    assert.equal(beta.querySelector('.rank-share').textContent, '60.0%');
    assert.equal(beta.querySelector('.rank-bar').style.width, '60%');
    const zero = [...view.host.querySelectorAll('.rank-line')].find(line => line.textContent.includes('zero.test'));
    assert.equal(zero.querySelector('.rank-share').textContent, '0%');
    assert.equal(zero.querySelector('.rank-bar').style.width, '0%');
    assert.equal(view.host.querySelector('.rank-section').textContent.includes('NaN'), false);
    assert.equal(button(view.host, 'By active time').getAttribute('aria-pressed'), 'true');
    assert.equal(button(view.host, 'By visits').tagName, 'BUTTON');
    assert.equal(view.host.querySelector('input').tagName, 'INPUT');
    assert.equal(button(view.host, 'Details for alpha.test').tagName, 'BUTTON');
    const before = domains(view.host);
    const widths = new Map([...view.host.querySelectorAll('.rank-line')].map(line => [line.querySelector('.rank-main').lastElementChild.textContent, line.querySelector('.rank-bar').style.width]));
    await click(button(view.host, 'By visits'));
    assert.deepEqual(domains(view.host), names(orderSites(rows, 'visits')));
    assert.deepEqual(domains(view.host), ['beta.test', 'zero.test', 'alpha.test']);
    for (const line of view.host.querySelectorAll('.rank-line')) {
      const domain = line.querySelector('.rank-main').lastElementChild.textContent;
      assert.equal(line.querySelector('.rank-bar').style.width, widths.get(domain));
      assert.equal(line.querySelector('.rank-value').textContent.includes('visit'), false);
    }
    await click(button(view.host, 'By active time'));
    assert.deepEqual(domains(view.host), before);
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, '1 hr 40 min');
    await unmount(view);
  });

  test('search, expand, and collapse leave the totals and do not filter the page', async () => {
    const rows = Array.from({ length: 22 }, (_, index) => site(`s${String(index + 1).padStart(2, '0')}.example`, 30 - index, index + 1));
    const calls = [];
    const view = await render(props(rows, { onFilter: domain => calls.push(domain) }));
    assert.equal(view.host.querySelectorAll('.rank-line').length, 8);
    assert.equal(domains(view.host).includes('s20.example'), false);
    const kpi = view.host.querySelector('.kpi-item.primary .kpi-value').textContent;
    const range = view.host.querySelector('.rank-card-title p').textContent;
    await click(button(view.host, 'View all 22 sites'));
    assert.equal(view.host.querySelectorAll('.rank-line').length, 22);
    assert.equal(domains(view.host).includes('s20.example'), true);
    await click(button(view.host, 'Show less'));
    assert.equal(view.host.querySelectorAll('.rank-line').length, 8);
    await type(view.host, 's20.example');
    assert.deepEqual(domains(view.host), ['s20.example']);
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, kpi);
    assert.equal(view.host.querySelector('.rank-card-title p').textContent, range);
    assert.deepEqual(calls, []);
    await type(view.host, 'missing.example');
    assert.equal(view.host.querySelectorAll('.rank-line').length, 0);
    assert.equal(view.host.querySelector('.rank-empty').textContent.includes('No matching sites'), true);
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, kpi);
    await click(view.host.querySelector('.rank-empty button'));
    assert.equal(view.host.querySelectorAll('.rank-line').length, 8);
    assert.equal(view.host.querySelector('input').value, '');
    await unmount(view);
  });

  test('a filtered page keeps every site and its full-range share, and details do not filter', async () => {
    const rows = [site('alpha.test', 40, 1), site('beta.test', 60, 2)];
    const opened = [];
    let filter = 'alpha.test';
    const calls = [];
    const view = await render(props(rows, {
      filterSite: filter,
      onFilter: domain => { calls.push(domain); filter = domain === '' ? '' : toggleSiteFilter(filter, domain); },
      openSite: domain => opened.push(domain),
    }));
    assert.deepEqual(domains(view.host), ['beta.test', 'alpha.test']);
    const alpha = [...view.host.querySelectorAll('.rank-line')].find(line => line.textContent.includes('alpha.test'));
    assert.equal(alpha.querySelector('.rank-share').textContent, '40.0%');
    assert.equal(alpha.querySelector('.rank-bar').style.width, '40%');
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, '40 min');
    assert.equal(view.host.querySelector('.filter-chip').textContent.includes('Filtered to alpha.test'), true);
    await click(button(view.host, 'Details for beta.test'));
    assert.deepEqual(opened, ['beta.test']);
    assert.deepEqual(calls, []);
    assert.equal(view.host.querySelector('.filter-chip').textContent.includes('Filtered to alpha.test'), true);
    await click(button(view.host, 'Filter to beta.test'));
    assert.deepEqual(calls, ['beta.test']);
    assert.equal(filter, 'beta.test');
    await React.act(async () => {
      view.root.render(React.createElement(Overview, props(rows, {
        filterSite: filter,
        onFilter: domain => { calls.push(domain); filter = domain === '' ? '' : toggleSiteFilter(filter, domain); },
        openSite: domain => opened.push(domain),
      })));
    });
    await type(view.host, 'beta');
    assert.deepEqual(domains(view.host), ['beta.test']);
    assert.equal(view.host.querySelector('.filter-chip button').textContent, 'Clear filter');
    const kpi = view.host.querySelector('.kpi-item.primary .kpi-value').textContent;
    await click(view.host.querySelector('.filter-chip button'));
    assert.equal(calls.at(-1), '');
    assert.equal(filter, '');
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value').textContent, kpi);
    await unmount(view);
  });

  test('a range with no active time shows a dash instead of NaN', async () => {
    const view = await render(props([site('quiet.test', 0, 4)]));
    assert.equal(view.host.querySelector('.rank-share').textContent, '—');
    assert.equal(view.host.querySelector('.rank-bar').style.width, '0%');
    assert.equal(view.host.querySelector('.rank-section').textContent.includes('NaN'), false);
    await unmount(view);
  });
});
