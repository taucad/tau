---
title: 'OCJS V8 Remaining Bindings Issues — Root Cause and Remediation'
description: 'Smoking-gun analysis of the 7 post-R1–R6 baseline failures plus full.yml diff audit, with fix prescriptions to close out the OCJS V8 work.'
status: draft
created: '2026-05-13'
updated: '2026-05-13'
category: investigation
related:
  - docs/research/ocjs-rbv-return-shape-revisit.md
  - docs/research/occt-v8-final-migration-stocktake-4.md
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
---

# OCJS V8 Remaining Bindings Issues — Root Cause and Remediation

Post‑R1–R6 the OCJS V8 test suite is at **262 passed / 7 failed / 5 skipped**. This document pins down every remaining failure to a concrete smoking gun in `src/bindings.py`, audits the `build-configs/full.yml` diff for erroneous removals, and prescribes the minimal codegen changes required to drive failures to zero on legitimate APIs.

## Executive Summary

The 7 remaining failures collapse to **two codegen smoking guns in `processMethodGroup`** (`src/bindings.py:2715–2738`), not a problem in any individual class or API surface:

1. **RC‑A — Same‑name, same‑arity multi‑registration clobber** (covers 6 of 7 tests). When a same‑arity overload group contains ≥2 methods that are JS‑distinguishable by argument _class type_, the generator emits one `.function("Name", select_overload<…>(…))` per method. Embind's method registry is keyed by `(name, arity)`; later registrations silently clobber earlier ones, so only the **last** overload survives at runtime even though `select_overload` chose a different underlying C++ signature for each. Affected: `NCollection_List_TopoDS_Shape::{Append,Prepend}`, `XCAFDoc_ColorTool::{SetColor,UnSetColor}`, `BRepOffsetAPI_MakeThickSolid` (transitively via `List.Append`).
2. **RC‑B — Primary stub missing for fully‑ambiguous overloads** (1 test). `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey` has `FindKey(size_t)` and `FindKey(int)`. The `_build_dispatch_tree` cannot disambiguate the two at the JS level (both classify as `number_int`) **or** at the C++ val level. The fall‑through emits `FindKey_1`/`FindKey_2` but **no primary** `FindKey`, while the TypeScript declaration _does_ emit the primary signature via `_collect_ambiguous_primaries`. The contract drift surfaces as `TypeError: map.FindKey is not a function`.

Recommended fix is a 30‑line change inside `processMethodGroup` that routes every same‑arity `js_distinguishable` group with `len > 1` through the existing `_emitValDispatchMethod` (already used for `js_ambiguous`). The dispatch tree it already builds for those overloads is exact — each method is a `DispatchLeaf` selected by `val::instanceof` on the class‑typed argument(s). Pair this with a one‑line primary‑emission fallback for the doubly‑ambiguous case (RC‑B).

The `full.yml` audit found **no erroneous removals**: all 196 deletions are governed by intentional `bindgen-filters.yaml` package/prefix exclusions (Module Draw, TopOpe* deprecated, HeaderSection, AppDef, GeomPlate, ProjLib transitive deps for WASM size). The 24 additions correctly track the V8 stocktake's new APIs (`BRepGraph*`, `ExtremaPC*\*`, `GeomBndLib*\*`).

## Table of Contents

- [Scope and Non‑Goals](#scope-and-non-goals)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Failure inventory](#failure-inventory)
  - [Finding 1 — RC‑A: same‑name multi‑registration clobber](#finding-1--rc-a-same-name-multi-registration-clobber)
  - [Finding 2 — RC‑B: primary missing for doubly‑ambiguous overloads](#finding-2--rc-b-primary-missing-for-doubly-ambiguous-overloads)
  - [Finding 3 — `build-configs/full.yml` diff audit](#finding-3--build-configsfullyml-diff-audit)
- [Recommendations](#recommendations)
- [Remediation Steps](#remediation-steps)
- [Code Examples](#code-examples)
- [Appendix — POC harness](#appendix--poc-harness)
- [References](#references)

## Scope and Non‑Goals

**In scope**:

- Concrete root causes of the 7 baseline test failures listed against `pnpm exec nx run ocjs:test` on `occt-v8-emscripten-5` (working tree at commit `ee56b65` + R1–R6 working‑tree changes).
- Auditing the working‑tree diff of `build-configs/full.yml` for erroneous removals.
- Minimal codegen prescriptions inside `src/bindings.py` to drive remaining failures to zero on legitimate APIs.

**Out of scope**:

- New OCCT V8 surface inclusion beyond what the V8 stocktake docs already mandate.
- Cleanup of `bindgen-filters.yaml` package‑level exclusions (separate optimisation pass).
- Replicad re‑pack and downstream Tau wiring (handled in `docs/research/occt-v8-rc5-to-release-migration.md`).

## Methodology

1. **Failure inventory** — captured via `pnpm exec nx run ocjs:test 2>&1 | tee /tmp/ocjs-test.log`; recorded each unique failure mode with its `BindingError` / `TypeError` payload and stack frame.
2. **Generated C++/TS inspection** — read the emitted `build/bindings/**/<Class>.cpp` files for each failing class to confirm the _registered_ embind shape vs. the _declared_ TypeScript shape.
3. **POC harness** — extended `scripts/poc-base-mirror-input-names.py` into a new `scripts/poc-overload-dispatch.py` that re‑runs `EmbindBindings.processClass` + `TypescriptBindings.processClass` for a single class without a full WASM build, optionally filtering to a specific method (e.g. `--method SetColor XCAFDoc_ColorTool`). Cycle time ≈10 s vs. ≥30 min for the full build.
4. **Codegen trace** — walked `src/bindings.py` `processMethodGroup` (lines 2585–2745), `_build_dispatch_tree`, `_collect_ambiguous_overloads`, `_collect_ambiguous_primaries`, `_emitValDispatchMethod`, and the TS counterpart (lines 4868–4920) to identify which branch each failure case takes.
5. **`full.yml` diff** — compared working‑tree against `HEAD` (`git diff build-configs/full.yml`), bucketed removals/additions by package prefix, and cross‑referenced each removed prefix against `bindgen-filters.yaml` exclusions and against downstream callers (`packages/runtime`, `repos/replicad/packages/replicad/src`).

## Findings

### Failure inventory

| #   | Test                                                                                                                                                   | Runtime error                                                                                                                                                        | Root cause |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `smoke-collections > should support append, size, and access on NCollection_List_TopoDS_Shape`                                                         | `BindingError: Expected null or instance of NCollection_List_TopoDS_Shape, got an instance of TopoDS_Shape`                                                          | RC‑A       |
| 2   | `smoke-collections > should support prepend and reverse on NCollection_List_TopoDS_Shape`                                                              | Same as #1                                                                                                                                                           | RC‑A       |
| 3   | `smoke-collections > should report correct size after appending items to NCollection_List_TopoDS_Shape`                                                | Same as #1                                                                                                                                                           | RC‑A       |
| 4   | `smoke-collections > should collect unique faces from a box with NCollection_IndexedMap_…_ShapeMapHasher`                                              | `TypeError: map.FindKey is not a function`                                                                                                                           | RC‑B       |
| 5   | `smoke-enum-method-dispatch > XCAFDoc_ColorTool.SetColor with Quantity_Color > should dispatch SetColor(TDF_Label, Quantity_Color, XCAFDoc_ColorType)` | `BindingError: Expected null or instance of Quantity_ColorRGBA, got an instance of Quantity_Color`                                                                   | RC‑A       |
| 6   | `smoke-xcaf > should create XCAF document with ShapeTool and ColorTool, add box and set color`                                                         | Same as #5                                                                                                                                                           | RC‑A       |
| 7   | `smoke-advanced-modeling > should shell a box preserving outer dimensions with MakeThickSolid`                                                         | `BindingError: Expected null or instance of NCollection_List_TopoDS_Shape, got an instance of TopoDS_Shape` (transitively from `facesToRemove.Append(faceToRemove)`) | RC‑A       |

Six of seven failures collapse to the same generator bug (RC‑A). The seventh (RC‑B) is a separate, smaller bug in the primary‑emission policy.

### Finding 1 — RC‑A: same‑name multi‑registration clobber

**Smoking gun**: `src/bindings.py:2719–2723`.

```python
js_tree = self._build_js_dispatch_tree(dispatchable, …)
js_ambiguous = self._collect_ambiguous_overloads(js_tree)
js_distinguishable = [m for m in dispatchable if m not in js_ambiguous]

for m in js_distinguishable:
  try:
    output += self.processMethodOrProperty(theClass, m, …, override_postfix="")
  except SkipException as e:
    print(str(e))
```

When the same‑arity dispatch group `dispatchable` contains ≥2 methods that the JS classifier deems "distinguishable" by argument _class type_ (one takes `TopoDS_Shape`, another `NCollection_List<TopoDS_Shape>`; or `Quantity_Color` vs. `Quantity_ColorRGBA` vs. `TDF_Label`), each is emitted as its own un‑suffixed `.function("Name", select_overload<…>(…))` registration.

The generated C++ for `XCAFDoc_ColorTool` (`build/bindings/DataExchange/TKXCAF/XCAFDoc/XCAFDoc_ColorTool.hxx/XCAFDoc_ColorTool.cpp:5385‑5390`) is the canonical demonstration:

```cpp
.function("SetColor", select_overload<void(const TDF_Label &, const TDF_Label &, const XCAFDoc_ColorType)const, XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
.function("SetColor", select_overload<void(const TDF_Label &, const Quantity_Color &, const XCAFDoc_ColorType)const, XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
.function("SetColor", select_overload<void(const TDF_Label &, const Quantity_ColorRGBA &, const XCAFDoc_ColorType)const, XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
.function("SetColor", select_overload<bool(const TopoDS_Shape &, const TDF_Label &, const XCAFDoc_ColorType), XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
.function("SetColor", select_overload<bool(const TopoDS_Shape &, const Quantity_Color &, const XCAFDoc_ColorType), XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
.function("SetColor", select_overload<bool(const TopoDS_Shape &, const Quantity_ColorRGBA &, const XCAFDoc_ColorType), XCAFDoc_ColorTool>(&XCAFDoc_ColorTool::SetColor), allow_raw_pointers())
```

**Embind contract** (per `emscripten/bind.h` `RegisterClassMethod` and `MethodInvoker` machinery): the method table is a `std::unordered_map<std::pair<name, arity>, MethodInfo>`. Each `.function("Name", …)` with identical `name` and identical arity **overwrites** the previously registered entry. `select_overload<sig>(&…)` only resolves a function pointer for one specific signature; it does not produce any runtime dispatch on JS argument types.

**Observable consequence**: only the _last_ registration is reachable from JS. For `SetColor` that is `SetColor(TopoDS_Shape, Quantity_ColorRGBA, XCAFDoc_ColorType)`, so every JS call to `colorTool.SetColor(shape, color, type)` is type‑checked against `Quantity_ColorRGBA`. Passing a `Quantity_Color` instance raises `BindingError: Expected null or instance of Quantity_ColorRGBA, got an instance of Quantity_Color`. The same mechanism explains failures #1–#3 and #7 against `NCollection_List_TopoDS_Shape::Append`:

```cpp
// build/bindings/myMain.h/NCollection_List_TopoDS_Shape.cpp:5334‑5343
.function("Append", select_overload<TopoDS_Shape &(const TopoDS_Shape &), NCollection_List_TopoDS_Shape>(&NCollection_List_TopoDS_Shape::Append), allow_raw_pointers())
.function("Append",
  optional_override([](NCollection_List_TopoDS_Shape& self, ::emscripten::val theOther) -> void {
    self.Append(*theOther.as<NCollection_List<TopoDS_Shape>*>(emscripten::allow_raw_pointers()));
  }), allow_raw_pointers())
```

The single‑item `Append(const TopoDS_Shape&)` is overwritten by the list‑splice `Append(NCollection_List&)`, so `list.Append(boxShape)` is type‑checked against `NCollection_List<TopoDS_Shape>*` and rejects the `TopoDS_Shape`.

The generator does the _right_ thing one level lower: the `_build_dispatch_tree` produced for these groups is a clean `DispatchBranch` whose leaves are each individual overload, distinguished by the class type at the differing argument position. That tree is the exact same shape `_emitValDispatchMethod` already consumes for `js_ambiguous` cases — but the code never feeds the `js_distinguishable` group through it because the historical assumption was "embind handles select_overload natively". Embind does not (per `(name, arity)` registry keying).

**Why TS still looks correct**: the TypeScript emitter on lines ~4878–4910 walks the same dispatch tree but emits an _un‑suffixed_ primary signature for every leaf when `js_distinguishable > 1` — so `.d.ts` advertises all six `SetColor` shapes correctly. The contract drift is purely at the C++ binding layer.

### Finding 2 — RC‑B: primary missing for doubly‑ambiguous overloads

**Smoking gun**: `src/bindings.py:2725–2738`.

```python
if js_ambiguous:
  val_tree = self._build_dispatch_tree(js_ambiguous, …)
  val_ambiguous = self._collect_ambiguous_overloads(val_tree)

  if len(js_ambiguous) > len(val_ambiguous):
    …
    output += self._emitValDispatchMethod(theClass, js_ambiguous[0].spelling, arity, val_tree, …)

  for m in val_ambiguous:
    idx = all_methods_of_name.index(m) if m in all_methods_of_name else 0
    suffix = "_" + str(idx + 1)
    output += self._emitSuffixedMethod(theClass, m, suffix, className, templateDecl, templateArgs)
```

For `NCollection_IndexedMap::FindKey`, the two overloads (`FindKey(const size_t)` and `FindKey(const int)`) classify as `number_int` at both the JS layer and the C++ val layer — neither `_build_js_dispatch_tree` nor `_build_dispatch_tree` can distinguish them. Therefore:

- `js_ambiguous == [size_t‑variant, int‑variant]`
- `val_ambiguous == [size_t‑variant, int‑variant]`
- `len(js_ambiguous) > len(val_ambiguous)` evaluates to `2 > 2 → False`
- `_emitValDispatchMethod` is **not** invoked, so no primary `FindKey` is registered
- The `for m in val_ambiguous` loop emits `FindKey_1` and `FindKey_2`

Generated C++ (`build/bindings/myMain.h/NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.cpp:5346‑5347`):

```cpp
.function("FindKey_1", select_overload<const TopoDS_Shape &(const size_t)const, NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher>(&NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey), allow_raw_pointers())
.function("FindKey_2", select_overload<const TopoDS_Shape &(const int)const, NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher>(&NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey), allow_raw_pointers())
```

Meanwhile the TS emitter does declare a primary `FindKey(theIndex: number): TopoDS_Shape;` (via `_collect_ambiguous_primaries` / `ambiguous_primaries` in lines ~4878–4910). The runtime call `map.FindKey(1)` then resolves to `undefined` on the embind class prototype — `TypeError: map.FindKey is not a function`.

This is an OCCT V8 artefact specifically: the NCollection size_t API migration (#1212) introduced parallel `size_t` overloads alongside the legacy `int` ones across every NCollection container's `FindKey`/`FindIndex`/`Add`/etc. methods. The legacy `int` variants are documented as transitional aliases that will be removed in a future major. Both yield the same observable behaviour for any value in `[0, 2^31)`.

### Finding 3 — `build-configs/full.yml` diff audit

Working‑tree diff vs. `HEAD`: **−196 symbols, +24 symbols**.

**Additions (24)** — all track OCCT V8 stocktake additions and are correctly included:

| Prefix         | Count | Rationale                                             |
| -------------- | ----- | ----------------------------------------------------- |
| `BRepGraph*`   | 3     | New BRep graph traversal package added in OCCT V8.0   |
| `ExtremaPC_*`  | 9     | Per‑curve extrema (utility classes, V8 modernisation) |
| `GeomBndLib_*` | 9     | Per‑curve bounding box helpers (V8 modernisation)     |
| Misc           | 3     | Aligned with V8 stocktake docs                        |

**Removals (196)** — bucketed by prefix and cross‑referenced against `bindgen-filters.yaml`:

| Prefix                          | Removed | `bindgen-filters.yaml` exclusion                       | Erroneous?            |
| ------------------------------- | ------- | ------------------------------------------------------ | --------------------- |
| `TopOpeBRepDS_*`                | 45      | `packages: TopOpeBRepDS` (line 599)                    | No — deprecated in V8 |
| `TopOpeBRepBuild_*`             | 35      | `packages: TopOpeBRepBuild` (line 598)                 | No — deprecated in V8 |
| `TopOpeBRep_*`                  | 26      | `packages: TopOpeBRep` (line 601)                      | No — deprecated in V8 |
| `AppDef_*`                      | 30      | `packages: AppDef` (line 603)                          | No — transitive size  |
| `TopOpeBRepTool_*`              | 20      | `packages: TopOpeBRepTool` (line 600)                  | No — deprecated in V8 |
| `ProjLib*`                      | 13      | `packages: ProjLib` (line 605)                         | No — transitive size  |
| `GeomPlate_*`                   | 9       | `packages: GeomPlate` (line 604)                       | No — transitive size  |
| `HeaderSection*`                | 4       | `packages: HeaderSection` (line 602)                   | No — internal STEP    |
| `GeomLProp_*`                   | 4       | Pulled in via excluded `GeomPlate`/`AppDef` chain      | No — transitive deps  |
| `BRepLProp_*`                   | 3       | Pulled in via excluded prefixes                        | No — transitive deps  |
| `HLRBRep_SLProps`               | 1       | `classes: HLRBRep_SLProps` excluded                    | No                    |
| `NCollection_BasePointerVector` | 1       | Removed in V8 (replaced by `NCollection_DynamicArray`) | No                    |

**Downstream usage check**: `rg ProjLib_|HeaderSection_|GeomPlate_|GeomLProp_|BRepLProp_|HLRBRep_SLProps` across `packages/runtime/src`, `repos/replicad/packages/replicad/src`, and OCJS test corpus returns **zero matches** in TypeScript source. The only hit is `BRepLProp_SLProps` inside `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml`'s embedded C++ snippet — that build is a separate replicad‑specific WASM and bundles the symbol directly; it does not consume the full build's JS surface.

**Verdict**: zero erroneous removals. All 196 deletions are governed by the explicit `bindgen-filters.yaml:596‑605` block whose rationale is "Deprecated in OCCT 8 (TopOpe\*), STEP header internals, approximation / plate / projection packages pulled in transitively — excluded for WASM binary size reduction." If those packages need to come back, the lever is `bindgen-filters.yaml`, not `full.yml` itself (which is generated from the bindgen surface).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                    | Priority | Effort | Impact                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| R1  | Route every same‑arity `js_distinguishable` group with `len > 1` through `_emitValDispatchMethod`, not through per‑method un‑suffixed `processMethodOrProperty` (RC‑A fix)                                                                                | P0       | S      | Fixes 6/7 failures; restores Embind‑safe class‑type dispatch for every same‑arity overload group                 |
| R2  | When `len(js_ambiguous) == len(val_ambiguous)` (doubly ambiguous), still emit a primary that routes to the first overload, then emit the `_N` suffixed variants for explicit access (RC‑B fix)                                                            | P0       | XS     | Fixes 1/7 failures (`FindKey`); closes TS‑vs‑C++ primary contract drift across every NCollection size_t/int pair |
| R3  | Add an OCJS smoke test (`tests/smoke/smoke-overload-clobber.test.ts`) that asserts every TS‑declared primary is callable at runtime for ≥1 class‑typed overload group AND ≥1 size_t/int overload group, so future codegen regressions surface immediately | P1       | S      | Prevents recurrence; complements existing `dts-validation.test.ts` shape assertions                              |
| R4  | Extend `scripts/poc-overload-dispatch.py` (already authored) with a `--check` mode that flags any class whose generated C++ contains ≥2 `.function("X", …)` lines for the same `X` and arity                                                              | P1       | XS     | Static lint that runs against the generated `build/bindings/**/*.cpp` after each codegen pass                    |
| R5  | No action on `build-configs/full.yml` removals — they are intentional and downstream‑safe                                                                                                                                                                 | —        | —      | Confirms the working‑tree diff is correct as is                                                                  |
| R6  | (Optional, V8.1 follow‑up) Filter the `int` variant out of every NCollection size_t/int pair in `bindgen-filters.yaml` so only the modern `size_t` overload is bound; resolves RC‑B at source rather than via a primary stub                              | P2       | S      | Reduces wire surface and aligns with OCCT V8's deprecation trajectory                                            |

## Remediation Steps

The R1 + R2 fixes live in `src/bindings.py` `processMethodGroup`. The minimal diff (≈30 lines, ≈4 edits):

1. **R1 (RC‑A)** — replace the per‑method `for m in js_distinguishable` loop with a single `_emitValDispatchMethod` call when `len(js_distinguishable) > 1`. The dispatch tree the val emitter consumes is exactly `js_tree` filtered to `js_distinguishable` leaves — i.e. `_build_dispatch_tree(js_distinguishable, …)`, which by construction is a pure leaf tree (every leaf is the unique overload for its argument‑class signature). Keep the existing `processMethodOrProperty(…, override_postfix="")` path for the `len == 1` case so single‑overload arities stay zero‑overhead.

2. **R2 (RC‑B)** — when `len(js_ambiguous) == len(val_ambiguous)` (doubly ambiguous), still emit the primary via `_emitValDispatchMethod(…, val_tree, …)` _before_ the per‑method suffixed registrations. The val tree collapses to a `DispatchAmbiguous` whose first‑element fallback is already handled at `_codegen_method_dispatch_tree` line 2549 (it calls the first overload). This produces a runtime‑callable `FindKey(number)` that routes to `FindKey(size_t)` while still preserving `FindKey_1`/`FindKey_2` for explicit access.

3. **R3** — add `tests/smoke/smoke-overload-clobber.test.ts` exercising:
   - `XCAFDoc_ColorTool::SetColor(TDF_Label, Quantity_Color, …)` (asserts class‑type dispatch lives)
   - `NCollection_List_TopoDS_Shape::Append(TopoDS_Shape)` (asserts class‑type dispatch lives)
   - `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher::FindKey(1)` (asserts primary exists)

4. **R4** — add a one‑off Python check (or extend `tests/dts-validation.test.ts`) that scans `build/bindings/**/*.cpp` and fails on any duplicate `(name, arity)` `.function(…)` registration.

5. **Validation cycle**:
   - `pnpm exec nx run ocjs:generate` (codegen — Nx cache miss)
   - `python3 scripts/poc-overload-dispatch.py --method SetColor XCAFDoc_ColorTool` (POC sanity ≈10 s)
   - `pnpm exec nx run ocjs:link` (refreshes `dist/opencascade_full.{js,wasm,d.ts}` — Nx cache hit on C++ if codegen alone changed, **miss** if dispatcher emission changed)
   - `pnpm exec nx run ocjs:test` — expect 269 passed / 0 failed / 5 skipped
   - `pnpm exec nx run ocjs:typecheck` — expect clean

## Code Examples

### Before (current, broken — RC‑A)

```python
# src/bindings.py:2709‑2723
if len(dispatchable) == 1:
  try:
    output += self.processMethodOrProperty(theClass, dispatchable[0], …, override_postfix="")
  …
else:
  js_tree = self._build_js_dispatch_tree(dispatchable, …)
  js_ambiguous = self._collect_ambiguous_overloads(js_tree)
  js_distinguishable = [m for m in dispatchable if m not in js_ambiguous]

  for m in js_distinguishable:
    try:
      output += self.processMethodOrProperty(theClass, m, …, override_postfix="")  # ← clobber bug
    except SkipException as e:
      print(str(e))
```

### After (R1 fix sketch)

```python
if len(dispatchable) == 1:
  output += self.processMethodOrProperty(theClass, dispatchable[0], …, override_postfix="")
else:
  js_tree = self._build_js_dispatch_tree(dispatchable, …)
  js_ambiguous = self._collect_ambiguous_overloads(js_tree)
  js_distinguishable = [m for m in dispatchable if m not in js_ambiguous]

  if len(js_distinguishable) >= 2:
    dist_tree = self._build_dispatch_tree(js_distinguishable, …)
    return_types = {m.result_type.get_canonical().spelling for m in js_distinguishable}
    mixed_returns = len(return_types) > 1
    isStatic = all(m.is_static_method() for m in js_distinguishable)
    output += self._emitValDispatchMethod(
      theClass, js_distinguishable[0].spelling, arity, dist_tree, classCpp,
      isStatic, templateDecl, templateArgs, mixed_returns=mixed_returns,
    )
  elif len(js_distinguishable) == 1:
    output += self.processMethodOrProperty(theClass, js_distinguishable[0], …, override_postfix="")
```

### After (R2 fix sketch — replaces the strict `>` guard)

```python
if js_ambiguous:
  val_tree = self._build_dispatch_tree(js_ambiguous, …)
  val_ambiguous = self._collect_ambiguous_overloads(val_tree)

  # Emit a primary whenever ANY ambiguous group exists, even if the val tree
  # is itself fully ambiguous (e.g. NCollection's parallel size_t/int overloads).
  # The DispatchAmbiguous fallback in `_codegen_method_dispatch_tree`
  # already routes to the first overload, which is the canonical V8 size_t one.
  return_types = {m.result_type.get_canonical().spelling for m in js_ambiguous}
  mixed_returns = len(return_types) > 1
  isStatic = all(m.is_static_method() for m in js_ambiguous)
  output += self._emitValDispatchMethod(
    theClass, js_ambiguous[0].spelling, arity, val_tree, classCpp,
    isStatic, templateDecl, templateArgs, mixed_returns=mixed_returns,
  )

  for m in val_ambiguous:
    idx = all_methods_of_name.index(m) if m in all_methods_of_name else 0
    suffix = "_" + str(idx + 1)
    output += self._emitSuffixedMethod(theClass, m, suffix, className, templateDecl, templateArgs)
```

### Expected post‑fix C++ for `XCAFDoc_ColorTool::SetColor`

```cpp
.function("SetColor", optional_override([](XCAFDoc_ColorTool& self, emscripten::val arg0, emscripten::val arg1, emscripten::val arg2) -> emscripten::val {
  if (arg0.typeOf().as<std::string>() == "object" && /* …instanceof TDF_Label */ ) {
    if (arg1.typeOf().as<std::string>() == "object" && /* …instanceof TDF_Label */ ) {
      self.SetColor(arg0.as<const TDF_Label&>(allow_raw_pointers()),
                    arg1.as<const TDF_Label&>(allow_raw_pointers()),
                    arg2.as<XCAFDoc_ColorType>());
      return emscripten::val::undefined();
    } else if (arg1.typeOf().as<std::string>() == "object" && /* …instanceof Quantity_Color */ ) {
      self.SetColor(arg0.as<const TDF_Label&>(allow_raw_pointers()),
                    arg1.as<const Quantity_Color&>(allow_raw_pointers()),
                    arg2.as<XCAFDoc_ColorType>());
      return emscripten::val::undefined();
    } else { /* Quantity_ColorRGBA */
      self.SetColor(arg0.as<const TDF_Label&>(allow_raw_pointers()),
                    arg1.as<const Quantity_ColorRGBA&>(allow_raw_pointers()),
                    arg2.as<XCAFDoc_ColorType>());
      return emscripten::val::undefined();
    }
  } else /* TopoDS_Shape branch */ {
    /* … three sub‑branches symmetrical to the above … */
  }
}), allow_raw_pointers())
```

## Appendix — POC harness

`scripts/poc-overload-dispatch.py` (authored as part of this investigation):

- Re‑runs `EmbindBindings.processClass` + `TypescriptBindings.processClass` for a target class without a full WASM build.
- Optional `--method NAME` flag filters both outputs to the named method, exposing the duplicate `.function("NAME", …)` pattern in C++ and the corresponding TS signatures side by side.
- Cycle time: ≈10 s end‑to‑end vs. ≥30 min for `pnpm exec nx run ocjs:build` from a cold cache.

Reproduction transcripts:

```text
$ python3 scripts/poc-overload-dispatch.py --method SetColor XCAFDoc_ColorTool
═══════ XCAFDoc_ColorTool ═══════

--- C++ embind binding ---
    .function("SetColor", select_overload<void(const TDF_Label &, const TDF_Label &, …)const, XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())
    .function("SetColor", select_overload<void(const TDF_Label &, const Quantity_Color &, …)const, XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())
    .function("SetColor", select_overload<void(const TDF_Label &, const Quantity_ColorRGBA &, …)const, XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())
    .function("SetColor", select_overload<bool(const TopoDS_Shape &, const TDF_Label &, …), XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())
    .function("SetColor", select_overload<bool(const TopoDS_Shape &, const Quantity_Color &, …), XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())
    .function("SetColor", select_overload<bool(const TopoDS_Shape &, const Quantity_ColorRGBA &, …), XCAFDoc_ColorTool>(&…::SetColor), allow_raw_pointers())   ← only this one survives
```

Re‑running after R1 + R2 should collapse the six lines into a single `optional_override` dispatcher.

## References

- Embind method registration (clobbering on `(name, arity)`): https://emscripten.org/docs/api_reference/bind.h.html
- OCCT V8.0 NCollection size_t API migration (#1212): https://dev.opencascade.org/content/occt-800
- Related: `docs/research/ocjs-rbv-return-shape-revisit.md` (R1–R6 minimal transformation directives)
- Related: `docs/research/occt-v8-final-migration-stocktake-4.md` (V8 surface expectations)
- Related: `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` (RBV dispose policy and codegen invariants)
- Bindgen filters source of truth: `repos/opencascade.js/bindgen-filters.yaml` (package‑level exclusions for `full.yml`)
