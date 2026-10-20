import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateLocale } from '../scripts/validate-locales.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const codes = (await fs.readdir(new URL('src/locales/', root))).map(file => file.replace('.json', ''));
const en = await read('src/locales/en.json');

for (const code of codes) test(`${code} matches all keys, plural branches, placeholders and tags`, async () => {
  validateLocale(code, await read(`src/locales/${code}.json`), en);
});

test('non-other plural branches cannot drop placeholders or closing tags', async () => {
  const ru = await read('src/locales/ru.json');
  for (const category of ['one', 'few', 'many']) {
    const broken = structuredClone(ru);
    broken.summary[`sites_${category}`] = '<b>1</b>';
    assert.throws(() => validateLocale('ru', broken, en), /placeholders\/tags/);
  }
  const broken = structuredClone(en);
  broken.summary.sites_one = '<b>{{count}} visit';
  assert.throws(() => validateLocale('en', broken, en), /placeholders\/tags/);
  broken.summary.sites_one = '';
  assert.throws(() => validateLocale('en', broken, en), /empty/);
});

test('required plural branches and optional zero branches are validated', async () => {
  const ru = await read('src/locales/ru.json');
  delete ru.summary.sites_few;
  assert.throws(() => validateLocale('ru', ru, en), /sites_few/);
  const broken = structuredClone(en);
  broken.summary.sites_zero = '<b>zero</b> sites';
  assert.throws(() => validateLocale('en', broken, en), /sites_zero/);
});

test('every UI locale has matching non-empty manifest messages', async () => {
  const config = await fs.readFile(new URL('wxt.config.ts', root), 'utf8');
  const names = [...config.matchAll(/__MSG_(\w+)__/g)].map(match => match[1]);
  assert.ok(names.length);
  const reference = await read('public/_locales/en/messages.json');
  for (const code of codes) {
    const messages = await read(`public/_locales/${code.replace('-', '_')}/messages.json`);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(reference).sort(), code);
    for (const name of names) assert.ok(messages[name]?.message?.trim(), `${code} ${name}`);
  }
});
