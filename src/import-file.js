import { command, isExtension } from './data.js';
import { ImportError, parseLedgerBackupPaused } from './import.mjs';

// Between row chunks, after the worker has parsed the file.
const yieldChunk = () => new Promise(resolve => { setTimeout(resolve); });

/**
 * Reads a local JSON file and asks the background to overwrite the ledger.
 * The worker parses the file. Row checks run here and yield between chunks,
 * so a large file does not freeze the dashboard.
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
  const worker = new Worker(new URL('import-parse-worker.js', location.href));
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
      void accept(event.data);
    };
    worker.onerror = () => finish(new ImportError('save'));
    worker.postMessage(file);

    async function accept(data) {
      try {
        if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'value')) {
          finish(null, await parseLedgerBackupPaused(data.value, yieldChunk));
          return;
        }
        const code = typeof data?.code === 'string' && data.code ? data.code : 'format';
        finish(new ImportError(code));
      } catch (error) {
        finish(error instanceof ImportError ? error : new ImportError('format'));
      }
    }
  });
}
