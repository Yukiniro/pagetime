# 站点详情抽屉与点选过滤

A ranking row filters the overview to that site. The caret opens a drawer with that site's time, visits, and active sessions for the chart day. Closing the drawer clears the open site and leaves the filter.

## Sub-features

- Filter: the row button `Filter to <domain>` toggles `filterSite`. A status chip reads `Filtered to <domain>` and offers `Clear filter`. The expanded Active hours heatmap follows this filter; that journey is [heatmap-site-filter.md](heatmap-site-filter.md).
- Drawer: `Details for <domain>` opens a dialog `Site details`. The description includes the current range chip. Close is `Close details`. Session rows follow the chart day. Today, and any multi-day range, uses the heading `Today's active sessions`. A single earlier day that still has session rows uses a heading that contains that date. A single day past detail retention leaves the session heading and the list out.
- Daily trend: one local day shows the 7 local days ending on that day, the same window as the overview trend tab. A multi-day range shows that whole span. Time of day and the session list stay on the selected range. A day before recording started stays `Not recorded` when it has no time. The trend bars do not change the date range.
- From the drawer, `View visits` goes to Visit history with the search filled by that site. This journey stops before `Delete this site's records` and before `Stop recording this site` / `Add to whitelist`.

## How to get to it (user POV)

Overview, after at least one recorded site. The two ranking columns are under the chart. The row body filters. The icon button at the end of the row opens details. The drawer is on the right when the viewport is wider than 760px, and a bottom sheet at or below that (`NARROW_DRAWER` in `src/SiteDetailPanel.jsx`).

## Driving it with Playwright

This journey needs a rank row. On the extension, load the built dashboard only after a real visit has been recorded in that same profile (see Gotchas). Language is English. Viewport 1280×800 so the drawer is the right-hand sheet.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop and fail with the Gotcha. Do not insert a host.
2. Click `getByRole('button', { name: 'Filter to <domain>' })` for a domain that is visible (the e2e visit host is `a.test`). Assert `getByRole('button', { name: 'Filter to <domain>', pressed: true })` and a status whose text is `Filtered to <domain>`.
3. Open `getByRole('button', { name: /^Date range/ })` and choose `Last 7 days`. The chip still says `Filtered to <domain>` (the filter key is kept and recomputed for the new range).
4. Click `getByRole('button', { name: 'Details for <domain>' })`. Assert `getByRole('dialog')` contains heading `Site details`, the domain text, and `Today's active sessions` (Last 7 days still shows today's sessions). Screenshot the open drawer.
5. Click `getByRole('button', { name: 'Close details' })`. The dialog is gone. The status `Filtered to <domain>` is still there.
6. Click `Clear filter`. The status chip is gone and the filter button is not pressed.
7. Open the drawer again and click `View visits`. The heading is `Visit history`, and the searchbox `Search sites` has the domain.

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no `Filter to` button. That is a failed precondition, not a cue to seed `pagetime-preview` or IndexedDB. Paging to an earlier day, and the dated session heading, need rows that are already in the ledger. Do not insert them for this journey.
- Producing the row means browsing an http(s) page in the extension profile until the dashboard shows it. `tests/e2e/timing.spec.mjs` maps `a.test` to `127.0.0.1` and waits until the service worker cursor domain is `a.test`. Copy that launch, including headed Chromium. Accruing the visit needs the window focused (`xdotool`); the e2e starts `openbox` when the display has no `_NET_ACTIVE_WINDOW`.
- Do not click `Delete this site's records` or the alertdialog button `Delete records`. The e2e test `deleting a site from the dashboard removes it from the ranking and the detail list` owns that path.
- At or below 760px the dialog is a bottom sheet. A screenshot from the 1280-wide viewport does not prove the narrow layout.
- The filter button's accessible name is the `aria-label` (`Filter to <domain>`), not the visible duration text.
