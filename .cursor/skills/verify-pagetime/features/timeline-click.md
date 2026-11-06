# 占比色块或文字打开站点详情

On site share, a named color segment and its text button open that site's detail. The click does not change the site filter. `Other` is not a site: it moves to the ledger below. A share under 0.1% stays that width; its text button remains the keyboard path.

## Sub-features

- Segment or label: activate a named site. A dialog titled `Site details` shows that site. Close is `Close details`.
- Other: the button says `View all sites`. It does not open a dialog and it does not create a site named Other.
- Filter: with `Filtered to <domain>` showing, activating that site opens details and leaves the status in place. The chart still shows `Other sites` and `Share of all sites`.
- Keyboard: the text button is in the tab order. The color segment is not. Enter on the text button opens the same dialog.

## How to get to it (user POV)

Overview, any range with active time, chart tab `Site share`. The bar is one horizontal row. The names sit under it.

## Driving it with Playwright

Language is English. Viewport 1280×800.

1. Assert `[data-status="ready"]`. If the status is `empty`, stop. Do not insert a host.
2. The selected tab is `Site share`. `.primary-timeline` is absent.
3. Activate one named site from `.share-list`. Assert `getByRole('dialog')` is titled `Site details` and contains that site's domain. Close with `Close details`. The filter chip is absent.
4. If `Other` is present, activate it. No dialog opens. `#site-ledger` is the focused region or contains the focused search field.
5. Click `Filter to <domain>`, then activate that site in the share list again. The dialog opens and the status `Filtered to <domain>` is still present. The share caption includes `Share of all sites`. Close the dialog. The status is still present.
6. Focus the share text button whose name contains the site, then press Enter. The dialog opens that site.

## Gotchas

- An empty preview has no segments. Report the ready steps as not run.
- Do not seed the production preview. Day totals already in the ledger are enough; the bar does not need session rows.
- Do not click `Clear data` or the delete confirms.
