# 工具栏 popup

Clicking the toolbar icon opens the popup. The popup shows today's active time for the current site and today's total, then three controls: the list button, pause or resume, and the toolbar badge. Open dashboard focuses an existing dashboard tab when one is already open. A page without an http(s) hostname shows only today's total.

## Sub-features

- Site row: heading is the grouped site (prefix mode strips a leading `www.`). The large figure is that site's time today. The line under it matches `Today <duration> total`. A current site also shows `SiteIcon` beside the name; that journey is [popup-site-icon.md](popup-site-icon.md).
- No site: heading `Today's total`, the large figure is today's total, and `Don't record this site` is absent. No alert.
- Blacklist button `Don't record this site`, then `Record this site again`. Whitelist button `Record this site`, then `Stop recording this site`. The second click removes that exact host. A parent rule that already covers this host is [popup-parent-rule.md](popup-parent-rule.md).
- Pause button `Pause recording` / `Resume recording`. The status line uses `Recording browsing activity` or `Recording paused`, the same phrases as the dashboard header. While paused, `main` has `data-paused="true"`.
- Switch name `Toolbar badge`. It writes `settings.badge`.
- Button `Open dashboard`.

## How to get to it (user POV)

Install the extension, leave an http page active, and click the PageTime toolbar icon. The popup is the `popup.html` document on the extension origin.

## Driving it with Playwright

Extension only. Fresh profile. Language is English (`localStorage['pagetime-language'] = 'en'` on the extension origin before the popup opens). Serve one local http page, for example `http://127.0.0.1:<port>/`, and leave that tab active. Open the popup with `chrome.action.openPopup()` from the service worker. Do not navigate the active tab to `popup.html`.

Playwright's `context.pages()` does not include the toolbar popup: Chrome lists it in `/json/list` as a `page` whose URL ends in `popup.html`, and `Target.setAutoAttach` never hands that target to Playwright. Launch with `--remote-debugging-port` and drive the popup through that target's DevTools socket (`tests/e2e/popup-cdp.mjs`). `tests/e2e/popup.spec.mjs` is this journey.

1. `main[data-status="ready"]` is visible. The heading is `127.0.0.1`. The large figure `[data-figure="site"]` has an accessible name starting with `Today`. The total line matches `/^Today .+ total$/`. Buttons `Don't record this site`, `Pause recording`, and `Open dashboard` are visible. The switch name is `Toolbar badge` and it is checked. Status text is `Recording browsing activity`.
2. Click `Don't record this site`. The button becomes `Record this site again`. On the already-open Settings page, `Remove 127.0.0.1` appears without reloading. `chrome.storage.local` `settings.ignored` is `['127.0.0.1']` and `allowed` stays `[]`.
3. Click `Record this site again`. The button returns to `Don't record this site`, and `ignored` is `[]`.
4. On Settings, choose the `Whitelist` radio. Reopen the popup. The button is `Record this site`. Click it. The button becomes `Stop recording this site`, and `allowed` is `['127.0.0.1']`. Click it again. `allowed` is `[]`. Choose `Blacklist` again before leaving Settings.
5. Activate `about:blank` and reopen the popup. The heading is `Today's total`. `Don't record this site` is absent. There is no alert `Couldn't load or save data`.
6. Click `Pause recording`. The button is `Resume recording`, the status is `Recording paused`, and `main` has `data-paused="true"`. The dashboard header shows `Recording paused` without a reload. Click `Resume recording`. The status returns to `Recording browsing activity`.
7. Turn the `Toolbar badge` switch off. Settings shows the same switch unchecked without a reload. Turn it back on.
8. Click `Open dashboard` while the dashboard tab is already open. The tab count whose URL ends with `dashboard.html` stays one, and that tab becomes active without leaving the page it was already on. Close that tab, reopen the popup, and click `Open dashboard`. The new tab's heading is `Browsing overview`. Click `Open dashboard` again. The count stays one.
9. Set Appearance to `Light` and to `Dark` from Settings, reopening the popup each time. `main[data-theme]` is `light`, then `dark`.

## Gotchas

- `tabs.query({ active: true, currentWindow: true })` reads the browser window that owns the popup. Opening `popup.html` as the active tab hides the site row.
- The list button stores the normalized hostname, not the full URL and not the grouped site name. `www.example.com` is stored as `www.example.com`.
- Adding a host does not delete ledger rows. Do not click `Clear data` or `Delete this site's records`. Settings has no control that deletes one day.
- The popup sends only `snapshot`, `toggle`, and `settings`. It cannot clear or delete.
- When the site's time today is above zero, the site name is a button inside the heading. Its accessible name is `View <site> in the dashboard`. The heading text is still the site. That journey is [popup-site-detail.md](popup-site-detail.md). `Open dashboard` does not open the drawer.
- Today's numbers include the still-open cursor, capped the same way as the dashboard. Compare them after the active tab is `about:blank`, when no cursor is open.
- Do not seed `pagetime-preview` or IndexedDB. A real http navigation is what puts a hostname on screen.
