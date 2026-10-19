import { getDomain } from 'tldts';

const PREFIXES = new Set(['www', 'm', 'mobile']);
const cache = new Map();

// Query-view key only. Callers must keep the stored hostname unchanged.
export function siteOf(host, mode = 'prefix') {
  if (typeof host !== 'string' || host.length === 0) return host;
  const resolved = mode === 'none' || mode === 'prefix' || mode === 'registrable' ? mode : 'none';
  const key = `${resolved}\0${host}`;
  if (cache.has(key)) return cache.get(key);
  const site = resolved === 'prefix' ? stripPrefix(host) : resolved === 'registrable' ? registrableOf(host) : host;
  cache.set(key, site);
  return site;
}

function stripPrefix(host) {
  const labels = host.split('.');
  let index = 0;
  while (index < labels.length - 1 && PREFIXES.has(labels[index].toLowerCase())) index += 1;
  return index === 0 ? host : labels.slice(index).join('.');
}

// ICANN section only: private suffixes such as github.io stay under the registrable ICANN name.
function registrableOf(host) {
  return getDomain(host, { allowPrivateDomains: false }) || host;
}
