# 计时场景覆盖对照（S1–S19）

场景定义与期望行为以已关闭 epic [#6](https://github.com/Yukiniro/pagetime/issues/6) 正文表格为准。本文件对照 **main 分支上的测试标题与断言** 维护，不臆造覆盖；改测试时请同步更新此处。

## 三层含义

| 层 | 入口 | 作用 |
| --- | --- | --- |
| **A** | `npm test` → `tests/timing.test.mjs`（`tests/helpers/fake-browser.mjs`） | 假时钟、假 `browser`，断言 `spans` / 游标 / 存储 |
| **B** | `npm run build` 后 `npm run test:e2e` → `tests/e2e/timing.spec.mjs` | 真实 Chromium + 已构建 MV3；时间容差约 ±2s |
| **手动** | `docs/timing-qa.md` | macOS / Windows 发布前走查；Linux 上 B 层能跑的不要用手动代替 |

状态列：**已覆盖** = 现有断言对齐 #6（或已文档化的「接受现状」）；**缺口** = #6 期望与断言不一致且未接受；**接受现状** = 产品与 #6 原文不同或平台限制，已在测试注释或本表说明。

## S1–S19 对照表

| 场景 | #6 要点 | A 层 | B 层 | 手动 | 状态 |
| --- | --- | --- | --- | --- | --- |
| **S1** | 单窗口停留 25s，alarm checkpoint | `S1 alarm checkpoint during a 25s stay credits a.com for 25s` | — | — | 已覆盖 |
| **S2** | 切标签 a 10s + b 15s，无重叠无空洞 | `S2 switching tabs splits a.com and b.com without a gap or overlap` | `S2 switching tabs splits the two domains` | — | 已覆盖 |
| **S3** | 跨域 onCommitted 切分；SPA 同域不切分 | `S3 cross-site navigation splits the span; a same-site history update does not` | `S3 full navigation splits domains and pushState does not add a visit` | — | 已覆盖 |
| **S4** | chrome://、扩展页不计，回到 http 恢复 | `S4 internal and extension pages are not counted, then http resumes` | `S4 an internal page is not counted and http resumes` | — | 已覆盖 |
| **S5** | 只计聚焦窗口活跃标签 | `S5 only the focused window active tab is counted` | `S5 only the focused window is counted` | [S5 多窗口只计焦点](timing-qa.md#s5-多窗口只计焦点) | 已覆盖 |
| **S6** | 焦点抖动：总时长不丢；空洞 ≤1s | `S6 focus flicker keeps the total; a sub-second hole is allowed`；另 `S6 known behavior: a stale focused flag ignores WINDOW_ID_NONE (issue #6 risk 4)` | — | [S6 焦点抖动](timing-qa.md#s6-焦点抖动) | 已覆盖（B 缺口由手动补；stale `focused` 为接受现状，见下） |
| **S7** | 最小化 / 焦点 NONE 停表，恢复后继续 | `S7 minimizing or focusing nothing stops timing until focus returns`；`S7 a bounds event resumes a restored window even if getAll() still says minimized` | `S7 minimizing the browser window stops timing` | [S7 最小化，或切到别的应用](timing-qa.md#s7-最小化或切到别的应用) | 已覆盖 |
| **S8** | 聚焦 devtools 停表（固定现状） | `S8 known behavior: a focused devtools window stops timing (issue #6 risk 3)` | — | — | 接受现状（`getAll()` 不含 devtools，等同无聚焦窗口） |
| **S9** | idle / locked 从事件时刻停表 | `S9 idle and locked stop timing from the idle event` | —（真机 idle 不稳定） | [S9 空闲和锁屏](timing-qa.md#s9-空闲和锁屏) | 已覆盖（B 仅 A + 手动） |
| **S10** | #6 原文：有音频仍 idle 则停表（固定现状） | `S10 audible playback keeps counting through idle, then stops when the sound stops` | — | [播放未静音音频](timing-qa.md#播放未静音音频)（含设置开关） | 已覆盖（**产品已变**：默认 `countAudible` 下 idle 仍计，见 [#14](https://github.com/Yukiniro/pagetime/issues/14)/[#15](https://github.com/Yukiniro/pagetime/issues/15)；与 #6 表不一致为预期） |
| **S11** | SW 杀死后 30s 内重建，游标连续、不重复不丢 | `S11 a service worker restarted within 30s continues the session cursor`（15s 空窗后 `restartWorker`，单 span 连续至 30s） | `S11 stopping the service worker keeps the session cursor`（CDP 停 SW，`session` 游标续计） | — | 已覆盖 |
| **S12** | SW 死掉 >90s 无事件：断档封顶计入 | `S12 a dead worker with no event for over 90s credits at most GAP_LIMIT_MS` | — | — | 已覆盖 |
| **S13** | alarm 间隔 95s 全程活跃：至少计 90s | `S13 checkpoints 95s apart credit 90s, not the whole gap and not zero` | — | — | 已覆盖 |
| **S14** | 睡眠 2h：睡眠段理想为 0 | `S14 a 2h sleep credits the 90s cap, then timing resumes`（注释：与迟到 alarm 同规则，**最多补 90s**） | — | [S14 睡眠和唤醒](timing-qa.md#s14-睡眠和唤醒) | 接受现状（无法区分睡眠与 SW 迟到，封顶见 PR #8 / `creditUntil`） |
| **S15** | 浏览器重启：已 flush 保留，关闭期间不计 | `S15 browser restart keeps flushed spans and does not credit the time it was closed` | `S15 browser restart keeps flushed spans and skips the time it was closed` | — | 已覆盖 |
| **S16** | 扩展重载：最多丢一个 checkpoint 周期未 flush 尾 | `S16 known behavior: extension reload drops the unflushed tail, at most one checkpoint (issue #6 risk 5)` | `S16 reloading the extension drops at most the unflushed tail` | — | 接受现状（`storage.session` 清空，未先 flush 的游标丢失） |
| **S17** | 暂停 / 清空 | `S17 pause credits nothing; clear does not backfill the old cursor` | — | — | 已覆盖 |
| **S18** | 时钟回拨、跨零点 `daily()` 拆分 | `S18 rollback creates no negative span; a span crossing midnight splits in daily()` | — | — | 已覆盖 |
| **S19** | 无痕聚焦不计、不写 visits | `S19 a focused incognito window is not counted and stores no visit` | — | — | 已覆盖 |

### S6 / S11 专项（#30 点名）

**S6 — 焦点抖动**

- A 层：`flicker()` 模拟 `WINDOW_ID_NONE` →（可选间隔）→ 新窗口；同 tick 与 400ms 间隔两种路径均断言 **总时长 20s**、域时长之和 20s，且空洞 **≤1s**（400ms 用例精确断言）。
- A 层第二用例固定 **risk 4**：仅 fire `WINDOW_ID_NONE` 而 `getAll()` 仍报旧窗口聚焦时，**继续计在旧窗口**（与 `timing-qa.md`「已知现状」一致）。不在此 issue 改产品行为。
- B 层无专用用例（Linux 焦点序列与 macOS/Windows 不同）；依赖 `timing-qa.md` 在 macOS/Windows 各测一次。**无额外单元测试缺口。**

**S11 — Service Worker 重启**

- A 层：`killWorker` → 推进 15s（<30s）→ `restartWorker`（保留 `storage.session`），断言累计 25s、再 5s 后 alarm 后 **单 span 30s**（无重复段）。
- B 层：停 SW 后 `pushState` 唤醒新 worker，断言 `a.test` 约 5s（2s+3s 窗口）。与 #6「30s 内重建、游标连续」一致。
- **无断言缺口。**

## 超出原 S1–S19 表（#15 音频 / 空闲设置）

| 场景 | A 层用例 | 说明 |
| --- | --- | --- |
| **S21** | `S21 turning audio counting off stops timing while idle` | 关闭「播放音频时继续计时」后 idle 停表 |
| **S22** | `S22 a muted tab does not count, and muting stops timing immediately` | 静音标签与即时停表 |
| **S23** | `S23 locked does not count even while audio is playing` | 锁屏永远不计 |
| **S24** | `S24 audio in a background tab or an unfocused window does not count` | 后台/非焦点窗口 audible 不计 |
| **S25** | `S25 idleSeconds is passed to setDetectionInterval and queryState; invalid settings fall back` | 空闲阈值与校验 |
| **S20** | `S20 baseline: one checkpoint over 20_000 stored spans and visits is one transaction; logs time` | 性能基线；深化见 [#32](https://github.com/Yukiniro/pagetime/issues/32)，本对照不展开 |

## 相关非 S 编号用例（A 层）

`tests/timing.test.mjs` 中还有 alarm 调度、主框架 commit 事务、31 天明细裁剪、忽略列表等用例，名称不以 `S` 开头，不映射 #6 表行，但属于计时/存储回归。

## 维护

- 文档化任务跟踪：[#30](https://github.com/Yukiniro/pagetime/issues/30)
- 手动走查与填表：[#31](https://github.com/Yukiniro/pagetime/issues/31)
- Epic 来源：[#6](https://github.com/Yukiniro/pagetime/issues/6)
