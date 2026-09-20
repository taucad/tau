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
- [Parameter record policy](../../docs/policy/parameter-record-policy.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)
- [Library API policy](../../docs/policy/library-api-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- The record holds only what a person authored: `activeGroup`, each group's `values`, and its optional `units`/`sourceUnits` keyed by instance pointer. `units[p]` is the chosen unit; `sourceUnits[p]` is the marker that the stored number converts from that unit and must equal `units[p]`. A `units`-only claim relabels without conversion. The schema is strict, so a retired key refuses the whole record. Anything derivable from the live manifest belongs in the manifest.
- `ParameterSetIdentity` is one `manifestRevision`. Value-level concurrency is the sidecar's own bytes as the write precondition plus the request's field-scoped `base`; nothing revision-like is persisted.
- `parameterSetMachine` keeps `context.pending` as a bounded queue (`pendingLimit`, 8). A final displaces any queued value edit for its field. A transient edit never displaces a queued final and displaces only a transient. Other displacement keys are parameter for display preferences and kind plus group otherwise.
- A `resolve` in the held mode goes to `refreshing`, whose load input carries `current`; `sameResolution` compares normalised modes, with `undefined` meaning `default`. The host loader decides whether that refresh re-resolves: agent hosts re-resolve because the agent edits sources between reads, and the UI service compares manifest revisions. A plan awaiting confirmation ignores a same-mode `resolve`.
- A `watch.changed` during `planning` or `confirmation` refreshes and re-plans; only `base` decides whether the field itself moved. `refreshing` compares bytes and manifest revision, so this actor's own write echoes back without re-publishing `loaded`.
- Every `settled` emission carries its request. Unmatched confirm or cancel commands emit `command-rejected`, so adapters listen for both.
- `requireParameterRecord` is the only invalid-record policy. Kernels, middleware, routes and the loader call it rather than branching on `readParameterRecord` themselves.
- `ParameterAuthority` is bytes only (`path`, `read`, `writeChecked`). Test manifests used with `loadParameterSnapshot` need no source-file pinning.
