import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { addSpan, blankData, CHECKPOINT_SECONDS, creditUntil, domainOf, IDLE_SECONDS, prune } from '../src/model.mjs';
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
  const cursor = async (): Promise<Cursor | undefined> => (await browser.storage.session.get('cursor')).cursor as Cursor | undefined;
  let refocus: ReturnType<typeof setInterval> | undefined;
  const stopRefocus = () => { if (refocus === undefined) return; clearInterval(refocus); refocus = undefined; };
  // Restoring a minimized window often emits no focus event, and the one it does emit can run while getAll() still says minimized.
  const watchMinimized = () => {
    if (refocus !== undefined) return;
    refocus = setInterval(() => {
      void run(async () => {
        const windows = await browser.windows.getAll();
        const minimized = windows.some(w => !w.incognito && w.state === 'minimized');
        const focused = windows.some(w => w.focused && !w.incognito && w.state !== 'minimized');
        if (focused) await update();
        else if (!minimized) stopRefocus();
      });
    }, 400);
  };

  async function active(focusedId?: number): Promise<{id: number; domain: string} | null> {
    if (await browser.idle.queryState(IDLE_SECONDS) !== 'active') return null;
    const windows = await browser.windows.getAll();
    const reported = windows.find(w => w.focused && !w.incognito);
    const hinted = focusedId !== undefined && focusedId !== browser.windows.WINDOW_ID_NONE
      ? windows.find(w => w.id === focusedId && !w.incognito && w.state !== 'minimized')
      : undefined;
    const focused = reported ?? hinted;
    if (focused?.id === undefined) return null;
    const [tab] = await browser.tabs.query({ active: true, windowId: focused.id });
    const domain = !tab?.incognito && domainOf(tab?.url);
    return domain && tab?.id !== undefined ? { id: tab.id, domain } : null;
  }

  async function flush(data: Data, now: number) {
    const previous = await cursor();
    if (!previous) return;
    const end = creditUntil(previous, now);
    const lastEnd = data.spans.at(-1)?.end;
    const start = lastEnd !== undefined && lastEnd > previous.since ? lastEnd : previous.since;
    if (data.enabled) addSpan(data, previous.domain, start, end);
  }

  async function update(focusedId?: number) {
    const now = Date.now();
    const data = await read();
    const previous = await cursor();
    await flush(data, now);
    const next = data.enabled ? await active(focusedId) : null;
    prune(data, now);
    await browser.storage.local.set({ data });
    if (next) {
      stopRefocus();
      // A backward clock must not move the cursor into the past, or the catch-up span overlaps stored time.
      const since = previous && now < previous.since ? previous.since : now;
      await browser.storage.session.set({ cursor: { tabId: next.id, domain: next.domain, since } });
    } else {
      await browser.storage.session.remove('cursor');
      const windows = await browser.windows.getAll();
      if (windows.some(w => !w.incognito && w.state === 'minimized')) watchMinimized();
      else stopRefocus();
    }
  }

  browser.tabs.onActivated.addListener(() => { void run(() => update()); });
  browser.tabs.onRemoved.addListener(() => { void run(() => update()); });
  browser.tabs.onUpdated.addListener((_id, changes) => { if (changes.url) void run(() => update()); });
  browser.windows.onFocusChanged.addListener(windowId => { void run(() => update(windowId)); });
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
  browser.runtime.onStartup.addListener(() => { void run(async () => { await browser.storage.session.remove('cursor'); await update(); }); });
  browser.action.onClicked.addListener(() => { void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') }); });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/dashboard.html'))) return;
    if (!['snapshot', 'toggle', 'clear'].includes(message?.type)) return;
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
      }
      await update();
      return { data: await read() };
    }).then(sendResponse, error => sendResponse({ error: error?.message === 'data' ? 'data' : 'save' }));
    return true;
  });
  browser.idle.setDetectionInterval(IDLE_SECONDS);
  void browser.alarms.create('checkpoint', { periodInMinutes: CHECKPOINT_SECONDS / 60 });
  void run(() => update());
});
