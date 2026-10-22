# 点趋势柱跳到那一天

On a multi-day trend (Last 7 days, Last 30 days, or a custom range of more than one day), clicking a bar that has a value sets the date range to that local day. The chart then opens on that day's timeline. Today uses the Today preset. Any other day is a one-day custom range. A site filter that is already on stays on. An unrecorded empty column does not change the range. Previous period and Next period still move that one-day range. The same click works on the 7-day trend tab of a single day. Each selectable day is also a button with the same result; the chart itself stays out of the tab order. A filtered site that only has visits, and no active time, on a recorded day still shows that one-pixel bar. A site with no rows in the range stays on the empty filter state. Hour bars and the site-detail trend are not part of this journey.

## Sub-features

- Bar: on `Last 7 days`, click a column that has active time. The trigger no longer starts with `Date range: Last 7 days`. The selected tab is `Timeline`, or `Today's timeline` when the column is today.
- Filter: with `Filtered to <domain>` showing, the same click leaves that status in place.
- Empty column: a day with no recorded bar does not change the trigger.
- Paging: after the jump, `Previous period` and `Next period` are the same controls as a one-day range. `Next period` is disabled when the selected day is today.
- Single-day trend tab: open `Last 7 days` on a one-day range and click another recorded column. The range becomes that column's day.
- Keyboard: focus a trend day button (its name is that date and duration) and press Enter or Space. The range becomes that day, the same as clicking the bar.
- Visits only: filter to a site whose recorded days have visits and no active time. The trend stays, with a one-pixel bar, instead of the clear-filter empty state.

## How to get to it (user POV)

Overview, range is Last 7 days, Last 30 days, or a multi-day custom range. The trend bars sit in the primary chart. This is not the 24 hour-bar chart and not the trend inside Site details.

## Driving it with Playwright

Language is English. Viewport 1280×800.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop. Do not insert a host.
2. Open `getByRole('button', { name: /^Date range/ })` and choose `Last 7 days`. The selected tab is the trend tab, not `Today's timeline`.
3. Click a trend column that has a bar (the same spot that shows that day's tooltip). The trigger's accessible name changes. The selected tab is `Timeline` when that day is not today, or `Today's timeline` when it is. The caption date matches that day.
4. Click `Filter to <domain>`, return to `Last 7 days` if the filter click left a single day, then click a recorded column again. The status `Filtered to <domain>` is still present.
5. Click the empty part of the plot where a day has no bar. The trigger stays the same.
6. Click `Previous period`. The trigger changes and the filter status, if it was on, is still present. `Next period` is enabled unless the range already ends today.
7. On a single day, open the trend tab `Last 7 days` and click a different recorded column. The trigger changes to that day.

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no bars. That is a failed precondition. Do not write `pagetime-preview` or IndexedDB to force this journey.
- An unrecorded day is a gap, not a zero-height bar. A recorded day with no active time is a one-pixel bar and does change the range.
- Hovering a bar sets the chart canvas cursor to `pointer`. The empty gap does not.
- Do not click a bar inside the site detail dialog. Do not click the hour bars (`.primary-hours`).
- The click replaces the range. It does not add a second filter for the hour or the day.
