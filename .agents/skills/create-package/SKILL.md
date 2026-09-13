# Create Package Skill

Create a new `@taucad/*` publishable package using the custom workspace generator.

## Usage

```bash
pnpm nx g ./tools/workspace-plugin/generators.json:package <name> --description="..."
```

### Options

| Option        | Required | Default    | Description                                                             |
| ------------- | -------- | ---------- | ----------------------------------------------------------------------- |
| `name`        | Yes      | (argv[0])  | Package name without `@taucad/` prefix (e.g. `react` → `@taucad/react`) |
| `description` | No       | `""`       | Package description for `package.json` and `README.md`                  |
| `scope`       | No       | `packages` | Directory scope: `packages` for publishable, `libs` for internal        |

### Example

```bash
pnpm nx g ./tools/workspace-plugin/generators.json:package react --description="React hooks for @taucad/runtime"
```

## What the generator produces

All files are created in a single command with zero cleanup needed:

| File                  | Purpose                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `package.json`        | Tau conventions: dual ESM/CJS `publishConfig`, `#*` imports, source `exports`, `type: module` |
| `tsdown.config.ts`    | Dual ESM/CJS build, `unbundle: true`, `dts: true`, `minify: true`                             |
| `tsconfig.json`       | Extends `tsconfig.base.json`, references lib + spec configs                                   |
| `tsconfig.lib.json`   | `module: ESNext`, `moduleResolution: Bundler`, `#*` paths                                     |
| `tsconfig.spec.json`  | Vitest types, test globs, config file includes                                                |
| `tsconfig.build.json` | Extends lib, `composite: false`, `declarationMap: false`                                      |
| `vitest.config.ts`    | `nxViteTsPaths()`, coverage with 100% thresholds, typecheck for `*.test-d.ts`                 |
| `project.json`        | `projectType: library`, `tags: ["scope:shared", "type:lib"]`                                  |
| `src/index.ts`        | Empty barrel export                                                                           |
| `README.md`           | Package name and description                                                                  |

## How it works

The generator uses `@nx/devkit` APIs (`generateFiles`, `addProjectConfiguration`, `formatFiles`) to produce EJS-templated files from `tools/workspace-plugin/src/generators/package/files/`.

All NX targets are auto-inferred by existing file-based plugins — no manual wiring:

- `build` → `tools/tsdown.plugin.ts` (detects `tsdown.config.ts`)
- `test` → `@nx/vitest` (detects `vitest.config.ts`)
- `typecheck` → `tools/tsgo.plugin.ts` (detects `tsconfig.json`)
- `lint` → `@nx/eslint/plugin` (detects workspace `eslint.config.mjs`)
- `generate-cjs-dts` → `tools/generate-cjs-dts.plugin.ts`
- `pkgcheck` → `tools/pkgcheck.plugin.ts`

## Post-generation customization

After running the generator, apply package-specific changes:

1. **Add dependencies and peer dependencies** to `package.json`
2. **Change vitest environment** if needed (e.g. `jsdom` for React packages)
3. **Add vitest setup file** if needed (e.g. `@testing-library/jest-dom`)
4. **Add subpath exports** if the package needs multiple entry points
5. **Add `tsconfig.build.json` references** to workspace libs the package depends on
6. **Run `pnpm install --no-frozen-lockfile`** to update the lockfile

## Conventions

- Follow `docs/policy/library-api-policy.md` for API design
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
