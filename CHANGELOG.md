# pagetime

## Unreleased

### Minor Changes

- 概览默认合并常见前缀：去掉开头的 `www.`、`m.`、`mobile.`（例如 `www.youtube.com` 与 `m.youtube.com` 显示为 `youtube.com`）。这是默认行为变化。已经保存的记录仍按原始主机名存放，可在设置里改回不合并，或改为按可注册域名合并（例如 `a.b.example.co.uk` 显示为 `example.co.uk`）。

## 1.2.0

### Minor Changes

- [#49](https://github.com/Yukiniro/pagetime/pull/49) [`7947a97`](https://github.com/Yukiniro/pagetime/commit/7947a97bb10e54105afd01d2276a880ee1100bdc) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 仪表盘默认跟随系统的浅色或深色外观，也可以在设置里固定为浅色或深色。图表、抽屉和站点排行的颜色随主题一起切换。

- [#51](https://github.com/Yukiniro/pagetime/pull/51) [`8285aeb`](https://github.com/Yukiniro/pagetime/commit/8285aebc7344bef69f3217993ab41f43ce0f8f31) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览和访问记录可以按今天、近 7 天、近 30 天，或一段自定义的起止日期查看。切换后，汇总数字、主图、排行和热力都按这个范围重算；已经选中的站点过滤会保留。结束日期早于开始日期时不能应用，仍停留在上一个范围。

- [#50](https://github.com/Yukiniro/pagetime/pull/50) [`2f0a6a9`](https://github.com/Yukiniro/pagetime/commit/2f0a6a9cb155e0df5a7792e0b1e844ea6e103241) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览在还没有本地记录、或清空全部记录后，显示居中的空状态，并可以打开计时规则。过滤后的图表没有活跃时间时，保留当前过滤和清除入口，不再画出空的坐标轴。读取记录或切换日期范围时，汇总、主图和排行用接近最终高度的骨架占位。

- [#58](https://github.com/Yukiniro/pagetime/pull/58) [`a1b8463`](https://github.com/Yukiniro/pagetime/commit/a1b846376d930dabe62f6f26ffd54347161a6d40) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览顶栏的活跃时长、访问次数和站点数下方，新增较上一周期的变化：绝对差加百分比，中性呈现，不用红绿，也不评价好坏。上一周期是紧挨在所选范围之前、天数相同的一段；范围包含今天时，两个周期都只统计到当前整点（「截至 HH:00」），悬停可看到上一周期的具体日期。上一周期早于记录开始日，或访问次数所需的明细已超出 31 天保留期时，对应项显示「—」并说明原因；上一周期为 0 时只显示绝对差。已选中的站点过滤会一并应用。计时说明里补充了对比口径。

- [#56](https://github.com/Yukiniro/pagetime/pull/56) [`844e865`](https://github.com/Yukiniro/pagetime/commit/844e865bdecbf919e0e65dc884112b36e45241aa) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置里新增「导出数据」：「导出 JSON」下载完整账本（全部表、记录状态和设置，带 `format`、`schemaVersion`、`exportedAt`、时区和扩展版本），「导出 CSV」下载每天每个主机名一行的汇总（`date,host,active_ms,visits`，UTF-8 带 BOM）。文件在页面里本地生成后直接下载，不联网，也不新增权限；只导出，不含导入。

- [#57](https://github.com/Yukiniro/pagetime/pull/57) [`fec4f82`](https://github.com/Yukiniro/pagetime/commit/fec4f82abd0f8755e5dd1bd814e426156faad65e) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置页新增只读的「本地数据概况」：显示记录开始时间、最早一天的日汇总、访问记录和活跃时段的 31 天保留边界、站点数和各表行数、浏览器给出的本机占用估算，以及数据保存在本机 IndexedDB（`pagetime-ledger`）且不上传。旧版本留下的 `chrome.storage.local` `data` 键还在时，同时显示它的大小。数字随记录、删除和清空实时更新。

- [#44](https://github.com/Yukiniro/pagetime/pull/44) [`45d7e93`](https://github.com/Yukiniro/pagetime/commit/45d7e93cd15082f0872b225c5f4450ea8cee2f32) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览打开后默认是「今天」的一页账本：顶栏是今日活跃时长、访问次数和站点数，主图同时只显示今日时间线或近 7 日趋势，下面是两列站点排行。活跃时段热力图收在次级区块里，点开后仍按所选范围计算；范围是今天时也可以展开。

- [#48](https://github.com/Yukiniro/pagetime/pull/48) [`077b2fe`](https://github.com/Yukiniro/pagetime/commit/077b2feddd2a40322171367bf81bcfd968735ce5) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点排行把当前排序指标用更大的加粗数字显示在行尾。另一项以更小的浅色文字放在主数字下方：按时长排序时是访问次数，按访问次数排序时是活跃时长。行内浅色条仍按该列当前列表中的最大值计算。

- [#46](https://github.com/Yukiniro/pagetime/pull/46) [`5d2dbe5`](https://github.com/Yukiniro/pagetime/commit/5d2dbe5860c51d336fb73ffe49564b1b034fdf7b) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置里可以在黑名单和白名单之间选择记录范围。白名单为空时不记录任何站点；两份列表分开保存，切换模式不会清空另一份，也不会删除或隐藏已有记录。

- [#45](https://github.com/Yukiniro/pagetime/pull/45) [`65f3d7e`](https://github.com/Yukiniro/pagetime/commit/65f3d7e38abd8369179c9f6ceb717c2aa8f5931e) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 在概览里点某一行站点后，今日活跃时长、访问次数、站点数和主图只统计该站点；再点同一行或清除过滤后，恢复当前日期范围的全部站点。行内的详情按钮仍打开该站点的详情。

- [#47](https://github.com/Yukiniro/pagetime/pull/47) [`6c6aa23`](https://github.com/Yukiniro/pagetime/commit/6c6aa23dd577c892adb2d98452c5ffcd7fd05a56) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点详情改在账本旁的抽屉里打开。宽屏从右侧展开，大约 400 像素；窄屏从底部展开。点遮罩或按 Esc 关闭后，仍停在原来的账本，已经选中的站点过滤保持不变。

## 1.1.0

### Minor Changes

- [#27](https://github.com/Yukiniro/pagetime/pull/27) [`bc2c266`](https://github.com/Yukiniro/pagetime/commit/bc2c266330b0affdf314cdf75d22ef894a84deb0) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览在最近 7 天和 30 天显示「活跃时段」热力图：每个格子是该星期几、该小时的平均活跃时长。范围为今天时不显示这张图。

- [#28](https://github.com/Yukiniro/pagetime/pull/28) [`69a08bd`](https://github.com/Yukiniro/pagetime/commit/69a08bdf544aafabc35e9a38de73baca8c4f2332) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 可以按站点或按某一天删除本地记录。删除会从本机数据库移除，不能撤销。

- [#25](https://github.com/Yukiniro/pagetime/pull/25) [`a356b01`](https://github.com/Yukiniro/pagetime/commit/a356b01aefdc9e82883657056b51ec5a6d23cd7e) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 可以在设置里忽略指定域名。被忽略的站点及其子域名不再计入时长和访问次数，已有记录仍会保留。

- [#20](https://github.com/Yukiniro/pagetime/pull/20) [`21ebbdd`](https://github.com/Yukiniro/pagetime/commit/21ebbddf57ef94c26dcd25c0d93407dfb1fdd40f) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 记录改存到扩展自己的 IndexedDB：每次计时的每日、每小时汇总和活跃时段在同一个事务里写入，统计页打开时会随后台写入实时刷新。访问记录和活跃时段明细保留最近 31 天，每日和每小时汇总长期保留，不再有 20,000 条上限。升级后从空账本开始；旧版本留在 `chrome.storage.local` 的记录不会被删除，但不再显示。写入失败时统计页会提示保存错误。

- [#29](https://github.com/Yukiniro/pagetime/pull/29) [`5abcb80`](https://github.com/Yukiniro/pagetime/commit/5abcb807eb8eb9cc931e8b0d6aa184623ecf24de) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点详情在所选范围内显示每日活跃时长趋势，以及一天中 0–23 点的时段分布。今天只显示一根日柱。记录开始之前的日期标为未记录。

- [#26](https://github.com/Yukiniro/pagetime/pull/26) [`68470ac`](https://github.com/Yukiniro/pagetime/commit/68470ac56ee643fd8191795bbb3f302e18563ee4) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 概览默认按常见前缀合并站点：去掉开头的 www.、m.、mobile.。这是默认行为变化。已有记录仍按原始主机名保存，可以在设置里改回不合并，或按可注册域名合并。

- [#15](https://github.com/Yukiniro/pagetime/pull/15) [`228f472`](https://github.com/Yukiniro/pagetime/commit/228f472fb980234f04582f980c84586a42575516) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 可以设置空闲判定时间。前台窗口正在播放未静音音频时，空闲也会继续计时，这项默认开启。已经安装的用户可能会看到比以前更高的时长。

- [#24](https://github.com/Yukiniro/pagetime/pull/24) [`b0a28a9`](https://github.com/Yukiniro/pagetime/commit/b0a28a9d28b705bd7b7f511cd234c6dab44f4193) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 工具栏图标显示今天的活跃浏览时长，悬停时可以看到今天的总时长和当前站点。暂停记录时角标会标明已暂停。可以在设置里关掉角标。

### Patch Changes

- [#12](https://github.com/Yukiniro/pagetime/pull/12) [`97347c8`](https://github.com/Yukiniro/pagetime/commit/97347c82ba099d52984131834236979c14f0cd7c) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 时钟回拨后，已记录的浏览时间不会被重复计算。窗口从最小化恢复后，下一次焦点或窗口尺寸变化会马上继续计时。

- [#10](https://github.com/Yukiniro/pagetime/pull/10) [`9e7517f`](https://github.com/Yukiniro/pagetime/commit/9e7517f4bbd38820a7160b1e8dbf818179e7c831) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 保留并报告格式异常的本地记录，避免统计页面崩溃或后台覆盖数据；补齐十语言错误提示、图表日期本地化和所有复数分支校验。

## 1.0.0

Initial version: local browsing activity statistics, today's timeline and ten display languages.
