import { formatSiteShare, orderSites, siteShareWidth } from './site-ledger.mjs';

export const SHARE_LIMIT = 5;

// The color stays with the domain, so a rank change does not repaint the site.
export function shareColor(domain, swatches) {
  const ranks = swatches?.ranks ?? [];
  if (!ranks.length) return swatches?.other ?? '';
  let hash = 2166136261;
  const text = String(domain);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ranks[(hash >>> 0) % ranks.length];
}

function part(key, kind, domain, ms, total, swatches) {
  return {
    key,
    kind,
    domain,
    ms,
    width: siteShareWidth(ms, total),
    label: formatSiteShare(ms, total),
    color: kind === 'site' ? shareColor(domain, swatches) : (swatches?.other ?? ''),
  };
}

// `total` is the selected range's active time for every site. Widths use that
// denominator directly; they are not scaled to the longest site.
export function siteShareParts(rows, total, { focus = '', swatches } = {}) {
  const safeTotal = total > 0 && Number.isFinite(total) ? total : 0;
  if (!safeTotal) return { total: 0, parts: [] };
  const ranked = orderSites(Array.isArray(rows) ? rows : [], 'time').filter(row => row?.ms > 0 && typeof row.domain === 'string' && row.domain);
  if (focus) {
    const siteMs = ranked.find(row => row.domain === focus)?.ms ?? 0;
    return {
      total: safeTotal,
      parts: [
        part(focus, 'site', focus, siteMs, safeTotal, swatches),
        part('rest', 'rest', '', Math.max(0, safeTotal - siteMs), safeTotal, swatches),
      ],
    };
  }
  const named = ranked.slice(0, SHARE_LIMIT);
  const namedMs = named.reduce((sum, row) => sum + row.ms, 0);
  const parts = named.map(row => part(row.domain, 'site', row.domain, row.ms, safeTotal, swatches));
  const otherMs = Math.max(0, safeTotal - namedMs);
  if (otherMs > 0) parts.push(part('other', 'other', '', otherMs, safeTotal, swatches));
  return { total: safeTotal, parts };
}
