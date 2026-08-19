---
name: agents-memory-updater
description: Mine high-signal transcript deltas, route durable learnings to per-Nx-project `.cursor/rules/learned-<project>.mdc` files, and keep the incremental transcript index in sync. Project-level override of the upstream `continual-learning` plugin's subagent.
model: inherit
---

# Project-routed memory updater

Project-level override of the `continual-learning` plugin's subagent
(`~/.cursor/plugins/cache/cursor-public/continual-learning/.../agents/agents-memory-updater.md`).
Cursor follows project > user > plugin precedence for subagents, so the
plugin's `continual-learning` skill resolves this file when running in the
Tau workspace.

The Tau workspace harvested its prior `AGENTS.md` `Learned ...` sections
into per-domain `.cursor/rules/learned-*.mdc` files. New learnings must
route into those files by domain so the workspace context budget stays
bounded.

## Workflow

1. Read the project routing table at the bottom of this file.
2. Load the incremental index at `.cursor/hooks/state/continual-learning-index.json`.
3. Inspect only transcript files under
   `~/.cursor/projects/<workspace-slug>/agent-transcripts/` that are new
   or have newer mtimes than the index.
4. Extract durable, reusable items only:
   - recurring user preferences or corrections
   - stable workspace facts
5. For each candidate bullet:
   1. **Truncate to ≤200 characters.** If a single learning is genuinely
      longer, split it into multiple ≤200-char bullets, each focused on
      a single concrete claim. Never emit a bullet >200 chars.
   2. Match against the routing table by keyword/path. Route to the first
      matching `.cursor/rules/learned-<project>.mdc`.
   3. If no project anchor matches, route to the AGENTS.md fallback section
      (capped at 12 bullets, ≤200 chars each).
6. In each target file:
   - Update matching bullets in place (semantically similar = update, not
     append).
   - Add only net-new bullets.
   - Deduplicate semantically similar bullets after the merge.
   - Cap each section at 12 bullets. When at the cap, replace the
     lowest-signal bullet rather than expanding the section.
7. If a target rule file does not exist yet, create it with the standard
   frontmatter:
   ```yaml
   ---
   description: Auto-curated learned facts and preferences for the <project> Nx project
   globs:
     - '<projectRoot>/**'
   alwaysApply: false
   ---
   ```
   Use the project's actual root from `nx show project <name> --json`.
8. Refresh the incremental index. Remove entries for transcripts that no
   longer exist.
9. If the merge produces no changes, leave files unchanged but still
   refresh the index.
10. If no meaningful updates exist, respond exactly:
    `No high-signal memory updates.`

## Guardrails

- Plain bullet points only.
- **Per-bullet length cap: 200 chars.** This is the policy that prevents
  the file regrowing into a 138KB context tax. Split long learnings into
  multiple short bullets rather than emitting one long one.
- Per-section cap: 12 bullets.
- Each rule file maintains exactly two sections:
  - `## Learned User Preferences`
  - `## Learned Workspace Facts`
- No evidence/confidence tags, no metadata, no rationale blocks.
- No secrets, transient details, one-off corrections, or branch names.
- Do not modify the harvested verbatim bullets that exceed 200 chars in
  existing files; only enforce the cap on new or rewritten bullets.

## Routing table

| Project / Domain                   | Target file                                                              | Glob root                                                                                                                                         | Trigger keywords                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui`                               | `.cursor/rules/learned-ui.mdc`                                           | `apps/ui/**`                                                                                                                                      | apps/ui, React Router, Tailwind, dockview, monaco, file manager, chat-message, chat-tool, viewport, react-virtuoso, IndexedDB, paneview                                      |
| `api`                              | `.cursor/rules/learned-api.mdc`                                          | `apps/api/**`                                                                                                                                     | apps/api, NestJS, Fastify, Drizzle, Better Auth, Socket.IO, LangGraph, OTEL, publications, fly.io                                                                            |
| `chat`                             | `.cursor/rules/learned-chat.mdc`                                         | `libs/chat/**`, `apps/api/app/api/chat/**`                                                                                                        | libs/chat, tool-input.registry, RPC schemas, message.schema, chat tool middleware, agent-safeguards                                                                          |
| `runtime`                          | `.cursor/rules/learned-runtime.mdc`                                      | `packages/runtime/**`, `packages/kernels/**`, `repos/opencascade.js/**`, `repos/replicad/**`, `repos/assimpjs/**`                                 | packages/runtime, packages/kernels, defineKernel, defineTranscoder, RuntimeClient, transport, capabilities manifest, OCJS, replicad, opencascade, assimpjs, OCCT, WASM build |
| `react`                            | `.cursor/rules/learned-react.mdc`                                        | `packages/react/**`                                                                                                                               | packages/react, useRender, useGeometryExport                                                                                                                                 |
| `cli`                              | `.cursor/rules/learned-cli.mdc`                                          | `packages/cli/**`                                                                                                                                 | packages/cli, taucad CLI, headless export                                                                                                                                    |
| `converter`                        | `.cursor/rules/learned-converter.mdc`                                    | `packages/converter/**`                                                                                                                           | packages/converter, glTF, USDZ, STEP, STL, 3MF                                                                                                                               |
| `memory`                           | `.cursor/rules/learned-memory.mdc`                                       | `packages/memory/**`                                                                                                                              | packages/memory, SharedPool, SharedMemoryArena                                                                                                                               |
| `telemetry`                        | `.cursor/rules/learned-telemetry.mdc`                                    | `packages/telemetry/**`                                                                                                                           | packages/telemetry, OTEL definitions, metric registry                                                                                                                        |
| `json-schema`                      | `.cursor/rules/learned-json-schema.mdc`                                  | `packages/json-schema/**`                                                                                                                         | packages/json-schema, JSON Schema inference                                                                                                                                  |
| `fs-client`                        | `.cursor/rules/learned-fs-client.mdc`                                    | `packages/fs-client/**`                                                                                                                           | packages/fs-client, FileContentService, FileTreeService                                                                                                                      |
| `filesystem`                       | `.cursor/rules/learned-filesystem.mdc`                                   | `packages/filesystem/**`                                                                                                                          | packages/filesystem, InMemoryFileTree, ResourceWriteQueue                                                                                                                    |
| `openrscad`                        | `.cursor/rules/learned-openrscad.mdc`                                    | `packages/kernels/openrscad/**`                                                                                                                   | packages/kernels/openrscad, @taucad/openrscad                                                                                                                                |
| `types`                            | `.cursor/rules/learned-types.mdc`                                        | `libs/types/**`                                                                                                                                   | libs/types, idPrefix, FileExtension, mimeTypes                                                                                                                               |
| `utils`                            | `.cursor/rules/learned-utils.mdc`                                        | `libs/utils/**`                                                                                                                                   | libs/utils, generatePrefixedId, LruMap, dispose                                                                                                                              |
| `units`                            | `.cursor/rules/learned-units.mdc`                                        | `libs/units/**`                                                                                                                                   | libs/units, units of measurement                                                                                                                                             |
| `lsp-fs`                           | `.cursor/rules/learned-lsp.mdc`                                          | `apps/libs/lsp/**`, `apps/libs/lsp-fs/**`, `libs/api-extractor/**`                                                                                | apps/libs/lsp-fs, sync-fs, FileType protocol, monaco LSP, language-fs-bridge, monaco-ts-worker                                                                               |
| `oxlint`                           | `.cursor/rules/learned-tooling.mdc`                                      | `libs/oxlint/**`, `tools/**`, `nx.json`, `.github/**`, `.oxlintrc.json`, `.oxfmtrc.json`, `scripts/**`                                            | libs/oxlint, custom oxlint rules, ESLint plugin, frontmatter validate, Nx daemon, GitHub Actions                                                                             |
| `vite`                             | `.cursor/rules/learned-vite.mdc`                                         | `libs/vite/**`                                                                                                                                    | libs/vite, vite-plugin, oxcRuntimeEsmPlugin                                                                                                                                  |
| `rpc`                              | `.cursor/rules/learned-rpc.mdc`                                          | `packages/rpc/**`                                                                                                                                 | packages/rpc, Channel primitive, RpcCall                                                                                                                                     |
| `graphics-stack` (cross-project)   | `.cursor/rules/learned-graphics-stack.mdc`                               | `apps/ui/app/components/geometry/**`, `apps/ui/app/machines/graphics.machine.ts`, `packages/runtime/src/utils/export-glb.ts`, `packages/react/**` | WebGPU, Three.js, TSL, NodeMaterial, gltf-edges, screenshot-capability, viewport renderer                                                                                    |
| `deployment` (no Nx project)       | `.cursor/rules/learned-deployment.mdc`                                   | `repos/cloud-infra/**`, `apps/api/fly.*.toml`, `apps/ui/netlify.toml`, `apps/ui/server.ts`, `.github/workflows/**`, `infra/**`                    | fly.toml, netlify.toml, terraform, Cloudflare DNS, GitHub Actions, COOP/COEP                                                                                                 |
| `docs` (no Nx project)             | `.cursor/rules/learned-docs.mdc`                                         | `docs/**`, `apps/ui/content/docs/**`                                                                                                              | docs/policy, docs/research, docs/architecture, frontmatter, Fumadocs                                                                                                         |
| `test-authoring` (cross-project)   | `.cursor/rules/learned-test-authoring.mdc`                               | `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`                                                                                                   | TDD, vitest, jsdom, Radix Collapsible, mocking                                                                                                                               |
| `typescript` (cross-project)       | `.cursor/rules/learned-typescript.mdc`                                   | `**/*.ts`, `**/*.tsx`                                                                                                                             | type assertion escape hatches, JSDoc, public API, Zod schemas, z.input                                                                                                       |
| _(fallback — truly cross-cutting)_ | `AGENTS.md` `## Learned User Preferences` / `## Learned Workspace Facts` | _(always-on)_                                                                                                                                     | nothing else matched                                                                                                                                                         |

When a learning could plausibly route to multiple files, choose the
**most-specific** match (e.g. a fact that mentions both `apps/ui` and
`packages/runtime` but is dominated by Three.js content goes to
`learned-graphics-stack.mdc`, not `learned-ui.mdc`).

## Output

- Updated `.cursor/rules/learned-<project>.mdc` files (and/or `AGENTS.md`
  fallback sections) and `.cursor/hooks/state/continual-learning-index.json`
  when there are updates.
- Otherwise exactly `No high-signal memory updates.`
