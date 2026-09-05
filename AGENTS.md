# AGENTS.md

## Commands

Run from the workspace root with pnpm and the actual Nx project name:

```bash
pnpm nx show projects
pnpm nx show project <project>           # Owners, targets and configuration
pnpm nx lint <project>                  # oxlint then ESLint
pnpm nx lint <project> --files=<path>    # Focused lint
pnpm nx test <project> --watch=false
pnpm nx typecheck <project>
pnpm nx build <project>                 # When the project has this target
pnpm nx affected -t lint test build typecheck
pnpm docs:validate                      # Policy/research frontmatter
pnpm nx run scripts:validate-agent-config
pnpm nx serve ui                        # Production server after build
pnpm infra:up                           # Local PostgreSQL and Redis
pnpm infra:down
pnpm db:generate
pnpm db:migrate
```

Use Nx tasks and workspace generators; inspect help/source for unfamiliar flags. Tau owns its instructions; Nx agent provisioning is retired.

## Scope and authority

Before editing a path, read every `AGENTS.md` from the repository root through that path's parent, in order. For several paths, read the union of those chains. Apply the policy conditions below and include applicable instruction paths in delegated briefs. Start a bounded native task in its narrowest suitable directory when supported; root-started tasks still read target descendants explicitly.

System, developer and current user instructions take precedence. [DESIGN.md](DESIGN.md) governs user-facing design. Applicable normative policies cannot be weakened by operational AGENTS files or skills. Local AGENTS narrow ancestor operation within their directory, consistently with those policies; skills implement that task contract. Resolve contradictions at the owning source.

Every canonical AGENTS has an adjacent `CLAUDE.md` containing only `@AGENTS.md`. Shared skills live in [.agents/skills](.agents/skills); `.claude/skills` is a discovery alias. Native permissions, trust and tool availability remain host responsibilities.

## Architecture and owners

Tau is an AI-native CAD platform in an Nx/pnpm monorepo. Project configuration and package exports define current interfaces.

- [apps/ui](apps/ui): CAD workspace and browser composition; `app/workers/agent-host.impl.ts` wires the host/tools
- [packages/agent-host](packages/agent-host): Portable CAD-agent execution and session log; `src/index.ts`, browser/node entrypoints
- [libs/agent-tools](libs/agent-tools): Host-neutral tool registry, skills, GeoSpec and capture
- [libs/chat](libs/chat): Wire/tool schemas, prompts and RPC contracts
- [apps/api](apps/api): NestJS/Fastify auth, billing, storage and models; `app/api/chat/chat.service.ts` owns name/commit generation
- [apps/desktop](apps/desktop): Electron desktop composition and packaging
- [apps/docs](apps/docs): Static documentation site, content and API/prose gates
- [apps/libs](apps/libs): Private application capabilities, including billing hooks, fs-client, converter and LSP
- [packages/runtime](packages/runtime): Multi-kernel runtime, clients, transports, artifacts and plugin contracts
- [packages/plugins](packages/plugins): Standalone kernel/bundler/middleware/transcoder toolkits; available toolkits differ from product-selected kernels
- [packages](packages): Public host/jobs/GeoSpec/React/CLI/Three.js APIs
- [packages/ui](packages/ui): Published design system and `styles/tokens.css`, governed by DESIGN
- [libs](libs): Shared filesystem/events/RPC authority, contracts, memory, telemetry, types and tooling
- [tools](tools), [scripts](scripts), [.github](.github), [infra](infra): Generators/build tooling, maintenance/validation, CI/release and infrastructure

Nothing under `packages/**` or `libs/**` depends on `apps/libs/**`. Query project configuration for names, exports and targets.

## Required policy routes

Read these exact owners when the task touches the corresponding concern:

- TypeScript/JavaScript or declarations: [lint](docs/policy/lint-policy.md), [TypeScript](docs/policy/typescript-policy.md), [JSDoc](docs/policy/jsdoc-policy.md); public APIs also [library API](docs/policy/library-api-policy.md)
- Tests/specs/harnesses: [testing](docs/policy/testing-policy.md); React/jsdom also [React testing](docs/policy/react-testing-policy.md)
- XState machines or actors: [XState](docs/policy/xstate-policy.md)
- React/Tailwind/tokens/accessibility: [DESIGN](DESIGN.md), [React](docs/policy/react-policy.md), [UI](docs/policy/ui-policy.md), [color](docs/policy/color-policy.md), [accessibility](docs/policy/accessibility-policy.md)
- Prompts/tools/transcripts/compaction/offloading: [context engineering](docs/policy/context-engineering-policy.md), [filesystem context](docs/policy/filesystem-context-policy.md)
- App-library placement/manifests: [workspace projects](docs/policy/workspace-project-policy.md); use the `create-package` skill
- Event fan-out across filesystem, runtime, app facades or UI services: [event fan-out](docs/policy/event-fanout-policy.md)
- Filesystem authority and watches: [filesystem](docs/policy/filesystem-policy.md)
- Three.js/TSL, cameras, materials, graphics machines or capture: [graphics backend](docs/policy/graphics-backend-policy.md)
- Geometry assertions/GeoSpec: [GeoSpec](docs/policy/geospec-policy.md), [testing](docs/policy/testing-policy.md)
- Policy/research/MDX documents: [documentation](docs/policy/documentation-policy.md); use `create-policy` or `create-research`; docs-site gates apply to published content
- AGENTS/CLAUDE, skills, native agent/MCP config: [agent instructions](docs/policy/agents-md-policy.md), [MCP capabilities](docs/policy/mcp-tool-budget-policy.md); use `create-skill` for procedures
- Dependencies/commits/releases: [npm](docs/policy/npm-policy.md), [commit](docs/policy/commit-policy.md); applicable procedure and action authorization
- Generated outputs or temporary files: [tool output locations](docs/policy/tool-output-location-policy.md)

## Skills and collaboration

Use relevant shared skills within the authorized task, including composing their required helpers. Model invocation is enabled by default; loading does not authorize publication, external messages, destructive actions or expanded scope. Any manual-only exception needs a deliberate user requirement recorded with its native metadata; do not bypass a native invocation denial by copying its body.

Use `create-research`, `create-charter`, `superplan`, `work-charter` and `update-agent-memory` for their workflows. Preserve approved plans and one coordinator-owned queue. Worker briefs name task/attempt IDs, exclusive paths, instructions, checks and evidence writers. Snapshot tracked/untracked bytes; status alone misses edits to dirty files. Inspect live jobs before redispatch; quiet does not mean dead.

## Repository and evidence boundaries

`docs/research` and `docs/reference` link into optional `repos/tau-brain`. Write through `docs/...`, validate from Tau root, and check Git with `git -C repos/tau-brain status --short -- research/<path>` or `reference/<path>`. Follow the [artifact contract](.agents/skills/create-research/artifacts.md). Workers without Brain return evidence to the permitted parent; ordinary install/build/test/runtime works without Brain.

`repos.yaml` is the public source catalog; authorized checkouts may overlay `repos/tau-brain/repos.yaml`. Use the `repos` skill for dependency-source investigation. Checkouts are optional. New entries default private; `--catalog public -g public-maintenance` requires deliberate OSS publication.

## Learned User Preferences

- Investigation requests produce findings before implementation; trace the concrete root cause and verify hypotheses in current source.
- Honor the selected scope: defer nonessential MVP features, and complete all work in an explicitly authorized migration without weakening its invariants.
- Reuse existing patterns and established standards. When every option overengineers the problem, reframe the problem before choosing.
- Verify the changed behavior with meaningful checks; remove temporary diagnosis logs while retaining useful error reporting.
