import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { fileURLToPath } from 'node:url';
import { detailFocusTarget } from '../src/detail-focus.mjs';
import { addDays, midnight } from '../src/model.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('closing site detail returns to the control that opened it, or the page heading', () => {
  const heading = { id: 'heading' };
  const trigger = { id: 'trigger', isConnected: true };
  assert.equal(detailFocusTarget(trigger, heading), trigger);
  assert.equal(detailFocusTarget({ isConnected: false }, heading), heading);
  assert.equal(detailFocusTarget(null, null), null);
});

test('the ledger source puts the date control ahead of the overview and drops the fixed sidebar', () => {
  const app = source('../src/app.jsx');
  const sheet = source('../src/components/ui/sheet.tsx');
  const css = source('../src/styles.css');
  assert.ok(app.indexOf('className="ledger-range"') < app.indexOf('<Overview'));
  assert.equal(app.includes('SidebarProvider'), false);
  assert.equal(app.includes('detailFocusTarget'), true);
  assert.equal(sheet.includes('backdrop-blur'), false);
  assert.match(css, /prefers-reduced-motion:reduce/);
  const reduced = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  const sheetRule = reduced.match(/\[data-slot=sheet-content\]\[data-starting-style\][^{]*\{[^}]+\}/);
  assert.ok(sheetRule, 'reduced motion sheet rule');
  assert.match(sheetRule[0], /translate:\s*none/);
  assert.match(sheetRule[0], /transform:\s*none/);
  assert.equal(sheetRule[0].includes('data-ending-style'), true);
});

const { window } = parseHTML('<!doctype html><html><body></body></html>');
const memory = new Map([['pagetime-language', 'en']]);
const localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(String(key), String(value)),
  removeItem: key => memory.delete(key),
  clear: () => memory.clear(),
  key: index => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
};
window.localStorage = localStorage;
window.location = { protocol: 'http:', href: 'http://127.0.0.1/', pathname: '/', search: '', hash: '' };
const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  Element: globalThis.Element,
  Node: globalThis.Node,
  location: globalThis.location,
  localStorage: globalThis.localStorage,
  getComputedStyle: globalThis.getComputedStyle,
  matchMedia: globalThis.matchMedia,
  ResizeObserver: globalThis.ResizeObserver,
  IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

let server;
let Overview;
let DashboardChrome;
let TooltipProvider;
const animated = [];
let reduceMotion = false;

const hour = 3_600_000;
const now = new Date(2026, 9, 22, 16).getTime();
const today = midnight(now);

function statsFor() {
  return {
    ms: 2 * hour,
    visits: 4,
    rows: [
      { domain: 'github.com', ms: 2 * hour, visits: 3, hosts: [{ domain: 'github.com', ms: 2 * hour }] },
      { domain: 'news.example', ms: 0, visits: 1, hosts: [] },
    ],
  };
}

function compareFor() {
  return {
    window: { cutoff: null, period: { start: addDays(today, -1), end: today } },
    summary: {
      ms: { diff: 0, percent: 0 },
      visits: { diff: 1, percent: 100 },
      sites: { diff: 0, percent: 0 },
    },
  };
}

describe('overview shell', () => {
  before(async () => {
    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Element = window.Element;
    globalThis.Node = window.Node;
    globalThis.location = window.location;
    globalThis.localStorage = localStorage;
    globalThis.getComputedStyle = () => ({ fontFamily: 'Test Font', opacity: '1', transform: 'none', width: '0px' });
    globalThis.matchMedia = query => ({ matches: reduceMotion && String(query).includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} });
    globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    window.Element.prototype.getAnimations = () => [];
    window.Element.prototype.animate = function animate(frames) {
      animated.push(frames);
      return { cancel() {}, finished: Promise.resolve() };
    };
    if (typeof window.KeyboardEvent !== 'function') {
      window.KeyboardEvent = class KeyboardEvent extends window.Event {
        constructor(type, init = {}) {
          super(type, init);
          this.key = init.key;
        }
      };
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const react = (await import('@vitejs/plugin-react')).default;
    server = await createServer({
      configFile: false,
      root,
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
      cacheDir: '/tmp/pagetime-ledger-shell-vite',
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      appType: 'custom',
      ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
    });
    ({ Overview } = await server.ssrLoadModule('/src/overview.jsx'));
    ({ DashboardChrome } = await server.ssrLoadModule('/src/dashboard-chrome.jsx'));
    ({ TooltipProvider } = await server.ssrLoadModule('/src/components/ui/tooltip.tsx'));
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

  async function renderOverview(props) {
    const view = mount();
    await React.act(async () => {
      view.root.render(React.createElement(TooltipProvider, null, React.createElement(Overview, props)));
    });
    return view;
  }

  async function unmount(view) {
    await React.act(async () => { view.root.unmount(); });
    view.host.remove();
  }

  function follows(host, earlier, later) {
    const nodes = [...host.querySelectorAll('*')];
    const left = host.querySelector(earlier);
    const right = host.querySelector(later);
    assert.ok(left, earlier);
    assert.ok(right, later);
    assert.ok(nodes.indexOf(left) < nodes.indexOf(right), `${earlier} before ${later}`);
  }

  function overviewProps(extra = {}) {
    return {
      compare: compareFor(),
      preset: 'today',
      todayStats: statsFor(),
      stats: statsFor(),
      trendDays: [{ at: today, ms: 2 * hour, visits: 4, recorded: true }],
      spans: [],
      hourRows: [],
      since: today,
      start: today,
      end: addDays(today, 1),
      today,
      now,
      rangeLabel: 'Today',
      chartMode: 'share',
      trendLabel: 'Last 7 days',
      filterSite: 'github.com',
      onFilter() {},
      openSite() {},
      onSelectDay() {},
      ...extra,
    };
  }

  test('the overview reads filter, primary time, chart, ranking, then collapsed hours', async () => {
    animated.length = 0;
    reduceMotion = false;
    const view = await renderOverview(overviewProps());
    follows(view.host, '.filter-bar', '.kpi');
    follows(view.host, '.kpi', '.chart-card');
    follows(view.host, '.chart-card', '.rank-section');
    follows(view.host, '.rank-section', '.heatmap-fold');
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value')?.textContent, '2 hr 0 min');
    assert.equal(view.host.querySelector('.kpi-secondary .kpi-item .kpi-value')?.textContent, '3');
    assert.equal(view.host.querySelector('.kpi-secondary .kpi-item:last-child .kpi-value')?.textContent, '1');
    assert.equal(view.host.querySelector('.kpi-item.primary [data-compare="ms"]') instanceof window.Element, true);
    assert.equal(view.host.querySelector('.kpi-secondary [data-compare="visits"]') instanceof window.Element, true);
    assert.equal(view.host.querySelector('.filter-chip button')?.textContent, 'Clear filter');
    assert.equal(view.host.querySelector('.heatmap-toggle')?.getAttribute('aria-expanded'), 'false');
    assert.equal(animated.length, 0);
    await unmount(view);
  });

  test('a later chart key replaces the earlier one, and reduced motion does not animate the figures', async () => {
    animated.length = 0;
    reduceMotion = false;
    const view = await renderOverview(overviewProps());
    const list = view.host.querySelector('[role="tablist"]');
    await React.act(async () => {
      list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    assert.equal(view.host.querySelector('[role="tab"][aria-selected="true"]')?.id, 'chart-tab-share');
    const played = animated.length;
    await React.act(async () => {
      view.root.render(React.createElement(TooltipProvider, null, React.createElement(Overview, overviewProps({ end: addDays(today, 2), chartMode: 'trend' }))));
    });
    assert.ok(played < animated.length);
    reduceMotion = true;
    const beforeStill = animated.length;
    await React.act(async () => {
      view.root.render(React.createElement(TooltipProvider, null, React.createElement(Overview, overviewProps({ end: addDays(today, 8), chartMode: 'trend' }))));
    });
    assert.equal(animated.length, beforeStill);
    assert.equal(view.host.querySelector('.kpi-item.primary .kpi-value')?.textContent, '2 hr 0 min');
    await unmount(view);
  });

  test('the top bar keeps overview, visits, and settings without a side column', async () => {
    const view = mount();
    await React.act(async () => {
      view.root.render(React.createElement(DashboardChrome, {
        page: 'overview',
        onPage() {},
        enabled: true,
        recordingSince: today,
        busy: false,
        shown: true,
        onToggle() {},
      }, React.createElement('main', null, React.createElement('div', { className: 'ledger-range' }, 'Date range'))));
    });
    assert.equal(view.host.querySelector('.sidebar'), null);
    assert.equal(view.host.querySelector('h1')?.textContent, 'Browsing overview');
    assert.equal([...view.host.querySelectorAll('nav button')].map(button => button.textContent).join('|'), 'Overview|Visits|Settings');
    assert.equal(view.host.querySelector('.local-note')?.textContent, 'Data stays on this device');
    follows(view.host, 'header', '.ledger-range');
    await unmount(view);
  });
});
