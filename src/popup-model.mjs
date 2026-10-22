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
 * @param {{ domains?: { id: number, host: string }[], days?: { date: string, domainId: number, ms: number, visits?: number }[], cursor?: { domain: string, since: number } | null, lastEnd?: number, now: number, enabled?: boolean, host?: string | null }} input
 */
export function popupToday({ domains = [], days = [], cursor = null, lastEnd, now, enabled = true, host = null }) {
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
  const grouped = groupSites(entries, siteOf);
  const site = typeof host === 'string' && host ? siteOf(host) : null;
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

// A grouped site key, never a full URL. The same string the dashboard uses as a row key.
function dashboardSite(site) {
  if (typeof site !== 'string' || !site || site.length > 253 || site !== site.trim()) return null;
  if (/[/?#\s\\%]/.test(site) || site.includes('://')) return null;
  return normalizeHost(site) === site ? site : null;
}

export function dashboardSiteHash(site) {
  const key = dashboardSite(site);
  return key ? `site=${encodeURIComponent(key)}` : '';
}

export function siteFromLocationHash(hash) {
  if (typeof hash !== 'string' || !hash || hash.length > 512) return null;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  let site;
  try { site = new URLSearchParams(body).get('site'); }
  catch { return null; }
  return dashboardSite(site);
}

function sameDashboard(value, dashboardUrl) {
  if (typeof value !== 'string' || !value || typeof dashboardUrl !== 'string') return false;
  try {
    const page = new URL(value);
    const target = new URL(dashboardUrl);
    // chrome-extension URLs have an opaque origin in some URL parsers, so match the document by host and path.
    return page.protocol === target.protocol && page.host === target.host && page.pathname === target.pathname;
  } catch {
    return false;
  }
}

function withSiteHash(pageUrl, site) {
  const hash = dashboardSiteHash(site);
  if (!hash || typeof pageUrl !== 'string') return '';
  return `${pageUrl.split('#')[0]}#${hash}`;
}

export async function openDashboardPage(browser, site) {
  const url = browser.runtime.getURL('/dashboard.html');
  const action = dashboardAction(await browser.tabs.query({}), url, site);
  if (action.type === 'focus') {
    // A hash-only URL is a same-document navigation: the open page stays up and receives hashchange.
    const update = { active: true };
    if (action.url) update.url = action.url;
    await browser.tabs.update(action.tabId, update);
    if (action.windowId !== undefined) await browser.windows.update(action.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url: action.url });
}

// An open dashboard tab is focused. Query and hash are ignored when matching.
// A site adds `#site=` on that same document, or on the new tab when none is open.
export function dashboardAction(tabs, dashboardUrl, site) {
  const list = Array.isArray(tabs) ? tabs : [];
  const open = list.find(tab => tab && tab.id !== undefined && [tab.url, tab.pendingUrl].some(value => sameDashboard(value, dashboardUrl)));
  const key = dashboardSite(site);
  if (open) {
    const focus = { type: 'focus', tabId: open.id, windowId: open.windowId };
    const current = [open.url, open.pendingUrl].find(value => sameDashboard(value, dashboardUrl));
    const next = key && current ? withSiteHash(current, key) : '';
    if (next && next !== current) return { ...focus, url: next };
    return focus;
  }
  const hash = key ? dashboardSiteHash(key) : '';
  return { type: 'create', url: hash ? `${dashboardUrl.split('#')[0]}#${hash}` : dashboardUrl };
}
