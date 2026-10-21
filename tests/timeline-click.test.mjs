import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, midnight } from '../src/model.mjs';
import { spansOnDay, timelineDomainAt } from '../src/timeline-select.mjs';

const day = midnight(Date.UTC(2026, 9, 21, 15));

test('a timeline click uses the same day list as the tooltip, and site wins over the raw host', () => {
  const spans = [
    { domain: 'yesterday.test', start: day - 3_600_000, end: day },
    { domain: 'www.gray.example', site: 'gray.example', start: day - 60_000, end: day + 20 * 60_000 },
    { domain: 'github.com', start: day + 9 * 3_600_000, end: day + 11 * 3_600_000 },
    { domain: 'tiny.example', site: '', start: day + 17 * 3_600_000, end: day + 17 * 3_600_000 + 2_000 },
    { domain: 'tomorrow.test', start: addDays(day, 1), end: addDays(day, 1) + 3_600_000 },
  ];
  const today = spansOnDay(spans, day);
  assert.deepEqual(today.map(span => span.domain), ['www.gray.example', 'github.com', 'tiny.example']);
  assert.equal(timelineDomainAt(today, 0), 'gray.example');
  assert.equal(timelineDomainAt(today, 1), 'github.com');
  assert.equal(timelineDomainAt(today, 2), 'tiny.example');
});

test('a blank track and an out-of-range dataIndex do not select a site', () => {
  const spans = [{ domain: 'github.com', site: 'github.com' }];
  assert.equal(timelineDomainAt(spans, undefined), '');
  assert.equal(timelineDomainAt(spans, null), '');
  assert.equal(timelineDomainAt(spans, -1), '');
  assert.equal(timelineDomainAt(spans, 1.5), '');
  assert.equal(timelineDomainAt(spans, 1), '');
  assert.equal(timelineDomainAt([], 0), '');
  assert.equal(timelineDomainAt(undefined, 0), '');
});
