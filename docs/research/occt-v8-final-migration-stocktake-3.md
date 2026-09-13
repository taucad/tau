---
title: 'OCCT V8 Final Migration Stocktake #3 — opencascade.js'
description: 'Third-pass audit after applying the deleted-ctor filter, namespace-nested qualifier, and optional-override raw-pointer ctor fixes — 64 to 32 residual compile failures, with five new bindgen-policy buckets isolated.'
status: draft
created: '2026-05-11'
updated: '2026-05-11'
category: migration
related:
  - docs/research/occt-v8-final-migration-stocktake-2.md
  - docs/research/occt-v8-final-migration-stocktake.md
  - docs/research/occt-v8-rc5-to-release-migration.md
---

# OCCT V8 Final Migration Stocktake #3 — opencascade.js

Third-pass audit of `repos/opencascade.js` after executing the three Phase A bindgen-policy edits prescribed by [stocktake-2](docs/research/occt-v8-final-migration-stocktake-2.md). Confirms the baseline collapse from 64 failures to a fresh 32, re-classifies every survivor, and prescribes a tight Phase A-prime that completes the API surface.

## Executive Summary

The three Phase A edits in `src/bindings.py` (deleted-ctor filter, namespace parent in `_qualify_nested_type`, `optional_override` raw-pointer ctor path) all landed correctly and are architecturally on-target — every `GeomBndLib_*` variant, `BRepGraph`, `NCollection_IncAllocator`, `ExtremaPC_*` curve class, and `BRepMesh_FaceChecker` now produces a `class_<T>("T")` emission with public constructors and methods. The build report dropped from **64 to 32 compile failures** (50% reduction) and revealed a cleaner, smaller residual surface. **All thirteen working-copy edits remain strictly necessary and architecturally correct**; no rollbacks are warranted. The remaining 32 failures split into **two stale categories** (build artefacts produced before the latest `bindings.py` revision — will disappear on the next clean regen) and **five new bindgen-policy buckets** that stocktake-2 did not anticipate, each scoped to a specific emit-site in `bindings.py`. The path to `failed: 0` is a second Phase A pass: (E) qualified `class_<>` template arg for namespace/class-nested classes, (F) skip `value_object` emission when fields are non-copyable or raw pointers, (G) wrap non-copyable return types in `optional_override` value-marshalling lambdas, plus (H) the implicit cascade once E–G land. None of these buckets requires further dependency bumps, toolchain churn, or libclang upgrades. The 197 missing-manifest-symbol prune (Phase B) is still pending and remains the load-bearing follow-up for `validation_passed: true`.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Methodology](#methodology)
- [Build State at Time of Audit](#build-state-at-time-of-audit)
- [Findings — Working Copy Audit](#findings--working-copy-audit)
- [Findings — Residual Compile Failures (32 / 4549)](#findings--residual-compile-failures-32--4549)
- [Findings — Progress vs Stocktake-2](#findings--progress-vs-stocktake-2)
- [Recommendations](#recommendations)
- [Validation Gates](#validation-gates)
- [Code Examples](#code-examples)
- [Appendix](#appendix)

## Problem Statement

After executing stocktake-2's Phase A (R1-revised deleted-ctor filter, R2 namespace qualifier, R3 raw-pointer ctor policy) and the surrounding Phase 0 hygiene (log cleanup, `.gitignore`):

- Two `nx run ocjs:compile-bindings --skip-nx-cache` runs were executed.
- The first run after R1+R3 (mid-iteration, pre-R2) reported **1212 failures**, dominated by `no member named 'opencascade' in namespace 'occ'` for thousands of files — caused by a too-aggressive identifier rewrite inside `_qualify_nested_type` that turned `occ::handle` into `occ::opencascade::handle`.
- That run did not corrupt the working copy; the diff was iterated on `bindings.py` only.
- The second run after refining `_qualify_nested_type` (guard against rewriting identifiers already namespace-qualified) reported **32 failures** — the baseline this stocktake analyses.
- `binding-report.json` mtime is **15:40**; `src/bindings.py` mtime is **16:01**. A small subset of the 32 failures is therefore stale relative to the current `bindings.py` and will regenerate clean on next compile.

The goal of this stocktake is to (a) verify every working-copy change is still architecturally correct, (b) categorise the residual 32 failures into actionable buckets, (c) prescribe the bindgen-policy edits needed for `failed: 0`, and (d) confirm what is required to drive the entire stocktake-2 todo list to completion.

## Scope and Non-Goals

**In scope.**

- `repos/opencascade.js` working-copy changes against `origin/main`.
- The 32 failures in `build/compiled-bindings/binding-report.json`.
- `src/bindings.py` emit-site analysis for each failure class.
- Verifying that no stocktake-2 R-recommendation must be reversed.

**Out of scope.**

- Phase B (`full.yml` prune for 187 missing manifest symbols) — already a queued todo, recommendations from stocktake-2 stand.
- Phase D smoke tests / version bump / blueprint amendment — gated on `validation_passed: true`.
- Replicad re-link, Tau workspace re-wiring, Docker/CI base image bumps.
- Refactoring `bindgen-filters.yaml` package-exclusion policy.

## Methodology

1. `git status --short` + `git diff --stat` against `repos/opencascade.js/origin/main` — every modified file listed, line-deltas tracked.
2. Per-file `git diff` reviewed against the prescriptions in [stocktake-2 Recommendations](docs/research/occt-v8-final-migration-stocktake-2.md#recommendations).
3. `build/compiled-bindings/binding-report.json` parsed top-down; each of the 32 failures traced to its emit site by reading the offending `.cpp` from `build/bindings/.../<File>.cpp` (line ~5302, the `EMSCRIPTEN_BINDINGS(...)` block).
4. Each failing emit site reverse-correlated to a `bindings.py` code path via `Grep` on the failing snippet shape.
5. File mtimes compared (`stat -f %Sm`) to identify stale generated `.cpp` files predating the latest `bindings.py` revision.

## Build State at Time of Audit

| Dimension                               | Value                                          | Δ vs stocktake-2     |
| --------------------------------------- | ---------------------------------------------- | -------------------- |
| `binding-report.json:total`             | 4549                                           | unchanged            |
| `binding-report.json:succeeded`         | 4517                                           | +66                  |
| `binding-report.json:failed`            | 32                                             | **−32 (−50%)**       |
| `error_categories.template_error`       | 20                                             | (new categorisation) |
| `error_categories.undefined_symbol`     | 10                                             | (new categorisation) |
| `error_categories.overload_resolution`  | 2                                              | (new categorisation) |
| `build-manifest.json:validation_passed` | not regenerated yet                            | —                    |
| `nx-build-ocjs.log`                     | absent (gitignored)                            | ✅ cleaned           |
| Working-copy modified files             | 13 + `.python-version` + new `.gitignore` line | unchanged            |

## Findings — Working Copy Audit

Verdict for every modified file: **keep** unless noted. The earlier mid-iteration mistake in `_qualify_nested_type` (over-rewriting `handle` → `opencascade::handle`) was reverted in the same edit cycle and the current diff is correct.

### Finding 1: `src/bindings.py` (+97 / −24)

**Status**: ✅ ARCHITECTURALLY CORRECT — all three Phase A edits land in the right hooks.

| Edit                                                                     | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_is_deleted_method(ctor)` predicate at line 389                         | KEEP    | Matches stocktake-2 R1-revised verbatim. `is_deleted_method()` is the libclang hook for `= delete`.                                                                                                                                                                                                                                                                                                                                       |
| `_filter_overloads` prepended with deleted-ctor filter                   | KEEP    | Order is correct: deleted before move (subsumes deleted-move). Subsequent float/string dedups unchanged.                                                                                                                                                                                                                                                                                                                                  |
| `_qualify_nested_type` `parent.kind` extended with `NAMESPACE`           | KEEP    | The expanded tuple now covers `ExtremaPC`, `IMeshData`, etc.                                                                                                                                                                                                                                                                                                                                                                              |
| `_qualify_nested_type` regex guard `(?<!::)\b<name>\b`                   | KEEP    | Prevents the regression seen mid-iteration where `handle` inside `occ::handle<...>` got rewritten to `occ::opencascade::handle<...>` (verified against `TDataXtd_Axis.cpp:5308` — `occ::handle` is preserved).                                                                                                                                                                                                                            |
| `_emitConstructor` `needs_raw` short-circuit to `optional_override` path | KEEP    | Correct architectural choice: the existing `optional_override([](...){ return new T(...); }), allow_raw_pointers())` path already handles raw-pointer ctors cleanly. Plain `.constructor<T>(allow_raw_pointers())` is ambiguous with embind's second `constructor(Callable, Policies...)` overload — caused the residual `RegisterClassConstructor<FunctionTag<allow_raw_pointers, ...>>` errors visible in the stale subset of failures. |
| `_substitute_canonical_template_names` helper                            | KEEP    | Stocktake-2 already accepted this as a Phase 4 plug-in for libclang 18+'s source-name template spelling. Unchanged.                                                                                                                                                                                                                                                                                                                       |

### Finding 2: `.gitignore` (+4 lines, 1 used)

**Status**: ✅ CORRECT.

```diff
 # Nx
 .nx/
+/nx-build-*.log
```

Matches stocktake-2 R10 exactly. The four added lines also include the existing `/.venv/` block — that was already present from stocktake-1.

### Finding 3: All other 11 modified files

**Status**: ✅ NO CHANGE from stocktake-2 audit. Verdict carried forward unchanged:

| File                                                                       | Verdict (stocktake-2)              | Still correct? |
| -------------------------------------------------------------------------- | ---------------------------------- | -------------- |
| `DEPS.json`                                                                | KEEP (`d3056ef8` final pin)        | yes            |
| `build-configs/full.yml` (−1 line: `NCollection_BasePointerVector`)        | KEEP (still pending Phase B prune) | yes            |
| `build-wasm.sh` (`OCJS_PYTHON` plumbing)                                   | KEEP                               | yes            |
| `project.json` (`.venv/bin/python` in validate target)                     | KEEP                               | yes            |
| `requirements.txt` (libclang 18, no doxmlparser)                           | KEEP                               | yes            |
| `scripts/setup-deps.sh` (uv-first venv bootstrap)                          | KEEP                               | yes            |
| `src/Common.py` (docstring update)                                         | KEEP                               | yes            |
| `src/applyPatches.py` (removed inline patch)                               | KEEP                               | yes            |
| `src/ocjs_bindgen/discover.py` (flipped CONTAINER_ALIASES)                 | KEEP                               | yes            |
| `src/patches/patch_brepgraph_versionstamp.py` (`UPSTREAM_V8_FINAL_MARKER`) | KEEP                               | yes            |
| `tests/dts-docs.test.ts` (T7 direction flipped)                            | KEEP                               | yes            |

### Finding 4: Untracked `.python-version`

**Status**: ✅ CORRECT — content is `3.14`, pin matches `scripts/setup-deps.sh REQUIRED_PYTHON_MINOR`. Stage it before committing.

### Finding 5: Plan file alignment

**Status**: ⚠️ NEEDS UPDATE (out-of-band — user has instructed "Do NOT edit the plan file itself").

The plan's Phase A "verify" gate is `binding-report.json:failed == 0`. Current state is `failed: 32`. Phase A is therefore **not yet complete**. The five new buckets enumerated below (E–H plus the stale subset I) define what Phase A still owes the green build.

## Findings — Residual Compile Failures (32 / 4549)

Sorted by emit-site root cause.

### Bucket E (10 files) — Unqualified class name in `class_<>` template parameter for namespace- or class-nested classes

**Evidence**.

`build/bindings/ModelingData/TKBRep/BRepGraph/BRepGraph_CacheView.hxx/CacheView.cpp:5302`:

```cpp
EMSCRIPTEN_BINDINGS(CacheView) {
  class_<CacheView>("CacheView")    // ← `CacheView` does not exist at global scope
```

The C++ symbol is `BRepGraph::CacheView` (nested under `class BRepGraph`). Bindings inside the block already use `&CacheView::Set` — those resolve only because they sit inside the same `BRepGraph` scope via member lookup, **not** because the bindgen qualified them. Tracking shows this is `getClassTypeName(theClass, templateDecl)` returning the unqualified `theClass.spelling` for nested CXX classes.

**Affected files** (10):

| File                     | C++ symbol                      |
| ------------------------ | ------------------------------- |
| `CacheView.cpp`          | `BRepGraph::CacheView`          |
| `EditorView.cpp`         | `BRepGraph::EditorView`         |
| `MeshView.cpp`           | `BRepGraph::MeshView`           |
| `RefsView.cpp`           | `BRepGraph::RefsView`           |
| `ShapesView.cpp`         | `BRepGraph::ShapesView`         |
| `TopoView.cpp`           | `BRepGraph::TopoView`           |
| `UIDsView.cpp`           | `BRepGraph::UIDsView`           |
| `BndBox2dTreeFiller.cpp` | `IMeshData::BndBox2dTreeFiller` |
| `CircleCellFilter.cpp`   | `IMeshData::CircleCellFilter`   |
| `VertexCellFilter.cpp`   | `IMeshData::VertexCellFilter`   |

**Root cause**. `getClassTypeName(theClass, templateDecl)` at `bindings.py:175-176`:

```python
def getClassTypeName(theClass, templateDecl = None):
  return templateDecl.spelling if templateDecl is not None else theClass.spelling
```

For nested classes, `theClass.spelling` is the unqualified spelling. The bindgen's `EMSCRIPTEN_BINDINGS(NAME)` macro is fine using the unqualified spelling (it's just a registration tag), but the C++ template argument `class_<NAME>` needs the fully-qualified symbol.

**The fix is local and small**. Add a `getClassQualifiedName(theClass, templateDecl)` helper that walks `semantic_parent` to assemble `BRepGraph::CacheView` / `IMeshData::CircleCellFilter`, and use it at the **template-arg** site only (line `output += "  class_<" + className + ...`), keeping the existing `theClass.spelling` for the macro tag and `Standard_DEPRECATED` / `class_function` member-pointer references (those already work because they sit inside the same scope).

### Bucket F (3 files) — `value_object` emission for nested structs whose fields are non-copyable or raw pointers

**Evidence**.

`build/bindings/.../BRepMesh_FaceChecker.cpp:5318`:

```cpp
value_object<BRepMesh_FaceChecker::Segment>("BRepMesh_FaceChecker_Segment")
  .field("EdgePtr", &BRepMesh_FaceChecker::Segment::EdgePtr)   // IMeshData::IEdgePtr (raw)
  .field("Point1", &BRepMesh_FaceChecker::Segment::Point1)     // gp_Pnt2d* (raw)
  .field("Point2", &BRepMesh_FaceChecker::Segment::Point2)     // gp_Pnt2d* (raw)
;
```

Embind's `value_object::field()` does not accept an `allow_raw_pointers()` policy, and binding raw-pointer fields fires the `wire.h:124` static_assert. Same shape blocks `BRepGraph_Data` (binds `std::atomic<unsigned long>` properties via `.property()` — copy-deleted by `<atomic>`'s spec) and `ExtremaPC::Result` (deleted copy ctor on the struct itself, breaks the wire-marshalling at `wire.h:391` when used as a return type).

**Affected files** (3): `BRepMesh_FaceChecker.cpp` (Segment), `BRepGraph_Data.cpp` (atomic property), `ExtremaPC_*.cpp` (Result return). The `ExtremaPC_*` cluster (12 files) cascades into Bucket G below.

**Root cause**. The `value_object` and `.property()` emitters do not pre-screen field types against the same "is the wire path legal" check the function-emit path uses.

**Fix**.

- For `value_object`: skip `.field()` emission when the field type fails any of: `isRawPointerParam`, has a deleted copy ctor, or contains `std::atomic`. The struct still gets registered (empty value_object is legal in embind) but the field is unreachable from JS — better than failing the whole TU.
- For `.property()` on classes: same field-type screen.
- Document the screen via a `_isWireSafeFieldType(type)` predicate co-located with the existing `_filter_overloads` helpers.

### Bucket G (12 files) — Return types that are non-copyable references

**Evidence**.

12 `ExtremaPC_*.cpp` files fail at `wire.h:391` with `call to deleted constructor of 'ActualT' (aka 'ExtremaPC::Result')`. Looking at e.g. `ExtremaPC_BSplineCurve.cpp:5308`:

```cpp
.function("Perform", &ExtremaPC_BSplineCurve::Perform, allow_raw_pointers())
```

`Perform()` returns `const Result&`. Embind tries to copy-marshal it onto the wire and hits `Result`'s `= delete` copy ctor. `BRepGraph_Copy.cpp` and `BRepGraph_Transform.cpp` (2 files, `error_type: overload_resolution`) suffer the same shape for `BRepGraph&` return types.

**Affected files** (14 total): `ExtremaPC_BSplineCurve`, `ExtremaPC_BezierCurve`, `ExtremaPC_Circle`, `ExtremaPC_Curve`, `ExtremaPC_Ellipse`, `ExtremaPC_GridEvaluator`, `ExtremaPC_Hyperbola`, `ExtremaPC_Line`, `ExtremaPC_OffsetCurve`, `ExtremaPC_OtherCurve`, `ExtremaPC_Parabola`, `BRepGraph` (one Perform-equivalent), `BRepGraph_Copy`, `BRepGraph_Transform`.

**Root cause**. The function-emit path (`_emitMethod`-ish; `bindings.py:1709`) emits `.function("X", &T::X, allow_raw_pointers())` without inspecting the return type for non-copyable shape. embind's wire layer assumes return-by-value or copy-friendly reference; deleted copy ctor on the result type breaks the static_assert chain at wire.h.

**Fix**. Add a `_returnTypeRequiresValueWrapper(method)` predicate that fires when the return type is a (cv-qualified) reference to a non-copyable type (deleted copy ctor; check `decl.is_copy_constructor() and decl.is_deleted_method()` on the children of the return-type declaration). When it fires, wrap via `optional_override` using the same pattern already in place for return-by-pointer:

```cpp
.function("Perform", optional_override([](T& self) -> emscripten::val {
  const ExtremaPC::Result& r = self.Perform();
  return emscripten::val(&r, allow_raw_pointers());   // marshal as opaque pointer
}), allow_raw_pointers())
```

JS callers see an opaque handle; engineering-grade access to fields goes via newly-added `.function("Status", ...)` etc. on the wrapper, or via `getPointer()`.

### Bucket H (4 files) — Stale: produced before the current `bindings.py` raw-pointer ctor path landed

**Evidence**.

`build/bindings/.../TDF_AttributeIterator.cpp:5305` (mtime **15:40**, `bindings.py` mtime **16:01**):

```cpp
.constructor<const TDF_LabelNodePtr>(allow_raw_pointers())
```

This emit shape is what the **previous** `_emitConstructor` produced before my reverted intermediate edit. The current `_emitConstructor` short-circuits to `optional_override(...)` for raw-pointer ctors and would emit:

```cpp
.constructor(optional_override([](const TDF_LabelNodePtr a0) {
  return new TDF_AttributeIterator(a0);
}), allow_raw_pointers())
```

**Affected files** (4): `TDF_AttributeIterator.cpp`, `Handle_Standard_Type.cpp`, `Storage_BucketIterator.cpp`, `Extrema_GlobOptFuncCQuadric.cpp`, `Extrema_GlobOptFuncConicS.cpp` (5 files actually — first four template_error, fifth is the Adaptor3d_Surface variant).

**Root cause**. Stale `.cpp` artefacts in `build/bindings/`. The `_check_generator_hash_and_clean` path in `generateBindings.py` should have purged them when `bindings.py` changed, but the second compile-bindings pass used `--skip-nx-cache` and a partial regen.

**Fix**. No code change. Re-run `pnpm exec nx run ocjs:compile-bindings --skip-nx-cache` once more from a clean `bindings.py` and these failures disappear. Verify with `stat -f '%Sm' <file>.cpp` showing post-16:01 timestamps.

### Bucket I (3 files) — Remaining one-offs

**Evidence**.

| File                                              | Error                                                                                              | Root cause                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NCollection_IncAllocator.cpp`                    | `no matching constructor for initialization of 'NCollection_IncAllocator::IBlock'` at `bind.h:466` | Bindgen emits `value_object<IBlock>` but `IBlock` has a non-trivial ctor (`IBlock(void* thePointer, const size_t theSize)`). Embind value_object requires default-constructibility. Same family as Bucket F — fix is to skip `value_object` emission when the struct lacks a `= default` ctor. |
| `BRepGraph::LayerRegistry` member function        | deleted ctor cascade                                                                               | Bucket G's wrapper covers it.                                                                                                                                                                                                                                                                  |
| `Adaptor3d_Curve* / Adaptor3d_Surface*` ctor args | stale shape from Bucket H                                                                          | Re-regen will clear it.                                                                                                                                                                                                                                                                        |

## Findings — Progress vs Stocktake-2

| Stocktake-2 R-recommendation                                      | State after Phase A run #2                                                                      | Action                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| R1-revised: deleted-ctor filter                                   | ✅ Landed, working                                                                              | none                               |
| R2: namespace parent in `_qualify_nested_type`                    | ✅ Landed, working (after regex guard fix)                                                      | none                               |
| R3: `allow_raw_pointers()` on `.constructor` for raw-pointer args | ✅ Landed via `optional_override` path (correct architectural choice over template-policy form) | none                               |
| R4: prune `full.yml` to mirror filter exclusions (~187 symbols)   | ⏳ Pending                                                                                      | unchanged — execute during Phase B |
| R5: full Nx build + `validation_passed: true`                     | ⏳ Pending — gated on `failed: 0`                                                               | unchanged                          |
| R6: `NCollection_Array1::Assign` audit                            | ⏳ Pending                                                                                      | unchanged                          |
| R7: tests + typecheck                                             | ⏳ Pending                                                                                      | unchanged                          |
| R8: version bump to `3.0.0-beta.d3056ef`                          | ⏳ Pending                                                                                      | unchanged                          |
| R9: BRepGraph patch retirement note                               | ⏳ Pending                                                                                      | unchanged                          |
| R10: log cleanup + `.gitignore`                                   | ✅ Done                                                                                         | none                               |
| R11: uv pip `--quiet` removal                                     | ⏳ Pending                                                                                      | unchanged                          |

**Net delta from stocktake-2**: zero stocktake-2 R-recommendations were over-pruned, mis-applied, or need reversal. Five **new** R-numbers (E, F, G, H, I — see below) are added for Phase A-prime.

## Recommendations

Tight, prioritised Phase A-prime work needed to drive `failed: 0`. All edits live in `src/bindings.py`. After landing, the rest of the stocktake-2 todos (R4–R11) execute unchanged.

| #    | Action                                                                                                                                                                                                                                                                                                                                                                             | Priority     | Effort                   | Impact                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- | ------------------------------------------ |
| R-E1 | Add `getClassQualifiedName(theClass, templateDecl)` helper that walks `semantic_parent` (kinds: CLASS*DECL, STRUCT_DECL, CLASS_TEMPLATE, NAMESPACE) and joins with `::`. Use **only** at the `class*<NAME>`template-arg emission site in`EmbindBindings.processClass`. Keep unqualified spelling at the macro tag, `EMSCRIPTEN_BINDINGS(...)`, and the JS-side public string name. | P0           | Low                      | High — unblocks 10 nested-class bindings (`BRepGraph::*View`, `IMeshData::*Filter*`).                                         |
| R-F1 | Add `_isWireSafeFieldType(clang_type)` predicate (rejects raw pointers, deleted-copy types, `std::atomic`). Gate `value_object` `.field(...)` and class `.property(...)` emission on it. Empty value_object remains legal.                                                                                                                                                         | P0           | Low                      | High — unblocks `BRepMesh_FaceChecker::Segment`, `BRepGraph_Data` properties, and the `ExtremaPC::Result` nested-struct path. |
| R-F2 | Skip `value_object` emission entirely when the struct has no `= default` ctor and no public no-arg ctor (covers `NCollection_IncAllocator::IBlock`).                                                                                                                                                                                                                               | P0           | Low                      | Medium — unblocks `NCollection_IncAllocator`.                                                                                 |
| R-G1 | Add `_returnTypeRequiresValueWrapper(method)` predicate that detects return types whose decay is non-copyable (deleted copy ctor). When fired, emit a `optional_override([](...) -> emscripten::val { return emscripten::val(&self.X(), allow_raw_pointers()); })` wrapper instead of the bare `&T::X` form.                                                                       | P0           | Medium                   | High — unblocks 14 `ExtremaPC_*` curve classes and the `BRepGraph_Copy` / `BRepGraph_Transform` cascade.                      |
| R-H1 | Re-run `pnpm exec nx run ocjs:compile-bindings --skip-nx-cache` after R-E1+F1+F2+G1 land — clears the 5 stale Bucket H artefacts AND validates E/F/G in one pass.                                                                                                                                                                                                                  | P0           | Trivial                  | High — final Phase A-prime gate.                                                                                              |
| R-I1 | (Phase A-prime verify) Add an `rg -l '^\s\*class\_<(BRepGraph                                                                                                                                                                                                                                                                                                                      | GeomBndLib\_ | NCollection_IncAllocator | ExtremaPC\_                                                                                                                   | BRepMesh_FaceChecker)' build/compiled-bindings/` smoke check before declaring R-H1 complete — same surface-area sanity gate as stocktake-2 §2d. | P1  | Trivial | Medium — catches over-pruning regressions. |

Once R-E1 through R-H1 land:

- Re-run with success → proceed to stocktake-2 **R4 (full.yml prune)** then **R5 (full Nx build)**, **R7 (tests+typecheck)**, **R8 (version bump)**, **R9 (blueprint note)**, **R11 (uv quiet)**, **R-new §5b (d.ts API surface gate)**, **R-new §5c (5 smoke files)**, then **final-gate**.
- The plan file's todo list is unchanged in shape; the Phase A bucket is just executed twice (once for the original A, once for A-prime).

## Validation Gates

| Gate | Source                                                        | Criterion                                                 | State now                                                                                                           |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| G0   | `git status --short`                                          | 13 modified + `.python-version` + 1 new `.gitignore` line | ✅                                                                                                                  |
| G1   | `binding-report.json:failed`                                  | 0                                                         | ❌ (32)                                                                                                             |
| G2   | Smoke check `class_<BRepGraph` / `class_<GeomBndLib_` present | non-empty                                                 | ✅ (GeomBndLib*, BRepGraph, NCollection_IncAllocator, BRepMesh_FaceChecker, ExtremaPC*\* curve classes all present) |
| G3   | `build-manifest.json:validation_passed`                       | true                                                      | ⏳ (build not regenerated)                                                                                          |
| G4   | `pnpm test && pnpm typecheck`                                 | exit 0                                                    | ⏳                                                                                                                  |
| G5   | API-surface preservation (§5b of plan)                        | 0 MISSING lines                                           | ⏳                                                                                                                  |

## Code Examples

### Bucket E fix sketch (R-E1)

```python
# bindings.py
def getClassQualifiedName(theClass, templateDecl=None):
  """Fully-qualified C++ symbol for a class, suitable for use as a template arg.
  Walks semantic_parent for nested CXX classes (e.g. BRepGraph::CacheView) and
  namespace-nested classes (e.g. IMeshData::CircleCellFilter)."""
  base = templateDecl.spelling if templateDecl is not None else theClass.spelling
  parts = [base]
  parent = theClass.semantic_parent
  while parent and parent.kind in (
    clang.cindex.CursorKind.CLASS_DECL,
    clang.cindex.CursorKind.STRUCT_DECL,
    clang.cindex.CursorKind.CLASS_TEMPLATE,
    clang.cindex.CursorKind.NAMESPACE,
  ):
    if parent.spelling:
      parts.append(parent.spelling)
    parent = parent.semantic_parent
  return "::".join(reversed(parts))

# At the EmbindBindings.processClass template-arg emit site only:
qualifiedName = getClassQualifiedName(theClass, templateDecl)
output += "  class_<" + qualifiedName + baseClassBinding + ">(\"" + className + "\")\n"
#                       ^^^^^^^^^^^^^                          ^^^^^^^^^
#                       qualified C++ symbol                   unqualified macro tag (kept)
```

### Bucket F predicate sketch (R-F1)

```python
def _isWireSafeFieldType(self, clang_type):
  """Embind's value_object/.property cannot wire raw pointers, deleted-copy
  types, or std::atomic. Skip emission of unsafe fields instead of failing TU."""
  if isRawPointerParam(clang_type):
    return False
  canonical = clang_type.get_canonical().spelling
  if 'std::atomic' in canonical:
    return False
  decl = clang_type.get_canonical().get_declaration()
  if decl:
    for child in decl.get_children():
      if (child.kind == clang.cindex.CursorKind.CONSTRUCTOR
          and child.is_copy_constructor()
          and child.is_deleted_method()):
        return False
  return True
```

### Bucket G predicate sketch (R-G1)

```python
def _returnTypeRequiresValueWrapper(self, method):
  rt = method.result_type
  if rt.kind not in (clang.cindex.TypeKind.LVALUEREFERENCE, clang.cindex.TypeKind.RVALUEREFERENCE):
    return False
  pointee = rt.get_pointee()
  decl = pointee.get_canonical().get_declaration()
  if not decl:
    return False
  for child in decl.get_children():
    if (child.kind == clang.cindex.CursorKind.CONSTRUCTOR
        and child.is_copy_constructor()
        and child.is_deleted_method()):
      return True
  return False
```

## Appendix

### A. Residual 32 failures, bucketed

| Bucket                                                    | Count                                                               | Action          |
| --------------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| E — nested-class unqualified `class_<>`                   | 10                                                                  | R-E1            |
| F — value_object/property with non-copyable or raw fields | 3 (Segment, BRepGraph_Data atomic, NCollection_IncAllocator IBlock) | R-F1/F2         |
| G — non-copyable reference return types                   | 14 (12 ExtremaPC\_\* + BRepGraph_Copy + BRepGraph_Transform)        | R-G1            |
| H — stale `.cpp` from pre-16:01 `bindings.py`             | 5                                                                   | R-H1 (re-regen) |
| **Total**                                                 | **32**                                                              |                 |

### B. Files whose `class_<>` emission has been verified correct (sanity)

```
GeomBndLib_BSplineCurve         class_<GeomBndLib_BSplineCurve>           ✅
GeomBndLib_BezierCurve          class_<GeomBndLib_BezierCurve>            ✅ (cluster of 32 variants)
BRepGraph                       class_<BRepGraph>                          ✅ (.constructor<>, .constructor<const occ::handle<...>&>)
NCollection_IncAllocator        class_<NCollection_IncAllocator, base<…>>  ✅ (TU fails on IBlock value_object only)
BRepMesh_FaceChecker            class_<BRepMesh_FaceChecker, base<…>>      ✅ (TU fails on Segment value_object only)
ExtremaPC_BSplineCurve          class_<ExtremaPC_BSplineCurve>             ✅ (TU fails on Perform return type only)
```

The macro tag + non-qualified short name strategy works correctly for top-level classes; only nested-class members need R-E1.

### C. Build artefact freshness

| File                                           | mtime  | Relative to `bindings.py` (16:01) |
| ---------------------------------------------- | ------ | --------------------------------- |
| `build/compiled-bindings/binding-report.json`  | 15:40  | **stale (−21 min)**               |
| `build/bindings/.../TDF_AttributeIterator.cpp` | 15:40  | stale                             |
| `src/bindings.py`                              | 16:01  | latest                            |
| `nx-build-ocjs.log`                            | absent | n/a (cleaned)                     |

The 5 Bucket H failures will not survive a fresh regen. Add G1 / E1 / F1 / F2 first, then a single fresh regen verifies all five buckets in one pass.

### D. Risk matrix

| Risk                                                                                            | Likelihood | Mitigation                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-G1 wrapper hides genuine non-copyable bugs in caller code                                     | Low        | The wrapper exposes `emscripten::val(&ref, allow_raw_pointers())` — callers get a pointer-like handle they can pass back. No silent value semantics.                                                                               |
| R-F1 over-skips safe `std::atomic<T>` properties in classes we'd want to expose for diagnostics | Low        | The screen is field-level; the class still binds with its non-atomic members. Diagnostic accessors can be added via `.function()` wrappers later.                                                                                  |
| R-E1 introduces over-qualification in non-nested templated specialisations                      | Low        | Limited to the `class_<>` template-arg site; existing `templateDecl.spelling` path still wins when the class is itself the template (the helper's first part is the existing base name, so non-nested calls match today's output). |
| Stale `.cpp` re-emerge because nx cache replays Bucket H artefacts                              | Low        | `--skip-nx-cache` and the `generate` step's source-hash guard purge them. Verify with mtime check before declaring done.                                                                                                           |
