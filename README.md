# PageTime · 浏览足迹

基于 WXT + React + TypeScript + ECharts 的 Chrome / Edge Manifest V3 扩展。采用用户选定的浅色统计界面，加入今日活跃浏览时间线。

## 安装

1. 将交付的 `pagetime-1.0.0-chrome.zip` 解压到一个固定文件夹，确认文件夹内直接包含 `manifest.json`。
2. Chrome 打开 `chrome://extensions`，或 Edge 打开 `edge://extensions`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”，选择解压文件夹。
4. 点击工具栏的PageTime扩展按钮，打开统计页面。插件安装后开始采集，不读取安装前的浏览历史。

在本地运行 `npm run build` 后，也可以加载源码中的 `.output/chrome-mv3` 文件夹。扩展不会自动安装到你的浏览器。已有安装请覆盖原来的解压文件夹，再点击浏览器扩展页中的“重新加载”，保留扩展 ID 与本地记录；不要为改名更换安装文件夹。

## 功能与口径

- 按今天、最近 7 天、最近 30 天查看活跃时长、访问次数、站点排行和每日趋势。
- 今日时间线独立于上方统计范围：显示当前本地日内的活跃时段，悬停查看站点、起止时间与时长；点击图例或排行可查看站点详情。
- 访问记录支持域名搜索，详情可跳转到该站点的访问记录。较多记录时显示最近 200 条。
- 会计入：有焦点的普通窗口里，当前标签页上的 http/https 网页，按域名累计。同一标签跳到其他站点时，从跳转时刻起计入新站点。
- 不计入：连续达到空闲判定时间仍没有键鼠操作时停止计入。默认 60 秒，可在设置里改为 2、5 或 10 分钟；判定前的那段仍计入。默认在前台窗口的当前标签播放未静音声音时，空闲也继续计入；关掉该开关、静音或声音停止后即停。锁屏、休眠、浏览器关闭、窗口最小化、切到其他应用、聚焦开发者工具、浏览器内部页面、扩展页面、本地文件、无痕窗口，以及暂停记录期间不计入。后台标签页不计时长。设置里忽略的站点也不计入，行为和切到浏览器内部页面相同：条目 `example.com` 匹配该域名和所有子域名，条目 `mail.example.com` 不匹配 `example.com`。正在看这个站点时加入忽略会立刻停表；已有记录不删除、不隐藏。
- 访问次数：页面加载与刷新各记一次（包括后台标签页中的导航）；切换标签页不重复计数。单页应用内部路由跳转不增加访问次数。
- 每 30 秒设置持久检查点，并在标签切换、窗口焦点变化、空闲变化及查看面板时保存。意外关闭时最多丢失最近 30 秒。Manifest V3 服务工作线程重启时从账本里的检查点恢复；浏览器重启或扩展重新加载后检查点失效。
- 两次检查点间隔超过 90 秒时，这段最多计入 90 秒，避免闹钟推迟把整段活跃时间丢掉，也避免长时间休眠或挂起造成虚增。这是近似的活跃时长统计，短暂休眠和异常退出可能造成几十秒偏差。
- 只保存域名、时间和访问次数，不保存标题、正文或完整网址。数据只在本机扩展自己的 IndexedDB（`pagetime-ledger`），不上传。访问记录和活跃时段明细保留最近 31 天；每日和每小时汇总长期保留，直到手动清空。早于 IndexedDB 账本的版本存在 `chrome.storage.local` 的 `data` 键里，新版不读取也不删除它，新账本从空开始。
- 概览页「总活跃浏览时间」旁的说明按钮，以及设置页「统计方式」中的「了解计时规则」，打开同一份说明。说明里的秒数和天数来自 `timingCopy(settings)`：空闲秒数跟随当前设置，其余来自 `src/model.mjs` 的常量。
- 支持暂停 / 恢复，以及二次确认清空本地数据。清空和卸载后无法恢复；当前版本不含备份、同步和导入导出。
- 界面支持简体中文、繁體中文、English、日本語、한국어、Deutsch、Español、Français、Português (Brasil)、Русский：首次打开按浏览器语言选择（香港、澳门及 zh-Hant 使用繁體中文，无匹配时使用英文），可在“设置 → 语言”中切换，选择保存在本地。扩展名称说明与工具栏提示通过 `_locales` 随浏览器语言显示。

## 隐私与权限

仅保存域名、访问时间和活跃时段，不保存网址路径、查询参数、标题、页面正文、Cookie 或输入内容。扩展无远程请求、账号、数据上传或外部字体。图标随安装包本地分发。保存字段、存放位置、`DETAIL_DAYS` 和删除方式见 [隐私说明（中文）](PRIVACY.zh-CN.md) 与 [Privacy](PRIVACY.md)。

| 权限 | 用途 |
| --- | --- |
| `tabs` | 读取前台标签页域名，并排除无痕页 |
| `webNavigation` | 统计主框架页面加载与刷新 |
| `idle` | 检测系统空闲或锁定 |
| `alarms` | 定期保存活跃时段 |
| `storage` | 在本地保存计时设置和写入失败标记，session 保存检查点所属的会话编号。账本在 IndexedDB，不需要额外权限 |

不申请 `history`、网页正文访问或 content script 权限，也没有 host permission。`tabs` 和 `webNavigation` 会让 Chrome / Edge 在安装时显示 “Read your browsing history”；`storage`、`idle`、`alarms` 不触发安装警告。每一项能做什么、不能做什么见 [权限说明（中文）](docs/permissions.zh-CN.md) 与 [Permissions](docs/permissions.md)。

## 组件基础

使用 shadcn `base-nova` 样式与 `@base-ui/react`，插件和预览共用 Tailwind CSS 4 主题。Button、Sidebar、Dialog、AlertDialog、InputGroup、Table、Alert、Empty、Avatar、ScrollArea 等均来自 shadcn 官方组件。

时间范围使用 DropdownMenu + RadioGroup，当前不使用 Select 或原生 select。优先复用 `src/components/ui`，已有组件不另写交互实现；`src/styles.css` 仅保留产品布局、排版与图表样式。ECharts 继续负责统计图和今日时间线。

界面文案使用 i18next + react-i18next，资源位于 `src/locales/<语言>.json`，日期、时间和时长格式在 `src/i18n.js` 中按当前语言输出；manifest 文案位于 `public/_locales`。新增文案需补齐所有语言及其所需的复数形式，`npm test` 会校验键、插值和复数形式是否齐全。新增语言时添加 `src/locales/<代码>.json`、在 `src/i18n.js` 注册，并补充 `public/_locales/<代码>/messages.json`。

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
npm run zip            # .output/pagetime-1.0.0-chrome.zip
npm run verify:zip     # 校验当前版本 ZIP 内的实际文件
```

本地界面预览与真实扩展使用同一套 React 组件。预览不采集浏览活动，打开时也没有预置浏览记录：

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
npm run build:preview
npm test
```

`npm test` 包含预览构建产物检查，需先运行 `npm run build:preview`。WXT 和预览各自独立打包；已有 Sites 运行脚本保留，但未发布到 Sites。

图标来源：Phosphor Icons（MIT）、Simple Icons（CC0）。文档参考：[WXT 入口](https://wxt.dev/guide/essentials/entrypoints.html)、[Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)、[Chrome idle](https://developer.chrome.com/docs/extensions/reference/api/idle)。

## 版本发布

用户可见变更附带 Changesets 记录。维护者手动运行 GitHub Actions 的 Release 创建版本 PR；核对版本号、CHANGELOG 和 CI 后合并，自动完成检查、打包和 GitHub ZIP Release。每个 Release 同时上传 `SHA256SUMS`。发布先上传草稿附件再公开，支持失败重跑，拒绝冲突标签、不同内容的已有 ZIP，以及与已发布 ZIP 不一致的校验和。完整流程与仓库设置见 [版本发布说明](docs/releasing.md)。本流程不提交浏览器商店。

把 ZIP 和 `SHA256SUMS` 放在同一目录后核对。文件是一行小写 SHA-256、两个空格和 ZIP 文件名：

```text
sha256sum -c SHA256SUMS
shasum -a 256 -c SHA256SUMS
```

```powershell
(Get-Content .\SHA256SUMS -Raw).Split(' ')[0] -eq (Get-FileHash .\pagetime-1.0.0-chrome.zip -Algorithm SHA256).Hash
```

`Get-FileHash` 输出大写十六进制，和文件里的小写比较时 PowerShell 的 `-eq` 不区分大小写。把示例里的文件名换成该版本的 ZIP。

读取本地记录时会校验结构、域名和时间字段。格式异常会显示当前语言的错误提示，原始数据保留；重试不会覆盖或重置异常记录。

## 验证状态

自动检查覆盖域名过滤、跨午夜统计、连续时段合并与空闲间隔、保留上限、挂起保护、后台焦点 / 空闲 / 暂停 / 恢复 / 清空、无痕过滤和预览本地存储。

本地浏览器验证了 DropdownMenu 鼠标选择和方向键 / Enter 操作、Dialog 的 Escape 关闭和焦点恢复、详情跳转、搜索与无结果状态、AlertDialog 取消及焦点恢复、暂停与恢复，以及桌面和窄屏布局。清空数据操作通过后台与预览存储自动测试验证，浏览器交互只验证确认与取消，不删除现有数据。设计对比见 `design-qa.md`。

**尚未完成真实 Chrome / Edge 安装后的端到端采集与长期休眠测试。** Chrome 验证通道连接失败，内置浏览器用于界面验证；后台采集通过模拟浏览器 API 的实现测试。交付安装包可用于本地试用，不代表已通过商店审核。

## 许可证

Copyright 2026 Yukiniro。本项目以 Apache License 2.0 授权。`LICENSE` 是 Apache 许可证 2.0 的原文，版权声明在 `NOTICE`。`package.json` 的 `license` 为 `Apache-2.0`。
