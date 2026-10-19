export function resolveTheme(preference, systemDark) {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemDark ? 'dark' : 'light';
}

export function applyDocumentTheme(isDark) {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

const light = {
  label: '#64748b',
  labelMid: '#40577b',
  labelStrong: '#122040',
  axis: '#dfe6f2',
  split: '#e8edf6',
  bar: '#2875ff',
  heatmapLow: '#e4ecf8',
  heatmapHigh: '#2875ff',
  cell: '#ffffff',
  emphasis: '#2875ff',
  timeline: '#f2f5fa',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e9eef6',
  tooltipText: '#122040',
};

const dark = {
  label: '#b7c4d8',
  labelMid: '#d0dbed',
  labelStrong: '#e8eef8',
  axis: '#3a4d6c',
  split: '#2a3b56',
  bar: '#8eb6ff',
  heatmapLow: '#2c4064',
  heatmapHigh: '#8eb6ff',
  cell: '#162033',
  emphasis: '#d6e6ff',
  timeline: '#10182a',
  tooltipBg: '#1c2942',
  tooltipBorder: '#3a4d6c',
  tooltipText: '#e8eef8',
};

export function getChartTheme(isDark) {
  return isDark ? dark : light;
}
