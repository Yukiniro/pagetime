# popup 站点名打开今天的详情

When the current site has active time today, its name in the toolbar popup is a button. Activating it opens or focuses the dashboard on today and opens that site's detail drawer. The site name matches the popup, using the same grouping. Closing the drawer leaves today's overview with no site filter. Refreshing the dashboard does not open the drawer again.

## Sub-features

- Button: inside the site heading, keyboard-focusable, accessible name `View <site> in the dashboard`. A small caret sits beside the visible site name. The heading text is still the site.
- No button: a page without an http(s) hostname shows `Today's total`. A site with no active time today keeps the name as heading text. Neither shows an alert.
- Dashboard: one tab whose URL contains `dashboard.html`. The range trigger reads `Date range: Today`. The dialog is `Site details` and contains the same site. The hash is empty after the drawer opens. The page did not reload.
- Already elsewhere: if the dashboard was on Settings with the clear-data dialog open, it returns to `Browsing overview` and that dialog is gone. `Open dashboard` still only focuses the tab and does not open the drawer.
- Close: `Close details` removes the dialog. Focus lands on the page heading when the drawer was not opened from a ranking button. No status reads `Filtered to`.

## How to get to it (user POV)

Install the extension, leave an http page active long enough for today's time to be above zero, and click the PageTime toolbar icon. The site name under the status line is the control.

## Driving it with Playwright

Extension only. Fresh profile. Language is English. Serve one local http page and leave that tab active. Open the popup with `chrome.action.openPopup()` from the service worker. Do not navigate the active tab to `popup.html`. Drive the popup through `tests/e2e/popup-cdp.mjs`, the same way as [toolbar-popup.md](toolbar-popup.md). Accruing time needs the window focused (`xdotool`); start `openbox` when the display has no `_NET_ACTIVE_WINDOW`. `tests/e2e/popup-site-detail.spec.mjs` is this journey.

1. Assert the manifest has no content scripts and the existing permissions. `main[data-status="ready"]` shows the site. The button name is `View <site> in the dashboard`, and focusing it moves `document.activeElement` to that button.
2. With the dashboard already open on Settings and the clear-data dialog visible, click the site button. The dashboard tab count stays one. `window` state set before the click is still there. The heading is `Browsing overview`, the range is `Date range: Today`, and the dialog `Site details` contains the site. The hash is empty. There is no `Filtered to` status and no `Clear all browsing records?` heading.
3. Click `Close details`. The dialog is gone, focus is on the `H1`, and there is still no filter. Reload. The dialog stays gone and the hash stays empty.
4. Click `Open dashboard`. The tab count stays one and the detail dialog stays closed.
5. Activate `about:blank` and reopen the popup. The heading is `Today's total` and no button name starts with `View `.
6. Pause recording, open a host that has no time today, and reopen the popup. The heading is that host and it is not a `View ` button.
7. Set Appearance to `Dark` and reopen the popup on the recorded host. `main[data-theme]` is `dark` and the site button is still there.

## Gotchas

- The button exists only when `siteMs` is above zero. A cursor or a stored day row has to be in place before the popup opens; the popup does not poll the clock on its own.
- The hash is `dashboard.html#site=<grouped site>` and is removed as soon as the dashboard reads it. Do not assert the hash while the drawer is opening; assert that it is empty once the dialog is visible, then again after reload.
- Do not click `Clear` in the clear-data dialog. Opening that dialog is only to prove the jump leaves it.
- Do not seed `pagetime-preview` or IndexedDB. A real http navigation is what puts a hostname on screen.
- The popup stores no URL. The button passes the grouped site name only.
