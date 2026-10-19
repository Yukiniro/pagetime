import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, hoursBetween, openLedger, readDomains, readHead, recentVisits, siteDays, siteHours, spansBetween } from './ledger.mjs';
import { siteSeries, siteSeriesFromSnapshot, VISIT_LIST_LIMIT, daySummary, viewFromLedger, viewFromSnapshot } from './ledger-view.mjs';
import { addDays, dateKey, openCredit } from './model.mjs';
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
      const displayFrom = dateKey(range.start);
      const displayTo = dateKey(addDays(range.end, -1));
      // The trend tab is always the last 7 local days, even when the selected range is today.
      // Those extra day rows stay out of the main view, so rankings and visits keep the selected range.
      // `focus` limits the bars to one merged site. It does not change the visit list or ranking totals.
      const weekStart = addDays(range.today, -6);
      const fetchFrom = dateKey(Math.min(range.start, weekStart));
      const [allDays, hours, spans, visits] = await Promise.all([
        daysBetween(db, fetchFrom, displayTo),
        hoursBetween(db, displayFrom, displayTo),
        spansBetween(db, range.today, range.end),
        recentVisits(db, range.start, range.end, ids, VISIT_LIST_LIMIT),
      ]);
      const rows = {
        state: head.state,
        domains,
        days: allDays.filter(row => row.date >= displayFrom && row.date <= displayTo),
        hours,
        spans,
        visits,
        cursor,
        lastEnd: head.lastEnd,
      };
      const detailIds = range.detail ? domains.filter(row => siteOf(row.host, range.siteMerge) === range.detail).map(row => row.id) : [];
      const [detailDays, detailHours] = range.detail ? await Promise.all([
        Promise.all(detailIds.map(id => siteDays(db, id, displayFrom, displayTo))),
        Promise.all(detailIds.map(id => siteHours(db, id, displayFrom, displayTo))),
      ]) : [[], []];
      const weekDays = viewFromLedger({
        ...rows,
        days: allDays,
        hours: [],
        visits: [],
      }, {
        start: weekStart,
        end: addDays(range.today, 1),
        today: range.today,
        search: '',
        site: range.focus || '',
        siteMerge: range.siteMerge,
        now,
      }).days;
      return {
        view: viewFromLedger(rows, { ...range, now }),
        weekDays,
        detail: range.detail ? siteSeries({
          domains, days: detailDays.flat(), hours: detailHours.flat(), state: head.state, cursor, lastEnd: head.lastEnd,
        }, { site: range.detail, siteMerge: range.siteMerge, start: range.start, end: range.end, now }) : null,
        detailSite: range.detail || '',
      };
    } catch (error) {
      console.error('PageTime could not read the ledger', error);
      return { error: 'read' };
    }
  }, [range.start, range.end, range.today, range.search, range.site, range.siteMerge, range.detail, range.focus, attempt]);
  return {
    view: result?.view,
    weekDays: result?.weekDays,
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
  const weekStart = addDays(range.today, -6);
  const weekEnd = addDays(range.today, 1);
  return {
    view: data && viewFromSnapshot(data, range),
    weekDays: data ? viewFromSnapshot(data, { start: weekStart, end: weekEnd, today: range.today, site: range.focus || '', siteMerge: range.siteMerge }).days : undefined,
    detail: data && range.detail ? siteSeriesFromSnapshot(data, { start: range.start, end: range.end, site: range.detail, siteMerge: range.siteMerge, now }) : null,
    detailSite: range.detail || '',
    error: undefined,
    apply: setData,
    retry() {},
  };
}

// Separate from the range query so choosing a day does not blank the dashboard while IndexedDB answers.
export function useDaySummary(date, siteMerge) {
  const result = useLiveQuery(async () => {
    if (!isExtension || !date) return null;
    try {
      db ??= openLedger();
      const { browser } = await import('wxt/browser');
      const [domains, head, stored] = await Promise.all([readDomains(db), readHead(db), browser.storage.session.get('session')]);
      const cursor = head.cursor?.session === stored.session ? head.cursor : null;
      const enabled = head.state?.enabled ?? true;
      const segment = enabled ? openCredit(cursor, head.lastEnd, Date.now()) : null;
      return { date, ...daySummary({ domains, days: await daysBetween(db, date, date), segment, date, siteMerge }) };
    } catch (error) {
      console.error('PageTime could not read that day', error);
      return null;
    }
  }, [date, siteMerge]);
  return result === undefined ? undefined : result;
}

export const useLedger = isExtension ? useExtensionLedger : usePreviewLedger;
