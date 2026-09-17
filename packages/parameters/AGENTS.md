# @taucad/parameters

## Responsibility

Portable parameter semantics and checked change planning

- Nx project: `parameters`
- Project root: `packages/parameters`
- Placement: `packages`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:package`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint parameters
pnpm nx test parameters --watch=false
pnpm nx typecheck parameters
pnpm nx build parameters
pnpm nx pkgcheck parameters
pnpm nx size parameters
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [packages AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)
- [Library API policy](../../docs/policy/library-api-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- The input machine is split: `src/parameter-input.model.ts` holds its types and pure helpers, and `src/parameter-input.machine.ts` holds the machine and re-exports the public types for the `./input-machine` entry. Put new pure helpers in the model.
- `parameterSetMachine` keeps `context.pending` as a bounded queue (`pendingLimit`). Displacement is keyed by field for value edits, by parameter for display preferences, and by kind and group otherwise.
- A `resolve` in the held mode goes to `refreshing`, whose load input carries `current`; `sameResolution` compares normalised modes, with `undefined` meaning `default`. The host loader decides whether that refresh re-resolves: agent hosts use `reloadParameterSnapshot`, and the UI service compares manifest revisions. A plan awaiting confirmation ignores a same-mode `resolve`.
- Every `settled` emission carries its request. Unmatched confirm or cancel commands emit `command-rejected`, so adapters listen for both.
- `requireParameterRecord` is the only invalid-record policy. Kernels, middleware, routes and the loader call it rather than branching on `readParameterRecord` themselves.
- Test manifests used with `loadParameterSnapshot` must pin `sourceFiles` to the digests of the bytes their `semanticPreconditions` return; the loader refuses a manifest without them.
