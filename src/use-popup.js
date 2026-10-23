import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isExtension, watchLedgerError } from './data.js';
import { daysBetween, openLedger, readDomains, readHead } from './ledger.mjs';
import { dateKey } from './model.mjs';
import { popupToday, popupTopSites } from './popup-model.mjs';

let db;

function useExtensionPopup(host) {
  const [marker, setMarker] = useState();
  useEffect(() => watchLedgerError(setMarker), []);
  const result = useLiveQuery(async () => {
    const hostKey = host ?? '';
    try {
      db ??= openLedger();
      const { browser } = await import('wxt/browser');
      const now = Date.now();
      const key = dateKey(now);
      const [domains, head, stored, days] = await Promise.all([
        readDomains(db),
        readHead(db),
        browser.storage.session.get('session'),
        daysBetween(db, key, key),
      ]);
      const cursor = head.cursor?.session === stored.session ? head.cursor : null;
      const enabled = head.state?.enabled ?? true;
      const input = { domains, days, cursor, lastEnd: head.lastEnd, now, enabled };
      return { hostKey, enabled, ...popupToday({ ...input, host }), top: popupTopSites(input) };
    } catch (error) {
      console.error('PageTime could not read the ledger', error);
      return { hostKey, error: 'read' };
    }
  }, [host]);
  return {
    pending: result === undefined,
    error: result?.error ?? (marker ? 'save' : undefined),
    figures: result ?? null,
  };
}

function usePreviewPopup(host) {
  return {
    pending: false,
    error: undefined,
    figures: { hostKey: host ?? '', enabled: true, total: 0, site: null, siteMs: 0, top: [] },
  };
}

export const usePopupQuery = isExtension ? useExtensionPopup : usePreviewPopup;
