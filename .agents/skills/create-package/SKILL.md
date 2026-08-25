---
name: create-package
description: >-
  Scaffold new @taucad/* packages with Tau's workspace package generator,
  including publishable packages under packages/ and internal libraries under
  libs/. Use when creating a package or library, adding a new @taucad/*
  workspace project, choosing generator options, or updating package templates
  and conventions.
---

# Create Package Skill

Create a new `@taucad/*` workspace project using the custom package generator.

## Placement Router

| Code                                                             | Placement          | Tags                        | Build |
| ---------------------------------------------------------------- | ------------------ | --------------------------- | ----- | -------------------------------- | --- |
| Published npm package                                            | `packages`         | `scope:shared type:package` | yes   |
| Runtime plugin toolkit (kernel, transcoder, middleware, bundler) | `packages/plugins` | `scope:shared type:package` | yes   |
| Shared Apache capability                                         | `libs`             | `scope:shared type:lib`     | yes   |
| Private application capability                                   | `apps/libs`        | `scope:<shared              | ui    | api> type:app-lib layer:<layer>` | no  |
| Dev-time tooling                                                 | `tools`            | `scope:shared type:tool`    | yes   |

Use `scope:ui` for UI-only app-libs. Use `scope:shared` only with named UI and API consumers. See `docs/policy/workspace-project-policy.md`.

## Usage

```bash
pnpm nx g @taucad/workspace-plugin:package <name> --description="..."
```

For a package that supplies runtime capabilities, use the **plugin** generator instead — it scaffolds under `packages/plugins/`, declares the package-named factory, re-exports it as `plugin`, and emits one file per capability:

```bash
pnpm nx g @taucad/workspace-plugin:plugin <name> --capabilities=kernel,transcoder --description="..."
```

See `.agents/skills/new-kernel/SKILL.md` for the kernel-specific walkthrough.

### Options

| Option        | Required     | Default    | Description                                                             |
| ------------- | ------------ | ---------- | ----------------------------------------------------------------------- |
| `name`        | Yes          | (argv[0])  | Package name without `@taucad/` prefix (e.g. `react` → `@taucad/react`) |
| `description` | No           | `""`       | Package description for `package.json` and `README.md`                  |
| `scope`       | No           | `packages` | Placement: `packages`, `libs`, `apps/libs`, or `tools`                  |
| `scopeTag`    | No           | `shared`   | Audience tag: `shared`, `ui`, or `api`                                  |
| `layer`       | For app-libs | —          | `feature`, `ui`, `data-access`, or `util`                               |
| `react`       | No           | `false`    | Add React peers, DOM/JSX config, jsdom, and Testing Library setup       |
| `build`       | No           | By scope   | Defaults off for `apps/libs`, on for other placements                   |

### Example

```bash
pnpm nx g @taucad/workspace-plugin:package react --description="React hooks for @taucad/runtime"

pnpm nx g @taucad/workspace-plugin:package files \
  --scope=apps/libs --scope-tag=ui --layer=feature --react
```

## What the generator produces

All files are created in a single command with zero cleanup needed:

| File                  | Purpose                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `package.json`        | Tau conventions: `#*` imports, source exports, and publish metadata only for built projects |
| `tsdown.config.ts`    | Built placements only: ESM build with declarations                                          |
| `tsconfig.json`       | Extends `tsconfig.base.json`, references lib + spec configs                                 |
| `tsconfig.lib.json`   | `module: ESNext`, `moduleResolution: Bundler`, `#*` paths                                   |
| `tsconfig.spec.json`  | Vitest types, test globs, config file includes                                              |
| `tsconfig.build.json` | Built placements only: extends the library config                                           |
| `vitest.config.ts`    | Node by default; jsdom plus `vitest.setup.ts` when `--react`                                |
| `project.json`        | `projectType: library`, `tags: ["scope:shared", "type:lib"]`                                |
| `src/index.ts`        | Empty barrel export                                                                         |
| `README.md`           | Package name and description                                                                |

## How it works

The generator uses `@nx/devkit` APIs (`generateFiles`, `addProjectConfiguration`, `formatFiles`) to produce EJS-templated files from `tools/workspace-plugin/src/generators/package/files/`.

All NX targets are auto-inferred by existing file-based plugins — no manual wiring:

- `build` → `tools/tsdown.plugin.ts` (detects `tsdown.config.ts`)
- `test` → `@nx/vitest` (detects `vitest.config.ts`)
- `typecheck` → `tools/tsgo.plugin.ts` (detects `tsconfig.json`)
- `lint` → `@nx/eslint/plugin` (detects workspace `eslint.config.mjs`)
- `pkgcheck` → `tools/pkgcheck.plugin.ts` for publishable packages

## Post-generation customization

After running the generator, apply only package-specific changes:

1. **Add dependencies and peer dependencies** to `package.json`
2. **Add subpath exports** if the package needs multiple entry points
3. **Mirror every published subpath** in `publishConfig.exports` using ESM-only `types`, `import`, and `default` targets
4. **Add `tsconfig.build.json` references** to workspace libs the built project depends on
5. **Run `pnpm install --no-frozen-lockfile`** to update the lockfile

## Conventions

- Follow `docs/policy/library-api-policy.md` for API design
- Capability sources are `{name}.{role}.ts` — role is one of `plugin`, `kernel`, `transcoder`, `middleware`, `bundler`; tests are `{name}.{role}.test.ts` / `.test-d.ts` (e.g. `image.transcoder.ts`, `geometry-cache.middleware.ts`). Never `plugin.ts`, never `{name}-{role}.ts`. Scenario tests and helper/backend/schema files (`image-import-failure.test.ts`, `assimp-backend.ts`, `replicad.schemas.ts`) are exempt, as are files in nested directories. `tau-lint/plugin-capability-filename` enforces this over flat files under `packages/plugins/*/src/`
- Follow `docs/policy/jsdoc-policy.md` for documentation (`@public`, `@param`, `@returns`, `@example`)
- All exports must have `@public` JSDoc tag
- Examples must use `typescript` language tag with compilable `import from '@taucad/<name>'`
- 100% test coverage is the default threshold

## Updating templates

To change conventions for future packages, edit the template files in:

```
tools/workspace-plugin/src/generators/package/files/
```

Changes to templates affect only future generations — existing packages are not retroactively updated.
