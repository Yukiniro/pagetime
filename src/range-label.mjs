import { formatDate } from './i18n.js';
import { addDays } from './model.mjs';
import { dayCount, defaultChart, trendWindow } from './range.mjs';

export function presetLabel(t, preset) {
  if (preset === '7d') return t('range.last7');
  if (preset === '30d') return t('range.last30');
  if (preset === 'custom') return t('range.custom');
  return t('range.today');
}

export function singleDayLabel(at) {
  return formatDate(at, { month: 'long', day: 'numeric', weekday: 'short' });
}

export function rangeChip(t, range) {
  if (range.preset !== 'custom') return presetLabel(t, range.preset);
  if (dayCount(range.start, range.end) === 1) return singleDayLabel(range.start);
  const last = addDays(range.end, -1);
  return `${formatDate(range.start, { month: '2-digit', day: '2-digit' })}–${formatDate(last, { month: '2-digit', day: '2-digit' })}`;
}

export function trendLabel(t, range, today) {
  const window = trendWindow(range, today);
  const days = dayCount(window.start, window.end);
  if (defaultChart(range) === 'timeline' || range.preset === '7d') return t('range.last7');
  if (range.preset === '30d') return t('range.last30');
  if (days === 1) return formatDate(window.start, { month: 'short', day: 'numeric' });
  if (range.preset === 'custom') return rangeChip(t, range);
  return t('range.lastDays', { count: days });
}
