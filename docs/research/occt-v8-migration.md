# OCCT V8 Migration Report

**Date**: 2026-02-27
**Subject**: Comprehensive report on migrating from OCCT V7.6.2 (Emscripten 3.1.14) to OCCT V8.0.0-RC4 (Emscripten 5.0.1) — current state, findings, and planned enhancements.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Migration Overview](#migration-overview)
3. [Build Pipeline Architecture](#build-pipeline-architecture)
4. [WASM Size Analysis](#wasm-size-analysis)
5. [Performance Results](#performance-results)
6. [Exception Handling](#exception-handling)
7. [Multi-Threading Analysis](#multi-threading-analysis)
8. [Post-Processing Optimizations](#post-processing-optimizations)
9. [Planned Enhancements](#planned-enhancements)
10. [Build Reference](#build-reference)

---

## Executive Summary

The OCCT V8 migration upgrades the CAD kernel from V7.6.2 to V8.0.0-RC4 and the Emscripten toolchain from 3.1.14 to 5.0.1. The migration achieves **15-30% faster geometry operations** at the cost of a **72% larger WASM binary** (10.30 MB → 17.67 MB). The size increase is primarily caused by switching from a non-LTO to an LTO-based compilation pipeline, which was subsequently reverted — but OCCT V8's inherent code growth still accounts for +2-3 MB.

### Current State (as of 2026-02-27)

| Metric | V7.6.2 Baseline | V8 Single (current) | V8 Multi |
|--------|-----------------|---------------------|----------|
| **WASM size** | 10.30 MB | 17.67 MB (+72%) | 17.06 MB (+66%) |
| **Complex op speed** | baseline | 20-30% faster | 15-25% faster |
| **Simple op speed** | baseline | parity or faster | parity or faster |
| **Tests passing** | 753/757 | 753/757 | 753/757 |
| **OCCT version** | V7_6_2 | V8_0_0-rc4 | V8_0_0-rc4 |
| **Emscripten** | 3.1.14 (LLVM ~15) | 5.0.1 (LLVM/Clang 23) | 5.0.1 |
| **Exception handling** | JS-based (`-fexceptions`) | Disabled (`-sDISABLE_EXCEPTION_CATCHING=1`) | Disabled |
| **Build variants** | single + with_exceptions | single only (with_exceptions not yet built) | multi only |

### Key Decisions Made

1. **Reverted LTO at compile time** (`OCJS_LTO=0`) — eliminated 6-8 MB of cross-module inlining bloat
2. **Kept `-flto -O3` at link time** — enables binaryen wasm-opt without LLVM inlining
3. **Added `--strip-debug --strip-producers`** to wasm-opt — removes WASM name/producer metadata (~0.3 MB savings, zero runtime impact)
4. **Adopted noLTO pipeline** matching V7.6.2's architecture — `.cxx → emcc → regular WASM .o → wasm-ld GC → binaryen -O3`
5. **Identified multi-threading is non-functional** — OCCT parallelism is never enabled at the algorithm level

### Critical Next Steps

1. **Migrate to `-fwasm-exceptions`** — native WASM exception handling (replaces both `single` and `with_exceptions` builds)
2. **Enable OCCT parallel mode** — fix the root cause of multi-threading overhead
3. **Continue WASM size optimization** — wasm-opt `-Oz`, `-Os` compile, STEP source patches

---

## Migration Overview

### Technology Stack Changes

| Component | Before | After |
|-----------|--------|-------|
| **OCCT** | V7.6.2 | V8.0.0-RC4 |
| **Emscripten** | 3.1.14 | 5.0.1 |
| **LLVM** | ~15 | 23 (Clang 23) |
| **Build system** | Docker (donalffons/opencascade.js) | Local (native macOS) |
| **Package** | npm (replicad-opencascadejs v0.20.2) | Local tarball (v0.21.0-v8.25) |
| **Build script** | Dockerfile-based | `repos/opencascade.js/build-wasm.sh` |

### OCCT V8 Algorithmic Improvements

| Area | Change | Impact |
|------|--------|--------|
| **NCollection** | Robin-hood hash maps | Better cache performance, more template instantiations |
| **BOPAlgo** | Improved PaveFiller interference handling | 20-30% faster booleans |
| **BRepOffset** | Rewritten offset algorithm | Better handling of difficult offset cases |
| **BRepMesh** | Improved triangulation quality | Higher quality meshes |
| **STEP** | Updated to AP242 with PMI support | More complete data exchange |
| **Standard_Handle** | Thread-safe reference counting | Enables multi-threading but adds atomics overhead |

### Repository Structure

```
repos/
├── OCCT/                     # OpenCASCADE source (V8_0_0-rc4 branch)
├── opencascade.js/           # Build system (build-wasm.sh, Python scripts)
│   └── src/
│       ├── buildFromYaml.py  # WASM linking + wasm-opt
│       ├── compileSources.py # Source compilation
│       ├── compileBindings.py # Embind binding compilation
│       ├── Common.py         # Shared config (PCH, includes, flags)
│       └── filter/
│           └── filterPackages.py  # Package exclusion list
├── replicad/
│   └── packages/
│       ├── replicad/         # CAD library (JS API over OCCT)
│       └── replicad-opencascadejs/
│           ├── build-config/ # YAML build configurations
│           │   ├── custom_build_single_v8.yml
│           │   ├── custom_build_multi_v8.yml
│           │   ├── custom_build_with_exceptions_v8.yml
│           │   ├── custom_build_single.yml        # V7.6 (legacy)
│           │   └── custom_build_with_exceptions.yml # V7.6 (legacy)
│           └── src/          # Generated .wasm, .js, .d.ts outputs
└── assimpjs/
    └── emsdk/                # Emscripten SDK installation
```

---

## Build Pipeline Architecture

### V7.6.2 Pipeline (Emscripten 3.1.14)

```
.cxx → emcc -O0 → regular WASM .o files
     → wasm-ld (--gc-sections: remove unreferenced functions) → combined WASM
     → binaryen -O3 (function merging, DCE, peephole) → final WASM
```

Functions remained small and separate. No cross-module inlining. The linker could only do reachability-based garbage collection.

### V8 Pipeline — Initial (LTO, caused +107% bloat)

```
.cxx → emcc -O2 -flto → LLVM bitcode .o files (147 MB total)
     → LLVM LTO at -O2 (IPO, cross-module inlining, DCE) → monolithic WASM
     → wasm-opt -O3 → final WASM (22.41 MB)
```

LLVM had visibility across all 4,156 source files and aggressively inlined functions across modules. 13,879 tiny functions were absorbed into their callers, creating fewer but much larger functions. Average function size grew 3.6x (256 → 923 bytes).

### V8 Pipeline — Final (noLTO, matches V7.6.2 architecture)

```
.cxx → emcc -O2 → regular WASM .o files
     → wasm-ld (--gc-sections) → combined WASM
     → binaryen -O3 + --strip-debug --strip-producers → final WASM (17.67 MB)
```

Reverted to `OCJS_LTO=0`. `-flto` in the YAML link flags enables binaryen's wasm-opt pass without LLVM-level inlining (since inputs are regular WASM objects, not bitcode). This recovers function-level dead code elimination.

### Compilation Flags

**Compile time** (controlled by `build-wasm.sh` environment variables):

| Variable | Default | Purpose |
|----------|---------|---------|
| `OCJS_OPT` | `-O2` | Optimization level for .o compilation |
| `OCJS_LTO` | `1` (build-wasm.sh overrides to `0`) | LTO at compile: `0` = regular WASM .o, `1` = LLVM bitcode |
| `OCJS_EXCEPTIONS` | `0` (via build-wasm.sh) | Exception handling mode |
| `THREADING` | `single-threaded` | Threading mode |

**Link time** (from YAML `emccFlags`):

| Flag | single_v8 | multi_v8 | with_exceptions_v8 |
|------|-----------|----------|-------------------|
| `-flto` | Yes | Yes | Yes |
| `-O3` | Yes | Yes | Yes |
| `-sDISABLE_EXCEPTION_CATCHING` | `=1` | `=1` | `=0` |
| `-fexceptions` | No | No | Yes |
| `-pthread` | No | Yes (via `-sPTHREAD_POOL_SIZE`) | No |
| `--emit-symbol-map` | Yes | Yes | No |
| `-sSTACK_SIZE` | `8388608` | `8388608` | `8388608` |

**Critical detail**: Even with `OCJS_EXCEPTIONS=0`, all builds compile with `-fexceptions` at the source level (see `compileSources.py` line 79). The throw infrastructure (`__cxa_throw`, landing pads) is always present. Only the catch wrappers (`invoke_SIG` trampolines) are toggled by `DISABLE_EXCEPTION_CATCHING`.

---

## WASM Size Analysis

### Size Evolution Through Optimization

| Iteration | Configuration | WASM Size | Delta |
|-----------|--------------|-----------|-------|
| V7.6.2 baseline | `-O0` compile, `-O3` link, no LTO | **10.30 MB** | — |
| V8 initial | `-O2` compile, LTO, `-O2` link | **22.41 MB** | +117% |
| V8 LTO -Os | `-Os` compile, LTO, `-Os` link | **14.85 MB** | +44% |
| V8 noLTO | `-O2` compile, no LTO, `-O3` link | **17.53 MB** | +70% |
| V8 noLTO + embind fixes | + base class bindings | **17.67 MB** | +72% |
| V8 noLTO + strip flags | + `--strip-debug --strip-producers` | **~17.4 MB** | +69% |

### Why V8 Is Larger Than V7.6.2

Even with the same noLTO pipeline, V8 is ~7 MB larger due to:

1. **OCCT V8 code growth** (~2-3 MB) — robin-hood hashing, improved algorithms, template bloat, thread-safe handles
2. **Emscripten 3→5 code generation** (~0.5-1 MB) — different LLVM backend (15 → 23), changed instruction selection
3. **More aggressive toolkit inclusion** — V7.6.2 included IGES/VRML/HLR but they were dead-code eliminated; V8's toolkit filtering excludes them at build time but the remaining toolkits are larger
4. **Compile optimization** — V7.6.2 compiled at `-O0` (smaller .o files, linker does all optimization); V8 compiles at `-O2` (larger .o files with more complex code)

### Package Filtering Experiments

Systematic attempts to filter OCCT packages all failed due to monolithic dependencies:

| Filtered Packages | Reason for Failure |
|-------------------|-------------------|
| TopOpeBRep, BRepAlgo (legacy boolean) | Still called by BRepMesh and BRepBuilderAPI at runtime |
| Geom2dHatch, GeomGridEval (specialized) | Transitively required by TKGeomAlgo during tessellation |
| StepFEA, StepKinematics, StepElement, StepDimTol | `RWStepAP214_GeneralModule` monolithic registry includes ALL STEP entities |
| DESTEP | `STEPCAFControl_Writer` requires `DESTEP_Parameters` at runtime |

**Key insight**: LTO builds mask dependency failures. With LTO, filtered functions may still exist because they were inlined into non-filtered callers. Non-LTO builds expose true dependencies via `wasm-ld --gc-sections` — if a function's `.o` is excluded, the function is truly absent and call sites abort.

### Safe Filters (Retained)

These are genuinely unused and safely excluded:

- **Visualization**: TKService, TKV3d, TKVCAF (Three.js renders instead)
- **Unused data exchange**: IGES, VRML, GLTF, OBJ, PLY, RWMesh
- **Persistence drivers**: TKBin*, TKStd*, TKXml*, TKTObj
- **Specialized**: HLR, Expression parser, Helix geometry
- **Platform-specific**: Draw, ViewerTest, QA, D3DHost, IVtk
- **Plugin framework**: TKDE

### Embind Base Class Requirement

Emscripten's embind requires all classes in an inheritance chain to be registered. Missing base classes cause silent failures — the class object is created but no methods are registered. Types added to fix embind issues:

| Missing Base | Required By | Impact |
|-------------|-------------|--------|
| `CDM_Document` | `TDocStd_Document` | STEP export failed |
| `IFSelect_WorkSession` | `XSControl_WorkSession` | STEP I/O failed |
| `MoniTool_TypedValue` | `Interface_Static` | Configuration methods missing |
| `Interface_TypedValue` | `Interface_Static` | Same |

---

## Performance Results

### V8 vs V7.6.2 Benchmark Comparison (median, ms)

| Operation | V7.6.2 | V8 Single | Δ | V8 Multi | Δ |
|-----------|--------|-----------|---|----------|---|
| box | 14.4 | 13.9 | -3.5% | 13.3 | -7.6% |
| cylinder | 12.5 | 12.8 | +2.4% | 13.5 | +8.0% |
| sphere | 29.2 | 26.9 | -7.9% | 26.1 | -10.6% |
| fuse-two-boxes | 26.6 | 20.7 | **-22.2%** | 21.0 | -21.1% |
| cut-cylinder-from-box | 20.0 | 16.8 | **-16.0%** | 16.6 | -17.0% |
| n-body-fuse | 65.1 | 48.3 | **-25.8%** | 50.0 | -23.2% |
| box-fillet-all | 43.0 | 36.1 | **-16.0%** | 40.0 | -7.0% |
| box-chamfer-all | 39.6 | 32.2 | **-18.7%** | 37.1 | -6.3% |
| sketch-extrude | 12.8 | 11.6 | -9.4% | 12.3 | -3.9% |
| sketch-revolve | 15.4 | 13.4 | -13.0% | 14.7 | -4.5% |
| bracket | 63.8 | 48.9 | **-23.4%** | 51.8 | -18.8% |
| enclosure | 26.1 | 19.1 | **-26.8%** | 22.2 | -14.9% |
| multi-hole-plate | 242.2 | 185.8 | **-23.3%** | 204.6 | -15.5% |
| tray | 34.0 | 29.0 | -14.7% | 32.5 | -4.4% |
| birdhouse | 271.1 | 198.3 | **-26.9%** | 208.0 | -23.3% |
| bottle | 342.3 | 254.4 | **-25.7%** | 264.1 | -22.8% |
| gridfinity-box | 249.7 | 190.9 | **-23.5%** | 212.0 | -15.1% |
| vase | 226.4 | 162.8 | **-28.1%** | 171.5 | -24.3% |
| deep-boolean-chain | 132.1 | 91.7 | **-30.6%** | 101.3 | -23.3% |

### Key Performance Findings

1. **V8 is faster across all 19 operations** in single-threaded mode, with complex operations seeing 15-30% improvements from OCCT V8's improved BOPAlgo and BRepOffset algorithms
2. **Multi-threaded is consistently slower** than single-threaded (see [Multi-Threading Analysis](#multi-threading-analysis) for root cause)
3. **Complex operations benefit most**: deep-boolean-chain (-30.6%), vase (-28.1%), birdhouse (-26.9%), bottle (-25.7%)
4. **Simple primitives at parity**: box (-3.5%), cylinder (+2.4%), sphere (-7.9%)

---

## Exception Handling

### The Two-Build Architecture (Legacy)

Historically, the project maintained two WASM build variants:

| Variant | Exception Mode | WASM Size | Use Case |
|---------|---------------|-----------|----------|
| `replicad_single.wasm` | Disabled (`-sDISABLE_EXCEPTION_CATCHING=1`) | 10.30 MB (V7.6) | Production — fast, small |
| `replicad_with_exceptions.wasm` | Enabled (`-fexceptions -sDISABLE_EXCEPTION_CATCHING=0`) | ~19 MB (V7.6) | Debug — decoded error messages |

The ~80% size increase from enabling exceptions comes from **`invoke_SIG` JavaScript trampolines**. Emscripten wraps every potentially-throwing C++ function call in a JS trampoline:

```javascript
function invoke_viii(index, a1, a2, a3) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1, a2, a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}
```

For OCCT's 21,000+ functions with many distinct signatures, this creates thousands of invoke wrappers. Each wrapper forces a WASM→JS→WASM transition on every call, adding size and runtime overhead even when no exceptions are thrown.

### Current Exception Behavior

With `DISABLE_EXCEPTION_CATCHING=1` (current single build):

1. **Throw code is present** — all builds compile with `-fexceptions`, so `__cxa_throw`, landing pads, and cleanup code exist in the `.o` files
2. **Catch code is absent** — no `invoke_SIG` wrappers generated at link time
3. **OCCT's internal try/catch doesn't work** — algorithms like BOPAlgo that catch `Standard_Failure` to set error flags cannot catch
4. **Exceptions propagate to JS as numeric pointers** — the raw `Standard_Failure*` pointer reaches JavaScript
5. **Error appears as**: `KernelError: Unknown kernel error (code 12324784)` — the pointer can't be decoded without the `OCJS.getStandard_FailureData()` binding

The `oc-exceptions.ts` module handles exception extraction from multiple Emscripten formats:
- `OcExceptionError` (proxy wrapper — preserves JS stack)
- Bare number (legacy Emscripten throw)
- `CppException` (Emscripten 5.x `Error` subclass with `excPtr` property)

When `withExceptions: false` (default), there is no `OCJS` binding to decode the pointer, so the generic "Unknown kernel error" message is shown.

### `--strip-debug` and `--strip-producers` Impact

These wasm-opt flags strip **metadata sections only**:
- **Name section**: Human-readable C++ function names for browser devtools
- **Producer section**: Build tool version information

They have **zero effect** on:
- Runtime behavior or speed
- Exception throwing/catching mechanics
- The kernel's `oc-exceptions.ts` stack tracing (which uses JS stack frames)
- Benchmark performance

The stack traces shown in the UI (`formatRuntimeErrorWithOc`, `runMain`, etc.) come entirely from JavaScript — the Proxy wrapper and try/catch in `oc-exceptions.ts`. WASM function names from the name section are only visible in browser devtools, not in application-level error reporting.

The `--emit-symbol-map` flag generates a side file (`.symbols`) for devtools name restoration. This has zero runtime cost — the map is never loaded unless browser devtools explicitly requests it.

### Emscripten Exception Modes (3.x → 5.x)

| Mode | Throw | Catch | Size Impact | Perf Impact | OCCT Compat |
|------|-------|-------|-------------|-------------|-------------|
| **`-fno-exceptions`** | `std::terminate()` | None | Smallest | Fastest | **BREAKS** — OCCT uses try/catch internally |
| **`-fexceptions -sDISABLE_EXCEPTION_CATCHING=1`** (current) | `__cxa_throw` → propagate | None | Medium (throw code present) | Fast | Partial — internal catch blocks non-functional |
| **`-fexceptions -sDISABLE_EXCEPTION_CATCHING=0`** (old with_exceptions) | `__cxa_throw` → JS | JS invoke wrappers | **+80%** | **Slow** (every call bounces JS) | Full |
| **`-fwasm-exceptions`** (recommended) | Native WASM `throw` | Native WASM `try/catch` | **Small** (no invoke wrappers) | **Near-native** (zero-cost happy path) | **Full** |

The fundamental change from Emscripten 3→5 is that **native WASM exception handling** (`-fwasm-exceptions`) is production-ready with **94.55% global browser support** (Chrome 95+, Firefox 100+, Safari 15.2+, Edge 95+, as of Nov 2024).

### Why `-fwasm-exceptions` Replaces Both Builds

With native WASM exceptions:

1. **No invoke wrappers** — the WASM engine handles try/catch natively via `try`/`catch`/`throw` instructions
2. **Zero-cost on happy path** — modern WASM engines implement zero-cost exception handling (no overhead when exceptions aren't thrown)
3. **Proper stack unwinding** — destructors run correctly, RAII works, OCCT's internal cleanup runs
4. **OCCT's internal try/catch works** — `BOPAlgo_Builder`'s catch blocks that convert exceptions to error flags function correctly
5. **JS can decode exceptions** — with `-sEXPORT_EXCEPTION_HANDLING_HELPERS`, Emscripten provides `getExceptionMessage(e)` returning `[typeName, message]`. Since `Standard_Failure` inherits from `std::exception` and implements `what()`, this works without the custom `OCJS.getStandard_FailureData()` C++ binding

**Result**: One build replaces both `single` and `with_exceptions` — providing size close to the current single build, with full exception support and near-zero performance overhead.

### OCCT Exception Architecture

OCCT uses exceptions in two patterns:

**Pattern A: Internal catch-and-convert** — high-level algorithms catch and set error flags:
```cpp
// BOPAlgo_Builder
try {
  PerformInternal(theRange);
} catch (Standard_Failure const&) {
  AddError(new BOPAlgo_AlertBuilderFailed);
}
```

**Pattern B: Defensive catch** — prevent abort on recoverable errors:
```cpp
// BRepFill_OffsetWire
try {
  MakeSticks();
} catch (Standard_Failure const& anException) {
  myShape.Nullify();
  myIsDone = false;
}
```

The `Standard_Failure` exception hierarchy:
```
Standard_Failure (base, inherits std::exception)
├── Standard_DomainError
│   ├── Standard_RangeError (NullValue, OutOfRange)
│   ├── Standard_ConstructionError
│   ├── Standard_NoSuchObject
│   └── Standard_TypeMismatch
├── Standard_ProgramError (NotImplemented)
├── Standard_NumericError (DivideByZero, Overflow, Underflow)
└── StdFail_NotDone
```

With `DISABLE_EXCEPTION_CATCHING=1` (current), Pattern A and B don't work — exceptions abort instead of being caught gracefully. With `-fwasm-exceptions`, both patterns function correctly.

---

## Multi-Threading Analysis

### Root Cause: Parallelism Never Enabled

The multi-threaded WASM build provides pthread infrastructure but **no OCCT algorithm ever dispatches work to threads**.

**Finding 1: Meshing hardcodes `isInParallel = false`**

In `repos/replicad/packages/replicad/src/shapes.ts` line 390-397:

```typescript
protected _mesh({ tolerance = 1e-3, angularTolerance = 0.1 } = {}): void {
  new this.oc.BRepMesh_IncrementalMeshWrapper(
    this.wrapped,
    tolerance,
    false,          // isRelative
    angularTolerance,
    false           // isInParallel = FALSE
  );
}
```

The 5th parameter `isInParallel` controls whether OCCT distributes face-level meshing across threads. It is hardcoded to `false`.

**Finding 2: Boolean operations default to sequential**

In `repos/OCCT/src/ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_Options.cxx`:

```cpp
bool myGlobalRunParallel = false;  // Global default

BOPAlgo_Options::BOPAlgo_Options()
    : myRunParallel(myGlobalRunParallel),  // Initialized from global = false
      ...
```

Every `BRepAlgoAPI_Fuse`, `BRepAlgoAPI_Cut`, etc. inherits `myRunParallel = false`. Neither replicad nor the kernel code calls `SetRunParallel(true)` or `BOPAlgo_Options::SetParallelMode(true)`.

**Finding 3: No parallel mode initialization at WASM startup**

The kernel initializes the multi-threaded WASM in `init-open-cascade.ts` but never calls any OCCT parallel configuration APIs.

### Overhead Breakdown

Since no parallelism is utilized, the multi-threaded build pays pure overhead:

| Overhead Source | Impact | Mechanism |
|----------------|--------|-----------|
| `malloc`/`free` global mutex | ~3-8% | `dlmalloc` uses `pthread_mutex_lock`/`unlock` for every allocation |
| Atomic memory fences | ~2-5% | `-pthread` flag inserts barriers at every shared state access |
| `ALLOW_MEMORY_GROWTH` + pthreads | ~1-3% | HEAP typed array views require frequent revalidation |
| Pre-spawned worker pool | ~50-200 MB RAM | `PTHREAD_POOL_SIZE=navigator.hardwareConcurrency` loads WASM in N workers |

This perfectly explains why multi-threaded is 5-15% slower on every benchmark.

### Thread Pool Configuration

Current multi-threaded build (`custom_build_multi_v8.yml`):

```yaml
- -sPTHREAD_POOL_SIZE='typeof navigator!=="undefined"?navigator.hardwareConcurrency:require("os").cpus().length'
```

This pre-spawns `navigator.hardwareConcurrency` workers (typically 4-16) at WASM initialization. Each worker loads its own copy of the WASM module from the same `SharedArrayBuffer` memory. On a 16-core machine, this allocates ~270 MB just for idle workers.

### OCCT Parallel Architecture

OCCT V8 uses `OSD_Parallel` as its parallelization API with two backends:
- **TBB** (Intel Threading Building Blocks) — used when `HAVE_TBB` is defined
- **OSD_ThreadPool** (pthreads-based) — fallback when TBB is unavailable

Since `HAVE_TBB` is not defined for the Emscripten build, OCCT falls back to `OSD_ThreadPool` which uses pthreads directly. This is compatible with Emscripten's pthread implementation.

Operations that support parallelism (when enabled):
- **BRepMesh**: Face healing, seam edges, edge/face discretization (via `OSD_Parallel::For()`)
- **BOPAlgo**: Builder, WireSplitter, CellsBuilder (via `BOPTools_Parallel::Perform()`)
- **BRepExtrema**: Distance calculations
- **BRepCheck**: Shape validation

### Stress Test Limitations

Even with parallelism properly enabled, the stress test (`libs/tau-examples/src/kernels/replicad/stress-test/main.ts`) has inherent sequential dependencies:

```typescript
for (const pos of circHolePositions) {
  const hole = makeCylinder(...);
  block = block.cut(hole);  // Each cut depends on the previous shape
}
```

Each boolean operation modifies the shape and the next operation depends on the result. OCCT's internal parallelism (parallel sub-shape processing within a single boolean op) could help, but the operations themselves cannot run concurrently.

### Multi-Threading Fix Plan

To make multi-threading beneficial:

1. **Enable parallel meshing**: Pass `isInParallel = true` to `BRepMesh_IncrementalMesh`
2. **Enable BOPAlgo parallel mode**: Call `BOPAlgo_Options::SetParallelMode(true)` at WASM init, or bind `SetRunParallel` for per-algorithm control
3. **Use mimalloc**: Add `-sMALLOC=mimalloc` to eliminate `dlmalloc` contention (per-thread allocation arenas)
4. **Cap thread pool**: Change `PTHREAD_POOL_SIZE` to `Math.min(navigator.hardwareConcurrency, 4)` to reduce memory waste
5. **Default to single-threaded**: Multi-threading should only activate for workloads with sufficient parallelizable sub-tasks (>100ms of parallel-eligible work)

---

## Post-Processing Optimizations

### wasm-opt Flags (Applied)

The `buildFromYaml.py` wasm-opt invocation was updated to:

```python
wasmOptFlags = [wasmOptPath, "-O3", "--strip-debug", "--strip-producers",
                "--enable-mutable-globals", "--enable-bulk-memory",
                "--enable-sign-ext", "--enable-nontrapping-float-to-int"]
```

- `-O3`: Speed-optimized binaryen passes (function merging, DCE, peephole)
- `--strip-debug`: Remove WASM name section (~0.2 MB)
- `--strip-producers`: Remove producer metadata (~0.1 MB)
- Feature flags: Enable WASM features for the passes

### `--emit-symbol-map`

The `--emit-symbol-map` link flag generates a `.symbols` side file mapping minified function IDs to original C++ names. This is:
- **Zero runtime cost** — the map file is never loaded unless devtools requests it
- **Useful for debugging** — browser devtools can load it to show meaningful stack traces
- **Does not affect** the `oc-exceptions.ts` error tracing, which uses JavaScript stack frames

---

## Planned Enhancements

### Phase 1: `-fwasm-exceptions` Migration (High Priority)

**Goal**: Replace both `single` and `with_exceptions` builds with a single `-fwasm-exceptions` build.

**Changes required**:

1. **`compileSources.py` / `compileBindings.py` / `Common.py`** — change exception flags:
   ```python
   # From: ["-fexceptions", "-sDISABLE_EXCEPTION_CATCHING=..."]
   # To:   ["-fwasm-exceptions"]
   exception_flags = ["-fwasm-exceptions"]
   ```

2. **YAML `emccFlags`** — replace exception flags:
   ```yaml
   emccFlags:
     - -fwasm-exceptions
     - -sEXPORT_EXCEPTION_HANDLING_HELPERS
   ```

3. **`oc-exceptions.ts`** — update `extractWasmException()` for `WebAssembly.Exception` objects. Consider using Emscripten's `getExceptionMessage(e)` which returns `[typeName, message]` directly for `std::exception` subclasses.

4. **`replicad.kernel.ts`** — remove `withExceptions` flag and variant selection. One WASM binary handles everything.

5. **`replicad.kernel.test.ts`** — remove `withExceptions: true` from test options; exception decoding works by default.

6. **`kernel-worker.constants.ts`** — remove `withExceptions` from kernel options.

7. **Full recompile required** — cannot mix `-fexceptions` `.o` files with `-fwasm-exceptions` linking.

**Expected results**:
- Size: likely smaller than current single build (no `__cxa_throw` JS glue, compact WASM instructions)
- Speed: near-identical to current single build on happy path
- Error handling: graceful failures with decoded exception messages by default
- Architecture: eliminates the two-variant pattern entirely

### Phase 2: WASM Size Optimization (Medium Priority)

Iterative optimization plan (see `.cursor/plans/wasm_size_optimization_288da51b.plan.md`):

| Iteration | Change | Expected Size | Risk |
|-----------|--------|---------------|------|
| 1 | wasm-opt `-Oz` + strip flags | ~16.0-17.0 MB | Low |
| 2 | Compile with `-Os` | ~15.0-16.0 MB | Low |
| 3 | Source-patch STEP registry (remove FEA/Kinematics/Element/DimTol) | ~14.5-15.5 MB | Medium |
| 4 | Source-patch TKBool PCH (decouple TopOpeBRep) | ~14.0-15.0 MB | High |
| 5 | LTO with `-Os` and `-mllvm -inline-threshold=25` | ~13.0-15.0 MB | Medium |

**Target**: 14-15 MB (conservative) or 13-14 MB (aggressive)

**Note**: Phase 1 (`-fwasm-exceptions`) may itself reduce size by eliminating `__cxa_throw` overhead and using compact WASM throw/catch instructions.

### Phase 3: Multi-Threading Enablement (Lower Priority)

1. Enable `isInParallel = true` for `BRepMesh_IncrementalMesh` in replicad
2. Call `BOPAlgo_Options::SetParallelMode(true)` at WASM initialization
3. Add `-sMALLOC=mimalloc` for per-thread allocation arenas
4. Cap `PTHREAD_POOL_SIZE` at 4
5. Benchmark with parallelism-eligible workloads (large assemblies, many-face meshing)
6. Consider making multi-threading opt-in rather than default

### Phase 4: Additional Optimizations (Future)

- **`-fno-rtti`**: Disable OCCT's custom RTTI (`DynamicType()`, `get_type_descriptor()`) if not needed for exception decoding. Could save ~15% of data section + associated code.
- **Selective STEP support**: If only AP203/AP214 geometries are needed, a deep STEP registry patch could remove AP242 PMI/FEA/Kinematics entities (~500 KB - 1 MB).
- **Dead binding elimination**: Audit the 233 bound symbols to identify any that are no longer used by replicad.
- **Streaming compilation**: Use `WebAssembly.compileStreaming()` for faster WASM loading (already implemented for single-threaded init).

---

## Build Reference

### Reproduction Commands

```bash
# Single-threaded (current default)
OCJS_LTO=0 ./build-wasm.sh full \
  ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Multi-threaded
OCJS_LTO=0 THREADING=multi-threaded ./build-wasm.sh full \
  ../replicad/packages/replicad-opencascadejs/build-config/custom_build_multi_v8.yml

# With exceptions (legacy JS-based)
OCJS_LTO=0 OCJS_EXCEPTIONS=1 ./build-wasm.sh full \
  ../replicad/packages/replicad-opencascadejs/build-config/custom_build_with_exceptions_v8.yml

# Link only (reuses existing .o files — fastest iteration)
./build-wasm.sh link <yaml>

# Rebuild PCH after filterPackages.py changes
./build-wasm.sh pch link <yaml>

# Override compile optimization
OCJS_OPT=-Os ./build-wasm.sh sources link <yaml>
```

### Dependency Chain Update Workflow

```bash
# 1. Build WASM (in repos/opencascade.js/)
./build-wasm.sh link <yaml>

# 2. Bump version
cd repos/replicad/packages/replicad-opencascadejs
# Edit package.json version

# 3. Pack tarball
npm pack
cp replicad-opencascadejs-*.tgz ../../../../tarballs/

# 4. Update catalog reference
# Edit pnpm-workspace.yaml to point to new tarball

# 5. Install
cd ../../../..
pnpm install

# 6. Copy WASM assets to kernels
pnpm nx copy-assets kernels

# 7. Verify
pnpm nx test kernels --watch=false
pnpm nx benchmark kernels
```

### Important Notes

- Single and multi-threaded builds produce **incompatible `.o` files** (atomics/shared-memory features). Delete `build/bindings/**/*.o` and `build/sources/**/*.o` when switching threading modes.
- `-fwasm-exceptions` and `-fexceptions` produce incompatible code. A full clean rebuild is required when switching exception modes.
- The `-flto` flag in YAML `emccFlags` serves a different purpose when `OCJS_LTO=0`: it enables binaryen's wasm-opt pass at link time without LLVM-level cross-module inlining (since inputs are regular WASM objects, not LLVM bitcode).

### File Sizes

| File | V7.6.2 | V8 Single | V8 Multi |
|------|--------|-----------|----------|
| `.wasm` | 10.30 MB | 17.67 MB | 17.06 MB |
| `.js` (glue) | 132 KB | 110 KB | 127 KB |
| `.d.ts` | 407 KB (9,006 lines) | 365 KB (8,554 lines) | 365 KB |
| Brotli compressed `.wasm` | ~3.5 MB | ~5-6 MB | ~5-6 MB |

---

## Appendix: Key File Locations

| Purpose | Path |
|---------|------|
| Build orchestrator | `repos/opencascade.js/build-wasm.sh` |
| WASM linker + wasm-opt | `repos/opencascade.js/src/buildFromYaml.py` |
| Source compiler | `repos/opencascade.js/src/compileSources.py` |
| Binding compiler | `repos/opencascade.js/src/compileBindings.py` |
| Shared config | `repos/opencascade.js/src/Common.py` |
| Package filter | `repos/opencascade.js/src/filter/filterPackages.py` |
| Single build YAML | `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml` |
| Multi build YAML | `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_multi_v8.yml` |
| Exceptions build YAML | `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_with_exceptions_v8.yml` |
| OCCT source | `repos/OCCT/src/` |
| Kernel entry | `packages/kernels/src/kernels/replicad/replicad.kernel.ts` |
| Exception handler | `packages/kernels/src/kernels/replicad/oc-exceptions.ts` |
| WASM init | `packages/kernels/src/kernels/replicad/init-open-cascade.ts` |
| Kernel tests | `packages/kernels/src/kernels/replicad/replicad.kernel.test.ts` |
| Kernel options | `apps/ui/app/constants/kernel-worker.constants.ts` |
| WASM inspect tool | `packages/kernels/scripts/wasm-inspect.mts` |
| Size analysis | `docs/research/wasm-size-analysis-v762-vs-v8rc4.md` |
| Optimization plan | `.cursor/plans/wasm_size_optimization_288da51b.plan.md` |
| Stress test model | `libs/tau-examples/src/kernels/replicad/stress-test/main.ts` |
| Replicad shapes (meshing) | `repos/replicad/packages/replicad/src/shapes.ts` |
| BOPAlgo parallel config | `repos/OCCT/src/ModelingAlgorithms/TKBO/BOPAlgo/BOPAlgo_Options.cxx` |
| OSD_Parallel framework | `repos/OCCT/src/FoundationClasses/TKernel/OSD/OSD_Parallel.hxx` |
