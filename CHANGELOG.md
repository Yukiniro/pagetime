# pagetime

## Unreleased

### Minor Changes

- 概览默认合并常见前缀：去掉开头的 `www.`、`m.`、`mobile.`（例如 `www.youtube.com` 与 `m.youtube.com` 显示为 `youtube.com`）。这是默认行为变化。已经保存的记录仍按原始主机名存放，可在设置里改回不合并，或改为按可注册域名合并（例如 `a.b.example.co.uk` 显示为 `example.co.uk`）。

## 1.4.0

### Minor Changes

- [#110](https://github.com/Yukiniro/pagetime/pull/110) [`ea6b42a`](https://github.com/Yukiniro/pagetime/commit/ea6b42ad354b6cb384fd066305f75212e6e02565) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 单日站点详情里，点击「一天中的时段」中的某小时，活跃时段列表只保留与该小时相交的片段。没有活动的小时也能点到整列，键盘可以选每个小时。再次点击同一小时或清除后恢复全天。多日范围和已过明细保留期的单日仍不可点。

- [#103](https://github.com/Yukiniro/pagetime/pull/103) [`9ee40f8`](https://github.com/Yukiniro/pagetime/commit/9ee40f8ee5f2bf50ec435c59290587c5bc278414) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 工具栏 popup 在当前站点名旁显示与仪表盘相同的站点图标。没有当前站点时不显示图标。图标固定为 24px，过长的站点名在 320px 弹窗内省略。

- [#98](https://github.com/Yukiniro/pagetime/pull/98) [`e5bb131`](https://github.com/Yukiniro/pagetime/commit/e5bb13145977fddbc7395e7a8276f3f92ff2ef2b) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置页不再提供按某一天删除记录。仍可在站点详情里删除该站点的记录，或在设置里清空全部记录。

- [#101](https://github.com/Yukiniro/pagetime/pull/101) [`a552e78`](https://github.com/Yukiniro/pagetime/commit/a552e784e88da1ad0a5a71d46b85f44c615e5b63) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置页不再提供站点合并方式。概览、排行、趋势和详情固定去掉开头的 www.、m.、mobile. 再分组；访问记录仍显示原始主机名，已存记录不改写。

- [#94](https://github.com/Yukiniro/pagetime/pull/94) [`8cfa96e`](https://github.com/Yukiniro/pagetime/commit/8cfa96eb564c883d036b74d132c9c413038a1ed1) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 在近 7 天、近 30 天或多日趋势上点击有记录的柱，或用键盘激活对应的日期按钮，日期范围切到那一天，主图打开该日时间线。今天以点击时的本地日为准。已有的站点过滤保留。只有访问、没有时长的已记录天仍显示可点的柱。未记录的空柱不跳转。

### Patch Changes

- [#100](https://github.com/Yukiniro/pagetime/pull/100) [`a82d2c9`](https://github.com/Yukiniro/pagetime/commit/a82d2c9163c71798efb64fd6dd227dd66db8399a) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 在站点详情里点击按日趋势中有记录的柱，或用键盘激活对应的日期按钮，日期范围切到那一天。抽屉保持打开同一站点，已有的站点过滤保留。未记录的空柱不跳转。键盘聚焦时，日期按钮显示在趋势图上。

- [#107](https://github.com/Yukiniro/pagetime/pull/107) [`87e1b31`](https://github.com/Yukiniro/pagetime/commit/87e1b3146e028e28669f38e727d96222ecd61e38) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 多日日期范围下，站点详情不再显示「今日」活跃时段。单日范围仍显示所选那天的活跃时段。

- [#113](https://github.com/Yukiniro/pagetime/pull/113) [`8b19eb5`](https://github.com/Yukiniro/pagetime/commit/8b19eb55403aafea15cbbf7cf207ce11d17cefc5) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 单日站点详情按小时过滤活跃时段时，「一天中的时段」图里选中的那根柱会高亮，其余柱变淡；清除过滤后恢复原样。

## 1.3.0

### Minor Changes

- [#89](https://github.com/Yukiniro/pagetime/pull/89) [`fa264fd`](https://github.com/Yukiniro/pagetime/commit/fa264fd39450e129732243b21474f6544a3b4792) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 自定义日期的开始和结束不能早于记录开始的那一天。早于该日的范围不会被应用，当前范围保持不变。

- [#87](https://github.com/Yukiniro/pagetime/pull/87) [`887e9d9`](https://github.com/Yukiniro/pagetime/commit/887e9d9947e8e80dc67e00558d9bbc2fbb16344a) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 日期范围为单日时，站点详情的每日趋势改为以该日为终点的近 7 天，与主图趋势同一窗口。多日范围不变。时段分布和会话列表仍只统计所选范围。

- [#85](https://github.com/Yukiniro/pagetime/pull/85) [`30fcf09`](https://github.com/Yukiniro/pagetime/commit/30fcf093413af1bb2b7f88d92981feb9358d121e) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点过滤开启时，活跃时段热力只统计该合并站点的星期和小时。清除过滤后恢复全站。该站在范围内没有小时数据时，热力区显示可清除过滤的空状态。

- [#92](https://github.com/Yukiniro/pagetime/pull/92) [`f32a93d`](https://github.com/Yukiniro/pagetime/commit/f32a93d9b519d643356e46bc8b6171f660ca57ab) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 在弹出窗口里，当前站点今天已有活动时间时，站点名可以点击。点击后打开或切到已打开的仪表盘，范围切到今天，并打开该站的详情。已打开的仪表盘不会新开标签，也不会整页刷新。今天没有活动时间、或当前页面无法记录时，站点名仍是文字。不新增权限，不注入内容脚本。

- [#64](https://github.com/Yukiniro/pagetime/pull/64) [`9b75b1a`](https://github.com/Yukiniro/pagetime/commit/9b75b1ac84ea8ad4348be29796481d543962d36f) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 界面不再讲计时规则：移除「如何计时」弹窗及概览、设置页、空状态里的三处入口，移除设置页的「统计方式」「本地与私密」和「本地数据概况」区块（撤回 [#54](https://github.com/Yukiniro/pagetime/issues/54) 的界面部分）。「播放音频时继续计时」和「空闲判定时间」两个开关保留，并入「浏览记录」。设置页底部新增一行链接，指向仓库里的计时规则与隐私说明（`docs/timing.zh-CN.md`、`docs/timing.md`、`PRIVACY.md`）。KPI 对比无法计算时只显示「—」，提示至多一句话。计时行为和已存数据不变。

- [#70](https://github.com/Yukiniro/pagetime/pull/70) [`0274340`](https://github.com/Yukiniro/pagetime/commit/02743409f5c835f44ca4b3d33b18e56493ce0f84) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 日期范围可以按当前天数前后翻一段。选中单独一天时，主图显示那一天的时间线；明细已经清掉的日子改为当天 24 小时的柱状图。

- [#77](https://github.com/Yukiniro/pagetime/pull/77) [`065467a`](https://github.com/Yukiniro/pagetime/commit/065467ae9df9b0d45c59fe9eded09bd73af37fab) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 设置里可以从 PageTime 备份 JSON 覆盖恢复本机账本和设置。选择本地文件并确认一次后，会替换全部记录；格式、版本或结构不对时不改动已有账本。不接受 CSV。预览里不能恢复。

- [#79](https://github.com/Yukiniro/pagetime/pull/79) [`5b44f6a`](https://github.com/Yukiniro/pagetime/commit/5b44f6ae6546ac3fd384432167bc47be79f0b14f) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点排行、站点详情和访问记录里的图标，在扩展中改为读取浏览器已经缓存的 favicon。安装包里原有的站点 SVG 仍然优先。读不到缓存，或图片加载失败时，仍显示地球占位。本地预览不请求这层缓存。新增 `favicon` 权限：只读浏览器图标缓存，不向站点或第三方图床拉取，也不上传。

- [#81](https://github.com/Yukiniro/pagetime/pull/81) [`74c5dee`](https://github.com/Yukiniro/pagetime/commit/74c5deeb077e253bbb0c16a26683fcd13c8900ae) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 单日时间线上的色块可以点开该站点的详情。不在图例前五名里的灰色时段按真实域名打开；图例中的「其他」仍然不能点。

- [#69](https://github.com/Yukiniro/pagetime/pull/69) [`f68a77c`](https://github.com/Yukiniro/pagetime/commit/f68a77cbd02a181fd11724e4932340cd3275cd72) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 点击工具栏图标会弹出小窗，而不再直接打开仪表盘。小窗显示当前站点今日时长和今日总时长，并可把该主机加入或移出忽略名单（白名单下是允许名单）、暂停或恢复记录、开关工具栏角标。再点一次名单按钮即撤销，不需要确认。已打开的仪表盘会被切到前台。没有 http(s) 主机名的页面只显示今日总时长。不新增权限，不注入内容脚本，不保存完整网址。

### Patch Changes

- [#73](https://github.com/Yukiniro/pagetime/pull/73) [`470bd4f`](https://github.com/Yukiniro/pagetime/commit/470bd4fc30a51fa62f643520f7deeb29ba2ff890) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 站点详情里的活跃时段跟着主图那一天显示。翻到昨天时，起止时间和时长属于那天；超过明细保留期的单日不再显示这一块。

- [#65](https://github.com/Yukiniro/pagetime/pull/65) [`1d455cd`](https://github.com/Yukiniro/pagetime/commit/1d455cd01c210e22fee989ac1e61523e732655c3) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 界面文案瘦身（[#62](https://github.com/Yukiniro/pagetime/issues/62)）：页头不再有副标题；设置项描述至多一句，语言、外观、工具栏角标等标题已说清的项不再附描述；「记录范围」只保留模式切换和当前模式的列表，子域名规则只写在输入框占位符里；空白名单警告缩为一句；域名错误提示缩为「请输入有效域名，如 example.com」；导出描述改为「下载本机全部记录」；各确认框只说后果「删除后无法恢复」。去掉热力图说明、站点详情抽屉副标题和时间线「空闲」图例，并删除未使用的文案。10 种语言同步，新增未使用文案检查测试。计时、存储和删除逻辑不变。

- [#71](https://github.com/Yukiniro/pagetime/pull/71) [`4cd1543`](https://github.com/Yukiniro/pagetime/commit/4cd1543dc19bdd5a5081517d06bd6ebe627547c2) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 窄屏（320px、375px 宽）下日期控件不再撑出横向滚动：中间的日期按钮可收缩，标题与日期上下两行排列，翻页按钮保持原尺寸可点、可键盘操作，无障碍标签不变；桌面宽度外观不变（[#70](https://github.com/Yukiniro/pagetime/issues/70) 评审意见）。只改展示，不改计时与存储。

- [#83](https://github.com/Yukiniro/pagetime/pull/83) [`85ba854`](https://github.com/Yukiniro/pagetime/commit/85ba854279564f5c80558ca4ae69f2c454777fb8) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 翻到非今天的单日时，主图时间线的标题、无障碍标签和空状态跟着那一天，不再写「今日」。今天，以及多日范围里的时间线，仍用原来的「今日」文案。

- [#75](https://github.com/Yukiniro/pagetime/pull/75) [`24c1592`](https://github.com/Yukiniro/pagetime/commit/24c1592b66e2c27fb396f22659090ea7e42157b7) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 时间线按当天活跃时长给站点上色：前五名各用一种互不相同的颜色，其余站点统一为中性灰，并在图例末尾显示「其他」。同一站点在不同日期的颜色可能不同。

- [#81](https://github.com/Yukiniro/pagetime/pull/81) [`74c5dee`](https://github.com/Yukiniro/pagetime/commit/74c5deeb077e253bbb0c16a26683fcd13c8900ae) Thanks [@Yukiniro](https://github.com/Yukiniro)! - 键盘可以打开单日时间线上每一段的站点详情：每一段都是可聚焦的按钮，Enter 和 Space 走与点击色块相同的站点。图例里没有按钮的灰色时段也包括在内。画布本身仍不进入 Tab 顺序。

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
