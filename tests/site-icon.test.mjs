import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAVICON_MISS_HOST, bytesEqual, cachedFaviconSrc, faviconCacheUrl, iconPageHost, iconRequest, isIconHost, localIconPath,
} from '../src/site-icon.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = path => readFileSync(join(root, path), 'utf8');
const getURL = path => `chrome-extension://abc${path}`;
const urlFor = host => faviconCacheUrl(host, getURL);

test('a known site keeps its packaged SVG and does not ask for _favicon', () => {
  let called = false;
  const request = iconRequest({
    localName: 'github.com',
    extension: true,
    host: 'github.com',
    getURL: () => { called = true; return ''; },
  });
  assert.deepEqual(request, { src: './assets/github.com.svg', probe: false });
  assert.equal(called, false);
  assert.equal(localIconPath('wxt.dev'), './assets/wxt.dev.svg');
  assert.equal(localIconPath(''), '');
});

test('the preview never builds a _favicon URL', () => {
  let called = false;
  const request = iconRequest({
    localName: '',
    extension: false,
    host: 'dash.cloudflare.com',
    getURL: () => { called = true; return ''; },
  });
  assert.deepEqual(request, { src: '', probe: false });
  assert.equal(called, false);
});

test('the extension favicon URL uses the merged host, https, and size 32', () => {
  assert.equal(iconPageHost('www.cutoo.ai', 'cutoo.ai'), 'cutoo.ai');
  assert.equal(iconPageHost('dash.cloudflare.com', 'dash.cloudflare.com'), 'dash.cloudflare.com');
  assert.equal(iconPageHost('www.youtube.com', 'youtube.com'), 'youtube.com');
  assert.equal(
    urlFor('dash.cloudflare.com'),
    'chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fdash.cloudflare.com&size=32',
  );
  const request = iconRequest({ localName: '', extension: true, host: 'chrome.google.com', getURL });
  assert.equal(request.probe, true);
  assert.equal(request.src, urlFor('chrome.google.com'));
  assert.match(decodeURIComponent(urlFor('例子.中国')), /pageUrl=https:\/\/例子\.中国/);
  assert.match(urlFor('YouTube.com'), /pageUrl=https%3A%2F%2FYouTube\.com/);
});

test('a favicon URL is not built from a full URL, a path, or an empty host', () => {
  for (const host of ['', 'https://evil.example', 'evil.example/favicon.ico', 'user:pass@evil.example', 'evil.example?q=1', 'has space.example']) {
    assert.equal(isIconHost(host), false, host);
    assert.equal(faviconCacheUrl(host, getURL), '', host);
  }
});

test('a cached bitmap that differs from the generic icon is shown, and a miss or error falls back', async () => {
  const real = new Uint8Array([1, 2, 3, 4]);
  const generic = new Uint8Array([9, 9, 9, 9]);
  const table = new Map([
    [urlFor('dash.cloudflare.com'), real],
    [urlFor('cutoo.ai'), generic],
    [urlFor('tinyowl.app'), null],
    [urlFor(FAVICON_MISS_HOST), generic],
  ]);
  const load = async src => table.has(src) ? table.get(src) : null;
  assert.equal(await cachedFaviconSrc('dash.cloudflare.com', getURL, load), urlFor('dash.cloudflare.com'));
  assert.equal(await cachedFaviconSrc('cutoo.ai', getURL, load), '');
  assert.equal(await cachedFaviconSrc('tinyowl.app', getURL, load), '');
  assert.equal(await cachedFaviconSrc('not a host', getURL, load), '');
  assert.equal(bytesEqual(real, generic), false);
  assert.equal(bytesEqual(generic, generic), true);
});

test('an unreadable generic icon does not hide a real favicon, and a thrown load still returns the cache URL', async () => {
  const real = new Uint8Array([4, 5, 6, 7]);
  assert.equal(await cachedFaviconSrc('partner.microsoft.com', getURL, async src => src.includes('partner.microsoft.com') ? real : null), urlFor('partner.microsoft.com'));
  assert.equal(await cachedFaviconSrc('evercut.ai', getURL, async () => { throw new Error('decode'); }), urlFor('evercut.ai'));
});

test('SiteIcon keeps the globe fallback and does not fetch remote icons', () => {
  const source = text('src/SiteIcon.jsx');
  assert.match(source, /GlobeHemisphereWest size=\{23\}/);
  assert.match(source, /object-contain/);
  assert.match(source, /isExtension/);
  assert.match(source, /cachedFaviconSrc/);
  assert.match(source, /status === 'error'/);
  assert.doesNotMatch(source, /\bfetch\s*\(|favicon\.ico|google\.com\/s2/);
  assert.match(text('src/site-icon.mjs'), /FAVICON_MISS_HOST/);
});
