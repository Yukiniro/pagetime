# Prototype Instructions

Product name: PageTime. Preserve existing storage keys and record formats when changing branding.

The UI is localized with react-i18next in Simplified Chinese, Traditional Chinese, English, Japanese, Korean, German, Spanish, French, Brazilian Portuguese, and Russian. Never hardcode user-facing text: add every string to every file in `src/locales/` (with all plural forms the language needs), format dates/times/durations through `src/i18n.js`, and keep manifest text in `public/_locales`. `npm test` enforces key, placeholder, and plural parity.

Use the official shadcn Base UI components for available primitives. Prefer DropdownMenu for dropdown choices; avoid Select and native select. Keep the WXT extension and local preview on the same component and theme foundation.

The user selected the light blue analytics design. Theme defaults to system (`prefers-color-scheme`), with light and dark overrides stored in the existing settings record. The overview is a one-page ledger. The top-bar range is today, the last 7 days, the last 30 days, or a custom closed local-day interval; the default is today. Last 7 and last 30 include today and split on local midnights. A custom range whose end day is before its start day cannot be applied: the previous range stays, and the panel explains why. The KPI bar's largest figure is active time for the selected range, plus visit count and site count, with no productivity score; while the range is today those figures are today's. One primary chart is visible at a time. Today opens on today's timeline, and the other tab stays the last 7 days. A multi-day range opens on that range's daily trend, and the timeline tab remains today. A site filter key stays put and is recomputed for the new range. Site rankings sit in two columns with a light relative bar. The activity heatmap stays collapsed until it is opened, then uses the selected range. Settings, the ignore list, merge, and clear stay in settings. Settings also has a read-only local data overview read live from the IndexedDB ledger: `since`, the earliest day total, the detail retention boundary from `detailCutoff` (the same cutoff as `pruneDetail`), site and per-table row counts, the `navigator.storage.estimate()` figure (hidden when unavailable), and the old `data` key's size only while it exists. It has no delete or cleanup control, and the preview, which has no IndexedDB ledger, does not show it. The toolbar badge defaults to on and shows today's total active browsing time only; the current site's time for today is only in the toolbar hover title. Range selection is not stored.

Site grouping defaults to `prefix` (strip a leading `www.` / `m.` / `mobile.`). The other settings are `none` and `registrable`. Grouping is a query view: Dexie keeps the raw hostname, and switching modes must not rewrite stored rows. Registrable mode uses offline `tldts` with ICANN suffixes only (`allowPrivateDomains: false`), so a private suffix such as `github.io` groups under the ICANN name. Deliver a real WXT Chrome/Edge extension as well as a local preview using the same React components. The preview starts empty: do not seed sample browsing records, and do not add demo-mode labels or a control that restores sample data. `npm run build` builds WXT; `npm run build:preview` builds the Sites-ready preview. Keep the starter's preview runtime intact.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 贡献与 PR（Agent / 维护者）

- **Changeset**：每个 PR 都必须带 changeset。用户可见变更按 patch / minor 选型；纯文档、工程类或免发布改动用空 changeset：`npx changeset --empty`。发版流程见 `docs/releasing.md`；下方「Release policy」不再重复选型细则。
- **测试顺序**：跑 `npm test` 前先 `npm run build:preview`（与 CI 一致）。
- **PR 正文**：只贴验证的通过数与日志尾部几行，不要贴完整输出（GitHub 正文上限约 32K 字符）。
- **常用验证命令**：
  - `npm run typecheck`
  - `npm run build:preview && npm test`
  - `npm run build`
  - `npm run verify-build`
  - `xvfb-run -a npm run test:e2e`

## 工程设计原则

- 不要维护向后兼容性。应移除废弃路径，而不是增加兼容层、回退方案或迁移逻辑。
- 选择能够完全满足当前需求的最简单实现。避免臆测性的抽象、配置和间接层。
- 分层构建系统。从能够端到端运行的最小版本开始，在已有可用产品的基础上逐步增加新能力。不要为了尚未完成的复杂性牺牲一个正常工作的产品。
- 保持组件模块化，并明确分离各项关注点。
- 当成熟且维护良好的库能够降低整体复杂度或提高可靠性时，应优先使用它们。没有明确理由时，不要重新实现常见功能。
- 在自行实现或新增软件包之前，优先利用项目中已有的依赖。没有检查库的文档和类型定义之前，不要假设它不具备某项能力。
- 从长期角度做架构决策。不要接受只解决眼前问题、以后还计划替换的临时方案。
- 尽可能使用已有的组件库组件，尽量不要自定义实现基础组件。

## Agent skills

### Release policy

Changeset 与 PR 要求见上文「贡献与 PR」。修改版本发布、产物校验或恢复流程时，先读 `docs/releasing.md`。使用 npm，保留现有 CI；发版由维护者手动创建版本 PR，合并后发布 GitHub ZIP。

### 浏览器插件

评估扩展基础设施或发布能力时，使用 browser-extension-best-practices，并以本仓库的数据契约、十语言资源及共享预览为准。

### Issue tracker

Issues and specs live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
