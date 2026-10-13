import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await fs.readFile(new URL(path,root),'utf8'));
const pluralSuffix=/_(zero|one|two|few|many|other)$/;
const flatten=(object,prefix='')=>Object.entries(object).flatMap(([key,value])=>typeof value==='object'?flatten(value,`${prefix}${key}.`):[[`${prefix}${key}`,value]]);
const tokens=text=>[...text.matchAll(/{{\w+}}|<\w+\s*\/?>/g)].map(m=>m[0]).sort();
const codes=(await fs.readdir(new URL('src/locales/',root))).map(file=>file.replace('.json',''));
const en=Object.fromEntries(flatten(await read('src/locales/en.json')));
const bases=entries=>[...new Set(Object.keys(entries).map(key=>key.replace(pluralSuffix,'')))].sort();

for(const code of codes) test(`${code} matches English keys, placeholders and plural forms`,async()=>{
  const entries=Object.fromEntries(flatten(await read(`src/locales/${code}.json`)));
  assert.deepEqual(bases(entries),bases(en));
  const categories=new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  for(const base of bases(en)){
    const plural=`${base}_other` in en;
    if(plural) for(const category of categories) assert.ok(`${base}_${category}` in entries,`${base}_${category}`);
    const key=plural?`${base}_other`:base;
    assert.deepEqual(tokens(entries[key]),tokens(en[key]),key);
  }
});

test('every UI locale has extension manifest messages',async()=>{
  const config=await fs.readFile(new URL('wxt.config.ts',root),'utf8');
  const names=[...config.matchAll(/__MSG_(\w+)__/g)].map(m=>m[1]);
  assert.ok(names.length);
  for(const code of codes){
    const messages=await read(`public/_locales/${code.replace('-','_')}/messages.json`);
    for(const name of names) assert.ok(messages[name]?.message,`${code} ${name}`);
  }
});
