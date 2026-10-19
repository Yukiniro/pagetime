# PageTime permissions

The permissions are `manifest.permissions` in `wxt.config.ts`. `scripts/verify-build.mjs` requires the built `manifest.json` to contain exactly these five:

`storage`, `tabs`, `webNavigation`, `idle`, `alarms`

There is no `host_permissions` entry (no host permission). There is no `content_scripts` entry (no content script). There is no `optional_permissions` entry. `incognito` is `not_allowed`. The only extension entrypoints are `entrypoints/background.ts` and `entrypoints/dashboard/`. 中文版见 [permissions.zh-CN.md](permissions.zh-CN.md).

## What the browser says at install

The [Chrome permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list) says that `tabs` and `webNavigation` each display **Read your browsing history**. The two warnings are the same sentence, so the install dialog shows it once. `storage`, `idle`, and `alarms` do not display an install warning.

This is not the `history` permission warning, “Read and change your browsing history on all your signed-in devices.” This extension does not request `history`. Edge uses the same Chromium warnings and translates the sentence for the browser language.

The warning describes what those APIs are able to do, not what PageTime writes into the ledger. The stored fields are listed in the [privacy note](../PRIVACY.md).

## `storage`

Stores the timing preferences in the `settings` key (including `badge`, which defaults to on, and hostnames the user typed into `settings.ignored`), the display language in the `language` key, and the write-failure marker in the `ledgerError` key of `chrome.storage.local`, and the id that ties the service-worker checkpoint to this browser session in the `session` key of `chrome.storage.session`. The ledger itself is in the extension's IndexedDB database `pagetime-ledger`, which needs no permission. An older version's `data` key in `chrome.storage.local` is left untouched. The toolbar badge uses `chrome.action` and does not add a permission.

It can read and write this extension's own storage area. The code uses local and session only, not sync. It cannot read another extension's storage, site cookies, or arbitrary files on disk. No install warning.

## `tabs`

Reads the URL of the active tab in the focused window, reduces it to a hostname, and skips incognito tabs. Without this permission the extension does not receive `tab.url`.

It can read a tab's URL, title, favicon, and pending URL, and it can query tabs by URL. It cannot read the page DOM, inject scripts, or call `chrome.history`. The current code uses `url`, `id`, `incognito`, `audible`, and `mutedInfo`. It does not read the title, and it does not store `audible` or `mutedInfo`. Install warning: “Read your browsing history”.

## `webNavigation`

Records one visit when a main-frame navigation commits (load or reload). A history-state change in the same document updates the active site and does not add another visit.

It can observe the full URL, frame id, transition type, and time on navigation events. It cannot read response bodies, block or change requests, or read the document. The current code ignores frames with `frameId !== 0`. A stored visit keeps the hostname and the time. Install warning: “Read your browsing history”.

## `idle`

Stops counting after `settings.idleSeconds` seconds without keyboard or mouse input. The default is `IDLE_SECONDS` (60); the stored value may be 60, 120, 300, or 600. The background calls `idle.setDetectionInterval` with that value and passes the same value to `idle.queryState`. A locked state never counts. When `countAudible` is on (the default), idle time still counts if the active tab of the focused window is audible and not muted. This uses the existing `idle` and `tabs` permissions. No new permission was added.

It can query `active`, `idle`, or `locked`. It cannot see which key was pressed. No install warning.

## `alarms`

Creates an alarm named `checkpoint` with `periodInMinutes` set to `CHECKPOINT_SECONDS / 60` (30 seconds). The browser may delay the alarm. A delayed gap is credited at most `GAP_LIMIT_MS` (90 seconds).

It can wake this extension's background on a schedule. By itself it cannot read browsing data. No install warning.

## What is not requested

- **No host permission.** The manifest does not grant a host pattern, so the extension cannot inject into pages or use a host permission to read them.
- **No content script.** The repository has no content-script entrypoint, and the build check requires `content_scripts` to be absent or empty.
- **No `history`, `scripting`, `cookies`, `webRequest`, or `identity`.** The extension cannot read or change the browser history database, run page scripts, read cookies, inspect request bodies, or use an account.
