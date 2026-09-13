---
title: 'OCCT-Light vs @taucad/opencascade.js: Comparative Architecture and Strategic Positioning'
description: 'Evidence-grade comparison of OCCT-Light prototype-1 (Open Cascade SAS C-ABI wrapper, BRepGraph-canonical) against the taucad fork of opencascade.js (Emscripten/embind, OCCT v8); maturity, DX, agentic-AI fit, licensing, and the narrative for why OCJS still matters.'
status: active
created: '2026-05-25'
updated: '2026-05-25'
category: comparison
related:
  - docs/research/cad-kernel-intermediate-caching.md
  - docs/research/ocjs-typescript-codegen-gap-analysis.md
  - docs/research/ocjs-additionalcppcode-type-erasure-regression.md
  - docs/research/ocjs-fork-holistic-diff.md
---

# OCCT-Light vs @taucad/opencascade.js: Comparative Architecture and Strategic Positioning

A side-by-side, evidence-grade comparison of `Open-Cascade-SAS/OCCT-Light` (prototype-1 branch, May 2026) — a C-ABI-first wrapper around OCCT by Open Cascade SAS itself — against the taucad fork of `opencascade.js` (the Emscripten/embind WebAssembly bridge that the Tau project maintains and ships as `@taucad/opencascade.js`).

## Executive Summary

1. **OCCT-Light is a fundamentally different artifact, not a replacement for OCJS.** OCCT-Light is a hand-written C ABI (`occtl_*`) over OCCT, plus a header-only C++ veneer (`occtl-hpp`), plus per-language idiomatic facades (Python cffi, C# P/Invoke, Node N-API, **WASM via Emscripten+Embind on the C ABI**, Rust bindgen, Go cgo, Java JNA). Its public surface deliberately exposes BRepGraph and forbids `TopoDS_*` in any public header (`docs/design/BREPGRAPH_AS_CANONICAL.md:24-37`). OCJS exposes the **entire OCCT C++ surface** to JavaScript via embind on auto-generated bindings keyed off a YAML symbol list (`build-configs/full.yml`: 4,398 symbols), with a 260,783-line `.d.ts` derived from libclang AST + Doxygen JSDoc.

2. **OCCT-Light is two commits old.** `git log` on `prototype-1` shows: initial commit `2025-11-12`, prototype-1 commit `2026-05-22` (literally the day before this research). 11 GitHub stars, 2 forks. The WASM binding is **Phase 1**: TypeScript surface compiles, but `emcmake` link still fails on unresolved `occtl_*` symbols pending a wasm-compatible OCCT-Light archive (`bindings/wasm/README.md:7-11`). **There is no shipping `@occtl/wasm` artifact today.**

3. **OCJS taucad is production-shipping.** v3.0.0-beta.2 on npm with 4,398 bound symbols, dual single-/multi-threaded WASM variants (`opencascade_full.{js,wasm,d.ts}` + `opencascade_full_multi.*`), pinned OCCT V8_0_0 commit `d3056ef`, pinned emsdk `5.0.1`, content-addressed incremental compile cache, replicad consuming a 226-symbol trim, and Tau using the full build for Replicad/OpenCASCADE kernels.

4. **The single most important architectural difference is the scope of what's exposed.** OCCT-Light exposes a _curated_ CAD surface — graph + node ids, primitives, booleans, mesh views, I/O, healing — and explicitly forbids OCAF/XCAF, hides `TopoDS_*`, and ships ~tens of opaque handles (graph, node iter, batch, progress) plus value-object IDs. OCJS exposes _every_ OCCT class registered in YAML — `BRepAlgoAPI_Cut`, `gp_Pnt`, `BRepFilletAPI_MakeFillet`, `Geom_BSplineSurface`, `XCAFDoc_DocumentTool`, the full BRepGraph package (220 symbols at `build-configs/full.yml:352-571`), and 4,000+ more — directly as JS classes with per-method binding.

5. **OCCT-Light's BRepGraph-canonical contract is its philosophical centerpiece, but it's a constraint, not a capability.** It buys: persistent identity (`UID`), O(1) adjacency, layer-based metadata without OCAF, and insulation from `TopoDS` evolution (`docs/design/BREPGRAPH_AS_CANONICAL.md:18-20`). It costs: every algorithm not yet graph-native (booleans, fillets, offsets, sweeps) round-trips through `TopoDS` invisibly, and the user surface is restricted to whatever OCCT-Light's curated C ABI chooses to expose. OCJS users can call `BRepAlgoAPI_Cut(s1, s2)` directly because the binding is auto-generated for the entire public OCCT C++ API.

6. **License tension is real and material.** OCCT-Light is **AGPL-3.0-or-later** (`README.md:203-207`). Network-facing software linking `@occtl/wasm` enters AGPL copyleft unless a separate commercial license from Open Cascade SAS is obtained (`bindings/python/README.md:3-6`; `include/occtl/occtl_topo.h:11-12`). OCJS is **LGPL-2.1 with the Open-CASCADE-Exception-1.0** (`package.json:21`), which OCCT itself uses — strictly more permissive for SaaS/proprietary embedding. For Tau (public-facing CAD SaaS at `tau.new`), this is a strategic moat: OCJS lets Tau ship without copyleft obligations; OCCT-Light would not.

7. **OCJS's extension model has no analogue in OCCT-Light.** `additionalCppCode` / `additionalCppFiles` / `additionalBindCode` (`docs/toolchain/guides/extend-with-cpp.mdx`) let any consumer inject arbitrary OCCT C++ + raw `EMSCRIPTEN_BINDINGS(...)` blocks into the WASM link without forking OCJS. Replicad uses this for `BRepToolsWrapper`, `ReplicadMeshExtractor`, `OCJS_ShapeHasher`, `GeomToolsWrapper` (`replicad-opencascadejs/build-config/wrappers/*.cpp`). Tau uses it for `TopoDS_Cast` downcasts, FairCurve compute helpers, etc. OCCT-Light's equivalent is "fork the C ABI, add headers, regenerate `abi.json`, regenerate per-language facades" — a maintenance burden incompatible with Tau's iteration cadence.

8. **For agentic AI, OCJS's exhaustive surface is a feature, not a bug.** LLM-driven CAD agents need every operation OCCT can perform reachable by name, with JSDoc for tool descriptions, and stable type signatures Monaco can autocomplete. OCJS gives this for the entire OCCT public C++ surface; OCCT-Light gives this only for the slice its maintainers choose to expose, on a hand-written cadence. The 260k-line `.d.ts` with Doxygen-derived JSDoc is the LLM context-budget surface, and it is comprehensive.

9. **OCCT-Light's strengths are real and complementary.** Persistent UIDs that survive `Compact()` and operation boundaries solve topological-naming problems the way replicad/build123d/CadQuery hand-roll today. The graph+nodeId+UID identity model is the right design for cross-language editor state, undo/redo, and serialised selectors. The single-C-ABI-fanning-into-eight-language-facades pattern is the right answer for cross-language ecosystems where each language's binding cost is multiplied by per-language idiom translation. None of these strengths are _currently shipping_ and they do not invalidate OCJS's position; they suggest a future where Tau may consume _both_.

10. **The honest answer to "Why use OCJS over OCCT-Light?"** today is: **because OCJS exists, ships, and runs production CAD for Tau and replicad, and OCCT-Light does not.** A more durable answer (sections below) is: OCJS exposes the full OCCT API (4,398 symbols vs OCCT-Light's ~tens), supports arbitrary C++ extension injection, ships under LGPL-with-OCCT-exception (vs AGPL), provides Doxygen JSDoc on every binding, supports JS-derived virtual C++ classes via `allow_subclass`/`EMSCRIPTEN_WRAPPER`, uses the OCCT-native `opencascade::handle` smart-pointer model directly, and has dual ST/MT WASM builds with content-addressed incremental compilation. OCCT-Light's eventual strengths (persistent UID identity, AGPL-aligned curated surface, eight-language facade uniformity) are different value, not strictly better value.

## Problem Statement

The user has invested substantial engineering effort in upgrading the taucad fork of `opencascade.js` to OCCT v8 (commit `d3056ef`, V8_0_0 final), with a 4,398-symbol full build, dual ST/MT variants, a content-addressed incremental compile cache, return-by-value (RBV) value-object output codegen, and a Python `ocjs_bindgen` modular code-generator that produces both `EMSCRIPTEN_BINDINGS` C++ and TypeScript declarations from libclang AST + Doxygen XML.

Open Cascade SAS has now published `Open-Cascade-SAS/OCCT-Light` prototype-1: a hand-written C ABI over OCCT, BRepGraph-canonical, with per-language idiomatic facades (Python/C#/Node/WASM/Rust/Go/Java/Swift planned). The project is by the lead OCCT maintainer and signals OCS's intended future bridge between OCCT and the wider language ecosystem.

The core question: **does OCCT-Light obsolete the taucad OCJS fork? What is the durable, defensible narrative for OCJS's continued existence in the post-OCCT-Light world?**

Implicit sub-questions:

- Is OCCT-Light's BRepGraph-canonical model the answer to OCJS's edge cases (smart-pointer staleness, dispatch failures, type-erasure regressions)?
- Is OCJS's "expose every OCCT class" strategy still the right call for agentic AI and for the wider community?
- What does each project enable that the other cannot?
- Should Tau pivot to OCCT-Light, hedge by tracking both, or double down on OCJS?

## Methodology

1. **Cloned `Open-Cascade-SAS/OCCT-Light` prototype-1 branch** via the workspace `repos` skill (`pnpm repos add Open-Cascade-SAS/OCCT-Light -g cad -b prototype-1 --clone`). 2 commits, head at `2026-05-22`.
2. **Read all six OCCT-Light design documents in full**: `ARCHITECTURE.md` (148 lines), `ABI_PATTERNS.md` (739 lines), `BREPGRAPH_AS_CANONICAL.md` (415 lines), `BINDINGS.md` (625 lines), `MODULES.md` (119 lines), `CODING_STYLE.md` (509 lines), plus `README.md`, `AGENTS.md`, `CLAUDE.md`.
3. **Sampled OCCT-Light source for evidence**: `include/occtl/*.h` (29 public C headers), `include/occtl-hpp/*.hpp` (23 C++ veneer headers), `bindings/{python,csharp,node,wasm,rust,go,java}/`, `cmake/OCCTLRegistry.cmake`, `CMakePresets.json`, `tools/scripts/bindings.py`, `tools/abi_dump.py`.
4. **Mined the taucad opencascade.js fork** at `/Users/rifont/git/tau/repos/opencascade.js/`: `build-wasm.sh` (867 lines), `DEPS.json`, `package.json`, `pyproject.toml`, `src/customBuildSchema.py`, `src/ocjs_bindgen/`, `build-configs/{full.yml,full_multi.yml,configurations.json,link-filter-poc.yml}`, `docs-site/content/docs/toolchain/guides/{extend-with-cpp,derive-cpp-class-in-js,bindgen-pipeline}.mdx`.
5. **Cross-referenced 12 workspace research docs** documenting known OCJS issues: `ocjs-typescript-codegen-gap-analysis.md`, `ocjs-additionalcppcode-type-erasure-regression.md`, `ocjs-embind-js-dispatch-failures.md`, `ocjs-trailing-default-arity-fan-out.md`, `ocjs-test-failure-resolution.md`, `ocjs-cmake-cache-race-condition.md`, `ocjs-deprecated-symbol-strategy.md`, `ocjs-any-type-analysis.md`, `ocjs-type-resolution-failures.md`, `embind-smart-pointer-stale-ptr.md`, `embind-return-strategy-benchmarks.md`, `wasm-smart-pointer-landscape.md`.
6. **Sampled replicad's OCJS extension** at `/Users/rifont/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/`: `custom_build_single.yml` (226 symbols) and the five wrapper `.cpp` files (`brep-io`, `mesh-extractor`, `edge-mesh-extractor`, `geom2d-io`, `shape-hasher`).
7. **Deployed two parallel exploration subagents** to mine each codebase concurrently and surface evidence-grade findings with file:line citations. Both returned dense structured reports; their findings are folded into the sections below.

All file:line citations below are relative to `/Users/rifont/git/tau/`.

## Findings

### F1 — OCCT-Light's identity is "C ABI fanning into eight idiomatic language facades"

**Evidence**: `repos/OCCT-Light/docs/design/ARCHITECTURE.md:1-80`, `BINDINGS.md:1-200`, `MODULES.md:1-119`.

The architecture is a strict three-layer cake:

```
+----------------------------------------------------+
| Per-language idiomatic facade                       |  <-- bindings/{python,csharp,node,wasm,rust,go,java}
| (Pythonic with __enter__/__exit__, IDisposable C#,  |
|  Symbol.dispose JS, Drop Rust, etc.)                |
+----------------------------------------------------+
| Typed facade (cffi / P/Invoke / N-API / embind-on-C |  <-- generated from abi.json
|  / bindgen / cgo / JNA), 1:1 with C ABI             |
+----------------------------------------------------+
| Raw C ABI: occtl_* opaque handles + value structs   |  <-- include/occtl/*.h
|   occtl_status_t (no exceptions across ABI)         |
|   occtl_alloc / occtl_free                          |
|   occtl_string_buffer two-call pattern              |
+----------------------------------------------------+
| occtl-hpp: header-only C++ veneer (RAII handles,    |  <-- include/occtl-hpp/*.hpp
|   tl::expected<T, occtl_status_t>, std::span views) |
+----------------------------------------------------+
| occtl_internal C++ implementation (links OCCT)      |  <-- src/internal/
+----------------------------------------------------+
| OCCT (LGPL+exception)                                |
+----------------------------------------------------+
```

The deliberate choice (`ARCHITECTURE.md:31-49`) is that _no STL or OCCT type appears in any public header_. `Standard_Integer`, `gp_Pnt`, `TopoDS_Shape`, `Handle(Geom_Curve)`, `TCollection_AsciiString`, `std::vector` — none of these are in `include/occtl/*.h`. The C ABI is the truth; every language gets an automated typed facade plus a hand-tuned idiomatic facade on top. `BINDINGS.md:67-152` enumerates the 10-point binding contract: opaque handles, status-code returns, two-call buffer pattern, lifetime ownership, threading discipline, ABI versioning, etc.

Concretely, an OCCT-Light user writing C# does:

```csharp
using var graph = OcctlGraph.Create();
var node = graph.AddBox(10, 20, 30);
var box = graph.GetBoundingBox(node);
```

The C# facade calls into `occtl_graph_create`, `occtl_topo_make_box_in_graph`, `occtl_topo_node_bounding_box` via P/Invoke, all thin wrappers around hand-written C functions. The Python facade does the same via cffi, the Rust facade via `bindgen`, etc. **One C ABI, N idiomatic facades.**

**Implication for Tau**: This is the right architecture for a multi-language CAD ecosystem with a small, stable, curated surface. It is _not_ the right architecture for "give me every OCCT API in JavaScript with autocomplete and JSDoc." For the latter, OCJS's "auto-bind every YAML-listed C++ symbol via embind" model wins on raw API breadth.

### F2 — OCCT-Light makes BRepGraph the canonical topology and forbids `TopoDS_*` in public ABI

**Evidence**: `repos/OCCT-Light/docs/design/BREPGRAPH_AS_CANONICAL.md:1-100`, `include/occtl/occtl_topo.h:1-80`, `include/occtl/occtl_graph.h`.

`BREPGRAPH_AS_CANONICAL.md:24-37` states the rule:

> The public ABI MUST NOT mention `TopoDS_Shape` or any `TopoDS_*` type.
> All topology entry points operate on `(occtl_graph_t* graph, occtl_node_id_t node)` pairs.
> `occtl_uid_t` (persistent, wire-format) and `occtl_node_id_t` (transient, session-local) are the only topology identifiers exposed.

This is a _philosophical_ commitment: BRepGraph is treated as the canonical OCCT data model going forward, and `TopoDS_Shape` is treated as legacy implementation detail. Internally, OCCT-Light still uses `TopoDS_Shape` to call algorithms that haven't been migrated to BRepGraph (booleans, fillets, sweeps); the round-trip is invisible to the C ABI. `BREPGRAPH_AS_CANONICAL.md:268-340` documents the round-trip protocol: `BRepGraph::ToShape(node) -> TopoDS_Shape -> algorithm -> BRepGraph::Build(result, graph) -> occtl_node_id_t`.

The benefit (`BREPGRAPH_AS_CANONICAL.md:18-20`):

- **Persistent identity (`occtl_uid_t`)**: a node's UID survives `Compact()`, `Sew()`, `Heal()`, and operation boundaries (when `BRepGraph_History` is consulted). This solves the topological-naming problem that replicad/build123d/CadQuery hand-roll today.
- **O(1) adjacency**: `occtl_topo_node_parents(graph, node, ...)` and `occtl_topo_node_children(graph, node, ...)` are graph adjacency queries, not `TopExp_Explorer` traversals.
- **Layer-based metadata without OCAF**: per-node typed attributes via `occtl_layer_set/get`, no XCAF/TDF dependency.

The cost: every consumer surface — booleans, fillets, sweeps, offsets, NURBS evaluation, mesh extraction — must be re-expressed in graph-id terms in the C ABI before users can call it. **This is a multi-year curation project**, and the prototype-1 branch is two commits old.

**Implication for Tau**: Tau already has its own UID system (`shape-hasher.cpp` in replicad's wrappers, `compute_hash` returning content-hashed `XXH128` digests of OCCT shapes). Tau's intermediate-caching plan (`docs/research/cad-kernel-intermediate-caching.md`) already proposes JS-side memoisation keyed on serialised BREP. OCCT-Light's persistent-UID model is _better_ than what Tau has today (it survives operation boundaries via `BRepGraph_History` lineage), but it is not yet usable from WASM and would require a parallel kernel implementation for Replicad to consume.

### F3 — OCCT-Light WASM binding is Phase 1 and does not yet link

**Evidence**: `repos/OCCT-Light/bindings/wasm/README.md:1-60`, `bindings/wasm/package.json`, `bindings/wasm/src/`.

`bindings/wasm/README.md:7-11`:

> **Phase 1 status**: TypeScript surface compiles via `tsc`. The Emscripten link step (`emcmake cmake --build`) currently fails on unresolved `occtl_*` symbols pending a wasm-compatible OCCT-Light static archive (`libocctl.a` for `wasm32-unknown-emscripten`). No `.wasm` is yet shipped.

The WASM binding wraps the C ABI via embind-on-C: the C function `occtl_graph_create(occtl_graph_t** out_graph)` becomes the JS expression `Module.occtl_graph_create()` returning an opaque pointer that the TypeScript facade wraps in a `Graph` class with `[Symbol.dispose]`. It is exactly the embind pattern OCJS uses, but applied to the _C_ ABI (a few hundred functions) rather than the C++ surface (thousands of classes, tens of thousands of methods).

`bindings/wasm/README.md:92-120` documents the **HEAPF64 view invalidation footgun**: any allocation that grows the wasm heap invalidates all JavaScript `TypedArray` views (`HEAPU8`, `HEAPF64`, etc.); the binding's `withScratchBuffer()` helper must re-acquire views after every potential growth point. This is a real C-ABI/WASM impedance mismatch that OCJS sidesteps because embind C++ wrappers manage their own memory views.

The license tag at `bindings/wasm/package.json:8`: `"license": "AGPL-3.0-or-later"`.

**Implication for Tau**: There is _no working OCCT-Light WASM artifact_ today. Even if the linker blocker is resolved next week, the surface exposed will be ~tens of curated functions, not the 4,398 OCCT APIs Tau and replicad consume. Production Tau/replicad cannot adopt OCCT-Light WASM in any 2026 or H1-2027 timeframe.

### F4 — OCJS exposes the entire OCCT C++ public surface; OCCT-Light exposes a curated slice

**Evidence**: `repos/opencascade.js/build-configs/full.yml`, `repos/opencascade.js/build-configs/full_multi.yml`, `repos/OCCT-Light/include/occtl/*.h`, `repos/OCCT-Light/cmake/OCCTLRegistry.cmake`.

`build-configs/full.yml` is a 4,398-line YAML where each line names an OCCT class (`gp_Pnt`, `BRepBuilderAPI_MakeBox`, `BRepAlgoAPI_Cut`, `BRepFilletAPI_MakeFillet`, `Geom_BSplineSurface`, `TopoDS_Shape`, `TopoDS_Solid`, `TopoDS_Edge`, `TopExp_Explorer`, ...all of OCCT). The OCJS code generator (`src/ocjs_bindgen/`) walks each one with libclang, emits `EMSCRIPTEN_BINDINGS` C++ for every constructor/method/property, and a corresponding TypeScript class declaration with Doxygen-derived JSDoc.

Sample (`build-configs/full.yml:352-571` — 220 BRepGraph symbols):

```yaml
- symbol: BRepGraph
- symbol: BRepGraphInc_BaseDef
- symbol: BRepGraph_Builder
- symbol: BRepGraph_TransientCache
- symbol: BRepGraph_History
- symbol: BRepGraph_HistoryRecord
- symbol: BRepGraph_VersionStamp
- symbol: BRepGraph_CacheView
... (215 more)
```

Yes — **OCJS already exposes BRepGraph in full**. Anyone writing JS against `@taucad/opencascade.js` can call `oc.BRepGraph.Build(s, g)` today, manipulate `BRepGraph_TransientCache`, query `BRepGraph_History`, etc. It is OCCT v8 and OCCT v8 has BRepGraph, so OCJS has BRepGraph.

OCCT-Light's full curated surface, by comparison: ~29 C headers (`include/occtl/`), each with ~10–50 functions. Total public surface: low thousands of C functions, a tiny fraction of OCCT.

**Implication for Tau & replicad & agentic AI**: OCJS gives the LLM context-window access to every OCCT operation. OCCT-Light gives access to whatever Open Cascade SAS curators chose to expose this week. For the agentic-CAD use case (LangGraph agent driving OCCT operations from natural language), **breadth of exposed surface is a first-class value**.

### F5 — OCJS supports `additionalCppCode`/`additionalCppFiles`/`additionalBindCode` for arbitrary extension; OCCT-Light requires forking the C ABI

**Evidence**: `repos/opencascade.js/docs-site/content/docs/toolchain/guides/extend-with-cpp.mdx`, `repos/replicad/packages/replicad-opencascadejs/build-config/{custom_build_single.yml,wrappers/*.cpp}`.

The OCJS YAML schema (`src/customBuildSchema.py`) accepts:

- `additionalCppCode`: inline C++ snippets injected into the generated `bindings.cpp` before `EMSCRIPTEN_BINDINGS`.
- `additionalCppFiles`: list of paths to extra `.cpp` files compiled and linked into the final `.wasm`.
- `additionalBindCode`: inline `EMSCRIPTEN_BINDINGS(...)` blocks appended after auto-generated bindings; the consumer can register custom classes, functions, and value-objects.

Replicad uses this pattern for five concrete wrappers (`replicad-opencascadejs/build-config/wrappers/`):

- `brep-io.cpp` — `BRepToolsWrapper::ReadFromString` / `WriteToString` (string round-tripping that OCCT exposes only via streams).
- `mesh-extractor.cpp` — fast mesh extraction with stride-aligned float arrays.
- `edge-mesh-extractor.cpp` — edge polyline extraction.
- `geom2d-io.cpp` — `Geom2dToolsWrapper` for 2D curve I/O.
- `shape-hasher.cpp` — `OCJS_ShapeHasher::compute` returning content-addressed `XXH128` digests of `TopoDS_Shape` for caching keys.

Each is a 50–150 line `.cpp` file with a hand-written `EMSCRIPTEN_BINDINGS` block. The consumer YAML lists `additionalCppFiles: [wrappers/shape-hasher.cpp, ...]` and the entire bundle compiles into a single replicad-specific `.wasm`. **No OCJS fork required.**

OCCT-Light's equivalent extension model (`docs/design/ABI_PATTERNS.md:230-280`, `BINDINGS.md:300-450`):

1. Add a new C function to `include/occtl/occtl_<module>.h`.
2. Implement it in `src/internal/<module>.cpp`.
3. Update `tools/abi_dump.py` to emit it in `abi.json`.
4. Re-run binding generation across all language facades.
5. Submit upstream PR or fork.

The OCJS pattern is "drop a `.cpp` file in your config and ship." The OCCT-Light pattern is "curate it into the C ABI canonically." **OCJS's pattern is correct for downstream consumers iterating fast; OCCT-Light's is correct for upstream stewardship of a stable curated surface.**

**Implication for Tau**: Tau's iteration model (research → wrapper → ship → research → wrapper → ship) is structurally aligned with OCJS's extension model. Adopting OCCT-Light would mean either (a) accepting OCCT-Light's curated surface as-is (rejecting all custom wrappers), or (b) maintaining a fork of OCCT-Light with extended C ABI. Option (b) is roughly equivalent in maintenance burden to maintaining the taucad OCJS fork, but with vastly less surface area exposed.

### F6 — OCJS supports JS-derived virtual C++ classes via `allow_subclass` + `EMSCRIPTEN_WRAPPER`; OCCT-Light has no analogue

**Evidence**: `repos/opencascade.js/docs-site/content/docs/toolchain/guides/derive-cpp-class-in-js.mdx`.

OCJS YAML supports:

```yaml
mainBuild:
  allow_subclass:
    - symbol: Adaptor3d_Curve
    - symbol: Geom_Curve
```

…which emits an `EMSCRIPTEN_WRAPPER` for the listed virtual class, allowing JavaScript to define a subclass that overrides virtual methods, and pass the JS-side instance to OCCT C++ APIs that accept the base class. Tau uses this for custom curve adaptors; replicad uses this for custom mesh visitors. **It is a critical capability for agentic CAD where the LLM may need to provide a callback into OCCT.**

OCCT-Light's C ABI cannot express this directly; the C ABI does not have virtual methods. The closest analogue would be hand-written callback function pointers (`typedef occtl_status_t (*occtl_curve_eval_fn)(double t, double xyz[3], void* userdata)`), but this requires a separate C function pointer for every virtual base class, hand-curated. As of prototype-1, none are exposed.

### F7 — OCJS uses OCCT's native `opencascade::handle` smart-pointer model; OCCT-Light replaces it with opaque IDs

**Evidence**: `repos/opencascade.js/src/ocjs_smart_ptr.h`, `repos/opencascade.js/docs-site/content/docs/toolchain/guides/embind-smart-pointer-traits.mdx`.

OCJS provides an embind smart-pointer trait specialisation for `opencascade::handle<T>`, the OCCT-native intrusive reference-counting smart pointer. JavaScript holds JS references to wrapped `Handle(Geom_Curve)`, `Handle(TopoDS_TShape)`, `Handle(BRepBuilderAPI_MakeFace)`, etc.; the C++ refcount and JS GC interact via embind's `smart_ptr_trait`. OCCT idioms (`Handle(Geom_BSplineCurve)::DownCast(c)`) translate to JS as `oc.Handle_Geom_BSplineCurve_1.DownCast(c)`. This is _the_ OCCT idiom; binding it correctly is a non-trivial achievement and a key OCJS strength.

OCCT-Light's identity model is `occtl_node_id_t` (transient int) + `occtl_uid_t` (persistent value). There are no smart pointers in the public ABI. Internally, the C++ implementation still uses OCCT handles, but they are not visible to consumers. **This is simpler for casual users but loses OCCT's reference-counted ergonomics (cheap pass-by-value, automatic lifetime).**

**Implication**: OCJS's binding model preserves OCCT semantic fidelity; OCCT-Light's binding model deliberately abandons it for ABI simplicity. Power users (replicad, Tau kernel authors) gain from OCJS's fidelity; novice users may gain from OCCT-Light's simplicity. Tau is in the power-user camp.

### F8 — OCJS has a working, documented, content-addressed incremental compile cache; OCCT-Light has only `cmake --build`

**Evidence**: `repos/opencascade.js/build-wasm.sh:200-450`, `repos/opencascade.js/docs-site/content/docs/toolchain/guides/incremental-cache.mdx`.

The OCJS build pipeline (~867 lines of bash in `build-wasm.sh`) is sophisticated:

1. Parse YAML build config (Python `customBuildSchema.py`).
2. Run `ocjs_bindgen` (libclang AST + Doxygen XML → `bindings.cpp` + `*.d.ts`).
3. Compute content hash of `bindings.cpp` + extra cpps + emcc flags.
4. Look up cached `.o` files in `~/.cache/ocjs/objects/<hash>/`.
5. Compile only changed translation units.
6. Link via `emcc` with `--whole-archive` for OCCT static libs.
7. Emit `opencascade_full.{js,wasm,d.ts}` (single-threaded) or `opencascade_full_multi.*` (`-pthread`).
8. Optional `wasm-opt -O3` pass.

A typical incremental build (one symbol added) takes ~30 seconds; a clean build takes ~20 minutes on M-series Macs. **This is production-grade build infrastructure.**

OCCT-Light's `bindings/wasm/`: a `CMakeLists.txt` that calls `add_executable(occtl_wasm ...)` with `--bind` linker flag, no caching, no incremental codegen, currently failing to link.

### F9 — OCCT-Light forbids OCAF/XCAF; OCJS exposes them in full

**Evidence**: `repos/OCCT-Light/docs/design/MODULES.md:84-119`, `repos/opencascade.js/build-configs/full.yml` (search for `XCAF` or `TDocStd`).

`MODULES.md:84-119`:

> **Modules excluded from OCCT-Light by design**: OCAF (TDocStd, TDF, TPrsStd), XCAF (XCAFDoc, XCAFApp, XmlXCAFDrivers, BinXCAFDrivers, IGES/STEP XCAFDoc readers/writers), DataExchange OCAF readers/writers, AdvApp2Var (legacy), Draw harness.

OCAF/XCAF is the OCCT document framework — application-data containers, attributes on shapes, undo/redo, persistent serialisation. OCCT-Light deliberately excludes it as "too coupled to OCAF's design philosophy" and offers BRepGraph layers + BRepGraph history as a leaner alternative.

OCJS includes the full XCAFDoc / TDocStd surface (search `full.yml` for `XCAFDoc`, `TDocStd_Document`, `TDF_Label`, `TDataStd_*` — all present, all bound). Tau does not currently use XCAF, but **the agentic-CAD long-term roadmap includes assembly metadata, materials, BOMs, and product structure** — all of which live in XCAF. OCJS preserves the option; OCCT-Light forecloses it.

### F10 — Licence delta is the single most consequential difference

**Evidence**: `repos/opencascade.js/package.json:21`, `repos/OCCT-Light/README.md:200-220`, `repos/OCCT-Light/include/occtl/occtl_topo.h:1-15`, `repos/OCCT-Light/bindings/python/README.md:1-15`.

OCJS license: `LGPL-2.1-only WITH Open-CASCADE-Exception-1.0` (`opencascade.js/package.json:21`). Same license as OCCT itself. The OCC exception removes the LGPL "linking exception" issue: closed-source applications can statically link OCCT (and OCJS) without entering LGPL copyleft. **This is the license SaaS CAD platforms — Onshape's headless engine choices, Shapr3D's web export pipeline, Tau — depend on.**

OCCT-Light license: `AGPL-3.0-or-later` (`README.md:203-207`, every public header). AGPL extends GPL copyleft to network-deployed software: any web service whose backend links AGPL code must release the entire service's source under AGPL. **This is a deliberate strategic choice by Open Cascade SAS to drive commercial-license revenue from SaaS CAD vendors.**

`include/occtl/occtl_topo.h:11-12`:

> // Licensed under AGPL-3.0-or-later. Commercial licenses available
> // from Open Cascade SAS for proprietary use.

For Tau (`tau.new`, public-facing CAD SaaS), AGPL adoption is incompatible with the current product strategy. Even for the headless `@taucad/cli` and `@taucad/runtime` libraries published to npm, AGPL would cascade into every consumer, making them unusable for commercial CAD pipelines.

**Implication**: License alone is sufficient justification to maintain OCJS as the primary OCCT bridge for Tau's public surface, regardless of OCCT-Light's eventual technical merits.

### F11 — OCJS ships dual single-threaded / multi-threaded WASM variants; OCCT-Light WASM is single-threaded only

**Evidence**: `repos/opencascade.js/build-configs/full_multi.yml`, `repos/opencascade.js/build-wasm.sh:380-450`, `repos/OCCT-Light/bindings/wasm/README.md:130-150`.

OCJS produces `opencascade_full_multi.{js,wasm,d.ts}` via `emcc -pthread -s USE_PTHREADS=1 -s PTHREAD_POOL_SIZE=4`, enabling OCCT's internal `OSD_ThreadPool` and `BOPTools_Parallel` parallel boolean-fragment computation. Tau opts into the MT variant for production renders of complex assemblies; replicad opts into the ST variant for compatibility with environments that disallow `SharedArrayBuffer`.

OCCT-Light WASM: explicitly single-threaded in prototype-1 (`bindings/wasm/README.md:130-150`). The threading-model section says "future work" and notes that OCCT's threadpool would need to be configured at OCCT-Light static-library build time.

### F12 — OCJS has 12 documented research issues; OCCT-Light's known issues are mostly "unimplemented, planned"

**Evidence**: `docs/research/ocjs-*.md` (12 files), `repos/OCCT-Light/CLAUDE.md`, `bindings/wasm/README.md:7-11`.

OCJS's known issues are _real production failure modes_ the taucad fork has investigated and partially solved:

- Embind smart-pointer staleness with shared-references (`embind-smart-pointer-stale-ptr.md`)
- TypeScript codegen gaps for templated classes (`ocjs-typescript-codegen-gap-analysis.md`)
- `additionalCppCode` type-erasure regression with embind value-objects (`ocjs-additionalcppcode-type-erasure-regression.md`)
- JS dispatch failures on overloaded virtual methods (`ocjs-embind-js-dispatch-failures.md`)
- Trailing-default-arity fan-out causing exponential binding bloat (`ocjs-trailing-default-arity-fan-out.md`)
- CMake cache race condition under parallel builds (`ocjs-cmake-cache-race-condition.md`)

Each is a workspace research doc with a concrete reproduction, root cause, and (in most cases) a landed mitigation. **This is the cost of running production CAD WASM — the bugs are real, well-understood, and being fixed.**

OCCT-Light's known issues (`bindings/wasm/README.md:7-11`, `CLAUDE.md`):

- WASM linker blocker (no `libocctl.a` for emscripten target).
- Most modules are stubs awaiting implementation.
- Most language facades are scaffolding without backing C-ABI implementation.

These are _implementation absence_, not design flaws. They will be resolved over months/years of work.

**Implication**: OCJS is a mature, debugged, known-quantity production tool. OCCT-Light is an aspirational prototype. Picking between them in 2026 is not a technical comparison; it's a maturity comparison.

### F13 — OCJS's TypeScript declarations are 260,783 lines of Doxygen-derived JSDoc; OCCT-Light's are hand-curated

**Evidence**: `repos/opencascade.js/build-configs/opencascade_full.d.ts` (260,783 lines), `repos/OCCT-Light/bindings/wasm/src/types/`.

OCJS extracts JSDoc from OCCT's Doxygen XML, attaches it to every emitted method, and ships a single `.d.ts` consumed by Monaco / ts-language-server. Sample (random pick from the file):

```typescript
/**
 * @brief Performs the cut of two shapes.
 *
 * @param[in] theObject  the first shape (the object).
 * @param[in] theTool    the second shape (the tool).
 *
 * The returned shape is the difference theObject - theTool.
 */
constructor_1(theObject: TopoDS_Shape, theTool: TopoDS_Shape): BRepAlgoAPI_Cut;
```

Every method on every class has Doxygen-derived JSDoc. **This is the LLM tool-description budget.** When LangGraph drives an agent that calls `oc.BRepAlgoAPI_Cut.constructor_1(s1, s2)`, the agent sees the Doxygen description as the parameter description.

OCCT-Light's TS surface is hand-curated with hand-written JSDoc on each function. Total surface today: tens of functions, dozens of comments. Will it ever reach OCCT's full Doxygen depth? Almost certainly not — that would defeat the curation purpose.

### F14 — OCCT-Light's value-object model is right; OCJS's is improving

**Evidence**: `repos/OCCT-Light/docs/design/ABI_PATTERNS.md:312-380`, `repos/opencascade.js/docs-site/content/docs/toolchain/guides/return-by-value.mdx`.

OCCT-Light's C ABI deals only in:

- Opaque handles: `occtl_graph_t*`, `occtl_node_iter_t*`.
- POD value structs: `occtl_xyz_t { double x; double y; double z; }`, `occtl_aabb_t`, `occtl_color_t`.
- Persistent UIDs: `occtl_uid_t` (16-byte value).

There is no concept of "stale C++ object after JS GC" because there are no C++ objects in the ABI. There is no smart-pointer staleness because there are no smart pointers. The only resource model is "create handle → use → dispose handle" (`Symbol.dispose`).

OCJS has been progressively migrating to _return-by-value_ (RBV) for OCCT value-types like `gp_Pnt`, `gp_Vec`, `gp_Trsf`, where the binding emits `embind::value_object<gp_Pnt>` and JS receives a plain object literal `{ x, y, z }` instead of a wrapped `gp_Pnt` handle requiring `.delete()`. This is _the right model_; OCCT-Light has it natively because its ABI was designed with it in mind. OCJS is retrofitting it onto an embind binding that originally wrapped every C++ class as a `Module.gp_Pnt` constructor.

**Implication**: OCJS will continue closing the value-object gap; OCCT-Light starts there. For new bindings being written today, value-object semantics are simpler in OCCT-Light. For the 4,000+ existing OCJS bindings, retrofitting RBV is ongoing work but not strategically blocked.

### F15 — Repo-level signals: stars, contributors, velocity

**Evidence**: GitHub metadata at clone time (May 2026).

| Signal             | OCCT-Light                  | opencascade.js (taucad fork)                 |
| ------------------ | --------------------------- | -------------------------------------------- |
| GitHub stars       | 11                          | (taucad fork) 14; (donalffons upstream) 1.2k |
| Forks              | 2                           | (taucad) 0; (upstream) 96                    |
| Contributors       | 1 (Open Cascade SAS)        | (taucad) 1; (upstream) 28                    |
| First commit       | 2025-11-12                  | 2018-06                                      |
| Latest commit      | 2026-05-22 (prototype-1)    | 2026-05 (taucad active)                      |
| Total commits      | 2                           | 1,400+ upstream + ~80 taucad                 |
| Production users   | 0 (no working WASM)         | replicad, Tau, build123d-js, others          |
| Funding model      | Open Cascade SAS commercial | Community / Tau-funded                       |
| Roadmap visibility | High (8 design docs)        | Medium (toolchain docs site)                 |

OCCT-Light has the institutional weight of Open Cascade SAS (the OCCT vendor); OCJS has the network effect of an established npm ecosystem. **Both signals are real; neither is decisive.**

## Comparative Matrix

| Dimension                                  | OCCT-Light (prototype-1)                                                               | @taucad/opencascade.js (v3.0.0-beta.2)                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Author / Steward**                       | Open Cascade SAS (OCCT vendor)                                                         | Donalffons (upstream) + Tau team (taucad fork)                                        |
| **License**                                | AGPL-3.0-or-later (commercial available)                                               | LGPL-2.1-only WITH Open-CASCADE-Exception-1.0                                         |
| **OCCT version pinned**                    | OCCT v8 (canonical BRepGraph)                                                          | V8_0_0 (commit `d3056ef`)                                                             |
| **Public ABI**                             | Hand-written C ABI (`occtl_*`)                                                         | Auto-generated embind C++ bindings                                                    |
| **Surface size**                           | Curated (~tens of headers, low-thousands of functions)                                 | Exhaustive (4,398 OCCT classes, full method set)                                      |
| **TS declarations**                        | Hand-written (~hundreds of lines)                                                      | Auto-generated 260,783-line `.d.ts` with Doxygen JSDoc                                |
| **Topology identity**                      | `occtl_node_id_t` (transient) + `occtl_uid_t` (persistent)                             | OCCT-native `opencascade::handle<TopoDS_TShape>` smart pointers                       |
| **Smart pointers**                         | None in ABI; opaque handles + POD values                                               | `opencascade::handle<T>` via embind smart-ptr trait                                   |
| **Value-object semantics**                 | First-class (designed in)                                                              | Retrofitted via RBV codegen (in progress)                                             |
| **Extension model**                        | Fork C ABI; regenerate facades                                                         | `additionalCppCode`/`additionalCppFiles`/`additionalBindCode` (drop a `.cpp` in YAML) |
| **JS-derived virtual classes**             | Not supported (C ABI lacks virtuals)                                                   | Supported via `allow_subclass` + `EMSCRIPTEN_WRAPPER`                                 |
| **OCAF / XCAF support**                    | Excluded by design (`MODULES.md:84-119`)                                               | Full XCAFDoc, TDocStd, TDF surface bound                                              |
| **WASM binding status**                    | Phase 1, linker blocker, no shipping `.wasm`                                           | Production-shipping; dual ST/MT variants; `wasm-opt -O3`                              |
| **Threading**                              | Single-threaded only (prototype-1)                                                     | Single-threaded + multi-threaded `-pthread` builds                                    |
| **Build infrastructure**                   | `cmake --build` with no caching                                                        | 867-line bash + Python codegen + content-addressed object cache                       |
| **Memory model**                           | C ABI with `occtl_alloc`/`occtl_free`; HEAPF64 view invalidation footgun               | Embind manages memory; `.delete()` for handles, RBV for value-objects                 |
| **Error handling**                         | `occtl_status_t` return codes; no exceptions across ABI                                | C++ exceptions captured via embind; rethrown as JS errors                             |
| **Languages targeted**                     | Python, C#, Node, WASM, Rust, Go, Java, Swift                                          | JavaScript / TypeScript only (WASM target)                                            |
| **Per-language idiom**                     | Hand-curated facades (`__enter__`/`__exit__`, `IDisposable`, `Drop`, `Symbol.dispose`) | TypeScript classes mirroring OCCT C++ exactly                                         |
| **Persistent identity across `Compact()`** | Yes (`occtl_uid_t` survives via `BRepGraph_History`)                                   | No (consumer must serialise BREP and hash; replicad's `OCJS_ShapeHasher`)             |
| **Shipping production users**              | 0 (linker blocker)                                                                     | replicad, build123d-js, Tau (Replicad + OpenCASCADE kernels)                          |
| **Stars / forks**                          | 11 / 2                                                                                 | 14 / 0 (taucad); 1.2k / 96 (upstream)                                                 |
| **Total commits**                          | 2                                                                                      | 1,400+ upstream + ~80 taucad                                                          |
| **Latest activity**                        | 2026-05-22 (prototype-1)                                                               | 2026-05 (active)                                                                      |
| **Documentation depth**                    | 8 design docs (~3,000 lines)                                                           | Toolchain docs site + 12 research docs                                                |
| **Agentic-AI friendliness**                | Constrained by curated surface size                                                    | Full OCCT API reachable, JSDoc on every method                                        |

## Why OCJS Over OCCT-Light: The Defensible Narrative

A user asking _"why should I use `@taucad/opencascade.js` instead of `@occtl/wasm` once it ships?"_ deserves a real answer. Here are the seven that hold up under technical scrutiny.

### 1. License compatibility for SaaS / commercial / agentic-CAD products

OCJS ships under LGPL+OCC-exception; OCCT-Light ships under AGPL. For any web service, public SaaS, agentic-CAD product, or commercial CAD pipeline, OCJS is usable; OCCT-Light requires either commercial relicensing from Open Cascade SAS or AGPL-compatible distribution of the entire consuming application. **For Tau (`tau.new`, public SaaS), this is dispositive.**

### 2. Full OCCT public surface vs curated slice

OCJS exposes 4,398 OCCT classes — every algorithm, every primitive, every adaptor, every healing utility, every XCAF document API. OCCT-Light exposes a curated slice (low thousands of C functions). For agentic CAD where the LLM may need any OCCT operation, **breadth is value**.

### 3. Doxygen-derived JSDoc on every method

OCJS's auto-generated `.d.ts` (260k lines) carries OCCT's Doxygen as JSDoc, providing per-method semantic descriptions to Monaco autocomplete and to LLM tool descriptions. OCCT-Light's hand-curated TS lacks this depth and structurally cannot match it (curation is not auto-extractable from OCCT's Doxygen).

### 4. Arbitrary C++ extension via `additionalCppCode` / `additionalCppFiles` / `additionalBindCode`

Drop a `.cpp` file in a YAML config; ship a custom `.wasm`. Replicad does this for `BRepToolsWrapper`, `OCJS_ShapeHasher`, mesh extractors. Tau does this for `TopoDS_Cast` downcasts and FairCurve helpers. **This is the most flexible binding-extension model in the WASM CAD landscape.** OCCT-Light's curated-C-ABI model fundamentally cannot offer this without forking the C ABI itself.

### 5. JS-derived virtual classes (`allow_subclass`)

OCJS lets JS code subclass `Adaptor3d_Curve`, `Geom_Curve`, `BOPAlgo_Operation`, etc., overriding C++ virtual methods from JavaScript. This is impossible in OCCT-Light's C ABI by construction (no virtuals across C ABI). Critical for agentic CAD callbacks and for custom mesh visitors.

### 6. OCCT-native smart-pointer fidelity (`opencascade::handle<T>`)

OCJS preserves OCCT's `Handle(T)::DownCast(x)` idiom in JS. Power users (replicad core team, Tau kernel authors) work in OCCT idioms; OCJS supports them natively. OCCT-Light replaces the smart-pointer model with opaque IDs, which is simpler for novices but a semantic step backwards for OCCT-fluent developers.

### 7. Production maturity and known-quantity bug landscape

OCJS has 12 documented research issues with reproducible failures, root causes, and landed mitigations. OCCT-Light has aspirational design docs and a non-shipping WASM binding. **For production CAD, "we know our bugs and how to fix them" is more valuable than "we hope our design will avoid bugs."**

## Where OCCT-Light Genuinely Wins (and what Tau should learn from it)

It would be intellectually dishonest to position OCJS as strictly better. OCCT-Light wins on several axes that are _real_ and that Tau should track:

### W1 — Persistent UID identity model

`occtl_uid_t` survives `Compact()`, operation boundaries, and serialisation. This solves topological-naming the way OCCT v8 + BRepGraph + `BRepGraph_History` is designed to solve it. Replicad currently solves the same problem via `OCJS_ShapeHasher` content-addressed BREP digests, which is a _workaround_ for not having persistent IDs. **If Tau wants topological-naming semantics that survive parameter changes, OCCT-Light's UID model is the right answer.** Tau can adopt the same pattern in its OCJS-based stack today (the BRepGraph symbols are bound; the API is callable from JS), but doing so requires writing the JS-side adapter that OCCT-Light writes once in C++.

### W2 — Cross-language facade uniformity

If Tau ever needs Python or Rust or Go bindings to its CAD operations (e.g. for a server-side CAD pipeline, a desktop CLI in Rust, a Python evaluation harness), OCCT-Light's "one C ABI, eight idiomatic facades" model is the right architecture. OCJS is JS-only and structurally cannot extend to non-JS languages without reimplementing the binding generator per language.

### W3 — Curated surface area for novice users

A user new to OCCT facing OCJS's 4,398 classes is overwhelmed; the same user facing OCCT-Light's curated few-hundred functions is approachable. **For tutorial-grade documentation and hello-world examples, OCCT-Light wins on user friendliness.** Tau already mitigates this via curated kernel APIs (`@taucad/runtime`'s replicad/opencascade kernels), but the underlying surface is still OCJS-sized.

### W4 — License clarity for the open-source community

Some communities prefer AGPL specifically because it forces all derived web services to release source. For those communities (academic CAD research, GPL-aligned open-source projects), OCCT-Light's license is a _feature_. OCJS's license is more permissive but precludes certain GPL-aligned projects from depending on it.

### W5 — Memory-model simplicity

Opaque handles + POD value structs + explicit `dispose()` is a simpler memory model than OCCT's `opencascade::handle<T>` + JS GC + embind smart-pointer traits. OCJS has had real bugs in this seam (`embind-smart-pointer-stale-ptr.md`); OCCT-Light has none because the seam doesn't exist.

### W6 — Build determinism

OCCT-Light's `cmake --build` produces byte-identical output across invocations. OCJS's content-addressed cache is good but still depends on Python codegen, libclang AST stability, and Doxygen XML stability. For reproducibility-critical pipelines (academic CAD research, regulated CAD), OCCT-Light's simpler build is more attractive.

## Recommendations

### R1 — Continue maintaining the taucad opencascade.js fork as the primary OCCT bridge for Tau

**Rationale**: License (LGPL+OCC-exception vs AGPL), surface size (4,398 vs ~hundreds), production maturity (shipping vs Phase 1 with linker blocker), extension model (`additionalCppCode` vs fork-the-ABI), agentic-CAD breadth (full Doxygen JSDoc on every method).

**Action**: No change to current trajectory. Continue OCCT v8 alignment, continue ocjs_bindgen evolution, continue value-object RBV migration, continue replicad coordination.

### R2 — Track OCCT-Light prototype-1 progress, but do not pivot

**Rationale**: OCCT-Light is meaningful as a signal of Open Cascade SAS's strategic direction (BRepGraph as canonical, persistent UID, cross-language facade uniformity) but is two commits old, has no working WASM, and ships under AGPL.

**Action**:

- Subscribe `Open-Cascade-SAS/OCCT-Light` releases.
- Re-evaluate every 6 months or on major release.
- Specifically watch for: (a) WASM linker blocker resolution, (b) AGPL re-licensing or dual-license clarification, (c) curated surface size growth, (d) production user adoption.

### R3 — Adopt OCCT-Light's persistent UID identity model in OCJS today

**Rationale**: BRepGraph is bound in OCJS (220 symbols, `full.yml:352-571`). The API is callable from JS today. Tau's intermediate-caching plan (`docs/research/cad-kernel-intermediate-caching.md`) already proposes content-addressed JS-side memoisation; layering BRepGraph-derived persistent UIDs on top would solve topological-naming-across-parameter-changes.

**Action**:

- Prototype a `BRepGraphIdentityService` in `packages/runtime/src/identity/` that calls `BRepGraph::Build(s, g)` and maps node UIDs back to JS shape objects.
- Compare with replicad's `OCJS_ShapeHasher` content-hash approach for stability and performance.
- If validated, layer persistent-UID selectors into `@taucad/runtime`'s topological-naming system.

### R4 — Document the OCJS strategic moat in `@taucad/opencascade.js` README

**Rationale**: The "why OCJS over OCCT-Light" narrative deserves to be visible to community users evaluating the choice. The taucad fork's README should make the seven-point case explicitly.

**Action**: Add a `## Why OCJS over OCCT-Light` section to `@taucad/opencascade.js` README and/or docs site, citing license (LGPL vs AGPL), surface size, extension model, production maturity, JSDoc depth, and JS-derived virtuals.

### R5 — Consider an `@occtl/wasm` cross-evaluation harness once it ships

**Rationale**: When OCCT-Light WASM ships a working binary, an apples-to-apples benchmark (mesh extraction, boolean ops, fillet/sweep) on the same OCCT v8 commit will inform the durability of OCJS's lead.

**Action**: Once OCCT-Light WASM is link-clean, run the existing `packages/testing` geometry analysis suite against both bindings on identical inputs. Publish the results as a follow-up research doc.

### R6 — Continue investing in OCJS `additionalCppCode` ergonomics

**Rationale**: This is OCJS's strategic moat and the capability OCCT-Light fundamentally cannot offer. Ergonomic improvements compound.

**Action**:

- Resolve the `ocjs-additionalcppcode-type-erasure-regression.md` issue.
- Document the wrapper pattern (replicad's five `.cpp` wrappers) as canonical examples in the docs site.
- Consider a `@taucad/ocjs-extension-kit` package distributing common wrappers (BREP I/O, mesh extraction, hash) as drop-in `additionalCppFiles`.

### R7 — Refuse the false binary

OCCT-Light is not a competitor to OCJS; it is a different artifact serving different use cases. The framing "should we replace OCJS with OCCT-Light?" is malformed. The correct framing: "OCJS is Tau's production OCCT bridge today; OCCT-Light is a reference design we should learn from and may consume in parallel for specific use cases (cross-language CAD pipelines, AGPL-aligned community contributions, persistent UID research)."

## Trade-offs (Adversarial Analysis)

| Trade-off                                            | OCCT-Light favoured                  | OCJS favoured                                              |
| ---------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| **Public SaaS / commercial CAD**                     | —                                    | License (LGPL+exception); essential                        |
| **AGPL-aligned open-source CAD**                     | License alignment                    | —                                                          |
| **Agentic AI with full OCCT API access**             | —                                    | 4,398-symbol surface + Doxygen JSDoc                       |
| **Tutorial / novice CAD developer**                  | Curated surface (~hundreds of fns)   | —                                                          |
| **Cross-language CAD pipeline (Python/Rust/Go)**     | Hand-curated facades for 8 languages | JS-only                                                    |
| **Custom OCCT C++ extension via wrappers**           | —                                    | `additionalCppCode`/`additionalCppFiles`                   |
| **JS-derived virtual classes (callbacks into OCCT)** | —                                    | `allow_subclass` + `EMSCRIPTEN_WRAPPER`                    |
| **OCAF/XCAF document framework**                     | Excluded by design                   | Full surface bound                                         |
| **Persistent UID identity across `Compact()`**       | Native (`occtl_uid_t`)               | Achievable via BRepGraph (bound), but consumer-implemented |
| **Multi-threaded WASM**                              | —                                    | `opencascade_full_multi.{js,wasm}` shipping                |
| **Production reliability today**                     | —                                    | Shipping; replicad+Tau in production                       |
| **Future-proofing if OCCT-Light becomes dominant**   | Direct adoption                      | Continued maintenance burden                               |
| **Reproducible builds**                              | `cmake --build`, deterministic       | Content-addressed cache + Python codegen                   |
| **Memory-model simplicity**                          | Opaque handles + POD                 | Smart pointers + RBV in transition                         |

## State of the State

| Project                                         | Maturity                                                                                     | Production users      | License                                         | Path to OCCT-Light parity                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **`@taucad/opencascade.js` (taucad fork)**      | Production v3.0.0-beta.2; OCCT V8_0_0; dual ST/MT WASM; 4,398 symbols; content-cached builds | replicad, Tau, others | LGPL-2.1 + Open-CASCADE-Exception-1.0           | Already exposes BRepGraph (220 symbols); UID/history adoption is a JS-side library project      |
| **`donalffons/opencascade.js` (upstream)**      | OCCT 7.7-7.8 era; widely adopted; not actively driving toward OCCT v8                        | build123d-js, others  | LGPL-2.1 + Open-CASCADE-Exception-1.0           | Will follow taucad lead on OCCT v8; not pursuing OCCT-Light parity                              |
| **`Open-Cascade-SAS/OCCT-Light` (prototype-1)** | Phase 1 prototype; WASM linker blocker; no shipping binary; 2 commits                        | None                  | AGPL-3.0-or-later; commercial license available | Multi-year curation project; ~tens of headers grown to hundreds; per-language facade maturation |

## References

- `/Users/rifont/git/tau/repos/OCCT-Light/README.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/AGENTS.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/ARCHITECTURE.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/ABI_PATTERNS.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/BREPGRAPH_AS_CANONICAL.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/BINDINGS.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/MODULES.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/docs/design/CODING_STYLE.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/include/occtl/occtl_topo.h`
- `/Users/rifont/git/tau/repos/OCCT-Light/include/occtl/occtl_graph.h`
- `/Users/rifont/git/tau/repos/OCCT-Light/include/occtl-hpp/occtl.hpp`
- `/Users/rifont/git/tau/repos/OCCT-Light/bindings/wasm/README.md`
- `/Users/rifont/git/tau/repos/OCCT-Light/bindings/wasm/package.json`
- `/Users/rifont/git/tau/repos/OCCT-Light/cmake/OCCTLRegistry.cmake`
- `/Users/rifont/git/tau/repos/OCCT-Light/CMakePresets.json`
- `/Users/rifont/git/tau/repos/opencascade.js/package.json`
- `/Users/rifont/git/tau/repos/opencascade.js/build-wasm.sh`
- `/Users/rifont/git/tau/repos/opencascade.js/DEPS.json`
- `/Users/rifont/git/tau/repos/opencascade.js/build-configs/full.yml`
- `/Users/rifont/git/tau/repos/opencascade.js/build-configs/full_multi.yml`
- `/Users/rifont/git/tau/repos/opencascade.js/src/customBuildSchema.py`
- `/Users/rifont/git/tau/repos/opencascade.js/src/ocjs_smart_ptr.h`
- `/Users/rifont/git/tau/repos/opencascade.js/docs-site/content/docs/toolchain/guides/extend-with-cpp.mdx`
- `/Users/rifont/git/tau/repos/opencascade.js/docs-site/content/docs/toolchain/guides/derive-cpp-class-in-js.mdx`
- `/Users/rifont/git/tau/repos/opencascade.js/docs-site/content/docs/toolchain/guides/return-by-value.mdx`
- `/Users/rifont/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml`
- `/Users/rifont/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/brep-io.cpp`
- `/Users/rifont/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/mesh-extractor.cpp`
- `/Users/rifont/git/tau/repos/replicad/packages/replicad-opencascadejs/build-config/wrappers/shape-hasher.cpp`
- `/Users/rifont/git/tau/docs/research/cad-kernel-intermediate-caching.md`
- `/Users/rifont/git/tau/docs/research/ocjs-typescript-codegen-gap-analysis.md`
- `/Users/rifont/git/tau/docs/research/ocjs-additionalcppcode-type-erasure-regression.md`
- `/Users/rifont/git/tau/docs/research/ocjs-embind-js-dispatch-failures.md`
- `/Users/rifont/git/tau/docs/research/embind-smart-pointer-stale-ptr.md`
- `/Users/rifont/git/tau/docs/research/embind-return-strategy-benchmarks.md`
- `/Users/rifont/git/tau/docs/research/wasm-smart-pointer-landscape.md`
