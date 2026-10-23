# popup 今日前几名

Below today's total, the toolbar popup lists today's top active sites: up to five rows, each with the site icon, the grouped site name, and its active time. The order and the grouping are the dashboard's today ranking. A row opens or focuses the dashboard on today and opens that site's detail drawer, the same path as the current-site button in [popup-site-detail.md](popup-site-detail.md). With no active time today the list is not rendered at all: no heading, no placeholder.

## Sub-features

- List: a `section` labelled `Top sites today` holding an ordered list. Rows are buttons named `Open <site> (<duration>) in the dashboard`, not `View <site> …`, which stays the current-site button. At most five rows. A site with zero active time is left out.
- Order: the same sites in the same order as the first time-ranking card on the dashboard overview while the range is today. `www.`, `m.`, and `mobile.` hosts are merged into one row.
- Empty: a fresh profile, or only past days recorded, shows the status, `Today's total`, and no list element, heading, or empty text.
- Click: the dashboard tab count stays one; a dashboard on Settings returns to `Browsing overview`; the `Site details` dialog contains that site; the hash is empty afterwards. With no dashboard open, a new tab opens on the same drawer.
- Height: five rows add about 150px. The popup stays at 320px wide with no horizontal scroll.

## How to get to it (user POV)

Install the extension, browse two or more http sites long enough for today's time to be above zero, and click the PageTime toolbar icon. The list sits under the large figure.

## Driving it with Playwright

Extension only. Fresh profile. Language is English. Drive the popup through `tests/e2e/popup-cdp.mjs`, as in [toolbar-popup.md](toolbar-popup.md). `tests/e2e/popup-top-sites.spec.mjs` is this journey; it needs the window focused (`xdotool`, `openbox`) to accrue time.

1. With `about:blank` active, open the popup. `main[data-status="ready"]`, total `0`, no `.popup-top`, no text `Top sites today`.
2. Visit `127.0.0.1`, `b.test`, `c.test` (mapped with `--host-resolver-rules`), each until its credited time passes a different floor.
3. On the dashboard overview read the `Filter to <site>` buttons of the first `.rank-list`. Open the popup. The `.popup-top-name` texts equal that order, at most five, and each button name is `Open <site> (<duration>) in the dashboard`.
4. Leave the dashboard on Settings and click the second row. Same tab, `Site details` shows that site, `location.hash` is empty, `window` state set before the click survives.
5. Close the dashboard tab, reopen the popup, click the first row. One new dashboard tab opens on that site's drawer.

## Gotchas

- The list needs real time. Do not seed IndexedDB or `pagetime-preview`; the preview popup has no ledger and never shows the list.
- Durations in a short run read `Under 1 min`; assert order against the dashboard, not the text.
- Do not click `Clear`. This journey deletes nothing.
- The row passes the grouped site name only. No URL is stored or passed.
