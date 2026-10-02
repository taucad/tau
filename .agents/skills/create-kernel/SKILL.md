---
name: create-kernel
description: Add a new first-party CAD kernel to Tau as a standalone @taucad/* package. Use when adding a kernel, integrating a new CAD engine, implementing defineKernel, scaffolding a kernel package, or wiring kernel UI catalog, prompt, and Monaco entries. Agents should select this skill autonomously when a request clearly introduces or productizes a kernel.
---

# Create Kernel

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
| `src/<name>.kernel.ts`                                                                                                               | A v2 `defineKernel` **stub** with `views`, `exports`, `resolve`, `describe`, and `evaluate`       |
| `src/<name>.plugin.test.ts`                                                                                                          | Alias-identity test, capability-id assertions, and (for `hostTarget: browser`) the payload guard  |
| `src/<name>.plugin.test-d.ts`                                                                                                        | Type-level alias identity                                                                         |
| `AGENTS.md`                                                                                                                          | Plugin identity, `kernel` capability, selected host, entrypoints, Nx commands and owner links     |
| `CLAUDE.md`                                                                                                                          | Exact `@AGENTS.md` import                                                                         |

The plugin creator's shared KeepExisting writer owns this starter pair. A
kernel package has no separate generator or instruction template. Maintain the
generated AGENTS in place after creation; do not rerun the full creator over an
existing package.

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
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  nonemptyExportFiles,
} from '@taucad/runtime/kernel';

export const <alias>Kernel = defineKernel({
  id: '<name>',
  extensions: ['<ext>'],
  name: '<Name>Kernel',
  version: '1.0.0',
  // optionsSchema configures initialize; evaluateOptionsSchema changes construction.
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: { stl: { title: 'STL', mimeType: 'model/stl', extension: 'stl' } },

  async initialize(_options, _services) {
    return { backend: await loadBackend() };
  },
  async resolve({ entryPath }, services) {
    return services.bundler.resolveDependencies(entryPath);
  },
  async describe(_input, _services, _context) {
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {}, { type: 'object', properties: {}, additionalProperties: false },
        { id: 'urn:taucad:<name>:parameters', name: '<Name>Parameters' },
      ),
    });
  },
  async evaluate({ entryPath, parameters }, services, context) {
    const source = await services.filesystem.readFile(entryPath, 'utf8');
    const handle = await context.backend.build(source, parameters);
    return { handle, views: ['model'], exports: ['stl'] };
  },
  async render({ handle }, _services, context) {
    return { content: await context.backend.renderGlb(handle) };
  },
  async export({ handle }, _services, context) {
    const bytes = await context.backend.writeStl(handle);
    return { files: nonemptyExportFiles([{ name: 'model.stl', mimeType: 'model/stl', bytes }]) };
  },
  serializeHandle({ handle }, _services, context) {
    return context.backend.serialize(handle);
  },
  deserializeHandle({ serialized }, _services, context) {
    return context.backend.deserialize(serialized);
  },
  async onDispose(context) {
    await context.backend.dispose();
  },
});
```

Key patterns:

- Declare keyed `views` and `exports` with title and MIME type; exports also name a file extension. Add route-specific `optionsSchema` and `content` only when the route fulfills them.
- `evaluate` returns one opaque handle and ordered offered view/export IDs; the first offered view is the default for the current client bridge. A kernel may offer exports without views. Optional `instances` on a declared view names alternatives for the same evaluated handle.
- `render` reads the handle and must not mutate it or re-evaluate source. It returns content; the runtime attaches the declared MIME type. `export` returns at least one file with `nonemptyExportFiles` and can use an open MIME type.
- `services.bundler.registerModule(name, { code, version })`, `services.bundler.bundle(entryPath)` and `services.execute(code)` are available for JS/TS kernels. Services are operation-scoped; backend state stays in the context returned by `initialize`.
- `describe` returns `createKernelSuccess({ parameters: declaration })` or `createKernelError(issues)`. `resolve` returns runtime paths.
- Pair `serializeHandle` and `deserializeHandle` for retained handles; snapshots must be structured-cloneable. Use `releaseHandle` for per-handle resources and `onDispose` for backend teardown.
- Throw an `Error` with `.issues` for fatal backend failures so the framework returns structured issues; keep backend payloads in `initialize()` and its context rather than module-level caches.
- Follow `docs/policy/geometry-naming-policy.md` for shape labels, glTF nodes/meshes, scenes, selectors, diagnostics and export artifact names.

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

- `describe` — defaults extraction + empty fallback
- `evaluate` — handle, offers, parameterized and error cases
- `render` / `export` — offered view and export IDs, route options, nonempty artifacts and no-handle failure
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

At minimum update `docs/policy/runtime-architecture-policy.md` and the docs-site kernel pages under `apps/docs/content/docs/runtime/` (`guides/choosing-a-kernel.mdx`, `api/kernels.mdx`, `concepts/plugin-system.mdx`, `concepts/kernel-selection.mdx`, `getting-started/installation.mdx`, `guides/bundler-configuration.mdx`). Update every kernel list, comparison table, and selection-priority reference.

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
