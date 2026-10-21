# PageTime 隐私说明

PageTime 是装在本机 Chrome 或 Edge 里的浏览账本。下面每条都对应仓库里的实现：`entrypoints/background.ts` 决定记录什么，`src/ledger.mjs` 定义并写入账本，`src/model.mjs` 规定保留期限，`src/settings.mjs` 规定计时偏好，`wxt.config.ts` 规定权限。英文版见 [PRIVACY.md](PRIVACY.md)。

## 保存什么

长期账本是扩展自己源下的 IndexedDB 数据库 `pagetime-ledger`。IndexedDB 不需要清单权限。库里只有这些表：

| 表 | 内容 |
| --- | --- |
| `domains` | `{ id, host }`。`host` 是主机名，其他表用 `id` 引用它 |
| `days` | `{ date, domainId, ms, visits }`。某个网站在某个本地日期（`YYYY-MM-DD`）的活跃毫秒数和访问次数 |
| `hours` | `{ date, hour, domainId, ms }`。某个网站在某个本地整点小时内的活跃毫秒数 |
| `spans` | `{ id, domainId, start, end }`。一段前台活跃时间的起止（毫秒），不会跨过本地零点 |
| `visits` | `{ id, domainId, at }`。`at` 是主框架完成导航的时间（毫秒） |
| `meta` | `state`：`{ enabled, since }`，是否正在记录、这份账本建立或上次清空的时间。`cursor`：下面说明的工作线程检查点 |

每次计时事件都在同一个 IndexedDB 事务里更新 `days`、`hours`、`spans`、`visits` 和 `cursor`，要么全部写入，要么一条也不写。统计页直接读取同一个数据库，数据变化时自动刷新。`domain` 只接受主机名：`src/model.mjs` 的 `domainOf` 只从 `http:` / `https:` 网址取出 `hostname`，路径、查询、片段、端口和账号都丢掉。

改用 IndexedDB 之前的版本把记录放在 `chrome.storage.local` 的 `data` 键。这一版不读、不写、也不删除这个键，旧版本存下的记录原样留在那里，但不会显示。新账本从空开始。

账本写入失败时，后台在 `chrome.storage.local` 写入 `ledgerError`：`{ at, name }`，即失败时间和错误名。它存在期间统计页显示保存错误，下一次写入成功后删除。清理旧明细失败只记日志，不会写入它。

除了账本和 `settings`，扩展只另存两个小键：`chrome.storage.session` 的 `session` 只保存一个随机会话编号，`chrome.storage.local` 的 `ledgerError` 只保存失败时间和错误名。两者都不含域名、网址或任何其他浏览数据。

计时偏好是 `chrome.storage.local` 里单独的 `settings` 键，不属于账本：

| 字段 | 内容 |
| --- | --- |
| `schema` | `1` |
| `idleSeconds` | `60`、`120`、`300` 或 `600`。连续多少秒没有键盘或鼠标操作后，把浏览器视为空闲 |
| `countAudible` | 为 true 时，前台窗口的当前标签正在播放且未静音，空闲也继续计入。默认是 true |
| `badge` | 为 true 时，工具栏图标显示今天的活跃浏览时长。默认开启 |
| `recordMode` | `blacklist` 或 `whitelist`。默认是 `blacklist`。黑名单记录除 `ignored` 以外的主机；白名单只记录 `allowed` 里的主机。`allowed` 为空时不记录任何站点。切换模式不会清空另一份列表，也不会删除或隐藏账本里的行 |
| `ignored` | 最多 500 条用户输入的域名，每条最长 253 个字符。只存在这个 `settings` 键里。一条记录匹配该域名及其子域名。只在 `recordMode` 为 `blacklist` 时生效。添加或移除不会删除或隐藏账本里已有的行 |
| `allowed` | 最多 500 条域名，长度和匹配规则与 `ignored` 相同。只在 `recordMode` 为 `whitelist` 时生效。添加或移除不会删除或隐藏账本里已有的行 |

`src/settings.mjs` 的 `validateSettings` 会把非法的 `schema`、`idleSeconds`、`countAudible` 或 `recordMode` 换成默认值。没有 `ignored` 或 `allowed` 时按空列表处理。非法条目会被丢掉，重复项会去掉，每份列表在 500 条处截断。它不抛错，也不改账本。没有 `settings` 时，后台使用 `{ schema: 1, idleSeconds: 60, countAudible: true, siteMerge: 'prefix', recordMode: 'blacklist', ignored: [], allowed: [], badge: true }`。`idleSeconds`、`countAudible`、`badge` 和 `recordMode` 不是浏览历史。界面语言存在 `chrome.storage.local` 的 `language` 键，供工具栏标题使用。`ignored` 和 `allowed` 是用户输入的域名。后台还会读取 `tab.audible` 和 `tab.mutedInfo` 来执行 `countAudible`。这两个标志不写入账本或 `settings`。

不保存标题、完整网址、页面正文、Cookie、表单输入，也不读取页面 DOM。扩展没有 content script，也不使用 `chrome.scripting`。

服务工作线程重启用的检查点是 `meta` 里的 `cursor` 行：`{ tabId, domain, since, session }`。`tabId` 是浏览器给标签的编号。`session` 是后台放在 `chrome.storage.session` 的 `session` 键里的随机编号；`session` 对不上的检查点会被忽略，所以和以前一样，浏览器会话结束或扩展重新加载后检查点就失效。没有正在记录的页面时会删掉它；清空、暂停或恢复时也会删掉。删除游标上的那个站点，或删除今天的记录时，同一个事务里保留游标，并把 `since` 改成删除时刻。这一刻之前的未写入时长，下一次检查点不会补记。它不是浏览历史。

为了得到主机名，后台会从 `tabs` 和 `webNavigation` 事件里读到网址。读到的网址只用来算出 `hostname`，不写入账本。

## 存在哪里

只在这台设备上：

- 扩展使用 IndexedDB、`chrome.storage.local` 和 `chrome.storage.session`。代码没有调用 `chrome.storage.sync`。IndexedDB 通过 Dexie 访问，不包含 Dexie Cloud 或任何同步插件。
- 没有账号、登录或身份权限。
- 后台和统计页源码没有网络请求。清单不申请 host permission，扩展不能靠权限去读网页或把账本送到别的主机。
- 本地预览（`npm run dev`）不是已安装的扩展。它把 `{ visits, spans, enabled, since }` 对象放在该浏览器的 `localStorage` 键 `pagetime-preview`，把同一份 `settings` 形状放在 `pagetime-preview-settings`。`clear`、`deleteSite` 和 `deleteDay` 只改这份本机对象，仍然不上传。Sites 预览用的 `worker/index.js` 只托管静态页面，不在扩展包里，也不接收浏览记录。

## 保留多久

数字来自 `src/model.mjs`，`docs/timing.zh-CN.md` 写的是同一组数字，`tests/timing-docs.test.mjs` 会检查两者一致。下表的空闲秒数是默认值，已保存的阈值可能不同：

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `DETAIL_DAYS` | 31 | 开始时间早于「今天往前 30 天的本地零点」的 `spans` 和 `visits` 会被删掉，即保留今天和之前 30 天。后台在每天第一次写入时和每次重启后清理。`days` 和 `hours` 汇总不按时间删除，直到清空账本，或按站点、按某一天删除 |
| `CHECKPOINT_SECONDS` | 30 | 检查点闹钟的周期（分钟数为该值除以 60） |
| `IDLE_SECONDS` | 60 | 默认空闲阈值。已保存的 `settings.idleSeconds` 也可以是 120、300 或 600。连续无键鼠操作达到该秒数后停止计入；若 `countAudible` 开着，且前台窗口的当前标签正在播放且未静音，则继续计入。锁屏永远不计 |
| `GAP_LIMIT_MS` | 90000 | 两次检查点间隔再长，这段最多计入 90 秒 |

明细表没有条数上限。计时规则的公开说明在 README「功能与口径」、[docs/timing.zh-CN.md](docs/timing.zh-CN.md)，以及 `tests/model.test.mjs`、`tests/timing.test.mjs`、`tests/timing-docs.test.mjs` 和 `docs/timing-qa.md`。

## 没有网络、遥测或账号

清单权限只有 `storage`、`tabs`、`webNavigation`、`idle`、`alarms`。可调空闲时间和音频计时没有新增权限。没有 host permission，没有 content script，`incognito` 为 `not_allowed`。无痕窗口不记录。扩展不申报遥测、分析或账号接口。统计页可以发的消息只有 `snapshot`、`toggle`、`clear`、`deleteSite`、`deleteDay`、`settings`、`restore`。工具栏 popup 可以发的消息只有 `snapshot`、`toggle`、`settings`。后台只接受来自本扩展自己的 `dashboard.html` 和 `popup.html`。popup 不能清空或删除记录。删除记录不新增权限。

## 如何删除

- 在站点详情里选择删除此站点的记录，并在确认框中确认。后台收到 `deleteSite` 后，在一个事务里删掉该主机名在 `days`、`hours`、`spans`、`visits` 中的行，再删掉 `domains` 里的对应条目。统计页会把当前合并方式下显示为这个站点的每个原始主机名都交出去。把站点加入 `ignored` 或 `allowed` 不会删除已有行；这次删除也不会把它加入这两份列表。
- 在「设置」里、「清空所有记录」上方选择一个日期，范围是这份账本开始以来、不晚于今天。页面会显示这一天的总时长和站点数。确认后发送 `deleteDay`。后台删掉该本地日的 `days` 和 `hours` 行、落在这一天的访问，以及时段里落在这一天的部分。跨过零点的时段只去掉这一天的部分，其余保留。同一次操作在一个事务里完成。
- 如果删的是游标上的站点，或删的是今天，同一个事务会把游标的 `since` 改成删除时刻。下一次检查点不会把已删除的那段补记回来。
- 统计页「设置」里清空所有记录，并在确认框中确认。后台收到 `clear` 后在一个事务里清空 `pagetime-ledger` 的所有表（包括 `cursor`），保留原来的 `enabled`，`since` 改为清空时刻。旧的 `data` 键不受影响。
- 从浏览器里移除扩展后，浏览器会删掉该扩展的 IndexedDB 和 `chrome.storage`，包括旧的 `data` 键。
- 暂停记录只把 `meta.state` 的 `enabled` 设为 false，不删除已有账本。

删除、清空或卸载本身不能从账本里撤销。设置里可以用 PageTime 备份 JSON 覆盖账本和设置。没有回收站，也没有同步。

## 如何导出

「设置 → 导出数据」把账本存成一份文件。统计页在一个只读 IndexedDB 事务里读取 `meta.state` 和 `domains`、`days`、`hours`、`spans`、`visits` 的全部行（`src/ledger.mjs` 的 `readLedgerSnapshot`），在页面里生成文件（`src/export.mjs`），再通过 `Blob` 网址和 `<a download>` 链接保存。不联网、不新增消息，也不使用 `downloads` 权限。「导出 JSON」生成 `pagetime-YYYY-MM-DD.json`，含 `format: "pagetime-ledger"`、`schemaVersion`、`exportedAt`、`timeZone`、`appVersion`、`recording`（即 `meta.state`）、完整的 `settings`（含 `ignored`、`allowed`、`recordMode`、`siteMerge`），以及按主键排序的五张表；`cursor` 行不导出。「导出 CSV」生成 `pagetime-YYYY-MM-DD.csv`，UTF-8 带 BOM，列为 `date,host,active_ms,visits`：`days` 里每个本地日期、每个原始主机名一行，不按 `siteMerge` 合并。两种文件都不含网址、标题或页面内容。保存下来的文件在扩展之外，删除、清空或卸载都不会删掉它。本地预览导出的是 `pagetime-preview` 里的那份对象。

## 如何恢复

「设置 → 导出数据 → 从备份恢复」在页面里读取一个本地 JSON 文件（`<input type="file">`，`src/import-file.js`）。解析放在 worker（`src/import-worker.js`）里，包括 `JSON.parse` 和逐行检查，大文件不会占住统计页。它检查 `format: "pagetime-ledger"` 和认识的 `schemaVersion`（`src/import.mjs`）。行里不认识的字段会被丢掉。缺少格式、版本不认识、表和导出的行对不上，或某条时段的结束时间晚于下一个本地午夜时，在写入之前拒绝，账本保持原样。结束时间刚好落在下一个本地午夜的时段仍算前一天。不接受 CSV。确认一次后，统计页发送 `restore`。后台在一个 IndexedDB 事务里清空 `domains`、`days`、`hours`、`spans`、`visits`，写入文件中的行，把 `recording` 写入 `meta.state`，并删除 `cursor`。这个事务失败时，IndexedDB 会整笔回滚。随后后台把经过 `validateSettings` 的 `settings` 写入 `chrome.storage.local`，并按现有的 `DETAIL_DAYS` 清理 `spans` 和 `visits`。`days` 和 `hours` 按文件原样保留。这次清理如果失败，恢复不会被当成已经完成，同一天稍后的更新会再试一次。文件不会上传，不新增权限，也没有 content script。本地预览会禁用恢复，并且不写 `pagetime-preview` 或 `pagetime-preview-settings`。
