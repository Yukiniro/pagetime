# PageTime feature map

Drive one file per journey. Selectors assume English (`pagetime-language` = `en`). Launch and cleanup are in `../SKILL.md`.

| Feature | File | Surface |
| --- | --- | --- |
| 官网首页与安装说明 | [website-homepage.md](website-homepage.md) | Preview at `/home.html`. Marketing illustrations are separate from the empty dashboard at `/`. |
| 官网内容、FAQ 与中英产品图 | [website-content.md](website-content.md) | Preview at `/home.html`. Ten page locales and Chinese/English text-bearing artwork. |
| PageTime 品牌图标 | [brand-mark.md](brand-mark.md) | Preview and extension. Empty ledger is sufficient. |
| 一页账本概览与日期范围 | [overview-range.md](overview-range.md) | Preview or extension. KPI, chart, and heatmap need a non-empty ledger. |
| 自定义日期不能早于记录开始日 | [custom-range-since.md](custom-range-since.md) | Preview or extension. An empty ledger's `since` is today. |
| 日期范围前后翻页与单日时间线 | [range-shift.md](range-shift.md) | Preview or extension. Chart steps need a non-empty ledger. |
| 单日时间线文案跟着所选那一天 | [timeline-day-copy.md](timeline-day-copy.md) | Preview or extension. Chart steps need a non-empty ledger. |
| 站点详情抽屉与点选过滤 | [site-detail.md](site-detail.md) | Extension after a real visit. An empty preview has no rank row. A single day shows that day's sessions and its 7-day trend. A multi-day range leaves the session list out. |
| 站点过滤时活跃时段跟着过滤 | [heatmap-site-filter.md](heatmap-site-filter.md) | Preview or extension with hour rows. An empty preview has no rank row. |
| 时间线色块打开站点详情 | [timeline-click.md](timeline-click.md) | Preview or extension with a single-day segment timeline. Keyboard uses each segment button. An empty ledger has no blocks. |
| 点趋势柱跳到那一天 | [trend-day-click.md](trend-day-click.md) | Preview or extension with a multi-day trend. An empty ledger has no bars. |
| 详情抽屉按日趋势点柱跳到那一天 | [detail-trend-day-click.md](detail-trend-day-click.md) | Preview or extension with a site detail drawer. An empty ledger has no rank row. |
| 单日详情点时段柱过滤活跃时段 | [detail-hour-filter.md](detail-hour-filter.md) | Preview or extension with a single-day site detail drawer. An empty ledger has no rank row. An empty hour is the full column and a keyboard button. Multi-day and past-retention days leave the hour chart unclickable. |
| 设置页记录范围（黑名单 / 白名单） | [recording-scope.md](recording-scope.md) | Preview (`pagetime-preview-settings`) or extension settings message. |
| 设置页名单过滤 | [list-filter.md](list-filter.md) | Preview (`pagetime-preview-settings`) or extension settings message. Pure frontend filter on the current mode's list. |
| 设置页底部文档链接 | [settings-docs.md](settings-docs.md) | Preview or extension. Links open repository docs; no request is made by the page. |
| 导出 JSON / CSV | [export.md](export.md) | Preview or extension. The file is a blob download in the page. A short summary sits beside the saved-file status. |
| 从备份恢复 | [restore.md](restore.md) | Extension. Preview disables the control and does not write preview storage. |
| 恢复前预览备份摘要 | [restore-summary.md](restore-summary.md) | Extension. A file is checked before the confirm; only a valid backup opens it, with a read-only summary. |
| 工具栏 popup | [toolbar-popup.md](toolbar-popup.md) | Extension. The toolbar icon opens `popup.html`. |
| popup 父规则覆盖 | [popup-parent-rule.md](popup-parent-rule.md) | Extension. A parent list entry covers the current host. |
| popup 站点名打开详情 | [popup-site-detail.md](popup-site-detail.md) | Extension. The popup site name opens today's detail drawer. |
| popup 站点名单状态 | [popup-list-status.md](popup-list-status.md) | Extension. The popup status line names a blacklist or whitelist exclusion for the current site. |
| popup 当前站点图标 | [popup-site-icon.md](popup-site-icon.md) | Extension. A current site shows `SiteIcon` beside the name. No site shows no icon. |
| popup 今日前几名 | [popup-top-sites.md](popup-top-sites.md) | Extension. Up to five of today's top sites under the total, in dashboard order; a row opens that site's detail. No data renders no list. |
| 站点图标 | [site-favicon.md](site-favicon.md) | Preview shows packaged SVG or the globe and never calls `_favicon`. Extension rankings use the browser favicon cache after a real https visit. |
| 访问记录空状态：无匹配与明细已过期 | [visit-expired-empty.md](visit-expired-empty.md) | Extension with day totals older than 31 days. `tests/e2e/visit-expired.spec.mjs` seeds them. |
