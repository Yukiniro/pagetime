# 概览顶栏、阅读顺序与可中断过渡

The dashboard has no fixed side column. A light top bar holds the brand, Overview, Visits, and Settings, the page title, the local note, and the recording status. Those three entries stay on this page. The overview ledger reads in one order at 1440px, 375px, and 320px: date control, site filter when one is on, primary active time, secondary visit count, site count, and neutral comparisons, the primary chart, the site ledger, then the collapsed hour heatmap. The primary figure is the largest number and stays a ledger figure. The first paint shows the loaded figures. A later date or chart choice replaces the previous one without playing the skipped state. Reduced motion drops movement. Closing site detail returns focus to the control that opened it.

## How to get to it (user POV)

Open the preview or the extension dashboard. The top bar is the first row. The date control is the first control under it.

## Driving it with Playwright

Preview origin is the URL `launch` printed, or the extension `dashboard.html`. Language is already English. Do not write sample rows.

1. At 1440×900, 375×812, and 320×700, `document.documentElement.scrollWidth` equals `clientWidth`. `getByRole('navigation', { name: 'Main navigation' })` contains `Overview`, `Visits`, and `Settings`. The heading is `Browsing overview`. The date trigger matches `/^Date range/`. There is no `.sidebar`.
2. On an empty ledger, `[data-status="empty"]` is visible and the date trigger stays visible. Do not look for the KPI.
3. When the ledger is ready, the filter chip (only while a site filter is on), the region whose name ends with `totals`, `Primary chart`, the ranking region, and `Active hours` (`aria-expanded="false"`) follow that order. `.kpi-item.primary` holds the active time. Visit count, site count, and `[data-compare]` sit in `.kpi-secondary` or under the primary figure as the comparison line.
4. Choose `Last 7 days`, then `Last 30 days`, without waiting. The trigger matches `/^Date range: Last 30 days /`. The selected chart tab is `Site share`, not a transition through another chart.
5. With `emulateMedia({ reducedMotion: 'reduce' })`, repeat the range change. The figures update in place. The site detail sheet fades and does not move: its computed `translate` stays `none` while it opens and closes, on the right at a wide viewport and from the bottom below 760px. Open it from a ranking detail button when a row exists, then `Close details`, and the detail button is focused again. The chart underline sits on the selected tab; a quick second choice leaves it on that tab, including when the tab list wraps.
6. Switch Appearance to Dark and repeat the 1440 and 375 checks. The same controls stay visible.

## Gotchas

- An empty preview has no ranking row and no site filter. Report the ready-ledger and detail-focus steps as not run.
- The primary chart opens on site share for every range. The other tab is the daily trend. The share chart's own checks are [site-share.md](site-share.md). The ranking region is the one site ledger; its search and share behavior is [site-ledger.md](site-ledger.md).
- Popup links that open today's site detail are covered by [popup-site-detail.md](popup-site-detail.md). This journey must not change that path.
