import { addDays, dateKey, domainOf, groupSites, midnight, openCredit, overlapMs } from './model.mjs';
import { IGNORED_LIMIT, normalizeHost } from './settings.mjs';
import { siteOf } from './site.mjs';

const ADD = { blacklist: 'ignore', whitelist: 'allow' };
const REMOVE = { blacklist: 'unignore', whitelist: 'unallow' };

// http(s) hostname only. The path, query, and title stay in the tab and are not returned.
export function recordableHost(url) {
  if (typeof url !== 'string' || url.length > 16_384) return null;
  return normalizeHost(domainOf(url));
}

/**
 * Today's active time in the same shape as the dashboard's today stats:
 * today's day rows plus the still-open cursor, clipped to the local day and grouped.
 * @param {{ domains?: { id: number, host: string }[], days?: { date: string, domainId: number, ms: number, visits?: number }[], cursor?: { domain: string, since: number } | null, lastEnd?: number, now: number, enabled?: boolean, host?: string | null, siteMerge?: string }} input
 */
export function popupToday({ domains = [], days = [], cursor = null, lastEnd, now, enabled = true, host = null, siteMerge = 'prefix' }) {
  const key = dateKey(now);
  const start = midnight(now);
  const hostOf = new Map(domains.map(row => [row.id, row.host]));
  const entries = [];
  for (const row of days) {
    if (row.date !== key) continue;
    const domain = hostOf.get(row.domainId);
    if (!domain) continue;
    entries.push({ domain, ms: row.ms, visits: row.visits });
  }
  const segment = enabled ? openCredit(cursor, lastEnd, now) : null;
  const piece = overlapMs(segment, start, addDays(start, 1));
  if (piece) entries.push({ domain: segment.domain, ms: piece, visits: 0 });
  const grouped = groupSites(entries, domain => siteOf(domain, siteMerge));
  const site = typeof host === 'string' && host ? siteOf(host, siteMerge) : null;
  const row = site ? grouped.rows.find(item => item.domain === site) : undefined;
  return { total: grouped.ms, site, siteMs: row?.ms ?? 0 };
}

// Exact host in the current mode's list. A second call removes that host. A parent rule is left as it is.
export function listAction(settings, host) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const mode = settings?.recordMode === 'whitelist' ? 'whitelist' : 'blacklist';
  const field = mode === 'whitelist' ? 'allowed' : 'ignored';
  const list = Array.isArray(settings?.[field]) ? settings[field] : [];
  const listed = list.includes(normalized);
  return {
    field,
    host: normalized,
    listed,
    label: listed ? REMOVE[mode] : ADD[mode],
    disabled: !listed && list.length >= IGNORED_LIMIT,
  };
}

export function toggleListedHost(list, host) {
  const source = Array.isArray(list) ? list : [];
  const normalized = normalizeHost(host);
  if (!normalized) return source;
  if (source.includes(normalized)) return source.filter(item => item !== normalized);
  if (source.length >= IGNORED_LIMIT) return source;
  return [...source, normalized];
}

export async function activeRecordableHost(query) {
  const tabs = await query({ active: true, currentWindow: true });
  const tab = Array.isArray(tabs) ? tabs[0] : undefined;
  if (!tab || tab.incognito || typeof tab.url !== 'string') return null;
  return recordableHost(tab.url);
}

export async function openDashboardPage(browser) {
  const url = browser.runtime.getURL('/dashboard.html');
  const action = dashboardAction(await browser.tabs.query({}), url);
  if (action.type === 'focus') {
    await browser.tabs.update(action.tabId, { active: true });
    if (action.windowId !== undefined) await browser.windows.update(action.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url: action.url });
}

// An open dashboard tab is focused. Anything else opens one.
export function dashboardAction(tabs, dashboardUrl) {
  const open = Array.isArray(tabs) ? tabs.find(tab => tab && tab.id !== undefined && (tab.url === dashboardUrl || tab.pendingUrl === dashboardUrl)) : undefined;
  if (open) return { type: 'focus', tabId: open.id, windowId: open.windowId };
  return { type: 'create', url: dashboardUrl };
}
