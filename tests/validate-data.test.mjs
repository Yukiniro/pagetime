import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankData } from '../src/model.mjs';
import { validateData } from '../src/validate-data.mjs';

test('valid existing data is returned unchanged, including IPv6 and zero timestamps', () => {
  const data = { visits: [{ domain: '[::1]', at: 0 }], spans: [{ domain: 'xn--fsqu00a.xn--0zwm56d', start: 0, end: 1 }], enabled: false, since: 0 };
  assert.equal(validateData(data), data);
});

test('missing fields, invalid timestamps, sensitive URLs and invalid spans are rejected', () => {
  for (const value of [null, [], {}, { ...blankData(), enabled: 1 }, { ...blankData(), since: Infinity }, { ...blankData(), since: -1 }, { ...blankData(), since: 9e15 }, { ...blankData(), visits: {} }]) {
    assert.throws(() => validateData(value), /^Error: data$/);
  }
  for (const domain of ['', 'https://example.com', 'example.com/path', 'example.com?secret', 'user@example.com', 'example.com:8080', 'EXAMPLE.COM']) {
    assert.throws(() => validateData({ ...blankData(), visits: [{ domain, at: 1 }] }), /^Error: data$/);
  }
  for (const span of [null, { domain: 'example.com', start: NaN, end: 2 }, { domain: 'example.com', start: 2, end: 1 }, { domain: 'example.com', start: 2, end: 2 }]) {
    assert.throws(() => validateData({ ...blankData(), spans: [span] }), /^Error: data$/);
  }
});
