# 自定义日期不能早于记录开始日

Custom start and end date inputs use the local day of the first recorded day (`since`) as `min`, and today as `max`. Applying a start or end before that day does not change the range and does not clamp the days. An end day before the start day still shows `The end date must be on or after the start date`, disables Apply, and leaves the previous range in place.

## Sub-features

- Both date inputs in the Custom form expose `min` and `max`.
- On an empty ledger, `since` is today, so `min` and `max` are today's local `YYYY-MM-DD`.
- A value before `min`, even when written past the picker, does not apply. The trigger stays on the previous range.
- End before start still uses the existing alert.

## How to get to it (user POV)

Open Overview. The range button is on the right of `Browsing overview`. Choose Custom in that menu.

## Driving it with Playwright

Preview origin is the URL `launch` printed (default `http://127.0.0.1:4173/`), or the extension `dashboard.html`. Language is already English.

1. Wait until `[data-status="empty"]` or `[data-status="ready"]` exists. Record the trigger name (`Date range: Today` on a fresh overview).
2. Open `getByRole('button', { name: /^Date range/ })`, then `Custom`. In `getByRole('form', { name: 'Custom' })`, read `min` and `max` on `Start date` and `End date`. Both `max` values are today's local `YYYY-MM-DD`. Both `min` values are the same `YYYY-MM-DD`, and that day is not after `max`.
3. When status is `empty`, both `min` values equal `max` (today). Set `Start date` and `End date` to that `min`. Apply is enabled. Do not click it yet.
4. Set `End date` to the previous local day and `Start date` to today. Assert the alert `The end date must be on or after the start date`, Apply is disabled, and the trigger name is unchanged. Press Escape.
5. Open Custom again. Set both input values to the local day before `min` by assigning the value (the picker may refuse that day). Apply is disabled. Submit the form anyway. The trigger name is unchanged, and the form is still open. Press Escape.
6. Reload. The trigger is `Date range: Today`. `localStorage` has no range key.

## Gotchas

- An empty preview's `since` is the moment the ledger is created, which is today. Do not write `pagetime-preview` to move `since` earlier. The rejection of a day before `since` is `tests/custom-range-since.test.mjs`; this journey checks the same gate against today.
- Last 7 days and Last 30 days can still start before `since`. This journey does not change those presets.
- Do not click `Clear data` or the delete confirms.
