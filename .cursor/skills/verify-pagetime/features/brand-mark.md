# PageTime brand mark

The brand is the selected blue page-and-clock image. Site favicons remain the sites' own icons.

1. Run `npm run icons` with Playwright Chromium installed, then build the preview and extension.
2. Doctor the preview or extension as in `../SKILL.md`. In the dashboard, `.brand img` must have `naturalWidth === 48`, a 22px square box, empty alt text, and no failed-image indicator. The adjacent PageTime wordmark remains accessible text.
3. Confirm the sidebar mark is legible on light and dark backgrounds and does not change navigation sizing at 320px.
4. Dashboard, preview and popup documents use `/favicon.png`. It is byte-identical to `public/icon/32.png`; no obsolete favicon.svg remains.
5. The built manifest lists 16/32/48/96/128px PNG icons. Verify dimensions using `npm run verify-build` and inspect 16px and 32px at actual size on light/dark surfaces; both page silhouette and clock cutout should be visible.
6. Open the popup and confirm its site icon is still SiteIcon for the current hostname. Do not replace it with the PageTime brand or add another brand header.

Record screenshots and any failed image/console errors. Do not insert browsing rows to verify branding.
