# Overview design QA — 2026-10-24

final result: passed

## Target and evidence

- Selected target: latest ideation set, third displayed image (Linear frame / Plausible canvas).
- Source: `/Users/zhanghao/.codex/generated_images/01a16bd1-0418-71d2-878d-0c719e45a8d6/exec-5119ef9d-b876-48ed-b4da-86a69e97c994.png` (1487 × 1058).
- Evidence directory: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16bd1-0418-71d2-878d-0c719e45a8d6/implementation/`.
- Full comparison: `comparison.png`; source left, implementation right.
- Focused typography comparison: `type-comparison.png`.
- Rendered extension: `desktop-zh.png`, `desktop-en.png`, `mobile-zh.png`, `dark-zh.png`.
- CSS viewport: 1440 × 1024, deviceScaleFactor 1. Full-page desktop capture is 1425 × 1053; the scrollbar accounts for the width difference and natural content scrolling accounts for the height. Source normalized proportionally to 1425px width (1014px height), without stretching the capture.
- State: light theme, overview, last 7 days, five sites, heatmap collapsed. Separate narrow and dark captures.
- Reproduction driver: `verify-overview.cjs` in the evidence directory; run from the repository after `npm run build`. It uses Playwright's installed Chromium, a disposable extension profile and a local HTTP server. It bypasses the system proxy for local test hosts only. It does not seed preview or IndexedDB rows; each site comes from a real four-second local test visit. The profile is removed afterward.

## Findings and comparison history

- Initial comparison: excessive vertical space in the trend plot placed the rankings lower than the target. Reduced plot and corresponding skeleton heights from 280px to 260px. Rebuilt, captured again, and compared the revised full-view and typography images together with the source. No remaining actionable P0/P1/P2 findings.
- An initial dark capture was taken during theme transitions. Recaptured after the theme settled; controls, chart tabs, row labels and the disclosure remain readable.

## Required fidelity surfaces

- Typography: system CJK fallback, 24px page title, 32px primary KPI, 24px secondary KPIs, 12–14px list labels. Reduced display weight and navigation size. Compact type supports the requested direction; primary/secondary numeric hierarchy remains intact.
- Layout: narrow sidebar, compact status header, borderless KPI group, underlined tabs, open chart region, two aligned ranking lists, relative row fills, and a rule above the collapsed heatmap. Skeleton geometry follows the live surface. Rankings stack below 900px; below 480px the main KPI occupies its own row. No horizontal page overflow in 40 locale/width combinations.
- Colors: retain existing blue and semantic theme tokens. Neutral comparison lines and light relative bars remain; existing dark tokens provide the dark counterpart. No new theme or palette dependency.
- Assets: existing Phosphor UI icons and SiteIcon component. Real `.test` sites intentionally use the globe fallback. No generated logo or rasterized UI is shipped.
- Copy: keep existing localized product labels and comparison rules. No new user-facing strings. The caption dates, durations and comparison availability remain computed from the ledger.

## Intentional product/data differences

- The source uses illustrative week-long records; verification has five real visits today. Accordingly the plot has one very small active-day bar, durations below a minute, and unavailable previous-period comparisons. No rows were inserted to imitate the mock.
- Default range remains today. The captured seven-day range is a user selection and is not persisted.
- Preserve current chart tab labels/order, first-recorded-day bounds, ranking expansion limit and actual range labels instead of introducing mock-only behavior. Existing site/session interactions remain.
- Use existing sidebar brand and local note rather than changing branding assets.

## Verification

- `npm run build:preview` then `npm test`: 415 passed, 0 failed.
- `npm run typecheck`, `npm run build`, `npm run verify-build`: passed.
- Feature paths: overview empty/ready, last-seven-day range, site filter and clear, open/close site drawer, collapsed/expanded heatmap: passed in the built extension. See `verification.log`.
- Ten locales at 1440/768/375/320px: passed page-overflow assertions. Light/dark screenshots inspected. No captured page errors.
- Local preview opened in the in-app browser and left on the empty overview; date menu inspected. Its storage remains unseeded.
- Preview Doctor script is Linux-specific (`/proc`); its PID check cannot run on macOS. Used extension manifest/service-worker/English-heading/empty-ledger checks before the journey instead. The Linux/Xvfb full E2E suite was not run.

## Follow-up polish / limits

- Exact text shaping varies by system font. The target is an image-generated proposal, not an exact typographic measurement specification.
- Real-data screenshots do not prove every possible long hostname or time value; existing tests cover contracts, and locale checks cover page overflow with the recorded sites.

# Visits, Settings and site details — 2026-10-24

final result: passed

The user requested extending the approved overview style to these existing surfaces. The source remains the selected overview image above; it supplies the typography, blue tokens, open surfaces and divider rhythm, not an exact mock of the other pages. `foundation-comparison.png` compares that source with the rendered Settings page in one image; `type-comparison.png` compares KPI typography with the rendered detail sheet. Existing product flows and copy remain the content source.

Evidence: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16bd1-0418-71d2-878d-0c719e45a8d6/implementation/surfaces/`.

- Desktop CSS viewport 1440 × 1024, scale factor 1; full-page Settings capture 1425 × 1323, Visits 1440 × 1024, detail viewport capture 1440 × 1024. Source normalized proportionally to 1425 × 1014 for the foundation comparison; no claim of an identical page state. Settings intentionally scrolls vertically.
- Full captures: `records.png`, `settings.png`, `detail.png`; dark versions use `-dark.png`. Narrow Settings and bottom sheet captures: `settings-mobile.png`, `detail-mobile.png` (375px viewport).
- Fonts: 12px table header, 13px table values, 14px setting labels and detail section headings, 15–16px group/sheet titles, 24px detail totals. Preserve native system/CJK fallback and existing localized number/duration formatting.
- Spacing: 24–28px setting group spacing, 24px sheet content insets, 52px visit rows, fixed footer actions and independently scrolling detail content. Details widen from 400px to 440px on desktop; the 760px bottom-sheet breakpoint is unchanged.
- Colors/assets: reuse overview blue and existing dark tokens, light dividers, original SiteIcon and Phosphor icons. No new raster assets, fonts, dependencies or user-facing strings.
- Copy/behavior: retain all setting controls, list validation, recording semantics, export status/summary and destructive confirmations. Raw hostnames remain in Visits. Tables retain internal horizontal scrolling on narrow screens rather than clipping columns or widening the page.
- First inspection found the list heading too close to radio descriptions and the session heading too close to the hour chart. Added 24px separation; rebuilt, re-ran checks and inspected the post-fix captures. No remaining actionable P0/P1/P2 findings.
- Feature checks passed: Visits search and reset; visit-to-drawer and drawer-to-visits; invalid-host rejection, normalized add, list filter, blacklist/whitelist warning and remove; settings doc link targets; a JSON download parsed back into the expected format and containing the recorded visits, with the export summary visible. See `verification.log` and `verify-surfaces.cjs` in the evidence directory.
- All ten locales at 1440px and 320px: page overflow checks for Visits/Settings and sheet bounds/internal overflow checks for details passed (60 combinations). Also inspected 375px and light/dark captures. No page errors captured. The records table may scroll horizontally inside its own container, as before.
- Final validation: 415 tests passed, 0 failed after `build:preview`; typecheck, WXT build and verify-build passed. No record seeding: disposable extension profile browsed five local test hosts. The ordinary preview remains empty and is open on Settings in the in-app browser.
- Limits: the Linux/Xvfb full suite was not run on macOS. Restore replacement and destructive deletion were not exercised; their logic was not changed, and unit tests still pass. The reusable preview Doctor still has the previously documented Linux `/proc` limitation; extension startup checks ran before the feature journey.

# Selected page-and-clock identity — 2026-10-24

final result: passed

- Source: first displayed logo concept, `exec-9bbf6bcf-6ba0-43fa-bdc5-fead7a0a37bd.png`; fidelity cleanup `exec-e49a39ae-07ff-4558-badd-0eea827e22fe.png`. The final 1254px RGBA master is saved in `assets/branding/pagetime-logo.png`; exact cleanup prompt and regeneration instructions are in `assets/branding/design.md`.
- Scope: sidebar uses icon/48.png at 22 CSS pixels; preview/dashboard/popup favicons use favicon.png (identical to icon/32.png); packaged manifest icons use the same mark at 16/32/48/96/128px. The obsolete favicon.svg and old bar/gauge generator paths are removed. Popup site icons remain unchanged and no extra popup brand header is added.
- Generator: existing Chromium canvas rasterization is retained, now driven by the selected PNG instead of independent SVG shapes. Playwright's installed Chromium supplies the executable across platforms; CHROME_PATH can override it. Transparent canvas bounds are fit proportionally; 128px retains existing 16px clearspace. Each rendered mark is checked for non-empty visible content and valid dimensions before files are replaced. Master remains outside public/ and is not packaged.
- Evidence: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16bd1-0418-71d2-878d-0c719e45a8d6/implementation/branding/`. `icon-sizes.png` shows the actual packaged resources at native size on white and dark backgrounds, together in one comparison; `brand-light.png` and `brand-dark.png` show the actual sidebar, and `dashboard-light.png` shows application context. No scaling claim beyond the stated 22px sidebar rendering; the 128px install icon intentionally has the same visible height as the unpadded 96px resource.
- Review: page silhouette, folded corner and clock-hand cutout remain readable at toolbar size; all sizes retain the selected proportions. Blue and transparency agree across themes; adjacent wordmark typography and navigation spacing are unchanged. No text is rasterized into the logo, and the decorative sidebar image has empty alt/aria-hidden to avoid repeating PageTime.
- Verification: generator completed all five sizes; 415 tests passed; build:preview, typecheck, WXT build and verify-build passed. Fresh built extension passed manifest/service-worker/empty-dashboard startup checks. Sidebar natural48/CSS22, 320px overflow, light/dark, both document favicon paths and image loading passed; no page or console errors. The ordinary preview was opened and visually inspected in the in-app browser, without writing records. `verification.log` and `verify-brand.cjs` preserve the checks.
- Limits: the full Linux/Xvfb suite and public-store release were not run. The master is PNG, not a vector export. The approved source has been adapted to browser asset sizes; no new identity direction was introduced.
