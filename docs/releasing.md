# PageTime 版本发布

扩展以根 `package.json` 的版本为唯一来源，WXT 生成 manifest 版本，ZIP 和 Git 标签使用同一版本。预览沿用同一套组件；本流程只发布 GitHub Chrome ZIP，兼容 Edge 加载，不提交浏览器商店，也不部署 Sites。

## 记录变更

用户可见的修复附 patch changeset，完整新功能附 minor changeset；major 需先由维护者确认。运行 `npm run changeset`，选择 `pagetime` 并描述最终用户行为。只改工程或文档且不需要发版时，使用 `npm run changeset -- --empty`。

普通 PR 的现有 CI 增加 changeset 检查和扩展产物验证。空 changeset 表达免发布意图，不产生版本升级；维护者仍需审核改动是否应发版。

版本 PR 只同步 lockfile 的版本元数据，保持已审核的依赖图。依赖变更在业务 PR 中通过 npm 更新，并以 `npm ci` 验证完整锁文件。

## 创建版本 PR

1. 将业务 PR 和 changeset 合入 main。
2. 在 GitHub Actions 选择 Release，使用 main 分支手动运行。Changesets 创建或更新 `changeset-release/main` 的普通版本 PR。
3. 核对版本号、CHANGELOG 和 CI，再合并版本 PR。版本 PR 创建后新增的 changeset，需要再次手动运行 Release 才会纳入。

普通提交不会自动启动发版。没有待发布变更或只有空 changeset 时，不创建产品版本或 GitHub Release。

仓库 Actions 设置需要允许 GitHub Actions 创建 PR。使用默认 GITHUB_TOKEN 创建的 PR，可能需要维护者在 PR 页面批准工作流运行；无须为此创建个人访问令牌。main 规则应明确匹配 main，并要求现有 `typecheck, test, and build` 检查通过。

## 合并后发布

发布工作流检出版本 PR 的准确合并提交。`scripts/release.mjs` 要求 `RELEASE_SHA` 与当前 HEAD 一致且工作区干净，并在写入远端前完成类型检查、预览构建、全部测试、WXT ZIP 构建与 ZIP 内容校验。

产物检查覆盖版本、MV3、权限、无痕限制、后台入口、dashboard 及其引用、图标尺寸和十语言 manifest 文案。ZIP 内 manifest 必须直接位于根目录。

构建成功后才推送 `v版本号` 标签，创建草稿 Release、上传 ZIP 和 `SHA256SUMS`，确认两份附件都完成后再公开。`SHA256SUMS` 是一行 GNU `sha256sum` 文本：小写 SHA-256、两个空格、ZIP 文件名。摘要按已经上传的那份 ZIP 字节计算。重新打包可能改容器时间戳，文件内容一致时不替换已有 ZIP，也不按新容器重写校验和。标签必须指向同一合并提交；已有标签冲突时停止，不覆盖标签。

## 失败与恢复

- 检查或构建失败：修复问题并通过新的版本 PR 发布；失败前不会创建标签或 Release。
- 标签已推送、Release 尚未创建：重跑对应版本 PR 合并事件的工作流。
- 上传或公开失败：重跑同一工作流，补齐已有草稿、缺失 ZIP 或缺失 `SHA256SUMS`。两份附件都完成前草稿不公开。
- Release 已完整公开：重跑会核对标签、ZIP 内所有文件内容，以及 `SHA256SUMS` 是否等于已发布 ZIP 的 SHA-256。不重复创建或替换附件。ZIP 时间戳和压缩方式不同不算文件内容变化。
- 已有 ZIP 内容与同一提交的重建结果不同，或已有 `SHA256SUMS` 与已发布 ZIP 不一致：停止并保留远端附件，先调查原因，避免覆盖已分发版本。
- 网络或鉴权失败：按失败处理。脚本通过 GitHub 的 Release 列表按 `tag_name` 查找（含草稿；按标签查询的接口不返回草稿，草稿一定 404），列表中没有该标签才表示 Release 尚不存在。同一标签出现多个 Release 时停止，由维护者先清理重复项。
- 修复只对之后的版本生效：发布工作流检出版本 PR 的合并提交，重跑时仍使用该提交里的 `scripts/release.mjs`。受旧脚本缺陷影响的版本（v1.1.0）重跑同样会失败，需要维护者在 GitHub 上核对标签与两份附件后手动公开该草稿；不要删除或重建标签、Release 或附件。

GitHub Release、浏览器安装验证、商店提交、审核通过和公开上线是不同验收层。本地测试和 GitHub ZIP 发布不能替代真实 Chrome / Edge 采集及休眠恢复验证。
