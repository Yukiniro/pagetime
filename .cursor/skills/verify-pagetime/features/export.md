# 导出 JSON / CSV

Settings downloads the ledger from the page. JSON is every table plus recording state and settings (`format: "pagetime-ledger"`). CSV is one row per local date and raw hostname, UTF-8 with a BOM, header `date,host,active_ms,visits`. Nothing is uploaded, and there is no import.

## Sub-features

- Buttons `Export JSON` and `Export CSV` under the heading `Export data`.
- Note: `The file is saved only on your computer. It contains hostnames and durations, never URLs or titles.`
- While a large build is in progress, status `Exporting…` and the other button disabled. An empty ledger can finish before that text is observable.
- Success status `Saved pagetime-<local date>.json.` or `.csv.` The filename uses `exportFileName` in `src/export.mjs`.
- Failure: alert `Export failed` / `Nothing was downloaded. Try again.` The e2e forces this by replacing `URL.createObjectURL`. Do not patch that in this journey.

## How to get to it (user POV)

Sidebar `Settings`, then the row `Export data`, above `Delete one day's records`. Both the preview and the extension show it.

## Driving it with Playwright

Fresh preview context or fresh extension profile. English. Listen for downloads before the click.

1. Open `Settings` and assert the heading `Export data` and the note above.
2. Record network requests. Click `Export JSON` with `page.waitForEvent('download')` already waiting. The suggested filename matches `/^pagetime-\d{4}-\d{2}-\d{2}\.json$/`. The status text is `Saved <that filename>.`
3. Parse the file. `format` is `pagetime-ledger`, `schemaVersion` is `1`, `tables` keys are `domains`, `days`, `hours`, `spans`, `visits` in that order. On an empty preview every table is `[]`, `recording.enabled` is true, and `settings.recordMode` is `blacklist`. The body has no `http://` URL.
4. Click `Export CSV` the same way. The filename ends in `.csv`. The first three bytes are `EF BB BF`. The first line is `date,host,active_ms,visits`. An empty ledger has no further data row.
5. Assert that no request started by those clicks has a URL outside the page origin (the preview origin `launch` printed, or `chrome-extension://` for the dashboard). The download is a blob URL, not a navigation.
6. Screenshot the status line. Do not add an import control, and do not click `Clear data`.

## Gotchas

- Preview export reads `pagetime-preview` through `previewSnapshot`. It will not contain extension IndexedDB rows. Extension export reads `pagetime-ledger`.
- `Exporting…` is guaranteed by the e2e that writes a year of 200 sites inside the service worker. This journey does not write that fixture. Missing `Exporting…` on an empty file is not a failure. A missing download, or a status other than `Saved pagetime-<date>.<ext>.`, is a failure.
- The status node is `role="status"`. The error node is `role="alert"`. Do not treat the static note as the status.
- CSV rows use the raw hostname. Grouping (`prefix` / `registrable`) does not merge export rows.
- There is no import. A proof that only checks the button labels is incomplete; the download body is the side effect.
