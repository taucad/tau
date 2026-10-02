---
title: 'OCJS Non-Graphics API Coverage Blueprint'
description: 'Phased enablement program to maximise non-graphics OpenCascade API coverage in @taucad/opencascade.js, with WASM-size budget envelope, codegen-failure-class taxonomy, per-phase exit criteria, and an end-state architecture target.'
status: active
created: '2026-05-13'
updated: '2026-05-13'
category: architecture
related:
  - docs/research/ocjs-removed-bindings-stocktake.md
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/ocjs-bindgen-residual-issues-stocktake.md
  - docs/research/ocjs-v8-bindings-remaining-issues.md
---

# OCJS Non-Graphics API Coverage Blueprint

End-state architecture and phased enablement plan to grow `@taucad/opencascade.js` toward maximum coverage of every non-graphics OpenCascade Technology API surface, while respecting WASM binary-size, d.ts compilability, and runtime correctness budgets.

## Executive Summary

The current `opencascade.js` build ships **4 548 bindings (4 144 explicit + 404 NCollection auto-discovered)** in a 36.47 MB WASM, against a known OCCT v8 universe of ~6 800 bindable non-graphics classes. The 2 252-class gap distributes across **two structural causes** (codegen failure classes F1-F4 — fixable) and **one architectural cause** (package-level exclusions for size — re-enable per-package on a documented budget). This blueprint:

1. **Locks in** the architectural exclusions that should never be revisited (graphics, persistence, Draw, deprecated TopOpe\*).
2. **Phases** the enablement of the addressable surface across five PRs, each with a measurable exit criterion and a hard WASM-size cap.
3. **Defines** the end-state coverage target: ~5 800 bindings in ≤ 38.5 MB WASM (1.3-MB hard ceiling above today), exceeding `@zalo/opencascade.js` and parity with the upstream `donalffons/opencascade.js` non-graphics surface.
4. Establishes a **continuous-coverage CI guard** that surfaces every new OCCT class added by upstream releases and flags any regression in the bound symbol count.

## Table of Contents

- [Current Coverage Topology](#current-coverage-topology)
- [End-State Target](#end-state-target)
- [Failure-Class Taxonomy (Persistent Reference)](#failure-class-taxonomy-persistent-reference)
- [Phased Enablement Program](#phased-enablement-program)
  - [Phase 1: Codegen surgery — F1 + F4 enum-ref + F3 fix-locus sweep](#phase-1-codegen-surgery--f1--f4-enum-ref--f3-fix-locus-sweep)
  - [Phase 2: GeomPlate re-enable](#phase-2-geomplate-re-enable)
  - [Phase 3: AppDef public-only re-enable](#phase-3-appdef-public-only-re-enable)
  - [Phase 4: ProjLib + HeaderSection targeted re-enable](#phase-4-projlib--headersection-targeted-re-enable)
  - [Phase 5: Misc-compilation-error sweep (R2 from prior stocktake)](#phase-5-misc-compilation-error-sweep-r2-from-prior-stocktake)
- [Permanent Exclusions](#permanent-exclusions)
- [WASM Size Budget](#wasm-size-budget)
- [Continuous Coverage CI Guard](#continuous-coverage-ci-guard)
- [Documentation Track](#documentation-track)
- [References](#references)

## Current Coverage Topology

Numbers from [`dist/opencascade_full.build-manifest.json`](repos/opencascade.js/dist/opencascade_full.build-manifest.json) and [`bindgen-filters.yaml`](repos/opencascade.js/bindgen-filters.yaml):

| Bucket                                                                           | Headers | Symbols   | Status                                    |
| -------------------------------------------------------------------------------- | ------- | --------- | ----------------------------------------- |
| Bound (OCCT v8 non-graphics public surface)                                      | ~5 200  | **4 548** | ✅                                        |
| Excluded by package — graphics (TKOpenGl, AIS, Graphic3d, V3d, Prs3d, …)         | ~600    | ~720      | 🔒 permanent (Three.js owns rendering)    |
| Excluded by package — persistence drivers (TKBin, TKXml, TKStd, …)               | ~150    | ~190      | 🔒 permanent (FS is JS concern)           |
| Excluded by package — Draw test tools                                            | ~80     | ~95       | 🔒 permanent (no web equivalent)          |
| Excluded by package — TopOpe\* deprecated boolean engine                         | ~180    | **130**   | 🔒 permanent (BRepAlgoAPI\_\* supersedes) |
| Excluded by package — facade-covered (AppDef, GeomPlate, ProjLib, HeaderSection) | ~60     | **57**    | 🟡 conditional re-enable                  |
| Excluded by class name — codegen failures F1-F4                                  | n/a     | ~150      | 🟢 fixable                                |
| Excluded by class name — F5 link errors (visualization deps)                     | n/a     | ~85       | 🔒 permanent                              |
| Excluded by class name — abstract / deleted ctors                                | n/a     | ~25       | 🔒 permanent                              |
| **Total**                                                                        | ~6 800  | ~6 000    |                                           |

Coverage gap **today**: ~1 250 fixable + ~57 conditional ≈ **1 300 classes** addressable through codegen surgery + per-package re-enable.

## End-State Target

| Metric                                    | Today       | Target        | Δ                    |
| ----------------------------------------- | ----------- | ------------- | -------------------- |
| Bound classes                             | 4 548       | **5 800**     | +1 252               |
| WASM size                                 | 36.47 MB    | **≤ 38.5 MB** | +2.0 MB hard ceiling |
| d.ts size                                 | 9.3 MB      | ≤ 11.0 MB     | +1.7 MB              |
| Smoke test count                          | ~273        | ≥ 320         | +47                  |
| `EXPECTED_PENDING_CLOBBERS`               | 0 (post R4) | 0             | locked               |
| Coverage parity vs `@zalo/opencascade.js` | partial     | **≥**         |                      |

Out-of-scope (no end-state target):

- WebGL / WebGPU rendering bridge — Three.js owns this layer.
- Filesystem persistence (TKBin/TKXml/TKStd) — JS-side `FileContentService` owns this.
- Draw / QA test runner integration — no agentic value.
- Multi-threaded WASM (TBB-style parallelism) — separate architectural concern (`OSD_Parallel.hxx` already filtered).

## Failure-Class Taxonomy (Persistent Reference)

The `F1-F5` taxonomy is the canonical answer to "why is class X not bound?" until the next OCCT major version. Each class is reproducible from the bindgen path.

### F1 — Multi-`TEMPLATE_REF` template alias

**Mechanism**: `using X = Outer<Inner<T>>;` produces ≥ 2 `TEMPLATE_REF` cursors in the libclang AST; the pre-fix `processTemplate` required exactly 1 and rejected with `SkipException`.

**Examples**: `BRepLProp_CLProps`, `BRepLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_SLProps`, `HLRBRep_SLProps`, `BRepLProp_CurveTool`, `GeomLProp_CurveTool`, `GeomLProp_SurfaceTool`.

**Headcount**: 8.

**Fix locus**: [`src/generateBindings.py:162-178`](repos/opencascade.js/src/generateBindings.py) — relax `len() != 1` to `len() == 0`, take first `TEMPLATE_REF` (always outermost in source order). **Already applied in current branch.**

### F2 — Package-level exclusion (intentional binary-size cut)

**Mechanism**: `bindgen-filters.yaml: exclude.packages` short-circuits Phase 1 enumeration for an entire package; no `.cpp` or `.d.ts.json` is emitted.

**Examples (debatable)**: `GeomPlate`, `AppDef`, `ProjLib`, `HeaderSection`.

**Examples (permanent)**: `Graphic3d`, `OpenGl`, `AIS`, `V3d`, `TKBin*`, `TKXml*`, `Draw*`, `TopOpe*`.

**Fix locus**: `bindgen-filters.yaml: exclude.packages`. Per-package decision per [Phase 2-4](#phased-enablement-program).

### F3 — Field-of-struct + non-copyable / nested class qualifier

**Mechanism**: method returns a class type with deleted copy/move ctor, or libclang reports the type without the enclosing class qualifier.

**Examples**: `BRepClass_FaceExplorer`, `BRepBlend_Walking`, `BRepFill_TrimSurfaceTool`, `IntCurveSurface_IntersectionPoint`, `LocOpe_CSIntersector`, `BRepGProp_MeshProps`, `TopOpeBRepBuild_GIter`, `TopOpeBRepDS_Interference`.

**Headcount**: ~15-25.

**Fix locus**: [`src/bindings.py`](repos/opencascade.js/src/bindings.py) RBV / Phase A-prime helpers (`_handleOutputParamElision`, `_processNonCopyableReturn`). Tackle in [Phase 5](#phase-5-misc-compilation-error-sweep-r2-from-prior-stocktake).

### F4 — Non-const lvalue enum reference output param

**Mechanism**: methods like `Bnd_Box::Get(Standard_Real&, …, Standard_Real&)` work because primitive refs are wrapped in `emscripten::val`, but enum refs (`LProp_Status&`, `TopAbs_Orientation&`, `BOPAlgo_GlueEnum&`) hit a missing branch in the wrapper.

**Examples**: `Bnd_Box::Get`, `Bnd_Box2d::Get`, `TopAbs::Compose/Reverse`, `Quantity_Color::Values`, `Message_Messenger::ChangePrinters`, `OSD_Protection::User/System/Group/World`.

**Headcount**: ~25 methods (no whole-class loss).

**Fix locus**: extend `getReferenceValue` / `updateReferenceValue` in [`src/bindings.py`](repos/opencascade.js/src/bindings.py) to treat scoped enums as integers underneath. Tackle in [Phase 1](#phase-1-codegen-surgery--f1--f4-enum-ref--f3-fix-locus-sweep).

### F5 — Visualization / threading / platform header dependencies

**Mechanism**: class `#include`s a symbol from a permanently-excluded package (TKOpenGl, TKThreading); binding stub compiles, link fails with `unresolved external symbol`.

**Examples**: every `AIS_*`, `Graphic3d_*`, `OpenGl_*`, `Prs3d_*`, `Aspect_*`, `WNT_*`, `Cocoa_*`.

**Headcount**: ~85.

**Fix locus**: not fixable without re-enabling the dependent package. **Permanent exclusion.**

## Phased Enablement Program

Each phase is a separate PR with a measurable exit criterion. Phases are ordered by ROI (recovered classes / engineering hour); none depend on later phases.

### Phase 1: Codegen surgery — F1 + F4 enum-ref + F3 fix-locus sweep

**Scope**: ~30 classes recovered + ~25 methods restored.

**Tasks**:

1. F1 fix in `src/generateBindings.py::processTemplate` — **already staged**.
2. Drop `HLRBRep_CLProps` from `bindgen-filters.yaml` explicit excludes (the F1 cascade no longer applies).
3. New smoke test `tests/smoke/smoke-lprops-curvature.test.ts` — sphere mean curvature, cylinder Gaussian curvature, plane umbilic detection.
4. F4 enum-ref wrapper extension in `src/bindings.py` — recovers `Bnd_Box.Get`, `TopAbs.Compose`, `Quantity_Color.Values`, `Message_Messenger.ChangePrinters`.
5. New smoke test `tests/smoke/smoke-enum-ref-output-params.test.ts`.

**Exit criteria**:

- 5 LProps classes (`oc.GeomLProp_SLProps`, `oc.BRepLProp_SLProps`, `oc.HLRBRep_SLProps`, `oc.GeomLProp_CLProps`, `oc.BRepLProp_CLProps`) instantiate.
- Curvature smoke test asserts `MeanCurvature ≈ 1/R` on analytic sphere.
- 3 toolkit utility classes (`oc.GeomLProp_CurveTool`, `oc.BRepLProp_CurveTool`, `oc.GeomLProp_SurfaceTool`) instantiate.
- 25+ enum-ref methods callable from JS without manual `getReferenceValue` plumbing.
- WASM size delta ≤ +50 KB.
- 0 regressions in `pnpm test`, `pnpm typecheck`, `tests/no-clobber-validation.test.ts`.

**Effort**: 1.5 days (F1 already done; F4 enum-ref is the bulk).

### Phase 2: GeomPlate re-enable

**Scope**: 9 classes recovered.

**Tasks**:

1. Remove `- GeomPlate` from `bindgen-filters.yaml: exclude.packages`.
2. Re-enumerate symbols (`scripts/enumerate-symbols.py`).
3. Full rebuild via NX.
4. New smoke test `tests/smoke/smoke-geomplate-fill.test.ts` — build a G1 patch through a triangular wire, assert `IsDone()` and surface bounds.
5. Document the size-cost in `Appendix B` of [`ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md).

**Exit criteria**:

- `oc.GeomPlate_BuildPlateSurface` instantiates and `Perform()` returns IsDone.
- WASM size delta ≤ +500 KB (hard cap; if exceeded, defer with measurement recorded).
- 0 d.ts regressions.

**Effort**: 0.5 day + multi-hour rebuild.

### Phase 3: AppDef public-only re-enable

**Scope**: 6 public classes recovered (24 internals stay excluded).

**Tasks**:

1. Remove `- AppDef` from `exclude.packages`.
2. Add the 24 internal `*OfMy*OfCompute` template-instantiation classes to `exclude.classes` (full list in [`ocjs-removed-bindings-stocktake.md` Recipe R-P3](docs/research/ocjs-removed-bindings-stocktake.md#recipe-r-p3-surgical-appdef-public-only-re-enable-deferred--gated-on-use-case)).
3. New smoke test `tests/smoke/smoke-appdef-multipoint.test.ts` — fit B-spline through `AppDef_MultiLine` of `AppDef_MultiPointConstraint`.

**Exit criteria**:

- `oc.AppDef_BSplineCompute` instantiates and `IsAllApproximated()` returns true on a synthetic point set.
- WASM size delta ≤ +200 KB.
- d.ts surface for `AppDef_*` shows exactly 6 classes.

**Effort**: 1 day + multi-hour rebuild.

**Defer condition**: skip this phase if no consumer use case has surfaced after Phase 2 ships. The facade `GeomAPI_PointsToBSpline*` covers ≥ 95 % of realistic JS callers.

### Phase 4: ProjLib + HeaderSection targeted re-enable

**Scope**: ≤ 4 ProjLib classes + ≤ 2 HeaderSection classes.

**Tasks**:

1. Remove `- ProjLib` and `- HeaderSection` from `exclude.packages`.
2. Identify the precise public classes (`ProjLib_ProjectedCurve`, `ProjLib_CompProjectedCurve`, optionally `ProjLib_ProjectOnPlane`; `HeaderSection_FileSchema`, `HeaderSection_FileDescription`).
3. Add all other classes in those packages to `exclude.classes`.
4. Two new smoke tests covering the public surface.

**Exit criteria**:

- WASM size delta ≤ +200 KB combined.
- 0 link errors.

**Effort**: 1 day + rebuild.

**Defer condition**: same as Phase 3.

### Phase 5: Misc-compilation-error sweep (R2 from prior stocktake)

**Scope**: 10-40 classes recovered from the F3 bucket.

**Tasks** (re-stating R2 from [`occt-unbound-symbols-audit.md`](docs/research/occt-unbound-symbols-audit.md)):

1. Tooling: a batch script `scripts/coverage-sweep.py` that re-adds 10 symbols at a time from `EXPECTED_KNOWN_FAILURES` to `bindgen-filters.yaml: exclude.classes` (i.e. removes them from the exclude), runs `nx run ocjs:compile-bindings` + `link`, and keeps only entries with `validation_passed: true`.
2. For each surviving class, emit a smoke test stub asserting instantiation works (no semantic claim — instantiation is the gate).
3. For each failing class, capture the exact error in a new section of [`ocjs-bindgen-residual-issues-stocktake.md`](docs/research/ocjs-bindgen-residual-issues-stocktake.md).

**Exit criteria**:

- ≥ 10 classes recovered (target 25).
- WASM size delta ≤ +1 MB.
- Each new class has a smoke test asserting basic instantiation.

**Effort**: 2-3 days + multiple rebuild cycles.

## Permanent Exclusions

These are **architecturally locked** and should never be revisited. They are listed here as the canonical "do not re-investigate" set.

| Family                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Reason                                              | Scope         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------- |
| `Graphic3d`, `OpenGl`, `OpenGles`, `Aspect`, `V3d`, `AIS`, `Prs3d`, `PrsDim`, `PrsMgr`, `SelectMgr`, `Select3D`, `Selectbasics`, `StdPrs`, `StdSelect`, `MeshVS`, `Image`, `Font`, `Media`, `Shaders`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Three.js / WebGPU owns rendering                    | ~1300 classes |
| `WNT`, `Cocoa`, `Xw`, `D3DHost*`, `Wasm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Non-WASM platforms                                  | ~30 classes   |
| `TKBin*`, `TKXml*`, `TKStd*`, `BinDrivers`, `XmlDrivers`, `StdDrivers`, `BinObjMgt`, `XmlObjMgt`, `StdObject`, `StdPersistent`, `StdLPersistent`, `StdObjMgt`, `ShapePersistent`, `BinM*`, `XmlM*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | FS persistence is JS concern (`FileContentService`) | ~190 classes  |
| `Draw`, `DDF`, `DDataStd`, `DDocStd`, `DNaming`, `DPrsStd`, `DrawDim`, `DrawTrSurf`, `DrawFairCurve`, `BRepTest`, `BOPTest`, `MeshTest`, `HLRTest`, `GeometryTest`, `GeomliteTest`, `SWDRAW`, `ViewerTest`, `OpenGlTest`, `OpenGlesTest`, `D3DHostTest`, `IVtkDraw`, `IVtkTest`, `TKQADraw`, `QABugs`, `QADNaming`, `QADraw`, `QANCollection`, `XSDRAW*`, `XDEDRAW*`, `TObjDRAW`, `DRAWEXE`, `TKDCAF`, `TKD3DHostTest`, `TKDraw`, `TKIVtkDraw`, `TKMeshVS`, `TKOpenGlTest`, `TKOpenGlesTest`, `TKQADraw`, `TKService`, `TKTopTest`, `TKVCAF`, `TKViewerTest`, `TKXDEDRAW`, `TKXSDRAW*`, `TKD3DHost`, `TKIVtk`, `IVtk`, `IVtkOCC`, `IVtkTools`, `IVtkVTK`, `MeshVS` | Terminal-side test harness, no web equivalent       | ~95 classes   |
| `TopOpeBRep`, `TopOpeBRepBuild`, `TopOpeBRepDS`, `TopOpeBRepTool`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Superseded by `BRepAlgoAPI_*`                       | 130 classes   |
| `XBRepMesh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Naming clash with bound `BRepMesh`                  | 1 class       |

If a future PR proposes re-enabling any of these, this doc is the **proof-of-prior-decision** that should be referenced before the work is approved.

## WASM Size Budget

```
36.47 MB ────┬──── Today (4 548 bindings)
             │
             │  Phase 1: F1 + F4 + F3-light    +  50 KB → 36.52 MB
             │  Phase 2: GeomPlate              + 500 KB → 37.02 MB
             │  Phase 3: AppDef public 6       + 200 KB → 37.22 MB
             │  Phase 4: ProjLib + HeaderSection + 200 KB → 37.42 MB
             │  Phase 5: F3 sweep              + 1.0 MB → 38.42 MB
             ▼
38.5 MB  ──────  Hard ceiling (5 800 bindings, +1 252 vs today)
```

If at any phase the measured Δ exceeds the per-phase cap by ≥ 25 %, the phase is rejected and the measurement is documented in `Appendix B` of the [Stocktake](docs/research/ocjs-removed-bindings-stocktake.md). Cumulative cap MUST hold; phases can be re-ordered but the 38.5 MB ceiling is non-negotiable.

## Continuous Coverage CI Guard

A new NX target `ocjs:coverage-report` (introduced as part of the documentation track below) emits a JSON snapshot per build with:

```json
{
  "schema": 1,
  "occt_sha": "…",
  "bindgen_filters_sha": "…",
  "wasm_bytes": 38243435,
  "dts_lines": 222510,
  "bound_classes": 4548,
  "bound_enums": 412,
  "bound_template_typedefs": 404,
  "missing_symbols": [],
  "extra_compiled_symbols": [...],
  "excluded_packages_count": 142,
  "excluded_classes_count": 222,
  "phase_progress": {
    "phase1_lprops": ["GeomLProp_SLProps", "BRepLProp_SLProps", ...],
    "phase2_geomplate": [],
    "phase3_appdef_public": [],
    "phase4_projlib_headersection": [],
    "phase5_f3_sweep": []
  }
}
```

CI compares the snapshot against the previous main-branch snapshot and **fails the build** when:

- `bound_classes` decreases without an accompanying entry in `bindgen-filters.yaml: deprecated.symbols`.
- `wasm_bytes` increases by > 1 % without a phase-budget annotation.
- A new OCCT release surfaces a class in a non-permanently-excluded package that fails to bind.

This shifts coverage policy from "rebuild and read manually" to "measured invariant".

## Documentation Track

In parallel with the codegen / filter work, a documentation site is shipped to make the bound surface discoverable. See [`docs/research/ocjs-api-documentation-architecture.md`](docs/research/ocjs-api-documentation-architecture.md) (companion blueprint) for the full architecture; the short version:

1. New NX target `ocjs:docs` invokes [`scripts/generate-docs.mjs`](repos/opencascade.js/scripts/generate-docs.mjs) which uses TypeDoc programmatically against `dist/opencascade_full.d.ts` to emit `docs-site/api.json`.
2. Static `docs-site/index.html` is an Alpine.js shell that fetches `api.json` and renders a virtualised, searchable, package-grouped class explorer with method signatures, doxygen comments, and inheritance chains.
3. The site lives in `repos/opencascade.js/docs-site/` and ships alongside the published `@taucad/opencascade.js` artifact for future hosting.

The doc track gates Phase 5 — once the d.ts surface is browseable, surfacing F3 classes individually becomes much cheaper.

## References

- [`docs/research/ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md) — companion per-symbol disposition.
- [`docs/research/occt-unbound-symbols-audit.md`](docs/research/occt-unbound-symbols-audit.md) — the foundational systematic audit (this blueprint distils its R1-R6 into phases).
- [`docs/research/ocjs-bindgen-residual-issues-stocktake.md`](docs/research/ocjs-bindgen-residual-issues-stocktake.md) — R1-R5 implementation reference.
- [`docs/research/ocjs-v8-bindings-remaining-issues.md`](docs/research/ocjs-v8-bindings-remaining-issues.md) — V8 migration delta.
- [`repos/opencascade.js/bindgen-filters.yaml`](repos/opencascade.js/bindgen-filters.yaml) — the lever.
- [`repos/opencascade.js/scripts/enumerate-symbols.py`](repos/opencascade.js/scripts/enumerate-symbols.py) — Phase 1 enumeration.
- [`repos/opencascade.js/src/generateBindings.py`](repos/opencascade.js/src/generateBindings.py) — Phase 2 codegen.
- [`repos/opencascade.js/src/bindings.py`](repos/opencascade.js/src/bindings.py) — RBV / overload-dedup / F4-fix locus.
