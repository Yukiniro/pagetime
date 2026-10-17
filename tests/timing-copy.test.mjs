import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHECKPOINT_SECONDS, GAP_LIMIT_MS, IDLE_SECONDS, LIMIT, RETENTION_DAYS, timingCopy } from '../src/model.mjs';

const root = new URL('../', import.meta.url);
const fill = (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => values[key]);
const literalNumbers = [IDLE_SECONDS, CHECKPOINT_SECONDS, GAP_LIMIT_MS / 1000, RETENTION_DAYS, LIMIT]
  .flatMap(value => [String(value), value.toLocaleString('en-US')]);

test('timing copy interpolates model constants and does not hardcode them', async () => {
  assert.deepEqual(timingCopy, {
    idle: IDLE_SECONDS,
    checkpoint: CHECKPOINT_SECONDS,
    gap: GAP_LIMIT_MS / 1000,
    days: RETENTION_DAYS,
    limit: LIMIT,
  });
  const files = await fs.readdir(new URL('src/locales/', root));
  for (const file of files) {
    const json = JSON.parse(await fs.readFile(new URL(`src/locales/${file}`, root), 'utf8'));
    const templates = [
      json.settings.method.description,
      json.howItWorks.notCounted.idle_other,
      json.howItWorks.notCounted.gap_other,
      json.howItWorks.privacy.retention_other,
      json.howItWorks.privacy.save_other,
    ];
    for (const template of templates) {
      for (const literal of literalNumbers) assert.equal(template.includes(literal), false, `${file} hardcodes ${literal}`);
    }
    assert.match(fill(json.howItWorks.notCounted.idle_other, { count: timingCopy.idle }), new RegExp(String(timingCopy.idle)));
    assert.match(fill(json.howItWorks.notCounted.gap_other, { count: timingCopy.gap }), new RegExp(String(timingCopy.gap)));
    const retention = fill(json.howItWorks.privacy.retention_other, { count: timingCopy.days, limit: timingCopy.limit });
    assert.match(retention, new RegExp(String(timingCopy.days)));
    assert.match(retention, new RegExp(String(timingCopy.limit)));
    assert.match(fill(json.howItWorks.privacy.save_other, { count: timingCopy.checkpoint }), new RegExp(String(timingCopy.checkpoint)));
    const method = fill(json.settings.method.description, timingCopy);
    for (const value of [timingCopy.idle, timingCopy.checkpoint, timingCopy.days, timingCopy.limit]) {
      assert.match(method, new RegExp(String(value)));
    }
  }
  const background = await fs.readFile(new URL('entrypoints/background.ts', root), 'utf8');
  const dialog = await fs.readFile(new URL('src/HowItWorksDialog.jsx', root), 'utf8');
  assert.match(background, /queryState\(IDLE_SECONDS\)/);
  assert.match(background, /setDetectionInterval\(IDLE_SECONDS\)/);
  assert.match(background, /CHECKPOINT_SECONDS \/ 60/);
  assert.match(dialog, /timingCopy\.idle/);
  assert.match(dialog, /timingCopy\.gap/);
  assert.match(dialog, /timingCopy\.days/);
  assert.match(dialog, /timingCopy\.limit/);
  assert.match(dialog, /timingCopy\.checkpoint/);
  assert.doesNotMatch(dialog, /\b(60|30|90_000|20_000)\b/);
  assert.doesNotMatch(background, /queryState\(\d|setDetectionInterval\(\d|periodInMinutes:\s*0\.5/);
});
