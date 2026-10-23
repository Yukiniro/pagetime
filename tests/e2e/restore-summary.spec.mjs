import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const shots = '/opt/cursor/artifacts';

// Spans are checked against the page's local day, so the page runs in UTC.
function backup() {
  const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour, minute);
  return {
    format: 'pagetime-ledger',
    schemaVersion: 1,
    exportedAt: '2026-10-22T13:05:00.000Z',
    timeZone: 'UTC',
    appVersion: '1.3.0',
    recording: { enabled: true, since: at(3, 0) },
    settings: { recordMode: 'blacklist', ignored: ['skip.restore'] },
    tables: {
      domains: [{ id: 1, host: 'restored.test' }, { id: 2, host: 'docs.example' }],
      days: [
        { date: '2026-10-21', domainId: 1, ms: 60_000, visits: 1 },
        { date: '2026-10-03', domainId: 2, ms: 30_000, visits: 2 },
      ],
      hours: [{ date: '2026-10-21', hour: 12, domainId: 1, ms: 60_000 }],
      spans: [{ id: 1, domainId: 1, start: at(21, 12), end: at(21, 12, 1) }],
      visits: [{ id: 1, domainId: 1, at: at(21, 12) }, { id: 2, domainId: 2, at: at(3, 9) }],
    },
  };
}

const jsonFile = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });

async function shot(page, name, options = {}) {
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, name), ...options });
}

test.beforeAll(() => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
});

test('a backup is checked and summarized before the overwrite confirm; a bad file never reaches it', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-restore-summary-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'UTC',
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
    const settingsBefore = (await sw.evaluate(() => chrome.storage.local.get('settings'))).settings;
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    const input = dashboard.locator('input[type="file"]');
    const confirmTitle = dashboard.getByRole('heading', { name: 'Replace all local records?' });

    await input.setInputFiles(jsonFile('future.json', { ...backup(), schemaVersion: 2 }));
    await expect(dashboard.getByRole('alert')).toContainText("This backup version isn't supported. Nothing was changed.");
    await expect(confirmTitle).toHaveCount(0);
    await shot(dashboard, 'restore-after-invalid.png', { fullPage: true });

    await input.setInputFiles(jsonFile('pagetime-2026-10-22.json', backup()));
    await expect(confirmTitle).toBeVisible();
    await expect(dashboard.getByRole('alert')).toHaveCount(0);
    const summary = dashboard.getByRole('region', { name: 'Backup summary' });
    await expect(summary).toBeVisible();
    const field = name => summary.locator(`[data-field="${name}"] dd`);
    await expect(field('exportedAt')).toHaveText('10/22/2026 13:05');
    await expect(field('format')).toHaveText('1');
    await expect(field('span')).toHaveText('10/3/2026 – 10/21/2026');
    await expect(field('sites')).toHaveText('2');
    await expect(field('days')).toHaveText('2');
    await expect(field('hours')).toHaveText('1');
    await expect(field('spans')).toHaveText('1');
    await expect(field('visits')).toHaveText('2');
    await expect(field('settings')).toHaveText('Included');
    await expect(field('version')).toHaveText('1.3.0');
    await expect(dashboard.getByRole('button', { name: 'Replace records', exact: true })).toBeEnabled();
    await expect(dashboard.locator('[data-slot="alert-dialog-content"]')).toHaveCSS('opacity', '1');
    await shot(dashboard, 'restore-after-confirm.png');

    await dashboard.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmTitle).toHaveCount(0);
    expect((await sw.evaluate(() => chrome.storage.local.get('settings'))).settings).toEqual(settingsBefore);
    await dashboard.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(dashboard.getByText('Your browsing will show up here')).toBeVisible();
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
