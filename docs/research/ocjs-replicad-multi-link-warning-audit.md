---
title: 'OCJS replicad multi-threaded link warning audit'
description: 'Catalog of every warning emitted by `link custom_build_multi.yml` against `ocjs:multi-threaded-local` and the docs / opencascade.js / replicad YAML changes required to extinguish each one — headlined by the 858 `unknown` rewrites in the .d.ts.'
status: active
created: '2026-05-27'
updated: '2026-05-27'
category: audit
related:
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-validation-manifest-consultation-audit.md
---

> **Follow-up.** R4's `validate-build.py` false-positive cluster — discovered while implementing the post-link validation step here — was the trigger for [`docs/research/ocjs-validation-manifest-consultation-audit.md`](./ocjs-validation-manifest-consultation-audit.md), which generalised the gap into 11 manifest-consultation recommendations (V1–V11) all now shipped. The `manifest_registry` module + producer-side `additional-bind-symbols.json` introduced there is the canonical follow-up that closed the split-brain validation layer for every variant, not just replicad's.

# OCJS replicad multi-threaded link warning audit

Audit of every warning surfaced during the first replicad `link custom_build_multi.yml` run against the freshly built `ocjs:multi-threaded-local` image (~60-min final-multi cold build, replicad 268-symbol YAML, 35-lib CMake static set). Findings cover the link step's diagnostics, the codegen filter gap that produced 858 `unknown` rewrites in `replicad_multi.d.ts`, and a one-line build-banner regression. Each finding is anchored to a source line, root-caused, and accompanied by a prioritised remediation that may touch any of: `docs-site/`, `repos/opencascade.js/`, `repos/replicad/packages/replicad-opencascadejs/build-config/`.

## Executive Summary

The multi-threaded link produced a working `replicad_multi.{wasm,js,d.ts}` triple (20.6 MB / 6.63 MB gzipped, 64.9 KB JS, 1475.9 KB types) in 204 s. Ten distinct warnings were emitted; nine are cosmetic / known-emscripten-quirks (or replicad YAML hygiene), but **W10 is a real type-quality regression** — the `replicad_multi.d.ts` ships with 858 method signatures rewritten to `unknown` because `_compute_yaml_class_scope` does not lift every class referenced by an in-scope class's method signatures into the YAML class scope. The yaml_build.py error message already names the fix verbatim.

**Headline counts**:

- **10 distinct warnings** during the link step
- **5 are upstream-emscripten / OCCT noise** (W3, W4, W5, W6, W7, W8 — informational, no action required)
- **2 are replicad YAML hygiene** (W4, W5 — drop `Standard_False`/`Standard_Integer` in wrappers, swap deprecated `NCollection_Vector` / `TColStd_IndexedDataMapOfStringString`)
- **2 are OCJS framework gaps** (W2: `-stdlib=libc++` leak into additionalBindCode; W9: `mallinfo` undefined-symbol noise — `allowedUndefinedSymbols` should suppress it)
- **1 is a UX banner regression** (W1: "Loading configuration: single-threaded" on cached `apply-patches`/`pch` steps under a multi-threaded link)
- **1 is a real correctness gap** (W10: 858 `unknown` rewrites; action is the named extension to `_compute_yaml_class_scope`)

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding W1: cached subtasks report `Loading configuration: single-threaded` under MT link](#finding-w1-cached-subtasks-report-loading-configuration-single-threaded-under-mt-link)
  - [Finding W2: `-stdlib=libc++` leaks into additionalBindCode compilation (C compile of a C++ flag)](#finding-w2--stdliblibc-leaks-into-additionalbindcode-compilation)
  - [Finding W3: OCCT 8.0.0 deprecation: `NCollection_Vector.hxx` → `NCollection_DynamicArray.hxx`](#finding-w3-occt-800-deprecation-ncollection_vectorhxx--ncollection_dynamicarrayhxx)
  - [Finding W4: OCCT 8.0.0 deprecation: `Standard_False`, `Standard_Integer` in replicad wrappers](#finding-w4-occt-800-deprecation-standard_false-standard_integer-in-replicad-wrappers)
  - [Finding W5: OCCT 8.0.0 deprecation: `TColStd_IndexedDataMapOfStringString.hxx`](#finding-w5-occt-800-deprecation-tcolstd_indexeddatamapofstringstringhxx)
  - [Finding W6: 10 of 226 requested bindings have no compiled `.o` file (NCollection typedef aliases)](#finding-w6-10-of-226-requested-bindings-have-no-compiled-o-file-ncollection-typedef-aliases)
  - [Finding W7: `-pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly`](#finding-w7--pthread--allow_memory_growth-may-run-non-wasm-code-slowly)
  - [Finding W8: `wasm-opt` 0.1% reduction on the multi-threaded build](#finding-w8-wasm-opt-01-reduction-on-the-multi-threaded-build)
  - [Finding W9: undefined symbol `mallinfo` (mimalloc + emscripten `library_sigs.js` gap)](#finding-w9-undefined-symbol-mallinfo-mimalloc--emscripten-library_sigsjs-gap)
  - [Finding W10: **858 `unknown` rewrites in `.d.ts` — `_compute_yaml_class_scope` does not lift method-signature classes**](#finding-w10-858-unknown-rewrites-in-dts--_compute_yaml_class_scope-does-not-lift-method-signature-classes)
- [Recommendations](#recommendations)
- [Surface Impact Matrix](#surface-impact-matrix)
- [References](#references)
- [Appendix A: full warning quotations](#appendix-a-full-warning-quotations)
- [Appendix B: Resizable memory + pthread mitigation state-of-the-art (May 2026)](#appendix-b-resizable-memory--pthread-mitigation-state-of-the-art-may-2026)

## Problem Statement

A replicad multi-threaded build (`replicad_multi.{wasm,js,d.ts}`) was linked for the first time against `ocjs:multi-threaded-local` via `link custom_build_multi.yml`. The resulting artifacts are runtime-functional, but the link emitted **ten distinct warning lines** (some recurring 5–8 times). Most are upstream emscripten/OCCT chatter, but the build trailer explicitly flagged a fail-loud-gate that fired in warn mode:

```
=== OCJS_STRICT_TYPES WARNING: missing types in .d.ts ===
  rewrites to 'unknown': 858 (budget: 0)
  ...
  Action: extend `_compute_yaml_class_scope` in ocjs_bindgen.link.yaml_build to include every class referenced by an in-scope class's method signatures.
```

Shipping a `.d.ts` with 858 `unknown` method signatures is a real type-quality regression for replicad consumers — every affected method downgrades to `(): unknown` / `(arg: unknown) => void`, losing TS auto-complete, parameter validation, and refactor safety. This audit catalogs every warning surfaced (so none is lost in subsequent triage) and recommends concrete fixes spanning the three doc/code surfaces the user named.

## Methodology

1. Built `ocjs:multi-threaded-local` end-to-end (linux/arm64, `--target final-multi`, ~60 min cold).
2. Ran `link custom_build_multi.yml` from `~/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/` (the YAML duplicates `custom_build_single.yml` plus the pthread flag block + drops `-sEVAL_CTORS=2`).
3. Captured the full transcript to `replicad-multi-link.log` (16,403 lines).
4. Extracted every line containing `warning` (case-insensitive), `WARNING:`, `deprecated`, `Diagnostic`, or `=== OCJS_`.
5. Cross-referenced each warning against:
   - `repos/opencascade.js/src/ocjs_bindgen/**` (Python codegen + link driver)
   - `repos/opencascade.js/build-wasm.sh` (compile/link shell driver)
   - `repos/opencascade.js/docs-site/content/docs/**` (docs surface)
   - `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/*.cpp` (replicad custom code)
6. For W10 specifically, traced `_compute_yaml_class_scope` (`yaml_build.py:370–450`) and `_filter_auto_symbols_by_scope` (same file, `:453–511`) to understand what reachability lift is currently performed and what is missing.

## Findings

### Finding W1: cached subtasks report `Loading configuration: single-threaded` under MT link

**Evidence** (`replicad-multi-link.log:38`, recurs at L122, L196):

```
> nx run ocjs:apply-patches  [local cache]
> ./build-wasm.sh apply-patches
Loading configuration: single-threaded
...
║  THREADING:     single-threaded ║
║  OCJS_CONFIG:   single-threaded ║
```

This banner was emitted three times while `ocjs:link` was running with `OCJS_CONFIG=multi-threaded`. The container's later "Build Complete" banners (L16259, L16283) correctly say `Config: multi-threaded` — only the cached, threading-agnostic upstream tasks (`apply-patches`, `pch`, `generate`) are misreported.

**Root cause**: `build-wasm.sh` defaults `OCJS_CONFIG` to `single-threaded` (`OCJS_CONFIG="${OCJS_CONFIG:-single-threaded}"`, [build-wasm.sh:?](repos/opencascade.js/build-wasm.sh)) when the subtask spawns. Nx-driven subtasks (`apply-patches`, `pch`, `generate`) don't need a threading config — they patch OCCT sources / build the PCH / generate `.cpp` fragments, none of which depends on `THREADING` — so the banner default is harmless to correctness but visually contradicts the umbrella `OCJS_CONFIG=multi-threaded`.

**Impact**: Low (cosmetic). Confuses first-time consumers who scan the log for "did this actually build multi-threaded?".

**Fix surfaces**: `repos/opencascade.js/build-wasm.sh` (suppress the banner for `apply-patches`/`pch`/`generate`, or inherit `OCJS_CONFIG` from the parent Nx process env via the Nx target).

---

### Finding W2: `-stdlib=libc++` leaks into additionalBindCode compilation

**Evidence** (`replicad-multi-link.log:16290`):

```
Diagnostic Messages:
  warning: argument unused during compilation: '-stdlib=libc++' [-Wunused-command-line-argument]
```

**Root cause**: `repos/opencascade.js/src/ocjs_bindgen/ast/parse.py:37` passes `-stdlib=libc++` to `clang.cindex.Index.parse` (correct — that's a C++ flag for libclang AST parsing). The flag then escapes into the diagnostic-message channel libclang surfaces during `additionalBindCode` parsing — but emscripten/clang processes additionalBindCode `.cpp` files as C++ already (via the `-x c++` driver flag), so `-stdlib=libc++` is a no-op duplicate, which clang warns about under `-Wunused-command-line-argument`.

**Impact**: Very low (informational). The warning is correct: the flag is unused (libclang only honours it during the AST parse, not during the emcc compile that's currently logging).

**Fix surfaces**:

- `repos/opencascade.js/src/ocjs_bindgen/codegen/discover.py` / wherever diagnostic-message capture happens — filter `-stdlib=libc++` `[-Wunused-command-line-argument]` from the rebroadcast.
- OR pre-emptively pair the `-stdlib=libc++` ingest with a quieter `-Wno-unused-command-line-argument` in `parse.py:34–50` so libclang stops rebroadcasting it as a parse diagnostic.

---

### Finding W3: OCCT 8.0.0 deprecation: `NCollection_Vector.hxx` → `NCollection_DynamicArray.hxx`

**Evidence** (`replicad-multi-link.log:16291`):

```
/occt/src/FoundationClasses/TKernel/NCollection/NCollection_Vector.hxx:22:1: warning: NCollection_Vector.hxx is deprecated since OCCT 8.0.0. Use NCollection_DynamicArray.hxx directly. [-W#pragma-messages]
```

**Root cause**: `NCollection_Vector` is a typedef-thin wrapper that OCCT 8.0.0 deprecated in favour of the underlying `NCollection_DynamicArray`. Some include in the OCCT tree (or one of the replicad wrapper `.cpp` files) still pulls the deprecated header.

**Impact**: Low (informational). The deprecated header still compiles; the warning fires once per TU that includes it.

**Fix surfaces**:

- Upstream OCCT — out of scope for OCJS.
- `repos/opencascade.js/src/ocjs_bindgen/`: the PCH generator (`scripts/pch.py` or similar) could rewrite this include or filter the warning.
- `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/*.cpp`: audit each wrapper for direct `#include <NCollection_Vector.hxx>` and migrate.

---

### Finding W4: OCCT 8.0.0 deprecation: `Standard_False`, `Standard_Integer` in replicad wrappers

**Evidence** (`replicad-multi-link.log:16292–16298`):

```
myMain.h:4701:55: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
myMain.h:4701:89: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
myMain.h:4783:34: warning: 'Standard_Integer' is deprecated: Standard_Integer is deprecated, use int directly [-Wdeprecated-declarations]
myMain.h:4951:29: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
myMain.h:4952:55: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
myMain.h:4952:89: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
myMain.h:5026:48: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]
```

**Root cause**: `myMain.h` is the concatenated OCCT-include header that bindgen builds at PCH time; lines 4701 / 4783 / 4951 / 4952 / 5026 fall inside the replicad wrapper region (additionalCppCode + additionalCppFiles). The replicad wrappers were authored against OCCT 7.x where `Standard_False` (= `false`) and `Standard_Integer` (= `int`) were the idiomatic spellings; OCCT 8.0.0 deprecated both in favour of native C++ types.

**Impact**: Low (informational). Code still compiles; OCJS already ships native WASM exceptions and OCCT 8.0.0 elsewhere, so the wrappers are the last hold-outs.

**Fix surfaces**:

- `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/{brep-io,edge-mesh-extractor,geom2d-io,mesh-extractor,shape-hasher}.cpp`: search for `Standard_False`, `Standard_True`, `Standard_Integer`, `Standard_Real`, `Standard_Boolean`, etc., and substitute the native C++ spelling per the OCCT 8 deprecation guidance (`false`, `true`, `int`, `double`, `bool`, …).
- `docs/research/ocjs-replicad-multi-link-warning-audit.md` (this doc) and the replicad fork's `docs/occt-v8-migration.md` should call this hygiene pass out as part of the V8 migration TODO.

---

### Finding W5: OCCT 8.0.0 deprecation: `TColStd_IndexedDataMapOfStringString.hxx`

**Evidence** (`replicad-multi-link.log:16335–16351`):

```
In file included from /opencascade.js/build/additionalBindCode/replicad_multi.js.cpp:11:
/opencascade.js/build/occt-includes/TColStd_IndexedDataMapOfStringString.hxx:27:1: warning: TColStd_IndexedDataMapOfStringString.hxx is deprecated since OCCT 8.0.0. Use NCollection_IndexedDataMap<TCollection_AsciiString, TCollection_AsciiString> directly. [-W#pragma-messages]
```

**Root cause**: Same family as W3 — the typedef-thin alias `TColStd_IndexedDataMapOfStringString` was deprecated in OCCT 8.0.0 in favour of the underlying `NCollection_IndexedDataMap<…>` template instantiation. The header is still emitted into `occt-includes/` (PCH path) and pulled by the additionalBindCode-stage compile of `replicad_multi.js.cpp`.

**Impact**: Low (informational). Same as W3.

**Fix surfaces**:

- `repos/opencascade.js`: the PCH-include filter could deprecate the alias header.
- `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/*.cpp` — search for `#include <TColStd_IndexedDataMapOfStringString.hxx>` and replace with the underlying NCollection template spelling, OR drop the include entirely if it's not referenced.

---

### Finding W6: 10 of 226 requested bindings have no compiled `.o` file (NCollection typedef aliases)

**Evidence** (`replicad-multi-link.log:16322–16333`):

```
WARNING: 10 of 226 requested bindings have no compiled .o file:
  - Poly_Array1OfTriangle
  - TColStd_Array1OfBoolean
  - TColStd_Array1OfInteger
  - TColStd_Array1OfReal
  - TColgp_Array1OfDir
  - TColgp_Array1OfPnt
  - TColgp_Array1OfPnt2d
  - TColgp_Array1OfVec
  - TColgp_Array2OfPnt
  - TopTools_ListOfShape
All bindings verified.
```

**Root cause**: Every entry is an NCollection typedef alias (`NCollection_Array1<gp_Pnt> ≡ TColgp_Array1OfPnt`). The bindgen pipeline collapses alias → canonical mangled name during `_dedupe_by_canonical_args` (see `bindings.py:950` resolver), so the canonical `NCollection_Array1_gp_Pnt.cpp.o` ships, but the consumer-named alias `TColgp_Array1OfPnt.cpp.o` is absent. The replicad YAML happens to request the alias spellings (idiomatic OCCT) and the verifier honestly reports them as "missing", even though the runtime registration covers them. Note: `CHANGELOG.md:126` already documents this resolver-collapse plus the explicit add of `TColgp_Array1OfPnt` constructor (`CHANGELOG.md:141`), so the runtime path works.

**Impact**: Medium (consumer confusion). A literal reading of the warning suggests bindings are missing; in practice they resolve to the canonical NCollection at runtime. Currently `OCJS_STRICT_VERIFY=0` is the default so the link continues.

**Fix surfaces**:

- `repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py:328` (`verifyBindings`): if the missing alias maps to a canonical mangled name that IS compiled, demote the WARNING to an INFO and explain the alias→canonical resolution. The verifier already has `_collect_compiled_symbols`; reusing `bindings.py:950`'s alias resolver here would let the message say `"<alias> → <canonical NCollection symbol> (alias-resolved)"`.
- `docs-site/content/docs/toolchain/reference/yaml-schema.mdx`: document that NCollection typedef aliases are accepted in `bindings:` but resolve to the underlying canonical mangled name; the verifier warning is informational.

---

### Finding W7: `-pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly`

**Evidence** (`replicad-multi-link.log:16356`):

```
emcc: warning: -pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly, see https://github.com/WebAssembly/design/issues/1271 [-Wpthreads-mem-growth]
```

**Root cause**: Long-standing emscripten advisory. Under threading + growable memory, each `HEAP.*` view (HEAP8, HEAPU8, HEAP16, …) must be rebuilt on every growth event because the `SharedArrayBuffer` backing the wasm memory detaches the old typed-array view when grown. To preserve correctness, emscripten's JS glue wraps every load/store with a `GROWABLE_HEAP_*()` guard (or, in newer builds, with an inline `wasmMemory.buffer != buffer` check) that re-acquires the view if memory was grown by another thread. That guard is what makes JS-side memory access slow — wasm-side access is unaffected. The full mitigation landscape (history, current emscripten flags, browser support, recommended consumer pattern for May 2026) is documented in **[Appendix B](#appendix-b-resizable-memory--pthread-mitigation-state-of-the-art-may-2026)**.

**Impact**: Low–medium for _consumers_. The MT binary still works correctly; JS↔wasm memory access can be 5–15% slower than the ST path. The replicad MT YAML inherits `-sALLOW_MEMORY_GROWTH=1` from `custom_build_single.yml` — that's the canonical browser deployment shape, and removing it would break the "tab can't crash on large STEP imports" guarantee.

**Fix surfaces** (see Appendix B for details):

- `repos/opencascade.js/docs-site/content/docs/package/guides/multi-threading.mdx`: add a "Performance notes" callout that (a) cites the emscripten advisory, (b) names mimalloc as the contention mitigation already shipping, (c) documents the **pull-`HEAP*`-out-of-loops** consumer-side pattern, (d) documents the **opt-in `-sGROWABLE_ARRAYBUFFERS=1` build flag** with a clear "experimental, breaks stable browsers as of May 2026 — only enable in canary/nightly builds" warning.
- `repos/opencascade.js/build-configs/full_multi.yml`: do NOT enable `-sGROWABLE_ARRAYBUFFERS=1` in the shipped MT YAML. The feature requires `WebAssembly.Memory.prototype.toResizableBuffer()`, which is still behind `--experimental-wasm-rab-integration` in stable Chrome and absent from Safari stable (only in STP 227+). Re-evaluate in 6 months once it lands across the Baseline.
- `repos/opencascade.js/src/ocjs_bindgen/`: defer the runtime feature-detect `updateMemoryViews` shim — emscripten's `-sGROWABLE_ARRAYBUFFERS=1` already emits the correct code path conditionally, so writing our own shim duplicates upstream effort.
- The `link sample-multi.yml` YAML for `ocjs-bindgen-test` is small enough that consumers won't hit the slow path, but the docs callout should still appear.

---

### Finding W8: `wasm-opt` 0.1% reduction on the multi-threaded build

**Evidence** (`replicad-multi-link.log:16359–16360`):

```
Running wasm-opt on /src/replicad_multi.wasm (20.6 MB)...
wasm-opt: 20.6 MB -> 20.6 MB (0.1% reduction)
```

**Root cause**: `OCJS_WASM_OPT_LEVEL=-O4` ran but produced negligible reduction because:

1. `emcc -O3` already ran the same passes at compile + link time.
2. `OCJS_CLOSURE=true` already shrank the JS glue; closure has no effect on wasm bytes.
3. `OCJS_EVAL_CTORS=2` is **dropped** under MT (`full_multi.yml:4459–4460` documents the rationale: ctor evaluation order is non-deterministic under pthread workers). EVAL_CTORS is one of the largest wasm-opt size wins on the ST build.

So the headline number is a _symptom_ of the MT-build trade-off rather than a defect. For comparison, the single-threaded `sample.yml` link showed `3.53 MB → ?` with non-trivial reduction (the size banner showed `3.53 MB, 1.53 MB gzipped` — wasm-opt + EVAL_CTORS + closure removed substantial post-link static-init code).

**Impact**: Informational only.

**Fix surfaces**:

- `repos/opencascade.js/docs-site/content/docs/toolchain/guides/multi-threading.mdx` already has the "EVAL_CTORS=2 is dropped under threading" callout (lines 72–80). Add a one-line companion note explaining why wasm-opt's reduction looks like a no-op on MT builds (it's not a regression; it's the EVAL_CTORS pass that's missing).

---

### Finding W9: undefined symbol `mallinfo` (mimalloc + emscripten `library_sigs.js` gap)

**Evidence** (`replicad-multi-link.log:16357–16358`):

```
warning: undefined symbol: mallinfo (referenced by root reference (e.g. compiled C/C++ code))
emcc: warning: warnings in JS library compilation [-Wjs-compiler]
```

**Root cause**: mimalloc (the default `OCJS_MALLOC` for every shipped config — see `configurations.json:17,35,53`) references `mallinfo()` (a glibc API) but emscripten's `library.js` does not provide it. The build-configs/opencascade_full.js.bak `.bak` file caches the historical resolution: `function(){G("missing function: mallinfo")}` — an emscripten stub that throws at runtime if anything ever invokes it. In practice mimalloc only calls `mallinfo` from its debug stats reporter, which the production build doesn't reach, so the throw is dormant.

**Impact**: Low (cosmetic + latent trap). The link warning surfaces every time; the runtime throw only fires if a consumer calls `mi_stats_print()` etc.

**Fix surfaces**:

- `repos/opencascade.js/build-configs/full.yml` and `full_multi.yml`: add `mallinfo` to `allowedUndefinedSymbols` so the link-time WARNING demotes to an explicit allowlist entry rather than emscripten's umbrella `[-Wjs-compiler]` warning.
- `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_{single,multi}.yml`: same allowlist entry there as well (currently neither YAML defines `allowedUndefinedSymbols`).
- `docs-site/content/docs/toolchain/reference/yaml-schema.mdx` § `mainBuild.allowedUndefinedSymbols`: add `mallinfo` to the example list as the canonical "shipped" entry.

---

### Finding W10: 858 `unknown` rewrites in `.d.ts` — `.d.ts.json` fragments don't serialise the classes their TS payloads reference

**Evidence** (`replicad-multi-link.log:16363–16378`):

```
=== OCJS_STRICT_TYPES WARNING: missing types in .d.ts ===
  rewrites to 'unknown': 858 (budget: 0)
  unbound class references: 0 unique
  Sample lines with `unknown` rewrites:
    EvalRepresentation(): unknown;
    SetEvalRepresentation(theDesc: unknown): void;
    static get_type_descriptor(): unknown;
    DynamicType(): unknown;
    static get_type_descriptor(): unknown;
    DynamicType(): unknown;
    static get_type_descriptor(): unknown;
    DynamicType(): unknown;
    EvalRepresentation(): unknown;
    SetEvalRepresentation(theDesc: unknown): void;
  This is a WARNING -- the build will continue. To escalate to a build failure in CI, set OCJS_STRICT_TYPES=1.
  Action: extend `_compute_yaml_class_scope` in ocjs_bindgen.link.yaml_build to include every class referenced by an in-scope class's method signatures.
```

**Root cause** (the headline of this audit):

Inspection of `repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py:370–450` confirms `_compute_yaml_class_scope` currently lifts into scope:

| Lift kind                                                                                                        | Source         | Covered today                  |
| ---------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------ |
| 1. Direct `mainBuild.bindings ∪ extraBuilds.bindings`                                                            | YAML           | ✅ (`:391–392`)                |
| 2. Ancestor chains from each in-scope fragment's `ancestors`                                                     | `*.d.ts.json`  | ✅ (`:424–426`)                |
| 3. `NCollection_*` mentions inside in-scope fragments' `.d.ts` payloads                                          | `*.d.ts.json`  | ✅ (`:428–429`, regex-scraped) |
| 4. Every custom-code class in `build/bindings/myMain.h/`                                                         | bindgen output | ✅ (`:439–447`)                |
| 5. `__custom__` sentinel                                                                                         | constant       | ✅ (`:449`)                    |
| **6. Every NON-NCollection class referenced by an in-scope class's method signatures (return / parameter type)** | `*.d.ts.json`  | ❌ **MISSING**                 |

The two sample rewrites in the log — `EvalRepresentation(): unknown` and `SetEvalRepresentation(theDesc: unknown): void` — are method signatures whose return/param types are OCCT classes that:

- Are NOT in `mainBuild.bindings`, AND
- Are NOT NCollection (so they don't match `_NCOLLECTION_TOKEN_RE` at `:428–429`), AND
- Are NOT in any ancestor chain of an in-scope class.

The in-tree error message at `yaml_build.py:142` names the fix site as `_compute_yaml_class_scope`, but the architecturally correct fix is one layer up — in **codegen**, not in the link-time scope computation. Reasoning:

#### Why the link-time regex extension is the wrong abstraction

The link step currently uses `_NCOLLECTION_TOKEN_RE = re.compile(r"\bNCollection_[A-Za-z0-9_]+\b")` (`:186`) to recover NCollection mentions from the rendered `.d.ts` string inside each fragment. Generalising this regex to cover all OCCT class references would:

1. **Reverse-engineer data codegen already had.** `codegen/bindings.py:2719` `TypescriptBindings.resolve_type` decides whether `Geom_Plane` becomes its real TS name or falls through to `unknown` — at that exact moment codegen holds the structured C++ class identifier. Serialising the signature to TS and then regex-extracting class names from the rendered string is throwing away information one function call later.
2. **Generate false positives.** A general `\b[A-Z][A-Za-z0-9_]*\b` matches TS built-ins (`String`, `Number`, `Promise`, `Array`, `Map`), interface names, type alias names, and method names that start with uppercase (`Edge`, `Wire`, `Face` in `BRepBuilderAPI_MakeEdge` overload spellings). The filter "is this a known bindgen-emitted class?" requires either a second walk of the bindings tree to collect the allow-list or a sidecar manifest. The NCollection regex only escapes this because `NCollection_` is a distinctive prefix.
3. **Couple `_compute_yaml_class_scope` to the TS emitter's output format.** Add whitespace, change overload spelling, restructure how nested templates render — the regex silently drops matches and `unknown` rewrites resurge with no test failure.
4. **Provide weak auditability.** "Why is class X in scope?" — regex answer: "the string `X` appeared somewhere in the payload." Structural answer: "fragment Y declared X in `referenced_classes`."

#### The structural fix: serialise `referenced_classes` from codegen

`TypescriptBindings.resolve_type` (`codegen/bindings.py:2719`) and the helper paths it calls (`_is_known_export_name` at `:2589`) are the authoritative source of "what classes does this method signature reference". The fix is to record every name that flows through those paths and serialise it as a first-class field on the `.d.ts.json` fragment:

```python
# codegen/bindings.py — TypescriptBindings.__init__ (sibling of self.exports = set())
self.referenced_classes: set[str] = set()

# codegen/bindings.py — every resolve_type path that emits a C++ class name
# (the unknown-fallback branch AND the known-export branch).
# Recording happens before the known-export filter so unresolved references
# also get captured — that's exactly what `_compute_yaml_class_scope` needs
# to lift on the NEXT link to converge to zero rewrites.
self.referenced_classes.add(cpp_class_name)
```

```python
# pipeline/generate.py — typescriptGenerationFuncClasses (:429-438)
#                       and typescriptGenerationFuncTemplates (:440-450)
return json.dumps({
    ".d.ts": preamble + output,
    "kind": "class",
    "exports": sorted(typescript.exports),
    "ancestors": typescript.ancestorChains,
    "referenced_classes": sorted(typescript.referenced_classes),  # NEW
})
```

```python
# link/yaml_build.py — _compute_yaml_class_scope (replaces :428–429 NCollection lift)
# Lift every class the in-scope fragment's TS payload references — codegen
# recorded these structurally so we don't need to re-parse the .d.ts string.
for ref in frag.get("referenced_classes", []):
    scope.add(ref)
# _NCOLLECTION_TOKEN_RE is deleted; lift kind #3 is subsumed by `referenced_classes`.
```

#### What "structural" buys vs the regex shortcut

| Property                                               | Regex extension                        | Structural `referenced_classes`                                         |
| ------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| LoC changed                                            | ~8                                     | ~12                                                                     |
| Files touched                                          | 1 (`yaml_build.py`)                    | 3 (`bindings.py`, `generate.py`, `yaml_build.py`)                       |
| One-time bindings-tree rebuild                         | No                                     | Yes (`generate` task hash bump; ~30 min for replicad's 268-symbol YAML) |
| False positives                                        | Real (needs allow-list filter)         | None                                                                    |
| Replaces existing `_NCOLLECTION_TOKEN_RE` lift         | No (sibling regex)                     | Yes (subsumed; one source of truth)                                     |
| Audit answer for "why X in scope?"                     | Fuzzy (string match in payload)        | Direct field read                                                       |
| Resilient to TS-output format change                   | No                                     | Yes                                                                     |
| Open coding seam for future codegen reference pathways | None — they need a new regex each time | Free — they flow through `resolve_type`                                 |

The one-time bindings rebuild is real cost but is amortised. The regex's hidden cost — a new regex (or filter tweak) every time a codegen pathway adds a class reference — is unbounded.

#### Why codegen is the right layer

`TypescriptBindings.resolve_type` has full knowledge of:

- The C++ class identifier in the signature (before TS conversion).
- Whether that identifier resolves to a known export or falls through to `unknown`.
- The full ancestor chain (already serialised at `:2358`).
- Template-arg expansions (already canonicalised at `:2719`).

Everything `_compute_yaml_class_scope` needs already lives in `TypescriptBindings`. Pushing the recording one level down (into the function that knows the truth) eliminates the link-time recovery step entirely.

**Impact**: HIGH (correctness regression for consumers).

The shipped `replicad_multi.d.ts` is 1475.9 KB; `replicad_single.d.ts` shares the same codegen filter, so this regression also exists in the published single-threaded build. 858 method signatures lose their return/parameter typing. TS auto-complete, refactor safety, and parameter type-checks all silently degrade for downstream consumers. The fact that this is `OCJS_STRICT_TYPES=0` (warn-only) by default means it has been shipping for at least one release without anyone catching it.

**Fix surfaces**:

- `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py:2123–2719`: add `self.referenced_classes` field to `TypescriptBindings.__init__`; populate it from every `resolve_type` path that emits a C++ class identifier (both the known-export branch AND the `unknown` fallback branch — recording happens BEFORE the filter so unresolved references converge to zero on the next link).
- `repos/opencascade.js/src/ocjs_bindgen/pipeline/generate.py:429–450`: serialise `referenced_classes` into both `typescriptGenerationFuncClasses` and `typescriptGenerationFuncTemplates` fragment outputs.
- `repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py:370–450` (`_compute_yaml_class_scope`): replace the regex-scrape lift at `:428–429` with a direct read of `frag["referenced_classes"]`. Delete `_NCOLLECTION_TOKEN_RE` (`:186`) once verified-redundant. Update the docstring to enumerate the now-five lift kinds (the old #3 and #6 collapse into a single "referenced_classes" lift).
- `repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py:142`: update the strict-types-gate error message to point at the new source of truth (`extend the recorded set in TypescriptBindings.resolve_type → referenced_classes` rather than `extend _compute_yaml_class_scope`).
- `repos/opencascade.js/tests/unit/test_link_yaml_scope.py`: add a regression test that constructs an in-memory `BRepBuilderAPI_MakeEdge`-style fragment whose `referenced_classes` contains a non-NCollection, non-ancestor class (e.g. `Geom_Plane`), asserts the class is lifted into scope, and asserts the resulting `.d.ts` shows the typed return (not `unknown`).
- `repos/opencascade.js/tests/unit/test_strict_types_gate.py`: update the assertion that the gate-failure message contains `_compute_yaml_class_scope` to instead expect the new pointer (`TypescriptBindings.resolve_type` / `referenced_classes`).
- `repos/opencascade.js/tests/sentinel/test_link_ncollection_reachability.py:307`: the `_NCOLLECTION_TOKEN_RE` import becomes dead code; either delete or repurpose the test to assert NCollection references survive via `referenced_classes`.
- `docs-site/content/docs/toolchain/reference/env-vars.mdx`: clarify the `OCJS_STRICT_TYPES` row to note that the fail-loud gate is the canonical way to catch this regression in CI, and that the framework fix landing (W10) means consumers should re-link against the patched OCJS image to drop the rewrites count to 0.
- `docs-site/content/docs/toolchain/concepts/bindgen-pipeline.mdx:91–92`: update the "Codegen emits `unknown`" row to point at the new `referenced_classes` machinery as the structural guarantee.
- `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_{single,multi}.yml`: once the framework fix lands, re-link both YAMLs and verify the strict-types banner shows `rewrites to 'unknown': 0`.

## Recommendations

| #      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Surface                                                                                                                                                               | Priority       | Effort | Impact |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------ |
| **R1** | **Serialise `referenced_classes` from codegen** (W10, structural fix). Add `self.referenced_classes` to `TypescriptBindings`; populate from every `resolve_type` path; emit in both `typescriptGenerationFunc{Classes,Templates}` outputs; replace the `_NCOLLECTION_TOKEN_RE` lift in `_compute_yaml_class_scope` with a direct field read; delete the regex; update the strict-types-gate error message to point at the new source of truth. Bindings-tree rebuild required (~30 min, one-time). Re-link replicad + sample YAMLs and verify `rewrites to 'unknown': 0`. | `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py`, `pipeline/generate.py`, `link/yaml_build.py`                                                             | **P0**         | M      | High   |
| **R2** | Update tests for the structural `referenced_classes` field (W10). Unit test in `test_link_yaml_scope.py` constructs a fragment whose `referenced_classes` includes a non-NCollection, non-ancestor class and asserts scope inclusion. Sentinel test runs the full link against the real bindings tree and asserts `_count_unknown_tokens(dts) == 0` for in-scope classes. Update `test_strict_types_gate.py` to expect the new gate-failure message pointer. Retire the dead `_NCOLLECTION_TOKEN_RE` import in `test_link_ncollection_reachability.py`.                   | `repos/opencascade.js/tests/unit/test_link_yaml_scope.py`, `tests/unit/test_strict_types_gate.py`, `tests/sentinel/test_link_ncollection_reachability.py`             | P0             | M      | High   |
| R3     | Update OCCT-V8 wrappers to drop `Standard_False`/`Standard_True`/`Standard_Integer`/`Standard_Real`/`Standard_Boolean` aliases (W4); rg-sweep all 5 replicad wrapper `.cpp` files.                                                                                                                                                                                                                                                                                                                                                                                        | `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/*.cpp`                                                                                          | P1             | S      | Medium |
| R4     | Add `mallinfo` to `allowedUndefinedSymbols` in shipped `full.yml` / `full_multi.yml` AND the two replicad custom_build YAMLs (W9). Add the entry to the docs-site `yaml-schema.mdx` example.                                                                                                                                                                                                                                                                                                                                                                              | `repos/opencascade.js/build-configs/{full,full_multi}.yml`, `custom_build_{single,multi}.yml`, `docs-site/content/docs/toolchain/reference/yaml-schema.mdx`           | P1             | S      | Low    |
| R5     | Demote the "N requested bindings have no compiled .o file" warning to INFO when the missing alias resolves to a compiled canonical NCollection (W6).                                                                                                                                                                                                                                                                                                                                                                                                                      | `repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py` (`verifyBindings`)                                                                                         | P1             | M      | Medium |
| R6     | Suppress `Loading configuration: single-threaded` banner on cached `apply-patches`/`pch`/`generate` subtasks, OR inherit `OCJS_CONFIG` from the parent Nx process env (W1).                                                                                                                                                                                                                                                                                                                                                                                               | `repos/opencascade.js/build-wasm.sh`, `repos/opencascade.js/project.json`                                                                                             | P2             | S      | Low    |
| R7     | Filter `-stdlib=libc++` `[-Wunused-command-line-argument]` from libclang diagnostic rebroadcast OR pair the flag with `-Wno-unused-command-line-argument` in `parse.py` (W2).                                                                                                                                                                                                                                                                                                                                                                                             | `repos/opencascade.js/src/ocjs_bindgen/ast/parse.py`                                                                                                                  | P2             | S      | Low    |
| R8     | Add docs callout for `-pthread + ALLOW_MEMORY_GROWTH` advisory per **[Appendix B](#appendix-b-resizable-memory--pthread-mitigation-state-of-the-art-may-2026)**: mimalloc (already shipping) + pull-`HEAP*`-out-of-loops + the browser-vs-Node support matrix from §B.4. Keep `-sGROWABLE_ARRAYBUFFERS=0` in the default `full_multi.yml` (Node.js still ❌).                                                                                                                                                                                                             | `repos/opencascade.js/docs-site/content/docs/package/guides/multi-threading.mdx`                                                                                      | P2             | S      | Medium |
| R12    | **Add opt-in browser-only MT build** (`full_multi_browser.yml` + `configurations.json` entry `multi-threaded-browser-only`) with `-sGROWABLE_ARRAYBUFFERS=1` for consumers whose deployment matrix is Chrome 144+ / Firefox 145+ / Safari 26.2+. Document the browser-vs-Node tradeoff explicitly. (See §B.7)                                                                                                                                                                                                                                                             | `repos/opencascade.js/build-configs/full_multi_browser.yml` (new), `build-configs/configurations.json`, `docs-site/content/docs/toolchain/guides/multi-threading.mdx` | P3             | M      | Medium |
| R9     | Add one-line companion note to the existing "EVAL_CTORS dropped under MT" callout explaining why wasm-opt reduction looks like a no-op on MT (W8 — it's not a regression).                                                                                                                                                                                                                                                                                                                                                                                                | `repos/opencascade.js/docs-site/content/docs/toolchain/guides/multi-threading.mdx`                                                                                    | P2             | S      | Low    |
| R10    | Replace deprecated includes (`NCollection_Vector.hxx`, `TColStd_IndexedDataMapOfStringString.hxx`) in replicad wrappers OR filter the deprecation warnings at PCH-include rewrite time (W3, W5).                                                                                                                                                                                                                                                                                                                                                                          | `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/*.cpp` (and/or OCJS PCH)                                                                        | P3             | M      | Low    |
| R11    | Once R1 lands and replicad MT verifies clean, push `ocjs:multi-threaded-local` → `ghcr.io/taucad/opencascade.js:alpha-multi-threaded-arm64` (mirror the single-threaded publish flow done last session).                                                                                                                                                                                                                                                                                                                                                                  | deploy                                                                                                                                                                | P1 (follow-up) | S      | Medium |

## Surface Impact Matrix

The user explicitly asked for coverage across **docs**, **opencascade.js**, and **replicad YAML**. Mapping each finding to the surface(s) that need to change:

| Finding | docs-site                                                                     | opencascade.js                                                                | replicad YAML / wrappers          |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| W1      |                                                                               | `build-wasm.sh` / `project.json`                                              |                                   |
| W2      |                                                                               | `src/ocjs_bindgen/ast/parse.py`                                               |                                   |
| W3      |                                                                               | (PCH rewrite optional)                                                        | wrappers/\*.cpp                   |
| W4      | (note migration in V8 guide)                                                  |                                                                               | wrappers/\*.cpp                   |
| W5      |                                                                               | (PCH rewrite optional)                                                        | wrappers/\*.cpp                   |
| W6      | `toolchain/reference/yaml-schema.mdx`                                         | `link/yaml_build.py`                                                          |                                   |
| W7      | `package/guides/multi-threading.mdx`                                          |                                                                               | (none — recipe stays)             |
| W8      | `toolchain/guides/multi-threading.mdx`                                        |                                                                               |                                   |
| W9      | `toolchain/reference/yaml-schema.mdx`                                         | `build-configs/{full,full_multi}.yml`                                         | `custom_build_{single,multi}.yml` |
| W10     | `toolchain/reference/env-vars.mdx`, `toolchain/concepts/bindgen-pipeline.mdx` | `codegen/bindings.py` + `pipeline/generate.py` + `link/yaml_build.py` + tests | (re-link verification only)       |

## References

- Log file: [`replicad-multi-link.log`](replicad-multi-link.log) (16,403 lines).
- Sample YAML: [`/Users/rifont/git/ocjs-bindgen-test/sample-multi.yml`](file:///Users/rifont/git/ocjs-bindgen-test/sample-multi.yml).
- Replicad custom YAML (new): [`repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_multi.yml`](repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_multi.yml).
- Replicad wrapper sources: `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/{brep-io,edge-mesh-extractor,geom2d-io,mesh-extractor,shape-hasher}.cpp`.
- Codegen filter: [`repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py`](repos/opencascade.js/src/ocjs_bindgen/link/yaml_build.py) — `_compute_yaml_class_scope` (`:370–450`), `_filter_auto_symbols_by_scope` (`:453–511`), `_enforce_strict_types_gate` (`:65–177`).
- Existing test surface: `tests/unit/test_link_yaml_scope.py`, `tests/unit/test_strict_types_gate.py`, `tests/sentinel/test_link_ncollection_reachability.py`.
- Multi-threaded build flag rationale: `repos/opencascade.js/build-configs/full_multi.yml:4456–4467`.
- Emscripten advisory (W7): https://github.com/WebAssembly/design/issues/1271, https://github.com/emscripten-core/emscripten/issues/25323.
- Related: [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md).

## Appendix A: full warning quotations

For traceability, every warning line from `replicad-multi-link.log` (link-step only, deduplicated):

| Log line    | Verbatim warning                                                                                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16290       | `warning: argument unused during compilation: '-stdlib=libc++' [-Wunused-command-line-argument]`                                                                                                                                                   |
| 16291       | `NCollection_Vector.hxx:22:1: warning: NCollection_Vector.hxx is deprecated since OCCT 8.0.0. Use NCollection_DynamicArray.hxx directly. [-W#pragma-messages]`                                                                                     |
| 16292       | `myMain.h:4701:55: warning: 'Standard_False' is deprecated: Standard_False is deprecated, use false directly [-Wdeprecated-declarations]`                                                                                                          |
| 16293       | `myMain.h:4701:89: warning: 'Standard_False' is deprecated: ...`                                                                                                                                                                                   |
| 16294       | `myMain.h:4783:34: warning: 'Standard_Integer' is deprecated: Standard_Integer is deprecated, use int directly [-Wdeprecated-declarations]`                                                                                                        |
| 16295       | `myMain.h:4951:29: warning: 'Standard_False' is deprecated: ...`                                                                                                                                                                                   |
| 16296       | `myMain.h:4952:55: warning: 'Standard_False' is deprecated: ...`                                                                                                                                                                                   |
| 16297       | `myMain.h:4952:89: warning: 'Standard_False' is deprecated: ...`                                                                                                                                                                                   |
| 16298       | `myMain.h:5026:48: warning: 'Standard_False' is deprecated: ...`                                                                                                                                                                                   |
| 16322–16333 | `WARNING: 10 of 226 requested bindings have no compiled .o file: …`                                                                                                                                                                                |
| 16336       | `TColStd_IndexedDataMapOfStringString.hxx:27:1: warning: TColStd_IndexedDataMapOfStringString.hxx is deprecated since OCCT 8.0.0. Use NCollection_IndexedDataMap<TCollection_AsciiString, TCollection_AsciiString> directly. [-W#pragma-messages]` |
| 16356       | `emcc: warning: -pthread + ALLOW_MEMORY_GROWTH may run non-wasm code slowly, see https://github.com/WebAssembly/design/issues/1271 [-Wpthreads-mem-growth]`                                                                                        |
| 16357       | `warning: undefined symbol: mallinfo (referenced by root reference (e.g. compiled C/C++ code))`                                                                                                                                                    |
| 16358       | `emcc: warning: warnings in JS library compilation [-Wjs-compiler]`                                                                                                                                                                                |
| 16360       | `wasm-opt: 20.6 MB -> 20.6 MB (0.1% reduction)` (informational; observed as W8 here)                                                                                                                                                               |
| 16363–16378 | `=== OCJS_STRICT_TYPES WARNING: missing types in .d.ts ===` with `rewrites to 'unknown': 858 (budget: 0)`                                                                                                                                          |

## Appendix B: Resizable memory + pthread mitigation state-of-the-art (May 2026)

Web research conducted 2026-05-27 against emscripten 5.0.x, the WebAssembly JS-API spec, and the resizable-buffers TC39 proposal. The canonical "best-practice" recommendation has shifted twice in the past 12 months and is still in transition; this appendix captures the current snapshot so the recommendation in W7 / R8 has an evidence trail.

### B.1 Why the warning exists at all

`-Wpthreads-mem-growth` fires because, under `-pthread`, the wasm `Memory` is a `SharedArrayBuffer`. When **any** thread grows that memory (via `memory.grow` or `malloc` hitting a fresh page), every JS `HEAP*` typed-array view created against the previous size is **detached** by the JS spec — even though the underlying SAB itself remains alive. Emscripten's JS glue therefore wraps every load/store with either:

- (pre-5.0.x) a `GROWABLE_HEAP_*()` macro that re-acquires the typed-array view on every access (the costly path); or
- (5.0.x+) an inline `wasmMemory.buffer != buffer` check that re-acquires lazily.

Either way, the cost is per-JS-side-memory-access overhead; wasm-side code is unaffected ([emscripten/issues/8287](https://github.com/emscripten-core/emscripten/issues/8287), [emscripten/issues/7382](https://github.com/emscripten-core/emscripten/issues/7382), [pthreads.rst](https://github.com/emscripten-core/emscripten/blob/5.0.4/site/source/docs/porting/pthreads.rst)).

### B.2 The structural fix: `WebAssembly.Memory.prototype.toResizableBuffer()`

The TC39 [resizable-buffers proposal](https://github.com/tc39/proposal-resizablearraybuffer) adds `ArrayBuffer.prototype.resize()` and the matching wasm-spec PR ([WebAssembly/spec#1300](https://github.com/WebAssembly/spec/pull/1300), [#1871](https://github.com/WebAssembly/spec/pull/1871)) adds `WebAssembly.Memory.prototype.toResizableBuffer()` / `.toFixedLengthBuffer()`. The semantics are: views created against a resizable buffer **do not detach** on growth — they automatically grow with the buffer. This eliminates the entire `GROWABLE_HEAP_*` cost class.

### B.3 Emscripten support

| Flag                        | Status (Emscripten 5.0.x, May 2026)                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-sALLOW_MEMORY_GROWTH=1`   | Stable. Default for OCJS.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `-sGROWABLE_ARRAYBUFFERS=1` | **Experimental** (PR [#24684](https://github.com/emscripten-core/emscripten/pull/24684), July 2025). Emits the `wasmMemory.toResizableBuffer()` path and drops the per-access detachment guards. Pairs with `-sALLOW_MEMORY_GROWTH=1`. Emits `em++: warning: -sGROWABLE_ARRAYBUFFERS is experimental and not yet supported in browsers [-Wexperimental]` ([emscripten/issues/26099](https://github.com/emscripten-core/emscripten/issues/26099)). |
| `-sGROWABLE_ARRAYBUFFERS=0` | Equivalent to omitting the flag. Default.                                                                                                                                                                                                                                                                                                                                                                                                         |

There is no third "feature-detect at runtime" emscripten flag — the choice is compile-time. Consumers who want backward compatibility need to either ship two builds (with/without the flag) and dispatch in the loader, OR ship a single non-`GROWABLE_ARRAYBUFFERS` build and accept the JS-access overhead universally.

### B.4 Browser support for `toResizableBuffer()` (May 2026, MDN-confirmed)

Cross-checked against the live MDN `webassembly.api.Memory` compat table on 2026-05-27 ([MDN: WebAssembly.Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory)). The picture is materially better than the secondary sources (Uno blog, Dev Newsletter, wasm-bindgen discussion) implied two months ago — `toResizableBuffer()` is now **stable across every major desktop and mobile browser**, but is still absent from non-browser JS runtimes:

| Runtime              | `toResizableBuffer` | First version     |
| -------------------- | :-----------------: | ----------------- |
| Chrome (desktop)     |         ✅          | **144** (stable)  |
| Edge                 |         ✅          | **144** (stable)  |
| Firefox              |         ✅          | **145** (stable)  |
| Opera (desktop)      |         ✅          | **128** (stable)  |
| Safari (macOS)       |         ✅          | **26.2** (stable) |
| Chrome (Android)     |         ✅          | 144               |
| Firefox for Android  |         ✅          | 145               |
| Opera (Android)      |         ✅          | 95                |
| Safari on iOS        |         ✅          | 26.2              |
| WebView (Android)    |         ✅          | 144               |
| WebView on iOS       |         ✅          | 26.2              |
| **Samsung Internet** |         ❌          | not shipped       |
| **Bun**              |         ❌          | not shipped       |
| **Deno**             |         ❌          | not shipped       |
| **Node.js**          |         ❌          | not shipped       |

**Implication for OCJS** (revised from the earlier-draft "6–12 months from Baseline" estimate):

1. **Browser-targeting MT builds**: `-sGROWABLE_ARRAYBUFFERS=1` is now **safe to ship** to consumers who target Chrome 144+ / Firefox 145+ / Safari 26.2+ / iOS Safari 26.2+. This is the Baseline that forms the standard modern-web cut.
2. **Multi-runtime / Node.js-tested MT builds**: still **NOT safe**. The OCJS test suite, replicad CI, and any SSR / Node.js-based fixture path will crash at module init with `TypeError: wasmMemory.toResizableBuffer is not a function` ([emscripten/issues/26099](https://github.com/emscripten-core/emscripten/issues/26099)). The shipped `full_multi.yml` build is consumed by both browsers and Node.js test/CI paths, so the flag stays OFF for the default.
3. **Samsung Internet**: still missing the API. Consumer-side concern, not OCJS-side — Samsung Internet has measurable but small share. If a consumer's user-base includes Samsung Internet they should keep `-sGROWABLE_ARRAYBUFFERS=0`.
4. **Bun / Deno**: missing. Consumers targeting these runtimes must keep the flag off.

The earlier "wait 6–12 months for Baseline-ready" framing was too conservative for the **browser** axis (we're there now), but is roughly right for **Node.js parity** (V8 inside Node lags Chrome by several major versions on experimental wasm features).

### B.5 The runtime `updateMemoryViews` shim (community workaround)

Pre-5.0.x emscripten exposed a pre-init hook where the consumer could redefine `updateMemoryViews` to opportunistically use `toResizableBuffer()` when available. The canonical recipe (from [emscripten/issues/25323#ThaUnknown](https://github.com/emscripten-core/emscripten/issues/25323), which the user attached as the reference image) is:

```js
const supportsGrowth = !!WebAssembly.Memory.prototype.toResizableBuffer;
let hasAlreadyLoadedMemory = false;

updateMemoryViews = () => {
  if (supportsGrowth && hasAlreadyLoadedMemory) return;
  const b = supportsGrowth ? wasmMemory.toResizableBuffer() : wasmMemory.buffer;
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  HEAPU8 = new Uint8Array(b);
  HEAPU16 = new Uint16Array(b);
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  HEAPF32 = new Float32Array(b);
  HEAPF64 = new Float64Array(b);
  HEAP64 = new BigInt64Array(b);
  HEAPU64 = new BigUint64Array(b);
  hasAlreadyLoadedMemory = true;
};

// Build flags: -sALLOW_MEMORY_GROWTH=1 -sGROWABLE_ARRAYBUFFERS=0
```

**Status in May 2026**: superseded by `-sGROWABLE_ARRAYBUFFERS=1` for new builds. Use the shim only if you're stuck on an older emscripten that does not have the flag, OR if you need the "single build, runtime-detect" deployment pattern (the upstream flag is compile-time binary).

### B.6 Today's other mitigations (apply NOW, no browser dependency)

These ship in OCJS today and are independent of the resizable-buffer landing:

1. **`-sMALLOC=mimalloc`** (already shipping in every OCJS configuration — `configurations.json:17/35/53`). Replaces dlmalloc's global lock with per-thread allocation contexts; reduces `malloc`/`free` contention overhead by 30–50% in MT workloads ([emscripten pthreads docs](https://emscripten.org/docs/porting/pthreads.html)).
2. **Move heavy memory ops into wasm** ("wasm runs at full speed; moving work over can fix this" — emscripten docs). Surface this guidance in consumer-facing docs.
3. **Pull `HEAP*` references out of tight JS loops** ([emscripten/issues/18589](https://github.com/emscripten-core/emscripten/issues/18589)):

   ```js
   // Slow: each iteration re-acquires HEAPU8 via GROWABLE_HEAP_U8()
   for (let i = 0; i < len; i++) sum += Module.HEAPU8[ptr + i];

   // Fast: acquire once, iterate against the local reference
   const heap = Module.HEAPU8;
   for (let i = 0; i < len; i++) sum += heap[ptr + i];
   ```

4. **Don't access `Module.HEAP*` from external user JS** — embed accessor functions via `--js-library` so emscripten auto-inserts the detachment guards. External code that holds onto a stale `HEAPU8` reference can read garbage after a growth event.

### B.7 Canonical recommendation for OCJS (May 2026, MDN-revised)

Three-tier strategy, picked because the shipped `full_multi.yml` is consumed by both browsers (where the flag is safe) AND Node.js test/CI fixtures (where it crashes):

| Build identity                                                     | `-sGROWABLE_ARRAYBUFFERS`                                                                                          | Rationale                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `full_multi.yml` (default shipped MT — runs in browsers + Node.js) | `=0` (off)                                                                                                         | Node.js still ❌ on `toResizableBuffer()`; replicad/OCJS tests would crash at module init.                                               |
| `full_multi_browser.yml` (new opt-in browser-only MT — to add)     | `=1` (on)                                                                                                          | All major browsers stable (Chrome 144 / Firefox 145 / Safari 26.2). Skips the per-access detachment guard, faster JS↔wasm memory access. |
| `single-threaded` (any)                                            | n/a — single-threaded uses an `ArrayBuffer` not `SharedArrayBuffer`; growth detachment doesn't apply the same way. | Unaffected by W7.                                                                                                                        |

Action items (May 2026):

| Action                                                                                                                                                                                                        | Apply where                                                                                               | Effective when                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Keep `-sMALLOC=mimalloc`                                                                                                                                                                                      | Already shipping in every config                                                                          | Now                                                                                                                     |
| Document the 3 consumer-side patterns from §B.6 (mimalloc, work-into-wasm, pull `HEAP*` out of loops)                                                                                                         | `docs-site/.../package/guides/multi-threading.mdx`                                                        | Now (P2)                                                                                                                |
| Keep `-sGROWABLE_ARRAYBUFFERS=0` in `full_multi.yml` (default shipped MT) until Node.js ships `toResizableBuffer()`                                                                                           | `build-configs/full_multi.yml`, replicad `custom_build_multi.yml`                                         | Now                                                                                                                     |
| **Add an opt-in `full_multi_browser.yml` build target with `-sGROWABLE_ARRAYBUFFERS=1`** for consumers whose deployment matrix is browser-only (Chrome 144+ / Firefox 145+ / Safari 26.2+ / iOS Safari 26.2+) | `build-configs/full_multi_browser.yml` (new), `configurations.json` (`multi-threaded-browser-only` entry) | Now (P3)                                                                                                                |
| Document the browser-vs-Node tradeoff explicitly with the support matrix from §B.4 so consumers can choose                                                                                                    | `docs-site/.../toolchain/guides/multi-threading.mdx`                                                      | Now (P3)                                                                                                                |
| Migrate `full_multi.yml` default to `=1` once Node.js stable ships `toResizableBuffer()`                                                                                                                      | Re-audit                                                                                                  | When Node.js inherits the V8 RAB-integration release (no public ETA from V8 release planning as of May 2026)            |
| Skip the manual `updateMemoryViews` shim                                                                                                                                                                      | n/a                                                                                                       | Superseded by upstream `-sGROWABLE_ARRAYBUFFERS=1` for browser targets; not worth porting for the narrow Node.js window |

### B.8 Why we're not shipping the runtime `updateMemoryViews` shim

A naive read of [emscripten/issues/25323](https://github.com/emscripten-core/emscripten/issues/25323) is "OCJS should ship the runtime feature-detect shim so consumers automatically get the fast path on capable runtimes". We're declining for four reasons:

1. **Emscripten's `-sGROWABLE_ARRAYBUFFERS=1` does the same thing at compile time** and is upstream-supported.
2. **The shim runs on every runtime, including those without `toResizableBuffer()`**, where it short-circuits to the legacy path with one extra branch. That's not free.
3. **The shim is brittle to emscripten internals** — it monkey-patches `updateMemoryViews`, an undocumented symbol whose signature has changed across 5.x releases. Upstream is the right place for this code.
4. **The window where the shim adds value is narrow**: it would benefit Node.js consumers ONLY (every browser we target already has the API). Once Node.js ships `toResizableBuffer()` the shim becomes pure dead weight.

The net effect: docs callout (P2) + opt-in browser-only build recipe (P3), default shipped binary unchanged, re-evaluate the default flip when Node.js stable adds the API.

### B.9 References (consulted for this appendix)

- [emscripten Pthreads support docs (5.0.8-git)](https://emscripten.org/docs/porting/pthreads.html)
- [emscripten/issues/8287 — WebAssembly + pthreads + memory growth (long history)](https://github.com/emscripten-core/emscripten/issues/8287)
- [emscripten/issues/7382 — Wasm memory cannot be grown in pthreads builds (closed; resolved by #8365)](https://github.com/emscripten-core/emscripten/issues/7382)
- [emscripten/issues/24287 — Implement support for ResizableArrayBuffer/GrowableSharedArrayBuffer integration](https://github.com/emscripten-core/emscripten/issues/24287)
- [emscripten/PR/24684 — Enable growable array buffers (the `-sGROWABLE_ARRAYBUFFERS` flag landing)](https://github.com/emscripten-core/emscripten/pull/24684)
- [emscripten/issues/26099 — `wasmMemory.toResizableBuffer is not a function` (showcases the consumer-side breakage if the flag is enabled prematurely)](https://github.com/emscripten-core/emscripten/issues/26099)
- [emscripten/issues/18589 — Replace GROWABLE_HEAPS with native functions (the "pull `HEAP*` out of loops" mitigation discussion)](https://github.com/emscripten-core/emscripten/issues/18589)
- [emscripten/issues/25323 — Community `updateMemoryViews` shim recipe](https://github.com/emscripten-core/emscripten/issues/25323)
- [WebAssembly/spec/PR/1300 — JS-API integration with the resizable-buffers proposal](https://github.com/WebAssembly/spec/pull/1300)
- [TC39 proposal-resizablearraybuffer](https://github.com/tc39/proposal-resizablearraybuffer)
- [MDN — WebAssembly.Memory (browser compat table, the authoritative May 2026 snapshot used in §B.4)](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory)
- [State of WebAssembly – 2025 and 2026 (Uno Platform blog)](https://platform.uno/blog/the-state-of-webassembly-2025-2026/) — pre-MDN-update view; treat as superseded for browser-stable status
- [State of WebAssembly 2026 (Dev Newsletter, references Safari TP 227)](https://devnewsletter.com/p/state-of-webassembly-2026/) — pre-MDN-update view; treat as superseded for browser-stable status
- [wasm-bindgen Discussion #4131 — browser-availability snapshot March 2026](https://github.com/wasm-bindgen/wasm-bindgen/discussions/4131) — pre-MDN-update view; treat as superseded for browser-stable status

---

## Implementation Status

All twelve recommendations from this audit (R1–R12) landed in
`repos/opencascade.js@occt-v8-emscripten-5` and the rendered + source
build configs under
`repos/replicad/packages/replicad-opencascadejs/build-{source,config}/`.
Plan file: `/Users/rifont/.cursor/plans/multi-link-warning-r1-r12_c59395b5.plan.md`.

| Rec                                                                                                                                                                                                                                                                                                                 | Status                                                                                                                                                                                                 | Verified by                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — structural `referenced_classes` lift replaces `_NCOLLECTION_TOKEN_RE` regex scrape (codegen → pipeline → link)                                                                                                                                                                                                 | DONE (source); `tests/sentinel/test_link_ncollection_reachability.py::test_structural_referenced_classes_lift_drives_unknown_to_zero` requires bindings regenerated under Docker before it flips green | unit `tests/unit/test_link_yaml_scope.py::test_compute_yaml_class_scope_lifts_referenced_classes_field`; sentinel pending Docker rebuild                                                        |
| R2 — strict-types-gate message points at `TypescriptBindings.resolve_type → referenced_classes`; sentinel rewritten to assert `_count_unknown_tokens == 0`                                                                                                                                                          | DONE                                                                                                                                                                                                   | `tests/unit/test_strict_types_gate.py` (14 cases)                                                                                                                                               |
| R3 — `Standard_False/True/Integer/Real/Boolean` aliases removed from replicad C++ wrappers (`mesh-extractor.cpp`, `edge-mesh-extractor.cpp`)                                                                                                                                                                        | DONE                                                                                                                                                                                                   | `rg -nP '\bStandard_(False\|True\|Integer\|Real\|Boolean)\b'` in `repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/` → 0 hits                                               |
| R4 — `mallinfo` allowlisted in OCJS `full.yml` + `full_multi.yml` and replicad `custom_build_{single,multi}.yml` (build-source + rendered build-config); documented in `yaml-schema.mdx`                                                                                                                            | DONE                                                                                                                                                                                                   | YAML diff visible in `git status`; `ytt` unavailable locally → rendered files patched by hand to match `pnpm run generateConfig` output                                                         |
| R5 — `verifyBindings` demotes alias-resolved missing bindings to `INFO` via `ncollection-manifest.json`; `yaml-schema.mdx § mainBuild.bindings` documents the new tier                                                                                                                                              | DONE                                                                                                                                                                                                   | `tests/unit/test_link_yaml_scope.py::{test_verify_bindings_demotes_alias_resolved_to_info,test_verify_bindings_keeps_warning_for_truly_missing,test_verify_bindings_clean_input_emits_nothing}` |
| R6 — `build-wasm.sh` inherits `OCJS_CONFIG`; Nx `project.json` declares `{"env": "OCJS_CONFIG"}` on `apply-patches`, `pch`, `generate`, `compile-bindings`, `compile-sources`                                                                                                                                       | DONE                                                                                                                                                                                                   | manual `grep -n 'OCJS_CONFIG' project.json build-wasm.sh`                                                                                                                                       |
| R7 — `-Wno-unused-command-line-argument` appended in `src/ocjs_bindgen/ast/parse.py`; hermetic libclang test pins the suppression                                                                                                                                                                                   | DONE                                                                                                                                                                                                   | `tests/unit/test_libclang_diagnostics.py` (2 cases)                                                                                                                                             |
| R8 — `docs-site/.../package/guides/multi-threading.mdx` gains a Performance notes section (mimalloc + HEAP\* loop hoisting + Node-vs-browser support matrix)                                                                                                                                                        | DONE                                                                                                                                                                                                   | manual diff                                                                                                                                                                                     |
| R9 — `docs-site/.../toolchain/guides/multi-threading.mdx` gains the wasm-opt MT ~0.1 % reduction companion note                                                                                                                                                                                                     | DONE                                                                                                                                                                                                   | manual diff                                                                                                                                                                                     |
| R10 — replicad wrappers: zero deprecated-header includes; OCJS link's `additionalBindCode` compile now filters OCCT-internal `[-W#pragma-messages]` stderr (`NCollection_Vector.hxx`, `TColStd_IndexedDataMapOfStringString.hxx`) and emits a single `INFO: filtered N OCCT-internal deprecation pragma(s)` summary | DONE                                                                                                                                                                                                   | helper `_filter_occt_deprecation_pragmas` in `src/ocjs_bindgen/link/yaml_build.py`; will surface against the next replicad multi-link reproduction                                              |
| R11 — MANUAL handoff to user; agent prepares the runbook, user runs `docker push` via `scripts/release-ocjs-image.sh` (durable how-to: `.agent/skills/publish-ocjs-image/SKILL.md`)                                                                                                                                 | DONE (handoff)                                                                                                                                                                                         | runbook delivered alongside this PR description                                                                                                                                                 |
| R12 — `build-configs/full_multi_browser.yml` + `multi-threaded-browser` entry in `configurations.json`; "Browser-only MT build" subsection in toolchain guide; sentinel pins `-sGROWABLE_ARRAYBUFFERS=1`, node-excluded `-sENVIRONMENT`, and scope parity with `full_multi.yml`                                     | DONE                                                                                                                                                                                                   | `tests/sentinel/test_full_multi_browser_yaml.py` (5 cases)                                                                                                                                      |

### Verification gaps deferred to the next Docker-bound rebuild

- **R1 / sentinel bindings tree** — `tests/sentinel/test_link_ncollection_reachability.py::test_structural_referenced_classes_lift_drives_unknown_to_zero` and the companion `test_stepcaf_writer_keeps_shapefix_parameter_map` both assert the bindings tree on disk carries the new `referenced_classes` field. The on-disk tree predates R1, so both fail loudly with a self-describing remediation message ("Regenerate via `pnpm nx run ocjs:generate`"). They will flip green automatically once R11's Docker image is rebuilt + the generate target re-runs.
- **R10 / pragma filter** — the helper exists and is wired into the `additionalBindCode` compile call. It will only have observable output against a real OCCT-source pull of the two deprecated headers; verify by capturing stderr from the next `link custom_build_multi.yml` run and confirming the single `INFO:` summary replaces the prior raw `#pragma message` spam.

### Companion changes outside the audit's direct scope

- `tests/sentinel/test_full_multi_browser_yaml.py` is new; it pins the browser variant against silent drift in `emccFlags`, `ENVIRONMENT`, output basename, and symbol scope vs `full_multi.yml`.
- The `BROWSER_SCOPE_EXEMPT` constant in that file is intentionally empty — the browser variant is a _flag delta_, not a scope delta. Any future intentional scope divergence must be added with a one-line written rationale.
