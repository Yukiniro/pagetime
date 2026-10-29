# PageTime agent guide

PageTime 是本地浏览账本，交付 WXT Chrome / Edge 扩展和共享 React 组件的空账本预览。使用 npm，保留现有 CI。

## 项目边界

- 品牌源文件为 `assets/branding/pagetime-logo.png`，用 `npm run icons` 生成尺寸；品牌变更不改存储键或记录格式。
- 原始 hostname 保存在账本；站点合并只发生在查询视图。预览不采集活动、不预置演示记录。
- 不维护向后兼容性；移除废弃路径，不增加兼容层、回退方案或迁移逻辑。
- 导出在页面本地生成，不联网、不新增 downloads 权限；恢复须先校验再确认，失败不写入，预览禁用恢复。

## 目录与实现约定

- 扩展 UI 在 `src/`；网站代码、图片和资源在 `website/`，`home.html` 是薄入口，`/` 保留空账本预览。
- 扩展与预览共享组件和主题；网站语言实例与偏好独立。
- 用户文案分别放在 `src/locales/`、`website/locales/`，补齐各自十语言的键、插值和复数；日期、时间、时长使用各自 `i18n.js`。manifest 文案在 `public/_locales/`。
- 优先复用现有依赖和官方 shadcn Base UI 基础组件；选择菜单用 DropdownMenu，不用 Select 或原生 select。
- 前端组件文件名用 kebab-case，组件标识符用 PascalCase。

## 按任务查阅

- 修改界面、日期、图表、popup、导出或恢复：先读 [产品约束](docs/product-contract.md) 及对应 [feature](.cursor/skills/verify-pagetime/features/README.md)。持久设计决策更新产品约束；选定设计图是视觉实现依据。
- 修改计时、分组、留存或比较：[英文规则](docs/timing.md) 与 [中文规则](docs/timing.zh-CN.md) 同步；隐私及权限变更同步根目录 PRIVACY 文档和 `docs/permissions*.md`。
- 修改发布、产物校验或恢复流程：先读 [发布说明](docs/releasing.md)。维护者手动创建版本 PR，合并后发布 GitHub ZIP；商店发布独立处理。
- 评估扩展基础设施：使用 browser-extension-best-practices，以本项目数据契约、十语言及共享预览为准。
- Issue 与规格：[issue tracker](docs/agents/issue-tracker.md)；分诊：[标签](docs/agents/triage-labels.md)；领域建模：[领域文档约定](docs/agents/domain.md)。
- 开发环境和组件说明：[开发指南](docs/development.md)。

## 验证与交付

- `npm run typecheck`；`npm run build:preview` 后再 `npm test`；扩展产物用 `npm run build` 后 `npm run verify-build`。
- 行为变更按 [verify-pagetime](.cursor/skills/verify-pagetime/SKILL.md) 先跑 Doctor，再跑对应 feature，保留证据；新增功能补 feature 并登记索引。视觉任务自行启动预览并打开浏览器检查。
- Linux E2E 前安装完整依赖：`sudo apt-get install -y xvfb openbox xdotool x11-utils`，再用 `xvfb-run -a npm run test:e2e`。不要把 apt 命令用于 macOS。
- Sites 手递保留 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs`；执行 `npm run build`、`npm run build:preview`、`npm run test:sites`，确认 `dist/client/index.html`、`dist/server/index.js`、`dist/.openai/hosting.json`。
- 普通 PR 必须带 changeset；用户变更用 patch/minor，纯文档、工程或免发布用 `npm run changeset -- --empty`。`changeset-release/main` 版本 PR 例外。
- 提交前按 [REVIEW.md](REVIEW.md) 自查，重复评审意见只追加到该文件。PR 只放通过数和日志尾部，不贴完整输出。
- 纯文档变更检查链接、事实和相关文档测试，无需 feature 检查；行为变更在 PR 附对应证据。
