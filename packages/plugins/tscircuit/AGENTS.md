# @taucad/tscircuit

## Responsibility

tscircuit EDA kernel for Tau: TSX circuits rendered to 3D boards, schematic and PCB SVG, with BOM, netlist and circuit JSON exports

- Nx project: `tscircuit`
- Project root: `packages/plugins/tscircuit`
- Placement: `packages/plugins`
- Capabilities: `kernel`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/tscircuit.plugin.ts`
- `src/tscircuit.kernel.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint tscircuit
pnpm nx test tscircuit --watch=false
pnpm nx typecheck tscircuit
pnpm nx build tscircuit
pnpm nx pkgcheck tscircuit
pnpm nx size tscircuit
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

Record durable project-specific facts here after verifying them in current source.

- The native handle is `@tscircuit/core`'s settled circuit JSON and the GLB comes from `circuit-json-to-gltf`; a catalog bump of either package changes cached handle semantics, so bump the kernel `version` alongside it.
- Rendering is offline by construction: `withOfflineFetch` traps `globalThis.fetch` around circuit settling and 3D conversion and reports each attempted URL as a warning issue. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
