---
title: 'OCJS Optional-Overload Resolution Blueprint'
description: 'Canonical blueprint for migrating OCJS trailing-default emission from arity fan-out to std::optional<T>, including all libembind, bindgen Python, and smoke-test surfaces that must change. PoC-validated end-to-end (96/96).'
status: active
created: '2026-05-28'
updated: '2026-05-28'
category: architecture
related:
  - docs/research/ocjs-trailing-default-arity-fan-out.md
  - docs/research/ocjs-option-c-validation-experiment-design.md
  - docs/research/ocjs-suffix-free-overload-cost-experiment-design.md
  - docs/research/ocjs-libembind-strategic-direction-assessment.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-bindgen-modular-refactor-blueprint.md
  - docs/research/ocjs-unified-rbv-blueprint.md
---

# OCJS Optional-Overload Resolution Blueprint

Canonical blueprint of every change required to migrate OCJS's trailing-default emission from arity fan-out to a single `std::optional<T>`-wrapped binding per method/constructor, dispatched by a bounded extension of the C1 same-arity sibling matcher.

## Executive Summary

The `poc-occt-integration` experiment has empirically validated the **Option C′** approach end-to-end on real OCCT — 96 of 96 expectations met across Gates 1–3 plus 15 front-loaded risks (R1–R6, T1–T5, U1/U3/U4/U8) — and produced a deployment-ready `libembind-overloading.v2.patch` (+54 lines / +1 hunk vs the current production patch). Remaining work is purely emitter-side: three `src/ocjs_bindgen/codegen/` modules need to be re-pointed from emitting N truncated arity-keyed bindings per method to emitting **one** `optional_override` lambda with `std::optional<T>` + `.value_or(default)` per trailing default, plus three emit-time guards (R4 val-vs-optional collision; R6 non-const-reference protection; T1 multi-optional same-arity collision). The objective and acceptance gate for the entire migration is **all 79 files under `repos/opencascade.js/tests/smoke/*.test.ts` continue to pass**, with no new failures, after the patch swap and bindgen emitter changes land together.

## Table of Contents

- [OCJS Optional-Overload Resolution Blueprint](#ocjs-optional-overload-resolution-blueprint)
  - [Executive Summary](#executive-summary)
  - [Table of Contents](#table-of-contents)
  - [Problem Statement](#problem-statement)
  - [Scope and Non-Goals](#scope-and-non-goals)
  - [Objective: All Smoke Tests Pass](#objective-all-smoke-tests-pass)
  - [Target Architecture](#target-architecture)
  - [Files Requiring Changes](#files-requiring-changes)
    - [1. libembind dispatcher (one-file swap)](#1-libembind-dispatcher-one-file-swap)
    - [2. Bindgen Python emitter changes](#2-bindgen-python-emitter-changes)
    - [3. TypeScript declaration emitter](#3-typescript-declaration-emitter)
    - [4. Build pipeline](#4-build-pipeline)
  - [Translation Rules (Mechanical)](#translation-rules-mechanical)
  - [Emit-Time Guards (Hard Requirements)](#emit-time-guards-hard-requirements)
  - [Smoke-Test Surface (Canonical Validation)](#smoke-test-surface-canonical-validation)
  - [Migration Sequence](#migration-sequence)
  - [Acceptance Criteria](#acceptance-criteria)
  - [Risk Register Status](#risk-register-status)
  - [Open Items Deferred to Gate 5](#open-items-deferred-to-gate-5)
  - [References](#references)
  - [Appendix A: PoC Evidence Map](#appendix-a-poc-evidence-map)
  - [Appendix B: bindings.py Affected Functions](#appendix-b-bindingspy-affected-functions)

## Problem Statement

OCJS's current strategy for C++ default arguments — emit one binding per arity by truncating trailing defaulted parameters — costs roughly +6% JS-glue bytes per migrated method and forces the custom `libembind-overloading.patch` to maintain a `signaturesArray`-keyed dispatcher with `Object.hasOwn` guards (R1/R2 from [`ocjs-trailing-default-arity-fan-out.md`](./ocjs-trailing-default-arity-fan-out.md)) just to keep prototype-chain mutation from leaking across sibling classes. The PoC quantified the cost (Corpus A vs Corpus B, +6,161 B / +0.17% combined for a single ctor migration) and confirmed the alternative — emit one `optional_override` lambda taking `std::optional<T>` and recover the default via `.value_or(D)` — is mechanically uniform across all four real-OCCT trailing-default shapes (R5), composes with smart pointers (Gate 3 + R3 + U4), and survives non-trivially-destructible class-typed `T` (T4 + U3) without bindgen-side ceremony.

The single missing ingredient was a `libembind` dispatcher patch that (a) arity-pads omitted trailing arguments to `undefined` before signature lookup and (b) treats `EmValOptionalType` slots as wildcards in `$getSignature`. Both are now implemented and proven (`libembind-overloading.v2.patch`, U8), leaving only the emitter-side Python changes plus three defensive emit-time guards.

## Scope and Non-Goals

**In scope.**

- The libembind dispatcher swap (`src/patches/libembind-overloading.patch` → `libembind-overloading.v2.patch`).
- `src/ocjs_bindgen/codegen/bindings.py`, `embind/constructor.py`, `embind/method.py`, `typescript/constructor.py` emitter changes.
- Three emit-time guards (R4, R6, T1) inside the Python emitter.
- `.d.ts` post-emission of `T | undefined` for `std::optional<T>` parameters and returns.
- Validation: every smoke test in `repos/opencascade.js/tests/smoke/` passes post-migration.

**Out of scope.**

- Bindgen modular refactor (separate work — see [`ocjs-bindgen-modular-refactor-blueprint.md`](./ocjs-bindgen-modular-refactor-blueprint.md)).
- RBV pipeline overhaul (see [`ocjs-unified-rbv-blueprint.md`](./ocjs-unified-rbv-blueprint.md)).
- Multi-threaded WASM build path.
- `closed-world` `wasm-opt` interaction.
- Removing `Object.hasOwn` R1/R2 guards from the v2 patch — they continue to provide defensive correctness even as fan-out call sites disappear, and removal is a Gate-5 follow-up once the audit shows zero remaining fan-out emissions.

## Objective: All Smoke Tests Pass

**The canonical reference for "the approach works" is the 79-file smoke-test suite under `repos/opencascade.js/tests/smoke/*.test.ts`.** Migration is complete and correct **if and only if** every smoke test that passes on the current `main` branch still passes after both (a) the libembind patch swap and (b) the bindgen emitter changes land together.

The suite is enumerated in [Smoke-Test Surface](#smoke-test-surface-canonical-validation) below; the dispatch- and default-related files are the most sensitive observers of the change and the most useful regression detectors during bring-up.

**No smoke test is permitted to be modified, weakened, or quarantined** in order to make migration pass. Every observed failure must be traced either to a bindgen emission bug (fixed in Python), a libembind dispatcher bug (re-derived from the v2 patch), or an unbacked binding shape (rejected by one of the three emit-time guards).

## Target Architecture

```
                                 ┌─────────────────────────────────────────────┐
                                 │  Single C++ binding per OCCT method/ctor    │
                                 │                                             │
   Today (fan-out):              │  .function("Build",                         │
   N truncated arity              │    optional_override(                      │
   registrations per method   ──▶ │      [](Self& self,                        │
                                 │       std::optional<Message_ProgressRange>  │
                                 │       progress) {                           │
                                 │        return self.Build(                   │
                                 │          progress.value_or(                 │
                                 │            Message_ProgressRange()));       │
                                 │      }),                                    │
                                 │    allow_raw_pointers())                    │
                                 └────────────────┬────────────────────────────┘
                                                  │
                                                  ▼
       ┌──────────────────────────────────────────────────────────────────────┐
       │ libembind v2 dispatcher (libembind-overloading.v2.patch, +54 lines)  │
       │  ┌──────────────────────────┐    ┌───────────────────────────────┐   │
       │  │ Hunk 1: $ensureOverload- │    │ Hunk 3: $getSignature treats  │   │
       │  │ Table — arity-pads       │    │ EmValOptionalType slots as    │   │
       │  │ omitted args to undef    │    │ wildcards, null-guarded       │   │
       │  └──────────────────────────┘    └───────────────────────────────┘   │
       │  ┌──────────────────────────┐                                         │
       │  │ Hunk 2: ctor dispatcher  │    Carry-forward (already in v1):       │
       │  │ — same arity-pad logic   │    R1/R2 Object.hasOwn guards,          │
       │  │ for class_<T> .ctor()    │    cppTypeToJsTypeNameTable, primitive  │
       │  └──────────────────────────┘    type matching minification defenses  │
       └──────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                                  ┌─────────────────────────────────┐
                                  │ JS surface: f(x), f(x, y),      │
                                  │ f(x, y, z) all dispatch to the  │
                                  │ same C++ binding; omitted args  │
                                  │ collapse to std::nullopt; the   │
                                  │ value_or(D) inside the lambda   │
                                  │ supplies the OCCT default.      │
                                  └─────────────────────────────────┘
```

The four-layer wire is:

| Layer                       | Responsibility                                                                       | Implementation                                              |
| --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **JS caller**               | Calls `obj.Build()` or `obj.Build(progress)` interchangeably                         | No change; this is the observable surface                   |
| **libembind v2 dispatcher** | Arity-pads + wildcard-matches optional slots before invoking the C++ lambda          | `libembind-overloading.v2.patch` — one-file swap            |
| **C++ binding lambda**      | `optional_override([](Self&, std::optional<T>) { return self.M(opt.value_or(D)); })` | Emitted by `bindings.py` + `embind/{method,constructor}.py` |
| **OCCT call site**          | Receives the resolved `T` value — never sees the optional                            | Unchanged OCCT signatures                                   |

## Files Requiring Changes

### 1. libembind dispatcher (one-file swap)

| File                                                           | Action                                                                                                                  | Lines           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------- |
| `repos/opencascade.js/src/patches/libembind-overloading.patch` | **Replace** with the contents of `repos/opencascade.js/experiments/poc-occt-integration/libembind-overloading.v2.patch` | 429 → 483 (+54) |

The deployment-ready v2 patch has been generated, validated for clean apply to pristine upstream emscripten, validated byte-identical round-trip to the in-tree snapshot, and confirmed to **loud-fail on double-apply** (U8 checks). The build pipeline (`build-wasm.sh:676`) already references this exact path; no consumer-side path edits are required.

### 2. Bindgen Python emitter changes

The trailing-default fan-out logic lives in **three** focused regions across **two** modules. All three regions currently emit one truncated-arity binding per default parameter; after migration they emit one `optional_override` lambda whose parameters are wrapped in `std::optional<T>` and recovered via `.value_or(<original-default-expr>)`.

#### `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py`

3,503 lines, primary host of the trailing-default emission logic.

| Region                                             | Lines     | Current behaviour                                                                        | New behaviour                                                                                                                                                                                                                                   |
| -------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_countTrailingDefaults`                           | 897–907   | Counts `=`-bearing tokens in trailing args                                               | **Keep as-is.** The count is still needed to know how many params to wrap in `std::optional`.                                                                                                                                                   |
| Method binding fan-out (`processMethodOrProperty`) | 1696–1765 | Emits one `optional_override` lambda per truncation (`for d in range(1, nDefaults + 1)`) | **Replace.** Emit **one** lambda that takes `std::optional<T>` for each trailing default and calls `obj.M(opt0.value_or(D0), opt1.value_or(D1), …)`. Drop the truncation loop.                                                                  |
| TypeScript trailing-default rendering              | 3219–3265 | Inserts `?` after the parameter name for each trailing default                           | **Update.** Same `?` insertion, but the rendered type becomes `T \| undefined` (or keep `T?` — both are TS-equivalent when the `?` is on the parameter name). Document the choice and pick the one that minimises post-link `.d.ts` diff churn. |

Each region carries a `POC trailing-default parity` comment block describing the rationale; replace the block with a brief pointer to this blueprint and a one-line summary of the new behaviour. Do **not** delete the comments outright — they are useful audit anchors during the migration PR review.

#### `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py`

248 lines, owns constructor emission.

| Function                                        | Lines   | Current behaviour                                                                           | New behaviour                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emit_constructor`                              | 43–113  | Emits `.constructor<Ts…>()` or `.constructor(optional_override([](Ts…) { … }))`             | **Add** an `optional_param_count` kwarg; when nonzero, wrap the last `optional_param_count` parameter types in `std::optional<…>` and emit `value_or(<default-expr>)` in the lambda body.                                                                             |
| `process_simple_constructor` (single-ctor path) | 122–130 | Calls `emit_constructor` once per default truncation                                        | **Replace.** One `emit_constructor` call with `optional_param_count=nDefaults`; drop the truncation loop.                                                                                                                                                             |
| `process_simple_constructor` (multi-ctor path)  | 132–169 | `default_expansions` builds truncated-arity siblings; each group emitted as a separate ctor | **Replace.** Treat trailing defaults as `std::optional<T>` wrappers on the single ctor; remove `default_expansions` and the per-truncation expansion. Multi-ctor siblings with **different** non-default arities still go through arity-grouped dispatch (unchanged). |

Same-arity `val`-dispatched constructor groups (the `js_ambiguous` branch around line 170) remain unchanged — they predate this work and continue to use `val`-dispatch.

#### `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py`

548 lines, owns method-group dispatch logic.

| Region                                          | Lines   | Action                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processMethodOrProperty` method-group dispatch | 364–536 | **No structural changes.** Multi-overload dispatch (RBV, val-dispatch, arity-grouped) continues to work as today. Trailing-default expansion is downstream of this and lives in `bindings.py:1696–1765` (above). Add an assertion that the trailing-default `std::optional` path is **not** triggered when `numOverloads > 1` — the existing guard on line 1722 (`numOverloads == 1`) already enforces this; preserve it. |

#### `repos/opencascade.js/src/ocjs_bindgen/codegen/typescript/constructor.py`

175 lines, owns TypeScript constructor signature emission.

| Function                     | Lines      | Current behaviour                                                 | New behaviour                                                                                                                                              |
| ---------------------------- | ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emit_ts_constructor`        | 19–35      | `numOptional` kwarg already marks the last N params as `name?: T` | **Keep as-is.** The `numOptional` machinery already does the right thing; the caller just needs to pass the same `nDefaults` it computes for the C++ side. |
| `process_simple_constructor` | 38–onwards | Today emits one TS ctor signature per arity truncation            | **Replace.** Emit one TS ctor signature with `numOptional=nDefaults`; drop the truncation loop in parallel with the C++ side.                              |

### 3. TypeScript declaration emitter

The `.d.ts` rendering for **methods** in `bindings.py:3219–3265` already places `?` on the parameter name when a trailing default exists. After the migration this remains correct (one method signature with `?`-marked optional tail), but **two adjustments** are needed:

1. **Return-type emission for `std::optional<T>` returns (T3).** When a method returns `std::optional<T>`, the `.d.ts` should render `T | undefined` (or `T?` for shorter notation). This requires a new branch in the return-type renderer that detects `EmValOptionalType` returns and unwraps the inner `T`.
2. **Parameter-type emission for `std::optional<T>` parameters.** The existing `?` placement is correct; verify the underlying type renderer outputs `T` (not `std::optional<T>` or `EmValOptionalType<T>`). The `resolve_type` call on line 3245 should already produce the inner `T` because OCJS' clang AST visit unwraps templates by default, but add an explicit unit test in the emission pipeline.

### 4. Build pipeline

| File                                 | Change                                                                              | Note                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------- |
| `repos/opencascade.js/build-wasm.sh` | **No change.** Line 676 already points at `src/patches/libembind-overloading.patch` | The patch contents change, not the path |

Verify the patch is applied cleanly during the next full build (`patch -p0 -N --ignore-whitespace --no-backup-if-mismatch`); the v2 patch was generated against pristine upstream Emscripten with `diff -u` so it matches the build script's expected format exactly (U8).

## Translation Rules (Mechanical)

The PoC (R5) validated that **all four** real-OCCT trailing-default shapes translate by the same rule. The rule is:

```
C++ source                                                Bindgen-emitted lambda body fragment
─────────────────────────────────────────────────────────  ─────────────────────────────────────
T x = D                  (any expression D)            →   p.value_or(D)
const T& x = T()         (const-ref to anonymous tmp)  →   p.value_or(T())
const Handle(T)& x       (= Handle())                  →   p.value_or(opencascade::handle<T>())
T x = SomeNS::SomeFunc() (function-call expression)    →   p.value_or(SomeNS::SomeFunc())
```

Parameter type in the lambda signature becomes `std::optional<T>` for value parameters and `std::optional<opencascade::handle<T>>` for handle parameters. **No special-casing is required per default-expression shape** — the emitter pastes the original default expression verbatim inside `value_or(…)`.

### Examples

#### Method (today)

```cpp
.function("Build", &BRepBuilderAPI_MakeShape::Build, allow_raw_pointers())
.function("Build", optional_override([](BRepBuilderAPI_MakeShape& self) -> void {
   return self.Build();
 }), allow_raw_pointers())
```

#### Method (post-migration)

```cpp
.function("Build", optional_override(
   [](BRepBuilderAPI_MakeShape& self,
      std::optional<Message_ProgressRange> theRange) -> void {
     return self.Build(theRange.value_or(Message_ProgressRange()));
   }), allow_raw_pointers())
```

Single binding; libembind v2 dispatcher arity-pads omitted args to `undefined` → `nullopt` → `value_or(Message_ProgressRange())` supplies the original C++ default. JS caller can write `obj.Build()` or `obj.Build(progress)` interchangeably, exactly as today.

#### Constructor (today)

```cpp
.constructor<gp_Pnt, Standard_Real, Standard_Real, Standard_Real, Standard_Real>()
.constructor<gp_Pnt, Standard_Real, Standard_Real, Standard_Real>()
.constructor<gp_Pnt, Standard_Real, Standard_Real>()
.constructor<gp_Pnt, Standard_Real>()
.constructor<gp_Pnt>()
```

#### Constructor (post-migration)

```cpp
.constructor(optional_override([](
   gp_Pnt c,
   std::optional<Standard_Real> r1,
   std::optional<Standard_Real> r2,
   std::optional<Standard_Real> ang1,
   std::optional<Standard_Real> ang2) {
   return BRepPrimAPI_MakeSphere(
     c,
     r1.value_or(1.0),
     r2.value_or(-M_PI / 2),
     ang1.value_or(M_PI / 2),
     ang2.value_or(2 * M_PI));
 }))
```

One binding replaces five. The libembind v2 ctor dispatcher (Hunk 2) handles arity padding for `.constructor()` registrations identically to method dispatch.

## Emit-Time Guards (Hard Requirements)

The PoC characterised three binding shapes that would be **silently incorrect** or **build-non-deterministic** under naive `std::optional<T>` emission. The Python emitter must refuse to emit any of them and raise a clear error pointing at the source YAML.

| Guard        | Source risk                                    | Trigger condition                                                                                                        | Error message guidance                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R4 guard** | val-vs-optional same-arity ambiguity           | Same method/ctor has same-arity siblings where ≥1 position is `emscripten::val` and ≥1 is `std::optional<T>` for any `T` | `"{cls}.{method}: same-arity overload mixes emscripten::val with std::optional<T> at parameter position {i}. The val overload would always win (R4) and the optional would be unreachable."`                                                 |
| **R6 guard** | Non-const reference wrapped in `std::optional` | Any parameter typed `T&` (non-const) with `=` initializer is presented to the `std::optional` wrapper                    | `"{cls}.{method} param {name}: cannot wrap non-const reference '{T}&' in std::optional — would silently drop caller mutation. Use the TR-OUT pathway instead."`                                                                              |
| **T1 guard** | Multi-optional same-arity collision            | Same method/ctor has same-arity siblings where ≥2 siblings have ALL positions `std::optional`-typed                      | `"{cls}.{method}: same-arity overloads {sig1} and {sig2} both use only std::optional parameter types — dispatcher cannot disambiguate. Last-registered wins, which is implementation-defined across builds. Rename or remove one overload."` |

Recommended host: a new `optional_emission_guards.py` module under `repos/opencascade.js/src/ocjs_bindgen/predicates/` so the guards are reusable across constructor and method emission paths. Each guard raises `SkipException` (existing pattern) with the precise error message and source-line context.

Alternative for T1: implement deterministic sorting (alphabetical by mangled signature) instead of rejection. The PoC recommendation is **reject** because it's strictly safer and gives YAML authors a clear signal; sorting hides the ambiguity behind a build-time choice the consumer never sees.

## Smoke-Test Surface (Canonical Validation)

The 79-file smoke-test suite under `repos/opencascade.js/tests/smoke/` is the canonical reference for "the migration works". The full inventory is enumerated by `ls tests/smoke/smoke-*.test.ts`. The most sensitive files — the ones the migration explicitly observes — are:

### Tier 1: Direct exercisers of the dispatcher and trailing defaults

These are the canonical regression detectors. Any failure here is a smoking gun.

| File                                                                                                                                 | What it pins                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `smoke-defaults.test.ts`                                                                                                             | Trailing-default behaviour at the most basic level                                          |
| `smoke-cstring-trailing-defaults.test.ts`                                                                                            | C-string + trailing default interaction                                                     |
| `smoke-rbv-trailing-defaults.test.ts`                                                                                                | RBV (return-by-value) + trailing default interaction                                        |
| `smoke-multioverload-trailing-defaults.test.ts`                                                                                      | Multiple overloads each carrying trailing defaults                                          |
| `smoke-inherited-default-args.test.ts`                                                                                               | Derived-class virtual overrides inheriting base defaults (the R1/R2 prototype-chain origin) |
| `smoke-overloads.test.ts`                                                                                                            | Same-name multi-overload dispatch                                                           |
| `smoke-overload-clobber.test.ts`                                                                                                     | Sibling-class prototype mutation (the bug R1/R2 guards close)                               |
| `smoke-suffix-free.test.ts`                                                                                                          | C1 same-arity sibling dispatch (suffix-free naming)                                         |
| `smoke-ambiguous-overloads.test.ts`                                                                                                  | Same-arity ambiguity resolution                                                             |
| `smoke-multiarg-dispatch.test.ts`                                                                                                    | Multi-argument signature matching                                                           |
| `smoke-static-signature-dispatch.test.ts`                                                                                            | `.class_function` (static) dispatch (T2 surface)                                            |
| `smoke-bool-dispatch.test.ts`, `smoke-enum-dispatch.test.ts`, `smoke-enum-method-dispatch.test.ts`, `smoke-cstring-dispatch.test.ts` | Per-type dispatch correctness                                                               |
| `smoke-brep-tool-overloads.test.ts`                                                                                                  | A real OCCT class exercising the full dispatcher matrix                                     |

### Tier 2: Output-parameter and handle interactions (R3/R6/U4 surface)

| File                                   | What it pins                                                         |
| -------------------------------------- | -------------------------------------------------------------------- |
| `smoke-output-params.test.ts`          | Output-reference parameter binding (the R6 misclassification target) |
| `smoke-output-param-stripping.test.ts` | Output-param removal from JS signature                               |
| `smoke-output-params-disposal.test.ts` | Lifetime correctness for output-param-allocated objects              |
| `smoke-handle-output-elision.test.ts`  | Handle-typed output param elision                                    |
| `smoke-handles.test.ts`                | `opencascade::handle<T>` smart-pointer wire path                     |
| `smoke-smart-ptr.test.ts`              | Embind `smart_ptr` integration                                       |

### Tier 3: Whole-OCCT correctness (the actual rendered geometry)

If any of these fail, dispatcher or lifetime bugs have leaked into the wire path even though Tier 1/2 unit-style tests pass.

| File                                                                                                                                                | What it pins                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `smoke-primitives.test.ts`, `smoke-booleans.test.ts`, `smoke-boolean-options.test.ts`                                                               | Sphere/box/cylinder construction (the PoC's reference workload) |
| `smoke-brep-mesh-incremental.test.ts`                                                                                                               | `BRepMesh_IncrementalMesh` (Gates 1–3 binding shape)            |
| `smoke-advanced-modeling.test.ts`, `smoke-feature-modeling.test.ts`, `smoke-fillets-chamfers.test.ts`                                               | Real-world OCCT pipelines                                       |
| `smoke-data-exchange.test.ts`, `smoke-iges.test.ts`, `smoke-stepcaf-writer.test.ts`, `smoke-obj.test.ts`, `smoke-ply.test.ts`, `smoke-gltf.test.ts` | File-format I/O round-trips                                     |
| `smoke-gc-constructors.test.ts`                                                                                                                     | Constructor garbage-collection (U3 surface)                     |
| `smoke-multi-threaded.test.ts`                                                                                                                      | MT-safety (the `thread_local` R2 guard's home turf)             |

### Tier 4: New blueprint-driven coverage (PoC findings → smoke regression pins)

These six files were added alongside this blueprint to close the gaps identified during the smoke-vs-PoC coverage audit. They are the canonical observers of the dispatcher swap's behavioural contract — every PoC finding with externally observable JS-surface behaviour gets a corresponding regression pin.

| File                                     | Pins PoC finding(s)                         | Pre-migration today                                                                                                                                                                          | Post-migration target                                             |
| ---------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `smoke-optional-handle-defaults.test.ts` | R3 + R5 shape 2                             | 3 passing (omitted, full-arity ProgressRange) / 4 failing (explicit `null`, explicit `undefined` for handle defaults on both `BRepAlgoAPI_Fuse.Build` and `BRepFilletAPI_MakeChamfer.Build`) | All 7 passing                                                     |
| `smoke-optional-value-defaults.test.ts`  | R5 shapes 1/3/4 (primitive default surface) | 2 passing (explicit undefined silent coercion, mixed) / 1 failing (explicit null → WASM exception) / 1 skipped (shape 3/4 anchor)                                                            | All 3 unskipped passing                                           |
| `smoke-optional-static-methods.test.ts`  | T2 (`.class_function` + arity-pad)          | 6 passing (current fan-out covers `BRepLib.BuildCurve3d` arity-1..5 + explicit-undefined)                                                                                                    | All 6 still passing (dispatcher swap transparent)                 |
| `smoke-optional-return-types.test.ts`    | T3 (`std::optional<T>` returns)             | 3 skipped (`OPTIONAL_RETURN_AVAILABLE=false`)                                                                                                                                                | Activate + 3 passing once bindgen emits first optional return     |
| `smoke-optional-lifetime-hammer.test.ts` | U3 + U4 (lifetime + refcount safety)        | 2 passing (U3 200× heap-stability hammer, U4 `GetRefCount` precondition) / 1 skipped (U4 activation gated on first `optional<handle<T>>` param)                                              | All 3 passing after U4 activation                                 |
| `smoke-mixed-fanout-optional.test.ts`    | U1 (incremental-migration safety)           | 3 skipped (`MIXED_DISPATCH_AVAILABLE=false`)                                                                                                                                                 | Activate + 3 passing after Step 3 lands the first migrated method |

**Total Tier-4 inventory**: 6 new files / 26 tests (13 passing / 5 failing / 8 skipped today).

Each failing test is documented in its file header with the precise pre-migration error (`BindingError: null is not a valid Message_ProgressRange`, `TypeError: Cannot read properties of undefined (reading 'Zc')`, `WebAssembly.Exception{}`) and the post-migration mechanism that flips it to passing (Hunk 1 arity-pad / Hunk 3 optional-wildcard).

### Pass criteria

```bash
# Migration acceptance gate.
cd repos/opencascade.js
pnpm test                       # all 85 smoke files (79 original + 6 Tier-4)
# Expected: every Tier-1/2/3 test stays green AND every Tier-4 test
# currently failing pre-migration (5 tests across 2 files) flips to passing.
# Zero quarantines or `.skip` calls added beyond the Tier-4 forward-
# looking placeholders (T3 / U1 / U4-activation / R5 shape-3/4 anchor),
# which remain skipped until their bindgen activation gates land.
```

### Tier-4 expected transitions (the migration's most diagnostic signal)

The Tier-4 suite is engineered so that the libembind v2 patch swap (Step 1 of the migration sequence) flips the 5 currently-failing tests from RED to GREEN with no other code change. Any other transition is a bug:

| Transition                                             | Meaning                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 5 Tier-4 fails → 0 after v2 patch swap                 | ✓ Dispatcher correctly handles arity-pad + optional-wildcard on real OCCT                                                    |
| Some but not all 5 flip                                | ⚠ v2 patch hunks did not apply cleanly — re-derive from `experiments/poc-occt-integration/libembind.production+arity-pad.js` |
| 0 of 5 flip                                            | ⚠ v2 patch did not apply at all — check `build-wasm.sh` log for patch rejection                                              |
| Any Tier-1/2/3 test flips RED                          | ⚠ Regression in fan-out compatibility — the v2 patch is supposed to be strictly additive; bisect the new hunks               |
| Any test added to Tier-4 starts failing post-migration | ⚠ Bindgen emitter bug — fix Python, not the test                                                                             |

If any test fails after the migration, the failure must be one of:

1. **An R4/R6/T1 guard correctly firing on a binding shape that was previously silently miscompiled** — fix the binding YAML, not the test.
2. **A bindgen emission bug** — fix the Python emitter; re-run.
3. **A libembind dispatcher bug** — re-derive the v2 patch from the PoC's `libembind.production+arity-pad.js` snapshot; re-run.

A test must **never** be modified, weakened, or quarantined to make the migration pass.

## Migration Sequence

The PoC's U8 finding (clean apply, byte-identical roundtrip, loud double-apply) and U1 finding (mixed fan-out + `std::optional` coexist in one class) make a **strictly additive** sequence possible:

| Step             | Action                                                                                                                                                                                                                                                                                 | Verification                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**            | Drop `libembind-overloading.v2.patch` into `src/patches/`, replacing the v1 patch                                                                                                                                                                                                      | `./build-wasm.sh` applies cleanly; full smoke suite passes UNCHANGED (the v2 patch is strictly more permissive — arity-pad only fires when an `std::optional`-typed parameter is registered, which today's bindgen never emits) |
| **2**            | Land the three emit-time guards (R4, R6, T1) in `predicates/optional_emission_guards.py` with `SkipException`-style rejection. **Before** changing emission.                                                                                                                           | Re-run bindgen; any binding YAML that trips a guard becomes visible as a build-time error and is fixed in YAML, not in Python. Smoke suite still passes (no binding shape changes yet).                                         |
| **2a**           | Author bindgen unit tests for the three guards under `repos/opencascade.js/tests/bindgen/test_optional_emission_guards.py` (pytest). Each guard gets a positive case (raises `SkipException` with the expected message) and a negative case (admissible binding shape passes through). | `pytest tests/bindgen/` green; covered by `pnpm ci:affected`. These are pure Python predicates — no WASM build required, fast hermetic feedback during guard development.                                                       |
| **3**            | Migrate `embind/constructor.py` to emit `std::optional<T>` wrapping for trailing-default ctor params. Migrate `typescript/constructor.py` in parallel.                                                                                                                                 | Full smoke suite passes; bundle delta should be near-zero (ctors weren't the largest fan-out contributor)                                                                                                                       |
| **4**            | Migrate `bindings.py:1696–1765` (method emission) to emit `std::optional<T>` wrapping for trailing-default method params. Migrate `bindings.py:3219–3265` (TS rendering) in parallel.                                                                                                  | Full smoke suite passes; bundle delta is the headline number (expect single-digit-percent JS-glue reduction once all fan-out call sites collapse)                                                                               |
| **5**            | Add `.d.ts` return-type unwrap for `std::optional<T>` (T3 surface)                                                                                                                                                                                                                     | TS dts-snapshot tests stay green; `T \| undefined` appears for new optional returns                                                                                                                                             |
| **6**            | Audit (`grep -r "optional_override" src/`): zero remaining truncation-loop emission sites in bindgen output                                                                                                                                                                            | Confirms migration completeness                                                                                                                                                                                                 |
| **7** (deferred) | Audit upstream `libembind-overloading.v2.patch` to identify R1/R2 `Object.hasOwn` hunks that may become removable once zero fan-out sites remain                                                                                                                                       | Patch shrinkage measurement (Gate 5)                                                                                                                                                                                            |

Steps 1–2 can land as one PR. Steps 3, 4, and 5 can land as three independent PRs (PoC U1 confirms intra-class mixed dispatch is safe). Step 6 is a sanity check, not a code change. Step 7 is post-migration optimisation.

## Acceptance Criteria

The migration is **complete and correct** when **all** of the following hold:

| #   | Criterion                                                                                                                                                                                                                                                                                                                    | How to verify                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `repos/opencascade.js/src/patches/libembind-overloading.patch` byte-equals `experiments/poc-occt-integration/libembind-overloading.v2.patch`                                                                                                                                                                                 | `diff`                                                                                                                                                               |
| 2   | All smoke tests pass: 85 files green (79 baseline + 6 Tier-4)                                                                                                                                                                                                                                                                | `pnpm test`                                                                                                                                                          |
| 3   | All 5 currently-failing Tier-4 tests flip to PASSING after the v2 patch swap (Step 1) with no other code change                                                                                                                                                                                                              | `pnpm vitest run tests/smoke/smoke-optional-*.test.ts tests/smoke/smoke-mixed-*.test.ts` before/after Step 1                                                         |
| 4   | Zero `.skip`, `.todo`, or quarantine annotations added to any pre-existing smoke file; Tier-4 forward-looking skips (T3 returns, U1 mixed, U4 activation, R5 shape-3/4 anchor) remain ONLY for genuinely unactivated migration stages                                                                                        | `git diff main -- tests/smoke/`                                                                                                                                      |
| 5   | The three emit-time guards (R4/R6/T1) live in `predicates/optional_emission_guards.py` and are invoked from both `embind/constructor.py` and `embind/method.py` (via `bindings.py`)                                                                                                                                          | Grep + targeted Python unit tests                                                                                                                                    |
| 6   | Bindgen unit tests at `tests/bindgen/test_optional_emission_guards.py` pass (positive + negative cases for each guard)                                                                                                                                                                                                       | `pytest tests/bindgen/`                                                                                                                                              |
| 7   | `grep -rn "for d in range(1, nDefaults" src/ocjs_bindgen/` returns zero hits (no remaining truncation-loop emitters)                                                                                                                                                                                                         | Grep                                                                                                                                                                 |
| 8   | Generated `.d.ts` for any `std::optional<T>` return renders as `T \| undefined`                                                                                                                                                                                                                                              | TS dts-snapshot test                                                                                                                                                 |
| 9   | Final bundle size measurement recorded (Gate 5; deferred but tracked)                                                                                                                                                                                                                                                        | `du -b dist/*.{js,wasm}` before/after                                                                                                                                |
| 10  | All 85 smoke tests still pass after a full clean rebuild (`pnpm clean && pnpm build && pnpm test`)                                                                                                                                                                                                                           | CI                                                                                                                                                                   |
| 11  | Tier-4 forward-looking tests activate as their gates land: T3 (`OPTIONAL_RETURN_AVAILABLE=true`) and U1 (`MIXED_DISPATCH_AVAILABLE=true`) flip from skipped to passing as soon as the corresponding bindgen emission ships; U4 (`OPTIONAL_HANDLE_PARAM_AVAILABLE=true`) activates with first `optional<handle<T>>` parameter | `pnpm vitest run tests/smoke/smoke-optional-return-types.test.ts tests/smoke/smoke-mixed-fanout-optional.test.ts tests/smoke/smoke-optional-lifetime-hammer.test.ts` |

## Risk Register Status

All 15 risks identified across two deep-review passes have been front-loaded and discharged in `experiments/poc-occt-integration/`. None are left as open follow-ups.

| Risk                                              | Tier | Status                                                     | Bindgen carry-forward                   |
| ------------------------------------------------- | ---- | ---------------------------------------------------------- | --------------------------------------- |
| R1 — Patch composition vs current production base | 1    | RESOLVED (25/25)                                           | None — v2 patch composes cleanly        |
| R2 — `register_optional<T>` TU dedup              | 1    | RESOLVED — idempotent by `thread_local` template guarantee | None — emit at every use site           |
| R3 — `std::optional<opencascade::handle<T>>`      | 1    | RESOLVED (4/4)                                             | None — uniform translation rule applies |
| R4 — val vs optional same-arity ambiguity         | 2    | RESOLVED — val always wins                                 | **Guard required (above)**              |
| R5 — Four real OCCT default shapes                | 2    | RESOLVED (4/4)                                             | None — uniform mechanical translation   |
| R6 — Output / inout ref param misclassification   | 2    | RESOLVED — A loud-fails, B silent                          | **Guard required (above)**              |
| T1 — Multi-optional same-arity collision          | 3    | RESOLVED — last-registered wins                            | **Guard required (above)**              |
| T2 — `.class_function` dispatcher coverage        | 3    | RESOLVED (3/3)                                             | None — static methods inherit arity-pad |
| T3 — `std::optional<T>` as RETURN type            | 3    | RESOLVED (2/2)                                             | `.d.ts` renderer emits `T \| undefined` |
| T4 — Non-default-constructible `T`                | 3    | RESOLVED — no precondition needed                          | None                                    |
| T5 — `-sEVAL_CTORS=2` interaction                 | 3    | RESOLVED — behaviourally neutral                           | None                                    |
| U1 — Mixed fan-out + optional in one class        | 4    | RESOLVED (9/9)                                             | None — incremental migration safe       |
| U3 — `std::optional<class T>` lifetime            | 4    | RESOLVED — 1000x hammer balanced                           | None — no destructor hint needed        |
| U4 — `std::optional<handle<T>>` refcount          | 4    | RESOLVED — zero net delta                                  | None — refcount-safe                    |
| U8 — v2 patch deployment artefact                 | 4    | RESOLVED — clean apply, byte-identical, loud double-apply  | None — drop in place                    |

## Open Items Deferred to Gate 5

Deliberately not in scope of this blueprint; tracked for post-migration follow-up:

1. **Bundle-size delta measurement on a full OCCT build** (PoC measured a single-ctor probe; full-build measurement requires the bindgen emitter changes to land).
2. **Patch-shrink opportunity**: after migration, the R1/R2 `Object.hasOwn` guards in `libembind-overloading.v2.patch` may be removable if zero fan-out call sites remain. Requires a fresh audit.
3. **NCollection template-instantiation surfaces**: the translation rule applies uniformly, but template-instantiation visit order may need attention in bindgen Python.
4. **R4 audit of existing binding YAMLs**: find any class today that has `f(val)` + `f(…)` siblings at the same arity, pre-flag for review before Step 2 of migration sequence.
5. **T1 audit of existing binding YAMLs**: same posture as R4 audit, for all-optional same-arity collisions.

## References

- PoC source of truth: [`repos/opencascade.js/experiments/poc-occt-integration/README.md`](../../repos/opencascade.js/experiments/poc-occt-integration/README.md)
- Deployment-ready patch: [`repos/opencascade.js/experiments/poc-occt-integration/libembind-overloading.v2.patch`](../../repos/opencascade.js/experiments/poc-occt-integration/libembind-overloading.v2.patch)
- Predecessor research (eigenquestion that motivated Option C): [`docs/research/ocjs-trailing-default-arity-fan-out.md`](./ocjs-trailing-default-arity-fan-out.md)
- Option C experiment design: [`docs/research/ocjs-option-c-validation-experiment-design.md`](./ocjs-option-c-validation-experiment-design.md)
- Strategic context: [`docs/research/ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md)
- Outstanding issues catalog (now mostly closed by this work): [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md)
- Bindgen modular refactor blueprint (parallel work, non-overlapping): [`docs/research/ocjs-bindgen-modular-refactor-blueprint.md`](./ocjs-bindgen-modular-refactor-blueprint.md)
- Unified RBV blueprint (intersects on `optional_override` lambda generation): [`docs/research/ocjs-unified-rbv-blueprint.md`](./ocjs-unified-rbv-blueprint.md)

## Appendix A: PoC Evidence Map

Use this table to trace any claim in this blueprint to its underlying empirical artefact under `repos/opencascade.js/experiments/poc-occt-integration/`.

| Claim                                                                   | Test file                                    | Result artefact                                     |
| ----------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| v2 patch applies cleanly + byte-identical roundtrip + loud double-apply | `u8.test.sh`                                 | `results.u8.json`, `libembind-overloading.v2.patch` |
| 96/96 expectations met under `prod+pad`                                 | `run-all.sh`                                 | All `results.*.json` files                          |
| Gates 1–3: arity-pad + smart_ptr<handle> composition                    | `run.test.mjs`                               | `results.json` (25/25)                              |
| R1: 3 hunks compose with current production patch                       | `run.test.mjs`                               | `results.r1.prod+pad.json` (25/25)                  |
| R2: `register_optional<T>` TU dedup idempotent                          | `r2.test.mjs`                                | `results.r2.json`                                   |
| R3: handle×optional cross-product (4/4 call shapes)                     | `r3.test.mjs`                                | `results.r3.json`                                   |
| R4: val always wins, optional unreachable                               | `r4.test.mjs`                                | `results.r4.json`                                   |
| R5: four real OCCT default shapes (4/4)                                 | `r5.test.mjs`                                | `results.r5.json`                                   |
| R6: optional<T&> loud-fails; optional<T> for T& silent                  | `r6.test.mjs`, `bindings-r6-illegal-ref.cpp` | `results.r6.json`, `r6-illegal.compile.log`         |
| T1: last-of-same-arity-registered wins                                  | `t1-t4.test.mjs`                             | `results.t1-t4.json` (t1)                           |
| T2: `.class_function` arity-pad coverage (3/3)                          | `t1-t4.test.mjs`                             | `results.t1-t4.json` (t2)                           |
| T3: `std::optional<T>` return type (2/2)                                | `t1-t4.test.mjs`                             | `results.t1-t4.json` (t3)                           |
| T4: non-default-constructible T compiles + runs                         | `t1-t4.test.mjs`                             | `results.t1-t4.json` (t4)                           |
| T5: `-sEVAL_CTORS=2` neutral (13/13)                                    | `t5.test.mjs`                                | `results.t5.json`                                   |
| U1: mixed fan-out + optional in one class (9/9)                         | `u1-u3-u4.test.mjs`                          | `results.u1-u3-u4.json` (u1)                        |
| U3: lifetime balance, 1000x hammer                                      | `u1-u3-u4.test.mjs`                          | `results.u1-u3-u4.json` (u3)                        |
| U4: refcount balance on `optional<handle<T>>`                           | `u1-u3-u4.test.mjs`                          | `results.u1-u3-u4.json` (u4)                        |
| Bundle/runtime cost: single ctor migration +6,161 B / +0.17%            | `bench-wallclock.mjs`                        | `bench-wallclock-results.json`                      |

## Appendix B: bindings.py Affected Functions

For the bindgen PR review, the following symbols in `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py` are the precise diff surface. All other 3,300+ lines remain untouched.

| Symbol                                                                          | Lines     | Migration action                                                                                                                    |
| ------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `_countTrailingDefaults`                                                        | 897–907   | Keep as-is; still needed to count `std::optional` wrappers                                                                          |
| `_returnTypeRequiresValueWrapper`                                               | 890–891   | Keep as-is                                                                                                                          |
| Method emission trailing-default block (inside `processMethodOrProperty`)       | 1696–1765 | **REPLACE** — single `optional_override` lambda with `std::optional<T>` params + `.value_or(D)` in body                             |
| TS method signature trailing-default block (inside `processTsMethodOrProperty`) | 3219–3265 | **REPLACE** — single TS signature with `?`-marked optional tail (already mostly there; just drop the truncation loop and emit once) |

And under `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py`:

| Symbol                                            | Lines   | Migration action                                                                                                                                   |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emit_constructor`                                | 43–113  | Add `optional_param_count` kwarg; wrap last N param types in `std::optional<…>` when nonzero                                                       |
| `process_simple_constructor` (single-ctor branch) | 122–130 | **REPLACE** — one `emit_constructor` call with `optional_param_count=nDefaults`; drop truncation loop                                              |
| `process_simple_constructor` (multi-ctor branch)  | 132–169 | **REPLACE** — drop `default_expansions` build-up; treat each ctor's trailing defaults as `std::optional<T>` wrappers on its single emitted binding |

And under `repos/opencascade.js/src/ocjs_bindgen/codegen/typescript/constructor.py`:

| Symbol                       | Lines | Migration action                                                                                                     |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `emit_ts_constructor`        | 19–35 | Keep as-is; `numOptional` already does the right thing                                                               |
| `process_simple_constructor` | 38+   | **REPLACE** — emit one TS signature with `numOptional=nDefaults`; drop truncation loop in parallel with the C++ side |

New module (recommended placement):

| File                                                                           | Purpose                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/opencascade.js/src/ocjs_bindgen/predicates/optional_emission_guards.py` | Host the three R4/R6/T1 guards. Each guard takes the relevant clang cursors and raises `SkipException` with the precise error message when the binding shape is unsafe. Invoked from `embind/constructor.py` and `bindings.py` (method emission) at the same point the trailing-default count is computed. |
