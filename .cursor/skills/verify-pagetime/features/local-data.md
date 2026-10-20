# 本地数据概况

Settings shows a read-only snapshot of the IndexedDB ledger: recording start, the earliest day total, the 31-day detail boundary, hostname count, row counts per table, the `navigator.storage.estimate()` figure when the browser returns one, and the old `data` key's size only while that key still exists. There is no delete or cleanup control in this section.

## Sub-features

- Region `Local data`, with `IndexedDB (pagetime-ledger)`.
- `Recording since`, `Earliest daily total` (`No records yet` on a fresh profile), `Visit and session detail` (`Kept for 31 days, from`), `Sites` (`0 hostnames` then a live count).
- `Rows per table`: Daily totals `days`, Hourly totals `hours`, Active sessions `spans`, Visits `visits`.
- `Space used (estimate)` when `storage.estimate()` returns a positive usage. Hidden when the method is missing or rejects.
- `Older version data` only while `chrome.storage.local` still has the `data` key. A fresh profile does not show it.

## How to get to it (user POV)

Open the extension's PageTime page, then sidebar `Settings`, and scroll to `Local data`. It sits above `Export data`. The preview has no IndexedDB ledger, so this block is not on the preview settings page.

## Driving it with Playwright

Extension dashboard only, English, fresh profile so the ledger is empty.

1. If `location.protocol` is not `chrome-extension:`, stop. The heading `Local data` is absent on purpose (`useLocalData` returns null outside the extension). Failing the preview here is the correct result.
2. Click `Settings`. `getByRole('region', { name: 'Local data' })` is visible.
3. Assert the region contains `IndexedDB (pagetime-ledger)`, `0 hostnames`, `No records yet` beside `Earliest daily total`, and `Kept for 31 days, from`.
4. Assert the region has no button (no delete, no cleanup). The `Clear data` button is a different settings row; do not click it.
5. On a normal Chrome build, `Space used (estimate)` is visible. Do not stub `storage.estimate`. If the text is missing, record the browser and treat it as the hidden-estimate case only when `navigator.storage.estimate` is missing or rejects; the e2e `the data overview hides the space estimate when storage.estimate() is missing or fails` covers the stub.
6. Assert the region does not contain `Older version data`.
7. Screenshot the region. Leave the profile empty: do not write the legacy `data` key and do not clear the ledger.

## Gotchas

- The preview journey fails at step 1. Do not render a stand-in section and do not open IndexedDB from the preview origin.
- `Kept for 31 days` uses the same cutoff as `pruneDetail` (`detailCutoff`). The date moves with the local clock; assert the prefix, not a fixed calendar day.
- Row labels include the store name (`visits`, `spans`, `days`, `hours`). The e2e matches list items with `/^0\s*Visits/` on an empty ledger.
- A live update (a visit appearing without reload) is the e2e `the settings data overview reads the ledger live`. This journey only proves the fresh-profile read. Do not clear data to get back to zero.
