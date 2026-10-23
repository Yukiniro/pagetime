# 设置页名单过滤

Above the current mode's list in Settings there is a local filter box. It does a case-insensitive substring match on the hosts already added. It is pure frontend state: it never writes the settings record, never changes list semantics, and the other mode's list is untouched. Switching `Blacklist` / `Whitelist` resets it.

## Sub-features

- Textbox `Filter ignored sites` (blacklist) or `Filter allowed sites` (whitelist), placeholder `Filter by host`. It appears once the list has an entry; an empty list shows only the empty title.
- Button `Clear filter` appears inside the box while it has text and restores the full list.
- No match: empty title `No matching sites` (the list itself is not empty).
- `Remove <domain>` on a filtered row removes that host from the full list. `Add` is not affected by the filter, so a new host that does not match stays hidden until the filter is cleared.
- Mode switch remounts the list, so the filter starts empty in either mode.

## How to get to it (user POV)

Sidebar `Settings`, heading `Recording scope`, under `Ignored sites` or `Allowed sites`, between the add row and the list.

## Driving it with Playwright

Fresh preview context or fresh extension profile, English. Writes only the settings record in that context.

1. Open `Settings`. With an empty blacklist there is no `Filter ignored sites` textbox and `No ignored sites` shows.
2. Add `github.com`, `gist.github.com`, `example.com`, `mail.example.com` through `Host to ignore` and `Add`. The filter textbox appears.
3. Fill the filter with `GitHub`. Only `github.com` and `gist.github.com` remain (case-insensitive). Screenshot.
4. Fill `zzz`. `No matching sites` shows and `No ignored sites` does not. Screenshot.
5. Fill `example`, click `Remove mail.example.com`. Only `example.com` remains in view. On the preview, `pagetime-preview-settings` `ignored` is `['github.com','gist.github.com','example.com']`.
6. With the filter still `example`, add `new.example.net`. It shows; add `other.org` and it stays hidden until `Clear filter`.
7. Click `Clear filter`. The textbox is empty and every host is back.
8. Type `git`, select the `Whitelist` radio. The filter shown for `Allowed sites` is empty (add `gitlab.com` first to make the box appear). Select `Blacklist`: the filter is empty and all ignored hosts show.

## Gotchas

- The box is hidden while the list is empty, unless it still holds text from before the list emptied.
- Do not assert any request or storage write from typing: the filter is React state only. `localStorage` settings change only on `Add` / `Remove`.
- The cap is 500 hosts. Do not loop to the cap in a verification drive.
- Do not click `Clear data` while you are on this page.
