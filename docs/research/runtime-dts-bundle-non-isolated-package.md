---
title: 'Bundling Internal Dep Types Without `isolatedDeclarations` on `@taucad/runtime`'
description: 'Decoupling declaration GENERATION (tsc, inference-preserving, no annotations) from BUNDLING (inlining @taucad/* leaf types) so @taucad/runtime stays non-isolated and its generics survive — via tsdown resolver:tsc or api-extractor bundledPackages.'
status: draft
created: '2026-06-01'
updated: '2026-06-01'
category: investigation
related:
  - docs/research/runtime-dts-bundling-without-composite.md
  - docs/research/runtime-define-factory-dts-emission.md
  - docs/research/runtime-npm-release-bundling.md
  - docs/policy/npm-policy.md
  - docs/policy/typescript-policy.md
---

# Bundling Internal Dep Types Without `isolatedDeclarations` on `@taucad/runtime`

Whether `@taucad/runtime` can ship one self-contained `.d.ts` (its `@taucad/*` workspace deps inlined) **without** enabling `isolatedDeclarations` on its own source — so its inference-first `defineKernel`/`defineMiddleware`/`defineBundler`/`defineTranscoder`/`create*Plugin` exports keep full generics with **zero manual return-type annotations**.

## Executive Summary

Two companion docs reached a conclusion that, on re-examination, is wrong for the runtime's own surface:

- [`runtime-dts-bundling-without-composite.md`](runtime-dts-bundling-without-composite.md) proved that `isolatedDeclarations` + Oxc bundles the deps' types (Finding 7), then concluded the runtime package itself must also become `isolatedDeclarations`-clean (Finding 8 / R7) — i.e. give all 32 generic-factory exports explicit, widened return types.
- [`runtime-define-factory-dts-emission.md`](runtime-define-factory-dts-emission.md) found a generics-_preserving_ annotation (`ReturnType<typeof create*Plugin<…>>`) but it is cumbersome and couples every export to the factory's overload arity.

**The reframe:** declaration **generation** and declaration **bundling** are two separable steps, and the companion docs coupled them because `rolldown-plugin-dts`'s _default fast path_ (Oxc) couples them. Decouple them and the annotation problem disappears entirely:

- **Generation** (source → per-file `.d.ts`) is the only step that needs type inference. `tsc` does it with full inference — so the runtime's generic factories emit their inferred types with **no annotations**. This is impossible under `isolatedDeclarations` _by design_ (it removes inference); that is precisely why the annotations were demanded.
- **Bundling** (inlining the `@taucad/*` leaf `.d.ts` into one rollup) is a separate mechanism that consumes already-generated declarations. It does **not** require the entry package to be `isolatedDeclarations`-clean.

Two production-grade non-isolated bundlers do exactly this:

1. **`tsdown` / `rolldown-plugin-dts` with `dts: { resolver: 'tsc' }`** (and `isolatedDeclarations` OFF) — generates declarations via the TypeScript compiler (inference preserved) and uses TS-native module resolution, which the docs call out as "more compatible with complex setups." The companion doc never tried this resolver; it tested only the default Oxc resolver and the bare tsc _fallback_.
2. **`@microsoft/api-extractor` with `bundledPackages: ['@taucad/*']`** — the canonical Microsoft tool: tsc emits the runtime's full declaration tree (inference preserved), and api-extractor rolls it up, embedding the listed packages' types "as if they had been local files."

Decisive supporting evidence (`rolldown/rolldown#1396`): "`--isolatedDeclarations` doesn't affect `node_modules`'s code … This breaks the usage of inlining dependencies." So `isolatedDeclarations` is a **speed optimization for leaf generation**, not a correctness requirement for bundling — and it cannot even process truly-external deps. The companion doc's Oxc success only worked because the deps resolve to _source_ (`exports`→`src`), which is the fragile coupling we want to avoid relying on.

**Recommendation:** keep `@taucad/runtime` **non-isolated**; switch its publish DTS build to a non-isolated bundler (`resolver: 'tsc'` as primary, api-extractor `bundledPackages` as the proven fallback). This meets every goal — generics preserved, no `define*`/`create*` annotations, internal `@taucad/*` libs bundled, source-export dev ergonomics untouched. The only cost is a slower publish-time DTS build (tsc vs Oxc) — acceptable for a one-shot release step. This **supersedes** the annotation work (companion R7 and the entire `runtime-define-factory-dts-emission.md` approach) for the runtime's own surface.

## Table of Contents

- [Problem Statement](#problem-statement)
- [The Eigenquestion, Re-evaluated](#the-eigenquestion-re-evaluated)
- [Methodology](#methodology)
- [Findings](#findings)
- [Options](#options)
- [Recommendations](#recommendations)
- [Open Questions](#open-questions)
- [Assumptions](#assumptions)
- [Validation Gate](#validation-gate)
- [Code Examples](#code-examples)
- [References](#references)

## Problem Statement

We need `@taucad/runtime` published as a single install with no `@taucad/*` deps in the manifest (several are `private`), which means **bundling their types** into the runtime's `.d.ts`. The companion investigation made that work via `isolatedDeclarations` + Oxc, but discovered the runtime's own source then needs all 32 inference-first factory exports rewritten with explicit (widened or `ReturnType`-derived) return types — cumbersome, brittle against overload arity, and at odds with the API's inference-first design.

The user's challenge: **is there a way to meet all goals at once — preserve generics, avoid manual annotations on `defineX`/`createX`, and still bundle the internal libs — by letting the published package be more lenient (non-isolated) while the internal devDeps carry the strict property (if any)?**

### Goals (all must hold)

| #   | Goal                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Consumer-facing generics fully preserved (export-format/render/id type safety, kernel method types)                             |
| G2  | No manual return-type annotations on `defineKernel`/`defineMiddleware`/`defineBundler`/`defineTranscoder`/`create*Plugin`       |
| G3  | All internal `@taucad/*` libs bundled into the published `@taucad/runtime` (JS + types)                                         |
| G4  | Dev ergonomics preserved: source `exports`, instant type propagation, no composite, no `tsc -b`, NX task-graph semantics intact |

### Scope and Non-Goals

**In scope**: the generation-vs-bundling decoupling; non-isolated bundling tools; the role (now optional) of `isolatedDeclarations` on the deps.
**Out of scope**: JS bundling / dependency bucketing / publint+attw / README (`runtime-npm-release-bundling.md`); the `@taucad/units` spread-array refactor.

## The Eigenquestion, Re-evaluated

The companion doc's eigenquestion was:

> _Can each exported source file's `.d.ts` be derived from that single file alone, with no whole-program inference?_

That is the right question **for the leaves we want to inline cheaply**, but it was wrongly generalized to the **runtime entry**. The corrected eigenquestion:

> **Must the _published package's own source_ satisfy `isolatedDeclarations` to bundle its internal dep types — or can declaration GENERATION (inference-preserving `tsc`) be decoupled from declaration BUNDLING (inlining leaf `.d.ts`), so the entry stays non-isolated and only the bundling tool changes?**

Answer (from the tooling and `rolldown#1396`): **they are decoupled.** `isolatedDeclarations` is an _accelerator_ for the generation step, not a precondition for bundling. The entry package never needs it; the leaves don't strictly need it either (tsc generates them) — making the leaves isolated is an optional dev/speed nicety, not load-bearing for the runtime bundle.

## Methodology

1. **Re-read the companion doc** (`runtime-dts-bundling-without-composite.md`) to extract its exact claims (Findings 1, 7, 8; R7).
2. **Tooling research (May/Jun 2026)**: `rolldown-plugin-dts` README/registry (`resolver: 'oxc' | 'tsc'`, `tsc.build`, Oxc auto-enable), `tsdown` DTS docs (`dts.resolver`), `api-extractor` `bundledPackages` + dtsRollup docs, `rolldown/rolldown#1396` (isolatedDeclarations vs node_modules), `rushstack#5730` (bundledPackages version-field requirement).
3. **Config audit**: `packages/runtime/tsdown.config.ts` (`dts: true`, `tsconfig.build.json`, `unbundle: true`) to locate the minimal change.

## Findings

### Finding 1: Generation and bundling are separable; only generation needs inference

`rolldown-plugin-dts` (which `tsdown` wraps) runs two phases — generate per-module `.d.ts`, then bundle the declaration graph. The **generation engine is selectable**:

| Engine       | Trigger                                                | Inference            | Annotations needed     |
| ------------ | ------------------------------------------------------ | -------------------- | ---------------------- |
| Oxc isolated | `isolatedDeclarations: true` (auto) or `dts.oxc: true` | none (per-file only) | **yes** — every export |
| `tsc`        | `isolatedDeclarations` off                             | **full**             | **no**                 |
| `tsgo`       | `dts.tsgo: true`                                       | full                 | no                     |

The **bundling** phase is independent of generation. So the runtime can generate via `tsc` (inference → generics preserved, no annotations) and still bundle. The annotation requirement was an artifact of choosing the Oxc generation engine, not of bundling.

### Finding 2: `resolver: 'tsc'` is the resolver the companion doc never tried

`rolldown-plugin-dts` exposes `resolver: 'oxc' | 'tsc'` (default `'oxc'`), documented as: _"'tsc': Uses TypeScript's native module resolution, which may be more compatible with complex setups."_ The companion doc's failure (55 `MISSING_EXPORT` over the source-export boundary) occurred under the **default Oxc resolver** and the bare `tsc` _fallback_ — it did not test `resolver: 'tsc'`, which is precisely the knob for "complex monorepo workspace resolution." This is the missing configuration for a non-isolated bundle.

### Finding 3: `isolatedDeclarations` cannot inline `node_modules` deps — it only "works" because our deps resolve to source

`rolldown/rolldown#1396` states the constraint directly: _"`--isolatedDeclarations` doesn't affect `node_modules`'s code, which means only the ts code written in `src` satisfy the constraints. This breaks the usage of inlining dependencies from `node_modules`."_ The companion doc's Oxc probe succeeded only because `@taucad/*` resolve to `src/*.ts` via `exports`, so Oxc treated them as first-party `src`. That makes the Oxc path **dependent on the source-export coupling**; the moment a dep is consumed as a built package, the Oxc path can't inline it. The `tsc`/api-extractor paths have no such limitation.

### Finding 4: `api-extractor` `bundledPackages` is the mature canonical inliner — from tsc output

`@microsoft/api-extractor` (TypeScript 5.9.3, ~1M weekly downloads) takes a tsc-generated declaration tree and produces a rollup; `bundledPackages: ['@taucad/*']` embeds those packages' types "directly in the .d.ts rollup, as if they had been local files." Globs match against **declared deps** in the project's `package.json`. It also supports release-tag trimming (`@public`/`@beta`/`@internal`) for clean published surfaces. Requires no `isolatedDeclarations` anywhere.

**Known sharp edges:** (a) `rushstack#5730` — a bundled package with **no `version` field** is silently not inlined (TS doesn't emit a `packageId`); our `private` libs may need a `version: "0.0.0"`. (b) api-extractor historically crashed on this repo (`Unable to follow symbol for "gp_Ax2d"`) — that was a replicad-types issue and must be confirmed not to recur for the runtime entry.

### Finding 5: The runtime build is one config line away from the non-isolated path

`packages/runtime/tsdown.config.ts` currently sets `dts: true` (engine chosen by tsconfig). The non-isolated change is `dts: { resolver: 'tsc' }` + the subpath-aware `noExternal` pattern from the companion doc's Finding 5, with `isolatedDeclarations` left **off** on `tsconfig.build.json`. No source changes, no annotations.

### Finding 6: The deps do not need `isolatedDeclarations` for this to work

With `tsc`/api-extractor generation, the deps' declarations are produced by tsc (inference), so the deps need no annotations either. Making them isolated remains an _optional_ nicety (faster leaf gen, lint discipline, future standalone publish) but is **not** required for G3, and the Nx RFC confirms instant source propagation (G4) does not require it. This relaxes the companion doc's R1 from "prerequisite" to "optional."

## Options

| Option                                                              | Generation                  | Bundling             | G1 generics                  | G2 no-annotations                      | G3 bundled            | G4 dev                          | Maturity / risk                                                                             |
| ------------------------------------------------------------------- | --------------------------- | -------------------- | ---------------------------- | -------------------------------------- | --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. tsdown `resolver: 'tsc'`** _(recommended primary)_             | tsc (inference)             | rolldown-plugin-dts  | ✅                           | ✅                                     | ✅ (needs validation) | ✅                              | Medium — one config line; resolver:'tsc' unproven on our graph                              |
| **B. api-extractor `bundledPackages`** _(proven fallback)_          | tsc (`tsconfig.build` emit) | api-extractor rollup | ✅                           | ✅                                     | ✅                    | ✅                              | High maturity; needs version-field fix (#5730) + confirm no gp_Ax2d crash; extra build step |
| **C. tsdown `tsgo`**                                                | tsgo (Go, inference)        | rolldown-plugin-dts  | ✅                           | ✅                                     | ✅ (needs validation) | ✅                              | Newer; `@typescript/native-preview` dep                                                     |
| D. Oxc isolated + annotations _(companion R7 / define-factory doc)_ | Oxc (no inference)          | rolldown-plugin-dts  | ✅ (if `ReturnType`-derived) | ❌ — 32+ annotations, overload-coupled | ✅                    | ✅                              | **Rejected** — fails G2                                                                     |
| E. Composite + `tsc -b`                                             | per-project                 | dts.build            | ✅                           | ✅                                     | ✅                    | ❌ — buildable libs, watch step | Rejected — fails G4                                                                         |

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                 | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| R1  | **Keep `@taucad/runtime` non-isolated.** Do NOT enable `isolatedDeclarations` on `tsconfig.build.json`; do NOT add `define*`/`create*` return-type annotations. Mark companion R7 and `runtime-define-factory-dts-emission.md` superseded for the runtime's own surface.                               | **P0**   | None   | High   |
| R2  | **Switch the publish DTS build to `dts: { resolver: 'tsc' }`** in `tsdown.config.ts`, with the subpath-aware `noExternal`/`deps.alwaysBundle` pattern `^@taucad\/(converter\|events\|filesystem\|json-schema\|memory\|rpc\|types\|units\|utils)(\/\|$)`. Generation = tsc (inference, no annotations). | **P0**   | Low    | High   |
| R3  | **Validation gate** — build the full `nx build runtime` DTS under R2; run `tsc --noEmit --skipLibCheck` over the emitted `dist/esm/index.d.ts` and assert 0 `MISSING_EXPORT`/"Cannot find name" and 0 residual `@taucad/*` imports. If `resolver: 'tsc'` does not fully inline, fall back to Option B. | **P0**   | Low    | High   |
| R4  | **Fallback: api-extractor `bundledPackages: ['@taucad/*']`** wired after a `tsc --emitDeclarationOnly` pass. Add `version` to any `private` bundled lib lacking one (#5730); confirm no `gp_Ax2d`-class crash on the runtime entry.                                                                    | P1       | Med    | High   |
| R5  | Demote companion **R1 (deps `isolatedDeclarations`)** from prerequisite to **optional** — keep the already-applied dep annotations (harmless, green), but they are not load-bearing for the non-isolated bundle. The **R8 `@taucad/units` refactor is no longer a publish blocker**.                   | P1       | None   | Med    |
| R6  | Pin the bundler set (`tsdown`/`rolldown-plugin-dts`/`rolldown` or api-extractor) and treat `MISSING_EXPORT` as a hard error so a silent dangling `.d.ts` can't ship.                                                                                                                                   | P1       | Low    | Med    |

Sequencing: R1 (stand down annotations) → R2 → R3 (validate) → if needed R4 → R5/R6.

## Open Questions

1. **Does `resolver: 'tsc'` fully inline the `@taucad/*` source-export deps where the Oxc resolver dangled?** This is the load-bearing unknown for Option A. Resolved by R3. _If it inlines → A wins; if it externalizes/dangles → B._
2. **api-extractor crash recurrence.** The earlier `Unable to follow symbol for "gp_Ax2d"` came from replicad types reachable from the runtime graph. Does it reach the runtime's public entry, or was it confined to replicad's own build? _Determines B's viability._
3. **Build-time cost.** tsc/api-extractor generation is slower than Oxc. Quantify the publish DTS build time; confirm it's acceptable for a release step (it is not on the dev hot path).
4. **CJS `.d.cts`.** rolldown-plugin-dts notes Oxc dts is ESM-only and CJS needs a second pass; with `resolver: 'tsc'` confirm the existing `dist/cjs` (currently `dts: false`) strategy still holds (consumers get `.d.ts` via the ESM types; `package.json` `exports` map types once).

## Assumptions

- **A1.** `dts.resolver: 'tsc'` performs declaration _generation_ via the TS compiler (full inference), not merely module resolution over Oxc-generated files. The README groups `build`/resolver under "tsc Options … applicable when oxc and tsgo are not enabled," implying tsc generation when isolated/oxc are off. _Verify in R3 by inspecting an emitted factory declaration for its full inferred type._
- **A2.** Leaving `isolatedDeclarations` off does not regress any _other_ publish requirement; `nx typecheck` already runs without it (it trips `TS5069` _with_ it).
- **A3.** The runtime's public entry graph does not transitively pull a declaration that only Oxc-isolated emit could handle (none expected — tsc is the superset engine).
- **A4.** Consumers resolve types through the ESM `.d.ts`; the CJS build can keep `dts: false` and share the ESM declarations via `exports` (status quo).

## Validation Gate

```bash
# R2: set dts: { resolver: 'tsc' } + noExternal pattern in tsdown.config.ts,
#     isolatedDeclarations OFF in tsconfig.build.json
pnpm nx build runtime

# R3: assert self-contained, inference-preserving bundle
pnpm exec tsc --noEmit --skipLibCheck packages/runtime/dist/esm/index.d.ts
#   expect: 0 "Cannot find name" / MISSING_EXPORT
rg -n "from ['\"]@taucad/" packages/runtime/dist/esm/index.d.ts && echo "FAIL: residual @taucad import" || echo "OK: deps inlined"
#   spot-check a generic factory kept its inferred type (NOT widened):
rg -n "export declare const replicad" packages/runtime/dist/esm/plugins/kernels-entry.d.ts
```

## Code Examples

### R2 — non-isolated tsc-resolver bundle (no source changes, generics preserved)

```ts
// packages/runtime/tsdown.config.ts (DTS section)
const TAUCAD_INTERNAL = /^@taucad\/(converter|events|filesystem|json-schema|memory|rpc|types|units|utils)(\/|$)/;

const baseConfig: Options = {
  // ...entries unchanged...
  dts: {
    resolver: 'tsc', // tsc generation: full inference, NO export annotations
    // isolatedDeclarations stays OFF in tsconfig.build.json
  },
  deps: { alwaysBundle: [TAUCAD_INTERNAL] }, // inline internal libs (JS + types)
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};
```

```ts
// replicad.plugin.ts — UNCHANGED. tsc emits the full inferred phantom-branded type.
export const replicad = createKernelPlugin({
  id: 'replicad',
  optionsSchema: replicadOptionsSchema,
  renderSchema: replicadRenderSchema,
  exportSchemas: replicadExportSchemas,
  /* ... */
});
// emitted .d.ts carries KernelPlugin<{ '3mf': …, stl: … }, ReplicadRenderOptions, 'replicad'>
// with zero hand-written annotations.
```

### R4 — api-extractor fallback

```jsonc
// packages/runtime/api-extractor.json
{
  "mainEntryPointFilePath": "<projectFolder>/dist/types/index.d.ts",
  "bundledPackages": ["@taucad/*"], // inline internal deps from tsc output
  "dtsRollup": {
    "enabled": true,
    "untrimmedFilePath": "<projectFolder>/dist/runtime.d.ts",
  },
}
```

```jsonc
// any private bundled lib lacking a version (rushstack#5730 guard)
{ "name": "@taucad/types", "version": "0.0.0", "private": true }
```

## References

- `rolldown-plugin-dts` — `resolver: 'oxc' | 'tsc'`, `tsc.build`, Oxc auto-enable: https://github.com/sxzz/rolldown-plugin-dts
- `tsdown` — Declaration Files (engine selection, resolver): https://tsdown.dev/options/dts
- `rolldown/rolldown#1396` — `isolatedDeclarations` does not affect `node_modules`; breaks inlining deps: https://github.com/rolldown/rolldown/issues/1396
- api-extractor — `bundledPackages` (embed internal dep types into the rollup): https://api-extractor.com/pages/configs/api-extractor_json/
- api-extractor — `.d.ts` rollup configuration / release trimming: https://api-extractor.com/pages/setup/configure_rollup/
- `rushstack#5730` — `bundledPackages` silently skips packages with no `version` field: https://github.com/microsoft/rushstack/issues/5730
- Companion (Oxc-isolated path; the conclusion this doc reframes): `docs/research/runtime-dts-bundling-without-composite.md`
- Companion (the annotation approach this doc supersedes for the runtime surface): `docs/research/runtime-define-factory-dts-emission.md`
- JS-bundling plan: `docs/research/runtime-npm-release-bundling.md`
