# How PageTime counts time

These are the rules the extension follows. They are not repeated in the extension's interface. The behaviour is pinned by the tests named in [Where the rules are tested](#where-the-rules-are-tested). A Chinese version is in [timing.zh-CN.md](timing.zh-CN.md).

The numbers below are constants in `src/model.mjs`, except the idle threshold, which is a setting.

## What counts

- The selected tab of a focused, normal browser window, on an `http` or `https` page. Time is totaled by hostname.
- When the same tab navigates to another site, time on the new site starts at that navigation.

## What does not count

- **Idle.** Recording stops when the idle threshold passes without keyboard or mouse input, and the stretch before that point still counts. The default is 60 seconds (`IDLE_SECONDS`). Settings offers 1, 2, 5, and 10 minutes. This includes watching a video or listening to audio, unless the next item applies.
- **Audio.** By default (Settings, Browsing records, keep counting while audio plays), idle time keeps counting while the active tab of the focused window plays unmuted sound. Timing stops as soon as the sound stops or the tab is muted. Turn the switch off to treat that tab like any idle tab.
- A locked screen, a sleeping computer, or a closed browser. The whole stretch is not counted, except that when timing resumes, at most 90 seconds (`GAP_LIMIT_MS`) of it is credited, the same cap as the checkpoint gap below.
- A minimized window, another app in front, or focused DevTools.
- Browser internal pages, extension pages, and local files.
- Incognito windows. The extension is not allowed in them.
- Background tabs.
- The time while recording is paused.
- A gap between checkpoints longer than 90 seconds (`GAP_LIMIT_MS`): at most 90 seconds of the gap is counted, for example while the system is suspended.

### Recording scope

The default mode is a blacklist: sites on the ignore list, and their subdomains, are not timed and their visits are not counted, the same as an internal browser page. In whitelist mode only the allowed sites and their subdomains are timed and counted. An empty whitelist records nothing; it does not mean "record everything".

An entry of `example.com` matches that host and every subdomain. An entry of `mail.example.com` does not match `example.com`. The two lists are stored separately, and switching mode does not clear the other one. A site that the current mode excludes stops timing at once. Existing records are not deleted or hidden.

### Known limits

- The browser can take 2 to 3 seconds to notice that sound started or stopped.
- With a 10-minute idle threshold, up to 10 extra minutes can be counted after you leave.
- This is an approximate active-time measure. A short sleep or an unexpected exit can be off by tens of seconds.

## Visits

A page load or reload counts as one visit, including a navigation in a background tab. Switching tabs does not add a visit. In-app navigation in a single-page application does not either.

## Comparing with the previous period

Each of the three overview figures (active time, visits, sites) is compared with the previous period: the same number of calendar days, ending where the selected range starts. Today is compared with yesterday, the last 7 days with the 7 days before them, and the last 30 days with the 30 days before them. A custom range is compared with the equally long range just before it.

- While the selected range includes today, both periods are counted only up to the current whole hour. The previous period is cut at the same wall-clock hour, so today so far is never set against all of yesterday.
- The change is shown neutrally as a difference and a percent. When the previous value is 0, only the difference is shown.
- A dash is shown instead of a number when the previous period cannot be compared:
  - It starts before the first recorded day (`since`).
  - The cut day's visit rows have passed the detail retention below, so visits and sites cannot be counted for the part of that day before the cut-off hour.
  - The range is today and no whole hour has passed yet.

## How sites are grouped

Records always keep the original hostname. Grouping is only a view over those rows: switching it never rewrites stored data, and the Visits page still shows raw hostnames. Settings, Group subdomains:

- **Don't group.** Each hostname is counted on its own.
- **Group www, m, and mobile** (default). A leading `www.`, `m.`, or `mobile.` is removed, so `www.youtube.com` and `m.youtube.com` become `youtube.com`. Other names, such as `gist.github.com`, stay separate.
- **Group by registrable domain.** Grouped with the ICANN section of the Public Suffix List, which ships inside the extension and needs no network. `a.b.example.co.uk` becomes `example.co.uk`. IP addresses, `localhost`, and hosts with no registrable domain stay unchanged. Private suffixes such as `github.io` are not treated as public suffixes, so `user.github.io` is grouped under `github.io`.

A site that merges two or more hostnames lists its subdomains in the site details. Opening its visits filters by every hostname in the group.

## Privacy and storage

The full statement is [PRIVACY.md](../PRIVACY.md) ([中文](../PRIVACY.zh-CN.md)). In short:

- Only the hostname, times, and visit counts are saved. Titles, page text, full URLs, paths, queries, cookies, and form input are not.
- Data stays on this device, in the extension's own IndexedDB database. Nothing is uploaded. The extension has no host permission and no content script.
- You can delete one site or clear everything. Deletion removes the records from the local database and cannot be undone.
- Progress is saved every 30 seconds (`CHECKPOINT_SECONDS`). If the browser closes unexpectedly, at most that recent interval can be lost.
- Visit records and active sessions are kept for the last 31 days (`DETAIL_DAYS`), counting today. Daily and hourly totals are kept until you clear them or delete that site.
- Export data in Settings builds a JSON or CSV file in the page and saves it as a download. It makes no network request.

## Where the rules are tested

- `tests/timing.test.mjs` drives the background with a fake clock and a fake browser.
- `tests/model.test.mjs` and `tests/compare.test.mjs` cover the constants, the day cut-offs, and the comparison windows.
- `tests/site.test.mjs` covers the three groupings.
- `tests/e2e/timing.spec.mjs` runs the built extension in Chromium.
- [timing-coverage.md](timing-coverage.md) maps each scenario to its test, and [timing-qa.md](timing-qa.md) is the manual checklist for macOS and Windows.
- `tests/timing-docs.test.mjs` checks that this page and its Chinese version state the same constants as `src/model.mjs` and `src/settings.mjs`.
