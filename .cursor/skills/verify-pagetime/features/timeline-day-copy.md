# 每个范围都先看站点占比

Every date range opens on `Site share`, including today, another single day, a custom range, and the last 7 or 30 days. The tab and heading are `Site share`. A day that only has stored day totals still shows that share. The chart does not fall back to hour bars or to today's sessions. The other tab is the daily trend.

## Sub-features

- Today: selected tab `Site share`. The other tab is `Last 7 days`.
- Another single day: selected tab `Site share`. The caption names that day. The other tab is `Last 7 days`.
- Last 7 days and Last 30 days: selected tab `Site share`, using the whole range.
- A day past detail retention: selected tab `Site share` from that day's stored totals. There is no `.primary-hours` chart and no `.timeline-empty` line.

## How to get to it (user POV)

Open Overview. The chart sits under the KPI bar. Page with `Previous period`, or apply a custom single day.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists.
2. When status is `ready` and the trigger is `Date range: Today`: the selected tab is `Site share`.
3. Move to the previous day (`Previous period`, or Custom with that one day). The selected tab is `Site share`. The caption names that day, not today.
4. Choose `Last 7 days`. The selected tab is `Site share`. Open the trend tab and assert it is `Last 7 days`, then return to `Site share`.
5. Apply one day that is past detail retention when the ledger has day totals for it. The selected tab is `Site share`. `.primary-hours` and `.timeline-empty` are absent.

## Gotchas

- An empty preview does not mount the chart. `Previous period` is disabled because `since` is today. Do not write `pagetime-preview` to force the chart. Report steps 2–5 as not run when `[data-status]` is `empty`. The share rules are `tests/site-share.test.mjs`.
- Do not click `Clear data` or the delete confirms.
