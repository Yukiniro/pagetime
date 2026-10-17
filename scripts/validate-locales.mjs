import assert from 'node:assert/strict';

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const flatten = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
  value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]);
const bases = entries => [...new Set(Object.keys(entries).map(key => key.replace(pluralSuffix, '')))].sort();
const tokens = text => [...text.matchAll(/{{\s*[\w.]+\s*}}|<\/?[\w-]+\s*\/?>/g)].map(match => match[0].replace(/\s/g, '')).sort();

export function validateLocale(code, messages, reference) {
  const entries = Object.fromEntries(flatten(messages));
  const en = Object.fromEntries(flatten(reference));
  assert.deepEqual(bases(entries), bases(en), `${code}: translation keys`);
  for (const base of bases(en)) {
    if (`${base}_other` in en) {
      for (const category of new Intl.PluralRules(code).resolvedOptions().pluralCategories) {
        assert.ok(`${base}_${category}` in entries, `${code}: ${base}_${category}`);
      }
    }
  }
  for (const [key, value] of Object.entries(entries)) {
    assert.equal(typeof value, 'string', `${code}: ${key}`);
    assert.ok(value.trim(), `${code}: ${key} is empty`);
    const referenceKey = key in en ? key : key.replace(pluralSuffix, '_other');
    assert.ok(referenceKey in en, `${code}: unexpected key ${key}`);
    assert.deepEqual(tokens(value), tokens(en[referenceKey]), `${code}: ${key} placeholders/tags`);
  }
}
