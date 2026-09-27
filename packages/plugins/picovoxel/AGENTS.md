# @taucad/picovoxel

## Responsibility

PicoVoxel voxel, implicit and lattice CAD kernel for Tau

- Nx project: `picovoxel`
- Project root: `packages/plugins/picovoxel`
- Placement: `packages/plugins`
- Capabilities: `kernel`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/picovoxel.plugin.ts`
- `src/picovoxel.kernel.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint picovoxel
pnpm nx test picovoxel --watch=false
pnpm nx typecheck picovoxel
pnpm nx build picovoxel
pnpm nx pkgcheck picovoxel
pnpm nx size picovoxel
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)
- [packages/plugins AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Plugin workflow](../../../.agents/skills/create-plugin/SKILL.md)
- [Create Kernel workflow](../../../.agents/skills/create-kernel/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Runtime architecture policy](../../../docs/policy/runtime-architecture-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- The `picovoxel` dependency is the vendored interim tarball `vendor/picovoxel-0.1.0.tgz` (`file:`; pnpm catalogs reject `file:`). Its digests are pinned in `picovoxelBuild` and `picovoxel.asset-ownership.test.ts`; never regenerate the tarball to pass a test.
- Exact always runs on the serial artifact; `wasm` only selects the fast-lane artifact. Node reports cross-origin isolated, so headless hosts that need determinism pin `wasm: 'serial'`.
- Coverage thresholds are 100% for statements, branches, functions and lines.
