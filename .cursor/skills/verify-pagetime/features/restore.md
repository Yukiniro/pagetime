# 从备份恢复

Settings can replace the ledger and settings from a PageTime JSON backup. The file is read in the page. One confirm dialog, the same level as clear data, then the background overwrites the five tables and writes settings. CSV is refused. The preview disables the control and does not write preview storage.

## Sub-features

- Button `Restore from backup` under the heading `Export data`, next to `Export JSON` and `Export CSV`.
- Hidden file input `accept="application/json,.json"`.
- Confirm dialog title `Replace all local records?` and description `This replaces every local record with this file. This can't be undone.` Confirm button `Replace records`. Cancel discards the file.
- While the write runs, status `Restoring…` and the export and restore buttons are disabled.
- Success status `Restored.`
- A file that is not `format: "pagetime-ledger"`, an unknown `schemaVersion`, or a table that does not match the export rows shows an alert and leaves the ledger as it was. CSV is one of those failures: `This file isn't a PageTime backup. Nothing was changed.`
- Preview only: the button is disabled and the row says `Restore from a backup only works in the extension.`

## How to get to it (user POV)

Sidebar `Settings`, then the row `Export data`. The extension can pick a file. The preview shows the disabled control.

## Driving it with Playwright

Extension profile, English. Do not use this journey on the preview except to check that the button is disabled.

1. Open `Settings`. Assert `Restore from backup` is enabled and the preview sentence is absent. The file input accept is `application/json,.json`.
2. Give the input a CSV body. The dialog `Replace all local records?` opens. Confirm. The alert says the file isn't a PageTime backup and nothing was changed. Overview still shows `Your browsing will show up here`.
3. Give the input a `pagetime-ledger` JSON file whose day is today and whose host is `restored.test`. Confirm. Status `Restored.` The ignore list shows `Remove skip.restore` when the file included that host.
4. Open `Overview`. `Details for restored.test` is visible. No request from those steps leaves the extension origin.

## Gotchas

- Preview restore must not write `pagetime-preview` or `pagetime-preview-settings`. The button stays disabled there.
- The confirm is once. There is no second typed confirmation.
- A failed file does not clear the ledger. Do not treat the alert as success.
- `Restoring…` can finish before it is observable on a small file. A missing status of `Restored.` is a failure.
- This journey may confirm `Replace records`. It still must not click `Clear data`.
