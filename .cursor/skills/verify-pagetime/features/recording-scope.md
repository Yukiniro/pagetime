# 设置页记录范围（黑名单 / 白名单）

Settings chooses a blacklist or a whitelist. The two lists are stored separately. Switching mode does not clear the other list and does not delete or hide existing records. `example.com` matches that host and its subdomains; `mail.example.com` does not match `example.com`. An empty whitelist records nothing.

## Sub-features

- Radios under `Recording scope`: `Blacklist` (default) and `Whitelist`.
- The list under the selected mode: `Ignored sites` or `Allowed sites`, a host textbox, `Add`, and `Remove <domain>`.
- Empty whitelist warning: alert title `An empty whitelist records nothing`.
- Rejected input: `role="alert"` with `Enter a host such as example.com`. The limit copy is `You can ignore up to 500 hosts.` or `You can allow up to 500 hosts.` (`IGNORED_LIMIT` in `src/settings.mjs`).

## How to get to it (user POV)

Sidebar `Settings`. Scroll to the heading `Recording scope`. The radios are under that heading. The host field is under `Ignored sites` or `Allowed sites`.

## Driving it with Playwright

Use a fresh Playwright context on the preview, or a fresh extension profile. Language is English. This writes the settings record in that context only.

1. Click `getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true })`. Heading `Settings` is visible.
2. `getByRole('radiogroup', { name: 'Recording scope' })` has the `Blacklist` radio checked. The textbox is `Host to ignore`. The empty title `No ignored sites` is visible. Heading `Local data` is absent on the preview and present on the extension; do not fail the preview for that.
3. Fill `Host to ignore` with `bad host` and click `Add`. Assert the alert `Enter a host such as example.com`. The empty title is still there.
4. Fill `https://example.com/path` and click `Add`. The list shows `example.com` (protocol and path stripped). The remove button is `Remove example.com`.
5. On the preview, read `localStorage['pagetime-preview-settings']`. `recordMode` is `blacklist`, `ignored` is `['example.com']`, `allowed` is `[]`. On the extension, skip the localStorage read; the settings message is the store. Screenshot the list.
6. Select the `Whitelist` radio. Assert the alert `An empty whitelist records nothing`, the textbox name is `Host to allow`, and `example.com` is not in the allow list.
7. Select `Blacklist` again. `example.com` is back, with `Remove example.com`. Click that button. `No ignored sites` returns. On the preview, `ignored` in `pagetime-preview-settings` is `[]` and `allowed` is still `[]`.

## Gotchas

- Adding a host here does not delete ledger rows. Do not assert that an existing visit disappeared.
- Do not prove "timing stopped" from this page alone. That needs the extension, a focused http tab, and the idle/focus rules in `tests/e2e/timing.spec.mjs`.
- An empty whitelist is a destructive recording mode, not "record everything". The alert is the proof.
- `localhost` is the only dot-less name `normalizeHost` accepts. `example` fails the same alert as `bad host`.
- The cap is 500 hosts. Do not loop to the cap in a verification drive.
- Do not click `Clear data` or `Delete this day` while you are on this page.
