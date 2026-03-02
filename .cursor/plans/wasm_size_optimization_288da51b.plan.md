---
name: WASM Size Optimization
overview: "Iteratively reduce the OCCT WASM binary from 17.67 MB through a series of increasingly invasive optimizations: wasm-opt flags, OCCT source patches to break monolithic STEP/TopOpeBRep dependencies, and compile-level size optimization. Each iteration rebuilds, repacks, links through the dependency chain, and verifies kernel tests pass."
todos:
  - id: iter1-wasmopt
    content: "Iteration 1: Change wasm-opt -O3 to -Oz + strip flags in buildFromYaml.py, rebuild (link only), pack, test"
    status: pending
  - id: iter2-compile-os
    content: "Iteration 2: Change OCJS_OPT from -O2 to -Os, recompile sources + link, pack, test"
    status: pending
  - id: iter3-step-patch
    content: "Iteration 3: Source-patch STEP registry (StepAP214_Protocol, RWStepAP214_GeneralModule, RWStepAP214_ReadWriteModule) to remove FEA/Kinematics/Element/DimTol, add to filterPackages.py, rebuild, pack, test"
    status: pending
  - id: iter4-topope-patch
    content: "Iteration 4: Source-patch TKBool_pch.hxx to decouple TopOpeBRep, filter TopOpeBRep packages, rebuild, pack, test"
    status: pending
  - id: iter5-lto-experiment
    content: "Iteration 5 (experimental): Try LTO with -Os and inline-threshold=25, full rebuild, pack, test"
    status: pending
  - id: update-research-doc
    content: Update research doc with final results and new findings
    status: pending
isProject: false
---

# WASM Size Reduction Plan

## Current State

- **WASM size**: 17.67 MB (code: 15.01 MB, data: 2.57 MB, 25,131 functions)
- **Build config**: noLTO (`OCJS_LTO=0`), `-O2` compile, `-flto -O3` link, `wasm-opt -O3`
- **Tarball**: `tarballs/replicad-opencascadejs-0.21.0-v8.24.tgz` (21.4 MB)
- **Catalog ref**: `pnpm-workspace.yaml` line 85 points to the tarball

## Cross-Reference with Prior Research

The [research doc](docs/research/wasm-size-analysis-v762-vs-v8rc4.md) documented that:

- **Package filtering** of TopOpeBRep, STEP sub-modules (FEA/Kinematics/Element/DimTol), and specialized algorithms (FairCurve, Plate, etc.) all **failed at runtime** due to monolithic dependencies
- The root causes are:
  - `RWStepAP214_GeneralModule.cxx` / `ReadWriteModule.cxx` / `StepAP214_Protocol.cxx` directly `#include` ALL STEP entity types and dispatch to them in a monolithic switch statement
  - `TKBool_pch.hxx` includes `TopOpeBRepDS_define.hxx` and `TopOpeBRepBuild_define.hxx`, coupling all TKBool packages (including BRepFill) to TopOpeBRep
  - `BRepFill_Evolved.cxx` uses `BRepAlgo_FaceRestrictor` and `BRepAlgo_Loop` which depend on `BRepAlgo_Image`
- **Source patching** is the only way to break these monolithic dependencies

## Iteration Workflow (repeated for each change)

```
1. Make changes (build flags or OCCT source patches)
2. Rebuild WASM (in repos/opencascade.js/):
   - Flag-only: ./build-wasm.sh link <yaml>
   - Source changes: ./build-wasm.sh pch sources link <yaml>
3. Pack + update dependency chain:
   - Bump version in repos/replicad/packages/replicad-opencascadejs/package.json
   - npm pack → copy .tgz to tarballs/
   - Update pnpm-workspace.yaml catalog reference
   - pnpm install
4. Copy WASM to packages/kernels/src/kernels/replicad/wasm/
5. Run wasm-inspect to measure: pnpm nx wasm-inspect kernels -- --symbols <path> --json
6. Run kernel tests: pnpm nx test kernels --watch=false
7. If tests fail → debug, fix, repeat from step 2
```

**Key paths:**

- Build script: `repos/opencascade.js/build-wasm.sh`
- YAML configs: `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml`
- OCCT sources: `repos/OCCT/src/`
- Package filter: `repos/opencascade.js/src/filter/filterPackages.py`
- wasm-opt invocation: `repos/opencascade.js/src/buildFromYaml.py` line 116
- Catalog ref: `pnpm-workspace.yaml` line 85
- Kernels WASM: `packages/kernels/src/kernels/replicad/wasm/`

---

## Iteration 1: wasm-opt -Oz + strip flags (link-only, ~5 min)

**Impact: Medium | Risk: Low | Speed: Fast (link only)**

Change wasm-opt from speed-optimized to size-optimized in [buildFromYaml.py](repos/opencascade.js/src/buildFromYaml.py) line 116:

```python
# Before:
wasmOptFlags = [wasmOptPath, "-O3", ...]
# After:
wasmOptFlags = [wasmOptPath, "-Oz", "--strip-debug", "--strip-producers", ...]
```

- `-Oz`: Binaryen size optimization (more aggressive function merging, code folding)
- `--strip-debug`: Remove debug name sections
- `--strip-producers`: Remove producer metadata
- Expected savings: 5-15% (~0.9-2.5 MB) with possible minor perf regression
- Rebuild: `./build-wasm.sh link <yaml>` (reuses existing .o files)

## Iteration 2: Compile with -Os (recompile sources, ~30 min)

**Impact: Medium | Risk: Low | Speed: Slow (full recompile)**

Change compile optimization from `-O2` to `-Os`:

```bash
OCJS_OPT=-Os ./build-wasm.sh sources link <yaml>
```

This tells the compiler to optimize for size at each compilation unit level, producing smaller .o files before linking. Combined with wasm-opt -Oz from Iteration 1.

- Expected: additional 5-10% reduction
- Risk: Minimal perf regression on hot paths

## Iteration 3: Source-patch STEP monolithic registry (~30 min)

**Impact: High | Risk: Medium | Speed: Slow (recompile changed sources)**

Patch 3 files in `repos/OCCT/src/DataExchange/TKDESTEP/` to exclude StepFEA, StepKinematics, StepElement, StepDimTol:

### 3a. Patch `StepAP214_Protocol.cxx`

- Remove `#include` lines for all StepFEA, StepKinematics, StepElement, StepDimTol headers (~100 includes)
- Remove `types.Bind(STANDARD_TYPE(StepFEA_*), ...)` registrations (~200 lines)
- Remove `types.Bind(STANDARD_TYPE(StepKinematics_*), ...)` registrations
- Remove `types.Bind(STANDARD_TYPE(StepElement_*), ...)` registrations
- Remove `types.Bind(STANDARD_TYPE(StepDimTol_*), ...)` registrations

### 3b. Patch `RWStepAP214_GeneralModule.cxx`

- Remove `#include "../RWStepFEA/..."` / `StepFEA` / `StepKinematics` / `StepElement` / `StepDimTol` .pxx includes
- Remove corresponding `case N:` blocks in the switch statements

### 3c. Patch `RWStepAP214_ReadWriteModule.cxx`

- Same pattern: remove includes and switch cases for the 4 modules
- This is the file with the 483 KB `ReadStep` function - removing ~200 switch cases should shrink it significantly

### 3d. Add to filterPackages.py

```python
## STEP modules removed via source patches (not needed for CAD geometry)
"StepFEA", "RWStepFEA",
"StepKinematics", "RWStepKinematics",
"StepElement", "RWStepElement",
"StepDimTol", "RWStepDimTol",
"StepAP209", "RWStepAP209",
```

- Expected savings: ~500 KB - 1 MB (877 functions removed + RTTI shrinkage in DynamicType/get_type_descriptor dispatchers)
- Rebuild: `./build-wasm.sh pch sources link <yaml>` (PCH rebuild needed since headers filtered)

## Iteration 4: Source-patch TKBool PCH to decouple TopOpeBRep (~30 min)

**Impact: Medium-High | Risk: High | Speed: Slow (recompile TKBool)**

### 4a. Patch `TKBool_pch.hxx`

Remove lines 17-18:

```cpp
// REMOVED: #include <TopOpeBRepBuild_define.hxx>
// REMOVED: #include <TopOpeBRepDS_define.hxx>
```

### 4b. Check BRepFill runtime dependencies

`BRepFill_Evolved.cxx` uses `BRepAlgo_FaceRestrictor` and `BRepAlgo_Loop` which depend on `BRepAlgo_Image`. These are in the `BRepAlgo` package (same toolkit as TopOpeBRep). We cannot filter BRepAlgo without breaking BRepFill.

Strategy: Only filter TopOpeBRep* packages (not BRepAlgo), and fix any compilation errors in BRepAlgo that arise from the removed PCH.

### 4c. Add to filterPackages.py

```python
## Legacy boolean engine (decoupled from TKBool via PCH patch)
"TopOpeBRep", "TopOpeBRepBuild", "TopOpeBRepDS", "TopOpeBRepTool",
```

- Expected savings: ~530 KB (501+ functions)
- Risk: High - may break BRepFill operations that transitively use TopOpeBRep at runtime. Must validate with full kernel test suite.

## Iteration 5: LTO with inline control (experimental, ~30 min)

**Impact: Potentially High | Risk: Medium | Speed: Slow (full recompile)**

The research doc showed LTO -Os gave **14.85 MB** vs current 17.67 MB. Try LTO with controlled inlining:

```bash
OCJS_LTO=1 OCJS_OPT=-Os ./build-wasm.sh full <yaml>
```

With additional emccFlags in the YAML:

```yaml
- -mllvm -inline-threshold=25
```

This keeps LTO's dead code elimination (which is more aggressive than wasm-ld --gc-sections) while limiting function inlining that causes code duplication.

- Expected: Could reach 14-16 MB range
- Risk: LTO masks dependency issues (as documented in research). Must thoroughly test.

## Expected Cumulative Results

- Iteration 1 (wasm-opt -Oz): ~16.0-17.0 MB
- Iteration 2 (-Os compile): ~15.0-16.0 MB
- Iteration 3 (STEP patch): ~14.5-15.5 MB
- Iteration 4 (TopOpeBRep): ~14.0-15.0 MB
- Iteration 5 (LTO -Os): ~13.0-15.0 MB (experimental)

Target: **14-15 MB** (conservative) or **13-14 MB** (aggressive)
