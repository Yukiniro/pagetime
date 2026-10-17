import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../../src/model.mjs';
import * as validation from '../../src/validate-data.mjs';

export const WINDOW_ID_NONE = -1;
export const ALARM_PERIOD = model.CHECKPOINT_SECONDS * 1_000;

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

// Service worker awaits only resolve on the microtask queue, so one macrotask
// drains the serial recording queue. A second turn catches the queue's tail.
async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

export async function createHarness({ now: start = 1_000_000, url = 'https://example.com/private?key=secret' } = {}) {
  let now = start;
  let idle = 'active';
  let nextWindowId = 1;
  let nextTabId = 1;
  let nextAlarm = start + ALARM_PERIOD;
  let localWrites = 0;
  let lastWriteBytes = 0;
  const errors = [];
  const windows = new Map();
  const tabs = new Map();
  const local = {};
  const session = {};
  let browser = null;

  class ClockDate extends Date { static now() { return now; } }

  function area(store, trackWrites) {
    return {
      async get(key) { return structuredClone({ [key]: store[key] }); },
      async set(patch) {
        if (trackWrites) {
          localWrites += 1;
          lastWriteBytes = Buffer.byteLength(JSON.stringify(patch));
        }
        Object.assign(store, structuredClone(patch));
      },
      async remove(key) { delete store[key]; },
    };
  }

  function makeBrowser() {
    return {
      storage: { local: area(local, true), session: area(session, false) },
      idle: { queryState: async () => idle, setDetectionInterval() {}, onStateChanged: event() },
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
    browser = makeBrowser();
    const context = {
      exports: {},
      console: { ...console, error: (...args) => { errors.push(args); } },
      Date: ClockDate,
      setTimeout(...args) {
        const timer = setTimeout(...args);
        timer.unref();
        return timer;
      },
      clearTimeout,
      require: name => name === 'wxt/browser' ? { browser }
        : name === 'wxt/utils/define-background' ? { defineBackground: fn => fn() }
        : name.endsWith('validate-data.mjs') ? validation
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
    tabs.set(tabId, { id: tabId, windowId, url: tabUrl, incognito, active: true, audible });
    return { windowId, tabId };
  }

  function openTab(windowId, tabUrl, { audible = false } = {}) {
    const win = windows.get(windowId);
    if (!win) throw new Error('no window');
    const tabId = nextTabId++;
    tabs.set(tabId, { id: tabId, windowId, url: tabUrl, incognito: win.incognito, active: false, audible });
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

  function setAudible(tabId, audible) {
    const tab = tabs.get(tabId);
    if (!tab) throw new Error('no tab');
    tab.audible = audible;
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

  function message(type) {
    return new Promise(resolve => {
      browser.runtime.onMessage.listeners[0]({ type }, { id: 'jilan', url: 'chrome-extension://jilan/dashboard.html' }, resolve);
    });
  }

  openWindow({ url, focused: true });
  await boot();

  return {
    errors,
    get browser() { return browser; },
    get now() { return now; },
    get localWrites() { return localWrites; },
    get lastWriteBytes() { return lastWriteBytes; },
    settle,
    openWindow,
    openTab,
    focus,
    activate,
    navigate,
    setIdle,
    setAudible,
    fireAlarm,
    advance,
    setNow(value) { now = value; },
    message,
    snapshot() { return message('snapshot'); },
    read() { return structuredClone(local.data ?? null); },
    cursor() { return structuredClone(session.cursor ?? null); },
    seed(data) { local.data = structuredClone(data); },
    resetWrites() { localWrites = 0; lastWriteBytes = 0; },
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
