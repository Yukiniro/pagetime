import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainOf } from '../src/model.mjs';
import { HOST_MAX, IGNORED_LIMIT, isIgnored, normalizeHost, validateSettings } from '../src/settings.mjs';

const host253 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;

test('normalizeHost strips protocol, path, port, and surrounding space, and lowercases', () => {
  assert.equal(normalizeHost('https://Mail.Example.com/inbox'), 'mail.example.com');
  assert.equal(normalizeHost('https://Mail.Example.com:8443/inbox'), 'mail.example.com');
  assert.equal(normalizeHost('  Mail.Example.com  '), 'mail.example.com');
  assert.equal(normalizeHost('mail.example.com:8443'), 'mail.example.com');
  assert.equal(normalizeHost('//mail.example.com/a'), 'mail.example.com');
  assert.equal(normalizeHost('https://user:pass@Mail.Example.com/a?b=1#c'), 'mail.example.com');
  assert.equal(normalizeHost('example.com/inbox'), 'example.com');
});

test('normalizeHost rejects empty input, spaces, names without a dot, and wildcards', () => {
  assert.equal(normalizeHost(''), null);
  assert.equal(normalizeHost('   '), null);
  assert.equal(normalizeHost('mail .example.com'), null);
  assert.equal(normalizeHost('intranet'), null);
  assert.equal(normalizeHost('com'), null);
  assert.equal(normalizeHost('*.example.com'), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost('HTTP://LocalHost:3000/a'), 'localhost');
});

test('normalizeHost strips one trailing dot and canonicalizes IDN to the same punycode as the ledger', () => {
  assert.equal(normalizeHost('Example.COM.'), 'example.com');
  assert.equal(normalizeHost('https://example.com./path'), 'example.com');
  assert.equal(normalizeHost('example.com..'), null);
  assert.equal(normalizeHost('https://münchen.de/path'), 'xn--mnchen-3ya.de');
  assert.equal(normalizeHost('xn--mnchen-3ya.de'), 'xn--mnchen-3ya.de');
  assert.equal(normalizeHost('https://例子.测试/a'), normalizeHost('xn--fsqu00a.xn--0zwm56d'));
});

test('normalizeHost accepts IPv4 and IPv6 literals and rejects subnets', () => {
  assert.equal(normalizeHost('http://192.168.1.10:8080/a'), '192.168.1.10');
  assert.equal(normalizeHost('127.000.000.001'), '127.0.0.1');
  assert.equal(normalizeHost('999.999.999.999'), null);
  assert.equal(normalizeHost('10.0.0.0/8'), null);
  assert.equal(normalizeHost('192.168.0.1/24'), null);
  assert.equal(normalizeHost('https://192.168.0.1/24'), null);
  assert.equal(normalizeHost('2001:db8::/32'), null);
  const v6 = normalizeHost('https://[2001:DB8::1]/x');
  assert.equal(v6, normalizeHost('2001:DB8::1'));
  assert.equal(v6, normalizeHost('[2001:db8::1]:443'));
  assert.equal(normalizeHost('::1'), normalizeHost('[::1]'));
  assert.equal(host253.length, HOST_MAX);
  assert.equal(normalizeHost(host253), host253);
  assert.equal(normalizeHost(`${host253.slice(0, -1)}ee`), null);
});

test('isIgnored matches a host and its subdomains, not a parent or a lookalike', () => {
  assert.equal(isIgnored('example.com', ['example.com']), true);
  assert.equal(isIgnored('a.example.com', ['example.com']), true);
  assert.equal(isIgnored('a.b.example.com', ['Example.COM']), true);
  assert.equal(isIgnored('Mail.Example.com', ['example.com']), true);
  assert.equal(isIgnored('example.com.', ['example.com']), true);
  assert.equal(isIgnored('example.com', ['mail.example.com']), false);
  assert.equal(isIgnored('notexample.com', ['example.com']), false);
  assert.equal(isIgnored('example.com.evil.com', ['example.com']), false);
  assert.equal(isIgnored('xn--mnchen-3ya.de', ['münchen.de']), true);
  assert.equal(isIgnored('10.1.2.3', ['1.2.3']), false);
  assert.equal(isIgnored('192.168.1.10', ['192.168.1.10']), true);
  assert.equal(isIgnored(null, ['example.com']), false);
  assert.equal(isIgnored('example.com', null), false);
});

test('ignored entries use the same host the ledger stores', () => {
  const page = 'https://Mail.Example.com:8443/inbox?x=1';
  assert.equal(isIgnored(domainOf(page), [normalizeHost(page)]), true);
  const idn = 'https://münchen.de/a';
  assert.equal(isIgnored(domainOf(idn), [normalizeHost('xn--mnchen-3ya.de')]), true);
  const ip = 'https://[2001:DB8::1]/a';
  assert.equal(isIgnored(domainOf(ip), [normalizeHost('2001:db8::1')]), true);
  assert.equal(domainOf('https://example.com./path'), 'example.com.');
  assert.equal(isIgnored(domainOf('https://example.com./path'), ['example.com']), true);
});

test('validateSettings keeps schema 1, filters invalid hosts, dedupes, and caps the list', () => {
  assert.equal(IGNORED_LIMIT, 500);
  assert.equal(HOST_MAX, 253);
  assert.deepEqual(validateSettings(undefined), { schema: 1, idleSeconds: 60, countAudible: true, ignored: [] });
  assert.deepEqual(validateSettings({ ignored: 'example.com' }).ignored, []);
  assert.deepEqual(validateSettings({
    schema: 1,
    idleSeconds: 300,
    countAudible: false,
    ignored: ['https://Mail.Example.com/inbox', 'mail.example.com', 'nope', '  ', 'localhost', 'com', '192.168.0.0/16', '::1', 3],
  }), {
    schema: 1,
    idleSeconds: 300,
    countAudible: false,
    ignored: ['mail.example.com', 'localhost', normalizeHost('::1')],
  });
  assert.deepEqual(validateSettings({ ignored: ['Example.com', 'example.com'] }).ignored, ['example.com']);
  const many = Array.from({ length: IGNORED_LIMIT + 20 }, (_, index) => `a${index}.example.com`);
  const capped = validateSettings({ ignored: many }).ignored;
  assert.equal(capped.length, IGNORED_LIMIT);
  assert.equal(capped[0], 'a0.example.com');
  assert.equal(capped.at(-1), `a${IGNORED_LIMIT - 1}.example.com`);
  assert.deepEqual(validateSettings({ schema: 9, idleSeconds: 15, countAudible: 'yes', ignored: ['ok.com'] }), {
    schema: 1,
    idleSeconds: 60,
    countAudible: true,
    ignored: ['ok.com'],
  });
});
