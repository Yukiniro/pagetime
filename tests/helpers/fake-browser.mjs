import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as ledger from '../../src/ledger.mjs';
import * as model from '../../src/model.mjs';
import * as settings from '../../src/settings.mjs';

export const WINDOW_ID_NONE = -1;
export const ALARM_PERIOD = model.CHECKPOINT_SECONDS * 1_000;

// The ledger in the shape the old storage.local `data` key had, so timing assertions read the same.
export async function readLedger(db) {
  const hosts = new Map((await db.domains.toArray()).map(row => [row.id, row.host]));
  const state = await ledger.readState(db);
  return {
    visits: (await db.visits.toArray()).map(visit => ({ domain: hosts.get(visit.domainId), at: visit.at })),
    spans: (await db.spans.orderBy('start').toArray()).map(span => ({ domain: hosts.get(span.domainId), start: span.start, end: span.end })),
    enabled: state?.enabled ?? true,
    since: state?.since ?? null,
  };
}

let code;

async function backgroundCode() {
  if (code) return code;
  const source = await fs.readFile(new URL('../../entrypoints/background.ts', import.meta.url), 'utf8');
  code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return code;
}

function event() {
  return { listeners: [], addListener(fn) { this.listeners.push(fn); }, fire(...args) { for (const fn of this.listeners) fn(...args); } };
}

export async function createHarness({ now: start = 1_000_000, url = 'https://example.com/private?key=secret' } = {}) {
  let now = start;
  let idle = 'active';
  let nextWindowId = 1;
  let nextTabId = 1;
  let nextAlarm = start + ALARM_PERIOD;
  let ticks = 0;
  let pending = 0;
  let pruneError = null;
  const errors = [];
  const windows = new Map();
  const tabs = new Map();
  const local = {};
  const session = {};
  const detectionIntervals = [];
  const idleQueries = [];
  let browser = null;
  const factory = new IDBFactory();
  const reader = ledger.openLedger({ indexedDB: factory, IDBKeyRange });
  const workerDbs = [];
  // Every ledger call from the worker goes through reopening() or pruneDetail(), so counting those calls tells when it is idle.
  const workerLedger = {
    ...ledger,
    openLedger() {
      const db = ledger.openLedger({ indexedDB: factory, IDBKeyRange });
      workerDbs.push(db);
      return db;
    },
    commitTick(...args) { ticks += 1; return ledger.commitTick(...args); },
    async pruneDetail(...args) {
      pending += 1;
      try {
        if (pruneError) throw pruneError;
        return await ledger.pruneDetail(...args);
      } finally { pending -= 1; }
    },
    async reopening(...args) {
      pending += 1;
      try { return await ledger.reopening(...args); }
      finally { pending -= 1; }
    },
  };

  class ClockDate extends Date { static now() { return now; } }

  // IndexedDB work spans macrotasks, so wait until no ledger call is in flight for a whole turn.
  async function settle() {
    for (let idleTurns = 0; idleTurns < 2;) {
      await new Promise(resolve => setImmediate(resolve));
      idleTurns = pending ? 0 : idleTurns + 1;
    }
  }

  function area(store) {
    return {
      async get(key) { return structuredClone({ [key]: store[key] }); },
      async set(patch) { Object.assign(store, structuredClone(patch)); },
      async remove(key) { delete store[key]; },
    };
  }

  function makeBrowser() {
    return {
      storage: { local: area(local), session: area(session) },
      idle: {
        queryState: async seconds => { idleQueries.push(seconds); return idle; },
        setDetectionInterval(seconds) { detectionIntervals.push(seconds); },
        onStateChanged: event(),
      },
      windows: {
        WINDOW_ID_NONE,
        // Chrome's default getAll() omits devtools windows.
        getAll: async () => [...windows.values()].filter(win => win.type !== 'devtools').map(win => structuredClone(win)),
        onFocusChanged: event(),
        onBoundsChanged: event(),
      },
      tabs: {
        query: async query => [...tabs.values()].filter(tab => {
          if (query?.active !== undefined && tab.active !== query.active) return false;
          if (query?.windowId !== undefined && tab.windowId !== query.windowId) return false;
          return true;
        }).map(tab => structuredClone(tab)),
        get: async id => {
          const tab = tabs.get(id);
          if (!tab) throw new Error('no tab');
          return structuredClone(tab);
        },
        onActivated: event(),
        onRemoved: event(),
        onUpdated: event(),
        create: async () => {},
      },
      webNavigation: { onCommitted: event(), onHistoryStateUpdated: event() },
      alarms: { create: async () => {}, onAlarm: event() },
      runtime: { id: 'jilan', getURL: path => 'chrome-extension://jilan' + path, onStartup: event(), onMessage: event() },
      action: { onClicked: event() },
    };
  }

  async function boot() {
    for (const db of workerDbs.splice(0)) db.close();
    browser = makeBrowser();
    const context = {
      exports: {},
      console: { ...console, error: (...args) => { errors.push(args); } },
      Date: ClockDate,
      crypto: globalThis.crypto,
      setTimeout(...args) {
        const timer = setTimeout(...args);
        timer.unref();
        return timer;
      },
      clearTimeout,
      require: name => name === 'wxt/browser' ? { browser }
        : name === 'wxt/utils/define-background' ? { defineBackground: fn => fn() }
        : name.endsWith('ledger.mjs') ? workerLedger
        : name.endsWith('settings.mjs') ? settings
        : model,
    };
    vm.runInNewContext(await backgroundCode(), context, { filename: 'background.ts' });
    nextAlarm = now + ALARM_PERIOD;
    await settle();
  }

  function openWindow({ url: tabUrl = 'https://a.test/', focused = false, incognito = false, type = 'normal', audible = false } = {}) {
    const windowId = nextWindowId++;
    const tabId = nextTabId++;
    if (focused) for (const win of windows.values()) win.focused = false;
    windows.set(windowId, { id: windowId, focused, incognito, type, state: 'normal' });
    tabs.set(tabId, { id: tabId, windowId, url: tabUrl, incognito, active: true, audible, mutedInfo: { muted: false } });
    return { windowId, tabId };
  }

  function openTab(windowId, tabUrl, { audible = false } = {}) {
    const win = windows.get(windowId);
    if (!win) throw new Error('no window');
    const tabId = nextTabId++;
    tabs.set(tabId, { id: tabId, windowId, url: tabUrl, incognito: win.incognito, active: false, audible, mutedInfo: { muted: false } });
    return tabId;
  }

  async function focus(windowId) {
    for (const win of windows.values()) win.focused = win.id === windowId;
    const target = windows.get(windowId);
    if (target?.type !== 'devtools' && target) target.state = 'normal';
    browser.windows.onFocusChanged.fire(windowId);
    await settle();
  }

  async function activate(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no tab');
    for (const other of tabs.values()) if (other.windowId === tab.windowId) other.active = other.id === tabId;
    browser.tabs.onActivated.fire({ tabId, windowId: tab.windowId });
    await settle();
  }

  async function navigate(tabId, nextUrl, { history = false, frameId = 0 } = {}) {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no tab');
    tab.url = nextUrl;
    const details = { url: nextUrl, frameId, tabId, timeStamp: now };
    if (history) browser.webNavigation.onHistoryStateUpdated.fire(details);
    else browser.webNavigation.onCommitted.fire(details);
    if (frameId === 0) browser.tabs.onUpdated.fire(tabId, { url: nextUrl }, { ...tab });
    await settle();
  }

  async function setIdle(state) {
    idle = state;
    browser.idle.onStateChanged.fire(state);
    await settle();
  }

  async function setAudible(tabId, audible) {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no tab');
    tab.audible = audible;
    browser.tabs.onUpdated.fire(tabId, { audible }, structuredClone(tab));
    await settle();
  }

  async function setMuted(tabId, muted) {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no tab');
    tab.mutedInfo = { muted };
    browser.tabs.onUpdated.fire(tabId, { mutedInfo: { muted } }, structuredClone(tab));
    await settle();
  }

  async function fireAlarm() {
    if (!browser) throw new Error('worker is dead');
    browser.alarms.onAlarm.fire({ name: 'checkpoint' });
    nextAlarm = now + ALARM_PERIOD;
    await settle();
  }

  async function advance(ms, { alarms = false } = {}) {
    if (ms < 0 || !alarms || !browser) {
      now += ms;
      if (nextAlarm <= now) nextAlarm = now + ALARM_PERIOD;
      return;
    }
    let left = ms;
    while (left > 0) {
      const wait = Math.max(0, nextAlarm - now);
      if (wait > left) {
        now += left;
        return;
      }
      now += wait;
      left -= wait;
      browser.alarms.onAlarm.fire({ name: 'checkpoint' });
      nextAlarm += ALARM_PERIOD;
      await settle();
    }
  }

  function message(type, body) {
    return new Promise(resolve => {
      browser.runtime.onMessage.listeners[0]({ type, ...body }, { id: 'jilan', url: 'chrome-extension://jilan/dashboard.html' }, resolve);
    });
  }

  // The dashboard reads the ledger itself; this returns what it would see after the command.
  async function command(type, body) {
    const response = await message(type, body);
    return response.error ? response : { ...response, data: await readLedger(reader) };
  }

  openWindow({ url, focused: true });
  await boot();

  return {
    errors,
    db: reader,
    get browser() { return browser; },
    get now() { return now; },
    get ticks() { return ticks; },
    get local() { return structuredClone(local); },
    get workerDb() { return workerDbs.at(-1); },
    settle,
    openWindow,
    openTab,
    focus,
    activate,
    navigate,
    setIdle,
    setAudible,
    setMuted,
    get detectionIntervals() { return [...detectionIntervals]; },
    get idleQueries() { return [...idleQueries]; },
    fireAlarm,
    advance,
    setNow(value) { now = value; },
    message,
    command,
    snapshot() { return command('snapshot'); },
    read() { return readLedger(reader); },
    async cursor() {
      const cursor = (await ledger.readHead(reader)).cursor;
      if (!cursor || cursor.session !== session.session) return null;
      const { session: _, ...rest } = cursor;
      return rest;
    },
    resetTicks() { ticks = 0; },
    failPrune(error) { pruneError = error; },
    killWorker() { browser = null; },
    async restartWorker() { browser = null; await boot(); },
    async reloadExtension() {
      browser = null;
      for (const key of Object.keys(session)) delete session[key];
      await boot();
    },
    async restartBrowser() {
      browser = null;
      for (const key of Object.keys(session)) delete session[key];
      await boot();
      browser.runtime.onStartup.fire();
      await settle();
    },
    setFocus(focused) {
      const win = windows.get(1);
      if (win) { win.focused = focused; win.state = focused ? 'normal' : 'minimized'; }
      browser.windows.onFocusChanged.fire(focused ? 1 : WINDOW_ID_NONE);
    },
    async restoreWindow(windowId) {
      const win = windows.get(windowId);
      if (!win) throw new Error('no window');
      // getAll() stays minimized while the bounds listener runs, matching a stale restore event.
      browser.windows.onBoundsChanged.fire({ ...win, focused: true, state: 'normal' });
      await settle();
      for (const other of windows.values()) other.focused = other.id === windowId;
      win.state = 'normal';
    },
    setTab(patch) {
      Object.assign(tabs.get(1), patch);
      const tab = tabs.get(1);
      browser.tabs.onActivated.fire({ tabId: tab.id, windowId: tab.windowId });
    },
  };
}
