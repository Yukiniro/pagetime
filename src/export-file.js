import { version } from '../package.json';
import { command, isExtension } from './data.js';
import { dailyCsvParts, exportFileName, ledgerExportSummary, ledgerJsonParts, previewSnapshot } from './export.mjs';
import { openLedger, readLedgerSnapshot } from './ledger.mjs';

const TYPES = { json: 'application/json', csv: 'text/csv;charset=utf-8' };
const FRAME_MS = 40;
// Chrome reads a blob URL after click() returns, so it must outlive the click.
const REVOKE_AFTER_MS = 60_000;

let db;

// Gives the page a turn to paint and handle input whenever building the file has run for a frame.
async function collect(parts) {
  const out = [];
  let since = performance.now();
  for (const part of parts) {
    out.push(part);
    if (performance.now() - since > FRAME_MS) {
      await new Promise(resolve => setTimeout(resolve));
      since = performance.now();
    }
  }
  return out;
}

async function readSnapshot() {
  if (!isExtension) return previewSnapshot(await command('snapshot'));
  db ??= openLedger();
  return readLedgerSnapshot(db);
}

/**
 * Builds the JSON or CSV file in this page and saves it through a download link.
 * Nothing leaves the device and no extra permission is used.
 * Resolves to the file name and a summary of the snapshot that was written.
 * Throws before that when the file is not saved, so a failure has no summary.
 * @param {'json' | 'csv'} kind
 */
export async function exportLedger(kind) {
  const [settings, snapshot] = await Promise.all([command('settings'), readSnapshot()]);
  const now = Date.now();
  const meta = { exportedAt: now, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, appVersion: version, settings };
  const summary = ledgerExportSummary(snapshot, meta, kind);
  const parts = kind === 'json' ? ledgerJsonParts(snapshot, meta) : dailyCsvParts(snapshot);
  const url = URL.createObjectURL(new Blob(await collect(parts), { type: TYPES[kind] }));
  const name = exportFileName(kind, now);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  return { name, summary };
}
