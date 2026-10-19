import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, openLedger, readDomains, readState, recentVisits, spansBetween } from './ledger.mjs';
import { VISIT_LIST_LIMIT, viewFromLedger, viewFromSnapshot } from './ledger-view.mjs';
import { addDays, dateKey } from './model.mjs';
import { siteOf } from './site.mjs';

let db;

// Re-runs whenever the background commits a change to a range this query read. The dashboard never writes.
function useExtensionLedger(range) {
  const [attempt, setAttempt] = useState(0);
  const [marker, setMarker] = useState();
  useEffect(() => watchLedgerError(setMarker), []);
  const result = useLiveQuery(async () => {
    try {
      db ??= openLedger();
      const domains = await readDomains(db);
      const ids = new Set(domains.filter(row => range.site ? siteOf(row.host, range.siteMerge) === range.site : row.host.includes(range.search)).map(row => row.id));
      const rows = {
        state: await readState(db),
        domains,
        days: await daysBetween(db, dateKey(range.start), dateKey(addDays(range.end, -1))),
        spans: await spansBetween(db, range.today, range.end),
        visits: await recentVisits(db, range.start, range.end, ids, VISIT_LIST_LIMIT),
      };
      return { view: viewFromLedger(rows, { ...range, now: Date.now() }) };
    } catch (error) {
      console.error('PageTime could not read the ledger', error);
      return { error: 'read' };
    }
  }, [range.start, range.end, range.today, range.search, range.site, range.siteMerge, attempt]);
  return {
    view: result?.view,
    error: result?.error ?? (marker ? 'save' : undefined),
    apply() {},
    retry: () => setAttempt(n => n + 1),
  };
}

function usePreviewLedger(range) {
  const [data, setData] = useState(null);
  return { view: data && viewFromSnapshot(data, range), error: undefined, apply: setData, retry() {} };
}

export const useLedger = isExtension ? useExtensionLedger : usePreviewLedger;
