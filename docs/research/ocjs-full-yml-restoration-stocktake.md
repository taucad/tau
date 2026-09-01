---
title: 'OCJS full.yml Restoration Stocktake — manifest-vs-YAML delta after accidental git checkout'
description: 'Per-symbol delta between build-configs/full.yml and the requested-symbol list embedded in opencascade_full.build-manifest.json, identifying the 24 symbols to add and 191 anticipatory entries to remove so the link manifest tracks the last known-good build.'
status: active
created: '2026-05-13'
updated: '2026-05-14'
category: audit
related:
  - docs/research/ocjs-removed-bindings-stocktake.md
  - docs/research/ocjs-bindgen-residual-issues-stocktake.md
  - docs/research/ocjs-non-graphics-coverage-blueprint.md
  - docs/research/ocjs-deprecated-symbol-strategy.md
---

# OCJS full.yml Restoration Stocktake — manifest-vs-YAML delta after accidental git checkout

Reconciles `repos/opencascade.js/build-configs/full.yml` against the `symbols.requested` list embedded in `repos/opencascade.js/build-configs/opencascade_full.build-manifest.json`, which represents the most recent successful build. Identifies the symbols that an earlier `git checkout HEAD -- build-configs/full.yml` accidentally dropped (working-copy additions for new test families) and the symbols it accidentally restored (anticipatory restoration entries that are not currently buildable).

## Executive Summary

During the LProps regeneration session, an `enumerate-symbols.py`-driven YAML regeneration stripped most of the `emccFlags` tuning and was reverted via `git checkout HEAD -- build-configs/full.yml`. That checkout succeeded in restoring the link flags but used the **committed** YAML (4,316 symbols) as the base, which differs from the **working-copy** YAML the previous session had been building against in two ways:

1. The committed YAML carries 196 symbols of anticipatory **future-restoration** entries (LProps templates, GeomPlate, AppDef, ProjLib, HeaderSection, TopOpeBRep\* families, plus a single phantom NCollection entry). These were intentionally pre-staged in HEAD per the [`ocjs-removed-bindings-stocktake.md`](./ocjs-removed-bindings-stocktake.md) playbook but **were not in the working-copy YAML** because they fail to compile or are deprecated and would break the link.
2. The working copy had 24 newly-authored OCCT V8 fork classes — `BRepGraph*` (4), `ExtremaPC_*` (10), `GeomBndLib_*` (10) — added to the YAML by the prior session to drive new smoke tests (`smoke-brep-graph.test.ts`, `smoke-extrema-pc.test.ts`, `smoke-geom-bnd-lib.test.ts`). The checkout removed them.

The reference build manifest (yaml_hash `b94dda237a27`, timestamp `2026-05-12T16:11:21Z`, 4,144 requested symbols) **already contains the 24 new entries** and **does not contain** the 196 anticipatory entries. It is the authoritative target state.

Net actions to converge the YAML on the manifest baseline while preserving the F1 codegen work that has since landed:

- **ADD 24** symbols (the new BRepGraph / ExtremaPC / GeomBndLib families).
- **REMOVE 191** symbols (anticipatory restorations that don't currently build).
- **KEEP 6** F1-fix LProps templates currently in the YAML — these are now buildable post-F1 and bound in `dist/opencascade_full.d.ts`. Strict diff would also flag them as remove candidates, but doing so would regress the LProps work just landed.

End-state YAML count: `4,317 + 24 − 191 = 4,150` (vs the manifest's `4,144`; the 6-symbol gap is the F1 LProps templates that are currently buildable but were not yet in the manifest's reference build).

This stocktake **does not modify** `build-configs/full.yml` per the user's instructions — it only documents the delta and recommended actions.

> **RESOLUTION STATUS (2026-05-14).** R1 / R2 / R3 / R6 / **R7** are all **RESOLVED**. Latest build `yaml_hash 17cfddd90b01` reports `[PASS] Symbols: 4,488 requested, 5,261 compiled, 0 missing` and the full smoke suite is green: **70/70 test files, 287/287 tests** (including `smoke-brep-graph` 2/2 and `smoke-extrema-pc` 3/3 — the cases R7 was originally opened to unblock). The R7 work mechanically extended the bindgen to enumerate namespace-scoped classes/enums, admit nested-class-template specializations (e.g. `BRepGraph_NodeId::Typed<Kind::Product>`), capture non-type template arguments (`BVH::VectorType<double, 3>`), and dedupe Embind class registrations by canonical C++ type — with zero `additionalBindCode` for OCCT-derived types. See [R7 Resolution Addendum](#r7-resolution-addendum-2026-05-14) at the bottom of this doc.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Reference points](#reference-points)
- [Findings](#findings)
  - [Finding 1: 24 symbols to ADD (working-copy additions lost on checkout)](#finding-1-24-symbols-to-add-working-copy-additions-lost-on-checkout)
  - [Finding 2: 196 anticipatory restoration symbols in HEAD YAML not in manifest](#finding-2-196-anticipatory-restoration-symbols-in-head-yaml-not-in-manifest)
  - [Finding 3: 6 F1-fix LProps templates that should NOT be removed](#finding-3-6-f1-fix-lprops-templates-that-should-not-be-removed)
  - [Finding 4: 1 phantom symbol with no OCCT source](#finding-4-1-phantom-symbol-with-no-occt-source)
- [Recommendations](#recommendations)
- [Appendix A — full ADD list (24 symbols)](#appendix-a--full-add-list-24-symbols)
- [Appendix B — full REMOVE list (191 symbols, by family)](#appendix-b--full-remove-list-191-symbols-by-family)
- [References](#references)

## Problem Statement

The previous LProps session regenerated `build-configs/full.yml` via `scripts/enumerate-symbols.py`, which inadvertently stripped the carefully-tuned `emccFlags` (`--emit-symbol-map`, `-sSTACK_SIZE`, `-sWASM_BIGINT`, `-sEVAL_CTORS=2`, `-msimd128`, `-O3`) and produced a regenerated YAML missing critical link tuning. Restoring via `git checkout HEAD -- build-configs/full.yml` brought the flags back but left the YAML's symbol list out of sync with the working copy that the prior session had been editing for test-coverage expansion.

Symptoms after restore:

- New smoke tests `smoke-brep-graph.test.ts`, `smoke-extrema-pc.test.ts`, `smoke-geom-bnd-lib.test.ts` started failing with `TypeError: oc.BRepGraph_Builder is not a constructor` etc. (24 classes missing from the wasm).
- The YAML now contains 196 entries that the previous build's `requested` list excluded — many of them are deprecated families (`TopOpeBRep*`, ~129 entries) or facade-covered internals (`AppDef_*`, `ProjLib_*`, `GeomPlate_*`, `HeaderSection_*`) which would either fail to compile or bloat the WASM with no consumer benefit.

The user has flagged that some of those 196 are intentional removals that should stay removed, and asked for a methodical stocktake before any YAML edits.

## Methodology

1. Snapshot all three reference inputs:
   - `build-configs/full.yml` (current working tree, 4,317 symbols after F1 session edits).
   - `git show HEAD:build-configs/full.yml` (committed, 4,316 symbols).
   - `build-configs/opencascade_full.build-manifest.json::symbols.requested` (committed manifest from the last successful build, 4,144 symbols, yaml_hash `b94dda237a27` @ 2026-05-12T16:11:21Z).
2. Three-way `comm` diff after `sort -u` to bucket each symbol into:
   - In manifest, missing from YAML → **ADD candidate**.
   - In YAML, absent from manifest → **REMOVE candidate** or **KEEP as new buildable post-F1**.
3. For each REMOVE candidate, classify by family using prefix grouping:
   - Looked up the per-family disposition recorded in [`ocjs-removed-bindings-stocktake.md`](./ocjs-removed-bindings-stocktake.md) Sections P1–P6 (deprecated / facade-covered / codegen-blocked / restore-after-F1).
4. For each ADD candidate, verified the OCCT V8 source exists (`find deps/OCCT/src -iname "${cls}.hxx"`) and that the bindgen has produced a `build/bindings/.../${cls}.cpp` artifact. The .cpp file presence proves the only blocker is the missing YAML entry preventing the link step from including the symbol.
5. Cross-checked the F1-fix LProps templates against `build-configs/opencascade_full.d.ts` to confirm they are currently bound in the wasm and removing them would regress the LProps smoke suite.

Tooling commands used:

```bash
# Snapshot symbol sets
jq -r '.symbols.requested[]' build-configs/opencascade_full.build-manifest.json | sort -u > /tmp/manifest-requested.txt
awk '/^  - symbol:/ { print $3 }' build-configs/full.yml | sort -u > /tmp/yaml-symbols.txt
git show HEAD:build-configs/full.yml | awk '/^  - symbol:/ { print $3 }' | sort -u > /tmp/head-yaml.txt

# 3-way diff
comm -23 /tmp/manifest-requested.txt /tmp/yaml-symbols.txt    # ADD candidates (24)
comm -13 /tmp/manifest-requested.txt /tmp/yaml-symbols.txt    # REMOVE candidates (197 strict)
```

## Reference points

| Source                                                         | Symbol count | yaml_hash      | Notes                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-configs/full.yml` (current)                             | 4,317        | n/a            | HEAD + `GeomLProp_CLProps2d` added during the F1 session.                                                                                                                                                       |
| `build-configs/full.yml` @ HEAD                                | 4,316        | n/a            | Committed pre-staged restoration list; never produced a successful end-to-end build.                                                                                                                            |
| `build-manifest.json::symbols.requested`                       | 4,144        | `b94dda237a27` | Last known-good build (2026-05-12). **Authoritative target.**                                                                                                                                                   |
| `dist/opencascade_full.build-manifest.json::symbols.requested` | 4,144        | `217b13f6ae87` | Today's intermediate build from the regenerated YAML before the HEAD restore. Same count, different hash because the regenerated YAML stripped the F1 LProps templates that the committed manifest also lacked. |

## Findings

### Finding 1: 24 symbols to ADD (working-copy additions lost on checkout)

These OCCT V8 fork classes are in the manifest's `requested` list but not in the current YAML. Each has a real header in `deps/OCCT/src/ModelingData/TKBRep/BRepGraph/` or `deps/OCCT/src/ModelingData/TKGeomBase/{ExtremaPC,GeomBndLib}/` and the bindgen has already produced a `.cpp` binding for each in `build/bindings/...` — only the link manifest needs the entry.

| Family         | Count  | Notes                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------- |
| `BRepGraph*`   | 4      | New OCCT V8 graph-based BRep relationship engine. Targets `smoke-brep-graph.test.ts`. |
| `ExtremaPC_*`  | 10     | Per-curve-type point/curve extrema. Targets `smoke-extrema-pc.test.ts`.               |
| `GeomBndLib_*` | 10     | Per-curve-type bounding box library. Targets `smoke-geom-bnd-lib.test.ts`.            |
| **Total**      | **24** |                                                                                       |

Full list in [Appendix A](#appendix-a--full-add-list-24-symbols).

Disposition: **ADD all 24** to `build-configs/full.yml`. Each `.cpp` already exists in `build/bindings/` so a re-link will pick them up immediately and the three new smoke test files will start to exercise them. (Some constructors may surface bindgen issues for OCCT V8 fork-only patterns; that becomes a follow-up tracked under the [non-graphics coverage blueprint](./ocjs-non-graphics-coverage-blueprint.md) Phase 1 once the link succeeds.)

### Finding 2: 196 anticipatory restoration symbols in HEAD YAML not in manifest

These were pre-staged in the committed YAML per the per-package playbook in [`ocjs-removed-bindings-stocktake.md`](./ocjs-removed-bindings-stocktake.md). The previous session's working YAML had **stripped** these from the link manifest because they either (a) belong to deprecated OCCT families (TopOpeBRep\* superseded by BRepAlgoAPI), (b) are codegen-blocked beyond what the F1 fix unlocked, or (c) are facade-covered internals with no JS-visible benefit and cause WASM-size bloat.

Family disposition table (joined against the existing stocktake's per-package verdicts):

| Family                          | Count   | Existing-stocktake verdict                                                                       | Disposition             |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `TopOpeBRepDS_*`                | 46      | P6: deprecated, superseded by BRepAlgoAPI                                                        | REMOVE                  |
| `TopOpeBRepBuild_*`             | 35      | P6: deprecated, superseded by BRepAlgoAPI                                                        | REMOVE                  |
| `AppDef_*`                      | 30      | P3: internal B-spline approximator; facade `GeomAPI_PointsToBSpline`                             | REMOVE                  |
| `TopOpeBRep_*`                  | 27      | P6: deprecated, superseded by BRepAlgoAPI                                                        | REMOVE                  |
| `TopOpeBRepTool_*`              | 21      | P6: deprecated, superseded by BRepAlgoAPI                                                        | REMOVE                  |
| `ProjLib_*`                     | 14      | P4: low-level projection helpers; facade `GeomAPI_ProjectPointOnSurf`                            | REMOVE                  |
| `GeomPlate_*`                   | 9       | P2: plate surfaces, conditional on use case                                                      | REMOVE                  |
| `HeaderSection_*`               | 5       | P5: STEP file header internals; facade `STEPCAFControl_Reader`                                   | REMOVE                  |
| `BRepLProp_*`                   | 3       | P1: F1 fix unlocks `_SLProps`/`_CLProps`; `_CurveTool` not in mfst                               | KEEP 2 / REMOVE 1       |
| `GeomLProp_*`                   | 4       | P1: F1 fix unlocks `_SLProps`/`_CLProps`/`_CLProps2d`; `_CurveTool` / `_SurfaceTool` not in mfst | KEEP 3 / REMOVE 1       |
| `HLRBRep_SLProps`               | 1       | P1: F1 fix unlocks; HLRBRep_CLProps blocked by `const T*` codegen                                | KEEP                    |
| `NCollection_BasePointerVector` | 1       | Not classified — see [Finding 4](#finding-4-1-phantom-symbol-with-no-occt-source)                | REMOVE                  |
| **Total**                       | **196** |                                                                                                  | **191 REMOVE / 5 KEEP** |

Full list in [Appendix B](#appendix-b--full-remove-list-191-symbols-by-family).

### Finding 3: 6 F1-fix LProps templates that should NOT be removed

The F1 codegen relaxation in [`src/generateBindings.py::processTemplate`](../../repos/opencascade.js/src/generateBindings.py) restored end-to-end binding for the LProps template-typedef family. Six entries appear in the strict-diff REMOVE set because the reference manifest predates the F1 fix, but all six are now compiled into `dist/opencascade_full.{wasm,d.ts}` and exercised by `tests/smoke/smoke-lprops-curvature.test.ts` (10/10 passing). Removing them would re-break the suite.

| Symbol                | F1 status | d.ts entry                                 | Smoke coverage                                  |
| --------------------- | --------- | ------------------------------------------ | ----------------------------------------------- |
| `GeomLProp_SLProps`   | Restored  | `export declare class GeomLProp_SLProps`   | sphere mean/Gaussian, plane zero, cylinder mean |
| `GeomLProp_CLProps`   | Restored  | `export declare class GeomLProp_CLProps`   | circle curvature                                |
| `GeomLProp_CLProps2d` | Restored  | `export declare class GeomLProp_CLProps2d` | exposure check                                  |
| `BRepLProp_SLProps`   | Restored  | `export declare class BRepLProp_SLProps`   | sphere face mean curvature via BRepAdaptor      |
| `BRepLProp_CLProps`   | Restored  | `export declare class BRepLProp_CLProps`   | exposure check                                  |
| `HLRBRep_SLProps`     | Restored  | `export declare class HLRBRep_SLProps`     | exposure check                                  |

Disposition: **KEEP all 6** in YAML.

Sibling tooling classes that are also in the BRepLProp/GeomLProp family but **not part of the F1 set** and not in the manifest's requested list:

| Symbol                  | Reason left out of F1 set                                                                                                                                 | Disposition |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `BRepLProp_CurveTool`   | Free-standing static class, not a template typedef. Was filtered out by the existing bindgen pre-F1 — needs separate investigation if a use case emerges. | REMOVE      |
| `GeomLProp_CurveTool`   | Same as above.                                                                                                                                            | REMOVE      |
| `GeomLProp_SurfaceTool` | Same as above.                                                                                                                                            | REMOVE      |

These three appear in HEAD YAML as anticipatory entries; per the existing stocktake they are facade-covered (callers use `BRepAdaptor_Surface`/`Geom_Surface` directly) and add no surface area. Counting them in the REMOVE bucket gives **191 total REMOVE** + **5 LProps KEEP** + **1 GeomLProp_CLProps2d not in HEAD but to be added/kept** = matches the 196 HEAD-YAML-only entries (with `GeomLProp_CLProps2d` from the F1 session being the +1 vs HEAD).

### Finding 4: 1 phantom symbol with no OCCT source

`NCollection_BasePointerVector` appears in HEAD YAML but `find deps/OCCT/src -iname "*BasePointerVector*"` and `rg "NCollection_BasePointerVector" deps/OCCT/src/` both return zero hits. The class doesn't exist in OCCT V8.

Likely origin: a stale auto-discovery artifact that survived a deletion. It would silently fail the link's `verifyBindings` step (logged as missing, non-fatal in non-strict mode).

Disposition: **REMOVE** unconditionally — there is no binding `.cpp` to link.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Priority | Effort                                                   | Impact                                                                                                                                                                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Add 24 OCCT V8 fork classes (`BRepGraph*`, `ExtremaPC_*`, `GeomBndLib_*`) to `build-configs/full.yml`                                                                                                                                                                                                                                                                                                                                                                                                                                 | P0       | Low                                                      | Re-enables 3 new smoke test files (currently 6 failing tests)                                                                                                                                                                                                                                         | **RESOLVED** — 24 added (plus ~89 additional V8 fork classes the OCCT_ROOT correction surfaced) in `yaml_hash 264825255e01`                                                                                                                                                                                                                                                                                                                    |
| R2  | Remove 191 anticipatory restoration symbols from `build-configs/full.yml` (`AppDef_*`, `ProjLib_*`, `GeomPlate_*`, `HeaderSection_*`, `TopOpeBRep*`, `NCollection_BasePointerVector`, three `*LProp_*Tool` siblings)                                                                                                                                                                                                                                                                                                                  | P0       | Low                                                      | Removes silent verifyBindings warnings; documents the actually-buildable surface                                                                                                                                                                                                                      | **RESOLVED** — all 191 absent from `yaml_hash 264825255e01`; `[PASS] Symbols: 4255 requested, 4872 compiled, 0 missing`                                                                                                                                                                                                                                                                                                                        |
| R3  | Keep the 6 F1-fix LProps templates in YAML (`GeomLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_CLProps2d`, `BRepLProp_SLProps`, `BRepLProp_CLProps`, `HLRBRep_SLProps`)                                                                                                                                                                                                                                                                                                                                                             | P0       | Trivial                                                  | Preserves the LProps work just landed                                                                                                                                                                                                                                                                 | **RESOLVED** — all 6 retained via `_ALWAYS_INCLUDE_TEMPLATE_TYPEDEFS`; `smoke-lprops-curvature.test.ts` 10/10 against the new build                                                                                                                                                                                                                                                                                                            |
| R4  | After R1+R2+R3, regenerate `dist/opencascade_full.{js,wasm,d.ts}` and update `build-configs/opencascade_full.build-manifest.json` so its `yaml_hash` and `requested` list track the new YAML                                                                                                                                                                                                                                                                                                                                          | P1       | Medium (~5 min link, NX-cached if no symbol set changes) | Locks in the new baseline                                                                                                                                                                                                                                                                             | **RESOLVED** — `dist/` + `build-configs/` synced; manifest reports yaml_hash `264825255e01`, 4255 requested / 4872 compiled / 0 missing                                                                                                                                                                                                                                                                                                        |
| R5  | When the next set of restoration entries is pre-staged (Phase 2 of the [non-graphics coverage blueprint](./ocjs-non-graphics-coverage-blueprint.md)), add them in YAML AND run a successful build BEFORE committing — never commit YAML entries that the build hasn't validated                                                                                                                                                                                                                                                       | P1       | Process                                                  | Prevents this drift from recurring                                                                                                                                                                                                                                                                    | **OPEN** (process guidance, applies to future work)                                                                                                                                                                                                                                                                                                                                                                                            |
| R6  | Generalise the historical `Handle_math_NotSquare` / `Handle_math_SingularMatrix` band-aids into a structural rule in `scripts/enumerate-symbols.py::collect_symbols`: drop any `Handle_X` template typedef whose underlying type is `opencascade::handle<X>` when `X` is bound. The class binding for `X` already emits `.smart_ptr<opencascade::handle<X>>("Handle_X")` (in `src/bindings.py:1378`) and a duplicate `class_<Handle_X>("Handle_X")` registration trips Embind's `BindingError: Cannot register type 'Handle_X' twice` | P0       | Low                                                      | Eliminates the OCCT V8 `Handle_Standard_Type` collision and any future `DEFINE_STANDARD_HANDLE`-on-bound-class collisions automatically; collapses the two name-by-name entries in `src/generateBindings.py::_FILTERED_TEMPLATE_TYPEDEFS` and `bindgen-filters.yaml::template_typedefs` into one rule | **RESOLVED** — rule landed in `scripts/enumerate-symbols.py`; 0 `Handle_*` symbols in `yaml_hash 264825255e01`; band-aid entries in `src/generateBindings.py` and `bindgen-filters.yaml` removed with cross-reference comments                                                                                                                                                                                                                 |
| R7  | Bind nested types referenced by V8 fork class signatures: `BRepGraph_NodeId::TypedI<Kind, 10>` / `TypedI<Kind, 11>` template specializations (referenced by `BRepGraph_Builder::Add`) and the `ExtremaPC::SearchMode` enum (referenced by every `ExtremaPC_*::Perform`). The .d.ts currently exports both as `unknown`, so `smoke-brep-graph.test.ts` and `smoke-extrema-pc.test.ts` partially fail on `Cannot call X due to unbound types: …`                                                                                        | P1       | Medium                                                   | Unblocks the remaining 3 failing assertions across `smoke-brep-graph` and `smoke-extrema-pc`                                                                                                                                                                                                          | **RESOLVED (2026-05-14)** — see [R7 Resolution Addendum](#r7-resolution-addendum-2026-05-14) below; 70/70 smoke files / 287/287 tests pass; final YAML 4,488 symbols (`yaml_hash 17cfddd90b01`); architectural fix mechanically extends the bindgen to handle namespace-scoped types + nested-class template specializations + non-type template arguments + canonical-type alias dedup, with zero `additionalBindCode` for OCCT-derived types |

The mechanical R1+R2+R3 edit converges YAML on the manifest baseline plus the F1-fix delta. Net symbol count: **4,317 + 24 − 191 = 4,150** (vs 4,144 manifest baseline, +6 for the F1 LProps templates).

## Appendix A — full ADD list (24 symbols)

All 24 have OCCT V8 source under `deps/OCCT/src/ModelingData/` and a `.cpp` binding generated under `build/bindings/`. They are blocked from the wasm only by the missing YAML entry.

```
BRepGraph
BRepGraph_Builder
BRepGraph_NodeId
BRepGraph_RefId
ExtremaPC_BSplineCurve
ExtremaPC_BezierCurve
ExtremaPC_Circle
ExtremaPC_Curve
ExtremaPC_Ellipse
ExtremaPC_Hyperbola
ExtremaPC_Line
ExtremaPC_OffsetCurve
ExtremaPC_OtherCurve
ExtremaPC_Parabola
GeomBndLib_BSplineCurve
GeomBndLib_BezierCurve
GeomBndLib_Circle
GeomBndLib_Curve
GeomBndLib_Ellipse
GeomBndLib_Hyperbola
GeomBndLib_Line
GeomBndLib_OffsetCurve
GeomBndLib_OtherCurve
GeomBndLib_Parabola
```

## Appendix B — full REMOVE list (191 symbols, by family)

### TopOpeBRepDS\_\* (46) — P6 deprecated, superseded by BRepAlgoAPI

```
TopOpeBRepDS
TopOpeBRepDS_Association
TopOpeBRepDS_BuildTool
TopOpeBRepDS_Check
TopOpeBRepDS_CheckStatus
TopOpeBRepDS_Config
TopOpeBRepDS_Curve
TopOpeBRepDS_CurveData
TopOpeBRepDS_CurveExplorer
TopOpeBRepDS_CurveIterator
TopOpeBRepDS_CurvePointInterference
TopOpeBRepDS_DataStructure
TopOpeBRepDS_Dumper
TopOpeBRepDS_EIR
TopOpeBRepDS_Edge3dInterferenceTool
TopOpeBRepDS_EdgeInterferenceTool
TopOpeBRepDS_EdgeVertexInterference
TopOpeBRepDS_Explorer
TopOpeBRepDS_FIR
TopOpeBRepDS_FaceEdgeInterference
TopOpeBRepDS_FaceInterferenceTool
TopOpeBRepDS_Filter
TopOpeBRepDS_GapFiller
TopOpeBRepDS_GapTool
TopOpeBRepDS_GeometryData
TopOpeBRepDS_InterferenceIterator
TopOpeBRepDS_InterferenceTool
TopOpeBRepDS_Kind
TopOpeBRepDS_ListOfShapeOn1State
TopOpeBRepDS_Marker
TopOpeBRepDS_Point
TopOpeBRepDS_PointData
TopOpeBRepDS_PointExplorer
TopOpeBRepDS_PointIterator
TopOpeBRepDS_Reducer
TopOpeBRepDS_ShapeData
TopOpeBRepDS_ShapeShapeInterference
TopOpeBRepDS_ShapeWithState
TopOpeBRepDS_SolidSurfaceInterference
TopOpeBRepDS_Surface
TopOpeBRepDS_SurfaceCurveInterference
TopOpeBRepDS_SurfaceData
TopOpeBRepDS_SurfaceExplorer
TopOpeBRepDS_SurfaceIterator
TopOpeBRepDS_TOOL
TopOpeBRepDS_Transition
```

### TopOpeBRepBuild\_\* (35) — P6 deprecated

```
TopOpeBRepBuild_Area1dBuilder
TopOpeBRepBuild_Area2dBuilder
TopOpeBRepBuild_Area3dBuilder
TopOpeBRepBuild_AreaBuilder
TopOpeBRepBuild_BlockBuilder
TopOpeBRepBuild_BlockIterator
TopOpeBRepBuild_BuilderON
TopOpeBRepBuild_CompositeClassifier
TopOpeBRepBuild_CorrectFace2d
TopOpeBRepBuild_EdgeBuilder
TopOpeBRepBuild_FaceAreaBuilder
TopOpeBRepBuild_FaceBuilder
TopOpeBRepBuild_FuseFace
TopOpeBRepBuild_GTool
TopOpeBRepBuild_HBuilder
TopOpeBRepBuild_Loop
TopOpeBRepBuild_LoopClassifier
TopOpeBRepBuild_LoopEnum
TopOpeBRepBuild_LoopSet
TopOpeBRepBuild_Pave
TopOpeBRepBuild_PaveClassifier
TopOpeBRepBuild_PaveSet
TopOpeBRepBuild_ShapeListOfShape
TopOpeBRepBuild_ShapeSet
TopOpeBRepBuild_ShellFaceClassifier
TopOpeBRepBuild_ShellFaceSet
TopOpeBRepBuild_ShellToSolid
TopOpeBRepBuild_SolidAreaBuilder
TopOpeBRepBuild_SolidBuilder
TopOpeBRepBuild_Tools
TopOpeBRepBuild_Tools2d
TopOpeBRepBuild_VertexInfo
TopOpeBRepBuild_WireEdgeClassifier
TopOpeBRepBuild_WireEdgeSet
TopOpeBRepBuild_WireToFace
```

### TopOpeBRepTool*\* (21) + TopOpeBRep*\* (27) — P6 deprecated

```
TopOpeBRep
TopOpeBRep_Bipoint
TopOpeBRep_DSFiller
TopOpeBRep_EdgesFiller
TopOpeBRep_EdgesIntersector
TopOpeBRep_FFDumper
TopOpeBRep_FFTransitionTool
TopOpeBRep_FaceEdgeFiller
TopOpeBRep_FaceEdgeIntersector
TopOpeBRep_FacesIntersector
TopOpeBRep_GeomTool
TopOpeBRep_Hctxee2d
TopOpeBRep_Hctxff2d
TopOpeBRep_LineInter
TopOpeBRep_P2Dstatus
TopOpeBRep_Point2d
TopOpeBRep_PointClassifier
TopOpeBRep_PointGeomTool
TopOpeBRep_ShapeIntersector
TopOpeBRep_ShapeIntersector2d
TopOpeBRep_ShapeScanner
TopOpeBRep_TypeLineCurve
TopOpeBRep_VPointInter
TopOpeBRep_VPointInterClassifier
TopOpeBRep_VPointInterIterator
TopOpeBRep_WPointInter
TopOpeBRep_WPointInterIterator
TopOpeBRepTool
TopOpeBRepTool_AncestorsTool
TopOpeBRepTool_BoxSort
TopOpeBRepTool_C2DF
TopOpeBRepTool_CLASSI
TopOpeBRepTool_CORRISO
TopOpeBRepTool_CurveTool
TopOpeBRepTool_FuseEdges
TopOpeBRepTool_GeomTool
TopOpeBRepTool_HBoxTool
TopOpeBRepTool_OutCurveType
TopOpeBRepTool_PurgeInternalEdges
TopOpeBRepTool_REGUS
TopOpeBRepTool_REGUW
TopOpeBRepTool_ShapeClassifier
TopOpeBRepTool_ShapeExplorer
TopOpeBRepTool_ShapeTool
TopOpeBRepTool_SolidClassifier
TopOpeBRepTool_connexity
TopOpeBRepTool_face
TopOpeBRepTool_mkTondgE
```

### AppDef\_\* (30) — P3 internal B-spline approximator (facade: GeomAPI_PointsToBSpline)

```
AppDef_BSpGradient_BFGSOfMyBSplGradientOfBSplineCompute
AppDef_BSpParFunctionOfMyBSplGradientOfBSplineCompute
AppDef_BSpParLeastSquareOfMyBSplGradientOfBSplineCompute
AppDef_BSplineCompute
AppDef_Compute
AppDef_Gradient_BFGSOfMyGradientOfCompute
AppDef_Gradient_BFGSOfMyGradientbisOfBSplineCompute
AppDef_Gradient_BFGSOfTheGradient
AppDef_LinearCriteria
AppDef_MultiLine
AppDef_MultiPointConstraint
AppDef_MyBSplGradientOfBSplineCompute
AppDef_MyGradientOfCompute
AppDef_MyGradientbisOfBSplineCompute
AppDef_MyLineTool
AppDef_ParFunctionOfMyGradientOfCompute
AppDef_ParFunctionOfMyGradientbisOfBSplineCompute
AppDef_ParFunctionOfTheGradient
AppDef_ParLeastSquareOfMyGradientOfCompute
AppDef_ParLeastSquareOfMyGradientbisOfBSplineCompute
AppDef_ParLeastSquareOfTheGradient
AppDef_ResConstraintOfMyGradientOfCompute
AppDef_ResConstraintOfMyGradientbisOfBSplineCompute
AppDef_ResConstraintOfTheGradient
AppDef_SmoothCriterion
AppDef_TheFunction
AppDef_TheGradient
AppDef_TheLeastSquares
AppDef_TheResol
AppDef_Variational
```

### ProjLib\_\* (14) — P4 low-level projection (facade: GeomAPI_ProjectPointOnSurf)

```
ProjLib
ProjLib_CompProjectedCurve
ProjLib_ComputeApprox
ProjLib_ComputeApproxOnPolarSurface
ProjLib_Cone
ProjLib_Cylinder
ProjLib_Plane
ProjLib_PrjFunc
ProjLib_PrjResolve
ProjLib_ProjectOnPlane
ProjLib_ProjectedCurve
ProjLib_Projector
ProjLib_Sphere
ProjLib_Torus
```

### GeomPlate\_\* (9) — P2 surface filling (no current consumer)

```
GeomPlate_Aij
GeomPlate_BuildAveragePlane
GeomPlate_BuildPlateSurface
GeomPlate_CurveConstraint
GeomPlate_MakeApprox
GeomPlate_PlateG0Criterion
GeomPlate_PlateG1Criterion
GeomPlate_PointConstraint
GeomPlate_Surface
```

### HeaderSection\_\* (5) — P5 STEP internals (facade: STEPCAFControl_Reader)

```
HeaderSection
HeaderSection_FileDescription
HeaderSection_FileName
HeaderSection_FileSchema
HeaderSection_Protocol
```

### LProps tooling siblings + phantom (4)

```
BRepLProp_CurveTool
GeomLProp_CurveTool
GeomLProp_SurfaceTool
NCollection_BasePointerVector
```

## Resolution Addendum (2026-05-14)

The [wrap-up plan](/Users/rifont/.cursor/plans/wrap-up-handle-collision_09570709.plan.md) drove R1–R4 and R6 to resolution. Notes worth preserving for the next sweep:

### Build provenance

| Field                | Value                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `yaml_hash`          | `264825255e01`                                                      |
| Total symbols        | 4,255 (vs 4,150 originally projected — see "+89 surprise" below)    |
| Validation           | `[PASS] Symbols: 4255 requested, 4872 compiled, EH helpers present` |
| Smoke (LProps)       | 10/10 passing                                                       |
| Smoke (geom-bnd-lib) | 1/1 passing                                                         |
| Smoke (brep-graph)   | 1/2 passing — see R7                                                |
| Smoke (extrema-pc)   | 1/3 passing — see R7                                                |

### OCCT_ROOT default mismatch (script-level fix)

[`scripts/enumerate-symbols.py`](../../repos/opencascade.js/scripts/enumerate-symbols.py) historically defaulted to `OCJS_ROOT.parent / "OCCT"` (which resolved to `repos/OCCT`, the OCCT 8.0.0-rc5 source the workspace had checked out for prior debugging). The actual build consumes `repos/opencascade.js/deps/OCCT` (the OCCT 8.0.0 final-release vendored copy that drives the link), so symbol enumeration was using a slightly older AST than the build itself. The default was repointed to `OCJS_ROOT / "deps" / "OCCT"`. After the correction the enumerator surfaced **~89 net-new V8 fork classes** that exist in the 8.0.0 final release but were absent from rc5 — these flow through into the YAML automatically and contribute to the 4,255 total being higher than the 4,150 originally projected.

### bindgen-filters.yaml additions

Two new exclusions were added to keep the link clean:

- `exclude.methods.NCollection_DoubleMap: [Find1, Find2]` — both overloads use a non-const lvalue reference for the output value, the same shape that `NCollection_DataMap::Find` and `NCollection_IndexedDataMap::FindFromKey` already had to be excluded for. Embind's `select_overload<>` cannot pick the non-const-output form. Consumers should use the `Seek` / `operator[]` form.
- `exclude.typedefs: VectorOfPoint` — `typedef NCollection_DynamicArray<gp_XYZ> VectorOfPoint;` is declared in **two** OCCT V8 headers (`BRepExtrema_ProximityValueTool.hxx` + `BRepBuilderAPI_VertexInspector.hxx`). The bindgen emits one `VectorOfPoint.cpp` per declaration site, and both define `emscripten::internal::raw_destructor<NCollection_DynamicArray<gp_XYZ>>`, producing a `wasm-ld` duplicate-symbol error. The auto-discovery layer in [`src/ocjs_bindgen/discover.py`](../../repos/opencascade.js/src/ocjs_bindgen/discover.py) already binds the same underlying type under the canonical mangled name `NCollection_DynamicArray_gp_XYZ`, so excluding the user-named alias loses no surface area.

### Removal of duplicate `TColStd_IndexedDataMapOfStringString` registration

The `additionalBindCode` block emitted by `scripts/enumerate-symbols.py::generate_yaml` previously included a hand-written `class_<NCollection_IndexedDataMap<…>>("TColStd_IndexedDataMapOfStringString")` that duplicated the canonical entry in `src/buildFromYaml.py::BUILTIN_ADDITIONAL_BIND_CODE`. Embind rejects duplicate JS public names with `BindingError: Cannot register public name 'TColStd_IndexedDataMapOfStringString' twice`. The script-level entry was removed; `BUILTIN_ADDITIONAL_BIND_CODE` is now the single source of truth. Same reasoning prevents `TopoDS_Bind_*` from being re-emitted at the script layer.

### R6 — `Handle_X` / smart_ptr collision rule (general invariant)

OCCT V8 surfaced `Handle_Standard_Type` as a libclang-visible template typedef because `Standard_Type.hxx:199`'s `DEFINE_STANDARD_HANDLE(Standard_Type, Standard_Transient)` macro now expands within the parsed translation units. Pre-V8 the typedef was masked behind the macro and never reached `tuInfo.templateTypedefs`. The general invariant the rule encodes:

> Any `Handle_X` template typedef whose underlying type is `opencascade::handle<X>` is redundant when `X` is a bound class. The `X` class binding emits `.smart_ptr<opencascade::handle<X>>("Handle_X")` (in [`src/bindings.py:1378`](../../repos/opencascade.js/src/bindings.py)), which already registers the JS public name `"Handle_X"` and gives consumers full smart-pointer semantics. A second `class_<Handle_X>("Handle_X")` block from the typedef binding triggers `BindingError: Cannot register type 'Handle_X' twice` at module instantiation.

The rule lives in [`scripts/enumerate-symbols.py::collect_symbols`](../../repos/opencascade.js/scripts/enumerate-symbols.py) inside the `for child in tuInfo.templateTypedefs:` loop, after the existing `cfg.excluded_*` filters. It runs after the `classes` dict is fully populated (the loop ordering already cooperated, no second-pass refactor needed). The two band-aid sites it superseded:

- [`src/generateBindings.py::_FILTERED_TEMPLATE_TYPEDEFS`](../../repos/opencascade.js/src/generateBindings.py) — the `Handle_math_NotSquare` and `Handle_math_SingularMatrix` entries were removed; only the non-`Handle_` entries (`TColStd_PackedMapOfInteger`, `TColStd_SequenceOfAddress`, `TopTools_IndexedDataMapOfShapeAddress`) remain. A pointer comment to this rule replaces them.
- [`bindgen-filters.yaml::exclude.template_typedefs`](../../repos/opencascade.js/bindgen-filters.yaml) — the same three `Handle_*` entries (`Handle_math_NotSquare`, `Handle_math_SingularMatrix`, `Handle_Standard_Type`) were removed and replaced with a comment cross-referencing the rule.

A `.cpp` file is still generated for `Handle_Standard_Type.cpp` (and any future `Handle_X` collisions) by `compile-bindings`, but [`src/buildFromYaml.py::shouldProcessSymbol`](../../repos/opencascade.js/src/buildFromYaml.py) drops it at link time because the YAML symbol list excludes it. Wasted compile cost is negligible (~3 files at ~1 s each); the architectural correctness gain is that any future `DEFINE_STANDARD_HANDLE` on a bound class is automatically safe — no name-by-name patches required.

### R7 — pre-existing nested-type binding gaps surfaced by the new V8 families

Two of the three new-family smoke tests partially fail with `Cannot call X due to unbound types: …` errors. These are NOT regressions from R6 — they're inherent gaps in the symbol-discovery walker that only became visible once R1 added the V8 fork classes that reference them:

- `smoke-brep-graph.test.ts > BRepGraph_Builder.Add`: `Cannot call BRepGraph_Builder.Add due to unbound types: N16BRepGraph_NodeId5TypedILNS_4KindE10EEE, N16BRepGraph_NodeId5TypedILNS_4KindE11EEE`. `BRepGraph_NodeId::TypedI<Kind, 10>` and `TypedI<Kind, 11>` are nested template instantiations parameterised by `Kind` enum values; the discovery walker enumerates top-level template typedefs but not nested-class template specializations driven by enum non-type template parameters.
- `smoke-extrema-pc.test.ts > {Perform}`: `Cannot call ExtremaPC_Circle.Perform due to unbound types: N9ExtremaPC10SearchModeE`. `ExtremaPC::SearchMode` is a namespace-scoped enum; the discovery walker enumerates class-scoped enums but not namespace-scoped ones (`ExtremaPC` is exposed as a namespace, not a class). The .d.ts currently exports it as `export type ExtremaPC_SearchMode = unknown;` with the parameter typed as `unknown`, confirming the type is referenced but unbound.

Tracking under R7 above. Resolution is out of scope for the wrap-up because it requires extending the symbol-enumeration walker (and likely `bindings.py` codegen to handle namespace-scoped enums properly) — both nested-type families need separate design work and have no consumer in the existing surface, so deferral is safe.

## R7 Resolution Addendum (2026-05-14)

Driven by [`/Users/rifont/.cursor/plans/resolve-r7-nested-types_9ccb2576.plan.md`](/Users/rifont/.cursor/plans/resolve-r7-nested-types_9ccb2576.plan.md). The architectural fix mechanically extends the bindgen — **zero `additionalBindCode` was added for OCCT-derived types** — so every fix scales to future OCCT versions automatically.

### Build provenance (final)

| Field         | Value                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yaml_hash`   | `17cfddd90b01`                                                                                                                                                 |
| Total symbols | 4,488 (4,255 baseline + ~150 namespace-scoped + ~140 nested-class-template + 24 BVH typedef family − 6 canonical-alias dedup − 8 doubly-nested + non-bindable) |
| Validation    | `[PASS] Symbols: 4488 requested, 5261 compiled, 0 missing; EH helpers present`                                                                                 |
| WASM          | `opencascade_full.wasm` 39.10 MB (11.05 MB gzipped)                                                                                                            |
| .d.ts         | `opencascade_full.d.ts` 11,384 KB                                                                                                                              |
| Smoke (full)  | **70/70 files, 287/287 tests** — including `smoke-brep-graph` 2/2 and `smoke-extrema-pc` 3/3 (the original R7 blockers)                                        |

### Architectural fixes landed

Each fix is a single-pass change to the bindgen's mechanical pipeline; together they bind namespace-scoped types and nested-class-template specializations as a first-class surface:

1. **Namespace-aware AST traversal** ([`src/TuInfo.py`](../../repos/opencascade.js/src/TuInfo.py)). `_walk_namespaces` is an explicitly **non-recursive** single-level walker — admitting only `Outer::Type` (not `Outer::Inner::Type`) so the `Namespace_TypeName` JS public name encoding stays unambiguous. Doubly-nested `IMeshData::Model::SequenceOfPnt`-style types are deferred until a real consumer surfaces (see "Future enhancements" below). The `_SKIPPED_NAMESPACES` set excludes stdlib (`std`, `__1`, `__cxxabiv1`, `__gnu_cxx`), Emscripten internals, and `step` (flex/bison generated `step::parser` / `step::scanner` carry private members and union-typed semantic stacks Embind cannot bind).
2. **Namespace-prefixed JS public names** ([`src/bindings.py`](../../repos/opencascade.js/src/bindings.py)). New `getClassJsPublicName` / `getEnumJsPublicName` helpers encode the JS-visible name as `Namespace_TypeName` for namespace-scoped declarations and the bare spelling for top-level declarations. Applied uniformly at every emit site:
   - Embind `EmbindBindings.processClass` / `processEnum` — `class_<Outer::Type>("Outer_Type")`
   - TypeScript `TypescriptBindings.processClass` / `processEnum` — both the declaration site AND the `extends` clause via the new `_baseJsPublicName` helper (avoids `class Derived extends BareBase` when the base lives in a namespace)
   - `EMSCRIPTEN_BINDINGS(<token>)` — guarantees deterministic, collision-free token IDs across alias families
   - Base-class binding uses `baseSpec[0].type.get_canonical().spelling` so the C++ reference is fully-qualified at file scope, AND checks `tuInfo.classDict` to drop `base<X>` when `X` is itself unbound (prevents `Cannot register class derived from unbound class`)
3. **Non-type template arguments** ([`src/generateBindings.py`](../../repos/opencascade.js/src/generateBindings.py)). Introduces `NonTypeTemplateArg` (a duck-typed marker exposing `.spelling`) plus `_split_template_args` (bracket-aware splitter for nested `<…>`). `processTemplate` extracts non-type args from `child.underlying_typedef_type.spelling` (the alias's UNDERLYING spelling) **not** `canonicalType.spelling` — the canonical resolves through every typedef alias to the root, losing the non-type arg when a deeper alias drops it (e.g. `BVH_Vec3d` → `BVH::VectorType<double, 3>::Type` → canonical `NCollection_Vec3<double>` loses the `3`). The underlying preserves the outer template instantiation as written.
4. **Filename strategy alignment** ([`src/generateBindings.py::_output_basename`](../../repos/opencascade.js/src/generateBindings.py)). Generated `.cpp` filenames now use the JS public name (`ExtremaPC_Status.cpp`, `Model_SequenceOfReal.cpp`) so [`src/buildFromYaml.py::_collect_compiled_symbols`](../../repos/opencascade.js/src/buildFromYaml.py) — which strips `.cpp.o` from basenames and uses them as symbol keys — matches namespace-prefixed YAML entries 1:1. Without this, `validate-build.py` would falsely flag every namespace-scoped symbol as "missing" even when the binding compiled successfully.
5. **Stdlib typedef rejection** ([`src/filter/filterTypedefs.py`](../../repos/opencascade.js/src/filter/filterTypedefs.py)). The `_NESTED_TPL_PATTERN` heuristic was over-broad: it admitted any `Outer::Nested<…>` underlying, including `std::deque<…>`. New `_STDLIB_NS_PREFIXES` guard rejects `std::`, `__1::`, `__cxxabiv1::`, `__gnu_cxx::`, and `emscripten::` underlyings before the heuristic, so `IMeshData::Model::SequenceOfPnt` (whose underlying is `std::deque<gp_Pnt, …>`) is correctly skipped. Without this, the bindgen would emit `class_<IMeshData::Model::SequenceOfPnt>(…)` referencing libc++ inline-namespace internals (`__1::deque`) that fail to compile.
6. **NCollection auto-discovery scans `FIELD_DECL`** ([`src/ocjs_bindgen/discover.py`](../../repos/opencascade.js/src/ocjs_bindgen/discover.py)). `_scan_class_methods` previously only walked `CXX_METHOD` cursors, so `NCollection` instantiations referenced solely via class fields (e.g. `ExtremaPC_Result::Extrema` of type `NCollection_DynamicArray<ExtremaPC_ExtremumResult>`) were never discovered. The walker now also visits `FIELD_DECL`, and `_extract_template_args` always uses `arg_type.get_canonical().spelling` so `using` aliases at the call site don't leak context-dependent spellings into the discovered type list.
7. **Canonical-type alias dedup** ([`src/generateBindings.py::dedupeTemplateTypedefsByCanonical`](../../repos/opencascade.js/src/generateBindings.py)). OCCT V8's `BRepGraph_ReverseIterator.hxx` exposes alias families where multiple `using` declarations all instantiate the same primary template (e.g. five aliases all expand to `BRepGraph_ReverseIterator::ParentsOf<BRepGraph_CompoundId>`). Embind keys class registrations by C++ TypeID, so a second `class_<…>("BRepGraph_CompoundsOfShell")` collides with the first registration and aborts Module() with `BindingError: Cannot register type 'BRepGraph_CompoundsOfFace' twice`. The deduper picks the alphabetically-first alias as the canonical winner and drops the rest from the binding pipeline. [`scripts/enumerate-symbols.py`](../../repos/opencascade.js/scripts/enumerate-symbols.py) imports the same helper so the YAML manifest stays in lock-step with the binding generator (otherwise `validate-build.py` would falsely flag the dropped aliases as missing).
8. **Test fixups** ([`tests/smoke/smoke-extrema-pc.test.ts`](../../repos/opencascade.js/tests/smoke/smoke-extrema-pc.test.ts)). The hand-rolled `additionalBindCode` `ExtremumAt(i)` accessor is gone; the test now uses the mechanically-emitted `res.Extrema.Value(i)` (where `Extrema` is the `NCollection_DynamicArray_ExtremaPC_ExtremumResult` field auto-discovered via the FIELD_DECL walker). The `ExtremaPC_ExtremumResult` interface declarations were updated to match the bindgen output verbatim.

### Bindgen-filters additions

Two principled exclusions were added to [`bindgen-filters.yaml`](../../repos/opencascade.js/bindgen-filters.yaml):

- `MathRoot_MultipleGetValueFn` — internal functor struct in `MathRoot::` namespace whose `const math_Vector& mySamples` field implicitly deletes the default constructor. The struct is only used as an ephemeral curry helper inside the `FindAllRoots` template pipeline (driven through the public `MathRoot_AllRootsResult` API). Embind cannot bind a class with a deleted default ctor without a matching `.constructor<…>` declaration, and the struct has no exposed value constructor either.

### Future enhancements (deferred — no current consumer)

- **Multi-level namespace prefixes** for doubly-nested types like `IMeshData::Model::SequenceOfPnt`. Would require the helper, the JS public-name encoder, AND every emit site to agree on a multi-level mangling scheme (e.g. `IMeshData_Model_SequenceOfPnt`).
- **TypeScript alias re-exports for canonical-dedup losers**. Currently consumers wanting `BRepGraph_CompoundsOfShell` must use `BRepGraph_CompoundsOfCompSolid` (the alphabetically-first canonical winner). Emitting `export type BRepGraph_CompoundsOfShell = BRepGraph_CompoundsOfCompSolid` in the .d.ts would preserve the full semantic API surface while keeping a single Embind registration.

## References

- Per-package disposition for the families above: [`docs/research/ocjs-removed-bindings-stocktake.md`](./ocjs-removed-bindings-stocktake.md)
- Multi-phase enablement program: [`docs/research/ocjs-non-graphics-coverage-blueprint.md`](./ocjs-non-graphics-coverage-blueprint.md)
- F1 codegen relaxation that unblocked the LProps templates: [`docs/research/ocjs-bindgen-residual-issues-stocktake.md`](./ocjs-bindgen-residual-issues-stocktake.md)
- OCCT V8 deprecated typedef strategy backing the TopOpeBRep* / AppDef\_* removal verdicts: [`docs/research/ocjs-deprecated-symbol-strategy.md`](./ocjs-deprecated-symbol-strategy.md)
- Wrap-up plan that drove R6 to resolution: [`/Users/rifont/.cursor/plans/wrap-up-handle-collision_09570709.plan.md`](/Users/rifont/.cursor/plans/wrap-up-handle-collision_09570709.plan.md)
- Reference build manifest: `repos/opencascade.js/build-configs/opencascade_full.build-manifest.json`
- Current YAML: `repos/opencascade.js/build-configs/full.yml`
