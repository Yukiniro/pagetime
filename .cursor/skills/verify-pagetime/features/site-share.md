# 站点占比

The primary chart is site share for every date range. One 100% horizontal bar shows the five sites with the most active time and one segment for the rest. Beside it, each part lists the domain, the duration, and the percentage of all active time in the selected range. The other tab is the daily trend. There is no clock axis, idle gap, pie, or hour-bar fallback.

## How to get to it (user POV)

Open the preview or the extension dashboard. Choose a date range. The selected tab of `Primary chart` is `Site share`.

## Driving it with Playwright

Preview origin is the URL `launch` printed, or the extension `dashboard.html`. Language is already English. Do not write sample rows into the production preview. A non-empty check needs a ledger that already has day totals.

1. On an empty ledger, `[data-status="empty"]` is visible. Do not look for a share bar.
2. When the ledger is ready, the selected tab is `Site share` for Today, `Last 7 days`, `Last 30 days`, and a custom range. The other tab stays available. Its name is `Last 7 days` while the range is a single day.
3. The share list names each shown site with a duration and a percentage. The bar is one row of segments whose widths match those percentages of the whole range, not of the longest site. A sixth site is not its own segment; `Other` includes it and says `View all sites`.
4. Activate a named site from the bar or from its text button. A dialog titled `Site details` shows that site. The filter chip does not appear. `Close details`.
5. Activate `Other`. The dialog does not open. Focus lands in the site ledger (`#site-ledger`). A site with visits and no active time is still in that ledger at `0%`.
6. Filter a site from the ledger. The primary figure counts only that site. The share chart still shows that site and `Other sites`, the caption includes `Share of all sites`, and the two percentages use the full range. Activating the site opens details and leaves the filter chip in place.
7. Open the trend tab and activate a day that has active time. The date trigger changes to that day and the selected tab returns to `Site share`. The filter chip and an open site dialog, if either was present, stay.
8. At 1440, 375, and 320 pixels wide, `document.documentElement.scrollWidth` equals `clientWidth`. The share text is readable without hovering. Repeat in Dark. With `emulateMedia({ reducedMotion: 'reduce' })`, the figures update in place.

## Gotchas

- An empty preview has no share bar. Report the ready-ledger steps as not run.
- Do not seed `pagetime-preview` to create a bar. The percentages come from the selected range's day totals.
- The ledger's own search, sort, and expand behavior stays in [site-ledger.md](site-ledger.md). This journey must not clear them by changing the chart.
