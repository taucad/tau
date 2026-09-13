---
title: 'OCJS Bindings WASM Applicability Audit'
description: 'Audit of all 4491 OCCT classes bound by opencascade.js to identify which are functionally meaningless, broken, or low-value in a single-threaded browser/Node WASM context.'
status: active
created: '2026-05-18'
updated: '2026-05-18'
category: audit
related:
  - docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md
  - docs/research/ocjs-removed-bindings-stocktake.md
  - docs/research/ocjs-non-graphics-coverage-blueprint.md
  - docs/research/ocjs-full-yml-restoration-stocktake.md
---

# OCJS Bindings WASM Applicability Audit

Systematic review of every class currently bound into `opencascade_full.wasm` to identify symbols whose runtime semantics are broken, meaningless, or unreachable in a single-threaded Emscripten WASM build — and to propose package/class-level filter additions that shrink the .d.ts/.wasm/.js surface without losing any genuinely usable API.

> **Historic cross-check applied (2026-05-18).** Recommendations were initially scoped against 1,096 candidate classes but a downstream review against `ocjs-removed-bindings-stocktake.md`, `ocjs-non-graphics-coverage-blueprint.md`, and the `.d.ts` reference graph surfaced significant transitive-dependency risks. **The accepted recommendation surface is ~293 classes (R1+R2+R4+partial R6/R7/FSD)**, down from the initial 561-class T1–T3 target. The revisions are recorded inline in the [Recommendations](#recommendations) table and a dedicated [Historic cross-check](#historic-cross-check-2026-05-18) section.
>
> **Multi-threading reserve (2026-05-18).** All thread-synchronisation primitives (`OSD_Thread`, `OSD_ThreadPool`, `OSD_Parallel`, `Standard_Mutex`, `Standard_Condition` plus their nested types) and parallel-algorithm infrastructure (`BVH_BuildThread`, `BOPAlgo_ParallelAlgo`, `BRepGraph_ParallelPolicy`) are **explicitly preserved** so that a future `THREADING: multi-threaded` Emscripten build (pthreads + SharedArrayBuffer) and user-land worker integrations remain unblocked. See [Multi-threading reserve](#multi-threading-reserve) for the full keep-list. These symbols were previously included in R1's removal set and have now been moved out.

## Executive Summary

- The full build emits **4,491 bound classes** across **295 OCCT package prefixes** (`opencascade_full.build-manifest.json`).
- **~24% of bound classes (1,096 symbols)** fall into eight categories where the WASM execution model neutralizes the semantics: POSIX signals, Windows SEH exceptions, dynamic library loading, host introspection (cpu/disk/process), legacy file formats (VRML), specialized standards modules nobody uses (StepFEA/Kinematics/AP209), and pure internal scaffolding (CDF/PCDM/Storage/FSD/LDOM/MoniTool).
- **Post-historic-cross-check and multi-threading reserve the safe-to-ship surface is ~293 classes (R1 + R2 + R4 + NLPlate + FairCurve + StepKinematics + StepAP209 + FSD)** — about 52% of the initial T1–T3 target. CDF/PCDM/Storage/LDOM/MoniTool/HLRBRep/HLRAlgo/Plate/StepFEA/StepElement turned out to have non-trivial transitive deps; threading primitives are explicitly reserved for the eventual MT build.
- Tau's own `@taucad/runtime` opencascade kernel uses **~30 classes** (`TCollection_*`, `TDocStd_Document`, `XCAFDoc_*`, `gp_*`, `BRepPrimAPI_*`, `BRepAlgoAPI_*`, `RWGltf_CafWriter`, `RWMesh_*`, `STEPCAFControl_Writer`, `StlAPI_Writer`, `BRepMesh_IncrementalMesh`, `BRepBuilderAPI_Transform`, `Message_ProgressRange`, `Quantity_Color*`) — **none of which are touched by any accepted recommendation in this doc**.
- This audit explicitly **defers to** `ocjs-removed-bindings-stocktake.md` (per-package facade dispositions) and `ocjs-non-graphics-coverage-blueprint.md` (5-phase enablement plan, 38.5 MB ceiling). It only proposes _additional_ removals not previously catalogued.

## Scope and Non-Goals

**In scope**: classifying every bound class by WASM applicability and proposing additions to `repos/opencascade.js/bindgen-filters.yaml`.

**Out of scope**: per-class binary-size attribution (would require N rebuilds), runtime performance impact of the filter, IGES/STEP-AP242 importer feature-parity reasoning (separate research), `unknown`-type reduction in the surviving bindings (covered by `ocjs-bindgen-unknown-coverage-audit-v2.md`).

## Methodology

1. Parsed `repos/opencascade.js/build-configs/opencascade_full.build-manifest.json` → enumerated all 4,491 entries in `symbols.requested`.
2. Bucketed by OCCT package prefix (`{Pkg}_{Class}` convention) → 295 unique prefixes; computed per-package class counts.
3. Cross-referenced against `repos/opencascade.js/bindgen-filters.yaml` to identify which packages are already excluded (e.g. `Draw`, `TKOpenGl`, `AIS`, `TKBin`) — surviving "should-be-excluded" candidates form the audit subject.
4. Pulled the **build configuration** from `repos/opencascade.js/build-configs/configurations.json`: confirmed `THREADING=single-threaded` for every named config (default, O0-debug, O3-noLTO-simd, Os-noLTO-simd, O3-wasm-exc-simd) — threading-related bindings are dead code under every build.
5. Spot-checked emitted shapes in `repos/opencascade.js/build-configs/opencascade_full.d.ts` for each candidate bucket to confirm the classes really emit user-visible API surface (vs already being stubs).
6. Inventoried Tau-side consumers: `packages/runtime/src/kernels/opencascade/*.ts`, `packages/testing/src/geometry/multi-shape-name-roundtrip.test.ts`, `apps/api/app/api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.example*.ts`, `libs/api-extractor/src/generated/opencascade/`, `packages/runtime/src/kernels/cross-kernel-mesh-parity.test.ts`. Catalogued the ~30 classes Tau actually calls.

## Findings

### Overview by package size

The 4,491 bound classes are unevenly distributed. The 30 largest packages account for **2,168 classes (48%)**; the long tail (<5 classes/pkg) contains 109 packages. The 25%-of-symbols-by-class-count audit candidates are mostly in mid-tier packages where stock-OCCT functionality is included by historical default.

| Tier   | Bucket                                                                                                                                                                                    | Bound classes | WASM applicability                                                          | Risk to remove                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------: | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | POSIX signals / Windows SEH (`OSD_SIG*`, `OSD_Exception_*`)                                                                                                                               |            21 | Broken                                                                      | None — no Tau caller, no plausible JS caller                                                                                       |
| ~~T1~~ | ~~Threading / mutexes (`OSD_Thread*`, `OSD_Parallel`, `Standard_Mutex`, `Standard_Condition`)~~                                                                                           |             5 | ~~Broken in single-threaded build~~                                         | **MOVED TO KEEP — see [Multi-threading reserve](#multi-threading-reserve)**                                                        |
| **T1** | Dynamic loading (`OSD_SharedLibrary`, `Plugin*`)                                                                                                                                          |             4 | Broken in WASM                                                              | None                                                                                                                               |
| **T1** | Host introspection (`OSD_Host`, `OSD_Process`, `OSD_Disk`, `OSD_SysType`, `OSD_OEMType`, `OSD_WhoAmI`, `OSD_Environment`, `OSD_MemInfo`, `OSD_PerfMeter`, `OSD_Chronometer`, `OSD_Timer`) |            11 | Meaningless (use `performance.now`, `navigator.userAgent`)                  | Low — only `OSD_Timer` has hypothetical JS callers                                                                                 |
| **T1** | Native filesystem (`OSD_FileSystem*`, `OSD_Directory*`, `OSD_File*Iterator`, `OSD_LockType`, lock-mode enums)                                                                             |            16 | Meaningless (Emscripten MEMFS already exposed as `FS.*`)                    | Low                                                                                                                                |
| **T1** | Standard legacy (`Standard_LicenseError`, `Standard_LicenseNotFound`, `Standard_AbortiveTransaction`, `Standard_ImmutableObject`, `Standard_MMgrOpt`, `Standard_MMgrRoot`)                |             6 | Dead code                                                                   | None                                                                                                                               |
| **T1** | Terminal/syslog printers (`Message_PrinterSystemLog`, `Message_ConsoleColor`)                                                                                                             |             2 | Meaningless                                                                 | None                                                                                                                               |
| **T1** | Calendar (`Quantity_Date`, `Quantity_Period`, `*DefinitionError`)                                                                                                                         |             4 | Redundant with JS `Date`/`Temporal`                                         | None                                                                                                                               |
| **T2** | VRML format stack (`Vrml`, `VrmlAPI`, `VrmlConverter`, `VrmlData`, `DEVRML`)                                                                                                              |            97 | Dead format (replaced by glTF/USD)                                          | Low — no Tau caller, dead in industry                                                                                              |
| **T2** | Doc-storage internals (`CDF_`, `PCDM_`, `Storage_`, `FSD_`, `LDOM_`, `MoniTool_`)                                                                                                         |            86 | Internal scaffolding for OCAF persistence                                   | Low — `TDocStd_Document` API is the public face                                                                                    |
| **T3** | HLR (Hidden Line Removal: `HLRBRep`, `HLRAlgo`, `HLRAppli`)                                                                                                                               |            65 | Specialized (2D engineering drawings)                                       | Medium — small future-proofing risk                                                                                                |
| **T3** | Step-advanced (`StepFEA`, `StepKinematics`, `StepAP209`, `StepDimTol`, `StepElement`, `XCAFDimTolObjects`)                                                                                |           269 | Specialized (FEA / kinematics / GD&T)                                       | Medium — requires confirming no GD&T consumer                                                                                      |
| **T3** | Plate / FairCurve / NLPlate fairing (`NLPlate`, `Plate_`, `FairCurve_`)                                                                                                                   |            34 | Specialized                                                                 | Medium                                                                                                                             |
| **T3** | DE format-config scaffolds (`DEBREP_*`, `DEGLTF_*`, `DEIGES_*`, `DEOBJ_*`, `DEPLY_*`, `DESTEP_*`, `DESTL_*`, `DEXCAF_*`, `DE_*`)                                                          |            22 | Redundant once explicit `STEPCAFControl_Writer`/`RWGltf_CafWriter` are used | Low — already partially excluded; rest can go                                                                                      |
| **T4** | IGES full stack (`IGES*`, `DEIGES`, `GeomToIGES`, `BRepToIGES`, `Geom2dToIGES`)                                                                                                           |           454 | Legacy format, fading                                                       | High — drops `IGESControl_Reader`/`IGESControl_Writer` if removed wholesale; recommend keeping only `IGESControl`-prefixed classes |

Tier definitions:

- **T1 — Broken / meaningless in WASM (always filter)**. Total: 64 classes (was 69; 5 threading classes moved to the [Multi-threading reserve](#multi-threading-reserve)).
- **T2 — Dead format / pure internal scaffolding (filter unless caller proven)**. Total: 183 classes.
- **T3 — Specialized standards modules (filter pending stakeholder review)**. Total: 390 classes.
- **T4 — Legacy interchange format (filter selectively to preserve the user-facing reader/writer)**. Total: 454 classes (~430 filterable).

### Finding 1: OSD signals + SEH exceptions are physically meaningless in WASM

OCCT's signal infrastructure wraps `<csignal>` (`SIGBUS`, `SIGHUP`, `SIGILL`, `SIGINT`, `SIGKILL`, `SIGQUIT`, `SIGSEGV`, `SIGSYS`) and Windows SEH (`ACCESS_VIOLATION`, `ARRAY_BOUNDS_EXCEEDED`, `CTRL_BREAK`, `ILLEGAL_INSTRUCTION`, `INT_OVERFLOW`, `INVALID_DISPOSITION`, `IN_PAGE_ERROR`, `NONCONTINUABLE_EXCEPTION`, `PRIV_INSTRUCTION`, `STACK_OVERFLOW`, `STATUS_NO_MEMORY`). The build configuration sets `OCJS_UNDEFINES=OCC_CONVERT_SIGNALS` (`build-configs/configurations.json`), explicitly disabling OCCT's signal→C++-exception bridge.

In Emscripten:

- POSIX signals are not raised — memory faults trap into the JS host as `RuntimeError`.
- There is no Win32 SEH equivalent. `__try`/`__except` is a Microsoft extension that never runs anywhere outside MSVC.
- Catching `OSD_SIGSEGV` from JavaScript is incoherent — by the time the JS side observes a fault the wasm instance is already corrupted.

The 21 classes are emitted as zero-body wrappers; their `try/catch` ergonomics in JS provide a false sense of safety.

```127062:127080:repos/opencascade.js/build-configs/opencascade_full.d.ts
export declare class OSD_SIGSEGV extends OSD_Signal {
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);
  ExceptionType(): string;
  ...
}
```

**Filter recommendation**: add the 21 classes (or the structural prefixes `OSD_SIG`, `OSD_Exception_`, `OSD_Signal`, `OSD_SignalMode`) to `bindgen-filters.yaml::exclude.classes`.

### Finding 2: Threading classes — KEEP for multi-threaded reserve (REVISED)

> **Revision (2026-05-18, multi-threading reserve).** This finding originally recommended removal of all OCCT threading primitives under the rationale "every config is `THREADING: single-threaded`". That recommendation has been **reversed**. Tau may move to a `THREADING: multi-threaded` Emscripten build (pthreads + SharedArrayBuffer) and/or expose `OSD_Parallel`/`OSD_ThreadPool` to user-land worker code at any time. Threading symbols are now explicitly reserved — see [Multi-threading reserve](#multi-threading-reserve) for the full keep-list and rationale.

Every current build configuration in `repos/opencascade.js/build-configs/configurations.json` declares `THREADING: "single-threaded"`. In that mode `OSD_Parallel::For/ForEach` degrades to a sequential loop and `OSD_ThreadPool` becomes a single-slot stub — but the **class-level bindings remain functional**, just synchronous. They are also stable API contracts: removing them now would force every callsite (and every future worker-host integration) to be rewritten when MT lands.

**Disposition**: NO FILTER. `OSD_Parallel`, `OSD_Thread`, `OSD_ThreadPool` (+ nested `Launcher`), `Standard_Mutex` (+ nested `Sentry`/`Sentry_1`/`Sentry_2`), `Standard_Condition` stay bound. Header-level exclusions (`OSD_Parallel.hxx`, `OSD_ThreadPool.hxx`, `Standard_Atomic.hxx`) that already exist in `bindgen-filters.yaml` should be re-evaluated whenever the MT build is enabled — but the class symbols themselves are reserved.

### Finding 3: Dynamic library loading has no WASM analogue

`OSD_SharedLibrary` wraps `dlopen`/`dlsym`/`dlclose` (POSIX) or `LoadLibrary`/`GetProcAddress` (Win32). Emscripten supports `dlopen` only for side-modules pre-arranged at link time — there is no equivalent of "load an arbitrary native plugin from a URL". `Plugin` + `Plugin_Failure` are the OCCT plugin registry that uses `OSD_SharedLibrary` under the hood.

**Filter recommendation**: exclude `OSD_SharedLibrary`, `OSD_LoadMode`, `Plugin`, `Plugin_Failure` (4 classes).

### Finding 4: Host-introspection helpers are syntactically wrong in WASM

`OSD_Host::HostName()`, `OSD_Process::ProcessId()`, `OSD_Disk::DiskSize()`, `OSD_SysType`, `OSD_OEMType`, `OSD_WhoAmI`, `OSD_Environment` either return JS-host info that's wrong (`PID` is meaningless), available natively from JS (`navigator.userAgent`, `process.platform`), or expose a fake host that isn't the real environment. `OSD_PerfMeter` / `OSD_MemInfo` use `getrusage` / `/proc/self/status` — neither exists under Emscripten. `OSD_Chronometer` / `OSD_Timer` use `clock_gettime(CLOCK_MONOTONIC)` — works under Emscripten but is strictly inferior to `performance.now()` from JS.

**Filter recommendation**: exclude the 11 classes listed in the T1 table row. (Soft-exclude `OSD_Timer`/`OSD_Chronometer` if any internal caller surfaces them as a return type — unlikely.)

### Finding 5: Native filesystem bindings duplicate Emscripten FS

`OSD_FileSystem`, `OSD_LocalFileSystem`, `OSD_CachedFileSystem`, `OSD_FileSystemSelector`, `OSD_Directory`, `OSD_DirectoryIterator`, `OSD_FileIterator`, `OSD_KindFile`, `OSD_OpenMode`, `OSD_LockType`, `OSD_SingleProtection`, `OSD_FromWhere`, `OSD_Error`, `OSD_OSDError` are wrappers around POSIX `stat`/`opendir`/`flock`. The `apps/runtime` consumer pattern (already in use: `oc.FS.readFile(filePath)` / `oc.FS.unlink(filePath)` from `packages/runtime/src/kernels/opencascade/opencascade-mesh.ts:188-191`) shows that the canonical pattern is Emscripten's auto-injected `FS` module — **not** these wrappers. `OSD_Path`, `OSD_File`, `OSD_FileNode` are **already excluded** in the filter file — finish the job.

**Filter recommendation**: exclude the 16 classes; this also kills the bulk of `OSD_Exception` non-signal exception types (file IO error wrappers).

### Finding 6: VRML format stack is dead weight

VRML was deprecated by Web3D Consortium in favor of X3D (2001), and X3D itself has been displaced by glTF 2.0 + USDZ for browser-delivered 3D. Tau already exports via `RWGltf_CafWriter` (`packages/runtime/src/kernels/opencascade/opencascade-mesh.ts:161`). Nobody imports or exports VRML in any Tau consumer or example.

97 classes split as:

| Sub-package                                | Classes |
| ------------------------------------------ | ------: |
| `Vrml_*` (scene nodes)                     |      53 |
| `VrmlData_*` (data model)                  |      23 |
| `VrmlConverter_*` (draw-aspects converter) |      16 |
| `VrmlAPI_*` (high-level reader/writer)     |       4 |
| `DEVRML_ConfigurationNode`                 |       1 |

`VrmlData_IndexedFaceSet`, `VrmlData_IndexedLineSet`, `VrmlData_Scene`, `VrmlData_Node`, `VrmlConverter_*` are already partially excluded for compilation-error reasons (`bindgen-filters.yaml` lines 198-200, 303). Promote the whole stack to a `packages` exclusion: `Vrml`, `VrmlAPI`, `VrmlConverter`, `VrmlData`, plus the orphan `DEVRML_ConfigurationNode`.

**Filter recommendation**: add to `bindgen-filters.yaml::exclude.packages`:

```yaml
- Vrml
- VrmlAPI
- VrmlConverter
- VrmlData
```

### Finding 7: Document storage internals — public API is `TDocStd_Document` / `TDocStd_Application` (REVISED)

> **Revision (2026-05-18, historic cross-check).** The initial recommendation to drop `CDF`, `PCDM`, `Storage`, `LDOM`, `MoniTool` packages was incorrect. The `.d.ts` reference graph shows each of these is reachable from public-API classes that Tau already binds. Only `FSD` survives the cross-check as a safe candidate.

OCCT's persistent-document subsystem layers as: `CDF_Application` (factory) → `PCDM_Document` (abstract doc) → `Storage_*` (binary serializer) → `FSD_*` (filesystem driver) → `LDOM_*` (XML DOM for XML-format docs) → `MoniTool_*` (monitoring/timer scaffolding). On first inspection only `TDocStd_Document` looked public — but `TDocStd_Application` (the document factory used by every consumer that creates documents) inherits from `CDF_Application`, its `Open/SaveAs/Save/DefineFormat` methods return PCDM types, and `LDOM_*`/`MoniTool_*` types appear in the bound public API surface of other classes.

Sub-package sizes and revised disposition:

| Sub-package  | Classes | External refs (from non-pkg `.d.ts` lines)                                                                                                                                                                                                                                                                                                         | Revised disposition                                 |
| ------------ | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `CDF_*`      |      11 | `TDocStd_Application extends CDF_Application` (line 28736); `CDF_Store` referenced in JSDoc                                                                                                                                                                                                                                                        | **KEEP — showstopper**                              |
| `PCDM_*`     |      15 | `TDocStd_Application.Open()` returns `PCDM_ReaderStatus`; `SaveAs/Save` return `PCDM_StoreStatus`; `DefineFormat` takes `PCDM_RetrievalDriver`/`PCDM_StorageDriver`                                                                                                                                                                                | **KEEP — strips Open/Save methods if removed**      |
| `Storage_*`  |      24 | 28+ unique symbols referenced from external classes (`Storage_OpenMode`, `Storage_Error`, `Storage_Data`, …)                                                                                                                                                                                                                                       | **KEEP — method-signature drops cascade**           |
| `FSD_*`      |       3 | Only 4 unique refs: 3 self-re-exports + 1 JSDoc mention                                                                                                                                                                                                                                                                                            | **DROP — safe**                                     |
| `LDOM_*`     |      20 | 28 unique symbols referenced from external classes (`LDOM_Document`, `LDOM_Element`, `LDOM_MemManager`, `LDOM_OSStream_BOMType`, `LDOM_NULL`/`Integer`/`AsciiFree`/…). `bindgen-filters.yaml:114` explicitly states "The public LDOM API surface (`LDOM_OSStream`, `LDOM_SBuffer`) is already bound directly" — LDOM was a _deliberate_ inclusion. | **KEEP — deliberate prior decision**                |
| `MoniTool_*` |      14 | `Interface_SignType extends MoniTool_SignText`; `Interface_TypedValue extends MoniTool_TypedValue`. `Interface_*` is the STEP/IGES Reader base — Tau already uses `Interface_Static`                                                                                                                                                               | **KEEP — inheritance break for Interface\_ family** |

The `TKBin`, `TKXml`, `TKStd`, `BinLDrivers`, `XmlLDrivers`, `ShapePersistent`, `StdPersistent`, `StdStorage` _driver_ packages remain correctly excluded at `bindgen-filters.yaml:637-682`. But the _base interfaces_ the drivers implement (`CDF_*`, `PCDM_*`, `Storage_*`, `LDOM_*`, `MoniTool_*`) are reachable from the public `TDocStd_Application` / `Interface_*` API and cannot be removed without silent surface loss.

**Revised filter recommendation**: only add `FSD` package exclusion. CDF/PCDM/Storage/LDOM/MoniTool stay bound.

```yaml
packages:
  - FSD # only 3 self-re-export refs; safe to drop
```

**Deferred consideration — LDOM in a separate pass**: LDOM was deliberately exposed for XML-document round-tripping, but the actual XML driver packages (`TKXml*`, `XmlLDrivers`, `XmlMDF`, `XmlObjMgt`) are excluded — meaning the LDOM surface is bound for an unrealised consumer. If Tau formally decides XML serialization is out of scope, a follow-up audit could revisit LDOM (20 classes) along with the XML drivers as a unified XML-removal pass. Not in scope for this audit.

### Finding 8: HLR (Hidden Line Removal) — REJECTED by historic cross-check

> **Revision (2026-05-18, historic cross-check).** The initial recommendation to drop `HLRBRep`/`HLRAlgo`/`HLRAppli` is rejected. Three independent signals contradict the proposal:
>
> 1. `ocjs-removed-bindings-stocktake.md` Section P1 identifies `HLRBRep_SLProps` as one of the **F1 codegen-bug RESTORE** targets — the `processTemplate` fix in `src/generateBindings.py` was applied specifically to bind HLR curvature analysis.
> 2. `ocjs-full-yml-restoration-stocktake.md` R3 explicitly KEEPs `HLRBRep_SLProps` in the YAML and confirms `tests/smoke/smoke-lprops-curvature.test.ts` exercises it (10/10 passing).
> 3. `.d.ts` reference graph: `HLRBRep_ShapeBounds` returned from NCollection sequence classes; `HLRBRep_TypeOfResultingEdge` used by `GetCompoundOf3dEdges(type_: HLRBRep_TypeOfResultingEdge): TopoDS_Shape` on a non-HLR class; `HLRBRep_Curve.MakeEdge` is a public static utility; `HLRAlgo_EdgesBlock`, `HLRAlgo_Intersection`, `HLRAlgo_Projector` returned from HLRBRep adapter methods and used as NCollection-constructor types (46 unique `HLRBRep_*` external refs, 18 unique `HLRAlgo_*` external refs).

`HLRBRep_*` (47), `HLRAlgo_*` (17), `HLRAppli_*` (1) = 65 classes. HLR computes hidden-edge wireframe projections for engineering drawings (DWG/DXF/PDF deliverables). While Tau is a 3D CAD viewer/editor with no current 2D drawing output path, **the HLR surface is a sanctioned binding** per the F1 codegen restoration and is cross-referenced by other bound classes' public methods.

**Disposition**: NO ACTION. HLR stays bound. If Tau formally decides curvature-analysis tooling (`HLRBRep_SLProps`) is unwanted, an HLR-removal pass should be coordinated with the LProps maintainers — beyond the scope of this audit.

### Finding 9: STEP-advanced modules — partial removal only (REVISED)

> **Revision (2026-05-18, historic cross-check).** Step-AP242 modules form a tightly cross-linked entity graph. External-reference counts in the `.d.ts` show only `StepKinematics` + `StepAP209` are clean removal candidates; `StepFEA` and `StepElement` have cross-package method-signature usage that would silently drop neighbouring methods.

Core STEP I/O works via `STEPControl_Reader`/`STEPControl_Writer`/`STEPCAFControl_Writer` + `StepBasic` (148 classes), `StepGeom` (97), `StepShape` (105), `StepRepr` (85), `StepVisual` (143) — **all kept**.

Per-sub-package external-reference inventory (refs from `.d.ts` lines outside the sub-package, excluding the trailing self-re-export block):

| Sub-package           | Classes |                                                                                                                                                                                                                                                             External refs | Revised disposition               |
| --------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------- |
| `StepKinematics_*`    |      84 |                                                                                                                                                                                                        1 (`StepKinematics_SpatialRotation` consumed by `MakeYprRotation`) | **DROP — safe**                   |
| `StepAP209_*`         |       1 |                                                                                                                                                                                                                                                     0 (package root only) | **DROP — safe**                   |
| `StepFEA_*`           |      66 |                                                                                                        10+ external refs: 7 NCollection sequence wrappers + `StepFEA_FeaModel`/`FeaAxis2Placement3d`/`Curve3dElementRepresentation` returned by methods at L224472–224491 | **KEEP or closure-analysis**      |
| `StepElement_*`       |      37 | 14+ external refs: heavy cross-refs in `Init` methods of multiple unrelated STEP descriptors; `StepElement_AnalysisItemWithinRepresentation`/`Volume3dElementDescriptor`/`Curve3dElementDescriptor`/`Surface3dElementDescriptor` reachable from neighbouring `Init` calls | **KEEP or closure-analysis**      |
| `StepDimTol_*`        |      62 |                                                                                                                                                                                              8+ external refs in NCollection constructors (per `Datum*Reference*` family) | DEFER (AP242 roadmap unconfirmed) |
| `XCAFDimTolObjects_*` |      19 |                                                                                                                                                                                                               44+ external refs into NCollection sequences and bind-tools | DEFER (AP242 roadmap unconfirmed) |

The kinematics + AP209 root removal still nets `84 + 1 = 85 classes` with confirmed zero functional impact. StepFEA + StepElement removal would silently strip multiple cross-pkg methods to `unknown`-typed signatures — needs a closure-analysis pass to identify the minimal keep-set before wholesale removal.

**Revised filter recommendation (T3)**: exclude only `StepKinematics` and `StepAP209` packages (85 classes). Defer `StepFEA` + `StepElement` to a closure-analysis follow-up (similar shape to the IGES R10 option below). Defer `StepDimTol` + `XCAFDimTolObjects` pending AP242 GD&T roadmap.

### Finding 10: DE format-config scaffolds are redundant once explicit readers/writers are used

The `DE_*` family (`DE_Wrapper`, `DE_Provider`, `DE_ConfigurationNode`, plus per-format `DEBREP_*`, `DEGLTF_*`, `DEIGES_*`, `DEOBJ_*`, `DEPLY_*`, `DESTEP_*`, `DESTL_*`, `DEVRML_*`, `DEXCAF_*`) provide a unified dispatcher façade over the underlying reader/writer classes. `STEPControl_Reader`/`STEPControl_Writer`, `RWGltf_CafReader`/`RWGltf_CafWriter`, `RWObj_*`, `RWStl_*`, `RWPly_*`, `IGESControl_Reader`/`IGESControl_Writer` already provide the **direct** API that Tau actually calls.

`DE_Provider`, `DE_Wrapper`, `DESTEP_Provider`, `DESTL_Provider`, `DEVRML_Provider` are **already excluded** (`bindgen-filters.yaml` lines 243-247). The remaining `DE*_ConfigurationNode` + `DE_ShapeFixConfigurationNode` + `DE_ShapeFixParameters` + `DE_ConfigurationContext` + `DE_ValidationUtils` (22 classes) serve no consumer.

**Filter recommendation**: exclude the remaining `DE*_ConfigurationNode` + `DE_*` classes (22 total).

### Finding 11: IGES is large and partially in use

IGES (Initial Graphics Exchange Specification) is **deprecated** but still demanded by long-tail aerospace/defense workflows. The 454 IGES-related classes split:

| Sub-package                                                                                                                                       | Classes | Role                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------ |
| `IGESSolid_*`, `IGESGeom_*`, `IGESDimen_*`, `IGESGraph_*`, `IGESDraw_*`, `IGESBasic_*`, `IGESAppli_*`, `IGESData_*`, `IGESDefs_*`, `IGESSelect_*` |    ~419 | Format internals (entity types, drawing aspects) |
| `IGESControl_*` (7), `IGESToBRep_*` (11), `IGESCAFControl_*` (3), `IGESConvGeom_*` (2)                                                            |      23 | User-facing reader/writer wrappers               |
| `GeomToIGES_*` (5), `BRepToIGES_*` (4), `BRepToIGESBRep_*` (1), `Geom2dToIGES_*` (4)                                                              |      14 | Geometry→IGES translators                        |
| `DEIGES_*`                                                                                                                                        |       3 | DE dispatcher config                             |

No Tau consumer uses any IGES class today. The minimal surface needed to retain IGES support is `IGESControl_Reader` + `IGESControl_Writer`. **However**, both of those construct internal `IGESData_*`/`IGESSelect_*`/`IGESToBRep_*` instances that may be returned as method outputs — wholesale removal of the internals will leave `IGESControl_Reader` with `unknown`-typed methods or compile failures.

**Filter recommendation (T4, needs decision)**:

- **Option A (aggressive)** — drop the whole IGES stack (-454 classes). Justified if no Tau roadmap item targets IGES support; recoverable if needed later.
- **Option B (conservative)** — keep `IGESControl_*` and the transitive closure of types it returns / accepts; drop the rest (~-380 classes). Requires manual closure analysis.

Recommend Option A for the first cut, with explicit confirmation from the product owner that IGES import/export is out of scope.

### Finding 12: Plate / FairCurve / NLPlate are specialized fairing algorithms (PARTIAL REVISE)

> **Revision (2026-05-18, historic cross-check).** `NLPlate` and `FairCurve` survive cross-check — only self-re-exports in the trailing block, no real external use. `Plate` is rejected because (a) `Plate_PinpointConstraint`, `Plate_D1`, `Plate_D2`, `Plate_D3` appear in non-Plate constructors (NCollection sequences + at least one cross-package constructor at L113591); and (b) `ocjs-non-graphics-coverage-blueprint.md` Phase 2 plans to re-enable `GeomPlate` (currently excluded at `bindgen-filters.yaml:694`) which depends on `Plate_*` — removing Plate now would block that phase.

`Plate_*` (13), `NLPlate_*` (9), `FairCurve_*` (12) — total 34 classes — implement variational surface/curve fairing (G^2 continuity smoothing, plate-bending energy minimization).

| Sub-package   | Classes |                                                                                                              External refs | Revised disposition |
| ------------- | ------: | -------------------------------------------------------------------------------------------------------------------------: | ------------------- |
| `Plate_*`     |      13 | 13+ unique cross-package refs (NCollection seq constructors + L113591 cross-pkg constructor); blueprint Phase 2 dependency | **KEEP**            |
| `NLPlate_*`   |       9 |                                                                                   Only self-re-exports in `>L260000` block | **DROP — safe**     |
| `FairCurve_*` |      12 |                                                                                   Only self-re-exports in `>L260000` block | **DROP — safe**     |

**Revised filter recommendation (T3)**: exclude only `NLPlate` and `FairCurve` packages (21 classes). `Plate` stays bound pending the blueprint's GeomPlate re-enable decision.

### Multi-threading reserve

Tau's `opencascade.js` build currently sets `THREADING: "single-threaded"` for every named configuration. That is **not** a permanent decision — Emscripten supports pthreads + SharedArrayBuffer, OCCT supports both internal `std::thread` pools and TBB, and Tau's runtime architecture (Web Worker + SAB + comlink) is already worker-aware. A future MT build is plausible, and removing the JS-visible threading API surface now would force every consumer (and every future worker-host integration) to be rewritten when MT lands.

The following symbols are **explicitly reserved** — none of them appears in any T1–T4 filter recommendation.

| Symbol (manifest entry)    | JS-visible classes after binding                                                                                   | Role                                                                             | Reason for reserve                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OSD_Parallel`             | `OSD_Parallel`                                                                                                     | `OSD::Parallel::For/ForEach`; uses TBB if available, falls back to internal pool | Core parallel-loop entry point; consumed by `BVH_BuildThread`, `BOPAlgo_ParallelAlgo`, mesh/BOP algorithms             |
| `OSD_Thread`               | `OSD_Thread`                                                                                                       | Thread-handle wrapper                                                            | Lifecycle handle for user-spawned worker tasks                                                                         |
| `OSD_ThreadPool`           | `OSD_ThreadPool`, `OSD_ThreadPool_Launcher` (nested)                                                               | Thread pool + RAII launcher used by `OSD_Parallel`                               | `OSD_ThreadPool::DefaultPool()` is the canonical entry point; `Launcher` is the user-facing job-submission RAII handle |
| `Standard_Mutex`           | `Standard_Mutex`, `Standard_Mutex_Sentry`, `Standard_Mutex_Sentry_1`, `Standard_Mutex_Sentry_2` (nested overloads) | Recursive mutex + RAII lock guards                                               | Required by every OCCT class that derives from `Standard_Transient` and is shared across threads                       |
| `Standard_Condition`       | `Standard_Condition`                                                                                               | Condition variable                                                               | Used by `OSD_ThreadPool` internals and exposable for application-level signalling                                      |
| `BVH_BuildThread`          | `BVH_BuildThread extends Standard_Transient`                                                                       | Parallel BVH builder                                                             | Required for parallel acceleration-structure construction (graphics, picking, fast intersection)                       |
| `BOPAlgo_ParallelAlgo`     | `BOPAlgo_ParallelAlgo extends BOPAlgo_Algo`                                                                        | Base class for parallelisable Boolean-ops algorithms                             | Every parallel BOPAlgo implementation derives from it; removing it strips the polymorphism root                        |
| `BRepGraph_ParallelPolicy` | `BRepGraph_ParallelPolicy`                                                                                         | Tau modeling-app extension — parallel-policy selector for `BRepGraph`            | Tau-fork addition; already in the "never remove" set per Finding 14                                                    |

Build-system / link-layer companions that **must move together** when MT is enabled (not class-level; called out so this audit is complete):

- `OCJS_UNDEFINES` would need to drop `OCC_CONVERT_SIGNALS` only if OCCT's per-thread signal handler is reintroduced.
- `EXTRA_EMCC_FLAGS` would need to include `-pthread -sSHARED_MEMORY=1 -sPTHREAD_POOL_SIZE=…`.
- `OCJS_THREADING=multi-threaded` would need to be set in `configurations.json` (currently absent).
- `Standard_Atomic.hxx` is currently in `bindgen-filters.yaml::exclude.headers`; it should stay excluded only as long as we don't need to expose atomics to JS, which is unlikely (atomics are an internal implementation detail).
- TBB linkage is opt-in via OCCT's `USE_TBB` and would require shipping a TBB build alongside the WASM module; not blocking the symbols above.

If a future MT-enablement project lands, the only edits needed on this audit's side are: (a) lift the multi-threading-reserve symbols from "reserved" to "active", (b) re-evaluate the header exclusions for `OSD_Parallel.hxx`/`OSD_ThreadPool.hxx`, (c) re-run the validation checklist.

### Finding 13: Already-good filters worth documenting

The existing `bindgen-filters.yaml` correctly excludes (no change needed — listed here for context):

- `Draw`, `BOPTest`, `BRepTest`, `MeshTest`, `QA*` — interactive testing tools (40+ packages)
- `TKOpenGl`, `Aspect`, `Graphic3d`, `AIS`, `V3d`, `PrsDim`, `Image`, `Font`, `Media`, `Wasm`, `Xw`, `Cocoa`, `WNT`, `Shaders`, `MeshVS` — entire visualization stack (Three.js owns rendering)
- `TKBin*`, `TKXml*`, `TKStd*`, `ShapePersistent`, `StdPersistent`, `BinLDrivers`, `XmlLDrivers` — persistence drivers
- `TopOpe*` — deprecated boolean ops (replaced by `BOPAlgo`)
- `D3DHost`, `IVtk*` — DirectX / VTK adapters

These exclusions correctly identify ~150 packages with zero WASM applicability. The current audit extends that pattern into OSD/Storage/VRML/IGES/HLR/Step-advanced.

### Finding 14: Tau modeling-app extensions are NOT removal candidates

The audit found 165 `BRepGraph_*`/`BRepGraphInc_*` classes plus orphans like `MeshView`, `TopoView`, `ShapesView`, `CacheView`, `RefsView`, `UIDsView`, `EditorView`, `HelixBRep_BuilderHelix`, `Geom2dHash_*`, `GeomHash_*`, `MyDirectPolynomialRoots`, `PeriodicInterval`, `PeriodicityInfo`, `Interval`, `BndBox2dTreeFiller`, `VertexCellFilter`, `CircleCellFilter`, `Hermit`, `StepFile`, `StepTidy`, `PSO_Particle`, `FilletPoint`. These are **Tau's modeling-app additions to its OCCT fork**, not stock OCCT. They are kept as-is — removing them would defeat the purpose of forking.

(Documenting as a non-finding so future agents don't propose to filter them.)

## Historic cross-check (2026-05-18)

The initial draft of this audit proposed removing 1,096 classes across T1–T4 tiers. A cross-check against prior OCJS research surfaced significant transitive-dep risks that the initial methodology missed (it scanned package names but not the `.d.ts` reference graph). Cross-checked against:

- [`ocjs-removed-bindings-stocktake.md`](./ocjs-removed-bindings-stocktake.md) — per-package facade dispositions and the F1 codegen-restore set
- [`ocjs-non-graphics-coverage-blueprint.md`](./ocjs-non-graphics-coverage-blueprint.md) — 5-phase enablement plan with 38.5 MB ceiling
- [`ocjs-full-yml-restoration-stocktake.md`](./ocjs-full-yml-restoration-stocktake.md) — R3 explicit-KEEP for the F1 LProps templates
- `repos/opencascade.js/bindgen-filters.yaml` — existing per-class carve-outs that document deliberate prior inclusions
- `repos/opencascade.js/build-configs/opencascade_full.d.ts` — external-reference graph for each candidate package

### Conflicts found and revisions applied

| Original rec                                | Issue                                                                                                                                                                                                                                                                                                                                                                   | Source of conflict                          | Revision                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **R3** drops `CDF`                          | `TDocStd_Application extends CDF_Application` (line 28736 of `.d.ts`). `TDocStd_Application` is the document factory used by every consumer that creates OCAF documents.                                                                                                                                                                                                | `.d.ts` inheritance + Tau runtime usage     | KEEP CDF                                                                                                |
| **R3** drops `PCDM`                         | `TDocStd_Application.Open()` returns `PCDM_ReaderStatus`; `SaveAs/Save` return `PCDM_StoreStatus`; `DefineFormat` takes `PCDM_RetrievalDriver`/`PCDM_StorageDriver`. Removing PCDM strips these public methods.                                                                                                                                                         | `.d.ts` method signatures                   | KEEP PCDM                                                                                               |
| **R3** drops `Storage`                      | 28+ unique `Storage_*` symbols referenced from external classes (`Storage_OpenMode`, `Storage_Error`, `Storage_Data`, `Storage_VSRead`, …).                                                                                                                                                                                                                             | `.d.ts` method signatures                   | KEEP Storage                                                                                            |
| **R3** drops `LDOM`                         | 28 unique `LDOM_*` symbols referenced from external classes; `bindgen-filters.yaml:114` explicitly notes _"The public LDOM API surface (`LDOM_OSStream`, `LDOM_SBuffer`) is already bound directly"_ — LDOM was a deliberate inclusion.                                                                                                                                 | Filter file + `.d.ts` cross-refs            | KEEP LDOM (preserved as a deferred bullet — revisit only if XML serialization is formally out of scope) |
| **R3** drops `MoniTool`                     | `Interface_SignType extends MoniTool_SignText`; `Interface_TypedValue extends MoniTool_TypedValue`. `Interface_*` is the STEP/IGES Reader base — Tau uses `Interface_Static` already.                                                                                                                                                                                   | `.d.ts` inheritance                         | KEEP MoniTool                                                                                           |
| **R5** drops HLR (HLRBRep/HLRAlgo/HLRAppli) | `ocjs-removed-bindings-stocktake.md` Section P1 identifies `HLRBRep_SLProps` as an F1 codegen-bug RESTORE target; the `processTemplate` codegen fix was applied specifically to bind HLR curvature analysis. `ocjs-full-yml-restoration-stocktake.md` R3 explicitly KEEPs `HLRBRep_SLProps`. `.d.ts` shows 46 unique `HLRBRep_*` + 18 unique `HLRAlgo_*` external refs. | F1 codegen restoration + `.d.ts` cross-refs | DROP R5 entirely — HLR is sanctioned                                                                    |
| **R6** drops `Plate`                        | 13+ cross-package refs (`Plate_PinpointConstraint`, `Plate_D1/D2/D3` in NCollection constructors + a cross-pkg constructor at L113591). `ocjs-non-graphics-coverage-blueprint.md` Phase 2 plans to re-enable `GeomPlate` which depends on `Plate_*`.                                                                                                                    | Blueprint Phase 2 + `.d.ts` cross-refs      | KEEP Plate (NLPlate + FairCurve still drop — only self-re-exports)                                      |
| **R7** drops `StepFEA`/`StepElement`        | `StepFEA_FeaModel`/`FeaAxis2Placement3d`/`Curve3dElementRepresentation` returned by methods at L224472–224491; `StepElement_AnalysisItemWithinRepresentation` reachable from cross-pkg `Init` calls. 7 + 14 unique external refs.                                                                                                                                       | `.d.ts` method-signature graph              | KEEP (defer to closure-analysis pass)                                                                   |

### Recommendations that survive intact

- **R1** (T1: OSD signals/SEH/dlopen/host/native FS, Standard legacy, Message terminal, Quantity calendar) — 64 classes, zero external refs from non-self classes, corroborated by `OCJS_UNDEFINES=OCC_CONVERT_SIGNALS` build config. Ship as-is. **Threading classes (5) explicitly removed from R1 — see [Multi-threading reserve](#multi-threading-reserve).**
- **R2** (VRML packages) — 97 classes, dead format, no historic objection, no external refs. Ship as-is.
- **R4** (DE format-config scaffolds) — 22 classes, continuation of an existing `bindgen-filters.yaml` exclusion trajectory. Ship as-is.

## Recommendations

Prioritized filter additions for `repos/opencascade.js/bindgen-filters.yaml`. Effort estimates assume the filter file is the only edit + a single `enumerate-symbols.py` run + a full rebuild.

> **Revised post-cross-check (2026-05-18).** Status column reflects the disposition after the [Historic cross-check](#historic-cross-check-2026-05-18). Original counts are shown in parentheses for traceability.

| #       | Tier | Action                                                                                                                                                             | Classes (orig → revised) | Status                                | Effort                  | Risk to Tau consumers                                                         |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----------------------: | ------------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| **R1**  | T1   | Exclude OSD signal/SEH/dlopen/host/filesys/legacy/printer/calendar classes (threading classes preserved — see [Multi-threading reserve](#multi-threading-reserve)) |              69 → **64** | ✅ SHIP                               | Low (~30 min)           | None                                                                          |
| **R2**  | T2   | Exclude VRML packages (`Vrml`, `VrmlAPI`, `VrmlConverter`, `VrmlData`) + `DEVRML_ConfigurationNode`                                                                |              97 → **97** | ✅ SHIP                               | Low                     | None                                                                          |
| **R3**  | T2   | Exclude doc-storage internals (`CDF`, `PCDM`, `Storage`, `FSD`, `LDOM`, `MoniTool` packages) → revised to FSD-only                                                 |               86 → **3** | 🟡 PARTIAL — FSD only                 | Low                     | None (CDF/PCDM/Storage/LDOM/MoniTool moved to KEEP — see Finding 7)           |
| **R4**  | T3   | Exclude DE format-config scaffolds (`DE_*ConfigurationNode`, `DE_Provider*`, `DE_Wrapper*`, `DE_ShapeFix*`, `DE_ConfigurationContext`, `DE_ValidationUtils`)       |              22 → **22** | ✅ SHIP                               | Low                     | None                                                                          |
| **R5**  | T3   | Exclude HLR packages (`HLRBRep`, `HLRAlgo`, `HLRAppli`)                                                                                                            |               65 → **0** | ❌ DROPPED                            | n/a                     | Conflicts with F1 codegen restoration of `HLRBRep_SLProps`; 64 cross-pkg refs |
| **R6**  | T3   | Exclude `Plate`, `NLPlate`, `FairCurve` packages → revised to NLPlate + FairCurve only                                                                             |              34 → **21** | 🟡 PARTIAL — NLPlate + FairCurve only | Low                     | Plate kept (blueprint Phase 2 dep + cross-pkg constructor refs)               |
| **R7**  | T3   | Exclude `StepKinematics`, `StepFEA`, `StepElement`, `StepAP209` packages → revised to Kinematics + AP209 only                                                      |             188 → **85** | 🟡 PARTIAL — Kinematics + AP209 only  | Low                     | StepFEA + StepElement deferred to closure-analysis pass                       |
| **R8**  | T3   | DEFER: `StepDimTol`, `XCAFDimTolObjects`                                                                                                                           |           81 → **defer** | ⏸ DEFER                               | Low                     | AP242 GD&T roadmap unconfirmed                                                |
| **R9**  | T4   | Exclude IGES wholesale (all `IGES*`, `DEIGES`, `GeomToIGES`, `BRepToIGES`, `Geom2dToIGES`)                                                                         |            454 → **454** | ⏸ DECISION                            | Medium                  | Affects long-tail import users — product-owner sign-off required              |
| **R10** | T4   | ALT to R9: keep `IGESControl_*` + closure, drop the rest                                                                                                           |          ~380 → **~380** | ⏸ DECISION                            | High (closure analysis) | Lower than R9                                                                 |

**Accepted cumulative impact (R1 + R2 + R3-FSD + R4 + R6-partial + R7-partial)**: **~292 classes** (-6.5% of bound surface; 64 R1 + 97 R2 + 3 FSD + 22 R4 + 21 R6 + 85 R7 = 292), zero impact on any Tau consumer and no foreclosure on a future MT build. The .wasm size impact is harder to predict but should be material in `-Os` and `-O3` builds because Emscripten dead-code elimination cannot drop classes that have `EMSCRIPTEN_BINDINGS()` registrations referencing them. Compatible with the `ocjs-non-graphics-coverage-blueprint.md` 38.5 MB ceiling — this audit trims; the blueprint adds; net should stay well under.

**Open decisions (R9/R10)**: IGES = +454 or ~380 additional classes pending product-owner decision.

## Implementation Plan

1. **Phase 1 — R1 (no-risk OSD / Standard / Message / Quantity / dlopen / host / filesys; threading reserved)**
   - Add **64 classes** to `exclude.classes` (or use 2 prefix rules: `OSD_SIG`, `OSD_Exception_`, plus a per-class list for the remaining 18 OSD + 4 Standard + 4 Plugin/dlopen + 2 Message + 4 Quantity).
   - **Do NOT add**: `OSD_Thread`, `OSD_ThreadPool`, `OSD_Parallel`, `Standard_Mutex`, `Standard_Condition` — these are reserved per the [Multi-threading reserve](#multi-threading-reserve) section. The previous draft of this audit erroneously listed them; they have been removed.
   - Run `python3 scripts/enumerate-symbols.py` to regenerate `full.yml`.
   - Run `pnpm nx run ocjs:link` (full rebuild).
   - Validate: `pnpm vitest run tests/dts-validation.test.ts` + `pnpm vitest run` (full suite). Confirm `OSD_Thread`/`OSD_ThreadPool`/`OSD_Parallel`/`Standard_Mutex`/`Standard_Condition` still appear in `opencascade_full.d.ts` post-build.

2. **Phase 2 — R2 (VRML) + R3-FSD + R4 (DE configs)**
   - Add `Vrml`/`VrmlAPI`/`VrmlConverter`/`VrmlData`/`FSD` to `exclude.packages` + DE classes + `DEVRML_ConfigurationNode` to `exclude.classes`.
   - Validate: confirm `TDocStd_Document` and `TDocStd_Application` still construct and bind (smoke test against `oc.TDocStd_Document` instantiation from `packages/runtime/src/kernels/opencascade/opencascade-mesh.ts:88`); confirm `Interface_SignType`/`Interface_TypedValue` still bind (since these depend on `MoniTool_*` which we now KEEP).

3. **Phase 3 — R6-partial (NLPlate + FairCurve) + R7-partial (StepKinematics + StepAP209)**
   - Exclude `NLPlate`, `FairCurve`, `StepKinematics`, `StepAP209` packages.
   - No stakeholder sign-off required (zero external refs).

4. **Phase 4 — Closure-analysis follow-up (StepFEA + StepElement)**
   - Manual closure-analysis pass to identify the minimal keep-set inside `StepFEA` and `StepElement` (the public classes referenced by `StepFEA_FeaModel`/`StepFEA_FeaAxis2Placement3d` etc. returners). Similar shape to R10.

5. **Phase 5 — R8 (StepDimTol + XCAFDimTolObjects)**
   - Defer until AP242 GD&T roadmap is decided.

6. **Phase 6 — R9/R10 (IGES)**
   - Product-owner decision on IGES support before any change.

7. **Future — LDOM revisit**
   - Only if XML serialization is formally out of scope: coordinate an LDOM + `TKXml*` removal pass as a unified XML-removal audit. Out of scope here.

## Trade-offs

| Approach                                                            | Pro                                               | Con                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| **Class-level exclusion** (per-symbol entries in `exclude.classes`) | Surgical; preserves package for unrelated classes | Brittle as OCCT evolves; lots of entries to track              |
| **Prefix exclusion** (`prefix: OSD_SIG`)                            | Compact; auto-catches new sibling classes         | May overshoot when a new class shares the prefix but is useful |
| **Package exclusion** (`exclude.packages: [Vrml]`)                  | Cleanest; bypasses header includes too            | Loses entire package — can't selectively keep one class        |

For T1 OSD signals, **prefix exclusion** is appropriate (every `OSD_SIG*` is by definition a signal wrapper). For T2 VRML, **package exclusion** is correct (entire package is dead). For T3 HLR / Plate / Step-advanced, **package exclusion** is correct (no value in keeping leaf classes). For T4 IGES, **closure analysis** is required because `IGESControl_*` straddles the boundary.

## Validation Checklist

After each phase, before committing the filter change:

- [ ] `pnpm nx run ocjs:link` completes without `wasm-ld: undefined symbol` errors.
- [ ] `pnpm vitest run` in `repos/opencascade.js` shows the same 723 tests pass / 1 skipped baseline.
- [ ] `pnpm nx test runtime` in the workspace root passes (opencascade kernel smoke + cross-kernel parity tests).
- [ ] `pnpm nx typecheck runtime` passes (catches any `oc.X` reference that no longer resolves in `.d.ts`).
- [ ] Manual check: open the agent chat example `apps/api/app/api/chat/prompts/kernel-prompt-configs/opencascadejs.prompt.example.ts` and confirm every imported symbol still appears in the manifest.
- [ ] Spot-check the binary-manifest delta: `wasm_size` decrease and `requested` count drop both reported in the post-build `opencascade_full.build-manifest.json`.
- [ ] **Multi-threading reserve preserved**: confirm `OSD_Parallel`, `OSD_Thread`, `OSD_ThreadPool`, `OSD_ThreadPool_Launcher`, `Standard_Mutex`, `Standard_Mutex_Sentry`, `Standard_Mutex_Sentry_1`, `Standard_Mutex_Sentry_2`, `Standard_Condition`, `BVH_BuildThread`, `BOPAlgo_ParallelAlgo`, `BRepGraph_ParallelPolicy` are all still present in `opencascade_full.d.ts` after each filter change. A simple grep is sufficient: `rg -n "^export declare class (OSD_Parallel|OSD_Thread|OSD_ThreadPool|Standard_Mutex|Standard_Condition|BVH_BuildThread|BOPAlgo_ParallelAlgo|BRepGraph_ParallelPolicy)\b" repos/opencascade.js/build-configs/opencascade_full.d.ts | wc -l` should report **≥ 8**.

## References

- Manifest: `repos/opencascade.js/build-configs/opencascade_full.build-manifest.json`
- TypeScript output: `repos/opencascade.js/build-configs/opencascade_full.d.ts`
- Existing filter: `repos/opencascade.js/bindgen-filters.yaml`
- Build configurations: `repos/opencascade.js/build-configs/configurations.json` (every config is `THREADING: single-threaded`)
- Symbol enumerator: `repos/opencascade.js/scripts/enumerate-symbols.py`
- Tau OCCT consumers: `packages/runtime/src/kernels/opencascade/*.ts`
- Related research: `docs/research/ocjs-bindgen-unknown-coverage-audit-v2.md`

## Appendix A — T1 class lists (full)

**OSD signals / SEH (21)**:

```
OSD_Exception_ACCESS_VIOLATION, OSD_Exception_ARRAY_BOUNDS_EXCEEDED,
OSD_Exception_CTRL_BREAK, OSD_Exception_ILLEGAL_INSTRUCTION,
OSD_Exception_INT_OVERFLOW, OSD_Exception_INVALID_DISPOSITION,
OSD_Exception_IN_PAGE_ERROR, OSD_Exception_NONCONTINUABLE_EXCEPTION,
OSD_Exception_PRIV_INSTRUCTION, OSD_Exception_STACK_OVERFLOW,
OSD_Exception_STATUS_NO_MEMORY, OSD_SIGBUS, OSD_SIGHUP, OSD_SIGILL,
OSD_SIGINT, OSD_SIGKILL, OSD_SIGQUIT, OSD_SIGSEGV, OSD_SIGSYS,
OSD_Signal, OSD_SignalMode
```

**OSD threading / Standard threading primitives — RESERVED (NOT excluded)**:

> The 5 classes `OSD_Parallel`, `OSD_Thread`, `OSD_ThreadPool`, `Standard_Condition`, `Standard_Mutex` are explicitly reserved for a future `THREADING: multi-threaded` build. See [Multi-threading reserve](#multi-threading-reserve).

**Dynamic library loading (4)**:

```
OSD_LoadMode, OSD_SharedLibrary, Plugin, Plugin_Failure
```

**OSD host introspection (11)**:

```
OSD_Chronometer, OSD_Disk, OSD_Environment, OSD_Host, OSD_MemInfo,
OSD_OEMType, OSD_PerfMeter, OSD_Process, OSD_SysType, OSD_Timer,
OSD_WhoAmI
```

**OSD native filesystem (16)**:

```
OSD_CachedFileSystem, OSD_Directory, OSD_DirectoryIterator,
OSD_Error, OSD_Exception, OSD_FileIterator, OSD_FileSystem,
OSD_FileSystemSelector, OSD_FromWhere, OSD_KindFile,
OSD_LocalFileSystem, OSD_LockType, OSD_OSDError, OSD_OpenMode,
OSD_SingleProtection, OSD_SignalMode
```

**Standard legacy (6)**:

```
Standard_AbortiveTransaction, Standard_ImmutableObject,
Standard_LicenseError, Standard_LicenseNotFound,
Standard_MMgrOpt, Standard_MMgrRoot
```

**Message terminal printers (2)**:

```
Message_ConsoleColor, Message_PrinterSystemLog
```

**Quantity calendar (4)**:

```
Quantity_Date, Quantity_DateDefinitionError,
Quantity_Period, Quantity_PeriodDefinitionError
```

## Appendix B — Suggested `bindgen-filters.yaml` patch

```yaml
exclude:
  classes:
    # ... existing entries ...

    # R1 — WASM-meaningless OSD / Standard / Plugin / Message / Quantity
    # See docs/research/ocjs-bindings-wasm-applicability-audit.md
    - prefix: OSD_SIG
    - prefix: OSD_Exception_
    - OSD_Signal
    - OSD_SignalMode
    # NOTE: OSD_Thread, OSD_ThreadPool, OSD_Parallel are intentionally NOT excluded.
    # They are reserved for a future THREADING=multi-threaded build per the
    # Multi-threading reserve section of
    # docs/research/ocjs-bindings-wasm-applicability-audit.md
    - OSD_SharedLibrary
    - OSD_LoadMode
    - Plugin
    - Plugin_Failure
    - OSD_Host
    - OSD_Process
    - OSD_Disk
    - OSD_OEMType
    - OSD_SysType
    - OSD_WhoAmI
    - OSD_Environment
    - OSD_PerfMeter
    - OSD_MemInfo
    - OSD_Chronometer
    - OSD_Timer
    - OSD_CachedFileSystem
    - OSD_Directory
    - OSD_DirectoryIterator
    - OSD_Error
    - OSD_Exception
    - OSD_FileIterator
    - OSD_FileSystem
    - OSD_FileSystemSelector
    - OSD_FromWhere
    - OSD_KindFile
    - OSD_LocalFileSystem
    - OSD_LockType
    - OSD_OSDError
    - OSD_OpenMode
    - OSD_SingleProtection
    # NOTE: Standard_Mutex (+ nested Sentry/Sentry_1/Sentry_2) and Standard_Condition
    # are intentionally NOT excluded — reserved for the multi-threaded build.
    # See docs/research/ocjs-bindings-wasm-applicability-audit.md#multi-threading-reserve
    - Standard_LicenseError
    - Standard_LicenseNotFound
    - Standard_AbortiveTransaction
    - Standard_ImmutableObject
    - Standard_MMgrOpt
    - Standard_MMgrRoot
    - Message_PrinterSystemLog
    - Message_ConsoleColor
    - Quantity_Date
    - Quantity_DateDefinitionError
    - Quantity_Period
    - Quantity_PeriodDefinitionError

    # R4 — DE format-config scaffolds (DE_Provider / DE_Wrapper already excluded)
    - prefix: DEBREP_
    - prefix: DEGLTF_
    - prefix: DEIGES_
    - prefix: DEOBJ_
    - prefix: DEPLY_
    - prefix: DESTEP_
    - prefix: DEXCAF_
    - DE_ConfigurationContext
    - DE_ConfigurationNode
    - DE_ShapeFixConfigurationNode
    - DE_ShapeFixParameters
    - DE_ValidationUtils

  packages:
    # ... existing entries ...

    # R2 — Dead format (VRML — superseded by glTF / no consumer)
    - Vrml
    - VrmlAPI
    - VrmlConverter
    - VrmlData

    # R3 (revised) — only FSD survives the historic cross-check.
    # CDF/PCDM/Storage/LDOM/MoniTool stay BOUND:
    #   - TDocStd_Application extends CDF_Application (TDocStd_Document’s factory)
    #   - PCDM_* are TDocStd_Application.Open/Save return/parameter types
    #   - Storage_* (28 external refs) appear in cross-package method signatures
    #   - LDOM_* (28 external refs) were deliberately bound for XML round-trip;
    #     bindgen-filters.yaml:114 documents the deliberate inclusion
    #   - Interface_SignType extends MoniTool_SignText (STEP/IGES Reader chain)
    # See Findings 7 and Historic cross-check in
    # docs/research/ocjs-bindings-wasm-applicability-audit.md
    - FSD

    # R5 — DROPPED. HLRBRep / HLRAlgo / HLRAppli kept; HLRBRep_SLProps is part of
    # the F1 codegen restoration (see ocjs-removed-bindings-stocktake.md §P1) and
    # 64 cross-package .d.ts refs exist.

    # R6 (revised) — Plate is kept (cross-pkg refs + blueprint Phase 2 GeomPlate dep)
    - NLPlate
    - FairCurve

    # R7 (revised) — only Kinematics + AP209 root survive the cross-check.
    # StepFEA + StepElement defer to a closure-analysis pass; they expose ~21
    # external refs reachable from neighbouring STEP descriptors' Init() calls.
    - StepKinematics
    - StepAP209
```

R8 (`StepDimTol`/`XCAFDimTolObjects`), R9 (IGES wholesale), `StepFEA`, `StepElement`, and LDOM are intentionally not in the patch above. R8/R9 await product-owner sign-off; `StepFEA`/`StepElement` need closure-analysis; LDOM is preserved as a deferred consideration revisitable when/if XML serialization is formally declared out of scope (would be coordinated with a `TKXml*`/`XmlLDrivers` removal pass).

## Revision history

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-18 | Initial draft — recommended 10 filter additions (R1–R10) totalling 1,096 candidate classes.                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-18 | Historic cross-check applied. R3 narrowed to FSD-only (CDF/PCDM/Storage/LDOM/MoniTool kept — public-API transitive deps). R5 dropped entirely (HLR conflicts with F1 codegen restoration). R6 narrowed to NLPlate + FairCurve (Plate kept — blueprint Phase 2 GeomPlate dep). R7 narrowed to StepKinematics + StepAP209 (StepFEA + StepElement deferred to closure-analysis). LDOM preserved as a deferred consideration. Accepted surface revised from 561 → ~298 classes. |
| 2026-05-18 | Multi-threading reserve applied. `OSD_Thread`, `OSD_ThreadPool` (+ nested `Launcher`), `OSD_Parallel`, `Standard_Mutex` (+ nested `Sentry`/`Sentry_1`/`Sentry_2`), `Standard_Condition`, `BVH_BuildThread`, `BOPAlgo_ParallelAlgo`, `BRepGraph_ParallelPolicy` lifted out of R1 / Finding 2 and documented in a new [Multi-threading reserve](#multi-threading-reserve) section. R1 count: 69 → 64. Accepted surface: ~298 → ~293 classes.                                  |
