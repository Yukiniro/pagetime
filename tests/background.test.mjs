import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/model.mjs';

async function harness() {
  let now=1_000_000;let idle='active';let focused=true;let tab={id:1,url:'https://example.com/private?key=secret',incognito:false};
  const event=()=>({listeners:[],addListener(fn){this.listeners.push(fn);},fire(...args){for(const fn of this.listeners)fn(...args);}});
  const area=()=>{const values={};return{async get(key){return structuredClone({[key]:values[key]});},async set(patch){Object.assign(values,structuredClone(patch));},async remove(key){delete values[key];}};};
  const browser={storage:{local:area(),session:area()},
    idle:{queryState:async()=>idle,setDetectionInterval(){},onStateChanged:event()},
    windows:{getAll:async()=>[{id:1,focused,incognito:false}],onFocusChanged:event()},
    tabs:{query:async()=>[tab],get:async()=>tab,onActivated:event(),onRemoved:event(),onUpdated:event(),create:async()=>{}},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event()},alarms:{create:async()=>{},onAlarm:event()},
    runtime:{id:'jilan',getURL:p=>'chrome-extension://jilan'+p,onStartup:event(),onMessage:event()},action:{onClicked:event()}};
  const source=await fs.readFile(new URL('../entrypoints/background.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  class ClockDate extends Date { static now(){return now;} }
  const context={exports:{},console,Date:ClockDate,require:name=>name==='wxt/browser'?{browser}:name==='wxt/utils/define-background'?{defineBackground:fn=>fn()}:model};
  vm.runInNewContext(code,context);
  const message=type=>new Promise(resolve=>browser.runtime.onMessage.listeners[0]({type},{id:'jilan',url:'chrome-extension://jilan/dashboard.html'},resolve));
  await message('snapshot');
  return {browser,message,advance:ms=>now+=ms,setIdle:v=>{idle=v;browser.idle.onStateChanged.fire(v);},setFocus:v=>{focused=v;browser.windows.onFocusChanged.fire(1);},setTab:v=>{tab={...tab,...v};browser.tabs.onActivated.fire({tabId:tab.id});},get now(){return now;}};
}
test('background counts main-frame visits, ignores private/internal pages, and stores only domains',async()=>{
  const h=await harness();const commit=(url,frameId=0)=>h.browser.webNavigation.onCommitted.fire({url,frameId,tabId:1,timeStamp:h.now});
  commit('https://example.com/private?key=secret');commit('https://sub.test',1);
  let data=(await h.message('snapshot')).data;
  assert.equal(data.visits.length,1);assert.equal(data.visits[0].domain,'example.com');assert.ok(!JSON.stringify(data).includes('secret'));
  h.setTab({incognito:true});commit('https://private.test');commit('chrome://settings');
  data=(await h.message('snapshot')).data;assert.equal(data.visits.length,1);
});
test('background stops at loss of focus, idle and pause; resumes and clears without stale intervals',async()=>{
  const h=await harness();h.advance(10_000);h.setFocus(false);await h.message('snapshot');h.advance(20_000);
  assert.equal((await h.message('snapshot')).data.spans.reduce((n,s)=>n+s.end-s.start,0),10_000);
  h.setFocus(true);await h.message('snapshot');h.advance(5_000);h.setIdle('idle');await h.message('snapshot');h.advance(20_000);
  assert.equal((await h.message('snapshot')).data.spans.reduce((n,s)=>n+s.end-s.start,0),15_000);
  h.setIdle('active');await h.message('snapshot');await h.message('toggle');h.advance(50_000);
  assert.equal((await h.message('snapshot')).data.spans.reduce((n,s)=>n+s.end-s.start,0),15_000);
  await h.message('toggle');h.advance(2_000);assert.equal((await h.message('snapshot')).data.spans.at(-1).end-h.now,0);
  const cleared=(await h.message('clear')).data;assert.equal(cleared.spans.length,0);assert.equal(cleared.visits.length,0);
  h.advance(3_000);assert.equal((await h.message('snapshot')).data.spans[0].end-(await h.message('snapshot')).data.spans[0].start,3_000);
});
