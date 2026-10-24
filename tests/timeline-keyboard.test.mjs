import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const charts = readFileSync(new URL('../src/Charts.jsx', import.meta.url), 'utf8');
const timeline = charts.slice(charts.indexOf('export function Timeline'), charts.indexOf('export function Breakdown'));
const dayHour = charts.slice(charts.indexOf('export function DayHourChart'), charts.indexOf('const weekdayAt'));
const heatmap = charts.slice(charts.indexOf('export function Heatmap'), charts.indexOf('export function Timeline'));

test('each selectable timeline segment is a button on the same openSite path as the canvas click', () => {
  assert.match(timeline, /const domain=timelineDomainAt\(today,i\)/);
  assert.match(timeline, /<button type="button" className="sr-only timeline-segment pointer-events-none" onClick=\{event=>onSelectSite\(domain,event\)\}>/);
  assert.match(timeline, /onSelectSite\(domain,\{currentTarget\}\)/);
  assert.match(timeline, /<Chart option=\{option\} className=\{className\} label=\{t\(labelKey,\{count:today\.length,date\}\)\} onClick=\{onClick\}\/>/);
  assert.match(charts, /tabIndex=\{onClick\?-1:undefined\}/);
  assert.doesNotMatch(charts, /tabIndex=\{0\}|tabIndex=\{onClick\?0/);
  assert.match(timeline, /<ul className=\{onSelectSite\?'timeline-segments':'sr-only'\}>/);
});

test('overview hour bars and the heatmap do not grow segment buttons', () => {
  assert.doesNotMatch(dayHour, /<button|onSelectSite|timelineDomainAt|onSelectHour/);
  assert.doesNotMatch(heatmap, /<button|onSelectSite|timelineDomainAt|onSelectHour/);
  const hour = charts.slice(charts.indexOf('export function HourChart'), charts.indexOf('export function DayHourChart'));
  assert.match(hour, /onSelectHour\s*\?/);
  assert.match(hour, /<button type="button" className="sr-only timeline-segment pointer-events-none" onClick=\{\(\)=>onSelectHour\(row\.hour\)\}>/);
});

test('a focused segment button leaves the screen-reader clip and can be clicked', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\.timeline-segment:focus,\.timeline-segment:focus-visible\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /clip-path:none/);
  assert.match(rule, /pointer-events:auto/);
  assert.match(rule, /position:absolute/);
});
