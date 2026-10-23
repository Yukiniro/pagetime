# 单日详情点时段柱过滤活跃时段

On a single local day whose session list is visible, each bar under `Time of day` filters that list to pieces overlapping the hour. The piece stays whole: overlap uses the clipped `from` / `to`, so a piece that only crosses into the hour stays in the list. A chip above the list shows that hour and `Clear filter`. Clicking the same bar again, or `Clear filter`, restores the full day. An hour with no overlapping piece shows `No active sessions` and keeps the chip. A multi-day range and a single day past detail retention do not show the session list, and their hour bars are not clickable. The click does not change the date range, the site filter, the daily trend, or the subdomain breakdown. Overview heatmap cells still do not filter by hour.

## Sub-features

- Filter: with the drawer open on one local day, click an hour bar that a session overlaps. The dialog stays open. The session list shows only pieces that overlap that hour, including a piece whose start is in the previous hour. A status above the list shows the hour range, such as `14:00–15:00`, and a `Clear filter` button.
- Toggle: click that same hour bar again. The chip is gone and the list is the full day.
- Clear: filter an hour, then click the chip's `Clear filter`. The chip is gone and the list is the full day.
- Empty hour: click an hour no piece overlaps. The heading stays. The chip stays. The list is replaced by `No active sessions`.
- Multi-day: `Last 7 days` leaves out `Today's active sessions` and `No active sessions`. The hour bars do not filter anything and do not change the range.
- Past retention: a single day past detail retention also leaves the session heading and the chip out. The hour bars are not clickable.

## How to get to it (user POV)

Overview, after at least one recorded site, on a single day that still has session rows. Open `Details for <domain>`. `Time of day` is the second chart in the dialog, under `Daily trend` and above the session heading. This is not the overview heatmap and not the daily-trend bars.

## Driving it with Playwright

Language is English. Viewport 1280×800 so the drawer is the right-hand sheet.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop. Do not insert a host.
2. Click `getByRole('button', { name: 'Details for <domain>' })`. Assert `getByRole('dialog')` contains heading `Site details`, heading `Time of day`, and heading `Today's active sessions` when the range is today. The dialog has no `Clear filter` yet.
3. Click an hour bar whose session overlaps that hour (the same spot that shows that hour's tooltip, cursor `pointer`). The dialog stays open. The session list's times are only pieces that overlap the hour. A status shows that hour's `from–to` label and `Clear filter`. `button.range` is unchanged.
4. Click the same hour bar again. The status is gone and the session list is the full day.
5. Click the hour again, then click the status's `Clear filter`. The status is gone and the list is the full day.
6. Click an hour no session overlaps. The status stays. The dialog text includes `No active sessions` and does not include that day's other session times.
7. Open `getByRole('button', { name: /^Date range/ })` and choose `Last 7 days`, with the dialog still open if it is. The dialog does not include `Today's active sessions` or `No active sessions`. Clicking an hour bar does not add `Clear filter` and does not change `button.range`.

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no `Details for` button. That is a failed precondition. Do not write `pagetime-preview` or IndexedDB.
- The hour bars are clickable only while the session list is on screen. Multi-day ranges and a day past detail retention keep the bars as a plain chart.
- A piece that starts before the hour and ends inside it belongs to that hour. A piece that ends exactly when the hour starts does not.
- The chip reuses the hour label (`detail.hours.slot`, such as `14:00–15:00`) and the existing `Clear filter` button. The empty line is `No active sessions`, not the whole-day empty line.
- Do not click a daily-trend bar in this journey: that changes the range. Do not click an overview heatmap cell. Do not click `Delete this site's records`, `Stop recording this site`, or `Add to whitelist`.
- Changing the day, switching the open site, or closing the drawer drops the hour filter. The page-level `Filtered to <domain>` chip is a different control and stays.
