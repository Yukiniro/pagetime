import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, hoursBetween, openLedger, readDomains, readEarliestRecordedRows, readHead, recentVisits, siteDays, siteHours, spansBetween } from './ledger.mjs';
import { readComparison } from './compare.mjs';
import { compareFromSnapshot, detailSeriesArgs, siteSeries, siteSeriesFromSnapshot, VISIT_LIST_LIMIT, daySummary, viewFromLedger, viewFromSnapshot } from './ledger-view.mjs';
import { addDays, dateKey, openCredit } from './model.mjs';
import { customRangeSince, timelineDay, trendWindow } from './range.mjs';
import { siteOf } from './site.mjs';

let db;

// Re-runs whenever the background commits a change to a range this query read. The dashboard never writes.
function useExtensionLedger(range) {
  const [attempt, setAttempt] = useState(0);
  const [marker, setMarker] = useState();
  useEffect(() => watchLedgerError(setMarker), []);
  // Date-range refetches keep the previous result until IndexedDB answers. The key marks that result stale.
  const rangeKey = `${range.start}|${range.end}|${attempt}`;
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
      // A single day keeps a 7-day trend ending on that day. A longer range charts itself.
      // Extra trend rows stay out of the main view, so rankings and visits keep the selected range.
      // `focus` limits the bars to one merged site. It does not change the visit list or ranking totals.
      const trend = trendWindow(range, range.today);
      const chartDay = timelineDay(range, range.today);
      const fetchFrom = dateKey(Math.min(range.start, trend.start, range.today));
      const fetchTo = dateKey(Math.max(addDays(range.end, -1), addDays(trend.end, -1), range.today));
      const [allDays, hours, spans, visits] = await Promise.all([
        daysBetween(db, fetchFrom, fetchTo),
        hoursBetween(db, displayFrom, displayTo),
        spansBetween(db, chartDay, addDays(chartDay, 1)),
        recentVisits(db, range.start, range.end, ids, VISIT_LIST_LIMIT),
      ]);
      const rows = {
        state: head.state,
        domains,
        days: allDays,
        hours,
        spans,
        visits,
        cursor,
        lastEnd: head.lastEnd,
      };
      const detailIds = range.detail ? domains.filter(row => siteOf(row.host, range.siteMerge) === range.detail).map(row => row.id) : [];
      // Daily bars follow the trend tab. Hour buckets stay on the selected range.
      const detailArgs = range.detail ? detailSeriesArgs(range, now) : null;
      const [detailDays, detailHours] = detailArgs ? await Promise.all([
        Promise.all(detailIds.map(id => siteDays(db, id, detailArgs.dayFrom, detailArgs.dayTo))),
        Promise.all(detailIds.map(id => siteHours(db, id, displayFrom, displayTo))),
      ]) : [[], []];
      const trendDays = viewFromLedger({
        ...rows,
        days: allDays,
        hours: [],
        visits: [],
      }, {
        start: trend.start,
        end: trend.end,
        today: range.today,
        search: '',
        site: range.focus || '',
        siteMerge: range.siteMerge,
        now,
      }).days;
      const compare = await readComparison(db, {
        range, now, since: head.state?.since ?? now, domains, days: allDays,
        segment: (head.state?.enabled ?? true) ? openCredit(cursor, head.lastEnd, now) : null,
      });
      // When the recording start is missing, the custom-range bound is the earliest stored local day.
      const recordingSince = head.state?.since;
      const rangeSince = customRangeSince(
        recordingSince,
        Number.isFinite(recordingSince) ? undefined : await readEarliestRecordedRows(db),
        now,
      );
      return {
        rangeKey,
        compare,
        rangeSince,
        view: viewFromLedger(rows, { ...range, now }),
        trendDays,
        detail: detailArgs ? siteSeries({
          domains, days: detailDays.flat(), hours: detailHours.flat(), state: head.state, cursor, lastEnd: head.lastEnd,
        }, detailArgs) : null,
        detailSite: range.detail || '',
      };
    } catch (error) {
      console.error('PageTime could not read the ledger', error);
      return { rangeKey, error: 'read' };
    }
  }, [range.start, range.end, range.today, range.search, range.site, range.siteMerge, range.detail, range.focus, attempt]);
  const settled = result?.rangeKey === rangeKey;
  return {
    view: result?.view,
    compare: result?.compare,
    rangeSince: result?.rangeSince,
    trendDays: result?.trendDays,
    detail: result?.detail ?? null,
    detailSite: result?.detailSite ?? '',
    pending: !settled,
    error: (settled ? result?.error : undefined) ?? (marker ? 'save' : undefined),
    apply() {},
    retry: () => setAttempt(n => n + 1),
  };
}

function usePreviewLedger(range) {
  const [data, setData] = useState(null);
  const now = Date.now();
  const trend = trendWindow(range, range.today);
  return {
    rangeSince: data ? customRangeSince(data.since, data, now) : undefined,
    view: data ? viewFromSnapshot(data, range) : undefined,
    compare: data ? compareFromSnapshot(data, range, now) : undefined,
    trendDays: data ? viewFromSnapshot(data, { start: trend.start, end: trend.end, today: range.today, site: range.focus || '', siteMerge: range.siteMerge }).days : undefined,
    detail: data && range.detail ? siteSeriesFromSnapshot(data, detailSeriesArgs(range, now)) : null,
    detailSite: range.detail || '',
    pending: !data,
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
