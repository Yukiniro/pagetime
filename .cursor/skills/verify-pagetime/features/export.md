# 导出 JSON / CSV

Settings downloads the ledger from the page. JSON is every table plus recording state and settings (`format: "pagetime-ledger"`). CSV is one row per local date and raw hostname, UTF-8 with a BOM, header `date,host,active_ms,visits`. Nothing is uploaded. Restoring a backup is a separate journey in [restore.md](restore.md).

## Sub-features

- Buttons `Export JSON` and `Export CSV` under the heading `Export data`.
- Note: `The file is saved only on your computer. It contains hostnames and durations, never URLs or titles.`
- While a large build is in progress, status `Exporting…` and the other button disabled. An empty ledger can finish before that text is observable.
- Success status `Saved pagetime-<local date>.json.` or `.csv.` The filename uses `exportFileName` in `src/export.mjs`. The status node stays that sentence. Beside it, list `Export summary` (`#export-summary`) shows export time, time zone, recorded start and end days when the ledger has a day total, site count, and day-total row count. JSON also shows `Settings included` and `Extension <version>` from `package.json`. CSV omits those two lines. An empty ledger still shows site count `0` and day-total rows `0`, and omits the recorded-days line. The list is read-only. It is not a "local data overview" section.
- Failure: alert `Export failed` / `Nothing was downloaded. Try again.` The summary list is absent. The e2e forces this by replacing `URL.createObjectURL`. Do not patch that in this journey.

## How to get to it (user POV)

Sidebar `Settings`, then the row `Export data`, above `Clear all records` and the button `Clear data`. Both the preview and the extension show it.

## Driving it with Playwright

Fresh preview context or fresh extension profile. English. Listen for downloads before the click.

1. Open `Settings` and assert the heading `Export data` and the note above.
2. Record network requests. Click `Export JSON` with `page.waitForEvent('download')` already waiting. The suggested filename matches `/^pagetime-\d{4}-\d{2}-\d{2}\.json$/`. The status text is `Saved <that filename>.` The list `Export summary` is next to that status. On an empty ledger it includes `Sites 0`, `Day-total rows 0`, `Settings included`, and `Extension` plus the `package.json` version, and it has no `Recorded` line. The time zone matches `Intl.DateTimeFormat().resolvedOptions().timeZone`.
3. Parse the file. `format` is `pagetime-ledger`, `schemaVersion` is `1`, `tables` keys are `domains`, `days`, `hours`, `spans`, `visits` in that order. On an empty preview every table is `[]`, `recording.enabled` is true, and `settings.recordMode` is `blacklist`. The body has no `http://` URL.
4. Click `Export CSV` the same way. The filename ends in `.csv`. The first three bytes are `EF BB BF`. The first line is `date,host,active_ms,visits`. An empty ledger has no further data row. The summary list updates and omits `Settings included` and `Extension`. Site count and day-total rows stay `0` on an empty ledger.
5. Assert that no request started by those clicks has a URL outside the page origin (the preview origin `launch` printed, or `chrome-extension://` for the dashboard). The download is a blob URL, not a navigation.
6. Screenshot the status line. Do not click `Restore from backup` or `Clear data`.

## Gotchas

- Preview export reads `pagetime-preview` through `previewSnapshot`. It will not contain extension IndexedDB rows. Extension export reads `pagetime-ledger`.
- `Exporting…` is guaranteed by the e2e that writes a year of 200 sites inside the service worker. This journey does not write that fixture. Missing `Exporting…` on an empty file is not a failure. A missing download, or a status other than `Saved pagetime-<date>.<ext>.`, is a failure.
- The status node is `role="status"`. The summary is the list `Export summary`, not a second status and not a heading. The error node is `role="alert"`. Do not treat the static note as the status. A failed export removes the list.
- CSV rows use the raw hostname. Stripping a leading `www.`, `m.`, or `mobile.` does not merge export rows.
- A proof that only checks the button labels is incomplete; the download body is the side effect. Restore is covered by [restore.md](restore.md), not by this journey.
