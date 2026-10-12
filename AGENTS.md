# Prototype Instructions

Product name: PageTime. Preserve existing storage keys and record formats when changing branding.

Use the official shadcn Base UI components for available primitives. Prefer DropdownMenu for dropdown choices; avoid Select and native select. Keep the WXT extension and local preview on the same component and theme foundation.

The user selected the light blue analytics design and added today's browsing timeline. Preserve this design. Deliver a real WXT Chrome/Edge extension as well as a clearly labeled local demo using the same React components. `npm run build` builds WXT; `npm run build:preview` builds the Sites-ready demo. Keep the starter's preview runtime intact.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
