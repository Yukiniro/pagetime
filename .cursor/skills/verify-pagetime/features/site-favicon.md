# 站点图标

Rankings, the site drawer, and the visit list share `SiteIcon`. A hostname with a packaged SVG (`github.com`, `wxt.dev`, `developer.mozilla.org`, `youtube.com`, `notion.so`) shows that file. In the extension, any other hostname reads the browser favicon cache through `_favicon`. The preview does not. A load error, or a bitmap identical to the browser's generic icon, keeps the globe.

## Sub-features

- Packaged SVG wins over the cache. The preview and the extension both use `./assets/<host>.svg` for the hosts listed above.
- Extension cache: the image `src` is `chrome.runtime.getURL('/_favicon/')` plus `pageUrl=https://<displayed host>` and `size=32`. A ranking or detail row uses the merged host it shows. A visit row uses the raw hostname it shows, not the merged key.
- Miss: no `img`, or an `img` that never stays up, and the globe SVG remains. The row height does not jump.
- Preview: no element `src` contains `_favicon`, and the page does not request another origin for an icon.

## How to get to it (user POV)

Overview rankings, after at least one recorded site. The same component is in the site drawer and on Visit history. The preview's first run has no rows.

## Driving it with Playwright

Language is English. Viewport 1280×800.

1. On the preview, wait until `[data-status="empty"]` or `[data-status="ready"]`. Assert no `img` whose `src` contains `_favicon`. Assert no request during that load leaves the page origin for a favicon.
2. When the status is `empty`, stop. That is the preview result. Do not write `pagetime-preview`.
3. On the extension, after a real https visit in that profile, open `dashboard.html` and assert `[data-status="ready"]`. For a ranking row whose host is one of the packaged names, the `img` `src` ends with `/assets/<host>.svg`. For another visited host, the `img` `src` contains `/_favicon/` and `pageUrl=` and `size=32`, and the image's natural width is greater than 0. Screenshot the ranking section.
4. Open `Details for <domain>` and assert the drawer shows an icon for that same host. Close the drawer. Do not delete records.

## Gotchas

- An empty preview has no ranking row. Report the extension steps as not run. Do not seed the ledger to invent icons.
- `_favicon` only returns a site's own icon after Chromium has cached one for that host. A page loaded as `http://host:port` does not fill `https://host`. The image request stays on `chrome-extension://`; it is not a fetch of `/favicon.ico`.
- The globe is the fallback while the cache image is still being checked. A screenshot taken in that moment can show globes for hosts that later resolve. Wait until each ranking `img` has settled (`naturalWidth` > 0) or the row has stayed on the globe.
- Do not click `Clear data` or `Delete this site's records`.
