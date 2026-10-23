import { command, isExtension } from './data.js';
import { backupSummary, ImportError, parseLedgerBackupPaused } from './import.mjs';

// Between row chunks, after the worker has parsed the file.
const yieldChunk = () => new Promise(resolve => { setTimeout(resolve); });

/**
 * Reads and validates a local JSON file without writing anything.
 * The worker parses the file. Row checks run here and yield between chunks,
 * so a large file does not freeze the dashboard.
 * Resolves to the checked backup and its summary; an invalid file rejects with an ImportError.
 * The file never leaves the device. Preview storage is not read or written.
 * @param {Blob} file
 */
export async function readBackupFile(file) {
  if (!isExtension) throw new ImportError('preview');
  return parseInWorker(file);
}

/**
 * Asks the background to overwrite the ledger and settings with a backup from readBackupFile.
 * @param {Awaited<ReturnType<typeof readBackupFile>>['backup']} backup
 */
export async function restoreBackup(backup) {
  if (!isExtension) throw new ImportError('preview');
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
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    worker.onmessage = event => {
      void accept(event.data);
    };
    worker.onerror = () => finish(new ImportError('read'));
    worker.postMessage(file);

    async function accept(data) {
      try {
        if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'value')) {
          const backup = await parseLedgerBackupPaused(data.value, yieldChunk);
          finish(null, { backup, summary: backupSummary(data.value, backup) });
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
