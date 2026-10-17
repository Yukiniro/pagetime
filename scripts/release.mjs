import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, readArchive, verifyBuild, zipName } from './verify-build.mjs';

const repository = 'Yukiniro/pagetime';

export function changelogEntry(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${version}`);
  assert.ok(start >= 0, `Missing changelog for ${version}`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start, next < 0 ? undefined : next).join('\n').trim();
}

function sameArchive(a, b) {
  const entries = path => Object.entries(readArchive(path)).filter(([name]) => !name.endsWith('/')).sort(([a], [b]) => a.localeCompare(b));
  // ZIP timestamps/compression may differ; every file's path and bytes must match.
  assert.deepEqual(entries(a), entries(b), 'Existing release ZIP differs from this commit; refusing to replace it');
}

export function release({ directory = root, expectedSha = process.env.RELEASE_SHA, run } = {}) {
  run ??= (command, args) => execFileSync(command, args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const git = (...args) => run('git', args).trim();
  const gh = (...args) => run('gh', args);
  assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/, 'RELEASE_SHA must identify the approved merge commit');
  assert.equal(git('rev-parse', 'HEAD'), expectedSha, 'Checkout must match RELEASE_SHA');
  assert.equal(git('status', '--porcelain'), '', 'Release requires a clean checkout');
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const tag = `v${pkg.version}`;
  const asset = zipName(pkg);
  const notes = changelogEntry(readFileSync(join(directory, 'CHANGELOG.md'), 'utf8'), pkg.version);
  const tagRef = `refs/tags/${tag}`;
  const remoteTag = () => {
    const refs = git('ls-remote', '--tags', 'origin', tagRef, `${tagRef}^{}`).split('\n').filter(Boolean).map(line => line.split(/\s+/));
    return (refs.find(([, ref]) => ref.endsWith('^{}')) ?? refs[0])?.[0];
  };
  const checkTag = () => {
    const sha = remoteTag();
    if (sha) assert.equal(sha, expectedSha, `Remote ${tag} points to another commit`);
    return sha;
  };
  checkTag();
  let existing;
  try { existing = JSON.parse(gh('api', `repos/${repository}/releases/tags/${tag}`)); }
  catch (error) {
    let status;
    try { status = JSON.parse(String(error.stdout)).status; } catch { /* Keep network/auth errors fatal. */ }
    if (String(status) !== '404') throw error;
  }
  if (existing) assert.ok(checkTag(), 'Existing release must have a verified remote tag');

  for (const script of ['typecheck', 'build:preview', 'test', 'zip']) {
    console.log(`Running npm run ${script}`);
    const output = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script]);
    if (output) console.log(output);
  }
  const zipPath = join(directory, '.output', asset);
  verifyBuild({ directory, zipPath });
  assert.equal(git('status', '--porcelain'), '', 'Build must not change tracked sources');

  if (!checkTag()) {
    git('push', 'origin', `${expectedSha}:${tagRef}`);
    assert.equal(checkTag(), expectedSha, 'Tag push did not publish the expected commit');
  }
  const temporary = mkdtempSync(join(tmpdir(), 'pagetime-release-'));
  try {
    const notesPath = join(temporary, 'notes.md');
    writeFileSync(notesPath, `${notes}\n\nSource commit: ${expectedSha}\n`);
    if (!existing) {
      gh('release', 'create', tag, '--repo', repository, '--verify-tag', '--draft', '--title', tag, '--notes-file', notesPath);
    }
    const uploaded = existing?.assets?.find(item => item.name === asset);
    if (uploaded) {
      assert.equal(uploaded.state, 'uploaded', 'Existing ZIP upload is incomplete');
      gh('release', 'download', tag, '--repo', repository, '--pattern', asset, '--dir', temporary);
      verifyBuild({ directory, zipPath: join(temporary, asset) });
      sameArchive(zipPath, join(temporary, asset));
    } else {
      gh('release', 'upload', tag, zipPath, '--repo', repository);
    }
    const complete = JSON.parse(gh('api', `repos/${repository}/releases/tags/${tag}`));
    assert.ok(complete.assets.some(item => item.name === asset && item.state === 'uploaded' && item.size > 0), 'ZIP must be uploaded before publication');
    assert.equal(checkTag(), expectedSha, 'Tag changed during release');
    if (!existing || existing.draft) gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest');
    console.log(`Verified release: https://github.com/${repository}/releases/tag/${tag}`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) release();
