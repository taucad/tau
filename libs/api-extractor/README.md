# @taucad/api-extractor

`@taucad/api-extractor` packages public TypeScript declarations that Tau mounts into the in-browser `/node_modules` workspace. The output is consumed by Monaco, the file manager bundled-types tree, and agent-authored project files that import first-party authoring APIs.

The root package intentionally stays asset-light. Use the dedicated subpaths:

- `@taucad/api-extractor/kernel-types` for CAD kernel declarations such as Replicad, JSCAD, Manifold, and OpenCascade.js.
- `@taucad/api-extractor/authoring-types` for non-kernel authoring packages such as GeoSpec.
- `@taucad/api-extractor/kcl-reference` for compact KCL markdown reference text.

## GeoSpec Authoring Types

GeoSpec declarations are generated from `packages/geospec/src` into `src/generated/geospec/geospec.bundled.json`. The generated bundle is package-shaped so Monaco can mount it exactly like a local package:

- `/node_modules/geospec/package.json`
- `/node_modules/geospec/index.d.ts`
- `/node_modules/geospec/config/index.d.ts`
- `/node_modules/geospec/mesh/index.d.ts`
- `/node_modules/geospec/model/index.d.ts`
- `/node_modules/geospec/runner/index.d.ts`
- `/node_modules/geospec/step/index.d.ts`
- `/node_modules/geospec/brep/index.d.ts`

Regenerate the GeoSpec bundle any time a public GeoSpec matcher, loader, option type, or subpath changes:

```bash
pnpm nx run api-extractor:extract-geospec
```

Then verify the authoring surface:

```bash
pnpm nx test api-extractor --watch=false
```

The regression tests assert that generated declarations expose current BRep and STEP APIs, including `loadModel({ format: 'step' })`, `loadStep`, `toBeValidBrep`, exact measurement matchers, feature matchers, and distance matchers. If an agent reads `node_modules/geospec/*.d.ts`, it should see the same public API that package consumers see.

## Kernel Type Bundles

Kernel declaration extractors produce JSON maps under `src/generated/<kernel>/`:

```bash
pnpm nx run api-extractor:extract-replicad
pnpm nx run api-extractor:extract-jscad
pnpm nx run api-extractor:extract-manifold
pnpm nx run api-extractor:extract-opencascade
pnpm nx run api-extractor:extract-kcl
```

`kernel-types` exposes two views of the same generated declarations:

- individual raw module maps for prompt and extraction consumers;
- `kernelTypePackageMaps` for filesystem materialization, with one root package and import subpaths stored as relative declaration files.

The raw generated JSON format stays module-specifier-shaped. The package projection is derived at import time so extractors and generated artifacts have one source of truth.

## Runtime Integration

`apps/ui/app/machines/file-manager.worker.ts` imports `kernelTypePackageMaps` and `authoringTypeMaps`, then calls `populateBundledTypesMount(...)`. Every package name is a true npm package root; import subpaths are written beneath it through the bundle's `files` map. Monaco recursively reads that mounted tree and registers each declaration with both TypeScript and JavaScript defaults before network acquisition is needed.

GeoSpec stays in `authoring-types` rather than `kernel-types` because it is a test-authoring package used across kernels.

## Maintenance Rules

- Keep generated JSON in source control; the browser editor depends on it at build time.
- Add a public subpath to the raw extractor map and its projection regression tests.
- Prefer package-shaped declarations for authoring APIs so `package.json#exports` matches real Node/package resolution.
- Do not hand-write app-local GeoSpec declarations. Generate them from `packages/geospec/src`.
- Do not add runtime assets to the root `@taucad/api-extractor` entrypoint.
