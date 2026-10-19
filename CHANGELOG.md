# pagetime

## Unreleased

### Minor Changes

- 概览默认合并常见前缀：去掉开头的 `www.`、`m.`、`mobile.`（例如 `www.youtube.com` 与 `m.youtube.com` 显示为 `youtube.com`）。这是默认行为变化。已经保存的记录仍按原始主机名存放，可在设置里改回不合并，或改为按可注册域名合并（例如 `a.b.example.co.uk` 显示为 `example.co.uk`）。

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
