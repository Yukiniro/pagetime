import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REPO_URL, docLinks } from '../src/docs-links.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const codes = fs.readdirSync(new URL('src/locales/', root)).map(file => file.replace('.json', ''));

test('the settings links point into the repository and follow the interface language', () => {
  assert.equal(docLinks('en').timing, `${REPO_URL}/blob/main/docs/timing.md`);
  assert.equal(docLinks('en').privacy, `${REPO_URL}/blob/main/PRIVACY.md`);
  for (const code of ['zh-CN', 'zh-TW']) {
    assert.equal(docLinks(code).timing, `${REPO_URL}/blob/main/docs/timing.zh-CN.md`);
    assert.equal(docLinks(code).privacy, `${REPO_URL}/blob/main/PRIVACY.zh-CN.md`);
  }
  for (const code of codes.filter(code => !code.startsWith('zh'))) assert.equal(docLinks(code).timing, docLinks('en').timing, code);
  assert.equal(docLinks(undefined).timing, docLinks('en').timing);
  for (const target of Object.values(docLinks('zh-CN'))) assert.ok(fs.existsSync(new URL(target.replace(`${REPO_URL}/blob/main/`, ''), root)), target);
});

test('the settings page opens the docs in a new tab and the app keeps no timing-rules interface', () => {
  const app = read('src/app.jsx');
  assert.match(app, /<a href=\{links\.timing\} target="_blank" rel="noreferrer noopener">/);
  assert.match(app, /<a href=\{links\.privacy\} target="_blank" rel="noreferrer noopener">/);
  for (const file of ['src/how-it-works-dialog.jsx', 'src/local-data-section.jsx', 'src/local-data.mjs']) assert.equal(fs.existsSync(new URL(file, root)), false, file);
  assert.doesNotMatch(app, /HowItWorks|LocalData|useLocalData|timingCopy|settings\.method|settings\.privacy/);
});

test('no locale keeps the removed how-it-works, method, privacy, local-data, or compare-reason copy', () => {
  for (const code of codes) {
    const json = JSON.parse(read(`src/locales/${code}.json`));
    assert.equal(json.howItWorks, undefined, code);
    for (const key of ['method', 'privacy', 'localData']) assert.equal(json.settings[key], undefined, `${code} settings.${key}`);
    assert.equal(json.compare.reason, undefined, code);
    assert.ok(json.settings.docs.timing && json.settings.docs.privacy && json.compare.unavailable, code);
    assert.ok(json.localNote, code);
  }
});
