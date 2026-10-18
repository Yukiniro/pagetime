# PageTime 隐私说明

PageTime 是装在本机 Chrome 或 Edge 里的浏览账本。下面每条都对应仓库里的实现：`entrypoints/background.ts` 负责写入，`src/model.mjs` 规定保留期限，`src/settings.mjs` 规定计时偏好，`src/validate-data.mjs` 规定能存进账本的形状，`wxt.config.ts` 规定权限。英文版见 [PRIVACY.md](PRIVACY.md)。

## 保存什么

长期账本在 `chrome.storage.local` 的 `data` 键，只有这些字段：

| 字段 | 内容 |
| --- | --- |
| `visits` | `{ domain, at }`。`domain` 是主机名，`at` 是主框架完成导航的时间（毫秒） |
| `spans` | `{ domain, start, end }`。一段前台活跃时间的起止（毫秒） |
| `enabled` | 是否正在记录 |
| `since` | 这份账本建立或上次清空的时间（毫秒），不是网址 |

界面上的访问次数是 `visits` 的条数，不是单独存的计数器。`domain` 只接受主机名：`src/model.mjs` 的 `domainOf` 只从 `http:` / `https:` 网址取出 `hostname`，路径、查询、片段、端口和账号都丢掉。`validate-data.mjs` 会拒绝带 `/?#@` 或空白的域名，格式不对的整份 `data` 不会被改写。

计时偏好是 `chrome.storage.local` 里单独的 `settings` 键，不属于 `data`：

| 字段 | 内容 |
| --- | --- |
| `schema` | `1` |
| `idleSeconds` | `60`、`120`、`300` 或 `600`。连续多少秒没有键盘或鼠标操作后，把浏览器视为空闲 |
| `countAudible` | 为 true 时，前台窗口的当前标签正在播放且未静音，空闲也继续计入。默认是 true |

`src/settings.mjs` 的 `validateSettings` 会把非法字段换成默认值。没有 `settings` 时，后台使用 `{ schema: 1, idleSeconds: 60, countAudible: true }`。这些字段不是浏览历史。后台还会读取 `tab.audible` 和 `tab.mutedInfo` 来执行 `countAudible`。这两个标志不写入 `data` 或 `settings`。

不保存标题、完整网址、页面正文、Cookie、表单输入，也不读取页面 DOM。扩展没有 content script，也不使用 `chrome.scripting`。

服务工作线程重启用的检查点在 `chrome.storage.session` 的 `cursor` 键：`{ tabId, domain, since }`。`tabId` 是浏览器给标签的编号。没有正在记录的页面时会删掉它；浏览器启动、清空、暂停或恢复时也会删掉。它不是浏览历史，浏览器会话结束即消失。

为了得到主机名，后台会从 `tabs` 和 `webNavigation` 事件里读到网址。读到的网址只用来算出 `hostname`，不写入账本。

## 存在哪里

只在这台设备上：

- 扩展使用 `chrome.storage.local` 和 `chrome.storage.session`。代码没有调用 `chrome.storage.sync`。
- 没有账号、登录或身份权限。
- 后台和统计页源码没有网络请求。清单不申请 host permission，扩展不能靠权限去读网页或把账本送到别的主机。
- 本地预览（`npm run dev`）不是已安装的扩展。它把同一份 `data` 形状放在该浏览器的 `localStorage` 键 `pagetime-preview`，把同一份 `settings` 形状放在 `pagetime-preview-settings`，仍然不上传。Sites 预览用的 `worker/index.js` 只托管静态页面，不在扩展包里，也不接收浏览记录。

## 保留多久

数字来自 `src/model.mjs`，界面说明通过 `timingCopy(settings)` 使用同一组常量，空闲秒数跟随已保存的阈值：

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `RETENTION_DAYS` | 90 | 早于「现在减去 90 天」的访问，以及结束时间不晚于该界限的时段，会被删掉。跨过界限的时段从界限处截断 |
| `LIMIT` | 20000 | 访问和时段各自最多保留 20000 条，超出时丢掉最旧的 |
| `CHECKPOINT_SECONDS` | 30 | 检查点闹钟的周期（分钟数为该值除以 60） |
| `IDLE_SECONDS` | 60 | 默认空闲阈值。已保存的 `settings.idleSeconds` 也可以是 120、300 或 600。连续无键鼠操作达到该秒数后停止计入；若 `countAudible` 开着，且前台窗口的当前标签正在播放且未静音，则继续计入。锁屏永远不计 |
| `GAP_LIMIT_MS` | 90000 | 两次检查点间隔再长，这段最多计入 90 秒 |

访问和时段分开截断，所以不保证两者都覆盖满 90 天。计时规则的公开说明在 README「功能与口径」、扩展内「了解计时规则」对话框，以及 `tests/model.test.mjs`、`tests/timing.test.mjs`、`tests/timing-copy.test.mjs` 和 `docs/timing-qa.md`。

## 没有网络、遥测或账号

清单权限只有 `storage`、`tabs`、`webNavigation`、`idle`、`alarms`。可调空闲时间和音频计时没有新增权限。没有 host permission，没有 content script，`incognito` 为 `not_allowed`。无痕窗口不记录。扩展不申报遥测、分析或账号接口。统计页可以发的消息只有 `snapshot`、`toggle`、`clear`、`settings`，而且后台只接受来自本扩展自己的 `dashboard.html`。

## 如何删除

- 统计页「设置」里清空所有记录，并在确认框中确认。后台收到 `clear` 后删除 `cursor`，再把 `data` 写成空的访问和时段，保留原来的 `enabled`，`since` 改为清空时刻。
- 从浏览器里移除扩展后，浏览器会删掉该扩展的 `chrome.storage`。
- 暂停记录只把 `enabled` 设为 false，不删除已有账本。

清空或卸载后不能恢复。这一版没有备份、同步、导入或导出命令。账本可以带走的方式，就是上面这份公开的 JSON 形状：它留在本机存储里，不绑在账号上。
