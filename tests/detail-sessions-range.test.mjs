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
  { domain: 'github.com', site: 'github.com', start: today + 9 * hour, end: today + 10 * hour + 20 * 60_000 },
  { domain: 'www.github.com', site: 'github.com', start: yesterday + 14 * hour, end: yesterday + 15 * hour },
];

const row = {
  domain: 'github.com',
  ms: 3 * hour + 32 * 60_000,
  visits: 3,
  hosts: [
    { domain: 'github.com', ms: 2 * hour + 32 * 60_000 },
    { domain: 'www.github.com', ms: hour },
  ],
};

const detail = {
  hourDays: 7,
  days: [
    { at: yesterday, ms: hour + 12 * 60_000, recorded: true },
    { at: today, ms: hour + 20 * 60_000, recorded: true },
  ],
  hours: Array.from({ length: 24 }, (_, index) => ({ hour: index, ms: index === 9 ? hour : 0 })),
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
    cacheDir: '/tmp/pagetime-detail-sessions-vite',
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
  const view = mount();
  await React.act(async () => { view.root.render(React.createElement(SiteDetailPanel, props)); });
  return view;
}

async function unmount(view) {
  await React.act(async () => { view.root.unmount(); });
  view.host.remove();
}

function text(view) {
  return view.host.textContent;
}

const panelProps = { siteKey: 'github.com', row, detail, sessions, now, onSelectDay() {}, busy: false, listField: 'ignored', alreadyListed: false, scopeHost: 'github.com', listLimit: false, onListAdd() {}, onViewVisits() {}, onDelete() {} };

test('a multi-day detail omits the session list and keeps the range summary', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 7 });
  const body = text(view);
  assert.equal(view.host.querySelector('.session-list'), null);
  assert.equal(body.includes("Today's active sessions"), false);
  assert.equal(body.includes('Active sessions on'), false);
  assert.equal(body.includes('No active sessions'), false);
  assert.match(body, /Daily trend/);
  assert.match(body, /Time of day/);
  assert.match(body, /Subdomain breakdown/);
  assert.match(body, /github\.com/);
  assert.match(body, /3 hr 32 min/);
  await unmount(view);
});

test('a two-day range also omits the session list', async () => {
  const view = await render({ ...panelProps, day: today, dayCount: 2 });
  assert.equal(view.host.querySelector('.session-list'), null);
  assert.equal(text(view).includes("Today's active sessions"), false);
  assert.equal(text(view).includes('No active sessions'), false);
  await unmount(view);
});

test('a single day still lists that day’s sessions', async () => {
  const todayView = await render({ ...panelProps, day: today, dayCount: 1 });
  assert.match(text(todayView), /Today's active sessions/);
  assert.match(todayView.host.querySelector('.session-list').textContent, /09:00/);
  assert.match(todayView.host.querySelector('.session-list').textContent, /10:20/);
  assert.equal(text(todayView).includes('No active sessions'), false);
  await unmount(todayView);

  const yesterdayView = await render({ ...panelProps, day: yesterday, dayCount: 1 });
  assert.match(text(yesterdayView), /Active sessions on/);
  assert.match(text(yesterdayView), /October 21/);
  assert.equal(text(yesterdayView).includes("Today's active sessions"), false);
  assert.ok(yesterdayView.host.querySelector('.session-list'));
  await unmount(yesterdayView);
});

test('a single day past detail retention still omits the session list', async () => {
  const stale = addDays(today, -40);
  const view = await render({ ...panelProps, day: stale, dayCount: 1, sessions: [] });
  assert.equal(view.host.querySelector('.session-list'), null);
  assert.equal(text(view).includes('Active sessions'), false);
  assert.equal(text(view).includes('No active sessions'), false);
  await unmount(view);
});

test('the dashboard passes the selected range length and does not add a second range flag', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const sheet = app.slice(app.indexOf('<SiteDetailSheet'), app.indexOf('</TooltipProvider>'));
  assert.match(sheet, /dayCount=\{dayCount\(start, end\)\}/);
  assert.match(app, /import \{ activeRange, dayCount, defaultChart, singleDayRange, timelineDay \}/);
  assert.doesNotMatch(sheet, /showSessions|multiDay|isMulti/);
  const panel = readFileSync(new URL('../src/SiteDetailPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /dayCount > 1 \? null : daySessionCopy\(day, now\)/);
});
