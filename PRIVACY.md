# PageTime privacy

PageTime is a browsing ledger that lives in Chrome or Edge on this device. Each statement below matches the implementation: `entrypoints/background.ts` decides what to record, `src/ledger.mjs` defines and writes the ledger, `src/model.mjs` sets retention, `src/settings.mjs` sets the timing preferences, and `wxt.config.ts` sets the permissions. 中文版见 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md).

## What is stored

The durable ledger is the IndexedDB database `pagetime-ledger` in the extension's own origin. IndexedDB needs no manifest permission. It has these tables:

| Table | Contents |
| --- | --- |
| `domains` | `{ id, host }`. `host` is a hostname. The other tables refer to it by `id` |
| `days` | `{ date, domainId, ms, visits }`. Active milliseconds and visit count of one site on one local date (`YYYY-MM-DD`) |
| `hours` | `{ date, hour, domainId, ms }`. Active milliseconds of one site in one local clock hour |
| `spans` | `{ id, domainId, start, end }`. Start and end of one foreground active interval, in milliseconds. A span never crosses local midnight |
| `visits` | `{ id, domainId, at }`. `at` is the main-frame commit time in milliseconds |
| `meta` | `state`: `{ enabled, since }`, whether recording is on and when this ledger was created or last cleared. `cursor`: the service-worker checkpoint described below |

Each timing event updates `days`, `hours`, `spans`, `visits`, and `cursor` in one IndexedDB transaction, so they are all written or none is. The dashboard reads the same database directly and refreshes when it changes. `domainOf` in `src/model.mjs` keeps only the `hostname` of an `http:` or `https:` URL. Path, query, fragment, port, and userinfo are dropped.

Versions before the IndexedDB ledger kept their records in the `data` key of `chrome.storage.local`. This version never reads, writes, or deletes that key, so records saved by an older version stay there unchanged and are not shown. The new ledger starts empty.

If a ledger write fails, the background stores `ledgerError` in `chrome.storage.local`: `{ at, name }`, the time and the error name. The dashboard shows a save error while it is present. The next successful write removes it. A failed cleanup of old detail is only logged and does not set it.

Besides the ledger and `settings`, the extension keeps two small keys: `session` in `chrome.storage.session` holds only a random session id, and `ledgerError` in `chrome.storage.local` holds only the error time and name. Neither contains a domain, URL, or any other browsing data.

Timing preferences are a separate `settings` key in `chrome.storage.local`. They are not part of the ledger:

| Field | Contents |
| --- | --- |
| `schema` | `1` |
| `idleSeconds` | `60`, `120`, `300`, or `600`. Seconds without keyboard or mouse input before the browser counts as idle |
| `countAudible` | When true, idle time still counts if the active tab of the focused window is audible and not muted. The default is true |
| `badge` | When true, the toolbar icon shows today's active browsing time. The default is true |
| `recordMode` | `blacklist` or `whitelist`. The default is `blacklist`. Blacklist times every host except `ignored`. Whitelist times only hosts in `allowed`. An empty `allowed` list records nothing. Switching mode does not clear the other list and does not delete or hide ledger rows |
| `ignored` | Up to 500 hostnames the user typed, each at most 253 characters. Stored only in this `settings` key. An entry matches that host and its subdomains. Enforced only while `recordMode` is `blacklist`. Adding or removing an entry does not delete or hide ledger rows |
| `allowed` | Up to 500 hostnames, with the same length and match rules as `ignored`. Enforced only while `recordMode` is `whitelist`. Adding or removing an entry does not delete or hide ledger rows |

`validateSettings` in `src/settings.mjs` replaces an invalid `schema`, `idleSeconds`, `countAudible`, or `recordMode` with the default. A missing `ignored` or `allowed` list is `[]`. Invalid entries are dropped, duplicates are removed, and each list is cut at 500. It does not throw and does not change the ledger. If `settings` is missing, the background uses `{ schema: 1, idleSeconds: 60, countAudible: true, siteMerge: 'prefix', recordMode: 'blacklist', ignored: [], allowed: [], badge: true }`. `idleSeconds`, `countAudible`, `badge`, and `recordMode` are not a browsing history. The chosen display language is stored in the `language` key of `chrome.storage.local` so the toolbar title can follow it. `ignored` and `allowed` are the lists of domains the user entered. The background also reads `tab.audible` and `tab.mutedInfo` to apply `countAudible`. Those flags are not written into the ledger or `settings`.

Titles, full URLs, page content, cookies, and form input are not stored. The extension has no content script and does not call `chrome.scripting`, so it does not read the page DOM.

The service-worker checkpoint is the `cursor` row in `meta`: `{ tabId, domain, since, session }`. `tabId` is the browser's tab id. `session` is a random id that the background keeps in the `session` key of `chrome.storage.session`. A cursor whose `session` does not match is ignored, so the checkpoint ends with the browser session or an extension reload, as before. The cursor is removed when nothing is being recorded, and also on clear, pause, and resume. Deleting the site named by the cursor, or deleting today's records, keeps the cursor and sets `since` to the time of that deletion in the same transaction. Time before that moment is not written on the next checkpoint. The cursor is not a browsing history.

The background does receive a URL from the `tabs` and `webNavigation` events so it can take the hostname. That URL is not written into the ledger.

## Where it lives

On this device only:

- The extension uses IndexedDB, `chrome.storage.local`, and `chrome.storage.session`. The code never calls `chrome.storage.sync`. It uses Dexie as the IndexedDB library and does not include Dexie Cloud or any sync add-on.
- There is no account, sign-in, or identity permission.
- The background and dashboard source make no network requests. The manifest requests no host permission, so the extension is not granted access to read pages or send the ledger to another host.
- The local preview (`npm run dev`) is not the installed extension. It stores a `{ visits, spans, enabled, since }` object in `localStorage` under `pagetime-preview`, and the same `settings` shape under `pagetime-preview-settings`. `clear`, `deleteSite`, and `deleteDay` edit that object on this device. It still does not upload either. `worker/index.js` only serves the static Sites preview. It is not in the extension package and does not receive browsing records.

## How long it is kept

The numbers are the constants in `src/model.mjs`. `docs/timing.md` states the same numbers, and `tests/timing-docs.test.mjs` checks that it does. The idle number below is the default; the stored threshold may differ:

| Constant | Value | Effect |
| --- | --- | --- |
| `DETAIL_DAYS` | 31 | `spans` and `visits` that start before local midnight 30 days before today are removed, so today and the 30 days before it are kept. The background prunes them on its first write of each day and after each restart. `days` and `hours` totals are not removed by age. They stay until you clear the ledger or delete that site or day |
| `CHECKPOINT_SECONDS` | 30 | Period of the checkpoint alarm, in a `periodInMinutes` of this value divided by 60 |
| `IDLE_SECONDS` | 60 | Default idle threshold. The stored `settings.idleSeconds` may instead be 120, 300, or 600. Recording stops after that many seconds without keyboard or mouse input, unless `countAudible` is on and the active tab of the focused window is audible and not muted. A locked screen never counts |
| `GAP_LIMIT_MS` | 90000 | A gap between checkpoints is credited at most 90 seconds |

The detail tables have no count cap. The public timing rules are the README section on what is counted, [docs/timing.md](docs/timing.md), `tests/model.test.mjs`, `tests/timing.test.mjs`, `tests/timing-docs.test.mjs`, and `docs/timing-qa.md`.

## No network, telemetry, or account

The manifest permissions are `storage`, `tabs`, `webNavigation`, `idle`, and `alarms`. Configurable idle time and audio counting add no new permission. There is no host permission and no content script. `incognito` is `not_allowed`, so incognito windows are not recorded. The extension declares no telemetry, analytics, or account API. The dashboard may send only `snapshot`, `toggle`, `clear`, `deleteSite`, `deleteDay`, `settings`, and `restore`. The toolbar popup may send only `snapshot`, `toggle`, and `settings`. The background accepts those messages only from this extension's own `dashboard.html` and `popup.html`. The popup cannot clear or delete records. Deleting records adds no permission.

## How to delete it

- In a site's details, choose delete this site's records and confirm. On `deleteSite`, the background removes that stored hostname from `days`, `hours`, `spans`, and `visits`, then removes its `domains` row, in one transaction. The dashboard sends every raw hostname that the current grouping shows as that site. Adding a site to `ignored` or `allowed` does not delete rows, and this delete does not add the site to either list.
- In Settings, above clear all records, choose a date from when this ledger started through today. The page shows that day's total time and site count. Confirming sends `deleteDay`. The background removes that local date's `days` and `hours` rows, visits whose time falls on that day, and the part of each span that falls on that day. A span that crosses midnight keeps the part outside that day. One transaction.
- If the deleted site is the cursor's site, or the deleted date is today, the same transaction sets the cursor's `since` to the deletion time. The next checkpoint does not write the removed interval back.
- In the dashboard, open Settings, choose clear all records, and confirm. On `clear`, the background empties every table of `pagetime-ledger` in one transaction, including `cursor`. It keeps the current `enabled` flag and sets `since` to the time of the clear. It does not touch the old `data` key.
- Removing the extension from the browser deletes that extension's IndexedDB and `chrome.storage`, including an old `data` key.
- Pausing recording sets `enabled` in `meta.state` to false. It does not delete the ledger.

Deleting, clearing, and uninstalling cannot be undone from inside the ledger. Settings can replace the ledger and settings from a PageTime backup JSON file. There is no recycle bin and no sync.

## How to export it

Settings → Export data saves a copy of the ledger as a file. The dashboard reads `meta.state` and every row of `domains`, `days`, `hours`, `spans`, and `visits` in one read-only IndexedDB transaction (`readLedgerSnapshot` in `src/ledger.mjs`), builds the file in the page (`src/export.mjs`), and saves it through a `Blob` URL and an `<a download>` link. Nothing is sent over the network, no message is added, and no `downloads` permission is used. Export JSON writes `pagetime-YYYY-MM-DD.json` with `format: "pagetime-ledger"`, `schemaVersion`, `exportedAt`, `timeZone`, `appVersion`, `recording` (`meta.state`), the whole `settings` record including `ignored`, `allowed`, `recordMode`, and `siteMerge`, and the five tables with rows sorted by primary key. The `cursor` row is not exported. Export CSV writes `pagetime-YYYY-MM-DD.csv`, UTF-8 with a byte order mark, with the columns `date,host,active_ms,visits`: one row per stored local date and raw hostname from `days`, not grouped by `siteMerge`. Neither file contains a URL, title, or page content. The saved file is outside the extension, so deleting, clearing, or uninstalling does not remove it. In the local preview, export uses the `pagetime-preview` object.

## How to restore it

Settings → Export data → Restore from backup reads one local JSON file in the page (`<input type="file">`, `src/import-file.js`). The page parses it and checks `format: "pagetime-ledger"` and a known `schemaVersion` (`src/import.mjs`). Unknown row fields are dropped. A missing format, an unknown version, or a table that does not match the exported rows is rejected before any write, and the ledger stays as it was. CSV is not accepted. After one confirm, the dashboard sends `restore`. The background, in one IndexedDB transaction, clears `domains`, `days`, `hours`, `spans`, and `visits`, writes the file's rows, writes `recording` to `meta.state`, and deletes `cursor`. If that transaction fails, IndexedDB rolls it back. The background then stores `settings` through `validateSettings` into `chrome.storage.local`, and prunes `spans` and `visits` with the existing `DETAIL_DAYS` cutoff. `days` and `hours` stay as they are in the file. The file is not uploaded, no permission is added, and there is no content script. The local preview disables restore and does not write `pagetime-preview` or `pagetime-preview-settings`.
