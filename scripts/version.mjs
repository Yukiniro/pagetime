import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function syncLockVersion(directory = root) {
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const path = join(directory, 'package-lock.json');
  const text = readFileSync(path, 'utf8');
  const lock = JSON.parse(text);
  assert.equal(lock.name, pkg.name);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.deepEqual(lock.packages[''][field] ?? {}, pkg[field] ?? {}, `Dependency changes belong in a business PR: ${field}`);
  }
  // A version PR changes version metadata only; keep the reviewed dependency graph.
  lock.version = pkg.version;
  lock.packages[''].version = pkg.version;
  const output = JSON.stringify(lock, null, 2) + '\n';
  writeFileSync(path, text.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('@changesets/cli/bin.js')), 'version'], { cwd: root, stdio: 'inherit' });
  syncLockVersion();
}
