# AGENTS.md

## Commands

```bash
pnpm nx lint <project>                    # Lint (oxlint then eslint)
pnpm nx lint <project> --files=<path>     # Lint specific file(s) or glob
pnpm nx test <project> --watch=false      # Test
pnpm nx typecheck <project>              # Typecheck
pnpm nx build <project>                  # Build
pnpm nx serve ui                         # Web UI: runs production server after build (`NODE_ENV=production`)
pnpm nx serve example-electron           # Electron PoC: builds then launches packaged app (`NODE_ENV=production`)

pnpm infra:up / infra:down / infra:reset  # PostgreSQL + Redis (Docker)
pnpm db:generate                          # Generate Drizzle migrations
pnpm db:migrate                           # Run migrations
pnpm ci:affected                          # CI: affected tests, builds, lint, typecheck
pnpm docs:validate                        # Validate policy/research doc frontmatter
```

## Docs Symlink Git Boundary

- `docs/research` and `docs/reference` are symlinks into `repos/tau-brain`; write through `docs/...`, validate from Tau root, but check git with `git -C repos/tau-brain status --short -- research/<file>` or `reference/<file>`.

## Architecture

Tau is the AI-native CAD platform for the web (`tau.new`), built as an Nx monorepo with pnpm workspaces.

- **Frontend**: React Router v7, React 19, TypeScript, Tailwind CSS, Fumadocs
- **Backend**: NestJS API with Fastify, PostgreSQL (Drizzle ORM), Redis, Better Auth
- **CAD Engine**: Multi-kernel runtime (Replicad, JSCAD, Manifold, OpenSCAD, KCL)
- **AI**: LangGraph agent with tool-use (OpenAI, Anthropic, Vertex AI, Ollama, Together AI, Cerebras)

### Project Map

| Path                    | Description                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ui`               | React Router v7 web app (CAD editor, file manager, AI chat, docs)                                                                                                         |
| `apps/api`              | NestJS API (auth, database, chat WebSocket, LangGraph agent)                                                                                                              |
| `packages/runtime`      | Multi-kernel CAD runtime — consumed as source via package.json exports                                                                                                    |
| `kernels/openscad`      | `@taucad/openscad` — standalone GPL-2.0-or-later OpenSCAD kernel (isolates `openscad-wasm-prebuilt` from MIT runtime)                                                     |
| `packages/react`        | React hooks for `@taucad/runtime` (useRender, useGeometryExport)                                                                                                          |
| `packages/cli`          | `@taucad/cli` — headless CAD CLI (`taucad export <file> --ext=glb`)                                                                                                       |
| `packages/converter`    | CAD file conversion (STL, STEP, IGES, DXF, glTF, USDZ)                                                                                                                    |
| `packages/memory`       | Shared-memory primitives (`SharedPool`, `SharedMemoryArena`)                                                                                                              |
| `packages/telemetry`    | OTEL metric definitions, ingest schemas, observability runtime middleware                                                                                                 |
| `packages/json-schema`  | JSON to JSON Schema inference                                                                                                                                             |
| `packages/fs-client`    | UI file-manager facades (`FileContentService`, `FileTreeService`, `WorkerChangeChannel`); depends on `@taucad/filesystem`                                                 |
| `libs/chat`             | AI chat tool schemas, message schemas, RPC definitions; `src/schemas/agent-config.schema.ts` is the wire-contract entry (see `docs/policy/chat-request-config-policy.md`) |
| `libs/types`            | Shared TypeScript types (API, project, CAD, file, graphics)                                                                                                               |
| `libs/utils`            | Shared utilities (ID generation, path, file, schema, dispose)                                                                                                             |
| `libs/units`            | Units of measurement and conversions                                                                                                                                      |
| `libs/lsp-fs`           | LSP/workspace FS protocol (`@taucad/lsp-fs/protocol`, `sync` SAB channel)                                                                                                 |
| `libs/lsp`              | Monaco LSP wiring: JSON-RPC bridge, URI workspace, TS worker entry, `lsp-fs` sync host                                                                                    |
| `apps/ui/content/docs/` | Docs site (Fumadocs): `runtime/` and `editor/` sections                                                                                                                   |

## Skills

Project skills in `.agents/skills/` provide guided workflows. Read the relevant `SKILL.md` when performing these tasks:

| Skill                   | When to use                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `adversarial-review`    | Red-teaming `docs/research` blueprints before `/superplan`; apply only by explicit request |
| `create-policy`         | Writing or updating `docs/policy/*.md` documents                                           |
| `create-research`       | Writing or updating `docs/research/*.md` investigation documents                           |
| `adding-tools`          | Adding new tools to the AI chat system                                                     |
| `create-package`        | Scaffolding new `@taucad/*` packages via workspace generator                               |
| `create-vite-plugin`    | Adding a Vite plugin to `@taucad/vite`                                                     |
| `add-monaco-language`   | Adding Monaco + Shiki highlighting for a new file extension / TextMate grammar             |
| `new-kernel`            | Adding a first-party CAD kernel to `@taucad/runtime`                                       |
| `package-release`       | Versioning, building, publishing `@taucad/*` packages                                      |
| `repos`                 | Investigating dependency source code; cloning, adding, or exploring repos via `repos.yaml` |
| `submit-pr`             | Submitting draft PRs to upstream dependency forks                                          |
| `pr-review-coordinator` | Fixing PR review comments from GitHub                                                      |
| `typescript-overloads`  | Resolving TS2322 overloaded function type errors                                           |
| `langgraph`             | Questions about LangGraph and agentic AI                                                   |
| `rebuild-kcl-wasm-lib`  | Rebuilding/republishing `@taucad/kcl-wasm-lib` from `taucad/modeling-app`                  |

## Conventions

- Early returns to reduce nesting
- Composition over inheritance; functional programming patterns preferred
- Const declarations over function declarations
- `cn()`/`clsx` for conditional classNames, not ternary
- Max 3 parameters per function; bundle extras into an options object
- Vitest for tests; jsdom env for UI, node env for API
- Hybrid oxlint + ESLint linting; formatting via oxfmt (`.oxfmtrc.json`), not ESLint
- PostgreSQL with Drizzle ORM; schema in `apps/api/app/database/`; auth tables via Better Auth
- Investigate dependency source via `repos/` (managed by `repos.yaml` and `pnpm repos`), not `node_modules`. Use the `repos` skill to clone, add, or explore repos.

## Learned User Preferences

<!-- Capped at 12 bullets, ≤200 chars each. Cross-cutting only.
     Project-scoped preferences route to .cursor/rules/learned-<project>.mdc.
     See .cursor/agents/agents-memory-updater.md for routing logic. -->

- Pickup-from-prior-transcript planning: hand off via prior chat's `.jsonl` + last 5 user messages (`/superplan continuation @<transcript> @<doc>`); Cursor plan-mode owns plan-file location.
- Eigenquestion reframe rule: when every proposed option overengineers the problem, step back and reframe rather than picking the least-bad workaround (e.g. "work WITH LangChain, no tricks").
- Follow policy docs when applicable: testing-policy, library-api-policy, xstate-policy, lint-policy, react-testing-policy, filesystem-policy, commit-policy, typescript-policy, agents-md-policy, context-engineering-policy, filesystem-context-policy, jsdoc-policy, documentation-policy
- When faced with scope-creep open questions during MVP planning, default to "defer to later" for non-essential features so the initial cut stays tight — the user explicitly catalogues which questions to defer vs answer, expecting the agent to honour the boundary in the resulting plan; reuse existing UI patterns rather than reinventing (e.g. `copy-button.tsx` tick-on-success animation for Copy/Copy-Link buttons, `release-badge.tsx` purple ramp for "less harsh" sign-in/auth messaging, `projects_.$id_.preview/route.tsx` for export-control + responsive parameter layouts) — when a similar pattern already exists, point at it explicitly rather than authoring a fresh component; design for multi-environment from the start — never use an `is_prod` boolean in IaC/code; use explicit `staging`/`prod-us`/`prod-eu` discriminators so future regional expansion doesn't require renaming; sharing/publish controls must NOT gate on render completion (people deliberately share broken projects for debugging help) — gating share-on-success is a UX smoking-gun bug. When asked to explore or investigate, present findings and analysis first; do not jump to code changes until implementation is explicitly requested; dig for the concrete root cause (the smoking gun) — targeted fixes only, not broad investigation plans; for perpetual-loading / stuck-spinner bugs, never route on file extension — content-sniff (BOM + NUL heuristic on first 512 bytes, VS Code `detectEncodingFromBuffer` style) and surface every outcome through a typed discriminated union so the editor render gate covers every state; validate hypotheses directly in source code (e.g., read emscripten/embind internals), no assumptions allowed; assess whether issues stem from incorrect implementation or broken architecture before fixing; favor established standards over custom specs for platform capability design (e.g. SysML v2 textual notation for durable intent paired with STEP AP242 geometry evidence rather than inventing a design-spec format); never band-aid — fix at source rather than post-processing; verify changes actually work (visually for UI, at runtime for logic) before claiming success; prefer the most correct architectural fix over the simplest — correctness is not negotiable; during plan execution refuse `pragmatic`/`minimal`/`simple`/`for now` shortcuts and work to architectural completeness through the entire todo list with no early stopping (user explicitly grants unlimited time for sweeping migrations on unreleased APIs — no backwards-compat or deprecation phases); large refactors are tracked in plan files at `/Users/rifont/.cursor/plans/<name>_<hash>.plan.md` with todos pre-created externally — when invoked via "Implement the plan as specified" prompts the agent must NEVER edit the plan file itself (plans are the user-curated source of truth) and must only mark todos in*progress/completed via the todo tool; deeply review every research doc → plan → "implement plan" cycle as a continuum (the user iteratively refines research docs through Q+A loops before generating a plan, then auto-resumes the agent with the plan attached) and disregard MD line-length limits when updating research/blueprint docs at the user's request; deletion of superseded research docs is part of the cleanup pass (e.g. consolidating `runtime-reconnect-error-gap.md` into a v5 audit doc); adversarially review proposed approaches before committing to implementation; question manual additions when automated code generation should handle it; code generators must remain generic at the C++ type level — no domain-specific class patterns, use standard type heuristics (templates, typedefs, inheritance) instead; avoid regex-based assertions in tests bound for upstream PRs — they are hacky and indefensible in review, prefer principled assertions on parsed structures; for cross-pipeline parity (e.g. replicad vs opencascade glTF mesh), assert exact byte-for-byte output via TDD before fixing the underlying cause; also prefer round-trip geometry tests (export → re-import → re-mesh) over byte-count `>0` checks for export pipelines; geometry/test-suite tools must have non-overlapping semantic intent — the LLM should never be forced to choose between two tests that achieve the same thing (e.g. mesh-continuity must measure disconnected-mesh count, not raw mesh count, so adding parts to a unicolor model never spuriously fails the test); geometry tests must derive results purely from the glTF mesh data — never rely on kernel-supplied metadata or glTF `extras` fields (e.g. `assemblyParts` must compute overlaps from geometry alone) so future kernels only need to emit geometry, not extra annotations; geometry-test failure feedback aimed at the LLM must be **spatially descriptive**, not just a count mismatch — when `connected-components` (or any spatial-cardinality test) fails, surface each disconnected component's bounding-box min/max/center plus its color so the model can reason about \_which* part is missing/extra in space, and apply the same enrichment principle to other geometry tests so the LLM is never left with a bare scalar mismatch (the "put yourself in the shoes of the LLM" rule); the `connected-components` analyser must spatially weld vertex positions (mirroring the neighbor-grid technique in `packages/geospec-engine/src/mesh/_internal/spatial-welding.ts`) before running union-find — OpenSCAD's `groupFacesByColor` in `packages/runtime/src/utils/export-glb.ts` writes unwelded indices (every triangle gets 3 fresh positions), so a vertex-shared union-find treats each triangle as isolated; without spatial welding, OpenSCAD's color-grouped primitives report 1 component per color regardless of how many physically disjoint sub-meshes exist, while replicad/OCCT escape this because each `ShapeConfig` becomes its own primitive — splitting into spatially-disjoint sub-primitives belongs in the analyser layer (provider-agnostic, no kernel cooperation), not in the export pipeline; chat-tool descriptions follow Claude Code's "When NOT to use:" pattern alongside the primary purpose for context-engineering DX; when removing language that "encouraged the LLM to skip a test" because the geometry unit lacked a top-level export, push the LLM the opposite way — instruct it to add a kernel-specific top-level export so the file becomes testable, never to drop the test; tool descriptions point the LLM at the canonical schema (e.g. `<test_requirements>` for `test_model`) as a single source of truth rather than re-asserting requirement/format guidance in prose — tool-description text stays identical across kernels, with cached tool wrappers differing only via error-path routing (`getKernelConfig`); streaming UI wrappers (e.g. `ChatActivitySection` "Exploring…" header) must be a function of the **stable identity** of the underlying run (the first aggregatable group), never of a per-render count like `run.groups.length` that flips as parts arrive — wrap-by-count produces visible mount/unmount flicker mid-stream and loses local state (`userToggleState`, animation timing); once the wrapper is visible for a research run it must remain mounted until a non-foldable category breaks the run, with all child collapsibles signalled via a React context (e.g. `ActivityFoldContext.disableInnerFold`) to skip their own chrome rather than relying on emergent state; remove temporary investigation logs once a diagnosis pass concludes — keep only the durable plumbing that surfaces real-world WASM/render/network errors clearly (e.g. relaxed-simd parse failures, OCJS init faults, FileManager worker errors with named fields rather than `undefined undefined undefined`)

## Learned Workspace Facts

<!-- Capped at 12 bullets, ≤200 chars each. Cross-cutting only.
     Project-scoped facts route to .cursor/rules/learned-<project>.mdc. -->

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
