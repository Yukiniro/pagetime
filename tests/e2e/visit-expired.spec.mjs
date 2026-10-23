import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const shots = process.env.PAGETIME_SHOTS;

const EXPIRED = 'Visit details are kept for the last 31 days only. Day totals are still on the overview.';
const NO_MATCH = 'No matching visits';

test.beforeAll(() => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
});

// Writes the ledger the way the background leaves it after 31-day cleanup: day totals for old days, visit rows only for recent ones.
async function seedLedger(sw) {
  await expect.poll(() => sw.evaluate(async () => {
    const db = await new Promise(resolve => {
      const request = indexedDB.open('pagetime-ledger');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    const ready = Boolean(db?.objectStoreNames.contains('visits'));
    db?.close();
    return ready;
  })).toBe(true);
  await sw.evaluate(async () => {
    const at = (offset, hour = 10) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      date.setHours(hour, 0, 0, 0);
      return date.getTime();
    };
    const key = offset => {
      const date = new Date(at(offset));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pagetime-ledger');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['meta', 'domains', 'days', 'visits'], 'readwrite');
    tx.objectStore('meta').put({ key: 'state', value: { enabled: true, since: at(-45) } });
    const added = tx.objectStore('domains').add({ host: 'old.test' });
    added.onsuccess = () => {
      const domainId = added.result;
      for (const offset of [-40, -35, -5]) tx.objectStore('days').put({ date: key(offset), domainId, ms: 30 * 60_000, visits: 2 });
      tx.objectStore('visits').add({ domainId, at: at(-5) });
    };
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
}

const dateInput = offset => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function pickRange(dashboard, from, to) {
  await dashboard.getByRole('button', { name: /^Date range/ }).click();
  await dashboard.getByRole('menuitemradio', { name: 'Custom' }).click();
  const form = dashboard.getByRole('form', { name: 'Custom' });
  await form.getByLabel('Start date').fill(dateInput(from));
  await form.getByLabel('End date').fill(dateInput(to));
  await form.getByRole('button', { name: 'Apply' }).click();
}

async function shot(page, name) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, name) });
}

test('the visit list says detail expired for old days and keeps the no-match copy inside retention', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-expired-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      '--disable-dev-shm-usage',
    ],
  });
  try {
    const sw = context.serviceWorkers().at(-1) ?? await context.waitForEvent('serviceworker');
    await seedLedger(sw);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await dashboard.getByRole('button', { name: 'Visits', exact: true }).click();
    await expect(dashboard.getByRole('heading', { level: 1 })).toHaveText('Visit history');
    const empty = dashboard.locator('.records [data-slot="empty"]');
    const search = dashboard.getByRole('textbox', { name: 'Search sites' });

    await pickRange(dashboard, -42, -33);
    await expect(empty).toHaveText(EXPIRED);
    await shot(dashboard, 'visits-range-before-retention.png');
    await expect(empty).toHaveAttribute('data-empty', 'expired');

    await search.fill('zzz');
    await expect(empty).toHaveText(EXPIRED);
    await search.clear();

    await pickRange(dashboard, -35, -29);
    await expect(empty).toHaveText(EXPIRED);
    await shot(dashboard, 'visits-range-straddles-retention.png');

    await search.fill('zzz');
    await expect(empty).toHaveText(NO_MATCH);
    await expect(empty).toHaveAttribute('data-empty', 'none');
    await search.clear();

    await pickRange(dashboard, -29, -25);
    await expect(empty).toHaveText(NO_MATCH);
    await shot(dashboard, 'visits-range-inside-retention.png');

    await dashboard.getByRole('button', { name: /^Date range/ }).click();
    await dashboard.getByRole('menuitemradio', { name: 'Today' }).click();
    await search.fill('zzz');
    await expect(empty).toHaveText(NO_MATCH);
    await shot(dashboard, 'visits-today-no-match.png');
    await search.clear();

    await pickRange(dashboard, -35, 0);
    await expect(empty).toHaveCount(0);
    await expect(dashboard.getByRole('cell', { name: 'old.test' })).toBeVisible();
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
