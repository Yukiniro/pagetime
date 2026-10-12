# PageTime 组件迁移验收

final result: passed

范围：用户要求的 shadcn + Base UI 迁移与 Dropdown Menu 替代 Select。此结论只覆盖界面及已执行的检查，不代表真实扩展安装后的采集端到端验证。

## 视觉依据

以迁移前已确认的 PageTime 页面 `component-reference.jpg` 为参考，用户选择的原始方案保留于 `design-reference.png`。当前截图 `preview.jpg` 为 1354 × 964；参考与实现均按相同尺寸等比例呈现，联合图 `component-comparison.jpg` 为左参考、右实现，2724 × 964，已打开检查。

桌面 CSS 视口 1356 × 1024，DPR 约 3.02。截图裁去底部空白，保留顶部状态、完整排行和底部主操作。两侧均为最近 7 天 / 记录开启 / 同一演示数据；没有为匹配稿件伪造统计数值。移动证据 `preview-mobile.jpg` 为 390 × 844 CSS 视口，文档宽 385，表格在自身容器滚动。

## 五项视觉检查

- 字体与层次：保留系统中文字体、大标题、大时长和区块标题层次；迁移后补回 Tailwind reset 去掉的标题字重。
- 布局与间距：保留左侧浅蓝导航、记录状态、汇总、趋势、今日时间线、排行的顺序；底部主操作完整可见。移动顶部导航间距已调整，无整页横向溢出。
- 颜色：主题 token 保留蓝色主操作、浅蓝导航、灰色辅助字与边线。主色 #1f63d8、辅助字 #64748b；图表域名颜色保持一致。
- 图标与图像：站点 SVG 仍随包分发；Avatar 显示本地图标并提供失败回退。产品图标保留 Phosphor，shadcn 内部使用 Lucide。
- 文案与数据：产品名 PageTime、今日时间线、域名搜索及记录口径保留。所有统计值由原模型计算，存储键与记录格式未改。

Button、Sidebar、DropdownMenu、Dialog、AlertDialog、InputGroup、Table、Alert、Empty、Avatar、ScrollArea 使用官方 shadcn base-nova 源码及 Base UI；只适配项目路径别名。移除旧的手写按钮、select、dialog、输入框与表格控件样式。产品布局和 ECharts 图表继续复用。

## 实际交互验证

通过内置浏览器及断言检查：

- DropdownMenu 鼠标选择今天 / 30 天、方向键展开和移动、Enter 选择 7 天，单选标记正确，选择后菜单收起；390px 宽菜单处于视口内。页面原生 select 数量为 0。
- Dialog 打开详情、Escape 关闭、焦点回到原按钮；详情跳转访问记录，搜索框带入对应域名。
- 搜索无结果状态、清空搜索、切换设置。
- AlertDialog 有可访问标题，取消后焦点回到清空数据按钮。
- 暂停 / 继续后界面状态正确。
- 最终页面浏览器 warn/error 日志为空。

浏览器未点击最终“确认清空”，以免删除已有数据；清空命令的后台与演示存储逻辑由原有自动测试覆盖。清空失败时保留确认框和错误提示，成功后才关闭。

## 构建与自动检查

- TypeScript 检查、WXT Chrome MV3 打包、Vite 预览构建及 12 项自动测试均已通过。
- 构建仍提示约 1.01 MB 的界面 chunk 超过建议值，其中包括图表及组件；当前为本地扩展，未新增拆包结构。压缩插件包约 355 KB。
- `components.json` 可供后续官方 CLI 添加组件；WXT 与 Vite 共用 @app/* 路径和 Tailwind 4 主题。

没有剩余影响本次组件迁移的 P0/P1/P2 问题。未执行完整屏幕阅读器审计、全部设备及异常存储 UI 注入测试；真实 Chrome/Edge 安装、长时间休眠恢复和商店审核仍未验证。没有发布到商店或 Sites。
