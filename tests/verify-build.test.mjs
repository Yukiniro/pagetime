import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyFiles } from '../scripts/verify-build.mjs';
import { artifact } from './helpers/artifact-fixture.mjs';

test('artifact contract accepts a complete extension and rejects wrong versions, permissions and missing files', () => {
  const check = ({ files, ...contract }) => verifyFiles(path => { assert.ok(files[path], `Missing ${path}`); return files[path]; }, contract);
  assert.equal(check(artifact()).version, '1.0.1');
  for (const change of [manifest => { manifest.version = '9.0.0'; }, manifest => { manifest.permissions.push('history'); }, manifest => { manifest.host_permissions = ['https://*/*']; }]) {
    const value = artifact();
    change(value.manifest);
    value.files['manifest.json'] = Buffer.from(JSON.stringify(value.manifest));
    assert.throws(() => check(value));
  }
  for (const file of ['background.js', 'dashboard.js', 'dashboard.css', 'popup.js', 'popup.css', 'icon/128.png', '_locales/ru/messages.json', 'import-parse-worker.js']) {
    const value = artifact();
    delete value.files[file];
    assert.throws(() => check(value), /Missing/);
  }
  const translated = artifact();
  translated.files['_locales/ja/messages.json'] = Buffer.from('{}');
  assert.throws(() => check(translated), /translations differ/);
  const icon = artifact();
  icon.files['icon/16.png'] = Buffer.from(icon.files['icon/32.png']);
  assert.throws(() => check(icon));
});
