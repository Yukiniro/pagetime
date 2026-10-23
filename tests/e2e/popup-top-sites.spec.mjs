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
const evidence = '/tmp/pagetime-verify-evidence/popup-top-sites';
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-top-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      '--host-resolver-rules=MAP b.test 127.0.0.1, MAP c.test 127.0.0.1',
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

test('the popup lists today’s top sites in dashboard order and opens a site’s detail', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(['alarms', 'favicon', 'idle', 'storage', 'tabs', 'webNavigation']);

  const debugPort = await freePort();
  const { context, userDataDir } = await launch(debugPort);
  const notes = [];
  try {
    const sw = await worker(context);
    const page = await context.newPage();
    await page.goto('about:blank');

    const empty = await openPopup(context, debugPort);
    const emptySnap = await empty.snap();
    expect(emptySnap.total).toBe('0');
    expect(emptySnap.body).not.toContain('Top sites today');
    expect(await empty.evaluate("document.querySelectorAll('.popup-top').length")).toBe(0);
    await saveShot(empty, 'popup-top-sites-empty.png');
    notes.push('no data today: no list and no placeholder');

    const visits = [[host, 6_000], ['b.test', 3_000], ['c.test', 1_000]];
    for (const [name, floor] of visits) {
      await page.goto(`http://${name}:${port}/`);
      await expect.poll(async () => {
        focusChrome();
        await page.bringToFront();
        return credited(sw, name);
      }, { timeout: 30_000 }).toBeGreaterThanOrEqual(floor);
      notes.push(`credited ${name}`);
    }

    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.getByRole('heading', { level: 1, name: 'Browsing overview' })).toBeVisible();
    const readRanking = () => dashboard.locator('.rank-list').first().locator('button[aria-label^="Filter to "]').evaluateAll(
      nodes => nodes.map(node => node.getAttribute('aria-label').replace('Filter to ', '')),
    );
    await expect.poll(async () => (await readRanking()).length).toBeGreaterThanOrEqual(3);
    const ranking = await readRanking();

    await page.bringToFront();
    focusChrome();
    const popup = await openPopup(context, debugPort);
    const rows = await popup.evaluate(`[...document.querySelectorAll('.popup-top li')].map(li => ({
      site: li.querySelector('.popup-top-name').textContent,
      time: li.querySelector('.popup-top-time').textContent,
      label: li.querySelector('button').getAttribute('aria-label'),
    }))`);
    expect(rows.map(row => row.site)).toEqual(ranking.slice(0, 5));
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const row of rows) {
      expect(row.time).toMatch(/\d/);
      expect(row.label).toBe(`Open ${row.site} (${row.time}) in the dashboard`);
    }
    const height = await popup.evaluate('document.documentElement.scrollHeight');
    expect(height).toBeLessThan(330 + rows.length * 30);
    expect(await popup.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(320);
    await saveShot(popup, 'popup-top-sites-after.png');
    notes.push(`popup rows ${rows.map(row => `${row.site} ${row.time}`).join(', ')} match dashboard order ${ranking.join(', ')}; height ${height}`);

    const dashboardTabs = () => context.pages().filter(item => item.url().includes('dashboard.html'));
    const [, second] = rows;
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.evaluate(() => { window.__stay = 1; });
    await popup.click('button', second.label, { exact: true });
    await expect(dashboard.getByRole('dialog').getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(dashboard.getByRole('dialog')).toContainText(second.site);
    await expect.poll(() => dashboard.evaluate(() => document.querySelector('h1')?.textContent)).toBe('Browsing overview');
    expect(dashboardTabs()).toHaveLength(1);
    expect(await dashboard.evaluate(() => window.__stay)).toBe(1);
    expect(await dashboard.evaluate(() => location.hash)).toBe('');
    await saveShot(dashboard, 'popup-top-sites-dashboard-detail.png');
    notes.push(`row ${second.site} focused the open dashboard and opened its detail; one tab; no reload`);

    await dashboard.close();
    await expect.poll(() => dashboardTabs().length).toBe(0);
    await page.bringToFront();
    focusChrome();
    const reopened = await openPopup(context, debugPort);
    const [first] = await reopened.evaluate(`[...document.querySelectorAll('.popup-top button')].map(button => button.getAttribute('aria-label'))`);
    await reopened.click('button', first, { exact: true });
    await expect.poll(() => dashboardTabs().length).toBe(1);
    const created = dashboardTabs()[0];
    await expect(created.getByRole('dialog').getByRole('heading', { name: 'Site details' })).toBeVisible();
    await expect(created.getByRole('dialog')).toContainText(ranking[0]);
    await expect.poll(() => created.evaluate(() => location.hash)).toBe('');
    notes.push(`row ${ranking[0]} opened a new dashboard on its detail`);

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
