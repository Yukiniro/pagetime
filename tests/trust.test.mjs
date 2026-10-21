import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { LEDGER_NAME } from '../src/ledger.mjs';
import { DETAIL_DAYS } from '../src/model.mjs';
import { NETWORK_API } from '../scripts/verify-build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = path => readFileSync(join(root, path), 'utf8');

test('LICENSE is the verbatim Apache 2.0 text and NOTICE names the copyright holder', () => {
  const license = readFileSync(join(root, 'LICENSE'));
  assert.equal(createHash('sha256').update(license).digest('hex'), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
  assert.match(text('NOTICE'), /Copyright 2026 Yukiniro/);
  assert.equal(JSON.parse(text('package.json')).license, 'Apache-2.0');
});

test('privacy notes name the stored fields, storage areas, and model constants', () => {
  for (const path of ['PRIVACY.md', 'PRIVACY.zh-CN.md']) {
    const note = text(path).replaceAll(',', '');
    assert.match(note, /IndexedDB/);
    assert.match(note, new RegExp(LEDGER_NAME));
    assert.match(note, /chrome\.storage\.local/);
    assert.match(note, /chrome\.storage\.session/);
    assert.match(note, /DETAIL_DAYS/);
    assert.match(note, new RegExp(`\\b${DETAIL_DAYS}\\b`));
    for (const name of ['domains', 'days', 'hours', 'spans', 'visits', 'meta', 'ledgerError', 'session', 'data']) assert.match(note, new RegExp(`\`${name}\``));
    assert.match(note, /hostname|主机名/);
  }
});

test('the ledger has no sync or cloud package', () => {
  for (const path of ['package.json', 'package-lock.json']) assert.doesNotMatch(text(path), /dexie-cloud/i, path);
});

async function bundle(entry) {
  const output = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: join(root, entry), formats: ['es'], fileName: 'bundle' },
      rollupOptions: { external: [/^react(-dom)?(\/|$)/] },
    },
  });
  return [output].flat().flatMap(result => result.output).map(chunk => chunk.code ?? '').join('\n');
}

test('the bundled storage layer makes no network request', async () => {
  for (const entry of ['entrypoints/background.ts', 'src/use-ledger.js']) {
    const code = await bundle(entry);
    assert.match(code, new RegExp(LEDGER_NAME), `${entry} bundles the ledger`);
    assert.match(code, /DatabaseClosed/, `${entry} bundles Dexie`);
    assert.doesNotMatch(code, NETWORK_API, entry);
  }
});

test('the bundled export path builds the file in the page: no network request and no downloads API', async () => {
  const code = await bundle('src/export-file.js');
  assert.match(code, new RegExp(LEDGER_NAME), 'the export path bundles the ledger');
  assert.match(code, /DatabaseClosed/, 'the export path bundles Dexie');
  assert.match(code, /createObjectURL/, 'the file is a local blob URL');
  assert.match(code, /\bdownload\b/, 'the file is saved through a download link');
  assert.doesNotMatch(code, NETWORK_API);
  assert.doesNotMatch(code, /\.downloads\b|\bdownloads\.download\b/);
});

test('the bundled restore path reads a local file and makes no network request', async () => {
  const code = await bundle('src/import-file.js');
  assert.match(code, /pagetime-ledger/);
  assert.match(code, /schemaVersion/);
  assert.doesNotMatch(code, NETWORK_API);
  assert.doesNotMatch(code, /\.downloads\b|\bdownloads\.download\b/);
  assert.doesNotMatch(code, /content_scripts|executeScript/);
});

test('permission notes match wxt.config.ts and state the install warning', () => {
  const listed = [...text('wxt.config.ts').match(/permissions:\s*\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(listed, ['storage', 'tabs', 'webNavigation', 'idle', 'alarms']);
  for (const path of ['docs/permissions.md', 'docs/permissions.zh-CN.md']) {
    const note = text(path);
    for (const permission of listed) assert.match(note, new RegExp(`\`${permission}\``));
    assert.match(note, /Read your browsing history/);
    assert.match(note, /host permission|host_permissions/);
    assert.match(note, /content script|content_scripts/);
    assert.match(note, /no host permission|没有 host permission/i);
    assert.match(note, /no content script|没有 content script/i);
  }
});
