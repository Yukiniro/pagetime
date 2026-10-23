# 恢复前预览备份摘要

After a JSON file is picked under `Restore from backup`, the page parses it in the worker and checks every row before any confirm. A file that passes opens `Replace all local records?` with a read-only `Backup summary`. A file that fails shows only the error alert, never opens the confirm, and nothing is sent to the background. The confirm, the overwrite, and the preview refusal are the same as [restore.md](restore.md).

## Sub-features

- Region `Backup summary` (`section[aria-labelledby="backup-summary-title"]`) between the dialog description and the buttons. One `dt`/`dd` row per `[data-field]`:
  - `exportedAt` `Exported`: local date and `HH:mm` of the file's `exportedAt`, or `Unknown` when it is missing or not a date.
  - `format` `Format version`: the file's `schemaVersion`.
  - `span` `Recorded days`: first and last `days` dates, `<start> – <end>`, or `None` when the file has no day-total row.
  - `sites` `Sites`, `days` `Day totals`, `hours` `Hour totals`, `spans` `Active sessions`, `visits` `Visits`: row counts of `domains`, `days`, `hours`, `spans`, `visits`, grouped for the language (`1,234`).
  - `settings` `Settings`: `Included`, or `Not included, defaults apply` when the file has no settings object.
  - `version` `Extension version`: the file's `appVersion`. The row is absent when the file has none, or when it is not a short version string.
- Cancel closes the dialog and leaves the ledger and `chrome.storage.local` `settings` unchanged.
- No summary is shown for a failed file. The alert is outside the dialog.

## How to get to it (user POV)

Sidebar `Settings`, row `Export data`, `Restore from backup`, pick a `.json` file.

## Driving it with Playwright

Extension profile, English, `locale: 'en-US'`, `timezoneId: 'UTC'` so dates and spans are stable. `tests/e2e/restore-summary.spec.mjs` is this journey.

1. Open `Settings`. Read `chrome.storage.local.get('settings')` from the service worker.
2. Give the input a `pagetime-ledger` JSON with `schemaVersion: 2`. The alert says `This backup version isn't supported. Nothing was changed.` The heading `Replace all local records?` is absent.
3. Give the input a valid backup: `exportedAt` `2026-10-22T13:05:00.000Z`, `appVersion` `1.3.0`, settings, two domains, days `2026-10-03` and `2026-10-21`, one hour row, one span, two visits. The dialog opens with no alert. Fields read `10/22/2026 13:05`, `1`, `10/3/2026 – 10/21/2026`, `2`, `2`, `1`, `1`, `2`, `Included`, `1.3.0`. Screenshot after the dialog's opacity is `1`.
4. Click `Cancel`. The dialog closes. `settings` in storage equals step 1. `Overview` still shows `Your browsing will show up here`.

## Gotchas

- The dialog fades in. A screenshot taken before opacity reaches `1` shows the page through it; that is the animation, not a style bug.
- Do not confirm in this journey. The overwrite is `restore.md`.
- The summary counts raw `domains` rows, the same as the export summary. It does not merge `www.` hosts.
- Day dates in `span` come from `days` rows only, like the export summary.
