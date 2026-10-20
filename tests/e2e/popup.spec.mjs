import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');

let server;
let port;

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end('<!doctype html><title>pagetime</title><p>ok</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

async function launch() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-'));
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
  await context.addInitScript(() => localStorage.setItem('pagetime-language', 'en'));
  return { context, userDataDir };
}

async function worker(context) {
  const ready = context.serviceWorkers().at(-1);
  if (ready) return ready;
  return context.waitForEvent('serviceworker');
}

async function closePopups(context) {
  await Promise.all(context.pages().filter(item => item.url().includes('popup.html')).map(item => item.close().catch(() => {})));
}

async function openPopup(context) {
  await closePopups(context);
  const sw = await worker(context);
  const opened = context.waitForEvent('page', page => page.url().includes('popup.html'));
  await sw.evaluate(() => chrome.action.openPopup());
  const popup = await opened;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('main[data-status="ready"]')).toBeVisible();
  return popup;
}

async function settingsOf(sw) {
  return sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
}

test('the toolbar popup edits the list, pause, and badge, and reuses the dashboard tab', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  expect(manifest.action.default_popup).toBe('popup.html');
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(['alarms', 'idle', 'storage', 'tabs', 'webNavigation']);

  const { context, userDataDir } = await launch();
  try {
    const sw = await worker(context);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(dashboard.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.bringToFront();

    const popup = await openPopup(context);
    await expect(popup.getByRole('heading', { level: 1, name: '127.0.0.1' })).toBeVisible();
    await expect(popup.locator('[data-figure="site"]')).toBeVisible();
    await expect(popup.getByText(/^Today .+ total$/)).toBeVisible();
    await expect(popup.getByText('Recording browsing activity')).toBeVisible();
    await expect(popup.getByRole('switch', { name: 'Toolbar badge' })).toBeChecked();
    const total = await popup.locator('main').getAttribute('data-total-ms');

    await popup.getByRole('button', { name: "Don't record this site", exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Record this site again', exact: true })).toBeVisible();
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual(['127.0.0.1']);
    await expect(dashboard.getByRole('button', { name: 'Remove 127.0.0.1' })).toBeVisible();
    await popup.getByRole('button', { name: 'Record this site again', exact: true }).click();
    await expect(popup.getByRole('button', { name: "Don't record this site", exact: true })).toBeVisible();
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([]);

    await dashboard.bringToFront();
    await dashboard.getByRole('radio', { name: /^Whitelist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('whitelist');
    await page.bringToFront();
    const whitelist = await openPopup(context);
    await whitelist.getByRole('button', { name: 'Record this site', exact: true }).click();
    await expect(whitelist.getByRole('button', { name: 'Stop recording this site', exact: true })).toBeVisible();
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual(['127.0.0.1']);
    await whitelist.getByRole('button', { name: 'Stop recording this site', exact: true }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([]);
    await dashboard.bringToFront();
    await dashboard.getByRole('radio', { name: /^Blacklist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('blacklist');

    await page.bringToFront();
    await page.goto('about:blank');
    const blank = await openPopup(context);
    await expect(blank.getByRole('heading', { level: 1, name: "Today's total" })).toBeVisible();
    await expect(blank.getByRole('button', { name: "Don't record this site" })).toHaveCount(0);
    await expect(blank.getByRole('alert')).toHaveCount(0);
    await expect(blank.locator('[data-figure="total"]')).toHaveText(/.+/);
    expect(Number(await blank.locator('main').getAttribute('data-total-ms'))).toBeGreaterThanOrEqual(Number(total));

    await blank.getByRole('button', { name: 'Pause recording', exact: true }).click();
    await expect(blank.getByRole('button', { name: 'Resume recording', exact: true })).toBeVisible();
    await expect(blank.getByText('Recording paused')).toBeVisible();
    await expect(blank.locator('main')).toHaveAttribute('data-paused', 'true');
    await expect(dashboard.getByText('Recording paused')).toBeVisible();
    await blank.getByRole('button', { name: 'Resume recording', exact: true }).click();
    await expect(blank.getByText('Recording browsing activity')).toBeVisible();

    await blank.getByRole('switch', { name: 'Toolbar badge' }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.badge)).toBe(false);
    await expect(dashboard.getByRole('switch', { name: 'Toolbar badge' })).not.toBeChecked();
    await blank.getByRole('switch', { name: 'Toolbar badge' }).click();
    await expect(dashboard.getByRole('switch', { name: 'Toolbar badge' })).toBeChecked();

    const dashboardTabs = () => context.pages().filter(item => item.url().includes('dashboard.html'));
    await blank.getByRole('button', { name: 'Open dashboard', exact: true }).click();
    await expect.poll(() => dashboardTabs().length).toBe(1);
    await expect(dashboard.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await dashboard.close();
    await page.bringToFront();
    const created = await openPopup(context);
    await created.getByRole('button', { name: 'Open dashboard', exact: true }).click();
    await expect.poll(() => dashboardTabs().length).toBe(1);
    const opened = dashboardTabs()[0];
    await expect(opened.getByRole('heading', { level: 1, name: 'Browsing overview' })).toBeVisible();
    await page.bringToFront();
    const again = await openPopup(context);
    await again.getByRole('button', { name: 'Open dashboard', exact: true }).click();
    await expect.poll(() => dashboardTabs().length).toBe(1);

    await opened.getByRole('button', { name: 'Settings', exact: true }).click();
    await opened.getByRole('button', { name: /^Appearance/ }).click();
    await opened.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(opened.getByRole('button', { name: 'Appearance: Dark' })).toBeVisible();
    await page.bringToFront();
    const dark = await openPopup(context);
    await expect(dark.locator('main')).toHaveAttribute('data-theme', 'dark');
    await opened.bringToFront();
    await opened.getByRole('button', { name: /^Appearance/ }).click();
    await opened.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(opened.getByRole('button', { name: 'Appearance: Light' })).toBeVisible();
    await page.bringToFront();
    const light = await openPopup(context);
    await expect(light.locator('main')).toHaveAttribute('data-theme', 'light');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
