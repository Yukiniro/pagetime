import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const shots = '/opt/cursor/artifacts';

function backup() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).getTime();
  return {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    timeZone: 'UTC',
    appVersion: '1.2.0',
    recording: { enabled: true, since: start },
    settings: {
      schema: 1, idleSeconds: 120, countAudible: true, siteMerge: 'prefix', recordMode: 'blacklist',
      ignored: ['skip.restore'], allowed: [], badge: true, theme: 'light',
    },
    tables: {
      domains: [{ id: 1, host: 'restored.test' }],
      days: [{ date, domainId: 1, ms: 60_000, visits: 1 }],
      hours: [{ date, hour: 9, domainId: 1, ms: 60_000 }],
      spans: [{ id: 1, domainId: 1, start, end: start + 60_000 }],
      visits: [{ id: 1, domainId: 1, at: start }],
    },
  };
}

async function shot(page, name) {
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, name), fullPage: true });
}

test.beforeAll(() => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
});

test('restoring a JSON backup from settings replaces the empty ledger', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-restore-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
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
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    const restore = dashboard.getByRole('button', { name: 'Restore from backup', exact: true });
    await expect(restore).toBeEnabled();
    await expect(dashboard.getByText('Restore from a backup only works in the extension.')).toHaveCount(0);
    await expect(dashboard.locator('input[type="file"]')).toHaveAttribute('accept', 'application/json,.json');
    await shot(dashboard, 'restore-settings-before.png');

    const outside = [];
    dashboard.on('request', request => {
      const url = request.url();
      if (!url.startsWith(new URL('/', sw.url()).href) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url);
    });

    await dashboard.locator('input[type="file"]').setInputFiles({
      name: 'notes.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('date,host,active_ms,visits\r\n'),
    });
    await expect(dashboard.getByRole('heading', { name: 'Replace all local records?' })).toBeVisible();
    await shot(dashboard, 'restore-confirm.png');
    await dashboard.getByRole('button', { name: 'Replace records', exact: true }).click();
    await expect(dashboard.getByRole('alert')).toContainText("This file isn't a PageTime backup. Nothing was changed.");
    await dashboard.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(dashboard.getByText('Your browsing will show up here')).toBeVisible();

    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.locator('input[type="file"]').setInputFiles({
      name: 'pagetime-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup())),
    });
    await dashboard.getByRole('button', { name: 'Replace records', exact: true }).click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Restored.' })).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Remove skip.restore' })).toBeVisible();
    await expect(dashboard.locator('[data-slot="alert-dialog-content"]')).toHaveCount(0);
    await shot(dashboard, 'restore-settings-after.png');
    await dashboard.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'Details for restored.test' }).first()).toBeVisible();
    await shot(dashboard, 'restore-overview-after.png');
    expect(outside).toEqual([]);
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
