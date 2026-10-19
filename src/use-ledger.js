import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, hoursBetween, openLedger, readDomains, readHead, recentVisits, siteDays, siteHours, spansBetween } from './ledger.mjs';
import { siteSeries, siteSeriesFromSnapshot, VISIT_LIST_LIMIT, viewFromLedger, viewFromSnapshot } from './ledger-view.mjs';
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
      const { browser } = await import('wxt/browser');
      const [domains, head, stored] = await Promise.all([readDomains(db), readHead(db), browser.storage.session.get('session')]);
      const ids = new Set(domains.filter(row => range.site ? siteOf(row.host, range.siteMerge) === range.site : row.host.includes(range.search)).map(row => row.id));
      const cursor = head.cursor?.session === stored.session ? head.cursor : null;
      const now = Date.now();
      const from = dateKey(range.start);
      const to = dateKey(addDays(range.end, -1));
      const rows = {
        state: head.state,
        domains,
        days: await daysBetween(db, from, to),
        hours: await hoursBetween(db, from, to),
        spans: await spansBetween(db, range.today, range.end),
        visits: await recentVisits(db, range.start, range.end, ids, VISIT_LIST_LIMIT),
        cursor,
        lastEnd: head.lastEnd,
      };
      const detailIds = range.detail ? domains.filter(row => siteOf(row.host, range.siteMerge) === range.detail).map(row => row.id) : [];
      const [detailDays, detailHours] = range.detail ? await Promise.all([
        Promise.all(detailIds.map(id => siteDays(db, id, from, to))),
        Promise.all(detailIds.map(id => siteHours(db, id, from, to))),
      ]) : [[], []];
      return {
        view: viewFromLedger(rows, { ...range, now }),
        detail: range.detail ? siteSeries({
          domains, days: detailDays.flat(), hours: detailHours.flat(), state: head.state, cursor, lastEnd: head.lastEnd,
        }, { site: range.detail, siteMerge: range.siteMerge, start: range.start, end: range.end, now }) : null,
        detailSite: range.detail || '',
      };
    } catch (error) {
      console.error('PageTime could not read the ledger', error);
      return { error: 'read' };
    }
  }, [range.start, range.end, range.today, range.search, range.site, range.siteMerge, range.detail, attempt]);
  return {
    view: result?.view,
    detail: result?.detail ?? null,
    detailSite: result?.detailSite ?? '',
    error: result?.error ?? (marker ? 'save' : undefined),
    apply() {},
    retry: () => setAttempt(n => n + 1),
  };
}

function usePreviewLedger(range) {
  const [data, setData] = useState(null);
  const now = Date.now();
  return {
    view: data && viewFromSnapshot(data, range),
    detail: data && range.detail ? siteSeriesFromSnapshot(data, { start: range.start, end: range.end, site: range.detail, siteMerge: range.siteMerge, now }) : null,
    detailSite: range.detail || '',
    error: undefined,
    apply: setData,
    retry() {},
  };
}

export const useLedger = isExtension ? useExtensionLedger : usePreviewLedger;
