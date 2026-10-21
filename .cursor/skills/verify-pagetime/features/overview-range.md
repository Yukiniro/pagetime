# 一页账本概览与日期范围

The overview is one page: a range control in the top bar, then either the empty ledger or the KPI bar, one primary chart, two ranking columns, and a collapsed hour heatmap. The default range is today. Last 7 days and last 30 days include today and split on local midnights. The choice is not stored.

## Sub-features

- Range menu: Today, Last 7 days, Last 30 days, Custom.
- Custom interval: Apply is enabled only when the end day is on or after the start day. An inverted interval leaves the previous range in place and shows why.
- Empty ledger: status `Your browsing will show up here`, with `How time is counted`. The KPI, chart, rankings, and heatmap are not mounted.
- Ready ledger: section labelled `<range> totals` (active time, visits, sites), one chart tab selected, the other tab still available, rankings in two columns, heatmap collapsed until opened. While the range is today the chart opens on `Today's timeline` and the other tab is `Last 7 days`. A multi-day range opens on that range's daily trend, and the timeline tab stays `Today's timeline`. A single day that is not today opens on `Timeline`; paging and that day's empty line are in [range-shift.md](range-shift.md) and [timeline-day-copy.md](timeline-day-copy.md).

## How to get to it (user POV)

Open the extension toolbar button, or the preview at `http://127.0.0.1:4173/`. The first screen is Overview. The range button sits on the right of the page title `Browsing overview`.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists. On `empty`, assert the status text `Your browsing will show up here` and that `[data-status="ready"]` is absent. Continue with the range steps. The KPI and chart steps apply only when the status is `ready`; on `empty` they are the Gotcha, not a selector to hunt for.
2. The trigger's accessible name is `Date range: Today`. Click `getByRole('button', { name: /^Date range/ })`.
3. Click `getByRole('menuitemradio', { name: 'Last 7 days' })`. The trigger name now matches `/^Date range: Last 7 days /` (the prefix plus a locale date span). Screenshot the trigger.
4. Open the menu again and click `Custom`. In `getByRole('form', { name: 'Custom' })`, fill `Start date` with today's local `YYYY-MM-DD` and `End date` with the previous local day. Assert the alert `The end date must be on or after the start date`, `Apply` is disabled, and the trigger still matches `/^Date range: Last 7 days /`.
5. Press Escape in the form (the panel's `onKeyDown` closes it). Reload. The trigger is `Date range: Today` again. `localStorage` keys are only the locale pin and, if a later journey wrote them, `pagetime-preview` / `pagetime-preview-settings`. There is no range key.
6. When status is `ready`: assert a region whose name ends with `totals`, `[data-compare="ms"]`, `[data-compare="visits"]`, `[data-compare="sites"]`, tab `Today's timeline` selected for a today range, and `getByRole('button', { name: 'Active hours' })` with `aria-expanded="false"`. Click that button and assert `#active-hours-panel` contains a legend starting `Light` and a graphic whose label starts `Active hours by weekday and hour`. Switch the range to `Last 7 days` and assert the selected tab is the trend tab, not `Today's timeline`.

## Gotchas

- An empty preview is the real first run. Do not write `pagetime-preview` to mount the KPI. Report the ready-ledger steps as not run because `[data-status]` is `empty`.
- A populated ranking needs the extension and a real http visit, the same shape as `tests/e2e/timing.spec.mjs` (`a.test` through the local server and `--host-resolver-rules`). The service-worker seed in `the overview compares each KPI` is not this journey.
- Match the trigger with a prefix. The date span uses `formatDate` (`month: '2-digit', day: '2-digit'`) and changes with the locale and the clock.
- Last 7 days includes today. Do not expect a 7-day window that ends yesterday.
- Compare text is neutral (`vs previous 7 days`, `No change`, or a reason such as `Recording started on`). There is no red/green and no better/worse wording. A previous period that starts before the first recorded day, or whose visit rows are past the 31-day detail retention, shows the reason instead of a percent. On an empty ledger those lines are not in the DOM.
