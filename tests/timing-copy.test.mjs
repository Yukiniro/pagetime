import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CHECKPOINT_SECONDS, GAP_LIMIT_MS, IDLE_SECONDS, LIMIT, RETENTION_DAYS, timingCopy } from '../src/model.mjs';

const root = new URL('../', import.meta.url);
const fill = (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => values[key]);
const literalNumbers = [IDLE_SECONDS, CHECKPOINT_SECONDS, GAP_LIMIT_MS / 1000, RETENTION_DAYS, LIMIT]
  .flatMap(value => [String(value), value.toLocaleString('en-US')]);

test('timing copy interpolates model constants and does not hardcode them', async () => {
  assert.deepEqual(timingCopy(), {
    idle: IDLE_SECONDS,
    checkpoint: CHECKPOINT_SECONDS,
    gap: GAP_LIMIT_MS / 1000,
    days: RETENTION_DAYS,
    limit: LIMIT,
    countAudible: true,
  });
  const custom = timingCopy({ schema: 1, idleSeconds: 300, countAudible: false });
  assert.equal(custom.idle, 300);
  assert.equal(custom.countAudible, false);
  assert.equal(timingCopy({ idleSeconds: 15, countAudible: 'yes' }).idle, IDLE_SECONDS);
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
    const defaults = timingCopy();
    assert.match(fill(json.howItWorks.notCounted.idle_other, { count: defaults.idle }), new RegExp(String(defaults.idle)));
    assert.match(fill(json.howItWorks.notCounted.gap_other, { count: defaults.gap }), new RegExp(String(defaults.gap)));
    const retention = fill(json.howItWorks.privacy.retention_other, { count: defaults.days, limit: defaults.limit });
    assert.match(retention, new RegExp(String(defaults.days)));
    assert.match(retention, new RegExp(String(defaults.limit)));
    assert.match(fill(json.howItWorks.privacy.save_other, { count: defaults.checkpoint }), new RegExp(String(defaults.checkpoint)));
    const method = fill(json.settings.method.description, defaults);
    for (const value of [defaults.idle, defaults.checkpoint, defaults.days, defaults.limit]) {
      assert.match(method, new RegExp(String(value)));
    }
    const changed = timingCopy({ schema: 1, idleSeconds: 600, countAudible: true });
    assert.match(fill(json.settings.method.description, changed), new RegExp(String(changed.idle)));
    assert.match(fill(json.howItWorks.notCounted.idle_other, { count: changed.idle }), new RegExp(String(changed.idle)));
    assert.equal(json.settings.method.description.includes('600'), false);
    assert.ok(json.settings.method.audible.trim());
    assert.ok(json.howItWorks.limits.audible.trim());
    assert.ok(json.howItWorks.limits.threshold.trim());
  }
  const background = await fs.readFile(new URL('entrypoints/background.ts', root), 'utf8');
  const dialog = await fs.readFile(new URL('src/HowItWorksDialog.jsx', root), 'utf8');
  const app = await fs.readFile(new URL('src/App.jsx', root), 'utf8');
  assert.match(background, /queryState\(settings\.idleSeconds\)/);
  assert.match(background, /setDetectionInterval\(settings\.idleSeconds\)/);
  assert.match(background, /CHECKPOINT_SECONDS \/ 60/);
  assert.match(dialog, /timingCopy\(settings\)/);
  assert.match(dialog, /copy\.countAudible/);
  for (const key of ['idle', 'gap', 'days', 'limit', 'checkpoint']) assert.match(dialog, new RegExp(`copy\\.${key}`));
  assert.match(app, /timingCopy\(settings\)/);
  assert.doesNotMatch(dialog, /\b(60|30|90_000|20_000)\b/);
  assert.doesNotMatch(background, /queryState\(\d|setDetectionInterval\(\d|periodInMinutes:\s*0\.5/);
});
