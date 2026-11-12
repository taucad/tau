# @taucad/sandbox

## Responsibility

Tau's OS sandbox launcher, process tree and contained shell provider. Private library with zero workspace dependencies, bundled into `@taucad/native-process-core` (`dist/libs/sandbox/`), which re-exports its root and `./shell`.

- Nx project: `sandbox`
- Project root: `libs/sandbox`
- Placement: `libs`
- Build mode: none of its own; `native-process-core`'s tsdown build mirrors it module for module
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:lib, shell:sandbox, ci:shell`

## Entrypoints

- `src/index.ts`: the native sandbox launcher, child-resident sampler and process-table reads
- `src/shell.ts`: the contained shell seam (`./shell`)
- `src/shell/srt-supervisor.ts`: the supervisor entry (`./shell/srt-supervisor`), the one module with top-level side effects (`sideEffects` in `package.json`)
- `scripts/shell-conformance-vm.sh`, `scripts/shell-conformance-guest.sh`: the Linux shell conformance guests
- `specs/shell-custody/`: the `formal` model of shell custody
- `package.json`, `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint sandbox
pnpm nx test sandbox --watch=false
pnpm nx typecheck sandbox
pnpm nx run sandbox:test:shell-conformance
pnpm nx run sandbox:formal
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

- Import no `@taucad/*` package: the library's closure is what the shell conformance rows test (`scripts/src/shell-split-graph.test.ts` pins it).
- `defaultSupervisor()` in `src/shell/srt-shell-provider.ts` resolves `./srt-supervisor.mjs` beside its own emitted module, so an owner that bundles this library keeps the supervisor as an entry (`native-process-core`'s `src/shell/srt-supervisor.ts`); `scripts/src/check-pack-install.ts` probes the installed default path.
- `@anthropic-ai/sandbox-runtime` carries Tau's pnpm patch (`tools/pnpm/patches/`); `src/shell/srt-which.test.ts` pins it.
- Shell conformance targets stay `cache: false`.
