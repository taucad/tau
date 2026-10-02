---
title: 'Production Blueprint: Generics-Preserving DTS Emission for `@taucad/runtime`'
description: 'Making @taucad/runtime npm-publishable under isolatedDeclarations WITHOUT erasing the phantom generics consumers rely on — the ReturnType-derivation pattern for create*Plugin factory exports, define* defaults, and middleware consts, with empirical evidence.'
status: draft
created: '2026-06-01'
updated: '2026-06-01'
category: architecture
related:
  - docs/research/runtime-dts-bundling-without-composite.md
  - docs/research/runtime-npm-release-bundling.md
  - docs/policy/npm-policy.md
  - docs/policy/typescript-policy.md
---

# Production Blueprint: Generics-Preserving DTS Emission for `@taucad/runtime`

> **⚠️ Superseded for the runtime's own surface (2026-06-01).** This doc solves "how to annotate the runtime's exports so the **Oxc isolated** DTS engine can emit them." [`runtime-dts-bundle-non-isolated-package.md`](runtime-dts-bundle-non-isolated-package.md) shows that choice is avoidable: by generating the runtime's declarations with **`tsc` (non-isolated, full inference)** and bundling deps via `resolver: 'tsc'` or api-extractor `bundledPackages`, the runtime needs **no annotations at all** and keeps every generic. The `ReturnType<typeof create*Plugin<…>>` pattern below remains valid and useful general knowledge (and a fallback if we ever adopt Oxc-isolated emit for the runtime), but the recommended path no longer requires it.

How to clear the last gate to publishing `@taucad/runtime` — making its public surface `isolatedDeclarations`-clean so the Oxc DTS engine can emit a self-contained `.d.ts` bundle — **without erasing the phantom generics that give consumers export-format, render-option, and kernel/transcoder-id type safety.**

## Executive Summary

The companion experiment ([`runtime-dts-bundling-without-composite.md`](runtime-dts-bundling-without-composite.md)) proved the workspace **deps** can be bundled into the runtime's types without composite projects, once `isolatedDeclarations` is satisfied. The remaining blocker is the runtime package's **own** source.

**A prior draft of this doc recommended widening the factory results to `Any*Definition`. That recommendation is now REJECTED** — it erases the consumer-facing generics. This revision is grounded in the actual consumption architecture and an empirical `isolatedDeclarations` experiment.

Three findings drive the conclusion:

1. **Consumer type safety does not live on the `define*` defaults — it lives on the `create*Plugin` factory exports.** `replicad`, `opencascade`, `converterTranscoder`, … return phantom-branded `KernelPlugin<FormatMap, RenderOptions, Id>` / `TranscoderPlugin<EdgeMap, From, Id>`. The runtime's whole-program type machinery (`CollectExportFormats`, `CollectFormatMap`, `MergeExportMap`, `CollectKernelIds`, `RuntimeClient<Kernels, Transcoders>`) projects export-format/options/id safety from those phantoms. The UI consumes them directly (`apps/ui/app/constants/kernel-worker.constants.ts` → `RuntimeClient.export(format, options)`), and a type-level conformance test pins the contract (`packages/runtime/src/plugins/kernel-plugin-api-correctness.test-d.ts`). **Widening these to `any` deletes that safety.**

2. **Under `isolatedDeclarations`, an export initialized by a function call MUST carry an explicit type annotation** (TS9010) — and (verified empirically) neither explicit type arguments on the call nor `satisfies` removes the error. Only an explicit annotation on the binding works.

3. **The precise generics CAN be preserved with an explicit annotation derived from the existing named schema consts** — `ReturnType<typeof createKernelPlugin<'replicad', typeof replicadExportSchemas, typeof replicadRenderSchema, typeof replicadOptionsSchema>>`. Verified empirically: this satisfies `isolatedDeclarations` **and** preserves the literal `Id`, the phantom `FormatMap`, and per-format option types — even against the overloaded factory. No hand-written format map; the schemas are already named consts the factory already imports.

**Recommendation:** annotate each consumer-facing factory export with a `ReturnType<typeof create*Plugin<…>>`-derived type (generics fully preserved, near-zero authoring overhead). For the `define*` defaults (consumed only by co-located tests + the widening dynamic loader) and the middleware/`LruMap` consts, use precise explicit annotations too. Nothing is widened to `any`.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [The Eigenquestion](#the-eigenquestion)
- [Experiment: which annotation form preserves generics under isolatedDeclarations](#experiment-which-annotation-form-preserves-generics-under-isolateddeclarations)
- [Recommendations](#recommendations)
- [Open Questions](#open-questions)
- [Assumptions](#assumptions)
- [Roadmap](#roadmap)
- [Code Examples](#code-examples)
- [References](#references)

## Problem Statement

To publish `@taucad/runtime`, its emitted `.d.ts` must be self-contained and correct. With `isolatedDeclarations` enabled (the proven prerequisite for bundling the workspace deps' types — companion doc), the Oxc DTS engine refuses to emit declarations for the runtime's own exports that lack a nameable, file-local type — ~32 violations, all on the inference-first factory API.

The non-negotiable constraint: the fix **must preserve all consumer-facing generics**. The runtime's value proposition includes end-to-end type safety such that `client.export('3mf', options)` is checked against the merged kernel-source + transcoder-edge schema, and `client.bestRouteFor(kernelId)` is narrowed to the registered kernels. That safety is encoded in phantom generics on the plugin types; erasing them to satisfy the compiler is unacceptable.

### Scope and Non-Goals

**In scope**: resolving the `isolatedDeclarations` violations on the runtime's public exports while preserving every generic; the empirical basis for the chosen pattern; per-category fixes.

**Out of scope**: the JS-bundling config / dependency bucketing / publint+attw / README (`runtime-npm-release-bundling.md`); workspace-dep DTS bundling (`runtime-dts-bundling-without-composite.md`); the `@taucad/units` spread-array refactor (tracked separately).

## Methodology

1. **Consumption-architecture trace** — followed how consumer type safety is produced and consumed: `create*Plugin` (`plugins/plugin-helpers.ts`) → phantom-branded `KernelPlugin`/`TranscoderPlugin` (`plugins/plugin-types.ts`) → projection types (`CollectExportFormats`, `MergeExportMap`, `CollectKernelIds`, `ExportFormatsFor`) → `RuntimeClient` → UI consumer (`apps/ui/app/constants/kernel-worker.constants.ts`, `apps/ui/app/types/runtime-client.alias.ts`) and the type-level test (`kernel-plugin-api-correctness.test-d.ts`).
2. **Runtime-loader trace** — confirmed how `define*` defaults are consumed at runtime (`framework/kernel-runtime-worker.ts`).
3. **Violation-site enumeration** — grep for `export const … = create*Plugin`, `export default define*`, `export const … = defineMiddleware/new LruMap`.
4. **Empirical `isolatedDeclarations` experiment** — minimal reproduction mirroring the phantom-branded overloaded factory; tested which annotation forms compile and which preserve generics in the emitted `.d.ts` (TypeScript from the workspace `node_modules`).

## Findings

### Finding 1: Consumer generics live on the `create*Plugin` exports, not the `define*` defaults

The two layers are distinct:

| Layer                         | Symbol                                              | Carries                                              | Consumed by                                                                             |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Plugin factory export**     | `export const replicad = createKernelPlugin({...})` | phantom `KernelPlugin<FormatMap, RenderOptions, Id>` | `RuntimeClient`, `CollectExportFormats`, UI `kernel-worker.constants.ts`, `*.test-d.ts` |
| **Kernel definition default** | `export default defineKernel({...})`                | precise `KernelDefinition<Context, NativeHandle, …>` | dynamic loader (widened) + co-located `*.kernel.test.ts`                                |

`createKernelPlugin`/`createTranscoderPlugin` populate the phantom brands from the kernel's **static schemas** (`exportSchemas`, `renderSchema`, `optionsSchema`, `edges`) — independent of the `defineKernel` definition body. So the consumer-facing safety the user requires is produced **here**, and these are the exports that must keep their generics.

### Finding 2: The `define*` defaults are consumed only by the widening loader and co-located tests

`framework/kernel-runtime-worker.ts` loads kernels dynamically and casts `module.default` to the **base** `KernelDefinition`:

```ts
const module = (await import(/* @vite-ignore */ config.moduleUrl)) as { default: KernelDefinition };
definition = module.default;
```

The only _static_ importers of the defaults are `*.kernel.test.ts` / `*.transcoder.test.ts`. So precise generics on the defaults matter for **test-side method typing**, not production. (This is why the prior "widen the defaults" idea looked harmless — but it was the wrong layer to reason about; the consumer safety is on the plugin exports per Finding 1.)

### Finding 3 (enumeration): the consumer-critical factory exports

| Factory                  | Exports                                                                           | File                                        |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- |
| `createKernelPlugin`     | `replicad`, `opencascade`, `zoo`, `jscad`, `manifold`, `tau`                      | `kernels/*/<k>.plugin.ts`                   |
| `createTranscoderPlugin` | `converterTranscoder`                                                             | `transcoders/converter/converter.plugin.ts` |
| `createMiddlewarePlugin` | `parameterCache`, `geometryCache`, `gltfCoordinateTransform`, `gltfEdgeDetection` | `plugins/middleware-factories.ts`           |
| `createBundlerPlugin`    | `esbuild`                                                                         | `plugins/bundler-factories.ts`              |

Plus the `define*` defaults (6 kernels + `esbuild.bundler.ts` + `converter.transcoder.ts`) and the `defineMiddleware`/`new LruMap` consts (`middleware/*.middleware.ts`). Every factory already receives **named** schema/options consts (`replicadExportSchemas`, `converterEdgeSchemas`, `EsbuildOptions`), which is what makes the derived-annotation fix cheap.

### Finding 4: `isolatedDeclarations` forbids inferring a call-expression export's type

Per the TS team and community (issue #58944): "`isolatedDeclarations` is at odds with inference because it effectively removes all inference besides simple cases." A `const x = f(args)` export is **not** a "simple case" — declaration emit would have to type-check `f`. So every `export const replicad = createKernelPlugin({...})` is a TS9010 violation that requires an explicit annotation. The question is purely _which_ annotation form preserves the generics.

## The Eigenquestion

> **How do we make every `@taucad/runtime` export `isolatedDeclarations`-emittable WITHOUT erasing the phantom generics consumers depend on?**

The naive answer (widen to `Any*`) trades the package's core value for compiler compliance. The correct answer is to supply an **explicit annotation that is itself derived from the already-named schema inputs**, so the precise type is reconstructed file-locally with no hand-maintenance and no loss.

## Experiment: which annotation form preserves generics under `isolatedDeclarations`

A minimal reproduction modelled the phantom-branded, overloaded factory (`createPlugin<const Id, S>` returning `() => Plugin<InferMap<S>, Id>` with a second options-bearing overload). Compiled with `isolatedDeclarations: true`, `declaration: true`, `emitDeclarationOnly: true` using the workspace TypeScript.

| Case | Form                                                                                                                           | Result                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| A    | `export const replicad = createPlugin({...})` (no annotation)                                                                  | **TS9010** — fails                                       |
| B    | `export const replicad = createPlugin<'replicad', {...}>({...})` (explicit type args)                                          | **TS9010** — fails (type args do not help)               |
| C    | `export const replicad = createPlugin({...}) satisfies () => Plugin`                                                           | **TS9010** — fails (`satisfies` does not help)           |
| D    | `export const replicad: () => Plugin<{ stl: { binary: boolean } }, 'replicad'> = createPlugin({...})`                          | ✅ compiles; generics fully written out                  |
| E    | `export const replicad: ReturnType<typeof createPlugin<'replicad', typeof schemas>> = createPlugin({...})`                     | ✅ compiles; generics preserved, **no hand-written map** |
| F    | `type ReplicadPlugin = ReturnType<typeof createPlugin<'replicad', typeof schemas>>; export const replicad: ReplicadPlugin = …` | ✅ compiles; same as E via a named alias                 |

**Generics-preservation probe (Case E, against the overloaded factory).** Extracting the phantom `FormatMap` from the emitted type and asserting:

```ts
type FormatMapOf<T> = (T extends () => infer P ? P : never) extends Plugin<infer M, infer _Id> ? M : never;
const k: keyof FormatMapOf<typeof replicad> = 'stl'; // ✓ declared format preserved
// @ts-expect-error 'usdz' is not a declared format    // ✓ undeclared format rejected
const bad: keyof FormatMapOf<typeof replicad> = 'usdz';
const o: FormatMapOf<typeof replicad>['stl'] = { binary: true }; // ✓ option type preserved
// @ts-expect-error binary must be boolean                          // ✓ option type enforced
const obad: FormatMapOf<typeof replicad>['stl'] = { binary: 'yes' };
```

All assertions passed — the literal `Id`, the phantom `FormatMap`, and per-format option types survive the `ReturnType<typeof …>` derivation. The emitted `.d.ts` reads:

```ts
export declare const replicad: ReturnType<typeof createPlugin<'replicad', typeof schemas>>;
```

which a downstream consumer resolves to the full phantom-branded plugin type.

**Conclusion:** Cases E/F are the generics-preserving, low-overhead solution. Case D is the verbose fallback when no named schema input exists to derive from.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                              | Target             | Priority | Effort | Generics                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- | ------ | ------------------------- |
| R1  | Annotate each `create*Plugin` export with `ReturnType<typeof create*Plugin<Id, typeof exportSchemas, typeof renderSchema, typeof optionsSchema>>` (kernels), `<Id, From, typeof edgeSchemas>` (transcoder); for middleware/bundler use the explicit returned-factory signature (e.g. `(options?: EsbuildOptions) => BundlerPlugin`) | 12 factory exports | P0       | Low    | **Preserved**             |
| R2  | Annotate each `export default define*` default. Where the type derives from schemas, use the `ReturnType<typeof define*<…>>` form; where `Context`/`NativeHandle` come from the body, name+export those types and annotate `KernelDefinition<Context, NativeHandle, …>`                                                             | 8 defaults         | P1       | Med    | **Preserved** (test-side) |
| R3  | Annotate the `defineMiddleware` consts (`KernelMiddleware<typeof stateSchema, typeof optionsSchema>` or `ReturnType<typeof defineMiddleware<…>>`) and `new LruMap<T>` consts (`: LruMap<T>`)                                                                                                                                        | 6 consts           | P1       | Low    | **Preserved**             |
| R4  | Add a CI/lint guard (e.g. `isolatedDeclarations`-on probe or eslint `explicit-module-boundary-types`) so new factory exports can't regress to inference-only                                                                                                                                                                        | build config       | P2       | Low    | —                         |
| R5  | Verify each derived `ReturnType<typeof …>` selects the intended overload (arity must match the schema set the export actually passes); add a `*.test-d.ts` assertion per factory family                                                                                                                                             | tests              | P1       | Low    | guards R1/R2              |

**Why not widen (rejected option):** widening any `create*Plugin` export to `KernelPlugin`/`TranscoderPlugin` (base) collapses `FormatMap`/`EdgeMap`/`Id` to their defaults, which `CollectExportFormats`/`CollectKernelIds` fall back to `string`/`FileExtension` for — destroying `client.export(...)` and `bestRouteFor(...)` type safety and breaking `kernel-plugin-api-correctness.test-d.ts`. Not acceptable.

## Open Questions

1. **Overload selection for `ReturnType<typeof createKernelPlugin<…>>`.** The factory has a no-options overload (3 type params) and an options overload (4). Supplying 4 explicit args should select the options overload; supplying 3 selects the no-options one. Confirm per-kernel (replicad/opencascade have `optionsSchema`; tau may not) and pin with R5. _Resolves the exact derivation arity per export._
2. **Do the `define*` default exports need precise types, or can the tests be re-pointed?** If `*.kernel.test.ts` materially exercises typed methods, R2 must preserve precision (name `Context`/`NativeHandle`). If tests only assert on runtime results, a lighter annotation suffices. Audit before sizing R2. _Resolves R2 effort._
3. **Are `Context`/`NativeHandle` already named/exported per kernel?** If inline/anonymous, R2 requires extracting them. Quantify per kernel. _Inputs to R2._
4. **Where to enable `isolatedDeclarations`.** Companion doc established it cannot go base-wide (`TS5069` under `nx typecheck`). Confirm the publish-build tsconfig (`packages/runtime/tsconfig.build.json` / `tsconfig.lib.json`) is the right scope and reaches the Oxc engine. _Resolves enablement mechanics._
5. **Could a small codegen emit the R1/R2 annotations?** Since the derivation is mechanical (`ReturnType<typeof factory<Id, typeof <named schemas>>>`), a generator could keep them in sync and prevent drift. Decide vs. hand-authoring 12–20 one-liners. _Optional ergonomics._

## Assumptions

- **A1.** The empirical results (Cases A–F, the overloaded probe) reproduce against the exact `create*Plugin` overload signatures in `plugin-helpers.ts`; the minimal model is faithful (same phantom-brand + overload structure). _Verify by applying R1 to one kernel and running the Oxc build + `_.test-d.ts`.\*
- **A2.** The `~32` violation count and TS9010/TS9037 classification (2026-06-01 Oxc experiment) are current; the enumerated sites in Finding 3 are complete. _Re-run the Oxc build after enabling the flag — standalone `tsc` is an unreliable oracle here (trips on lib-resolution noise before reaching TS90xx)._
- **A3.** No consumer depends on the _structural identity_ of two kernels' precise definition types being distinct; the dynamic loader treats all kernels uniformly. (Relevant only to R2.)
- **A4.** Annotating the factory exports does not change their emitted public type vs. today's inferred type (the derivation reconstructs the same type). _Verify by diffing emitted declarations before/after on one export._

## Roadmap

1. **Pilot R1 on `replicad`** — annotate with `ReturnType<typeof createKernelPlugin<'replicad', typeof replicadExportSchemas, typeof replicadRenderSchema, typeof replicadOptionsSchema>>`; enable `isolatedDeclarations` on the publish tsconfig; run the Oxc build + `kernel-plugin-api-correctness.test-d.ts` + a new format-map `*.test-d.ts` (R5). Confirm 0 violations on that file and identical public type (A4).
2. **Roll R1 across the remaining 11 factory exports.**
3. **R3** middleware/`LruMap` consts.
4. **Resolve OQ2/OQ3, then R2** for the `define*` defaults.
5. **R4** CI guard.
6. **Gate:** full `pnpm nx build runtime` emits with 0 `isolatedDeclarations` violations; `tsc --noEmit` over emitted `dist/**/*.d.ts` clean (companion R6 gate); `*.test-d.ts` conformance green; public-type diff empty.
7. **Hand off to R2 of `runtime-npm-release-bundling.md`** (JS bundle, dep bucketing, publint/attw, README).

## Code Examples

### R1 — kernel plugin export (generics preserved, derived from named schemas)

```ts
// replicad.plugin.ts
import { createKernelPlugin } from '#plugins/plugin-helpers.js';
import {
  replicadOptionsSchema,
  replicadRenderSchema,
  replicadExportSchemas,
} from '#kernels/replicad/replicad.schemas.js';

export const replicad: ReturnType<
  typeof createKernelPlugin<
    'replicad',
    typeof replicadExportSchemas,
    typeof replicadRenderSchema,
    typeof replicadOptionsSchema
  >
> = createKernelPlugin({
  id: 'replicad',
  moduleUrl: new URL('replicad.kernel.js', import.meta.url).href,
  extensions: ['ts', 'js'],
  detectImport: replicadDetectPattern,
  builtinModuleNames: ['replicad'],
  optionsSchema: replicadOptionsSchema,
  renderSchema: replicadRenderSchema,
  exportSchemas: replicadExportSchemas,
});
```

### R1 — transcoder plugin export

```ts
// converter.plugin.ts
export const converterTranscoder: ReturnType<
  typeof createTranscoderPlugin<'converter', 'glb', typeof converterEdgeSchemas>
> = createTranscoderPlugin({ id: 'converter', moduleUrl, from: 'glb', edges: converterEdgeSchemas });
```

### R1 — bundler export (explicit returned-factory signature)

```ts
// bundler-factories.ts
export const esbuild: (options?: EsbuildOptions) => BundlerPlugin = createBundlerPlugin<EsbuildOptions>((options) => ({
  id: 'esbuild',
  moduleUrl: new URL('../bundler/esbuild.bundler.js', import.meta.url).href,
  extensions: options?.extensions ?? ['ts', 'js', 'tsx', 'jsx'],
}));
```

### R3 — middleware + LruMap consts

```ts
// geometry-cache.middleware.ts
export const geometryMemoryCache: LruMap<KernelSuccessResult<GeometryResponse[]>> = new LruMap<
  KernelSuccessResult<GeometryResponse[]>
>({ maxEntries: 20 });

export const geometryCacheMiddleware: ReturnType<typeof defineMiddleware<typeof stateSchema, typeof optionsSchema>> =
  defineMiddleware({
    /* ... */
  });
```

### What does NOT work (so reviewers don't re-try it)

```ts
// All three still error TS9010 under isolatedDeclarations:
export const a = createKernelPlugin({ ... });                                  // no annotation
export const b = createKernelPlugin<'replicad', typeof exportSchemas>({ ... }); // explicit type args
export const c = createKernelPlugin({ ... }) satisfies () => KernelPlugin;       // satisfies
```

## References

- TypeScript `isolatedDeclarations` (TS9010 missing-annotation, TS9037 default-export): https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html
- "Isolated Declarations in TS 5.5: State of the feature" (inference is removed for non-trivial exports): https://github.com/microsoft/TypeScript/issues/58944
- Source — consumer-safety machinery: `packages/runtime/src/plugins/plugin-types.ts` (`KernelPlugin`/`TranscoderPlugin` phantoms, `CollectExportFormats`, `MergeExportMap`, `ExportFormatsFor`), `plugins/plugin-helpers.ts` (`create*Plugin` overloads).
- Source — consumer + conformance test: `apps/ui/app/constants/kernel-worker.constants.ts`, `apps/ui/app/types/runtime-client.alias.ts`, `packages/runtime/src/plugins/kernel-plugin-api-correctness.test-d.ts`.
- Source — runtime loader (widens defaults): `packages/runtime/src/framework/kernel-runtime-worker.ts`.
- Companion: `docs/research/runtime-dts-bundling-without-composite.md`, `docs/research/runtime-npm-release-bundling.md`.
