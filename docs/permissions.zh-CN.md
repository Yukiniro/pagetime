# PageTime 权限说明

权限以 `wxt.config.ts` 的 `manifest.permissions` 为准。`scripts/verify-build.mjs` 要求构建出的 `manifest.json` 里，这五项不多不少：

`storage`、`tabs`、`webNavigation`、`idle`、`alarms`

没有 `host_permissions`（没有 host permission）。没有 `content_scripts`（没有 content script）。没有 `optional_permissions`。`incognito` 是 `not_allowed`。扩展入口只有 `entrypoints/background.ts` 和 `entrypoints/dashboard/`。英文版见 [permissions.md](permissions.md)。

## 安装时浏览器怎么说

[Chrome 权限列表](https://developer.chrome.com/docs/extensions/reference/permissions-list) 写明：`tabs` 和 `webNavigation` 各自都会显示警告 **Read your browsing history**（读取你的浏览记录）。两句相同，安装对话框里合并成一句。`storage`、`idle`、`alarms` 不触发安装警告。

这不是 `history` 权限的那句 “Read and change your browsing history on all your signed-in devices”。本扩展不申请 `history`。Edge 使用同一套 Chromium 警告，界面语言不同时措辞由浏览器翻译。

警告说的是这些 API **能够**做什么，不是 PageTime 实际写进账本的内容。账本里有什么见 [隐私说明](../PRIVACY.zh-CN.md)。

## `storage`

用来把计时偏好放进 `chrome.storage.local` 的 `settings`（含默认开启的 `badge`、默认黑名单的 `recordMode`，以及用户输入的 `ignored` 和 `allowed` 域名），把界面语言放进同一处的 `language`，把写入失败标记放进 `ledgerError`，并把检查点所属的会话编号放进 `chrome.storage.session` 的 `session`。账本本身在扩展的 IndexedDB 数据库 `pagetime-ledger` 里，不需要权限。旧版本留在 `chrome.storage.local` 的 `data` 键不受影响。工具栏角标用的是 `chrome.action`，不新增权限。

能够读写本扩展自己的存储区。代码只用 local 和 session，不用 sync。不能读其他扩展的存储、网站 Cookie 或磁盘上的任意文件。不触发安装警告。

## `tabs`

用来读取当前焦点窗口里活动标签的网址，再取出主机名，并跳过无痕标签。没有这项权限时，`tab.url` 不会交给扩展。

能够读取标签的网址、标题、图标和待提交网址，也能按网址查询标签。不能读取页面 DOM，不能注入脚本，不能调用 `chrome.history`。当前代码使用标签的 `url`、`id`、`incognito`、`audible` 和 `mutedInfo`，不读取标题，也不保存 `audible` 或 `mutedInfo`。安装警告是 “Read your browsing history”。

## `webNavigation`

用来在主框架导航完成时记一次访问（加载和刷新），并在同一文档的历史状态变化时改记当前站点，且不把这次变化算成新的访问。

能够观察到导航事件里的完整网址、框架编号、跳转类型和时间。不能读取响应正文，不能拦截或修改请求，不能读取文档。当前代码忽略 `frameId !== 0` 的子框架；访问记录只留下主机名和时间。安装警告同样是 “Read your browsing history”。

## `idle`

用来在连续 `settings.idleSeconds` 秒没有键盘或鼠标操作时停止计时。默认是 `IDLE_SECONDS`（60）；已保存的值也可以是 60、120、300 或 600。后台用这个值调用 `idle.setDetectionInterval`，并把它传给 `idle.queryState`。锁屏永远不计。`countAudible` 开着时（默认开），前台窗口的当前标签正在播放且未静音，空闲也继续计入。这用的是原有的 `idle` 和 `tabs` 权限，没有新增权限。

能够查询 `active`、`idle` 或 `locked`。不能知道按下了哪个键。不触发安装警告。

## `alarms`

用来创建名为 `checkpoint` 的周期闹钟，`periodInMinutes` 为 `CHECKPOINT_SECONDS / 60`（30 秒）。浏览器可能推迟闹钟；推迟造成的空档最多计入 `GAP_LIMIT_MS`（90 秒）。

能够在本扩展里定时唤醒后台。它本身读不到浏览记录。不触发安装警告。

## 明确没有的权限

- **没有 host permission。** 清单里没有匹配网站的主机权限，因此不能向网页注入代码，也不能靠主机权限读取页面。
- **没有 content script。** 仓库里没有内容脚本入口，构建校验要求 `content_scripts` 为空或不存在。
- **没有 `history`、`scripting`、`cookies`、`webRequest`、`identity`。** 不能读写浏览器历史库，不能执行页面脚本，不能读 Cookie，不能查看请求正文，没有账号。
