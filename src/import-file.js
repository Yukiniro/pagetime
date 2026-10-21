import { command, isExtension } from './data.js';
import { ImportError } from './import.mjs';

/**
 * Reads a local JSON file and asks the background to overwrite the ledger.
 * Parse and row checks run in a worker, so a large file does not freeze the dashboard.
 * The file never leaves the device. Preview storage is not written.
 * @param {Blob} file
 */
export async function restoreBackupFile(file) {
  if (!isExtension) throw new ImportError('preview');
  const backup = await parseInWorker(file);
  try { await command('restore', { backup }); }
  catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('save');
  }
}

function parseInWorker(file) {
  const worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, backup) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (error) reject(error);
      else resolve(backup);
    };
    worker.onmessage = event => {
      const data = event.data;
      if (data && typeof data === 'object' && data.backup) finish(null, data.backup);
      else finish(new ImportError(typeof data?.code === 'string' && data.code ? data.code : 'format'));
    };
    worker.onerror = () => finish(new ImportError('save'));
    worker.postMessage(file);
  });
}
