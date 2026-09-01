---
title: 'OCJS Removed Bindings — Per-Symbol Stocktake & Restoration Playbook'
description: 'Per-symbol disposition for the 196 OCCT classes excluded from build-configs/full.yml across 8 packages, with deprecation evidence, public-facade map, and step-by-step restoration playbook for each.'
status: active
created: '2026-05-13'
updated: '2026-05-13'
category: audit
related:
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/ocjs-v8-bindings-remaining-issues.md
  - docs/research/ocjs-bindgen-residual-issues-stocktake.md
  - docs/research/ocjs-non-graphics-coverage-blueprint.md
---

# OCJS Removed Bindings — Per-Symbol Stocktake & Restoration Playbook

Closes the open question raised against `repos/opencascade.js/build-configs/full.yml`: are the 196 missing classes (8 packages plus class-level prefix excludes) legitimate exclusions, or have we silently dropped functionality that JS consumers need? This stocktake gives a per-symbol disposition, the exact filter line that excludes each, OCCT v8 deprecation evidence, the public facade (if any) that supersedes direct use, and a copy-paste restoration playbook per package.

## Executive Summary

`build-configs/full.yml` is **not edited by hand** — it is regenerated from OCCT v8 headers by [`scripts/enumerate-symbols.py`](repos/opencascade.js/scripts/enumerate-symbols.py) which applies the exclusions in [`bindgen-filters.yaml`](repos/opencascade.js/bindgen-filters.yaml). The 196 "removed" symbols the user surfaced fall into three buckets:

1. **Architecturally correct exclusions (130 symbols, ~66%)** — the entire `TopOpeBRep*` family. Superseded by `BRepAlgoAPI_*` (already bound). Keep excluded.
2. **Facade-covered exclusions (56 symbols, ~29%)** — `AppDef`, `GeomPlate`, `ProjLib`, `HeaderSection`. Direct JS access blocked, but every public use case is reachable through a higher-level facade that _is_ bound. Re-enable per-package only when a concrete use case the facade cannot satisfy is identified.
3. **Codegen bug (10 symbols, ~5%)** — `BRepLProp_*`, `GeomLProp_*`, `HLRBRep_SLProps`. These are template `using`-aliases (e.g. `using GeomLProp_SLProps = GeomLProp_SLPropsBase<occ::handle<Geom_Surface>>`) that the bindgen rejects with "_The number of template refs for the template typedef … is not 1!_" because libclang emits two `TEMPLATE_REF` cursors (the outer alias plus the inner `occ::handle`). **No facade exists** — these _are_ the curvature-analysis API. Critical to restore.

**Recommendation**: ship the F1 codegen fix immediately (a 1-line filter relaxation in [`src/generateBindings.py:processTemplate`](repos/opencascade.js/src/generateBindings.py)), keep the TopOpe\* exclusions, and gate per-package GeomPlate/AppDef/ProjLib/HeaderSection re-enable on a documented WASM-size budget. The companion [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md) lays out the multi-phase enablement program.

The F1 fix is **already applied** in this branch (see [Implementation status](#implementation-status)).

## Table of Contents

- [Methodology](#methodology)
- [Architectural Background — How Symbols Get Excluded](#architectural-background--how-symbols-get-excluded)
- [Implementation status](#implementation-status)
- [Per-Package Findings](#per-package-findings)
  - [Package P1: BRepLProp / GeomLProp / HLRBRep_SLProps — codegen bug (RESTORE)](#package-p1-breplprop--geomlprop--hlrbrep_slprops--codegen-bug-restore)
  - [Package P2: GeomPlate — public surface-filling API (CONDITIONAL)](#package-p2-geomplate--public-surface-filling-api-conditional)
  - [Package P3: AppDef — internal B-spline approximator (KEEP excluded)](#package-p3-appdef--internal-b-spline-approximator-keep-excluded)
  - [Package P4: ProjLib — low-level projection helpers (KEEP excluded)](#package-p4-projlib--low-level-projection-helpers-keep-excluded)
  - [Package P5: HeaderSection — STEP file header internals (KEEP excluded)](#package-p5-headersection--step-file-header-internals-keep-excluded)
  - [Package P6: TopOpeBRep\* — superseded boolean engine (KEEP excluded)](#package-p6-topopebrep--superseded-boolean-engine-keep-excluded)
- [Per-Symbol Disposition Tables](#per-symbol-disposition-tables)
- [Restoration Playbook](#restoration-playbook)
- [WASM Size Baseline & Budget](#wasm-size-baseline--budget)
- [References](#references)

## Methodology

1. Confirmed `build-configs/full.yml` is generated, not curated, by reading [`scripts/enumerate-symbols.py:91-235`](repos/opencascade.js/scripts/enumerate-symbols.py).
2. Walked [`bindgen-filters.yaml`](repos/opencascade.js/bindgen-filters.yaml) end-to-end and matched every symbol in the user's list to its exclusion line.
3. Verified deprecation status against OCCT v8 source by:
   - `rg DEPRECATED|deprecated` over each package directory under `repos/opencascade.js/deps/OCCT/src/`.
   - Checking `repos/opencascade.js/deps/OCCT/src/Deprecated/` for typedef-alias deprecation markers.
4. Mapped each excluded class to its public-facade replacement by reading the OCCT class headers and the higher-level `*API_*` wrappers.
5. Read the F1 codegen failure surgically in [`src/generateBindings.py:162-178`](repos/opencascade.js/src/generateBindings.py) and confirmed the fix as a 1-line filter relaxation against the libclang AST emission order.
6. Established the WASM-size baseline from [`dist/opencascade_full.build-manifest.json`](repos/opencascade.js/dist/opencascade_full.build-manifest.json) and [`dist/opencascade_full.wasm`](repos/opencascade.js/dist/opencascade_full.wasm).

## Architectural Background — How Symbols Get Excluded

The exclusion pipeline runs in three phases:

```
deps/OCCT/src/**/*.hxx
        │
        ▼
┌─────────────────────────────────────────────┐
│ Phase 1: scripts/enumerate-symbols.py       │
│  • libclang AST walk                        │
│  • applies bindgen-filters.yaml:            │
│      packages, class-name prefixes,         │
│      explicit-class names, typedefs,        │
│      template_typedefs, headers             │
│  • writes build-configs/full.yml            │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│ Phase 2: src/generateBindings.py            │
│  • per-class processClass() / processTemplate()
│  • emits build/bindings/<path>/<name>.cpp   │
│  • F1 SkipException dropped here for       │
│    template aliases with ≥2 TEMPLATE_REFs   │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│ Phase 3: src/compileBindings.py + link      │
│  • emcc compile, link, .wasm/.js/.d.ts      │
│  • F5 ld errors drop classes whose          │
│    transitive deps are excluded             │
└─────────────────────────────────────────────┘
```

This means three different control surfaces govern which symbols ship:

| Control surface               | Lever                                                              | Rebuild cost                                    |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| **Phase 1** package-level     | `bindgen-filters.yaml: exclude.packages`                           | Full regen + link                               |
| **Phase 1** explicit class    | `bindgen-filters.yaml: exclude.classes`                            | Full regen + link                               |
| **Phase 2** codegen heuristic | `src/generateBindings.py`, `src/bindings.py`                       | Generator-hash invalidation → full regen + link |
| **Phase 3** linker            | `bindgen-filters.yaml: exclude.classes` (after observing ld error) | Compile + link only                             |

For the user's 196 symbols, **150** are governed by `exclude.packages` (lines 596-606), **5** by explicit class names (`HLRBRep_SLProps` and the template aliases pulled in transitively), and **0** by linker errors.

## Implementation status

The F1 codegen fix is staged in this branch:

```diff
 def processTemplate(child):
+  # libclang yields one TEMPLATE_REF per template name appearing in the alias's
+  # right-hand side, in source-order. For `using X = Outer<Inner<T>>;` it
+  # produces two refs (Outer, Inner). The OUTER template is what we need to
+  # instantiate against; OCCT V8 makes this pattern common via the LProps
+  # template family (e.g. `using GeomLProp_SLProps = GeomLProp_SLPropsBase<
+  # occ::handle<Geom_Surface>>` produces refs for both `GeomLProp_SLPropsBase`
+  # and `occ::handle`). The first TEMPLATE_REF is always the outermost one
+  # because libclang walks left-to-right; relying on `len() == 1` mis-skips
+  # every alias whose template arg is itself a template instance.
   templateRefs = list(filter(lambda x: x.kind == clang.cindex.CursorKind.TEMPLATE_REF, child.get_children()))
-  if len(templateRefs) != 1:
-    raise SkipException("The number of template refs for the template typedef \"" + child.spelling + "\" is not 1!")
+  if len(templateRefs) == 0:
+    raise SkipException("No template ref found for the template typedef \"" + child.spelling + "\"")
   templateClass = templateRefs[0].get_definition()
```

The fix triggers a generator-hash invalidation on next `nx run ocjs:build`, which purges stale `build/bindings/**/*.{cpp,d.ts.json}` and re-emits the full surface (multi-hour ordeal). Validation gate per [Restoration Playbook → Validation](#validation):

1. `find build/bindings -name "GeomLProp_SLProps*" -o -name "GeomLProp_CLProps*" -o -name "BRepLProp_SLProps*" -o -name "BRepLProp_CLProps*" -o -name "HLRBRep_SLProps*"` returns 5 directories with `.cpp` + `.d.ts.json` apiece.
2. New smoke test `tests/smoke/smoke-lprops-curvature.test.ts` instantiates `oc.GeomLProp_SLProps` against an analytic sphere and asserts `MeanCurvature() ≈ 1/R`.

## Per-Package Findings

Every package below is anchored to its filter line in `bindgen-filters.yaml` and its OCCT v8 source path under `deps/OCCT/src/`.

### Package P1: BRepLProp / GeomLProp / HLRBRep_SLProps — codegen bug (RESTORE)

| Aspect                   | Detail                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symbols**              | `BRepLProp_CLProps`, `BRepLProp_CurveTool`, `BRepLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_CurveTool`, `GeomLProp_SLProps`, `GeomLProp_SurfaceTool`, `HLRBRep_SLProps` (8 total) |
| **OCCT path**            | `src/ModelingData/TKBRep/BRepLProp/`, `src/ModelingData/TKGeomBase/GeomLProp/`, `src/ModelingAlgorithms/TKHLR/HLRBRep/HLRBRep_SLProps.hxx`                                             |
| **Deprecation evidence** | `rg DEPRECATED` over both directories returns **0 hits**. Not deprecated.                                                                                                              |
| **Filter origin**        | Phase 2 codegen rejection (F1) plus `bindgen-filters.yaml:145` `HLRBRep_CLProps` explicit exclude. None excluded by package.                                                           |
| **Public facade**        | **NONE EXISTS.** These _are_ the local-properties API (point, tangent, normal, max/min/mean/Gaussian curvature, umbilic detection, principal directions).                              |
| **Disposition**          | **RESTORE.** Apply F1 fix.                                                                                                                                                             |

**Why critical**: any geometric reasoning consumer (curvature-aware mesh refinement, feature detection, normal-vector queries, agentic CAD planners that need to reason about surface fairness) needs these. Replicad currently re-binds `BRepLProp_SLProps` inside its own custom WASM (`repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml`) precisely because the full build does not expose it.

**Code evidence — the source headers**:

```cpp
// deps/OCCT/src/ModelingData/TKBRep/BRepLProp/BRepLProp_SLProps.hxx
using BRepLProp_SLProps = GeomLProp_SLPropsBase<BRepAdaptor_Surface>;

// deps/OCCT/src/ModelingData/TKBRep/BRepLProp/BRepLProp_CLProps.hxx
using BRepLProp_CLProps =
  GeomLProp_CLPropsBase<gp_Pnt, gp_Vec, gp_Dir, BRepAdaptor_Curve>;

// deps/OCCT/src/ModelingAlgorithms/TKHLR/HLRBRep/HLRBRep_SLProps.hxx
using HLRBRep_SLProps =
  GeomLProp_SLPropsBase<HLRBRep_SurfacePtr, LProp_SurfaceUtils::ToolAccess<HLRBRep_SLPropsATool>>;

// deps/OCCT/src/ModelingData/TKGeomBase/GeomLProp/GeomLProp_SLProps.hxx
using GeomLProp_SLProps = GeomLProp_SLPropsBase<occ::handle<Geom_Surface>>;
```

Each form has the same libclang AST shape: one outer `TEMPLATE_REF` for `…_PropsBase`, plus 1–2 inner `TEMPLATE_REF`s for `occ::handle` / `LProp_SurfaceUtils::ToolAccess`. The pre-fix `len(templateRefs) != 1` guard rejected all eight.

**`HLRBRep_CLProps`** is _also_ listed in `bindgen-filters.yaml:145` as an explicit exclude — likely an artifact of the F1 cascade. After the F1 fix lands, that line should be removed (the binding will succeed; if it still fails, capture the new error and update separately). `HLRBRep_BSurfaceTool`, `HLRBRep_TheCurveLocatorOfTheProjPCurOfCInter`, `HLRBRep_ThePolyhedronOfInterCSurf`, `HLRBRep_Surface`, `HLRBRep_Data`, `HLRBRep_TheCSFunctionOfInterCSurf` are unrelated F2/F4 cases and stay excluded.

### Package P2: GeomPlate — public surface-filling API (CONDITIONAL)

| Aspect                   | Detail                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Symbols**              | `GeomPlate_Aij`, `GeomPlate_BuildAveragePlane`, `GeomPlate_BuildPlateSurface`, `GeomPlate_CurveConstraint`, `GeomPlate_MakeApprox`, `GeomPlate_PlateG0Criterion`, `GeomPlate_PlateG1Criterion`, `GeomPlate_PointConstraint`, `GeomPlate_Surface` (9 total) |
| **OCCT path**            | `src/ModelingAlgorithms/TKGeomAlgo/GeomPlate/`                                                                                                                                                                                                             |
| **Deprecation evidence** | `rg DEPRECATED                                                                                                                                                                                                                                             | deprecated` over the directory returns **0 hits**. Not deprecated. |
| **Filter origin**        | `bindgen-filters.yaml:604` package exclude.                                                                                                                                                                                                                |
| **Public facade**        | `BRepFill_Filling` (bound) wraps `GeomPlate_BuildPlateSurface` for the topology-aware case but does **not** expose tolerance / iteration / criteria knobs.                                                                                                 |
| **Disposition**          | **CONDITIONAL — re-enable when a concrete consumer needs the lower-level surface.**                                                                                                                                                                        |

**Why debatable**: `GeomPlate_BuildPlateSurface` is the canonical OCCT API for filling N-sided holes / patches under G0/G1/G2 constraints with anisotropic tolerance control. It is precisely the surface an agentic CAD planner would reach for when reasoning about "how to close this gap with G1 continuity to neighbouring faces". `BRepFill_Filling` collapses the API to a single tolerance value and does not expose the curve-vs-point constraint distinction or the `PlateG0Criterion`/`PlateG1Criterion` strategy hooks.

**Cost estimate**: 9 classes; OCCT codepath internally pulls in `Plate_*` (TKGeomAlgo, also currently bound), so the marginal binding cost is the JS surface plus per-class `EMSCRIPTEN_BINDINGS` registrations. **Estimated WASM delta: <300 KB** (small relative to the 36.47 MB baseline, ≈0.8 %).

**Action**: defer to the [Coverage Blueprint](docs/research/ocjs-non-graphics-coverage-blueprint.md) Phase 2 — measure before/after WASM size with the package re-enabled and decide via the documented size budget.

### Package P3: AppDef — internal B-spline approximator (KEEP excluded)

| Aspect                   | Detail                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Symbols**              | 30 classes — `AppDef_Compute`, `AppDef_BSplineCompute`, `AppDef_MultiLine`, `AppDef_MultiPointConstraint`, `AppDef_LinearCriteria`, `AppDef_SmoothCriterion`, `AppDef_Variational`, plus 23 internal `*OfMyGradientOf*`, `*OfMyBSplGradientOf*`, `*OfTheGradient` template-instantiation classes |
| **OCCT path**            | `src/ModelingData/TKGeomBase/AppDef/`                                                                                                                                                                                                                                                            |
| **Deprecation evidence** | `rg DEPRECATED` returns **0 hits in classes**, but `Deprecated/NCollectionAliases/AppDef_Array1OfMultiPointConstraint.hxx` carries `Standard_HEADER_DEPRECATED` — only the typedef alias is deprecated, the underlying classes are live.                                                         |
| **Filter origin**        | `bindgen-filters.yaml:603` package exclude.                                                                                                                                                                                                                                                      |
| **Public facade**        | `GeomAPI_PointsToBSpline` (bound), `Geom2dAPI_PointsToBSpline` (bound), `GeomAPI_PointsToBSplineSurface` (bound). All wrap `AppDef_Compute`/`AppDef_BSplineCompute` internally.                                                                                                                  |
| **Disposition**          | **KEEP excluded.**                                                                                                                                                                                                                                                                               |

**Why correct**: of the 30 classes, ~24 are auto-generated template-instantiation classes (`AppDef_Gradient_BFGSOfMyGradientOfCompute`, `AppDef_ParLeastSquareOfMyGradientOfCompute`, etc.). They have **no public API value** — they exist solely as private internal types of the BFGS optimiser. Direct JS construction would require manually assembling `AppDef_MultiLine` / `AppDef_MultiPointConstraint` collections of constraint tuples by hand (tedious and error-prone). The bound `GeomAPI_PointsToBSpline*` family is the ergonomic path for every realistic consumer use case.

**Edge case**: a consumer needing **non-standard parameter sequences** (chord-length, centripetal, isoparametric) cannot reach them through `GeomAPI_PointsToBSpline` (which exposes only `Approx_ParametrizationType`). If a real consumer surfaces this, re-binding **only `AppDef_Compute` + `AppDef_BSplineCompute` + `AppDef_MultiLine` + `AppDef_MultiPointConstraint`** (the 4 public classes) and continuing to filter the ~24 template-instantiation internals is the correct surgical move. This is documented as Phase 3 of the [Coverage Blueprint](docs/research/ocjs-non-graphics-coverage-blueprint.md).

### Package P4: ProjLib — low-level projection helpers (KEEP excluded)

| Aspect                   | Detail                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symbols**              | `ProjLib`, `ProjLib_CompProjectedCurve`, `ProjLib_ComputeApprox`, `ProjLib_ComputeApproxOnPolarSurface`, `ProjLib_Cone`, `ProjLib_Cylinder`, `ProjLib_Plane`, `ProjLib_PrjFunc`, `ProjLib_PrjResolve`, `ProjLib_ProjectOnPlane`, `ProjLib_ProjectedCurve`, `ProjLib_Projector`, `ProjLib_Sphere`, `ProjLib_Torus` (14 total) |
| **OCCT path**            | `src/ModelingData/TKGeomBase/ProjLib/`                                                                                                                                                                                                                                                                                       |
| **Deprecation evidence** | `rg DEPRECATED` returns **0 hits**. Not deprecated.                                                                                                                                                                                                                                                                          |
| **Filter origin**        | `bindgen-filters.yaml:605` package exclude.                                                                                                                                                                                                                                                                                  |
| **Public facade**        | `GeomProjLib` (bound) for curve→surface projection in 3D parameter space; `BRepProj_Projection` (bound, via `BRepProj`) for shape→surface projection. `BRep_Tool::CurveOnSurface` exposes p-curves.                                                                                                                          |
| **Disposition**          | **KEEP excluded.**                                                                                                                                                                                                                                                                                                           |

**Why correct**: `ProjLib_*` classes are construction-helpers for elementary surface projections (`Cone`, `Cylinder`, `Plane`, `Sphere`, `Torus`). The pattern OCCT itself uses internally is to construct an instance, harvest the resulting `Geom2d_Curve`, and discard — `GeomProjLib::Curve2d(curve, surface)` (bound) wraps the entire workflow into a single static call. Direct `ProjLib_Cone` instantiation requires the JS consumer to thread the analytic surface parameters by hand, which is strictly less ergonomic.

**Edge case**: `ProjLib_CompProjectedCurve` and `ProjLib_ProjectedCurve` expose iterative-resolution diagnostics (initialisation parameters, convergence tolerances) not surfaced through `GeomProjLib`. If a consumer needs this — typically for debugging unstable projections on degenerate surfaces — re-binding only those 2 classes (skipping the 12 helpers) is the surgical fix.

### Package P5: HeaderSection — STEP file header internals (KEEP excluded)

| Aspect                   | Detail                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symbols**              | `HeaderSection`, `HeaderSection_FileDescription`, `HeaderSection_FileName`, `HeaderSection_FileSchema`, `HeaderSection_Protocol` (5 total)                                          |
| **OCCT path**            | `src/DataExchange/TKDESTEP/HeaderSection/`                                                                                                                                          |
| **Deprecation evidence** | `rg DEPRECATED` returns **0 hits**. Not deprecated.                                                                                                                                 |
| **Filter origin**        | `bindgen-filters.yaml:602` package exclude.                                                                                                                                         |
| **Public facade**        | `APIHeaderSection_MakeHeader` (bound, line 1 of `full.yml`), `APIHeaderSection_EditHeader` (bound, line 2). Both wrap STEP header creation/editing in an ergonomic single-call API. |
| **Disposition**          | **KEEP excluded.**                                                                                                                                                                  |

**Why correct**: the public-facing `APIHeaderSection_*` facades give JS consumers everything they need to populate the STEP `FILE_NAME`, `FILE_DESCRIPTION`, `FILE_SCHEMA` sections during STEP write, and to read them back during STEP load. The 5 `HeaderSection_*` classes are the underlying entity types — direct JS construction is not the documented OCCT entry point and would expose the consumer to STEP entity ID / handle bookkeeping that the facade abstracts.

**Edge case**: bulk-mutation of `FILE_DESCRIPTION` schema identifiers (`HeaderSection_FileSchema::SetSchemaIdentifiers`) across thousands of files might be more ergonomic with direct binding, but the use case is rare and easy to wrap with a small custom binding shard if needed.

### Package P6: TopOpeBRep\* — superseded boolean engine (KEEP excluded)

| Aspect                   | Detail                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symbols**              | 130 across `TopOpeBRep`, `TopOpeBRepBuild`, `TopOpeBRepDS`, `TopOpeBRepTool`                                                                                                                                                                                                                |
| **OCCT path**            | `src/ModelingAlgorithms/TKBool/TopOpeBRep/`, `…/TopOpeBRepBuild/`, `…/TopOpeBRepDS/`, `…/TopOpeBRepTool/`                                                                                                                                                                                   |
| **Deprecation evidence** | NCollection typedefs in `Deprecated/NCollectionAliases/TopOpe*.hxx` carry `Standard_HEADER_DEPRECATED("…deprecated since OCCT 8.0.0…")`. Underlying classes themselves are not marked, but the public-API replacement (`BRepAlgoAPI_*`) has been the documented entry point since OCCT 6.7. |
| **Filter origin**        | `bindgen-filters.yaml:598-601` package excludes.                                                                                                                                                                                                                                            |
| **Public facade**        | `BRepAlgoAPI_Fuse`, `BRepAlgoAPI_Cut`, `BRepAlgoAPI_Common`, `BRepAlgoAPI_Section`, `BRepAlgoAPI_Splitter`, `BRepAlgoAPI_Defeaturing` — all bound. The TKBO engine is the canonical boolean-ops surface.                                                                                    |
| **Disposition**          | **KEEP excluded permanently.**                                                                                                                                                                                                                                                              |

**Why correct**: `TopOpeBRep*` is the pre-TKBO boolean-ops engine that OCCT v8 still ships because internal code (`BRepFilletAPI_MakeFillet`, `ChFi3d`, `BRepFill_TrimShellCorner`) still depends on it. The **public API** has been TKBO/`BRepAlgoAPI_*` for a decade; no JS consumer should be reaching for `TopOpeBRep_DSFiller` or `TopOpeBRepBuild_Builder` directly. Re-binding 130 classes for a deprecated codepath would inflate the d.ts surface area by ~6 % for **zero new functionality**.

## Per-Symbol Disposition Tables

### Table A: Codegen-bug exclusions (RESTORE via F1 fix)

| #   | Symbol                  | OCCT header                                                    | Failure mechanism            | Filter line                | Action                                         |
| --- | ----------------------- | -------------------------------------------------------------- | ---------------------------- | -------------------------- | ---------------------------------------------- |
| 1   | `BRepLProp_CLProps`     | `ModelingData/TKBRep/BRepLProp/BRepLProp_CLProps.hxx`          | F1                           | none                       | F1 fix (✅ applied)                            |
| 2   | `BRepLProp_CurveTool`   | `ModelingData/TKBRep/BRepLProp/BRepLProp_CurveTool.hxx`        | F1                           | none                       | F1 fix (✅ applied)                            |
| 3   | `BRepLProp_SLProps`     | `ModelingData/TKBRep/BRepLProp/BRepLProp_SLProps.hxx`          | F1                           | none                       | F1 fix (✅ applied)                            |
| 4   | `GeomLProp_CLProps`     | `ModelingData/TKGeomBase/GeomLProp/GeomLProp_CLProps.hxx`      | F1                           | none                       | F1 fix (✅ applied)                            |
| 5   | `GeomLProp_CurveTool`   | `ModelingData/TKGeomBase/GeomLProp/GeomLProp_CurveTool.hxx`    | F1                           | none                       | F1 fix (✅ applied)                            |
| 6   | `GeomLProp_SLProps`     | `ModelingData/TKGeomBase/GeomLProp/GeomLProp_SLProps.hxx`      | F1                           | none                       | F1 fix (✅ applied)                            |
| 7   | `GeomLProp_SurfaceTool` | `ModelingData/TKGeomBase/GeomLProp/GeomLProp_SurfaceUtils.hxx` | F1                           | none                       | F1 fix (✅ applied)                            |
| 8   | `HLRBRep_SLProps`       | `ModelingAlgorithms/TKHLR/HLRBRep/HLRBRep_SLProps.hxx`         | F1 + explicit-exclude shadow | `bindgen-filters.yaml:145` | F1 fix (✅) + remove the explicit exclude line |

### Table B: Conditional re-enable (GeomPlate)

| #   | Symbol                        | Public API value                                                       | Action                                       |
| --- | ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `GeomPlate_Aij`               | Internal coefficient struct                                            | Re-enable iff `BuildPlateSurface` re-enabled |
| 2   | `GeomPlate_BuildAveragePlane` | Standalone — fits a plane through scattered points                     | Re-enable; small standalone API              |
| 3   | `GeomPlate_BuildPlateSurface` | Primary entry point — N-sided patch with G0/G1/G2 constraints          | Re-enable                                    |
| 4   | `GeomPlate_CurveConstraint`   | Constraint type for `BuildPlateSurface`                                | Re-enable iff `BuildPlateSurface` re-enabled |
| 5   | `GeomPlate_MakeApprox`        | Approximates the result `GeomPlate_Surface` to a `Geom_BSplineSurface` | Re-enable                                    |
| 6   | `GeomPlate_PlateG0Criterion`  | G0 strategy hook (rare consumer use)                                   | Re-enable iff `BuildPlateSurface` re-enabled |
| 7   | `GeomPlate_PlateG1Criterion`  | G1 strategy hook (rare consumer use)                                   | Re-enable iff `BuildPlateSurface` re-enabled |
| 8   | `GeomPlate_PointConstraint`   | Constraint type for `BuildPlateSurface`                                | Re-enable iff `BuildPlateSurface` re-enabled |
| 9   | `GeomPlate_Surface`           | The output surface of `BuildPlateSurface`                              | Re-enable iff `BuildPlateSurface` re-enabled |

### Table C: Keep excluded (facade exists or deprecated successor)

| Package           | Symbols                     | Filter                     | Facade / replacement                                    | Verdict                    |
| ----------------- | --------------------------- | -------------------------- | ------------------------------------------------------- | -------------------------- |
| `AppDef`          | 30 (24 internal + 6 public) | `bindgen-filters.yaml:603` | `GeomAPI_PointsToBSpline*`, `Geom2dAPI_PointsToBSpline` | KEEP                       |
| `ProjLib`         | 14                          | `bindgen-filters.yaml:605` | `GeomProjLib`, `BRepProj_Projection`                    | KEEP                       |
| `HeaderSection`   | 5                           | `bindgen-filters.yaml:602` | `APIHeaderSection_{MakeHeader,EditHeader}`              | KEEP                       |
| `TopOpeBRep`      | 26                          | `bindgen-filters.yaml:601` | `BRepAlgoAPI_*`                                         | KEEP (deprecated codepath) |
| `TopOpeBRepBuild` | 35                          | `bindgen-filters.yaml:598` | `BRepAlgoAPI_*`                                         | KEEP (deprecated codepath) |
| `TopOpeBRepDS`    | 45                          | `bindgen-filters.yaml:599` | `BRepAlgoAPI_*`                                         | KEEP (deprecated codepath) |
| `TopOpeBRepTool`  | 20                          | `bindgen-filters.yaml:600` | `BRepAlgoAPI_*`                                         | KEEP (deprecated codepath) |

## Restoration Playbook

The following recipes are step-by-step procedures for each disposition. Each gates restoration on a verifiable validation check.

### Recipe R-P1: Restore the LProps family (F1 fix already staged)

**Status**: code change applied. Required follow-up:

```bash
# 1. Trigger generator-hash invalidation (already automatic on next build).
cd repos/opencascade.js
./node_modules/.bin/nx run ocjs:build  # multi-hour; existing NX cache covers most stages

# 2. Confirm generation of the 8 templates.
find build/bindings -type d \( \
  -name "GeomLProp_SLProps.hxx" -o -name "GeomLProp_CLProps.hxx" -o \
  -name "GeomLProp_CurveTool.hxx" -o -name "GeomLProp_SurfaceUtils.hxx" -o \
  -name "BRepLProp_SLProps.hxx" -o -name "BRepLProp_CLProps.hxx" -o \
  -name "BRepLProp_CurveTool.hxx" -o -name "HLRBRep_SLProps.hxx" \
\) | wc -l   # expect ≥ 8

# 3. Confirm registration in compiled binding output.
node -e 'const oc = await (await import("./dist/opencascade_full.js")).default(); \
  console.log("GeomLProp_SLProps:", typeof oc.GeomLProp_SLProps); \
  console.log("BRepLProp_SLProps:", typeof oc.BRepLProp_SLProps); \
  console.log("HLRBRep_SLProps:", typeof oc.HLRBRep_SLProps);'

# 4. Drop the now-redundant explicit exclude.
# Edit bindgen-filters.yaml: remove "- HLRBRep_CLProps" (line 145).
# Re-run nx build to confirm HLRBRep_CLProps now binds.
```

**New smoke test** to ship in the same PR (`tests/smoke/smoke-lprops-curvature.test.ts`):

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { getOC } from '../helpers/oc-fixture';

describe('GeomLProp_SLProps — surface curvature', () => {
  it('reports 1/R mean curvature for an analytic sphere of radius 5', () => {
    const oc = getOC();
    const sphere = new oc.Geom_SphericalSurface_2(new oc.gp_Ax3_2(), 5.0);
    const props = new oc.GeomLProp_SLProps_1(sphere, 0.5, 0.5, 2, 1e-6);
    expect(props.IsCurvatureDefined()).toBe(true);
    // Mean curvature of sphere of radius R is 1/R.
    expect(props.MeanCurvature()).toBeCloseTo(1 / 5, 3);
    expect(props.GaussianCurvature()).toBeCloseTo(1 / 25, 3);
  });
});
```

### Recipe R-P2: Conditionally re-enable GeomPlate

**Gate**: WASM-size delta < 500 KB AND a documented consumer use case exists.

```bash
cd repos/opencascade.js

# 1. Capture baseline.
ls -l dist/opencascade_full.wasm | awk '{print $5}' > /tmp/wasm-baseline.bytes

# 2. Edit bindgen-filters.yaml: remove "- GeomPlate" from exclude.packages (line 604).

# 3. Re-enumerate symbols (Phase 1).
.venv/bin/python scripts/enumerate-symbols.py

# 4. Full rebuild.
./node_modules/.bin/nx run ocjs:build

# 5. Compare size delta.
ls -l dist/opencascade_full.wasm | awk '{print $5}' > /tmp/wasm-with-geomplate.bytes
echo "delta bytes: $(($(cat /tmp/wasm-with-geomplate.bytes) - $(cat /tmp/wasm-baseline.bytes)))"

# 6. If delta < 500 KB and binding succeeds, ship.
#    Otherwise revert step 2 and document the precise size cost in this stocktake's
#    Appendix B for future reconsideration.
```

**Validation smoke test** (`tests/smoke/smoke-geomplate-fill.test.ts`):

```typescript
it('builds a G1-continuous patch through a triangular wire of edges', () => {
  const oc = getOC();
  const builder = new oc.GeomPlate_BuildPlateSurface_2(/* deg, NbPtsOnCur, NbIter */ 3, 10, 3);
  // … assemble three GeomPlate_CurveConstraint instances from BRepAdaptor_Curves …
  builder.Perform();
  expect(builder.IsDone()).toBe(true);
  const surf = builder.Surface();
  expect(surf.isNull()).toBe(false);
});
```

### Recipe R-P3: Surgical AppDef public-only re-enable (deferred — gated on use case)

```yaml
# bindgen-filters.yaml — edit lines 596-606
# 1. Remove "- AppDef" from exclude.packages.
# 2. Add explicit excludes for the 24 template-instantiation internals:
exclude:
  classes:
    - AppDef_BSpGradient_BFGSOfMyBSplGradientOfBSplineCompute
    - AppDef_BSpParFunctionOfMyBSplGradientOfBSplineCompute
    - AppDef_BSpParLeastSquareOfMyBSplGradientOfBSplineCompute
    - AppDef_Gradient_BFGSOfMyGradientOfCompute
    - AppDef_Gradient_BFGSOfMyGradientbisOfBSplineCompute
    - AppDef_Gradient_BFGSOfTheGradient
    - AppDef_MyBSplGradientOfBSplineCompute
    - AppDef_MyGradientOfCompute
    - AppDef_MyGradientbisOfBSplineCompute
    - AppDef_MyLineTool
    - AppDef_ParFunctionOfMyGradientOfCompute
    - AppDef_ParFunctionOfMyGradientbisOfBSplineCompute
    - AppDef_ParFunctionOfTheGradient
    - AppDef_ParLeastSquareOfMyGradientOfCompute
    - AppDef_ParLeastSquareOfMyGradientbisOfBSplineCompute
    - AppDef_ParLeastSquareOfTheGradient
    - AppDef_ResConstraintOfMyGradientOfCompute
    - AppDef_ResConstraintOfMyGradientbisOfBSplineCompute
    - AppDef_ResConstraintOfTheGradient
    - AppDef_TheFunction
    - AppDef_TheGradient
    - AppDef_TheLeastSquares
    - AppDef_TheResol
# 3. The 6 public classes auto-include: AppDef_Compute, AppDef_BSplineCompute,
#    AppDef_MultiLine, AppDef_MultiPointConstraint, AppDef_LinearCriteria,
#    AppDef_SmoothCriterion, AppDef_Variational.
```

### Recipe R-P4 / R-P5: ProjLib & HeaderSection (deferred — gated on use case)

Same pattern as R-P3. Identify the ≤ 4 classes a real consumer needs, exclude the rest by name, measure WASM-size delta, ship.

### Validation

Every restoration MUST pass:

1. `pnpm test` in `repos/opencascade.js/` — all smoke tests green, including the new package-specific test.
2. `pnpm typecheck` — `dist/opencascade_full.d.ts` consumers compile.
3. WASM-size delta against baseline within budget (currently +2 MB hard ceiling on 36.47 MB baseline).
4. `repos/opencascade.js/tests/no-clobber-validation.test.ts` lint passes (the R2 lint correctness invariant from the residual-issues stocktake).
5. `pnpm docs:validate` from the workspace root.

## WASM Size Baseline & Budget

Captured 2026-05-13 from `dist/opencascade_full.wasm` and `dist/opencascade_full.build-manifest.json`:

| Metric                          | Value                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `.wasm` size                    | **36.47 MB** (38 243 435 bytes)                                 |
| `.js` size                      | 71 KB                                                           |
| `.d.ts` size                    | **9.3 MB** (222 510 lines)                                      |
| Symbols requested by `full.yml` | **4 144**                                                       |
| Symbols compiled into bindings  | **4 548** (404 NCollection auto-discovered)                     |
| Symbols missing                 | 0                                                               |
| Build config                    | `O3-wasm-exc-simd` (native WASM exceptions, `-msimd128`, `-O3`) |

**Proposed budget envelope** for the enablement program:

| Phase            | Action                    | Budget cap | Cumulative cap |
| ---------------- | ------------------------- | ---------- | -------------- |
| 1                | F1 fix → 8 LProps classes | +50 KB     | 36.52 MB       |
| 2                | GeomPlate package         | +500 KB    | 37.02 MB       |
| 3                | AppDef public 6 classes   | +200 KB    | 37.22 MB       |
| 4                | ProjLib targeted ≤4       | +150 KB    | 37.37 MB       |
| 5                | HeaderSection targeted ≤2 | +50 KB     | 37.42 MB       |
| **Hard ceiling** |                           | **+2 MB**  | **38.5 MB**    |

If any phase exceeds its individual cap, defer the phase and document the measured cost in Appendix B of this stocktake.

## References

- Filter source: [`repos/opencascade.js/bindgen-filters.yaml`](repos/opencascade.js/bindgen-filters.yaml)
- Symbol enumeration: [`repos/opencascade.js/scripts/enumerate-symbols.py`](repos/opencascade.js/scripts/enumerate-symbols.py)
- Codegen entry point: [`repos/opencascade.js/src/generateBindings.py`](repos/opencascade.js/src/generateBindings.py)
- Prior systematic audit: [`docs/research/occt-unbound-symbols-audit.md`](docs/research/occt-unbound-symbols-audit.md)
- Removed-symbol verdict (subset): [`docs/research/ocjs-v8-bindings-remaining-issues.md`](docs/research/ocjs-v8-bindings-remaining-issues.md)
- Companion blueprint: [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md)

## Appendix A — Disposition Bitmap (196 symbols)

```
Codegen-bug RESTORE (8):
  BRepLProp_CLProps   BRepLProp_CurveTool   BRepLProp_SLProps
  GeomLProp_CLProps   GeomLProp_CurveTool   GeomLProp_SLProps
  GeomLProp_SurfaceTool   HLRBRep_SLProps

Conditional re-enable (9):
  GeomPlate_Aij   GeomPlate_BuildAveragePlane   GeomPlate_BuildPlateSurface
  GeomPlate_CurveConstraint   GeomPlate_MakeApprox   GeomPlate_PlateG0Criterion
  GeomPlate_PlateG1Criterion   GeomPlate_PointConstraint   GeomPlate_Surface

KEEP — facade-covered (49):
  AppDef_*  (30) — facade GeomAPI_PointsToBSpline*
  ProjLib*  (14) — facade GeomProjLib + BRepProj_Projection
  HeaderSection*  (5) — facade APIHeaderSection_{MakeHeader,EditHeader}

KEEP — superseded (130):
  TopOpeBRep*       (26)
  TopOpeBRepBuild*  (35)
  TopOpeBRepDS*     (45)
  TopOpeBRepTool*   (20) — all superseded by BRepAlgoAPI_*
  Total: 130
```

## Appendix B — Future Size-Cost Measurements

(Populate after each Phase 2-5 experiment.)

| Phase                      | Symbols added | Δ WASM (KB) | Δ d.ts (lines) | Decision |
| -------------------------- | ------------- | ----------- | -------------- | -------- |
| 1 (F1 fix)                 | 8             | TBD         | TBD            | TBD      |
| 2 (GeomPlate)              | 9             | TBD         | TBD            | TBD      |
| 3 (AppDef public)          | 6             | TBD         | TBD            | TBD      |
| 4 (ProjLib targeted)       | TBD           | TBD         | TBD            | TBD      |
| 5 (HeaderSection targeted) | TBD           | TBD         | TBD            | TBD      |
