# Website homepage

Surface: preview at `/home.html`. The dashboard remains at `/` and starts empty.

## Doctor

Use the preview launch and Doctor from `../SKILL.md` first. On macOS the session helper's Doctor cannot inspect Linux `/proc`: use `ps -p <recorded-pid> -o pid=,ppid=,command=`, `lsof -nP -iTCP:<port> -sTCP:LISTEN`, and `lsof -a -p <listener-pid> -d cwd` to confirm this checkout's Vite owns the port. Open `/`, select English through Settings if needed, and check heading `Browsing overview`, `[data-status="empty"]`, and no load/save alert. Keep the server running for the homepage handoff.

## Journey

1. Open `/home.html`. Header and footer language menus use the website-only `pagetime-website-language` preference; the dashboard keeps `pagetime-language`. Check that changing the website language does not change the dashboard language. Select English with the first `.home-language` trigger. Check the heading `See where your time goes.`, localized document title, and four loaded images (brand, dashboard, ranking crop and timeline). Both text-bearing product images must use `dashboard-en`; either Chinese locale must use the Chinese dashboard asset.
2. Click `Features` and `Privacy` in `Main navigation`. Each scrolls to the corresponding section; `#features` and `#privacy` are real fragment targets.
3. Activate the main `Download extension` button. The `Install PageTime` dialog shows three installation steps, the Chrome and Edge extension-management addresses, and `Get the extension package on GitHub` linking to `https://github.com/Yukiniro/pagetime/releases/latest` in a new tab. Verify that destination from the link; do not install an extension into the user's browser.
4. Tab through the dialog, check that focus stays inside it, and press Escape. Focus returns to the download button. Repeat with the header download button and `Close installation guide`.
5. `View GitHub` points to the repository. The footer `Privacy policy` points to `PRIVACY.md` in English and `PRIVACY.zh-CN.md` in either Chinese locale. Check locale selection updates heading, document title, navigation, installation copy, image alternatives, date/duration labels, and both product images. Chinese locales use Chinese imagery, and other locales use English imagery. No text-bearing image stays Chinese under English.
6. Check 1440px, 1003px (selected source width), 375px and 320px widths. All ten languages must have no horizontal document overflow, and all installation steps and close controls must remain reachable in a narrow, short viewport. Inspect dark system appearance and visible keyboard focus. Save full-page screenshots and a focused hero comparison against the selected source.
7. Reload `/` and confirm the ledger still shows `[data-status="empty"]`. Marketing illustrations do not write any browsing records.

For a Cloudflare deployment, repeat the bilingual image, FAQ, installation and empty-root checks against `https://pagetime.yukiniro.workers.dev/home.html` and `/`, and verify the active Worker version through the account API. Record the actual viewport sizes, assertions, screenshots and browser console errors in the evidence directory. Validate the built preview as well as the dev page; `dist/client/home.html` must exist after `npm run build:preview`. Run `npm run build` and `npm run verify-build` to check the WXT package still excludes the website illustrations.
