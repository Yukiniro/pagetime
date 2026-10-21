import { command, isExtension } from './data.js';
import { ImportError, parseLedgerBackup } from './import.mjs';

// One turn so the page can paint "Restoring…" before the parse occupies the thread.
const yieldFrame = () => new Promise(resolve => setTimeout(resolve));

/**
 * Reads a local JSON file and asks the background to overwrite the ledger.
 * The file never leaves the page. Preview storage is not written.
 * @param {Blob} file
 */
export async function restoreBackupFile(file) {
  if (!isExtension) throw new ImportError('preview');
  let text;
  try { text = await file.text(); }
  catch { throw new ImportError('read'); }
  await yieldFrame();
  const backup = parseLedgerBackup(text);
  try { await command('restore', { backup }); }
  catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('save');
  }
}
