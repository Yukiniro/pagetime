import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=async path=>JSON.parse(await fs.readFile(new URL(path,import.meta.url),'utf8'));
const keys=(object,prefix='')=>Object.entries(object).flatMap(([key,value])=>typeof value==='object'?keys(value,`${prefix}${key}.`):[`${prefix}${key.replace(/_(zero|one|two|few|many|other)$/,'')}`]);
const placeholders=(object,prefix='')=>Object.entries(object).flatMap(([key,value])=>typeof value==='object'?placeholders(value,`${prefix}${key}.`):[`${prefix}${key}:${[...value.matchAll(/{{(\w+)}}|<(\w+)\s*\/?>/g)].map(m=>m[0]).sort().join()}`]);

test('UI locales define the same keys and placeholders',async()=>{
  const zh=await read('../src/locales/zh.json'),en=await read('../src/locales/en.json');
  assert.deepEqual([...new Set(keys(en))].sort(),[...new Set(keys(zh))].sort());
  const strip=list=>[...new Set(list.map(entry=>entry.replace(/_(zero|one|two|few|many|other):/,':')))].sort();
  assert.deepEqual(strip(placeholders(en)),strip(placeholders(zh)));
});

test('extension manifest messages exist for every locale',async()=>{
  const en=await read('../public/_locales/en/messages.json'),zh=await read('../public/_locales/zh_CN/messages.json');
  assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
  const config=await fs.readFile(new URL('../wxt.config.ts',import.meta.url),'utf8');
  for(const [,name] of config.matchAll(/__MSG_(\w+)__/g)) assert.ok(en[name]?.message&&zh[name]?.message,name);
});
