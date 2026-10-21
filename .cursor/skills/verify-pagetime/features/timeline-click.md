# 时间线色块打开站点详情

On a single-day segment timeline, a color block opens the same site detail sheet as its legend button. The domain is that block's `site || domain`. A gray block outside the top-five legend opens the real site. The legend label `Other` stays plain text. A click does not change the site filter. The hour bars used for a day past detail retention are not part of this journey.

## Sub-features

- Block: click a colored segment on `Today's timeline`. A dialog titled `Site details` shows that site. Close is `Close details`.
- Gray block: a segment drawn with the neutral gray still opens its own domain, not the word `Other`.
- Legend: the top sites are buttons. `Other` is not a button.
- Filter: with `Filtered to <domain>` showing, a block click opens details and leaves that status in place.
- Blank track: the empty part of the timeline does not open a dialog.
- Reading: the existing screen-reader list of segments is still in the page.

## How to get to it (user POV)

Overview, range is a single local day that still has session rows (today, or a recent day), chart tab `Today's timeline`. The blocks sit on the timeline above the legend. This is not the 24 hour-bar chart.

## Driving it with Playwright

Language is English. Viewport 1280×800.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop. Do not insert a host.
2. Assert the selected tab is `Today's timeline` and a graphic whose label starts `Today's active browsing timeline` is visible. If the chart is the hour bars instead, this day is past detail retention; stop.
3. Click one color block (the same spot that shows that site's tooltip). Assert `getByRole('dialog')` is titled `Site details` and contains that site's domain.
4. Close with `Close details`. Click a gray block whose site is not a legend button. The dialog contains that site's real domain. `getByRole('button', { name: 'Other', exact: true })` has count 0, and `.legend-other` is present.
5. Click `Filter to <domain>`, then click that site's block again. The dialog opens and the status `Filtered to <domain>` is still present. Close the dialog. The status is still present.
6. Click the empty track between blocks. No dialog opens.
7. The screen-reader list still mentions the site (`ul.sr-only`).

## Gotchas

- A fresh preview stays on `[data-status="empty"]` and has no blocks. That is a failed precondition. Do not write `pagetime-preview` or IndexedDB to force this journey.
- A visit of a few seconds is a one-pixel block (`Math.max(1, width)`). It uses the same dataIndex as the tooltip. A screenshot of a wide block needs a span that already lasts minutes.
- `Other` is the legend label. The block's target is the grouped site key (`site || domain`), such as `gray.example` for a stored host `www.gray.example`.
- Do not click `Delete this site's records`. Do not treat the block as the ranking filter (`Filter to`).
- Hovering a block sets the chart canvas cursor to `pointer`. The empty track does not.
