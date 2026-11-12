# @taucad/shell-service

## Responsibility

Tau's rooted shell service: agent shell calls and Terminal sessions over a sandbox shell provider. Private library bundled into `@taucad/host` (`dist/libs/shell-service/`), which re-exports its root.

- Nx project: `shell-service`
- Project root: `libs/shell-service`
- Placement: `libs`
- Build mode: tsdown declarations only, for `host`'s tsdown build, which mirrors it module for module
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:lib, shell:service, ci:shell`

## Entrypoints

- `src/index.ts`: the service, its probe and the shell contract (`@taucad/host`'s shell block re-exports it)
- `src/shell/shell-service.conformance.test.ts`: the service conformance rows H01–H07
- `package.json`, `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint shell-service
pnpm nx test shell-service --watch=false
pnpm nx typecheck shell-service
pnpm nx run shell-service:test:shell-conformance
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- Production files import only `@taucad/agent-host` (types), `@taucad/filesystem/path-registry` and the stateless `@taucad/sandbox/shell/*` subpaths (`identity`, `baseline` and the `provider` types), never the `@taucad/sandbox/shell` barrel: the barrel reaches the SRT provider and `@anthropic-ai/sandbox-runtime`, which `@taucad/host` must not ship (`scripts/src/shell-split-graph.test.ts` pins it).
- Never import `@taucad/chat` or `@taucad/agent-tools`: the parity test against the chat schema and the registry's `ShellClient` lives in `host` (`src/shell/shell-contract.parity.test.ts`), so this library's closure stays what its rows test.
- Shell conformance targets stay `cache: false`.
