# 日期范围前后翻页与单日占比

The date control on Overview and Visits has `Previous period` and `Next period` on either side. A click, or ArrowLeft / ArrowRight, moves the closed range by its own number of days and shows the result as Custom. `Next period` is disabled when the range already ends today. `Previous period` is disabled when another full step would start before the local day of `since`. The choice is not stored.

Every range, including a single day, opens on `Site share`. The other tab stays `Last 7 days` for a single day, ending on the selected day. A multi-day range's other tab is that range's daily trend. Today itself is unchanged: the trigger reads `Date range: Today` and the chart opens on `Site share`. A day that only has stored day totals still shows that day's share. It does not fall back to hour bars.

## Sub-features

- Paging on Overview and Visits, absent on Settings.
- Disabled next while the range ends today; disabled previous at the `since` day.
- Arrow keys do nothing while focus is in a field, or while a drawer, dialog, or menu is open. Arrow keys in the custom date inputs do not turn the page.
- A custom single day shows one date on the trigger, not a `start–end` span.
- Narrow screens: at 320px and 375px wide the page has no horizontal scroll with `Last 30 days`, in every language. Below 480px the trigger shows the label and the date span on two lines and hides the calendar icon; the arrow buttons keep their size and labels.
- Site filter (#37) stays selected across a page. Every range still opens on `Site share`.
- Share colors stay with the site. The list names at most the first five sites, and `Other` is a button that moves to the ledger. A site filter shows that site and `Other sites` against the full range. The text lists the domain, duration, and percentage.

## How to get to it (user POV)

Open the preview or the extension dashboard. The first screen is Overview. The two arrow buttons flank the date button, to the right of `Browsing overview`.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists.
2. Assert `getByRole('button', { name: 'Previous period' })` and `getByRole('button', { name: 'Next period' })`. On a today range, `Next period` is disabled.
3. Open `getByRole('button', { name: /^Date range/ })`, then click `Custom`. Focus `Start date` inside `getByRole('form', { name: 'Custom' })` and press ArrowLeft. The trigger still matches `/^Date range: Today$/` (the date field may change its own value). Press Escape.
4. Open the date menu again and press ArrowLeft. The trigger still matches `/^Date range: Today/`. Press Escape.
5. Open Visits. The same two buttons are there, and `Next period` is still disabled. Focus the search box `Search sites` and press ArrowRight. The trigger stays on today.
6. Open Settings. `Previous period` and `Next period` are absent.
7. Return to Overview and reload. The trigger is `Date range: Today`. `localStorage` has no range key.
8. When status is `ready`: click `Previous period`. The trigger's accessible name no longer starts with `Date range: Today`, and the selected tab is `Site share`. The share caption names that day, not today. Click the trend tab and assert it is `Last 7 days`. Open the date menu, choose `Last 7 days`, and assert the selected tab is `Site share`. Page back once with ArrowLeft while focus is on `document.body` and assert the trigger changed and the ranking filter chip, if one was active, is still there.
9. Narrow check: set the viewport to `320×700`, then `375×700`. Choose `Last 30 days` and assert `document.documentElement.scrollWidth <= window.innerWidth` and that `Previous period`, the trigger and `Next period` all sit inside `0..innerWidth`. Repeat with `pagetime-language` set to `de` and `ru` (the longest labels). Screenshot the top of the page. The extension journey `the date control fits a 320px and a 375px page` in `tests/e2e/timing.spec.mjs` also clicks the arrows at those widths.
10. When the share list is on screen, each named site is a button with its duration and percentage, and `Other` is a button only when a site falls outside those five. Skip this step when `[data-status]` is `empty`. The share checks are [site-share.md](site-share.md).

## Gotchas

- A fresh preview sets `since` to the moment the empty ledger is created, which is today, so `Previous period` is disabled too. Do not write `pagetime-preview` to enable it. Report the ready-ledger step as not run when `[data-status]` is `empty`.
- An empty preview has no timeline legend, so the color step is not run. The rank colors themselves are `tests/timeline-colors.test.mjs`.
- The search box name is the `records.search` string: `Search sites`.
- A single custom day formats one date through `formatDate` (`month: 'long'`, `day: 'numeric'`, `weekday: 'short'`). Match the trigger with a prefix, not a hard-coded date.
- ArrowLeft inside `<input type="date">` changes the date field. Assert the applied range, not the field's value.
- Do not click `Clear data` or the delete confirms.
