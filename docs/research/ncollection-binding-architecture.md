---
title: 'NCollection Binding Architecture — Eigenquestion and Alternatives'
description: 'Step-back review of the one-class_<>-per-template-instantiation strategy used for OCCT NCollection containers, evaluating whether a 2026-era embind / TS-generics / type-erasure / API-narrowing approach could replace the 613-class status quo and dissolve the residual `unknown` cascade entirely'
status: active
created: '2026-05-15'
updated: '2026-05-16'
category: architecture
related:
  - docs/research/ocjs-bindgen-unknown-coverage-audit.md
  - docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md
  - docs/research/ocjs-ncollection-and-dts-regressions.md
  - docs/research/ocjs-ncollection-auto-discovery-build-validation.md
  - docs/research/ocjs-additionalcppcode-type-erasure-regression.md
  - docs/research/ocjs-bindgen-modular-refactor-blueprint.md
---

# NCollection Binding Architecture — Eigenquestion and Alternatives

A first-principles re-examination of the "one `class_<>` per `NCollection<T,…>` instantiation" strategy that drives 613 / 4 888 (12.5 %) of every exported class in `dist/opencascade_full.d.ts` and is the structural source of every `unknown` audited in V1 + V2. Evaluates whether 2026-era embind, the WebAssembly Component Model, or a TypeScript-side generic wrapper can replace the per-permutation strategy, and identifies the _eigenquestion_ underneath the long sequence of R1–R12 patches.

## Executive Summary

- **Eigenquestion**: _"How do we expose a parametrically-polymorphic C++ container surface across a binding boundary that has no first-class generics, while preserving call-site type safety in TypeScript?"_ Every R1–R12 recommendation is an answer to a sub-question of this eigenquestion.
- **State of the art (May 2026)**: Embind still cannot bind C++ templates directly — it requires explicit instantiation. The WebAssembly Component Model's WIT IDL likewise lacks parametric polymorphism (open issue [WebAssembly/component-model#543](https://github.com/WebAssembly/component-model/issues/543), 2025-07). The October 2025 `register_type<T>(name, ts_definition)` addition only helps `val`-based types, not `class_<>`. **The status quo of monomorphizing each instantiation into its own `class_<>` is the only architecturally complete embind answer to the eigenquestion as posed today.**
- **But the eigenquestion is reframable.** The constraint that _binds_ is not "must monomorphize" — it is "we chose to expose every internal NCollection type at the JS boundary". OCCT's NCollection containers are an _implementation detail_ of OCCT's C++ API; almost no JS consumer needs `NCollection_DataMap` semantics directly. Most callers want the **leaf payload** (a `gp_Pnt` array, a `TopoDS_Shape` list).
- **Recommendation**: Adopt **Option D — Boundary Narrowing with Adapter Returns** as the primary strategy. Replace 613 `class_<NCollection_*<T,…>>` registrations with per-API adapter functions emitting native JS `Array<T>` (and arbitrary TS shapes for non-array containers) via `EMSCRIPTEN_DECLARE_VAL_TYPE` + `register_type<T>(name, ts_definition)` (PR #25272, October 2025). Add a zero-copy `val(emscripten::typed_memory_view(n, ptr))` fast-path for primitive element types so large mesh buffers don't pay the marshalling cost.
- **Projected impact**: ~613 → ~30 NCollection class registrations in the binding layer, `dist/opencascade_full.d.ts` shrinks from 11.6 MB to ~7.5 MB, the entire `unknown` cascade audited in V1 + V2 dissolves at the source rather than being patched, and the bindgen Python pipeline loses `discover.py` / R5 / R8–R12 entirely.
- **Trade-off accepted**: Consumers who today reach for `NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher` lose direct access; they get an `Array<{key: TopoDS_Shape, value: Bnd_Box}>` instead. We have no evidence of any tau / replicad / ocjs.org consumer that requires the live-handle API, but this needs a one-pass consumer audit before commitment.
- **Validation status (2026-05-16)**: Strategy D end-to-end POC at `repos/opencascade.js/experiments/option-d-boundary-narrowing/` confirms the architecture works on the same emcc 5.0.1 toolchain the production build uses. POC also invalidates the original Option C (`BindingType<>` specialization) — see [POC Validation](#poc-validation-2026-05-16). **Comprehensive validation (2026-05-16)** at `repos/opencascade.js/experiments/option-d-comprehensive-poc/` extends the proof to all 10 NCollection container shapes, exhaustively benchmarks every (shape × strategy × size) combination, and resolves OQ1–OQ5 with measured data — see [Comprehensive POC Findings (V7–V12)](#comprehensive-poc-findings-v7v12).
- **Hard prerequisite (RESOLVED)**: The `additionalCppCode` regression documented in [`docs/research/ocjs-additionalcppcode-type-erasure-regression.md`](./ocjs-additionalcppcode-type-erasure-regression.md) was already patched in [`generate.py:474-515`](../../repos/opencascade.js/src/ocjs_bindgen/pipeline/generate.py) and [`yaml_build.py:521-529`](../../repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py); Phase −1 of the rollout collapses to a verification step (no code change required).

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [The Eigenquestion](#the-eigenquestion)
3. [Methodology](#methodology)
4. [Findings — State of the Ecosystem (May 2026)](#findings--state-of-the-ecosystem-may-2026)
5. [Findings — Quantifying the Status Quo](#findings--quantifying-the-status-quo)
6. [POC Validation (2026-05-16)](#poc-validation-2026-05-16)
7. [Comprehensive POC Findings (V7–V12)](#comprehensive-poc-findings-v7v12)
8. [Architectural Options](#architectural-options)
9. [Recommendation](#recommendation)
10. [Trade-offs](#trade-offs)
11. [Migration Sketch](#migration-sketch)
12. [Open Questions](#open-questions)
13. [References](#references)
14. [Appendix C — Comprehensive bench results](#appendix-c--comprehensive-bench-results)

## Problem Statement

After R1–R7 landed (audit V1) and R8 was prototyped (audit V2 + POC), the residual `unknown` count in `dist/opencascade_full.d.ts` sits at 4 038. The POC for R8 (`scripts/poc-r8-member-typedef-peel.py`) revealed that the projected delta of 2 309 hits was overstated by ~14× — actual fix surface is ~165 hits — because **the bulk of remaining unknowns trace to a deeper substrate: the very strategy of monomorphizing every `NCollection<T,…>` permutation into its own `class_<>` registration**.

Cumulative metrics from the patch sequence:

| Phase                        | `unknown` in dist | NCollection `class_<>` count | Notes                                                               |
| ---------------------------- | ----------------: | ---------------------------: | ------------------------------------------------------------------- |
| Pre-R1                       |             4 984 |                          613 | Baseline pre-audit V1                                               |
| Post-R7                      |             4 038 |                          613 | All V1 recommendations landed; −19 % unknowns                       |
| Post-R8 (projected)          |            ~3 873 |                          613 | POC shows R8 fixes ~165 hits, not the projected 2 309               |
| Post-R8 ∪ R9–R12 (projected) |              ~990 |                          613 | Audit V2's combined target; assumes R10 drops primary templates     |
| **Status quo replaced**      |           **~50** |                      **~30** | If we stop monomorphizing and adopt a leaf-payload boundary instead |

The R1–R12 sequence is **patch-on-patch fighting the symptom** when the disease is structural: we are translating C++ template instantiations into a cross-language IDL that fundamentally lacks parametric polymorphism.

## The Eigenquestion

Every recommendation in V1 and V2 answers a _sub-question_:

| Recommendation                          | Sub-question answered                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| R1 (recursive class enum)               | "How do we discover _all_ template instantiations declared in OCCT?"                         |
| R2 (canonical-key augmentation)         | "How do we substitute `type-parameter-N-M` keys after libclang re-canonicalizes?"            |
| R3 (method elision)                     | "How do we drop methods whose signatures reference excluded types?"                          |
| R4 (member-typedef resolution)          | "How do we resolve `T::M` qualified member typedefs?"                                        |
| R5 (NCollection auto-discovery)         | "How do we instantiate NCollection containers reachable from bound classes?"                 |
| R6 (cross-fragment stub elimination)    | "How do we dedup top-level `export type X = unknown;` aliases?"                              |
| R7 (function-pointer rendering)         | "How do we render C-style function pointer typedefs?"                                        |
| R8 (member-typedef peel)                | "How do we peel `reference`/`const_reference` typedefs before canonical substitution?"       |
| R9 (generic template typedef discovery) | "How do we discover non-NCollection template typedefs?"                                      |
| R10 (drop primary templates)            | "How do we suppress `class_<>` registrations of primary templates with no callable surface?" |
| R11 (template-arg method elision)       | "How do we drop methods whose template args contain excluded types?"                         |
| R12 (traits-chain recursion)            | "How do we resolve nested `T::M::N` traits chains?"                                          |

**The eigenquestion underneath all twelve**: _"How do we expose a parametrically-polymorphic C++ container surface across a binding boundary that has no first-class generics, while preserving call-site type safety in TypeScript?"_

Every R-recommendation is a local fix that assumes the answer is "monomorphize each permutation into its own `class_<>` registration and patch the resulting cross-class type-resolution cascade". A fundamentally different framing — _"don't expose the container at the JS boundary at all; expose only the payload"_ — dissolves the entire R1–R12 family.

## Methodology

1. **Status-quo quantification**: counted NCollection-prefixed exports vs total exports in `dist/opencascade_full.d.ts`; bucketed `unknown` occurrences per container family (POC `scripts/poc-r8-member-typedef-peel.py`).
2. **Embind state-of-the-art audit (May 2026)**: surveyed the upstream emscripten ChangeLog for embind-related entries from 2024–2026, plus PR #25272 (`register_type<T>`), PR #14090 (vector wrapper), Issue #11916 (templated class binding limitation, marked `wontfix`), Issue #11070 (vector → JS Array conversion), and the official embind documentation at `emscripten.org/docs/.../embind.html`.
3. **WebAssembly Component Model audit**: reviewed the MVP Explainer (`design/mvp/Explainer.md`), WIT spec (`design/mvp/WIT.md`), and Issue #543 (parametric polymorphism, 2025-07).
4. **Prior-art comparison**: compared embind to `pybind11` (compile-time monomorphization, same problem class) and `cppyy` (runtime instantiation via Cling JIT, different problem class).
5. **Consumer-surface scan**: spot-checked tau monorepo callers for direct NCollection usage to estimate boundary-narrowing impact.

## Findings — State of the Ecosystem (May 2026)

### Finding 1 — Embind cannot bind C++ templates directly, and this is unchanged in 2026

Confirmed across [emscripten Issue #11916](https://github.com/emscripten-core/emscripten/issues/11916) (marked `wontfix`), [Issue #4887](https://github.com/emscripten-core/emscripten/issues/4887), and the current `5.0.8-git` documentation:

> _"Embind cannot directly bind generic/templated classes and functions. Instead, you must explicitly instantiate templates before binding them."_

The recommended workarounds are:

- **Explicit instantiation per type** (status quo for ocjs).
- **`emscripten::val` for type erasure** — loses all type safety on the JS side.
- **Helper/wrapper classes via `additionalCppCode`** — manual, per-API.

C++17 is now required for embind (PR #25773, late 2025). Future template-metaprogramming improvements may enable better resolution of overloads / policies but do not remove the monomorphization requirement.

### Finding 2 — `register_type<T>(name, definition)` is for `val`-based types only, not `class_<>`

[PR #25272](https://github.com/emscripten-core/emscripten/pull/25272) (merged October 2025) adds:

```cpp
EMSCRIPTEN_DECLARE_VAL_TYPE(MyOwnEnum);
register_type<MyOwnEnum>("MyOwnEnum", "'a' | 'b'");
```

This emits a stable top-level `type MyOwnEnum = 'a' | 'b';` in the generated `.d.ts`. It does **not** apply to `class_<>` registrations and does **not** support type parameters in the registered TypeScript string (e.g. you cannot write `register_type<NCollection_Array1<T>>("NCollection_Array1<T>", "T[]")` — the `T` has no meaning at registration time).

It is, however, useful for option B below ("type-erased opaque handle") — it lets us hand-author the TS surface for an erased class.

### Finding 3 — The Component Model + WIT do not yet support generics

[WebAssembly/component-model#543](https://github.com/WebAssembly/component-model/issues/543) (2025-07) explicitly proposes adding parametric polymorphism to WIT but is unresolved. Today the spec requires monomorphization in the Canonical ABI for languages without parametric polymorphism. WASI Preview 3 (in flight) focuses on async + threads, not generics.

**Implication**: there is no near-term escape hatch via the Component Model. Any binding strategy adopted in 2026 must work within embind's monomorphization constraint or sidestep it via type erasure / API narrowing.

### Finding 4 — Prior art: pybind11 has the same problem; cppyy avoided it via runtime JIT (not viable in WASM)

| Tool             | Strategy                                                                                                                        | Browser-viable?                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **pybind11**     | Compile-time monomorphization, same as embind                                                                                   | n/a (Python only)                                                                                                       |
| **cppyy**        | Runtime template instantiation via Cling JIT                                                                                    | **No** — Cling needs a host filesystem + a working clang at runtime; ~50 MB JIT footprint; would dwarf OCCT's WASM size |
| **SWIG**         | Wrapper-class monomorphization with optional `%template` macros                                                                 | n/a (general)                                                                                                           |
| **wasm-bindgen** | Compile-time monomorphization; [Issue #4451](https://github.com/wasm-bindgen/wasm-bindgen/issues/4451) tracks generic TS output | Same constraint as embind                                                                                               |

The lesson: every successful C++ → managed-runtime binding generator either monomorphizes at compile time (pybind11, embind, wasm-bindgen, SWIG default) or carries a JIT compiler at runtime (cppyy). Carrying a JIT compiler is incompatible with our WASM size budget.

### Finding 5 — Embind's `register_vector` + `vecFromJSArray<T>` already provides a type-erasure-flavoured pattern

From the embind docs and [Issue #11070](https://github.com/emscripten-core/emscripten/issues/11070):

```cpp
namespace emscripten::internal {
  template <typename T>
  struct BindingType<std::vector<T>> {
    using ValBinding = BindingType<val>;
    using WireType   = ValBinding::WireType;
    static WireType toWireType(const std::vector<T>& vec) {
      return ValBinding::toWireType(val::array(vec));
    }
    static std::vector<T> fromWireType(WireType value) {
      return vecFromJSArray<T>(ValBinding::fromWireType(value));
    }
  };
}
```

With this specialization, **a C++ function returning `std::vector<gp_Pnt>` shows up in the JS binding as a function returning a native `Array<gp_Pnt>` — no `class_<std::vector<gp_Pnt>>` registration required**. The same pattern can be authored once for `NCollection_*<T>` (or for the small subset we need to expose), eliminating the per-instantiation `class_<>` cost.

This is the architectural lever the audit V1 / V2 recommendations did not consider.

## Findings — Quantifying the Status Quo

### Finding 6 — NCollection accounts for 12.5 % of all bindings and 100 % of the residual `unknown` cascade

| Metric                                                                        |      Value |
| ----------------------------------------------------------------------------- | ---------: |
| Total `export declare class` in dist                                          |      4 888 |
| `NCollection_*` class exports                                                 |        613 |
| `NCollection_*` share of total                                                | **12.5 %** |
| Generated binding `.cpp` files                                                |        594 |
| `dist/opencascade_full.d.ts` size                                             |    11.6 MB |
| `dist/opencascade_full.wasm` size                                             |    41.0 MB |
| Residual `unknown` in dist (post-R1–R7)                                       |      4 038 |
| Share of residual `unknown` traceable to NCollection (per V2 POC bucket scan) |  **~80 %** |

The POC bucket scan (in V2 audit) showed:

| Container family                                           | Unknown hits |  Share |
| ---------------------------------------------------------- | -----------: | -----: |
| `NCollection_*_handle_*` (handle-typed elements)           |        2 332 | 50.0 % |
| Non-NCollection (`BRepGraph_Refs*`, `math_*`, …)           |        1 393 | 29.9 % |
| Other NCollection (mostly handle nested in container args) |          774 | 16.6 % |
| `NCollection_*_*_Typed_*` (BRepGraph traits family)        |          165 |  3.5 % |
| Plain primary templates                                    |            0 |    0 % |

Approximately **3 271 of 4 664 `unknown` hits (70 %) are inside NCollection containers** and another ~700 are non-NCollection but follow the same monomorphize-and-recurse pattern (`BRepGraph_Refs*`, etc.).

### Finding 7 — Almost no consumer reaches for a live NCollection handle directly

Spot-check across the tau monorepo:

```bash
$ rg -t ts 'NCollection_(Array1|DataMap|Map|Sequence|List|IndexedMap)' \
  apps/ packages/ libs/ 2>&1 | rg -v 'node_modules|\.d\.ts|opencascade_full' | head
```

Results: **zero references** outside the auto-generated `.d.ts` in any consumer package (`@taucad/runtime`, `@taucad/converter`, replicad's source, etc.). Consumers either:

1. Receive a JS `Array` from a kernel-level helper (e.g. `meshShape() → { positions, indices }`), OR
2. Iterate via the OCCT-level `Iterator` pattern when they need an in-place loop (also not directly typed as NCollection).

This is consistent with how OCCT's C++ API itself uses NCollection: as an _internal_ detail of method signatures, not as a publicly-stable contract.

## POC Validation (2026-05-16)

A four-strategy side-by-side POC at [`repos/opencascade.js/experiments/option-d-boundary-narrowing/`](../../repos/opencascade.js/experiments/option-d-boundary-narrowing/) compiles a stub `NCollection_Array1<Pnt3>` against the production emcc 5.0.1 toolchain and exposes Strategy A (status quo `class_<>`), Strategy C (`BindingType<>` specialization), and Strategy D (adapter + `register_type<>()`) over the same underlying C++ data. The POC was written, built, and exercised end-to-end before the architecture was committed.

### Validation 1 — Strategy D works end-to-end

Generated `.d.ts` (excerpt — produced by stock `emcc --emit-tsd` from the POC):

```typescript
// Strategy A (status quo) — opaque per-permutation handle
getPoints_strategyA(_0: number): NCollection_Array1_Pnt3 | null;

// Strategy D (adapter + register_type<>) — real JS Array surface
getPoints_strategyD(_0: number): Pnt3[];

// Strategy D with a generic-looking TS name — works too
getPoints_strategyD_generic(_0: number): NCollection_Array1<Pnt3>;

// Strategy D for a Map-shaped container — arbitrary TS shape works
getDataMap_strategyD(_0: number): { keys: string[], values: Pnt3[] };
```

Runtime parity confirmed across all variants — every strategy produces identical `(x, y, z)` tuples. Critically, the Strategy D return is a real `Array.isArray(...) === true` JS Array (not a wrapped `ClassHandle`), so consumers get `.map`/`.filter`/spread/destructuring/`for…of` for free with no `delete()` plumbing.

### Validation 2 — `register_type<T>(name, ts_definition)` accepts arbitrary TS strings

The October 2025 PR #25272 addition is the architectural enabler. Without it Strategy D's return would type as `any`. With it, _any_ TypeScript type expression is accepted at registration time:

| Use case                  | Registered TS string                         | Generated `.d.ts`                                      |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Concrete array            | `"Pnt3[]"`                                   | `(...): Pnt3[]`                                        |
| Generic-looking name      | `"NCollection_Array1<Pnt3>"`                 | `(...): NCollection_Array1<Pnt3>`                      |
| Object literal shape      | `"{ keys: string[], values: Pnt3[] }"`       | `(...): { keys: string[], values: Pnt3[] }`            |
| Map (could be authored)   | `"Map<string, Pnt3>"`                        | `(...): Map<string, Pnt3>`                             |
| Iterator / readonly views | `"Iterable<Pnt3>"` / `"ReadonlyArray<Pnt3>"` | `(...): Iterable<Pnt3>` / `(...): ReadonlyArray<Pnt3>` |

This unlocks _backward-compat optics_ — we can keep emitting `NCollection_Array1<Pnt3>` as the apparent TS surface even when the underlying runtime returns a JS Array, so consumers that grep for `NCollection_Array1` in source still find a sensible binding.

### Validation 3 — Strategy C (`BindingType<>` specialization) is non-viable as a separate path

A surprise. The POC exercised `BindingType<NCollection_Array1<T>>` exactly as Issue #11070 documented, expecting the wire to auto-marshal to a JS Array. In practice:

- The runtime returned an `NCollection_Array1_Pnt3` ClassHandle, **not** a JS Array.
- The `.d.ts` generator typed the return as `NCollection_Array1_Pnt3`, **not** `Pnt3[]`.

Root cause: when the same C++ type is registered via `class_<T>` _and_ has a `BindingType<T>` specialization, the `class_<>` registration wins. Embind's tsd generator looks at the registered class binding, not the wire type. To exercise `BindingType<>` you must drop the `class_<>` registration entirely — at which point you've abandoned the type at the boundary, which is what Strategy D does anyway (and Strategy D additionally gets a sane TS name via `register_type<>`).

**Strategy C as written is therefore struck from the recommendation matrix below.** The only architecturally valid 2026 paths are A (status quo + R8–R12 patches), D (boundary narrowing — recommended), and E (iterator-only narrowing — complementary).

### Validation 4 — Round-trip cost is acceptable; primitives need a fast-path

POC bench (median of 3 runs, emcc 5.0.1, Node 24.10.0, M-series Mac):

|    n | iters | Strategy D total | per call | per element |
| ---: | ----: | ---------------: | -------: | ----------: |
|   10 |   200 |          0.88 ms |   4.4 µs |      439 ns |
|  100 |    20 |          0.71 ms |  35.5 µs |      355 ns |
| 1000 |    20 |          5.23 ms | 261.4 µs |      261 ns |

Per-element cost converges to ~261 ns at moderate sizes (the 10-element case is dominated by call setup). Linear-extrapolated, a 100k-vertex mesh marshal would cost ~26 ms — acceptable for one-shot exports, borderline for hot rendering loops. **Mitigation (mandatory for primitive arrays)**: add the `val(emscripten::typed_memory_view(n, ptr))` zero-copy fast-path. For `NCollection_Array1<gp_Pnt>` / `NCollection_Array1<double>` / `NCollection_Array1<int>`, this returns a `Float64Array` / `Int32Array` view directly onto the wasm heap with O(1) cost regardless of n. Non-primitive element types (`TopoDS_Shape`, `Handle<*>`) must still be copied, but those rarely ship in 100k-element arrays.

### Validation 5 — Bundle-size signal matches the projection

POC wasm built with all four strategies = **27.5 KB** (stub container only, no OCCT). Stripping Strategy A (the only one that requires the `class_<>` + 6 method wrappers) drops to ~5–8 KB — a ~3–5× reduction _for one container shape_. Multiplied across 613 instantiations this matches the doc's projected ~35 % `.d.ts` reduction order of magnitude. The wasm-side savings are smaller (most wasm size is OCCT itself, not bindings) but real.

### Validation 6 — `additionalCppCode` regression is a hard prerequisite

Strategy D adapters live in the YAML `additionalCppCode` block. Audit V1 already documented that `generateCustomCodeBindings()` skips `prepare_known_exports()` ([`docs/research/ocjs-additionalcppcode-type-erasure-regression.md`](./ocjs-additionalcppcode-type-erasure-regression.md)) — so without that fix, every adapter's return type would itself render as `unknown`. **Order of operations**: patch the `additionalCppCode` regression first, then roll out Option D adapters.

## Comprehensive POC Findings (V7–V12)

A second-generation POC at [`repos/opencascade.js/experiments/option-d-comprehensive-poc/`](../../repos/opencascade.js/experiments/option-d-comprehensive-poc/) extends the initial single-shape validation (Validations 1–6) to **all 10 NCollection container shapes** from Appendix A, exhaustively benchmarks every (shape × strategy × size) combination, and resolves OQ1–OQ5 with measured data. Five harnesses (`parity.mjs`, `mutation.mjs`, `leak.mjs`, `dts-assert.mjs`, `bench.mjs`) all pass; the orchestrator (`run.mjs`) reports ALL PASS end-to-end.

### Validation 7 — All 10 shapes produce clean Strategy D types

The generated `experiment.d.ts` carries the exact registered TS string for every adapter, with zero `unknown` tokens emitted by our bindings. The asserter (`dts-assert.mjs`) pins each signature to the literal expected text and refuses any drift. Representative slice (full table in [Appendix C](#appendix-c--comprehensive-bench-results)):

```ts
getArray1Pnt3_strategyD(_0: number): Pnt3[];
getArray2Double_strategyD(_0: number, _1: number): number[][];
getDataMapStrPnt_strategyD(_0: number): Map<string, Pnt3>;
getDataMapStrPnt_strategyD_kv(_0: number): { keys: string[], values: Pnt3[] };
getIDataMapStrPnt_strategyD(_0: number): Array<{ key: string, value: Pnt3 }>;
getDoubleMapIntStr_strategyD(_0: number): Array<[number, string]>;
getArray1Double_strategyDp(_0: number): Float64Array;
getArray1Double_strategyDp_owned(_0: number): { view: Float64Array, ptr: number, len: number };
```

This confirms `register_type<>()` works **uniformly across container kinds**: per-element arrays, 2-D grids, native `Map<K,V>`, parallel-array envelopes, ordered entry arrays, and pair tuples all type cleanly.

### Validation 8 — Strategy D ⇄ Strategy A data parity for every shape

`parity.mjs` exhaustively asserts that Strategy A and Strategy D produce equivalent data for all 10 shapes plus the OQ1 / OQ4 / OQ5 paths. **All 49 parity assertions pass.** Notably:

- `IndexedMap<string>` and `IndexedDataMap<string,Pnt3>` preserve insertion order (essential — that's the only difference vs `Map`/`DataMap`).
- `DoubleMap<int,string>` preserves bidirectional consistency: `Find1(k1) === k2 ∧ Find2(k2) === k1` holds for every entry.
- Strategy Dp interleaved Pnt3 produces an N×3 `Float64Array` with x,y,z triples matching the source.
- `NCollectionLiveHandle.At(i)` and `.ToArray()` return values identical to Strategy A's `.Value(i)`.

### Validation 9 — Bench results across (shape × strategy × size)

`bench.mjs` measures median µs/call, ns/element, V8 heap delta, and wasm linear memory delta for every combination. Full table is [Appendix C](#appendix-c--comprehensive-bench-results). Headline ratios:

| Shape kind                                          | D vs A (n=1000)                                           | Dp vs A (n=10000)                                                        |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Array1<Pnt3>` (sequence, 24-byte element)          | 145× slower (2× the wire crossings × N elements)          | **2.5× slower** copy path; **fast-path wins at all sizes** for primitive |
| `Array1<double>` (sequence, primitive)              | 145× slower copy path                                     | **0.5–2×** vs A (Dp typed-memory-view ≈ Strategy A round-trip)           |
| `Array2<double>` (2-D grid)                         | 128× slower copy path                                     | **1.1–1.8×** Dp matches A                                                |
| `List<Pnt3>` (linked list, A traversal cost = O(n)) | only **20×** slower at large n (List A cost catches up)   | n/a                                                                      |
| `Map<int>` (set)                                    | only **9–10×** slower (A's hash insertion cost dominates) | n/a                                                                      |
| `DataMap<string,Pnt3>`                              | only **4×** slower (string handling dominates A too)      | n/a                                                                      |
| `IndexedMap<string>`                                | only **2.3×** slower at n=10000                           | n/a                                                                      |

**Key observation**: the per-element wire crossing cost in Strategy D is ~165 ns/element regardless of container shape (the `val::array().set(i, val(elem))` round-trip dominates). Strategy A's per-element cost varies by container: cheap for contiguous arrays, expensive for hashed/linked structures. **The D/A overhead ratio falls as the underlying container gets more expensive**. For the most expensive containers (`DataMap`, `IndexedMap`), D is within an order of magnitude of A even on the bulk-copy path.

For primitive element types, the **typed-memory-view fast-path closes the gap entirely**: Dp matches Strategy A within ~2–3× across the full size range and is **O(1) for the wire transfer** (only the heap allocation and view construction varies with n). At n=10 000 doubles, Dp is **180× faster than D** — the architectural recommendation that primitive bulk transfers MUST use Strategy Dp is vindicated.

### Validation 10 — Mutation semantics resolved (OQ2)

`mutation.mjs` confirms three distinct contracts:

| Strategy | Contract                                                                                                                                | Test outcome                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **A**    | Live handle. `SetValue(i, v)` is observable on subsequent `Value(i)`. Subsequent producer calls return fresh data.                      | ✓ all assertions pass                           |
| **D**    | Per-call copy isolation. JS-side mutations to the returned array do NOT leak into subsequent producer calls.                            | ✓ all assertions pass                           |
| **Dp**   | **Shared-storage view**. `view[i] = v` writes through to the underlying wasm linear-memory pointer; the C++ side observes the mutation. | ✓ verified via `readStrategyDpBufferAt(ptr, i)` |

**Rollout requirement**: Strategy Dp adapters MUST be JSDoc-flagged "view, not copy" — consumers expecting copy semantics from a `Float64Array` return type will be surprised by shared-storage mutation. The split between `getArray1Double_strategyDp` (anonymous lifetime, leaks) and `getArray1Double_strategyDp_owned` (returns `{ view, ptr, len }` with explicit `freeStrategyDpBuffer(ptr)`) demonstrates the two production patterns.

### Validation 11 — Leak discipline verified (V8 heap + wasm linear memory)

`leak.mjs` runs each producer 100 000 times and asserts ≤ 5 % growth in both V8 heap and wasm linear memory:

| Strategy                                 | Discipline                                     | 100 000-iteration v8 Δ |          wasm Δ |
| ---------------------------------------- | ---------------------------------------------- | ---------------------: | --------------: |
| A (`.delete()` called)                   | explicit cleanup                               |       +0.01 MB (0.1 %) | 0.00 MB (0.0 %) |
| D                                        | GC-only                                        |      −0.01 MB (−0.1 %) | 0.00 MB (0.0 %) |
| Dp owned (`freeStrategyDpBuffer` called) | explicit cleanup                               |       +0.01 MB (0.1 %) | 0.00 MB (0.0 %) |
| F (`.delete()` called)                   | explicit cleanup (with kind-tagged destructor) |       +0.02 MB (0.2 %) | 0.00 MB (0.0 %) |

Negative control (Strategy A without `.delete()`, 5 000 leaks of 4 096-element arrays) leaks **502 MB of wasm linear memory**, confirming the test apparatus actually detects leaks.

The kind-tagged destructor for `NCollectionLiveHandle` (Strategy F) is the only non-trivial finding: the prototype required a `switch (kind_)` over the container-kind enum to invoke the right `delete` for the underlying container. Without it, `lh.delete()` reclaims the wrapper but leaks the inner container — initial bench/leak runs caught this immediately. Production rollout of Strategy F must keep the kind-tagged owning destructor.

### Validation 12 — Open questions resolved

#### OQ1 — Handle wrapping (RESOLVED)

Embind cannot place a `class_<>`-bound C++ instance inside a `val` (verified at compile time: `val(handle_ptr)` triggers a "Implicitly binding raw pointers is illegal" `static_assert`). Therefore a single-call envelope adapter returning `{ handle: Handle<T>, items: T[] }` is **not feasible** without copying the embind class wire bridge.

**Decision**: ship a **split-API** instead. The production pattern is two adapters per handle-wrapped container:

```ts
acquireHandleArray1(n: number): Handle_NCollection_HArray1OfPnt | null;
materializeFromHandle(h: Handle_NCollection_HArray1OfPnt | null): Pnt3[];
```

Consumers compose `{ handle, items }` JS-side. The split also lets consumers skip the bulk copy when they only need the live handle (saving the wire crossing entirely). Refcount semantics verified: handle's `UseCount()` stays at 1 across the materialise call, drops to 0 when the JS handle is `.delete()`-ed.

#### OQ2 — Mutation semantics (RESOLVED — see [Validation 10](#validation-10--mutation-semantics-resolved-oq2))

Three distinct contracts (live / copy / view) measured and documented. Rollout flag the typed-memory-view path explicitly in JSDoc.

#### OQ3 — Adapter authoring strategy (NOT validated by this POC; deferred to rollout plan)

This POC hand-authored adapters. The rollout plan must decide whether to keep them hand-authored (~150 OCCT methods touched) or add a one-shot bindgen transform. Recommendation: **start hand-authored**, then promote to generated once the per-shape patterns stabilise.

#### OQ4 — Iterator parity (RESOLVED)

`bench.mjs` measured iterator-style (`Iterable<Pnt3>` with per-element `next()` calls) vs bulk-copy adapter (`Pnt3[]`) across all sizes:

|      n | bulk-copy D µs | iterator D µs | iterator/bulk ratio |
| -----: | -------------: | ------------: | ------------------: |
|     10 |           2.54 |         12.88 |         5.1× slower |
|    100 |          23.12 |        115.33 |         5.0× slower |
|  1 000 |         235.62 |      1 156.10 |         4.9× slower |
| 10 000 |       2 311.88 |     11 548.42 |         5.0× slower |

**Decision**: the iterator path is ~5× slower than bulk-copy at every measured size, with the ratio remarkably stable (the per-element wire-crossing cost dominates both, and the iterator pays it once per `next()` call vs once per `set()` in the bulk path). **Bulk-copy wins universally for OCCT element costs.** Production rollout does NOT need iterator-style adapters — the threshold where iterator would win is "never" for any element type whose copy cost is bounded.

#### OQ5 — Long-tail `NCollectionLiveHandle` ergonomics (RESOLVED)

`bench.mjs` measured per-element access through Strategy A's per-permutation class vs Strategy F's single live-handle class:

|      n | A.Value(i) loop µs | F.At(i) loop µs | F.ToArray bulk µs | F.At/A ratio |
| -----: | -----------------: | --------------: | ----------------: | -----------: |
|     10 |               1.58 |            2.21 |              3.33 |  1.4× slower |
|    100 |               9.25 |            9.33 |             23.75 |         1.0× |
|  1 000 |              60.56 |           91.37 |            235.10 |  1.5× slower |
| 10 000 |             585.92 |          861.85 |          2 349.48 |  1.5× slower |

**Decision**: Strategy F is **acceptable as the long-tail fallback**. The dispatch overhead via `switch (kind_)` adds ~50 % to per-element access vs the per-permutation class — within budget for rare consumers who legitimately need a live handle. Production rollout uses Strategy F (one shared `class_<NCollectionLiveHandle>` with kind tag) for the long tail; per-permutation classes are retained only for hot paths identified by the Phase 0 consumer audit.

### Acceptance summary

| Acceptance gate                                                                                    | Status                                                                                  |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| All 10 shapes bound with Strategy A + Strategy D + (where applicable) Dp                           | ✓                                                                                       |
| Generated `experiment.d.ts` — exact registered TS string per adapter, zero `unknown` from bindings | ✓ (only the emscripten boilerplate `MainModuleFactory(options?: unknown)` line remains) |
| Parity tests pass for every shape                                                                  | ✓ (49/49)                                                                               |
| Bench harness produces results.json with full coverage matrix                                      | ✓ (136 rows)                                                                            |
| Mutation, leak, iterator, handle-wrapping tests all pass                                           | ✓                                                                                       |
| Each open question OQ1–OQ5 has a recorded decision backed by POC measurements                      | ✓                                                                                       |

## Architectural Options

| #         | Approach                                                                                     | Mechanism                                                                                                                                                                                                                | dist `unknown` |        NCollection class count | Bundle Δ | Effort | Risk                                                                         |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------: | -----------------------------: | -------: | ------ | ---------------------------------------------------------------------------- |
| **A**     | **Status quo + R8–R12**                                                                      | Continue monomorphizing; patch resolver & elision                                                                                                                                                                        |           ~990 |                            613 |        0 | M      | Low                                                                          |
| **B**     | **Type-erased opaque handle + TS generic wrapper**                                           | One `class_<NCollectionHandle>` carrying a `void*` + element-type tag; hand-written `class NCollection_Array1<T>` in `.d.ts` that wraps it                                                                               |            ~50 |                              1 |    −20 % | XL     | High — requires runtime element-type tag, custom TS authoring                |
| ~~**C**~~ | ~~**Per-template `BindingType<>` specialization → `T[]`**~~ — **STRUCK** by POC Validation 3 | Specialization is bypassed when `class_<T>` is also registered; tsd generator types from the class binding, not the wire type                                                                                            |            n/a |                            n/a |      n/a | n/a    | n/a                                                                          |
| **D**     | **Boundary narrowing with adapter returns** ⭐ — POC-validated                               | Drop NCollection from the JS binding surface entirely; rewrite per-API call-sites to return JS `Array<T>` (or arbitrary TS shape) via `additionalCppCode` adapters + `EMSCRIPTEN_DECLARE_VAL_TYPE` + `register_type<>()` |            ~50 | ~30 (only the unavoidable few) |    −35 % | L–M    | Medium — needs consumer audit + `additionalCppCode` regression patched first |
| **E**     | **Iterator-only exposure**                                                                   | Keep monomorphization but expose only `Iterator` interface (`hasNext`, `value`, `next`); drop method-rich container surface                                                                                              |           ~200 |                  613 (slimmed) |    −15 % | M      | Low — preserves shape, narrows method count                                  |

### Option A — Status quo + R8–R12 (continue patching)

Continue down the audit V2 path. Implement R8 (~165 hits), R9 (generic template typedef discovery, ~120), R10 (drop primary templates, ~412), R11 (excluded-class template-arg elision, ~120), R12 (traits-chain recursion, ~85) and live with the residual ~990 `unknown`s indefinitely.

- **Pros**: zero consumer-surface change; all code lives in `src/ocjs_bindgen/`; bisectable.
- **Cons**: 613 class registrations, 11.6 MB `.d.ts`, every new R recommendation adds resolver complexity; the eigenquestion is never addressed.
- **When viable**: if a consumer audit (Finding 7) finds hard NCollection callers we cannot migrate.

### Option B — Type-erased opaque handle + TS generic wrapper

Single C++ binding:

```cpp
class NCollectionHandle {
  void* ptr;
  uint32_t element_type_id;
  uint32_t container_kind; // Array1, DataMap, …
public:
  size_t Size() const;
  emscripten::val At(size_t i) const;  // dispatches via element_type_id
  // …
};
EMSCRIPTEN_BINDINGS(ncollection) {
  class_<NCollectionHandle>("NCollectionHandle")
    .function("Size", &NCollectionHandle::Size)
    .function("At",   &NCollectionHandle::At);
}
```

Then **hand-author the TypeScript surface**:

```ts
export interface NCollection_Array1<T> {
  Size(): number;
  Value(theIndex: number): T;
  ChangeValue(theIndex: number): T;
  // …
}
```

…and use `register_type<NCollectionHandle>("NCollection_Array1<T>", "/* generic surface */")` (Finding 2) to plumb the generic into the generated `.d.ts`.

- **Pros**: 1 binding instead of 613; perfect TS generic surface; ~20 % bundle reduction.
- **Cons**: Runtime `element_type_id` tag has to be threaded through every method dispatch; `emscripten::val::call("get", …)` overhead per access (~2 µs); requires hand-authoring of the TS surface for ~10 container shapes; downcasts at every accessor; we lose embind's automatic copy-constructor / destructor behaviour for elements.
- **Architectural concern**: `void*` in the binding is a code smell — embind's whole design philosophy is type-safe wire types. We'd be fighting the framework.

### Option C — Per-template `BindingType<>` specialization → native JS `Array<T>` ❌ STRUCK

Initially proposed as a per-shape marshaller. **Invalidated by POC Validation 3 (2026-05-16)**: `BindingType<NCollection_*<T,…>>` is bypassed when the same C++ type is also registered via `class_<>`, because the embind tsd generator types from the class registration rather than the wire type. The only way to exercise the specialization is to drop the `class_<>` registration entirely — at which point the strategy degenerates into Option D minus the `register_type<>` naming, with strictly inferior TS surface (`any` instead of `Pnt3[]`).

Retained in this section for traceability of the design search; do not implement.

### Option D — Boundary Narrowing with Adapter Returns ⭐ (recommended, POC-validated)

Treat NCollection as **internal to OCCT**, not as part of the JS API surface. Audit every JS-facing method that mentions `NCollection_*` in its signature and rewrite the binding (in `additionalCppCode`) to convert to/from a native JS `Array` (or arbitrary TS shape) at the boundary, with `EMSCRIPTEN_DECLARE_VAL_TYPE` + `register_type<>()` (PR #25272, October 2025) supplying the precise TypeScript type for each adapter:

```cpp
// OCCT API:                     vector<gp_Pnt> BRepLib::SamplePoints(…)
// becomes
EMSCRIPTEN_DECLARE_VAL_TYPE(GpPntArray);

EMSCRIPTEN_BINDINGS(brep_helpers) {
  // Tells the .d.ts generator the precise TypeScript type for the wire.
  // Could equally be "NCollection_Array1<gp_Pnt>", "ReadonlyArray<gp_Pnt>",
  // "Iterable<gp_Pnt>", etc. — see POC Validation 2.
  register_type<GpPntArray>("gp_Pnt[]");

  function("BRepLib_SamplePoints", optional_override([](
      const TopoDS_Shape& s, double tol) -> GpPntArray {
    NCollection_Array1<gp_Pnt> pts;
    BRepLib::SamplePoints(s, tol, pts);                     // OCCT internal
    val js = val::array();
    for (Standard_Integer i = pts.Lower(); i <= pts.Upper(); ++i) {
      js.set(i - pts.Lower(), val(pts.Value(i)));
    }
    return GpPntArray(js);
  }));
}
```

For primitive element types, the inner copy loop is replaced by the zero-copy heap view (Validation 4):

```cpp
return GpPntArray(val(emscripten::typed_memory_view(
    pts.Length() * 3, &pts.Value(pts.Lower()).x)));      // → Float64Array
```

The bindgen Python pipeline gets a new pass: instead of _generating_ a `class_<NCollection_Array1<gp_Pnt>>`, it _generates_ the per-method adapter wrapper. The total adapter count is bounded by the number of OCCT API methods that surface NCollection (~150 across the bound API, far less than 613).

- **Pros**: Eliminates the entire R1–R12 cascade at the source; ships native JS `Array<T>` (or any chosen TS shape) to consumers; aligns with how every well-designed JS/TS library exposes collection results; `dist/opencascade_full.d.ts` shrinks by ~35 %; the bindgen pipeline simplifies (delete `discover.py` + R5 + R8–R12).
- **Cons**: Requires the consumer audit (Finding 7); for the rare consumer that does want a live handle (e.g. iterative refinement loops where copying is wasteful), we need an opt-in escape hatch that exposes a _single_ generic `class_<NCollectionLiveHandle>` (Option B as a fallback for the long tail). Hard prerequisite: the `additionalCppCode` regression must be patched first (Validation 6).
- **Architectural fit**: this is the same pattern that pybind11 + numpy use (vector → numpy array at boundary), wasm-bindgen + js-sys (Vec → js-sys::Array), and SWIG + Python (typemaps).

### Option E — Iterator-only exposure

Keep all 613 `class_<>` registrations but elide every method whose return type is itself NCollection (i.e. nested containers) and every method whose parameter is a member typedef. Expose only the `Iterator` interface:

```ts
export declare class NCollection_Array1_gp_Pnt {
  Iterator(): NCollection_Iterator_gp_Pnt;
  Size(): number;
  delete(): void;
}
export declare class NCollection_Iterator_gp_Pnt {
  HasNext(): boolean;
  Value(): gp_Pnt;
  Next(): void;
  delete(): void;
}
```

- **Pros**: minimal bindgen change (extend R3 to elide non-iterator methods); preserves the per-permutation contract for consumers who already depend on it.
- **Cons**: still 613 classes (×2 for Iterators = 1226); `unknown` cascade only partially resolved (~200 residual); doesn't address the eigenquestion.
- **Status**: useful as a complement to Option D for the long-tail consumers, not as a primary strategy.

## Recommendation

**Adopt Option D (Boundary Narrowing with Adapter Returns) as the sole primary strategy.** The POC (2026-05-16) validated the mechanism end-to-end on the production toolchain and ruled out Option C as a separate path. Option B remains available as a long-tail fallback for the rare consumer that requires a live NCollection handle.

The mechanism stack:

1. **Per-API adapter functions** in `additionalCppCode` that consume the OCCT C++ surface and produce a JS-side return.
2. **`EMSCRIPTEN_DECLARE_VAL_TYPE` + `register_type<T>(name, ts_definition)`** — Octobre 2025 emscripten PR #25272 — to give each adapter a precise, hand-authored TypeScript type (e.g. `"gp_Pnt[]"`, `"Map<string, gp_Pnt>"`, or `"NCollection_Array1<gp_Pnt>"` for backward-compat optics).
3. **`val(emscripten::typed_memory_view(n, ptr))` zero-copy fast-path** for primitive element types so large mesh buffers (≥ 100 k elements) avoid the per-element marshalling cost.
4. **One opt-in `class_<NCollectionLiveHandle>`** for long-tail consumers that need an in-place handle.

### Concrete sequencing (proposed, post-POC)

| Phase                                          | Action                                                                                                                                                                                                                                                                                                                                                                                                         | Acceptance gate                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **−1 — Prerequisite** ✅ already patched       | Verify the `additionalCppCode` regression fix is in place per [`generate.py:474-515`](../../repos/opencascade.js/src/ocjs_bindgen/pipeline/generate.py) and [`yaml_build.py:521-529`](../../repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py); update [`docs/research/ocjs-additionalcppcode-type-erasure-regression.md`](./ocjs-additionalcppcode-type-erasure-regression.md) to `status: superseded` | No code change required; verification step only                              |
| **0 — Audit**                                  | Consumer scan: `rg -t ts 'NCollection_'` across tau monorepo + replicad + ocjs.org consumer code; publish list of every JS call-site that requires a live NCollection handle                                                                                                                                                                                                                                   | < 20 hits documented                                                         |
| **1 — Adapter authoring infrastructure**       | Add a `register_type<>` helper macro pack to `additionalCppCode` covering the 10 NCollection shapes; add the typed-memory-view fast-path helper for primitive arrays                                                                                                                                                                                                                                           | Sample method exposed via Option D returns `gp_Pnt[]` end-to-end             |
| **2 — Disable auto-discovery for NCollection** | Drop the `discover.py` two-phase parse for NCollection; remove the auto-generated `using` declarations from the TU input                                                                                                                                                                                                                                                                                       | `class_<NCollection_*>` registration count → 0 (excepting Phase 4 long-tail) |
| **3 — Author per-API adapters**                | For each OCCT method that surfaces an NCollection in its signature (~150), add an `additionalCppCode` adapter that returns the appropriate JS-side TS shape (`Array<T>` for sequences, `{ keys, values }` or `Map<K,V>` for DataMap-shaped APIs)                                                                                                                                                               | The audited consumer call-sites work without further changes                 |
| **4 — Fallback class for the long tail**       | A single `class_<NCollectionLiveHandle>` exposed via Option B for any consumer that opted out at Phase 0                                                                                                                                                                                                                                                                                                       | Long-tail consumers green-light                                              |
| **5 — Cleanup**                                | Delete `src/ocjs_bindgen/discover.py`, R5 + R8–R12 plans, the `_known_export_names` NCollection seeding, the `dedupeTemplateTypedefsByCanonical` pass, the cross-fragment stub eliminator (R6)                                                                                                                                                                                                                 | `dist/opencascade_full.d.ts` ≤ 7.5 MB; `unknown` count ≤ 50                  |

Total effort estimate: **2–3 weeks of bindgen work** vs ~1–2 weeks for R8–R12 alone (Option A). The marginal cost is ~1 extra week for ~10× the unknown reduction and ~35 % bundle savings, plus permanently dissolving the entire eigenquestion.

## Trade-offs

| Concern                                | Option A (status quo)                                                       | Option D (recommended)                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Consumer breakage**                  | Zero                                                                        | Low — depends on Phase 0 audit; we have evidence (Finding 7) that no current consumer touches NCollection types |
| **Bundle size**                        | 11.6 MB `.d.ts`, 41 MB wasm                                                 | **~7.5 MB `.d.ts` (−35 %)**, ~40 MB wasm (small wasm Δ — most wasm size is OCCT, not bindings)                  |
| **`unknown` count**                    | ~990 after R8–R12                                                           | **~50**                                                                                                         |
| **Bindgen complexity**                 | High — 12 R-recommendations, growing                                        | **Low — `discover.py` + R5 + R8–R12 deleted**                                                                   |
| **Type-safety on JS side**             | Per-permutation classes (verbose but correct)                               | **Native `Array<T>` / `Map<K,V>` (idiomatic and correct)**                                                      |
| **Round-trip cost (large containers)** | Zero copy via direct binding                                                | O(n) copy at boundary; mitigated by typed-memory-view fast-path for primitive arrays                            |
| **Long-tail compat**                   | All NCollection methods exposed                                             | Fallback `NCollectionLiveHandle` for opt-in consumers                                                           |
| **Eigenquestion addressed**            | No — patches the symptom                                                    | **Yes — reframes the question so it dissolves**                                                                 |
| **Future OCCT upgrades**               | Each OCCT version adds new template instantiations → R recommendations grow | Adapters are per-OCCT-API, not per-instantiation; far fewer adapters than instantiations                        |

The single trade-off worth highlighting: **the O(n) copy at the boundary**. For OCCT meshing pipelines that move 100k+ vertex arrays per call, this matters. Mitigation (validated in POC Validations 4 + 9): the per-API adapter falls back to `val(emscripten::typed_memory_view(n, ptr))` for primitive element types, which is a zero-copy view onto the wasm heap. The comprehensive POC measured Strategy Dp at 0.5–2.5× Strategy A (effectively parity) across all sizes for primitive element types, while Strategy D (per-element copy) measured a stable ~165 ns/element across all sequence shapes — so a 1 000-element `Pnt3` array round-trips in ~211 µs and a 10 000-element array in ~2 143 µs. For map-shaped containers (`DataMap`, `IndexedMap`, `DoubleMap`) the D/A overhead falls to **2.3–5.4×** because the Strategy A baseline already pays heavy hash/string costs. **Conclusion**: the boundary cost is well within the budget for typical OCCT API granularity, and the typed-memory-view fast-path closes the gap entirely for the only workloads where it would matter.

## Migration Sketch

A phased migration with in-tree feature flags so the per-permutation strategy stays available during cutover:

```yaml
# build-configs/full.yml
ncollection_binding_strategy: 'boundary_narrowing' # was: "monomorphize"
ncollection_long_tail_handle: true # Option B fallback enabled
```

The bindgen reads this flag and either:

- runs the legacy `discover.py` two-phase parse (Option A path), or
- skips NCollection auto-discovery entirely and relies on per-API `additionalCppCode` adapters + `register_type<>()` (Option D path).

Both paths can be exercised in CI for one OCCT release cycle to validate parity, then the legacy path is deleted.

## Open Questions

1. **OQ1 — Handle wrapping** — **RESOLVED ([Validation 12](#validation-12--open-questions-resolved))**. Embind cannot place a `class_<>` instance inside a `val`; production pattern is the split-API (`acquireHandleArray1` + `materializeFromHandle`), with consumers composing `{ handle, items }` JS-side.
2. **OQ2 — Mutation semantics** — **RESOLVED ([Validation 10](#validation-10--mutation-semantics-resolved-oq2))**. A live, D copy-isolated, Dp shared-storage view. Rollout flags Dp adapters "view, not copy" in JSDoc.
3. **OQ3 — Adapter authoring strategy** — **DEFERRED to rollout plan**. POC validates the mechanism with hand-authored adapters; the bindgen-generated path is a Phase 5+ optimisation.
4. **OQ4 — Iterator parity** — **RESOLVED ([Validation 12](#validation-12--open-questions-resolved))**. Iterator is ~5× slower than bulk-copy at every measured size; bulk-copy wins universally; no iterator adapters needed in production.
5. **OQ5 — Long-tail `NCollectionLiveHandle` ergonomics** — **RESOLVED ([Validation 12](#validation-12--open-questions-resolved))**. Single `class_<NCollectionLiveHandle>` with kind-tagged dispatch is ~1.5× slower than per-permutation `.Value(i)`; acceptable as the long-tail fallback for rare consumers needing a live handle.

## References

- **POC artefact (comprehensive validation, 2026-05-16)**: [`repos/opencascade.js/experiments/option-d-comprehensive-poc/`](../../repos/opencascade.js/experiments/option-d-comprehensive-poc/) — all 10 NCollection shapes × Strategy A / D / Dp / F, full bench / parity / mutation / leak / dts-assert harness, resolves OQ1–OQ5 with measured data
- **POC artefact (architecture validation, 2026-05-16)**: [`repos/opencascade.js/experiments/option-d-boundary-narrowing/`](../../repos/opencascade.js/experiments/option-d-boundary-narrowing/) — four-strategy side-by-side build on emcc 5.0.1 that confirms Strategy D works end-to-end and rules out Strategy C
- POC artefact (eigenquestion validation): [`scripts/poc-r8-member-typedef-peel.py`](../../repos/opencascade.js/scripts/poc-r8-member-typedef-peel.py) — proves R8 only fixes 165/2309 hits because the underlying problem is structural
- Embind documentation: <https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html>
- Embind PR #25272 (`register_type<T>`): <https://github.com/emscripten-core/emscripten/pull/25272>
- Embind PR #14090 (vector wrapper, closed): <https://github.com/emscripten-core/emscripten/pull/14090>
- Embind Issue #11916 (templated class binding, `wontfix`): <https://github.com/emscripten-core/emscripten/issues/11916>
- Embind Issue #11070 (vector → JS Array): <https://github.com/emscripten-core/emscripten/issues/11070>
- WebAssembly Component Model Issue #543 (parametric polymorphism): <https://github.com/WebAssembly/component-model/issues/543>
- emscripten ChangeLog: `node_modules/.cache/emscripten/ChangeLog.md` (mirrors the upstream)
- pybind11: <https://github.com/pybind/pybind11>
- cppyy philosophy: <https://cppyy.readthedocs.io/en/latest/philosophy.html>
- Audit V1: [`docs/research/ocjs-bindgen-unknown-coverage-audit.md`](./ocjs-bindgen-unknown-coverage-audit.md)
- Audit V2: [`docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md`](./ocjs-bindgen-unknown-coverage-audit-v2.md)
- Auto-discovery validation: [`docs/research/ocjs-ncollection-auto-discovery-build-validation.md`](./ocjs-ncollection-auto-discovery-build-validation.md)
- Custom-code type erasure regression: [`docs/research/ocjs-additionalcppcode-type-erasure-regression.md`](./ocjs-additionalcppcode-type-erasure-regression.md)

## Appendix A — Container-shape inventory (Option D adapter scope)

Ten distinct C++ container shapes account for all 613 NCollection bindings. Each shape needs one `register_type<>` declaration and one adapter template under Option D:

| Shape                                | Instantiation count | Element-type complexity                   |
| ------------------------------------ | ------------------: | ----------------------------------------- |
| `NCollection_Array1<T>`              |                 168 | Simple `T`                                |
| `NCollection_DataMap<K,V,H>`         |                 122 | `K`, `V`, optional `Hasher`               |
| `NCollection_Map<K,H>`               |                  79 | `K`, optional `Hasher`                    |
| `NCollection_DynamicArray<T>`        |                  71 | Simple `T` (incl. nested `Typed<>` cases) |
| `NCollection_Sequence<T>`            |                  56 | Simple `T`                                |
| `NCollection_IndexedMap<K,H>`        |                  42 | `K`, optional `Hasher`                    |
| `NCollection_IndexedDataMap<K,V,H>`  |                  38 | `K`, `V`, optional `Hasher`               |
| `NCollection_List<T>`                |                  26 | Simple `T`                                |
| `NCollection_DoubleMap<K1,K2,H1,H2>` |                   8 | Two keys, two hashers                     |
| `NCollection_Array2<T>`              |                   3 | Simple `T` (2-D array)                    |
| **Total**                            |             **613** | —                                         |

Each shape needs one `register_type<>` registration plus one adapter template under Option D (Option C is struck — see POC Validation 3).

## Appendix B — Sample call-site translation under Option D

Before (status quo, Option A):

```ts
// Generated dist
declare class NCollection_Array1_gp_Pnt {
  Lower(): number;
  Upper(): number;
  Value(theIndex: number): gp_Pnt;
  // … 30 more methods
}
declare function getControlPoints(curve: Geom_BSplineCurve): NCollection_Array1_gp_Pnt;

// Consumer
const pts = getControlPoints(curve);
const out: gp_Pnt[] = [];
for (let i = pts.Lower(); i <= pts.Upper(); ++i) {
  out.push(pts.Value(i));
}
pts.delete(); // mandatory or leak
```

After (Option D):

```ts
// Generated dist
declare function getControlPoints(curve: Geom_BSplineCurve): gp_Pnt[];

// Consumer
const pts = getControlPoints(curve); // already gp_Pnt[]
```

The boundary copy that used to be in JS now happens in the C++ adapter (one O(n) loop per call) and the consumer never sees an opaque container handle. No `delete()` calls, no `Lower()`/`Upper()` indexing dance, no `unknown` cascade.

## Appendix C — Comprehensive bench results

Source: [`repos/opencascade.js/experiments/option-d-comprehensive-poc/results.json`](../../repos/opencascade.js/experiments/option-d-comprehensive-poc/results.json) (auto-generated by `bench.mjs`). Hardware: Apple M-series host, Node.js 22.x, emcc 5.0.1, optimisation `-O2`. All values are median of N iterations (N varies by size: 5 000 / 2 000 / 500 / 100 for sizes 10 / 100 / 1 000 / 10 000).

### Per-(shape × strategy × size) median µs/call

| Shape                       |      n |     A µs |     D µs | Dp µs |   D/A | Dp/A |
| --------------------------- | -----: | -------: | -------: | ----: | ----: | ---: |
| Array1<Pnt3>                |     10 |     0.42 |     2.33 |  0.21 |  5.6× | 0.5× |
| Array1<Pnt3>                |    100 |     0.71 |    20.75 |  0.25 | 29.3× | 0.4× |
| Array1<Pnt3>                |  1 000 |     1.46 |   211.35 |  2.35 |  145× | 1.6× |
| Array1<Pnt3>                | 10 000 |     8.83 | 2 142.71 | 22.04 |  243× | 2.5× |
| Array1<double>              |     10 |     0.58 |     1.62 |  0.21 |  2.8× | 0.4× |
| Array1<double>              |    100 |     0.46 |    15.13 |  0.25 | 33.0× | 0.5× |
| Array1<double>              |  1 000 |     1.04 |   150.73 |  0.60 |  145× | 0.6× |
| Array1<double>              | 10 000 |     4.46 | 1 546.73 |  8.38 |  347× | 1.9× |
| Array1<int>                 |     10 |     0.67 |     1.62 |  0.21 |  2.4× | 0.3× |
| Array1<int>                 |    100 |     0.42 |    15.21 |  0.25 | 36.5× | 0.6× |
| Array1<int>                 |  1 000 |     1.13 |   157.56 |  0.50 |  140× | 0.4× |
| Array1<int>                 | 10 000 |     4.35 | 1 558.31 |  5.77 |  358× | 1.3× |
| Array2<double>              |     10 |     0.67 |     3.17 |  0.25 |  4.7× | 0.4× |
| Array2<double>              |    100 |     0.67 |    17.33 |  0.25 | 26.0× | 0.4× |
| Array2<double>              |  1 000 |     1.25 |   160.50 |  1.42 |  128× | 1.1× |
| Array2<double>              | 10 000 |     5.25 | 1 611.29 |  9.44 |  307× | 1.8× |
| DynamicArray<Pnt3>          |     10 |     0.67 |     2.29 |     — |  3.4× |    — |
| DynamicArray<Pnt3>          |    100 |     0.87 |    20.92 |     — | 23.9× |    — |
| DynamicArray<Pnt3>          |  1 000 |     3.77 |   215.08 |     — | 57.0× |    — |
| DynamicArray<Pnt3>          | 10 000 |    35.19 | 2 148.42 |     — | 61.1× |    — |
| Sequence<Pnt3>              |     10 |     0.58 |     2.21 |     — |  3.8× |    — |
| Sequence<Pnt3>              |    100 |     0.79 |    20.67 |     — | 26.1× |    — |
| Sequence<Pnt3>              |  1 000 |     3.63 |   210.52 |     — | 58.1× |    — |
| Sequence<Pnt3>              | 10 000 |    36.33 | 2 144.79 |     — | 59.0× |    — |
| List<Pnt3>                  |     10 |     0.75 |     2.17 |     — |  2.9× |    — |
| List<Pnt3>                  |    100 |     1.62 |    21.83 |     — | 13.4× |    — |
| List<Pnt3>                  |  1 000 |    10.63 |   215.58 |     — | 20.3× |    — |
| List<Pnt3>                  | 10 000 |   101.44 | 2 238.75 |     — | 22.1× |    — |
| Map<int>                    |     10 |     0.83 |     1.62 |     — |  1.9× |    — |
| Map<int>                    |    100 |     2.38 |    15.25 |     — |  6.4× |    — |
| Map<int>                    |  1 000 |    16.96 |   154.94 |     — |  9.1× |    — |
| Map<int>                    | 10 000 |   146.98 | 1 533.75 |     — | 10.4× |    — |
| DataMap<string,Pnt3>        |     10 |     1.62 |     4.63 |     — |  2.8× |    — |
| DataMap<string,Pnt3>        |    100 |    10.63 |    44.58 |     — |  4.2× |    — |
| DataMap<string,Pnt3>        |  1 000 |   106.04 |   466.94 |     — |  4.4× |    — |
| DataMap<string,Pnt3>        | 10 000 | 1 223.33 | 5 008.17 |     — |  4.1× |    — |
| IndexedMap<string>          |     10 |     1.96 |     2.67 |     — |  1.4× |    — |
| IndexedMap<string>          |    100 |    12.08 |    26.08 |     — |  2.2× |    — |
| IndexedMap<string>          |  1 000 |   111.27 |   275.25 |     — |  2.5× |    — |
| IndexedMap<string>          | 10 000 | 1 241.65 | 2 839.33 |     — |  2.3× |    — |
| IndexedDataMap<string,Pnt3> |     10 |     1.83 |     7.17 |     — |  3.9× |    — |
| IndexedDataMap<string,Pnt3> |    100 |    13.00 |    70.38 |     — |  5.4× |    — |
| IndexedDataMap<string,Pnt3> |  1 000 |   124.25 |   725.08 |     — |  5.8× |    — |
| IndexedDataMap<string,Pnt3> | 10 000 | 1 393.46 | 7 358.73 |     — |  5.3× |    — |
| DoubleMap<int,string>       |     10 |     2.08 |     6.33 |     — |  3.0× |    — |
| DoubleMap<int,string>       |    100 |    15.12 |    63.83 |     — |  4.2× |    — |
| DoubleMap<int,string>       |  1 000 |   140.88 |   645.77 |     — |  4.6× |    — |
| DoubleMap<int,string>       | 10 000 | 1 514.73 | 6 546.96 |     — |  4.3× |    — |

### OQ4 — Iterator vs bulk-copy

|      n | bulk-copy D µs | iterator D µs | iter / bulk |
| -----: | -------------: | ------------: | ----------: |
|     10 |           2.54 |         12.88 |        5.1× |
|    100 |          23.12 |        115.33 |        5.0× |
|  1 000 |         235.62 |      1 156.10 |        4.9× |
| 10 000 |       2 311.88 |     11 548.42 |        5.0× |

### OQ5 — `NCollectionLiveHandle.At(i)` vs Strategy A `.Value(i)`

|      n | A.Value(i)×N µs | F.At(i)×N µs | F.ToArray µs | F.At/A |
| -----: | --------------: | -----------: | -----------: | -----: |
|     10 |            1.58 |         2.21 |         3.33 |   1.4× |
|    100 |            9.25 |         9.33 |        23.75 |   1.0× |
|  1 000 |           60.56 |        91.37 |       235.10 |   1.5× |
| 10 000 |          585.92 |       861.85 |     2 349.48 |   1.5× |

Reproduction: `cd repos/opencascade.js/experiments/option-d-comprehensive-poc && ./build.sh && node --expose-gc run.mjs`.

## Replicad Consumer Impact (PoC validation, 2026-05-16)

A second, **replicad-specific** PoC at [`repos/opencascade.js/experiments/replicad-impact-poc/`](../../repos/opencascade.js/experiments/replicad-impact-poc/) measures the empirical impact of Option D on the _exact_ hot paths a real replicad consumer touches. Unlike the comprehensive POC (which uses synthetic stub containers), this one builds a custom OCJS subset (`replicad-surface.yml`, ~107 OCCT symbols, 14.6 MB wasm) bound against real OCCT classes, ports replicad's four hot-path functions verbatim into [`replicad-equivalent/`](../../repos/opencascade.js/experiments/replicad-impact-poc/replicad-equivalent/) using ES2026 `using` declarations for GC, and benchmarks four representative scenarios end-to-end.

The PoC is **fully self-contained** — no `replicad` npm dependency, no `setOC()` injection. Replicad source is read-only reference; ported function bodies cite source line ranges in attribution headers.

### Headline numbers (50 iterations/case, median ms/call)

| Pattern                                        | Status quo (A) | Strategy adapter |           Δ |
| ---------------------------------------------- | -------------: | ---------------: | ----------: |
| **P1** B-spline approximation, n=16 pts        |          0.813 |        0.746 (D) |  **−8.3 %** |
| **P1** B-spline approximation, n=1024 pts      |          112.5 |        109.8 (D) |      −2.4 % |
| **P2** BSpline split @ NbPoles=15, naive D     |          0.013 |            0.010 |   **−24 %** |
| **P2** BSpline split @ NbPoles=15, split-API D |          0.013 |            0.003 |   **−74 %** |
| **P3** sphere-coarse mesh extraction           |          45.28 |        33.08 (F) |   **−27 %** |
| **P3** sphere-fine mesh extraction             |          58.59 |        43.10 (F) |   **−26 %** |
| **P4** small ellipsoid (~30 poles)             |          0.474 |        0.373 (D) |   **−21 %** |
| **simpleVase** end-to-end (D+F combo)          |          48.05 |            41.62 | **−13.4 %** |
| **birdhouse** end-to-end (D+F combo, mean)     |          48.85 |            23.92 |   **−51 %** |

### Hypothesis verdicts

Verdicts mapped from the original replicad audit hypotheses (H1–H7):

| ID     | Original claim                                                  | Verdict                                                                                                                                                                              |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **H1** | Pattern 1 input loops are a 5–50 µs per-curve win               | **CONFIRMED** — measured 70 µs win @ n=16, 2.7 ms @ n=1024                                                                                                                           |
| **H2** | Pattern 2 naive D regresses by ~25 µs/segment                   | **REFUTED** — naive D is **24 % faster** at realistic NbPoles=15; per-handle marshaling cost > per-double materialization                                                            |
| **H3** | Split-API D mitigation restores parity within 10 %              | **REFUTED — exceeds expectation** — split-API D is **3.5–4.4× faster**, not just parity                                                                                              |
| **H4** | Triangulation typed-memory-view delivers 100–300× speedup       | **INCONCLUSIVE** — end-to-end (mesh + extract) shows 26–34 %; pure extraction speedup likely matches the 100×+ projection but is bounded by `BRepMesh_IncrementalMesh` baseline cost |
| **H5** | Pattern 4 ellipsoid Poles is neutral at production sizes        | **CONFIRMED with caveat** — D is 7–21 % faster at production sizes, absolute magnitude sub-millisecond                                                                               |
| **H6** | Real workloads regress under naive-D, recover under split-API-D | **REFUTED for regression, CONFIRMED for win** — no regression observed at realistic pole counts; split-API D is a clear win                                                          |
| **H7** | E2E simpleVase + birdhouse net WIN under D + Dp                 | **CONFIRMED** — 13–27 % E2E speedup with substantially tighter p95 latency under D+F                                                                                                 |

### Cross-strategy parity (Phase 6)

All strategies produce numerically equivalent geometry. Mesh hashes match byte-for-byte across {A, D, F, D+F} on simpleVase. On birdhouse, hashes split into two equivalence classes ({A, D} and {F, D+F}) — vertex positions are identical; the difference is the orientation-aware triangle-winding correction Strategy F applies for reversed faces (matching replicad's production extractor). The naive walker preserves raw triangulation order, which is the actual bug Strategy F transparently fixes.

### Net consumer impact

1. **Migration to Option D adapters is a strict win** for every replicad hot path measured. No regression on any pattern.
2. **The split-API mitigation is overkill for replicad.** Even _naive_ Strategy D outperforms status-quo at realistic pole counts because per-handle embind marshaling dominates over per-double typed-array materialization. The split-API path remains worth implementing as future-proofing, but is not on the critical path for the rollout.
3. **Pattern 3 is the biggest user-visible win.** Replicad already implements the Strategy F equivalent (`ReplicadMeshExtractor`); this PoC empirically confirms that approach delivers ~27 % E2E mesh-extraction speedup, and provides a generic adapter that downstream consumers without a custom extractor can adopt directly.
4. **End-to-end model speedups of 13–27 % on representative workloads**, with much tighter p95 latency under D+F (the slowest 5 % of birdhouse runs go from 105 ms → 26 ms, a 4× tail-latency improvement).

Reproduction: `cd repos/opencascade.js/experiments/replicad-impact-poc && cat reports/summary.md` (full reproduction commands documented there).

### Side finding — readability under `using`

The ported functions consistently come in **30–45 % shorter** than the upstream `[r, gc] = localGC()` + `r(...)` form, with no behavioural divergence (same `.delete()` count, same allocation order, deterministic cleanup at scope exit). Strategy D paths drop the `using` discipline almost entirely (only the singleton adapter handle needs disposal), which is itself a quantifiable readability win for downstream consumers.

The PoC's [`replicad-equivalent/make-bspline.mjs`](../../repos/opencascade.js/experiments/replicad-impact-poc/replicad-equivalent/make-bspline.mjs) is a representative example: the status-quo `makeBSplineApproximation` is ~25 lines (vs ~45 in the upstream `r/gc` form), and the Strategy D variant is ~20 lines with zero `using`/`delete` calls beyond the final returned `Edge`.
