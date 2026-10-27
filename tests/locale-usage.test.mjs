import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const PLURAL = /_(zero|one|two|few|many|other)$/;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

const flatten = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
  value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]);

async function sourceFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await sourceFiles(`${dir}${entry.name}/`));
    else if (SOURCE.test(entry.name)) found.push(`${dir}${entry.name}`);
  }
  return found;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function unusedKeys(keys, source) {
  const quoted = text => ['"', "'", '`'].some(quote => source.includes(`${quote}${text}${quote}`));
  const templates = [...source.matchAll(/`([^`]*\$\{[^`]*)`/g)].map(match => {
    const parts = match[1].split(/\$\{[^}]*\}/);
    return { pattern: new RegExp(`^${parts.map(escape).join('[^.]+')}$`), dynamicLeaf: parts.at(-1) === '' };
  });
  return keys.filter(key => {
    if (quoted(key)) return false;
    const leaf = key.split('.').at(-1);
    return !templates.some(({ pattern, dynamicLeaf }) => pattern.test(key) && (!dynamicLeaf || quoted(leaf)));
  });
}

for (const [surface, locale, dirs, shared = []] of [
  ['extension', 'src/locales/en.json', ['src/', 'entrypoints/']],
  ['website', 'website/locales/en.json', ['website/'], ['src/duration.mjs']],
]) test(`every English locale key is used by the ${surface}`, async () => {
  const en = JSON.parse(await fs.readFile(new URL(locale, root), 'utf8'));
  const keys = [...new Set(flatten(en).map(key => key.replace(PLURAL, '')))];
  const files = [...(await Promise.all(dirs.map(sourceFiles))).flat(), ...shared];
  const source = (await Promise.all(files.map(file => fs.readFile(new URL(file, root), 'utf8')))).join('\n');
  assert.deepEqual(unusedKeys(keys, source), []);
});

test('the usage check finds a key that nothing reads', () => {
  const source = "t('a.used'); t(`b.${mode}.title`); t(`c.${kind}`); const kinds = ['json'];";
  assert.deepEqual(unusedKeys(['a.used', 'a.gone', 'b.x.title', 'b.x.text', 'c.json', 'c.csv'], source), ['a.gone', 'b.x.text', 'c.csv']);
});
