# 设置页底部文档链接

The interface does not explain timing rules, storage, or retention. Settings ends with one line of two links that open the repository docs in a new tab. The rules themselves are `docs/timing.md` and `docs/timing.zh-CN.md`.

## Sub-features

- Link `Timing rules and privacy notes` opens `docs/timing.md` (`docs/timing.zh-CN.md` for Chinese). Link `Privacy policy` opens `PRIVACY.md` (`PRIVACY.zh-CN.md` for Chinese). Both are `https://github.com/Yukiniro/pagetime/blob/main/...` with `target="_blank"`.
- Under `Browsing records`: the switch `Keep counting while audio plays` and the button `Idle threshold: 1 minute`.
- Absent on purpose: any `How time is counted` button or dialog, the `How it's measured`, `Local and private`, and `Local data` sections, and the info button next to Active time on the overview.
- Absent: `Delete one day's records`, the date field `Date to delete`, and the button `Delete this day`. `Clear all records` and `Clear data` stay.
- Absent: the heading `Group subdomains` and any control that chooses none, prefix, or registrable grouping.

## How to get to it (user POV)

Sidebar `Settings`, then scroll to the end of the page.

## Driving it with Playwright

Fresh preview context or fresh extension profile. English.

1. Open `Settings`. Assert the three absent headings above have count 0 and `How time is counted` has count 0 on both Settings and Overview. Assert `Delete one day's records`, `Date to delete`, `Delete this day`, and `Group subdomains` have count 0, and `Clear data` is still a button.
2. Assert the `Keep counting while audio plays` switch and the `Idle threshold` button sit inside the `Browsing records` row, and that the switch toggles.
3. Scroll to the last row. Assert both links, their `href` and `target="_blank"`. Do not click through to GitHub: the proof is the attribute, plus no request started by the page when the settings page opens.
4. Screenshot the bottom of Settings.

## Gotchas

- An empty preview is enough for this journey. Do not seed rows.
