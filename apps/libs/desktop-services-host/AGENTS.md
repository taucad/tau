# @taucad/desktop-services-host

## Responsibility

The desktop app's utility-process hosts (desktop split blueprint DS-2): the services host, the kernel and geometry hosts, native kernel preparation and the permission store. Private, source-consumed and bundled by `apps/desktop`.

- Nx project: `desktop-services-host`
- Project root: `apps/libs/desktop-services-host`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:ui, type:app-lib, layer:feature, ci:shell, ci:desktop`

## Entrypoints

- `src/services-host.impl.ts`: `createServicesHost`, the package root
- `src/services-host.ts`, `src/kernel-host.ts`, `src/geometry-host.ts`: the utilities' bootstraps, imported by the app's `src/utility/*.entry.ts`
- `src/desktop-native-deployments.ts`, `src/native-preparation.ts`, `src/native-store.ts`: what main and the packaging scripts read about the native kernels
- `src/project-roots.ts`: the project root registry and `canonicalPath`
- `src/diagnostics.ts`: the diagnostics port
- `src/services-host.terminal.conformance.test.ts`: the desktop Terminal's real rows
- `package.json`, `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint desktop-services-host
pnpm nx test desktop-services-host --watch=false
pnpm nx typecheck desktop-services-host
pnpm nx run desktop-services-host:test:terminal-conformance
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

- No file, test or fixture imports the desktop app (`#main`, `#shared`, `@taucad/desktop`) or the UI app: the app imports this library, never the reverse (`scripts/src/desktop-split-graph.test.ts` pins it).
- The diagnostics file log is the app's: the app's kernel and services entries call `provideDiagnosticsLog(createDiagnosticsLog)` before importing a bootstrap, and a process handed no factory writes no log file (D-DS6).
- The IPC contracts shared with main and preload are `@taucad/types/desktop` (D-DS5).
- `tauCloudBuildEnabled` and `tauDesktopHostBuild` are the desktop build's constants (`src/build-environment.d.ts`); `vitest.config.ts` defines them for a self-host build.
- `test:terminal-conformance` stays `cache: false`, and every receipt binds the commit tested. `test:authority-writer` runs as a dependency of `desktop:test:authority-writer`.
