import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rank } from '../src/model.mjs';
import { colorsFor } from '../src/timeline-colors.mjs';
import { getChartTheme, timelineSwatchesFor } from '../src/theme.mjs';

const oldPalette = ['#2875ff', '#20bfa5', '#ffb32c', '#8870ff', '#20b5c7', '#8d9ab2'];
const knownSites = ['github.com', 'wxt.dev', 'developer.mozilla.org', 'youtube.com', 'notion.so'];
const legacyColor = domain => oldPalette[knownSites.includes(domain)
  ? knownSites.indexOf(domain)
  : [...domain].reduce((n, c) => (n + c.charCodeAt(0)) % oldPalette.length, 0)];

function channel(hex, index) {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a, b) {
  const luminance = hex => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const [hi, lo] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (hi + 0.05) / (lo + 0.05);
}

function lab(hex) {
  const r = channel(hex, 0);
  const g = channel(hex, 1);
  const b = channel(hex, 2);
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
  const fx = f(x / 0.95047);
  const fy = f(y);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const day = [
  { domain: 'google.com', ms: 5_000, visits: 4 },
  { domain: 'github.com', ms: 4_000, visits: 3 },
  { domain: 'claude.ai', ms: 3_000, visits: 2 },
  { domain: 'youtube.com', ms: 2_000, visits: 8 },
  { domain: 'bilibili.com', ms: 1_000, visits: 1 },
  { domain: 'zhihu.com', ms: 500, visits: 6 },
  { domain: 'x.com', ms: 200, visits: 1 },
  { domain: 'reddit.com', ms: 100, visits: 1 },
  { domain: 'mail.google.com', ms: 0, visits: 9 },
];

test('the top five sites of a day get distinct rank colors and the rest are gray', () => {
  for (const isDark of [false, true]) {
    const swatches = timelineSwatchesFor(isDark);
    const colors = colorsFor(day, swatches);
    const ranked = ['google.com', 'github.com', 'claude.ai', 'youtube.com', 'bilibili.com'];
    ranked.forEach((domain, index) => assert.equal(colors.get(domain), swatches.ranks[index], domain));
    assert.equal(new Set(ranked.map(domain => colors.get(domain))).size, ranked.length);
    for (const domain of ['zhihu.com', 'x.com', 'reddit.com']) assert.equal(colors.get(domain), swatches.other, domain);
    assert.equal(swatches.ranks.includes(swatches.other), false);
    assert.equal(colors.has('mail.google.com'), false);
    assert.equal(colors.get('missing.test'), undefined);
  }
});

test('google.com, github.com and claude.ai no longer share one hash color', () => {
  assert.equal(legacyColor('google.com'), legacyColor('github.com'));
  assert.equal(legacyColor('google.com'), legacyColor('claude.ai'));
  const swatches = timelineSwatchesFor(false);
  const colors = colorsFor([
    { domain: 'claude.ai', ms: 9, visits: 1 },
    { domain: 'google.com', ms: 8, visits: 1 },
    { domain: 'github.com', ms: 7, visits: 1 },
  ], swatches);
  assert.deepEqual(
    [colors.get('claude.ai'), colors.get('google.com'), colors.get('github.com')],
    [swatches.ranks[0], swatches.ranks[1], swatches.ranks[2]],
  );
  assert.notEqual(colors.get('github.com'), swatches.ranks[0]);
  const buried = colorsFor([
    { domain: 'a.test', ms: 50, visits: 1 },
    { domain: 'b.test', ms: 40, visits: 1 },
    { domain: 'c.test', ms: 30, visits: 1 },
    { domain: 'd.test', ms: 20, visits: 1 },
    { domain: 'e.test', ms: 10, visits: 1 },
    { domain: 'github.com', ms: 1, visits: 1 },
  ], swatches);
  assert.equal(buried.get('github.com'), swatches.other);
});

test('colors follow the day ranking, including visit and name ties, and a filtered site uses the first color', () => {
  const rows = [
    { domain: 'b.test', ms: 10, visits: 2 },
    { domain: 'a.test', ms: 10, visits: 5 },
    { domain: 'c.test', ms: 10, visits: 5 },
    { domain: 'z.test', ms: 0, visits: 99 },
    { domain: 'd.test', ms: 50, visits: 1 },
  ];
  const swatches = timelineSwatchesFor(false);
  const summary = rank(rows.map(row => ({ ...row })));
  const colors = colorsFor([
    ...rows,
    { domain: 'd.test', ms: 1, visits: 9 },
  ], swatches);
  const legend = summary.rows.filter(row => row.ms > 0);
  assert.deepEqual(legend.map(row => row.domain), ['d.test', 'a.test', 'c.test', 'b.test']);
  legend.forEach((row, index) => assert.equal(colors.get(row.domain), swatches.ranks[index]));
  assert.equal(colors.has('z.test'), false);
  assert.equal([...colors.keys()].filter(domain => domain === 'd.test').length, 1);
  const filtered = colorsFor([{ domain: 'x.com', ms: 10, visits: 1 }], swatches);
  assert.equal(filtered.get('x.com'), swatches.ranks[0]);
  assert.equal(filtered.size, 1);
});

test('rank colors and the neutral gray stay apart on the timeline background', () => {
  for (const isDark of [false, true]) {
    const swatches = timelineSwatchesFor(isDark);
    const background = getChartTheme(isDark).timeline;
    const colors = [...swatches.ranks, swatches.other];
    assert.equal(swatches.ranks.length, 5);
    assert.equal(new Set(colors).size, colors.length);
    for (const color of colors) assert.ok(contrast(color, background) >= 3, `${color} on ${background}`);
    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        assert.ok(deltaE(colors[i], colors[j]) >= 25, `${colors[i]} ${colors[j]}`);
      }
    }
  }
});

test('timeline coloring does not read known sites or the domain hash', () => {
  const source = [
    readFileSync(new URL('../src/timeline-colors.mjs', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/Overview.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/Charts.jsx', import.meta.url), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /knownSites|charCodeAt|colorOf\(/);
  assert.doesNotMatch(readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'), /colorOf|palette/);
});
