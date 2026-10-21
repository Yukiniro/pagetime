# 站点过滤时活跃时段跟着过滤

The Active hours block stays collapsed until it is opened, then uses the selected range. With a site filter on, the expanded heatmap averages only that merged site (`row.site` matches the ranking key). Clearing the filter draws every site again. A filtered site with no hour rows inside the heatmap window shows the chart's clear-filter empty state. Clicking a cell does not filter by hour or weekday.

## Sub-features

- Unfiltered: `Active hours` opens `#active-hours-panel`. The panel has a graphic whose label starts `Active hours by weekday and hour` and a legend starting `Light`. There is no `[data-status="filter-empty"]` in the panel.
- Filtered, with hour rows: the status chip reads `Filtered to <domain>`. The graphic stays, and its busiest hours belong to that site. The panel still has no `[data-status="filter-empty"]`.
- Filtered, no hour rows in the window: `#active-hours-panel` shows `[data-status="filter-empty"]`, the title `No active time to chart`, and a `Clear filter` button. The heatmap graphic is not in the panel.
- Clear filter: the status chip is gone. Opening Active hours shows the full-site graphic again.

## How to get to it (user POV)

Overview, after the ledger is ready. The heatmap toggle is under the two ranking columns. The filter is the ranking row button `Filter to <domain>`.

## Driving it with Playwright

This journey needs hour rows for more than one site, or a ranked site that has visits and no hour rows. Language is English. Viewport 1280×800.

1. If `[data-status="empty"]`, stop. The steps below need a ready ledger. Do not write `pagetime-preview` or IndexedDB.
2. Open `getByRole('button', { name: /^Date range/ })` and choose `Last 7 days`. Click `getByRole('button', { name: 'Active hours' })`. Assert `#active-hours-panel` contains a graphic whose label starts `Active hours by weekday and hour` and a legend starting `Light`.
3. Click `getByRole('button', { name: 'Filter to <domain>' })` for a site that has hour rows in the range. Assert the status `Filtered to <domain>` and that the panel graphic is still there, with no `[data-status="filter-empty"]` inside `#active-hours-panel`.
4. Click `Filter to <domain>` for a ranked site with no hour rows in the range, when one is visible. Assert `#active-hours-panel [data-status="filter-empty"]` contains `No active time to chart` and `Clear filter`, and the panel has no heatmap graphic.
5. Click the chip's `Clear filter` (the status bar, not the empty-state button). The status chip is gone. The panel graphic's label starts `Active hours by weekday and hour` again.

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no `Filter to` button. That is a failed precondition, not a cue to seed `pagetime-preview` or IndexedDB.
- One recorded site cannot show the difference between the filtered heatmap and the full-site heatmap. The empty state needs a ranking row whose hour rows do not fall in the heatmap window.
- The filter chip and the empty state both expose `Clear filter`. The empty-state button is the one inside `#active-hours-panel`.
- Do not click a heatmap cell. Hour and weekday filtering from a cell stays deferred.
