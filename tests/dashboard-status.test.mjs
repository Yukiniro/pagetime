import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankData } from '../src/model.mjs';
import { viewFromSnapshot } from '../src/ledger-view.mjs';
import { dashboardStatus, isLedgerEmpty } from '../src/dashboard-status.mjs';

const at = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const range = { start: at(19), end: at(20), today: at(19) };

test('a blank or cleared ledger is empty, and any stored host is not', () => {
  assert.equal(isLedgerEmpty(viewFromSnapshot(blankData(), range)), true);
  const cleared = viewFromSnapshot({ ...blankData(), visits: [], spans: [], since: at(19, 12) }, range);
  assert.equal(isLedgerEmpty(cleared), true);
  assert.equal(dashboardStatus({ view: cleared, pending: false }), 'empty');
  const visitOnly = viewFromSnapshot({
    ...blankData(),
    visits: [{ domain: 'example.com', at: at(18, 9) }],
    spans: [],
  }, range);
  assert.equal(visitOnly.stats.rows.length, 0);
  assert.equal(isLedgerEmpty(visitOnly), false);
  assert.equal(dashboardStatus({ view: visitOnly, pending: false }), 'ready');
});

test('loading wins over a stale view, including after a range change', () => {
  const view = viewFromSnapshot({
    ...blankData(),
    spans: [{ domain: 'example.com', start: at(19, 9), end: at(19, 9, 5) }],
  }, range);
  assert.equal(dashboardStatus({ view, pending: true }), 'loading');
  assert.equal(dashboardStatus({ view: undefined, pending: true }), 'loading');
  assert.equal(dashboardStatus({ view: undefined, pending: false }), 'loading');
  assert.equal(dashboardStatus({ view, pending: false }), 'ready');
});
