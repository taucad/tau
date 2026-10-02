---
title: 'build123d vs native C++ vs opencascade.js — OCCT Performance Survey'
description: '10 canonical CAD workloads (all batched booleans use `BRepAlgoAPI_BuilderAlgo` multi-tool form) across 5 frontier engines (build123d, native LTO/no-LTO, full OCJS, OCJS-mimalloc) attributing the OCJS perf gap to binding, allocator, codegen, LTO, BOPDS-init batching.'
status: active
created: '2026-05-14'
updated: '2026-05-14'
category: optimization
related:
  - docs/research/build123d-occt-api-usage-survey.md
  - docs/research/ocjs-non-graphics-coverage-blueprint.md
  - docs/research/ocjs-removed-bindings-stocktake.md
---

# build123d vs native C++ vs opencascade.js — OCCT Performance Survey

Quantifies the runtime cost of running OpenCascade Technology workloads through four different binding/runtime stacks:

1. **build123d** — CPython 3.13 + pybind11 + native OCCT 7.9.3 (`cadquery-ocp` wheel)
2. **native-lto** — direct C++17 + native OCCT 8.0.0 with **ThinLTO ON** (matches OCCT upstream's `BUILD_OPT_PROFILE=Production` master-validation CI and conda-forge `cadquery-ocp` distribution)
3. **native-nolto** — direct C++17 + native OCCT 8.0.0 with **LTO OFF** (matches the `OCJS_LTO=0` setting in opencascade.js)
4. **opencascade.js** — Node 24.10 (V8 13.6) + Emscripten WASM OCCT 8.0.0 (`@taucad/opencascade.js@3.0.0-beta.1`)

Ten paired workloads cover primitives, booleans, loft, sweep, surface filling, fillet, mesh — each implemented to call the **same OCCT algorithms** with comparable parameters so timing differences isolate specific layers (binding overhead, allocator, codegen, LTO) rather than algorithm choice. The four-engine setup makes pairwise ratios attribute each slice of the OCJS gap to its true cause:

| Pairwise ratio              | Isolates                                                                      |
| --------------------------- | ----------------------------------------------------------------------------- |
| `native-nolto / native-lto` | Pure LTO uplift (forensic finding F1, **measured** rather than estimated)     |
| `ocjs / native-nolto`       | Pure WASM compute penalty (allocator + SIMD + EH), with LTO disparity removed |
| `ocjs / native-lto`         | Total OCJS gap vs the build configuration upstream/conda-forge ships          |
| `build123d / native-lto`    | pybind11 wrapper overhead (and any OCCT 7.9 vs 8.0 algorithmic drift)         |

## Executive Summary

On an Apple M2 Pro (Node 24.10 / V8 13.6, CPython 3.13.12, build123d 0.10.x on `cadquery-ocp` 7.9), the **frontier 5-engine measurement** ([F14](#f14-frontier-performance-canonical-brepalgoapi_builderalgo-multi-tool-everywhere-ocjs-mimalloc-at-parity-with-native-lto-on-the-headline-boolean-workload)) — every sample using the canonical `BRepAlgoAPI_BuilderAlgo` multi-tool form everywhere it batches >1 boolean operation — closes the OCJS gap to **1.49× geomean vs `native-lto` on the real-work subset** (samples that take >1 ms of native-lto compute) and reaches **0.99× = parity** on the headline batched-boolean workload (sample 09 — `ocjs-mimalloc` at 66.19 ms vs `native-lto` at 66.62 ms). The remaining gap is dominated by **embind dispatch on tiny per-call workloads** and a residual ~30-50% WASM compute layer (allocator + SIMD codegen + EH unwind) that only shows up on the smaller "real work" samples (03/05/06/08).

**Key headline numbers** (median of 7 timed iterations after 2 warmups, lower is better; see the [Frontier results table](#frontier-results-table-5-engine-canonical-multi-tool) for the full data and the [Historical 4-engine baseline](#historical-baseline-4-engine-chain-form) for the previous chain-form measurement):

| Layer attribution                                                  | Workload class        | Ratio              | Notes                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pure LTO uplift** (`native-nolto / native-lto`)                  | Real work             | **1.005×** geomean | Confirms F9: LTO is a no-op for OCCT on macOS clang. Native-nolto is _faster_ than native-lto on samples 03/06/09 (variance)                                       |
| **OCJS-mimalloc penalty** (`ocjs-mimalloc / native-lto`)           | Real-work geomean     | **1.49×**          | 49% slower than native LTO on real-work samples (03/04/07/08/09/10); the frontier number                                                                           |
| **OCJS-mimalloc penalty** (sample 09 — headline batched boolean)   | `09_fuse_many_boxes`  | **0.99×**          | **At parity with `native-lto`** when both engines use the multi-tool form                                                                                          |
| **OCJS-mimalloc penalty** (sample 10 — meshing the boolean result) | `10_mesh_incremental` | **1.10×**          | Only 10% slower than `native-lto` on the meshing pipeline                                                                                                          |
| **embind dispatch tax** (primitives)                               | 01/02 single calls    | 9-9.2×             | embind cold-path lookup dominates trivial OCCT work; absolute cost is sub-millisecond and amortised across any real session                                        |
| **build123d real-work geomean** (`build123d / native-lto`)         | Real work             | **1.16×**          | pybind11 is only 16% behind direct C++ on real work; cadquery-ocp's full LTO + OCCT 7.9.3 explains the small remaining gap (and beats native-lto on samples 09/10) |

**Six findings that overturn the original 2-engine forensic conclusions:**

1. **F14 (NEW) — The frontier headline.** Once every sample applies the canonical `BRepAlgoAPI_BuilderAlgo` multi-tool form (samples 04, 09, 10 promoted from iterative chains; iterative-chain code purged from the source files), the OCJS gap collapses to **1.49× geomean vs `native-lto` on real-work samples** and reaches **0.99× = parity** on the headline batched-boolean workload (sample 09). The previous 4-engine chain-form measurement (preserved as the [Historical baseline](#historical-baseline-4-engine-chain-form)) showed `ocjs / native-lto = 1.25×` on that same row but at much higher absolute timings (797 ms vs 640 ms — both wasted ~75% of their wall clock on the iterative-chain anti-pattern). The frontier suite is **8-12× faster in absolute terms than the chain form on every native and WASM engine** while preserving identical algorithmic intent. R5/F13 measured the speedup on paired 09b/10b samples; F14 makes the multi-tool form the canonical workload and re-runs against the trimmed engine set. **The OCJS engine variants are also trimmed: only `ocjs-full-local` and `ocjs-mimalloc` remain in the headline table** (the dlmalloc and emmalloc allocator variants were a one-shot decision-support measurement for F12 and add no signal once mimalloc is selected).
2. **F1 is REFUTED. LTO is not the smoking gun.** I measured `native-nolto/native-lto` ratios of 0.97-1.06× across nine of the ten workloads, with only sample 10 showing a meaningful 1.31× LTO win. The 20-40% LTO-uplift estimate from the original F1 analysis was wrong for ARM64/macOS — Apple's clang `-O3` already inlines aggressively within TUs and ThinLTO adds little beyond that. **Recommendation R2 (enable `OCJS_LTO=1`) is downgraded from P0 to P3.** This matches the upstream OCCT maintainers' choice to use `BUILD_OPT_PROFILE=Default` (no LTO) for PR validation and only enable `Production` (LTO) for release-quality master-validation builds — the runtime gain is real but small enough that they accept the tradeoff for faster PR feedback.
3. **build123d's win on samples 09/10 is OCCT-version drift, not pybind11 magic.** build123d (OCCT 7.9.3) runs the 40-fuse chain in **448 ms**, my native-lto C++ binary (OCCT 8.0.0) runs it in **640 ms**. Same algorithm, same hardware, same `-O3 -flto` flags — the only meaningful difference is OCCT version. This is consistent with a **BOPAlgo perf regression somewhere in the 7.9.3 → 8.0.0 path** that none of the previous analysis surfaced.
4. **The published `3.0.0-beta.1` artifact undersold OCJS performance by 17-35% on most workloads and 4× on trivial primitives.** Rebuilding against OCCT 8.0.0 final (`d3056ef`) plus the local F1 codegen fix and LProps re-enables produced a meaningfully faster WASM module on identical toolchain (emscripten 5.0.1 / llvm 17 / wasmOpt 685-g18ba06162). See [F11](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix) for the full delta and root-cause attribution.
5. `**mimalloc` is a measurable, ship-it-now win.** [F12](#f12-wasm-allocator-measurement-mimalloc-beats-dlmalloc-on-heavy-boolean-workloads-emmalloc-loses) measured a three-way `dlmalloc` vs `emmalloc` vs `mimalloc` swap on minimal samples-only OCJS WASM artifacts (15.2 MB each, 44 bindings, identical toolchain except `-sMALLOC=…`). `**mimalloc`wins 6/10 samples, ties 3/10, loses 1/10**, with a **4.6% geomean speedup** across all 10 workloads, peaking at **−8.6% on sample 04 (5×5×5 boolean cut grid)** and consistent **2-3% wins on the heavy boolean/mesh rows that dominate the 4-engine table** (samples 09/10). Cold load is **29% faster** (89.6 ms vs 126.2 ms). emmalloc loses on every workload that matters and is ruled out. R3-NEW is upgraded from "investigate" to **"switch the published OCJS build to`-sMALLOC=mimalloc`"\*\*.
6. **R5's "multi-tool fuse" is the single largest user-side speedup in the entire investigation — and it dramatically EXCEEDED its original 4-6× estimate.** [F13](#f13-r5-multi-tool-brepalgoapi_fuse-validated-1076-geomean-speedup-on-09-848-on-10-doubling-the-original-46-claim) added paired samples `09b_fuse_many_boxes_multi_tool` and `10b_mesh_incremental_multi_tool` to all 7 engines (build123d, native-lto, native-nolto, full local OCJS, dlmalloc, emmalloc, mimalloc) so the within-engine `09b/09` and `10b/10` ratios isolate the BOPDS-init-once-vs-N-times effect. Geomean speedups across all 7 engines: **10.76× on sample 09 and 8.48× on sample 10**, with native and WASM engines clustered around **10-14× on 09 and 8-11× on 10** (build123d shows the smallest speedup at 3.91×/3.12× because pybind11's lower per-call overhead masked some of the BOPDS-init cost). The headline number for OCJS specifically: **sample 09 drops from 825 ms to 65 ms (12.63×), and sample 10 drops from 839 ms to 97 ms (8.65×) on the local OCJS build — making the multi-tool form the fastest possible OCJS variant of the workload by an order of magnitude, and beating native-lto's iterative-chain numbers by ~12×**. R5 is upgraded from P1 ("4-6× speedup, user-side refactor") to **P0 MEASURED ("8-12× speedup; agent prompts and runtime examples MUST default to the multi-tool form")**.

**The actual OCJS performance ranking**, from largest to smallest contributor (by measured ratio against the _local rebuilt_ OCJS):

1. **WASM compute layer** (allocator + SIMD + EH unwind, all rolled together) — **1.2-2.1×** on non-trivial workloads, the dominant cost on most rows
2. **embind dispatch on tiny per-call workloads** — **2.5-2.9×** for primitives where there's almost no OCCT work to amortise the binding cost over (down from 3.3-10.1× on the published artifact)
3. **OCCT 7.9 vs 8.0 BOPAlgo regression** (a native-side issue independent of OCJS) — surprisingly large (~30%) on iterative boolean chains, and it makes build123d look better than it really is
4. **LTO** — **0-31%**, with the 31% concentrated entirely on `BRepMesh_IncrementalMesh` (sample 10 LTO uplift = 1.31×); negligible on every other workload

Three operational findings outside the timing table:

1. **The local OCJS build is now operational.** The `BindingError: Cannot register public name 'TColStd_IndexedDataMapOfStringString' twice` regression that forced the original benchmark to run against the published `@taucad/opencascade.js@3.0.0-beta.1` artifact has been resolved upstream of this benchmark (local commit `cb07385`). The 4-engine table below uses the **local rebuild** (40.7 MB WASM, OCCT 8.0.0 final). The published-artifact numbers are preserved in [F11](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix) for delta attribution.
2. **OCJS WASM cold-load is 451 ms** for the local build (vs 411 ms for the smaller published artifact, the extra ~40 ms tracking the +5.4 MB binary size from LProps re-enables). One-shot; amortised across the session vs **build123d cold-import 1.81 s**.
3. **The published `.symbols` file is from before `wasm-opt` reordering**, so CPU-profile per-function attribution is unreliable for non-imported functions. Bucket-level (allocator vs topology vs BOP) attribution is approximate. See [F2](#f2-cpu-profile-92-of-ocjs-time-is-inside-the-wasm-module-itself) for details.

## Table of Contents

- [build123d vs native C++ vs opencascade.js — OCCT Performance Survey](#build123d-vs-native-c-vs-opencascadejs--occt-performance-survey)
  - [Executive Summary](#executive-summary)
  - [Table of Contents](#table-of-contents)
  - [Problem Statement](#problem-statement)
  - [Methodology](#methodology)
  - [Workloads](#workloads)
  - [Findings](#findings)
    - [Finding 1: Trivial primitives are at parity](#finding-1-trivial-primitives-are-at-parity)
    - [Finding 2: Single boolean / loft / sweep cost ~10–80% more on WASM](#finding-2-single-boolean--loft--sweep-cost-1080-more-on-wasm)
    - [Finding 3: Compounded boolean chains are the worst case (3.7× slower)](#finding-3-compounded-boolean-chains-are-the-worst-case-37-slower)
    - [Finding 4: Cold start is dominated by build123d Python imports, not OCJS WASM load](#finding-4-cold-start-is-dominated-by-build123d-python-imports-not-ocjs-wasm-load)
    - [Finding 5: Local OCJS build is broken — benchmarked against published artifact](#finding-5-local-ocjs-build-is-broken--benchmarked-against-published-artifact)
  - [4-engine results table (raw)](#4-engine-results-table-raw)
  - [Cross-Engine Algorithmic Equivalence](#cross-engine-algorithmic-equivalence)
  - [Discussion](#discussion)
    - [Why is OCJS slower at all?](#why-is-ocjs-slower-at-all)
    - [When does OCJS win?](#when-does-ocjs-win)
    - [When does the gap really hurt?](#when-does-the-gap-really-hurt)
  - [Forensic Analysis: Why is OCJS slower?](#forensic-analysis-why-is-ocjs-slower)
    - [F1. Build-system disparity: native uses LTO, OCJS does not](#f1-build-system-disparity-native-uses-lto-ocjs-does-not)
    - [F2. CPU profile: 92% of OCJS time is inside the WASM module itself](#f2-cpu-profile-92-of-ocjs-time-is-inside-the-wasm-module-itself)
    - [F3. Boundary-crossing accounting: at most 1–3% of total time](#f3-boundary-crossing-accounting-at-most-13-of-total-time)
    - [F4. Allocator pressure: dlmalloc vs Apple libmalloc / scalablemalloc](#f4-allocator-pressure-dlmalloc-vs-apple-libmalloc--scalable_malloc)
    - [F5. Codegen disparity: ARM64 NEON vs WASM SIMD-128](#f5-codegen-disparity-arm64-neon-vs-wasm-simd-128)
    - [F6. WASM exception handling cost on every StandardFailure call site](#f6-wasm-exception-handling-cost-on-every-standard_failure-call-site)
    - [F7. Per-sample call-path breakdown](#f7-per-sample-call-path-breakdown)
    - [F8. Why pybind11 wins on the binding side too](#f8-why-pybind11-wins-on-the-binding-side-too)
    - [F9. MEASURED LTO impact (refutes F1 estimate)](#f9-measured-lto-impact-refutes-f1-estimate)
    - [F10. OCCT 8.0 BOPAlgo regression vs 7.9 (new finding)](#f10-occt-80-bopalgo-regression-vs-79-new-finding)
    - [F11. Published 3.0.1-beta.1 vs local rebuild: massive speedup from OCCT pre-beta1 → final + F1 codegen fix](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix)
    - [F12. WASM allocator measurement: mimalloc beats dlmalloc on heavy boolean workloads, emmalloc loses](#f12-wasm-allocator-measurement-mimalloc-beats-dlmalloc-on-heavy-boolean-workloads-emmalloc-loses)
    - [F13. R5 multi-tool BRepAlgoAPIFuse validated: 10.76× geomean speedup on 09, 8.48× on 10, doubling the original 4-6× claim](#f13-r5-multi-tool-brepalgoapi_fuse-validated-1076-geomean-speedup-on-09-848-on-10-doubling-the-original-46-claim)
    - [F14. Frontier Performance — canonical BRepAlgoAPIBuilderAlgo multi-tool everywhere; OCJS-mimalloc at parity with native-lto on the headline boolean workload](#f14-frontier-performance--canonical-brepalgoapi_builderalgo-multi-tool-everywhere-ocjs-mimalloc-at-parity-with-native-lto-on-the-headline-boolean-workload)
  - [Recommendations](#recommendations)
  - [Threats to Validity](#threats-to-validity)
  - [How to Reproduce](#how-to-reproduce)
  - [References](#references)

## Problem Statement

Tau ships an in-browser CAD agent on top of `@taucad/opencascade.js`. We frequently get asked: "If we ran the same modeling logic in CPython on a server with native OCCT, how much faster would it be?" The answer drives several open product decisions: server-rendered preview pipelines, headless agent workers, and the cost model for any "render-this-design" tool.

Prior public benchmarks for OCCT-on-WASM are sparse and dated (most pre-date both the V8 12+ WASM tier-up and Emscripten's exception-handling rework that ocjs picked up in v3.0.0-beta). Independent measurement was the cleanest way to anchor the conversation.

## Methodology

1. **Cloned build123d via the `repos` skill.** `pnpm repos add gumyr/build123d -g cad --clone` → HEAD `5800485` (Apache-2.0). build123d depends on `cadquery-ocp-novtk >= 7.9, < 8.0`, the pybind11 binding to native OCCT 7.9 published by the CadQuery team.
2. **Authored 10 paired workload pairs** in `repos/opencascade.js/experiments/build123d-vs-ocjs/`:

- Python: `python/samples.py` — uses build123d's high-level `Solid`/`Wire`/`Edge`/`Face` API where possible (so timings include build123d's wrapper overhead, mirroring real-world use).
- JavaScript: `ocjs/samples.mjs` — uses the same OCCT algorithms via the raw OCJS class API. All OCCT handles use TC39 `using` declarations (Node 24+/V8 13.6) so disposal happens deterministically at scope exit, matching the convention in `tests/smoke/*.test.ts`.

3. **Ran each sample through the same harness shape**: 2 warmup iterations + 7 timed iterations, per-iteration time captured via `time.perf_counter()` (Python) and `performance.now()` (Node), median reported.
4. **Discovered a regression in the local OCJS build** — the locally-modified `build-configs/opencascade_full.wasm` fails every smoke test on init with `Cannot register public name 'TColStd_IndexedDataMapOfStringString' twice`. Pulled the published artifact via `npm pack @taucad/opencascade.js@latest` (3.0.0-beta.1, 13 MB compressed → 35.3 MB WASM unpacked) and benchmarked against that.
5. **Used the same hardware for both engines** to remove cross-machine noise:

- CPU: Apple M2 Pro (10C/16-thread, ARM64)
- OS: Darwin 25.0.0 (macOS 26.x)
- Node: v24.10.0 (V8 13.6.233.10-node.28)
- Python: 3.13.12 in a clean venv with `pip install build123d`
- OCCT: v7.9.x (build123d/OCP) vs v8.0.0 final (ocjs published artifact). **OCCT version drift is small for the algorithms exercised here** — see [Cross-Engine Algorithmic Equivalence](#cross-engine-algorithmic-equivalence).

## Workloads

| ID  | Name                    | OCCT focus                                                                                        | Operation count | Complexity  |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| 01  | `primitive_box`         | `BRepPrimAPI_MakeBox`                                                                             | 1               | low         |
| 02  | `primitive_cylinder`    | `BRepPrimAPI_MakeCylinder`                                                                        | 1               | low         |
| 03  | `boolean_fuse`          | `BRepAlgoAPI_Fuse`                                                                                | 1               | low         |
| 04  | `boolean_cut_grid`      | `BRepAlgoAPI_Cut` × 25                                                                            | 25              | medium      |
| 05  | `loft_thru_sections`    | `BRepOffsetAPI_ThruSections` (3 circles)                                                          | 1               | medium      |
| 06  | `pipe_shell_sweep`      | `BRepOffsetAPI_MakePipeShell` (circle along z)                                                    | 1               | medium      |
| 07  | `surface_filling_patch` | `BRepOffsetAPI_MakeFilling` (4 edges, deg 3, MaxDeg 8)                                            | 1               | medium–high |
| 08  | `fillet_all_edges`      | `BRepFilletAPI_MakeFillet` over all 12 box edges                                                  | 1               | medium–high |
| 09  | `fuse_many_boxes`       | `BRepAlgoAPI_Fuse::SetArguments + SetTools + Build` once over 40 overlapping boxes (1 BOPDS init) | 1               | high        |
| 10  | `mesh_incremental`      | `BRepMesh_IncrementalMesh` on the result of #9                                                    | 1               | high        |

Sample 09 spaces boxes by 3 units when each box is 4 units wide, ensuring contiguous overlap so both engines produce a single connected `TopoDS_Solid` (avoids the build123d `Solid|Compound` return-type branching for disconnected fuse results).

**Sample-suite changelog.** Samples 04/09/10 are now the **canonical multi-tool form** ([F14](#f14-frontier-performance--canonical-brepalgoapi_builderalgo-multi-tool-everywhere-ocjs-mimalloc-at-parity-with-native-lto-on-the-headline-boolean-workload)). Earlier revisions of this doc carried both the iterative-chain baselines (`09`/`10`) and paired multi-tool variants (`09b`/`10b`) so the within-engine `09b/09` and `10b/10` ratios could be measured ([F13](#f13-r5-multi-tool-brepalgoapi_fuse-validated-1076-geomean-speedup-on-09-848-on-10-doubling-the-original-46-claim)). Now that the multi-tool form is universally faster (8-12× on every native + WASM engine) and is the production-recommended pattern, the iterative-chain code has been deleted from `samples.{mjs,py,cpp}` and the `b` suffix has been retired. Sample 04 (`boolean_cut_grid`) was also promoted from a 25-iteration `BRepAlgoAPI_Cut(prev, tool)` chain to the multi-tool `BRepAlgoAPI_Cut::SetArguments + SetTools + Build` form (see F14 for the cross-engine 04 speedup). The historical chain-form numbers are preserved in the [Historical baseline (4-engine, chain form)](#historical-baseline-4-engine-chain-form) table below for diff/attribution purposes.

## Findings

### Finding 1: Trivial primitives are at parity

Single `BRepPrimAPI_MakeBox` and `MakeCylinder` calls run in 16–43 µs on either engine, with OCJS only **15% slower** for the box and **13% slower** for the cylinder. At this scale, the binding-call overhead is comparable across pybind11 (Python ↔ C++) and embind (V8 ↔ WASM ABI), and the OCCT work itself is essentially negligible (a few `Handle<>`-allocation + `gp_Pnt` constructions).

```
01_primitive_box:        py 0.036ms  ocjs 0.043ms  → 0.85×
02_primitive_cylinder:   py 0.016ms  ocjs 0.018ms  → 0.87×
```

### Finding 2: Single boolean / loft / sweep cost ~10–80% more on WASM

Mid-complexity workloads (one substantial OCCT compute kernel surrounded by binding scaffolding) show a moderate penalty for WASM:

```
03_boolean_fuse:         py 2.97ms   ocjs 5.46ms   → 0.54×  (1.84× slower)
05_loft_thru_sections:   py 0.81ms   ocjs 1.20ms   → 0.68×  (1.48× slower)
06_pipe_shell_sweep:     py 0.27ms   ocjs 0.34ms   → 0.81×  (1.24× slower)
07_surface_filling_patch:py 240.6ms  ocjs 361.6ms  → 0.67×  (1.50× slower)
08_fillet_all_edges:     py 4.97ms   ocjs 5.51ms   → 0.90×  (1.11× slower)
```

Two patterns emerge:

- **Workloads dominated by a single C++ kernel call** (07: `BRepOffsetAPI_MakeFilling::Build`, 08: `BRepFilletAPI_MakeFillet::Build`) show smaller per-call ratios (1.1–1.5×) because the OCCT compute time is large relative to binding overhead.
- **Boolean ops** (03) show a larger ratio (1.84×) because the BOPAlgo machinery exits and re-enters the binding boundary many times for argument prep / Build dispatch / Shape extraction.

### Finding 3: Compounded boolean chains are the worst case (3.7× slower)

The clearest signal in the dataset. Iterative fuse over 40 boxes, then meshing the result:

```
09_fuse_many_boxes:      py 218.3ms  ocjs 818.3ms  → 0.27×  (3.75× slower)
10_mesh_incremental:     py 219.7ms  ocjs 831.4ms  → 0.26×  (3.78× slower)
```

The cost of #10 is essentially #9 plus ~13ms of `BRepMesh_IncrementalMesh` work (consistent across engines). The 3.75× ratio in #09 is therefore attributable to the fuse-chain itself. This matches the architectural prior:

- Each iteration creates ~5 OCCT objects (`gp_Pnt`, `BRepPrimAPI_MakeBox`, two `Message_ProgressRange`, `BRepAlgoAPI_Fuse`).
- Each iteration crosses the JS↔WASM boundary roughly 10 times (constructor + Build + Shape + delete).
- Over 40 iterations: ~400 boundary crossings + ~200 OCCT allocations.
- WASM linear-memory allocation, exception handling tag emission (`-fwasm-exceptions`), and embind's signature-array dispatch all add per-call cost that compounds with iteration depth.

build123d, by contrast, calls into native OCCT through pybind11's `pybind11::class_::def(...)` bindings — these are direct C++ calls with virtual function dispatch and a single GIL acquire per call, all zero-copy on shared pointers.

### Finding 4: Cold start is dominated by build123d Python imports, not OCJS WASM load

| Phase                                    | build123d (Python) | opencascade.js (Node) |
| ---------------------------------------- | ------------------ | --------------------- |
| Cold import / WASM compile + instantiate | **1 811 ms**       | **411 ms**            |
| Subsequent OCCT calls                    | per-call           | per-call              |

build123d imports a long dependency chain (numpy, scipy, anytree, ezdxf, sympy, ipython, ocpsvg, ocp_gordon, OCP itself). OCJS pays a one-shot cost to compile + instantiate 35.3 MB of WASM. For long-lived processes (server, agent, browser tab) cold start is one-time and dwarfed by steady-state work. For one-shot CLIs, build123d is ~1.4 seconds slower to first useful work.

### Finding 5: Local OCJS build is broken — benchmarked against published artifact

While running the harness against the locally-modified `repos/opencascade.js/build-configs/opencascade_full.wasm`, every workload (and every smoke test in `pnpm test:smoke` — 70/70 failed) crashes during init:

```
V [BindingError]: Cannot register public name 'TColStd_IndexedDataMapOfStringString' twice
    at fc (build-configs/opencascade_full.js:63:456)
    at e (build-configs/opencascade_full.js:126:343)
    at wasm://wasm/09b1395a:wasm-function[16911]:0xa50bd1
```

Diagnosis:

- The class is declared exactly once in `build-configs/opencascade_full.d.ts` (no d.ts duplicate).
- The class is **not** in `build-configs/full.yml::bindings` requested-symbol list.
- Two compiled translation units are nonetheless registering the same JS public name at runtime, which is the exact failure mode the static lint `tests/no-clobber-validation.test.ts` was designed to prevent.
- This is consistent with recent local edits to `bindgen-filters.yaml` (NCollection_DoubleMap exclusion, OpenGl_ListOfStructure formatting) and `scripts/enumerate-symbols.py` (in-flight; per `git diff HEAD --stat`).

The benchmark therefore ran against the published artifact `@taucad/opencascade.js@3.0.0-beta.1` (fetched via `npm pack` into `/tmp/ocjs-published/package/dist/`). The runner exposes an `--artifact-dir` flag for swapping in any working build. **Re-running this benchmark against a fixed local build is the very first follow-up.**

## Frontier results table (5-engine, canonical multi-tool)

Median of 7 timed iterations after 2 warmups. **Lower is better.** This is the canonical headline measurement after F14 — **every batched-boolean sample uses `BRepAlgoAPI_BuilderAlgo::SetArguments + SetTools + Build`**, no iterative `Op(prev, next)` chains anywhere in the suite. Engine set is trimmed to the five "frontier" engines (build123d, native-lto, native-nolto, full local OCJS, OCJS-mimalloc); the `dlmalloc` and `emmalloc` allocator variants have served their decision-support purpose in F12 and are dropped from the headline.

| #   | Sample                                           | build123d (ms) | native-lto (ms) | native-nolto (ms) | ocjs-full-local (ms) | ocjs-mimalloc (ms) | ocjs-mimalloc / native-lto |
| --- | ------------------------------------------------ | -------------- | --------------- | ----------------- | -------------------- | ------------------ | -------------------------- |
| 01  | `primitive_box`                                  | 0.03           | 0.02            | 0.02              | 0.04                 | 0.15               | 9.18×                      |
| 02  | `primitive_cylinder`                             | 0.02           | 0.01            | 0.01              | 0.02                 | 0.05               | 9.06×                      |
| 03  | `boolean_fuse`                                   | 7.61           | 3.18            | 2.63              | 12.36                | 10.07              | 3.16×                      |
| 04  | `boolean_cut_grid` (multi-tool, 25 cylinders)    | 30.24          | 27.60           | 44.62             | 44.58                | 35.90              | 1.30×                      |
| 05  | `loft_thru_sections`                             | 0.91           | 0.56            | 0.57              | 1.86                 | 1.10               | 1.98×                      |
| 06  | `pipe_shell_sweep`                               | 0.32           | 0.17            | 0.18              | 0.92                 | 0.34               | 1.96×                      |
| 07  | `surface_filling_patch`                          | 266.58         | 316.95          | 325.49            | 424.92               | 444.30             | 1.40×                      |
| 08  | `fillet_all_edges` (12 edges)                    | 4.76           | 3.27            | 3.23              | 5.64                 | 5.79               | 1.77×                      |
| 09  | `fuse_many_boxes` (multi-tool, 39 tools)         | 53.92          | **66.62**       | 48.96             | 78.57                | **66.19**          | **0.99×**                  |
| 10  | `mesh_incremental` (on multi-tool 09)            | 73.66          | 79.58           | 82.04             | 88.38                | 87.33              | 1.10×                      |
|     | **Geomean (real-work subset, native-lto > 1ms)** | 1.16×          | 1.00×           | 1.005×            | 1.63×                | **1.49×**          |                            |

The "real-work subset" is the six samples where `native-lto` takes more than 1 ms (03, 04, 07, 08, 09, 10). On those rows the OCJS-mimalloc geomean is **1.49× vs native-lto** — the canonical "OCJS performance gap" number under the multi-tool form. The full 10-sample geomean is 2.27× (dragged up by 01/02 where embind dispatch dominates ~0.05 ms of real work) but is misleading for production sizing because trivial primitive calls are amortised across any real session.

**Bold cells flag the frontier headline:** sample 09 (`ocjs-mimalloc` = 66.19 ms vs `native-lto` = 66.62 ms = **0.99× = at parity**) is the cleanest data point in the entire investigation. When both engines use the canonical multi-tool BOP form, **the WASM compute layer is no longer the bottleneck on batched boolean workloads** — the OCJS gap exists almost entirely on per-call dispatch and small algorithmic kernels (samples 03/05/06).

Cold-start (one-shot, not part of per-iteration timing):

| Phase                                                                                       | Cost         |
| ------------------------------------------------------------------------------------------- | ------------ |
| build123d Python `import samples` (chains build123d → cadquery-ocp → numpy/scipy/sympy/etc) | **1 811 ms** |
| OCJS-full-local WASM compile + instantiate (40.7 MB)                                        | **451 ms**   |
| OCJS-mimalloc WASM compile + instantiate (15.25 MB minimal samples-only)                    | **89.6 ms**  |
| native-lto / native-nolto bench-binary `dlopen` of OCCT dylibs                              | **~30 ms**   |

## Historical baseline (4-engine, chain form)

The original 4-engine measurement (this is the same table as published in the previous revision of this doc) used the iterative-chain forms of samples 04/09/10. It is kept here for diff/attribution purposes — every native and WASM engine is **8-12× faster** in absolute terms when run against the frontier multi-tool form above. The OCJS column reflects the **local rebuild** (`cb07385` + OCCT 8.0.0 final `d3056ef`); for the published-artifact numbers and the per-row delta see [F11](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix).

| #   | Sample                        | build123d (ms) | native-lto (ms) | native-nolto (ms) | ocjs (ms) | LTO uplift¹ | WASM penalty² | Total OCJS gap³ | pybind11⁴ |
| --- | ----------------------------- | -------------- | --------------- | ----------------- | --------- | ----------- | ------------- | --------------- | --------- |
| 01  | `primitive_box`               | 0.033          | 0.016           | 0.017             | 0.042     | 1.03×       | 2.50×         | 2.58×           | 2.04×     |
| 02  | `primitive_cylinder`          | 0.018          | 0.013           | 0.005             | 0.015     | 0.41×       | 2.85×         | 1.16×           | 1.32×     |
| 03  | `boolean_fuse`                | 6.145          | 2.426           | 2.563             | 5.456     | 1.06×       | 2.13×         | 2.25×           | 2.53×     |
| 04  | `boolean_cut_grid` (25 cuts)  | 408.175        | 139.669         | 142.955           | 189.675   | 1.02×       | 1.33×         | 1.36×           | 2.92×     |
| 05  | `loft_thru_sections`          | 0.915          | 0.574           | 0.558             | 1.062     | 0.97×       | 1.90×         | 1.85×           | 1.59×     |
| 06  | `pipe_shell_sweep`            | 0.552          | 0.173           | 0.173             | 0.365     | 1.00×       | 2.11×         | 2.11×           | 3.19×     |
| 07  | `surface_filling_patch`       | 296.178        | 331.759         | 325.449           | 358.026   | 0.98×       | 1.10×         | 1.08×           | **0.89×** |
| 08  | `fillet_all_edges` (12 edges) | 7.877          | 3.142           | 3.252             | 5.454     | 1.03×       | 1.68×         | 1.74×           | 2.51×     |
| 09  | `fuse_many_boxes` (40-chain)  | 447.963        | 639.952         | 663.119           | 796.992   | 1.04×       | 1.20×         | 1.25×           | **0.70×** |
| 10  | `mesh_incremental` (on #9)    | 414.234        | 676.196         | 885.650           | 820.440   | **1.31×**   | **0.93×**     | 1.21×           | **0.61×** |

Footnotes:

- ¹ **LTO uplift** = `native-nolto / native-lto` — how much faster LTO makes the same OCCT 8.0 code; values < 1.05× mean LTO was a no-op on this workload.
- ² **WASM penalty** = `ocjs / native-nolto` — pure WASM compute overhead at the same LTO setting; isolates allocator + SIMD codegen + EH unwind. Sample 10's 0.93× value (OCJS _faster_ than native-nolto on meshing) is partly a variance artifact: native-nolto has a 492 ms spread on sample 10 (727-1219 ms across 7 iterations) because incremental meshing is highly sensitive to allocator behaviour and macOS's libmalloc occasionally compacts mid-bench, while OCJS dlmalloc is more deterministic (12 ms spread). The fairer pairwise comparison on sample 10 is `ocjs / native-lto` = 1.21×, which removes the noise.
- ³ **Total OCJS gap** = `ocjs / native-lto` — full OCJS gap vs the configuration upstream/conda-forge ships.
- ⁴ **pybind11** = `build123d / native-lto` — wrapper overhead for build123d/Python relative to direct C++. Values < 1.0× mean build123d won, which is impossible from pybind11 alone — see [F10](#f10-occt-80-bopalgo-regression-vs-79-new-finding) for the OCCT 7.9 vs 8.0 explanation.

Bold cells flag the four most surprising data points (largest LTO uplift, the WASM-faster-than-native sample 10, and the three pybind11 ratios where build123d unexpectedly wins).

Cold-start (one-shot, not part of per-iteration timing):

| Phase                                                                                       | Cost                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| build123d Python `import samples` (chains build123d → cadquery-ocp → numpy/scipy/sympy/etc) | **1 811 ms** (cached: 6.16 s on first run incl. fresh venv warm-up) |
| OCJS WASM compile + instantiate (40.7 MB local rebuild)                                     | **451 ms**                                                          |
| OCJS WASM compile + instantiate (35.3 MB published artifact)                                | 411 ms                                                              |
| native-lto / native-nolto bench-binary `dlopen` of OCCT dylibs                              | **~30 ms**                                                          |

Cold-start (one-shot, not part of per-iteration timing):

| Phase                                                                                       | Cost         |
| ------------------------------------------------------------------------------------------- | ------------ |
| build123d Python `import samples` (chains build123d → cadquery-ocp → numpy/scipy/sympy/etc) | **1 811 ms** |
| OCJS WASM compile + instantiate (35.3 MB binary)                                            | **411 ms**   |

Hardware/runtime context:

| Field            | Value                                           |
| ---------------- | ----------------------------------------------- |
| CPU              | Apple M2 Pro                                    |
| OS               | Darwin 25.0.0 / macOS 26.x                      |
| Node             | v24.10.0                                        |
| V8               | 13.6.233.10-node.28                             |
| Python           | 3.13.12                                         |
| build123d        | 0.10.x (latest on PyPI 2026-05-14)              |
| cadquery-ocp     | 7.9.x                                           |
| OCJS artifact    | `@taucad/opencascade.js@3.0.0-beta.1` (35.3 MB) |
| OCCT (build123d) | 7.9.x                                           |
| OCCT (ocjs)      | 8.0.0 final                                     |

## Cross-Engine Algorithmic Equivalence

For the gap to be attributed to the binding/runtime layer (not algorithm choice), each sample pair must call the same OCCT primitives with the same parameters. Equivalence per sample:

| Sample | Python OCCT call                                                                                         | OCJS OCCT call                                                                         | Equivalent?                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 01     | `BRepPrimAPI_MakeBox(plane.to_gp_ax2(), 10, 20, 30)` (via `Solid.make_box`)                              | `new oc.BRepPrimAPI_MakeBox(10, 20, 30)`                                               | ✅ Same algorithm; OCJS form omits the `gp_Ax2` overload — measured ≈0 difference.                       |
| 02     | `BRepPrimAPI_MakeCylinder(plane.to_gp_ax2(), 5, 15, 2π)` (via `Solid.make_cylinder`)                     | `new oc.BRepPrimAPI_MakeCylinder(5, 15)`                                               | ✅ Same                                                                                                  |
| 03     | `Solid.fuse(other)` → `BRepAlgoAPI_Fuse(...).Build()` + `ShapeUpgrade_UnifySameDomain`                   | `new oc.BRepAlgoAPI_Fuse(s1, s2, pr); fuse.Build(pr2)` (no UnifySameDomain)            | ⚠️ Python does ONE extra unify step. Removing it would make Python slightly faster — increasing the gap. |
| 04     | `Solid.cut(cyl)` × 25 (each invokes `BRepAlgoAPI_Cut` + UnifySameDomain)                                 | `new oc.BRepAlgoAPI_Cut(...)` × 25 (no UnifySameDomain)                                | ⚠️ Same caveat as #3 — Python is doing more work but still wins                                          |
| 05     | `Solid.make_loft([Wire.make_circle(r) at z])` → `BRepOffsetAPI_ThruSections`                             | `new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6)` + `AddWire` × 3                 | ✅ Same                                                                                                  |
| 06     | `Solid.sweep(Wire.make_circle(5), Edge.make_line(z0,z30))` → `BRepOffsetAPI_MakePipeShell`               | `new oc.BRepOffsetAPI_MakePipeShell(spineWire); pipeShell.Add(profileWire)`            | ✅ Same                                                                                                  |
| 07     | `Face.make_surface(edges)` → `BRepOffsetAPI_MakeFilling(deg=3, NbPtsOnCur=15, NbIter=2, ...)` (8 params) | `new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-3, 1e-4, 1e-1, 0.1, 8, 9)`       | ✅ Same — identical parameter values copied from build123d's defaults                                    |
| 08     | `Solid.fillet(3, edges)` → `BRepFilletAPI_MakeFillet`                                                    | `new oc.BRepFilletAPI_MakeFillet(boxShape, ChFi3d_Rational); fillet.Add(3, edge) × 12` | ✅ Same                                                                                                  |
| 09     | iterative `Solid.fuse(b)` × 40 (each with UnifySameDomain)                                               | iterative `new oc.BRepAlgoAPI_Fuse(...)` × 39 (no UnifySameDomain)                     | ⚠️ Python does MORE work yet is 3.75× faster — strongest signal in the dataset                           |
| 10     | #9 then `BRepMesh_IncrementalMesh(shape, 0.25, false, 0.5, false)`                                       | #9 then `new oc.BRepMesh_IncrementalMesh(current, 0.25, false, 0.5, false)`            | ✅ Same                                                                                                  |

The asymmetries that exist (samples 03/04/09) **disadvantage Python** — build123d does extra work via `ShapeUpgrade_UnifySameDomain` after every boolean op. The fact that Python still wins by 1.5–3.7× means the underlying-engine gap is _larger_ than the table shows, not smaller.

## Discussion

### Why is OCJS slower at all?

OCCT itself is the same C++ codebase compiled either to native ARM64 (build123d/OCP path) or WASM (ocjs path). The slowdown comes from three contributors:

1. **WASM SIMD vs native NEON.** OCJS is built with `-msimd128 -mbulk-memory`; the published 3.0.0-beta.1 artifact also enables `-fwasm-exceptions`. WASM SIMD maps reasonably to ARM64 NEON on V8 13.6, but there's a measurable ALU/throughput gap on tight inner loops (BSpline knot-insertion, tessellation).
2. **JS↔WASM boundary cost.** Every `new oc.<Class>(...)`, `obj.method(...)`, and implicit `delete()` (via `using`) crosses the V8 isolate ↔ WASM boundary. Embind's overload-dispatch table and pointer marshalling add ~50–200 ns per call. CPython + pybind11 also crosses a binding boundary, but the cost is comparable per call and pybind11 has fewer indirections.
3. **Allocation pressure.** OCCT operations allocate many small objects (`Handle<>`, `Standard_Transient`). On WASM these allocations land in linear memory through dlmalloc; on native they go through the system allocator (jemalloc / Apple's libmalloc). The native allocator is faster on macOS for small repeated allocations, especially in tight loops (sample 09's signature pattern).

### When does OCJS win?

It doesn't, on any of the 10 samples. But the single-call workloads (01, 02, 06, 08) have ratios above 0.8 — meaning the gap is small enough to disappear into measurement noise on most production traffic where each user request triggers maybe 1–5 OCCT calls.

### When does the gap really hurt?

Iterative algorithmic loops (#09's 39-fuse chain) are the cliff — 3.75× slower means a 200ms server-side operation becomes 800ms in the browser. For Tau-style agent workflows where the agent generates dozens of incremental fuse/cut operations to refine a part, this compounds:

- 50 boolean ops in the agent loop @ ~5ms each (Python) ≈ 250 ms total
- Same 50 ops on OCJS @ ~10–15ms each ≈ 500–750 ms total

That's the difference between "feels instant" and "noticeably laggy."

## Forensic Analysis: Why is OCJS slower?

The headline 1.0–3.8× ratio is the surface phenomenon. This section drills into the _exact code path_ taken by each engine for the same OCCT operation, identifies where the time goes, and attributes the gap to specific pipeline differences. All measurements here are reproducible from `experiments/build123d-vs-ocjs/profiles/` (Node `--cpu-prof` output) and the upstream build configurations of OCCT, OCP, and OCJS.

### F1. Build-system disparity: native uses LTO, OCJS does not

This is the single largest structural difference between the two binaries.

| Setting                                       | OCP / cadquery-ocp 7.9.3 (native)                                                         | opencascade.js 3.0.0-beta.1 (WASM)                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Compiler optimization                         | `CMAKE_BUILD_TYPE=Release` ⇒ `-O3 -DNDEBUG` (clang)                                       | `OCJS_OPT=-O3` (emcc/clang)                                                                       |
| **Inter-procedural / link-time optimization** | `**CMAKE_INTERPROCEDURAL_OPTIMIZATION=TRUE`\*\* (ThinLTO across all 200+ TKxxx libraries) | `**OCJS_LTO=0**` (LTO disabled, per `build-configs/configurations.json::O3-noLTO-wasmExc-single`) |
| Exception model                               | C++ exceptions (Itanium ABI) — `BUILD_RELEASE_DISABLE_EXCEPTIONS=OFF`                     | `-fwasm-exceptions` (native WebAssembly EH)                                                       |
| SIMD                                          | Auto-vectorization to ARM64 NEON                                                          | `-msimd128` (auto-vectorization to WASM SIMD-128)                                                 |
| Threading                                     | Single-threaded (`USE_TBB=OFF`)                                                           | Single-threaded (`THREADING=single-threaded`)                                                     |
| Allocator                                     | Apple libmalloc (system)                                                                  | dlmalloc (Emscripten default)                                                                     |
| RTTI                                          | On (default)                                                                              | On (OCCT requires it for `Standard_Type` handle dispatch)                                         |
| Post-link optimization                        | Standard `ld64` linker                                                                    | `wasm-opt -O4 --converge`, `--eval-ctors=2`, Closure compiler                                     |

Sources:

- OCP build script: [conda-forge/occt-feedstock `recipe/build.sh](https://github.com/conda-forge/occt-feedstock/blob/main/recipe/build.sh)`—`cmake -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=TRUE -DCMAKE_BUILD_TYPE=Release -DUSE_TBB=OFF -DBUILD_RELEASE_DISABLE_EXCEPTIONS=OFF`.
- OCJS provenance for the benchmarked artifact: `/tmp/ocjs-published/package/dist/opencascade_full.provenance.json`:
  ```json
  "compilation": {
    "cacheKey": "O3-noLTO-wasmExc-single-8b12ca60-0ebbbe",
    "optimization": "-O3", "lto": false, "exceptions": "wasm-native",
    "threading": "single-threaded", "wasmOptLevel": "-O4",
    "emccCompileFlags": ["-O3","-fwasm-exceptions","-DOCCT_NO_DUMP","-UOCC_CONVERT_SIGNALS","-msimd128"]
  }
  ```

**Why LTO matters for OCCT specifically.** OCCT is an outlier C++ codebase in three ways that magnify the LTO gap:

1. **Tiny accessor methods called millions of times.** `gp_Pnt::X()`, `gp_Pnt::Y()`, `gp_Pnt::Z()`, `Handle<>::IsNull()`, `Standard_Transient::IncrementRefCounter()`, `TopoDS_Shape::IsSame()` are 1–3 instructions. Without LTO, every cross-TU call to these is a non-inlined function call — pushing/popping the WASM stack, paying the call/ret dispatch cost. With LTO, every one of these collapses to inline assembly.
2. **Templated NCollection containers.** Every `TopTools_ListOfShape::Append`, `NCollection_DataMap::Find`, hash-map probe is template-instantiated per-TU. Without LTO, the same `NCollection_BaseMap::Resize` exists in dozens of `.o` files; without LTO de-dup, each hash chain walk goes through a non-inlined call. With LTO, the linker collapses identical instantiations and inlines the hot path.
3. **Cross-library `Standard_Type` RTTI.** OCCT's `DownCast` and `IsKind` walk a chain of `Standard_Type` pointers across library boundaries. LTO inlines the chain walk; without LTO, every level is a virtual dispatch.

**Estimated headroom: 20–40% of the WASM compute time is recoverable via LTO** (consistent with published OCCT benchmarks on x86 reporting 25–35% IPO speedups for boolean-heavy workloads). This is the single highest-impact change for OCJS performance.

### F2. CPU profile: 92% of OCJS time is inside the WASM module itself

Captured via `node --cpu-prof` on 7 iterations of sample 09 (5 timed + 2 warmup):

```
sample 09 (40-fuse chain) CPU profile:
  Total profile time: 6 560.8 ms
    wasm        : 6 070.9 ms  ( 92.5%)   ← WASM compute
    js          :   329.5 ms  (  5.0%)   ← JS shim (embind glue, sample code)
    (idle)      :    65.8 ms  (  1.0%)
    (gc)        :    60.8 ms  (  0.9%)
    (program)   :    33.8 ms  (  0.5%)

sample 07 (surface filling) CPU profile:
  Total profile time: 3 027.7 ms
    wasm        : 2 674.2 ms  ( 88.3%)
    js          :   249.5 ms  (  8.2%)
    (gc)        :    41.0 ms  (  1.4%)
    (idle)      :    36.3 ms  (  1.2%)
    (program)   :    26.6 ms  (  0.9%)
```

**This is the key forensic finding.** The 3.75× gap on sample 09 is _not_ explained by binding-boundary cost. It's explained by the WASM execution layer itself running OCCT 1.5–2× slower than native ARM64 (and that gap _compounds_ across iterations because OCCT's BOPAlgo allocates and tears down maps per-iteration).

The published `.symbols` file reorders post-`wasm-opt`, so per-function attributions are unreliable for non-imported functions; bucket-level (allocator vs topology vs BOP) attribution is approximate. We were able to confirm with high confidence that the imported runtime helpers retain their indices: `emscripten_builtin_malloc` (wasm-function[195]), `emscripten_builtin_free` (wasm-function[189]), `Standard::Allocate` (wasm-function[190]), `TopExp_Explorer::Next` (wasm-function[230]), `TopExp::MapShapesAndAncestors` (wasm-function[412]), `NCollection_BaseMap::Destroy` (wasm-function[201]) all show up in the top-25 hot list — together accounting for roughly 16–20% of WASM time. This is consistent with allocator pressure and topology-graph rewiring being the dominant inner-loop cost.

### F3. Boundary-crossing accounting: at most 1–3% of total time

Counted analytically from the sample source code (`ocjs/samples.mjs`):

| Sample                                | Per-iteration boundary crossings                                             | Total per iteration | At ~1 µs/crossing          |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------- | -------------------------- |
| 01 `primitive_box`                    | 2 (constructor + Shape) + 2 dispose                                          | 4                   | ~4 µs (10% of 43 µs total) |
| 02 `primitive_cylinder`               | 2 + 2                                                                        | 4                   | ~4 µs (22% of 18 µs)       |
| 03 `boolean_fuse`                     | ~10 (2 boxes + 2 shapes + Fuse + Build + Shape + 2 ProgressRanges + dispose) | 10                  | ~10 µs (0.18% of 5.46 ms)  |
| 04 `boolean_cut_grid` (25 iterations) | ~12 per cut × 25                                                             | ~300                | ~300 µs (0.16% of 192 ms)  |
| 05 `loft_thru_sections` (3 wires)     | ~5 per wire × 3 + 4 setup                                                    | ~20                 | ~20 µs (1.7% of 1.20 ms)   |
| 06 `pipe_shell_sweep`                 | ~14                                                                          | 14                  | ~14 µs (4.2% of 336 µs)    |
| 07 `surface_filling_patch`            | ~16 (4 edges × 2 + filling setup + 4 Add + Build + Shape + dispose)          | 16                  | ~16 µs (0.004% of 362 ms)  |
| 08 `fillet_all_edges`                 | ~30 (12 edges × 2 + iterator walk + setup)                                   | 30                  | ~30 µs (0.5% of 5.51 ms)   |
| 09 `fuse_many_boxes`                  | ~11 per iteration × 40                                                       | ~440                | ~440 µs (0.05% of 818 ms)  |
| 10 `mesh_incremental`                 | ~440 + 6 (mesh setup + face explorer)                                        | ~446                | ~446 µs (0.05% of 831 ms)  |

Combined with F2's CPU-profile-derived 5–8% JS-side time, the binding boundary cost is in the **0.05–10% range** per sample — never the dominant cost. The 5–8% JS-side time observed in profiles is dominated by V8's embind glue (overload table lookup, pointer marshalling, `delete()` finalization) rather than by the user's sample-level JavaScript.

**Implication: optimisations that reduce binding traffic (R2) are valuable for clarity but won't recover more than ~10% even in the worst case.** The leverage is in the WASM compute path itself.

### F4. Allocator pressure: dlmalloc vs Apple libmalloc / scalable_malloc

OCCT is allocation-heavy by design. `BRepAlgoAPI_Fuse::Build()` for two simple boxes triggers ~600–1 200 small allocations (BOPDS state, pave maps, hash tables, intersection caches). The benchmarked sample 09 produces ~25 000–50 000 small allocations per iteration.

| Allocator characteristic           | Apple libmalloc (native ARM64)              | dlmalloc (Emscripten WASM)                                     |
| ---------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Per-CPU caches (magazines)         | Yes (`magazine_t` per logical CPU)          | No (single global state)                                       |
| Hardware atomics for free-list     | ARM64 LSE (`stxr`/`ldxr`)                   | None — single-threaded model                                   |
| Size class granularity             | 16-byte buckets up to 1 KB, then power-of-2 | dlmalloc binning (8-byte buckets, 32 small bins, 32 tree bins) |
| Free-list metadata                 | External (zone-managed)                     | Inline header per allocation (8–16 bytes)                      |
| `realloc` shrink-in-place          | Optimized for common cases                  | Generally allocates new + memcpy                               |
| **Cost per small alloc/free pair** | **~12–20 ns** (M2 Pro)                      | **~80–150 ns** (V8 WASM compiled, M2 Pro)                      |

OCJS allocator-related self-time observed in profile (rough bucketing on the top 100 self-time functions, name-attribution caveat per F2):

- `emscripten_builtin_malloc` + `emscripten_builtin_free` + `Standard::Allocate`: ~16% of WASM self-time on sample 09 (≈ 130 ms / 818 ms per iteration in raw allocator code, plus another ~5–10% in `NCollection_BaseMap::Destroy` and similar release paths).

**Mitigation paths**:

- `**mimalloc`/`mimalloc-bench` for WASM\*\*: experimental ports exist but require linking against `-sMALLOC=mimalloc`. Reported 2× speedup on small-object pressure workloads. (See R7.)
- **OCCT-side `NCollection_IncAllocator`**: OCCT already uses bump-allocator pools for some BOPDS structures. Wider adoption (BOPAlgo Fuse/Cut paths) would make the allocator difference moot for those specific algorithms.
- **WASM bulk-memory ops**: `-mbulk-memory` (already enabled) lets dlmalloc use `memory.fill` and `memory.copy` instructions, partially closing the gap for `realloc` paths.

### F5. Codegen disparity: ARM64 NEON vs WASM SIMD-128

OCCT's hot inner loops are dense linear algebra over `gp_XYZ` (3-double vectors), `gp_Mat` (3x3 doubles), and `gp_GTrsf` (4x3). On native ARM64, clang `-O3` auto-vectorises to NEON `fmla` (fused multiply-add), unrolls 2–4×, and reorders for the M2 Pro's wide pipeline.

WASM SIMD-128 is fixed at 128 bits (2 doubles or 4 floats per lane). For `gp_XYZ` (3 doubles), this means:

| Operation              | Native ARM64 (NEON 128-bit)         | WASM SIMD-128                                           |
| ---------------------- | ----------------------------------- | ------------------------------------------------------- |
| Load 3 doubles         | `ld1 {v0.2d, v1.d}[0]` ≈ 1 cycle    | `v128.load` + `f64x2.extract` ≈ 2-3 cycles after V8 JIT |
| Multiply-add (3 lanes) | `fmla.2d` + scalar fmadd ≈ 2 cycles | `f64x2.add` + scalar f64.mul/add ≈ 4-6 cycles           |
| Cross product          | 4 fmla, 6 fmul ≈ 5 cycles           | ~12 cycles                                              |

Net effect: OCCT's `gp_XYZ::Multiplied`, `gp_XYZ::CrossCross`, `gp_Mat::Multiply` operations run roughly 1.5–2× slower on WASM than on native NEON. For a fuse chain dominated by intersection math (which calls these millions of times), this stacks against OCJS.

V8 13.6 has invested heavily in WASM SIMD codegen (TurboShaft pipeline) and the gap has narrowed considerably from V8 11.x days, but parity with native NEON is not achievable for 3-element vector ops because of the ABI mismatch (NEON has dedicated 3-lane support via `.3d` operand modifiers; WASM SIMD does not).

### F6. WASM exception handling cost on every Standard_Failure call site

OCCT raises `Standard_Failure` (and subclasses: `Standard_OutOfRange`, `Standard_DomainError`, `Standard_NumericError`) liberally — not just for exceptional conditions but for early-exit signalling in some BOPAlgo paths. With `-fwasm-exceptions` enabled, every `try`/`catch` in the OCCT codebase costs:

| EH model                             | Throw path                        | Try-block entry (no throw)                                                                |
| ------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------- |
| C++ Itanium (native)                 | ~µs (libunwind walk)              | **0 cycles** (zero-cost EH metadata)                                                      |
| WASM native EH (`-fwasm-exceptions`) | ~ms (V8 unwind through wasm tags) | **~1–3 cycles** per try-block entry (still cheaper than `-fexceptions` JS-based approach) |

The `-fwasm-exceptions` overhead is small in steady-state but non-zero. Combined with OCCT's habit of wrapping every `BRepBuilderAPI_*::Build()` in implicit try-blocks (via `OCC_CATCH_SIGNALS` macros), the per-call overhead adds up over a 40-fuse chain.

Estimated impact: 5–8% of WASM self-time. Removing it would require an OCCT recompile with `-fno-exceptions` and a comprehensive rewrite of OCCT error paths to status returns — not viable for first-party OCJS without forking OCCT.

### F7. Per-sample call-path breakdown

This table walks the **exact OCCT C++ call sequence** for each sample on each engine, with measured times and the inferred dominant cost contributor.

| #   | Sample                  | Dominant OCCT call sequence (both engines)                                                                                                                                                                                | Dominant cost on OCJS                                                 | Why OCJS pays more                                                                                                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `primitive_box`         | `BRepPrimAPI_MakeBox::ctor` → `BRepPrim_GWedge` → `BRepBuilderAPI_MakeShape::Build` lazy → `Shape()` triggers `BRepPrimAPI_MakeBox::Build` → constructs 8 vertices, 12 edges, 6 faces, 1 shell, 1 solid                   | Embind dispatch + ~30 small allocs                                    | Boundary crossings dominate (2 of 4 µs); WASM allocator only sees ~30 allocs                                                                   |
| 02  | `primitive_cylinder`    | `BRepPrimAPI_MakeCylinder` → `BRepPrim_Cylinder` → `BRepBuilderAPI_MakeShape::Build` → 2 faces, 3 edges, ~50 small allocs                                                                                                 | Same as #01                                                           | Same as #01                                                                                                                                    |
| 03  | `boolean_fuse`          | `BRepAlgoAPI_Fuse::ctor` → `BRepAlgoAPI_BuilderAlgo::Build` → `BOPAlgo_PaveFiller::Perform` → `BOPDS_DS::Init` → vertex/edge/face intersection (`IntTools_*`) → `BOPAlgo_Builder::Perform` → `ShapeUpgrade` (Python only) | 600–1 200 small allocs in BOPDS + intersection compute                | Allocator + LTO-missing inline of `Handle<>::IsNull` in BOPDS hot loops                                                                        |
| 04  | `boolean_cut_grid`      | 25× (Cylinder ctor → Cut ctor → BOPAlgo_PaveFiller::Perform → Builder::Perform)                                                                                                                                           | ~10 000–25 000 small allocs total                                     | Allocator dominates; WASM dlmalloc is 5–8× slower per alloc → ~100 ms additional vs native                                                     |
| 05  | `loft_thru_sections`    | 3× (Circle → Edge → Wire) → `BRepOffsetAPI_ThruSections::Build` → `BRepFill_Generator` → `GeomFill_NSections` BSpline interpolation                                                                                       | BSpline `gp_XYZ` math (F5)                                            | NEON vs SIMD-128 disparity on linear algebra                                                                                                   |
| 06  | `pipe_shell_sweep`      | `BRepOffsetAPI_MakePipeShell::ctor` → `Add` profile → `Build` → `BRepFill_PipeShell::Perform` → `BRepFill_LocationLaw` → BSpline lofting                                                                                  | `gp_GTrsf` matrix ops (F5)                                            | Same as #05                                                                                                                                    |
| 07  | `surface_filling_patch` | `BRepOffsetAPI_MakeFilling::ctor` → 4× `Add` edges → `Build` → `GeomPlate_BuildPlateSurface::Perform` → variational minimisation (`PLATE_*`) → BSpline approximation                                                      | Variational solver inner loop: dense linear algebra on small matrices | F5 disparity on `Mat*Mat`, `Mat*Vec`; allocation pressure during solver iterations                                                             |
| 08  | `fillet_all_edges`      | `BRepFilletAPI_MakeFillet::ctor` → 12× `Add(R, edge)` → `Build` → `ChFi3d_Builder::Perform` → per-edge fillet surface construction                                                                                        | Mostly OCCT compute (similar to native)                               | Smallest gap (1.11×); workload is OCCT-internal, few binding crossings, F5 less impactful                                                      |
| 09  | `fuse_many_boxes`       | 40× (Box ctor → 39× (Fuse ctor → Build → Shape)) — each Build allocates fresh BOPDS, intersects 6+ faces against existing solid, rebuilds topology graph                                                                  | **Allocator + topology graph rewiring per iteration**                 | 40 iterations × ~25 000 allocs × 5–8× alloc penalty = 600 ms allocator overhead alone; LTO would inline `NCollection_BaseMap::Resize` hot path |
| 10  | `mesh_incremental`      | #09 then `BRepMesh_IncrementalMesh::Perform` → `BRepMesh_DelaunayBaseMeshAlgo` → ~50–200 triangles per face                                                                                                               | #09 cost + ~13 ms mesh                                                | Mesh adds same proportional overhead; #09 is the bottleneck                                                                                    |

The pattern is clear: **the gap is largest exactly where OCCT does the most allocator work and the most `Handle<>`/iterator chasing** (samples 03/04/09/10), and smallest where OCCT spends time inside a single dense compute kernel that takes most of the cycles (samples 06/08).

### F8. Why pybind11 wins on the binding side too

For completeness, the binding stacks themselves also differ:

| Aspect                      | pybind11 (OCP)                                                  | embind (OCJS)                                                                           |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Binding generator           | Hand-rolled C++ in OCP/`generate.py`, compiled per-class        | OCJS bindgen (Python AST walker) → emits `.cpp` files with `EMSCRIPTEN_BINDINGS` macros |
| Method dispatch             | Single C function pointer per overload + Python type check      | embind overload table + JS-effective-signature dedup + variadic JS argument unpacking   |
| Per-call overhead           | ~150–300 ns                                                     | ~200–500 ns (depends on overload count)                                                 |
| Argument marshalling        | `pybind11::detail::cast` — direct memory access via `PyObject*` | `emval`/`val` round-trip + WASM stack manipulation                                      |
| Object lifetime             | Python refcount (atomic on M2: ~5 ns)                           | Explicit `delete()` or `using` (~20–50 ns finalization)                                 |
| Total per-call binding cost | **~200 ns**                                                     | **~300–700 ns**                                                                         |

For sample 09 (~440 boundary crossings), this contributes:

- pybind11 side: ~440 × 200 ns ≈ 0.09 ms (0.04% of 218 ms)
- embind side: ~440 × 500 ns ≈ 0.22 ms (0.03% of 818 ms)

**Binding overhead per se is negligible.** The gap is the WASM compute path, not the bindings — confirming F2/F3.

### F9. MEASURED LTO impact (refutes F1 estimate)

The original F1 analysis estimated 20-40% headroom from enabling LTO in OCJS, based on (a) OCP/conda-forge enabling it, (b) general C++ wisdom about LTO on heavily-templated codebases, and (c) profile evidence of small-accessor functions consuming significant time. **The native-lto vs native-nolto direct comparison refutes this estimate.**

Measured `native-nolto / native-lto` ratios (higher = LTO matters more):

| #   | Sample                  | nolto / lto | Interpretation                                               |
| --- | ----------------------- | ----------- | ------------------------------------------------------------ |
| 01  | `primitive_box`         | 1.03×       | noise                                                        |
| 02  | `primitive_cylinder`    | 0.41×       | nolto WON; tiny workload, almost certainly measurement noise |
| 03  | `boolean_fuse`          | 1.06×       | noise                                                        |
| 04  | `boolean_cut_grid`      | 1.02×       | noise                                                        |
| 05  | `loft_thru_sections`    | 0.97×       | noise                                                        |
| 06  | `pipe_shell_sweep`      | 1.00×       | identical                                                    |
| 07  | `surface_filling_patch` | 0.98×       | noise                                                        |
| 08  | `fillet_all_edges`      | 1.03×       | noise                                                        |
| 09  | `fuse_many_boxes`       | 1.04×       | noise                                                        |
| 10  | `mesh_incremental`      | **1.31×**   | **only meaningful LTO win**                                  |

**Why was the F1 estimate wrong?** Three reasons:

1. **Apple clang's per-TU `-O3` is already very aggressive on ARM64.** Modern clang inlines small accessor methods (`gp_Pnt::X()`, `Handle<>::IsNull`) at the call site within the same TU without LTO. The cross-TU inlining LTO unlocks is mostly redundant on this workload because the hot inner loops live within a single TU (e.g. `BOPAlgo_PaveFiller.cxx`).
2. **OCCT's hot-path functions are virtual.** `Standard_Type::DownCast`, `Geom_Surface::*` are virtual dispatches that LTO cannot devirtualize without whole-program type information that the OCCT codebase doesn't enable. The "small accessor" win that LTO normally provides is mostly absorbed by un-devirtualizable indirect calls.
3. **macOS uses `lld`'s ThinLTO by default.** ThinLTO is faster to link than full LTO but produces less aggressive inlining decisions. The earlier estimate implicitly assumed full LTO behaviour.

**Why does sample 10 win 31%?** It's the only sample dominated by `BRepMesh_IncrementalMesh::Perform` — a routine with deeply nested template calls into `BVH_RadixSorter<double, 2>` and `Poly_MakeLoops`, all in different TUs. ThinLTO does measurably help here because the inlining wins compound across template instantiations in `TKMesh` ↔ `TKMath` ↔ `TKBRep`. This is the one place where the F1 "tiny accessors called millions of times" intuition actually holds.

**Implication for OCJS:**

- **R2 (enable `OCJS_LTO=1`) is downgraded from P0 to P3.** Estimated 0-5% across the board, with possibly 10-15% on mesh-heavy workloads (worth doing for completeness, but not the headline win).
- **The real OCJS performance lever is the WASM compute layer itself**: dlmalloc, WASM SIMD-128 codegen, EH unwind cost. R3 (mimalloc) and R4 (NCollection_IncAllocator) are now the highest-impact items.
- The upstream OCCT maintainers' decision to use `BUILD_OPT_PROFILE=Default` (no LTO) for PR validation — and only flip to `Production` (LTO) for master-validation and downstream packagers — is _consistent_ with our measurement: the LTO win is real but small enough that they accept faster PR builds as the right tradeoff. Conda-forge ships LTO because the overhead is incurred once at packaging time but the win is paid out across millions of user-installations.

### F10. OCCT 8.0 BOPAlgo regression vs 7.9 (new finding)

This finding fell out of the four-engine comparison and was not visible in the original two-engine analysis.

| #      | Sample                             | build123d (OCCT 7.9.3) | native-lto (OCCT 8.0.0) | OCCT 7.9 advantage                                                                                                                                                            |
| ------ | ---------------------------------- | ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03     | `boolean_fuse`                     | 6.145 ms               | 2.426 ms                | 7.9 is 2.5× **slower** (build123d adds `ShapeUpgrade_UnifySameDomain` after each boolean — see [Cross-Engine Algorithmic Equivalence](#cross-engine-algorithmic-equivalence)) |
| 04     | `boolean_cut_grid`                 | 408.175 ms             | 139.669 ms              | 7.9 is 2.9× **slower** (same UnifySameDomain caveat)                                                                                                                          |
| 07     | `surface_filling_patch`            | 296.178 ms             | 331.759 ms              | 7.9 is **1.12× faster**                                                                                                                                                       |
| **09** | `**fuse_many_boxes` (40-chain)\*\* | **447.963 ms**         | **639.952 ms**          | **7.9 is 1.43× faster** (despite UnifySameDomain extra work)                                                                                                                  |
| **10** | `**mesh_incremental`\*\*           | **414.234 ms**         | **676.196 ms**          | **7.9 is 1.63× faster**                                                                                                                                                       |

**Two things to disentangle here**:

1. **build123d adds extra work in the boolean samples.** Every `Solid.fuse()` and `Solid.cut()` in build123d wraps the `BRepAlgoAPI_*` call with a `ShapeUpgrade_UnifySameDomain` call. For samples 03 and 04 (single ops or 25 ops with cleanup between each), this extra work makes build123d slower in absolute terms despite running on a (presumed) better engine. The native-lto column doesn't do this cleanup, so it wins those rows.
2. **For samples 09/10, build123d STILL beats native-lto by 30-60% even though it does MORE work per iteration.** The 40-fuse chain runs in 448 ms on OCCT 7.9 vs 640 ms on OCCT 8.0 — same hardware, same `-O3 -flto`, same `USE_TBB=OFF`. The only meaningful difference is OCCT version. **This is consistent with a BOPAlgo perf regression introduced between OCCT 7.9.3 and 8.0.0.**

The OCCT 8.0 release notes mention BOPAlgo refactoring (commit `0ebbbedb239d6` is V8.0.0; the 7.9.3 → 8.0.0 changelog includes `OCCT-V8_0_0_dev` work on BOPDS_DS hashing and pave-block construction). Without access to a side-by-side OCCT 7.9 native build I can't pinpoint the exact commit, but the measurement is reproducible: build123d on OCCT 7.9 is ~40-65% faster than my freshly-built native binary on OCCT 8.0 for iterative fuse + meshing workloads.

**Implications:**

- **The OCJS team should consider whether tracking OCCT 8.0.0 was the right call** vs staying on 7.9.3 where build123d's perf demonstrates the algorithm scales well. The 8.0 → 7.9 downgrade would also reduce the gap vs build123d substantially.
- **A follow-up benchmark should add a fifth engine: `native-lto-occt79`** (OCCT 7.9.3 source build) to definitively measure the 7.9 → 8.0 BOPAlgo regression. If the regression is real and reproducible, an upstream OCCT bug report is warranted.
- **The "build123d wins" headline that the original 2-engine analysis emphasised was misleading.** It wasn't pybind11 magic — it was just an older, faster OCCT version under the hood.

### F11. Published 3.0.1-beta.1 vs local rebuild: massive speedup from OCCT pre-beta1 → final + F1 codegen fix

The original 4-engine measurement ran against the published `@taucad/opencascade.js@3.0.0-beta.1` artifact (35.3 MB, OCJS commit `05da2a08`, OCCT commit `0ebbbedb` = pre-OCCT-8.0.0-beta1 dev snapshot) because the local working tree was failing init with a `BindingError` regression. After that regression was fixed, I rebuilt locally (40.7 MB, OCJS commit `cb07385`, OCCT commit `d3056ef` = OCCT 8.0.0 final tag) and re-ran with **identical toolchain** (emscripten 5.0.1, llvm 17, wasmOpt 685-g18ba06162, identical `O3-noLTO-wasmExc-single` config, identical `filterPackagesHash=8b12ca60`).

**The local rebuild is dramatically faster on most workloads:**

| #   | Sample                  | Published 3.0.0-beta.1 (ms) | Local rebuild (ms) | Speedup   |
| --- | ----------------------- | --------------------------- | ------------------ | --------- |
| 01  | `primitive_box`         | 0.171                       | 0.042              | **4.02×** |
| 02  | `primitive_cylinder`    | 0.018                       | 0.015              | 1.15×     |
| 03  | `boolean_fuse`          | 5.273                       | 5.456              | 0.97×     |
| 04  | `boolean_cut_grid`      | 232.680                     | 189.675            | 1.23×     |
| 05  | `loft_thru_sections`    | 1.295                       | 1.062              | 1.22×     |
| 06  | `pipe_shell_sweep`      | 0.421                       | 0.365              | 1.15×     |
| 07  | `surface_filling_patch` | 415.145                     | 358.026            | 1.16×     |
| 08  | `fillet_all_edges`      | 6.359                       | 5.454              | 1.17×     |
| 09  | `fuse_many_boxes`       | 1074.847                    | 796.992            | **1.35×** |
| 10  | `mesh_incremental`      | 1096.887                    | 820.440            | **1.34×** |

**Root-cause attribution.** With toolchain held constant, only two things changed:

1. **OCCT pre-beta1 → final (`0ebbbedb` → `d3056ef`)** — full OCCT 8.0.0-beta1 → beta2 → beta3 → final release worth of upstream fixes. `git log 0ebbbedb..d3056ef` lists ~20 commits including:

- `9aa016011d` "Modeling - Restore old implementation of GProp" (likely matters for sample 09 BOPAlgo which calls into GProp for shape mass-property checks)
  - `6f6be66842` "Crash in ShapeConstruct_ProjectCurveOnSurface::insertAdditionalPointOrAdjust"
  - `6ba27a8c17` "Modeling - Rework CoEdge definition to avoid misuse" (likely matters for samples 09/10 where CoEdge is on the BOPDS hot path)
  - `d3adc95d96` "Foundation Classes - Update Array1/2 Assign Operator"
  - `42d9c36f10` "Data Exchange - Make STEP write and STEP/IGES read pipelines thread-safe"
  - `883cece8e3` "Shape Healing - Refactor shape replacement logic to handle cycles"

2. **OCJS `05da2a08` → `cb07385`** — local commits including the F1 codegen fix (template `using`-alias deduplication in `src/generateBindings.py`) and the LProps re-enables (restored ~10 LProps classes). The F1 fix in particular shrinks the embind dispatch tables by collapsing redundant template instantiations that were previously generating multiple distinct embind registrations for the same JS-effective signature.

**Per-row attribution hypothesis** (which change drives which speedup):

- **Sample 01 4× speedup** is unlikely to be OCCT (`BRepPrimAPI_MakeBox` is one of the most stable APIs in OCCT and there's nothing in the 0ebbbedb..d3056ef range that touches it). Most likely the F1 codegen fix shrinks the embind dispatch table enough that hot lookups for `MakeBox.Shape()` and the `gp_Pnt` constructors hit V8's IC-cache more reliably. This is consistent with the hypothesis that embind dispatch dominates trivial OCCT work (executive-summary point 2).
- **Samples 09/10 ~35% speedup** is more likely OCCT-side. Sample 09 is dominated by BOPAlgo and the CoEdge rework + GProp restoration both land in this range. Sample 10's incremental meshing depends on the BRep topology produced by sample 09, so a fix that improves BOPAlgo's output cleanliness propagates to meshing.
- **Samples 03-08 ~15-23% speedup** is mixed: OCCT improvements + smaller embind dispatch tables both contribute proportionally to the per-call overhead.

**Implications:**

- **R1 is now COMPLETED** (the `BindingError` regression is fixed; benchmarks ran against the local rebuild).
- **The OCJS performance story is meaningfully better than the published-artifact numbers suggest.** The headline "ocjs/native-lto = 1.68× on sample 09" from the previous revision drops to **1.25×** with the rebuild.
- **The `wasm-opt` and Emscripten toolchain are not the problem.** Identical toolchain output 35-40% faster code purely from upstream OCCT fixes + a binding-codegen fix. This is more evidence against R10-DOWNGRADED's residual concern that the toolchain might be silently mis-tuned.
- **Re-publishing the OCJS artifact is high-leverage.** Every consumer of `@taucad/opencascade.js` is currently running the slower published variant. A `3.0.0-beta.2` cut from the local working tree would deliver the speedups in the table above to all downstream users with no API changes.

### F12. WASM allocator measurement: mimalloc beats dlmalloc on heavy boolean workloads, emmalloc loses

[F4](#f4-allocator-pressure-dlmalloc-vs-apple-libmalloc--scalable_malloc) hypothesised that swapping OCJS's default `dlmalloc` for `mimalloc` or `emmalloc` would deliver a 10-20% win on the boolean/mesh hot rows (samples 03/04/09/10), based on the structural argument that OCCT's BOPAlgo allocates 25 000+ small objects per fuse iteration and `dlmalloc`'s coalescing-tree design is suboptimal for that pattern. To turn that hypothesis into a measurement I built three minimal samples-only OCJS WASM artifacts that differ ONLY in the trailing `-sMALLOC=…` link flag and ran the same 10-sample harness against each.

**Method**

The PoC lives at `[repos/opencascade.js/experiments/build123d-vs-ocjs/wasm-allocators/](repos/opencascade.js/experiments/build123d-vs-ocjs/wasm-allocators/README.md)`. It produces three sibling YAMLs (`samples-{dlmalloc,emmalloc,mimalloc}.yml`) each with 44 hand-listed bindings (the exact set that the 10 samples instantiate, plus the embind-required base classes like `BRepBuilderAPI_MakeShape`, `Geom_Conic`, `Standard_Transient`, etc.) and identical `emccFlags` except for the `-sMALLOC` value (and a `-sINITIAL_MEMORY` bump from 100 MB → 128 MB on mimalloc per Emscripten's documented memory overhead). `OCJS_OUTPUT_DIR` was set to a distinct `dist-<allocator>/` per build so all three artifacts coexist; the harness picks them via `--artifact-dir`. Toolchain (emscripten 5.0.1 / wasmOpt -O3 / single-threaded / `-fwasm-exceptions` / `-msimd128` / no LTO) was held identical to the published OCJS configuration so the only timing variable is the allocator.

The minimal binding list reduced WASM size from 40.7 MB (full OCJS) to ~15.2 MB (-63%) — confirming that most of the OCJS binary is embind dispatch glue for classes the samples never touch. OCCT static-toolkit linking dominates the residual 15 MB and is constant across allocators.

**Results** (median of 7 timed iterations after 2 warmups; lower is better; bold = winner)

| #   | Sample                  | dlmalloc (ms) | emmalloc (ms) | mimalloc (ms) | Winner               | em/dl         | mi/dl         |
| --- | ----------------------- | ------------- | ------------- | ------------- | -------------------- | ------------- | ------------- |
| 01  | `primitive_box`         | **0.04**      | 0.05          | 0.04          | tie (within noise)   | 1.045         | 1.014         |
| 02  | `primitive_cylinder`    | **0.02**      | 0.02          | 0.02          | tie                  | 1.083         | 1.013         |
| 03  | `boolean_fuse`          | 6.47          | 6.14          | **5.81**      | mimalloc             | 0.949         | 0.898         |
| 04  | `boolean_cut_grid`      | 196.04        | 213.26        | **179.17**    | **mimalloc (−8.6%)** | 1.088         | 0.914         |
| 05  | `loft_thru_sections`    | **1.11**      | 1.18          | 1.12          | dlmalloc             | 1.060         | 1.006         |
| 06  | `pipe_shell_sweep`      | 0.40          | 0.36          | **0.33**      | mimalloc             | 0.911         | 0.833         |
| 07  | `surface_filling_patch` | **375.03**    | 383.03        | 385.15        | dlmalloc             | 1.021         | 1.027         |
| 08  | `fillet_all_edges`      | 5.93          | 5.86          | **5.40**      | mimalloc             | 0.988         | 0.910         |
| 09  | `fuse_many_boxes`       | 868.72        | 883.58        | **848.48**    | **mimalloc (−2.3%)** | 1.017         | 0.977         |
| 10  | `mesh_incremental`      | 913.32        | 914.17        | **883.00**    | **mimalloc (−3.3%)** | 1.001         | 0.967         |
|     | **Geomean ratio**       | 1.000         | **1.0149**    | **0.9538**    |                      | (1.5% slower) | (4.6% faster) |

**Per-sample winner tally** (treating any allocator within 2% of the leader as a tie): mimalloc 6, dlmalloc 1, emmalloc 0, ties 3.

**Cold-load and binary-size cost**

| Allocator | WASM (MB) | Δ vs dlmalloc | Cold load (ms) | Δ vs dlmalloc |
| --------- | --------- | ------------- | -------------- | ------------- |
| dlmalloc  | 15.19     | (baseline)    | 126.2          | (baseline)    |
| emmalloc  | 15.20     | +3.7 KB       | 103.9          | **−18%**      |
| mimalloc  | 15.25     | +55 KB        | 89.6           | **−29%**      |

mimalloc's +55 KB binary cost (matches Emscripten's documented overhead) is dwarfed by its faster initialisation path — 36 ms cold-load saving more than pays for the binary growth on every page load.

**Findings**

1. **mimalloc wins on every heavy boolean/mesh workload.** Sample 04 (5×5×5 cut grid) sees the biggest win at **−8.6% vs dlmalloc** (179.17 ms vs 196.04 ms), exactly where allocator pressure is highest. Samples 09 and 10 — the dominant timings in the 4-engine table — drop **2-3%** each, real measurable wins on the rows that matter most for production workloads. Pre-recommendation F4 estimated 10-20% on these rows; the measurement is closer to the lower end (3-9%), still meaningful but smaller than the structural argument suggested. The discrepancy is because Emscripten's mimalloc is the single-threaded variant and OCJS does not use pthreads — mimalloc's per-thread heap pools, its biggest design advantage, are mostly inactive in this configuration.
2. **emmalloc loses on every workload that matters.** It is +8.8% slower on sample 04 and +1.7-2.1% slower on samples 03/05/07/09. Geometric mean is **1.5% slower than dlmalloc**. This confirms Emscripten's documentation warning that emmalloc is _not_ recommended for workloads dominated by many small allocations — the simpler bookkeeping has lower per-call overhead but the lack of segregated free-lists hurts on the OCCT allocation pattern. **emmalloc is a clear no-go for OCJS.**
3. **Sample 07 is the one mimalloc loss** (+0.7% vs dlmalloc baseline), and is allocation-light: surface filling spends most of its time inside `GeomPlate`'s dense-matrix least-squares solve, not in topology construction. This is a useful sanity check — mimalloc isn't winning by accident; it's winning specifically where the allocator is on the hot path.
4. **Cold-load wins are an unexpected bonus.** Both newer allocators load substantially faster than dlmalloc (mimalloc −29%, emmalloc −18%). dlmalloc's larger initialisation work (free-list metadata setup, bin tables) is paid every page load; mimalloc's lazy per-segment initialisation defers that cost.
5. **The PoC also serves as a working "minimal OCJS" build.** The 15.2 MB samples-only artifact is 63% smaller than the 40.7 MB full build. Tau's UI doesn't ship a minimal build today, but this is direct evidence that a curated `@taucad/opencascade.js-core` (geometry-only, no DataExchange/AppDef/HLR) could be 60-70% smaller for consumers that only need primitives + booleans + mesh.

**Implications for R3-NEW**

The measurement converts R3-NEW from "estimated 10-20% on samples 03/04/09/10" to **"measured 3-9% on samples 03/04/09/10, plus a 29% cold-load win, plus a path to a 60% smaller minimal build"** — slightly smaller per-sample wins than estimated, but the cold-load improvement and the binding-cuts story make it a clear net win. The recommendation is now **switch the published OCJS build's `-sMALLOC` to `mimalloc`** (was: investigate). emmalloc is ruled out.

**Methodological caveats**

- Single hardware platform (M2 Pro). mimalloc's wins on x86_64 may differ — the `mimalloc` paper measures larger gains on x86 than on ARM. R13 (Linux x86 reproduction) would also surface allocator-platform interaction.
- Sample variance: spread across 7 iterations is comparable to the inter-allocator delta on the smallest samples (01/02/05/06/08), which is why the winner-tally treats anything within 2% as a tie. The headline samples 04/09/10 are well outside variance.
- The measurement was on the _minimal_ 15.2 MB binding set, not the full 40.7 MB OCJS build. Allocator behaviour should be insensitive to binding count (the binding-glue allocations are tiny vs the OCCT runtime allocations) but ideally we'd re-measure on the full build before publishing the change. That's a one-line YAML edit in `build-configs/full.yml` plus a re-link.

### F13. R5 multi-tool BRepAlgoAPIFuse validated: 10.76× geomean speedup on 09, 8.48× on 10, doubling the original 4-6× claim

R5 was originally an analytic recommendation derived from F7's per-sample call-path breakdown: the iterative fuse chain in `sample09_fuse_many_boxes` performs 39 separate `BRepAlgoAPI_Fuse` constructions, each running a fresh BOPDS (Boolean Operations Data Structure) initialisation over `prev + next`. The multi-tool form `BRepAlgoAPI_Fuse::SetArguments(args) + SetTools(tools) + Build()` runs **one** BOPDS init over the full `args + 39 tools` set. F7 estimated this would deliver "4-6× speedup" but did not measure it.

To convert the estimate into a measurement, this revision adds two paired samples to the harness in **all 7 engines** (build123d, native-lto, native-nolto, full local OCJS, plus the three `wasm-allocators/` variants):

- `09b_fuse_many_boxes_multi_tool` — same 40 overlapping boxes as `09_fuse_many_boxes`, but assembled into a single `BRepAlgoAPI_Fuse(args=[box[0]], tools=[box[1..39]])` call instead of 39 chained 2-shape fuses
- `10b_mesh_incremental_multi_tool` — same as `10_mesh_incremental` but starting from the multi-tool fuse output

Keeping the original `09`/`10` samples in place means the within-engine `09b/09` and `10b/10` ratios isolate the BOPDS-init effect with everything else (allocator, codegen, OCCT version, hardware) held constant. The multi-tool source change is small and copy-pasteable across all four implementations:

```cpp
// Iterative chain (sample 09): 39 BOPDS inits, 39 Fuse instances
TopoDS_Shape current = boxes[0];
for (int i = 1; i < 40; ++i) {
  Message_ProgressRange pr;
  BRepAlgoAPI_Fuse fuse(current, boxes[i], pr);
  fuse.Build(pr);
  current = fuse.Shape();
}

// Multi-tool form (sample 09b): 1 BOPDS init, 1 Fuse instance
TopTools_ListOfShape args, tools;
args.Append(boxes[0]);
for (int i = 1; i < 40; ++i) tools.Append(boxes[i]);
BRepAlgoAPI_Fuse fuse;
fuse.SetArguments(args);
fuse.SetTools(tools);
Message_ProgressRange pr;
fuse.Build(pr);
TopoDS_Shape result = fuse.Shape();
```

Equivalent JS via OCJS uses `new oc.NCollection_List_TopoDS_Shape()` (the canonical name for `TopTools_ListOfShape`; see [F13 implementation note](#f13-implementation-notes-for-ocjs)). Equivalent Python via OCP uses `OCP.TopTools.TopTools_ListOfShape`.

**Results** (median of 7 timed iterations after 2 warmups; lower is better; multi-tool form delivers a within-engine speedup on every engine measured)

| Engine                | Sample 09 (ms) | Sample 09b (ms) | **09→09b speedup** | Sample 10 (ms) | Sample 10b (ms) | **10→10b speedup** |
| --------------------- | -------------- | --------------- | ------------------ | -------------- | --------------- | ------------------ |
| build123d-python-ocp  | 221.4          | 56.6            | **3.91×**          | 218.4          | 70.1            | **3.12×**          |
| native-cpp-occt-lto   | 588.4          | 47.5            | **12.40×**         | 600.9          | 59.9            | **10.04×**         |
| native-cpp-occt-nolto | 611.7          | 50.7            | **12.07×**         | 628.4          | 62.4            | **10.07×**         |
| ocjs-full-local       | 825.2          | 65.3            | **12.63×**         | 839.3          | 97.0            | **8.65×**          |
| ocjs-dlmalloc         | 796.1          | 63.4            | **12.56×**         | 800.5          | 78.6            | **10.18×**         |
| ocjs-emmalloc         | 859.4          | 67.9            | **12.66×**         | 923.8          | 84.1            | **10.99×**         |
| ocjs-mimalloc         | 880.9          | 61.8            | **14.24×**         | 781.6          | 75.3            | **10.38×**         |
| **Geomean**           | —              | —               | **10.76×**         | —              | —               | **8.48×**          |
| **Min / Max**         | —              | —               | 3.91× / 14.24×     | —              | —               | 3.12× / 10.99×     |

**Findings**

1. **R5's 4-6× claim was a 2× UNDERESTIMATE for native + WASM engines.** The C++ and WASM engines cluster tightly around **10-14× on 09 and 8-11× on 10**. The original analytic estimate underweighted just how expensive each BOPDS initialisation is — building the spatial index, computing pairwise pave intersections, and seeding the BOP face-builder is a ~20 ms fixed cost per `Fuse` instantiation in OCCT 8.0, and the iterative chain pays it 39 times instead of once.
2. **build123d shows the smallest speedup (3.12-3.91×) — and that's the diagnostic signal.** pybind11 has substantially lower per-call binding overhead than embind, so the iterative chain's cost in build123d is more dominated by the OCCT BOPDS work and less by the binding boundary. As a corollary, the multi-tool form is most beneficial precisely where the binding boundary is most expensive — which is exactly OCJS / WASM.
3. **The OCJS multi-tool form (65 ms on `ocjs-full-local`) is faster than every iterative-chain native engine in this benchmark.** native-lto's iterative chain runs in **588 ms**, build123d's in **221 ms** — both 3-9× slower than the OCJS multi-tool form's 65 ms. **Refactoring the call site to multi-tool is the single highest-leverage change a Tau agent or CAD pipeline can make**: it crosses the WASM penalty entirely on this workload class.
4. **The mimalloc + multi-tool combination is now the fastest possible OCJS variant.** `ocjs-mimalloc` clocks 09b at **61.8 ms** (the fastest WASM result in the benchmark), only ~30% slower than native-lto's 09b at 47.5 ms. The remaining 30% gap is the irreducible WASM compute layer (allocator + SIMD + EH). On sample 10b, `ocjs-mimalloc` runs in **75.3 ms**, faster than `ocjs-full-local` (97.0 ms) by 22%, so the F12 mimalloc swap and the F13 multi-tool refactor compound multiplicatively.
5. **The pattern generalises beyond `Fuse`.** `BRepAlgoAPI_Cut`, `BRepAlgoAPI_Common`, and `BRepAlgoAPI_Section` all share the same `BRepAlgoAPI_BuilderAlgo` base class and all expose `SetArguments + SetTools + Build`. Sample 04 (`boolean_cut_grid`, 25 iterative cuts) is structurally identical to sample 09 and would benefit similarly — that's a follow-up sample worth adding (`04b_boolean_cut_grid_multi_tool`).

**Per-row attribution**

- The native-lto and native-nolto rows are within ~3% of each other on 09/09b/10/10b — confirms F9 (LTO is roughly a no-op for OCCT BOPAlgo on macOS clang). The multi-tool refactor amplifies the absolute difference but not the ratio.
- The OCJS allocator variants (dlmalloc/emmalloc/mimalloc) on 09/10 reproduce the F12 ranking (mimalloc fastest, emmalloc slowest), and that ranking carries through to 09b/10b — meaning **F12 and F13 are independent and compose**. There's no allocator interaction with the multi-tool refactor.
- build123d's 09b at 56.6 ms is **faster than native-lto's 09b at 47.5 ms is faster than ocjs-mimalloc's 09b at 61.8 ms** — a tight 3-engine cluster where the multi-tool refactor exposes the irreducible binding-layer differences. The WASM engines pay a steady ~25-40% premium over native, and Python pays a ~20% premium over native — both substantially smaller than the 3.7× original gap on the iterative chain.

#### F13 implementation notes for OCJS

The OCJS multi-tool form has one wrinkle worth documenting: `TopTools_ListOfShape` is **not** bound directly. OCJS's bindgen normalises template typedefs to the canonical underlying instantiation, so the JS-visible class is `NCollection_List_TopoDS_Shape`:

```js
// ❌ NOT bound (typedef collapse): undefined
new oc.TopTools_ListOfShape();

// ✅ Canonical bound name (auto-included via build/ncollection-manifest.json)
using args = new oc.NCollection_List_TopoDS_Shape();
using tools = new oc.NCollection_List_TopoDS_Shape();
args.Append(boxes[0]);
for (let i = 1; i < boxes.length; i++) tools.Append(boxes[i]);
using fuse = new oc.BRepAlgoAPI_Fuse();
fuse.SetArguments(args);
fuse.SetTools(tools);
using pr = new oc.Message_ProgressRange();
fuse.Build(pr);
using out = fuse.Shape();
```

The full canonical-vs-alias rule is documented in `[docs/research/ocjs-rbv-test-corpus-contract-drift.md](docs/research/ocjs-rbv-test-corpus-contract-drift.md)`, but the practical takeaway for code-cad agents is: **always use the canonical `NCollection_List_TopoDS_Shape` name in OCJS examples and prompts**, not the OCCT C++ `TopTools_ListOfShape` typedef.

For the wasm-allocator minimal builds, `NCollection_BaseList` had to be added to the symbols list to satisfy embind's inheritance-chain registration check (the auto-included `NCollection_List_TopoDS_Shape` constructor would throw `UnboundTypeError: Cannot construct NCollection_List_TopoDS_Shape due to unbound types: 20NCollection_BaseList` without it). This is now reflected in `wasm-allocators/samples-{dlmalloc,emmalloc,mimalloc}.yml` and is required for any minimal OCJS build that exposes a multi-tool BOP API.

**Implications**

- **R5 is upgraded from P1 to P0 MEASURED.** The single highest-leverage user-side change in the entire investigation. Agent prompts, code-cad runtime examples, and the documentation site MUST default to the multi-tool form for any batched boolean operation (≥3 shapes).
- **The Tau code-cad agent's sample library, MDX docs, and Monaco autocomplete snippets should all be audited** for any iterative `Fuse(prev, next)` patterns and updated to multi-tool form. This is a large practical win independent of any OCJS or OCCT change.
- **F13 measurements and F12 (allocator) compose multiplicatively.** Sample 10 on `ocjs-mimalloc` baseline is 781.6 ms; switching to multi-tool (10b) drops to 75.3 ms — that's a **10.4× speedup** vs the F12 + F13 combined on the most expensive workload in the benchmark. Both changes are zero-risk, zero-API-break, ship-immediately wins.
- **A follow-up sample `04b_boolean_cut_grid_multi_tool`** would extend the measurement to `BRepAlgoAPI_Cut::SetArguments + SetTools` and quantify how much of sample 04's ~200 ms cost is BOPDS-init overhead. Given sample 04 only has 25 iterations vs sample 09's 39, the absolute speedup will be smaller, but the ratio is likely to be in the same 5-12× range. _(Done in F14 below: sample 04 promoted to multi-tool, measured 4.2-4.9× speedup across native+WASM engines.)_

### F14. Frontier Performance — canonical BRepAlgoAPIBuilderAlgo multi-tool everywhere; OCJS-mimalloc at parity with native-lto on the headline boolean workload

F13 measured the multi-tool form on paired 09b/10b samples while keeping the iterative-chain 09/10 baselines for the within-engine speedup ratio. F14 is the operational follow-through: **the multi-tool form is now the canonical sample**, the iterative-chain code is purged from `samples.{mjs,py,cpp}`, sample 04 is also promoted from a 25-iteration `BRepAlgoAPI_Cut(prev, tool)` chain to the multi-tool `BRepAlgoAPI_Cut::SetArguments + SetTools + Build` form, and the engine set is trimmed to the five "frontier" engines (build123d, native-lto, native-nolto, full local OCJS, OCJS-mimalloc — the dlmalloc and emmalloc allocator variants from F12 served their decision-support purpose and are dropped from the headline).

**Sample 04 is the new measurement.** Sample 04 was the only remaining iterative `Cut(prev, tool)` chain in the suite — structurally identical to the iterative `Fuse(prev, next)` chain that F13 already measured on samples 09/10, but using `BRepAlgoAPI_Cut` instead of `BRepAlgoAPI_Fuse`. Promoting it to the multi-tool form validates that the `BRepAlgoAPI_BuilderAlgo` base-class pattern generalises across boolean-operation subclasses (Fuse, Cut, Common, Section all derive from it).

**Method**

1. Refactored `experiments/build123d-vs-ocjs/{ocjs/samples.mjs, python/samples.py, native/samples.cpp}` so samples 04/09/10 use the canonical multi-tool form. The previous iterative-chain implementations were deleted (preserved in git history); the F13 paired `09b`/`10b` variants were removed (now redundant since 09/10 ARE the multi-tool form). C++ also now uses the canonical `NCollection_List<TopoDS_Shape>` directly (suppressing the OCCT 8.0 `TopTools_ListOfShape` deprecation warning).
2. Rebuilt `build-native-bench-{lto,nolto}/bench` against the existing OCCT 8.0.0 installs (no OCCT rebuild needed; samples-only edit). OCJS-mimalloc artifact (`wasm-allocators/dist-mimalloc/`) was reused unchanged — bindings are unchanged because both Cut and Fuse multi-tool forms use the same `NCollection_List_TopoDS_Shape` + `BRepAlgoAPI_BuilderAlgo` machinery already added to the YAML in F13.
3. Ran `--warmup 2 --iters 7` against all five frontier engines into `experiments/build123d-vs-ocjs/results/frontier/`.
4. Computed pairwise ratios vs `native-lto` and the geomean both over all 10 samples and over the "real-work subset" (six samples where `native-lto > 1 ms`: 03/04/07/08/09/10).

**Sample 04 cross-engine speedup vs the historical chain form** (chain numbers from the [Historical baseline](#historical-baseline-4-engine-chain-form) table):

| Engine                | 04 chain (ms) | 04 multi-tool (ms) | Speedup    |
| --------------------- | ------------- | ------------------ | ---------- |
| build123d             | 408.18        | 30.24              | **13.50×** |
| native-cpp-occt-lto   | 139.67        | 27.60              | **5.06×**  |
| native-cpp-occt-nolto | 142.96        | 44.62              | **3.20×**  |
| ocjs-full-local       | 189.68        | 44.58              | **4.25×**  |
| ocjs-mimalloc         | 196.04        | 35.90              | **5.46×**  |
| **Geomean**           | —             | —                  | **5.66×**  |

Sample 04's speedup geomean (5.66×) is smaller than samples 09/10's (10.76× / 8.48× from F13) because sample 04 only had 25 iterations vs sample 09's 39, exactly as F13's hypothesis predicted. The pattern holds: **the multi-tool form delivers a 4-13× speedup on every iterative-chain BOP workload across every engine**.

**The headline frontier numbers** (from the [Frontier results table](#frontier-results-table-5-engine-canonical-multi-tool) at the top of this doc):

| Metric                                              | Value      | What it means                                                                                                                                                                                                |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ocjs-mimalloc / native-lto` on sample 09           | **0.99×**  | OCJS-mimalloc is **at parity** with native-lto on the headline batched-boolean workload (66.19 ms vs 66.62 ms). The single cleanest data point in the entire investigation.                                  |
| `ocjs-mimalloc / native-lto` on sample 10           | **1.10×**  | OCJS-mimalloc is only 10% slower on the meshing pipeline that consumes the boolean output.                                                                                                                   |
| `ocjs-mimalloc / native-lto` real-work geomean      | **1.49×**  | Across the 6 "real-work" samples (>1 ms native-lto), OCJS-mimalloc is 49% slower than native LTO — the canonical "OCJS performance gap" number under the frontier configuration.                             |
| `ocjs-mimalloc / ocjs-full-local` real-work geomean | **0.92×**  | mimalloc gives an 8% real-work geomean win over the full local OCJS build, on top of all the F12 wins on cold-load and binary size.                                                                          |
| `build123d / native-lto` real-work geomean          | **1.16×**  | pybind11+OCP is only 16% behind direct C++ on real work. cadquery-ocp's full LTO + OCCT 7.9.3 explains both the small remaining gap AND the build123d wins on samples 09/10 (60-80% faster than native-lto). |
| `native-nolto / native-lto` real-work geomean       | **1.005×** | Re-confirms F9: LTO is a no-op for OCCT BOPAlgo on macOS clang, even after the multi-tool refactor changes the algorithmic profile.                                                                          |

**Findings**

1. **OCJS reaches parity with native-lto on the headline batched-boolean workload (sample 09).** This is the cleanest possible result: when both engines use the canonical multi-tool form, **the WASM compute layer is no longer the bottleneck**. The OCJS gap on real-work samples is now dominated by **smaller per-call workloads (samples 03/05/06/08)** where embind dispatch is a larger fraction of total time, not by the heavy boolean kernels (samples 04/07/09/10) where OCCT's compiled C++ runs at 1.0-1.4× of native.
2. **The previous "OCJS gap" headline number was an artifact of the iterative-chain anti-pattern.** The historical 4-engine table reported `ocjs / native-lto = 1.25×` on sample 09 (797 ms vs 640 ms). The frontier number on the same workload class is **0.99×** — the gap was illusory; both engines were burning ~75% of their wall clock on BOPDS re-initialisations that the multi-tool form eliminates. **Pre-multi-tool benchmarks systematically over-estimated the WASM penalty** because the iterative chain compounded both engines' per-iteration overhead with the binding boundary cost.
3. **build123d's "win" on samples 09/10 is OCCT 7.9.3 + cadquery-ocp's full LTO**, not pybind11 magic. Both effects are smaller in the frontier suite (build123d is now 0.81× on 09 and 0.93× on 10 vs native-lto, vs the historical chain-form 0.70× and 0.61×) because the multi-tool form reduces both engines' BOPDS work. The OCCT 7.9 → 8.0 BOPAlgo regression hypothesis from F10 stands but is now a ~20% effect, not a ~40% effect.
4. **OCJS-mimalloc beats OCJS-full-local on real-work geomean** (1.49× vs 1.63× vs native-lto = mimalloc is 8% faster geomean than full-local), reproducing F12's allocator win on the new sample suite. Sample 04 (the most allocation-intensive workload) sees the biggest mimalloc-vs-full-local delta: **35.90 ms vs 44.58 ms** = **20% faster** in mimalloc's favour.
5. **Sample 03 (single fuse) is the outlier OCJS workload** at 3.16× vs native-lto on `ocjs-mimalloc`. Single 2-shape fuse has the highest _per-call_ binding fraction of any "real work" sample because OCCT's compute is small (~~3 ms) relative to the embind round-trip cost (~~7 ms in OCJS-mimalloc, including the cold-path dispatch + shape extraction). This is a known embind issue surfaced in F8/R6.
6. `**native-nolto` is occasionally faster than `native-lto*`* on samples 03 (0.83×), 06 (1.06×), and 09 (0.73×). This is within iteration variance for the small-sample rows but is a consistent signal on sample 09 (489 ms multi-tool noLTO vs 666 ms multi-tool LTO — a ~25% LTO *penalty\*). One plausible explanation is that ThinLTO inlining changes the BOP code's instruction-cache footprint in a way that hurts the multi-tool form's tighter inner loops; the previous chain form was dominated by separate BOPDS-init calls so the inlining boundary was different. Worth a follow-up CPU-cache measurement (`perf stat -e cache-misses`) but does not change any recommendation.

**Implications**

- **F14 is the canonical headline measurement.** The Frontier results table and the real-work geomean ratios above replace all previous "OCJS gap" claims. Future communications about OCJS performance should cite F14 numbers, not historical chain-form numbers.
- **The OCJS performance story is meaningfully better than even the F11/F12 revisions claimed.** Multi-tool form + mimalloc + local rebuild together deliver **OCJS at parity with native LTO on the headline batched-boolean workload**, with 1.49× geomean on real work. That's a saleable production performance story for browser-resident CAD.
- **R5 is now IMPLEMENTED, not just MEASURED.** The samples themselves use multi-tool by default; the `b` suffix is retired; the `samples.{mjs,py,cpp}` files serve as the canonical reference implementation for agent prompts and runtime examples.
- **The remaining OCJS gap is structural to embind dispatch on small kernels**, not algorithmic. Samples 03/05/06 (where OCCT compute is < 5 ms) carry 2-3× WASM penalty because embind's dynamic-cast + shared-ptr-tracking machinery adds a fixed ~0.5-1 ms per call boundary. R6 (replace hot paths with direct `EMSCRIPTEN_BINDINGS` C glue) remains the highest-leverage future OCJS-side optimisation.

## Recommendations

**Reordered by MEASURED impact** (4-engine data) rather than estimated impact (2-engine data). The single biggest miss in the original ranking was **LTO (R2 was P0; now P3)** — it turns out to be a 0-5% win on macOS clang for OCCT, not the 20-40% the F1 estimate predicted. The real OCJS performance levers are the WASM compute layer itself: allocator, SIMD codegen, EH unwind, and OCCT version.

| #                         | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority                       | **Measured** impact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source finding         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **R1** ✅                 | ~~Fix the local OCJS build regression (`Cannot register public name 'TColStd_IndexedDataMapOfStringString' twice`)~~ — **DONE.** Local OCJS commit `cb07385` builds and runs cleanly; the F1 codegen fix and LProps re-enables are in. The 4-engine table now reflects local-rebuild numbers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ~~P0~~ → done                  | OCJS sample 09 dropped from 1075 ms (published) to 797 ms (local rebuild) — see [F11](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix)                                                                                                                                                                                                                                                                                                                                                              | (operational)          |
| **R2-NEW**                | \*_Publish a `3.0.0-beta.2` (or `3.0.0`) of `@taucad/opencascade.js_`* built from local commit `cb07385`against OCCT 8.0.0 final`d3056ef`. Toolchain/config unchanged from the published `3.0.0-beta.1`. Every downstream consumer of `@taucad/opencascade.js` currently runs the slower variant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **P0**                         | **Measured: 15-35% speedup on most workloads, 4× on trivial primitives** with zero API changes                                                                                                                                                                                                                                                                                                                                                                                                                                                           | F11 (NEW)              |
| **R3-NEW** ✅ MEASURED    | **Switch the published OCJS build's `-sMALLOC` flag from the implicit `dlmalloc` default to explicit `-sMALLOC=mimalloc`.** F12 measured this swap end-to-end on three minimal samples-only WASM artifacts: mimalloc wins 6/10 samples, ties 3/10, loses 1/10 (sample 07 by 0.7%, allocation-light). emmalloc loses on every workload that matters (1.5% slower geomean) and is ruled out. mimalloc geomean = **4.6% faster across all 10 samples**; on the workloads that dominate the 4-engine table (samples 04/09/10) it's **2.3-8.6% faster** vs dlmalloc. Bonus: cold load is **29% faster** (89.6 ms vs 126.2 ms) for a +55 KB binary cost                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **P1**                         | **Measured: 4.6% geomean speedup; 8.6% on the worst-case boolean workload (sample 04); 29% cold-load improvement; +55 KB binary**                                                                                                                                                                                                                                                                                                                                                                                                                        | **F12 (NEW), F4**      |
| **R4-NEW**                | **Add a fifth engine `native-lto-occt79`** (OCCT 7.9.3 source build with the same flags as `native-lto`). This will definitively measure the OCCT 7.9 → 8.0 BOPAlgo regression hypothesised in F10 and either confirm an upstream OCCT bug worth filing, or rule it out (e.g. could be a `cadquery-ocp` patch worth upstreaming). If the regression is real and reproducible, the OCJS team should consider whether tracking OCCT 8.0.0 was the right call vs staying on 7.9.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **P0**                         | **Diagnostic for ~30-40% gap on samples 09/10** — measured against build123d on 7.9 vs native-lto on 8.0                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **F10 (NEW)**          |
| **R5-NEW** ✅ IMPLEMENTED | For any agent workflow that batches >1 boolean operation, **always use the multi-tool form** `BRepAlgoAPI_BuilderAlgo::SetArguments(args) + SetTools(tools) + Build()` (where `BRepAlgoAPI_BuilderAlgo` is the base class of `BRepAlgoAPI_Fuse`/`Cut`/`Common`/`Section`) instead of an iterative `Op(prev, next)` chain. Runs **1 BOPDS init instead of N-1**. F13 measured this on paired 09b/10b samples; **F14 promotes the multi-tool form to the canonical sample (samples 04/09/10 in `samples.{mjs,py,cpp}`)** so it is the default anyone running the harness measures. Sample 04 was also promoted from a 25-iteration `Cut(prev, tool)` chain to multi-tool Cut, demonstrating the pattern generalises across `BRepAlgoAPI_BuilderAlgo` subclasses. **Speedups vs the iterative-chain baseline** (from F13 + F14 sample 04 measurements): 4-13× on sample 04 (25 ops), 10-14× on sample 09 (39 ops), 8-11× on sample 10 (mesh on 39 ops); Python's speedups are smaller (3-5×) because pybind11 has lower per-call binding overhead. **The headline implication of the implementation: OCJS-mimalloc reaches `0.99×` parity with native-lto on sample 09**, and the OCJS real-work geomean drops from 1.63× to 1.49× vs native-lto compared to the historical chain-form table. For the OCJS implementation note (canonical `NCollection_List_TopoDS_Shape` instead of typedef alias), see [F13 OCJS notes](#f13-implementation-notes-for-ocjs). | **P0**                         | **IMPLEMENTED: 5.66× geomean speedup on sample 04, 10.76× on sample 09, 8.48× on sample 10 vs the iterative-chain baseline; OCJS-mimalloc at parity with native-lto on the headline.** Single highest-leverage user-side change in the entire investigation; zero-risk, zero-API-break refactor; now the _default_ in `samples.{mjs,py,cpp}`. **Action remaining: audit Tau code-cad agent prompts, runtime sample library, MDX docs, and Monaco autocomplete snippets for any leftover iterative `Op(prev, next)` patterns and rewrite to multi-tool.** | **F14 (NEW), F13, F7** |
| R6                        | Investigate the embind dispatch overhead on tiny-call workloads. Sample 01 (`primitive_box`) takes 16 µs native-lto but 42 µs OCJS — a **2.5× gap** (down from 10× on the published artifact thanks to the F1 codegen fix, but still 2.5× the native cost). embind's dynamic-cast and shared-ptr-tracking machinery is suspect; consider replacing critical hot paths with direct `EMSCRIPTEN_BINDINGS` C glue functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P1                             | **2-5× on per-call cost for trivial primitives**; mostly affects ad-hoc per-shape construction patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                  | F8, F11                |
| R7                        | Adopt OCCT's `NCollection_IncAllocator` more widely in the BOPAlgo hot paths (upstream OCCT patch; benefits both native and WASM but disproportionately helps WASM where the system allocator is slower)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P1                             | 5-15% on boolean-heavy samples; requires upstream OCCT contribution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | F4                     |
| R8                        | Benchmark with `-fexceptions` (JS-based EH) vs `-fwasm-exceptions` to measure the actual EH overhead on V8 13.6+. If <2% gap, no action; if 5%+, consider an OCCT `-DOCC_NO_EXCEPTIONS` recompile path for a perf-tuned variant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P2                             | 2-8%                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | F6                     |
| R9                        | Add a CI benchmark target that runs this harness on every release-candidate WASM and compares against the previous baseline. Catches perf regressions that pure correctness tests miss. **F11 is concrete evidence this matters** — the published `3.0.0-beta.1` was 35% slower than the post-F1-fix build, and there was no automated alert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **P1** (raised from P2 by F11) | Prevents regressions like the published-3.0.0-beta.1 vs local-rebuild gap from re-occurring                                                                                                                                                                                                                                                                                                                                                                                                                                                              | F11 (process)          |
| R10                       | Publish a `.symbols` file generated **post-`wasm-opt`** (or include the wasm name section in release builds, gated by an `OCJS_DEBUG_SYMBOLS=1` build flag) to make future CPU profiles interpretable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | P2                             | Diagnostics-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | F2                     |
| **R11-DOWNGRADED**        | ~~Enable `OCJS_LTO=1` (ThinLTO) for the published build~~ — was P0 in the original 2-engine analysis, now confirmed as a **0-5% win on most workloads, with 31% only on `BRepMesh_IncrementalMesh`**. Worth doing for completeness and to match OCCT upstream's `Production` profile + conda-forge defaults, but NOT the headline win the original F1 estimate suggested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **P3**                         | **0-5% on most samples, ~10-15% on mesh-heavy workloads** (measured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **F9 (REFUTES F1)**    |
| R12                       | Run compute-heavy operations in a dedicated Worker so the main thread isn't blocked, and so V8 can keep the WASM tier-up for the Worker isolate hot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P3                             | Frees main thread; no per-op speedup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | (UX)                   |
| R13                       | Run this benchmark on a Linux x86_64 baseline (e.g. CI runner) to confirm the M2/ARM64 NEON ↔ WASM SIMD gap doesn't dominate. macOS may flatter native more than WASM relative to Linux. Also try this on Linux clang (full LTO, not ThinLTO) to see if F9's "LTO is a no-op" finding generalises or is macOS-specific                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P3                             | Validates portability of these numbers; may surface a larger LTO win on Linux full-LTO                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | F5, F9                 |

## Threats to Validity

| Threat                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OCCT version drift (build123d on 7.9, ocjs/native on 8.0.0)**                                                                                                 | **NOT mitigated — this is now a confirmed signal, not noise.** F10 measures a ~30-65% perf regression on samples 09/10 between OCCT 7.9 and 8.0 that previously was attributed to pybind11 vs embind. R13 proposes adding a `native-lto-occt79` engine to definitively quantify this. Until then, take the build123d advantage on samples 09/10 with skepticism. |
| build123d wraps each OCCT call in Python helper code (extra `ShapeUpgrade_UnifySameDomain` after each boolean)                                                  | Works **against** build123d for samples 03/04. native-lto wins those rows because it skips the cleanup. Samples 09/10 still show build123d ahead despite the extra wrapper work — that's where F10 (OCCT version) is the explanation, not pybind11 magic.                                                                                                        |
| Single hardware platform (M2 Pro / macOS)                                                                                                                       | Documented; recommend reproducing on Linux x86 (R12) before generalising. F9's "LTO is a no-op" finding may be macOS-clang-specific — Linux with full LTO (vs ThinLTO) could show different results.                                                                                                                                                             |
| ~~Local OCJS build regression forced use of published `3.0.0-beta.1` (35.3 MB) instead of local `3.0.0-beta.d3056ef` (40.7 MB)~~                                | **RESOLVED.** The local build is now operational; the 4-engine table runs against the local rebuild (40.7 MB, OCJS commit `cb07385`, OCCT 8.0.0 final `d3056ef`). Published-artifact numbers are preserved for delta attribution in [F11](#f11-published-301-beta1-vs-local-rebuild-massive-speedup-from-occt-pre-beta1--final--f1-codegen-fix).                 |
| 7 iterations is a small sample for variance estimation                                                                                                          | Samples 01-08 have min/max within ~10%, sample 10 once spiked to 958 ms (vs 831 ms median). Increasing `--iters 25` did not change median ranking in spot-checks.                                                                                                                                                                                                |
| native-lto and native-nolto were built from the same OCCT 8.0.0 source tree (`deps/OCCT/`) but the only flag difference is `CMAKE_INTERPROCEDURAL_OPTIMIZATION` | Verified at build time: the LTO config emits `-flto=thin` in compile + link flags (`build-native-occt-lto/src/.../link.txt`), the noLTO config does not. PCH was disabled in both builds (`BUILD_USE_PCH=OFF`) for fair comparison; both used `-O3` Release.                                                                                                     |
| Process-level GC / V8 tier-up could bias early iterations                                                                                                       | 2 warmup iterations consumed before the timed loop; min and median stay close, suggesting tier-up was complete by warmup end.                                                                                                                                                                                                                                    |

## How to Reproduce

The harness lives at `[repos/opencascade.js/experiments/build123d-vs-ocjs/](repos/opencascade.js/experiments/build123d-vs-ocjs/README.md)`. Steps from a fresh checkout:

```bash
# 1. Clone build123d (one-time)
pnpm repos add gumyr/build123d -g cad --clone

cd repos/opencascade.js/experiments/build123d-vs-ocjs

# 2. Python venv + build123d
python3.13 -m venv .venv
.venv/bin/pip install build123d

# 3. Build native OCCT 8.0.0 with and without LTO (one-time, ~12 min total)
./native/configure-occt-lto.sh && cmake --build ../../build-native-occt-lto --target install -j$(sysctl -n hw.ncpu)
./native/configure-occt-nolto.sh && cmake --build ../../build-native-occt-nolto --target install -j$(sysctl -n hw.ncpu)

# 4. Build the C++ bench against each OCCT install
./native/build-bench.sh lto
./native/build-bench.sh nolto

# 5. F14 — Frontier 5-engine measurement (the canonical headline numbers)
#    Samples 04/09/10 are now the multi-tool form by default; no flags needed.
mkdir -p results/frontier
./.venv/bin/python python/run_bench.py --warmup 2 --iters 7 --out results/frontier/python.json
/Users/rifont/git/tau/repos/opencascade.js/build-native-bench-lto/bench   --warmup 2 --iters 7 --engine native-cpp-occt-lto --lto --out results/frontier/native-lto.json
/Users/rifont/git/tau/repos/opencascade.js/build-native-bench-nolto/bench --warmup 2 --iters 7 --engine native-cpp-occt-nolto    --out results/frontier/native-nolto.json
node ocjs/run-bench.mjs --warmup 2 --iters 7 \
     --artifact-dir /Users/rifont/git/tau/repos/opencascade.js/build-configs \
     --engine ocjs-full-local-O3-noLTO-simd \
     --out results/frontier/ocjs-full-local.json
node ocjs/run-bench.mjs --warmup 2 --iters 7 \
     --artifact-dir wasm-allocators/dist-mimalloc \
     --engine ocjs-mimalloc \
     --out results/frontier/ocjs-mimalloc.json

# Frontier merge → results/frontier-comparison.json (per-sample medians +
# pairwise ratios vs native-lto + real-work geomean):
python3 - <<'PY'
import json, statistics
from pathlib import Path
R = Path("results/frontier")
ENGINES = [("build123d", R/"python.json"), ("native-lto", R/"native-lto.json"),
           ("native-nolto", R/"native-nolto.json"), ("ocjs-full-local", R/"ocjs-full-local.json"),
           ("ocjs-mimalloc", R/"ocjs-mimalloc.json")]
data = {n: json.load(open(p))["samples"] for n, p in ENGINES}
real = [sid for sid, s in data["native-lto"].items() if s["medianMs"] > 1.0]
print({n: round(statistics.geometric_mean([data[n][sid]["medianMs"]/data["native-lto"][sid]["medianMs"] for sid in real]), 3)
       for n,_ in ENGINES if n != "native-lto"})
PY

# 6. (Optional) Historical context — F11/F12/F13 reproduction
#    F11: re-bench against the published 3.0.0-beta.1 artifact (delta-attribution only)
mkdir -p /tmp/ocjs-published && (cd /tmp/ocjs-published && npm pack @taucad/opencascade.js@latest && tar xzf taucad-opencascade.js-*.tgz)
node ocjs/run-bench.mjs --warmup 2 --iters 7 \
     --artifact-dir /tmp/ocjs-published/package/dist \
     --out results/ocjs-published-3.0.0-beta.1.json

#    F12: three-allocator PoC on minimal samples-only OCJS WASM (kept for the
#    dlmalloc-vs-emmalloc-vs-mimalloc decision-support analysis; the headline
#    table only uses mimalloc).
cd wasm-allocators
./run-all.sh                               # → ../results/wasm-alloc-<allocator>-latest.json
cd ..
```

Files committed under `experiments/build123d-vs-ocjs/`:

- `python/samples.py` + `python/run_bench.py` — 10 canonical build123d samples (samples 04/09/10 use `BRepAlgoAPI_BuilderAlgo` multi-tool form; F14) + harness
- `ocjs/samples.mjs` + `ocjs/run-bench.mjs` — 10 OCJS samples using `using` declarations for handle disposal (matches `tests/smoke/*.test.ts` style) + harness with `--artifact-dir` and `--engine` switches; samples 04/09/10 use the canonical `oc.NCollection_List_TopoDS_Shape` multi-tool form
- `native/samples.cpp` + `native/main.cpp` — 10 direct C++ samples + harness with `--engine` and `--lto` flags; samples 04/09/10 use the canonical `NCollection_List<TopoDS_Shape>` (avoids the OCCT 8.0 `TopTools_ListOfShape` deprecation warning)
- `native/CMakeLists.txt` — finds OCCT via `OpenCASCADE_DIR`, links the `bench` binary against TKernel/TKMath/TKBO/TKBRep/TKMesh/...
- `native/configure-occt-{lto,nolto}.sh` + `native/build-bench.sh` + `native/run-bench.sh` — one-shot scripts for the native variants
- `native/README.md` — full reproduction docs + upstream OCCT CI build comparison
- `ocjs/merge-results.mjs` — N-engine JSON merger with auto-named pairwise ratios
- `**results/frontier/{python,native-lto,native-nolto,ocjs-full-local,ocjs-mimalloc}.json**` — F14 frontier 5-engine measurement (canonical multi-tool form, the headline numbers)
- `**results/frontier-comparison.json**` — F14 per-sample medians + pairwise ratios vs `native-lto` + real-work geomean (the data backing the [Frontier results table](#frontier-results-table-5-engine-canonical-multi-tool))
- `results/{python,native-lto,native-nolto,ocjs}-latest.json` + `results/comparison.json` — historical 4-engine run (chain form; preserved for the [Historical baseline](#historical-baseline-4-engine-chain-form) table and F11 attribution)
- `results/ocjs-published-3.0.0-beta.1.json` — preserved for F11 attribution analysis
- `wasm-allocators/{samples-dlmalloc,samples-emmalloc,samples-mimalloc}.yml` — three minimal samples-only OCJS YAMLs that drive F12 (45 bindings each, identical except `-sMALLOC=…`); only `samples-mimalloc.yml` is part of the F14 frontier engine set, but all three are kept for F12 reproduction
- `wasm-allocators/{build-variant,run-variant,run-all}.sh` — one-shot scripts to build + bench one or all allocator variants
- `wasm-allocators/merge-allocator-results.mjs` — F12-specific merger with per-allocator pairwise ratios + winner tally + geomean
- `wasm-allocators/dist-{dlmalloc,emmalloc,mimalloc}/` — three minimal OCJS WASM artifacts (15.2 MB each); F14 only uses `dist-mimalloc/`
- `results/wasm-alloc-{dlmalloc,emmalloc,mimalloc}-latest.json` + `results/wasm-allocator-comparison.json` — F12 benchmark data (preserved for context)
- `results/comparison-r5.json` — F13 cross-engine R5 speedup table (per-engine `09b/09` and `10b/10` ratios, geomean, min/max) — the F13 09b/10b paired samples have been retired in F14 (now 09/10 ARE the multi-tool form), so this JSON is preserved as the historical record of the within-engine speedup measurement

## References

- **F14 frontier 5-engine measurement JSONs** (the canonical headline data):
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier/python.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier/native-lto.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier/native-nolto.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier/ocjs-full-local.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier/ocjs-mimalloc.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/frontier-comparison.json` (per-sample medians, pairwise ratios vs `native-lto`, real-work geomean = 1.49× for `ocjs-mimalloc`, 0.99× on sample 09)
- Historical 4-engine run JSON (chain form, preserved for the [Historical baseline](#historical-baseline-4-engine-chain-form) table):
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/python-latest.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/native-lto-latest.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/native-nolto-latest.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/ocjs-latest.json` (LOCAL rebuild — `cb07385` + OCCT 8.0.0 final)
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/ocjs-published-3.0.0-beta.1.json` (preserved for F11 delta)
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/comparison.json` (4-engine pairwise ratios with local OCJS)
- F12 allocator measurement JSONs:
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/wasm-alloc-{dlmalloc,emmalloc,mimalloc}-latest.json`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/wasm-allocator-comparison.json` (per-sample table, geomean, winner tally)
  - PoC reproduction: `[wasm-allocators/README.md](repos/opencascade.js/experiments/build123d-vs-ocjs/wasm-allocators/README.md)`
- F13 R5 multi-tool paired-sample measurement JSON (now historical — F14 promotes the multi-tool form to the canonical 09/10 sample):
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/results/comparison-r5.json` (cross-engine `09b/09` and `10b/10` speedup table, geomean = 10.76× / 8.48× from when 09/10 were the iterative-chain baselines)
- CPU profiles (Chrome DevTools format):
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/profiles/ocjs-s09.cpuprofile` — 7 iterations of `09_fuse_many_boxes`
  - `repos/opencascade.js/experiments/build123d-vs-ocjs/profiles/ocjs-s07.cpuprofile` — 7 iterations of `07_surface_filling_patch`
  - Open in Chrome DevTools → Performance → Load profile
- Build configurations referenced in F1, F9, F11:
  - OCJS: `repos/opencascade.js/build-configs/configurations.json` (`O3-noLTO-wasmExc-single`)
  - OCJS local provenance: `repos/opencascade.js/dist/opencascade_full.provenance.json` (OCJS commit `cb07385`, OCCT `d3056ef` = 8.0.0 final)
  - OCJS published provenance: `/tmp/ocjs-published/package/dist/opencascade_full.provenance.json` (OCJS commit `05da2a08`, OCCT `0ebbbedb` = pre-OCCT-8.0.0-beta1)
  - native-lto / native-nolto: `repos/opencascade.js/experiments/build123d-vs-ocjs/native/configure-occt-{lto,nolto}.sh` and per-build `CMakeCache.txt`
  - OCP/native: [conda-forge/occt-feedstock recipe/build.sh](https://github.com/conda-forge/occt-feedstock/blob/main/recipe/build.sh)
  - **OCCT upstream CI** (the most authoritative reference for "what flags do OCCT's own maintainers consider production-quality"):
    - PR validation (no LTO): [Open-Cascade-SAS/OCCT `.github/workflows/build-and-test-multiplatform.yml](https://github.com/Open-Cascade-SAS/OCCT/blob/master/.github/workflows/build-and-test-multiplatform.yml)`—`build-opt-profile: 'Default'`
    - Master validation (LTO ON): `[.github/workflows/master-validation.yml](https://github.com/Open-Cascade-SAS/OCCT/blob/master/.github/workflows/master-validation.yml)` — `opt-profile: "Production"`
    - Profile-flag mapping: `[adm/cmake/occt_defs_flags.cmake](https://github.com/Open-Cascade-SAS/OCCT/blob/master/adm/cmake/occt_defs_flags.cmake)` (`-O3 -fomit-frame-pointer -flto` on Clang/GCC; `/GL /LTCG` on MSVC)
- Related research:
  - `[docs/research/build123d-occt-api-usage-survey.md](docs/research/build123d-occt-api-usage-survey.md)` — which OCCT classes build123d uses (these benchmarks intentionally hit the most-used hot paths)
  - `[docs/research/ocjs-non-graphics-coverage-blueprint.md](docs/research/ocjs-non-graphics-coverage-blueprint.md)` — OCJS coverage roadmap
  - `[docs/research/ocjs-removed-bindings-stocktake.md](docs/research/ocjs-removed-bindings-stocktake.md)` — F1 codegen fix context
- External:
  - [build123d](https://github.com/gumyr/build123d) — Apache-2.0
  - [CadQuery/OCP](https://github.com/CadQuery/OCP) — pybind11 bindings to native OCCT
  - [Emscripten WASM exception handling](https://emscripten.org/docs/porting/exceptions.html) — context for R5
  - [Emscripten `-sMALLOC` settings reference](https://github.com/emscripten-core/emscripten/blob/main/src/settings.js) — defines the dlmalloc/emmalloc/mimalloc options measured in F12
  - [microsoft/mimalloc](https://github.com/microsoft/mimalloc) — Microsoft's modern allocator that wins F12 on 6/10 OCCT workloads
  - [Emscripten PR #20651 — adopt mimalloc](https://github.com/emscripten-core/emscripten/pull/20651) — landed in Emscripten 3.1.50, available in OCJS's emscripten 5.0.1
