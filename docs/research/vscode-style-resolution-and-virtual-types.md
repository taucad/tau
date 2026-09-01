---
title: 'VSCode-Style Module Resolution & Virtual Type Definitions'
description: 'Blueprint for adopting full package.json/tsconfig.json resolution and a virtual .d.ts plugin layer so non-TypeScript kernels (KCL, OpenSCAD) expose typed parameter and geometry APIs to Monaco and the test runtime.'
status: draft
created: '2026-04-23'
updated: '2026-04-23'
category: architecture
related:
  - docs/research/node-modules-single-source-of-truth.md
  - docs/research/browser-first-parameter-aware-testing.md
  - docs/research/monaco-lsp-lazy-activation-blueprint.md
  - docs/research/typescript-esm-extension-resolution.md
  - docs/research/unresolved-dependency-watch-gap.md
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
---

# VSCode-Style Module Resolution & Virtual Type Definitions

Blueprint for the second layer above the `/node_modules` single source of truth: a full `package.json` + `tsconfig.json` resolver, plus a virtual `.d.ts` plugin contract that lets kernels (TypeScript-native and otherwise) project typed surfaces — parameters, helpers, route types — into Monaco and the kernel-worker bundler.

## Executive Summary

Today the runtime bundler does ad-hoc bare-specifier resolution (`packages/runtime/src/bundler/module-manager.ts`) and Monaco gets type definitions through an in-memory `addExtraLib` registry sourced by `TypeAcquisitionService`. Neither layer reads `package.json#exports` or `tsconfig.json#paths`, so authoring `import x from '#utils/foo.js'` or `import { defaultParams } from './main.scad'` either fails outright or silently picks the wrong file. The fix is to introduce a single **`TauResolver`** that mirrors `nodeNextResolution` (Node.js + TS module resolution) and is consumed by both esbuild (`onResolve`) and Monaco (custom `monaco.languages.typescript.JavaScriptWorker` resolver). Bolted on top of that resolver is a **virtual-types plugin contract** modelled on react-router's `.react-router/types/` and fumadocs' generated `.fumadocs/source.ts`: kernel plugins implement `getVirtualTypes({ files, params })` returning a list of `(virtualPath, contents)` tuples that the resolver materialises into the `/.tau/types/` overlay. This solves three problems at once:

1. KCL/OpenSCAD/JSCAD parameter shapes become real `import { defaultParams } from './cube.scad'` types — closing the typing gap that blocks Pattern 2/3 in `browser-first-parameter-aware-testing.md`.
2. The Tau testing adapter gets `import { renderTauModel } from '@taucad/testing/tau'` typed against the active kernel's actual parameter type without per-kernel manual stubs.
3. Internal `#`-aliased subpath imports (`#utils/foo.js`) and per-project `tsconfig.paths` resolve identically in the bundler and Monaco — eliminating the workspace's standing "no sibling-relative imports" lint as a configuration surface anyone can adopt.

The resolver is a 600–900 LOC addition; the virtual-types plugin contract is a 4-hook extension to the existing `KernelDefinition` type. Both can land incrementally behind feature flags and reuse the OPFS `/node_modules` cache from [`node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md).

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [Virtual-Types Plugin Contract](#virtual-types-plugin-contract)
- [Cross-Kernel Parameter Typing](#cross-kernel-parameter-typing)
- [Recommendations Roadmap](#recommendations-roadmap)
- [Trade-offs](#trade-offs)
- [Open Questions](#open-questions)
- [References](#references)

## Problem Statement

Three concrete authoring frictions surface today:

1. **Per-project resolution config has nowhere to live.** The bundler hard-codes resolution behaviour in `esbuild-core.ts`. A user dropping a `tsconfig.json` with `paths: { "#utils/*": ["./src/utils/*"] }` into a project sees Monaco respect it (the TS worker reads tsconfig automatically via `compilerOptions`) but esbuild silently fails to resolve the same import at runtime. A user dropping a `package.json` with `"exports": { ".": "./src/index.ts" }` sees the same divergence.
2. **Non-TS kernels expose parameters to the runtime but not to the editor.** OpenSCAD's per-file customizer schema is rich (groups, ranges, enums, tessellation knobs) and lives in `parse-parameters.ts:108-159`, but a `cube.scad` neighbour file authored as TypeScript cannot `import { defaultParams } from './cube.scad'` because Monaco has no type stub for `.scad` and no mechanism for the OpenSCAD kernel to publish one. The same gap applies to KCL (`zoo.kernel.ts:174-199`'s `convertKclVariablesToJsonSchema` produces a JSON Schema that never reaches the editor).
3. **The Tau testing adapter cannot type its render helper.** `browser-first-parameter-aware-testing.md` Pattern 2 (`describe.each([{ length_x: 8 }])`) only delivers DX if `renderTauModel({ parameters })` is typed against the active source file's parameter shape. Without virtual types this becomes `renderTauModel({ parameters: Record<string, unknown> })` — ergonomic suicide for a TDD workflow.

## Scope and Non-Goals

**In scope**

- Full `package.json#exports`, `imports`, `main`, `module`, `types`, `typesVersions` resolution.
- `tsconfig.json#compilerOptions.paths`, `baseUrl`, `extends`, `references` resolution.
- A virtual `.d.ts` provider contract on `KernelDefinition` and `MiddlewareDefinition`.
- Monaco integration: feeding the same resolver to the TS worker and the bundler from one source.
- Cross-kernel parameter typing: KCL, OpenSCAD, JSCAD, Replicad, Manifold, OpenCASCADE.
- `react-router`-style typed routes / `fumadocs`-style virtual sources, applied to kernels.

**Out of scope**

- Implementing a full TypeScript Language Server in the browser — Monaco's bundled `tsserver.js` already covers this; we only feed it better resolver data.
- Multi-root workspaces — single project root for now (matches current FM machine model).
- Publishing virtual `.d.ts` to npm — they live entirely on the user's filesystem under `/.tau/types/`.
- Runtime plugin discovery/installation — covered separately in [`dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md).
- Sharing/snapshot reproducibility of generated virtual types — covered in [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md).

## Findings

### Finding 1: Today's resolver is a partial Node-style heuristic, not spec-compliant

`module-manager.ts:109-150` and `esbuild-core.ts:401-651` (cited in [`node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md) §Findings) implement bare-specifier resolution by reading `/node_modules/<pkg>/package.json#main`, falling back to `index.js`, and treating `?bundle` ESM blobs as the unit of resolution. Specifically missing:

| Spec field                   | Today's behaviour                                   | What's lost                                                                      |
| ---------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `package.json#exports`       | Ignored                                             | Subpath imports (`'lodash/debounce'`), conditional resolution (`browser`/`node`) |
| `package.json#imports`       | Ignored                                             | Internal `#`-prefixed aliases (the workspace's own convention!)                  |
| `package.json#typesVersions` | Ignored                                             | Per-TS-version type fan-out (lodash, react-dom)                                  |
| `package.json#types`         | Ignored                                             | Standalone declaration packages (`@types/*`)                                     |
| `tsconfig.json#paths`        | Resolved by Monaco's TS worker only, not by bundler | Bundler + Monaco diverge on the same import string                               |
| `tsconfig.json#extends`      | Not loaded at all                                   | Inherited compiler options (no shared `tsconfig.base.json`)                      |
| `tsconfig.json#references`   | Not loaded at all                                   | Project references / composite builds                                            |

The workspace's own `no-restricted-imports` rule (AGENTS.md learned-facts) requires every package to use `#`-prefixed subpath imports defined in `package.json#imports`. **The runtime bundler cannot resolve those imports today** — they only happen to work because every `package.json#imports` mapping resolves to a file the bundler already finds via relative-path heuristics. The moment a user authors a project with the same convention, they hit a wall.

### Finding 2: Monaco's TS worker already does spec-compliant resolution — we just need to feed it project files

`apps/ui/app/lib/javascript-contribution.ts` shows Monaco loads bundled `lib.*.d.ts` for ES2022 targets and registers extras via `addExtraLib` at URIs like `file:///node_modules/<pkg>/index.d.ts`. The TS worker bundled with Monaco includes the full `nodeNextResolution` algorithm — it reads `package.json#exports`, `tsconfig.paths`, and the rest. The reason cross-file IntelliSense works today is that the TS worker resolves through that algorithm against the in-memory `addExtraLib` URIs and any models registered in Monaco's editor model registry.

The asymmetry is therefore: Monaco's TS worker has the right resolver but the wrong filesystem (in-memory only); esbuild has the right filesystem (OPFS-backed `/node_modules`) but the wrong resolver (heuristic-only). **The fix is one resolver implementation that drives both layers.**

### Finding 3: Three kernel families have three parameter-discovery mechanisms but one shared output shape

Per the exploration of `defineKernel.getParameters`, every kernel returns the same shape:

```typescript
type GetParametersResult = KernelResult<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: unknown; // JSON Schema Draft-07
}>;
```

(`packages/runtime/src/types/runtime.types.ts:261-264`)

| Kernel      | Discovery                                                             | Source-typing today                                              |
| ----------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| KCL (Zoo)   | `parseKcl` → `executeMockKcl` → `convertKclVariablesToJsonSchema`     | None — `.kcl` is not TypeScript                                  |
| OpenSCAD    | `openscad --export-format=param` → JSON → `processOpenScadParameters` | None — `.scad` is not TypeScript                                 |
| JSCAD       | Bundle + execute → `getParameterDefinitions()` else `defaultParams`   | Yes if user authors valid TS exporting `getParameterDefinitions` |
| Replicad    | Bundle + execute → `extractDefaultParameters` → `jsonSchemaFromJson`  | Yes — type follows the runtime export shape                      |
| Manifold    | Same as Replicad                                                      | Yes                                                              |
| OpenCASCADE | Same as Replicad                                                      | Yes                                                              |

JSON Schema is the canonical wire format. We can mechanically translate any JSON Schema into a TypeScript type via `json-schema-to-typescript` (or our own `@taucad/json-schema` helpers) and emit a `.d.ts` for `import { defaultParams } from './cube.scad'`. **The mechanism is uniform across kernels.**

### Finding 4: The `react-router` and `fumadocs` virtual-types pattern is already widely understood by Monaco

React Router 7 generates `.react-router/types/app/+types.routes.ts` per route during dev, then maps `import type { Route } from './+types/route'` to those generated files via `tsconfig.paths`. Fumadocs generates `.fumadocs/source.ts` with typed exports for `loader()` and `mdx-components`. Both rely on:

1. A generator that watches user files and emits `.d.ts` (or `.ts` with `declare module`) into a hidden directory.
2. `tsconfig.paths` mapping logical specifiers (`./+types/...`, `fumadocs-source`) to the generated files.
3. The TS language service picking those files up like any other project source.

The same pattern works for kernels with one specific tweak: instead of `tsconfig.paths` (which would require touching user config), we register virtual files under `/.tau/types/` and use **TypeScript's `triple-slash directive` + `paths`** in the workspace's hidden `/.tau/tsconfig.generated.json` that user `tsconfig.json#extends` from. The user's only config change is `"extends": "./.tau/tsconfig.generated.json"` (or no change if we ship a default tsconfig generator).

### Finding 5: A virtual-types plugin contract slots cleanly onto `defineKernel`

`KernelDefinition` already has `getDependencies` (returns watched dependency paths) and `getParameters` (returns runtime-discovered parameters). A symmetric `getVirtualTypes` hook returning `(path, contents)` pairs is a one-line addition:

```typescript
type VirtualTypeFile = {
  /** Path under /.tau/types/, e.g. 'cube.scad.d.ts' */
  path: string;
  /** Full .d.ts source */
  contents: string;
};

type GetVirtualTypesInput = {
  files: { path: string; contents: string }[];
  parameters: Record<string, unknown>;
  parameterSchema: unknown; // JSON Schema
};

interface KernelDefinition</* ... */> {
  // Existing
  getDependencies(input: GetDependenciesInput): GetDependenciesResult;
  getParameters(input: GetParametersInput): GetParametersResult;
  // New
  getVirtualTypes?(input: GetVirtualTypesInput): VirtualTypeFile[];
}
```

A kernel emits virtual types at the same cadence it re-extracts parameters — i.e. on every render after a successful bundle. The kernel-worker writes them to `/.tau/types/`, the FS watcher coalesces, the TS worker re-reads, IntelliSense updates. Same file watch path as everything else.

## Target Architecture

A new `@taucad/resolver` package (browser + node) implements the spec-compliant resolver. Both `esbuild-core.ts` and Monaco's TS worker contribution consume it.

| Layer                       | Module                                                                                                                                      | Responsibility                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Spec-compliant resolver** | `@taucad/resolver` (new)                                                                                                                    | `nodeNextResolution` + tsconfig-paths algorithm; pure FS contract; works in worker, main thread, Node   |
| **FS contract**             | `ResolverFileSystem` interface (read-only subset of `FileService`)                                                                          | Single seam: bundler passes `RuntimeFileSystem`, Monaco passes a thin adapter over `MonacoModelService` |
| **Esbuild integration**     | `esbuild-core.ts` `createVfsPlugin` → calls resolver                                                                                        | Replaces today's heuristic `parsePackageSpecifier` + `resolveFileExtension` chain                       |
| **Monaco integration**      | `javascript-contribution.ts` → `monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ paths })` + custom module resolver hook | Feeds tsconfig paths and `package.json#exports` into the TS worker                                      |
| **Virtual-types overlay**   | `/.tau/types/` directory in the project filesystem                                                                                          | Where kernels and middleware emit generated `.d.ts`                                                     |
| **Auto tsconfig**           | `/.tau/tsconfig.generated.json` (auto-emitted)                                                                                              | `paths`, `types`, `lib` defaults; user's `tsconfig.json` extends from it                                |
| **Plugin contract**         | `KernelDefinition.getVirtualTypes`, `MiddlewareDefinition.getVirtualTypes` (new)                                                            | Optional hooks that return `[{ path, contents }]` to materialise under `/.tau/types/`                   |
| **Lockfile integration**    | `/.tau/lockfile.json` (per [`api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md))                              | Records resolved package versions so virtual types regenerate deterministically                         |

### Resolver contract

```typescript
export type ResolverOptions = {
  fs: ResolverFileSystem;
  /** Project root (e.g. '/projects/<id>'). All resolution is relative to this. */
  root: string;
  /** Conditional resolution: ['browser', 'import', 'default'] for browser; add 'node' for SSR. */
  conditions: string[];
  /** Optional pre-loaded tsconfig (re-loaded from FS otherwise). */
  tsconfig?: ParsedTsconfig;
  /** Optional pre-loaded package.json cache. */
  packageJsonCache?: Map<string, ParsedPackageJson>;
};

export interface TauResolver {
  /** The single entry point. Returns absolute path under `root` or undefined. */
  resolve(specifier: string, importer: string): Promise<ResolvedModule | undefined>;
  /** For Monaco's `Cmd+Click` flow — same algorithm, returns `file://` URI. */
  resolveToUri(specifier: string, importer: string): Promise<string | undefined>;
  /** Invalidate caches when watched files change. */
  invalidate(path: string): void;
}

type ResolvedModule = {
  path: string; // absolute under fs root
  format: 'esm' | 'cjs';
  /** Where this resolution came from — for diagnostics. */
  trace: ResolutionStep[];
};
```

The resolver is **stateless except for parsed `package.json` / `tsconfig.json` caches** that the FS watcher invalidates. No global state, no singleton — every `RuntimeClient` and every Monaco contribution gets its own instance scoped to a project.

### Resolver decision tree

```
specifier
  │
  ├── starts with './' or '../' → relative file resolution (extensionless probe)
  │
  ├── starts with '#' → resolve via importer's nearest package.json#imports
  │
  ├── starts with absolute path → direct read
  │
  ├── starts with 'taucad:' or 'http://' / 'https://' → builtin / http-url namespace (existing)
  │
  └── bare specifier ('lodash', 'lodash/debounce', '@scope/pkg/sub')
        │
        ├── tsconfig.paths match? → expand to candidate paths, recurse
        │
        ├── package.json#imports match (same scope)? → expand
        │
        └── walk /node_modules from importer upward
              └── /node_modules/<pkg>/package.json
                    │
                    ├── exports[subpath][condition] → resolve
                    ├── main / module / types          → fallback
                    └── conventional index.{ts,tsx,js,jsx,d.ts}
```

This mirrors `nodeNextResolution` per the [Node.js resolution algorithm](https://nodejs.org/api/esm.html#resolution-and-loading-algorithm) and TypeScript's `--moduleResolution NodeNext` so Monaco and esbuild produce identical answers.

## Virtual-Types Plugin Contract

```typescript
// New: packages/runtime/src/types/virtual-types.types.ts
export type VirtualTypeFile = {
  /** Path under /.tau/types/. Must end in '.d.ts'. */
  path: string;
  /** Full .d.ts source. Must compile under the project's tsconfig. */
  contents: string;
  /** Source file(s) this type was derived from (for cache invalidation). */
  sources: string[];
};

export type GetVirtualTypesInput = {
  /** All project source files the kernel knows about. */
  files: ReadonlyArray<{ path: string; contents: string }>;
  /** Discovered parameters (same as getParameters output). */
  parameters: Record<string, unknown>;
  /** JSON Schema for the parameters. */
  parameterSchema: unknown;
};

export interface VirtualTypesProvider {
  getVirtualTypes(input: GetVirtualTypesInput): VirtualTypeFile[] | Promise<VirtualTypeFile[]>;
}
```

`KernelDefinition` and `KernelMiddlewareOptions` extend `VirtualTypesProvider` optionally. The runtime (`kernel-worker.ts`) drives the cycle:

```
render or parameters request
  │
  ├── existing: getParameters(...) → {defaultParameters, jsonSchema}
  │
  └── new: if kernel.getVirtualTypes
        │
        ├── kernel.getVirtualTypes({files, parameters, parameterSchema})
        ├── for each VirtualTypeFile:
        │   filesystem.writeFile(`/.tau/types/${file.path}`, file.contents)
        └── filesystem.writeFile('/.tau/tsconfig.generated.json', emitTsConfig({...}))
```

`/.tau/types/` and `/.tau/tsconfig.generated.json` are watched by the existing FS event coalescer; Monaco's `MonacoModelService` already auto-creates models for project paths (it explicitly skips `node_modules` per `monaco-model-service.ts:377-384`, but `.tau/types/*.d.ts` are normal project files and pass through). The TS worker re-reads, IntelliSense updates.

### Auto-tsconfig emission

The generated tsconfig pins compiler options to match what we already configure on the language defaults plus `paths` for virtual-type discovery:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["./.tau/types/*"],
    "paths": {
      "#/*": ["./*"],
      "@taucad/testing/tau": ["./.tau/types/taucad-testing-tau.d.ts"],
      "*.scad": ["./.tau/types/*.scad.d.ts"],
      "*.kcl": ["./.tau/types/*.kcl.d.ts"]
    }
  },
  "include": ["**/*", ".tau/types/**/*"]
}
```

User's `tsconfig.json` can simply `"extends": "./.tau/tsconfig.generated.json"` and add their own overrides. Existing projects without a `tsconfig.json` get the generated one as a default applied by the resolver.

## Cross-Kernel Parameter Typing

Each non-TS kernel emits virtual types translating its JSON Schema (already returned by `getParameters`) into TypeScript declarations.

### KCL example

For `cube.kcl` with parameters `width` (number), `label` (string):

```typescript
// Emitted to /.tau/types/cube.kcl.d.ts
declare module './cube.kcl' {
  export const defaultParams: {
    width: number;
    label: string;
  };
  export const __kclSource: string;
  export const __kernel: 'zoo';
}

declare module '*/cube.kcl' {
  export * from './cube.kcl';
}
```

### OpenSCAD example

For `bracket.scad` with customizer schema (groups `Dimensions` containing `length`/`width`/`thickness` and `Tessellation` containing `$fn`):

```typescript
// Emitted to /.tau/types/bracket.scad.d.ts
declare module './bracket.scad' {
  export const defaultParams: {
    /** @group Dimensions @minimum 1 @maximum 100 @default 50 */
    length: number;
    /** @group Dimensions @minimum 1 @maximum 100 @default 30 */
    width: number;
    /** @group Dimensions @minimum 1 @maximum 20 @default 5 */
    thickness: number;
    /** @group Tessellation @default 64 */
    $fn?: number;
  };
}
```

### TS-native kernels (Replicad, Manifold, OpenCASCADE)

For TS kernels the source file is already typed. The virtual `.d.ts` becomes redundant for the **source** import but still adds value for the **test** import:

```typescript
// User's bracket.test.ts after virtual-types lands
import { defaultParams } from './bracket.ts';
import { describe, expectGeo, it } from 'geospec';
import { renderTauModel } from '@taucad/testing/tau';
//                                      ^ virtual:
//                                      - parameters typed against bracket.ts's defaultParams
//                                      - renderTauModel({ parameters }) returns GeometryArtifact

describe.each([defaultParams, { ...defaultParams, length: 100 }])('bracket', (p) => {
  it('is watertight', async () => {
    const r = await renderTauModel({ parameters: p });
    await expectGeo(r).toBeWatertight();
  });
});
```

Where the `@taucad/testing/tau` virtual module is generated per-project to bind `renderTauModel({ parameters })` to `typeof defaultParams` of the file under test. This pattern eliminates the `Record<string, unknown>` escape hatch from `browser-first-parameter-aware-testing.md` Pattern 2/3.

### Schema → TypeScript translator

Use `json-schema-to-typescript` (npm: `json-schema-to-typescript`, well-maintained, ~120 KB) at install time, or a lightweight 200-LOC custom translator inside `@taucad/json-schema` that handles the JSON Schema Draft-07 subset our kernels emit (no `$ref`, no `allOf`/`anyOf` beyond enums, no `additionalProperties`). Custom is preferred because it produces JSDoc tags from the customizer metadata (`@minimum`, `@group`, `@default`) which makes the IntelliSense hover useful — `json-schema-to-typescript` strips those.

## Recommendations Roadmap

| #   | Action                                                                                                                                                                            | Priority | Effort | Impact                                                                         | Phase |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------ | ----- |
| R1  | Create `@taucad/resolver` package with `TauResolver` implementing `nodeNextResolution`. Pure functional core, FS via injected `ResolverFileSystem` interface.                     | **P0**   | L      | Unblocks every other recommendation                                            | 1     |
| R2  | Wire `TauResolver` into `esbuild-core.ts` `createVfsPlugin` `onResolve`. Replace `parsePackageSpecifier` + `resolveFileExtension` heuristics.                                     | **P0**   | M      | Bundler matches Monaco resolution; `#`-imports/`exports` work in user projects | 1     |
| R3  | Wire `TauResolver` into Monaco via `monaco.languages.typescript.javascriptDefaults.addExtraLib` + custom resolver in the TS worker contribution.                                  | **P0**   | M      | Cmd+Click and project-relative imports converge with bundler                   | 1     |
| R4  | Add `getVirtualTypes` hook to `KernelDefinition` and `KernelMiddlewareOptions`; emit `/.tau/types/*.d.ts` after every `getParameters`/`render` cycle.                             | **P0**   | M      | Foundation for non-TS kernel typing                                            | 2     |
| R5  | Implement OpenSCAD `getVirtualTypes` (translates customizer JSON Schema → `.d.ts` with JSDoc preserving `@group`, `@minimum`, `@maximum`).                                        | **P1**   | M      | Closes typing gap for OpenSCAD users                                           | 2     |
| R6  | Implement KCL `getVirtualTypes` (translates `convertKclVariablesToJsonSchema` output → `.d.ts`).                                                                                  | **P1**   | S      | Closes typing gap for KCL users                                                | 2     |
| R7  | Implement JSCAD/Replicad/Manifold/OpenCASCADE `getVirtualTypes` (mostly pass-through since source is already TS, but emits a `__kernel` brand for render-helper typing).          | **P1**   | S      | Enables typed `renderTauModel({ parameters })` in tests                        | 2     |
| R8  | Auto-emit `/.tau/tsconfig.generated.json` on project load; user `tsconfig.json` extends from it. If user lacks tsconfig, generated one is the active config.                      | **P1**   | S      | Removes per-project boilerplate; resolver always has tsconfig                  | 2     |
| R9  | Implement `package.json#exports`, `imports`, `typesVersions`, `types` in `TauResolver`. Cite npm-published example fixtures (lodash, three, react-dom) in tests.                  | **P1**   | M      | Spec compliance, transitive subpath imports                                    | 2     |
| R10 | Implement `tsconfig.json#extends`, `references`, `paths`, `baseUrl` in `TauResolver`.                                                                                             | **P2**   | M      | Per-project resolution config; `#utils/*` aliases                              | 3     |
| R11 | Add `@taucad/testing/tau` virtual-types middleware that emits a project-scoped `.d.ts` binding `renderTauModel({ parameters })` to the active source file's `defaultParams` type. | **P2**   | M      | Closes Pattern 2/3 typing in `browser-first-parameter-aware-testing`           | 3     |
| R12 | Document the contract in `docs/policy/library-api-policy.md` §VirtualTypes; flag that public kernel/middleware authors should opt in for non-TS surfaces.                         | **P3**   | XS     | Locks in the API surface                                                       | 3     |

Phase 1 (R1–R3) ships parity with Monaco's existing resolution but unifies the pipeline. Phase 2 (R4–R9) adds the new authoring surface. Phase 3 (R10–R12) is polish + spec completeness.

## Trade-offs

### Resolver as a separate package vs. inlined in `@taucad/runtime`

| Dimension      | Separate `@taucad/resolver`                                                | Inline in `runtime`                          |
| -------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Reuse          | Monaco contribution, runtime, future CLI                                   | Runtime only; Monaco needs duplication       |
| Bundle size    | Tree-shakeable; only the methods used ship                                 | Pulls runtime types into Monaco contribution |
| Test isolation | Pure functional; testable without runtime/worker plumbing                  | Coupled to RuntimeFileSystem fixtures        |
| API surface    | Public — third-party kernel authors can use it for their own resolution    | Private to runtime                           |
| **Verdict**    | **Separate package wins** on every dimension; standard packages-first move |                                              |

### Virtual types emit location

| Option                                     | Pros                                                             | Cons                                                        |
| ------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `/.tau/types/`                             | Hidden from file tree (already filtered in monaco-model-service) | Requires tsconfig `types` or `paths` to discover            |
| `/node_modules/.tau-virtual/`              | Picked up automatically by `nodeNextResolution`                  | Pollutes node_modules; cleared by package reinstalls        |
| Per-source-file sibling (`cube.scad.d.ts`) | Zero config; obvious to users                                    | Pollutes user's source tree; conflicts with version control |
| **`/.tau/types/` (recommended)**           | Cleanest separation of generated vs authored                     | Requires the auto-tsconfig in R8                            |

### tsconfig discovery

Strict spec compliance demands following `extends` chains across multiple files. Lightest path is to support `extends` to a single parent (which covers 95% of TS projects). Full multi-level inheritance is R10/P2.

### When to regenerate virtual types

Two viable triggers:

1. **On every render** — guarantees freshness, costs a sub-millisecond `writeFile` per source file.
2. **On parameter-schema change only** — diff `getParameters` output between renders, only emit when schema changed.

Recommend (1) for simplicity; the FS event coalescer absorbs the noise. Switch to (2) if profiling shows TS worker re-typecheck thrash.

## Open Questions

1. **Should the resolver also handle JSON imports (`import data from './foo.json'`)?** Both esbuild and Monaco support it; spec compliance argues yes. Ship in R1.
2. **Should `getVirtualTypes` be sync or async?** All kernels can produce types synchronously from already-extracted parameters. Async opens the door to fetching extra metadata (e.g., from a parts registry per [`tau-parts-registry-and-marketplace.md`](./tau-parts-registry-and-marketplace.md)) without blocking. Recommend async.
3. **Do we need `getVirtualTypes` on `BundlerPlugin` and `TranscoderPlugin` too?** A transcoder could emit virtual types for its supported export formats (`'glb' | 'step' | '3mf'`); a bundler could expose virtual types for its built-in modules. Defer to follow-on; not required by the GeoSpec/Tau testing adapter use case.
4. **Multi-tsconfig support for monorepo-style user projects?** Probably out of scope until we see real demand; flag in R10 design.
5. **`.d.ts` validation** — should we typecheck virtual `.d.ts` against the project's tsconfig before writing? Cheap with `tsgo` (Go-based TS compiler already in the workspace) but adds complexity. Defer; rely on Monaco's own diagnostics.
6. **Tree-shaking the resolver into Monaco's web worker bundle** — if `@taucad/resolver` pulls in any node-only deps it breaks worker builds. Constrain it to a strict no-Node-API surface in R1.

## References

External:

- [Node.js ESM resolution algorithm](https://nodejs.org/api/esm.html#resolution-and-loading-algorithm) — authoritative spec for `package.json#exports` resolution.
- [TypeScript NodeNext resolution](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#package.json-exports-imports-and-self-referencing) — how `tsc` mirrors Node behaviour for `--moduleResolution NodeNext`.
- [React Router v7 type generation](https://reactrouter.com/start/data/typegen) — `.react-router/types/+types/route.ts` precedent.
- [Fumadocs source generation](https://fumadocs.dev/docs/headless/source-api) — `source.ts` as a generated typed surface.
- [`json-schema-to-typescript` on npm](https://www.npmjs.com/package/json-schema-to-typescript) — reference translator implementation.

Internal:

- Foundation: [`docs/research/node-modules-single-source-of-truth.md`](./node-modules-single-source-of-truth.md) — the OPFS `/node_modules` cache this resolver reads from.
- Sibling blueprint: [`docs/research/dynamic-runtime-plugins.md`](./dynamic-runtime-plugins.md) — how user-installed plugins emit virtual types via the same hook.
- Sibling blueprint: [`docs/research/api-npm-and-reproducible-snapshots.md`](./api-npm-and-reproducible-snapshots.md) — how lockfile keeps virtual-types regeneration deterministic.
- Drives: [`docs/research/browser-first-parameter-aware-testing.md`](./browser-first-parameter-aware-testing.md) — the `renderTauModel({ parameters })` typing problem this solves.
- Related: [`docs/research/monaco-lsp-lazy-activation-blueprint.md`](./monaco-lsp-lazy-activation-blueprint.md), [`docs/research/typescript-esm-extension-resolution.md`](./typescript-esm-extension-resolution.md), [`docs/research/unresolved-dependency-watch-gap.md`](./unresolved-dependency-watch-gap.md).
- Policy: [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md), [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md).
