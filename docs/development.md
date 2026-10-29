# 开发指南

以下路径相对仓库根目录。

## 组件基础

使用 shadcn `base-nova` 样式与 `@base-ui/react`，插件和预览共用 Tailwind CSS 4 主题。Button、Sidebar、Dialog、AlertDialog、InputGroup、Table、Alert、Empty、Avatar、ScrollArea 等均来自 shadcn 官方组件。

时间范围使用 DropdownMenu + RadioGroup，当前不使用 Select 或原生 select。优先复用 `src/components/ui`，已有组件不另写交互实现；`src/styles.css` 仅保留产品布局、排版与图表样式。ECharts 继续负责统计图和今日时间线。

界面文案使用 i18next + react-i18next，插件资源位于 `src/locales/<语言>.json`，官网资源位于 `website/locales/<语言>.json`，日期、时间和时长由各自的 `i18n.js` 按当前语言输出；manifest 文案位于 `public/_locales`。新增文案需补齐所有语言及其所需的复数形式，`npm test` 会校验键、插值和复数形式是否齐全。新增语言时添加 `src/locales/<代码>.json`、在 `src/i18n.js` 注册，并补充 `public/_locales/<代码>/messages.json`。官网语言独立维护，在 `website/locales/` 添加资源并在 `website/i18n.js` 注册。

`components.json` 已配置，新增组件用 `npx shadcn@latest add <组件名>`。源码使用 `@app/*` 指向 `src/*`，避开 WXT 内置的 `@/*` 根目录别名。CLI 生成的 `cn` 合并工具保持官方依赖。

参考：[shadcn Base UI](https://ui.shadcn.com/docs/components/base/dropdown-menu)、[Vite 安装](https://ui.shadcn.com/docs/installation/vite)。

## 开发

Node.js 22.12+，npm：

```powershell
npm ci
npm run dev:extension  # WXT 开发模式，随后手动加载 .output/chrome-mv3
npm run typecheck
npm run build          # .output/chrome-mv3
npm run verify-build   # 校验实际扩展产物、权限、版本、图标和语言资源
npm run zip            # .output/pagetime-<version>-chrome.zip
npm run verify:zip     # 校验当前版本 ZIP 内的实际文件
```

本地界面预览与真实扩展使用同一套 React 组件。预览不采集浏览活动，打开时也没有预置浏览记录：

官网源码、样式、图片及独立十语言资源位于根目录 `website/`，`home.html` 仅作为公开入口；仪表盘预览仍在 `/`。官网使用自己的 i18n 实例和 `pagetime-website-language` 偏好，不加载插件语言资源。官网包含功能介绍、产品示意图、GitHub ZIP 安装说明与常见问题，支持相同的十种语言；含文字的产品图提供中英双版，中文界面显示中文版，其余语言显示英文版。示意图不写入浏览账本。`npm run build:preview` 同时构建这两个入口，官网图片不进入扩展安装包。

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
npm run build:preview
npm test
```

`npm test` 包含预览构建产物检查，需先运行 `npm run build:preview`。WXT 和预览各自独立打包；已有 Sites 运行脚本保留，但未发布到 Sites。

线上官网：[PageTime](https://pagetime.yukiniro.workers.dev/home.html)；[空账本预览](https://pagetime.yukiniro.workers.dev/)。

Cloudflare Workers 发布使用 `wrangler.jsonc` 和现有静态资源 Worker。先用 `npx wrangler login` 登录目标账号，再运行 `npm run deploy:cloudflare`，会重新构建并发布 `dist/client`。官网路径为 `/home.html`，根路径保留空账本预览；仅上传构建产物，不上传源码或本地记录。配置说明见 [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)。

图标来源：Phosphor Icons（MIT）、Simple Icons（CC0）。文档参考：[WXT 入口](https://wxt.dev/guide/essentials/entrypoints.html)、[Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)、[Chrome idle](https://developer.chrome.com/docs/extensions/reference/api/idle)。

## 版本发布

用户可见变更附带 Changesets 记录。维护者手动运行 GitHub Actions 的 Release 创建版本 PR；核对版本号、CHANGELOG 和 CI 后合并，自动完成检查、打包和 GitHub ZIP Release。每个 Release 同时上传 `SHA256SUMS`。发布先上传草稿附件再公开，支持失败重跑，拒绝冲突标签、不同内容的已有 ZIP，以及与已发布 ZIP 不一致的校验和。完整流程与仓库设置见 [版本发布说明](releasing.md)。本流程不提交浏览器商店。

把 ZIP 和 `SHA256SUMS` 放在同一目录后核对。文件是一行小写 SHA-256、两个空格和 ZIP 文件名：

```text
sha256sum -c SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

```powershell
(Get-Content .\SHA256SUMS -Raw).Split(' ')[0] -eq (Get-FileHash .\pagetime-<version>-chrome.zip -Algorithm SHA256).Hash
```

`Get-FileHash` 输出大写十六进制，和文件里的小写比较时 PowerShell 的 `-eq` 不区分大小写。把示例里的文件名换成该版本的 ZIP。

读取本地记录时会校验结构、域名和时间字段。格式异常会显示当前语言的错误提示，原始数据保留；重试不会覆盖或重置异常记录。

