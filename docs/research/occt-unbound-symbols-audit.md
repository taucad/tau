---
title: 'OCCT Unbound Symbols Audit — `@taucad/opencascade.js`'
description: 'Audit of every excluded OCCT symbol in @taucad/opencascade.js: classifies 142 package, 222 class, and ~190 method/typedef/header exclusions as legitimate, debatable, or fixable, and isolates five technical failure classes blocking bindings with consumer value.'
status: draft
created: '2026-05-11'
updated: '2026-05-11'
category: audit
related:
  - docs/research/occt-v8-final-migration-stocktake-4.md
  - docs/research/occt-v8-final-migration-stocktake-3.md
  - docs/research/occt-v8-rc5-to-release-migration.md
  - docs/research/occt-v8-migration.md
  - docs/research/occt-wasm-module-system.md
---

# OCCT Unbound Symbols Audit — `@taucad/opencascade.js`

Catalogue every excluded OCCT class, package, method, typedef, and header in `repos/opencascade.js`, separate the legitimately-excluded set (visualization, persistence drivers, platform-specific, deprecated, abstract/non-instantiable) from the wrongly-excluded set (real geometry/CAD APIs that should be bound but currently aren't), and characterise the technical failure modes blocking each of the latter so future stocktakes can fix them surgically.

## Executive Summary

`bindgen-filters.yaml` currently excludes **142 packages**, **222 exact-name classes**, **10 class-name prefixes**, **103 per-class method lists**, **2 global methods**, **37 typedefs**, **5 template-typedefs**, and **39 headers**. Of the 397 header-bearing OCCT v8 packages, 100 are excluded and 297 are available; the bound surface is 4144 symbols (4549 compiled bindings — 405 templated NCollection instantiations auto-discovered from bound class signatures). **The overwhelming majority of exclusions are legitimate**: visualization (OpenGl/V3d/AIS/Graphic3d/PrsDim/SelectMgr — Three.js owns rendering, ~600 headers), interactive Draw tools (Draw/DBRep/QABugs/ViewerTest — terminal commands with no web equivalent, ~80 headers), serialisation drivers (TKBin/TKXml/TKStd — filesystem persistence is a JS concern, ~150 headers), platform/window-system (Cocoa/WNT/Xw/D3DHost — non-Wasm platforms, ~20 headers), and dead/deprecated code (TopOpe\* superseded by TKBO BRepAlgoAPI, MAT2d_CutCurve removed, ~180 headers). **Three exclusion buckets are debatable or wrongly excluded** and surface real consumer-impact gaps: (1) the **local-property template alias family** — `BRepLProp_CLProps`/`SLProps`, `GeomLProp_CLProps`/`SLProps`, `HLRBRep_SLProps` — should be bound but tripping a real codegen bug in `processTemplate` (single-`TEMPLATE_REF` requirement violated by `using X = Base<occ::handle<T>>` because nested `handle<>` adds a second `TEMPLATE_REF` child); (2) **`GeomPlate`** is a public surface-filling API (`GeomPlate_BuildPlateSurface`) used by `BRepFill_Filling` — the package-level exclusion saves binary size but blocks an advanced filling workflow consumers might legitimately want; (3) the **"OCCT V8 specific" + "Misc compilation errors" + "Undefined symbols" buckets** (193 classes) are heterogeneous — some are real abstract base classes (correct), some have deleted copy ctors (correct), and a long tail are template-instantiation or `select_overload`-style codegen failures that would now succeed under the Phase A-prime helpers but were never re-attempted. **Five distinct technical issue classes** (F1–F5) explain every legitimately-excluded-by-failure case. F1 (template alias 2-TEMPLATE_REF bug) is the single highest-value fix (5 classes, surface-curvature/normal analysis); F2 (package-prefilter) requires an architectural call about WASM binary budget; F3–F5 are individual class-level fixes that may benefit from a fresh sweep now that bindgen helpers exist.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Methodology](#methodology)
- [Exclusion Inventory](#exclusion-inventory)
- [Findings — Legitimately Excluded](#findings--legitimately-excluded)
- [Findings — Debatable Exclusions](#findings--debatable-exclusions)
- [Findings — Wrongly Excluded (Should Be Bound)](#findings--wrongly-excluded-should-be-bound)
- [Failure Classes — F1 through F5](#failure-classes--f1-through-f5)
- [Recommendations](#recommendations)
- [Appendix A — Full Excluded Package List](#appendix-a--full-excluded-package-list)
- [Appendix B — Class Exclusion Buckets (from filters.yaml)](#appendix-b--class-exclusion-buckets-from-filtersyaml)
- [Appendix C — Method Exclusions](#appendix-c--method-exclusions)

## Problem Statement

After [stocktake-4 closeout](docs/research/occt-v8-final-migration-stocktake-4.md), `binding-report.json` reports `failed: 0, succeeded: 4549` and `dist/opencascade_full.build-manifest.json` reports `validation_passed: true, missing: []`. The build is "clean" in the narrow sense that everything declared in `build-configs/full.yml` compiles and links. But "clean" obscures the more interesting question: **what is _not_ in `full.yml`, why isn't it there, and does the absence reflect a deliberate API-boundary decision or an unresolved binding bug?**

This audit answers three sub-questions:

1. **What is excluded?** Enumerate every `bindgen-filters.yaml` rule and quantify its surface area.
2. **Is the exclusion correct?** For each rule, decide whether it represents a legitimate API-boundary cut (visualization, persistence, deprecated) or a workaround for a real binding-codegen gap.
3. **For the legitimately-excluded-by-failure subset, what is the failure mode?** Group the failures into shared technical classes so a future sweep can target each class with one fix rather than per-class workarounds.

The audit is **descriptive, not prescriptive**: every recommendation is gated on a separate architectural call about WASM binary budget and consumer surface area, neither of which is decided here.

## Scope and Non-Goals

**In scope.**

- All entries under `exclude:` in [`repos/opencascade.js/bindgen-filters.yaml`](https://github.com/taucad/opencascade.js/blob/main/bindgen-filters.yaml): packages, classes, methods, typedefs, template_typedefs, headers, global_methods.
- Semantic AST rejects from [`src/bindings.py::shouldProcessClass`](https://github.com/taucad/opencascade.js/blob/main/src/bindings.py) and [`generateBindings.py::processTemplate`](https://github.com/taucad/opencascade.js/blob/main/src/generateBindings.py) (template-class without typedef; multi-base public hierarchies; multiple `TEMPLATE_REF` children).
- Consumer-facing impact: which OCCT public APIs are reachable from JS even when a particular implementation class is excluded.

**Out of scope.**

- Method-by-method JSDoc gaps and `any` type pollution in the generated `.d.ts` (covered in [stocktake-4 Appendix B](docs/research/occt-v8-final-migration-stocktake-4.md#b-anytype-trend-data)).
- Binary size measurements for each candidate re-inclusion (separate WASM-experiment exercise).
- Replicad re-link or Tau runtime kernel changes — this audit is at the `@taucad/opencascade.js` package boundary.
- Modifications to the OCCT C++ sources or to the Emscripten toolchain.

## Methodology

1. Parsed [`bindgen-filters.yaml`](https://github.com/taucad/opencascade.js/blob/main/bindgen-filters.yaml) into buckets (one per inline comment heading) using a small Python script that tracks `#`-prefixed section markers inside the `classes:` list.
2. Cross-referenced excluded package names against [`deps/OCCT/src/`](https://github.com/Open-Cascade-SAS/OCCT/tree/V8_0_0/src) directory traversal to count headers per package.
3. Read the C++ class declaration for ~40 representative excluded classes (the full universe of bucket headers under "OCCT V8 specific", "Misc compilation errors", "Undefined symbols", and "Abstract / deleted / private constructors") and grouped them by structural property (public ctor count, base class topology, presence of `Standard_DEPRECATED`).
4. Reproduced the `using X = Base<occ::handle<T>>` libclang traversal in a minimal test program to confirm the 2-`TEMPLATE_REF` failure mode is the root cause of the `BRepLProp`/`GeomLProp`/`HLRBRep_SLProps` exclusions.
5. Cross-referenced each excluded "public-looking" class against its bound public-API wrapper to confirm whether the exclusion is replaceable through a higher-level entry point (`BRepOffsetAPI_MakeOffsetShape` for `BRepOffset_MakeOffset`, `APIHeaderSection_MakeHeader` for `HeaderSection_*`, `GeomProjLib` for `ProjLib`, `GeomAPI_PointsToBSpline*` for `AppDef`, `BRepAlgoAPI_*` for `TopOpeBRep*`).
6. Walked the `repos/opencascade.js/build/bindings/<ModuleHierarchy>/` tree to confirm that package-level exclusions short-circuit binding emission entirely (no `.cpp`/`.d.ts.json` is generated for excluded-package members).

## Exclusion Inventory

| Filter category                         | Count | Where defined                                                                                                               |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| Excluded packages                       | 142   | `bindgen-filters.yaml` `exclude.packages`                                                                                   |
| Excluded classes (exact name)           | 222   | `bindgen-filters.yaml` `exclude.classes`                                                                                    |
| Excluded classes (prefix)               | 10    | `bindgen-filters.yaml` `exclude.classes[].prefix`                                                                           |
| Excluded methods (per-class)            | 103   | `bindgen-filters.yaml` `exclude.methods`                                                                                    |
| Excluded global methods                 | 2     | `bindgen-filters.yaml` `exclude.global_methods`                                                                             |
| Excluded typedefs                       | 37    | `bindgen-filters.yaml` `exclude.typedefs`                                                                                   |
| Excluded template typedefs              | 5     | `bindgen-filters.yaml` `exclude.template_typedefs`                                                                          |
| Excluded headers                        | 39    | `bindgen-filters.yaml` `exclude.headers`                                                                                    |
| Deprecated symbols (opt-in to exclude)  | 3     | `bindgen-filters.yaml` `deprecated.symbols`                                                                                 |
| Semantic AST rejects (not configurable) | n/a   | `src/bindings.py::shouldProcessClass`, `src/generateBindings.py::processTemplate`, `src/filter/filterMethodOrProperties.py` |

Of the 397 header-bearing OCCT v8 packages discovered under `deps/OCCT/src/`, 100 are matched by an exclude entry (some package names in `exclude.packages` are toolkit names like `TKBin`/`TKXml` that do not themselves host headers — they are listed alongside their member packages so partial-toolkit exclusions stay legible). The 297 available packages span 5728 `.hxx` files; from those, the bindgen materialises 4144 explicit symbols in `full.yml` plus 405 auto-discovered NCollection instantiations.

### Bindgen pipeline gate sequence

The order of filter application matters for diagnosing why a particular class is unbound:

```mermaid
flowchart TB
  occt[OCCT v8 source headers] --> pkg{Package excluded\nin filters.yaml?}
  pkg -->|yes| skip1[No .cpp / .d.ts.json emitted\nNo entry in build/bindings/]
  pkg -->|no| ast[libclang AST walk]
  ast --> kind{CLASS_DECL or\nSTRUCT_DECL ?}
  kind -->|TYPE_ALIAS_DECL with template| tpl[processTemplate]
  kind -->|class with multi-base| skip2[shouldProcessClass returns False]
  kind -->|class| cls{Class name excluded\n(exact or prefix)?}
  cls -->|yes| skip3[No emit]
  cls -->|no| codegen[EmbindBindings.processClass]
  tpl --> trefs{Exactly 1\nTEMPLATE_REF child?}
  trefs -->|no| skip4[SkipException: not 1!]
  trefs -->|yes| codegen
  codegen --> meth[Per-method filter]
  meth --> emit[Emit .cpp + .d.ts.json]
```

Skip points `skip1`–`skip4` correspond to the four common reasons a class never reaches codegen. `skip1` accounts for every member of the 142 excluded packages; `skip2` is the multi-base reject (rare in OCCT but real for some `AIS_*` classes); `skip3` is the bulk of the 222 named excludes; `skip4` is the **F1** failure class characterised in [Failure Classes](#failure-classes--f1-through-f5) below.

## Findings — Legitimately Excluded

These 11 sub-categories cover **~94% of the exclusion surface** and are correctly excluded. Re-binding any of them would either add dead code (visualization, persistence) or duplicate a higher-level entry point already bound.

### Finding 1: Visualization stack — Three.js owns rendering

**Excluded packages**: `AIS`, `Aspect`, `Cocoa`, `D3DHost`, `Font`, `Graphic3d`, `Image`, `Media`, `MeshVS`, `OpenGl`, `Prs3d`, `PrsDim`, `PrsMgr`, `Select3D`, `SelectBasics`, `SelectMgr`, `Shaders`, `StdPrs`, `StdSelect`, `TKD3DHost`, `TKIVtk`, `TKMeshVS`, `TKOpenGl`, `TKOpenGles`, `TKService`, `TKV3d`, `TKVCAF`, `TPrsStd`, `V3d`, `WNT`, `Wasm`, `Xw`. **Excluded class prefixes**: `IVtk`, `Cocoa`, `D3DHost`. **Excluded named classes**: 17 (`AIS_ColoredShape`, `Graphic3d_BSDF`, `Image_Texture`, `Prs3d_Drawer`, `SelectMgr_SelectableObject`, etc.).

**Header count**: ~600 across all visualization packages.

**Why correct**: Tau renders all CAD geometry through Three.js (`docs/policy/graphics-backend-policy.md`). OCCT's V3d/AIS/Graphic3d/OpenGl pipelines target native windowing systems (Cocoa/WNT/Xw) and require TKOpenGl, which has no WebGL/WebGPU bridge in this build. Binding `AIS_InteractiveContext` or `V3d_Viewer` would inject 600+ symbols that immediately fail with `unresolved external` at link time (the [`stocktake-4 Appendix C` predecessor analysis](docs/research/occt-v8-final-migration-stocktake-4.md) recorded ~85 undefined linker symbols from the visualization stack alone).

**Verdict**: ✅ Keep excluded.

### Finding 2: Interactive Draw tools — terminal commands, no web equivalent

**Excluded packages**: `Draw`, `DBRep`, `DrawTrSurf`, `TKDraw`, `TKDCAF`, `DDF`, `DDataStd`, `DDocStd`, `DNaming`, `DPrsStd`, `DrawDim`, `DrawFairCurve`, `GeometryTest`, `GeomliteTest`, `HLRTest`, `MeshTest`, `BOPTest`, `BRepTest`, `SWDRAW`, `ViewerTest`, `OpenGlTest`, `D3DHostTest`, `IVtkDraw`, `QABugs`, `QADraw`, `QADNaming`, `QANCollection`, `TKQADraw`, `TKTopTest`, `TKViewerTest`, `XSDRAW`, `XDEDRAW`, `XSDRAWIGES`, `XSDRAWSTEP`, `XSDRAWSTLVRML`, `DRAWEXE`, and ~15 more `TKXSDRAW*` toolkits. **Excluded class prefix**: `BRepTest`.

**Header count**: ~80.

**Why correct**: OCCT's `Draw` is a Tcl-style interactive command shell (`draw.exe`) used for OCCT regression testing — it has no programmatic API surface relevant to JS consumers. Every excluded `*Test`/`Q*`/`*DRAW*` toolkit follows the same pattern: command implementations register themselves into the `Draw` interpreter and have no entry point usable outside that interpreter.

**Verdict**: ✅ Keep excluded.

### Finding 3: Persistence and serialisation drivers — JS owns I/O

**Excluded packages**: `TKBin`, `TKBinL`, `TKBinTObj`, `TKBinXCAF`, `TKStd`, `TKStdL`, `TKTObj`, `TKXml`, `TKXmlL`, `TKXmlTObj`, `TKXmlXCAF`, plus 27 member packages (`BinDrivers`, `BinMDataStd`, `BinMDataXtd`, `BinMNaming`, `BinMFunction`, `BinMDocStd`, `BinObjMgt`, `BinTObjDrivers`, `BinXCAFDrivers`, `BinMXCAFDoc`, `BinLDrivers`, `BinMDF`, `StdDrivers`, `StdObject`, `StdPersistent`, `StdLDrivers`, `StdLPersistent`, `StdObjMgt`, `StdStorage`, `ShapePersistent`, `TObj`, `TObjDRAW`, `XmlDrivers`, `XmlLDrivers`, `XmlMDF`, `XmlMDataStd`, `XmlMDataXtd`, `XmlMDocStd`, `XmlMFunction`, `XmlMNaming`, `XmlMXCAFDoc`, `XmlObjMgt`, `XmlTObjDrivers`, `XmlXCAFDrivers`). **Excluded class prefix**: `ShapePersistent_`.

**Header count**: ~150.

**Why correct**: OCCT's binary and XML persistence drivers are designed to read/write to native filesystem paths via OCCT's `OSD_File`/`FSD_File` (themselves excluded — see Finding 7). Tau's WASM consumers manage filesystem I/O through `@taucad/filesystem` and the runtime FS bridge; they receive byte buffers, not filesystem paths. The right OCCT entry points for JS consumers are the `*CAFControl_*` Reader/Writer family (STEP, IGES, glTF, OBJ, PLY, STL, VRML — all bound) which accept `std::istream`/`std::ostream` or buffer-backed adapters.

**Verdict**: ✅ Keep excluded.

### Finding 4: Platform-specific window-system + native filesystem

**Excluded packages**: `Cocoa`, `WNT`, `Xw`, `D3DHost`, `D3DHostTest`. **Excluded named**: `Xw_Window`, `WNT_HIDSpaceMouse`, `OSD_FileNode`, `OSD_File`, `OSD_Path`. **Excluded headers**: `OSD_WNT.hxx`, `WNT_Dword.hxx`, `OSD_Parallel.hxx`, `OSD_ThreadPool.hxx`, `Standard_Atomic.hxx`.

**Why correct**: macOS/Windows/X11 window-system classes; Windows-only filesystem and HID; threading primitives that Emscripten WASM cannot host (no `pthread_create` in the single-threaded build configuration this package targets).

**Verdict**: ✅ Keep excluded.

### Finding 5: VTK visualization toolkit — separate ecosystem

**Excluded packages**: `IVtk`, `IVtkOCC`, `IVtkTools`, `IVtkVTK`, `IVtkDraw`. **Excluded headers**: 12 `IVtk*.hxx` and `IVtkDraw_*.hxx`. **Excluded class prefix**: `IVtk`.

**Why correct**: VTK is a separate visualization/analysis toolkit; Tau does not embed VTK. Binding these classes would create linker errors against missing `vtkObject` / `vtkDataObject` symbols.

**Verdict**: ✅ Keep excluded.

### Finding 6: Deprecated APIs (TopOpe\*, MAT2d_CutCurve, BSplCLib globals)

**Excluded packages**: `TopOpeBRep`, `TopOpeBRepBuild`, `TopOpeBRepDS`, `TopOpeBRepTool` (174 headers — TKBool legacy boolean ops, replaced by TKBO `BRepAlgoAPI_*`). **Excluded named**: `MAT2d_CutCurve`, `LocOpe_Revol`, `LocOpe_RevolutionForm`, `LocOpe_CSIntersector`, `LocOpe_CurveShapeIntersector`, `Standard_ErrorHandler` (uses `setjmp`), `BSplCLib`, `BSplCLib_CacheParams`, `Limits` (global), `ReadStreamList` (global).

**Why correct**: The `TopOpeBRep*` family is the pre-TKBO boolean operations engine; OCCT v8 still ships the headers because internal code (`BRepFilletAPI_MakeFillet`, `ChFi3d`, `BRepFill_TrimShellCorner`) still depends on them, but the **public-facing entry point** is `BRepAlgoAPI_{Fuse,Cut,Common,Section}` (all bound). JS consumers should never instantiate `TopOpeBRep_DSFiller` directly — the boolean ops are entirely covered by `BRepAlgoAPI`. `MAT2d_CutCurve`, `LocOpe_Revol*`, and `Standard_ErrorHandler` are explicitly marked deprecated in OCCT v8.

**Verdict**: ✅ Keep excluded.

### Finding 7: Abstract / deleted-ctor / private-ctor classes

**Excluded named**: `PrsDim_Dimension`, `FSD_BinaryFile`, `FSD_File`, `Font_BRepFont`, `Message_LazyProgressScope`, `BOPAlgo_PaveFiller`, `Graphic3d_CubeMap`, `Storage_BaseDriver`, `AIS_Dimension`, plus ~30 more across the "OCCT V8 specific" and "Misc compilation errors" buckets that have either `= delete` copy ctors, all-protected constructors, or `Standard_OutOfMemory`-style abstract bases.

**Why correct**: Embind requires either a public default constructor or `class_<>` with `.allow_subclass(...)`. Classes with deleted copy ctors that lack a public default ctor cannot be instantiated from JS. Subclass interfaces (`AIS_Dimension` → user must subclass) require the embind `wrapper` macro, which doesn't compose with OCCT's `DEFINE_STANDARD_RTTIEXT` RTTI macro chain.

**Verdict**: ✅ Keep excluded.

### Finding 8: Internal helpers / single-use private classes

**Excluded named**: `Geom2dEvaluator`, `BRepApprox_Approx`, `BRepApprox_ResConstraintOfMyGradientbisOfTheComputeLineOfApprox`, `IntPatch_Polyhedron`, `IntPatch_RLine`, `NCollection_ListNode`, `NCollection_SeqNode`, `TDF_LabelNode`, `Poly_CoherentTriPtr`, `Interface_Graph`, `Interface_FileReaderData`, `Interface_GeneralModule`, `Interface_HGraph`, `StepData_GeneralModule`, `StepData_DefaultGeneral`, `RWHeaderSection_GeneralModule`, `RWStepAP214_GeneralModule`, `Geom_HSequenceOfBSplineSurface`, ~30 more.

**Why correct**: These are private OCCT implementation helpers (linked-list/sequence node types, gradient resolvers internal to approximation algorithms, RW (Read-Write) general-modules that exist solely to populate `Interface_Static`). They have no public API value — every consumer-facing operation that uses them is itself bound through a higher-level wrapper.

**Verdict**: ✅ Keep excluded.

### Finding 9: Threading / BVH / parallel primitives (single-threaded WASM)

**Excluded headers**: `BVH_LinearBuilder.hxx`, `BVH_RadixSorter.hxx`, `BVH_DistanceField.hxx`, `BVH_IndexedBoxSet.hxx`, `BOPTools_Parallel.hxx`, `OSD_Parallel.hxx`, `OSD_ThreadPool.hxx`, `Standard_Atomic.hxx`, `MathLin_Jacobi.hxx`. **Excluded packages**: many BVH classes also live inside the visualization packages (already excluded).

**Why correct**: This OCJS build is single-threaded (`-pthread` is not enabled — see `docs/research/safari-wasm-relaxed-simd-incompatibility.md` for the Safari SIMD baseline rationale). Parallel BVH builders and atomic primitives either fail to compile (`std::atomic<T>` operations not constexpr in WASM single-thread) or link against missing pthread symbols.

**Verdict**: ✅ Keep excluded — these would re-enter as opt-in when/if the multithreaded WASM build ever ships (separate research).

### Finding 10: Naming clash / replaced by modern equivalent

**Excluded package**: `XBRepMesh` (1 header — clashes with `BRepMesh` namespace, deprecated wrapper). **Excluded named**: `BRepMesh_Triangle`, `BRepMesh_Delaun` (legacy internal mesh helpers replaced by `BRepMesh_IncrementalMesh`).

**Verdict**: ✅ Keep excluded.

### Finding 11: Method-level exclusions with sound rationale

103 per-class method exclusions plus 2 global. Patterns observed:

- **Dump methods**: `FairCurve_Batten::Dump`, `BinTools_Curve2dSet::Dump`, `Standard_Dump` — write to `std::ostream` which embind cannot marshal.
- **OSD/filesystem-coupled**: `OSD::RealToCString`, `OSD_Thread::Wait` — same rationale as Finding 4.
- **Non-const enum-ref output params** (OCCT v8 codegen rejection): `Geom2dGcc_Lin2dTanObl::IsParallel2`, `Quantity_Color::Values/ColorFromName`, `TopAbs::Compose/Reverse`, `Bnd_Box::Get/GetGap`, `BRepClass3d_SolidExplorer::GetTree/Intersector`, `Message_Messenger::GetTraceLevel/ChangePrinters` — non-const lvalue reference output to enum types cannot round-trip through embind without explicit `additionalBindCode` wrappers (left out for cost-benefit).
- **NCollection lvalue-ref output**: `NCollection_DataMap::Find`, `NCollection_IndexedDataMap::FindFromKey` — non-const lvalue reference output, same as above.
- **Visualization stubs**: `OpenGl_Context::ChangeClipping`, `OpenGl_View::SetTextureEnv`, `Graphic3d_GraduatedTrihedron::CubicAxesCallback` — depend on TKOpenGl symbols.
- **Removed in OCCT v8**: `Limits`, `ReadStreamList`, `BSplCLib::DN`, `Resource_Unicode::*` (entire class).

**Verdict**: ✅ Keep excluded individually; **revisit** the non-const enum-ref pattern in a future bindgen sweep (Finding 14 below).

## Findings — Debatable Exclusions

These categories are legitimately excluded today but the boundary is debatable and a future architectural decision could move them back into the bound set.

### Finding 12: `GeomPlate` (9 headers) — advanced surface-filling API

**Excluded**: `GeomPlate_Aij`, `GeomPlate_BuildAveragePlane`, `GeomPlate_BuildPlateSurface`, `GeomPlate_CurveConstraint`, `GeomPlate_MakeApprox`, `GeomPlate_PlateG0Criterion`, `GeomPlate_PlateG1Criterion`, `GeomPlate_PointConstraint`, `GeomPlate_Surface`.

**Why excluded**: `bindgen-filters.yaml` line 604, "Deprecated in OCCT 8 (TopOpe\*), STEP header internals, approximation / plate / projection packages pulled in transitively — excluded for WASM binary size reduction."

**Debate**:

- `GeomPlate_BuildPlateSurface` is a **public, non-deprecated API** for surface filling under G0/G1/G2 constraints — `BRepFill_Filling` (currently bound) wraps it but does NOT expose the lower-level criteria-tuning surface that some advanced consumers might want.
- The package's transitive footprint is small (9 headers) versus the high-touch `GeomFill_*` family (bound).
- Tau's existing replicad pipeline does not use `GeomPlate` directly; the advanced-CAD-agent workflow described in [`docs/research/agentic-cad-geometric-intent-preservation.md`](docs/research/agentic-cad-geometric-intent-preservation.md) might.

**Verdict**: 🟡 Excluded for binary size, but the package is public and not deprecated. **Re-evaluate** when an agent or replicad workflow needs surface-from-curve-network filling. Estimated WASM cost: TBD (separate experiment).

### Finding 13: `ProjLib` (17 headers), `AppDef` (30 headers), `HeaderSection` (5 headers) — internal helpers with bound facades

**Excluded packages**: `ProjLib`, `AppDef`, `HeaderSection`.

**Why excluded**: Same line 604 rationale as Finding 12.

**Debate**:

- `ProjLib`: lower-level curve-on-surface projection helpers. Public-facing wrapper `GeomProjLib` (bound) and `BRepProj_Projection` (in `BRepProj` package — bound) cover the consumer use case. Direct `ProjLib_*` usage is rare even in OCCT's own codebase outside `BRep_Tool`/`ChFi3d`.
- `AppDef`: low-level B-spline approximation engine. Public-facing wrappers `GeomAPI_PointsToBSpline`/`Geom2dAPI_PointsToBSpline`/`GeomAPI_PointsToBSplineSurface` (all bound) cover the consumer use case. Direct `AppDef_Compute` usage requires constructing `AppDef_MultiLine`/`AppDef_MultiPointConstraint` collections by hand — uncommon.
- `HeaderSection`: STEP file header internals (`HeaderSection_FileDescription`, `HeaderSection_FileName`, `HeaderSection_FileSchema`, `HeaderSection_Protocol`). Public-facing wrapper `APIHeaderSection_MakeHeader`/`APIHeaderSection_EditHeader` (both bound) cover the consumer use case.

**Verdict**: 🟡 Excluded for binary size, **acceptable** because public facades exist and cover the typical use case. **Re-evaluate** only if a specific consumer reports a missing capability the facades cannot reach.

### Finding 14: Non-const enum-ref output methods — codegen pattern gap

**Affected methods**: ~25 across the `exclude.methods` map (sample: `Geom2dGcc_Lin2dTanObl::IsParallel2`, `Quantity_Color::Values/ColorFromName`, `TopAbs::Compose/Reverse`, `Bnd_Box::Get/GetGap`, `Bnd_Box2d::Get/GetGap`, `ChFi3d::ConcaveSide/NextSide/SameSide`, `Message_Messenger::GetTraceLevel/ChangePrinters`).

**Why excluded**: OCCT v8 introduced stricter enum types (scoped enums replacing typedef'd ints); the bindgen's existing non-const `T&` output-param wrapper assumes integer-like or transient types. Enum-by-reference is the gap.

**Verdict**: 🟡 Fixable with a small bindgen extension (apply the existing `getReferenceValue`/`updateReferenceValue` `emscripten::val` pattern to enums, treating them as integers underneath). Estimated effort: 1 day. Estimated impact: ~25 method-row recoveries across high-value classes (`Bnd_Box`, `Quantity_Color`, `TopAbs`).

## Findings — Wrongly Excluded (Should Be Bound)

These exclusions remove legitimately-useful APIs and are caused by **fixable bindgen bugs** rather than architectural decisions.

### Finding 15: Local-property template aliases — F1 codegen bug

**Affected**: `BRepLProp_CLProps`, `BRepLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_SLProps`, `HLRBRep_SLProps`.

**What these classes do**: They are the canonical OCCT API for **differential geometric properties** of curves and surfaces — at a given parameter, compute the point, tangent, normal, principal curvatures (max/min/mean/Gaussian), umbilic detection, and curvature directions. Any geometric reasoning agent (curvature-driven meshing, feature detection, surface analysis, normal-vector queries) needs them. There is no higher-level facade — these _are_ the API.

**Root cause**: OCCT v8 converted these from concrete classes to C++14 template aliases:

```cpp
// deps/OCCT/src/ModelingData/TKGeomBase/GeomLProp/GeomLProp_SLProps.hxx
template <typename SurfaceType, typename Access = LProp_SurfaceUtils::DirectAccess>
class GeomLProp_SLPropsBase { /* … */ };

using GeomLProp_SLProps = GeomLProp_SLPropsBase<occ::handle<Geom_Surface>>;
```

`src/generateBindings.py::processTemplate` requires exactly one `TEMPLATE_REF` child cursor:

```python
def processTemplate(child):
  templateRefs = list(filter(lambda x: x.kind == clang.cindex.CursorKind.TEMPLATE_REF, child.get_children()))
  if len(templateRefs) != 1:
    raise SkipException("The number of template refs for the template typedef \"" + child.spelling + "\" is not 1!")
```

Reproduced in a minimal libclang harness:

```python
# using MyAlias = Base<occ::handle<Geom_Surface>>;
# AST children:
#   TEMPLATE_REF: Base       ← outer template
#   NAMESPACE_REF: occ
#   TEMPLATE_REF: handle     ← inner template (handle<Geom_Surface>)
#   TYPE_REF: class Geom_Surface
# count: 2  ← trips the SkipException
```

The check was written before OCCT v8's adoption of `using = Template<occ::handle<T>>` aliases. Pre-v8 OCCT used `typedef Base<...> X;` patterns where `handle` was buried inside a typedef, producing only one outer TEMPLATE_REF. The 5 LProps classes are the only public OCCT v8 API hit by this specific pattern; replicating the issue elsewhere would require another `using = Outer<handle<Inner>>` instantiation.

**Fix**: Three viable paths:

1. **Filter only outer TEMPLATE_REFs in `processTemplate`** — change the filter from "exactly 1 TEMPLATE_REF child" to "exactly 1 TEMPLATE_REF whose semantic parent is the alias declaration's enclosing scope" (or simply "take the first TEMPLATE_REF"). The outer ref is always emitted first by libclang.
2. **Explicit `additionalBindCode` instantiation** — hand-write `class_<GeomLProp_SLProps>("GeomLProp_SLProps")` with the full method surface in `build-configs/full.yml`. Tedious (each LProps class has 15-20 methods) but local.
3. **Combine** — apply (1) to recover the codegen automatically, fall back to (2) for any residual.

Preferred path: **(1)** because it generalises to any future `using = Outer<handle<T>>` pattern OCCT adopts.

**Verdict**: ❌ Should be bound. Fix `processTemplate` filter (Recommendation R1).

### Finding 16: Static-utility class exclusions that might have shifted post-Phase-A-prime

**Candidates worth re-attempting** (subset of "OCCT V8 specific" and "Misc compilation errors" buckets):

| Class                               | Reason originally excluded                      | Phase A-prime helper likely to unblock |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------- |
| `GccEnt`                            | Static utility namespace, member access pattern | R-E1 nested-class qualifier            |
| `IntImpParGen`                      | Same                                            | R-E1                                   |
| `BRepOffset_Tool`                   | Static utility namespace                        | R-E1                                   |
| `BRepBlend_Walking`                 | Non-copyable return                             | R-G1 non-copyable return wrapper       |
| `BRepClass_FaceExplorer`            | Non-copyable + nested iter                      | R-F2 substituted canonical templates   |
| `BRepFill_TrimSurfaceTool`          | Same                                            | R-F2                                   |
| `IntCurveSurface_IntersectionPoint` | Field-of-struct issues                          | R-F1 wire-safe field screen            |
| `Intf_SectionPoint`                 | Same                                            | R-F1                                   |
| `LocOpe_CSIntersector`              | Field-of-struct + non-copyable                  | R-F1 + R-G1                            |
| `TopOpeBRepBuild_GIter`             | Iterator pattern + non-copyable                 | R-F2                                   |
| `BRepGProp_MeshProps`               | Field-of-struct                                 | R-F1                                   |

These 11 were excluded during the V8 RC migration and have not been re-attempted since the Phase A-prime helpers landed (R-E1 nested-class qualifier, R-F1 wire-safe field screen, R-F2 substituted canonical templates, R-G1 non-copyable return wrapper, all documented in [stocktake-3](docs/research/occt-v8-final-migration-stocktake-3.md)). **None has been re-attempted**; a fresh sweep would likely recover a non-trivial subset.

**Verdict**: ❌ At least some should be bound. Targeted re-attempt sweep (Recommendation R2).

### Finding 17: Auto-generated NCollection aliases for excluded-package types

The OCCT v8 `Deprecated/NCollectionAliases/` directory ships 972 deprecation-stub typedef headers like:

```cpp
Standard_HEADER_DEPRECATED("AppDef_Array1OfMultiPointConstraint.hxx is deprecated since OCCT 8.0.0. "
                            "Use NCollection_Array1<AppDef_MultiPointConstraint> directly.")
typedef NCollection_Array1<AppDef_MultiPointConstraint> AppDef_Array1OfMultiPointConstraint;
```

Each header is a deliberate dead-end: the underlying generic `NCollection_Array1<T>` is the modern way to use the container. None of the `AppDef_*`/`GeomPlate_*`/`HSequenceOf*` typedef stubs needs binding **as long as** `NCollection_Array1<AppDef_MultiPointConstraint>` itself is auto-discovered by [`src/ocjs_bindgen/discover.py`](https://github.com/taucad/opencascade.js/blob/main/src/ocjs_bindgen/discover.py). It currently is **not** discovered because the underlying class (`AppDef_MultiPointConstraint`) is package-excluded.

**Verdict**: 🟡 Tied to Finding 13 — if `AppDef` is re-enabled, the auto-discovery layer picks up the modern generic forms automatically, and the deprecated typedef stubs stay correctly excluded.

## Failure Classes — F1 through F5

Every wrongly-excluded class falls into one of five technical failure classes. Group fixes by class, not by individual class.

### F1: Template alias with 2 `TEMPLATE_REF` children (the LProps bug)

**Mechanism**: `using X = Outer<occ::handle<T>>;` produces 2 TEMPLATE_REF cursors in libclang AST; `processTemplate` requires exactly 1.

**Examples**: `BRepLProp_CLProps`, `BRepLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_SLProps`, `HLRBRep_SLProps`.

**Headcount**: 5 known.

**Fix locus**: `src/generateBindings.py::processTemplate` lines 161–177. Change `len(templateRefs) != 1` to inspect the first TEMPLATE_REF only (or filter by semantic parent to ensure we get the alias's outer template, not nested `handle<>` template).

**Estimated effort**: 0.5 day including new smoke test asserting `oc.GeomLProp_SLProps` is callable and `MaxCurvature()`/`MeanCurvature()` return finite values.

### F2: Package-level pre-filter (binary-size cuts)

**Mechanism**: `filterPackages()` (`src/filter/filterPackages.py`) returns False for package members of `bindgen-filters.yaml`'s `exclude.packages` list, short-circuiting all downstream codegen — no `.cpp` or `.d.ts.json` is emitted, and `ncollection-manifest.json` doesn't discover their template instantiations either.

**Examples (debatable)**: `GeomPlate`, `AppDef`, `ProjLib`, `HeaderSection` (covered in Finding 13).

**Examples (correct)**: `TopOpeBRep*` (Finding 6), `MeshVS`, `AIS`, `Graphic3d` (Finding 1), `TKBin*`, `TKXml*` (Finding 3).

**Headcount**: 100 packages, ~600 visualization headers + ~150 persistence headers + ~80 Draw headers + ~180 deprecated headers + ~30 platform headers ≈ ~1040 headers correctly cut; 4 packages (`GeomPlate`, `AppDef`, `ProjLib`, `HeaderSection`) debatable, ~60 headers in total.

**Fix locus**: `bindgen-filters.yaml` `exclude.packages`. For each debatable package, removing the line restores the package; binary-size measurement required before/after.

**Estimated effort**: 1 day per package including a WASM-size experiment and a smoke test.

### F3: Abstract / deleted-ctor / private-ctor classes

**Mechanism**: Class lacks a public default constructor, has all-protected constructors, or explicitly `= delete`s the copy constructor without offering a factory.

**Examples (correct)**: `PrsDim_Dimension`, `BOPAlgo_PaveFiller`, `FSD_BinaryFile`, `Storage_BaseDriver`, `Standard_ErrorHandler`, `Graphic3d_CubeMap`, `Font_BRepFont`, `Message_LazyProgressScope`.

**Headcount**: ~40 explicit excludes; broader semantic AST rejects via `shouldProcessClass` add an unknown number more.

**Fix locus**: case-by-case — either expose a public factory method via `additionalBindCode`, or accept the exclusion. Not a single-fix class.

**Estimated effort**: per-class; default expectation is "keep excluded".

### F4: Nested-class / non-copyable return types (Phase A-prime partial coverage)

**Mechanism**: Method returns a class type with deleted copy/move ctor, or a nested class qualifier libclang reports without the enclosing class name. Phase A-prime helpers (R-E1, R-G1) added partial coverage but only for the specific instances stocktake-3 surfaced.

**Examples**: `BRepClass_FaceExplorer`, `BRepBlend_Walking`, `BRepFill_TrimSurfaceTool`, `IntCurveSurface_IntersectionPoint`, `LocOpe_CSIntersector`, `BRepGProp_MeshProps`, `TopOpeBRepBuild_GIter`, `TopOpeBRepDS_Interference`, `TopOpeBRepDS_HDataStructure`.

**Headcount**: ~15–25 in the "OCCT V8 specific" bucket.

**Fix locus**: re-run the Phase A-prime sweep against this subset; most are likely to now compile. Where they don't, `additionalBindCode` with `class_<>` + explicit accessor methods (the R3 `ExtremaPC::Result` pattern from [stocktake-4](docs/research/occt-v8-final-migration-stocktake-4.md)) is the proven fallback.

**Estimated effort**: 2–3 days for a full re-sweep with WASM rebuilds.

### F5: Visualization / threading / platform header dependencies

**Mechanism**: Class header `#include`s a symbol from an excluded package (TKOpenGl, TKThreading) — the binding stub compiles, but link fails with `unresolved external symbol`.

**Examples (correct)**: All `AIS_*`, `Graphic3d_*`, `OpenGl_*`, `Prs3d_*` named excludes.

**Headcount**: ~85 unresolved-symbol classes identified pre-V8.

**Fix locus**: not fixable without enabling the dependent package (which itself would require multi-threaded WASM build, WebGL/WebGPU bridge, etc.). Out of scope.

**Estimated effort**: ∞ (architectural shift).

## Recommendations

Prioritised by impact / effort. None changes the architectural API boundary; each is a localised codegen or filter edit.

| #   | Action                                                                                                                                                                                                                                                                                                         | Priority | Effort   | Impact                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Fix F1 template-alias 2-TEMPLATE_REF bug in `src/generateBindings.py::processTemplate`. Add a smoke test asserting `oc.GeomLProp_SLProps`/`oc.BRepLProp_SLProps` instantiation and curvature evaluation.                                                                                                       | P0       | 0.5 day  | Recovers 5 differential-geometry classes (CLProps/SLProps families) — needed by curvature-aware mesh inspection, normal queries, and agent-driven surface analysis. No other path exposes the same API.                                   |
| R2  | Re-sweep the "OCCT V8 specific" + "Misc compilation errors" buckets (~140 named excludes) against Phase A-prime helpers. Use a batch script that re-adds 10 symbols at a time to `full.yml`, runs `nx run ocjs:compile-bindings` + `link`, and keeps only entries with `validation_passed: true`.              | P1       | 2–3 days | Recovers an unknown subset (estimated 10–40 classes) — focused on `BRepClass_FaceExplorer`, `BRepBlend_Walking`, `BRepFill_TrimSurfaceTool`, `IntCurveSurface_IntersectionPoint`, etc. Each adds non-trivial geometric algorithm surface. |
| R3  | Extend non-const enum-ref output param wrapper (F4 partial) to handle scoped-enum types like `LProp_Status`, `TopAbs_Orientation`, `BOPAlgo_GlueEnum`, `Quantity_NameOfColor`. Reuse the existing `getReferenceValue`/`updateReferenceValue` `emscripten::val` pattern but treat enums as integers underneath. | P1       | 1 day    | Recovers ~25 methods across `Bnd_Box`/`Bnd_Box2d`/`TopAbs`/`Quantity_Color`/`Message_Messenger`/`OSD_Protection`/`PrsDim` etc. Method-level wins; no new class surface.                                                                   |
| R4  | Run WASM-size experiment: re-include `GeomPlate` package, measure `.wasm` delta. Decide whether to keep excluded (binary-size win) or re-bind (advanced filling API win).                                                                                                                                      | P2       | 1 day    | Public surface-filling API; useful for agentic CAD pipelines reasoning about G0/G1 surface continuity. Size cost unknown — could be 100KB or 500KB; experiment decides.                                                                   |
| R5  | Same experiment for `AppDef`, `ProjLib`, `HeaderSection`. Decide per-package based on a fixed size budget (e.g. "<200KB combined delta").                                                                                                                                                                      | P2       | 1 day    | Reuse R4 harness; outcome decides whether the public-facade-only stance holds or some lower-level surface should ship for agent consumers.                                                                                                |
| R6  | Document the F1–F5 failure-class taxonomy as a permanent maintenance reference inside `repos/opencascade.js/docs/` (or wherever the upstream fork hosts its `BREAKING_CHANGES.md` / `CHANGELOG.md`). This audit becomes the canonical answer to "why is X not bound?" until the next major OCCT upgrade.       | P2       | 0.5 day  | Stops the recurring "should we re-bind family Y?" investigation cycle.                                                                                                                                                                    |

**Out of scope explicitly**: re-enabling visualization (TKOpenGl/AIS), re-enabling persistence drivers (TKBin/TKXml), re-enabling Draw tools, re-binding `TopOpe*` (deprecated and superseded by TKBO). Those are architectural decisions, not bindgen bugs.

## Appendix A — Full Excluded Package List

142 packages, alphabetical:

```
AIS, AppDef, Aspect, BOPTest, BRepTest, BinDrivers, BinLDrivers, BinMDF, BinMDataStd,
BinMDataXtd, BinMDocStd, BinMFunction, BinMNaming, BinMXCAFDoc, BinObjMgt, BinTObjDrivers,
BinXCAFDrivers, Cocoa, D3DHost, D3DHostTest, DBRep, DDF, DDataStd, DDocStd, DNaming,
DPrsStd, DRAWEXE, Draw, DrawDim, DrawFairCurve, DrawTrSurf, DsgPrs, Font, GeomPlate,
GeometryTest, GeomliteTest, Graphic3d, HLRTest, HeaderSection, IVtk, IVtkDraw, IVtkOCC,
IVtkTools, IVtkVTK, Image, Media, MeshTest, MeshVS, OpenGl, OpenGlTest, ProjLib, Prs3d,
PrsDim, PrsMgr, QABugs, QADNaming, QADraw, QANCollection, SWDRAW, Select3D, SelectBasics,
SelectMgr, Shaders, ShapePersistent, StdDrivers, StdLDrivers, StdLPersistent, StdObjMgt,
StdObject, StdPersistent, StdPrs, StdSelect, StdStorage, TKBin, TKBinL, TKBinTObj,
TKBinXCAF, TKD3DHost, TKD3DHostTest, TKDCAF, TKDraw, TKIVtk, TKIVtkDraw, TKMeshVS,
TKOpenGl, TKOpenGlTest, TKOpenGles, TKOpenGlesTest, TKQADraw, TKService, TKStd, TKStdL,
TKTObj, TKTObjDRAW, TKTopTest, TKV3d, TKVCAF, TKViewerTest, TKXDEDRAW, TKXSDRAW,
TKXSDRAWDE, TKXSDRAWGLTF, TKXSDRAWIGES, TKXSDRAWOBJ, TKXSDRAWPLY, TKXSDRAWSTEP,
TKXSDRAWSTL, TKXSDRAWVRML, TKXml, TKXmlL, TKXmlTObj, TKXmlXCAF, TObj, TObjDRAW, TPrsStd,
TopOpeBRep, TopOpeBRepBuild, TopOpeBRepDS, TopOpeBRepTool, V3d, ViewerTest, WNT, Wasm,
XBRepMesh, XDEDRAW, XSDRAW, XSDRAWIGES, XSDRAWSTEP, XSDRAWSTLVRML, XmlDrivers,
XmlLDrivers, XmlMDF, XmlMDataStd, XmlMDataXtd, XmlMDocStd, XmlMFunction, XmlMNaming,
XmlMXCAFDoc, XmlObjMgt, XmlTObjDrivers, XmlXCAFDrivers, Xw
```

Per-package header counts (from `find deps/OCCT/src/<package> -name '*.hxx'`): see [Exclusion Inventory](#exclusion-inventory).

## Appendix B — Class Exclusion Buckets (from filters.yaml)

Inline comments in `bindgen-filters.yaml` split the 222 named exclusions into 8 buckets. Bucket counts and the verdict per bucket are:

| Bucket                              | Count | Verdict                                    | Bucket header in filters.yaml                                     |
| ----------------------------------- | ----- | ------------------------------------------ | ----------------------------------------------------------------- |
| Platform-specific (prefixes)        | 10    | ✅ Keep                                    | "Platform-specific" comment                                       |
| Visualization deps (XCAFPrs)        | 3     | ✅ Keep                                    | "Visualization deps" comment                                      |
| Visualization stack (TKOpenGl deps) | 16    | ✅ Keep                                    | "17 classes responsible for ~85 undefined linker symbols" comment |
| Undefined symbols                   | 40    | ✅ Mostly keep (some F4 candidates)        | "Undefined symbols" comment                                       |
| Abstract / deleted / private ctors  | 10    | ✅ Keep                                    | "Abstract / deleted / private constructors" comment               |
| Misc compilation errors             | 57    | ✅ Mostly keep; **revisit** F4 subset      | "Misc compilation errors" comment                                 |
| OCCT V8 specific                    | 96    | ✅ Mostly keep; **revisit** F1 + F4 subset | "OCCT V8 specific" comment                                        |

The "OCCT V8 specific" bucket is the highest-yield re-sweep target because it accumulated during the live V8 RC migration and was never re-attempted with the final Phase A-prime helpers. The "Misc compilation errors" bucket is mostly correct (`Draw_Drawable3D`, `QABugs*`, `MeshTest*` are interactive-tools dependencies; `Standard_Dump`/`OSD_Path` are I/O dependencies) but ~10 classes (`Geom2dEvaluator`, `Interface_Graph`, `RWHeaderSection_GeneralModule`, etc.) deserve a second look.

## Appendix C — Method Exclusions

103 per-class method blocks. Group by pattern:

| Pattern                                       | Sample methods                                                                                                               | Count | Verdict                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------- |
| `Dump`-style (writes to `std::ostream`)       | `FairCurve_Batten::Dump`, `BinTools::*`, `LDOM_Node::getOwnerDocument`                                                       | ~10   | ✅ Keep                            |
| Non-const enum-ref output                     | `Bnd_Box::Get`, `Quantity_Color::Values`, `TopAbs::Compose`, `PrsDim::ComputeGeometry`, `Geom2dGcc_Lin2dTanObl::IsParallel2` | ~25   | 🟡 **Recommendation R3**           |
| `NCollection` lvalue-ref output               | `NCollection_DataMap::Find`, `NCollection_IndexedDataMap::FindFromKey`                                                       | 2     | ✅ Keep (intentional, see comment) |
| Visualization stubs                           | `OpenGl_Context::ChangeClipping`, `Graphic3d_GraduatedTrihedron::CubicAxesCallback`, `AIS_Manipulator::OptionsForAttach`     | ~15   | ✅ Keep                            |
| OSD / filesystem-coupled                      | `OSD::RealToCString`, `OSD_Thread::Wait`, `Font_FontMgr::FindFont`, `BRepClass3d_SolidExplorer::GetTree`                     | ~10   | ✅ Keep                            |
| OCCT v8 removed                               | `BSplCLib::DN`, `Limits` (global), `ReadStreamList` (global), `Resource_Unicode::*` (entire class)                           | 5     | ✅ Keep (deprecated/removed)       |
| Internal "Internals" / "Self" reflection      | `MoniTool_TypedValue::Internals`, `LDOM_MemManager::Self`, `Aspect_VKeySet::Mutex`, `Image_VideoRecorder::ChangeFrame`       | ~10   | ✅ Keep                            |
| Non-bindable param types (`void*`, `istream`) | `MeshVS_DataSource::GetGeom`, `MeshVS_DeformedDataSource::GetGeomType`, `StdPrs_BRepFont::Mutex`                             | ~8    | ✅ Keep                            |
| Class-wide method exclusions (`[]` value)     | `Resource_Unicode`, `XSControl_Vars`, `STEPCAFControl_GDTProperty`                                                           | 3     | ✅ Keep                            |
| Misc per-class                                | (remainder)                                                                                                                  | ~15   | ✅ Keep                            |

The single high-yield method-pattern recovery is **non-const enum-ref output** (R3 above): touches public-facing classes (`Bnd_Box`, `TopAbs`, `Quantity_Color`, `Message_Messenger`) where the loss of one method per class is a meaningful API gap.
