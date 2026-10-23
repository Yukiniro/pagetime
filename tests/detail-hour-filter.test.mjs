process.env.TZ = 'America/New_York';

const { after, before, test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { parseHTML } = await import('linkedom');
const { fileURLToPath } = await import('node:url');
const { addDays, midnight } = await import('../src/model.mjs');
const { resetTrendCharts, trendCharts } = await import('./helpers/echarts-click-mock.mjs');

const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
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
const pageLocation = {
  protocol: 'http:',
  href: 'http://127.0.0.1:4174/',
  hostname: '127.0.0.1',
  host: '127.0.0.1:4174',
  origin: 'http://127.0.0.1:4174',
  pathname: '/',
  search: '',
  hash: '',
};
window.location = pageLocation;

const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  Element: globalThis.Element,
  Node: globalThis.Node,
  location: globalThis.location,
  localStorage: globalThis.localStorage,
  getComputedStyle: globalThis.getComputedStyle,
  ResizeObserver: globalThis.ResizeObserver,
  IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

let server;
let SiteDetailPanel;

const hour = 3_600_000;
const now = new Date(2026, 9, 22, 16).getTime();
const today = midnight(now);
const yesterday = addDays(today, -1);

const sessions = [
  { domain: 'github.com', site: 'github.com', start: today + 8 * hour, end: today + 9 * hour },
  { domain: 'github.com', site: 'github.com', start: today + 9 * hour, end: today + 10 * hour + 20 * 60_000 },
  { domain: 'github.com', site: 'github.com', start: today + 14 * hour + 50 * 60_000, end: today + 15 * hour + 10 * 60_000 },
  { domain: 'github.com', site: 'github.com', start: yesterday + 14 * hour, end: yesterday + 15 * hour },
];

const row = {
  domain: 'github.com',
  ms: 2 * hour,
  visits: 3,
  hosts: [{ domain: 'github.com', ms: 2 * hour }],
};

const detail = {
  hourDays: 1,
  days: [
    { at: yesterday, ms: hour, recorded: true },
    { at: today, ms: hour, recorded: true },
  ],
  hours: Array.from({ length: 24 }, (_, index) => ({ hour: index, ms: index === 9 ? hour : index === 14 ? 10 * 60_000 : 0 })),
};

before(async () => {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.location = pageLocation;
  globalThis.localStorage = localStorage;
  globalThis.getComputedStyle = () => ({ fontFamily: 'Test Font' });
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  window.Element.prototype.getAnimations = () => [];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const react = (await import('@vitejs/plugin-react')).default;
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
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
    cacheDir: '/tmp/pagetime-detail-hour-filter-vite',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
  });
  ({ SiteDetailPanel } = await server.ssrLoadModule('/src/SiteDetailPanel.jsx'));
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
  resetTrendCharts();
  const view = mount();
  await React.act(async () => { view.root.render(React.createElement(SiteDetailPanel, props)); });
  return view;
}

async function rerender(view, props) {
  await React.act(async () => { view.root.render(React.createElement(SiteDetailPanel, props)); });
}

async function unmount(view) {
  await React.act(async () => { view.root.unmount(); });
  view.host.remove();
}

function hourChart() {
  return trendCharts().findLast(chart => chart.option?.series?.[0]?.barMaxWidth === 14);
}

async function clickHour(index) {
  await React.act(async () => {
    hourChart().fire('click', { componentType: 'series', dataIndex: index });
  });
}

const panelProps = {
  siteKey: 'github.com',
  row,
  detail,
  sessions,
  now,
  onSelectDay() {},
  busy: false,
  listField: 'ignored',
  alreadyListed: false,
  scopeHost: 'github.com',
  listLimit: false,
  onListAdd() {},
  onViewVisits() {},
  onDelete() {},
};

function listText(view) {
  return view.host.querySelector('.session-list')?.textContent ?? '';
}

test('clicking an hour keeps only the pieces that overlap it, and the same bar or clear restores the day', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    const chart = hourChart();
    const fullHours = chart.option.series[0].data.map(value => value);
    assert.equal(chart.listenerCount('click'), 1);
    assert.equal(chart.option.series[0].cursor, 'pointer');
    assert.equal(chart.option.series[0].barMinHeight, 1);
    assert.equal(view.host.querySelector('.hour-chart').getAttribute('tabindex'), '-1');
    assert.match(listText(view), /08:00/);
    assert.match(listText(view), /09:00/);
    assert.match(listText(view), /14:50/);
    assert.equal(view.host.querySelector('.session-filter'), null);

    await clickHour(15);
    assert.match(listText(view), /14:50/);
    assert.match(listText(view), /15:10/);
    assert.doesNotMatch(listText(view), /08:00/);
    assert.doesNotMatch(listText(view), /09:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /15:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /16:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /Clear filter/);
    assert.deepEqual(hourChart().option.series[0].data, fullHours);

    await clickHour(14);
    assert.match(listText(view), /14:50/);
    assert.match(listText(view), /15:10/);
    assert.doesNotMatch(listText(view), /08:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /14:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /15:00/);

    await clickHour(9);
    assert.match(listText(view), /09:00/);
    assert.match(listText(view), /10:20/);
    assert.doesNotMatch(listText(view), /08:00/);
    assert.doesNotMatch(listText(view), /14:50/);

    await clickHour(9);
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.match(listText(view), /08:00/);
    assert.match(listText(view), /14:50/);

    await clickHour(15);
    await React.act(async () => { view.host.querySelector('.session-filter button').click(); });
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.match(listText(view), /08:00/);
    assert.match(listText(view), /09:00/);
    assert.match(listText(view), /14:50/);
  } finally {
    await unmount(view);
  }
});

test('an hour with no overlapping piece shows the empty line and keeps the chip', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    await clickHour(11);
    assert.equal(view.host.querySelector('.session-list'), null);
    assert.match(view.host.textContent, /No active sessions/);
    assert.doesNotMatch(view.host.textContent, /No active sessions today/);
    assert.match(view.host.textContent, /Today's active sessions/);
    assert.match(view.host.querySelector('.session-filter').textContent, /11:00/);
    assert.match(view.host.querySelector('.session-filter').textContent, /Clear filter/);
    await React.act(async () => {
      hourChart().fire('click', { componentType: 'xAxis', dataIndex: 9 });
      hourChart().fire('click', { componentType: 'series', dataIndex: 1.5 });
      hourChart().fire('click', { componentType: 'series', dataIndex: 24 });
    });
    assert.match(view.host.querySelector('.session-filter').textContent, /11:00/);
    assert.equal(view.host.querySelector('.session-list'), null);
  } finally {
    await unmount(view);
  }
});

test('changing the day or the open site clears the hour filter', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    await clickHour(9);
    assert.ok(view.host.querySelector('.session-filter'));
    await rerender(view, { ...panelProps, day: yesterday, dayCount: 1 });
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.match(listText(view), /14:00/);
    assert.match(listText(view), /15:00/);
    await clickHour(14);
    assert.ok(view.host.querySelector('.session-filter'));
    await rerender(view, { ...panelProps, siteKey: 'youtube.com', day: yesterday, dayCount: 1 });
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.match(listText(view), /14:00/);
    await clickHour(14);
    await rerender(view, { ...panelProps, siteKey: 'youtube.com', day: yesterday, dayCount: 7 });
    assert.equal(view.host.querySelector('.session-list'), null);
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.equal(hourChart().listenerCount('click'), 0);
    await rerender(view, { ...panelProps, siteKey: 'youtube.com', day: yesterday, dayCount: 1 });
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.match(listText(view), /14:00/);
  } finally {
    await unmount(view);
  }
});

test('a multi-day detail does not make the hour bars clickable', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 7 });
  try {
    const chart = hourChart();
    assert.equal(chart.listenerCount('click'), 0);
    assert.equal(chart.option.series[0].cursor, undefined);
    assert.equal(chart.option.series[0].barMinHeight, undefined);
    assert.equal(view.host.querySelector('.hour-chart').getAttribute('tabindex'), null);
    assert.equal(view.host.querySelector('.session-list'), null);
    assert.equal(view.host.querySelector('.session-filter'), null);
    chart.fire('click', { componentType: 'series', dataIndex: 9 });
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.equal(view.host.textContent.includes("Today's active sessions"), false);
    assert.equal(view.host.textContent.includes('No active sessions'), false);
    const trend = trendCharts().find(chart => chart.option?.series?.[0]?.barMaxWidth === 46);
    assert.equal(trend.listenerCount('click'), 1);
  } finally {
    await unmount(view);
  }
});

test('a single day past detail retention does not make the hour bars clickable', async () => {
  const stale = addDays(today, -40);
  const view = await render({ ...panelProps, day: stale, dayCount: 1, sessions: [] });
  try {
    const chart = hourChart();
    assert.equal(chart.listenerCount('click'), 0);
    assert.equal(chart.option.series[0].cursor, undefined);
    assert.equal(view.host.querySelector('.session-list'), null);
    assert.equal(view.host.querySelector('.session-filter'), null);
    assert.equal(view.host.textContent.includes('Active sessions'), false);
    chart.fire('click', { componentType: 'series', dataIndex: 9 });
    assert.equal(view.host.querySelector('.session-filter'), null);
  } finally {
    await unmount(view);
  }
});

test('overview hour bars and the heatmap stay outside the session-hour click', () => {
  const charts = readFileSync(new URL('../src/Charts.jsx', import.meta.url), 'utf8');
  const hour = charts.slice(charts.indexOf('export function HourChart'), charts.indexOf('export function DayHourChart'));
  const dayHour = charts.slice(charts.indexOf('export function DayHourChart'), charts.indexOf('const weekdayAt'));
  const heatmap = charts.slice(charts.indexOf('export function Heatmap'), charts.indexOf('export function Timeline'));
  assert.match(hour, /onSelectHour/);
  assert.doesNotMatch(hour, /onSelectDay|trendDayAt/);
  assert.doesNotMatch(dayHour, /onSelectHour|onSelectDay/);
  assert.doesNotMatch(heatmap, /onSelectHour/);
  const overview = readFileSync(new URL('../src/Overview.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(overview, /onSelectHour/);
  assert.match(overview, /Hour cells are not a filter/);
});
