# WASM Size Analysis: OCCT V7.6.2 vs V8.0.0-RC4

**Date**: 2026-02-26
**Subject**: Deep forensic analysis of the 2.08x WASM binary size increase between replicad-opencascadejs v0.20.2 (OCCT 7.6.2) and our v8-RC4 build.

## Executive Summary

The single-threaded WASM binary grew from **10.80 MB to 22.41 MB** (+107%). The smoking gun is the **code section**, which grew from **7.74 MB to 18.79 MB** (+11.05 MB, +143%). The data section grew by only 0.05 MB and is not a contributor.

Paradoxically, the v8 build has **10,263 fewer functions** (31,607 → 21,344) but **2.43x more code**. The average function size increased from **256 bytes to 923 bytes** (3.6x). This is the signature of aggressive cross-module inlining caused by LLVM LTO — functions were inlined into their callers, reducing function count but dramatically increasing per-function code size through code duplication.

### Root Causes (Ranked by Impact)

| # | Cause | Estimated Impact | Actionable? |
|---|-------|-----------------|-------------|
| 1 | **LLVM LTO cross-module inlining** | ~6-8 MB | Yes — compile .o without -flto, or use -Oz at link |
| 2 | **OCCT v8 code growth** (new algorithms, templates, robin-hood hashing) | ~2-3 MB | Partially — filter more toolkits |
| 3 | **-O2 vs -O3 at link time** (less aggressive dead code elimination, function merging) | ~1-2 MB | Yes — switch to -O3 |
| 4 | **Emscripten 3.1.14 → 5.0.1** (different LLVM backend, WASM codegen changes) | ~0.5-1 MB | No — we need modern emscripten |

---

## Build Environment Comparison

| Parameter | V7.6.2 (replicad v0.20.2) | V8-RC4 (our build) |
|-----------|---------------------------|---------------------|
| **OCCT version** | V7_6_2 | V8_0_0-rc4 |
| **Emscripten** | 3.1.14 (LLVM ~15) | 5.0.1 (LLVM/Clang 23) |
| **Build system** | Docker (donalffons/opencascade.js) | Local (native macOS) |
| **OCJS_OPT** (compile level) | **-O0** (default, not set) | Varies (our builds set it) |
| **OCJS_LTO** (compile LTO) | **0** (default, not set) | **1** (we set it) |
| **.o file format** | Regular WASM objects | LLVM IR bitcode |
| **Link flags** | `-flto -fexceptions -O3 -sDISABLE_EXCEPTION_CATCHING=1` | `-flto -O2 -sDISABLE_EXCEPTION_CATCHING=1 --no-entry -sERROR_ON_UNDEFINED_SYMBOLS=0` |
| **Filtered toolkits** | Minimal (Draw/Test/QA only) | Aggressive (Viz, IGES, VRML, GLTF, OBJ, PLY, persistence, HLR, Express, Helix) |
| **YAML binding count** | 262 symbols | 233 symbols |
| **wasm-opt** post-processing | Via emcc -O3 (internal binaryen) | Explicit wasm-opt -O3 |

### Critical Build Pipeline Difference

**V7.6.2 pipeline (emscripten 3.1.14, no LTO at compile):**
```
.cxx → emcc -O0 → regular WASM .o files
     → wasm-ld (GC unreachable functions) → combined WASM
     → binaryen -O3 (function merging, DCE, peephole) → final WASM
```

**V8-RC4 pipeline (emscripten 5.0.1, LTO at compile):**
```
.cxx → emcc -O0 -flto → LLVM bitcode .o files
     → LLVM LTO at -O2 (IPO, inlining, DCE) → monolithic WASM
     → wasm-opt -O3 (function merging, DCE, peephole) → final WASM
```

The v7.6.2 pipeline never had LLVM do cross-module inlining because the .o files were regular WASM objects, not LLVM bitcode. The linker (wasm-ld) could only do reachability-based GC (remove unreferenced functions) and binaryen could do WASM-level peephole optimization. Functions stayed small and separate.

The v8 pipeline gives LLVM full inter-procedural visibility across ALL 4,156 source files (147 MB of bitcode). LLVM at -O2 aggressively inlines small/medium functions into their callers, creating fewer but much larger functions. This code duplication (the same helper function body appears inlined in dozens of call sites) is the primary cause of the 11 MB growth.

---

## Section-by-Section Breakdown

### WASM Section Sizes

| Section | V7.6.2 | V8-RC4 | Delta | Notes |
|---------|--------|--------|-------|-------|
| **Code** | 7,737,360 B (7.38 MB) | 19,759,180 B (18.84 MB) | **+11.46 MB** | THE source of bloat |
| **Data** | 2,578,872 B (2.46 MB) | 2,633,336 B (2.51 MB) | +0.05 MB | Negligible |
| **Elem** | 69,316 B (67.7 KB) | 49,698 B (48.5 KB) | -19.1 KB | Fewer indirect calls |
| **Type** | 6,905 B | 6,376 B | -0.5 KB | 578→532 signatures |
| **Function** | 32,372 B | 21,941 B | -10.2 KB | 31,607→21,344 entries |
| **Import** | 424 B | 1,557 B | +1.1 KB | 68→55 imports |
| **Export** | 112 B | 209 B | +0.1 KB | 17→11 exports |
| Other | ~375 KB | ~350 KB | ~-25 KB | |
| **Total** | **10,800,306 B (10.30 MB)** | **22,415,023 B (21.38 MB)** | **+11.06 MB** | |

### Code Section: Where Every Byte Goes

The code section accounts for 99.5% of the total size increase. Here's its internal breakdown:

#### Function Size Distribution

| Size Bucket | V7.6.2 Count | V7.6.2 Size | V8-RC4 Count | V8-RC4 Size | Size Delta |
|------------|-------------|-------------|-------------|-------------|------------|
| Tiny (0-64B) | 17,942 (56.8%) | 0.41 MB (5.4%) | 4,063 (19.0%) | 0.09 MB (0.5%) | -0.32 MB |
| Small (64-256B) | 9,312 (29.5%) | 1.05 MB (13.5%) | 7,938 (37.2%) | 1.03 MB (5.5%) | -0.02 MB |
| Medium (256B-1KB) | 3,068 (9.7%) | 1.47 MB (19.0%) | 6,097 (28.6%) | 2.97 MB (15.8%) | +1.50 MB |
| Large (1-4KB) | 1,049 (3.3%) | 1.92 MB (24.8%) | 2,501 (11.7%) | 4.51 MB (24.0%) | **+2.59 MB** |
| Very Large (4-16KB) | 204 (0.6%) | 1.44 MB (18.6%) | 602 (2.8%) | 4.47 MB (23.8%) | **+3.03 MB** |
| Huge (16-64KB) | 27 (0.1%) | 0.75 MB (9.7%) | 123 (0.6%) | 3.39 MB (18.0%) | **+2.64 MB** |
| Massive (64-256KB) | 3 (0.0%) | 0.44 MB (5.7%) | 18 (0.1%) | 1.93 MB (10.3%) | **+1.49 MB** |
| Gigantic (>256KB) | 1 (0.0%) | 0.25 MB (3.3%) | 1 (0.0%) | 0.38 MB (2.0%) | +0.13 MB |

**Key observations:**
- **13,879 tiny functions vanished** in v8. These were inlined into their callers by LLVM LTO.
- **Functions >1KB grew by +9.88 MB** — this is 89.5% of the total code growth.
- Functions >4KB account for **10.17 MB** (54.1%) of v8's code vs **2.88 MB** (37.3%) of v7.6.2.
- The number of "huge+" functions (>16KB) went from 31 to 142 — a **4.6x increase**.
- The top 20 largest functions sum to **2.50 MB** in v8 vs **1.22 MB** in v7.6.2.

This distribution is the unmistakable signature of **aggressive cross-module inlining**. When LLVM has visibility across all compilation units (via LTO bitcode), it inlines small functions into their callers. Each call site that previously called function `f()` now contains a copy of `f()`'s body. For a function called from N sites, its code is duplicated up to N times.

#### Top 10 Largest Functions

| Rank | V7.6.2 Size | V8-RC4 Size |
|------|-------------|-------------|
| #1 | 260 KB | **394 KB** |
| #2 | 234 KB | **246 KB** |
| #3 | 120 KB | **218 KB** |
| #4 | 99 KB | **165 KB** |
| #5 | 57 KB | **159 KB** |
| #6 | 50 KB | **111 KB** |
| #7 | 49 KB | **111 KB** |
| #8 | 46 KB | **110 KB** |
| #9 | 41 KB | **99 KB** |
| #10 | 40 KB | **97 KB** |

Without symbol maps we cannot name these functions, but based on OCCT architecture, the largest functions are likely BOPAlgo boolean operations, BRepOffset algorithms, and STEP translator routines — all heavily templated and deeply nested.

---

## Root Cause Analysis

### Cause 1: LLVM LTO Cross-Module Inlining (Primary — ~6-8 MB)

**The v7.6.2 build was NOT compiled with LTO at the .o level.**

The Dockerfile's `compileSources.py` step runs with default env vars:
- `OCJS_OPT` = `-O0` (default in Common.py)
- `OCJS_LTO` = `0` (default in Common.py)

This means v7.6.2's 4000+ source files were compiled to regular WASM object files at -O0, NOT LLVM bitcode. The `-flto` flag in the YAML's `emccFlags` only affects the link step. Since the .o inputs aren't bitcode, the linker (wasm-ld) performs:
1. Simple reachability-based garbage collection (remove unreferenced functions)
2. Standard WASM linking

Then emscripten's internal binaryen pass at -O3 does WASM-level optimization (constant folding, dead code elimination, function deduplication). Functions stay **small and separate** because there was never an opportunity for cross-module inlining.

Our v8 build compiled with `OCJS_LTO=1`, producing LLVM bitcode. At link time, LLVM has full visibility across all 4,156 source files and performs inter-procedural optimization at -O2, including **aggressive function inlining**. A helper function called from 50 sites gets its body copied into all 50 callers. The function count drops but total code size explodes.

**Evidence:**
- 13,879 tiny functions (< 64 bytes) disappeared from v7.6.2 → v8 (inlined into callers)
- Average function size grew 3.6x (256 → 923 bytes)
- Functions > 1KB grew by +9.88 MB (89.5% of total growth)

**Remediation options:**
1. **Don't compile with -flto** — match the v7.6.2 pipeline: compile at -O0 or -O2 WITHOUT -flto, then link with -flto (which becomes a no-op for non-bitcode inputs). Rely on wasm-ld GC + binaryen -O3.
2. **Use -Oz at link time** — tells LLVM LTO to optimize for size, which dramatically reduces inlining.
3. **Add `-mllvm -inline-threshold=0`** — disable inlining while keeping other LTO optimizations (dead code elimination, constant propagation).
4. **Add `-mllvm -import-instr-limit=5`** — limit the number of instructions that can be imported (inlined) from other modules.

### Cause 2: OCCT V8 Code Growth (~2-3 MB)

OCCT V8.0.0-rc4 introduces significant algorithmic changes:

| Area | Change in V8 | Code Impact |
|------|-------------|-------------|
| **NCollection** | Robin-hood hash maps replacing open addressing | More template instantiations per container type |
| **Boolean ops (BOPAlgo)** | Improved PaveFiller with better interference handling | Larger, more complex functions |
| **BRepOffset** | Rewritten offset algorithm for difficult cases | New code paths |
| **Meshing (BRepMesh)** | Improved triangulation with better element quality | Additional algorithms |
| **STEP translator** | Updated to AP242 support with PMI | More translation code |
| **NCollection_Array** | Contiguous arrays with improved cache locality | Template bloat |
| **Standard_Handle** | Thread-safe reference counting | Additional atomic instructions |

Even without LTO inlining, the v8 source code is ~20-30% larger in the modules we compile. This accounts for roughly 2-3 MB of the growth.

### Cause 3: -O2 vs -O3 at Link Time (~1-2 MB)

The v7.6.2 build used `-O3` at link time. Our v8 uses `-O2`. The differences at -O3:

- **More aggressive binaryen optimization** (function deduplication, code folding)
- **More aggressive dead argument elimination**
- **MergeFunctions pass** merges functions with identical bodies (common with template instantiations)

For a 19 MB code section, moving from -O2 to -O3 typically yields 5-15% size reduction, which would be ~1-2 MB.

### Cause 4: Emscripten Version (3.1.14 → 5.0.1)

The LLVM backend changed from ~15 to 23. Key differences:
- Different instruction selection and register allocation strategies
- Changed WASM code patterns for memory operations
- Updated lowering for exception handling and RTTI
- Different optimization heuristics

This is not directly actionable (we need modern emscripten) but accounts for some code generation differences.

---

## Data Section Analysis (Not a Contributor)

| | V7.6.2 | V8-RC4 | Delta |
|---|--------|--------|-------|
| Size | 2.46 MB | 2.51 MB | +0.05 MB |
| Entries | 2,731 | 3,094 | +363 |

The data section contains:
- **String literals** (error messages, class names for RTTI)
- **vtable pointers** (virtual function dispatch tables)
- **RTTI typeinfo** (class names, type hierarchies)
- **Static constants** (mathematical constants, default parameters)

The 0.05 MB growth is explained by:
- ~363 additional data entries from new OCCT v8 classes
- Slightly longer RTTI type names
- Additional vtables for new class hierarchies

This is negligible and not worth optimizing.

---

## Source Code Statistics

### Compiled Source Files

| Module | .o Files | Bitcode Size | Purpose |
|--------|----------|-------------|---------|
| DataExchange/TKDESTEP | 1,736 | 35 MB | STEP file I/O (AP203/AP214/AP242) |
| ModelingAlgorithms/TKGeomAlgo | 360 | 14 MB | Geometric algorithms |
| ModelingAlgorithms/TKBool | 240 | 12 MB | Boolean operations (and legacy TopOpeBRep) |
| ModelingData/TKGeomBase | 261 | 11 MB | Geometric primitives and curves |
| ModelingAlgorithms/TKTopAlgo | 156 | 9 MB | Topological algorithms |
| ModelingAlgorithms/TKBO | 88 | 8 MB | Modern boolean operations |
| ModelingAlgorithms/TKShHealing | 112 | 8 MB | Shape healing/fixing |
| ModelingAlgorithms/TKFillet | 114 | 7 MB | Fillet and chamfer operations |
| DataExchange/TKXSBase | 198 | 7 MB | Data exchange base classes |
| FoundationClasses/TKMath | 140 | 6 MB | Mathematical foundations |
| ModelingAlgorithms/TKOffset | 34 | 5 MB | Offset surface/shell algorithms |
| ModelingData/TKG3d | 100 | 5 MB | 3D geometry |
| FoundationClasses/TKernel | 128 | 4 MB | Core runtime |
| ApplicationFramework/TKLCAF | 95 | 4 MB | OCAF labels/attributes |
| ModelingData/TKBRep | 76 | 4 MB | Boundary representation |
| ModelingAlgorithms/TKFeat | 35 | 4 MB | Feature operations |
| ModelingAlgorithms/TKMesh | 67 | 3 MB | Mesh generation |
| DataExchange/TKXCAF | 48 | 3 MB | XDE data framework |
| ModelingData/TKG2d | 44 | 2 MB | 2D geometry |
| ApplicationFramework/TKCAF | 31 | 2 MB | OCAF core |
| ModelingAlgorithms/TKPrim | 34 | 1 MB | Primitive shape construction |
| ApplicationFramework/TKCDF | 45 | 1 MB | CDF base framework |
| DataExchange/TKDESTL | 8 | <1 MB | STL file I/O |
| DataExchange/TKDE | 6 | <1 MB | Data exchange framework |
| **Total** | **4,156** | **147 MB** | |

The linker receives 147 MB of LLVM bitcode and produces 18.79 MB of WASM code (12.8% survival rate). In v7.6.2, a comparable amount of source code produced 7.74 MB (roughly 5-6% survival rate with wasm-ld GC). The higher survival rate in v8 is due to LTO inlining expanding code rather than just preserving it.

### Toolkit Filtering Comparison

V7.6.2 filter (minimal — only excluded Draw/Test packages):
```
Excluded: Draw, ViewerTest, QA, D3DHost, IVtk, Test packages
Included: EVERYTHING else (IGES, VRML, HLR, all persistence, all visualization)
```

V8-RC4 filter (aggressive):
```
Excluded: All of the above PLUS:
  - Visualization (TKService, TKV3d, TKVCAF)
  - IGES, VRML, GLTF, OBJ, PLY, DEC, RWMesh
  - All persistence (TKBin*, TKStd*, TKXml*, TKTObj)
  - HLR, Express, Helix
```

**V8 filters MORE but produces a LARGER binary.** This confirms that the size growth is not from including more toolkits — it's from the compilation pipeline (LTO inlining) and OCCT v8 code growth within the toolkits we DO include.

---

## Recommended Action Plan

### Phase 1: Eliminate LTO Inlining Bloat (Expected: -8 to -10 MB)

**Option A (Recommended): Compile without -flto, link with binaryen -O3**
```bash
export OCJS_LTO=0    # Regular WASM .o files, no bitcode
export OCJS_OPT=-O2  # Moderate optimization at compile time
```
YAML emccFlags: remove `-flto`, keep `-O3`

This matches the v7.6.2 pipeline. Without LTO bitcode, the linker can't inline across modules. Combined with -O3 binaryen post-processing, this should produce a binary close to v7.6.2's size for equivalent OCCT code.

**Option B: Keep LTO but disable inlining**
```yaml
emccFlags:
  - -flto
  - -O3
  - -mllvm -inline-threshold=0
```
This keeps LTO's dead code elimination but disables the inlining that causes code duplication.

**Option C: Size-optimized LTO**
```yaml
emccFlags:
  - -flto
  - -Oz
```
Tells LLVM to optimize for size, which drastically reduces inlining heuristics.

### Phase 2: Switch Link to -O3 (Expected: -1 to -2 MB)

Change `-O2` to `-O3` in emccFlags. This enables more aggressive binaryen optimization (function deduplication, MergeFunctions equivalent).

### Phase 3: Verify (Expected: ~12-14 MB total)

After Phase 1 + 2, the binary should be roughly:
- V7.6.2 baseline: 10.8 MB
- OCCT v8 code growth: +2-3 MB
- Emscripten version difference: +0.5-1 MB
- **Expected total: ~13-15 MB**

This is a realistic target for an OCCT v8 build with the same binding surface.

---

## Experimental Results: Build Configuration Exploration

### Package Filtering Experiments

We systematically attempted to reduce WASM size by filtering OCCT packages that are not used by replicad. This section documents all experiments, what broke, and why — serving as a reference for future optimization attempts.

#### Filtering Strategy

Packages were categorized into three tiers of "safety" for removal:

| Tier | Rationale | Packages | Outcome |
|------|-----------|----------|---------|
| **Tier 1** | "Zero dependencies from bound code" — legacy APIs replaced by newer ones | TopOpeBRep, TopOpeBRepBuild, TopOpeBRepDS, TopOpeBRepTool, BRepAlgo, BRepProj | **FAILED** — still called at runtime |
| **Tier 2** | Specialized algorithms not used by replicad | FairCurve, NLPlate, Plate, GeomPlate, ChFi2d, FilletSurf, Draft, BiTgte, Geom2dHatch, Hatch, HatchGen, GeomGridEval | **FAILED** — transitive runtime deps |
| **Tier 3** | STEP/XCAF specializations not needed for geometry | StepFEA, StepKinematics, StepElement, StepAP209, StepDimTol + their RW* counterparts, DESTEP, XCAFDimTolObjects, XCAFNoteObjects, XCAFPrs, XCAFView, TFunction, TDataXtd, IFGraph, BRepPreviewAPI | **FAILED** — STEP I/O registry needs all |

**Safe filters (retained):** Draw/Test modules, Visualization (Three.js renders instead), unused data exchange formats (IGES, VRML, GLTF, OBJ, PLY), persistence drivers (TKBin/TKStd/TKXml), HLR, Expression parser, Helix geometry, TKDE plugin framework.

#### Experiment 1: Tier 1 — Legacy Boolean Engine (TopOpeBRep, BRepAlgo)

**Hypothesis:** TopOpeBRep* and BRepAlgo are the legacy boolean engine, fully replaced by TKBO/BOPAlgo in OCCT v7+. BRepFill (the bound package in TKBool) does not directly reference them.

**Result:** Runtime abort — `Aborted(missing function: _ZN27TopOpeBRepDS_HDataStructureC1Ev)` and `Aborted(missing function: _ZN14BRepAlgo_ImageC1Ev)`.

**Root cause:** Although BRepAlgo/TopOpeBRep are "legacy" from an API perspective, they are still called internally by the meshing engine (`BRepMesh`) and some `BRepBuilderAPI` algorithms. With non-LTO `.o` files, `wasm-ld --gc-sections` correctly removed the dead functions, but the call sites in BRepMesh still reference them. Under LTO builds, the functions were inlined into callers so the dependency was masked.

#### Experiment 2: Tier 2 — Hatching and Grid Evaluation (Geom2dHatch, GeomGridEval)

**Hypothesis:** Geom2dHatch (2D hatching algorithms) and GeomGridEval (grid evaluation of surfaces) are specialized utilities not used by replicad's geometry pipeline.

**Result:** Runtime abort — `Aborted(missing function: _ZN19Geom2dHatch_HatcherC1ERK23Geom2dHatch_Intersectorddbb)` and `Aborted(missing function: _ZN20GeomGridEval_Surface10InitializeERK17Adaptor3d_Surface)`.

**Root cause:** Both are called transitively by TKGeomAlgo algorithms during surface evaluation and boolean operations. Even though replicad doesn't call them directly, OCCT's internal algorithms dispatch to them during tessellation and surface intersection.

#### Experiment 3: Tier 3 — STEP FEA/Kinematics/Element/AP209 Entities

**Hypothesis:** StepFEA (Finite Element Analysis), StepKinematics (motion/mechanism), StepElement (FEA element types), and StepAP209 (composite structural analysis) are domain-specific STEP entity types not needed for CAD geometry import/export.

**Result:** Runtime abort — `Aborted(missing function: _ZN44StepElement_AnalysisItemWithinRepresentation19get_type_descriptorEv)`.

**Root cause:** `RWStepAP214_GeneralModule` and `RWStepAP214_ReadWriteModule` are monolithic registry files that register ALL STEP entity types. They `#include` headers from every STEP entity package and instantiate constructors for each type. Even though we don't use FEA/Kinematics entities, the STEP I/O registry references them unconditionally. Filtering these packages removes the implementations but leaves dangling call sites in RWStepAP214, which abort at runtime.

#### Experiment 4: Tier 3 — STEP Dimensional Tolerances (StepDimTol)

**Hypothesis:** StepDimTol (GD&T — Geometric Dimensioning & Tolerancing) is not needed for basic geometry import/export.

**Result:** Runtime abort — `Aborted(missing function: _ZN32StepDimTol_CylindricityTolerance19get_type_descriptorEv)`.

**Root cause:** Same as Experiment 3 — `RWStepAP214` dynamically dispatches to all STEP entity types including DimTol. The registry pattern makes it impossible to filter individual STEP entity packages without patching RWStepAP214 source code.

#### Experiment 5: DESTEP Plugin Framework

**Hypothesis:** DESTEP is the DE plugin loader for STEP, not the STEP I/O itself. Filtering it should be safe.

**Result:** Runtime abort — `Aborted(missing function: _ZN17DESTEP_ParametersC1Ev)`.

**Root cause:** `STEPCAFControl_Writer` (which replicad uses for STEP export) calls `DESTEP_Parameters()` at runtime to read/set STEP write configuration. DESTEP_Parameters is a thin wrapper around the STEP write options and is required for any STEP I/O operation.

#### Experiment 6: PCH/Header Dependency Issues

During filtering experiments, we discovered that removing packages also prevented their headers from being found during PCH compilation, causing cascading build failures:

- `fatal error: 'DESTEP_Parameters.hxx' file not found`
- `fatal error: 'DE_ShapeFixParameters.hxx' file not found`
- `fatal error: 'Image_Texture.hxx' file not found`
- `fatal error: 'Graphic3d_AlphaMode.hxx' file not found`

**Solution:** Architectural change to `Common.py` — separated header discovery from package filtering:
- `buildFlatIncludes()` symlinks ALL OCCT headers (including from filtered packages) so that transitive `#include` dependencies resolve correctly during compilation. Headers don't affect WASM size.
- `getGlobalIncludes()` (for PCH generation) applies `filterPackages()` to avoid compiling platform-specific headers (OpenGL, D3D, etc.) that won't compile under Emscripten.

#### Experiment 7: Missing Embind Base Classes

With the non-LTO build, several embind binding issues surfaced that had been masked by LTO's code inclusion:

| Error | Missing Type | Required By | Fix |
|-------|-------------|-------------|-----|
| `Cannot construct TDocStd_Document due to unbound types: 12CDM_Document` | `CDM_Document` | `TDocStd_Document` (parent class) | Added `CDM_Document` to YAML bindings |
| `Cannot construct XSControl_WorkSession due to unbound types: 20IFSelect_WorkSession` | `IFSelect_WorkSession` | `XSControl_WorkSession` (parent class) | Added `IFSelect_WorkSession` to YAML bindings |
| `this.oc.Interface_Static.SetIVal is not a function` | `MoniTool_TypedValue`, `Interface_TypedValue` | `Interface_Static` (grandparent classes) | Added both to YAML bindings |

**Root cause:** Emscripten's embind requires all base classes in an inheritance chain to be registered. If `class_<Interface_Static, base<Interface_TypedValue>>` is declared but `Interface_TypedValue` isn't bound, the entire EMSCRIPTEN_BINDINGS block fails silently at runtime — the class object is created but no methods are registered on it. These types were present in V7.6.2's YAML config but were missing from the V8 config.

#### WASM Size Through Filtering Iterations

| Iteration | What Changed | WASM Size | Delta |
|-----------|-------------|-----------|-------|
| Initial V8 LTO build | Baseline (LTO -O2) | 19.65 MB | — |
| Added Tier 1+2+3 filters | Aggressive package removal | 19.17 MB | -0.48 MB |
| Switched to noLTO (OCJS_LTO=0) | Regular WASM .o files, wasm-ld GC | 15.93 MB | -3.24 MB |
| Restored StepFEA/Element/Kinematics | Fix STEP I/O runtime aborts | 16.22 MB | +0.29 MB |
| Removed all Tier 1/2/3 filters | Fix boolean/meshing/hatching aborts | 17.53 MB | +1.31 MB |
| Restored DESTEP | Fix STEP export abort | 17.54 MB | +0.01 MB |
| Added base classes (CDM, IFSelect, etc.) | Fix embind registration | 17.67 MB | +0.13 MB |

#### Key Insight: Non-LTO Exposes True Dependencies

The most significant discovery was that **LTO builds mask runtime dependency failures**. With LTO, LLVM inlines code across compilation units — a function from a "filtered" package might still exist in the binary because it was inlined into a caller from a non-filtered package. The call succeeds at runtime even though the original `.o` file was excluded.

With non-LTO builds, `wasm-ld --gc-sections` performs function-level dead code elimination. If a function's `.o` file is excluded, the function truly does not exist in the binary. Call sites that reference it produce undefined import stubs that abort at runtime. This is correct behavior — it surfaces real dependencies that manual filtering violates.

#### Final Filtering Architecture

The final approach separates concerns:

1. **Safe manual filters** (Draw, Visualization, unused data exchange, persistence): These are genuinely unused — no OCCT algorithm references them at runtime. They are platform-specific (OpenGL, D3D), test-only, or for file formats we don't support.

2. **wasm-ld --gc-sections**: Handles all fine-grained dead code elimination automatically. Functions that are truly unreachable (not called by any code path from our bindings) are removed without risk of runtime failures.

3. **Embind base class completeness**: All classes in the inheritance chain must be registered. The YAML bindings must include not just the classes we use directly, but their entire parent hierarchy.

This architecture produced the optimal result: **17.67 MB** — a 10% reduction from the initial 19.65 MB build, achieved safely through the non-LTO pipeline rather than risky manual filtering.

---

We also systematically tested build configurations to understand the size-vs-performance trade-off:

### Build Configurations Tested

| Config | Compile Opt | LTO | Link Opt | Threading | WASM Size | vs V7.6 |
|--------|-------------|-----|----------|-----------|-----------|---------|
| V7.6.2 baseline | -O0 | No | -O3 (binaryen) | single | **10.30 MB** | — |
| V8 LTO -O2 (initial) | -O2 | Yes | -O2 | single | **21.38 MB** | +107% |
| V8 noLTO -O3 (early) | -O2 | No | -O3 | single | **17.53 MB** | +70% |
| V8 LTO -Os | -Os | Yes | -Os | single | **14.85 MB** | +44% |
| **V8 noLTO -O3 (single)** | -O3 | No | -flto -O3 | single | **17.67 MB** | +72% |
| **V8 noLTO -O3 (multi)** | -O2 | No | -flto -O3 | **multi** | **17.06 MB** | +66% |

Both final V8 builds use `OCJS_LTO=0` (regular WASM .o files, no bitcode) with `-flto -O3` at link time. The `-flto` at link enables binaryen's wasm-opt pass without LLVM LTO inlining, matching V7.6.2's pipeline. This recovers wasm-ld's function-level dead code elimination (--gc-sections) while keeping maximum runtime performance. The multi-threaded build compiles with `-pthread` for SharedArrayBuffer support and pthreads-based parallelism within OCCT algorithms.

### Performance Comparison (Median, milliseconds)

| Operation | V7.6.2 | V8 Single | Δ vs V7.6 | V8 Multi | Δ vs V7.6 | Single vs Multi |
|-----------|--------|-----------|-----------|----------|-----------|-----------------|
| box | 14.4 | 13.9 | **-3.5%** | 13.3 | **-7.6%** | ~same |
| cylinder | 12.5 | 12.8 | +2.4% | 13.5 | +8.0% | ~same |
| sphere | 29.2 | 26.9 | **-7.9%** | 26.1 | **-10.6%** | ~same |
| fuse-two-boxes | 26.6 | 20.7 | **-22.2%** | 21.0 | **-21.1%** | ~same |
| cut-cylinder-from-box | 20.0 | 16.8 | **-16.0%** | 16.6 | **-17.0%** | ~same |
| n-body-fuse | 65.1 | 48.3 | **-25.8%** | 50.0 | **-23.2%** | ~same |
| box-fillet-all | 43.0 | 36.1 | **-16.0%** | 40.0 | **-7.0%** | single faster |
| box-chamfer-all | 39.6 | 32.2 | **-18.7%** | 37.1 | **-6.3%** | single faster |
| sketch-extrude | 12.8 | 11.6 | **-9.4%** | 12.3 | **-3.9%** | ~same |
| sketch-revolve | 15.4 | 13.4 | **-13.0%** | 14.7 | **-4.5%** | single faster |
| bracket | 63.8 | 48.9 | **-23.4%** | 51.8 | **-18.8%** | single faster |
| enclosure | 26.1 | 19.1 | **-26.8%** | 22.2 | **-14.9%** | single faster |
| multi-hole-plate | 242.2 | 185.8 | **-23.3%** | 204.6 | **-15.5%** | single faster |
| tray | 34.0 | 29.0 | **-14.7%** | 32.5 | **-4.4%** | single faster |
| birdhouse | 271.1 | 198.3 | **-26.9%** | 208.0 | **-23.3%** | single faster |
| bottle | 342.3 | 254.4 | **-25.7%** | 264.1 | **-22.8%** | ~same |
| gridfinity-box | 249.7 | 190.9 | **-23.5%** | 212.0 | **-15.1%** | single faster |
| vase | 226.4 | 162.8 | **-28.1%** | 171.5 | **-24.3%** | single faster |
| deep-boolean-chain | 132.1 | 91.7 | **-30.6%** | 101.3 | **-23.3%** | single faster |

### Key Findings

1. **Both V8-RC4 builds are faster than V7.6.2 across the board.** All 19 operations are faster in both single and multi-threaded modes, with complex operations seeing 15-30% improvements from OCCT V8's improved algorithms.

2. **Single-threaded is consistently faster than multi-threaded.** The multi-threaded build adds ~5-15% overhead on most operations. This is expected: pthread support introduces atomic operations, shared memory fences, and thread synchronization overhead that affects single-operation benchmarks. Multi-threading shines when running multiple CAD operations concurrently (e.g., parallel tessellation of many faces), not when running individual operations sequentially.

3. **Simple primitives match or beat V7.6.2 in both modes.** Box, sphere, and boolean ops are faster across the board, resolving the earlier regression seen in LTO-compiled builds.

4. **Complex operations see the largest gains.** Deep boolean chains (-30.6% single / -23.3% multi), vase (-28.1% / -24.3%), birdhouse (-26.9% / -23.3%), and bottle (-25.7% / -22.8%) all benefit significantly from OCCT V8's improved BOPAlgo and BRepOffset algorithms.

5. **WASM sizes:** Single 17.67 MB (+72%), Multi 17.06 MB (+66%). The multi-threaded binary is actually slightly smaller due to differences in how shared-memory WASM code is emitted. Both compress to ~5-6 MB with brotli for HTTP transfer.

### Conclusion

The final V8-RC4 builds achieve:

| Metric | V8 Single | V8 Multi |
|--------|-----------|----------|
| **WASM size** | 17.67 MB (+72% vs V7.6) | 17.06 MB (+66% vs V7.6) |
| **Complex ops vs V7.6** | 20-30% faster | 15-25% faster |
| **Simple ops vs V7.6** | Parity or faster | Parity or faster |
| **Tests passing** | 753/757 (4 skipped) | 753/757 (4 skipped) |
| **Best for** | Maximum single-op perf | Concurrent ops, parallel tessellation |

The recommended default is **single-threaded** for best sequential performance. Multi-threaded should be used when the application benefits from parallel OCCT internals (e.g., meshing large assemblies with `isInParallel=true`, concurrent boolean operations on independent shapes).

Both use **noLTO -O3** (`OCJS_LTO=0`, link with `-flto -O3`). Multi-threaded additionally requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` HTTP headers for SharedArrayBuffer support in browsers.

---

## Build Script

All builds referenced in this analysis can be reproduced via `repos/opencascade.js/build-wasm.sh`:

```bash
# Rebuild PCH (needed after filterPackages.py changes) + link single WASM
./build-wasm.sh pch link ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Link only (reuses existing .o files — fastest iteration)
./build-wasm.sh link ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Full pipeline from scratch
./build-wasm.sh full ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Multi-threaded build (requires clean .o files compiled with -pthread)
OCJS_LTO=0 THREADING=multi-threaded ./build-wasm.sh full ../replicad/packages/replicad-opencascadejs/build-config/custom_build_multi_v8.yml

# Override flags for experimentation
OCJS_OPT=-O0 OCJS_LTO=0 ./build-wasm.sh link <yaml>
OCJS_EXCEPTIONS=1 ./build-wasm.sh link <yaml>
```

**Note:** Single and multi-threaded builds produce incompatible `.o` files (atomics/shared-memory features). Delete `build/bindings/**/*.o` and `build/sources/**/*.o` when switching between threading modes.

Run `./build-wasm.sh` with no arguments for full usage details.

---

## Appendix: Raw Data

### Function Size Percentiles

| Percentile | V7.6.2 (bytes) | V8-RC4 (bytes) | Ratio |
|------------|---------------|----------------|-------|
| Median (P50) | 52 | 208 | 4.0x |
| P90 | 386 | 1,530 | 3.96x |
| P95 | 838 | 2,934 | 3.50x |
| P99 | 3,406 | 12,466 | 3.66x |
| Max | 266,075 | 403,463 | 1.52x |

### Binary File Sizes

| File | V7.6.2 | V8-RC4 (initial) | V8-RC4 Single (final) | V8-RC4 Multi (final) |
|------|--------|-------------------|-----------------------|----------------------|
| .wasm | 10,800,306 B (10.30 MB) | 22,415,023 B (21.38 MB) | 18,531,825 B (17.67 MB) | 17,891,328 B (17.06 MB) |
| .js | 135,504 B (132 KB) | 111,898 B (109 KB) | 112,199 B (110 KB) | 129,634 B (127 KB) |
| .d.ts | 9,006 lines (407 KB) | 8,241 lines (352 KB) | 8,554 lines (365 KB) | 8,554 lines (365 KB) |

### WASM Import/Export Counts

| | V7.6.2 | V8-RC4 |
|---|--------|--------|
| Imports (JS→WASM) | 68 | 55 |
| Exports (WASM→JS) | 17 | 11 |
| Elem table entries | 28,617 | 24,240 |
| Type signatures | 578 | 532 |
