import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachPopup, dismissPopup } from './popup-cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const evidence = '/tmp/pagetime-verify-evidence/toolbar-popup';
const shots = '/opt/cursor/artifacts';

async function saveShot(popup, filename) {
  await popup.shot(path.join(evidence, filename));
  try {
    fs.mkdirSync(shots, { recursive: true });
  } catch {
    return;
  }
  await popup.shot(path.join(shots, filename));
}

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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-popup-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
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

function named(snap, role, name, exact = false) {
  const hit = node => node.role === role && (name instanceof RegExp ? name.test(node.name) : exact ? node.name === name : node.name.includes(name));
  return snap.nodes.find(hit);
}

async function expectNamed(popup, role, name, { exact = false, count = 1 } = {}) {
  await expect.poll(async () => {
    const snap = await popup.snap();
    const found = snap.nodes.filter(node => node.role === role && (exact ? node.name === name : node.name.includes(name)));
    return found.length === count ? 'ok' : JSON.stringify(snap.nodes);
  }).toBe('ok');
}

test('the toolbar popup edits the list, pause, and badge, and reuses the dashboard tab', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  expect(manifest.name).toBe('PageTime');
  expect(manifest.version).toBe(version);
  expect(manifest.action.default_popup).toBe('popup.html');
  expect(manifest.action.default_title).toBe('__MSG_actionTitle__');
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect([...manifest.permissions].sort()).toEqual(['alarms', 'idle', 'storage', 'tabs', 'webNavigation']);

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
    await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(dashboard.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.bringToFront();

    const popup = await openPopup(context, debugPort);
    const first = await popup.snap();
    expect(named(first, 'heading', '127.0.0.1', true)?.tag).toBe('H1');
    expect(first.figure).toBe('site');
    expect(first.figureName.startsWith('Today')).toBe(true);
    expect(first.body).toMatch(/Today .+ total/);
    expect(first.body).toContain('Recording browsing activity');
    expect(named(first, 'switch', 'Toolbar badge', true)?.checked).toBe('true');
    await expectNamed(popup, 'button', "Don't record this site", { exact: true });
    await expectNamed(popup, 'button', 'Pause recording', { exact: true });
    await expectNamed(popup, 'button', 'Open dashboard', { exact: true });
    const total = first.total;
    notes.push(`site row: ${first.figureName}; ${first.body.split('\n').find(line => line.startsWith('Today'))}`);
    await saveShot(popup, 'popup-site.png');

    await popup.click('button', "Don't record this site", { exact: true });
    await expectNamed(popup, 'button', 'Record this site again', { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual(['127.0.0.1']);
    expect((await settingsOf(sw)).allowed).toEqual([]);
    await expect(dashboard.getByRole('button', { name: 'Remove 127.0.0.1' })).toBeVisible();
    notes.push('ignored: 127.0.0.1; settings shows Remove 127.0.0.1');
    await popup.click('button', 'Record this site again', { exact: true });
    await expectNamed(popup, 'button', "Don't record this site", { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.ignored)).toEqual([]);

    await dashboard.bringToFront();
    await dashboard.getByRole('radio', { name: /^Whitelist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('whitelist');
    await page.bringToFront();
    const whitelist = await openPopup(context, debugPort);
    await whitelist.click('button', 'Record this site', { exact: true });
    await expectNamed(whitelist, 'button', 'Stop recording this site', { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual(['127.0.0.1']);
    notes.push('allowed: 127.0.0.1');
    await whitelist.click('button', 'Stop recording this site', { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.allowed)).toEqual([]);
    await dashboard.bringToFront();
    await dashboard.getByRole('radio', { name: /^Blacklist/ }).click();
    await expect.poll(() => settingsOf(sw).then(settings => settings.recordMode)).toBe('blacklist');

    await page.bringToFront();
    await page.goto('about:blank');
    const blank = await openPopup(context, debugPort);
    const blankSnap = await blank.snap();
    expect(named(blankSnap, 'heading', "Today's total", true)?.tag).toBe('H1');
    expect(blankSnap.nodes.some(node => node.role === 'button' && node.name === "Don't record this site")).toBe(false);
    expect(blankSnap.alerts).toBe(0);
    expect(blankSnap.figure).toBe('total');
    expect(blankSnap.figureText.length).toBeGreaterThan(0);
    expect(Number(blankSnap.total)).toBeGreaterThanOrEqual(Number(total));
    notes.push(`no site: ${blankSnap.figureName}; total ${blankSnap.total}ms`);

    await blank.click('button', 'Pause recording', { exact: true });
    await expectNamed(blank, 'button', 'Resume recording', { exact: true });
    await expect.poll(async () => (await blank.snap()).body).toContain('Recording paused');
    await expect.poll(async () => (await blank.snap()).paused).toBe('true');
    await expect(dashboard.getByText('Recording paused')).toBeVisible();
    notes.push('paused; dashboard header updated');
    await blank.click('button', 'Resume recording', { exact: true });
    await expect.poll(async () => (await blank.snap()).body).toContain('Recording browsing activity');

    await blank.click('switch', 'Toolbar badge', { exact: true });
    await expect.poll(() => settingsOf(sw).then(settings => settings.badge)).toBe(false);
    await expect(dashboard.getByRole('switch', { name: 'Toolbar badge' })).not.toBeChecked();
    await blank.click('switch', 'Toolbar badge', { exact: true });
    await expect(dashboard.getByRole('switch', { name: 'Toolbar badge' })).toBeChecked();
    notes.push('badge switch off then on');

    const dashboardTabs = () => context.pages().filter(item => item.url().includes('dashboard.html'));
    await blank.click('button', 'Open dashboard', { exact: true });
    await expect.poll(() => dashboardTabs().length).toBe(1);
    await expect(dashboard.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    notes.push('open dashboard focused the existing settings tab');
    await dashboard.close();
    await page.bringToFront();
    const created = await openPopup(context, debugPort);
    await created.click('button', 'Open dashboard', { exact: true });
    await expect.poll(() => dashboardTabs().length).toBe(1);
    const opened = dashboardTabs()[0];
    await expect(opened.getByRole('heading', { level: 1, name: 'Browsing overview' })).toBeVisible();
    await page.bringToFront();
    const again = await openPopup(context, debugPort);
    await again.click('button', 'Open dashboard', { exact: true });
    await expect.poll(() => dashboardTabs().length).toBe(1);
    notes.push('second open reused the new dashboard tab');

    await page.goto(`http://127.0.0.1:${port}/`);
    await opened.getByRole('button', { name: 'Settings', exact: true }).click();
    await opened.getByRole('button', { name: /^Appearance/ }).click();
    await opened.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(opened.getByRole('button', { name: 'Appearance: Dark' })).toBeVisible();
    await page.bringToFront();
    const dark = await openPopup(context, debugPort);
    await expect.poll(async () => (await dark.snap()).theme).toBe('dark');
    await saveShot(dark, 'popup-dark.png');
    await opened.bringToFront();
    await opened.getByRole('button', { name: /^Appearance/ }).click();
    await opened.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(opened.getByRole('button', { name: 'Appearance: Light' })).toBeVisible();
    await page.bringToFront();
    const light = await openPopup(context, debugPort);
    await expect.poll(async () => (await light.snap()).theme).toBe('light');
    await saveShot(light, 'popup-light.png');
    const lightSnap = await light.snap();
    notes.push(`theme dark then light; heading ${named(lightSnap, 'heading', '127.0.0.1', true)?.name}`);
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'result.txt'), notes.map(line => `ok ${line}`).join('\n') + '\n');
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
