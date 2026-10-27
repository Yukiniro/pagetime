# Homepage image assets

Generated with the built-in image_gen tool on 2026-10-25. These are static example product visuals, not seeded browsing records.

Reference: selected homepage option 1, `/Users/zhanghao/.codex/generated_images/01a16e32-14b8-7fc0-8210-500fc95eab45/exec-d6ce82a7-f468-4974-a543-7f6d60cffa47.png`.

- `dashboard.webp`: 1383 × 1137. Isolated full dashboard, including thin browser strip, sidebar, overview KPIs, seven-day trend and both site rankings. The page-clock logo file was supplied as a second input. Generated source: `exec-6cfbe146-6b44-4a27-b8f0-0fff438e45ea.png`.
- `timeline.webp`: generated source 2243 × 701; the blue strip occupies approximately x23–2219, y300–378. The page clips the centered strip with CSS, retaining the source aspect ratio. Generated source: `exec-10b75f22-b132-4ff9-a23a-1cc25923f928.png`.

## Dashboard prompt

Use case: precise-object-edit. Asset type: a single isolated PageTime browser extension dashboard screenshot for a product homepage. Input image 1 is the exact selected homepage reference. Input image 2 is the real page-clock logo to use in the dashboard sidebar. Extract and faithfully re-render ONLY the complete dashboard panel in image 1, located approximately at x44 y397 through x959 y1149 within its 1003x1600 page. The entire resulting landscape canvas must be this dashboard, edge to edge. Preserve the tiny browser title strip with red yellow green dots; left sidebar; top recording-status row; KPI area; the seven blue bar trend; two aligned ranked site lists; collapsed activity row. Preserve its exact Chinese typography, generous spacing, pale sidebar, white panel and restrained royal blue accents, and example dates October18–October24. The panel aspect ratio is 915:752; output high resolution about1440x1184. Maintain tiny legible detail. Text: PageTime; 概览; 访问记录; 设置; 数据仅保存在此设备; 正在记录; 自10月17日开始; 暂停记录; 浏览概览; 10月18日 — 10月24日; 近7天; 活跃时间; 23小时18分; 较上一时段 +8%; 访问次数; 426; 较上一时段 +6%; 站点数; 28; 较上一时段 +3; 每日趋势; 今日时间线; 活跃时间排行; 访问次数排行; 活跃时段. Graph dates10月18日 to10月24日, last bar stronger blue. Ranking sites github.com,youtube.com,figma.com,notion.so,developer.mozilla.org; preserve reference example durations and visit counts. Exact screenshot composition of the selected source, not a redesign. No surrounding homepage, no hero words, no privacy columns, no external white border, no external glow/shadow, no page background, no perspective, no device frame beyond the thin source browser strip. Edge to edge flat screenshot.

## Timeline prompt

Use case: precise-object-edit. Asset type: only the thin browsing activity timeline strip in the supplied PageTime homepage reference. Faithfully extract/re-render the thin blue band located near source x50 y1460 through x952 y1490, as a separate narrow wide raster image. Canvas about1280x40, edge-to-edge horizontal strip, no whitespace around it. It is a very pale blue track with many fine pale vertical separators and clusters of thin royal-blue and soft medium-blue activity segments of varying widths/opacity, exactly in the source's restrained light blue analytics art direction. Keep quiet empty portions and clustered activity. Fine pale blue outline and subtly rounded corners. No words, no labels, no ticks, no legend, no dates, no numbers, no icons, no website, no shadows. Output only the thin graphic strip, suitable for a native web page to place dates/ticks around in HTML. Preserve source's approximate distribution of blue segments from left to right.


The dashboard is encoded as lossless WebP; the timeline uses WebP quality 90. Original generated PNGs remain in the Codex generated-images directory. No website asset is copied into public/ or imported by extension entrypoints.

## English dashboard edition — 2026-10-25

- File: `dashboard-en.webp`, 1383 × 1137, lossless WebP. The Chinese `dashboard.webp` is unchanged.
- Source: localized edit of `dashboard.webp` using built-in image_gen, generation `exec-ace9e6f6-7be1-4f05-a9ec-3fc82ebfb627.png` in `/Users/zhanghao/.codex/generated_images/01a17109-f95b-7ac2-8abf-8408d3b83b12/`.
- Inspected the complete result: full browser strip, sidebar, recording status, KPI row, seven bars, both ranking lists and bottom note are present. Visible UI text is English, including small units and weekday labels; domain names, data and layout are retained. This is a static marketing example, not a live ledger capture.

### English localization prompt

Use case: text-localization. Asset type: one ENGLISH edition of the provided PageTime dashboard product illustration. Edit the attached exact screenshot; translate every Chinese glyph into accurate concise English while preserving ALL existing layout, spacing, section anatomy, icon positions, data, graph geometry, white/pale-blue surfaces, and blue accents. DO NOT redesign or add controls. Full flat edge-to-edge dashboard screenshot, including three browser dots/title strip, entire left navigation and bottom local-data note, top recording status, KPIs, graph and both five-row ranking lists. Target same landscape aspect ratio as input1383x1137; output around1440x1184, crisp readable small English typography. No surrounding website, padding, shadow, perspective or external frame.
Translate exact visible UI:
Sidebar Overview / Visits / Settings; footer Data stays on this device. Top bar Overview. Status Recording browsing activity; Since Oct17; Pause recording.
Main title Browsing overview; date Oct18 — Oct24; date control Last7days.
KPIs Active time:23hr18min; vs previous period +8%. Visits:426; vs previous period +6%. Sites:28; vs previous period +3.
Tabs Daily trend (blue active underline), Today's timeline.
Y axis6hr,4hr,2hr,0. Seven x labels respectively Oct18 / Sun /2hr15min; Oct19 / Mon /3hr05min; Oct20 / Tue /4hr10min; Oct21 / Wed /3hr25min; Oct22 / Thu /2hr40min; Oct23 / Fri /3hr11min; Oct24 / Sat /4hr32min. This historical example is Oct18–24 2026; don't substitute current date.
Left list heading Active time ranking; right Visit count ranking. Right segmented control Visits / Active time.
Left ranking rows github.com7hr12min102visits; youtube.com4hr08min41visits; figma.com3hr26min55visits; notion.so2hr18min38visits; developer.mozilla.org1hr42min29visits.
Right ranking github.com102visits7hr12min; google.com68visits54min; figma.com55visits3hr26min; youtube.com41visits4hr08min; notion.so38visits2hr18min.
Collapsed footer row Active periods.
Preserve PageTime name, selected blue page-and-clock logo, all domain names, brand favicons, pale relative row bars and exact example numeric values. All visible Chinese must be gone, including tiny suffixes of durations/visit counts and footer. Fit English naturally without clipping, slight font reduction in tiny row secondary text allowed. One complete coherent English screenshot ONLY.
