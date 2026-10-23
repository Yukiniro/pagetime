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
const evidence = '/tmp/pagetime-verify-evidence/popup-list-status';
const shots = '/opt/cursor/artifacts';
const host = 'status.example.test';
const recording = 'Recording browsing activity';
const ignoredCopy = 'Not recording this site: ignored';
const notAllowedCopy = 'Not recording this site: not allowed';

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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-list-status-'));
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

async function focusSite(page) {
  await page.bringToFront();
  focusChrome();
}

function statusOf(popup) {
  return popup.evaluate(`(() => { const main = document.querySelector('main'); return { text: document.querySelector('.popup-status')?.innerText.trim() || '', kind: main?.dataset.statusKind || '', paused: main?.dataset.paused || '' }; })()`);
}

async function expectStatus(popup, text, kind) {
  await expect.poll(() => statusOf(popup).then(status => `${status.kind}|${status.text}`)).toBe(`${kind}|${text}`);
}

async function stays(sw, page, domain) {
  const first = await credited(sw, domain);
  await focusSite(page);
  await page.waitForTimeout(1500);
  await focusSite(page);
  return (await credited(sw, domain)) === first;
}

test('the popup says this site is not timing because of its list, and global pause still wins', async () => {
  test.setTimeout(180_000);
  const debugPort = await freePort();
  const { context, userDataDir } = await launch(debugPort);
  const notes = [];
  try {
    console.log('DBG 1', Date.now() % 1000000);
    const sw = await worker(context);
    console.log('DBG 2', Date.now() % 1000000);
    const page = await context.newPage();
    console.log('DBG 3', Date.now() % 1000000);
    await page.goto(`http://${host}:${port}/`);
    console.log('DBG 4', Date.now() % 1000000);
    await expect.poll(async () => {
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(0);

    console.log('DBG 5', Date.now() % 1000000);
    const first = await openPopup(context, debugPort);
    console.log('DBG 6', Date.now() % 1000000);
    await expectStatus(first, recording, 'recording');
    console.log('DBG 7', Date.now() % 1000000);
    await saveShot(first, 'popup-list-status-recording.png');
    notes.push('timing site shows Recording browsing activity');

    console.log('DBG 8', Date.now() % 1000000);
    await first.click('button', "Don't record this site", { exact: true });
    console.log('DBG 9', Date.now() % 1000000);
    await expectStatus(first, ignoredCopy, 'siteIgnored');
    console.log('DBG 10', Date.now() % 1000000);
    expect((await statusOf(first)).paused).toBe('false');
    console.log('DBG 11', Date.now() % 1000000);
    const ignoredSnap = await first.snap();
    console.log('DBG 12', Date.now() % 1000000);
    expect(ignoredSnap.figure).toBe('site');
    console.log('DBG 13', Date.now() % 1000000);
    expect(ignoredSnap.figureName).toMatch(/^Today /);
    console.log('DBG 14', Date.now() % 1000000);
    expect(ignoredSnap.alerts).toBe(0);
    console.log('DBG 15', Date.now() % 1000000);
    expect(await first.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(320);
    console.log('DBG 16', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([host]);
    console.log('DBG 17', Date.now() % 1000000);
    await saveShot(first, 'popup-list-status-ignored.png');
    notes.push('blacklist: ignored copy right after the click');

    console.log('DBG 18', Date.now() % 1000000);
    await first.click('button', 'Pause recording', { exact: true });
    console.log('DBG 19', Date.now() % 1000000);
    await expectStatus(first, 'Recording paused', 'paused');
    console.log('DBG 20', Date.now() % 1000000);
    await first.click('button', 'Resume recording', { exact: true });
    console.log('DBG 21', Date.now() % 1000000);
    await expectStatus(first, ignoredCopy, 'siteIgnored');
    console.log('DBG 22', Date.now() % 1000000);
    await first.close();
    notes.push('global pause wins over the list copy; resume returns to it');

    console.log('DBG 23', Date.now() % 1000000);
    await focusSite(page);
    console.log('DBG 24', Date.now() % 1000000);
    expect(await stays(sw, page, host)).toBe(true);
    console.log('DBG 25', Date.now() % 1000000);
    const reopened = await openPopup(context, debugPort);
    console.log('DBG 26', Date.now() % 1000000);
    await expectStatus(reopened, ignoredCopy, 'siteIgnored');
    console.log('DBG 27', Date.now() % 1000000);
    await reopened.click('button', 'Record this site again', { exact: true });
    console.log('DBG 28', Date.now() % 1000000);
    await expectStatus(reopened, recording, 'recording');
    console.log('DBG 29', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([]);
    console.log('DBG 30', Date.now() % 1000000);
    await reopened.close();
    console.log('DBG 31', Date.now() % 1000000);
    const resumed = await credited(sw, host);
    console.log('DBG 32', Date.now() % 1000000);
    await expect.poll(async () => {
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(resumed);
    notes.push('undo returns to Recording browsing activity and timing resumes');

    console.log('DBG 33', Date.now() % 1000000);
    const dashboard = await context.newPage();
    console.log('DBG 34', Date.now() % 1000000);
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    console.log('DBG 35', Date.now() % 1000000);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    console.log('DBG 36', Date.now() % 1000000);
    await dashboard.reload();
    console.log('DBG 37', Date.now() % 1000000);
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    console.log('DBG 38', Date.now() % 1000000);
    await dashboard.getByRole('radio', { name: /^Whitelist/ }).click();
    console.log('DBG 39', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('whitelist');

    console.log('DBG 40', Date.now() % 1000000);
    await focusSite(page);
    console.log('DBG 41', Date.now() % 1000000);
    const whitelist = await openPopup(context, debugPort);
    console.log('DBG 42', Date.now() % 1000000);
    await expectStatus(whitelist, notAllowedCopy, 'siteNotAllowed');
    console.log('DBG 43', Date.now() % 1000000);
    expect((await statusOf(whitelist)).paused).toBe('false');
    console.log('DBG 44', Date.now() % 1000000);
    await saveShot(whitelist, 'popup-list-status-not-allowed.png');
    console.log('DBG 45', Date.now() % 1000000);
    await whitelist.click('button', 'Record this site', { exact: true });
    console.log('DBG 46', Date.now() % 1000000);
    await expectStatus(whitelist, recording, 'recording');
    console.log('DBG 47', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([host]);
    console.log('DBG 48', Date.now() % 1000000);
    await whitelist.click('button', 'Stop recording this site', { exact: true });
    console.log('DBG 49', Date.now() % 1000000);
    await expectStatus(whitelist, notAllowedCopy, 'siteNotAllowed');
    console.log('DBG 50', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([]);
    console.log('DBG 51', Date.now() % 1000000);
    await whitelist.close();
    notes.push('whitelist: not-allowed copy, allow returns to recording, undo returns to not allowed');

    console.log('DBG 52', Date.now() % 1000000);
    await page.bringToFront();
    console.log('DBG 53', Date.now() % 1000000);
    await page.goto('about:blank');
    console.log('DBG 54', Date.now() % 1000000);
    const blank = await openPopup(context, debugPort);
    console.log('DBG 55', Date.now() % 1000000);
    const blankSnap = await blank.snap();
    console.log('DBG 56', Date.now() % 1000000);
    expect(blankSnap.figure).toBe('total');
    console.log('DBG 57', Date.now() % 1000000);
    expect(blankSnap.body).not.toMatch(/Not recording this site/);
    console.log('DBG 58', Date.now() % 1000000);
    expect((await statusOf(blank)).kind).toBe('recording');
    console.log('DBG 59', Date.now() % 1000000);
    await saveShot(blank, 'popup-list-status-non-recordable.png');
    console.log('DBG 60', Date.now() % 1000000);
    await blank.close();
    notes.push('about:blank keeps the total only, with no list copy');

    console.log('DBG 61', Date.now() % 1000000);
    await dashboard.bringToFront();
    console.log('DBG 62', Date.now() % 1000000);
    await dashboard.getByRole('radio', { name: /^Blacklist/ }).click();
    console.log('DBG 63', Date.now() % 1000000);
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('blacklist');

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    console.log('DBG 64', Date.now() % 1000000);
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
