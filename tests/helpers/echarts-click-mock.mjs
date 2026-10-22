// Shared with the Vite module that Charts.jsx imports, so a click fired here
// is the listener Trend registered through Chart.
const slot = globalThis.__pagetimeTrendClicks ??= { charts: [] };

export function resetTrendCharts() {
  slot.charts.length = 0;
}

export function trendCharts() {
  return slot.charts;
}

export function use() {}

export function init() {
  const listeners = {};
  const chart = {
    option: null,
    setOption(option) { chart.option = option; },
    on(name, fn) { (listeners[name] ??= []).push(fn); },
    resize() {},
    dispose() { chart.disposed = true; },
    fire(name, params) { for (const fn of listeners[name] ?? []) fn(params); },
    listenerCount(name) { return listeners[name]?.length ?? 0; },
  };
  slot.charts.push(chart);
  return chart;
}
