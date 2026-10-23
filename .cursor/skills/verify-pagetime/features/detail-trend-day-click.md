# 详情抽屉里的按日趋势点柱跳到那一天

Inside Site details, clicking a daily-trend bar that has a value sets the date range to that local day. The drawer stays open on the same site. A site filter that is already on stays on. Today uses the Today preset. Any other day is a one-day custom range, so the overview chart opens on that day's timeline. The drawer trend then shows the 7 local days ending on the selected day. An unrecorded empty column does not change the range. Previous period and Next period still move that one-day range. Each selectable day is also a button with the same result. Hour bars in the drawer do not change the range.

## Sub-features

- Bar: with the drawer open on today, click a recorded column that is not today. The trigger no longer starts with `Date range: Today`. The dialog `Site details` stays open and still shows the same domain. The selected overview tab is `Timeline`.
- Filter: with `Filtered to <domain>` showing, the same click leaves that status in place and leaves the dialog open.
- Empty column: a day with no recorded bar does not change the trigger, and the dialog stays open.
- Same day: clicking the column for the day already selected leaves the trigger on that day.
- Paging: after the jump, `Previous period` and `Next period` are the same controls as a one-day range. `Next period` is disabled when the selected day is today.
- Keyboard: focus a trend day button inside the dialog (its name is that date and duration) and press Enter or Space. The range becomes that day and the dialog stays open.

## How to get to it (user POV)

Overview, after at least one recorded site. Open `Details for <domain>`. The daily trend is the first chart in the dialog, under the heading `Daily trend`. This is not the time-of-day hour bars under it, and not the primary chart behind the dialog.

## Driving it with Playwright

Language is English. Viewport 1280×800 so the drawer is the right-hand sheet.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop. Do not insert a host.
2. Click `getByRole('button', { name: 'Details for <domain>' })`. Assert `getByRole('dialog')` contains heading `Site details` and heading `Daily trend`. The date trigger starts with `Date range: Today` when the overview was on today.
3. Click a recorded trend column inside the dialog that is not today (the same spot that shows that day's tooltip, cursor `pointer`). The dialog stays open and still shows that domain. Its active time and session heading follow that day. `button.range` has an accessible name for that day, not `Date range: Today`. The overview tab `#chart-tab-timeline` is selected. The status text `Filtered to <domain>` is still present when the filter was on before the click.
4. Click the empty part of the plot where a day has no bar. `button.range` stays the same and the dialog stays open.
5. Activate `Previous period`. The range label changes by one day. The dialog stays open on the same site. `Next period` is enabled unless the range already ends today. At 1280 the right-hand drawer covers that control, and the open dialog marks the page behind it inert, so a mouse click at the control's coordinates hits the sheet. Read `button.range` and activate the period button itself.
6. Focus a `button.timeline-segment` inside the dialog whose name is another recorded day, then press Enter. The range becomes that day. The dialog stays open on the same site. The focused label is drawn over that daily trend, inside the drawer scroll area, not on the sheet header.

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no `Details for` button. That is a failed precondition. Do not write `pagetime-preview` or IndexedDB to force this journey.
- An unrecorded day is a gap, not a zero-height bar. A recorded day with no active time is a one-pixel bar and does change the range.
- Hovering a recorded bar sets the chart canvas cursor to `pointer`. The empty gap does not.
- Do not click the hour bars under `Time of day`. On a single day those bars filter the session list and leave the date range unchanged. Do not click `Delete this site's records`, `Stop recording this site`, or `Add to whitelist`.
- The click replaces the range. It does not close the drawer and it does not clear `Filtered to <domain>`.
- While the dialog is open, ArrowLeft and ArrowRight do not shift the range. The period buttons still shift that one-day range. The open dialog marks the overview inert, and at 1280 the drawer covers `button.range`.
- Ranking has two columns, so `Filter to <domain>` and `Details for <domain>` each match two buttons. Either one opens the same site.
