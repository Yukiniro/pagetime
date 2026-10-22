import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = path => readFileSync(join(root, path), 'utf8');

test('the export journey finds Export above the remaining clear controls', () => {
  const journey = text('.cursor/skills/verify-pagetime/features/export.md');
  assert.match(journey, /Export data`, above `Clear all records` and the button `Clear data`/);
  assert.doesNotMatch(journey, /Delete one day's records|Delete this day|Date to delete|deleteDay/);
});
