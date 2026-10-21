// Timeline colors follow the day's ranking, the same order as `rank()` in model.mjs:
// active time, then visits, then the site key. The first swatches are the legend;
// every later site shares the neutral gray. Icon hosts do not pick a color.

function byRank(a, b) {
  return b.ms - a.ms || b.visits - a.visits || a.domain.localeCompare(b.domain);
}

export function colorsFor(sites, swatches) {
  const rows = [];
  for (const site of sites ?? []) {
    if (!site || typeof site.domain !== 'string' || !site.domain || !(site.ms > 0)) continue;
    rows.push({ domain: site.domain, ms: site.ms, visits: site.visits || 0 });
  }
  rows.sort(byRank);
  const colors = new Map();
  for (const row of rows) {
    if (colors.has(row.domain)) continue;
    const index = colors.size;
    colors.set(row.domain, index < swatches.ranks.length ? swatches.ranks[index] : swatches.other);
  }
  return colors;
}
