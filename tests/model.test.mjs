import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankData, domainOf, addSpan, summarize, midnight, daily, prune, creditUntil, DAY, LIMIT, GAP_LIMIT_MS, RETENTION_DAYS } from '../src/model.mjs';

test('only http(s) domains are recorded; sensitive query/path omitted', () => {
  assert.equal(domainOf('https://example.com/private?token=secret#x'), 'example.com');
  for (const url of ['chrome://extensions','about:blank','file:///a','bad','javascript:alert(1)']) assert.equal(domainOf(url), null);
});
test('interval clipping and visits are independent; midnight splits chart correctly', () => {
  const data = blankData(); const day = midnight(Date.now());
  addSpan(data,'a.test',day-30_000,day+30_000);
  data.visits.push({ domain:'a.test',at:day-1 },{domain:'b.test',at:day});
  const stats = summarize(data,day,day+DAY);
  assert.equal(stats.ms,30_000); assert.equal(stats.visits,1); assert.equal(stats.rows.length,2);
  assert.equal(daily(data,day-DAY,day+DAY).reduce((sum,d)=>sum+d.ms,0),60_000);
});
test('continuous same-site intervals merge but idle gaps remain', () => {
  const data=blankData(); addSpan(data,'a',0,100);addSpan(data,'a',100,200);addSpan(data,'a',300,400);addSpan(data,'a',500,400);
  assert.equal(data.spans.length,2);assert.equal(data.spans[0].end,200);
});
test('suspension, clock reversal and retention do not inflate data', () => {
  assert.equal(GAP_LIMIT_MS,90_000);
  assert.equal(creditUntil({since:10},50),50);
  assert.equal(creditUntil({since:10},100_000),10+90_000);
  assert.equal(creditUntil({since:10},0),10);
  assert.equal(creditUntil(undefined,100_000),undefined);
  const data=blankData();data.visits=Array.from({length:LIMIT+4},(_,at)=>({domain:'a',at}));prune(data,LIMIT+5);assert.equal(data.visits.length,LIMIT);
  data.visits.push({domain:'old',at:0});prune(data,(RETENTION_DAYS+1)*DAY);assert.equal(data.visits.length,0);
});
