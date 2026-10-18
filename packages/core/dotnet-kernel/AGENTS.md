# @taucad/dotnet-kernel-core

## Responsibility

Shared TypeScript side of Tau native .NET kernels: launch set, options, session, workspace mirror and layer manifest

- Nx project: `dotnet-kernel-core`
- Project root: `packages/core/dotnet-kernel`
- Placement: `packages/core`
- Package kind: publishable dependency-light core support
- Build mode: tsdown ESM build enabled
- Host target: node

## Entrypoints

- `src/index.ts`: the worker session and the workspace mirror
- `src/adopter.ts` (`./adopter`): the adopter factory, closure layout mapping and options schemas; imports no session code, so a parent that imports a kernel's `/native` subpath to prepare it loads no kernel
- `src/layer.ts` (`./layer`): the layer record, manifest pin, SBOM and the compose-script runner
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint dotnet-kernel-core
pnpm nx test dotnet-kernel-core --watch=false
pnpm nx typecheck dotnet-kernel-core
pnpm nx build dotnet-kernel-core
pnpm nx pkgcheck dotnet-kernel-core
pnpm nx size dotnet-kernel-core
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Core workflow](../../../.agents/skills/create-core/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Runtime plugins AGENTS](../../plugins/AGENTS.md), for the kernels that consume it
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- Only the TypeScript side is shared. The C# worker protocol stays in `@taucad/picogk`'s worker project until a second C# worker exists.
- `@taucad/picogk`'s goldens (`tau-plugin.json`, `tau-plugin.cdx.json`) must stay byte-equal through any change here; its manifest and SBOM tests run this package's layer rule.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
