import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, hoursBetween, openLedger, readDomains, readHead, readLedgerStats, recentVisits, siteDays, siteHours, spansBetween } from './ledger.mjs';
import { localDataOverview } from './local-data.mjs';
import { siteSeries, siteSeriesFromSnapshot, VISIT_LIST_LIMIT, daySummary, viewFromLedger, viewFromSnapshot } from './ledger-view.mjs';
import { addDays, dateKey, openCredit } from './model.mjs';
import { trendWindow } from './range.mjs';
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
      // Today keeps a last-7-days trend tab. Any other range charts that range.
      // Extra trend rows stay out of the main view, so rankings and visits keep the selected range.
      // `focus` limits the bars to one merged site. It does not change the visit list or ranking totals.
      const trend = trendWindow(range, range.today);
      const fetchFrom = dateKey(Math.min(range.start, trend.start, range.today));
      const fetchTo = dateKey(Math.max(addDays(range.end, -1), addDays(trend.end, -1), range.today));
      const [allDays, hours, spans, visits] = await Promise.all([
        daysBetween(db, fetchFrom, fetchTo),
        hoursBetween(db, displayFrom, displayTo),
        spansBetween(db, range.today, addDays(range.today, 1)),
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
      const [detailDays, detailHours] = range.detail ? await Promise.all([
        Promise.all(detailIds.map(id => siteDays(db, id, displayFrom, displayTo))),
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
      return {
        rangeKey,
        view: viewFromLedger(rows, { ...range, now }),
        trendDays,
        detail: range.detail ? siteSeries({
          domains, days: detailDays.flat(), hours: detailHours.flat(), state: head.state, cursor, lastEnd: head.lastEnd,
        }, { site: range.detail, siteMerge: range.siteMerge, start: range.start, end: range.end, now }) : null,
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
    view: data ? viewFromSnapshot(data, range) : undefined,
    trendDays: data ? viewFromSnapshot(data, { start: trend.start, end: trend.end, today: range.today, site: range.focus || '', siteMerge: range.siteMerge }).days : undefined,
    detail: data && range.detail ? siteSeriesFromSnapshot(data, { start: range.start, end: range.end, site: range.detail, siteMerge: range.siteMerge, now }) : null,
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

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

// The settings data overview. Null outside the extension: the preview has no IndexedDB ledger.
// `usage` is null when storage.estimate() is missing or fails; `legacy` is null when the old `data` key is gone.
export function useLocalData() {
  const stats = useLiveQuery(async () => {
    if (!isExtension) return null;
    try {
      db ??= openLedger();
      return await readLedgerStats(db);
    } catch (error) {
      console.error('PageTime could not read the data overview', error);
      return null;
    }
  }, []);
  const [usage, setUsage] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const version = stats ? JSON.stringify(stats) : '';
  useEffect(() => {
    if (!version) return;
    let live = true;
    Promise.resolve().then(() => navigator.storage.estimate()).then(estimate => { if (live) setUsage(positive(estimate?.usage)); }, () => { if (live) setUsage(null); });
    return () => { live = false; };
  }, [version]);
  useEffect(() => {
    if (!isExtension) return;
    let live = true;
    // getBytesInUse sizes the key without reading its contents.
    import('wxt/browser').then(({ browser }) => browser.storage.local.getBytesInUse('data')).then(bytes => { if (live) setLegacy(positive(bytes)); }, () => {});
    return () => { live = false; };
  }, []);
  if (!stats) return null;
  return { overview: localDataOverview(stats, Date.now()), usage, legacy };
}
