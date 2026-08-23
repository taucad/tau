---
title: 'Workspace Project Policy'
description: 'Placement, tagging, layering, generation, and dependency rules for Tau workspace projects and private application libraries.'
status: active
created: '2026-08-22'
updated: '2026-08-22'
related:
  - docs/research/ui-feature-library-architecture-blueprint.md
  - docs/research/workspace-license-boundary-migration.md
  - docs/policy/library-api-policy.md
  - docs/policy/public-surface-policy.md
---

# Workspace Project Policy

Internal reference for placing, tagging, and generating projects in the Tau workspace.

## Rationale

Nx caches, validates, and schedules work at project boundaries. Consistent placement and layer tags keep application code private, make dependency direction enforceable, and let feature work invalidate only its real consumers.

## Placement Router

| Code being created                                    | Placement                 | Required tags                             | Build           |
| ----------------------------------------------------- | ------------------------- | ----------------------------------------- | --------------- |
| Published npm package                                 | `packages/<name>`         | `scope:shared type:package`               | tsdown          |
| Apache capability shared by multiple apps or packages | `libs/<name>`             | `scope:shared type:lib`                   | tsdown          |
| Private capability used by both UI and API            | `apps/libs/<name>`        | `scope:shared type:app-lib layer:<layer>` | source-consumed |
| UI feature, primitives, or data access                | `apps/libs/<name>`        | `scope:ui type:app-lib layer:<layer>`     | source-consumed |
| Development tooling                                   | `tools/<name>`            | `scope:shared type:tool`                  | tsdown          |
| Kernel or transcoder plugin                           | `packages/plugins/<name>` | `scope:shared type:package`               | tsdown          |
| Deployable app                                        | `apps/<name>`             | `scope:<app> type:app layer:feature`      | app-specific    |
| One-off script                                        | `scripts/`                | none                                      | none            |

## Rules

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
```

### 9. Charter Deployable Apps

Do not create deployable apps with the package generator. Add a charter under `docs/research/` and review this policy plus `workspace-license-boundary-migration.md` first.

## Review Checklist

- [ ] Placement matches the audience router.
- [ ] `scope:`, `type:`, and required `layer:` tags are present exactly once.
- [ ] Dependency direction satisfies the layer table.
- [ ] App-libs are source-consumed and private.
- [ ] Cross-cutting app concerns are injected.
- [ ] Every subpath has an audience note and exports-map test.
- [ ] The project was produced by the workspace generator.

## References

- [Nx project dependency rules](https://nx.dev/docs/kb/project-dependency-rules)
- [Nx project size guidance](https://nx.dev/docs/concepts/decisions/project-size)
- Related: `docs/policy/library-api-policy.md`
- Research: `docs/research/ui-feature-library-architecture-blueprint.md`
