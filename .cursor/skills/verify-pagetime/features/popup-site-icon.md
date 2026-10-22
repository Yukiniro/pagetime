# popup 当前站点图标

When the toolbar popup has a current site, the site name sits beside the same `SiteIcon` the dashboard uses. The slot is 24px. A packaged SVG wins, then the browser favicon cache, then the globe. A page with no site shows today's total and no icon. The name ellipsizes inside the 320px popup. The list button, pause, and badge stay as they are, and the site-name button still opens today's detail.

## Sub-features

- Site: `.popup-host-icon` is in the heading. It is 24 by 24. The heading text is the grouped site. For a packaged host such as `wxt.dev` the image `src` ends with `/assets/wxt.dev.svg` and its natural width is greater than 0. The icon is not a request to another origin.
- Cache miss: a host with no packaged SVG and no cached favicon keeps the globe. The row does not grow a second line, and `documentElement.scrollWidth` stays at most 320.
- Long name: the name element's `scrollWidth` is greater than its `clientWidth`, the icon stays 24px, and the heading's right edge stays within 320.
- No site: `about:blank` heading is `Today's total`. `.popup-host-icon` is absent. There is no alert.
- Unchanged controls: `Don't record this site`, `Pause recording`, `Toolbar badge`, and, when today's time is above zero, `View <site> in the dashboard`.

## How to get to it (user POV)

Install the extension, leave an http page active, and click the PageTime toolbar icon. The icon is to the left of the site name under the status line.

## Driving it with Playwright

Extension only. Fresh profile. Language is English. `tests/e2e/popup-site-icon.spec.mjs` is this journey. Open the popup with `chrome.action.openPopup()` and drive it through `tests/e2e/popup-cdp.mjs`. Do not navigate the active tab to `popup.html`.

1. Assert the manifest permissions are unchanged and there is no content script. On `http://127.0.0.1:<port>/`, open the popup. Assert the icon slot, the 320px width, the list button, pause, and the badge switch.
2. Serve the local page over HTTPS and map `wxt.dev` to it with `--host-resolver-rules` plus `--ignore-certificate-errors`. Public hostnames are upgraded to HTTPS, so an `http://` navigation cannot reach the local server. The tab hostname is `wxt.dev` and the browser does not contact that site. Focus the window until today's time is above zero. The image is the packaged SVG. The site name is still the `View wxt.dev in the dashboard` button.
3. Open a long hostname on the same server. Assert the ellipsis and that the row stays inside 320px. The icon stays 24px. A miss shows the globe.
4. Activate `about:blank` and reopen the popup. The heading is `Today's total` and the icon slot is gone.

## Gotchas

- `_favicon` is a `chrome-extension://` cache URL. It is not a fetch of the site. The preview is not this journey.
- A fresh profile has no cached favicon for `127.0.0.1` or the long hostname, so those rows settle on the globe after the cache probe. Wait until the image has a natural width or the probe has requested `_favicon` and the globe remains.
- Do not click `Clear data` or `Delete this site's records`. Do not change the list, pause, or badge in this journey.
- The site-name button is covered by [popup-site-detail.md](popup-site-detail.md). This journey only checks that the button is still there.
