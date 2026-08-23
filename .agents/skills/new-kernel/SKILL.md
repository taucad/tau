---
name: new-kernel
description: Add a new first-party CAD kernel to Tau as a standalone @taucad/* package. Use when adding a kernel, integrating a new CAD engine, implementing defineKernel, scaffolding a kernel package, or wiring kernel UI catalog, prompt, and Monaco entries.
---

# New Kernel Integration

Add a new first-party CAD kernel to Tau as a publishable `@taucad/*` plugin toolkit (like `@taucad/openrscad`). Kernel packages live under `packages/plugins/<name>/` and consume the runtime only through its public author surface (`@taucad/runtime/kernel`, `/types`, `/testing`) — never its `#`-prefixed internals.

A kernel is one _capability_ of a plugin toolkit. The package always ships a `plugin` factory; the kernel is the capability it registers.

## Definition of Done

1. Package scaffolded at `packages/plugins/<name>/` via the plugin generator (section 0)
2. Kernel implemented at `packages/plugins/<name>/src/<name>.kernel.ts`
3. Tests pass at `packages/plugins/<name>/src/<name>.kernel.test.ts`
4. `src/index.ts` exports `plugin`, the package-named alias, and the `<name>Kernel` factory
5. Consumers opt in by depending on `@taucad/<name>` and composing the alias explicitly
6. UI runtime definition includes the kernel where applicable
7. Catalog metadata in `libs/types/src/constants/kernel.constants.ts`
8. Prompt configuration supports the kernel
9. Monaco IntelliSense types extracted and registered
10. Nx lint/typecheck/test pass

## 0) Scaffold the package

The plugin generator is the only supported way to create a kernel package. There is no `kernel` generator.

```bash
pnpm nx g @taucad/workspace-plugin:plugin <name> --capabilities=kernel --description="<one-line description>"
pnpm install --no-frozen-lockfile
```

Options (`tools/workspace-plugin/src/generators/plugin/schema.json`):

| Option         | Required | Default   | Notes                                                                      |
| -------------- | -------- | --------- | -------------------------------------------------------------------------- |
| `name`         | Yes      | (argv[0]) | Package name without `@taucad/` (`zoo` → `@taucad/zoo`)                    |
| `capabilities` | Yes      | —         | One or more of `kernel`, `transcoder`, `middleware`, `bundler`             |
| `description`  | No       | derived   | Package description                                                        |
| `namespace`    | No       | `name`    | Stable diagnostic namespace                                                |
| `hostTarget`   | No       | `browser` | `browser`, `node`, `daemon`, `python`, `native` — drives the payload guard |

This creates `packages/plugins/<name>/` fully wired, zero cleanup:

| File                                                                                                             | Purpose                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `package.json`                                                                                                   | ESM `publishConfig`, `#*.js` self-imports, `@taucad/runtime` peer + dev dep, `taucad.hostTarget` |
| `tsdown.config.ts`, `tsconfig*.json`, `vitest.config.ts`, `project.json`, `README.md`, `CHANGELOG.md`, `LICENSE` | Shared Tau conventions                                                                           |
| `src/index.ts`                                                                                                   | `export { plugin, plugin as <alias> } from '#<name>.plugin.js';` plus `export { <alias>Kernel }` |
| `src/<name>.plugin.ts`                                                                                           | `definePlugin` wiring the kernel into `kernels.default` and a `default` preset                   |
| `src/<name>.kernel.ts`                                                                                           | A `defineKernel` **stub** importing only from `@taucad/runtime/kernel`                           |
| `src/<name>.plugin.test.ts`                                                                                      | Alias-identity test, capability-id assertions, and (for `hostTarget: browser`) the payload guard |
| `src/<name>.plugin.test-d.ts`                                                                                    | Type-level alias identity                                                                        |

Capability ids come from the generator: the first capability owns the bare package name, additional roles get `<name>-<role>`.

Filenames are enforced by `tau-lint/plugin-capability-filename` (`libs/oxlint/src/rules/plugin-capability-filename.js`): flat files under `packages/plugins/*/src/` that carry a role must be `{name}.{role}.ts` — never `plugin.ts` and never `{name}-{role}.ts`.

The scaffold builds, typechecks, and tests green immediately. Then fill in the stub (section 1), add the engine dependency to `packages/plugins/<name>/package.json` (via `catalog:` where catalogued), and wire the consumer surfaces (section 3).

To change conventions for future packages, edit `tools/workspace-plugin/src/generators/plugin/files/`.

## 1) Implement the kernel

**File:** `packages/plugins/<name>/src/<name>.kernel.ts` (the generator stubs this)

```typescript
import { createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';

export const <alias>Kernel = defineKernel({
  id: '<name>',
  extensions: ['<ext>'],
  name: '<Name>Kernel',
  version: '0.1.0-beta.0',
  createOptionsSchema, // zod schema for factory options (optional)
  render: { optionsSchema: renderSchema }, // per-render options (optional)
  exportFormats: { glb: { optionsSchema: glbSchema } },

  async initialize(options, runtime) {
    /* load WASM/SDK; the return value becomes the kernel context */
  },
  async getDependencies({ entryPath }, runtime) {
    /* usually runtime.bundler.resolveDependencies(entryPath) for JS/TS */
  },
  async getParameters({ entryPath }, runtime, context) {
    /* extract defaults; return createKernelSuccess({ defaultParameters, jsonSchema }) */
  },
  async createGeometry({ entryPath, parameters }, runtime, context) {
    /* bundle + execute user code; return { geometry, nativeHandle } */
  },
  async exportGeometry({ fileType, nativeHandle }, runtime, context) {
    /* export from nativeHandle */
  },
  async cleanup(context) {
    /* release WASM/manual resources (optional but recommended) */
  },
});
```

Key patterns:

- `runtime.bundler.registerModule(name, { code, version })` for built-in module registration
- `runtime.bundler.bundle(entryPath)` + `runtime.execute(code)` for user code
- `createKernelSuccess(data)` / `createKernelError(issues)` for structured results in non-throw paths
- Throw an `Error` with an `.issues` array (custom `*BuildError`) for fatal geometry failures so the framework returns structured issues
- Prefer stack-enrichment utilities from `@taucad/runtime/kernel` for JS/TS kernels
- Keep backend payloads inside `initialize()` and the returned context — never in module-level caches
- Follow `docs/policy/geometry-naming-policy.md` for shape labels, glTF node/mesh names, generated materials, scenes, component IDs, selectors, native handles, diagnostics, imports, and export artifact names

Every helper a kernel needs is on the `@taucad/runtime/kernel` author surface. If a cross-kernel helper is missing, promote it there (see `docs/research/kernel-package-extraction.md`, Finding F3) — never reach into `@taucad/runtime`'s `#` internals.

### Geometry naming contract

- Use the shape-name helper for generated shape display labels (`Shape 1`, `Shape 2`, ...).
- Use the geometry-name helpers for generated component IDs, selectors, and artifact naming.
- Use the glTF name normalizer when a native or external engine returns GLB/glTF bytes.
- Keep semantic mesh-bearing glTF node and mesh names non-empty and equal.
- Leave Tau-generated material names and single-scene names unset unless a real semantic role requires a stable label.
- Derive component IDs from payload addresses (`component:node-0`), never from display labels, material indices, or mutable UI text.
- Do not copy legacy generated labels (`AnyShape`, `Geometry`, `Mesh`, zero-index `Shape_*`, color-derived material names, converter fallback scene/material names).

Reference: `packages/plugins/openrscad/src/openrscad.kernel.ts`.

## 2) Add tests

**File:** `packages/plugins/<name>/src/<name>.kernel.test.ts` (the generator does _not_ stub this; the plugin test it does stub covers the alias, capability ids, and payload isolation)

### Mandatory shared utils

Use helpers from `@taucad/runtime/testing` and `@taucad/geometry-core/testing`. Do NOT define local mock helpers for filesystem, logger, or runtime.

| Helper                                                                                        | From                            | Purpose                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| `createTestWorker(definition, files, options?)`                                               | `@taucad/runtime/testing`       | Integration tests through `KernelRuntimeWorker`      |
| `getTestParameters({ ... })`                                                                  | `@taucad/runtime/testing`       | Extract parameters through the worker                |
| `createTestGeometry({ ... })`                                                                 | `@taucad/runtime/testing`       | Render geometry through the worker                   |
| `createGeometryFile(filename)`                                                                | `@taucad/runtime/testing`       | Build the normalized internal file locator           |
| `createMockKernelRuntime(options?)`                                                           | `@taucad/runtime/testing`       | Unit tests calling lifecycle methods directly        |
| `resolveRuntimePluginDefinition('kernel', <alias>Kernel())`                                   | `@taucad/runtime/testing`       | Resolve a factory to its definition for direct calls |
| `assertSuccess(result)`                                                                       | `@taucad/runtime/testing`       | Type-narrowing assertion on `KernelResult`           |
| `createGeometryTestHelpers()`, `validateGlbData`, `getInspectReport`, `readGltfNamingSummary` | `@taucad/geometry-core/testing` | GLB/glTF validation, stats, and naming assertions    |

```typescript
import { describe, expect, it } from 'vitest';
import { createGeometryFile, createTestWorker } from '@taucad/runtime/testing';
import { <alias>Kernel } from '#<name>.kernel.js';

describe('<Name>Kernel', () => {
  it('renders geometry through the worker', async () => {
    const worker = await createTestWorker(<alias>Kernel, { 'model.ext': '/* source */' });
    const result = await worker.createGeometry({ file: createGeometryFile('model.ext'), parameters: {} });
    expect(result.success).toBe(true);
  });
});
```

### Minimum coverage

- `getParameters` — defaults extraction + empty fallback
- `createGeometry` — happy path + parameterized + error cases
- `exportGeometry` — supported and unsupported formats + no-geometry failure
- Geometry naming — parse GLB/glTF output and assert node/mesh parity, material/scene naming, component IDs/selectors, and artifact filenames per `docs/policy/geometry-naming-policy.md`

Reference quality bar: `packages/plugins/openrscad/src/openrscad.kernel.test.ts`.

## 3) Wire into the system

The generator already produced the package's exports and build entries. A standalone kernel has **no** runtime-side factory, barrel, or preset to touch. Remaining wiring:

### 3.1 Consumer composition

Consumers add `@taucad/<name>` to their `package.json` and compose the package-named alias:

```typescript
import { <alias> } from '@taucad/<name>';

defineRuntime({ plugins: [<alias>()] });
```

### 3.2 UI runtime definition

**File:** `apps/ui/app/runtime/ui-runtime.definition.ts`

Import the alias from `@taucad/<name>` and add `<alias>()` to the `plugins` array. Add `@taucad/<name>` to `apps/ui/package.json`.

### 3.3 Catalog metadata

**File:** `libs/types/src/constants/kernel.constants.ts`

Add an entry to `kernelConfigurations` with `id`, `name`, `language`, `dimensions`, `description`, `mainFile`, `backendProvider`, `longDescription`, `emptyCode`, `recommended`, `tags`, `features`. Keep `mainFile`'s extension consistent with the kernel's `extensions`.

### 3.4 Prompt system

Add under `apps/api/app/api/chat/prompts/kernel-prompt-configs/`:

- `<id>.prompt.config.ts`
- `<id>.prompt.example.<ext>`
- Register in the `kernelConfigs` map in `kernel.prompt.config.ts`

Use the existing replicad/jscad/manifold/openscad configs as templates.

### 3.5 Monaco IntelliSense types

Only needed when users `import` a JS/TS API from the kernel. Declarations are bundled as a JSON map (`Record<modulePath, dtsSource>`) — do **not** use `declare module` wrappers (TS1038 in ambient contexts).

1. **Extraction script:** `libs/api-extractor/src/extract-<id>-types.ts` exporting `buildBundledTypes(): Record<string, string>` and a `main()` CLI entry that writes `src/generated/<id>/<id>.bundled.json` plus per-module `.d.ts` files under `src/generated/<id>/modules/<module-path>/index.d.ts`. Template: `extract-manifold-types.ts` (simple) or `extract-jscad-types.ts` (TS Compiler API).
2. **Nx target** in `libs/api-extractor/project.json`:

   ```json
   "extract-<id>": {
     "executor": "nx:run-commands",
     "options": { "command": "tsx src/extract-<id>-types.ts", "cwd": "libs/api-extractor" }
   }
   ```

3. **Register** in `libs/api-extractor/src/kernel-types.ts`: parse the bundled JSON into a `KernelTypesMap` and add a `projectPackageTypes('<module-name>', <id>Types)` entry to `kernelTypePackageMaps`. The UI mounts that array in `apps/ui/app/machines/file-manager.worker.ts` — no further registration.
4. **Type-level tests:** `libs/api-extractor/src/generated/<id>/<id>.bundled.test-d.ts` plus `paths` entries in `libs/api-extractor/tsconfig.typetest.json`.
5. **Run extraction:** `pnpm nx extract-<id> api-extractor`

### 3.6 Documentation

At minimum update `docs/policy/runtime-architecture-policy.md` and the docs-site kernel pages under `apps/ui/content/docs/runtime/` (`guides/choosing-a-kernel.mdx`, `api/kernels.mdx`, `concepts/plugin-system.mdx`, `concepts/kernel-selection.mdx`, `getting-started/installation.mdx`, `guides/bundler-configuration.mdx`). Update every kernel list, comparison table, and selection-priority reference.

## 4) Verify

```bash
pnpm nx run-many -t lint test typecheck build pkgcheck --projects=<name>
pnpm nx typecheck ui && pnpm nx lint ui
```

If `apps/api` changed: `pnpm nx run-many -t lint test typecheck --projects=api`.

## Agent execution protocol

1. Scaffold (section 0)
2. Implement kernel + tests
3. Wire consumer composition, UI runtime definition, catalog, prompts, Monaco
4. Verify geometry-naming compliance for render, export, native handles, converter boundaries
5. Update docs
6. Run the Nx checks and fix every regression
7. Commit in logical groups (scaffold, implementation, wiring, docs)

## File checklist

- [ ] `packages/plugins/<name>/` scaffolded via the plugin generator
- [ ] `packages/plugins/<name>/src/<name>.kernel.ts` implemented
- [ ] `packages/plugins/<name>/src/<name>.kernel.test.ts` written
- [ ] `packages/plugins/<name>/src/index.ts` exports `plugin`, the alias, and `<alias>Kernel`
- [ ] `packages/plugins/<name>/package.json` — engine dependency added
- [ ] `apps/ui/app/runtime/ui-runtime.definition.ts` + `apps/ui/package.json`
- [ ] `libs/types/src/constants/kernel.constants.ts` — catalog entry
- [ ] `apps/api/app/api/chat/prompts/kernel-prompt-configs/<id>.prompt.config.ts` + example + map registration
- [ ] `libs/api-extractor/src/extract-<id>-types.ts`, `project.json` target, `kernel-types.ts` registration, `tsconfig.typetest.json` paths
- [ ] Kernel docs pages + architecture policy updates

## Common failure modes

- Hand-rolled package files instead of the generator → drifting conventions; always start from `nx g @taucad/workspace-plugin:plugin`
- Looked for a `kernel` generator → it does not exist; kernels are a `--capabilities=kernel` plugin
- Named files `plugin.ts` or `<name>-kernel.ts` → `tau-lint/plugin-capability-filename` fails the lint target
- Reached into `@taucad/runtime`'s `#` internals → use the `@taucad/runtime/kernel` author surface
- Backend payload cached at module scope → breaks payload isolation and the generated `hostTarget` guard
- Missing `builtinModuleNames` for JS/TS kernels → transitive import detection fails
- Catalog `mainFile` inconsistent with the kernel's `extensions` → extension→kernel mapping misroutes files
- Local mock helpers instead of the shared testing utils → maintenance burden
- Copied legacy generated geometry names instead of the naming helpers → explorer/import/export drift
- `declare module` wrapper instead of raw `.d.ts` + JSON map → TS1038 errors in Monaco
- Added the kernel to code but not to the docs comparisons → docs drift
