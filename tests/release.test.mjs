import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { zipSync } from 'fflate';
import { release, changelogEntry, checksumFile, sumsName } from '../scripts/release.mjs';
import { artifact } from './helpers/artifact-fixture.mjs';

const sha = 'a'.repeat(40);
const name = 'pagetime-1.0.1-chrome.zip';

function harness(t, { tag, existing = null, buildFails = false, uploadFails = false, failSums = false, wrongArchive = false, apiFails = false, badSums = null } = {}) {
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
  const state = { tag, existing, buildFails, uploadFails, failSums, wrongArchive, apiFails, badSums, blobs: {} };
  let served;
  const servedZip = () => {
    if (state.blobs[name]) return state.blobs[name];
    if (served) return served;
    const files = { ...fixture.files };
    if (state.wrongArchive) files['background.js'] = Buffer.from('different source');
    served = zipSync(files, { level: 0 });
    return served;
  };
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
        const assetName = basename(args[3]);
        if (state.uploadFails || (state.failSums && assetName === sumsName)) throw Error('upload failed');
        const bytes = readFileSync(args[3]);
        state.blobs[assetName] = bytes;
        state.existing.assets.push({ name: assetName, state: 'uploaded', size: bytes.length });
      }
      if (args[1] === 'edit') state.existing.draft = false;
      if (args[1] === 'download') {
        const dir = args[args.indexOf('--dir') + 1];
        const pattern = args[args.indexOf('--pattern') + 1];
        mkdirSync(dir, { recursive: true });
        if (pattern === sumsName) writeFileSync(join(dir, sumsName), state.badSums ?? state.blobs[sumsName] ?? checksumFile(name, servedZip()));
        else if (pattern === name) {
          const bytes = servedZip();
          state.served = bytes;
          writeFileSync(join(dir, name), bytes);
        }
        else throw Error(`Unexpected download ${pattern}`);
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

test('all checks run before tag push; ZIP and SHA256SUMS upload to a draft before publication', t => {
  const h = harness(t);
  h.publish();
  const checks = h.calls.filter(([cmd]) => cmd === 'npm' || cmd === 'npm.cmd').map(([, , script]) => script);
  assert.deepEqual(checks, ['typecheck', 'build:preview', 'test', 'zip']);
  const operations = mutations(h.calls);
  assert.deepEqual(operations.map(([cmd, action, operation]) => cmd === 'git' ? action : operation), ['push', 'create', 'upload', 'upload', 'edit']);
  assert.ok(operations[1].includes('--draft'));
  assert.equal(h.state.blobs[sumsName].toString('utf8'), checksumFile(name, h.state.blobs[name]));
  const editAt = h.calls.findIndex(([, , operation]) => operation === 'edit');
  assert.ok(h.calls.findLastIndex(call => call[0] === 'gh' && call[2] === 'upload') < editAt);
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
  assert.deepEqual(mutations(h.calls).map(([, , action]) => action), ['upload', 'upload', 'edit']);
  assert.equal(h.state.existing.draft, false);
});

test('complete releases are verified without mutations; incomplete public releases recover the ZIP and checksum', t => {
  const h = harness(t, { tag: sha, existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }, { name: sumsName, state: 'uploaded', size: 100 }] } });
  h.publish();
  assert.deepEqual(mutations(h.calls), []);
  const incomplete = harness(t, { tag: sha, existing: { draft: false, assets: [] } });
  incomplete.publish();
  assert.deepEqual(mutations(incomplete.calls).map(([, , action]) => action), ['upload', 'upload']);
  assert.equal(incomplete.state.blobs[sumsName].toString('utf8'), checksumFile(name, incomplete.state.blobs[name]));
});

test('a published ZIP gains SHA256SUMS of those bytes; a mismatch is not replaced', t => {
  const missing = harness(t, { tag: sha, existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }] } });
  missing.publish();
  assert.deepEqual(mutations(missing.calls).map(call => basename(call[4])), [sumsName]);
  assert.equal(missing.state.blobs[sumsName].toString('utf8'), checksumFile(name, missing.state.served));
  const mismatch = harness(t, { tag: sha, badSums: 'deadbeef\n', existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }, { name: sumsName, state: 'uploaded', size: 8 }] } });
  assert.throws(mismatch.publish, /refusing to replace/);
  assert.deepEqual(mutations(mismatch.calls), []);
});

test('SHA256SUMS is accepted by sha256sum -c', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pagetime-sums-'));
  try {
    const filename = 'pagetime-1.0.0-chrome.zip';
    const bytes = Buffer.from('pagetime-zip');
    writeFileSync(join(directory, filename), bytes);
    writeFileSync(join(directory, sumsName), checksumFile(filename, bytes));
    execFileSync('sha256sum', ['-c', sumsName], { cwd: directory });
    try { execFileSync('shasum', ['-a', '256', '-c', sumsName], { cwd: directory }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('an existing ZIP from different source is never overwritten', t => {
  const h = harness(t, { tag: sha, existing: { draft: false, assets: [{ name, state: 'uploaded', size: 100 }] }, wrongArchive: true });
  assert.throws(h.publish, /refusing to replace/);
  assert.deepEqual(mutations(h.calls), []);
});
