# Root website and component naming, 2026-10-26

final result: passed

- Move homepage source, styles, product images and reference/provenance files from `src/home/` into repository-root `website/`. Keep `home.html` as a thin Vite entry, so `/home.html`, root dashboard preview and the Cloudflare output contract stay stable.
- Move all homepage strings into independent `website/locales/` files for ten languages; remove homepage strings from extension resources. Website-only navigation/language/docs/duration strings are separate resource values. The extension locale files are identical to their pre-homepage contents.
- Use a dedicated website i18next instance with an explicit I18nextProvider, localized formatting and a website-only language preference (`pagetime-website-language`). The extension continues using its existing language key. The website reuses UI primitives, theme, docs URL helpers and pure duration formatting, and no longer imports extension i18n or its WXT language-storage path. On first use of the new website preference, browser-language detection applies.
- Rename all 15 PascalCase plugin component files to kebab-case, updating component imports, test loaders/source assertions and verification map references. Existing UI and homepage component filenames already match. Four case-only renames are recorded with Git moves for case-insensitive macOS; the remaining renamed files are present at their new paths. React component identifiers remain PascalCase.
- Add tests for independent locale coverage, key usage, plural/tag/placeholder completeness, distinct i18next instances and language preferences, localized date/time/duration output, absence of cross-surface resource keys, and component filenames across src, entrypoints and website. An initial website key-usage check omitted its shared pure duration helper; include that actual dependency in its source scan. No runtime workaround added.
- Checks passed: typecheck, build:preview, all 429 tests, WXT build, verify-build and Wrangler dry run. No homepage WebP assets are packaged into WXT. Protected Sites files unchanged. Final filename-test expansion to entrypoints also passed its targeted 2 tests.
- Browser: native macOS Doctor confirms correct port/cwd and empty root ledger with no alerts. Website English and dashboard German both survive reload independently. Twenty website checks cover ten languages at 375px and 1440px, correct bilingual image selection and loading, localized title/headline and no horizontal overflow. FAQ Tab/Enter single-open behavior, 3-step installation dialog and Escape close pass. Renamed dashboard range control opens and selects Last 7 days. Dashboard's original Chinese preference restored.
- Built preview checked on 4176: localized website, three installation steps, no console errors and empty root. Temporary preview stopped; 4175 development server retained.
- Cloudflare updated: version `c9384958-9753-41f4-902b-6e444d6a6aa0`, deployment `31663cb2-5d05-426c-bd52-0f94fdc22ece`, 100% traffic confirmed by account API. Live website loads `home-C5jPW-bs.js`; changing it to English leaves the root dashboard Chinese and empty after reload. Both English product images load. Zero live browser console errors; website restored to Chinese for handoff.
- Evidence: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16e32-14b8-7fc0-8210-500fc95eab45/website-isolation/`. Includes independent-languages.json, locales-layout.json, doctor.json, interaction.json, production.json, production-root.json, cloudflare-isolation.json, cloudflare-console.json, homepage.png, dashboard.png, cloudflare.png and validation logs.

No full extension timing E2E or real extension installation performed. Current source paths above supersede the historical paths in the reports below.

---

# Cloudflare deployment, 2026-10-26

final result: passed

- Published the current homepage to https://pagetime.yukiniro.workers.dev/home.html, with the empty dashboard preview retained at https://pagetime.yukiniro.workers.dev/.
- Target: Yukiniro account `1196209884dfb6ec11288f64baaf323a`, new `pagetime` Worker. Account inventory had no prior PageTime Worker or Pages project. Other services untouched. Default workers.dev domain only; no DNS or custom domain changes.
- Active version: `f5764dd6-c35b-475d-9498-4916c5a49867`, deployment `745f9afe-fc85-4532-b90c-0205ec339d43`. Cloudflare API confirms 100% traffic and workers.dev enabled.
- Added local Wrangler 4.153.0, `wrangler.jsonc`, and `npm run deploy:cloudflare`. Existing package versions were not upgraded. Reuse the unchanged `worker/index.js`; only `dist/client` is uploaded. All protected Sites files remain intact. `html_handling: none` preserves `/home.html`; the existing Worker supplies the empty dashboard for HTML navigation at `/`.
- Validation: typecheck, build:preview, 416 tests, WXT build, verify-build, 4 Sites Worker tests and Wrangler dry run passed before upload.
- Live browser: Chinese and English product images load from Cloudflare, localized copy updates, FAQ expands, closing CTA opens the three-step installation guide with the GitHub release URL, Escape closes it. At 375px, no horizontal overflow and one capability column. Root has an empty ledger and no error alerts. No console errors after reload. Initial IAB navigation showed only the HTML shell; a reload completed asset loading, and all subsequent interactions passed.
- HTTP checks: `/home.html` and homepage JS return 200 with correct content types; HTML navigation at `/` returns 200; a missing JS asset returns 404. All checks target the deployed version.
- Evidence: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16e32-14b8-7fc0-8210-500fc95eab45/cloudflare-deployment/`, including `homepage-live.png`, `checks.json`, `mobile.json`, `root.json`, `console-errors.json` and build/deploy logs.

No custom domain configured. No real extension installation or timing E2E performed for this deployment.

---

# Homepage spacing refinement, 2026-10-25

final result: passed

The user found the overall page too compact. This pass changes homepage CSS only, retaining the selected layout, copy, bilingual illustrations and interactions. Durable spacing feedback is recorded in AGENTS.md.

- Limit reading content to 1120px and the main product image to 1184px. Give the hero 104px top / 64px bottom spacing on desktop and 72px / 48px on mobile. Reduce the maximum hero title from 70px to 64px and subtitle from 21px to 18px.
- Use responsive 72–120px section padding and 40–64px heading separation. Replace four narrow capability columns with two spacious columns, stacking on mobile, with 32–36px row padding and light dividers. Increase installation, FAQ and closing CTA spacing.
- Evidence: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16e32-14b8-7fc0-8210-500fc95eab45/homepage-spacing/`. `before.png`, `features-dark.png`, `features-zh.png`, `homepage-zh.png`, `homepage-en.png`, `faq-mobile.png`, `install-mobile.png`.
- `layout-checks.json`: 40 actual viewport checks, ten languages at 320, 375, 1003 and 1440px; no document overflow, correct responsive capability columns, loaded bilingual product images. Chinese and English full-page captures and light/dark focused views inspected.
- FAQ keyboard Tab / Enter / Space still opens one answer and closes it. At 375px, the three-step installation dialog measures 328px wide, stays within the viewport and closes with Escape. No interaction code changed.
- macOS Doctor equivalent: listener PID 74337, npm parent 74314, correct checkout cwd. Root preview observed empty, with no load/save alerts. Temporary built preview on 4176 confirms two desktop capability columns, 115.2px section padding at 1440px, three installation steps, empty root and zero console errors. Development preview also has zero console errors. Follow-system appearance restored after checking light mode; Chinese selected for handoff.
- Validation: typecheck, build:preview, all 416 tests, WXT build and verify-build passed. No new dependency or runtime logic. Existing homepage feature journey updated with spacing checks.

The development preview remains at `http://127.0.0.1:4175/home.html`. No deployment or real extension installation performed.

---

# Expanded website homepage QA — 2026-10-25

final result: passed

## Brief and source of truth

This is an expansion of the already selected first homepage concept, following the user's request for more content, OtterTap as a reference, 21st component guidance, and Chinese/English product images. It preserves the selected blue analytics identity rather than cloning OtterTap's brand.

- Original hero source: `/Users/zhanghao/.codex/generated_images/01a16e32-14b8-7fc0-8210-500fc95eab45/exec-d6ce82a7-f468-4974-a543-7f6d60cffa47.png` (1003 × 1568).
- Content reference: https://ottertap.vercel.app/, opened and inspected in the in-app browser. The web text tool could not access it; browser access and screenshot capture succeeded. Its product/features/privacy/install/FAQ sequence informs the expansion.
- 21st sources retrieved: Feature Spotlight demo 8465 and Base UI Accordion demo 31351. Preview and code inspected; concrete adaptations are documented in `src/home/REFERENCES.md`. The official shadcn Base UI Accordion is used. Package dependencies remain unchanged.

## Browser evidence and normalization

Evidence directory: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16e32-14b8-7fc0-8210-500fc95eab45/homepage-expanded/`.

- `homepage-zh.png`: 1425 × 4498; `homepage-en.png`: 1425 × 4528. CSS viewport 1440 × 1000, light appearance, FAQ closed. The 15px scrollbar is excluded from full-page width; screenshot output is CSS resolution even though the host reports DPR 2.
- `homepage1003-zh.png`: 988 × 4096 at CSS viewport 1003 × 1000. `hero-comparison.png` combines the original hero, proportionally normalized to 988px width, and the new hero at the same width; inspected together. Additional navigation and language controls are intentional additions.
- `ottertap-home.png`: 1265 × 5043, captured from the live reference. Full PageTime and OtterTap views inspected for reading sequence and content balance, not pixel identity.
- `features-zh.png`, `features-en.png`: focused native desktop captures of the two-column ranking spotlight and capability descriptions. `21st-feature.png` records the component reference; its decorative 3D image and continuous animation are intentionally replaced by PageTime's real product visual and calm open layout.
- `bilingual-comparison.png`: Chinese and English dashboard images together at their identical intrinsic 1383 × 1137 size, inspected together. No stretch, clipping or overlay translation.
- `mobile-en.png`: 360 × 5197 at actual 375px viewport. `faq-mobile-en.png` and `faq-mobile-zh-CN.png`: focused 375 × 720 captures with an answer open. `dark-zh.png`: full dark presentation; follow-system restored afterward.

## Required fidelity surfaces

- Fonts and typography: same system sans/CJK stack and restrained blue-accent heading. New body copy uses 14–16px desktop and 13–14px mobile with generous line-height; section titles are 26–36px. FAQ questions wrap normally. All ten locales tested without horizontal overflow at four widths.
- Spacing and layout: retain centered hero, large dashboard and light trust row. Add a two-column feature spotlight, four open capability columns, an inline three-step installation guide, a minimal FAQ and a final download action. Mobile sections stack with dividers. Ranking crop keeps both headers and all five rows, using the source asset rather than reconstructed UI.
- Colors: existing light-blue/navy/white tokens, light dividers and relative row bars. New sections inherit the existing dark palette; closing CTA uses its dark surface. Both light and dark inspected.
- Image quality: Chinese original preserved; English edition generated by text-localization from that exact image and encoded losslessly. Both are 1383 × 1137 and keep the same data and geometry. Every text-bearing product image switches with language. Chinese locales use Chinese imagery, all other locales use English imagery; the shared timeline has no raster text. Exact prompts and provenance are in `src/home/assets/README.md`.
- Copy/content: explain actual date/site browsing paths, toolbar information, recording scope, pause/preferences, export/restore, installation, privacy and account expectations. No invented productivity score, cloud sync, ratings or store listing. All new strings are translated into ten locales. The image examples remain October 18–24 2026, as in the selected source; localized date/time/duration labels continue to use `src/i18n.js`.

## Interaction and feature verification

- Manual macOS Doctor confirmed the recorded npm/Vite processes and this checkout's cwd. Browser: English `Browsing overview`, empty ledger and no alerts (`doctor.json`).
- `locale-width-results.json`: 40 assertions across ten languages at actual 320, 375, 1003 and 1440px. Each asserts requested `innerWidth`, no document overflow, two loaded product images with the correct language, five FAQ controls and three inline installation steps.
- `interaction-results.json`: English image selection, FAQ single-open behavior and keyboard Tab/Enter/Space. Base UI 1.9 intentionally uses Tab, following the updated guidance documented in its installed types; deprecated arrow-key roving focus was not reimplemented.
- `narrow-faq-results.json`: Chinese, English, German and Russian answers wrap at 375px. Their closing CTA opens the same three-step installation dialog, which stays inside the viewport.
- `production-results.json`: built homepage tested at 4176. Both English product images loaded with correct dimensions; all five FAQ answers opened individually, exactly one at a time; closing CTA opened the installation dialog with the correct release link; no console errors. Root dashboard remained empty. Temporary production server stopped; development preview remains at 4175.
- Feature paths updated: `website-homepage.md` and new `website-content.md`, registered in the feature map.

## Checks and findings

- Passed: typecheck, preview build, 416 tests, WXT build, verify-build and 4 Sites packaging tests. No new package dependency and no website WebP in the extension package. Whitespace check passes with existing CRLF line endings allowed.
- The older development tab retained three React hook/prebundle errors from its earlier optimization cycle. Production had zero errors. A fresh load of the same development build rendered the full page and interactive FAQ with zero errors; the old tab was closed and the clean tab retained. History is saved as `development-earlier-errors.json`; `console-errors.json` records the clean fresh tab.
- Comparison history: no actionable P0/P1/P2 visual findings in this expansion. New content and language navigation are deliberate changes; the original hero hierarchy is retained. All desktop, mobile, focused FAQ, bilingual imagery and dark captures were inspected.
- Final self-review followed `REVIEW.md`, including narrow layouts, multilingual copy and preserving the ledger.
- Not performed: public deployment, PR creation, real extension installation or collection e2e. Product images are static illustrations and never seed the ledger.

---

# Previous homepage implementation QA

# Website homepage design QA — 2026-10-25

final result: passed

## Target and comparison evidence

- Selected target: first displayed homepage option, `/Users/zhanghao/.codex/generated_images/01a16e32-14b8-7fc0-8210-500fc95eab45/exec-d6ce82a7-f468-4974-a543-7f6d60cffa47.png` (1003 × 1568).
- Evidence directory: `/Users/zhanghao/.codex/visualizations/2026/10/24/01a16e32-14b8-7fc0-8210-500fc95eab45/homepage-implementation/`.
- Latest comparison screenshot: `homepage-zh.png`, 988 × 1747; light appearance, Simplified Chinese, installation dialog closed, header at the top.
- CSS viewport: 1003 × 1000. Browser reports devicePixelRatio 2, but the screenshot API emits CSS-resolution pixels. Full-page capture excludes the 15px scrollbar. Source normalized proportionally to 988 × 1545; no stretching or density upscaling.
- `comparison.png`: source and latest implementation in one input, inspected together. `hero-comparison.png`: focused typography, spacing, logo, navigation and CTA comparison, inspected together.
- `mobile-zh.png`, `mobile-ru.png`: actual 375px viewport, with scrollbar excluded from the 360px-wide full-page captures. `dark-zh.png` and `installation-dark-zh.png`: dark appearance and installation dialog.
- Production build opened at `http://127.0.0.1:4176/home.html`. Its viewport and full-page captures are `production-home-viewport.png` and `production-home-full.png`. Development preview is on 4175; another checkout owns 4173 and was left alone.

## Fidelity and content

- Typography: system CJK/sans stack; centered heading with blue emphasis, restrained subtitle, compact navigation and clear CTA labels. Body and trust copy use 13–16px; page headline scales with the viewport. No clipped or overflowing text in all ten languages at 320, 375, 1003 and 1440px.
- Layout: selected centered hero, straight-on dashboard, three-column trust row, timeline section and light dividers are preserved. Product screenshot keeps its intrinsic aspect ratio. Trust rows stack on mobile. The modest footer adds language selection and privacy access; it accounts for part of the additional page height versus the source.
- Colors: existing white/navy/light-blue theme foundation, primary blue, subtle separators, restrained image halo and light relative ranking bars. Dark appearance uses the same theme tokens and keeps product illustrations as light screenshots.
- Assets: packaged page-clock brand mark, existing Phosphor icons, two individually generated raster product visuals grounded in the selected source. Dashboard is lossless WebP (1383 × 1137); timeline is WebP (2243 × 701, CSS clips the centered band without distortion). Prompts/provenance are in `src/home/assets/README.md`. No whole-page image substitutes for the website, handmade icon art or seeded ledger data.
- Copy: headline and hierarchy follow the target. Replaced its overbroad claim about collecting no personal data with the accurate account-free installation message. Marketing examples remain dated October 18–24, as in the supplied source, and image alternatives identify them as illustrations. Dates, times and durations are formatted through `src/i18n.js`. All new UI strings and image alternatives have ten locale resources; the illustrative dashboard itself remains Chinese.

## Findings and comparison history

- [P2, fixed] At the first true mobile capture, the timeline's aspect ratio plus minimum height inferred a 616px width and overflowed the viewport. Evidence: `mobile375-real.png` (636px-wide document). Explicit `width: 100%` fixes the containing track; final `mobile-zh.png` is 360px wide, and 40 locale/viewport assertions show no document overflow.
- The initial browser viewport override applied to a different test tab. Those early width results were discarded and replaced. Every retained locale-width result asserts the requested `innerWidth` before checking overflow.
- Refined header/hero spacing and heading scale after the first browser view; the final full and focused comparisons show the corrected hierarchy. Reduced trust-row padding after the full comparison to restore the source's lighter density.
- No remaining actionable P0/P1/P2 findings. Small optical differences in system font rendering and broader buttons for longer translated labels are acceptable. Mobile product-image text naturally gets smaller with the static illustration; functional page text and controls remain readable.

## Feature verification

- Journey: `.cursor/skills/verify-pagetime/features/website-homepage.md`, registered in its README.
- Manual macOS Doctor: recorded npm PID 74314, Vite listener 74337, correct checkout confirmed with `ps` and `lsof`. The existing Linux `/proc` Doctor cannot run on this macOS host; its heading/status/error checks were reproduced in the in-app browser. `doctor.json`: English `Browsing overview`, empty ledger, no alerts.
- Installation: both header and hero buttons open one Base UI dialog. Three steps, correct Chrome/Edge addresses and GitHub Releases link. Keyboard loop stays in the dialog or Base UI's focus guard; Escape and close button restore the trigger focus.
- Navigation: Features/Privacy links reach real fragment targets. GitHub and localized privacy documentation URLs checked. Latest public GitHub release verified through `gh release view` (v1.4.0 with ZIP and checksums); installation was not performed in the user's browser.
- Language: all ten locales tested at four actual widths (40 assertions). All ten installation dialogs tested at 320 and 375px (20 checks). Header, title, description, alternative text, guide and date/duration copy update. Menu selection closes automatically in the production build.
- Light/dark: inspected homepage and installation panel. Dark selected through the existing preview settings for the check, then restored to Follow system.
- Production: all three images loaded, no horizontal overflow, installation guide and language changes passed, zero browser console errors. Root dashboard still reports an empty ledger (`production-dashboard.json`).
- Checks: `npm run typecheck`, `npm run build:preview`, `npm test` (416 passed), `npm run build`, `npm run verify-build`, `npm run test:sites` (4 passed), and whitespace check allowing the repository's existing CRLF line endings. Website WebP files are absent from `.output/chrome-mv3`.
- Not run: extension collection e2e and new extension installation; extension behavior is unchanged. No site deployed and no PR created.

## Implementation checklist

- [x] Exact selected source resolved and both product assets installed.
- [x] Shared components, theme, localization and preserved dashboard entry.
- [x] Installation path, navigation, keyboard, locale and responsive checks.
- [x] Production browser verification and saved full/focused comparisons.
- [x] Changeset, durable design decision and feature verification map updated.

---

# Previous dashboard QA

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
