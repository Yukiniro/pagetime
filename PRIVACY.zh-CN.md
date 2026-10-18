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

账本写入失败时，后台在 `chrome.storage.local` 写入 `ledgerError`：`{ at, name }`，即失败时间和错误名。它存在期间统计页显示保存错误，下一次写入成功后删除。

计时偏好是 `chrome.storage.local` 里单独的 `settings` 键，不属于账本：

| 字段 | 内容 |
| --- | --- |
| `schema` | `1` |
| `idleSeconds` | `60`、`120`、`300` 或 `600`。连续多少秒没有键盘或鼠标操作后，把浏览器视为空闲 |
| `countAudible` | 为 true 时，前台窗口的当前标签正在播放且未静音，空闲也继续计入。默认是 true |

`src/settings.mjs` 的 `validateSettings` 会把非法字段换成默认值。没有 `settings` 时，后台使用 `{ schema: 1, idleSeconds: 60, countAudible: true }`。这些字段不是浏览历史。后台还会读取 `tab.audible` 和 `tab.mutedInfo` 来执行 `countAudible`。这两个标志不写入账本或 `settings`。

不保存标题、完整网址、页面正文、Cookie、表单输入，也不读取页面 DOM。扩展没有 content script，也不使用 `chrome.scripting`。

服务工作线程重启用的检查点是 `meta` 里的 `cursor` 行：`{ tabId, domain, since, session }`。`tabId` 是浏览器给标签的编号。`session` 是后台放在 `chrome.storage.session` 的 `session` 键里的随机编号；`session` 对不上的检查点会被忽略，所以和以前一样，浏览器会话结束或扩展重新加载后检查点就失效。没有正在记录的页面时会删掉它；清空、暂停或恢复时也会删掉。它不是浏览历史。

为了得到主机名，后台会从 `tabs` 和 `webNavigation` 事件里读到网址。读到的网址只用来算出 `hostname`，不写入账本。

## 存在哪里

只在这台设备上：

- 扩展使用 IndexedDB、`chrome.storage.local` 和 `chrome.storage.session`。代码没有调用 `chrome.storage.sync`。IndexedDB 通过 Dexie 访问，不包含 Dexie Cloud 或任何同步插件。
- 没有账号、登录或身份权限。
- 后台和统计页源码没有网络请求。清单不申请 host permission，扩展不能靠权限去读网页或把账本送到别的主机。
- 本地预览（`npm run dev`）不是已安装的扩展。它把 `{ visits, spans, enabled, since }` 对象放在该浏览器的 `localStorage` 键 `pagetime-preview`，把同一份 `settings` 形状放在 `pagetime-preview-settings`，仍然不上传。Sites 预览用的 `worker/index.js` 只托管静态页面，不在扩展包里，也不接收浏览记录。

## 保留多久

数字来自 `src/model.mjs`，界面说明通过 `timingCopy(settings)` 使用同一组常量，空闲秒数跟随已保存的阈值：

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `DETAIL_DAYS` | 31 | 开始时间早于「今天往前 30 天的本地零点」的 `spans` 和 `visits` 会被删掉，即保留今天和之前 30 天。后台在每天第一次写入时和每次重启后清理。`days` 和 `hours` 汇总不按时间删除，清空账本前一直保留 |
| `CHECKPOINT_SECONDS` | 30 | 检查点闹钟的周期（分钟数为该值除以 60） |
| `IDLE_SECONDS` | 60 | 默认空闲阈值。已保存的 `settings.idleSeconds` 也可以是 120、300 或 600。连续无键鼠操作达到该秒数后停止计入；若 `countAudible` 开着，且前台窗口的当前标签正在播放且未静音，则继续计入。锁屏永远不计 |
| `GAP_LIMIT_MS` | 90000 | 两次检查点间隔再长，这段最多计入 90 秒 |

明细表没有条数上限。计时规则的公开说明在 README「功能与口径」、扩展内「了解计时规则」对话框，以及 `tests/model.test.mjs`、`tests/timing.test.mjs`、`tests/timing-copy.test.mjs` 和 `docs/timing-qa.md`。

## 没有网络、遥测或账号

清单权限只有 `storage`、`tabs`、`webNavigation`、`idle`、`alarms`。可调空闲时间和音频计时没有新增权限。没有 host permission，没有 content script，`incognito` 为 `not_allowed`。无痕窗口不记录。扩展不申报遥测、分析或账号接口。统计页可以发的消息只有 `snapshot`、`toggle`、`clear`、`settings`，而且后台只接受来自本扩展自己的 `dashboard.html`。

## 如何删除

- 统计页「设置」里清空所有记录，并在确认框中确认。后台收到 `clear` 后在一个事务里清空 `pagetime-ledger` 的所有表（包括 `cursor`），保留原来的 `enabled`，`since` 改为清空时刻。旧的 `data` 键不受影响。
- 从浏览器里移除扩展后，浏览器会删掉该扩展的 IndexedDB 和 `chrome.storage`，包括旧的 `data` 键。
- 暂停记录只把 `meta.state` 的 `enabled` 设为 false，不删除已有账本。

清空或卸载后不能恢复。这一版没有备份、同步、导入或导出命令。账本可以带走的方式，就是上面这份公开的表结构：它留在本机存储里，不绑在账号上。
