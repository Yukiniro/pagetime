import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const zipName = ({ name, version }) => `${name}-${version}-chrome.zip`;
export const readArchive = path => unzipSync(readFileSync(path));
export const NETWORK_API = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b/;

export function verifyFiles(read, { version, locales }) {
  const json = path => JSON.parse(Buffer.from(read(path)).toString('utf8'));
  const manifest = json('manifest.json');
  assert.match(version, /^\d+\.\d+\.\d+$/, 'Release versions must be stable x.y.z versions');
  assert.ok(version.split('.').every(part => Number(part) <= 65535), 'Chrome version components must be <= 65535');
  assert.equal(manifest.version, version, 'Manifest and package versions must match');
  if (manifest.version_name) assert.equal(manifest.version_name, version);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'PageTime');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.incognito, 'not_allowed');
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'idle', 'storage', 'tabs', 'webNavigation'].sort());
  assert.equal(manifest.host_permissions?.length ?? 0, 0, 'No host permissions');
  assert.equal(manifest.content_scripts?.length ?? 0, 0, 'No content scripts');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.ok(manifest.background.service_worker);

  const file = path => {
    assert.ok(typeof path === 'string' && path && !path.startsWith('/') && !path.split('/').includes('..') && !path.includes(':'), `Unsafe artifact path: ${path}`);
    const bytes = Buffer.from(read(path));
    assert.ok(bytes.length, `Missing/empty artifact: ${path}`);
    return bytes;
  };
  assert.doesNotMatch(file(manifest.background.service_worker).toString('utf8'), NETWORK_API, 'The background makes no network request');
  const parser = file('import-parse-worker.js').toString('utf8');
  assert.match(parser, /JSON\.parse/, 'Restore parses JSON in the extension worker');
  assert.doesNotMatch(parser, NETWORK_API, 'The restore worker makes no network request');
  for (const page of ['dashboard.html', 'popup.html']) {
    const html = file(page).toString('utf8');
    for (const [, path] of html.matchAll(/(?:src|href)="([^"]+)"/g)) file(path.replace(/^\//, ''));
  }
  assert.deepEqual(Object.keys(manifest.icons).sort(), ['16', '32', '48', '96', '128'].sort());
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = file(path);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
  const names = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map(match => match[1]);
  assert.ok(names.includes('extDescription') && names.includes('actionTitle'));
  for (const [locale, expected] of Object.entries(locales)) {
    const messages = json(`_locales/${locale}/messages.json`);
    assert.deepEqual(messages, expected, `${locale}: packaged translations differ from source`);
    for (const name of names) assert.ok(messages[name]?.message?.trim(), `${locale}: ${name}`);
  }
  return manifest;
}

export function verifyBuild({ directory = root, zipPath } = {}) {
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const codes = readdirSync(join(directory, 'src/locales')).map(name => name.replace(/\.json$/, '').replace('-', '_'));
  const locales = Object.fromEntries(codes.map(code => [code, JSON.parse(readFileSync(join(directory, 'public/_locales', code, 'messages.json'), 'utf8'))]));
  const archive = zipPath ? readArchive(zipPath) : null;
  if (archive) for (const name of Object.keys(archive)) {
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..') && !name.includes('\\'), `Unsafe ZIP entry: ${name}`);
  }
  const read = archive
    ? path => { assert.ok(archive[path], `Missing ZIP entry: ${path}`); return archive[path]; }
    : path => readFileSync(join(directory, '.output/chrome-mv3', path));
  return verifyFiles(read, { version: pkg.version, locales });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const zipIndex = process.argv.indexOf('--zip');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const zipPath = zipIndex < 0 ? undefined : resolve(root, process.argv[zipIndex + 1] ?? join('.output', zipName(pkg)));
  verifyBuild({ zipPath });
  console.log(`Verified PageTime ${pkg.version}: MV3, permissions, dashboard, icons and all locales${zipPath ? ' inside ZIP' : ''}.`);
}
