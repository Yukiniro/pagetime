import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { addSpan, blankData, CHECKPOINT_SECONDS, creditUntil, domainOf, prune } from '../src/model.mjs';
import { validateSettings } from '../src/settings.mjs';
import { validateData } from '../src/validate-data.mjs';

type Data = { visits: {domain: string; at: number}[]; spans: {domain: string; start: number; end: number}[]; enabled: boolean; since: number };
type Cursor = { tabId: number; domain: string; since: number };

export default defineBackground(() => {
  let queue = Promise.resolve();
  const run = <T>(task: () => Promise<T>) => {
    const result = queue.then(task);
    queue = result.then(() => {}, error => console.error('PageTime recording failed', error));
    return result;
  };
  const read = async (): Promise<Data> => {
    const stored = (await browser.storage.local.get('data')).data;
    return stored === undefined ? blankData() : validateData(stored);
  };
  const readSettings = async () => validateSettings((await browser.storage.local.get('settings')).settings);
  const applyIdle = (settings: { idleSeconds: number }) => { browser.idle.setDetectionInterval(settings.idleSeconds); };
  const cursor = async (): Promise<Cursor | undefined> => (await browser.storage.session.get('cursor')).cursor as Cursor | undefined;
  let rechecks: ReturnType<typeof setTimeout>[] = [];
  // getAll() can lag a focus or bounds event. A few reads cover that lag, then the worker may sleep.
  const clearRechecks = () => { for (const timer of rechecks) clearTimeout(timer); rechecks = []; };
  const recheckSoon = (windowId: number) => {
    clearRechecks();
    rechecks = [200, 700, 1_500].map(delay => setTimeout(() => {
      void run(async () => { if (!(await cursor())) await update(windowId); });
    }, delay));
  };

  async function active(focusedId?: number, trustId = false): Promise<{id: number; domain: string} | null> {
    const settings = await readSettings();
    const state = await browser.idle.queryState(settings.idleSeconds);
    if (state === 'locked') return null;
    const windows = await browser.windows.getAll();
    const reported = windows.find(w => w.focused && !w.incognito && w.state !== 'minimized');
    const hinted = focusedId !== undefined && focusedId !== browser.windows.WINDOW_ID_NONE
      ? windows.find(w => w.id === focusedId && !w.incognito && (trustId || w.state !== 'minimized'))
      : undefined;
    const focused = reported ?? hinted;
    if (focused?.id === undefined) return null;
    const [tab] = await browser.tabs.query({ active: true, windowId: focused.id });
    const domain = !tab?.incognito && domainOf(tab?.url);
    if (!domain || tab?.id === undefined) return null;
    const playing = Boolean(tab.audible) && !tab.mutedInfo?.muted;
    if (state === 'idle' && !(settings.countAudible && playing)) return null;
    if (state !== 'active' && state !== 'idle') return null;
    return { id: tab.id, domain };
  }

  async function flush(data: Data, now: number) {
    const previous = await cursor();
    if (!previous) return;
    const end = creditUntil(previous, now);
    const lastEnd = data.spans.at(-1)?.end;
    const start = lastEnd !== undefined && lastEnd > previous.since ? lastEnd : previous.since;
    if (data.enabled) addSpan(data, previous.domain, start, end);
  }

  async function update(focusedId?: number, trustId = false) {
    const now = Date.now();
    const data = await read();
    const previous = await cursor();
    await flush(data, now);
    const next = data.enabled ? await active(focusedId, trustId) : null;
    prune(data, now);
    await browser.storage.local.set({ data });
    if (next) {
      clearRechecks();
      // A backward clock must not move the cursor into the past, or the catch-up span overlaps stored time.
      const since = previous && now < previous.since ? previous.since : now;
      await browser.storage.session.set({ cursor: { tabId: next.id, domain: next.domain, since } });
    } else await browser.storage.session.remove('cursor');
  }

  browser.tabs.onActivated.addListener(({ windowId }) => { void run(() => update(windowId)); });
  browser.tabs.onRemoved.addListener(() => { void run(() => update()); });
  browser.tabs.onUpdated.addListener((_id, changes) => {
    if (changes.url !== undefined || changes.audible !== undefined || changes.mutedInfo !== undefined) void run(() => update());
  });
  browser.windows.onFocusChanged.addListener(windowId => {
    void run(async () => {
      await update(windowId);
      if (windowId !== browser.windows.WINDOW_ID_NONE && !(await cursor())) recheckSoon(windowId);
    });
  });
  browser.windows.onBoundsChanged.addListener(win => {
    const restored = win.id !== undefined && win.focused && !win.incognito && win.state !== 'minimized';
    void run(async () => {
      await update(restored ? win.id : undefined, restored);
      if (restored && win.id !== undefined && !(await cursor())) recheckSoon(win.id);
    });
  });
  browser.idle.onStateChanged.addListener(() => { void run(() => update()); });
  browser.webNavigation.onCommitted.addListener(details => {
    if (details.frameId !== 0) return;
    void run(async () => {
      const tab = await browser.tabs.get(details.tabId).catch(() => null);
      const domain = domainOf(details.url);
      const data = await read();
      if (data.enabled && domain && tab && !tab.incognito) {
        data.visits.push({ domain, at: details.timeStamp });
        prune(data, Date.now());
        await browser.storage.local.set({data});
      }
      await update();
    });
  });
  browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) void run(() => update());
  });
  browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'checkpoint') void run(() => update()); });
  browser.runtime.onStartup.addListener(() => { void run(async () => { await browser.storage.session.remove('cursor'); applyIdle(await readSettings()); await update(); }); });
  browser.action.onClicked.addListener(() => { void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') }); });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/dashboard.html'))) return;
    if (!['snapshot', 'toggle', 'clear', 'settings'].includes(message?.type)) return;
    void run(async () => {
      if (message.type === 'clear') {
        const data = await read();
        await browser.storage.session.remove('cursor');
        await browser.storage.local.set({ data: { ...blankData(), enabled: data.enabled } });
      } else if (message.type === 'toggle') {
        await update();
        const data = await read(); data.enabled = !data.enabled;
        await browser.storage.local.set({ data });
        await browser.storage.session.remove('cursor');
      } else if (message.type === 'settings' && message.settings !== undefined) {
        const next = validateSettings(message.settings);
        await browser.storage.local.set({ settings: next });
        applyIdle(next);
        await update();
      }
      if (message.type === 'settings') return { settings: await readSettings() };
      await update();
      return { data: await read() };
    }).then(sendResponse, error => sendResponse({ error: error?.message === 'data' ? 'data' : 'save' }));
    return true;
  });
  void browser.alarms.create('checkpoint', { periodInMinutes: CHECKPOINT_SECONDS / 60 });
  void run(async () => { applyIdle(await readSettings()); await update(); });
});
