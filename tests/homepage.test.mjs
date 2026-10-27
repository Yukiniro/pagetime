import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const client = new URL('../dist/client/', import.meta.url);

test('preview ships an independent homepage, dashboard and bilingual product images', async () => {
  const entries = [];
  for (const name of ['home.html', 'index.html']) {
    const html = await readFile(new URL(name, client), 'utf8');
    assert.match(html, /id="root"/);
    const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)[1];
    await access(new URL(`.${entry}`, client));
    entries.push(entry);
  }
  assert.notEqual(entries[0], entries[1], 'The website must not replace the dashboard entry');
  const code = await readFile(new URL(`.${entries[0]}`, client), 'utf8');
  const images = [...code.matchAll(/"(\/assets\/[^"\s]+\.webp)"/g)].map(match => match[1]);
  assert.equal(images.length, 3, 'Chinese and English dashboards and the shared timeline must be packaged');
  assert.ok(images.some(path => /\/dashboard-en-/.test(path)), 'The English product image is available');
  assert.ok(images.some(path => /\/dashboard-(?!en-)/.test(path)), 'The Chinese product image is available');
  for (const path of images) {
    const image = await readFile(new URL(`.${path}`, client));
    assert.equal(image.toString('ascii', 0, 4), 'RIFF');
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  }
});


test('all frontend component filenames use kebab-case', async () => {
  for (const dir of ['src', 'entrypoints', 'website']) {
    const files = await readdir(new URL(`../${dir}/`, import.meta.url), { recursive: true });
    for (const file of files.filter(name => /\.[jt]sx$/.test(name))) {
      assert.match(file.split('/').at(-1), /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[jt]sx$/, file);
    }
  }
});
