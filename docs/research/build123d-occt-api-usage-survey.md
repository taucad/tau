---
title: 'build123d OCCT API Surface Survey & Missing-Symbol Cross-Reference'
description: 'Audit of every OCP/OCCT API build123d imports, cross-referenced against opencascade.js to determine which of the documented missing symbols (GeomPlate, AppDef, ProjLib, HeaderSection, TopOpeBRep, LProps families) build123d actually uses, and what the real JS-portability gap is.'
status: active
created: '2026-05-13'
updated: '2026-05-13'
category: audit
related:
  - docs/research/ocjs-removed-bindings-stocktake.md
  - docs/research/ocjs-non-graphics-coverage-blueprint.md
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/ocjs-bindgen-residual-issues-stocktake.md
---

# build123d OCCT API Surface Survey & Missing-Symbol Cross-Reference

Maps every OCP-import in [`gumyr/build123d`](https://github.com/gumyr/build123d) (HEAD `5800485`) against the current `@taucad/opencascade.js` (OCCT v8.0.0 final) binding surface to answer two questions: (1) which OCCT classes does build123d actually use, and (2) of the symbols flagged "missing" in [`docs/research/ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md) and [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md), which ones would actually unblock build123d-to-JS portability.

## Executive Summary

build123d uses **279 distinct OCP symbols across 85 OCCT packages** in `src/` (15 additional packages appear only in tests). Cross-referenced against the current `opencascade.js` binding surface (`build-configs/opencascade_full.d.ts`, 4 548 bindings):

| Question                                                                                    | Answer                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does build123d use **GeomPlate**?                                                           | **No** — zero references anywhere in `src/` or `tests/`.                                                                                                                                                                                         |
| Does build123d use **AppDef** (any class)?                                                  | **No** — zero references.                                                                                                                                                                                                                        |
| Does build123d use **ProjLib\_\*** classes (low-level)?                                     | **No** — only the `GeomProjLib` facade (3 sites), already bound.                                                                                                                                                                                 |
| Does build123d use **HeaderSection\_\*** (low-level)?                                       | **No** — only the `APIHeaderSection_MakeHeader` facade (1 site), already bound.                                                                                                                                                                  |
| Does build123d use **TopOpeBRep\*** (deprecated boolean engine)?                            | **No** — zero references; uses `BRepAlgoAPI_*` exclusively.                                                                                                                                                                                      |
| Does build123d use **BRepLProp / GeomLProp / HLRBRep_SLProps** (the F1 codegen-bug family)? | **One call site** — `BRepLProp.Continuity_s(...)` in `topology/one_d.py:4733`. The package-level `BRepLProp` class is bound; the templated `BRepLProp_SLProps`/`CLProps`/`SurfaceTool` family is bound after the F1 fix but unused by build123d. |

The headline finding flips the priority order in the existing blueprint. The actual portability blockers are **not** GeomPlate/AppDef/ProjLib/HeaderSection. They are:

1. **NCollection-typedef naming gap (P0, blocks every boolean op)** — every OCCT collection that build123d imports under its OCCT name (`TopTools_ListOfShape`, `TColgp_Array1OfPnt`, `TColgp_HArray2OfPnt`, `TDF_LabelSequence`, …) is bound in opencascade.js under its **mangled template name** (`NCollection_List_TopoDS_Shape`, `NCollection_Array1_gp_Pnt`, `NCollection_Array2_gp_Pnt`, `NCollection_Sequence_TDF_Label`). Same C++ class, incompatible JS identifier. **Effort: cosmetic — emit a `type X = NCollection_Y_Z;` alias in the d.ts and a runtime-`Module["TopTools_ListOfShape"] = Module["NCollection_List_TopoDS_Shape"]` alias in the post-link shim. Zero WASM-size impact.**
2. **Text-as-BRep family (P1, blocks `Compound.make_text`)** — `Font_FontMgr`, `Font_BRepFont`, `Font_FA_*`, `Font_SystemFont`, `StdPrs_BRepFont`, `StdPrs_BRepTextBuilder` are excluded as part of the visualization-package strip. **Effort: re-enable `Font` (TKService) and the BRep slice of `StdPrs` (TKV3d) selectively. ~+200 KB WASM estimated.**
3. **Two genuinely-missing typedef instantiations (P2)** — `TopTools_IndexedDataMapOfShapeListOfShape` and `TColStd_SequenceOfHAsciiString`. These are doubly-templated NCollection aliases that the bindgen does not currently instantiate. **Effort: explicit additions to `bindgen-filters.yaml::template_typedefs`.**

The previously-shipped F1 codegen fix is **vindicated but currently produces zero benefit for build123d** — the templated LProps classes are now in the d.ts, but build123d never imports them. They remain valuable for any consumer that wants point-on-curve / point-on-surface curvature evaluation.

## Table of Contents

- [Methodology](#methodology)
- [build123d Architecture, in OCCT terms](#build123d-architecture-in-occt-terms)
- [Findings](#findings)
  - [Finding 1: 89% symbol-level coverage already exists](#finding-1-89-symbol-level-coverage-already-exists)
  - [Finding 2: GeomPlate is unused — re-enable can be deprioritised](#finding-2-geomplate-is-unused--re-enable-can-be-deprioritised)
  - [Finding 3: AppDef, ProjLib, HeaderSection, TopOpeBRep are all unused](#finding-3-appdef-projlib-headersection-topopebrep-are-all-unused)
  - [Finding 4: LProps usage limited to the package-level `BRepLProp.Continuity` static](#finding-4-lprops-usage-limited-to-the-package-level-breplpropcontinuity-static)
  - [Finding 5: NCollection naming gap is the real boolean-op blocker](#finding-5-ncollection-naming-gap-is-the-real-boolean-op-blocker)
  - [Finding 6: Text-as-BRep is the largest semantically-missing surface](#finding-6-text-as-brep-is-the-largest-semantically-missing-surface)
  - [Finding 7: Two typedef instantiations are genuinely absent](#finding-7-two-typedef-instantiations-are-genuinely-absent)
- [Per-Module Coverage Matrix](#per-module-coverage-matrix)
- [Cross-Reference: Missing-Symbol Families vs build123d Usage](#cross-reference-missing-symbol-families-vs-build123d-usage)
- [Recommendations](#recommendations)
- [Implications for the Blueprint Phase Order](#implications-for-the-blueprint-phase-order)
- [Appendix A: Genuinely-missing symbols (21 of 194 sampled)](#appendix-a-genuinely-missing-symbols-21-of-194-sampled)
- [Appendix B: NCollection typedef-name aliasing reference](#appendix-b-ncollection-typedef-name-aliasing-reference)
- [References](#references)

## Methodology

1. **Cloned build123d via the repos manifest.** Added `gumyr/build123d` to `repos.yaml` under group `cad` and cloned with `pnpm repos add gumyr/build123d -g cad --clone`. HEAD: `5800485` (Merge PR #1308 _batch-fuse-performance_, dev branch). License: Apache-2.0. 38 source files, 63 test files.
2. **Extracted OCP imports.** Walked every `*.py` under `src/` with a regex pass that handles single-line and parenthesised multi-line `from OCP.<Module> import …` blocks. Yields **279 unique `<module>.<symbol>` pairs across 85 modules**. Tests adds 15 modules.
3. **Cross-referenced against the current d.ts.** Loaded `repos/opencascade.js/build-configs/opencascade_full.d.ts` (255 611 lines, 4 548 explicit class declarations) and probed each build123d symbol against six declaration patterns (class, abstract class, enum, type alias, interface, function) plus enum-member position.
4. **Inspected each missing-symbol family in build123d source.** For every family in [`docs/research/ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md) (P1-P6), ran a literal substring search across `src/` and `tests/` to count usage sites.
5. **Verified the NCollection naming gap.** Inspected the `BRepAlgoAPI_BooleanOperation.SetTools(theLS: NCollection_List_TopoDS_Shape)` signature in the d.ts and confirmed the OCCT typedef `TopTools_ListOfShape` is the same C++ template instantiation but emitted under the mangled JS name.
6. **Quantified the WASM-cost-vs-build123d-benefit trade-off.** Mapped every recommendation to its WASM-size impact (estimated from `bindgen-filters.yaml` package strip) and the number of build123d call sites it unblocks.

## build123d Architecture, in OCCT terms

build123d is the spiritual successor to CadQuery written by Roger Maitland (gumyr). It is a thin Pythonic envelope around OCP (the [pybind11](https://github.com/pybind/pybind11)-generated bindings to OCCT, built and shipped by CadQuery as `cadquery-ocp`). The pyproject pins `cadquery-ocp-novtk >= 7.9, < 8.0` plus three sibling packages built on the same OCP layer:

```
build123d (Python public API)
   │
   ├── ocp_gordon       — Gordon-surface BSpline blends
   ├── ocpsvg           — SVG ↔ TopoDS_Edge/Wire conversion
   └── cadquery-ocp     — pybind11-generated bindings to OCCT v7.9
            │
            └── OCCT v7.9.x (or any forward-compatible v7/v8)
```

The entire build123d surface lives in `src/build123d/`:

| Module                                                  | Lines   | Concern                                              |
| ------------------------------------------------------- | ------- | ---------------------------------------------------- |
| `topology/one_d.py`                                     | 4 800   | Edge, Wire (BRep edge/wire algorithms)               |
| `topology/two_d.py`                                     | ~2 100  | Face, Shell (BRep face/shell algorithms)             |
| `topology/three_d.py`                                   | ~2 000  | Solid, CompSolid, Compound (BRep solid algorithms)   |
| `topology/shape_core.py`                                | ~3 500  | Base `Shape` class + traversal/transform/measurement |
| `topology/composite.py`                                 | ~700    | Compound + text-as-BRep glyph builder                |
| `topology/zero_d.py`                                    | ~700    | Vertex                                               |
| `topology/utils.py`                                     | ~700    | Shared topo helpers                                  |
| `topology/constrained_lines.py`                         | 826     | 2D constrained construction (Geom2dGcc)              |
| `geometry.py`                                           | ~3 200  | gp*\*, Bnd*, Plane, Axis, Color value-types          |
| `importers.py`, `exporters3d.py`, `exporters.py`        | ~3 500  | STEP/IGES/STL/glTF/SVG IO + HLR projection           |
| `mesher.py`                                             | ~1 100  | Triangle-mesh export (3MF)                           |
| `text.py`                                               | ~250    | `Font_FontMgr` wrapper                               |
| `joints.py`, `drafting.py`, `pack.py`, `persistence.py` | various | Higher-level construction & persistence              |

The two highest-density OCCT call sites are `topology/one_d.py` (BRep edge algorithms — 130+ OCP symbols) and `topology/shape_core.py` (the `Shape` superclass — 80+ OCP symbols).

## Findings

### Finding 1: 89% symbol-level coverage already exists

Of the 194 representative symbols sampled across build123d's hottest call sites, **173 are already bound** in `opencascade.js`'s d.ts (89%). The remaining 21 split into:

| Category                           | Count | Symbols                                                                                                                                                                                                              |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text-as-BRep family                | 9     | `Font_BRepFont`, `Font_FontMgr`, `Font_SystemFont`, `Font_FA_Bold`, `Font_FA_BoldItalic`, `Font_FA_Italic`, `Font_FA_Regular`, `StdPrs_BRepFont`, `StdPrs_BRepTextBuilder`                                           |
| NCollection typedef-name aliases   | 8     | `TopTools_ListOfShape`, `TopTools_IndexedDataMapOfShapeListOfShape`, `TColgp_Array1OfPnt`, `TColgp_HArray2OfPnt`, `TColgp_Array1OfVec`, `TColgp_HArray1OfPnt`, `TDF_LabelSequence`, `TColStd_SequenceOfHAsciiString` |
| Visualization material enum        | 1     | `Graphic3d_NameOfMaterial`                                                                                                                                                                                           |
| BRepOffset_MakeOffset              | 1     | (the multi-tool offset builder used in `topology/one_d.py:90`, `three_d.py:69`; bound under a different name? — Appendix A)                                                                                          |
| Extrema_ExtPC                      | 1     | (point-curve extrema, used in `topology/one_d.py:95`)                                                                                                                                                                |
| Other (BRepOffset_Skin enum value) | 1     | (enum, found inline)                                                                                                                                                                                                 |

**Source data**: `repos/opencascade.js/build-configs/opencascade_full.d.ts` cross-referenced against the import inventory derived from `repos/build123d/src/build123d/**.py`.

### Finding 2: GeomPlate is unused — re-enable can be deprioritised

`grep -r GeomPlate repos/build123d/{src,tests,docs,examples}` returns **zero matches**. build123d's only N-sided patch / fill-from-curves entrypoint is `Surface(... continuity=GeomAbs_C0|G1|G2)` in `topology/two_d.py`, which calls `BRepOffsetAPI_MakeFilling` directly. That facade is bound in opencascade.js (`build-configs/opencascade_full.d.ts:99445`-region).

This is consistent with the OCCT public-API guidance: `BRepFill_Filling` (alias of `BRepOffsetAPI_MakeFilling`) wraps `GeomPlate_BuildPlateSurface` internally and exposes the same plate-energy minimisation through a Pythonic constructor pattern. Build123d users who need finer control fall back to `cadquery-ocp` directly, but neither build123d's source nor its examples surface that escape hatch.

**Impact on existing blueprint**: [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md) lists GeomPlate restoration as **Phase 2** (post-F1). For a build123d-equivalent JS API, GeomPlate restoration becomes a **lower** priority than NCollection aliasing (Finding 5) and text-as-BRep (Finding 6).

### Finding 3: AppDef, ProjLib, HeaderSection, TopOpeBRep are all unused

| Family                        | build123d `src/` matches | build123d `tests/` matches | Public facade build123d uses instead                                               |
| ----------------------------- | ------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| `AppDef_*` (30 classes)       | 0                        | 0                          | `GeomAPI_PointsToBSpline*` (already bound)                                         |
| `ProjLib_*` (14 classes)      | 0                        | 0                          | `GeomProjLib.Project_s(...)` (already bound, used at 3 sites)                      |
| `HeaderSection_*` (5 classes) | 0                        | 0                          | `APIHeaderSection_MakeHeader` (already bound, used at 2 sites in `exporters3d.py`) |
| `TopOpeBRep*` (130 classes)   | 0                        | 0                          | `BRepAlgoAPI_*` (already bound)                                                    |

The 3-site usage of the `GeomProjLib` facade is illustrative — it confirms the hypothesis from [`docs/research/ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md) that the _facade-covered_ exclusion verdict is correct in practice for at least one major downstream:

```169:172:repos/build123d/src/build123d/topology/two_d.py
proj_curve_handle = GeomProjLib.Project_s(curve_handle, surface_handle)
proj_curve = Geom_Curve.DownCast_s(proj_curve_handle)
```

**Action implication**: Phases 3 (AppDef), 4 (ProjLib + HeaderSection), and 6 (TopOpeBRep, already permanent) of the blueprint produce **zero benefit for build123d portability**. They remain reasonable for non-build123d consumers but should not block any build123d-equivalent JS shim.

### Finding 4: LProps usage limited to the package-level `BRepLProp.Continuity` static

build123d imports `BRepLProp` exactly once and uses exactly one method — the static `Continuity` overload that classifies G0/G1/G2 continuity at the junction of two adjacent edges:

```4730:4736:repos/build123d/src/build123d/topology/one_d.py
curve1 = BRepAdaptor_Curve(given_topods_edge)
curve2 = BRepAdaptor_Curve(topods_edge)

# Get the GeomAbs_Shape enum continuity at the vertex
actual_continuity = BRepLProp.Continuity_s(
    curve1, curve2, u1, u2, TOLERANCE, TOLERANCE
)
```

The `_s` suffix is OCP/pybind11's convention for static method exposure (`pybind11::class_<>::def_static`). In opencascade.js the same method is bound on the same `BRepLProp` namespace-class as `BRepLProp.Continuity(...)` (no suffix):

```175027:175038:repos/opencascade.js/build-configs/opencascade_full.d.ts
export declare class BRepLProp {
  constructor();
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number, tl: number, ta: number): GeomAbs_Shape;
  static Continuity(C1: BRepAdaptor_Curve, C2: BRepAdaptor_Curve, u1: number, u2: number): GeomAbs_Shape;
  /** Releases the C++ object. The caller must ensure no further access. */
  delete(): void;
  [Symbol.dispose](): void;
}
```

**Build123d does NOT import `BRepLProp_CLProps`, `BRepLProp_SLProps`, `BRepLProp_CurveTool`, `GeomLProp_*`, or `HLRBRep_SLProps`.** Those eight templated classes — restored by the F1 codegen fix already shipped in this branch — provide the _templated curvature evaluator_ surface (curve and surface tangent / normal / curvature), which build123d does not surface to users. They remain valuable for any consumer that wants point-on-curve curvature evaluation, but they are not on the build123d critical path.

### Finding 5: NCollection naming gap is the real boolean-op blocker

This was not previously surfaced in the prior stocktake or blueprint and is the single largest portability blocker for build123d → JS. **The OCCT typedef-name → mangled-NCollection-name mapping is not exposed in the d.ts.**

The OCCT API defines hundreds of collection types as typedefs over `NCollection_*<T>` templates:

```cpp
// repos/opencascade.js/deps/OCCT/src/ModelingData/TKBRep/TopTools/TopTools_ListOfShape.hxx
typedef NCollection_List<TopoDS_Shape> TopTools_ListOfShape;

// repos/opencascade.js/deps/OCCT/src/FoundationClasses/TKMath/TColgp/TColgp_Array1OfPnt.hxx
typedef NCollection_Array1<gp_Pnt> TColgp_Array1OfPnt;
```

OCP exposes both the typedef name (`OCP.TopTools.TopTools_ListOfShape`) and the underlying template (because pybind11 binds the typedef site as a class). Build123d (and the entire CadQuery ecosystem) imports the **typedef name**, not the template-instantiation name:

```70:74:repos/build123d/src/build123d/topology/one_d.py
from OCP.BRepAlgoAPI import (
    BRepAlgoAPI_Common,
    BRepAlgoAPI_Cut,
    BRepAlgoAPI_Fuse,
)

# ... 120 lines later ...
from OCP.TopTools import (
    TopTools_IndexedDataMapOfShapeListOfShape,
    TopTools_ListOfShape,
)
```

opencascade.js exposes only the **mangled template-instantiation name** (`NCollection_List_TopoDS_Shape`):

```99634:99650:repos/opencascade.js/build-configs/opencascade_full.d.ts
export declare class BRepAlgoAPI_BooleanOperation extends BRepAlgoAPI_BuilderAlgo {
  constructor();
  constructor(thePF: unknown);
  Shape1(): TopoDS_Shape;
  Shape2(): TopoDS_Shape;
  SetTools(theLS: NCollection_List_TopoDS_Shape): void;
  Tools(): NCollection_List_TopoDS_Shape;
  ...
}
```

**Census of the gap** (counts of bound classes under each NCollection prefix):

| NCollection template           | Bound classes | OCCT typedef equivalents NOT exposed                                                       |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------ |
| `NCollection_List_*`           | 38            | `TopTools_ListOfShape`, ~10 others build123d uses                                          |
| `NCollection_Array1_*`         | 155           | `TColgp_Array1OfPnt`, `TColgp_Array1OfVec`, `TColStd_Array1OfReal`, … (~20 build123d uses) |
| `NCollection_Array2_*`         | 14            | `TColgp_Array2OfPnt`, `TColStd_Array2OfReal`, …                                            |
| `NCollection_Sequence_*`       | 69            | `TDF_LabelSequence`, `TopTools_SequenceOfShape`, … (~12 build123d uses)                    |
| `NCollection_Map_*`            | 8             | `TopTools_MapOfShape`, …                                                                   |
| `NCollection_DataMap_*`        | 44            | `TopTools_DataMapOfShapeShape`, …                                                          |
| `NCollection_IndexedDataMap_*` | 9             | `TopTools_IndexedDataMapOfShapeListOfShape` (genuinely missing — see Finding 7)            |
| `NCollection_IndexedMap_*`     | 8             | `TopTools_IndexedMapOfShape`, …                                                            |
| `NCollection_HArray1_*`        | 6             | `TColgp_HArray1OfPnt`, `TColStd_HArray1OfReal`, `TColStd_HArray1OfBoolean`                 |
| **Total instantiated**         | **351**       | ~150 OCCT typedef aliases unaccounted-for                                                  |

**Diagnosis**: the bindgen instantiates the underlying templates correctly but does not preserve the OCCT typedef-name as an alias. There are two clean fixes:

1. **D.ts-only alias** — emit `export type TopTools_ListOfShape = NCollection_List_TopoDS_Shape;` next to each NCollection class declaration, by walking the OCCT typedef AST in `enumerate-symbols.py` and emitting alias records to `bindgen-filters.yaml::template_typedefs`.
2. **Runtime + d.ts alias** — additionally emit `Module["TopTools_ListOfShape"] = Module["NCollection_List_TopoDS_Shape"]` in the post-link JS shim, so dynamic JS code that does `new oc.TopTools_ListOfShape()` works at runtime as well. This is how the original [donalffons/opencascade.js](https://github.com/donalffons/opencascade.js) handled it.

**Effort estimate**: P0, ~1-2 days. Zero WASM-size impact (no new C++ instantiated). High build123d-portability impact (unblocks every BRepAlgoAPI boolean op, every BSpline interpolation/approximation, every OCAF document traversal).

### Finding 6: Text-as-BRep is the largest semantically-missing surface

`Compound.make_text(...)` is one of build123d's most-used construction primitives — it converts a TrueType font glyph into a `TopoDS_Compound` of faces that can be extruded, swept, or boolean'd. The implementation lives at `repos/build123d/src/build123d/topology/composite.py:231-380` and `text.py:1-200`, and it touches the entire `Font*` and `StdPrs_BRepFont`/`StdPrs_BRepTextBuilder` family:

```347:355:repos/build123d/src/build123d/topology/composite.py
text_flat = TopoDS_Compound()
builder = Font_BRepTextBuilder()
brep_font = StdPrs_BRepFont(
    NCollection_Utf8String(font),
    Font_FontAspect(font_style.value),
    font_size,
)
```

These six classes are excluded from opencascade.js as part of the visualization-package strip (`StdPrs` is in TKV3d, `Font` is in TKService — both pulled by `bindgen-filters.yaml::packages` exclusions). However, the **font + text-on-BRep** slice is a genuine non-graphics CAD operation — it produces only `TopoDS_*` outputs, with no `AIS`/`V3d`/`Graphic3d` interactivity dependencies. This is comparable to OCCT's own `BRepFont` package design (text rendering as geometry, not as pixels).

**Recommendation**: add a class-name allowlist override in `bindgen-filters.yaml` to selectively re-enable the BRep slice:

```yaml
explicit_classes_allow:
  - Font_FontMgr
  - Font_SystemFont
  - Font_BRepFont
  - Font_FontAspect # enum
  - Font_FA_Regular # enum value
  - Font_FA_Bold
  - Font_FA_Italic
  - Font_FA_BoldItalic
  - StdPrs_BRepFont
  - StdPrs_BRepTextBuilder
```

**Effort estimate**: P1, ~3-4 days (one rebuild cycle to validate WASM-size delta and link-graph closure). Estimated WASM-size impact: +200-400 KB (TKService + TKV3d::StdPrs subset; need to validate against the link graph because StdPrs pulls TKBRep which is already linked).

### Finding 7: Two typedef instantiations are genuinely absent

After accounting for the NCollection naming gap (Finding 5), two build123d imports remain genuinely un-instantiated by the bindgen:

1. **`TopTools_IndexedDataMapOfShapeListOfShape`** — used by `topology/two_d.py:128` and `three_d.py:103` for ancestors-map traversal. The underlying template is `NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>, …>` — a _doubly-templated_ typedef. The bindgen's auto-discovery currently picks up single-template instantiations (`NCollection_List_TopoDS_Shape`) but not nested ones.
2. **`TColStd_SequenceOfHAsciiString`** — used by `text.py:29` for the result-set of `Font_FontMgr::GetAvailableFonts`. The template is `NCollection_Sequence<Handle<TCollection_HAsciiString>>` — wrapping a `Handle<>` smart-pointer payload, which the auto-discovery may filter out.

**Fix**: explicit additions to `bindgen-filters.yaml::template_typedefs`:

```yaml
template_typedefs:
  - NCollection_IndexedDataMap<TopoDS_Shape, NCollection_List<TopoDS_Shape>, TopTools_ShapeMapHasher>:
      js_name: TopTools_IndexedDataMapOfShapeListOfShape
  - NCollection_Sequence<opencascade::handle<TCollection_HAsciiString>>:
      js_name: TColStd_SequenceOfHAsciiString
```

**Effort estimate**: P2, ~1 day per typedef + one rebuild. Negligible WASM-size impact (≤ 30 KB combined).

## Per-Module Coverage Matrix

Cross-tabulation of all 85 OCCT packages build123d imports against the count of classes opencascade.js binds in each. **Counts include only top-level `export declare class` declarations** (enum-only modules show 0 here but are still bound — see notes column).

| OCCT Package                                             | build123d symbol uses | ocjs class count                                  | Coverage notes                                                                                                         |
| -------------------------------------------------------- | --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Foundation**                                           |                       |                                                   |                                                                                                                        |
| `gp`                                                     | 22                    | 38                                                | ✅ Full                                                                                                                |
| `Bnd`                                                    | 2                     | 7                                                 | ✅ Full                                                                                                                |
| `gce`                                                    | 1                     | 24                                                | ✅ Full                                                                                                                |
| `GccEnt`                                                 | 5                     | 3                                                 | ⚠️ enum-only module — bound as enum, not class                                                                         |
| `Precision`                                              | 1                     | 1                                                 | ✅ Full                                                                                                                |
| `Standard`                                               | 4                     | 41                                                | ✅ Full (exception types)                                                                                              |
| `StdFail`                                                | 2                     | 5                                                 | ✅ Full (failure types)                                                                                                |
| `Quantity`                                               | 3                     | 6                                                 | ✅ Color types bound                                                                                                   |
| `Message`                                                | 3                     | 20                                                | ✅ Full                                                                                                                |
| **Collections (NCollection naming gap — see Finding 5)** |                       |                                                   |                                                                                                                        |
| `TColgp`                                                 | 4                     | **0**                                             | 🔴 Bound under `NCollection_Array1_gp_Pnt`, etc. — naming-only gap                                                     |
| `TColStd`                                                | 7                     | **0**                                             | 🔴 Bound under `NCollection_Sequence_TCollection_HAsciiString`, etc. — naming-only gap (one typedef genuinely missing) |
| `TopTools`                                               | 6                     | 4 (set/map/locationSet only)                      | 🔴 List/IndexedMap bound under NCollection mangled names; one typedef genuinely missing                                |
| `TCollection`                                            | 3                     | 5                                                 | ✅ Full (AsciiString, ExtendedString)                                                                                  |
| `NCollection`                                            | 1                     | 591                                               | ⚠️ build123d uses `Utf8String` which is genuinely absent                                                               |
| **Topology / BRep**                                      |                       |                                                   |                                                                                                                        |
| `TopAbs`                                                 | 4                     | 3 (types)                                         | ⚠️ enum-only — bound as type, not class                                                                                |
| `TopExp`                                                 | 2                     | 2                                                 | ✅ Full                                                                                                                |
| `TopLoc`                                                 | 1                     | 5                                                 | ✅ Full                                                                                                                |
| `TopoDS`                                                 | 12                    | 27                                                | ✅ Full                                                                                                                |
| `BRep`                                                   | 3                     | 21                                                | ✅ Full                                                                                                                |
| `BRepAdaptor`                                            | 3                     | 4                                                 | ✅ Full                                                                                                                |
| `BRepBndLib`                                             | 1                     | 1                                                 | ✅ Full                                                                                                                |
| `BRepCheck`                                              | 1                     | 9                                                 | ✅ Full                                                                                                                |
| `BRepClass3d`                                            | 1                     | 7                                                 | ✅ Full                                                                                                                |
| `BRepLib`                                                | 2                     | 17                                                | ✅ Full                                                                                                                |
| `BRepLProp`                                              | 1 (`Continuity_s`)    | 4 (incl. F1-restored CLProps/SLProps/SurfaceTool) | ✅ Full coverage; build123d uses the package-level static only                                                         |
| `BRepGProp`                                              | 2                     | 10                                                | ✅ Full                                                                                                                |
| `BRepTools`                                              | 3                     | 14                                                | ✅ Full                                                                                                                |
| `BRepBuilderAPI`                                         | 16                    | 23                                                | ✅ Full                                                                                                                |
| `BRepPrimAPI`                                            | 9                     | 12                                                | ✅ Full                                                                                                                |
| `BRepAlgo`                                               | 1                     | 6                                                 | ✅ Full (legacy package, build123d uses for `IsValid`)                                                                 |
| `BRepAlgoAPI`                                            | 6                     | 10                                                | ✅ Full (boolean ops) — but unusable for multi-tool path until Finding 5 is fixed                                      |
| `BRepFilletAPI`                                          | 4                     | 4                                                 | ✅ Full                                                                                                                |
| `BRepFeat`                                               | 4                     | 10                                                | ✅ Full                                                                                                                |
| `BRepFill`                                               | 1                     | 30                                                | ✅ Full                                                                                                                |
| `BRepOffset`                                             | 2                     | 8                                                 | ⚠️ `BRepOffset_MakeOffset` not in d.ts under that name; verify NCollection or alias                                    |
| `BRepOffsetAPI`                                          | 6                     | 12                                                | ✅ Full (incl. `MakeFilling` — facade for GeomPlate)                                                                   |
| `BRepExtrema`                                            | 2                     | 16                                                | ✅ Full                                                                                                                |
| `BRepIntCurveSurface`                                    | 1                     | 1                                                 | ✅ Full                                                                                                                |
| `BRepProj`                                               | 1                     | 1                                                 | ✅ Full                                                                                                                |
| `BRepMesh`                                               | 1                     | 51                                                | ✅ Full                                                                                                                |
| `BinTools`                                               | 1                     | 11                                                | ✅ Full                                                                                                                |
| `BOPAlgo`                                                | 2                     | 68                                                | ✅ Full                                                                                                                |
| `LocOpe`                                                 | 1                     | 18                                                | ✅ Full                                                                                                                |
| `ChFi2d`                                                 | 1                     | 6                                                 | ✅ Full                                                                                                                |
| **Geometry**                                             |                       |                                                   |                                                                                                                        |
| `Geom`                                                   | 14                    | 39                                                | ✅ Full                                                                                                                |
| `Geom2d`                                                 | 6                     | 22                                                | ✅ Full                                                                                                                |
| `GeomAbs`                                                | 10                    | **0** classes (6 types)                           | ⚠️ enum-only — all 6 enum types bound (`GeomAbs_C0`, `_G1`, etc.)                                                      |
| `GeomAdaptor`                                            | 2                     | 7                                                 | ✅ Full                                                                                                                |
| `Geom2dAdaptor`                                          | 1                     | 2                                                 | ✅ Full                                                                                                                |
| `GeomAPI`                                                | 9                     | 11                                                | ✅ Full                                                                                                                |
| `Geom2dAPI`                                              | 2                     | 5                                                 | ✅ Full                                                                                                                |
| `GeomConvert`                                            | 3                     | 15                                                | ✅ Full                                                                                                                |
| `GeomFill`                                               | 4                     | 53                                                | ✅ Full                                                                                                                |
| `GeomLib`                                                | 1                     | 11                                                | ✅ Full                                                                                                                |
| `GeomProjLib`                                            | 1                     | 1                                                 | ✅ Full (facade for excluded `ProjLib_*`)                                                                              |
| `Geom2dGcc`                                              | 8                     | 10                                                | ✅ Full (constrained 2D construction — `constrained_lines.py`)                                                         |
| `GC`                                                     | 6                     | 33                                                | ✅ Full                                                                                                                |
| `GCPnts`                                                 | 4                     | 8                                                 | ✅ Full                                                                                                                |
| `GProp`                                                  | 1                     | 9                                                 | ✅ Full                                                                                                                |
| `IntAna2d`                                               | 1                     | 3                                                 | ✅ Full                                                                                                                |
| `Extrema`                                                | 1 (`Extrema_ExtPC`)   | 38                                                | ⚠️ `Extrema_ExtPC` not in d.ts under that name; verify Appendix A                                                      |
| **Hidden Line / Projection**                             |                       |                                                   |                                                                                                                        |
| `HLRAlgo`                                                | 1                     | 16                                                | ✅ Full                                                                                                                |
| `HLRBRep`                                                | 2                     | 46                                                | ✅ Full                                                                                                                |
| **Shape Healing**                                        |                       |                                                   |                                                                                                                        |
| `ShapeAnalysis`                                          | 3                     | 19                                                | ✅ Full                                                                                                                |
| `ShapeCustom`                                            | 2                     | 12                                                | ✅ Full                                                                                                                |
| `ShapeFix`                                               | 5                     | 21                                                | ✅ Full                                                                                                                |
| `ShapeUpgrade`                                           | 1                     | 33                                                | ✅ Full                                                                                                                |
| **Data Exchange / OCAF**                                 |                       |                                                   |                                                                                                                        |
| `APIHeaderSection`                                       | 1 (`MakeHeader`)      | 2                                                 | ✅ Full (facade for excluded `HeaderSection_*`)                                                                        |
| `IFSelect`                                               | 1                     | 74                                                | ✅ Full                                                                                                                |
| `IGESControl`                                            | 1                     | 7                                                 | ✅ Full                                                                                                                |
| `Interface`                                              | 1                     | 42                                                | ✅ Full                                                                                                                |
| `RWGltf`                                                 | 1                     | 15                                                | ✅ Full                                                                                                                |
| `RWStl`                                                  | 1                     | 2                                                 | ✅ Full                                                                                                                |
| `STEPCAFControl`                                         | 3                     | 5                                                 | ✅ Full                                                                                                                |
| `STEPControl`                                            | 2                     | 5                                                 | ✅ Full                                                                                                                |
| `StlAPI`                                                 | 1                     | 3                                                 | ✅ Full                                                                                                                |
| `XSControl`                                              | 1                     | 14                                                | ✅ Full                                                                                                                |
| `TDF`                                                    | 2                     | 28                                                | ⚠️ `TDF_LabelSequence` is a NCollection alias                                                                          |
| `TDataStd`                                               | 1                     | 42                                                | ✅ Full                                                                                                                |
| `TDocStd`                                                | 1                     | 14                                                | ✅ Full                                                                                                                |
| `XCAFApp`                                                | 1                     | 1                                                 | ✅ Full                                                                                                                |
| `XCAFDoc`                                                | 7                     | 38                                                | ✅ Full                                                                                                                |
| **Visualization (mostly excluded)**                      |                       |                                                   |                                                                                                                        |
| `Font`                                                   | 6                     | **0**                                             | 🔴 Excluded — text-as-BRep blocked (Finding 6)                                                                         |
| `StdPrs`                                                 | 2                     | **0**                                             | 🔴 Excluded — text-as-BRep blocked (Finding 6)                                                                         |
| `Graphic3d`                                              | 7                     | **0**                                             | 🔴 Excluded — `Graphic3d_NameOfMaterial` enum blocked                                                                  |

### Coverage roll-up

| Bucket                                               | Modules                                                                                    | Status |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| Fully covered                                        | 76 / 85                                                                                    | ✅     |
| NCollection naming gap (cosmetic fix)                | 4 (`TColgp`, `TColStd`, `TopTools`, `TDF`)                                                 | 🔴 P0  |
| Text-as-BRep blocked (re-enable visualization slice) | 3 (`Font`, `StdPrs`, `Graphic3d` enum)                                                     | 🔴 P1  |
| Genuinely missing typedef instantiations             | 2 typedefs (`TopTools_IndexedDataMapOfShapeListOfShape`, `TColStd_SequenceOfHAsciiString`) | 🔴 P2  |

## Cross-Reference: Missing-Symbol Families vs build123d Usage

This table directly answers the user's primary question — does build123d use any of the symbols flagged "missing" by the prior research?

| Family (per [`ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md)) | Class count | build123d uses? | Sites                    | Substitute build123d uses                          | Restore for build123d? |
| ----------------------------------------------------------------------------------------------------- | ----------: | --------------- | ------------------------ | -------------------------------------------------- | ---------------------- |
| **P1: BRepLProp\_** templated (CLProps, SLProps, SurfaceTool)                                         |           3 | **No**          | 0                        | n/a                                                | ❌ Not needed          |
| **P1: BRepLProp** (package-level)                                                                     |           1 | **Yes** (1)     | `topology/one_d.py:4733` | n/a (already bound; build123d uses `Continuity_s`) | ✅ Already covered     |
| **P1: GeomLProp\_** templated (CLProps, SLProps, CurveTool, SurfaceTool)                              |           4 | **No**          | 0                        | n/a                                                | ❌ Not needed          |
| **P1: HLRBRep_SLProps**                                                                               |           1 | **No**          | 0                        | n/a                                                | ❌ Not needed          |
| **P2: GeomPlate\_**                                                                                   |           9 | **No**          | 0                        | `BRepOffsetAPI_MakeFilling`                        | ❌ Not needed          |
| **P3: AppDef\_**                                                                                      |          30 | **No**          | 0                        | `GeomAPI_PointsToBSpline*`                         | ❌ Not needed          |
| **P4: ProjLib\_** (low-level)                                                                         |          14 | **No**          | 0                        | `GeomProjLib.Project_s`                            | ❌ Not needed          |
| **P5: HeaderSection\_**                                                                               |           5 | **No**          | 0                        | `APIHeaderSection_MakeHeader`                      | ❌ Not needed          |
| **P6: TopOpeBRep / TopOpeBRepDS / TopOpeBRepBuild / TopOpeBRepTool**                                  |         130 | **No**          | 0                        | `BRepAlgoAPI_*`, `BOPAlgo_*`                       | ❌ Permanent           |

**Net result**: of 197 templated/family classes flagged in the prior stocktake, **build123d uses exactly 1** — the package-level `BRepLProp` static, which was never excluded. The F1 codegen fix (already shipped in this branch) and the GeomPlate/AppDef/ProjLib/HeaderSection re-enable phases are valuable for **non-build123d JS consumers** but are not gating for a build123d-equivalent JS API.

## Recommendations

| #   | Action                                                                                                                                                                                                                                     | Priority | Effort   | Build123d benefit                                                | WASM cost   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- | ---------------------------------------------------------------- | ----------- |
| R1  | Emit OCCT-typedef-name aliases for every NCollection template instantiation (d.ts `type X = Y` plus runtime shim). Walk OCCT headers for `typedef NCollection_<Container><T> <name>` and add to `bindgen-filters.yaml::template_typedefs`. | **P0**   | 1-2 days | Unblocks every boolean op, BSpline interpolation, OCAF traversal | None        |
| R2  | Re-enable the BRep slice of `Font`/`StdPrs` (allowlist `Font_FontMgr`, `Font_BRepFont`, `Font_SystemFont`, `Font_FA_*`, `Font_FontAspect`, `StdPrs_BRepFont`, `StdPrs_BRepTextBuilder`)                                                    | **P1**   | 3-4 days | Unblocks `Compound.make_text`                                    | +200-400 KB |
| R3  | Add explicit `template_typedefs` entries for `TopTools_IndexedDataMapOfShapeListOfShape` and `TColStd_SequenceOfHAsciiString`                                                                                                              | **P2**   | 1 day    | Unblocks ancestors-map traversal + font enumeration              | ≤ 30 KB     |
| R4  | Add `Graphic3d_NameOfMaterial` enum to `bindgen-filters.yaml::explicit_classes_allow`                                                                                                                                                      | **P3**   | 0.5 day  | Unblocks material-name lookup in `Compound` colour assignment    | ≤ 10 KB     |
| R5  | Verify `BRepOffset_MakeOffset` and `Extrema_ExtPC` mapping (Appendix A) — they may be bound under different names or genuinely require explicit allowlisting                                                                               | **P3**   | 1 day    | Unblocks 2D offset workflows                                     | ≤ 50 KB     |
| R6  | Defer GeomPlate, AppDef, ProjLib, HeaderSection re-enable phases (Phases 2-4 of [`ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md)) — they are not on the build123d critical path          | **P5+**  | n/a      | None for build123d                                               | Skip ~+1 MB |

**Combined effort to make the entire build123d source layer compilable against opencascade.js**: ≈ 6 working days. **Combined WASM-size cost**: ≤ 500 KB (plus the deferred-by-default ~1 MB from Phases 2-4). The opencascade.js `dist/opencascade_full.wasm` would land at ≈ 37 MB instead of the blueprint's projected ≈ 38.5 MB.

## Implications for the Blueprint Phase Order

[`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md) currently sequences phases as F1 → GeomPlate → AppDef → ProjLib + HeaderSection → misc-compile-error sweep. If build123d-equivalent coverage is the prioritisation lens, the optimal sequence becomes:

```
Phase 1 (already done): F1 codegen fix         ← keeps LProps tools available for non-build123d users
Phase 2 (NEW):          NCollection alias emit  ← R1 (P0) — unblocks every build123d boolean op
Phase 3 (NEW):          Text-as-BRep allowlist  ← R2 (P1) — unblocks Compound.make_text
Phase 4 (NEW):          Two missing typedefs    ← R3 (P2)
Phase 5:                misc-compile-error sweep (was blueprint Phase 5)
Phase 6:                GeomPlate (was blueprint Phase 2) — deprioritised
Phase 7:                AppDef public-only (was blueprint Phase 3) — deprioritised
Phase 8:                ProjLib + HeaderSection (was blueprint Phase 4) — deprioritised
```

The reordering does not invalidate the blueprint's overall coverage target (≈ 5 800 bindings in ≤ 38.5 MB) — it changes which symbols ship first.

## Appendix A: Genuinely-missing symbols (21 of 194 sampled)

Output of the symbol-by-symbol probe of `repos/opencascade.js/build-configs/opencascade_full.d.ts` against build123d's import set:

| Symbol                                      | Module      | build123d call sites                                  | Disposition                                            |
| ------------------------------------------- | ----------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `Font_BRepFont`                             | Font        | `composite.py:351`                                    | Re-enable per R2                                       |
| `Font_FontMgr`                              | Font        | `text.py:25,80,108-111`                               | Re-enable per R2                                       |
| `Font_SystemFont`                           | Font        | `text.py:26,125,129,192`                              | Re-enable per R2                                       |
| `Font_FA_Bold`                              | Font        | `text.py:36`                                          | Re-enable per R2                                       |
| `Font_FA_BoldItalic`                        | Font        | `text.py:38`                                          | Re-enable per R2                                       |
| `Font_FA_Italic`                            | Font        | `text.py:37`                                          | Re-enable per R2                                       |
| `Font_FA_Regular`                           | Font        | `text.py:35`                                          | Re-enable per R2                                       |
| `StdPrs_BRepFont`                           | StdPrs      | `composite.py:79,351`                                 | Re-enable per R2                                       |
| `StdPrs_BRepTextBuilder`                    | StdPrs      | `composite.py:79,350`                                 | Re-enable per R2                                       |
| `Graphic3d_NameOfMaterial`                  | Graphic3d   | `composite.py` (via `Quantity_Color`)                 | Allowlist per R4                                       |
| `TopTools_ListOfShape`                      | TopTools    | every BRepAlgoAPI multi-tool boolean                  | Alias per R1                                           |
| `TopTools_IndexedDataMapOfShapeListOfShape` | TopTools    | `two_d.py:128`, `three_d.py:103`, `shape_core.py:132` | Instantiate per R3                                     |
| `TColgp_Array1OfPnt`                        | TColgp      | every BSpline interpolation                           | Alias per R1                                           |
| `TColgp_HArray2OfPnt`                       | TColgp      | `two_d.py:117` (Surface fitting)                      | Alias per R1                                           |
| `TColgp_Array1OfVec`                        | TColgp      | `one_d.py:171` (BSpline tangent constraints)          | Alias per R1                                           |
| `TColgp_HArray1OfPnt`                       | TColgp      | `one_d.py:171`                                        | Alias per R1                                           |
| `TColStd_SequenceOfHAsciiString`            | TColStd     | `text.py:29`                                          | Instantiate per R3                                     |
| `TDF_LabelSequence`                         | TDF         | `importers.py:53` (XCAF traversal)                    | Alias per R1                                           |
| `NCollection_Utf8String`                    | NCollection | `composite.py:78,351`                                 | Already excluded? Verify if bound under different name |
| `BRepOffset_MakeOffset`                     | BRepOffset  | `one_d.py:90`, `three_d.py:69`                        | Verify per R5                                          |
| `Extrema_ExtPC`                             | Extrema     | `one_d.py:95`                                         | Verify per R5                                          |

## Appendix B: NCollection typedef-name aliasing reference

For R1 implementation, here is the OCCT-side typedef chain for the most-impactful build123d-imported aliases. Each pair shows the **OCCT typedef name** → **mangled NCollection name as bound in opencascade.js**:

```
TopTools_ListOfShape                                   → NCollection_List_TopoDS_Shape
TopTools_SequenceOfShape                               → NCollection_Sequence_TopoDS_Shape
TopTools_HSequenceOfShape                              → NCollection_Handle_NCollection_Sequence_TopoDS_Shape (verify)
TopTools_MapOfShape                                    → NCollection_Map_TopoDS_Shape
TopTools_IndexedMapOfShape                             → NCollection_IndexedMap_TopoDS_Shape
TopTools_DataMapOfShapeShape                           → NCollection_DataMap_TopoDS_Shape_TopoDS_Shape
TopTools_DataMapOfShapeListOfShape                     → NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape
TopTools_IndexedDataMapOfShapeListOfShape              → (NOT INSTANTIATED — see R3)

TColgp_Array1OfPnt                                     → NCollection_Array1_gp_Pnt
TColgp_Array1OfPnt2d                                   → NCollection_Array1_gp_Pnt2d
TColgp_Array1OfVec                                     → NCollection_Array1_gp_Vec
TColgp_Array2OfPnt                                     → NCollection_Array2_gp_Pnt
TColgp_HArray1OfPnt                                    → NCollection_HArray1_gp_Pnt
TColgp_HArray2OfPnt                                    → NCollection_HArray2_gp_Pnt

TColStd_Array1OfReal                                   → NCollection_Array1_double
TColStd_Array1OfInteger                                → NCollection_Array1_int
TColStd_HArray1OfReal                                  → NCollection_HArray1_double
TColStd_HArray1OfBoolean                               → NCollection_HArray1_bool
TColStd_HArray2OfReal                                  → NCollection_HArray2_double
TColStd_SequenceOfHAsciiString                         → (NOT INSTANTIATED — see R3)
TColStd_IndexedDataMapOfStringString                   → NCollection_IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString (verify)

TDF_LabelSequence                                      → NCollection_Sequence_TDF_Label
```

**Recommended emission strategy**: extend `scripts/enumerate-symbols.py` to walk every OCCT header for `^typedef NCollection_(\w+)<([^>]+)> (\w+);` patterns, and emit a corresponding entry into a new `bindgen-filters.yaml::ncollection_typedef_aliases:` list. The post-codegen pass that emits `dist/opencascade_full.d.ts` then walks this list and emits `export type <occt_name> = <ncoll_name>;` next to each underlying class declaration. The runtime pass adds `Module["<occt_name>"] = Module["<ncoll_name>"]` to the post-link shim.

## References

- [build123d source](https://github.com/gumyr/build123d) — HEAD `5800485` (Apache-2.0)
- [build123d documentation](https://build123d.readthedocs.io/en/latest/)
- [CadQuery OCP bindings](https://github.com/CadQuery/OCP) — pybind11-generated Python bindings to OCCT (the substrate build123d wraps)
- Related research:
  - [`docs/research/ocjs-removed-bindings-stocktake.md`](docs/research/ocjs-removed-bindings-stocktake.md) — per-symbol disposition for the 197-class missing surface
  - [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](docs/research/ocjs-non-graphics-coverage-blueprint.md) — phased enablement program (this doc reorders phases 2-4)
  - [`docs/research/occt-unbound-symbols-audit.md`](docs/research/occt-unbound-symbols-audit.md) — original unbound-symbol census
  - [`docs/research/ocjs-bindgen-residual-issues-stocktake.md`](docs/research/ocjs-bindgen-residual-issues-stocktake.md) — R1-R5 bindgen residual issues (R1-R5 already shipped)
- OCCT v8 source: `repos/opencascade.js/deps/OCCT/src/`
- opencascade.js current d.ts: `repos/opencascade.js/build-configs/opencascade_full.d.ts` (255 611 lines, 4 548 explicit class declarations)
