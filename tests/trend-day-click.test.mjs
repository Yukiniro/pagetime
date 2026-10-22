import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { fileURLToPath } from 'node:url';
import { addDays, dateKey, midnight } from '../src/model.mjs';
import { presetRange, singleDayRange } from '../src/range.mjs';
import { resetTrendCharts, trendCharts } from './helpers/echarts-click-mock.mjs';

const days = [
  { at: 1_000, ms: 0, recorded: false },
  { at: 2_000, ms: 0, recorded: true },
  { at: 3_000, ms: 3_600_000, recorded: true },
  { at: 4_000, ms: 60_000, recorded: false },
];

const { window } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
const previous = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  Element: globalThis.Element,
  Node: globalThis.Node,
  getComputedStyle: globalThis.getComputedStyle,
  ResizeObserver: globalThis.ResizeObserver,
  IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

let server;
let Trend;
let SiteTrend;

describe('Trend click', () => {
before(async () => {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.getComputedStyle = () => ({ fontFamily: 'Test Font' });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { 'echarts/core': fileURLToPath(new URL('./helpers/echarts-click-mock.mjs', import.meta.url)) } },
    plugins: [{
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
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-i18next', 'i18next', 'i18next-browser-languagedetector'] },
  });
  ({ Trend, SiteTrend } = await server.ssrLoadModule('/src/Charts.jsx'));
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
  const root = createRoot(host);
  return { host, root };
}

async function render(type, props) {
  resetTrendCharts();
  const view = mount();
  await React.act(async () => { view.root.render(React.createElement(type, props)); });
  return view;
}

async function unmount(view) {
  await React.act(async () => { view.root.unmount(); });
  view.host.remove();
}

function click(chart, params) {
  chart.fire('click', params);
}

test('clicking a trend bar calls onSelectDay with that column\'s day', async () => {
  const selected = [];
  const view = await render(Trend, { days, onSelectDay: at => selected.push(at) });
  try {
    const chart = trendCharts().at(-1);
    assert.deepEqual(chart.option.series[0].data, [null, 0, 1, 60_000 / 3_600_000]);
    assert.equal(chart.option.series[0].cursor, 'pointer');
    assert.equal(chart.option.series[0].barMinHeight, 1);
    assert.equal(view.host.querySelector('[role="img"]').getAttribute('tabindex'), '-1');
    click(chart, { componentType: 'series', dataIndex: 2 });
    click(chart, { componentType: 'series', dataIndex: 1 });
    click(chart, { componentType: 'series', dataIndex: 3 });
    assert.deepEqual(selected, [3_000, 2_000, 4_000]);
  } finally {
    await unmount(view);
  }
});

test('an unrecorded column, a blank track, and a non-series click do not select a day', async () => {
  const selected = [];
  const view = await render(Trend, { days, onSelectDay: at => selected.push(at) });
  try {
    const chart = trendCharts().at(-1);
    click(chart, { componentType: 'series', dataIndex: 0 });
    click(chart, { componentType: 'series', dataIndex: 1.5 });
    click(chart, { componentType: 'series', dataIndex: -1 });
    click(chart, { componentType: 'series', dataIndex: 4 });
    click(chart, { componentType: 'series' });
    click(chart, { componentType: 'xAxis', dataIndex: 2 });
    assert.deepEqual(selected, []);
  } finally {
    await unmount(view);
  }
});

test('each selectable trend day is a button on the same path as the canvas click', async () => {
  const selected = [];
  const view = await render(Trend, { days, onSelectDay: at => selected.push(at) });
  try {
    const buttons = [...view.host.querySelectorAll('button.timeline-segment')];
    assert.equal(buttons.length, 3);
    assert.ok(buttons.every(button => button.type === 'button' && button.textContent.length > 0));
    assert.equal(view.host.querySelector('[role="img"]').getAttribute('tabindex'), '-1');
    buttons[1].click();
    buttons[0].click();
    assert.deepEqual(selected, [3_000, 2_000]);
    const chart = trendCharts().at(-1);
    click(chart, { componentType: 'series', dataIndex: 3 });
    assert.deepEqual(selected, [3_000, 2_000, 4_000]);
  } finally {
    await unmount(view);
  }
});

test('the site detail trend does not register a day click', async () => {
  const view = await render(SiteTrend, { days, domain: 'github.com' });
  try {
    const chart = trendCharts().at(-1);
    assert.equal(chart.listenerCount('click'), 0);
    assert.equal(chart.option.series[0].cursor, undefined);
    assert.equal(chart.option.series[0].barMinHeight, undefined);
    assert.equal(view.host.querySelector('[role="img"]').getAttribute('tabindex'), null);
    click(chart, { componentType: 'series', dataIndex: 2 });
    assert.equal(view.host.querySelectorAll('button.timeline-segment').length, 0);
  } finally {
    await unmount(view);
  }
});

});

test('hour bars are not part of the day click', () => {
  const charts = readFileSync(new URL('../src/Charts.jsx', import.meta.url), 'utf8');
  const hour = charts.slice(charts.indexOf('export function HourChart'), charts.indexOf('export function DayHourChart'));
  const dayHour = charts.slice(charts.indexOf('export function DayHourChart'), charts.indexOf('const weekdayAt'));
  assert.doesNotMatch(hour, /onSelectDay|trendDayAt/);
  assert.doesNotMatch(dayHour, /onSelectDay|trendDayAt/);
});

test('selecting today keeps the today preset and any other recorded day is a one-day custom range', () => {
  const today = midnight(new Date(2026, 9, 22, 15).getTime());
  const since = addDays(today, -10);
  assert.deepEqual(singleDayRange(today, today, since), presetRange('today', today));
  assert.deepEqual(singleDayRange(today + 3_600_000, today, since), presetRange('today', today));
  const wednesday = addDays(today, -2);
  assert.deepEqual(singleDayRange(wednesday, today, since), {
    preset: 'custom',
    start: wednesday,
    end: addDays(wednesday, 1),
  });
  assert.equal(dateKey(singleDayRange(wednesday, today, since).start), dateKey(wednesday));
  assert.deepEqual(singleDayRange(since, today, since), { preset: 'custom', start: since, end: addDays(since, 1) });
  assert.equal(singleDayRange(addDays(today, -11), today, since), null);
  assert.equal(singleDayRange(Number.NaN, today, since), null);
  assert.equal(singleDayRange(wednesday, Number.NaN, since), null);
});

test('the overview trend and a day click do not clear the site filter or the open detail', () => {
  const overview = readFileSync(new URL('../src/Overview.jsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.equal([...overview.matchAll(/<Trend /g)].length, 1);
  assert.match(overview, /<Trend days=\{trendDays\} className="primary-trend" isDark=\{isDark\} onSelectDay=\{onSelectDay\} \/>/);
  const handler = app.slice(app.indexOf('const onSelectDay'), app.indexOf('const dayReady'));
  assert.match(handler, /singleDayRange\(at, midnight\(Date\.now\(\)\), rangeSince\)/);
  assert.match(handler, /if \(next\) setRange\(next\)/);
  assert.doesNotMatch(handler, /setFilterSite|setSelected/);
  assert.match(app, /onSelectDay=\{onSelectDay\}/);
});
