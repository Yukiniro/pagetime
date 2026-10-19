import { getDomain } from 'tldts';

const PREFIXES = new Set(['www', 'm', 'mobile']);
const cache = new Map();

// Raw hostnames the dashboard asks the background to delete for the site currently shown.
// Grouping stays here: the background deletes these stored names and does not import this module.
export function hostsToDelete(site, mode, knownHosts = [], openDomain = null) {
  if (typeof site !== 'string' || !site) return [];
  const hosts = [];
  const add = host => { if (typeof host === 'string' && host && !hosts.includes(host)) hosts.push(host); };
  for (const host of knownHosts) if (host === site || siteOf(host, mode) === site) add(host);
  if (typeof openDomain === 'string' && (openDomain === site || siteOf(openDomain, mode) === site)) add(openDomain);
  if (!hosts.length) add(site);
  return hosts;
}

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
