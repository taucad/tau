---
name: create-package
description: >-
  Scaffold new @taucad/* packages with Tau's workspace package generator,
  including publishable packages under packages/ and internal libraries under
  libs/. Use when creating a package or library, adding a new @taucad/*
  workspace project, choosing generator options, or updating package templates
  and conventions. Agents should select this skill autonomously when a request
  clearly needs a new Tau workspace project or changes its scaffold contract.
---

# Create Package Skill

Create a new `@taucad/*` workspace project using the custom package generator.

## Placement Router

| Code                                                             | Placement          | Tags                                                       | Build |
| ---------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- | ----- |
| Published npm package                                            | `packages`         | `scope:shared type:package`                                | yes   |
| Runtime plugin toolkit (kernel, transcoder, middleware, bundler) | `packages/plugins` | `scope:shared type:package`                                | yes   |
| Shared Apache capability                                         | `libs`             | `scope:shared type:lib`                                    | yes   |
| Private application capability                                   | `apps/libs`        | `scope:shared` or `scope:ui`, `type:app-lib layer:<layer>` | no    |
| Dev-time tooling                                                 | `tools`            | `scope:shared type:tool`                                   | yes   |

Use `scope:ui` for UI-only app-libs. Use `scope:shared` only with named UI and API consumers. See `docs/policy/workspace-project-policy.md`.

## Usage

```bash
pnpm nx g @taucad/workspace-plugin:package <name> --description="..."
```

For a package that supplies runtime plugin capabilities, stop and use
`.agents/skills/create-plugin/SKILL.md`. For a kernel specifically, use
`.agents/skills/create-kernel/SKILL.md`. Those workflows own their generators and
integration requirements; this skill does not duplicate them.

### Options

| Option        | Required     | Default    | Description                                                             |
| ------------- | ------------ | ---------- | ----------------------------------------------------------------------- |
| `name`        | Yes          | (argv[0])  | Package name without `@taucad/` prefix (e.g. `react` → `@taucad/react`) |
| `description` | No           | `""`       | Package description for `package.json` and `README.md`                  |
| `scope`       | No           | `packages` | Placement: `packages`, `libs`, `apps/libs`, or `tools`                  |
| `scopeTag`    | No           | `shared`   | `shared` outside app-libs; `shared` or `ui` for `apps/libs`             |
| `layer`       | For app-libs | —          | `feature`, `ui`, `data-access`, or `util`                               |
| `react`       | No           | `false`    | App-libs only: add React peers, DOM/JSX, jsdom, and Testing Library     |
| `build`       | No           | By scope   | Fixed off for `apps/libs` and on for other placements                   |

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
| `project.json`        | Library identity with placement-derived scope, type, and app-layer tags                     |
| `src/index.ts`        | Empty barrel export                                                                         |
| `README.md`           | Package name and description                                                                |
| `AGENTS.md`           | Project identity, selected modes, entrypoints, available Nx commands and owner links        |
| `CLAUDE.md`           | Exact native import of the adjacent `AGENTS.md`                                             |

The instruction pair is created by the shared KeepExisting writer. A full
project-generator collision fails before mutation. Subsequent instruction
maintenance edits `AGENTS.md` as ordinary authored content; rerunning the
instruction writer preserves both files and creates only a missing pair member.

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
tools/workspace-plugin/src/generators/instruction-files/
```

Changes to templates affect only future generations — existing packages are not retroactively updated.
