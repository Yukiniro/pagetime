export const DEFAULT_SETTINGS = { schema: 1, idleSeconds: 60, countAudible: true, ignored: [] };
export const IDLE_OPTIONS = [60, 120, 300, 600];
export const HOST_MAX = 253;
export const IGNORED_LIMIT = 500;

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isSubnet(value) {
  const bare = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  const slash = bare.indexOf('/');
  if (slash === -1) return false;
  const tail = bare.slice(slash + 1);
  if (!/^\d{1,3}$/.test(tail)) return false;
  const head = bare.slice(0, slash);
  const host = head.startsWith('[') && head.endsWith(']') ? head.slice(1, -1) : head.replace(/:\d+$/, '');
  return host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
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

function isDnsName(host) {
  if (host.length > HOST_MAX || host.includes('..')) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  return labels.every(label => label.length <= 63 && DNS_LABEL.test(label));
}

function isAddress(host) {
  return host.startsWith('[') || host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

export function normalizeHost(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2000 || /\s/.test(trimmed) || trimmed.includes('*') || isSubnet(trimmed)) return null;
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
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').some(part => Number(part) > 255) ? null : host;
  }
  if (host === 'localhost') return host;
  return isDnsName(host) ? host : null;
}

// An entry matches that host and its subdomains. An address matches only itself.
export function isIgnored(domain, ignored) {
  const host = normalizeHost(domain);
  if (!host || !Array.isArray(ignored)) return false;
  return ignored.some(entry => {
    const rule = typeof entry === 'string' ? normalizeHost(entry) : null;
    if (!rule) return false;
    if (isAddress(host) || isAddress(rule)) return host === rule;
    return host === rule || host.endsWith(`.${rule}`);
  });
}

function ignoredList(value) {
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
    ignored: ignoredList(value?.ignored),
  };
}
