# PageTime privacy

PageTime is a browsing ledger that lives in Chrome or Edge on this device. Each statement below matches the implementation: `entrypoints/background.ts` writes the records, `src/model.mjs` sets retention, `src/validate-data.mjs` sets the shape that may be stored, and `wxt.config.ts` sets the permissions. 中文版见 [PRIVACY.zh-CN.md](PRIVACY.zh-CN.md).

## What is stored

The durable ledger is the `data` key in `chrome.storage.local`:

| Field | Contents |
| --- | --- |
| `visits` | `{ domain, at }`. `domain` is a hostname. `at` is the main-frame commit time in milliseconds |
| `spans` | `{ domain, start, end }`. Start and end of one foreground active interval, in milliseconds |
| `enabled` | Whether recording is on |
| `since` | When this ledger was created or last cleared, in milliseconds. Not a URL |

The visit count shown in the UI is the number of `visits`. It is not stored as its own counter. `domainOf` in `src/model.mjs` keeps only the `hostname` of an `http:` or `https:` URL. Path, query, fragment, port, and userinfo are dropped. `validate-data.mjs` rejects a domain that contains `/`, `?`, `#`, `@`, or whitespace. An invalid `data` object is left untouched.

Titles, full URLs, page content, cookies, and form input are not stored. The extension has no content script and does not call `chrome.scripting`, so it does not read the page DOM.

The service-worker checkpoint is the `cursor` key in `chrome.storage.session`: `{ tabId, domain, since }`. `tabId` is the browser's tab id. The cursor is removed when nothing is being recorded, and also on browser startup, clear, pause, and resume. It is not a browsing history, and it disappears when the browser session ends.

The background does receive a URL from the `tabs` and `webNavigation` events so it can take the hostname. That URL is not written into the ledger.

## Where it lives

On this device only:

- The extension uses `chrome.storage.local` and `chrome.storage.session`. The code never calls `chrome.storage.sync`.
- There is no account, sign-in, or identity permission.
- The background and dashboard source make no network requests. The manifest requests no host permission, so the extension is not granted access to read pages or send the ledger to another host.
- The local preview (`npm run dev`) is not the installed extension. It stores the same `data` shape in `localStorage` under `pagetime-preview` and still does not upload it. `worker/index.js` only serves the static Sites preview. It is not in the extension package and does not receive browsing records.

## How long it is kept

The numbers are the constants in `src/model.mjs`. The in-extension explainer reads them through `timingCopy`:

| Constant | Value | Effect |
| --- | --- | --- |
| `RETENTION_DAYS` | 90 | Visits older than now minus 90 days are removed. Spans that end at or before that cutoff are removed. A span that crosses the cutoff is trimmed to start at the cutoff |
| `LIMIT` | 20000 | Visits and spans are each capped at 20000. The oldest entries past the cap are removed |
| `CHECKPOINT_SECONDS` | 30 | Period of the checkpoint alarm, in a `periodInMinutes` of this value divided by 60 |
| `IDLE_SECONDS` | 60 | Recording stops after this many seconds without keyboard or mouse input |
| `GAP_LIMIT_MS` | 90000 | A gap between checkpoints is credited at most 90 seconds |

Visits and spans are capped separately, so the two lists are not guaranteed to cover the same 90 days. The public timing rules are the README section on what is counted, the in-extension "How time is counted" dialog, `tests/model.test.mjs`, `tests/timing.test.mjs`, `tests/timing-copy.test.mjs`, and `docs/timing-qa.md`.

## No network, telemetry, or account

The manifest permissions are `storage`, `tabs`, `webNavigation`, `idle`, and `alarms`. There is no host permission and no content script. `incognito` is `not_allowed`, so incognito windows are not recorded. The extension declares no telemetry, analytics, or account API. The dashboard may send only `snapshot`, `toggle`, and `clear`, and the background accepts those messages only from this extension's own `dashboard.html`.

## How to delete it

- In the dashboard, open Settings, choose clear all records, and confirm. On `clear`, the background removes `cursor` and writes an empty visit list and span list. It keeps the current `enabled` flag and sets `since` to the time of the clear.
- Removing the extension from the browser deletes that extension's `chrome.storage`.
- Pausing recording sets `enabled` to false. It does not delete the ledger.

Clearing and uninstalling cannot be undone. This version has no backup, sync, import, or export command. What makes the ledger portable is the JSON shape above: it stays in local storage on this device and is not locked to an account.
