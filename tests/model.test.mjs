import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankData, domainOf, summarize, midnight, daily, creditUntil, detailCutoff, addDays, DAY, GAP_LIMIT_MS, DETAIL_DAYS } from '../src/model.mjs';

test('only http(s) domains are recorded; sensitive query/path omitted', () => {
  assert.equal(domainOf('https://example.com/private?token=secret#x'), 'example.com');
  for (const url of ['chrome://extensions','about:blank','file:///a','bad','javascript:alert(1)']) assert.equal(domainOf(url), null);
});
test('interval clipping and visits are independent; midnight splits chart correctly', () => {
  const data = blankData(); const day = midnight(Date.now());
  data.spans.push({ domain:'a.test',start:day-30_000,end:day+30_000 });
  data.visits.push({ domain:'a.test',at:day-1 },{domain:'b.test',at:day});
  const stats = summarize(data,day,day+DAY);
  assert.equal(stats.ms,30_000); assert.equal(stats.visits,1); assert.equal(stats.rows.length,2);
  assert.equal(daily(data,day-DAY,day+DAY).reduce((sum,d)=>sum+d.ms,0),60_000);
});
test('suspension, clock reversal and retention do not inflate data', () => {
  assert.equal(GAP_LIMIT_MS,90_000);
  assert.equal(creditUntil({since:10},50),50);
  assert.equal(creditUntil({since:10},100_000),10+90_000);
  assert.equal(creditUntil({since:10},0),10);
  assert.equal(creditUntil(undefined,100_000),undefined);
  assert.equal(DETAIL_DAYS,31);
  const now = new Date(2026,2,31,18).getTime();
  assert.equal(detailCutoff(now),new Date(2026,2,1).getTime());
  assert.equal(addDays(detailCutoff(now),DETAIL_DAYS),addDays(now,1));
});
