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
const evidence = '/tmp/pagetime-verify-evidence/popup-site-icon';
const shots = '/opt/cursor/artifacts';
const longHost = 'aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh-iiii-jjjj-kkkk-llll.example';

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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-icon-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      `--host-resolver-rules=MAP github.com 127.0.0.1, MAP ${longHost} 127.0.0.1`,
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

async function saveShot(popup, filename) {
  fs.mkdirSync(evidence, { recursive: true });
  fs.mkdirSync(shots, { recursive: true });
  await popup.shot(path.join(evidence, filename));
  await popup.shot(path.join(shots, filename));
}

function iconStateExpression() {
  return `(() => {
    const slot = document.querySelector('.popup-host-icon');
    const icon = slot?.querySelector('.site-icon');
    const img = icon?.querySelector('img');
    const host = document.querySelector('.popup-host');
    const name = host?.querySelector('.popup-host-name, .popup-host-link span');
    const box = host?.getBoundingClientRect();
    const iconBox = slot?.getBoundingClientRect();
    const nameBox = name?.getBoundingClientRect();
    return {
      present: Boolean(slot),
      src: img?.getAttribute('src') || '',
      natural: img?.naturalWidth || 0,
      complete: Boolean(img?.complete),
      globe: Boolean(icon?.querySelector('svg')),
      slotWidth: iconBox ? Math.round(iconBox.width) : 0,
      slotHeight: iconBox ? Math.round(iconBox.height) : 0,
      hostRight: box ? Math.round(box.right) : 0,
      nameClient: name?.clientWidth || 0,
      nameScroll: name?.scrollWidth || 0,
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      favicons: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/_favicon/')).length,
      remote: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.startsWith('http:') || name.startsWith('https:')),
    };
  })()`;
}

async function iconState(popup) {
  return popup.evaluate(iconStateExpression());
}

test('the popup shows a site icon beside the current site and none for today only', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  expect(manifest.name).toBe('PageTime');
  expect(manifest.version).toBe(version);
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(['alarms', 'favicon', 'idle', 'storage', 'tabs', 'webNavigation']);

  const debugPort = await freePort();
  const { context, userDataDir } = await launch(debugPort);
  const notes = [];
  try {
    const sw = await worker(context);
    expect(sw.url().startsWith('chrome-extension://')).toBe(true);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.locator('main')).toBeVisible();
    await expect(dashboard.getByRole('heading', { level: 1 })).toHaveText('Browsing overview');
    await page.bringToFront();

    const local = await openPopup(context, debugPort);
    const localSnap = await local.snap();
    expect(localSnap.nodes.find(node => node.role === 'heading' && node.tag === 'H1')?.name).toBe('127.0.0.1');
    await expect.poll(async () => {
      const state = await iconState(local);
      return state.present && state.slotWidth === 24 && state.slotHeight === 24 && (state.natural > 0 || state.favicons >= 2);
    }).toBe(true);
    const localIcon = await iconState(local);
    expect(localIcon.scroll).toBeLessThanOrEqual(320);
    expect(localIcon.client).toBe(320);
    expect(localIcon.hostRight).toBeLessThanOrEqual(320);
    expect(localIcon.remote).toEqual([]);
    expect(localIcon.globe || localIcon.src.includes('/_favicon/')).toBe(true);
    if (localIcon.src) expect(localIcon.src.startsWith('http')).toBe(false);
    const localButtons = localSnap.nodes.filter(node => node.role === 'button').map(node => node.name);
    expect(localButtons).toContain("Don't record this site");
    expect(localButtons).toContain('Pause recording');
    expect(localButtons).toContain('Open dashboard');
    expect(localSnap.nodes.find(node => node.role === 'switch' && node.name === 'Toolbar badge')?.checked).toBe('true');
    await saveShot(local, 'popup-after-local.png');
    notes.push(`127.0.0.1 icon ${localIcon.src || 'globe'} ${localIcon.slotWidth}px scroll ${localIcon.scroll}`);

    await page.goto(`http://github.com:${port}/`);
    await expect.poll(async () => {
      focusChrome();
      await page.bringToFront();
      return credited(sw, 'github.com');
    }, { timeout: 20_000 }).toBeGreaterThan(0);
    const github = await openPopup(context, debugPort);
    const viewName = 'View github.com in the dashboard';
    await expect.poll(async () => (await github.snap()).nodes.some(node => node.role === 'button' && node.name === viewName)).toBe(true);
    await expect.poll(async () => {
      const state = await iconState(github);
      return state.present && state.complete && state.natural > 0 && state.src.endsWith('/assets/github.com.svg');
    }).toBe(true);
    const githubIcon = await iconState(github);
    expect(githubIcon.slotWidth).toBe(24);
    expect(githubIcon.slotHeight).toBe(24);
    expect(githubIcon.scroll).toBeLessThanOrEqual(320);
    expect(githubIcon.remote).toEqual([]);
    expect(githubIcon.src.includes('/_favicon/')).toBe(false);
    const githubSnap = await github.snap();
    expect(githubSnap.nodes.find(node => node.role === 'heading' && node.tag === 'H1')?.name).toBe('github.com');
    expect(githubSnap.nodes.some(node => node.role === 'button' && node.name === 'Pause recording')).toBe(true);
    await saveShot(github, 'popup-after-github.png');
    notes.push(`github.com svg natural ${githubIcon.natural}; button ${viewName}`);

    await page.goto(`http://${longHost}:${port}/`);
    const long = await openPopup(context, debugPort);
    await expect.poll(async () => {
      const state = await iconState(long);
      return state.present && state.slotWidth === 24 && (state.natural > 0 || state.favicons >= 2);
    }).toBe(true);
    const longIcon = await iconState(long);
    const longSnap = await long.snap();
    expect(longSnap.nodes.find(node => node.role === 'heading' && node.tag === 'H1')?.name).toBe(longHost);
    expect(longIcon.nameScroll).toBeGreaterThan(longIcon.nameClient);
    expect(longIcon.hostRight).toBeLessThanOrEqual(320);
    expect(longIcon.scroll).toBeLessThanOrEqual(320);
    expect(longIcon.client).toBe(320);
    expect(longIcon.remote).toEqual([]);
    expect(longIcon.globe || longIcon.src.includes('/_favicon/')).toBe(true);
    expect(longSnap.nodes.some(node => node.role === 'button' && node.name === "Don't record this site")).toBe(true);
    await saveShot(long, 'popup-after-long.png');
    notes.push(`long name scroll ${longIcon.nameScroll} client ${longIcon.nameClient} icon ${longIcon.src || 'globe'}`);

    await page.goto('about:blank');
    const blank = await openPopup(context, debugPort);
    const blankSnap = await blank.snap();
    const blankIcon = await iconState(blank);
    expect(blankSnap.nodes.find(node => node.role === 'heading' && node.tag === 'H1')?.name).toBe("Today's total");
    expect(blankIcon.present).toBe(false);
    expect(blankSnap.alerts).toBe(0);
    expect(blankSnap.nodes.some(node => node.role === 'button' && node.name === "Don't record this site")).toBe(false);
    expect(blankSnap.nodes.some(node => node.role === 'button' && node.name === 'Pause recording')).toBe(true);
    expect(blankIcon.scroll).toBeLessThanOrEqual(320);
    await saveShot(blank, 'popup-after-total.png');
    notes.push("about:blank has no site icon");

    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
