import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, readArchive, verifyBuild, zipName } from './verify-build.mjs';

const repository = 'Yukiniro/pagetime';
export const sumsName = 'SHA256SUMS';

export function checksumFile(filename, bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  return `${hash}  ${filename}\n`;
}

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
  // GET /releases/tags/{tag} omits drafts, so list releases (drafts included) and match tag_name.
  // Any API failure is fatal; absence means the list has no such tag.
  const findRelease = () => {
    const pages = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`));
    const matches = pages.flat().filter(item => item.tag_name === tag);
    assert.ok(matches.length <= 1, `Multiple releases use ${tag}; resolve the duplicates before releasing`);
    return matches[0];
  };
  const existing = findRelease();
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
    const assetOf = name => existing?.assets?.find(item => item.name === name);
    const zipAsset = assetOf(asset);
    let publishedZip = zipPath;
    if (zipAsset) {
      assert.equal(zipAsset.state, 'uploaded', 'Existing ZIP upload is incomplete');
      gh('release', 'download', tag, '--repo', repository, '--pattern', asset, '--dir', temporary);
      publishedZip = join(temporary, asset);
      verifyBuild({ directory, zipPath: publishedZip });
      sameArchive(zipPath, publishedZip);
    }
    // Hash the bytes users download. An existing ZIP is hashed from that download; a rebuild can change timestamps.
    const sumsBody = checksumFile(asset, readFileSync(publishedZip));
    const sumsPath = join(temporary, sumsName);
    writeFileSync(sumsPath, sumsBody);
    const sumsAsset = assetOf(sumsName);
    if (sumsAsset) {
      assert.equal(sumsAsset.state, 'uploaded', 'Existing SHA256SUMS upload is incomplete');
      const sumsDir = join(temporary, 'published-sums');
      mkdirSync(sumsDir);
      gh('release', 'download', tag, '--repo', repository, '--pattern', sumsName, '--dir', sumsDir);
      assert.equal(readFileSync(join(sumsDir, sumsName), 'utf8'), sumsBody, 'Existing SHA256SUMS does not match the published ZIP; refusing to replace it');
    }
    if (!zipAsset) gh('release', 'upload', tag, zipPath, '--repo', repository);
    if (!sumsAsset) gh('release', 'upload', tag, sumsPath, '--repo', repository);
    const complete = findRelease();
    assert.ok(complete, `Release ${tag} must exist before publication`);
    for (const name of [asset, sumsName]) {
      assert.ok(complete.assets.some(item => item.name === name && item.state === 'uploaded' && item.size > 0), `${name} must be uploaded before publication`);
    }
    assert.equal(checkTag(), expectedSha, 'Tag changed during release');
    if (!existing || existing.draft) gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest');
    console.log(`Verified release: https://github.com/${repository}/releases/tag/${tag}`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) release();
