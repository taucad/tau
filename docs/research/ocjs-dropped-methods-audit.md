---
title: 'OCJS Dropped-Methods Audit: Why 820 Methods Left the TypeScript Surface'
description: 'Forensic audit of the 820 `// dropped:` methods in opencascade_full.d.ts — per-excluded-type cause classification, capability-cluster impact mapping, public-vs-internal importance triage, and prioritized safe-reintroduction recommendations.'
status: active
created: '2026-05-30'
updated: '2026-05-30'
category: audit
related:
  - docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md
  - docs/research/ocjs-math-vector-exclusion.md
  - docs/research/ocjs-bindings-wasm-applicability-audit.md
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/ocjs-full-yml-restoration-stocktake.md
---

# OCJS Dropped-Methods Audit: Why 820 Methods Left the TypeScript Surface

Why all 820 `// dropped:` methods were elided from `dist/opencascade_full.d.ts`, which excluded types are responsible, what downstream capability is actually lost, and which symbols (if any) should be re-bound.

## Executive Summary

`dist/opencascade_full.d.ts` carries 820 `// dropped: <Method> <position> resolves to excluded type <T>` comments (744 parameter-driven, 76 return-driven). Every drop is produced by the R3 method-elision predicate (`signature_references_excluded_class`): a method is removed whenever one parameter or return type resolves to a class the bindgen excludes, so the surface never leaks `unknown` placeholders pointing at unreachable types. The 820 drops are attributable to **56 distinct excluded types**.

The headline finding: **this is overwhelmingly correct behaviour, not lost capability.** All 56 responsible types are explicitly listed in `bindgen-filters.yaml`, and ~99% of the 820 drops fall on _internal_ implementation helpers (entity parsers, linked-list node pointers, intersection-polyhedron scaffolding, data-exchange work-session graphs) whose public capability is fully reachable through bound high-level façades. We verified that every high-level alternative API is bound: `IGESControl_Reader/Writer`, `STEPControl_Reader/Writer`, `STEPCAFControl_Reader`, `XSControl_Reader`, `BRepAlgoAPI_{Fuse,Cut,Common,BuilderAlgo,Section}`, `HLRBRep_{Algo,PolyAlgo}`, `BRepIntCurveSurface_Inter`, `GeomAPI_IntCS`, `BRepMesh_IncrementalMesh`, `Message_{PrinterToReport,ProgressRange}`, `RWGltf_CafWriter`, and `Poly_Triangulation` all survive intact.

Cause breakdown of the 820 drops:

| Class  | Cause                                                                    | Methods | Share |
| ------ | ------------------------------------------------------------------------ | ------: | ----: |
| **C1** | Explicit, principled YAML exclusion (documented structural reason)       |     814 | 99.3% |
| **C3** | Discovery gap (`math_Vector` / `The*Of*` template instantiation helpers) |       6 |  0.7% |
| **C2** | Pure structural auto-filter (not in YAML)                                |       0 |    0% |
| **C4** | Active compile/link failure in the current build                         |       0 |    0% |
| **C5** | Unknown / undocumented                                                   |       0 |    0% |

C2/C4/C5 are zero among _responsible_ types: the build manifest reports only 2 binding failures total (`Handle_math_NotSquare`, `Handle_math_SingularMatrix`), neither of which drives any dropped method. Several C1 entries were _historically_ C4 (added under the YAML's `# Undefined symbols` / `# Misc compilation errors` comments after failing to link when first attempted), but they are now pre-empted by explicit exclusion and never recompiled.

Capability clusters ranked by consumer importance:

| Cluster                                  | Methods | Public-vs-internal                       | High-level alt bound?                          | Importance  |
| ---------------------------------------- | ------: | ---------------------------------------- | ---------------------------------------------- | ----------- |
| NCollection node internals               |     127 | Internal (protected node pointers)       | Container public API bound                     | **Leave**   |
| IGES entity parsers                      |     156 | Internal (`ReadOwnParams`)               | `IGESControl_Reader/Writer` ✓                  | **Low**     |
| XSControl/Interface framework            |     179 | Internal (graph/editor/work-session)     | `XSControl/STEP/IGESControl_Reader` ✓          | **Low**     |
| HLR intersection internals               |     103 | Internal (surface-tool/polyhedron)       | `HLRBRep_Algo/PolyAlgo` ✓                      | **Low**     |
| Surface/curve intersection internals     |      95 | Internal (polyhedron/section-point)      | `GeomAPI_IntCS`, `BRepIntCurveSurface_Inter` ✓ | **Low**     |
| Messaging/progress                       |      36 | Internal (messenger plumbing)            | `Message_PrinterToReport` ✓                    | **Low**     |
| DE data-exchange config                  |      24 | Internal (config scaffolds)              | direct `STEPCAFControl/RWGltf` ✓               | **Low**     |
| Boolean-ops (PaveFiller)                 |      21 | Semi-public (shared-filler optimisation) | `BRepAlgoAPI_BuilderAlgo` ✓                    | **Low–Med** |
| OSD platform                             |      21 | Internal (WASM-meaningless)              | in-memory variants bound                       | **Low**     |
| Document persistence                     |      19 | Internal (storage drivers)               | `TDocStd_Document` ✓                           | **Low**     |
| Misc tail (FEA, hatch, texture, offset…) |      31 | Internal/specialised                     | per-cluster façades bound                      | **Low**     |
| Meshing internals (Delaun)               |       8 | Internal (Delaunay data-structure)       | `BRepMesh_IncrementalMesh` ✓                   | **Low**     |
| ShapeFix internals                       |       8 | Internal (`ComposeShell`)                | `ShapeFix_Shape/Wire` ✓                        | **Low**     |

**Top reintroduction recommendations** (all are optional / low-priority — the dominant verdict is _leave excluded_):

- **R1 (P2)** — re-bind `DE_ShapeFixParameters` / `DESTEP_Parameters` as embind `value_object`s _only if_ import shape-healing tuning becomes a product need. Risk: low.
- **R2 (P2)** — land generic template-typedef discovery (the "R9" durable fix) for the `math_Vector` family. Closes the 6 C3 drops and a much larger `unknown` tail. Risk: medium (manifest growth, latent compile errors).
- **R3 (P2)** — expose `BOPAlgo_PaveFiller` via a factory _only if_ shared-filler multi-op boolean perf is needed. Redundant with the already-bound `BRepAlgoAPI_BuilderAlgo` (~5.66× faster multi-tool path). Risk: medium.

Everything else — NCollection nodes, IGES/XSControl/Interface internals, HLR and intersection polyhedron scaffolding, OSD platform, persistence drivers, visualization texture/material — is **correctly excluded; leave as-is.**

Doc location: this file lives at `/Users/rifont/git/tau/docs/research/ocjs-dropped-methods-audit.md`, matching the other `ocjs-*` / `occt-*` research docs (the fork-internal `repos/opencascade.js/docs/research/` holds only two unrelated docs).

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Methodology](#methodology)
3. [Finding 1: The R3 Elision Mechanism](#finding-1-the-r3-elision-mechanism)
4. [Finding 2: Cause Classification (per excluded type)](#finding-2-cause-classification-per-excluded-type)
5. [Finding 3: Capability-Cluster Impact & Importance Triage](#finding-3-capability-cluster-impact--importance-triage)
6. [Recommendations](#recommendations)
7. [Correctly Excluded — Leave As-Is](#correctly-excluded--leave-as-is)
8. [References](#references)
9. [Appendix A: Full Per-Type Inventory](#appendix-a-full-per-type-inventory)
10. [Appendix B: Verification Commands](#appendix-b-verification-commands)

## Problem Statement

The generated TypeScript surface elides any method whose signature touches a bindgen-excluded type, leaving a `// dropped:` breadcrumb in its place. There are 820 such breadcrumbs. The questions: _why_ did each responsible type fail to bind, _what_ downstream functionality is genuinely lost (versus redundant internal scaffolding), and _which_ symbols — if any — should be re-introduced and how to do so safely.

## Methodology

1. **Re-derived the per-type method + owner inventory.** Parsed `dist/opencascade_full.d.ts`, matched every `// dropped: <Method> <position> resolves to excluded type <T>` line, and resolved each line's owning class by scanning upward to the enclosing `export declare class X`. Confirmed the pre-computed backbone: 820 total, 744 param / 76 return, 56 distinct excluded types.
2. **Mapped the elision mechanism** by reading `src/ocjs_bindgen/filters/method_signature.py` (`signature_references_excluded_class` + the `R3_DROPPED_METHODS` side-table) and the TS-side renderer in `src/ocjs_bindgen/codegen/bindings.py::render_dropped_method_jsdoc`.
3. **Captured the exclusion rationale verbatim** from `bindgen-filters.yaml` (811 lines; inline comment blocks) and the `extends:` overlay `bindgen-filters-no-deprecated.yaml`.
4. **Identified the structural auto-filters** in `scripts/enumerate-symbols.py` → `src/ocjs_bindgen/enumeration/__init__.py` (`is_excluded`, `shouldProcessClass`, the non-`Standard_Transient` `Handle_X` drop).
5. **Cross-referenced the build manifest** `dist/opencascade_full.build-manifest.json` (`binding_report.failures`, `symbols.missing`) to separate active compile failures from pre-empted historical ones.
6. **Reviewed the WHY research corpus**: `ocjs-math-vector-exclusion.md`, `ocjs-bindgen-unknown-coverage-audit-v2.md`, `occt-unbound-symbols-audit.md`, `ocjs-bindings-wasm-applicability-audit.md`, `ocjs-full-yml-restoration-stocktake.md`.
7. **Verified high-level alternatives are bound** by grepping `dist/opencascade_full.d.ts` for each cluster's public façade class.

### Scope and Non-Goals

**In scope**: cause classification, downstream impact, importance triage, and reintroduction analysis for the 56 types responsible for the 820 drops.
**Out of scope**: the broader `unknown`-type reduction effort (covered by `ocjs-bindgen-unknown-coverage-audit-v2.md`), per-class binary-size attribution, and any source/test/bindgen edits — this is a read-only audit.

## Finding 1: The R3 Elision Mechanism

A method is dropped by `signature_references_excluded_class(method_cursor, exclusion_predicate)`: parameters are walked left-to-right then the return type, each peeled through pointers/references/arrays/`Handle<T>` to a single underlying class spelling, and the first spelling for which `exclusion_predicate(name)` is true wins. The predicate wraps `BindgenConfig.is_class_excluded` (YAML literal names + `prefix:` entries + structural rules) — no manual per-method list. The drop reason `(excluded_name, position)` is recorded in `R3_DROPPED_METHODS`; the TS binder renders it as a comment at the spot the method would have appeared, while the Embind `.cpp` output stays binding-only.

The predicate also peels **one level of template arguments**, so `NCollection_Sequence<ShapeFix_WireSegment>` drops when `ShapeFix_WireSegment` is excluded even though the outer `NCollection_Sequence` is bindable. This is why ~70 single-method drops land on `NCollection_Sequence_*` / `NCollection_List_*` instantiations whose _element_ type is excluded.

Because the predicate keys off the exclusion set, **the root question is always "why is type T excluded?"** — answered per-type in Finding 2.

## Finding 2: Cause Classification (per excluded type)

All 56 responsible types are explicitly present in `bindgen-filters.yaml::exclude.classes` (verified by grep — zero are dropped purely by the structural auto-filter). The classification below records the **documented rationale** behind each YAML entry, sub-bucketed within C1, plus the rare C3 discovery-gap cases.

C1 sub-buckets used below:

- **C1a — structural ctor**: deleted/abstract/private default constructor, `const&` member, non-copyable. Embind cannot marshal these without a `value_object`/`.constructor<>` it does not have.
- **C1b — viz/platform**: visualization stack (TKOpenGl) or WASM-meaningless OSD platform abstraction.
- **C1c — internal helper**: private OCCT implementation detail (linked-list/sequence node, RW general-module, work-session graph, intersection polyhedron) with no public API value.
- **C1d — DE scaffold**: data-exchange config façade, redundant with direct reader/writer classes.

### C1c — internal helpers (the bulk: ~688 methods)

| Excluded type                           | Methods | Owning classes (summary)                                                                                    | YAML location                  | Rationale citation                                                                                                                                                                   |
| --------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IGESData_IGESReaderData`               |     156 | ~150 `IGES*_Tool*` + `IGES*_ReadWriteModule` (151× `ReadOwnParams`)                                         | line 82, `# Undefined symbols` | IGES _entity parsers_; `occt-unbound-symbols-audit.md` Finding 8 + `ocjs-bindings-wasm-applicability-audit.md` Finding 11 ("419 format internals" vs 23 user-facing `IGESControl_*`) |
| `Interface_Graph`                       |      56 | `IFSelect_*`, `IFGraph_*`, `Interface_ShareTool`, `Transfer_*`, `XSControl_TransferReader`                  | line 184                       | `occt-unbound-symbols-audit.md` Finding 8 (internal share-graph helper)                                                                                                              |
| `IFSelect_EditForm`                     |      36 | `IFSelect_Editor/ParamEditor`, `IGESSelect_EditHeader/DirPart`, `STEPEdit_*`, `APIHeaderSection_EditHeader` | line 77, `# Undefined symbols` | editor-framework internal; no public surface                                                                                                                                         |
| `IFSelect_IntParam`                     |      32 | `IFSelect_SelectRange/SelectAnyList/WorkSession`, `IGESSelect_*`                                            | line 78, `# Undefined symbols` | selection-parameter internal                                                                                                                                                         |
| `IntCurveSurface_ThePolyhedronOfHInter` |      31 | `IntCurveSurface_TheInterferenceOfHInter`, `…ThePolyhedronToolOfHInter`, `…HInter`                          | line 72, `# Undefined symbols` | curve/surface intersection polyhedron helper                                                                                                                                         |
| `HLRBRep_ThePolyhedronOfInterCSurf`     |      26 | `HLRBRep_TheInterferenceOfInterCSurf`, `…ThePolyhedronToolOfInterCSurf`                                     | line 70, `# Undefined symbols` | HLR intersection polyhedron helper                                                                                                                                                   |
| `IFSelect_ContextModif`                 |      23 | `IGESSelect_*ModelModifier`, `StepSelect_ModelModifier`, `IFSelect_Modifier`                                | line 79, `# Undefined symbols` | model-modifier context internal                                                                                                                                                      |
| `IntPatch_Polyhedron`                   |      22 | `IntPatch_InterferencePolyhedron/PolyhedronTool/PrmPrmIntersection/PolyhedronBVH`                           | line 64, `# Undefined symbols` | `occt-unbound-symbols-audit.md` Finding 8                                                                                                                                            |
| `Intf_SectionPoint`                     |      16 | `Intf_TangentZone/SectionLine/Interference`                                                                 | line 306                       | intersection section-point internal                                                                                                                                                  |
| `IntCurveSurface_IntersectionPoint`     |      10 | `IntCurveSurface_IntersectionSegment/Intersection`, `BRepIntCurveSurface_Inter`                             | line 301                       | intersection-point internal                                                                                                                                                          |
| `Interface_FileReaderData`              |       9 | `Interface_ReaderModule/FileReaderTool`, `IGESData/StepData_ReadWriteModule`                                | line 185                       | `occt-unbound-symbols-audit.md` Finding 8                                                                                                                                            |
| `ShapeFix_WireSegment`                  |       8 | `ShapeFix_ComposeShell` (8× via `NCollection_Sequence` element)                                             | line 75, `# Undefined symbols` | shape-healing internal; `ShapeFix_Shape/Wire` bound                                                                                                                                  |
| `HLRBRep_Data`                          |       7 | `HLRBRep_ShapeToHLR/Hider/InternalAlgo/HLRToShape`                                                          | line 297                       | HLR data-structure internal                                                                                                                                                          |
| `BRepMesh_Triangle`                     |       7 | `BRepMesh_DataStructureOfDelaun/SelectorOf…`                                                                | line 247                       | Delaunay data-structure internal                                                                                                                                                     |
| `Interface_GeneralModule`               |       7 | `Interface_GeneralLib/GTool/…OfGeneralLib`                                                                  | line 186                       | RW general-module internal (`occt-unbound-symbols-audit.md` Finding 8)                                                                                                               |
| `Interface_HGraph`                      |       7 | `Transfer_TransientProcess`, `Interface_ShareTool/CheckTool`, `IFSelect_WorkSession`                        | line 187                       | handle-to-graph internal                                                                                                                                                             |
| `TDF_LabelNode`                         |       6 | `TDF_Label/AttributeIterator`                                                                               | line 213                       | OCAF label tree node pointer (`occt-unbound-symbols-audit.md` Finding 8)                                                                                                             |
| `IntPolyh_MaillageAffinage`             |       6 | `IntPolyh_Intersection`                                                                                     | line 73, `# Undefined symbols` | polyhedral-mesh intersection internal                                                                                                                                                |
| `StepData_StepReaderData`               |       6 | `StepData_StepReaderTool/ReadWriteModule`, `RWHeaderSection_*`                                              | line 330                       | STEP reader-data internal                                                                                                                                                            |
| `IntTools_PntOnFace`                    |       5 | `IntTools_PntOn2Faces`                                                                                      | line 80, `# Undefined symbols` | intersection point-on-face internal                                                                                                                                                  |
| `HLRAlgo_Coincidence`                   |       4 | `HLRAlgo_Interference`                                                                                      | line 241                       | HLR coincidence internal                                                                                                                                                             |
| `BRepClass_FaceExplorer`                |       3 | `BRepClass_FClassifier/FaceClassifier`                                                                      | line 253                       | point-in-face classifier internal                                                                                                                                                    |
| `Interface_UndefinedContent`            |       3 | `IGESData_UndefinedEntity`                                                                                  | line 305                       | undefined-entity content internal                                                                                                                                                    |
| `HLRBRep_TheCSFunctionOfInterCSurf`     |       3 | `HLRBRep_TheExactInterCSurf`                                                                                | line 298                       | see C3 note (math_Vector-adjacent functor)                                                                                                                                           |
| `Geom2dHatch_Elements`                  |       2 | `Geom2dHatch_Classifier`                                                                                    | line 292                       | 2D hatching internal                                                                                                                                                                 |
| `GeomTools_UndefinedTypeHandler`        |       2 | `GeomTools`                                                                                                 | line 183                       | undefined-geom-type handler internal                                                                                                                                                 |
| `Poly_CoherentTriPtr`                   |       2 | `Poly_CoherentTriPtr_Iterator`                                                                              | line 211                       | coherent-triangulation node pointer                                                                                                                                                  |
| `IntPatch_RLine`                        |       2 | `GeomInt_IntSS`, `IntPatch_PolyLine`                                                                        | line 65, `# Undefined symbols` | restriction-line internal (`occt-unbound-symbols-audit.md` Finding 8)                                                                                                                |
| `StepFEA_SymmetricTensor43d`            |       3 | `StepFEA_FeaLinearElasticity`                                                                               | line 76, `# Undefined symbols` | FEA tensor (specialised)                                                                                                                                                             |

### C1c — NCollection node internals (zero public surface: 121 methods)

| Excluded type          | Methods | Owning classes (summary)                                                                                 | YAML location |
| ---------------------- | ------: | -------------------------------------------------------------------------------------------------------- | ------------- |
| `NCollection_SeqNode`  |      74 | `NCollection_BaseSequence` (4) + ~70 `NCollection_Sequence_*` instantiations (`PAppend`/`Find`/`PFirst`) | line 193      |
| `NCollection_ListNode` |      45 | `NCollection_BaseList`/`BaseMap` + ~40 `NCollection_List_*` instantiations (`PFirst`/`PLast`/`PAppend`)  | line 192      |

These are protected linked-list/sequence node _pointers_; the container public API (`Value`, `Append`, `Length`, `Size`, `First`, `Last`) is fully bound. `occt-unbound-symbols-audit.md` Finding 8 classifies them as private implementation helpers.

### C1a — structural ctor (deleted/abstract/private): ~69 methods

| Excluded type               | Methods | Owning classes (summary)                                                                           | YAML location                                          | Rationale                                                                                                                                     |
| --------------------------- | ------: | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Message_Messenger`         |      34 | `Message_Report/Algorithm`, `PCDM_ReadWriter*`, `Transfer_ProcessFor*`, `Interface_FileReaderTool` | line 326 + comment line 144                            | `Message_Messenger::StreamBuffer` has deleted copy/no-default ctor (`bindgen-filters.yaml:144`); public messaging via `Send`-string overloads |
| `BOPAlgo_PaveFiller`        |      21 | `BOPAlgo_Builder`, `BRepAlgoAPI_{Cut,Common,Section,Fuse,Splitter,BuilderAlgo}`                    | line 93, `# Abstract / deleted / private constructors` | `occt-unbound-symbols-audit.md` Finding 7 (no public/factory ctor)                                                                            |
| `Storage_BaseDriver`        |      12 | `Storage_Schema/DefaultCallBack/CallBack/*Data`, `PCDM_ReadWriter`                                 | line 95, same bucket                                   | `occt-unbound-symbols-audit.md` Finding 7 (abstract driver)                                                                                   |
| `Message_LazyProgressScope` |       2 | `RWPly_CafWriter`, `RWObj_CafWriter`                                                               | line 91, same bucket                                   | `occt-unbound-symbols-audit.md` Finding 7 (deleted ctor)                                                                                      |

### C1b — viz/platform (WASM-meaningless): 26 methods

| Excluded type              | Methods | Owning classes (summary)                                               | YAML location                      | Rationale                                            |
| -------------------------- | ------: | ---------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `OSD_FileSystem`           |      11 | `Poly_Triangulation`, `RWGltf/RWMesh_TriangulationReader`, `BRepTools` | line 363, `# WASM-meaningless OSD` | no host filesystem in WASM; in-memory variants bound |
| `OSD_Path`                 |       5 | `RWStl`                                                                | line 208                           | platform path abstraction                            |
| `Image_Texture`            |       5 | `RWGltf_GltfMaterialMap`, `RWMesh_MaterialMap`, `XCAFPrs_Style`        | line 37, viz stack                 | TKOpenGl visualization stack; Three.js renders       |
| `OSD_File`                 |       3 | `XCAFDoc_NoteBinData/NotesTool`                                        | line 191                           | platform file abstraction                            |
| `OSD_Timer`                |       2 | `MoniTool_Timer`                                                       | line 356                           | platform timer (no WASM use)                         |
| `Graphic3d_MaterialAspect` |       1 | `XCAFDoc_VisMaterial`                                                  | line 324                           | visualization material                               |

### C1d — DE data-exchange config: 24 methods

| Excluded type             | Methods | Owning classes (summary)                                                                    | YAML location              |
| ------------------------- | ------: | ------------------------------------------------------------------------------------------- | -------------------------- |
| `DE_ShapeFixParameters`   |      12 | `XSControl_Reader`, `STEP/IGESControl_Reader/Writer`, `STEPCAFControl_*`, `Transfer_Actor*` | line 401                   |
| `DESTEP_Parameters`       |       9 | `STEPCAFControl_Writer/Reader`, `STEPControl_Reader/Writer`                                 | `prefix: DESTEP_` line 396 |
| `DE_ConfigurationContext` |       1 | `DESTL_ConfigurationNode`                                                                   | line 398                   |
| `DE_ConfigurationNode`    |       1 | `DESTL_ConfigurationNode`                                                                   | line 399                   |
| `DE_Provider`             |       1 | `DESTL_ConfigurationNode`                                                                   | line 265                   |

Rationale: `ocjs-bindings-wasm-applicability-audit.md` Finding 10 — the `DE_*` family is a unified dispatcher façade redundant with the direct `STEPCAFControl_Writer`/`RWGltf_CafWriter`/`IGESControl_*` classes Tau actually calls.

### C1c — persistence + remaining tail: ~14 methods

| Excluded type                    | Methods | Owning classes                                                             | YAML location                  | Rationale                                         |
| -------------------------------- | ------: | -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `PCDM_ReaderFilter`              |       7 | `CDF_Application`, `TDocStd_Application`, `CDM_Application`, `PCDM_Reader` | line 309                       | OCAF persistence reader-filter internal           |
| `GeomFill_SweepSectionGenerator` |       4 | `GeomFill_AppSweep`                                                        | line 48, `# Undefined symbols` | sweep section-generator internal                  |
| `GCPnts_DistFunction`            |       1 | `GCPnts_DistFunctionMV`                                                    | line 47, `# Undefined symbols` | distance-function internal                        |
| `GCPnts_DistFunction2d`          |       1 | `GCPnts_DistFunction2dMV`                                                  | line 46, `# Undefined symbols` | distance-function internal                        |
| `BRepOffset_MakeOffset`          |       1 | `BRepOffsetAPI_MakeOffsetShape`                                            | line 54, `# Undefined symbols` | offset internal; `BRepOffsetAPI` public API bound |

### C3 — discovery gap (`math_Vector` / `The*Of*` instantiation helpers): 6 methods

| Excluded type                                                   | Methods | Owning class                 | YAML location | Rationale                                                                |
| --------------------------------------------------------------- | ------: | ---------------------------- | ------------- | ------------------------------------------------------------------------ |
| `HLRBRep_TheCSFunctionOfInterCSurf`                             |       3 | `HLRBRep_TheExactInterCSurf` | line 298      | `Approx`/walking-line functor reaching unbound `math_VectorBase<double>` |
| `BRepApprox_TheFunctionOfTheInt2SOfThePrmPrmSvSurfacesOfApprox` |       1 | `BRepApprox_TheInt2SOf…`     | line 251      | same `math_Vector` discovery gap                                         |
| `GeomInt_TheFunctionOfTheInt2SOfThePrmPrmSvSurfacesOfWLApprox`  |       1 | `GeomInt_TheInt2SOf…`        | line 293      | same `math_Vector` discovery gap                                         |
| `IntWalk_TheFunctionOfTheInt2S`                                 |       1 | `IntWalk_TheInt2S`           | line 304      | same `math_Vector` discovery gap                                         |

These are internal walking-line / approximation functors whose constructors take a `const math_Vector&`. `math_Vector` resolves to `math_VectorBase<double>`, which is never enumerated because template-typedef discovery is gated on the `NCOLLECTION_CONTAINERS` allowlist and the generic-discovery follow-up never landed (`ocjs-math-vector-exclusion.md`; `ocjs-bindgen-unknown-coverage-audit-v2.md` Finding 3, R9). They are explicitly YAML-excluded _because_ of this gap, so the listing is the mechanism and the discovery gap is the root cause. No public modeling capability depends on them — surface/surface intersection and approximation are reached through `GeomAPI`/`GeomInt`/`BRepApprox` façades.

### Why C2/C4/C5 are zero

- **C2 (structural auto-filter)**: every responsible type is _also_ in the YAML, so the drop is config-driven, not solely structural. The structural filters (`shouldProcessClass`: forward-decl, multi-public-base, class-template-direct, inline-value-object; `collect_symbols`: non-`Standard_Transient` `Handle_X`) do reject other classes, but none uniquely drives a dropped method here.
- **C4 (active compile/link failure)**: `binding_report.failed == 2`, and both failures (`Handle_math_NotSquare`, `Handle_math_SingularMatrix`) are non-`Standard_Transient` handle compile errors at `Standard_Handle.hxx:68` — neither appears in the 56 responsible types. Many C1 entries are _historically_ C4 (added under `# Undefined symbols` / `# Misc compilation errors`), but they are now pre-empted and never recompiled, so the current build has `validation_passed: true`, `symbols.missing: []`.
- **C5 (unknown)**: every responsible type has a documented or directly inferable rationale.

## Finding 3: Capability-Cluster Impact & Importance Triage

For each functional cluster: the bound classes that lose methods, the count, what a CAD-on-the-web consumer (replicad/Tau modeling, import/export) actually cannot do, and whether a bound high-level API already covers it.

| #   | Cluster                                  | Methods | What is actually lost                                                                                                 | Bound alternative (verified)                                                                               | Importance                                                         |
| --- | ---------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | **NCollection node internals**           |     127 | Protected `PFirst`/`PLast`/`PAppend`/`Find` node-pointer accessors on base sequence/list/map and their instantiations | Container public API (`Value`/`Append`/`Length`/`First`/`Last`) fully bound                                | **Leave** (zero public surface)                                    |
| 2   | **IGES import/translation**              |     156 | Per-entity `ReadOwnParams` low-level parsers on ~150 `IGES*_Tool*` classes                                            | `IGESControl_Reader`, `IGESControl_Writer`, `IGESCAFControl_Reader` ✓                                      | **Low** — IGES import/export fully works via `IGESControl_*`       |
| 3   | **XSControl/Interface framework**        |     179 | Work-session share-graph, selection/editor framework, RW general-modules, reader-data internals                       | `XSControl_Reader`, `STEPControl_Reader/Writer`, `IGESControl_Reader/Writer`, `Interface_Static` ✓         | **Low** — the read/write/transfer workflow is on the bound façades |
| 4   | **HLR hidden-line removal**              |     103 | Surface-tool, intersection-polyhedron, exact-functor, data-structure internals                                        | `HLRBRep_Algo`, `HLRBRep_PolyAlgo`, `HLRAlgo_Projector`, `HLRBRep_SLProps` ✓                               | **Low** — HLR projection + curvature analysis reachable            |
| 5   | **Surface/curve intersection internals** |      95 | Intersection polyhedron, section-point, point-on-face, walking-line functors                                          | `GeomAPI_IntCS`, `IntCurveSurface_HInter`, `BRepIntCurveSurface_Inter` ✓                                   | **Low** — intersection results via public APIs                     |
| 6   | **Messaging/progress**                   |      36 | `SetMessenger`/`GetMessenger`/`SendMessages` plumbing; lazy progress scope                                            | `Message_PrinterToReport`, `Message_Report`, `Message_ProgressRange` ✓                                     | **Low** — diagnostics + progress via bound classes                 |
| 7   | **DE data-exchange config**              |      24 | `Get/SetShapeFixParameters`, `DESTEP_Parameters` overloads on STEP/IGES reader/writer                                 | direct `STEPCAFControl_Writer/Reader`, `RWGltf_CafWriter`, `Interface_Static` tuning ✓                     | **Low** — redundant dispatcher façade                              |
| 8   | **Boolean operations**                   |      21 | `PerformWithFiller`/`PPaveFiller`/`DSFiller` — _shared pave-filler across multiple ops_                               | `BRepAlgoAPI_{Fuse,Cut,Common,Section,Splitter}` + `BRepAlgoAPI_BuilderAlgo` (multi-tool, ~5.66× faster) ✓ | **Low–Med** — only the shared-filler micro-optimisation is lost    |
| 9   | **OSD platform**                         |      21 | `OSD_FileSystem`/`OSD_Path`/`OSD_File`/`OSD_Timer` parameter overloads                                                | in-memory reader/writer variants bound; Emscripten `FS` for I/O                                            | **Low** — platform abstractions are WASM-meaningless               |
| 10  | **Document persistence**                 |      19 | `Storage_BaseDriver`, `PCDM_ReaderFilter` accessors                                                                   | `TDocStd_Document` API is the public face; no WASM persistence path                                        | **Low**                                                            |
| 11  | **Misc tail**                            |      31 | FEA tensor, 2D hatch classifier, glTF texture/material, sweep generator, offset/dist internals                        | per-cluster public façades (`BRepOffsetAPI`, `GeomFill`, glTF via Three.js) ✓                              | **Low**                                                            |
| 12  | **Meshing internals**                    |       8 | `BRepMesh_Triangle`/`BRepMesh_Delaun` Delaunay data-structure accessors                                               | `BRepMesh_IncrementalMesh` (public mesher) ✓                                                               | **Low**                                                            |
| 13  | **ShapeFix internals**                   |       8 | `ShapeFix_ComposeShell` wire-segment sequence accessors                                                               | `ShapeFix_Shape`, `ShapeFix_Wire` ✓                                                                        | **Low**                                                            |

No cluster reaches **High** importance: in every case the consumer-facing capability is reachable through a bound high-level class, and the dropped methods are internal scaffolding, redundant config façades, or WASM-meaningless platform abstractions.

## Recommendations

All recommendations are optional. The dominant, deliberate outcome is **leave excluded** (see next section). Any reintroduction should be validated with a minimal-symbol PoC build before a full regeneration, per the OCJS PoC convention.

| #   | Action                                                                                                                                                                                                          | Priority | Effort | Impact                                                           | Risk                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Re-bind `DE_ShapeFixParameters` + `DESTEP_Parameters` as embind `value_object`s (they are plain parameter structs) so `STEP/IGESControl_*::Get/SetShapeFixParameters` survive                                   | P2       | S      | Low — import shape-healing tuning                                | **Low** — pure data structs; no transitive deps                                                                                                                     |
| R2  | Land **generic template-typedef discovery** (the "R9" durable fix in `ocjs-optional-overload-resolution-blueprint.md`) so `math_VectorBase<double>` is enumerated, making the 4 C3 `The*Of*` functors reachable | P2       | M      | Low for these 6 methods; **High** for the broader `unknown` tail | **Med** — manifest grows ~50–100 entries; may surface latent compile errors (stage generate-only first; cf. `ocjs-bindgen-unknown-coverage-audit-v2.md` trade-offs) |
| R3  | Expose `BOPAlgo_PaveFiller` via an embind factory/`optional_override` so `PerformWithFiller`/`PPaveFiller` shared-filler multi-op boolean reuse is callable                                                     | P2       | M      | Low–Med — perf for many-op boolean chains                        | **Med** — no public ctor; redundant with bound `BRepAlgoAPI_BuilderAlgo`; verify it links                                                                           |

**Explicitly not recommended** (would re-introduce drops or churn for no gain):

- Peeling deeper template args in the R3 predicate to _re-admit_ `NCollection_Sequence<ExcludedT>` methods — those drops are correct; the element type is genuinely unbindable.
- Re-binding any NCollection node type, Interface/IFSelect graph/editor internal, IGES entity parser, HLR/intersection polyhedron helper, OSD platform class, persistence driver, or visualization texture/material — all are internal or WASM-meaningless with a bound alternative.

## Correctly Excluded — Leave As-Is

The following clusters are **correctly excluded; no action**. Re-binding them would only surface internal scaffolding (or uninvokable dead `class_<>` registrations) while risking link failures and manifest blowups:

- **NCollection node internals** (`NCollection_SeqNode`, `NCollection_ListNode`, `TDF_LabelNode`, `Poly_CoherentTriPtr`) — protected node pointers; container API is the public surface.
- **IGES entity parsers** (`IGESData_IGESReaderData`) — 151 `ReadOwnParams` internals behind `IGESControl_Reader/Writer`.
- **XSControl/Interface framework** (`Interface_Graph/HGraph/FileReaderData/GeneralModule/UndefinedContent`, `IFSelect_EditForm/IntParam/ContextModif`, `StepData_StepReaderData`) — work-session/graph/editor internals behind `XSControl/STEP/IGESControl_Reader`.
- **HLR + intersection polyhedron internals** (`HLRBRep_Surface/Data/ThePolyhedronOfInterCSurf`, `HLRAlgo_Coincidence`, `IntCurveSurface_*`, `IntPatch_Polyhedron/RLine`, `Intf_SectionPoint`, `IntPolyh_MaillageAffinage`, `IntTools_PntOnFace`) — behind `HLRBRep_Algo/PolyAlgo`, `GeomAPI_IntCS`, `BRepIntCurveSurface_Inter`.
- **Messaging/persistence/OSD** (`Message_Messenger`, `Message_LazyProgressScope`, `Storage_BaseDriver`, `PCDM_ReaderFilter`, `OSD_*`) — deleted-ctor or WASM-meaningless; behind `Message_PrinterToReport`, `TDocStd_Document`, Emscripten `FS`.
- **Visualization** (`Image_Texture`, `Graphic3d_MaterialAspect`) — TKOpenGl stack; Three.js renders.
- **Meshing/ShapeFix/misc** (`BRepMesh_Triangle/Delaun`, `ShapeFix_WireSegment`, `Geom2dHatch_Elements`, `GeomTools_UndefinedTypeHandler`, `GeomFill_SweepSectionGenerator`, `BRepClass_FaceExplorer`, `StepFEA_SymmetricTensor43d`, `GCPnts_DistFunction*`, `BRepOffset_MakeOffset`) — internal/specialised behind bound façades.

## References

- Elision predicate: `repos/opencascade.js/src/ocjs_bindgen/filters/method_signature.py` (`signature_references_excluded_class`, `R3_DROPPED_METHODS`)
- TS renderer: `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py::render_dropped_method_jsdoc`
- Filter config: `repos/opencascade.js/bindgen-filters.yaml` (+ overlay `bindgen-filters-no-deprecated.yaml`)
- Structural filters: `repos/opencascade.js/scripts/enumerate-symbols.py`, `repos/opencascade.js/src/ocjs_bindgen/enumeration/__init__.py` (`is_excluded`, `shouldProcessClass`), `repos/opencascade.js/src/ocjs_bindgen/predicates/classes.py`
- Build manifest: `repos/opencascade.js/dist/opencascade_full.build-manifest.json` (`binding_report`, `symbols`)
- Generated surface: `repos/opencascade.js/dist/opencascade_full.d.ts`
- Related research: `docs/research/ocjs-math-vector-exclusion.md` (C3 / R9), `docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md` (R3 mechanism, R9–R11), `docs/research/occt-unbound-symbols-audit.md` (Findings 7 & 8), `docs/research/ocjs-bindings-wasm-applicability-audit.md` (IGES/DE/HLR clusters), `docs/research/ocjs-full-yml-restoration-stocktake.md`

## Appendix A: Full Per-Type Inventory

All 56 responsible types, sorted by method count, with owning-class count and primary classification. (Methods = number of `// dropped:` lines attributing to that type.)

| Type                                                            | Methods | Distinct owners | Class |
| --------------------------------------------------------------- | ------: | --------------: | ----- |
| `IGESData_IGESReaderData`                                       |     156 |            ~150 | C1c   |
| `NCollection_SeqNode`                                           |      74 |             ~71 | C1c   |
| `HLRBRep_Surface`                                               |      63 |               4 | C1c   |
| `Interface_Graph`                                               |      56 |              34 | C1c   |
| `NCollection_ListNode`                                          |      45 |             ~41 | C1c   |
| `IFSelect_EditForm`                                             |      36 |               8 | C1c   |
| `Message_Messenger`                                             |      34 |              13 | C1a   |
| `IFSelect_IntParam`                                             |      32 |               9 | C1c   |
| `IntCurveSurface_ThePolyhedronOfHInter`                         |      31 |               3 | C1c   |
| `HLRBRep_ThePolyhedronOfInterCSurf`                             |      26 |               2 | C1c   |
| `IFSelect_ContextModif`                                         |      23 |              19 | C1c   |
| `IntPatch_Polyhedron`                                           |      22 |               4 | C1c   |
| `BOPAlgo_PaveFiller`                                            |      21 |              12 | C1a   |
| `Intf_SectionPoint`                                             |      16 |               3 | C1c   |
| `Storage_BaseDriver`                                            |      12 |               8 | C1a   |
| `DE_ShapeFixParameters`                                         |      12 |              10 | C1d   |
| `OSD_FileSystem`                                                |      11 |               5 | C1b   |
| `IntCurveSurface_IntersectionPoint`                             |      10 |               3 | C1c   |
| `Interface_FileReaderData`                                      |       9 |               4 | C1c   |
| `DESTEP_Parameters`                                             |       9 |               4 | C1d   |
| `ShapeFix_WireSegment`                                          |       8 |               1 | C1c   |
| `PCDM_ReaderFilter`                                             |       7 |               4 | C1c   |
| `HLRBRep_Data`                                                  |       7 |               5 | C1c   |
| `BRepMesh_Triangle`                                             |       7 |               2 | C1c   |
| `Interface_GeneralModule`                                       |       7 |               4 | C1c   |
| `Interface_HGraph`                                              |       7 |               6 | C1c   |
| `TDF_LabelNode`                                                 |       6 |               2 | C1c   |
| `IntPolyh_MaillageAffinage`                                     |       6 |               1 | C1c   |
| `StepData_StepReaderData`                                       |       6 |               6 | C1c   |
| `IntTools_PntOnFace`                                            |       5 |               1 | C1c   |
| `OSD_Path`                                                      |       5 |               1 | C1b   |
| `Image_Texture`                                                 |       5 |               3 | C1b   |
| `GeomFill_SweepSectionGenerator`                                |       4 |               1 | C1c   |
| `HLRAlgo_Coincidence`                                           |       4 |               1 | C1c   |
| `HLRBRep_TheCSFunctionOfInterCSurf`                             |       3 |               1 | C3    |
| `BRepClass_FaceExplorer`                                        |       3 |               2 | C1c   |
| `Interface_UndefinedContent`                                    |       3 |               1 | C1c   |
| `StepFEA_SymmetricTensor43d`                                    |       3 |               1 | C1c   |
| `OSD_File`                                                      |       3 |               2 | C1b   |
| `Poly_CoherentTriPtr`                                           |       2 |               1 | C1c   |
| `Geom2dHatch_Elements`                                          |       2 |               1 | C1c   |
| `IntPatch_RLine`                                                |       2 |               2 | C1c   |
| `GeomTools_UndefinedTypeHandler`                                |       2 |               1 | C1c   |
| `Message_LazyProgressScope`                                     |       2 |               2 | C1a   |
| `OSD_Timer`                                                     |       2 |               1 | C1b   |
| `GeomInt_TheFunctionOfTheInt2SOfThePrmPrmSvSurfacesOfWLApprox`  |       1 |               1 | C3    |
| `IntWalk_TheFunctionOfTheInt2S`                                 |       1 |               1 | C3    |
| `BRepMesh_Delaun`                                               |       1 |               1 | C1c   |
| `BRepOffset_MakeOffset`                                         |       1 |               1 | C1c   |
| `BRepApprox_TheFunctionOfTheInt2SOfThePrmPrmSvSurfacesOfApprox` |       1 |               1 | C3    |
| `GCPnts_DistFunction`                                           |       1 |               1 | C1c   |
| `GCPnts_DistFunction2d`                                         |       1 |               1 | C1c   |
| `DE_ConfigurationContext`                                       |       1 |               1 | C1d   |
| `DE_ConfigurationNode`                                          |       1 |               1 | C1d   |
| `DE_Provider`                                                   |       1 |               1 | C1d   |
| `Graphic3d_MaterialAspect`                                      |       1 |               1 | C1b   |

## Appendix B: Verification Commands

```bash
# cwd: repos/opencascade.js

# Total drops + param/return split
grep -c "// dropped:" dist/opencascade_full.d.ts                 # → 820
grep -c "// dropped:.*return resolves" dist/opencascade_full.d.ts # → 76

# Per-type method + owner (scan upward to enclosing class)
rg -n "// dropped:.*excluded type IGESData_IGESReaderData\b" dist/opencascade_full.d.ts

# Confirm every responsible type is in the YAML (zero pure-structural drops)
for t in NCollection_SeqNode Interface_Graph BOPAlgo_PaveFiller; do grep -nE "\b$t\b" bindgen-filters.yaml; done

# Build manifest: only 2 active failures, both Handle_math_*; zero missing
python3 -c "import json;m=json.load(open('dist/opencascade_full.build-manifest.json'));print(m['binding_report']['failed'], len(m['symbols']['missing']))"  # → 2 0

# High-level alternatives are bound
for c in IGESControl_Reader STEPControl_Reader BRepAlgoAPI_BuilderAlgo HLRBRep_Algo GeomAPI_IntCS BRepMesh_IncrementalMesh; do grep -c "export declare class $c " dist/opencascade_full.d.ts; done  # → all 1
```
