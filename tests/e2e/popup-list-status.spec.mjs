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
    const sw = await worker(context);
    const page = await context.newPage();
    await page.goto(`http://${host}:${port}/`);
    await expect.poll(async () => {
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(0);

    const first = await openPopup(context, debugPort);
    await expectStatus(first, recording, 'recording');
    await saveShot(first, 'popup-list-status-recording.png');
    notes.push('timing site shows Recording browsing activity');

    await first.click('button', "Don't record this site", { exact: true });
    await expectStatus(first, ignoredCopy, 'siteIgnored');
    expect((await statusOf(first)).paused).toBe('false');
    const ignoredSnap = await first.snap();
    expect(ignoredSnap.figure).toBe('site');
    expect(ignoredSnap.figureName).toMatch(/^Today /);
    expect(ignoredSnap.alerts).toBe(0);
    expect(await first.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(320);
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([host]);
    await saveShot(first, 'popup-list-status-ignored.png');
    notes.push('blacklist: ignored copy right after the click');

    await first.click('button', 'Pause recording', { exact: true });
    await expectStatus(first, 'Recording paused', 'paused');
    await first.click('button', 'Resume recording', { exact: true });
    await expectStatus(first, ignoredCopy, 'siteIgnored');
    await first.close();
    notes.push('global pause wins over the list copy; resume returns to it');

    await focusSite(page);
    expect(await stays(sw, page, host)).toBe(true);
    const reopened = await openPopup(context, debugPort);
    await expectStatus(reopened, ignoredCopy, 'siteIgnored');
    await reopened.click('button', 'Record this site again', { exact: true });
    await expectStatus(reopened, recording, 'recording');
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([]);
    await reopened.close();
    const resumed = await credited(sw, host);
    await expect.poll(async () => {
      await focusSite(page);
      return credited(sw, host);
    }, { timeout: 20_000 }).toBeGreaterThan(resumed);
    notes.push('undo returns to Recording browsing activity and timing resumes');

    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await dashboard.getByRole('radio', { name: /^Whitelist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('whitelist');

    await focusSite(page);
    const whitelist = await openPopup(context, debugPort);
    await expectStatus(whitelist, notAllowedCopy, 'siteNotAllowed');
    expect((await statusOf(whitelist)).paused).toBe('false');
    await saveShot(whitelist, 'popup-list-status-not-allowed.png');
    await whitelist.click('button', 'Record this site', { exact: true });
    await expectStatus(whitelist, recording, 'recording');
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([host]);
    await whitelist.click('button', 'Stop recording this site', { exact: true });
    await expectStatus(whitelist, notAllowedCopy, 'siteNotAllowed');
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([]);
    await whitelist.close();
    notes.push('whitelist: not-allowed copy, allow returns to recording, undo returns to not allowed');

    await page.bringToFront();
    await page.goto('about:blank');
    const blank = await openPopup(context, debugPort);
    const blankSnap = await blank.snap();
    expect(blankSnap.figure).toBe('total');
    expect(blankSnap.body).not.toMatch(/Not recording this site/);
    expect((await statusOf(blank)).kind).toBe('recording');
    await saveShot(blank, 'popup-list-status-non-recordable.png');
    await blank.close();
    notes.push('about:blank keeps the total only, with no list copy');

    await dashboard.bringToFront();
    await dashboard.getByRole('radio', { name: /^Blacklist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('blacklist');

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
