---
name: verify-pagetime
description: "Drive PageTime the way a user does and keep proof. Use when verifying the WXT dashboard or the Vite preview: the one-page ledger and date range, site detail drawer and ranking filter, settings recording scope, local data overview, or JSON/CSV export. Launch, doctor, drive, evidence, then cleanup."
---

# Verify PageTime

PageTime is a WXT Chrome/Edge extension plus a Vite preview that mounts the same React dashboard. This skill drives that dashboard with Playwright and the selectors already used by `tests/e2e/timing.spec.mjs`. Pin the UI to English before any assertion: the strings below are `src/locales/en.json`.

Two surfaces. Pick the one the feature file names.

- **Preview** is the default. `npm run dev -- --host 127.0.0.1 --port 4173` serves `index.html`. Storage is `localStorage` keys `pagetime-preview` and `pagetime-preview-settings` inside the Playwright context. A fresh context is an empty ledger. There is no IndexedDB `pagetime-ledger`, so the Local data section is absent.
- **Extension** is the installed dashboard. `npm run build` writes `.output/chrome-mv3`. Playwright loads it with the persistent-context arguments in `tests/e2e/timing.spec.mjs`. The page is `dashboard.html` on the service worker origin. The ledger is IndexedDB `pagetime-ledger` in that profile.

Do not start a second copy of the surface you are driving. The preview helper refuses when `127.0.0.1:4173` is already open. The extension helper in the e2e file finds every Chromium window by class `Chromium-browser`, and `playwright.config.mjs` sets `workers: 1`. One extension context at a time.

## Launch

### Preview

From the repo root:

```bash
node .cursor/skills/verify-pagetime/scripts/session.mjs launch
```

The helper spawns `npm run dev -- --host 127.0.0.1 --port 4173` in its own process group, records the pid in `/tmp/pagetime-verify/preview.pid`, and logs to `/tmp/pagetime-verify/preview.log`.

Ready when stdout is `PageTime preview ready http://127.0.0.1:4173/ pid <pid>` and the log contains `Local:   http://127.0.0.1:4173/`. The document is the shell (`id="root"`). Usable means Doctor, below, sees the heading `Browsing overview` and `[data-status="empty"]` or `[data-status="ready"]`. An empty preview is usable: `dashboardStatus` in `src/dashboard-status.mjs` returns `empty` when the ledger has no hosts, spans, visits, or hour rows. Do not seed `pagetime-preview`.

If launch says the port is already open, stop that owner yourself, then launch again. The helper does not signal a pid it did not start.

### Extension

```bash
npm run build
test -f .output/chrome-mv3/manifest.json
```

Then the same launch as `launch()` in `tests/e2e/timing.spec.mjs`: a fresh `mkdtemp` directory under `/tmp/pagetime-verify/`, `chromium.launchPersistentContext` with `headless: false`, and

```text
--disable-extensions-except=<absolute .output/chrome-mv3>
--load-extension=<absolute .output/chrome-mv3>
--no-first-run
--no-default-browser-check
--disable-popup-blocking
--disable-dev-shm-usage
```

Write `{ pid, userDataDir }` to `/tmp/pagetime-verify/extension.json` before driving. Ready when the service worker URL starts with `chrome-extension://` and `dashboard.html` shows `main`. Set language after the first load, the way `openSettings` does:

```js
await dashboard.goto(new URL('/dashboard.html', sw.url()).href);
await dashboard.evaluate(() => localStorage.setItem('pagetime-language', 'en'));
await dashboard.reload();
```

A journey that must accrue time also needs the e2e window focus path (`xdotool`, and `openbox` when `xprop -root _NET_ACTIVE_WINDOW` is missing). Run that under `xvfb-run -a` when `DISPLAY` is unset. Dashboard clicks that do not accrue time do not need `xdotool`.

Playwright's Chromium is the browser `npx playwright install chromium` installs (the `e2e` CI job). For the preview only, if that executable is missing and `google-chrome` is on `PATH`, set `PAGETIME_CHROME_CHANNEL=chrome` for Doctor and for the drive. Extension loading stays on Playwright's Chromium.

## Doctor

Preview, read-only:

```bash
node .cursor/skills/verify-pagetime/scripts/session.mjs doctor
```

Pass when stdout starts with `PageTime preview doctor ok`, the version matches `package.json`, the listener on port 4173 is the recorded pid or its descendant, and the ephemeral page reaches `Browsing overview` plus `data-status` `empty` or `ready` with no alert `Couldn't load or save data`. Anything else: do not drive. Run cleanup, then launch again.

Extension, read-only, on the context you opened:

- `.output/chrome-mv3/manifest.json` `name` is `PageTime` and `version` equals `package.json` `version`.
- `context.serviceWorkers()` has an entry whose URL starts with `chrome-extension://`.
- `dashboard.locator('main')` is visible and the heading is `Browsing overview`.
- `/tmp/pagetime-verify/extension.json` names this context's user-data directory. A second file means another drive is in progress; do not open another persistent context.

## Drive

Import `chromium` from `@playwright/test`. Viewport `1280×800`. Pin English in `addInitScript` before `goto` on the preview (`localStorage.setItem('pagetime-language', 'en')`). On the extension, set it and reload, as Launch says.

Preview origin is `http://127.0.0.1:4173/`. Extension origin is the service worker's `dashboard.html`.

Stable handles, from `src/App.jsx`, `src/Overview.jsx`, `src/RangeControl.jsx`, and the e2e file:

| Step | Handle |
| --- | --- |
| Pages | `getByRole('button', { name: 'Overview' \| 'Visits' \| 'Settings', exact: true })` inside `getByRole('navigation', { name: 'Main navigation' })` |
| Page title | `getByRole('heading', { level: 1 })` — `Browsing overview`, `Visit history`, `Settings` |
| Date range | `getByRole('button', { name: /^Date range/ })`, then `getByRole('menuitemradio', { name: 'Today' \| 'Last 7 days' \| 'Last 30 days' \| 'Custom' })` |
| Custom panel | `getByRole('form', { name: 'Custom' })`, labels `Start date` and `End date`, button `Apply`, alert `The end date must be on or after the start date` |
| Empty ledger | `[data-status="empty"]` and text `Your browsing will show up here` |
| Ready ledger | `[data-status="ready"]` |
| KPI | `section` label ending in `totals` (`Today totals` while the range is today). Compare lines are `[data-compare="ms"]`, `[data-compare="visits"]`, `[data-compare="sites"]` |
| Chart | `getByRole('tablist', { name: 'Primary chart' })`, tabs `Today's timeline` and the trend label (`Last 7 days` while the range is today), `tabpanel` `#primary-chart` |
| Rank filter | `getByRole('button', { name: 'Filter to <domain>' })`. Active chip is a `status` whose text is `Filtered to <domain>`, with button `Clear filter` |
| Site drawer | `getByRole('button', { name: 'Details for <domain>' })`, then `getByRole('dialog')` titled `Site details`, close `Close details` |
| Recording scope | `getByRole('radiogroup', { name: 'Recording scope' })`, radios whose names start with `Blacklist` and `Whitelist` |
| Ignore / allow | textbox `Host to ignore` or `Host to allow`, button `Add`, remove `Remove <domain>` |
| Local data | `getByRole('region', { name: 'Local data' })` — extension only |
| Export | heading `Export data`, buttons `Export JSON` and `Export CSV`, `status` `Saved pagetime-<date>.json.` or `.csv.` |

One feature per drive. The steps live in `features/`. A missing precondition is a failed journey; the reason is already in that file's Gotchas. Do not write sample rows into `pagetime-preview` or IndexedDB to make a journey pass.

Leave delete alone. Do not click `Clear data`, `Delete this day`, `Delete this site's records`, or the confirm buttons `Clear` and `Delete records`. Those paths stay in `tests/e2e/timing.spec.mjs`.

## Evidence

Write one directory per run: `/tmp/pagetime-verify-evidence/<run-id>/`. Put screenshots and a `result.txt` there. `result.txt` lists each assertion and the observed text. Capture the action and the state after it (menu open, then the control after the choice), not only the last screen.

Proof bar:

- Use the clicks in the feature file. Setting `pagetime-language` is the locale pin the e2e already uses, not a shortcut around the feature.
- Check the side effect the feature claims. The date range is React state only: after a preset change, reload returns the trigger to `Date range: Today`, and `localStorage` has no range key. A recording-scope add writes `pagetime-preview-settings` (preview) or the settings message (extension) and leaves the other list in place. Export resolves a Playwright `download` event whose body matches the on-screen status filename.
- Preview export and settings stay in that browser context. Confirm no request during the export click leaves the page origin. The file is built in the page (`src/export-file.js`) and saved with a blob link.
- Do not treat a dry name as proof. An empty export still downloads a file: JSON `format` is `pagetime-ledger` and the CSV starts with the UTF-8 BOM plus `date,host,active_ms,visits`.
- Do not commit this directory. Attach screenshots to the PR from outside the repo.

## Cleanup

```bash
node .cursor/skills/verify-pagetime/scripts/session.mjs cleanup
```

That signals the recorded preview process group (`SIGTERM`, then `SIGKILL` if it is still alive) and deletes `/tmp/pagetime-verify/preview.pid` and `preview.log`. It refuses a pid whose command line is not the preview, and it never deletes `/tmp/pagetime-verify-evidence`.

Extension: `await context.close()` on the context you launched, then `fs.rmSync(userDataDir, { recursive: true, force: true })` for the directory in `extension.json`, then delete `extension.json`. Do not signal Chromium by name.

After cleanup, list the evidence directory. The screenshots and `result.txt` are still there. A cleanup that removes them failed.

Run cleanup after a failed launch or drive too, so the port and the profile are not left behind.

## Helpers

`.cursor/skills/verify-pagetime/scripts/session.mjs` is the preview session. From the repo root:

```bash
node .cursor/skills/verify-pagetime/scripts/session.mjs launch
node .cursor/skills/verify-pagetime/scripts/session.mjs doctor
node .cursor/skills/verify-pagetime/scripts/session.mjs cleanup
```

`launch` prints `PageTime preview ready http://127.0.0.1:4173/ pid <pid>`. `doctor` prints `PageTime preview doctor ok version <version> ...`. `cleanup` prints `PageTime preview stopped pid <pid>. Evidence remains at /tmp/pagetime-verify-evidence`.

There is no drive helper. Drive from `features/` so a new journey is a new file, not a new flag.

## Maintenance

When a route, label, or empty state changes, update the feature file in the same change. `/maintain-verification-skill` is the pass that checks the map against the app.
