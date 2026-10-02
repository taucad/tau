---
title: 'OCCT WASM Optimization Analysis'
description: 'Audit of opencascade.js WASM build pipeline against Emscripten best practices: compile flags, closure, wasm-opt, and OCCT-specific optimizations.'
status: active
created: '2026-03-04'
updated: '2026-03-05'
category: optimization
---

# OCCT WASM Optimization Analysis

## Executive Summary

Audit of our opencascade.js WASM build pipeline against Emscripten best practices. The build has three stages — compilation (~4150 source + ~3700 binding `.o` files), linking (emcc with embind), and post-processing (wasm-opt). Each stage has distinct optimization levers.

### Current Best Build

Our best production build is `v8-O2-noLTO-wasmOptO3` at **17.80 MB** (single, no-exceptions) with 112 KB JS glue. The v7.6.2 baseline was 10.80 MB WASM + 135 KB JS.

### Identified Optimizations

| #   | Optimization                       | Target    | Est. Impact                        | Risk        | Status                     |
| --- | ---------------------------------- | --------- | ---------------------------------- | ----------- | -------------------------- |
| 1   | `-fno-exceptions` on no-exc builds | Compile   | Size reduction (EH tables removed) | N/A         | **Blocked**                |
| 2   | `--closure 1`                      | Link      | ~~50% JS reduction (~~56 KB)       | Medium      | **Not applied**            |
| 3   | `-sEVAL_CTORS`                     | Link      | Faster startup                     | Low         | **Not applied**            |
| 4   | `--converge` in wasm-opt           | Post-link | Additional WASM size reduction     | Low         | **Not applied**            |
| 5   | `-fno-rtti` on OCCT sources        | Compile   | ~5-15% size reduction              | **Blocked** | N/A                        |
| 6   | `-sENVIRONMENT=web,worker`         | Link      | ~2 KB JS reduction                 | —           | **Not applicable**         |
| 7   | `-DNo_Exception`                   | Compile   | 100-300 KB WASM reduction          | None        | **Ready**                  |
| 8   | `-UOCC_CONVERT_SIGNALS`            | Compile   | < 50 KB WASM reduction             | None        | **Ready**                  |
| 9   | Stub `OCCT_DUMP_`\* macros         | Compile   | 200-500 KB WASM reduction          | Low         | Requires OCCT source patch |

---

## Build Pipeline Overview

### Stage 1: Compilation (compileSources.py / compileBindings.py)

Each `.o` file is compiled independently:

```
emcc -std=c++17 <OPT_LEVEL> -frtti -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS
     -DHAVE_RAPIDJSON -w [-flto] [-fwasm-exceptions]
     [-include-pch build/pch.h.pch] -I<flat-includes> -c <file> -o <file>.o
```

Flags set via environment:

- `OCJS_OPT` → optimization level (default `-O2`)
- `OCJS_LTO` → `-flto` at compile time (default `1`)
- `OCJS_EXCEPTIONS` → `-fwasm-exceptions` (default `0`)

### Stage 2: Linking (buildFromYaml.py)

All `.o` files are linked together via emcc + embind:

```
emcc -lembind <all .o files> -o <output.js> <emccFlags from YAML>
```

Current YAML emccFlags (no-exceptions variant):

```
re-flto -O3 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=100MB
-sMAXIMUM_MEMORY=4GB -sEXPORTED_RUNTIME_METHODS=["FS"] --no-entry
--emit-symbol-map -sERROR_ON_UNDEFINED_SYMBOLS=0 -Wl,--allow-undefined
-sSTACK_SIZE=8388608
```

### Stage 3: Post-processing (wasm-opt in buildFromYaml.py)

```
wasm-opt -O3 --strip-debug --strip-producers --enable-mutable-globals
         --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int
         --enable-exception-handling <input.wasm> -o <output.wasm>
```

---

## Existing Experiment Data

| Experiment                | Compile | LTO    | Exceptions  | wasm-opt | Single WASM  | Exc WASM | JS         |
| ------------------------- | ------- | ------ | ----------- | -------- | ------------ | -------- | ---------- |
| v762-O0-noLTO-wasmOptO3   | -O0     | No     | none        | -O3      | 10.30 MB     | —        | 135 KB     |
| v8-O0-noLTO-wasmOptO3     | -O0     | No     | none        | -O3      | 16.97 MB     | —        | 112 KB     |
| v8-O0-noLTO-wasmOptO2     | -O0     | No     | none        | -O2      | 17.09 MB     | —        | 112 KB     |
| **v8-O2-noLTO-wasmOptO3** | **-O2** | **No** | **none**    | **-O3**  | **17.92 MB** | —        | **112 KB** |
| v8-O2-noLTO-wasmOptO3-hlr | -O2     | No     | wasm-native | -O3      | 17.67 MB     | 17.76 MB | 112 KB     |
| v8-O3-noLTO-wasmOptO3     | -O3     | No     | none        | -O3      | 19.23 MB     | —        | 112 KB     |
| O0-O0-validation          | -O0     | No     | none        | -O0      | 17.20 MB     | 18.18 MB | 112 KB     |
| O0-O0-wasmExc-validation  | -O0     | No     | wasm-native | -O0      | 17.20 MB     | 18.73 MB | 112 KB     |

Key observations:

- `-O2` compile + `-O3` wasm-opt is our best combination for size (17.92 MB)
- `-O3` compile inflates the binary to 19.23 MB due to aggressive inlining
- `-O0` compile + `-O3` wasm-opt produces 16.97 MB — smaller than -O2 because wasm-opt can de-duplicate more when functions aren't already inlined by LLVM
- WASM exceptions add ~0.8–1.5 MB depending on optimization level
- JS glue is consistently ~112 KB across all v8 builds (no closure compiler applied)

---

## Detailed Optimization Analysis

### 1. `-fno-exceptions` for No-Exceptions Builds — BLOCKED

**Current state**: When `OCJS_EXCEPTIONS=0`, the compile flags simply omit `-fwasm-exceptions`. No exception-disabling flag is passed. Emscripten's default `DISABLE_EXCEPTION_CATCHING=1` at link time converts throws to aborts.

**Why blocked**: OCCT header files contain `throw` statements in inline macros and functions (e.g., `Standard_ConstructionError_Raise_if`, `Standard_OutOfRange_Always_Raise_if` in `gp_XY.hxx`, `gp_Vec2d.hxx`, `gp_Dir2d.hxx`, etc.). With `-fno-exceptions`, Clang treats `throw` as a hard compile error (`cannot use 'throw' with exceptions disabled`). This fails during PCH generation since the PCH includes all OCCT headers.

**What would be needed**: OCCT upstream would need to replace `throw` with a macro that can dispatch to `abort()` or `std::terminate()` when exceptions are disabled. Since we don't control OCCT source, this optimization is not viable.

**Workaround**: Emscripten's link-time `-sDISABLE_EXCEPTION_CATCHING=1` (the default) provides a partial equivalent: exception throws compile normally but are never caught, resulting in `RuntimeError: Aborted` at runtime. This doesn't eliminate EH tables from `.o` files, but the linker/wasm-opt can still strip unreachable exception handling code.

### 2. `-sENVIRONMENT=web,worker` — NOT APPLICABLE

**Current state**: Defaults to `['web', 'webview', 'worker', 'node']`.

**What it does**: Restricts the JS output to only support specified environments, eliminating detection code for others.

**Why not**: The replicad-opencascadejs package must support all environments — it runs in browser web workers for the UI, but also in Node.js for testing (`pnpm nx test runtime`), server-side rendering, and CLI tools. Restricting environments would break Node.js test runners and any future server-side usage.

**Impact**: ~2 KB JS savings — not worth the compatibility loss.

### 3. `--closure 1` (Closure Compiler) — RECOMMENDED WITH CAUTION

**Current state**: Not applied. JS glue is ~112 KB across all builds.

**What it does**: Runs Google Closure Compiler on the generated JS glue, performing advanced minification, dead code elimination, and property renaming. Emscripten docs call this "highly recommended" and note it can "hugely reduce the size of the support JavaScript code."

**Risk**: Medium. Known compatibility issues with Emscripten's embind in 2025-2026:

- Public class fields in Emscripten's JS libraries require `--language-in UNSTABLE`
- `assert` function may need to be declared in an externs file
- Some EXPORT_ALL + O3 combinations cause missing function exports

The v7.6.2 build (135 KB JS) also didn't use closure. If closure doesn't work cleanly, the fallback is to skip it — the ~112 KB JS is already smaller than v7.6.2's 135 KB.

**Impact**: Potentially ~50-60 KB JS reduction (to ~50-55 KB). This affects download size and parse time. The WASM binary is unaffected.

**Implementation**: Add `--closure 1` to emccFlags. Test thoroughly. If it fails, revert and document the failure.

### 4. `-sEVAL_CTORS` — RECOMMENDED

**Current state**: Not applied.

**What it does**: Evaluates global constructor functions at compile time and "snapshots" the resulting memory state into the WASM binary. At runtime, the WASM starts from this pre-computed state instead of re-executing the constructors.

OCCT has many static initializers: type registration macros (`IMPLEMENT_STANDARD_RTTIEXT`), precision constant tables, algorithm lookup tables, etc. Evaluating these at compile time could meaningfully speed up WASM instantiation.

**Risk**: Low. The optimization stops when it encounters an import call (like WASI I/O), so it's self-limiting. Worst case: it evals nothing and the build is unaffected.

**Impact**: Faster WASM startup. May slightly increase or decrease binary size depending on how much static state is snapshotted vs. how much ctor code is eliminated.

**Implementation**: Add `-sEVAL_CTORS=1` to emccFlags. If it stops early on WASI imports, try `-sEVAL_CTORS=2` (ignore external input).

### 5. `--converge` in wasm-opt — RECOMMENDED

**Current state**: Single-pass `wasm-opt -O3`.

**What it does**: Runs optimization passes iteratively until a fixed point is reached (no further size decrease). The Binaryen optimizer can sometimes find additional reductions on repeated passes because one pass may expose opportunities for another.

**Risk**: None. Only increases build time (estimated +30-120s on our ~18 MB binary).

**Impact**: Potentially 0.1-2% additional WASM size reduction. For an 18 MB binary, even 0.5% is ~90 KB.

**Implementation**: Add `--converge` to the wasm-opt invocation in `buildFromYaml.py`.

### 6. `-fno-rtti` on OCCT Sources — BLOCKED

**Initial hypothesis**: Since embind needs RTTI but OCCT source files don't use it directly, we could compile sources with `-fno-rtti` and only keep `-frtti` for binding files. RTTI adds vtable metadata, `type_info` objects, and `dynamic_cast` support for every polymorphic class.

**Investigation result**: **Not viable.** OCCT's `Standard_Handle.hxx` uses `dynamic_cast` in its `DownCast()` implementation:

```cpp
// Standard_Handle.hxx
return handle(dynamic_cast<T*>(const_cast<T2*>(theObject.get())));
```

`DownCast()` is used pervasively throughout OCCT (thousands of call sites). Additionally, `dynamic_cast` appears in 26 files across core packages including `TKernel`, `TKMath`, `TKG2d`, and `TKGeomBase` — all of which are included in our build.

Compiling with `-fno-rtti` would cause all `DownCast()` calls to fail at link time or produce undefined behavior at runtime.

**Conclusion**: RTTI is a hard requirement for OCCT. The `-frtti` flag must remain on all compilation units.

---

## Compilation Optimization Level Analysis

### Why -O3 Is Likely Counterproductive for WASM Performance

`-O3` produces a larger binary (19.23 MB) than `-O2` (17.92 MB). More importantly, there are strong reasons to believe `-O3` also delivers _worse runtime performance_ in a WASM JIT environment, despite being the "most optimized" level. This is a WASM-specific phenomenon that doesn't apply to native builds.

#### The WASM JIT double-compilation problem

LLVM's `-O3` inlining heuristics were designed for ahead-of-time native compilation, where the compiler output is the final machine code. In WASM, there's a second compilation step: the browser's JIT compiler (V8's Liftoff + TurboFan) compiles the WASM bytecode into actual machine code at runtime. This changes the cost-benefit calculus of inlining:

1. **Function call overhead is cheaper in WASM than native.** In native code, a function call involves stack frame setup, register spilling, and a branch to a new address — the cost that inlining eliminates. In WASM, the VM manages call frames internally and the overhead is much lower, reducing the payoff of inlining.
2. **Code size cost is higher in WASM than native.** Every byte of WASM bytecode produced by LLVM inlining must be JIT-compiled by the browser, producing even larger machine code. The code bloat is amplified by the JIT layer, not just passed through.
3. **Instruction cache pressure from JIT output.** The JIT-generated machine code from bloated WASM functions competes for the CPU's L1 instruction cache. Functions that were compact at `-O2` and fit in cache become inflated at `-O3` and cause cache misses on hot paths.

#### OCCT's architecture amplifies the problem

OCCT has deep class hierarchies with thousands of small polymorphic methods — handle dereferences, type checks, coordinate accessors, tolerance comparisons. At `-O3`, LLVM inlines these aggressively into every call site, duplicating them hundreds of times across the codebase. At `-O2`, they remain as compact function calls, keeping the hot code footprint small and cache-friendly.

For a boolean operation like `BRepAlgoAPI_Fuse`, the execution touches thousands of these small methods across dozens of OCCT packages. Keeping them as deduplicated function calls (as `-O2` does) means the JIT-compiled machine code for these methods stays resident in the instruction cache. Inlining them (as `-O3` does) scatters duplicated copies across the caller functions, causing cache thrashing.

#### Binaryen can't undo LLVM's inlining

Once LLVM has inlined at `-O3`, the duplicated code is specialized to each call site. Binaryen's wasm-opt pass (also `-O3`) can optimize within the bloated functions but cannot "un-inline" — it doesn't recognize that the same logic was duplicated across hundreds of callers. At `-O2`, Binaryen has smaller, deduplicated functions to work with, and its own optimization passes (dead code elimination, code folding, function merging) are more effective.

#### The -O0 paradox

The `-O0` compile + `-O3` wasm-opt result (16.97 MB) is the _smallest_ binary because Binaryen has maximum deduplication opportunity — LLVM emitted no inlining at all. However, runtime performance is worse because LLVM performed no per-function optimization (no register allocation improvement, no constant folding, no dead store elimination within functions).

#### Recommendation

`-O2` compile + `-O3` link/wasm-opt is the expected optimal balance for runtime performance: LLVM performs meaningful per-function optimization (constant propagation, loop optimization, register allocation) without the aggressive cross-function inlining that degrades WASM JIT performance. This should be validated with benchmarks once the optimized build is complete.

For minimum binary size (at the cost of runtime speed), `-Os` compile + `-Oz` wasm-opt is worth experimenting with — it tells LLVM to actively avoid size-increasing optimizations.

### Compile/Link Optimization Level Matching

The Emscripten docs warn: "Did you build using the same optimization values in both steps?" Our builds compile at one level (e.g., `-O2`) but always link at `-O3`. This is intentional — `-O3` at link time triggers Binaryen's whole-program optimizer, which is separate from LLVM's per-function optimization. The Emscripten docs' warning primarily applies to the LLVM-level optimization, not the Binaryen pass.

Our current approach (different compile vs. link levels) is valid and even recommended by the Emscripten team for the WASM backend, where the link-time Binaryen optimization is the primary post-link optimization pass.

---

## Flag Reference

### Flags We Use Correctly

| Flag                      | Purpose                | Notes                                              |
| ------------------------- | ---------------------- | -------------------------------------------------- |
| `-sALLOW_MEMORY_GROWTH=1` | Dynamic heap           | Required for OCCT's unpredictable memory usage     |
| `-sINITIAL_MEMORY=100MB`  | Starting heap          | Avoids early growth overhead                       |
| `-sMAXIMUM_MEMORY=4GB`    | Memory cap             | Max for wasm32                                     |
| `-sSTACK_SIZE=8388608`    | 8 MB C stack           | Needed for OCCT's deep recursion                   |
| `--no-entry`              | Library/reactor mode   | No `main()` function                               |
| `-sEXPORT_ES6=1`          | ESM output             | Required for our module system                     |
| `--strip-debug`           | Remove DWARF           | Production builds don't need it                    |
| `-flto` (at link only)    | Link-time optimization | YAML emccFlags apply Binaryen LTO at the link step |

### Flags We Don't Use (and Why)

| Flag                        | Why Not                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `-fno-rtti`                 | OCCT's `Handle::DownCast()` requires `dynamic_cast` (RTTI)                           |
| `-sMALLOC=emmalloc`         | Slower than dlmalloc for OCCT's allocation patterns                                  |
| `-sFILESYSTEM=0`            | STEP/IGES import/export uses Emscripten's virtual FS                                 |
| `-sSINGLE_FILE`             | Would embed WASM in JS as base64, inflating download                                 |
| `-sMINIMAL_RUNTIME`         | Incompatible with embind and FS requirements                                         |
| `-sSTANDALONE_WASM`         | We need JS glue for embind and FS                                                    |
| `OCJS_LTO=1` (compile-time) | Causes 2x+ binary bloat from LLVM cross-module inlining (see wasm-size-analysis doc) |

### WASM_BIGINT

Emscripten 5.0.1 defaults `WASM_BIGINT=true`, which skips i64 legalization at link time. This is already active in our builds. Browser support is at 95.8% globally (Chrome 85+, Firefox 78+, Safari 14.1+).

Note: There are known compatibility issues between `WASM_BIGINT` and embind in Emscripten 4.x/5.x for 64-bit integer edge cases and `emscripten::val()` conversions. Our OCCT bindings don't expose i64 values through embind, so this doesn't affect us.

---

## Proposed Optimized Build Configuration

### Experiment: `O2-noLTO-optimized`

Build changes from current `O2-noLTO-single`:

**Compilation** (Common.py / compileSources.py / compileBindings.py):

- `-fno-exceptions` blocked (OCCT headers use `throw` in inline code); no compile-time changes

**Linking** (YAML emccFlags):

- Add `-sEVAL_CTORS=1`
- Add `--closure 1` (test separately; revert if embind breaks)

**Post-processing** (buildFromYaml.py):

- Add `--converge` to wasm-opt invocation

### Expected Results

| Metric        | Current (O2-noLTO-wasmOptO3) | Expected (optimized)                                      |
| ------------- | ---------------------------- | --------------------------------------------------------- |
| WASM (single) | 17.92 MB                     | ~17.4-17.7 MB                                             |
| JS glue       | 112 KB                       | ~55-60 KB (with closure) or ~110 KB (without)             |
| Startup time  | Baseline                     | Faster (EVAL_CTORS)                                       |
| Runtime perf  | Baseline                     | Same (Emscripten link-time exception stripping unchanged) |

### Implementation Checklist

1. ~~`repos/opencascade.js/src/Common.py` — Change `WASM_EXCEPTION_FLAGS` to `["-fno-exceptions"]`~~ **BLOCKED**: OCCT headers use `throw` in inline code
2. `repos/opencascade.js/src/buildFromYaml.py` — Add `--converge` to wasm-opt invocation
3. `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml` — Add `-sEVAL_CTORS=1` to emccFlags
4. `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_with_exceptions_v8.yml` — Add `-sEVAL_CTORS=1` to emccFlags
5. `scripts/experiments/O2-noLTO-optimized.yml` — New experiment config
6. Test `--closure 1` separately; if it works, add to YAML emccFlags
7. Run full experiment: `./scripts/src/wasm-experiment.sh scripts/experiments/O2-noLTO-optimized.yml`
8. Validate with `pnpm nx test runtime --testNamePattern="Example models" --watch=false`

---

## OCCT Compile-Time Code Elimination (Deep Dive)

Investigation of OCCT V8's internal build configuration to identify compile-time defines and code patterns that affect WASM binary size. These findings complement the Emscripten-level optimizations above.

### 7. `-DNo_Exception` — OCCT's Native Exception Disabling

**Current state**: Not passed in our Emscripten compile flags.

**What it does**: OCCT's own mechanism for disabling exception checks in Release builds. Controlled by `BUILD_RELEASE_DISABLE_EXCEPTIONS=ON` in CMake (the default for Release configurations). When `-DNo_Exception` is defined, all `*_Raise_if` macros expand to no-ops:

```cpp
// Without No_Exception:
Standard_OutOfRange_Raise_if(index > myLength, "Index out of range");
// → if (index > myLength) throw Standard_OutOfRange("Index out of range");

// With No_Exception:
Standard_OutOfRange_Raise_if(index > myLength, "Index out of range");
// → ((void)0)
```

Each eliminated call site removes: the `if` condition check, a string literal constant, a `throw` expression, and any associated exception handler metadata.

**Measured call site counts across compiled modules:**

| Module                                                 | `Raise_if` calls |
| ------------------------------------------------------ | ---------------- |
| FoundationClasses (TKernel, TKMath)                    | 544              |
| ModelingData (TKG2d, TKG3d, TKGeomBase, TKBRep)        | 282              |
| ModelingAlgorithms (TKTopAlgo, TKBool, TKFillet, etc.) | 271              |
| DataExchange (TKDESTEP, TKDESTL, TKXSBase)             | 105              |
| ApplicationFramework (TKCDF, TKLCAF, TKCAF, TKXCAF)    | 49               |
| **Total**                                              | **1,251**        |

**Key detail**: `-DNo_Exception` does NOT affect the unconditional `Standard_OutOfRange_Always_Raise_if` macro or bare `throw` statements in `.cxx` files. Those are handled by Emscripten's link-time `-sDISABLE_EXCEPTION_CATCHING=1` (the default), which converts throws to `abort()`.

**Per-exception granularity**: OCCT also supports per-type defines (`No_Standard_OutOfRange`, `No_Standard_RangeError`, `No_StdFail_NotDone`, etc.) for selective disabling. The blanket `-DNo_Exception` disables all of them.

**Risk**: None. This is OCCT's official production build configuration. The exception checks are range/domain validation guards — they protect against programming errors (index out of bounds, null pointer dereference), not runtime conditions. In a WASM context where the API surface is controlled by replicad, these guards are redundant.

**Estimated impact**: 100-300 KB WASM reduction from eliminated branch code, string constants, and throw expressions across 1,251 call sites.

**Implementation**: Add `-DNo_Exception` to the compile flags in `compileSources.py` and `compileBindings.py` (or via `Common.py`).

### 8. `-UOCC_CONVERT_SIGNALS` — Disable POSIX Signal Handling

**Current state**: `OCC_CONVERT_SIGNALS` is defined for all non-MSVC builds in `adm/cmake/occt_defs_flags.cmake:48`. Since Emscripten uses Clang (non-MSVC), this is likely active in our builds.

**What it does**: Enables OCCT's `setjmp`/`longjmp`-based signal-to-exception conversion via the `OCC_CATCH_SIGNALS` macro. On native Linux/macOS builds, this converts hardware signals (SIGSEGV, SIGFPE, etc.) into C++ exceptions so algorithms can recover from numerical failures.

**Why unnecessary for WASM**: WebAssembly has no POSIX signal mechanism. There is no SIGSEGV, SIGFPE, or SIGBUS in a browser sandbox. The signal handler infrastructure (`Standard_ErrorHandler`, `OSD_signal.cxx`) is pure dead weight in WASM:

- `Standard_ErrorHandler` maintains a thread-local stack of `setjmp` jump buffers
- `OCC_CATCH_SIGNALS` macro calls `setjmp()` before each protected algorithm
- Signal handler registration code in `OSD_signal.cxx` (~1000 lines)

**Risk**: None. Emscripten's `setjmp`/`longjmp` implementation is present but the signal registration (`sigaction()`, `signal()`) is stubbed out. Removing the define eliminates the `setjmp` overhead at each `OCC_CATCH_SIGNALS` expansion point without affecting correctness.

**Estimated impact**: < 50 KB WASM reduction. Small but clean — removes unnecessary runtime overhead per algorithm call.

**Implementation**: Pass `-UOCC_CONVERT_SIGNALS` (or override with `-DOCC_CONVERT_SIGNALS=0`) in compile flags, or ensure the define is not set for Emscripten builds.

### 9. `OCCT_DUMP_`\* / `DumpJson` — V8 Debug Serialization (Unstubbed)

**Current state**: Always compiled in. No compile-time flag to disable.

**What it does**: OCCT V8 added a comprehensive JSON debug serialization system. Classes implementing `Standard_Transient` can override `DumpJson()` to serialize their state. The `OCCT_DUMP_`\* macro family (14+ macros defined in `Standard_Dump.hxx`) populates these implementations:

```cpp
void Geom_Circle::DumpJson(Standard_OStream& theOStream, Standard_Integer theDepth) const
{
  OCCT_DUMP_TRANSIENT_CLASS_BEGIN(theOStream)
  OCCT_DUMP_BASE_CLASS(theOStream, theDepth, Geom_Conic)
  OCCT_DUMP_FIELD_VALUE_NUMERICAL(theOStream, myR)
}
```

**Measured usage across compiled modules:**

| Module               | `DumpJson` refs | `OCCT_DUMP_`\* macro calls |
| -------------------- | --------------- | -------------------------- |
| FoundationClasses    | 93              | 174                        |
| ModelingData         | 129             | 293                        |
| ApplicationFramework | —               | 252                        |
| DataExchange         | —               | 181                        |
| **Total (compiled)** | **222+**        | **900+**                   |

Note: ModelingAlgorithms has zero `DumpJson`/`OCCT_DUMP_`\* usage — this is concentrated in data/framework classes.

**Why it matters**: Unlike `OCCT_DEBUG`-guarded code, `DumpJson` implementations are **always compiled**. They are virtual methods, so the linker cannot strip them even if never called — they remain reachable through vtables. Each implementation contributes:

- A vtable entry
- String constants for field names
- `Standard_Dump` utility calls for JSON formatting
- The `Standard_Dump` implementation itself (~707 lines in `Standard_Dump.cxx`)

**Risk**: Low with a source patch; medium without one. Stubbing requires either:

1. Adding an `OCCT_NO_DUMP` guard to `Standard_Dump.hxx` that redefines all macros to `((void)0)`
2. Or patching each `DumpJson` implementation (not viable at 222+ call sites)

**Estimated impact**: 200-500 KB WASM reduction from eliminated virtual method bodies, string constants, and the Standard_Dump infrastructure.

**Implementation**: Patch `Standard_Dump.hxx` to support:

```cpp
#ifdef OCCT_NO_DUMP
  #define OCCT_DUMP_TRANSIENT_CLASS_BEGIN(theOStream)
  #define OCCT_DUMP_FIELD_VALUE_NUMERICAL(theOStream, theField)
  // ... stub all 14+ macros
#else
  // ... existing implementations
#endif
```

Then pass `-DOCCT_NO_DUMP` in compile flags. This is a non-breaking change — the `DumpJson()` virtual methods still exist (required by vtable layout) but their bodies become empty.

### OCCT_DEBUG — Already Dead (No Action Needed)

**Status**: Confirmed not active in our builds.

`OCCT_DEBUG` is only defined when `BUILD_WITH_DEBUG=ON` (CMake), which sets `-DOCCT_DEBUG` for Debug configurations. Our Emscripten builds use `-O2` (Release-level optimization) and do not define `OCCT_DEBUG`.

**Measured guard sites across compiled modules:**

| Module             | `OCCT_DEBUG` guard sites |
| ------------------ | ------------------------ |
| ModelingAlgorithms | 2,000                    |
| ModelingData       | 118                      |
| FoundationClasses  | 85                       |

Sampling confirmed that the 3,503 `cout` references in ModelingAlgorithms are **almost entirely** inside `#ifdef OCCT_DEBUG` blocks (verified in TKBool, TKFillet, TKFeat — every `cout` is guarded). This diagnostic output produces zero code in our builds.

Additional specialized debug defines (`OCCT_DEBUG_MESH`, `OCCT_DEBUG_FINDBLOCK`, `OCCT_DEBUG_UBTREE`) are also not set and produce no code.

### Standard_Assert — Already Optimized for Release

The `Standard_Assert.hxx` macro family behaves differently based on `_DEBUG`:

- **Release (no `_DEBUG`)**: `Standard_ASSERT_INVOKE_()` is a no-op; `Standard_ASSERT_SKIP` and `Standard_ASSERT_VOID` are no-ops; only `Standard_ASSERT_RAISE` (which throws `Standard_ProgramError`) remains active.
- **Debug (`_DEBUG`)**: Full check with breakpoint (`emscripten_debugger()` on Emscripten), stderr report, and breakpoint.

Our builds do not define `_DEBUG`, so assert macros are already in their minimal Release form. No action needed.

### Module/Package Exclusion — Comprehensive

The current `filterPackages.py` exclusions are thorough:

| Category                                                     | Status   |
| ------------------------------------------------------------ | -------- |
| Draw module (Tcl/Tk harness)                                 | Excluded |
| Visualization (TKV3d, TKService, TKOpenGl, TKOpenGles, etc.) | Excluded |
| IGES, VRML, GLTF, OBJ, PLY formats                           | Excluded |
| TKDECascade, TKRWMesh                                        | Excluded |
| Persistence drivers (TKBin, TKXml, TKStd, TKTObj, etc.)      | Excluded |
| TKExpress (expression parser), TKHelix                       | Excluded |
| TKDE plugin framework                                        | Excluded |

**Retained modules** (required for replicad):

- FoundationClasses (TKernel, TKMath)
- ModelingData (TKG2d, TKG3d, TKGeomBase, TKBRep)
- ModelingAlgorithms (all except TKExpress, TKHelix)
- ApplicationFramework (TKCDF, TKLCAF, TKCAF, TKXCAF — required by DESTEP)
- DataExchange (TKXSBase, TKDESTEP, TKDESTL)
- TKHLR + dependencies (for replicad's 2D projection)

The `filterPackages.py` note correctly states: "With non-LTO builds (`OCJS_LTO=0`), `wasm-ld` performs effective function-level dead code elimination via `--gc-sections`. Manual package filtering beyond Draw/Visualization/unused-data-exchange is unnecessary and risks removing packages that are called transitively at runtime."

### Message_ProgressRange/Scope — Must Keep

825 references in ModelingAlgorithms. This is the cooperative cancellation system — `opencascade.js` uses `Message_ProgressIndicator.UserBreak()` for cancellation during tessellation and boolean operations. Cannot be removed.

### OCCT V8 Changes Relevant to Code Size

From the V7.6.2 → V8.0.0-rc4 changelog (1,085 commits):

| Change                                                          | Size Effect                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Standard_Failure` now inherits `std::exception` (rc4)          | Emscripten's `-sDISABLE_EXCEPTION_CATCHING=1` can strip catch handlers more effectively |
| 29 Geom/Geom2d classes marked `final` (rc4)                     | Enables devirtualization at `-O2` — compiler can inline virtual calls                   |
| Robin-hood hash maps (`NCollection_FlatDataMap`) (rc4)          | More template instantiations, but better runtime cache behavior                         |
| `Handle(Class)` → `occ::handle<Class>` (~82,600 replacements)   | Same code, different syntax — no size impact                                            |
| `Standard_`\* type aliases → native C++ (~161,000 replacements) | Slight reduction from eliminated typedef indirection                                    |
| Thread-local error handlers (rc4)                               | `thread_local` in single-threaded WASM is essentially a global — minimal overhead       |
| Source directory reorganization (rc1)                           | No code size impact — build scripts adapted                                             |

### Optional 3rd-Party Dependencies — Already Minimal

| Dependency                   | Status                      | Impact                                                                  |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| FreeType (`HAVE_FREETYPE`)   | Not set in our build        | No text rendering code compiled                                         |
| FreeImage (`HAVE_FREEIMAGE`) | Not set                     | No image format code                                                    |
| FFmpeg (`HAVE_FFMPEG`)       | Not set                     | No video code                                                           |
| OpenVR (`HAVE_OPENVR`)       | Not set                     | No VR code                                                              |
| RapidJSON (`HAVE_RAPIDJSON`) | Set (!)                     | glTF parsing code compiled — but TKDEGLTF is excluded by filterPackages |
| Draco (`HAVE_DRACO`)         | Not set                     | No mesh compression code                                                |
| TBB (`HAVE_TBB`)             | Not set                     | No TBB parallelism                                                      |
| Eigen (`HAVE_EIGEN`)         | Not set                     | No Eigen math                                                           |
| X11 (`HAVE_XLIB`)            | OFF for Emscripten          | No X11 code                                                             |
| OpenGL (`HAVE_OPENGL`)       | OFF for Emscripten          | No desktop GL                                                           |
| GLES2 (`HAVE_GLES2`)         | ON for Emscripten (default) | WebGL code — but Visualization module is excluded                       |

**Note**: `HAVE_RAPIDJSON` is set (`-DHAVE_RAPIDJSON` in compile flags) but the packages that use it (TKDEGLTF/RWGltf) are excluded by `filterPackages.py`. The define is harmless — it only affects `#ifdef HAVE_RAPIDJSON` guards in excluded code. Removing it from compile flags would be a minor cleanup.

### Memory Manager — Already Optimal

`USE_MMGR_TYPE=NATIVE` (the default) uses the system allocator directly. No extra memory manager code is compiled. The other options (FLEXIBLE, TBB, JEMALLOC) would add unnecessary code.

---

## Actionable Optimizations Summary

### Immediate (No OCCT Source Changes)

| #   | Optimization            | Mechanism     | Est. Impact  | Risk   |
| --- | ----------------------- | ------------- | ------------ | ------ |
| 7   | `-DNo_Exception`        | Compile flag  | 100-300 KB   | None   |
| 8   | `-UOCC_CONVERT_SIGNALS` | Compile flag  | < 50 KB      | None   |
| 2   | `--closure 1`           | Link flag     | ~56 KB JS    | Medium |
| 3   | `-sEVAL_CTORS=1`        | Link flag     | Startup perf | Low    |
| 4   | `--converge`            | wasm-opt flag | 10-50 KB     | None   |

### Medium-Term (Requires OCCT Source Patch)

| #   | Optimization   | Mechanism                                | Est. Impact | Risk |
| --- | -------------- | ---------------------------------------- | ----------- | ---- |
| 9   | `OCCT_NO_DUMP` | Patch `Standard_Dump.hxx` + compile flag | 200-500 KB  | Low  |

### Blocked

| #   | Optimization      | Reason                                   |
| --- | ----------------- | ---------------------------------------- |
| 1   | `-fno-exceptions` | OCCT headers use `throw` in inline code  |
| 5   | `-fno-rtti`       | `Handle::DownCast()` uses `dynamic_cast` |

---

## Future Investigation

### `-Os` Compile + `-Oz` wasm-opt

An untested combination that prioritizes code size over runtime speed. `-Os` tells LLVM to avoid inlining and vectorization that increases size, while `-Oz` tells Binaryen to prioritize size aggressively. This could potentially produce a binary closer to 16 MB but with slower runtime performance for compute-heavy operations (boolean operations, filleting, sweeps).

Worth creating an experiment if size becomes a priority over performance.

### Module Splitting

Emscripten supports splitting WASM modules to defer loading of non-critical code. For a CAD kernel, the initial load could include basic geometry (extrusions, booleans) while deferring rarely-used operations (STEP export, HLR projection). This is experimental in Emscripten and would require significant refactoring of how replicad initializes the OCCT module.

### Symbol Pruning

The current build binds ~241 symbols. Audit work (see `docs/research/replicad-occt-usage-refinement.md`) identified ~29 unused symbols that could be removed. Each symbol adds embind registration code + JS glue. Removing 29 symbols might save ~50-100 KB of combined WASM + JS.

---

## Related Documents

- [WASM Size Analysis V7.6.2 vs V8](wasm-size-analysis-v762-vs-v8rc4.md) — Root cause analysis of the 2x size increase
- [OCCT V8 Migration](occt-v8-migration.md) — Migration notes and build configuration
- [OCCT V7.6.2 → V8 RC4 Changelog](opencascade-v7.62-v8rc4-changelog.md) — Detailed changelog with 1,085 commits
- [Replicad Symbol Audit](replicad-occt-usage-refinement.md) — Symbol usage and pruning candidates
- [WASM Build Skill](../../.agent/skills/occt-wasm-build/SKILL.md) — Build harness reference
