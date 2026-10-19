export const MERGE_MODES = ['none', 'prefix', 'registrable'];
export const RECORD_MODES = ['blacklist', 'whitelist'];
export const THEME_MODES = ['system', 'light', 'dark'];
export const DEFAULT_SETTINGS = { schema: 1, idleSeconds: 60, countAudible: true, siteMerge: 'prefix', recordMode: 'blacklist', ignored: [], allowed: [], badge: true, theme: 'system' };
export const IDLE_OPTIONS = [60, 120, 300, 600];
export const HOST_MAX = 253;
export const IGNORED_LIMIT = 500;

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isSubnet(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')) return false;
  const slash = value.indexOf('/');
  if (slash === -1) return false;
  const tail = value.slice(slash + 1);
  if (!/^\d{1,3}$/.test(tail)) return false;
  const head = value.slice(0, slash);
  if (/:\d+$/.test(head)) return false;
  const host = head.startsWith('[') && head.endsWith(']') ? head.slice(1, -1) : head;
  return host.includes(':') || IPV4.test(host);
}

function asUrl(value) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `http:${value}`;
  const cut = value.search(/[/?#]/);
  const head = cut === -1 ? value : value.slice(0, cut);
  const tail = cut === -1 ? '' : value.slice(cut);
  if (!head.startsWith('[') && head.split(':').length > 2) return `http://[${head}]${tail}`;
  return `http://${value}`;
}

function isAddress(host) {
  return host.startsWith('[') || host.includes(':') || IPV4.test(host);
}

export function normalizeHost(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 16_384 || /\s/.test(trimmed) || trimmed.includes('*') || isSubnet(trimmed)) return null;
  let url;
  try { url = new URL(asUrl(trimmed)); }
  catch { return null; }
  let host = url.hostname.toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host || host.length > HOST_MAX || host.startsWith('.') || host.endsWith('.') || host.includes('..') || host.includes('*') || host.includes('/') || host.includes('%')) return null;
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1);
    if (!host.endsWith(']') || !inner || inner.includes('[') || inner.includes(']')) return null;
    return host;
  }
  if (host.includes(':')) {
    try {
      const canonical = new URL(`http://[${host}]/`).hostname.toLowerCase();
      return canonical && canonical.length <= HOST_MAX ? canonical : null;
    } catch { return null; }
  }
  if (IPV4.test(host)) {
    return host.split('.').some(part => Number(part) > 255) ? null : host;
  }
  if (host === 'localhost' || host.includes('.')) return host;
  return null;
}

// An entry matches that host and its subdomains. An address matches only itself.
function hostMatches(domain, list) {
  const host = normalizeHost(domain);
  if (!host || !Array.isArray(list)) return false;
  return list.some(entry => {
    const rule = typeof entry === 'string' ? normalizeHost(entry) : null;
    if (!rule) return false;
    if (isAddress(host) || isAddress(rule)) return host === rule;
    return host === rule || host.endsWith(`.${rule}`);
  });
}

export function isIgnored(domain, ignored) {
  return hostMatches(domain, ignored);
}

export function isAllowed(domain, allowed) {
  return hostMatches(domain, allowed);
}

// Blacklist records everything except `ignored`. Whitelist records only `allowed`. Any other mode is blacklist.
export function shouldRecord(domain, settings) {
  if (settings?.recordMode === 'whitelist') return isAllowed(domain, settings.allowed);
  return !isIgnored(domain, settings?.ignored);
}

function hostList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const list = [];
  for (const item of value) {
    if (list.length >= IGNORED_LIMIT) break;
    const host = typeof item === 'string' ? normalizeHost(item) : null;
    if (!host || seen.has(host)) continue;
    seen.add(host);
    list.push(host);
  }
  return list;
}

export function validateSettings(value) {
  return {
    schema: value?.schema === 1 ? 1 : DEFAULT_SETTINGS.schema,
    idleSeconds: IDLE_OPTIONS.includes(value?.idleSeconds) ? value.idleSeconds : DEFAULT_SETTINGS.idleSeconds,
    countAudible: typeof value?.countAudible === 'boolean' ? value.countAudible : DEFAULT_SETTINGS.countAudible,
    siteMerge: MERGE_MODES.includes(value?.siteMerge) ? value.siteMerge : DEFAULT_SETTINGS.siteMerge,
    recordMode: RECORD_MODES.includes(value?.recordMode) ? value.recordMode : DEFAULT_SETTINGS.recordMode,
    ignored: hostList(value?.ignored),
    allowed: hostList(value?.allowed),
    badge: typeof value?.badge === 'boolean' ? value.badge : DEFAULT_SETTINGS.badge,
    theme: THEME_MODES.includes(value?.theme) ? value.theme : DEFAULT_SETTINGS.theme,
  };
}
