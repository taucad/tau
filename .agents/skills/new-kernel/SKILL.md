---
name: new-kernel
description: Add a new first-party CAD kernel to Tau as a standalone @taucad/* package. Use when adding a kernel, integrating a new CAD engine, implementing defineKernel, scaffolding a kernel package, or wiring kernel UI catalog, prompt, and Monaco entries.
---

# New Kernel Integration

Add a new first-party CAD kernel to Tau as a standalone, publishable `@taucad/*` package (like `@taucad/openrscad`). Kernels live under `packages/kernels/<id>/` and consume the runtime only through its public author surface (`@taucad/runtime/kernel`, `/types`, `/testing`) — never its `#`-prefixed internals.

## Definition of Done

1. Standalone package scaffolded at `packages/kernels/<id>/` (via the generator in section 0)
2. Kernel implementation at `packages/kernels/<id>/src/<id>.kernel.ts`
3. Comprehensive tests pass at `packages/kernels/<id>/src/<id>.kernel.test.ts`
4. Consumers opt in by depending on `@taucad/<id>` and composing it explicitly (there is no runtime factory/preset/barrel to register into)
5. UI default/debug options include the kernel where applicable
6. Type/catalog metadata in `libs/types/src/constants/kernel.constants.ts`
7. Prompt configuration supports the kernel
8. Monaco IntelliSense types extracted, exported, and registered
9. Nx lint/typecheck/test pass

## 0) Scaffold the package

Generate the baseline with the workspace **kernel generator** — the reference script for this skill (sibling to the `package` generator behind the `create-package` skill):

```bash
pnpm nx g ./tools/workspace-plugin/generators.json:kernel <id> --description="<one-line kernel description>"
pnpm install --no-frozen-lockfile
```

This creates `packages/kernels/<id>/` fully wired, zero cleanup:

| File                                                              | Purpose                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                    | ESM `publishConfig`, `.` + `./kernel` subpath exports, `@taucad/runtime` + `zod` deps, MIT                                                                                          |
| `tsdown.config.ts`                                                | Two entries (`src/index.ts`, `src/<id>.kernel.ts`), `unbundle`, `dts`, `minify`                                                                                                     |
| `tsconfig*.json`, `vitest.config.ts`, `project.json`, `README.md` | Shared Tau conventions (reused from the `package` generator)                                                                                                                        |
| `src/index.ts`                                                    | Public barrel re-exporting the kernel factory + schemas                                                                                                                             |
| `src/<id>.kernel.ts`                                              | A `defineKernel` **stub** importing only from `@taucad/runtime/kernel`, with an explicit `KernelPluginFactory<...>` annotation (keeps the emitted `.d.ts` portable — avoids TS2742) |
| `src/<id>.kernel.test.ts`                                         | A green, 100%-coverage smoke test driving every lifecycle method via `@taucad/runtime/testing`                                                                                      |

The scaffold builds (`tsdown`), typechecks, and tests green immediately. Then fill in the stub (section 1), add your engine's runtime dependency to `packages/kernels/<id>/package.json` (via `catalog:` where catalogued), and wire the UI/catalog/prompt/Monaco surfaces (section 3).

To change conventions for future kernels, edit the templates at `tools/workspace-plugin/src/generators/kernel/files/`.

## 1) Implement Kernel

**File:** `packages/kernels/<id>/src/<id>.kernel.ts` (the generator stubs this)

Use `defineKernel({...})` from `@taucad/runtime/kernel`:

```typescript
import { createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';

export const <id> = defineKernel({
  name: '<Name>Kernel',
  version: '1.0.0',
  renderSchema, // zod schema
  exportSchemas, // per-format zod schemas

  async initialize(options, runtime) {
    /* load WASM/SDK, register modules */
  },
  async getDependencies({ entryPath }, runtime) {
    /* resolve deps — usually runtime.bundler.resolveDependencies(entryPath) for JS/TS */
  },
  async getParameters({ entryPath }, runtime, context) {
    /* extract defaultParams and return JSON schema */
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
- Throw `Error` with `.issues` array (custom `*BuildError`) for fatal geometry failures so framework returns structured issues
- Prefer stack enrichment utilities from `@taucad/runtime/kernel` for JS/TS kernels
- Follow `docs/policy/geometry-naming-policy.md` for shape labels, glTF node/mesh names, generated materials, scenes, component IDs, selectors, native handles, diagnostics, imports, and export artifact names

Every helper a kernel needs is on the `@taucad/runtime/kernel` author surface. If a cross-kernel helper you need is not yet exported there, promote it (see `docs/research/kernel-package-extraction.md`, Finding F3) — never reach into `@taucad/runtime`'s `#` internals from a kernel package.

### Geometry Naming Contract

New kernels must preserve authored/imported names and route Tau-owned generated names through the centralized helpers (all on `@taucad/runtime/kernel`):

- Use the shape-name helper for generated shape display labels (`Shape 1`, `Shape 2`, ...).
- Use the geometry-name helpers for generated component IDs, selectors, and artifact naming.
- Use the glTF name normalizer when a native or external engine returns GLB/glTF bytes.
- Keep semantic mesh-bearing glTF node and mesh names non-empty and equal.
- Leave Tau-generated material names and single-scene names unset unless a real semantic role requires a stable label.
- Do not derive component IDs from display labels, material indices, or mutable UI text; use payload addresses such as `component:node-0`.
- Do not copy legacy generated labels such as `AnyShape`, `Geometry`, `Mesh`, zero-index `Shape_*`, color-derived material names, or converter fallback scene/material names.

Reference: `packages/kernels/openrscad/src/openrscad.kernel.ts`.

## 2) Add Tests

**File:** `packages/kernels/<id>/src/<id>.kernel.test.ts` (the generator stubs a green smoke test)

### Mandatory shared utils

All kernel tests MUST use helpers from `@taucad/runtime/testing`. Do NOT define local mock helpers for filesystem, logger, or runtime — use the shared utilities.

| Helper                                                            | Purpose                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createTestWorker(definition, files, options?)`                   | Integration tests via `KernelRuntimeWorker` with a seeded filesystem                                         |
| `getTestParameters(definition, files, mainFile)`                  | Extract parameters through the worker                                                                        |
| `createTestGeometry({ definition, files, mainFile, parameters })` | Render geometry through the worker                                                                           |
| `createGeometryFile(filename)`                                    | Build the normalized internal file locator used by worker test methods                                       |
| `createGeometryTestHelpers()`                                     | GLTF validation (`expectValidGltf`, `expectVertexCount`, `expectBoundingBoxSize`)                            |
| `createMockKernelRuntime(options?)`                               | Unit tests calling lifecycle methods directly (pair with `resolveRuntimePluginDefinition('kernel', <id>())`) |
| `assertSuccess(result)`                                           | Type-narrowing assertion on `KernelResult`                                                                   |

### Test structure example

```typescript
import { describe, it, expect } from 'vitest';
import { createGeometryFile, createTestWorker, getTestParameters } from '@taucad/runtime/testing';
import { <id> } from '#<id>.kernel.js';

describe('<Name>Kernel', () => {
  it('renders geometry through the worker', async () => {
    const worker = await createTestWorker(<id>, { 'model.ext': '/* source */' });
    const result = await worker.createGeometry({ file: createGeometryFile('model.ext'), parameters: {} });
    expect(result.success).toBe(true);
  });
});
```

### Minimum coverage

- `getParameters` — defaults extraction + empty fallback
- `createGeometry` — happy path + parameterized + error cases
- `exportGeometry` — supported and unsupported formats + no-geometry failure
- Geometry naming — parse GLB/glTF output with `NodeIO` and assert node/mesh parity, material/scene naming, component IDs/selectors, and artifact filenames per `docs/policy/geometry-naming-policy.md`

Reference quality bar: `packages/kernels/openrscad/src/openrscad.kernel.test.ts`.

## 3) Wire Into the System

The generator already produced the package's own exports and build entries. A standalone kernel has **no** runtime-side factory, `kernels-entry` barrel, or preset to touch. Remaining wiring:

### 3.1 Consumer composition

Consumers that want the kernel add `@taucad/<id>` to their `package.json` and compose it explicitly:

```typescript
import { <id> } from '@taucad/<id>';
const client = createRuntimeClient({ kernels: [<id>()] /* ... */ });
```

### 3.2 UI defaults

**File:** `apps/ui/app/constants/kernel-worker.constants.ts`

Import `<id>` from `@taucad/<id>` and add `<id>()` to `defaultKernelOptions.kernels` (and debug options where applicable). Add `@taucad/<id>` to `apps/ui`'s `package.json`.

### 3.3 Catalog metadata

**File:** `libs/types/src/constants/kernel.constants.ts`

Add an entry to `kernelConfigurations` with `id`, `name`, `language`, `dimensions`, `description`, `mainFile`, `backendProvider`, `longDescription`, `emptyCode`, `recommended`, `tags`, `features`. This static catalog (id + extensions + metadata) is also what extension→kernel mapping reads — keep `extensions` in sync with the kernel's `extensions`.

### 3.4 Monaco IntelliSense types

The editor provides IntelliSense for kernel imports via bundled `.d.ts` files registered with Monaco's `addExtraLib`. If the kernel exposes a JS/TS API that users import (e.g. `import ... from '<library>'`), add type definitions to the Monaco pipeline.

All kernels use the same **JSON map approach**: `buildBundledTypes()` returns `Record<string, string>` mapping module paths to raw `.d.ts` content. Each entry is registered at `file:///node_modules/<modulePath>/index.d.ts`. Do **not** use `declare module` wrappers (causes TS1038 in already-ambient contexts).

1. **Create extraction script:** `libs/api-extractor/src/extract-<id>-types.ts`
   - Read the kernel's `.d.ts` file(s); keep `export declare` as-is
   - Export `buildBundledTypes(): Record<string, string>` (for testability) and a `main()` CLI entry
   - In `main()`, write `<id>.bundled.json` to `generated/<id>/`, and individual `.d.ts` files under `generated/<id>/modules/<module-path>/index.d.ts` for type-level testing
   - Use `extract-manifold-types.ts` (simple wrapping) or `extract-jscad-types.ts` (TS Compiler API) as a template

2. **Add Nx target:** `libs/api-extractor/project.json`

   ```json
   "extract-<id>": {
     "executor": "nx:run-commands",
     "options": { "command": "tsx src/extract-<id>-types.ts", "cwd": "libs/api-extractor" }
   }
   ```

3. **Export from `@taucad/api-extractor`:** `libs/api-extractor/src/index.ts`

   ```typescript
   import <id>Raw from '#generated/<id>/<id>.bundled.json?raw';
   export const <id>Types: KernelTypesMap = parseTypesMap(<id>Raw);
   // Add <id>Types to the kernelTypeMaps array.
   ```

4. **Register in Monaco:** no change — `apps/ui/app/lib/javascript-contribution.ts` iterates `kernelTypeMaps` automatically.

5. **Add type-level tests:** `libs/api-extractor/src/generated/<id>/<id>.bundled.test-d.ts` and path mappings in `tsconfig.typetest.json`.

6. **Run extraction:** `pnpm nx extract-<id> api-extractor`

## 4) Prompt System Integration

Add kernel prompt config files under `apps/api/app/api/chat/prompts/kernel-prompt-configs/`:

- `<id>.prompt.config.ts`
- `<id>.prompt.example.<ext>`
- Register in `kernel.prompt.config.ts` map

Use existing configs (replicad/jscad/zoo/openrscad) as templates.

## 5) Documentation Updates

At minimum update:

- `docs/policy/runtime-architecture-policy.md`
- Kernel docs site pages under `apps/ui/content/docs/(runtime)/...`: index, choosing-a-kernel, installation, api/kernels, concepts/plugin-system, guides/bundler-configuration

Update all kernel lists/comparison tables, examples, and selection priority references.

## 6) Verify

```bash
pnpm nx typecheck <id>
pnpm nx test <id> --watch=false
pnpm nx lint <id>
pnpm nx typecheck ui
pnpm nx lint ui
```

If `apps/api` files changed:

```bash
pnpm nx typecheck api
pnpm nx lint api
pnpm nx test api --watch=false
```

## 7) Agent Execution Protocol

Recommended order:

1. Scaffold the package (section 0)
2. Implement kernel + tests
3. Wire consumer composition + UI + type catalog + prompts
4. Verify geometry naming policy compliance for render, export, native handles, and converter boundaries
5. Update docs
6. Run Nx checks and fix all regressions
7. Commit with a descriptive message

Keep commits logically grouped (scaffold, implementation, wiring, docs) if practical.

## File Checklist

- [ ] `packages/kernels/<id>/` scaffolded via the kernel generator (section 0)
- [ ] `packages/kernels/<id>/src/<id>.kernel.ts` implemented
- [ ] `packages/kernels/<id>/src/<id>.kernel.test.ts` grown from the stub
- [ ] `packages/kernels/<id>/package.json` — engine dependency added
- [ ] `apps/ui/app/constants/kernel-worker.constants.ts` — import + default options; `@taucad/<id>` dep added
- [ ] `libs/types/src/constants/kernel.constants.ts` — catalog + extensions entry
- [ ] `apps/api/app/api/chat/prompts/kernel-prompt-configs/<id>.prompt.config.ts`
- [ ] `apps/api/app/api/chat/prompts/kernel-prompt-configs/<id>.prompt.example.<ext>`
- [ ] `libs/api-extractor/src/extract-<id>-types.ts` (extraction script producing JSON map)
- [ ] `libs/api-extractor/src/index.ts` (export `<id>Types`, add to `kernelTypeMaps`)
- [ ] `libs/api-extractor/src/generated/<id>/<id>.bundled.test-d.ts` (type-level tests)
- [ ] `libs/api-extractor/tsconfig.typetest.json` (add path mappings for the new kernel)
- [ ] Kernel docs pages + architecture policy updates

## Common Failure Modes

- Skipped the generator and hand-rolled package files → drifting conventions; always start from `nx g ...:kernel`
- Reached into `@taucad/runtime`'s `#` internals from the kernel package → use the `@taucad/runtime/kernel` author surface (promote missing helpers there)
- Dropped the explicit `KernelPluginFactory<...>` annotation → TS2742 "inferred type not portable" breaks the `.d.ts` build
- Missing `builtinModuleNames` for JS/TS kernels → transitive import detection fails
- Added the kernel to code but not to docs comparisons → docs drift
- Catalog `extensions` out of sync with the kernel's `extensions` → extension→kernel mapping misroutes files
- Defined local mock helpers instead of using shared testing utils → maintenance burden
- Copied legacy generated geometry names instead of using the geometry naming helpers → explorer/import/export drift
- Forgot Monaco IntelliSense types → no editor autocomplete for the kernel's API
- Used `declare module` wrapper instead of raw `.d.ts` + JSON map → TS1038 errors in Monaco
