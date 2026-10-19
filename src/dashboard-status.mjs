// Overview data state. `pending` covers the first read and a date-range refetch.
// An empty ledger (first install or clear) is distinct from a quiet range that still has hosts.

export function isLedgerEmpty(view) {
  if (!view) return false;
  if (view.hosts?.length) return false;
  if (view.stats?.rows?.length) return false;
  if (view.todayStats?.rows?.length) return false;
  if (view.spans?.length) return false;
  if (view.visitCount) return false;
  if (view.hourRows?.some(row => row.ms > 0)) return false;
  return true;
}

export function dashboardStatus({ view, pending }) {
  if (pending || !view) return 'loading';
  return isLedgerEmpty(view) ? 'empty' : 'ready';
}
