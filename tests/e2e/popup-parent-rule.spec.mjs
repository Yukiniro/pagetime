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
const evidence = '/tmp/pagetime-verify-evidence/popup-parent-rule';
const shots = '/opt/cursor/artifacts';
const host = 'mail.example.test';
const parent = 'example.test';
const covered = `Covered by ${parent}. Revoke that rule`;
const allowedCovered = `Allowed by ${parent}. Revoke that rule`;

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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-parent-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      `--host-resolver-rules=MAP ${host} 127.0.0.1`,
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

async function settingsOf(sw) {
  return sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
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

function buttonNamed(snap, name) {
  return snap.nodes.find(node => node.role === 'button' && node.name === name);
}

async function focusSite(page) {
  await page.bringToFront();
  focusChrome();
}

test('a parent list rule covers the popup and the site detail, and revoking it resumes timing', async () => {
  test.setTimeout(180_000);
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
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(0);
    notes.push(`credited ${host}`);

    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    const details = dashboard.getByRole('button', { name: `Details for ${host}` }).first();
    await expect(details).toBeVisible();
    await details.click();
    const drawer = dashboard.getByRole('dialog');
    await expect(drawer.getByRole('button', { name: 'Stop recording this site' })).toBeEnabled();
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    notes.push('detail starts unlisted');

    await focusSite(page);
    const openPopupFirst = await openPopup(context, debugPort);
    expect(buttonNamed(await openPopupFirst.snap(), "Don't record this site")).toBeTruthy();
    await openPopupFirst.close();

    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('textbox', { name: 'Host to ignore' }).fill(parent);
    await dashboard.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: `Remove ${parent}` })).toBeVisible();
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([parent]);
    notes.push(`ignored ${parent}`);

    await focusSite(page);
    await expect.poll(async () => {
      const first = await credited(sw, host);
      await page.waitForTimeout(1000);
      await focusSite(page);
      return (await credited(sw, host)) === first;
    }, { timeout: 20_000 }).toBe(true);
    notes.push('blacklist parent stopped timing');

    const coveredPopup = await openPopup(context, debugPort);
    await expect.poll(async () => buttonNamed(await coveredPopup.snap(), covered)?.name).toBe(covered);
    const coveredSnap = await coveredPopup.snap();
    expect(buttonNamed(coveredSnap, "Don't record this site")).toBeUndefined();
    expect(coveredSnap.nodes.find(node => node.role === 'heading' && node.tag === 'H1')?.name).toBe(host);
    const width = await coveredPopup.evaluate('document.documentElement.scrollWidth');
    expect(width).toBeLessThanOrEqual(320);
    const state = await coveredPopup.evaluate(`document.querySelector('[data-list-state]')?.dataset.listState`);
    expect(state).toBe('covered');
    await saveShot(coveredPopup, 'popup-parent-covered.png');
    await coveredPopup.close();
    notes.push(`popup ${covered}; scrollWidth ${width}`);

    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Overview', exact: true }).click();
    await dashboard.getByRole('button', { name: `Details for ${host}` }).first().click();
    await expect(drawer.getByRole('button', { name: 'This site is already ignored' })).toBeDisabled();
    await saveShot(dashboard, 'detail-parent-covered.png');
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    notes.push('detail already ignored');

    await focusSite(page);
    const revokePopup = await openPopup(context, debugPort);
    await revokePopup.click('button', covered, { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([]);
    await expect.poll(async () => buttonNamed(await revokePopup.snap(), "Don't record this site")?.name).toBe("Don't record this site");
    await saveShot(revokePopup, 'popup-parent-revoked.png');
    await revokePopup.close();
    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: `Details for ${host}` }).first().click();
    await expect(drawer.getByRole('button', { name: 'Stop recording this site' })).toBeEnabled();
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    notes.push('revoked parent; detail unlisted');

    const resumed = await credited(sw, host);
    await expect.poll(async () => {
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(resumed);
    notes.push('subdomain timing resumed');

    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('radio', { name: /^Whitelist/ }).click();
    await dashboard.getByRole('textbox', { name: 'Host to allow' }).fill(parent);
    await dashboard.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: `Remove ${parent}` })).toBeVisible();
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([parent]);

    await focusSite(page);
    const allowPopup = await openPopup(context, debugPort);
    await expect.poll(async () => buttonNamed(await allowPopup.snap(), allowedCovered)?.name).toBe(allowedCovered);
    await saveShot(allowPopup, 'popup-parent-whitelist.png');
    await allowPopup.close();
    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Overview', exact: true }).click();
    await dashboard.getByRole('button', { name: `Details for ${host}` }).first().click();
    await expect(drawer.getByRole('button', { name: 'This site is already allowed' })).toBeDisabled();
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    notes.push('whitelist detail already allowed');

    await focusSite(page);
    const revokeAllow = await openPopup(context, debugPort);
    await revokeAllow.click('button', allowedCovered, { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([]);
    await expect.poll(async () => buttonNamed(await revokeAllow.snap(), 'Record this site')?.name).toBe('Record this site');
    await revokeAllow.close();
    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: `Details for ${host}` }).first().click();
    await expect(drawer.getByRole('button', { name: 'Add to whitelist' })).toBeEnabled();
    await dashboard.getByRole('button', { name: 'Close details' }).click();
    const stopped = await credited(sw, host);
    await focusSite(page);
    await page.waitForTimeout(1500);
    await focusSite(page);
    expect(await credited(sw, host)).toBe(stopped);
    notes.push('whitelist revoke stopped timing');

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
