import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getChartTheme, resolveTheme } from '../src/theme.mjs';

function channel(hex, index) {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a, b) {
  const luminance = hex => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const [hi, lo] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (hi + 0.05) / (lo + 0.05);
}

function variables(css, selector) {
  const found = {};
  const pattern = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g');
  for (const match of css.matchAll(pattern)) {
    for (const part of match[1].split(';')) {
      const split = part.indexOf(':');
      if (split === -1) continue;
      const name = part.slice(0, split).trim();
      if (name) found[name] = part.slice(split + 1).trim();
    }
  }
  return found;
}

test('theme resolves system from the media query and keeps an explicit choice', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme(undefined, true), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('chart colors stay on the light ledger palette unless dark is requested', () => {
  assert.deepEqual(getChartTheme(false), {
    label: '#64748b', labelMid: '#40577b', labelStrong: '#122040',
    axis: '#dfe6f2', split: '#e8edf6', bar: '#2875ff',
    heatmapLow: '#e4ecf8', heatmapHigh: '#2875ff', cell: '#ffffff', emphasis: '#2875ff',
    timeline: '#f2f5fa', tooltipBg: '#ffffff', tooltipBorder: '#e9eef6', tooltipText: '#122040',
  });
  const dark = getChartTheme(true);
  assert.equal(dark.cell, '#162033');
  assert.notEqual(dark.tooltipBg, '#ffffff');
  assert.ok(contrast(dark.tooltipText, dark.tooltipBg) >= 4.5);
  assert.ok(contrast(dark.label, dark.timeline) >= 4.5);
  assert.ok(contrast(dark.labelStrong, dark.cell) >= 4.5);
});

test('dark tokens keep body text, muted text, and the focus ring readable', async () => {
  const root = new URL('../', import.meta.url);
  const shadcn = variables(await fs.readFile(new URL('src/shadcn.css', root), 'utf8'), 'html\\.dark');
  const ledger = variables(await fs.readFile(new URL('src/styles.css', root), 'utf8'), 'html\\.dark');
  assert.equal(shadcn['color-scheme'], 'dark');
  assert.ok(contrast(shadcn['--foreground'], shadcn['--background']) >= 7);
  assert.ok(contrast(shadcn['--muted-foreground'], shadcn['--background']) >= 4.5);
  assert.ok(contrast(shadcn['--muted-foreground'], shadcn['--card']) >= 4.5);
  assert.ok(contrast(shadcn['--primary-foreground'], shadcn['--primary']) >= 4.5);
  assert.ok(contrast(shadcn['--primary'], shadcn['--background']) >= 4.5);
  assert.ok(contrast(shadcn['--ring'], shadcn['--background']) >= 3);
  assert.ok(contrast(shadcn['--sidebar-foreground'], shadcn['--sidebar']) >= 4.5);
  assert.ok(contrast(shadcn['--sidebar-accent-foreground'], shadcn['--sidebar-accent']) >= 4.5);
  assert.ok(contrast(ledger['--ink'], shadcn['--card']) >= 4.5);
  assert.ok(contrast(ledger['--ink-soft'], shadcn['--card']) >= 4.5);
  assert.equal(getChartTheme(true).cell, shadcn['--card']);
  const styles = await fs.readFile(new URL('src/styles.css', root), 'utf8');
  const charts = await fs.readFile(new URL('src/charts.jsx', root), 'utf8');
  assert.doesNotMatch(styles, /background:\s*#fff\b|background:\s*#ffffff\b/);
  assert.doesNotMatch(charts, /#fff|#ffffff|#dfe6f2|#64748b|#122040|#f2f5fa/);
});
