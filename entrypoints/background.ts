import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { badgeLabels, resolveLocale, todayFigures } from '../src/badge.mjs';
import { CHECKPOINT_SECONDS, dateKey, dateKeyStart, detailCutoff, domainOf, openCredit } from '../src/model.mjs';
import { clearLedger, commitTick, daysBetween, deleteDay, deleteSite, LEDGER_ERROR_KEY, openLedger, pruneDetail, readDomains, readHead, reopening, toggleRecording } from '../src/ledger.mjs';
import { shouldRecord, validateSettings } from '../src/settings.mjs';

// `session` ties the cursor to one storage.session lifetime, so a browser restart or extension reload starts without it.
type Cursor = { tabId: number; domain: string; since: number; session: string };

export default defineBackground(() => {
  const db = openLedger();
  let queue = Promise.resolve();
  const run = <T>(task: () => Promise<T>) => {
    const result = queue.then(task);
    queue = result.then(() => {}, error => console.error('PageTime recording failed', error));
    return result;
  };
  const readSettings = async () => validateSettings((await browser.storage.local.get('settings')).settings);
  const applyIdle = (settings: { idleSeconds: number }) => { browser.idle.setDetectionInterval(settings.idleSeconds); };
  let session: string | undefined;
  async function sessionId() {
    if (session) return session;
    const stored = (await browser.storage.session.get('session')).session;
    session = typeof stored === 'string' ? stored : crypto.randomUUID();
    if (stored !== session) await browser.storage.session.set({ session });
    return session;
  }
  async function head() {
    const [ledger, id] = await Promise.all([reopening(db, () => readHead(db)), sessionId()]);
    const cursor = ledger.cursor as Cursor | undefined;
    return { ...ledger, id, enabled: ledger.state?.enabled ?? true, live: cursor?.session === id ? cursor : undefined };
  }
  // The marker stays in storage.local until a later write succeeds, so the dashboard can show the failure.
  let marked: boolean | undefined;
  async function write<T>(op: () => Promise<T>) {
    try {
      const result = await reopening(db, op);
      if (marked !== false) { await browser.storage.local.remove(LEDGER_ERROR_KEY); marked = false; }
      return result;
    } catch (error) {
      marked = true;
      await browser.storage.local.set({ [LEDGER_ERROR_KEY]: { at: Date.now(), name: (error as Error | undefined)?.name ?? 'Error' } })
        .catch(markError => console.error('PageTime could not store the write failure', markError));
      throw error;
    }
  }
  let rechecks: ReturnType<typeof setTimeout>[] = [];
  // getAll() can lag a focus or bounds event. A few reads cover that lag, then the worker may sleep.
  const clearRechecks = () => { for (const timer of rechecks) clearTimeout(timer); rechecks = []; };
  const recheckSoon = (windowId: number) => {
    clearRechecks();
    rechecks = [200, 700, 1_500].map(delay => setTimeout(() => {
      void run(async () => { if (!(await head()).live) await update(windowId); });
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
    if (!domain || tab?.id === undefined || !shouldRecord(domain, settings)) return null;
    const playing = Boolean(tab.audible) && !tab.mutedInfo?.muted;
    if (state === 'idle' && !(settings.countAudible && playing)) return null;
    if (state !== 'active' && state !== 'idle') return null;
    return { id: tab.id, domain };
  }

  let prunedOn: string | undefined;
  // Everything a tick needs (tabs, idle, the time it credits) is settled here; commitTick only writes it.
  const tick = (focusedId?: number, trustId = false, visit?: { domain: string; at: number }) => write(async () => {
    const now = Date.now();
    const { state, cursor, lastEnd, id, enabled, live } = await head();
    const next = enabled ? await active(focusedId, trustId) : null;
    // A backward clock must not move the cursor into the past, or the catch-up span overlaps stored time.
    const since = live && now < live.since ? live.since : now;
    await commitTick(db, {
      expect: { state, cursor, lastEnd },
      now,
      span: enabled && live ? openCredit(live, lastEnd, now) : null,
      visit: enabled ? visit : null,
      cursor: next ? { tabId: next.id, domain: next.domain, since, session: id } : null,
    });
    if (next) clearRechecks();
    return now;
  });
  async function readLanguage() {
    const stored = (await browser.storage.local.get('language')).language;
    if (typeof stored === 'string' && stored) return stored;
    return browser.i18n?.getUILanguage?.();
  }
  // Global badge (no tabId). Today's total matches the overview: today's day rows plus the still-open cursor, same creditUntil cap.
  async function refreshBadge() {
    try {
      const settings = await readSettings();
      if (!settings.badge) {
        await browser.action.setBadgeText({ text: '' });
        await browser.action.setTitle({ title: '' });
        return;
      }
      const { enabled, live, lastEnd } = await head();
      const locale = resolveLocale(await readLanguage());
      if (!enabled) {
        const paused = badgeLabels({ locale, total: 0, domain: null, siteMs: 0, paused: true });
        await browser.action.setBadgeText({ text: paused.text });
        await browser.action.setBadgeBackgroundColor({ color: paused.color });
        await browser.action.setTitle({ title: paused.title });
        return;
      }
      const now = Date.now();
      const key = dateKey(now);
      const [rows, domains] = await reopening(db, () => Promise.all([daysBetween(db, key, key), readDomains(db)]));
      const figures = todayFigures({ rows, domains, cursor: live, lastEnd, now, enabled });
      const label = badgeLabels({ locale, ...figures, paused: false });
      await browser.action.setBadgeText({ text: label.text });
      await browser.action.setBadgeBackgroundColor({ color: label.color });
      await browser.action.setTitle({ title: label.title });
    } catch (error) {
      console.error('PageTime badge failed', error);
    }
  }
  const update = async (focusedId?: number, trustId = false, visit?: { domain: string; at: number }) => {
    const now = await tick(focusedId, trustId, visit);
    if (prunedOn !== dateKey(now)) {
      // Pruning only removes old detail, so a failure is logged and retried on the next write instead of marking the ledger.
      try {
        await pruneDetail(db, detailCutoff(now));
        prunedOn = dateKey(now);
      } catch (error) {
        console.error('PageTime prune failed', error);
      }
    }
    await refreshBadge();
  };

  browser.tabs.onActivated.addListener(({ windowId }) => { void run(() => update(windowId)); });
  browser.tabs.onRemoved.addListener(() => { void run(() => update()); });
  browser.tabs.onUpdated.addListener((_id, changes) => {
    if (changes.url !== undefined || changes.audible !== undefined || changes.mutedInfo !== undefined) void run(() => update());
  });
  browser.windows.onFocusChanged.addListener(windowId => {
    void run(async () => {
      await update(windowId);
      if (windowId !== browser.windows.WINDOW_ID_NONE && !(await head()).live) recheckSoon(windowId);
    });
  });
  browser.windows.onBoundsChanged.addListener(win => {
    const restored = win.id !== undefined && win.focused && !win.incognito && win.state !== 'minimized';
    void run(async () => {
      await update(restored ? win.id : undefined, restored);
      if (restored && win.id !== undefined && !(await head()).live) recheckSoon(win.id);
    });
  });
  browser.idle.onStateChanged.addListener(() => { void run(() => update()); });
  browser.webNavigation.onCommitted.addListener(details => {
    if (details.frameId !== 0) return;
    void run(async () => {
      const tab = await browser.tabs.get(details.tabId).catch(() => null);
      const domain = domainOf(details.url);
      const counted = domain && tab && !tab.incognito && shouldRecord(domain, await readSettings());
      await update(undefined, false, counted ? { domain, at: details.timeStamp } : undefined);
    });
  });
  browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) void run(() => update());
  });
  browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'checkpoint') void run(() => update()); });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'language')) void run(() => refreshBadge());
  });
  browser.runtime.onStartup.addListener(() => { void run(async () => { applyIdle(await readSettings()); await update(); }); });
  const extensionPage = (sender: { id?: string, url?: string }) => {
    if (sender.id !== browser.runtime.id || typeof sender.url !== 'string') return '';
    if (sender.url.startsWith(browser.runtime.getURL('/dashboard.html'))) return 'dashboard';
    if (sender.url.startsWith(browser.runtime.getURL('/popup.html'))) return 'popup';
    return '';
  };
  const deleteHosts = (message: { host?: unknown, hosts?: unknown }) => {
    const listed = [message.host, ...(Array.isArray(message.hosts) ? message.hosts : [])];
    return [...new Set(listed.filter((host): host is string => typeof host === 'string' && host.length > 0 && host.length <= 253))];
  };
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const page = extensionPage(sender);
    const allowed = page === 'dashboard'
      ? ['snapshot', 'toggle', 'clear', 'deleteSite', 'deleteDay', 'settings']
      : page === 'popup' ? ['snapshot', 'toggle', 'settings'] : [];
    if (!allowed.includes(message?.type)) return;
    void run(async () => {
      if (message.type === 'clear') {
        await write(() => clearLedger(db, Date.now()));
      } else if (message.type === 'deleteSite') {
        const hosts = deleteHosts(message);
        if (hosts.length) await write(() => deleteSite(db, hosts, Date.now()));
      } else if (message.type === 'deleteDay') {
        if (dateKeyStart(message.date) === null) throw new Error('invalid date');
        await write(() => deleteDay(db, message.date, Date.now()));
      } else if (message.type === 'toggle') {
        await update();
        await write(() => toggleRecording(db, Date.now()));
      } else if (message.type === 'settings' && message.settings !== undefined) {
        const next = validateSettings(message.settings);
        await browser.storage.local.set({ settings: next });
        applyIdle(next);
        await update();
      }
      if (message.type === 'settings') return { settings: await readSettings() };
      await update();
      return { ok: true };
    }).then(sendResponse, () => sendResponse({ error: 'save' }));
    return true;
  });
  void browser.alarms.create('checkpoint', { periodInMinutes: CHECKPOINT_SECONDS / 60 });
  void run(async () => { applyIdle(await readSettings()); await update(); });
});
