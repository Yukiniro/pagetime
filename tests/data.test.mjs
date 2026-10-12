import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={protocol:'http:'};
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const {command,demoData,colorOf,knownSites,palette}=await import('../src/data.js');
test('demo uses past visits, varying days and stable domain colors',()=>{
  const data=demoData();assert.ok(data.visits.length>0);assert.ok(data.visits.every(v=>v.at<=Date.now()));assert.ok(data.spans.every(s=>s.end<=Date.now()));
  assert.equal(colorOf(knownSites[0]),palette[0]);assert.equal(colorOf('example.com'),colorOf('example.com'));assert.ok(palette.includes(colorOf('baidu.com')));
});
test('demo pause and clear persist without changing extension data',async()=>{
  values.clear();assert.equal((await command()).enabled,true);assert.equal((await command('toggle')).enabled,false);
  assert.equal((await command()).enabled,false);const cleared=await command('clear');assert.equal(cleared.visits.length,0);assert.equal(cleared.spans.length,0);assert.equal(cleared.enabled,false);
});
