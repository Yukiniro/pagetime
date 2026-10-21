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

function pointFor(box, day, span) {
  const min = day + 8 * 3_600_000;
  const max = day + 20 * 3_600_000;
  const plotLeft = 14;
  const plotRight = 16;
  const plotTop = 30;
  const plotBottom = 10;
  const plotWidth = box.width - plotLeft - plotRight;
  const xOf = at => plotLeft + (at - min) / (max - min) * plotWidth;
  const y = plotTop + (box.height - plotTop - plotBottom) / 2;
  return { x: box.x + (xOf(span.start) + xOf(span.end)) / 2, y: box.y + y };
}

async function narrowBlock(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.primary-timeline canvas');
    const rect = canvas.getBoundingClientRect();
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const dpr = canvas.width / rect.width;
    const yCss = 30 + (rect.height - 40) / 2;
    const y = Math.round(yCss * dpr);
    const cols = [];
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      if (a > 0 && !(r > 230 && g > 235 && b > 240)) cols.push(x);
    }
    const runs = [];
    let start = cols[0];
    let prev = cols[0];
    for (const x of cols.slice(1)) {
      if (x > prev + 2) { runs.push([start, prev]); start = x; }
      prev = x;
    }
    if (start != null) runs.push([start, prev]);
    const narrow = runs.reduce((best, run) => (run[1] - run[0] < best[1] - best[0] ? run : best));
    return { x: rect.left + ((narrow[0] + narrow[1]) / 2) / dpr, y: rect.top + yCss, width: narrow[1] - narrow[0] + 1 };
  });
}

test('a single-day timeline block opens that site and leaves the filter alone', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-timeline-'));
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

    const clock = await sw.evaluate(async () => {
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
      return { day, rows: rows.map(([domain, start, end]) => ({ domain, start, end })) };
    });

    const dashboard = await context.newPage();
    await dashboard.emulateMedia({ colorScheme: 'light' });
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.locator('[data-status="ready"]')).toBeVisible();
    await expect(dashboard.getByRole('tab', { name: "Today's timeline", selected: true })).toBeVisible();
    const chart = dashboard.locator('.primary-timeline');
    await expect(chart).toBeVisible();
    await expect(dashboard.locator('.legend-other')).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Other', exact: true })).toHaveCount(0);
    await expect(dashboard.locator('.sr-only').filter({ hasText: 'github.com' })).toBeVisible();

    const box = await chart.boundingBox();
    const github = clock.rows.find(row => row.domain === 'github.com');
    const gray = clock.rows.find(row => row.domain === 'www.gray.example');
    const githubPoint = pointFor(box, clock.day, github);
    const chartCursor = dashboard.locator('.primary-timeline div').first();
    await dashboard.mouse.move(githubPoint.x, githubPoint.y);
    await expect.poll(async () => chartCursor.evaluate(el => el.style.cursor)).toBe('pointer');
    const blank = pointFor(box, clock.day, { start: gray.end, end: gray.end + 20 * 60_000 });
    blank.y = box.y + box.height - 16;
    await dashboard.mouse.move(blank.x, blank.y);
    await expect.poll(async () => chartCursor.evaluate(el => el.style.cursor)).not.toBe('pointer');

    await dashboard.mouse.click(githubPoint.x, githubPoint.y);
    const dialog = dashboard.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(dialog).toContainText('github.com');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await dashboard.mouse.click(pointFor(box, clock.day, gray).x, pointFor(box, clock.day, gray).y);
    await expect(dialog).toContainText('gray.example');
    await expect(dialog).not.toContainText('www.gray.example');
    await expect(dialog).not.toContainText('Other');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    const tiny = await narrowBlock(dashboard);
    expect(tiny.width).toBeLessThanOrEqual(3);
    await dashboard.mouse.click(tiny.x, tiny.y);
    await expect(dialog).toContainText('tiny.example');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await dashboard.mouse.click(blank.x, blank.y);
    await expect(dialog).toHaveCount(0);

    await dashboard.locator('.legend').getByRole('button', { name: 'news.example' }).click();
    await expect(dialog).toContainText('news.example');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dialog).toBeHidden();

    await dashboard.getByRole('button', { name: 'Filter to github.com' }).first().click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    const filtered = await chart.boundingBox();
    await dashboard.mouse.click(pointFor(filtered, clock.day, github).x, pointFor(filtered, clock.day, github).y);
    await expect(dialog).toContainText('github.com');
    await expect(dashboard.locator('.filter-bar')).toContainText('Filtered to github.com');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dashboard.getByRole('status').filter({ hasText: 'Filtered to github.com' })).toBeVisible();
    await expect(dashboard.locator('.sr-only').filter({ hasText: 'github.com' })).toBeVisible();
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
