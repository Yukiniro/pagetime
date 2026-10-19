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
| `ignored` | Up to 500 hostnames the user typed, each at most 253 characters. Stored only in this `settings` key. An entry matches that host and its subdomains. Adding or removing an entry does not delete or hide ledger rows |

`validateSettings` in `src/settings.mjs` replaces an invalid `schema`, `idleSeconds`, or `countAudible` with the default. A missing `ignored` list is `[]`. Invalid entries are dropped, duplicates are removed, and the list is cut at 500. It does not throw and does not change the ledger. If `settings` is missing, the background uses `{ schema: 1, idleSeconds: 60, countAudible: true, ignored: [], badge: true }`. `idleSeconds`, `countAudible`, and `badge` are not a browsing history. The chosen display language is stored in the `language` key of `chrome.storage.local` so the toolbar title can follow it. `ignored` is the list of domains the user entered. The background also reads `tab.audible` and `tab.mutedInfo` to apply `countAudible`. Those flags are not written into the ledger or `settings`.

Titles, full URLs, page content, cookies, and form input are not stored. The extension has no content script and does not call `chrome.scripting`, so it does not read the page DOM.

The service-worker checkpoint is the `cursor` row in `meta`: `{ tabId, domain, since, session }`. `tabId` is the browser's tab id. `session` is a random id that the background keeps in the `session` key of `chrome.storage.session`. A cursor whose `session` does not match is ignored, so the checkpoint ends with the browser session or an extension reload, as before. The cursor is removed when nothing is being recorded, and also on clear, pause, and resume. It is not a browsing history.

The background does receive a URL from the `tabs` and `webNavigation` events so it can take the hostname. That URL is not written into the ledger.

## Where it lives

On this device only:

- The extension uses IndexedDB, `chrome.storage.local`, and `chrome.storage.session`. The code never calls `chrome.storage.sync`. It uses Dexie as the IndexedDB library and does not include Dexie Cloud or any sync add-on.
- There is no account, sign-in, or identity permission.
- The background and dashboard source make no network requests. The manifest requests no host permission, so the extension is not granted access to read pages or send the ledger to another host.
- The local preview (`npm run dev`) is not the installed extension. It stores a `{ visits, spans, enabled, since }` object in `localStorage` under `pagetime-preview`, and the same `settings` shape under `pagetime-preview-settings`. It still does not upload either. `worker/index.js` only serves the static Sites preview. It is not in the extension package and does not receive browsing records.

## How long it is kept

The numbers are the constants in `src/model.mjs`. The in-extension explainer reads them through `timingCopy(settings)`, so the idle number follows the stored threshold:

| Constant | Value | Effect |
| --- | --- | --- |
| `DETAIL_DAYS` | 31 | `spans` and `visits` that start before local midnight 30 days before today are removed, so today and the 30 days before it are kept. The background prunes them on its first write of each day and after each restart. `days` and `hours` totals are not removed by age and stay until you clear the ledger |
| `CHECKPOINT_SECONDS` | 30 | Period of the checkpoint alarm, in a `periodInMinutes` of this value divided by 60 |
| `IDLE_SECONDS` | 60 | Default idle threshold. The stored `settings.idleSeconds` may instead be 120, 300, or 600. Recording stops after that many seconds without keyboard or mouse input, unless `countAudible` is on and the active tab of the focused window is audible and not muted. A locked screen never counts |
| `GAP_LIMIT_MS` | 90000 | A gap between checkpoints is credited at most 90 seconds |

The detail tables have no count cap. The public timing rules are the README section on what is counted, the in-extension "How time is counted" dialog, `tests/model.test.mjs`, `tests/timing.test.mjs`, `tests/timing-copy.test.mjs`, and `docs/timing-qa.md`.

## No network, telemetry, or account

The manifest permissions are `storage`, `tabs`, `webNavigation`, `idle`, and `alarms`. Configurable idle time and audio counting add no new permission. There is no host permission and no content script. `incognito` is `not_allowed`, so incognito windows are not recorded. The extension declares no telemetry, analytics, or account API. The dashboard may send only `snapshot`, `toggle`, `clear`, and `settings`, and the background accepts those messages only from this extension's own `dashboard.html`.

## How to delete it

- In the dashboard, open Settings, choose clear all records, and confirm. On `clear`, the background empties every table of `pagetime-ledger` in one transaction, including `cursor`. It keeps the current `enabled` flag and sets `since` to the time of the clear. It does not touch the old `data` key.
- Removing the extension from the browser deletes that extension's IndexedDB and `chrome.storage`, including an old `data` key.
- Pausing recording sets `enabled` in `meta.state` to false. It does not delete the ledger.

Clearing and uninstalling cannot be undone. This version has no backup, sync, import, or export command. What makes the ledger portable is the table shape above: it stays in local storage on this device and is not locked to an account.
