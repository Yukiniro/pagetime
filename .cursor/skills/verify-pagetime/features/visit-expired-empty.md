# 访问记录空状态区分「无匹配」与「明细已过期」

The Visits page keeps visit rows for the last 31 days. Older days still have day totals on Overview. When the visit list is empty, its empty line depends on the selected range:

- A range that ends before the detail cut-off (31 local days counting today) says `Visit details are kept for the last 31 days only. Day totals are still on the overview.`, with or without a search.
- A range that starts before the cut-off and reaches into retention says the same when an older day in the range still has totals and no search or site filter is on.
- Every other empty list keeps `No matching visits`: today or any range inside retention, and a search on a range that reaches back past the cut-off.

The count line, the retention days, and the stored rows do not change. Overview filters and heatmap cells play no part.

## Sub-features

- Before retention: custom range entirely older than 31 days, list empty, expired line. A search leaves it unchanged.
- Straddling: custom range from 35 days ago to 29 days ago with day totals on the old days and no visit rows. Expired line. Add a search and it reads `No matching visits`.
- Inside retention: a custom range inside the last 31 days, or `Today` plus a search that matches nothing. `No matching visits`.
- Rows present: a range that has visit rows shows the table and no empty line.

## How to get to it (user POV)

Open `Visits`, then the date menu, `Custom`, enter `Start date` and `End date`, `Apply`. The start cannot be before the day recording began, so the ledger needs old day totals.

## Driving it with Playwright

Extension only; the preview cannot hold 31-day-old totals without seeding. `tests/e2e/visit-expired.spec.mjs` writes `days` and `visits` rows into `pagetime-ledger` the way the background leaves them after cleanup (day totals 40, 35 and 5 days ago, one visit row 5 days ago, `since` 45 days ago), then drives the steps above. Set `PAGETIME_SHOTS` to a directory outside the repo to keep screenshots. The empty line is `.records [data-slot="empty"]` with `data-empty` `expired` or `none`.

## Gotchas

- The count line above the table counts day-row visits, so an expired range can read `4 visits` with an empty table.
- Do not seed `pagetime-preview` to try this in the preview.
