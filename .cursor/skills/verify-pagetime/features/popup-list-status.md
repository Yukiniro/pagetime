# popup 站点名单状态

When recording is not globally paused but the current recordable host is excluded by the blacklist or whitelist (same `shouldRecord` match as Settings and the site-detail drawer, parent rules included), the popup status line says so for that site. Global pause wins. The site's figure still shows today's existing time. A page without an http(s) hostname never gets list copy.

## Sub-features

- Status priority: `Recording paused` (global) > `Not recording this site: ignored` (blacklist) or `Not recording this site: not allowed` (whitelist) > `Recording browsing activity`.
- `main` has `data-status-kind` set to `recording`, `siteIgnored`, `siteNotAllowed`, or `paused`. `data-paused` stays `false` for the two list states.
- The list button's undo (`Record this site again`, or `Record this site` in whitelist) returns the line to `Recording browsing activity` without a reload.
- `about:blank`, `chrome://` and other non-recordable pages show `Today's total` and the normal status line only.
- Narrow popup: the long copy wraps and `documentElement.scrollWidth` stays at most 320.

## How to get to it (user POV)

Install the extension, leave an http page active, click the toolbar icon, then press `Don't record this site`. Or switch Settings to Whitelist with an empty list and open the popup.

## Driving it with Playwright

Extension only. Fresh profile. Language is English. `tests/e2e/popup-list-status.spec.mjs` is this journey. Map `status.example.test` to the local server with `--host-resolver-rules`. Open the popup with `chrome.action.openPopup()` and drive it through `tests/e2e/popup-cdp.mjs`.

1. Focus the site tab until its credited time is above zero. The popup status is `Recording browsing activity`.
2. Click `Don't record this site`. The status becomes `Not recording this site: ignored`, `data-paused` is `false`, and the figure `[data-figure="site"]` still reads `Today …`.
3. Click `Pause recording`: `Recording paused`. Click `Resume recording`: back to the ignored copy.
4. Click `Record this site again`. The status returns to `Recording browsing activity`, and credited time increases again.
5. On Settings choose `Whitelist`, reopen the popup: `Not recording this site: not allowed`. `Record this site` returns to recording, `Stop recording this site` returns to not allowed.
6. Activate `about:blank` and reopen the popup: heading `Today's total`, no `Not recording this site` text.

## Gotchas

- Time accrues only on the focused site tab. Close the popup before reading credited time.
- Switch Settings back to Blacklist before leaving.
- Do not click `Clear data` or `Delete this site's records`.
