import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(root, '.output/chrome-mv3');
const STAY = 5_000;
const TOLERANCE = 2_000;

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

function pageUrl(host, pathname = '/') {
  return `http://${host}:${port}${pathname}`;
}

function domainMs(data, domain) {
  return (data?.spans ?? []).filter(span => span.domain === domain).reduce((sum, span) => sum + span.end - span.start, 0);
}

function totalMs(data) {
  return (data?.spans ?? []).reduce((sum, span) => sum + span.end - span.start, 0);
}

function assertClose(actual, expected, tolerance = TOLERANCE) {
  expect(actual, `expected ${expected} ± ${tolerance}, got ${actual}`).toBeGreaterThanOrEqual(expected - tolerance);
  expect(actual).toBeLessThanOrEqual(expected + tolerance);
}

async function launch(userDataDir) {
  const before = new Set(chromeWindowIds());
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1100, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--host-resolver-rules=MAP a.test 127.0.0.1, MAP b.test 127.0.0.1`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking',
      '--disable-dev-shm-usage',
    ],
  });
  let fresh = [];
  for (let attempt = 0; attempt < 30 && fresh.length === 0; attempt += 1) {
    fresh = chromeWindowIds().filter(id => !before.has(id));
    if (!fresh.length) await new Promise(resolve => setTimeout(resolve, 100));
  }
  windowsOf.set(context, fresh);
  await focusContext(context);
  return context;
}

async function withBrowser(fn) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-'));
  const context = await launch(userDataDir);
  try {
    await fn(context);
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function worker(context) {
  const ready = context.serviceWorkers().at(-1);
  if (ready) return ready;
  return context.waitForEvent('serviceworker');
}

// Reads the IndexedDB ledger into the `{ visits, spans, enabled, since }` shape these checks compare.
// The cursor counts only when it belongs to this storage.session, as in the background.
async function readLedger(sw) {
  return sw.evaluate(async () => {
    const { session } = await chrome.storage.session.get('session');
    const db = await new Promise(resolve => {
      const request = indexedDB.open('pagetime-ledger');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) return { data: undefined, cursor: null };
    try {
      const names = ['meta', 'domains', 'spans', 'visits'];
      const tx = db.transaction(names, 'readonly');
      const [meta, domains, spans, visits] = await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
      const host = new Map(domains.map(row => [row.id, row.host]));
      const value = key => meta.find(row => row.key === key)?.value;
      const state = value('state');
      const cursor = value('cursor');
      return {
        data: state && {
          visits: visits.sort((a, b) => a.at - b.at).map(visit => ({ domain: host.get(visit.domainId), at: visit.at })),
          spans: spans.sort((a, b) => a.start - b.start).map(span => ({ domain: host.get(span.domainId), start: span.start, end: span.end })),
          enabled: state.enabled,
          since: state.since,
        },
        cursor: cursor && cursor.session === session ? { tabId: cursor.tabId, domain: cursor.domain, since: cursor.since } : null,
      };
    } finally {
      db.close();
    }
  });
}

async function readData(sw) {
  return (await readLedger(sw)).data;
}

async function readCursor(sw) {
  return (await readLedger(sw)).cursor;
}

function xdo(args) {
  return execFileSync('xdotool', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function chromeWindowIds() {
  const found = [];
  for (const args of [
    ['search', '--onlyvisible', '--class', 'Chromium-browser'],
    ['search', '--class', 'Chromium-browser'],
  ]) {
    try {
      found.push(...xdo(args).trim().split('\n').filter(Boolean));
    } catch { /* window not mapped yet */ }
  }
  return [...new Set(found)];
}

const windowsOf = new WeakMap();

function pokeInput() {
  try {
    xdo(['mousemove', '--sync', '30', '30']);
    xdo(['mousemove', '--sync', '90', '50']);
  } catch { /* no display yet */ }
}

test.beforeEach(() => { pokeInput(); });

async function focusContext(context) {
  for (const id of windowsOf.get(context) ?? chromeWindowIds()) {
    try { xdo(['windowactivate', '--sync', id]); }
    catch { /* the window manager can reject a window that is still mapping */ }
  }
}

async function waitForDomain(context, domain) {
  let nudges = 0;
  const started = Date.now();
  await expect.poll(async () => {
    let cursor = (await readCursor(await worker(context)))?.domain ?? null;
    if (cursor !== domain && nudges < 4 && Date.now() - started > 400) {
      nudges += 1;
      pokeInput();
      await focusContext(context);
      for (const page of context.pages()) {
        if (!page.url().includes(domain)) continue;
        await page.bringToFront().catch(() => {});
        await page.evaluate(() => history.pushState({ settle: Date.now() }, '', location.pathname)).catch(() => {});
      }
      cursor = (await readCursor(await worker(context)))?.domain ?? null;
    }
    return cursor;
  }).toBe(domain);
}

async function waitForSpan(context, domain, minimum) {
  let data;
  await expect.poll(async () => {
    data = await readData(await worker(context));
    return domainMs(data, domain);
  }).toBeGreaterThanOrEqual(minimum);
  return data;
}

function visitCount(data, domain) {
  return (data?.visits ?? []).filter(visit => visit.domain === domain).length;
}

async function waitForVisit(context, domain, count) {
  let data;
  await expect.poll(async () => {
    data = await readData(await worker(context));
    return visitCount(data, domain);
  }).toBe(count);
  return data;
}

async function liveWorker(context, timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const current = context.serviceWorkers().at(-1);
    if (current) {
      try {
        const token = await Promise.race([
          current.evaluate(() => globalThis.TOKEN ?? 'ready'),
          new Promise(resolve => setTimeout(() => resolve('hang'), 400)),
        ]);
        if (token !== 'hang') return current;
      } catch { /* the previous worker is gone */ }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('service worker did not come back');
}

async function stopServiceWorker(context) {
  const browser = context.browser();
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(info => info.type === 'service_worker' && info.url.includes('chrome-extension://'));
  if (!target) throw new Error('service worker target missing');
  await cdp.send('Target.closeTarget', { targetId: target.targetId });
  await cdp.detach();
}

test('S2 switching tabs splits the two domains', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    const pageA = await context.newPage();
    await pageA.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await pageA.waitForTimeout(STAY);
    const pageB = await context.newPage();
    await pageB.goto(pageUrl('b.test'));
    await waitForDomain(context, 'b.test');
    const switched = await readData(sw);
    assertClose(domainMs(switched, 'a.test'), STAY);
    await pageB.waitForTimeout(STAY);
    await pageB.goto('about:blank');
    const data = await waitForSpan(context, 'b.test', STAY - TOLERANCE);
    assertClose(domainMs(data, 'b.test'), STAY);
    const spans = data.spans.filter(span => span.domain === 'a.test' || span.domain === 'b.test');
    expect(spans[0].domain).toBe('a.test');
    expect(spans.at(-1).domain).toBe('b.test');
    expect(spans.at(-1).start).toBeGreaterThanOrEqual(spans[0].end);
  });
});

test('S3 full navigation splits domains and pushState does not add a visit', async () => {
  await withBrowser(async context => {
    const page = await context.newPage();
    await page.goto(pageUrl('a.test', '/start'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(STAY);
    await page.goto(pageUrl('b.test', '/next'));
    await waitForDomain(context, 'b.test');
    const switched = await waitForVisit(context, 'b.test', 1);
    assertClose(domainMs(switched, 'a.test'), STAY);
    expect(visitCount(switched, 'b.test')).toBe(1);
    await page.waitForTimeout(2_000);
    await page.evaluate(() => history.pushState({ step: 1 }, '', '/spa'));
    await page.waitForTimeout(1_500);
    const duringSpa = await readData(await worker(context));
    expect(duringSpa.visits.filter(visit => visit.domain === 'b.test')).toHaveLength(1);
    await page.goto('about:blank');
    const data = await waitForSpan(context, 'b.test', 2_500);
    assertClose(domainMs(data, 'b.test'), 3_500, TOLERANCE);
    expect(data.spans.find(span => span.domain === 'b.test').start).toBeGreaterThanOrEqual(data.spans.find(span => span.domain === 'a.test').end);
  });
});

test('S4 an internal page is not counted and http resumes', async () => {
  await withBrowser(async context => {
    const page = await context.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(STAY);
    await page.goto('chrome://version');
    await expect.poll(async () => readCursor(await worker(context))).toBeNull();
    const parked = domainMs(await readData(await worker(context)), 'a.test');
    assertClose(parked, STAY);
    await page.waitForTimeout(STAY);
    await page.goto(pageUrl('a.test', '/back'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    const data = await waitForSpan(context, 'a.test', parked + 1_000);
    const added = domainMs(data, 'a.test') - parked;
    assertClose(added, 2_000);
    expect(added).toBeLessThan(STAY);
  });
});

test('S5 only the focused window is counted', async () => {
  await withBrowser(async context => {
    const pageA = await context.newPage();
    await pageA.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    const opened = context.waitForEvent('page');
    const cdp = await context.browser().newBrowserCDPSession();
    await cdp.send('Target.createTarget', { url: pageUrl('b.test'), newWindow: true });
    const pageB = await opened;
    await pageB.waitForLoadState('domcontentloaded');
    await pageA.bringToFront();
    await pageA.evaluate(() => history.pushState({ focus: 'a' }, '', '/focus-a'));
    await waitForDomain(context, 'a.test');
    await pageA.waitForTimeout(STAY);
    await pageB.bringToFront();
    await pageB.evaluate(() => history.pushState({ focus: 'b' }, '', '/focus-b'));
    await waitForDomain(context, 'b.test');
    const afterA = domainMs(await readData(await worker(context)), 'a.test');
    assertClose(afterA, STAY);
    await pageB.waitForTimeout(STAY);
    await pageA.bringToFront();
    await pageA.evaluate(() => history.pushState({ focus: 'a2' }, '', '/focus-a2'));
    await waitForDomain(context, 'a.test');
    const afterB = domainMs(await readData(await worker(context)), 'b.test');
    assertClose(afterB, STAY);
    await cdp.detach();
  });
});

test('S7 minimizing the browser window stops timing', async () => {
  await withBrowser(async context => {
    const page = await context.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(3_000);
    let ids = [];
    await expect.poll(() => { ids = windowsOf.get(context) ?? []; return ids.length; }).toBeGreaterThan(0);
    for (const id of ids) xdo(['windowminimize', id]);
    await expect.poll(async () => {
      const wins = await (await worker(context)).evaluate(async () => (await chrome.windows.getAll()).map(win => win.focused || win.state !== 'minimized'));
      return wins.some(Boolean);
    }).toBe(false);
    const parked = domainMs(await readData(await worker(context)), 'a.test');
    await page.waitForTimeout(STAY);
    for (const id of ids) xdo(['windowmap', id]);
    await (await worker(context)).evaluate(async () => {
      const wins = await chrome.windows.getAll();
      for (const win of wins) await chrome.windows.update(win.id, { state: 'normal', focused: true });
    });
    await page.bringToFront();
    // This environment often restores a window without onFocusChanged or onBoundsChanged.
    // Timing resumes on the next one of those events, not on a navigation.
    const resumed = async () => (await readCursor(await worker(context)))?.domain ?? null;
    if (await resumed() !== 'a.test') {
      await (await worker(context)).evaluate(async () => {
        const [win] = await chrome.windows.getAll();
        await chrome.windows.update(win.id, { width: Math.max(400, win.width - 40) });
      });
    }
    await expect.poll(resumed).toBe('a.test');
    const resumedAt = Date.now();
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    const data = await waitForSpan(context, 'a.test', parked + 1_000);
    const added = domainMs(data, 'a.test') - parked;
    assertClose(added, Date.now() - resumedAt);
    expect(added).toBeGreaterThanOrEqual(1_000);
    expect(added).toBeLessThan(STAY + 2_000);
  });
});

test('S11 stopping the service worker keeps the session cursor', async () => {
  await withBrowser(async context => {
    const page = await context.newPage();
    await page.goto(pageUrl('a.test', '/start'));
    await waitForDomain(context, 'a.test');
    const sw = await worker(context);
    await sw.evaluate(() => { globalThis.TOKEN = 'old'; });
    await page.waitForTimeout(2_000);
    await stopServiceWorker(context);
    await page.waitForTimeout(3_000);
    await page.evaluate(() => history.pushState({ wake: 1 }, '', '/wake'));
    const restarted = await liveWorker(context);
    expect(await restarted.evaluate(() => globalThis.TOKEN ?? null)).toBeNull();
    await page.goto('about:blank');
    const data = await waitForSpan(context, 'a.test', 4_000);
    assertClose(domainMs(data, 'a.test'), 5_000, 2_500);
  });
});

test('S15 browser restart keeps flushed spans and skips the time it was closed', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-'));
  const first = await launch(userDataDir);
  let saved;
  try {
    const page = await first.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(first, 'a.test');
    await page.waitForTimeout(STAY);
    await page.goto('about:blank');
    const data = await waitForSpan(first, 'a.test', STAY - TOLERANCE);
    saved = data.spans;
    assertClose(domainMs(data, 'a.test'), STAY);
  } finally {
    await first.close();
  }
  const closedAt = Date.now();
  await new Promise(resolve => setTimeout(resolve, 3_000));
  const second = await launch(userDataDir);
  try {
    const data = await readData(await worker(second));
    expect(data.spans).toEqual(saved);
    for (const span of data.spans) expect(span.end).toBeLessThanOrEqual(closedAt + 1_000);
    const page = await second.newPage();
    await page.goto(pageUrl('a.test', '/again'));
    await waitForDomain(second, 'a.test');
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    const next = await waitForSpan(second, 'a.test', domainMs({ spans: saved }, 'a.test') + 1_000);
    assertClose(domainMs(next, 'a.test') - domainMs({ spans: saved }, 'a.test'), 2_000);
  } finally {
    await second.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('S16 reloading the extension drops at most the unflushed tail', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagetime-'));
  const first = await launch(userDataDir);
  let kept = 0;
  try {
    const page = await first.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(first, 'a.test');
    await page.waitForTimeout(STAY);
    await page.goto('about:blank');
    const flushed = await waitForSpan(first, 'a.test', STAY - TOLERANCE);
    kept = totalMs(flushed);
    await page.goto(pageUrl('a.test', '/tail'));
    await waitForDomain(first, 'a.test');
    await page.waitForTimeout(3_000);
    // This Chromium build disables an unpacked extension on runtime.reload()
    // and does not start it again until the browser process loads it.
    await (await worker(first)).evaluate(() => chrome.runtime.reload()).catch(() => {});
    await expect.poll(() => first.serviceWorkers().length).toBe(0);
    await page.goto('about:blank');
  } finally {
    await first.close();
  }
  const second = await launch(userDataDir);
  try {
    const data = await readData(await worker(second));
    const base = totalMs(data);
    expect(base - kept).toBeGreaterThanOrEqual(0);
    expect(base - kept).toBeLessThan(1_000);
    const page = await second.newPage();
    await page.goto(pageUrl('a.test', '/again'));
    await waitForDomain(second, 'a.test');
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    const next = await waitForSpan(second, 'a.test', base + 1_000);
    assertClose(totalMs(next) - base, 2_000);
  } finally {
    await second.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('deleting a site from the dashboard removes it from the ranking and the detail list', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    const pageA = await context.newPage();
    await pageA.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await pageA.waitForTimeout(2_000);
    const pageB = await context.newPage();
    await pageB.goto(pageUrl('b.test'));
    await waitForDomain(context, 'b.test');
    await pageB.waitForTimeout(2_000);
    await pageB.goto('about:blank');
    await waitForSpan(context, 'b.test', 1_000);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.getByRole('button', { name: 'a.test' }).first()).toBeVisible();
    await dashboard.getByRole('button', { name: 'a.test' }).first().click();
    await dashboard.getByRole('button', { name: "Delete this site's records", exact: true }).click();
    const confirm = dashboard.getByRole('alertdialog');
    await expect(confirm).toContainText('Delete records for a.test?');
    await expect(confirm).toContainText("can't be undone");
    await confirm.getByRole('button', { name: 'Delete records', exact: true }).click();
    await expect(dashboard.getByRole('button', { name: 'a.test' })).toHaveCount(0);
    await expect(dashboard.getByRole('button', { name: 'b.test' }).first()).toBeVisible();
    await dashboard.getByRole('button', { name: 'b.test' }).first().click();
    await expect(dashboard.getByRole('dialog')).toContainText('b.test');
    const data = await readData(await worker(context));
    expect(data.spans.some(span => span.domain === 'a.test')).toBe(false);
    expect(data.visits.some(visit => visit.domain === 'a.test')).toBe(false);
    expect(domainMs(data, 'b.test')).toBeGreaterThan(0);
  });
});

async function openSettings(context, sw) {
  const dashboard = await context.newPage();
  await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
  await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
  await dashboard.reload();
  await dashboard.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(dashboard.getByRole('heading', { name: 'Export data' })).toBeVisible();
  return dashboard;
}

async function exportFile(dashboard, name) {
  const started = dashboard.waitForEvent('download');
  await dashboard.getByRole('button', { name, exact: true }).click();
  const download = await started;
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(await download.path()) };
}

async function readRows(sw, names) {
  return sw.evaluate(async names => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pagetime-ledger');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(names, 'readonly');
      return Object.fromEntries(await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve([name, request.result]);
        request.onerror = () => reject(request.error);
      }))));
    } finally {
      db.close();
    }
  }, names);
}

test('exporting from settings downloads the ledger as JSON and as a daily CSV', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    const page = await context.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    await waitForSpan(context, 'a.test', 1_000);
    const dashboard = await openSettings(context, sw);
    await expect(dashboard.getByText('The file is saved only on your computer. It contains hostnames and durations, never URLs or titles.')).toBeVisible();
    const stored = await readRows(sw, ['domains', 'days', 'hours', 'spans', 'visits']);

    const json = await exportFile(dashboard, 'Export JSON');
    const today = await dashboard.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    expect(json.name).toBe(`pagetime-${today}.json`);
    const document = JSON.parse(json.bytes.toString('utf8'));
    expect(document.format).toBe('pagetime-ledger');
    expect(document.schemaVersion).toBe(1);
    expect(Date.parse(document.exportedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(document.timeZone).toBe(await dashboard.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
    expect(document.appVersion).toBe(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
    expect(document.recording.enabled).toBe(true);
    expect(document.settings).toMatchObject({ recordMode: 'blacklist', siteMerge: 'prefix', ignored: [], allowed: [] });
    expect(Object.keys(document.tables)).toEqual(['domains', 'days', 'hours', 'spans', 'visits']);
    const id = document.tables.domains.find(row => row.host === 'a.test').id;
    expect(document.tables.days).toEqual(stored.days.map(({ date, domainId, ms, visits }) => ({ date, domainId, ms, visits })));
    expect(document.tables.spans.length).toBe(stored.spans.length);
    expect(document.tables.visits.length).toBe(stored.visits.length);
    expect(document.tables.hours.filter(row => row.domainId === id).reduce((sum, row) => sum + row.ms, 0))
      .toBe(document.tables.days.filter(row => row.domainId === id).reduce((sum, row) => sum + row.ms, 0));
    expect(json.bytes.toString('utf8')).not.toMatch(/http:\/\/|<title>|pagetime<\/title>/);
    await expect(dashboard.getByRole('status')).toHaveText(`Saved pagetime-${today}.json.`);

    const csv = await exportFile(dashboard, 'Export CSV');
    expect(csv.name).toBe(`pagetime-${today}.csv`);
    expect(csv.bytes.subarray(0, 3).toString('hex')).toBe('efbbbf');
    const lines = csv.bytes.toString('utf8').slice(1).split('\r\n');
    expect(lines[0]).toBe('date,host,active_ms,visits');
    expect(lines.at(-1)).toBe('');
    const row = stored.days.find(day => day.domainId === id && day.date === today);
    expect(lines).toContain(`${today},a.test,${row.ms},${row.visits}`);

    await dashboard.evaluate(() => { URL.createObjectURL = () => { throw new Error('blocked'); }; });
    await dashboard.getByRole('button', { name: 'Export CSV', exact: true }).click();
    await expect(dashboard.getByRole('alert')).toContainText('Export failed');
    await expect(dashboard.getByRole('alert')).toContainText('Nothing was downloaded. Try again.');
    await expect(dashboard.getByRole('button', { name: 'Export JSON', exact: true })).toBeEnabled();
  });
});

test('a one-year ledger of 200 sites exports with a progress state and the page keeps painting', async () => {
  test.setTimeout(180_000);
  await withBrowser(async context => {
    const sw = await worker(context);
    await expect.poll(async () => (await readData(sw))?.enabled).toBe(true);
    const seeded = await sw.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('pagetime-ledger');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const first = new Date();
      first.setHours(0, 0, 0, 0);
      first.setDate(first.getDate() - 364);
      const key = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      let days = 0, hours = 0;
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['meta', 'domains', 'days', 'hours'], 'readwrite');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.objectStore('meta').put({ key: 'state', value: { enabled: true, since: first.getTime() } });
          for (let id = 1; id <= 200; id++) tx.objectStore('domains').put({ id, host: `site-${id}.example.com` });
          for (let d = 0; d < 365; d++) {
            const at = new Date(first);
            at.setDate(at.getDate() + d);
            const date = key(at.getTime());
            for (let id = 1; id <= 200; id++) {
              tx.objectStore('days').put({ date, domainId: id, ms: 4 * 600_000, visits: 3 });
              days++;
              for (const hour of [9, 11, 14, 20]) { tx.objectStore('hours').put({ date, hour, domainId: id, ms: 600_000 }); hours++; }
            }
          }
        });
      } finally {
        db.close();
      }
      return { days, hours };
    });
    expect(seeded).toEqual({ days: 73_000, hours: 292_000 });
    const dashboard = await openSettings(context, sw);
    await dashboard.evaluate(() => {
      window.PAGETIME_LONGEST = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.PAGETIME_LONGEST = Math.max(window.PAGETIME_LONGEST, entry.duration);
      }).observe({ type: 'longtask' });
      window.PAGETIME_FRAMES = 0;
      const frame = () => { window.PAGETIME_FRAMES++; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    const started = Date.now();
    const downloaded = dashboard.waitForEvent('download', { timeout: 120_000 });
    const framesBefore = await dashboard.evaluate(() => window.PAGETIME_FRAMES);
    await dashboard.getByRole('button', { name: 'Export JSON', exact: true }).click();
    await expect(dashboard.getByRole('status')).toHaveText('Exporting…');
    await expect(dashboard.getByRole('button', { name: 'Export CSV', exact: true })).toBeDisabled();
    const download = await downloaded;
    const elapsed = Date.now() - started;
    const { longest, frames } = await dashboard.evaluate(() => ({ longest: window.PAGETIME_LONGEST, frames: window.PAGETIME_FRAMES }));
    const document = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    console.log(`large export: ${elapsed} ms, ${frames - framesBefore} frames painted, longest main-thread task ${Math.round(longest)} ms, ${(fs.statSync(await download.path()).size / 1e6).toFixed(1)} MB`);
    expect(document.tables.days).toHaveLength(73_000);
    expect(document.tables.hours).toHaveLength(292_000);
    expect(document.tables.domains).toHaveLength(200);
    expect(frames - framesBefore).toBeGreaterThan(5);
    expect(longest).toBeLessThan(1_000);
    await expect(dashboard.getByRole('status')).toHaveText(/^Saved pagetime-\d{4}-\d{2}-\d{2}\.json\.$/);
    await expect(dashboard.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled();
  });
});

test('an open dashboard shows background writes without a reload', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await expect(dashboard.locator('main')).toBeVisible();
    await expect.poll(async () => (await readData(sw))?.enabled).toBe(true);
    await expect(dashboard.getByText('a.test')).toHaveCount(0);
    await dashboard.evaluate(() => { window.PAGETIME_MARKER = 'kept'; });
    const page = await context.newPage();
    await page.goto(pageUrl('a.test'));
    await waitForDomain(context, 'a.test');
    await page.waitForTimeout(2_000);
    await page.goto('about:blank');
    await waitForSpan(context, 'a.test', 1_000);
    await expect(dashboard.getByText('a.test').first()).toBeAttached();
    expect(await dashboard.evaluate(() => window.PAGETIME_MARKER)).toBe('kept');
  });
});

// Writes ledger rows the way the background would have, for days that already passed, so the dashboard has a previous period to read.
async function seedOldDays(sw) {
  await sw.evaluate(async () => {
    const day = offset => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pagetime-ledger');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const tx = db.transaction(['meta', 'domains', 'days'], 'readwrite');
    const since = new Date();
    since.setDate(since.getDate() - 14);
    tx.objectStore('meta').put({ key: 'state', value: { enabled: true, since: since.getTime() } });
    const added = tx.objectStore('domains').add({ host: 'old.test' });
    added.onsuccess = () => {
      const domainId = added.result;
      tx.objectStore('days').put({ date: day(-3), domainId, ms: 30 * 60_000, visits: 2 });
      tx.objectStore('days').put({ date: day(-10), domainId, ms: 20 * 60_000, visits: 1 });
    };
    await done(tx);
    db.close();
  });
}

test('the overview compares each KPI with the previous period and says when it cannot', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    await expect.poll(async () => (await readData(sw))?.enabled).toBe(true);
    await seedOldDays(sw);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    const lines = dashboard.locator('[data-compare]');
    await expect(dashboard.getByRole('button', { name: /How is this time counted/ })).toHaveCount(0);
    await dashboard.getByRole('button', { name: /^Date range/ }).click();
    await dashboard.getByRole('menuitemradio', { name: 'Last 7 days' }).click();
    await expect(dashboard.locator('[data-compare="ms"]')).toContainText('vs previous 7 days');
    await expect(dashboard.locator('[data-compare="ms"]')).toContainText('+10 min (+50%)');
    await expect(dashboard.locator('[data-compare="visits"]')).toContainText('+1 (+100%)');
    await expect(dashboard.locator('[data-compare="sites"]')).toContainText('No change');
    await dashboard.locator('[data-compare="ms"]').hover();
    await expect(dashboard.getByText(/^Previous period: \d\d\/\d\d–\d\d\/\d\d/)).toBeVisible();

    await dashboard.getByRole('button', { name: /^Date range/ }).click();
    await dashboard.getByRole('menuitemradio', { name: 'Last 30 days' }).click();
    for (const line of await lines.all()) {
      await expect(line.locator('.kpi-compare-change')).toHaveText('—');
      await expect(line).not.toContainText('Recording started on');
    }
    await lines.first().hover();
    await expect(dashboard.getByText('Not enough recorded data to compare.')).toBeVisible();
  });
});

test('the date control fits a 320px and a 375px page and its step buttons still work', async () => {
  await withBrowser(async context => {
    const sw = await worker(context);
    await expect.poll(async () => (await readData(sw))?.enabled).toBe(true);
    await seedOldDays(sw);
    const dashboard = await context.newPage();
    await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
    const fits = () => dashboard.evaluate(() => {
      const edges = [...document.querySelectorAll('.range-control > :not(form)')].map(node => node.getBoundingClientRect());
      return document.documentElement.scrollWidth <= window.innerWidth && edges.every(edge => edge.left >= 0 && edge.right <= window.innerWidth);
    });
    for (const language of ['en', 'de', 'ru']) {
      await dashboard.evaluate(code => localStorage.setItem('pagetime-language', code), language);
      for (const width of [320, 375]) {
        await dashboard.setViewportSize({ width, height: 700 });
        await dashboard.reload();
        const trigger = dashboard.locator('.range-control .range');
        await trigger.click();
        await dashboard.getByRole('menuitemradio').nth(2).click();
        expect(await fits(), `${language} ${width}px, 30 days`).toBe(true);
        const sizes = await dashboard.evaluate(() => [...document.querySelectorAll('.range-control > *:not(form)')].map(node => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height), node.scrollHeight <= node.clientHeight]; }));
        expect(sizes[0], `${language} ${width}px, previous button size`).toEqual([38, 38, true]);
        expect(sizes[2], `${language} ${width}px, next button size`).toEqual([38, 38, true]);
        expect(sizes[1][1], `${language} ${width}px, date button height`).toBe(38);
        expect(sizes[1][2], `${language} ${width}px, date button text is not clipped`).toBe(true);
        await trigger.click();
        await dashboard.getByRole('menuitemradio').nth(1).click();
        const label = await trigger.getAttribute('aria-label');
        const steps = dashboard.locator('.range-step');
        await expect(steps).toHaveCount(2);
        await steps.first().click();
        expect(await trigger.getAttribute('aria-label'), `${language} ${width}px, previous period`).not.toBe(label);
        expect(await fits(), `${language} ${width}px, paged`).toBe(true);
        const paged = await trigger.getAttribute('aria-label');
        await steps.last().focus();
        await dashboard.keyboard.press('Enter');
        expect(await trigger.getAttribute('aria-label'), `${language} ${width}px, next period by keyboard`).not.toBe(paged);
      }
    }
    await dashboard.setViewportSize({ width: 1100, height: 800 });
    await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
    await dashboard.reload();
    await expect(dashboard.getByRole('button', { name: 'Previous period' })).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Next period' })).toBeVisible();
  });
});
