---
"pagetime": minor
---

设置里新增「导出数据」：「导出 JSON」下载完整账本（全部表、记录状态和设置，带 `format`、`schemaVersion`、`exportedAt`、时区和扩展版本），「导出 CSV」下载每天每个主机名一行的汇总（`date,host,active_ms,visits`，UTF-8 带 BOM）。文件在页面里本地生成后直接下载，不联网，也不新增权限；只导出，不含导入。
