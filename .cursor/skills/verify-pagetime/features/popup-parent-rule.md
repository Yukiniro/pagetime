# popup 父规则覆盖

The popup list button uses the same parent and subdomain match as Settings and the site-detail drawer. When a parent entry covers the current host, the button names that rule and revokes it. The click writes the same list field. Only a normalized hostname is stored.

## Sub-features

- Blacklist: the list has `example.test` and the page is `mail.example.test`. The host is not timing. The button is `Covered by example.test. Revoke that rule`, not `Don't record this site`. `data-list-state` is `covered`.
- Revoke: the click removes `example.test` from `ignored`. The button returns to `Don't record this site`. The subdomain starts timing again.
- Whitelist: the button is `Allowed by example.test. Revoke that rule`, then `Record this site`. Revoking removes `example.test` from `allowed`, and the subdomain stops timing.
- Site detail: while the parent covers the host, the drawer button is `This site is already ignored` or `This site is already allowed`. After the popup revokes that parent, the drawer returns to `Stop recording this site` or `Add to whitelist`.
- Narrow popup: the covered label wraps, and `documentElement.scrollWidth` stays at most 320.

## How to get to it (user POV)

Install the extension. Open `http://mail.example.test:<port>/` and leave that tab active. Add `example.test` under Settings, Ignored sites. Click the toolbar icon.

## Driving it with Playwright

Extension only. Fresh profile. Language is English. `tests/e2e/popup-parent-rule.spec.mjs` is this journey. Map `mail.example.test` to the local server with `--host-resolver-rules`. Open the popup with `chrome.action.openPopup()` and drive it through `tests/e2e/popup-cdp.mjs`. Do not navigate the active tab to `popup.html`.

1. Focus `http://mail.example.test:<port>/` until today's active time for that host is above zero. The popup button is `Don't record this site`.
2. On Settings, add `example.test` to Ignored sites. Focus the site tab again. The credited time stops increasing. Reopen the popup. The button is `Covered by example.test. Revoke that rule`. The heading is `mail.example.test`. `scrollWidth` is at most 320. `ignored` is `['example.test']` and `allowed` is `[]`.
3. Open `Details for mail.example.test`. The button `This site is already ignored` is disabled. Close the drawer. Switching to the dashboard closes the popup, so open it again before the next click.
4. Click the popup's covered button. `ignored` is `[]`. The popup button is `Don't record this site`. The drawer button is `Stop recording this site`. Focus the site tab. Credited time increases.
5. Choose `Whitelist` and add `example.test`. The popup button is `Allowed by example.test. Revoke that rule`. The drawer button is `This site is already allowed`. Reopen the popup and click that button. `allowed` is `[]`. The popup button is `Record this site`. The drawer button is `Add to whitelist`. Credited time stops increasing.

## Gotchas

- The list button stores the parent hostname that covers this page, not the full URL and not the grouped site name. `www.example.com` is not this journey.
- Adding or revoking a host does not delete ledger rows. Do not click `Clear data` or `Delete this site's records`.
- The popup reads settings when it opens. Reopen it after a change made on the dashboard.
- Time accrues only on the focused site tab. A dashboard or popup in front is not that proof. Close the popup before reading credited time.
- An empty whitelist records nothing. After the whitelist revoke, a steady credited total is the stop, not a failure to focus.
