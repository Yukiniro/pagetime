// Hostname used only to learn the browser's generic favicon. `.invalid` is reserved
// (RFC 2606), so this page is not a site the ledger records. The extension asks
// the browser for it and treats an identical bitmap as "nothing cached".
export const FAVICON_MISS_HOST = 'pagetime.invalid';

export function localIconPath(iconName) {
  return iconName ? `./assets/${iconName}.svg` : '';
}

// The row already passes the merged or displayed host. Prefer that, then the raw hostname.
export function iconPageHost(domain, site = domain) {
  if (typeof site === 'string' && site) return site;
  if (typeof domain === 'string') return domain;
  return '';
}

export function isIconHost(host) {
  if (typeof host !== 'string' || !host || host.length > 253 || /[/?#@\s\\]/.test(host)) return false;
  try {
    const url = new URL(`https://${host}`);
    return url.username === '' && url.password === '' && url.port === '' && url.pathname === '/' && url.search === '' && url.hash === '' && url.host.length > 0;
  } catch {
    return false;
  }
}

// chrome-extension://…/_favicon/?pageUrl=https://host&size=32 — the browser serves this from its cache.
export function faviconCacheUrl(host, getURL) {
  if (!isIconHost(host) || typeof getURL !== 'function') return '';
  const pageUrl = `https://${host}`;
  return `${getURL('/_favicon/')}?${new URLSearchParams({ pageUrl, size: '32' })}`;
}

export function iconRequest({ localName = '', extension = false, host = '', getURL } = {}) {
  const local = localIconPath(localName);
  if (local || !extension) return { src: local, probe: false };
  const src = faviconCacheUrl(host, getURL);
  return { src, probe: Boolean(src) };
}

export function bytesEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

// `load` resolves to pixel bytes, null when the image fails, or a thrown error.
// A bitmap that matches the generic icon is treated as a cache miss.
export async function cachedFaviconSrc(host, getURL, load) {
  const src = faviconCacheUrl(host, getURL);
  if (!src || typeof load !== 'function') return '';
  const miss = faviconCacheUrl(FAVICON_MISS_HOST, getURL);
  let icon;
  let blank;
  try {
    [icon, blank] = await Promise.all([load(src), load(miss)]);
  } catch {
    return src;
  }
  if (icon === null) return '';
  if (blank && bytesEqual(icon, blank)) return '';
  return src;
}
