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
    cacheDir: '/tmp/pagetime-hour-selected-vite',
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

function barColors() {
  const { color } = hourChart().option.series[0].itemStyle;
  return Array.from({ length: 24 }, (_, dataIndex) => (typeof color === 'function' ? color({ dataIndex }) : color));
}

function selectedIndexes() {
  const colors = barColors();
  const counts = new Map();
  for (const color of colors) counts.set(color, (counts.get(color) ?? 0) + 1);
  const dimmed = [...counts].sort((x, y) => y[1] - x[1])[0][0];
  return colors.flatMap((color, index) => (color === dimmed ? [] : [index]));
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

test('the hour chart without a selection keeps one plain bar color', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    const { color } = hourChart().option.series[0].itemStyle;
    assert.equal(typeof color, 'string');
    assert.equal(new Set(barColors()).size, 1);
  } finally {
    await unmount(view);
  }
});

test('selecting an hour marks only that bar, and the same bar or clear removes the mark', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    const plain = barColors()[0];
    const values = hourChart().option.series[0].data.slice();

    await clickHour(14);
    const colors = barColors();
    assert.deepEqual(selectedIndexes(), [14]);
    assert.equal(colors[14], plain);
    assert.match(colors[0], /^rgba\(/);
    assert.equal(new Set(colors.filter((_, index) => index !== 14)).size, 1);
    assert.deepEqual(hourChart().option.series[0].data, values);

    await clickHour(9);
    assert.deepEqual(selectedIndexes(), [9]);

    await clickHour(9);
    assert.deepEqual(barColors(), Array(24).fill(plain));

    await clickHour(14);
    assert.deepEqual(selectedIndexes(), [14]);
    await React.act(async () => { view.host.querySelector('.session-filter button').click(); });
    assert.deepEqual(barColors(), Array(24).fill(plain));
  } finally {
    await unmount(view);
  }
});

test('the hour button path marks the bar too', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    const button = view.host.querySelectorAll('.hour-chart-frame button.timeline-segment')[11];
    await React.act(async () => { button.click(); });
    assert.deepEqual(selectedIndexes(), [11]);
    await React.act(async () => { button.click(); });
    assert.equal(new Set(barColors()).size, 1);
  } finally {
    await unmount(view);
  }
});

test('changing the day, the site, or leaving a single day drops the mark', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    await clickHour(9);
    assert.deepEqual(selectedIndexes(), [9]);
    await rerender(view, { ...panelProps, day: yesterday, dayCount: 1 });
    assert.equal(new Set(barColors()).size, 1);

    await clickHour(14);
    assert.deepEqual(selectedIndexes(), [14]);
    await rerender(view, { ...panelProps, siteKey: 'youtube.com', day: yesterday, dayCount: 1 });
    assert.equal(new Set(barColors()).size, 1);

    await clickHour(14);
    await rerender(view, { ...panelProps, siteKey: 'youtube.com', day: yesterday, dayCount: 7 });
    assert.equal(hourChart().listenerCount('click'), 0);
    assert.equal(new Set(barColors()).size, 1);
  } finally {
    await unmount(view);
  }
});

test('closing the drawer leaves no mark for the next open', async () => {
  let view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    await clickHour(9);
    assert.deepEqual(selectedIndexes(), [9]);
  } finally {
    await unmount(view);
  }
  view = await render({ ...panelProps, day: today, dayCount: 1 });
  try {
    assert.equal(new Set(barColors()).size, 1);
  } finally {
    await unmount(view);
  }
});
