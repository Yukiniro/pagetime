# 单日时间线文案跟着所选那一天

A single-day range shows that day's timeline. When the day is today, the tab, heading, accessible name, and empty line keep the existing `Today's timeline` copy. When the day is any other day, the tab and heading are `Timeline`, the graphic's accessible name does not start with `Today's`, and a day with no active spans shows `No active browsing recorded on` plus that day's date (the same date as the caption). A multi-day range's timeline tab stays today, including `Today's timeline`. A single day past detail retention still draws 24 hour bars; its heading is `Timeline` and it does not add the timeline empty line.

## Sub-features

- Today: tab and heading `Today's timeline`. With no spans, the empty line is `No active browsing recorded today yet`.
- Another single day with spans: tab and heading `Timeline`. No empty line. The caption date is that day.
- Another single day with no spans: the empty line names that day. The chart is not a silent blank track.
- Multi-day range, timeline tab: still `Today's timeline` and today's empty line when today has no spans.
- A day past detail retention: heading `Timeline`, hour bars, no `.timeline-empty`.

## How to get to it (user POV)

Open Overview. The chart sits under the KPI bar. Page with `Previous period`, or apply a custom single day.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists.
2. When status is `ready` and the trigger is `Date range: Today`: the selected tab is `Today's timeline`. If `.timeline-empty` is visible, its text is `No active browsing recorded today yet`.
3. Move to the previous day (`Previous period`, or Custom with that one day). The selected tab and the chart heading are `Timeline`. The caption date is not today. The graphic label does not start with `Today's`. If that day has no active spans, `.timeline-empty` reads `No active browsing recorded on` plus the caption date.
4. Choose `Last 7 days`, then open the timeline tab. The selected tab is `Today's timeline`.
5. Apply one day that is past detail retention when the ledger has hour totals for it. The heading is `Timeline`, the chart is the hour bars (`.primary-hours`), and `.timeline-empty` is absent.

## Gotchas

- An empty preview does not mount the chart. `Previous period` is disabled because `since` is today. Do not write `pagetime-preview` to force the chart. Report steps 2–5 as not run when `[data-status]` is `empty`. The copy rules are `tests/timeline-day-copy.test.mjs`.
- Do not click `Clear data` or the delete confirms.
