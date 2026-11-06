# 一页账本概览与日期范围

The overview is one page under a light top bar for Overview, Visits, and Settings. The ledger starts with the date control. With no records it shows the empty state. With records the order is any site filter, the primary active time with secondary visit count, site count, and neutral comparisons, one primary chart, one site ledger, and a collapsed hour heatmap. The overview uses the selected Linear/Plausible direction: a quiet title, underlined chart tabs, one site ledger whose light bars are each site's share of the range, and a collapsed heatmap separated by a rule. At narrow widths the primary figure stays above the two secondary figures. The default range is today. Last 7 days and last 30 days include today and split on local midnights. The choice is not stored.

## Sub-features

- Range menu: Today, Last 7 days, Last 30 days, Custom.
- Custom interval: Apply is enabled only when the end day is on or after the start day, and neither day is before the local day recording began. Both date inputs use that day as `min` and today as `max`. An inverted interval leaves the previous range in place and shows why. A day before `since` is not applied. The bounds are checked in [custom-range-since.md](custom-range-since.md).
- Empty ledger: status `Your browsing will show up here` and its description. The KPI, chart, rankings, and heatmap are not mounted.
- Ready ledger: section labelled `<range> totals` (active time, visits, sites), one chart tab selected, the other tab still available, one site ledger, heatmap collapsed until opened. Every range opens on `Site share`. While the range is today or any other single day, the other tab is `Last 7 days`. A multi-day range's other tab is that range's daily trend. Paging stays in [range-shift.md](range-shift.md), and the share chart itself is in [site-share.md](site-share.md).

## How to get to it (user POV)

Open the extension toolbar button, or the preview at `http://127.0.0.1:4173/`. The first screen is Overview. The page title `Browsing overview` is in the top bar. The date control is the first control in the ledger.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists. On `empty`, assert the status text `Your browsing will show up here` and that `[data-status="ready"]` is absent. Continue with the range steps. The KPI and chart steps apply only when the status is `ready`; on `empty` they are the Gotcha, not a selector to hunt for.
2. The trigger's accessible name is `Date range: Today`. Click `getByRole('button', { name: /^Date range/ })`.
3. Click `getByRole('menuitemradio', { name: 'Last 7 days' })`. The trigger name now matches `/^Date range: Last 7 days /` (the prefix plus a locale date span). Screenshot the trigger.
4. Open the menu again and click `Custom`. In `getByRole('form', { name: 'Custom' })`, fill `Start date` with today's local `YYYY-MM-DD` and `End date` with the previous local day. Assert the alert `The end date must be on or after the start date`, `Apply` is disabled, and the trigger still matches `/^Date range: Last 7 days /`.
5. Press Escape in the form (the panel's `onKeyDown` closes it). Reload. The trigger is `Date range: Today` again. `localStorage` keys are only the locale pin and, if a later journey wrote them, `pagetime-preview` / `pagetime-preview-settings`. There is no range key.
6. When status is `ready`: assert a region whose name ends with `totals`, `[data-compare="ms"]`, `[data-compare="visits"]`, `[data-compare="sites"]`, tab `Site share` selected for a today range, and `getByRole('button', { name: 'Active hours' })` with `aria-expanded="false"`. Click that button and assert `#active-hours-panel` contains a legend starting `Light` and a graphic whose label starts `Active hours by weekday and hour`. Switch the range to `Last 7 days` and assert the selected tab is still `Site share`.

## Gotchas

- An empty preview is the real first run. Do not write `pagetime-preview` to mount the KPI. Report the ready-ledger steps as not run because `[data-status]` is `empty`.
- A populated ranking needs the extension and a real http visit, the same shape as `tests/e2e/timing.spec.mjs` (`a.test` through the local server and `--host-resolver-rules`). The service-worker seed in `the overview compares each KPI` is not this journey.
- Match the trigger with a prefix. The date span uses `formatDate` (`month: '2-digit', day: '2-digit'`) and changes with the locale and the clock.
- Last 7 days includes today. Do not expect a 7-day window that ends yesterday.
- Compare text is neutral (`vs previous 7 days`, `No change`, or a reason such as `Recording started on`). There is no red/green and no better/worse wording. A previous period that starts before the first recorded day, or whose visit rows are past the 31-day detail retention, shows the reason instead of a percent. On an empty ledger those lines are not in the DOM.
