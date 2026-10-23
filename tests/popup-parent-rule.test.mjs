import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAction, toggleListedHost } from '../src/popup-model.mjs';
import { IGNORED_LIMIT, isAllowed, isIgnored, shouldRecord, validateSettings } from '../src/settings.mjs';
import { siteOf } from '../src/site.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

function blacklist(ignored, allowed = []) {
  return { recordMode: 'blacklist', ignored, allowed };
}

function whitelist(allowed, ignored = []) {
  return { recordMode: 'whitelist', allowed, ignored };
}

test('a parent blacklist covers the popup host and revoking it records the subdomain again', () => {
  const settings = validateSettings(blacklist(['Example.COM'], ['kept.test']));
  const page = 'https://mail.example.com/inbox?x=1';
  const action = listAction(settings, page);
  assert.equal(action.field, 'ignored');
  assert.equal(action.host, 'example.com');
  assert.equal(action.host.includes('/'), false);
  assert.equal(action.listed, true);
  assert.equal(action.covered, true);
  assert.equal(action.disabled, false);
  assert.equal(action.label, 'ignoreCovered');
  assert.notEqual(action.label, 'ignore');
  assert.equal(action.listed, isIgnored(siteOf('mail.example.com'), settings.ignored));
  assert.equal(shouldRecord('mail.example.com', settings), false);

  const ignored = toggleListedHost(settings.ignored, action.host);
  assert.deepEqual(settings.ignored, ['example.com']);
  assert.deepEqual(settings.allowed, ['kept.test']);
  assert.deepEqual(ignored, []);
  const restored = { ...settings, ignored };
  assert.equal(shouldRecord('mail.example.com', restored), true);
  assert.equal(listAction(restored, 'mail.example.com').label, 'ignore');
  assert.equal(isIgnored(siteOf('mail.example.com'), ignored), false);
});

test('whitelist coverage is the same match, and revoking the parent stops the subdomain', () => {
  const settings = validateSettings(whitelist(['example.com'], ['skip.test']));
  const action = listAction(settings, 'mail.example.com');
  assert.equal(action.field, 'allowed');
  assert.equal(action.host, 'example.com');
  assert.equal(action.covered, true);
  assert.equal(action.label, 'allowCovered');
  assert.equal(action.listed, isAllowed(siteOf('mail.example.com'), settings.allowed));
  assert.equal(shouldRecord('mail.example.com', settings), true);

  const allowed = toggleListedHost(settings.allowed, action.host);
  assert.deepEqual(allowed, []);
  assert.deepEqual(settings.ignored, ['skip.test']);
  const restored = { ...settings, allowed };
  assert.equal(shouldRecord('mail.example.com', restored), false);
  assert.equal(listAction(restored, 'mail.example.com').label, 'allow');
  assert.equal(isAllowed(siteOf('mail.example.com'), allowed), false);
});

test('the other list and a child rule do not cover the current host', () => {
  assert.equal(listAction(blacklist([], ['example.com']), 'mail.example.com').label, 'ignore');
  assert.equal(shouldRecord('mail.example.com', blacklist([], ['example.com'])), true);
  assert.equal(listAction(whitelist([], ['example.com']), 'mail.example.com').label, 'allow');
  assert.equal(shouldRecord('mail.example.com', whitelist([], ['example.com'])), false);
  const child = listAction(blacklist(['mail.example.com']), 'example.com');
  assert.equal(child.covered, false);
  assert.equal(child.label, 'ignore');
  assert.equal(child.listed, isIgnored('example.com', ['mail.example.com']));
  for (const host of ['notexample.com', 'example.com.evil.com', '10.0.0.2']) {
    const action = listAction(blacklist(['example.com', '10.0.0.1']), host);
    assert.equal(action.listed, false, host);
    assert.equal(action.covered, false, host);
    assert.equal(action.label, 'ignore', host);
    assert.equal(isIgnored(host, ['example.com', '10.0.0.1']), false, host);
  }
});

test('an exact entry is removed before the broader parent that still covers the host', () => {
  const settings = blacklist(['example.com', 'mail.example.com']);
  const exact = listAction(settings, 'https://Mail.Example.com/a');
  assert.equal(exact.covered, false);
  assert.equal(exact.label, 'unignore');
  assert.equal(exact.host, 'mail.example.com');
  const afterExact = toggleListedHost(settings.ignored, exact.host);
  assert.deepEqual(afterExact, ['example.com']);
  const parent = listAction({ ...settings, ignored: afterExact }, 'a.mail.example.com');
  assert.equal(parent.covered, true);
  assert.equal(parent.host, 'example.com');
  assert.equal(parent.label, 'ignoreCovered');
  assert.equal(parent.listed, isIgnored(siteOf('a.mail.example.com'), afterExact));
  assert.deepEqual(toggleListedHost(afterExact, parent.host), []);
});

test('a covered host can still revoke its parent when the list is full', () => {
  const ignored = [...Array.from({ length: IGNORED_LIMIT - 1 }, (_, index) => `h${index}.test`), 'example.com'];
  assert.equal(ignored.length, IGNORED_LIMIT);
  const covered = listAction(blacklist(ignored), 'mail.example.com');
  assert.equal(covered.disabled, false);
  assert.equal(covered.label, 'ignoreCovered');
  const revoked = toggleListedHost(ignored, covered.host);
  assert.equal(revoked.includes('example.com'), false);
  assert.equal(revoked.length, IGNORED_LIMIT - 1);
  const open = listAction(blacklist(ignored), 'other.test');
  assert.equal(open.disabled, true);
  assert.equal(open.label, 'ignore');
  assert.equal(toggleListedHost(ignored, open.host), ignored);
});

test('the popup names the covering rule and stays inside the 320px popup', () => {
  const popup = read('src/Popup.jsx');
  const model = read('src/popup-model.mjs');
  assert.match(popup, /data-list-state=\{action\.covered \? 'covered' : action\.listed \? 'listed' : 'open'\}/);
  assert.match(popup, /t\(`popup\.\$\{action\.label\}`, \{ host: action\.host \}\)/);
  assert.match(popup, /toggleListedHost\(current\[action\.field\], action\.host\)/);
  assert.match(model, /ignoreCovered/);
  assert.match(model, /allowCovered/);
  assert.match(model, /coveringHost/);
  assert.doesNotMatch(popup, /content_scripts|executeScript/);
  const css = read('src/popup.css');
  assert.match(css, /width: 320px/);
  assert.match(css, /\.popup-actions \[data-slot="button"\] \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  const app = read('src/App.jsx');
  assert.match(app, /isAllowed\(selected, settings\.allowed\)/);
  assert.match(app, /isIgnored\(selected, settings\.ignored\)/);
});
