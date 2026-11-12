# @taucad/desktop-terminal

## Responsibility

The desktop services host's `terminal` concern: one human PTY session per pane port over the shell service. Private, source-consumed and bundled by `apps/desktop`, whose services host composes it.

- Nx project: `desktop-terminal`
- Project root: `apps/libs/desktop-terminal`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:ui, type:app-lib, layer:feature, shell:terminal, ci:shell`

## Entrypoints

- `src/index.ts`: `createTerminalConcern`, `terminalAdmissionMilliseconds` and the concern's types
- `src/terminal-concern.ts`: the concern
- `src/terminal-concern.conformance.test.ts`: the concern-level conformance rows P01, R01–R03 and T01–T10
- `package.json`, `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint desktop-terminal
pnpm nx test desktop-terminal --watch=false
pnpm nx typecheck desktop-terminal
pnpm nx run desktop-terminal:test:terminal-conformance
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [apps AGENTS](../../AGENTS.md)
- [apps/libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- Production files import only `@taucad/shell-service` (types) and `@taucad/types/desktop-terminal`, and never `electron`, `@taucad/host` or the desktop app: the services host binds the concern's options (`isTrustedRoot`, `canonicalRoot`, `log`, the shell probe) and routes its frames (`scripts/src/shell-split-graph.test.ts` pins it).
- `@taucad/sandbox` is a devDependency only: the conformance rows build the real sandbox provider through `@taucad/sandbox/shell`.
- The conformance rows prove the concern's semantics, not the services host's frame routing; `desktop:test:terminal-conformance` keeps proving that, unchanged. Conformance targets stay `cache: false`.
