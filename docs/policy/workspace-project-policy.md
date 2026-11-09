---
title: 'Workspace Project Policy'
description: 'Placement, tagging, layering, generation, and dependency rules for Tau workspace projects and private application libraries.'
status: active
created: '2026-08-22'
updated: '2026-11-09'
related:
  - docs/research/ui-feature-library-architecture-blueprint.md
  - docs/research/api-module-layout-blueprint.md
  - docs/research/workspace-license-boundary-migration.md
  - docs/research/package-library-policy-audit.md
  - docs/research/ci-decomposition-blueprint.md
  - docs/policy/library-api-policy.md
  - docs/policy/public-surface-policy.md
---

# Workspace Project Policy

Internal reference for placing, tagging, and generating projects in the Tau workspace.

## Rationale

Nx caches, validates, and schedules work at project boundaries. Consistent placement and layer tags keep application code private, make dependency direction enforceable, and let feature work invalidate only its real consumers.

## Placement Router

| Code being created                                    | Placement                 | Required tags                                     | Build           |
| ----------------------------------------------------- | ------------------------- | ------------------------------------------------- | --------------- |
| Published npm package (Rule 0)                        | `packages/<name>`         | `scope:shared type:package`                       | tsdown          |
| Apache capability shared by multiple apps or packages | `libs/<name>`             | `scope:shared type:lib`                           | tsdown          |
| Private capability used by both UI and API            | `apps/libs/<name>`        | `scope:shared type:app-lib layer:<layer>`         | source-consumed |
| UI feature, primitives, or data access                | `apps/libs/<name>`        | `scope:ui type:app-lib layer:<layer>`             | source-consumed |
| Private API server capability                         | `apps/libs/api-<name>`    | `scope:api type:app-lib layer:<layer> api:<name>` | source-consumed |
| Development tooling                                   | `tools/<name>`            | `scope:shared type:tool`                          | tsdown          |
| Kernel or transcoder plugin                           | `packages/plugins/<name>` | `scope:shared type:package`                       | tsdown          |
| Deployable app                                        | `apps/<name>`             | `scope:<app> type:app layer:feature`              | app-specific    |
| One-off script                                        | `scripts/`                | none                                              | none            |

## Rules

### 0. Publish Only What Stands on Its Own

A project is a published package (`packages/**`, `scope:shared type:package`, not `private`) only when its output stands on its own: something outside the workspace installs it by name, or the project is designed to be installed that way. That is a `bin` a user runs; a plugin or kernel under `packages/plugins/*` that defines a kernel, machine, bundler, middleware or transcoder plugin with a documented composition (`defineRuntime`, `tau --plugin`, `tau-plugin.json`, an agent plugin manifest), even while a first-party host still composes it by a hard-wired import; an SDK or embedding surface documented for outsiders; a product or brand surface, or a content package, that the project presents under its own name and that the operator has recorded as such in its README; or a runtime that a separately installed product loads. A capability with no such contract is a private library: `libs/<name>` (`scope:shared type:lib`, `private: true`) when packages or several apps consume it, or when it keeps a build, bundled into each publishable owner as a `workspace:` devDependency through `bundlePattern`; `apps/libs/<name>` when only applications consume it from source. A library may have several owners.

A dependency with no contract of its own stays published only under one of three exceptions, each recorded in the package's README:

- **Shared package.** Bundling a copy into each publishable owner would ship at least 100 kB of duplicated built output (`du -sk dist`) in the largest install that carries it (the CLI, the agent plugin, the React SDK, the host, a plugin author). Before a new shared helper becomes a package, check whether a peer every dependent already installs (`@taucad/runtime`) can carry it as a subpath; prefer the subpath to a new name.
- **Singleton.** It holds state that must exist once per process or install: a `Symbol.for` or module-level registry, a path or plugin registry, classes checked with `instanceof` across packages, or a native or WASM payload.
- **Peer contract.** Another publishable names it in `peerDependencies`, or a planned published package compiles against it, so plugins and providers see one type identity.

A package that meets none of these is retired: its final version publishes once with a README pointer to the owner and is promoted to `latest` while it is still publishable; the project then moves to `libs/` or `apps/libs/`, becomes `private: true` and leaves the fixed train by its tag; the owner bundles it and re-exports what outside callers used; the name, final version and pointer go into `supersededPackages` in `scripts/src/promote-npm-train.ts`, which deprecates every published version on the next promotion and is the retired-name register; the operator revokes the name's trusted-publishing binding. `pkgcheck` refuses a bundle the owner's manifest does not permit.

**Why**: a package costs an npm name and trusted-publishing binding, a train entry every release versions and publishes, `pkgcheck`, a size budget, a README quick start, a `check-pack-install` closure and a semver obligation to consumers nobody can see. A library costs bytes in its owners.

**Enforced by**: `pkgcheck` (`tau-bundle-ownership`, `tau-bundled-artifact`), `create-package` (asks the audience question before generating), and the retirement procedure's `supersededPackages` register. A `check-release-projects` guard that refuses a publishable leaving the train unregistered is proposed in `docs/research/package-library-policy-audit.md` (R2) and is not yet enforced.

### 1. Place Code by Audience

Choose placement with the router. Never place React or application-only code in `libs/` or `packages/`. Use `scope:shared` for an app-lib only when both `apps/ui` and `apps/api` have named consumers.

### 2. Tag Every Project

Give every project exactly one `scope:` and one `type:` tag. Give every `type:app-lib` exactly one layer tag: `layer:feature`, `layer:ui`, `layer:data-access`, or `layer:util`.

Layer dependencies flow in one direction:

| Source layer  | Allowed target layers                  |
| ------------- | -------------------------------------- |
| `feature`     | `feature`, `ui`, `data-access`, `util` |
| `ui`          | `ui`, `util`                           |
| `data-access` | `data-access`, `util`                  |
| `util`        | `util`                                 |

**Enforced by**: `validate-project-tags` and `@nx/enforce-module-boundaries`.

API server libraries (`apps/libs/api-<name>`) also carry exactly one `api:<name>` tag. Equal layers leave them unordered, so `eslint.config.mjs` gives each one the API libraries it may depend on, all pointing one way: `billing → llm-gateway → hosts → auth → {database, email, redis} → lifecycle → observability → core`. A library never depends on the `api` app; the app composes them and binds one library's port to another's implementation.

**Enforced by**: `validate-project-tags` (tag and no library-to-app graph edge) and `@nx/enforce-module-boundaries` (`api:<name>` constraints).

### 3. Keep App Libraries Source-Consumed

Do not add `tsdown.config.ts`, `tsconfig.build.json`, or `publishConfig` to `apps/libs/*`. Point development exports directly at `./src/*`.

### 4. Export One Module per Subpath

Use singular, module-level subpaths such as `@taucad/billing/hooks/use-credits`. Do not add aggregator barrels beyond the library's single root `index.ts`. Record the audience and consumer for each new key and pin the exports map with a surface test.

**Why**: Subpaths are dependency-graph and loading boundaries, not folder indexes.

### 5. Inject App Concerns

Pass session identity, environment values, notifications, analytics, and router state through context, callbacks, or explicit inputs. Never import `#lib/*`, `#environment.config`, `#components/*`, or another app alias from an app-lib.

### 6. Preserve UI Shell Layering

Inside `apps/ui/app`, do not import:

- `#components/*` or `#routes/*` from `hooks/`;
- `#components/*`, `#hooks/*`, or `#routes/*` from `machines/`, `lib/`, `services/`, `utils/`, `constants/`, `filesystem/`, `db/`, or `workers/`.

Temporary file-level lint disables must name the migration wave that removes them. Never add a new violation.

### 7. Keep Domain Artefacts Together

Keep machines, providers, workers, RPC handlers, hooks, and components with their owning domain. Never put a non-hook module in `hooks/`. Keep a domain with fewer than roughly five files in the app shell unless it has distinct test or dependency needs.

### 8. Generate Projects

Create workspace projects with the package generator. Hand-written project configuration is a review blocker.

```bash
pnpm nx g ./tools/workspace-plugin/generators.json:package billing-ui \
  --scope=apps/libs --scope-tag=ui --layer=feature --react
pnpm nx g ./tools/workspace-plugin/generators.json:package api-billing \
  --scope=apps/libs --scope-tag=api --layer=feature
```

### 9. Charter Deployable Apps

Do not create deployable apps with the package generator. Add a charter under `docs/research/` and review this policy plus `workspace-license-boundary-migration.md` first.

### 10. Size Projects for CI (Advisory)

A project is the right size for CI when its own `test` task is not the floor of a lane and when the share of landings that make it affected stays close to the share that touch it. Aim for:

| Measure               | Advisory target                          |
| --------------------- | ---------------------------------------- |
| Non-test source files | ≤ 100 (source lines, ≤ 10 k, break ties) |
| `it`/`test` cases     | ≤ 300                                    |
| Uncached `test` task  | ≤ 3 min                                  |
| Graph-affected rate   | ≤ 2 × touched rate                       |

These are guidance, not a gate: nothing fails a build on them, and existing projects held at their size by the CI decomposition blueprint stay as they are. Before growing a project past a target, or when choosing what to split, read the census:

```bash
pnpm nx run nx:census            # flagged projects; --all for every project
pnpm nx run nx:census --commits 700 --durations <seconds.json>
```

It counts source files and `it`/`test` call sites (a static approximation of the test count), dependency closure and fan-in from the Nx graph, and replays recent first-parent history to simulate each project's touched and affected rates; global files (`sharedGlobals`, the lockfile) are reported separately and left out of the affected check, which applies only to projects touched by at least 2 % of the window. Test time is flagged only when `--durations` supplies measured seconds. The full report is written to `out/reports/census/census.json`. Split by stability, not only by size: a high fan-in project lowers the whole workspace's affected rates when its rarely touched core is separated from its churning edges.

## Review Checklist

- [ ] A new published package meets Rule 0 or records its exception in the README.
- [ ] Placement matches the audience router.
- [ ] `scope:`, `type:`, and required `layer:` tags are present exactly once.
- [ ] Dependency direction satisfies the layer table.
- [ ] App-libs are source-consumed and private.
- [ ] Cross-cutting app concerns are injected.
- [ ] Every subpath has an audience note and exports-map test.
- [ ] The project was produced by the workspace generator.
- [ ] A project growing past the advisory size target was checked against `nx:census`.

## References

- [Nx project dependency rules](https://nx.dev/docs/kb/project-dependency-rules)
- [Nx project size guidance](https://nx.dev/docs/concepts/decisions/project-size)
- Related: `docs/policy/library-api-policy.md`
- Research: `docs/research/ui-feature-library-architecture-blueprint.md`, `docs/research/ci-decomposition-blueprint.md` (Part 2, F5–F6)
