import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={protocol:'http:'};
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const {command,colorOf,knownSites,palette}=await import('../src/data.js');
test('domain colors stay stable',()=>{
  assert.equal(colorOf(knownSites[0]),palette[0]);assert.equal(colorOf('example.com'),colorOf('example.com'));assert.ok(palette.includes(colorOf('baidu.com')));
});
test('preview starts empty, drops leftover demo records, and persists pause and clear',async()=>{
  values.clear();
  values.set('jilan-demo-v1',JSON.stringify({visits:[{domain:'github.com',at:1}],spans:[{domain:'github.com',start:1,end:2}],enabled:true,since:1}));
  const initial=await command();
  assert.equal(initial.visits.length,0);assert.equal(initial.spans.length,0);assert.equal(initial.enabled,true);
  assert.equal(values.has('jilan-demo-v1'),false);
  assert.equal((await command('toggle')).enabled,false);assert.equal((await command()).enabled,false);
  const cleared=await command('clear');assert.equal(cleared.visits.length,0);assert.equal(cleared.spans.length,0);assert.equal(cleared.enabled,false);
});
