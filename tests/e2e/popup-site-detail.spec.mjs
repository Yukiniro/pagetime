import { test, expect, chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachPopup, dismissPopup } from './popup-cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const evidence = '/tmp/pagetime-verify-evidence/popup-site-detail';
const shots = '/opt/cursor/artifacts';
const host = '127.0.0.1';

let server;
let port;
let windowManager;

function hasWindowManager() {
  try {
    const supported = execFileSync('xprop', ['-root', '_NET_SUPPORTED'], { encoding: 'utf8' });
    return supported.includes('_NET_ACTIVE_WINDOW');
  } catch {
    return false;
  }
}

function xdo(args) {
  try {
    return execFileSync('timeout', ['-k', '1', '2', 'xdotool', ...args], { encoding: 'utf8', timeout: 5000 });
  } catch {
    return '';
  }
}

function focusChrome() {
  const ids = new Set();
  for (const args of [['search', '--onlyvisible', '--class', 'Chromium-browser'], ['search', '--class', 'Chromium-browser']]) {
    for (const id of xdo(args).trim().split('\n').filter(Boolean)) ids.add(id);
  }
  for (const id of ids) xdo(['windowactivate', id]);
  xdo(['mousemove', '30', '30']);
  xdo(['mousemove', '90', '50']);
}

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) throw new Error('run npm run build before test:e2e');
  if (!hasWindowManager()) {
    windowManager = spawn('openbox', [], { stdio: 'ignore' });
    const started = Date.now();
    while (!hasWindowManager()) {
      if (Date.now() - started > 5_000) throw new Error('openbox did not start');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end('<!doctype html><title>pagetime</title><p>ok</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

test.afterAll(async () => {
  windowManager?.kill();
  if (server) await new Promise(resolve => server.close(resolve));
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const chosen = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(chosen));
    });
  });
}

async function launch(debugPort) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-site-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      `--host-resolver-rules=MAP b.test 127.0.0.1`,
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

async function credited(sw, domain) {
  return sw.evaluate(async target => {
    const { session } = await chrome.storage.session.get('session');
    const db = await new Promise(resolve => {
      const request = indexedDB.open('pagetime-ledger');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) return 0;
    try {
      const tx = db.transaction(['meta', 'domains', 'days'], 'readonly');
      const read = store => new Promise((resolve, reject) => {
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [meta, domains, days] = await Promise.all(['meta', 'domains', 'days'].map(read));
      const id = domains.find(row => row.host === target)?.id;
      const stored = id === undefined ? 0 : days.filter(row => row.domainId === id).reduce((sum, row) => sum + row.ms, 0);
      const cursor = meta.find(row => row.key === 'cursor')?.value;
      const live = cursor && cursor.session === session && cursor.domain === target ? Math.max(0, Date.now() - cursor.since) : 0;
      return stored + live;
    } finally {
      db.close();
    }
  }, domain);
}

async function openPopup(context, debugPort) {
  await dismissPopup(debugPort);
  const sw = await worker(context);
  const opened = await sw.evaluate(async () => {
    try {
      await chrome.action.openPopup();
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  if (opened) throw new Error(opened);
  const popup = await attachPopup(debugPort);
  await expect.poll(() => popup.snap().then(snap => snap.status)).toBe('ready');
  return popup;
}

async function saveShot(page, filename) {
  fs.mkdirSync(evidence, { recursive: true });
  fs.mkdirSync(shots, { recursive: true });
  if (page.shot) {
    await page.shot(path.join(evidence, filename));
    await page.shot(path.join(shots, filename));
    return;
  }
  await page.screenshot({ path: path.join(evidence, filename) });
  await page.screenshot({ path: path.join(shots, filename) });
}

test('clicking the popup site name opens that site’s detail on today', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(['alarms', 'favicon', 'idle', 'storage', 'tabs', 'webNavigation']);

  const debugPort = await freePort();
  const { context, userDataDir } = await launch(debugPort);
  const notes = [];
  try {
    const sw = await worker(context);
    const page = await context.newPage();
    await page.goto(`http://${host}:${port}/`);
    await expect.poll(async () => {
      focusChrome();
      await page.bringToFront();
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(0);
    notes.push(`credited ${host}`);

    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await dashboard.getByRole('button', { name: /^Date range/ }).click();
    await dashboard.getByRole('menuitemradio', { name: 'Last 7 days' }).click();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Clear data' }).click();
    await expect(dashboard.getByRole('heading', { name: 'Clear all browsing records?' })).toBeVisible();
    await dashboard.evaluate(() => { window.__stay = 1; });

    await page.bringToFront();
    focusChrome();
    const popup = await openPopup(context, debugPort);
    const name = `View ${host} in the dashboard`;
    await expect.poll(async () => (await popup.snap()).nodes.some(node => node.role === 'button' && node.name === name)).toBe(true);
    const focused = await popup.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(name)});
      if (!button) return false;
      button.focus();
      return document.activeElement === button && button.tabIndex >= 0;
    })()`);
    expect(focused).toBe(true);
    const heading = (await popup.snap()).nodes.find(node => node.role === 'heading' && node.tag === 'H1');
    expect(heading?.name).toBe(host);
    await saveShot(popup, 'popup-site-after.png');
    notes.push(`popup button ${name}`);

    const dashboardTabs = () => context.pages().filter(item => item.url().includes('dashboard.html'));
    expect(dashboardTabs()).toHaveLength(1);
    await popup.click('button', name, { exact: true });
    await expect(dashboard.getByRole('dialog').getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(dashboard.getByRole('dialog')).toContainText(host);
    // The open drawer hides the page behind it from the accessibility tree.
    await expect.poll(() => dashboard.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Browsing overview');
    await expect.poll(() => dashboard.evaluate(() => document.querySelector('button[aria-label^="Date range"]')?.getAttribute('aria-label'))).toBe('Date range: Today');
    await expect(dashboard.getByRole('heading', { name: 'Clear all browsing records?' })).toHaveCount(0);
    await expect(dashboard.getByText(/Filtered to/)).toHaveCount(0);
    expect(dashboardTabs()).toHaveLength(1);
    expect(await dashboard.evaluate(() => window.__stay)).toBe(1);
    expect(await dashboard.evaluate(() => location.hash)).toBe('');
    await saveShot(dashboard, 'dashboard-site-detail-after.png');
    notes.push('drawer open on today; one tab; hash cleared; no reload');

    await dashboard.getByRole('button', { name: 'Close details' }).click();
    await expect(dashboard.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => dashboard.evaluate(() => document.activeElement?.tagName)).toBe('H1');
    await expect(dashboard.getByText(/Filtered to/)).toHaveCount(0);
    await dashboard.reload();
    await expect(dashboard.getByRole('heading', { level: 1, name: 'Browsing overview' })).toBeVisible();
    await expect(dashboard.getByRole('dialog')).toHaveCount(0);
    expect(await dashboard.evaluate(() => location.hash)).toBe('');
    notes.push('close returns focus to the heading; reload stays closed');

    await page.bringToFront();
    const again = await openPopup(context, debugPort);
    await again.click('button', 'Open dashboard', { exact: true });
    await expect.poll(() => dashboardTabs().length).toBe(1);
    await expect(dashboard.getByRole('dialog')).toHaveCount(0);
    await expect(dashboard.getByRole('heading', { level: 1, name: 'Browsing overview' })).toBeVisible();
    notes.push('open dashboard left the drawer closed');

    await page.goto('about:blank');
    const blank = await openPopup(context, debugPort);
    const blankSnap = await blank.snap();
    expect(blankSnap.nodes.some(node => node.role === 'heading' && node.name === "Today's total")).toBe(true);
    expect(blankSnap.nodes.some(node => node.role === 'button' && node.name.startsWith('View '))).toBe(false);
    notes.push('about:blank has no site button');

    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Pause recording' }).click();
    await expect(dashboard.getByText('Recording paused')).toBeVisible();
    await page.goto(`http://b.test:${port}/`);
    await page.bringToFront();
    const quiet = await openPopup(context, debugPort);
    const quietSnap = await quiet.snap();
    expect(quietSnap.nodes.find(node => node.role === 'heading')?.name).toBe('b.test');
    expect(quietSnap.nodes.some(node => node.role === 'button' && node.name.startsWith('View '))).toBe(false);
    await saveShot(quiet, 'popup-site-no-time.png');
    notes.push('b.test with no time today is text');

    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('button', { name: /^Appearance/ }).click();
    await dashboard.getByRole('menuitemradio', { name: 'Dark' }).click();
    await page.goto(`http://${host}:${port}/`);
    await page.bringToFront();
    focusChrome();
    const dark = await openPopup(context, debugPort);
    await expect.poll(async () => (await dark.snap()).theme).toBe('dark');
    await expect.poll(async () => (await dark.snap()).nodes.some(node => node.role === 'button' && node.name === name)).toBe(true);
    await saveShot(dark, 'popup-site-dark.png');
    notes.push('dark theme keeps the site button');

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
