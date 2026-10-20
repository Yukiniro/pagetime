import { daysBetween, hoursBetween, visitsBetween } from './ledger.mjs';
import { windowTotals } from './ledger-view.mjs';
import { addDays, dateKey, midnight } from './model.mjs';
import { compareBlocks, compareSummary, previousWindow } from './range.mjs';

// Totals for the current and the previous period, read separately from the range query so the comparison
// never changes what the ranking, trend and timeline show. Only reads stored rows. Nothing here writes.
export async function readComparison(db, { range, now, since, domains, days, segment }) {
  const window = previousWindow(range, now);
  const blocks = compareBlocks(window, { since, now });
  if (blocks.ms) return { window, summary: compareSummary(null, null, blocks) };
  const options = { site: range.focus || '', siteMerge: range.siteMerge };
  const totals = async ({ start, end }, wholeDays) => {
    const cutDay = midnight(end);
    const cut = cutDay < end;
    const [ownDays, hours, visits] = await Promise.all([
      wholeDays ?? (cutDay > start ? daysBetween(db, dateKey(start), dateKey(addDays(cutDay, -1))) : []),
      cut ? hoursBetween(db, dateKey(cutDay), dateKey(cutDay)) : [],
      cut && !blocks.visits ? visitsBetween(db, cutDay, end) : [],
    ]);
    return windowTotals({ domains, days: ownDays, hours, visits, segment }, { start, end }, options);
  };
  const [current, previous] = await Promise.all([totals(window.current, days), totals(window.previous)]);
  return { window, summary: compareSummary(current, previous, blocks) };
}
