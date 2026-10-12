# Prototype Instructions

Product name: PageTime. Preserve existing storage keys and record formats when changing branding.

Use the official shadcn Base UI components for available primitives. Prefer DropdownMenu for dropdown choices; avoid Select and native select. Keep the WXT extension and local preview on the same component and theme foundation.

The user selected the light blue analytics design and added today's browsing timeline. Preserve this design. Deliver a real WXT Chrome/Edge extension as well as a clearly labeled local demo using the same React components. `npm run build` builds WXT; `npm run build:preview` builds the Sites-ready demo. Keep the starter's preview runtime intact.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 工程设计原则

- 不要维护向后兼容性。应移除废弃路径，而不是增加兼容层、回退方案或迁移逻辑。
- 选择能够完全满足当前需求的最简单实现。避免臆测性的抽象、配置和间接层。
- 分层构建系统。从能够端到端运行的最小版本开始，在已有可用产品的基础上逐步增加新能力。不要为了尚未完成的复杂性牺牲一个正常工作的产品。
- 保持组件模块化，并明确分离各项关注点。
- 当成熟且维护良好的库能够降低整体复杂度或提高可靠性时，应优先使用它们。没有明确理由时，不要重新实现常见功能。
- 在自行实现或新增软件包之前，优先利用项目中已有的依赖。没有检查库的文档和类型定义之前，不要假设它不具备某项能力。
- 从长期角度做架构决策。不要接受只解决眼前问题、以后还计划替换的临时方案。
