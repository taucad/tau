# @taucad/native-kernels

## Responsibility

The roster of native Tau kernels: adopters, plugin manifests and host-neutral payload-store composition

- Nx project: `native-kernels`
- Project root: `packages/native-kernels`
- Placement: `packages`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:package`

## Entrypoints

- `src/index.ts`: the adopter tuple (the one roster decision), the composition schema and the stand-in kernel
- `src/manifest.ts`: static `tau-plugin.json` imports for bundled hosts
- `src/node.ts`: payload-store composition for Node hosts; the store and the managed profile are injected
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint native-kernels
pnpm nx test native-kernels --watch=false
pnpm nx typecheck native-kernels
pnpm nx build native-kernels
pnpm nx pkgcheck native-kernels
pnpm nx size native-kernels
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
