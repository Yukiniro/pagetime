# 站点占比账本

One ledger replaces the two ranking columns. It sits under the primary chart, which is still the timeline or the daily trend. The list defaults to active time, longest first. `Sort sites by` switches to `By visits`. Equal values keep a stable order. Each row shows the site, its active time, its share of the whole selected range, and the visit count. The light bar is that time share: 40 minutes of a 100-minute range is 40%, not a share of the longest row. Sorting by visits changes the order only. A non-zero share below 0.1% reads `<0.1%`. A site with visits and no active time reads `0%`. When the range has no active time the share reads `—`, and the text is not `NaN`.

The list starts with eight sites. `View all <count> sites` shows the rest, and `Show less` returns to eight. `Search sites` matches every site in the range, including a site past the first eight. Search, sort, expand, and collapse leave the date trigger, the totals, the share denominator, and `Filtered to <domain>` alone.

`Filter to <domain>` filters the page. The same button again, or `Clear filter`, restores it. `Details for <domain>` opens the drawer and does not change the filter. While a site is filtered, the ledger still lists the other sites and each site's share of the full range. If the search hides the selected site, `Clear filter` stays in the top bar. No match shows `No matching sites` in the list and `Clear search`. It does not replace the totals or the filter chip.

## How to get to it (user POV)

Overview, under `Primary chart`. The region is `Top sites`. The search box is `Search sites`. The sort group is `Sort sites by`.

## Driving it with Playwright

Preview origin is the URL `launch` printed, or the extension `dashboard.html`. Language is already English. Do not write sample rows.

1. On an empty ledger, `[data-status="empty"]` is visible. There is no `.rank-grid` and no `.rank-list`. Stop the ready steps and record them as not run.
2. When the ledger is ready, `[data-status="ready"]` shows one `.rank-list`. `By active time` is pressed. Each visible row has a site, a duration, a share, and a visit count. The bar width is that row's share of the range, so a 40-minute site in a 100-minute range is `40.0%` and the bar is 40% wide.
3. Press `By visits`. The order follows visit count. A row's share text and bar width stay the time share. Press `By active time` to return.
4. With more than eight sites, only eight rows show. Activate `View all <count> sites`, then `Show less`. The date trigger, the totals text, and any `Filtered to` chip stay the same.
5. Search for a site that is not in the first eight. That row appears. Clearing the search restores the eight. A query with no match shows `No matching sites` and `Clear search`, and the totals stay.
6. Activate `Filter to <domain>`. The status is `Filtered to <domain>`, the totals narrow to that site, and the list still contains the other sites with their full-range shares. Activate the same `Filter to <domain>` again. The chip is gone. Activate `Details for <domain>`. The dialog `Site details` opens and `Filtered to` does not appear. Close it.
7. Filter a site, then search for a different site so the selected row is hidden. `Clear filter` in the top bar is still there. Activate it. The chip is gone.
8. At 1440, 375, and 320, in light and dark, `document.documentElement.scrollWidth` equals `clientWidth`. The same controls remain buttons or the search box, so a keyboard can reach sort, search, a row, details, expand, and clear.

## Gotchas

- An empty preview has no ledger row. Report steps 2–8 as not run. Do not seed `pagetime-preview` or IndexedDB to make this journey pass. The same behavior is asserted in `tests/site-ledger.test.mjs` with an in-memory fixture.
- A screenshot of a non-empty ledger is a test fixture, not a real browsing record. Say so on the image.
- The primary chart is unchanged. This journey does not look for a site-share chart.
- `Filter to <domain>` stays the row's accessible name. The share is visible text and the metrics description, not a second filter button.
- Popup `#site` still opens today's detail without setting this filter. That path is [popup-site-detail.md](popup-site-detail.md).
