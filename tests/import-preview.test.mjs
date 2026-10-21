import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { protocol: 'http:' };
const writes = [];
globalThis.localStorage = {
  getItem() { throw new Error('read'); },
  setItem() { writes.push('set'); },
  removeItem() { writes.push('remove'); },
};

const { command } = await import('../src/data.js');
const { restoreBackupFile } = await import('../src/import-file.js');

test('preview restore refuses the file and does not write preview storage', async () => {
  await assert.rejects(
    restoreBackupFile({ text: async () => { throw new Error('should not read'); } }),
    error => error.code === 'preview',
  );
  await assert.rejects(command('restore', { backup: { format: 'pagetime-ledger' } }), /preview/);
  assert.deepEqual(writes, []);
});
