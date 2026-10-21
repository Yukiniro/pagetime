import { ImportError, parseLedgerBackupPaused } from './import.mjs';

const yieldChunk = () => new Promise(resolve => { setTimeout(resolve); });

/**
 * Reads one backup file and validates it. The dashboard runs this in a worker so
 * `JSON.parse` and the table walk stay off the page thread. Row checks also yield between chunks.
 * @param {Blob} file
 */
export async function backupFromFile(file) {
  let text;
  try { text = await file.text(); }
  catch { throw new ImportError('read'); }
  return parseLedgerBackupPaused(text, yieldChunk);
}

const scope = globalThis;
scope.onmessage = event => {
  void backupFromFile(event.data).then(
    backup => scope.postMessage({ backup }),
    error => scope.postMessage({ code: error instanceof ImportError ? error.code : 'format' }),
  );
};
