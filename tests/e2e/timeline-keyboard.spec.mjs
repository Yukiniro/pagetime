import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const shotDir = '/tmp/pagetime-verify-evidence/timeline-keyboard';

test.beforeAll(() => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
  fs.mkdirSync(shotDir, { recursive: true });
});

test('keyboard activates every timeline segment, including a gray site with no legend button', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-timeline-key-'));
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

    const dashboard = await context.newPage();
    await dashboard.emulateMedia({ colorScheme: 'light' });
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.locator('[data-status="ready"]')).toBeVisible();
    await expect(dashboard.getByRole('tab', { name: "Today's timeline", selected: true })).toBeVisible();
    const chart = dashboard.locator('.primary-timeline');
    await expect(chart).toHaveAttribute('role', 'img');
    await expect(chart).toHaveAttribute('tabindex', '-1');
    await expect(dashboard.locator('.legend-other')).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Other', exact: true })).toHaveCount(0);

    const segments = dashboard.locator('.timeline-segments');
    await expect(segments.getByRole('button')).toHaveCount(7);
    const gray = segments.getByRole('button', { name: /gray\.example/ });
    const github = segments.getByRole('button', { name: /github\.com/ });
    await expect(gray).toBeVisible();
    const hidden = await gray.boundingBox();
    expect(hidden?.width ?? 0).toBeLessThanOrEqual(2);

    await gray.focus();
    await expect(gray).toBeFocused();
    const shown = await gray.boundingBox();
    expect(shown.height).toBeGreaterThan(10);
    await dashboard.screenshot({ path: path.join(shotDir, 'segment-focused.png') });
    await dashboard.keyboard.press('Enter');
    const dialog = dashboard.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(dialog).toContainText('gray.example');
    await expect(dialog).not.toContainText('www.gray.example');
    await expect(dialog).not.toContainText('Other');
    await dashboard.screenshot({ path: path.join(shotDir, 'gray-opened.png') });
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await github.focus();
    await expect(github).toBeFocused();
    await dashboard.keyboard.press('Space');
    await expect(dialog).toContainText('github.com');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await dashboard.getByRole('button', { name: 'Filter to github.com' }).first().click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    await expect(segments.getByRole('button')).toHaveCount(1);
    await segments.getByRole('button', { name: /github\.com/ }).focus();
    await dashboard.keyboard.press('Enter');
    await expect(dialog).toContainText('github.com');
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    await dashboard.screenshot({ path: path.join(shotDir, 'filtered-keyboard.png') });
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    await expect(chart).toHaveAttribute('tabindex', '-1');
    fs.writeFileSync(path.join(shotDir, 'result.txt'), [
      'status ready',
      'canvas role=img tabindex=-1',
      '7 segment buttons before filter',
      'Enter on gray.example opened Site details',
      'Space on github.com opened Site details',
      'Enter while filtered left Filtered to github.com',
      'Other is not a button',
    ].join('\n'));
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
