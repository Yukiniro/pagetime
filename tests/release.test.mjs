import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { zipSync } from 'fflate';
import { release, changelogEntry } from '../scripts/release.mjs';
import { artifact } from './helpers/artifact-fixture.mjs';

const sha = 'a'.repeat(40);
const name = 'pagetime-1.0.1-chrome.zip';

function harness(t, { tag, existing = null, buildFails = false, uploadFails = false, wrongArchive = false, apiFails = false } = {}) {
  t.mock.method(console, 'log', () => {});
  const directory = mkdtempSync(join(tmpdir(), 'pagetime-release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const put = (path, value) => { mkdirSync(dirname(join(directory, path)), { recursive: true }); writeFileSync(join(directory, path), value); };
  const fixture = artifact();
  put('package.json', JSON.stringify({ name: 'pagetime', version: fixture.version }));
  put('CHANGELOG.md', '# pagetime\n\n## 1.0.1\n\n- Fixed records\n\n## 1.0.0\n\n- Initial\n');
  for (const [code, messages] of Object.entries(fixture.locales)) {
    put(`src/locales/${code.replace('_', '-')}.json`, '{}');
    put(`public/_locales/${code}/messages.json`, JSON.stringify(messages));
  }
  put(`.output/${name}`, zipSync(fixture.files));
  const calls = [];
  const state = { tag, existing, buildFails, uploadFails, wrongArchive, apiFails };
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') {
      if (args[0] === 'rev-parse') return sha;
      if (args[0] === 'status') return '';
      if (args[0] === 'ls-remote') return state.tag ? `${state.tag}\trefs/tags/v1.0.1` : '';
      if (args[0] === 'push') { state.tag = sha; return ''; }
    }
    if (command === 'npm' || command === 'npm.cmd') {
      if (state.buildFails) throw Error('check failed');
      return '';
    }
    if (command === 'gh') {
      if (args[0] === 'api') {
        if (state.apiFails) throw Error('network failed');
        if (!state.existing) throw Object.assign(Error('not found'), { stdout: '{"status":"404"}' });
        return JSON.stringify(state.existing);
      }
      if (args[1] === 'create') state.existing = { draft: true, assets: [] };
      if (args[1] === 'upload') {
        if (state.uploadFails) throw Error('upload failed');
        state.existing.assets.push({ name, state: 'uploaded', size: 100 });
      }
      if (args[1] === 'edit') state.existing.draft = false;
      if (args[1] === 'download') {
        const files = { ...fixture.files };
        if (state.wrongArchive) files['background.js'] = Buffer.from('different source');
        writeFileSync(join(args[args.indexOf('--dir') + 1], name), zipSync(files, { level: 0 }));
      }
      return '';
    }
    throw Error(`Unexpected command: ${command} ${args.join(' ')}`);
  };
  return { directory, calls, state, publish: () => release({ directory, expectedSha: sha, run }) };
}

const mutations = calls => calls.filter(([command, action, operation]) => command === 'git' && action === 'push' || command === 'gh' && action === 'release' && ['create', 'upload', 'edit'].includes(operation));

test('notes select exactly the requested version', () => {
  assert.equal(changelogEntry('## 1.0.1\n\nFixed\n\n## 1.0.0\nOld', '1.0.1'), '## 1.0.1\n\nFixed');
  assert.throws(() => changelogEntry('## 1.0.0', '1.0.1'), /Missing changelog/);
});

test('all checks run before tag push; ZIP uploads to a draft before publication', t => {
  const h = harness(t);
  h.publish();
  const checks = h.calls.filter(([cmd]) => cmd === 'npm' || cmd === 'npm.cmd').map(([, , script]) => script);
  assert.deepEqual(checks, ['typecheck', 'build:preview', 'test', 'zip']);
  const operations = mutations(h.calls);
  assert.deepEqual(operations.map(([cmd, action, operation]) => cmd === 'git' ? action : operation), ['push', 'create', 'upload', 'edit']);
  assert.ok(operations[1].includes('--draft'));
  assert.equal(h.state.existing.draft, false);
});

test('failed checks, invalid artifacts, conflicting tags and network errors cannot publish', t => {
  for (const options of [{ buildFails: true }, { tag: 'b'.repeat(40) }, { apiFails: true }]) {
    const h = harness(t, options);
    assert.throws(h.publish);
    assert.deepEqual(mutations(h.calls), []);
  }
  const h = harness(t);
  writeFileSync(join(h.directory, '.output', name), zipSync({ 'manifest.json': Buffer.from('{}') }));
  assert.throws(h.publish);
  assert.deepEqual(mutations(h.calls), []);
});

test('failed upload leaves a draft and rerun completes it without creating another release', t => {
  const h = harness(t, { uploadFails: true });
  assert.throws(h.publish, /upload failed/);
  assert.equal(h.state.existing.draft, true);
  h.state.uploadFails = false;
  h.calls.length = 0;
  h.publish();
  assert.deepEqual(mutations(h.calls).map(([, , action]) => action), ['upload', 'edit']);
  assert.equal(h.state.existing.draft, false);
});

test('complete releases are verified without mutations; incomplete public releases recover missing ZIP', t => {
  const h = harness(t, { tag: sha, existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }] } });
  h.publish();
  assert.deepEqual(mutations(h.calls), []);
  const incomplete = harness(t, { tag: sha, existing: { draft: false, assets: [] } });
  incomplete.publish();
  assert.deepEqual(mutations(incomplete.calls).map(([, , action]) => action), ['upload']);
});

test('an existing ZIP from different source is never overwritten', t => {
  const h = harness(t, { tag: sha, existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }] }, wrongArchive: true });
  assert.throws(h.publish, /refusing to replace/);
  assert.deepEqual(mutations(h.calls), []);
});
