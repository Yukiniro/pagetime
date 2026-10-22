const PREFIXES = new Set(['www', 'm', 'mobile']);
const cache = new Map();

// Raw hostnames the dashboard asks the background to delete for the site currently shown.
// Grouping stays here: the background deletes these stored names and does not import this module.
export function hostsToDelete(site, knownHosts = [], openDomain = null) {
  if (typeof site !== 'string' || !site) return [];
  const hosts = [];
  const add = host => { if (typeof host === 'string' && host && !hosts.includes(host)) hosts.push(host); };
  for (const host of knownHosts) if (host === site || siteOf(host) === site) add(host);
  if (typeof openDomain === 'string' && (openDomain === site || siteOf(openDomain) === site)) add(openDomain);
  if (!hosts.length) add(site);
  return hosts;
}

// Query-view key only. Callers must keep the stored hostname unchanged.
// A leading www. / m. / mobile. is removed. Other labels stay.
export function siteOf(host) {
  if (typeof host !== 'string' || host.length === 0) return host;
  if (cache.has(host)) return cache.get(host);
  const site = stripPrefix(host);
  cache.set(host, site);
  return site;
}

function stripPrefix(host) {
  const labels = host.split('.');
  let index = 0;
  while (index < labels.length - 1 && PREFIXES.has(labels[index].toLowerCase())) index += 1;
  return index === 0 ? host : labels.slice(index).join('.');
}
