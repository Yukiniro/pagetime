import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { popupStatus, recordableHost, siteListStatus, toggleListedHost } from '../src/popup-model.mjs';
import { shouldRecord, validateSettings } from '../src/settings.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'];

const blacklist = (ignored, allowed = []) => validateSettings({ recordMode: 'blacklist', ignored, allowed });
const whitelist = (allowed, ignored = []) => validateSettings({ recordMode: 'whitelist', allowed, ignored });

test('blacklist: an ignored host, or a host under an ignored parent, is not timing', () => {
  const settings = blacklist(['example.com']);
  assert.equal(siteListStatus(settings, 'example.com'), 'siteIgnored');
  assert.equal(siteListStatus(settings, 'mail.example.com'), 'siteIgnored');
  assert.equal(siteListStatus(settings, 'other.test'), null);
  assert.equal(siteListStatus(blacklist([], ['example.com']), 'example.com'), null);
});

test('whitelist: a host outside the allowed list is not timing, an empty list excludes everything', () => {
  assert.equal(siteListStatus(whitelist(['example.com']), 'mail.example.com'), null);
  assert.equal(siteListStatus(whitelist(['example.com']), 'other.test'), 'siteNotAllowed');
  assert.equal(siteListStatus(whitelist([]), 'other.test'), 'siteNotAllowed');
  assert.equal(siteListStatus(whitelist([], ['other.test']), 'other.test'), 'siteNotAllowed');
});

test('the status is the same truth as shouldRecord for every recordable host', () => {
  const hosts = ['example.com', 'mail.example.com', 'www.example.com', 'other.test', '127.0.0.1', 'localhost'];
  const modes = [blacklist(['example.com', '127.0.0.1']), blacklist([]), whitelist(['example.com', 'localhost']), whitelist([])];
  for (const settings of modes) {
    for (const host of hosts) {
      assert.equal(siteListStatus(settings, host) === null, shouldRecord(host, settings), `${settings.recordMode} ${host}`);
    }
  }
});

test('a page without a recordable hostname never gets list copy, even when every list would exclude it', () => {
  for (const url of ['chrome://newtab/', 'about:blank', 'edge://settings', 'chrome-extension://abc/popup.html', 'file:///tmp/a.html', '']) {
    const host = recordableHost(url);
    assert.equal(host, null);
    for (const settings of [whitelist([]), blacklist(['example.com'])]) {
      assert.equal(siteListStatus(settings, host), null);
      assert.equal(popupStatus(true, settings, host), 'recording');
      assert.equal(popupStatus(false, settings, host), 'paused');
    }
  }
});

test('priority: global pause wins, then the site list, then recording', () => {
  const excluded = blacklist(['example.com']);
  assert.equal(popupStatus(false, excluded, 'example.com'), 'paused');
  assert.equal(popupStatus(true, excluded, 'example.com'), 'siteIgnored');
  assert.equal(popupStatus(true, whitelist([]), 'example.com'), 'siteNotAllowed');
  assert.equal(popupStatus(true, excluded, 'other.test'), 'recording');
  assert.equal(popupStatus(false, excluded, 'other.test'), 'paused');
});

test('undoing the list click returns the status to recording in both modes', () => {
  const ignored = blacklist(toggleListedHost([], 'example.com'));
  assert.equal(popupStatus(true, ignored, 'example.com'), 'siteIgnored');
  const restored = { ...ignored, ignored: toggleListedHost(ignored.ignored, 'example.com') };
  assert.equal(popupStatus(true, restored, 'example.com'), 'recording');

  const empty = whitelist([]);
  assert.equal(popupStatus(true, empty, 'example.com'), 'siteNotAllowed');
  const allowed = { ...empty, allowed: toggleListedHost(empty.allowed, 'example.com') };
  assert.equal(popupStatus(true, allowed, 'example.com'), 'recording');
});

test('the popup renders the status from popupStatus and the copy exists in every locale', () => {
  const popup = read('src/Popup.jsx');
  assert.match(popup, /popupStatus\(enabled, settings, host\)/);
  assert.match(popup, /t\(`status\.\$\{status\}`\)/);
  for (const locale of locales) {
    const status = JSON.parse(read(`src/locales/${locale}.json`)).status;
    for (const key of ['recording', 'paused', 'siteIgnored', 'siteNotAllowed']) {
      assert.equal(typeof status[key], 'string', `${locale} status.${key}`);
      assert.ok(status[key].length > 0);
    }
    assert.notEqual(status.siteIgnored, status.siteNotAllowed, locale);
  }
});
