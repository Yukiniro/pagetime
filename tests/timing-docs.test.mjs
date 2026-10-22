import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKPOINT_SECONDS, DETAIL_DAYS, GAP_LIMIT_MS, IDLE_SECONDS } from '../src/model.mjs';
import { IDLE_OPTIONS } from '../src/settings.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const docs = { 'docs/timing.md': ['seconds', 'days'], 'docs/timing.zh-CN.md': ['秒', '天'] };

for (const [file, [seconds, days]] of Object.entries(docs)) {
  test(`${file} states the model constants`, () => {
    const text = read(file);
    const stated = (value, unit, name) => assert.match(text, new RegExp(`\\b${value}\\s*${unit}.{1,3}\`${name}\``), `${name} = ${value}`);
    stated(IDLE_SECONDS, seconds, 'IDLE_SECONDS');
    stated(GAP_LIMIT_MS / 1000, seconds, 'GAP_LIMIT_MS');
    stated(CHECKPOINT_SECONDS, seconds, 'CHECKPOINT_SECONDS');
    stated(DETAIL_DAYS, days, 'DETAIL_DAYS');
    const idleLine = text.split('\n').find(line => line.includes('`IDLE_SECONDS`'));
    for (const option of IDLE_OPTIONS) assert.match(idleLine, new RegExp(`\\b${option / 60}\\b`), `idle option ${option}s`);
  });

  test(`${file} says the sleep and lock stretch is credited at most GAP_LIMIT_MS`, () => {
    const line = read(file).split('\n').find(l => l.includes(seconds === 'seconds' ? 'sleeping computer' : '电脑休眠'));
    assert.ok(line, 'sleep bullet exists');
    assert.match(line, new RegExp(`\\b${GAP_LIMIT_MS / 1000}\\s*${seconds}.{1,3}\`GAP_LIMIT_MS\``));
  });

  test(`${file} describes prefix grouping and the raw-hostname rule`, () => {
    const text = read(file);
    for (const needle of ['www.youtube.com', 'm.youtube.com', 'gist.github.com', 'www.', 'mobile.']) assert.ok(text.includes(needle), needle);
    assert.equal(text.includes('Public Suffix List'), false);
    assert.equal(text.includes('ICANN'), false);
  });

  test(`${file} covers the comparison rules and links only to files that exist`, () => {
    const text = read(file);
    assert.match(text, /`since`/);
    for (const [, target] of text.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]*)?\)/g)) {
      assert.ok(fs.existsSync(path.join(path.dirname(new URL(file, root).pathname), target)), `${file} links to ${target}`);
    }
  });
}

test('the English and Chinese timing docs have the same sections', () => {
  const headings = file => read(file).split('\n').filter(line => /^#{2,3} /.test(line)).map(line => line.match(/^#+/)[0]);
  assert.deepEqual(headings('docs/timing.md'), headings('docs/timing.zh-CN.md'));
});
