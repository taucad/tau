---
name: new-kernel
description: Add a new first-party CAD kernel to Tau as a standalone @taucad/* package. Use when adding a kernel, integrating a new CAD engine, implementing defineKernel, scaffolding a kernel package, or wiring kernel UI catalog, prompt, and Monaco entries.
---

# New Kernel Integration

Add a new first-party CAD kernel to Tau as a publishable `@taucad/*` plugin toolkit (like `@taucad/openrscad`). Kernel packages live under `packages/plugins/<name>/` and consume the runtime only through public entries such as `@taucad/runtime/kernel`, `/plugin`, and `/types` — never its `#`-prefixed internals. Reusable test support comes from `@taucad/runtime-testing`, not from a runtime subpath.

A kernel is one _capability_ of a plugin toolkit. The package declares its package-named factory and re-exports that binding as `plugin`; the kernel is the capability it registers.

## Definition of Done

1. Package scaffolded at `packages/plugins/<name>/` via the plugin generator (section 0)
2. Kernel implemented at `packages/plugins/<name>/src/<name>.kernel.ts`
3. Tests pass at `packages/plugins/<name>/src/<name>.kernel.test.ts` through public authoring and dedicated testing surfaces
4. `src/index.ts` exports the package-named factory, its `plugin` alias, and the `<name>Kernel` factory
5. Every applicable host roster is wired explicitly; inapplicable rosters are left alone (section 3)
6. Product catalog, prompt, editor language/types, icon, and docs surfaces are complete where the kernel is productized
7. The npm package name and Trusted Publisher are prepared by a maintainer before the first release
8. Package and affected-host Nx gates pass

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
| `hostTarget`   | No       | `browser` | `browser`, `node`, `daemon`, `python`, `native` — drives the payload guard |

This creates the package baseline; the kernel stub is intentionally non-functional and product wiring remains explicit:

| File                                                                                                                                 | Purpose                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `package.json`                                                                                                                       | ESM `publishConfig`, `#*.js` self-imports, `@taucad/runtime` peer + dev dep, `taucad.hostTarget`  |
| `tsdown.config.ts`, `tsconfig*.json`, `vitest.config.ts`, `project.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `.size-limit.json` | Shared Tau conventions and a placeholder budget that must be measured before release              |
| `src/index.ts`                                                                                                                       | `export { <alias>, <alias> as plugin } from '#<name>.plugin.js';` plus `export { <alias>Kernel }` |
| `src/<name>.plugin.ts`                                                                                                               | `definePlugin` wiring the kernel into `kernels.default` and a `default` preset                    |
| `src/<name>.kernel.ts`                                                                                                               | A `defineKernel` **stub** importing only from `@taucad/runtime/kernel`                            |
| `src/<name>.plugin.test.ts`                                                                                                          | Alias-identity test, capability-id assertions, and (for `hostTarget: browser`) the payload guard  |
| `src/<name>.plugin.test-d.ts`                                                                                                        | Type-level alias identity                                                                         |

Every generated capability uses the package slug as its id. Role buckets are separate ID domains, so a multi-role package may use `id: '<name>'` for both its kernel and transcoder without a collision. Presets contain dotted capability paths such as `kernels.default` and `transcoders.export`; those paths select factories but are never runtime capability ids.

Presets select capability sets only. Configure a selected factory through role-nested plugin options:

```typescript
<alias>{
  preset: 'default',
  kernels: {
    default: {
      /* optionsSchema input */
    },
  },
};
```

Filenames are enforced by `tau-lint/plugin-capability-filename` (`libs/oxlint/src/rules/plugin-capability-filename.js`): flat files under `packages/plugins/*/src/` that carry a role must be `{name}.{role}.ts` — never `plugin.ts` and never `{name}-{role}.ts`.

The generated baseline is expected to build, typecheck, test, lint, and pass `pkgcheck`; that proves generator parity, not kernel behavior. Fill in the stub (section 1), replace the placeholder size budget with a measured one, add the engine dependency to `packages/plugins/<name>/package.json` (via `catalog:` where catalogued), and wire the applicable consumer surfaces (section 3).

To change conventions for future packages, edit `tools/workspace-plugin/src/generators/plugin/files/`.

## 1) Implement the kernel

**File:** `packages/plugins/<name>/src/<name>.kernel.ts` (the generator stubs this)

```typescript
import {
  createKernelError,
  createKernelSuccess,
  defineKernel,
  finalizeRenderOutput,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

export const <alias>Kernel = defineKernel({
  id: '<name>',
  extensions: ['<ext>'],
  name: '<Name>Kernel',
  version: '1.0.0',
  optionsSchema, // factory/initialize options (optional)
  createOptionsSchema, // construction-affecting createGeometry input options (optional)
  render: { optionsSchema: renderSchema, content: ['includeEdges'] }, // either field may be omitted
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
    /* bundle + execute user code */
    return finalizeRenderOutput({ artifacts: [geometry], nativeHandle });
  },
  async exportGeometry({ format, nativeHandle }, runtime, context) {
    const bytes = new Uint8Array(); // replace with the backend export
    return createKernelSuccess([createExportFile(format, `model.${format}`, bytes)]);
  },
  serializeNativeHandle({ nativeHandle }, runtime, context) {
    /* return a structured-cloneable durable snapshot */
  },
  deserializeNativeHandle({ serializedNativeHandle }, runtime, context) {
    /* restore the native handle; define both snapshot hooks or neither */
  },
  async cleanup(context) {
    /* release WASM/manual resources (optional but recommended) */
  },
});
```

Key patterns:

- `runtime.bundler.registerModule(name, { code, version })` for built-in module registration
- `runtime.bundler.bundle(entryPath)` + `runtime.execute(code)` for user code
- `getParameters` returns `createKernelSuccess({ defaultParameters, jsonSchema })` or `createKernelError(issues)`
- `createGeometry`/`meshGeometry` return `finalizeRenderOutput({ artifacts, nativeHandle })`; this finalizes render content and preserves the handle for mesh/export
- `exportGeometry` returns `createKernelSuccess([createExportFile(format, name, bytes)], issues?)` or `createKernelError(issues)`
- Add `serializeNativeHandle` and `deserializeNativeHandle` together when native handles can be cached; snapshots must be structured-cloneable
- Throw an `Error` with an `.issues` array (custom `*BuildError`) for fatal geometry failures so the framework returns structured issues
- Prefer stack-enrichment utilities from `@taucad/runtime/kernel` for JS/TS kernels
- Keep backend payloads inside `initialize()` and the returned context — never in module-level caches
- Follow `docs/policy/geometry-naming-policy.md` for shape labels, glTF node/mesh names, generated materials, scenes, component IDs, selectors, native handles, diagnostics, imports, and export artifact names

Every production helper a kernel needs belongs on an appropriate public runtime author surface (`/kernel`, `/plugin`, or `/types`). If a cross-kernel production helper is missing, promote it to the relevant public entry (see `docs/research/kernel-package-extraction.md`, Finding F3) — never reach into `@taucad/runtime`'s `#` internals or move test-only support back into runtime.

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

Add `@taucad/runtime-testing` as a development dependency. Use its public helpers; do not rebuild filesystem, logger, runtime-client, or geometry assertions locally.

| Helper                                                                                                           | From                      | Purpose                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `createTestRuntimeClient({ runtime, files })`                                                                    | `@taucad/runtime-testing` | Integration through the real client + in-process transport |
| `getTestParameters({ runtime, files, mainFile })` / `createTestGeometry({ ... })`                                | `@taucad/runtime-testing` | One-shot integration helpers that close their own client   |
| `createMockKernelRuntime(options?)`, `createMockFileSystem(options?)`, `createMockLogger()`                      | `@taucad/runtime-testing` | Direct lifecycle unit tests                                |
| `assertSuccess(result)` / `assertFailure(result)`                                                                | `@taucad/runtime-testing` | Type-narrowing result assertions                           |
| `resolveRuntimePluginDefinition('kernel', <alias>Kernel())`                                                      | `@taucad/runtime/plugin`  | Resolve a public factory for direct lifecycle calls        |
| `createGeometryTestHelpers()`, `validateGlbData`, `getInspectReport`, `readGltfNamingSummary`, `glbToDocument()` | `@taucad/runtime-testing` | GLB/glTF validation, stats, and naming assertions          |

```typescript
import { expect, it } from 'vitest';
import { assertSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { <alias> } from '#index.js';

it('renders geometry through the public client path', async () => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ plugins: [<alias>()] }),
    files: { 'model.ext': '/* source */' },
  });
  try {
    const outcome = await client.render({ source: { path: 'model.ext' }, parameters: {} });
    expect(outcome.superseded).toBe(false);
    if (!outcome.superseded) assertSuccess(outcome.geometry);
  } finally {
    await client.shutdown();
  }
});
```

Callers own clients returned by `createTestRuntimeClient` and always shut them down. Never recreate the removed raw-worker harness or import runtime internals to inspect worker state.

### Minimum coverage

- `getParameters` — defaults extraction + empty fallback
- `createGeometry` — happy path + parameterized + error cases
- `exportGeometry` — supported and unsupported formats + no-geometry failure
- Geometry naming — parse GLB/glTF output and assert node/mesh parity, material/scene naming, component IDs/selectors, and artifact filenames per `docs/policy/geometry-naming-policy.md`

Reference quality bar: `packages/plugins/openrscad/src/openrscad.kernel.test.ts`.

## 3) Wire into the system

The generator already produced the package's exports and build entries. A standalone kernel has **no** runtime-side factory, barrel, or preset to touch. Remaining wiring:

### 3.1 Consumer composition

Consumers add `@taucad/<name>` to their `package.json` and compose the package-named factory:

```typescript
import { <alias> } from '@taucad/<name>';

defineRuntime({ plugins: [<alias>()] });
```

### 3.2 Review every host roster

The six composition rosters are intentional and ordered; do not add a kernel mechanically. For each applicable host, add the package dependency and package-named factory once. Record why a credentialed, native-only, converter-only, or otherwise incompatible kernel is omitted.

| Host                          | Runtime roster                                               | Dependency manifest                    |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| UI editor                     | `apps/ui/app/runtime/ui-runtime.definition.ts`               | `apps/ui/package.json`                 |
| CLI built-ins                 | `packages/cli/src/cli-runtime.ts`                            | `packages/cli/package.json`            |
| GeoSpec default model runtime | `packages/geospec-engine/src/model/default-runtime.ts`       | `packages/geospec-engine/package.json` |
| Runtime integration fixtures  | `apps/runtime-e2e/src/runtime.definition.ts`                 | `apps/runtime-e2e/package.json`        |
| Checked-in example rendering  | `libs/tau-examples/scripts/runtime.ts`                       | `libs/tau-examples/package.json`       |
| Import/export converter       | `apps/ui/app/routes/convert/converter-runtime.definition.ts` | `apps/ui/package.json`                 |

Array order is kernel-selection precedence. Preserve it deliberately. Review `apps/ui/vite.config.ts` `ssr.external` only when the package emits sibling SSR chunks; most kernel packages do not belong there.

### 3.3 Catalog metadata

**File:** `libs/types/src/constants/kernel.constants.ts`

Add an entry to `kernelConfigurations` with `id`, `name`, `language`, `dimensions`, `description`, `mainFile`, `backendProvider`, `longDescription`, `emptyCode`, `recommended`, `tags`, `features`. Keep `mainFile`'s extension consistent with the kernel's `extensions`.

If the product catalog id differs from the runtime capability id, document the mapping: catalog ids are persisted product offerings, while runtime ids select engines. Add a raw SVG whose id matches the catalog id under `apps/ui/app/components/icons/raw/`, then run `/regen-sprite`; `svg-icon.tsx` intentionally makes a missing kernel icon a type error.

### 3.4 Prompt system

Add under `apps/api/app/api/chat/prompts/kernel-prompt-configs/`:

- `<id>.prompt.config.ts`
- `<id>.prompt.example.<ext>`
- Register in the `kernelConfigs` map in `kernel.prompt.config.ts`

Use the existing replicad/jscad/manifold/openscad configs as templates. Include the single-file example, multi-shape example where supported, and multi-file directory where the language supports imports; update the registry tests instead of adding a second prompt map.

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
5. **Run extraction:** `pnpm nx run api-extractor:extract-<id>`

If the source extension is new to the editor, invoke the `add-monaco-language` skill. That workflow owns `libs/types/src/constants/code.constants.ts`, the Monaco contribution registry, Shiki grammar, and extension mapping; do not hand-roll a partial language registration here.

### 3.6 Documentation

At minimum update `docs/policy/runtime-architecture-policy.md` and the docs-site kernel pages under `apps/ui/content/docs/runtime/` (`guides/choosing-a-kernel.mdx`, `api/kernels.mdx`, `concepts/plugin-system.mdx`, `concepts/kernel-selection.mdx`, `getting-started/installation.mdx`, `guides/bundler-configuration.mdx`). Update every kernel list, comparison table, and selection-priority reference.

### 3.7 Prepare the npm package name

npm cannot attach a Trusted Publisher to a package name that does not exist. Before the first normal release, hand the exact `@taucad/<name>` coordinate to a maintainer for the one-time reviewed name reservation, then configure npmjs.com **Settings → Trusted Publisher** with repository `taucad/tau`, workflow `publish.yml`, and no environment unless the workflow declares one. A reservation uses a manifest-only `0.0.0` package under a non-default `bootstrap` tag; it must never become `latest`.

This is an operator action, not a network-dependent repository gate and not permission for an agent to publish. Follow `package-release/SKILL.md` for the release-group workflow.

## 4) Verify

```bash
NX_DAEMON=false ./node_modules/.bin/nx run-many -t lint test typecheck build pkgcheck size --projects=<name>
NX_DAEMON=false ./node_modules/.bin/nx run-many -t typecheck lint --projects=ui
```

If `apps/api` changed: `NX_DAEMON=false ./node_modules/.bin/nx run-many -t lint test typecheck --projects=api`.

## Agent execution protocol

1. Scaffold (section 0)
2. Implement kernel + tests
3. Review all six host rosters; wire only applicable consumers
4. Verify geometry-naming compliance for render, export, native handles, converter boundaries
5. Complete catalog, prompt, editor types/language/icon, docs, and npm-name handoff
6. Run the Nx checks and fix every regression
7. Prepare a version plan and commit only when requested

## File checklist

- [ ] `packages/plugins/<name>/` scaffolded via the plugin generator
- [ ] `packages/plugins/<name>/src/<name>.kernel.ts` implemented
- [ ] `packages/plugins/<name>/src/<name>.kernel.test.ts` written
- [ ] `packages/plugins/<name>/src/index.ts` exports `plugin`, the alias, and `<alias>Kernel`
- [ ] `packages/plugins/<name>/package.json` — engine dependency plus the `@taucad/runtime-testing` test dependency
- [ ] `.size-limit.json` placeholder replaced by a measured budget
- [ ] UI, CLI, GeoSpec, runtime-e2e, tau-examples, and converter rosters each reviewed; applicable manifests and compositions updated
- [ ] `libs/types/src/constants/kernel.constants.ts` — catalog entry and backend/language mappings
- [ ] `apps/ui/app/components/icons/raw/<id>.svg` added and sprite regenerated
- [ ] `apps/api/app/api/chat/prompts/kernel-prompt-configs/` — config, examples, map registration, tests
- [ ] `libs/api-extractor/` — extractor, target, generated declaration map/tests, `kernel-types.ts`, typetest paths
- [ ] New source language, if any, added through `add-monaco-language`
- [ ] Kernel docs pages + architecture policy updated
- [ ] Maintainer has reserved the npm name and configured its `publish.yml` Trusted Publisher
- [ ] Version plan covers every changed release-group project

## Common failure modes

- Hand-rolled package files instead of the generator → drifting conventions; always start from `pnpm nx g @taucad/workspace-plugin:plugin`
- Looked for a `kernel` generator → it does not exist; kernels are a `--capabilities=kernel` plugin
- Named files `plugin.ts` or `<name>-kernel.ts` → `tau-lint/plugin-capability-filename` fails the lint target
- Reached into `@taucad/runtime`'s `#` internals → use the `@taucad/runtime/kernel` author surface
- Backend payload cached at module scope → breaks payload isolation and the generated `hostTarget` guard
- Missing `builtinModuleNames` for JS/TS kernels → transitive import detection fails
- Catalog `mainFile` inconsistent with the kernel's `extensions` → extension→kernel mapping misroutes files
- Local mock helpers instead of the shared testing utils → maintenance burden
- Imported a removed `@taucad/runtime/testing` or `@taucad/geometry-core/testing` subpath → use `@taucad/runtime-testing`
- Copied legacy generated geometry names instead of the naming helpers → explorer/import/export drift
- `declare module` wrapper instead of raw `.d.ts` + JSON map → TS1038 errors in Monaco
- Added the kernel to one host roster without reviewing the other five → hidden CLI/GeoSpec/example/converter drift
- Added the kernel to code but not to prompts, editor types/icon, or docs comparisons → product-surface drift
- Expected CI to claim a new npm name automatically → Trusted Publisher setup requires the one-time maintainer reservation first
