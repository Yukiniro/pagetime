import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');

test.beforeAll(() => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
});

async function seedToday(sw) {
  await sw.evaluate(async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const day = dayStart.getTime();
    const at = (h, m = 0, s = 0) => day + ((h * 60 + m) * 60 + s) * 1000;
    const date = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;
    const rows = [
      ['github.com', at(9), at(11)],
      ['news.example', at(11), at(12, 30)],
      ['docs.example', at(13), at(14)],
      ['mail.example', at(14), at(14, 40)],
      ['video.example', at(15), at(15, 30)],
      ['www.gray.example', at(16), at(16, 20)],
      ['tiny.example', at(17), at(17, 0, 2)],
    ];
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pagetime-ledger');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['meta', 'domains', 'days', 'spans', 'visits'], 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.objectStore('meta').put({ key: 'state', value: { enabled: true, since: day - 14 * 86_400_000 } });
        rows.forEach(([host, start, end], index) => {
          const id = index + 1;
          tx.objectStore('domains').put({ id, host });
          tx.objectStore('days').put({ date, domainId: id, ms: end - start, visits: 1 });
          tx.objectStore('spans').put({ id, domainId: id, start, end });
          tx.objectStore('visits').put({ id, domainId: id, at: start });
        });
      });
    } finally {
      db.close();
    }
  });
}

test('a named share opens that site and other moves to the ledger', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-share-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
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
    await expect.poll(async () => sw.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('pagetime-ledger');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => {
        const ok = request.result.objectStoreNames.contains('spans');
        request.result.close();
        resolve(ok);
      };
      request.onerror = () => resolve(false);
    }))).toBe(true);
    await seedToday(sw);

    const dashboard = await context.newPage();
    await dashboard.emulateMedia({ colorScheme: 'light' });
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.locator('[data-status="ready"]')).toBeVisible();
    await expect(dashboard.getByRole('tab', { name: 'Site share', selected: true })).toBeVisible();
    await expect(dashboard.locator('.primary-timeline')).toHaveCount(0);

    const share = dashboard.locator('.share-list');
    const github = share.getByRole('button', { name: /github\.com/ });
    await expect(github).toContainText('2 hr 0 min');
    await expect(github).toContainText('33.3%');
    const widths = await dashboard.locator('.share-segment').evaluateAll(nodes => nodes.map(node => Number.parseFloat(node.style.width)));
    expect(Math.max(...widths)).toBeLessThan(40);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 1);
    await expect(share.getByRole('button', { name: /gray\.example/ })).toHaveCount(0);
    await expect(share.getByRole('button', { name: /View all sites/ })).toContainText('5.6%');

    await github.click();
    const dialog = dashboard.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(dialog).toContainText('github.com');
    await expect(dashboard.locator('.filter-bar')).toHaveCount(0);
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await share.getByRole('button', { name: /View all sites/ }).click();
    await expect(dialog).toHaveCount(0);
    const ledger = dashboard.locator('#site-ledger');
    await expect(ledger).toContainText('gray.example');
    await expect(ledger).not.toContainText('www.gray.example');
    await expect(ledger).toContainText('tiny.example');
    await ledger.getByRole('button', { name: 'Details for gray.example' }).click();
    await expect(dialog).toContainText('gray.example');
    await expect(dialog).not.toContainText('www.gray.example');
    await expect(dialog).not.toContainText('Other');
    await dashboard.getByRole('button', { name: 'Close details' }).click();

    await ledger.getByRole('button', { name: 'Filter to github.com' }).click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    await expect(dashboard.locator('.kpi-item.primary .kpi-value')).toHaveText('2 hr 0 min');
    await expect(dashboard.locator('.chart-caption')).toContainText('Share of all sites');
    await expect(share.getByRole('button', { name: /Other sites/ })).toContainText('66.7%');
    await share.getByRole('button', { name: /github\.com/ }).click();
    await expect(dialog).toContainText('github.com');
    await expect(dashboard.locator('.filter-bar')).toContainText('Filtered to github.com');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();

    for (const width of [1440, 375, 320]) {
      await dashboard.setViewportSize({ width, height: 800 });
      const overflow = await dashboard.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(dashboard.getByRole('tab', { name: 'Site share', selected: true })).toBeVisible();
    }
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
