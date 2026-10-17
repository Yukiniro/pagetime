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
- 页面加载与刷新各记一次访问（包括后台标签页中的导航）；切换标签页不重复计数。单页应用内部路由跳转不增加访问次数。
- 时长只归于有焦点的普通浏览器窗口中的当前标签页。60 秒没有系统操作后，浏览器报告空闲时停止计时；前 60 秒属于检测宽限期。后台网页、无痕窗口、扩展页面和浏览器内部页面不累计时长。
- 每 30 秒设置持久检查点，并在标签切换、窗口焦点变化、空闲变化及查看面板时保存。Manifest V3 服务工作线程重启时从 session 检查点恢复。
- 两次检查点间隔超过 90 秒时，最多计入 90 秒，避免闹钟推迟把整段活跃时间丢掉，也避免长时间休眠或挂起造成虚增。这是近似的活跃时长统计，短暂休眠和异常退出可能造成几十秒偏差，异常退出可能丢失最后一个检查点后的数据。
- 最多保留 90 天；访问记录和活跃时段各最多 20,000 条，达到数量上限时删除最旧记录。时长与访问次数分别来自保留下来的各自记录，不保证二者都覆盖完整 90 天。
- 支持暂停 / 恢复，以及二次确认清空本地数据。清空和卸载后无法恢复；当前版本不含备份、同步和导入导出。
- 界面支持简体中文、繁體中文、English、日本語、한국어、Deutsch、Español、Français、Português (Brasil)、Русский：首次打开按浏览器语言选择（香港、澳门及 zh-Hant 使用繁體中文，无匹配时使用英文），可在“设置 → 语言”中切换，选择保存在本地。扩展名称说明与工具栏提示通过 `_locales` 随浏览器语言显示。

## 隐私与权限

仅保存域名、访问时间和活跃时段，不保存网址路径、查询参数、标题、页面正文、Cookie 或输入内容。扩展无远程请求、账号、数据上传或外部字体。图标随安装包本地分发。

| 权限 | 用途 |
| --- | --- |
| `tabs` | 读取前台标签页域名，并排除无痕页 |
| `webNavigation` | 统计主框架页面加载与刷新 |
| `idle` | 检测系统空闲或锁定 |
| `alarms` | 定期保存活跃时段 |
| `storage` | 在本地保存记录，session 保存工作线程检查点 |

不申请 `history`、网页正文访问或 content script 权限。浏览器安装时可能显示浏览活动相关权限提示，这是本地统计需要。

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
npm run zip            # .output/pagetime-1.0.0-chrome.zip
```

本地界面预览与真实扩展使用同一套 React 组件。预览不采集浏览活动，打开时也没有预置浏览记录：

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
npm run build:preview
npm test
```

`npm test` 包含预览构建产物检查，需先运行 `npm run build:preview`。WXT 和预览各自独立打包；已有 Sites 运行脚本保留，但未发布到 Sites。

图标来源：Phosphor Icons（MIT）、Simple Icons（CC0）。文档参考：[WXT 入口](https://wxt.dev/guide/essentials/entrypoints.html)、[Chrome webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)、[Chrome idle](https://developer.chrome.com/docs/extensions/reference/api/idle)。

## 验证状态

自动检查覆盖域名过滤、跨午夜统计、连续时段合并与空闲间隔、保留上限、挂起保护、后台焦点 / 空闲 / 暂停 / 恢复 / 清空、无痕过滤和预览本地存储。

本地浏览器验证了 DropdownMenu 鼠标选择和方向键 / Enter 操作、Dialog 的 Escape 关闭和焦点恢复、详情跳转、搜索与无结果状态、AlertDialog 取消及焦点恢复、暂停与恢复，以及桌面和窄屏布局。清空数据操作通过后台与预览存储自动测试验证，浏览器交互只验证确认与取消，不删除现有数据。设计对比见 `design-qa.md`。

**尚未完成真实 Chrome / Edge 安装后的端到端采集与长期休眠测试。** Chrome 验证通道连接失败，内置浏览器用于界面验证；后台采集通过模拟浏览器 API 的实现测试。交付安装包可用于本地试用，不代表已通过商店审核。
