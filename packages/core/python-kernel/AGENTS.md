# @taucad/python-kernel-core

## Responsibility

Shared Python language-kernel worker, session, closure and payload-generator helpers for Tau's native Python kernels

- Nx project: `python-kernel-core`
- Project root: `packages/core/python-kernel`
- Placement: `packages/core`
- Package kind: publishable dependency-light core support
- Build mode: tsdown ESM build enabled
- Host target: node

## Entrypoints

- `src/index.ts` (root), `src/generator.ts` (`./generator`), `src/template.ts` (`./template`)
- `python/tau_kernel/*.py`: the worker side; `pythonKernelModules` lists them and a test keeps the list equal to the directory
- `python/interpreter.json`: the default CPython pin of every Python kernel
- `scripts/tau-python-kernel.mts`: the published `tau-python-kernel` bin (`dist/bin/`), dispatching to `scripts/generate-tau-plugin.mts`, `scripts/generate-project-template.mts` and `scripts/test-python.mts`; each kernel's Nx targets run it with `--package <dir>`, and `test` without `--package` runs the `tau_kernel` tests. Paths resolve against the working directory.
- `package.json`, `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint python-kernel-core
pnpm nx test python-kernel-core --watch=false
pnpm nx typecheck python-kernel-core
pnpm nx build python-kernel-core
pnpm nx pkgcheck python-kernel-core
pnpm nx size python-kernel-core
pnpm nx run python-kernel-core:test-python
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
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- Nothing here imports a CAD library: a kernel's library calls stay in its own worker module.
- A change to `python/tau_kernel/` changes every Python kernel's raw payloads. Run each kernel's `generate-tau-plugin` target, which rewrites its pinned `python/tau_kernel/` copy and its `tau-plugin.json`; the golden receipts then need the kernel's dispatch workflow.
- `tau_kernel` is a namespace package: a raw payload name cannot be `__init__.py`.
