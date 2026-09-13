---
title: 'OCJS Suffix-Free Overload Dispatch — Cost-Quantification Experiment Design'
description: 'Design specification for an isolated microbenchmark that quantifies the per-call and per-workload cost imposed by the libembind-overloading.patch same-arity dispatch mechanism (C1) against pristine upstream embind, using a mock OCCT corpus derived from the birdhouse example.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: optimization
related:
  - docs/research/ocjs-libembind-strategic-direction-assessment.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-trailing-default-arity-fan-out.md
---

# OCJS Suffix-Free Overload Dispatch — Cost-Quantification Experiment Design

Design spec for `experiments/poc-overload-dispatch-cost/` — a self-contained PoC that measures the runtime cost of the C1 (same-arity, type-based) dispatch mechanism added by `src/patches/libembind-overloading.patch` against pristine upstream embind, using a mock OCCT corpus sized to the call patterns of real CAD models (birdhouse benchmark from `libs/tau-examples/src/kernels/replicad/birdhouse/main.ts`).

## Executive Summary

The strategic assessment in [`ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md) recommends **Option C — keep the C1 same-arity dispatch concern, retire the C2 arity fan-out concern**. The C1 case rests on correctness/architectural arguments today; its **per-call overhead is unquantified**. Existing experiments (`poc-overload-dispatch`, `libembind-fan-out-poc`) prove that C1 dispatches correctly, but none measures how much it costs. This is the empirical gap.

This document specifies a 2-state libembind × 3-tier mock-OCCT × 5-metric experiment that produces ns/op numbers defensible in upstream embind discussion (`donalffons/opencascade.js#301`) and grounds the Option C recommendation in measured rather than implied cost. The experiment must reuse the pristine-vs-patched libembind toggle pattern already proven in `libembind-fan-out-poc/apply-libembind-patch.sh`, build twice via the vendored `assimpjs/emsdk` emscripten, and bench via a `q67-rbv-cost`-style ns/op hot loop.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings (from prior PoCs)](#findings-from-prior-pocs)
- [Experiment Design](#experiment-design)
- [Metrics](#metrics)
- [Hypotheses](#hypotheses)
- [Recommendations for the Implementing Agent](#recommendations-for-the-implementing-agent)
- [Code Skeletons](#code-skeletons)
- [References](#references)
- [Appendix A — Real-World Same-Arity Overload Inventory (Birdhouse + Replicad)](#appendix-a--real-world-same-arity-overload-inventory-birdhouse--replicad)
- [Appendix B — libembind Patch Anatomy (the cost surface)](#appendix-b--libembind-patch-anatomy-the-cost-surface)

## Problem Statement

The taucad fork's `libembind-overloading.patch` adds type-based same-arity overload dispatch ("C1" in the strategic-direction taxonomy) to upstream embind, which natively supports only arity-based dispatch. The patch enables OCJS to expose OCCT's overloaded API (e.g., `BRepBuilderAPI_MakeEdge` with 8+ same-arity overloads) under suffix-free names in JavaScript, fulfilling V3's `BREAKING_CHANGES.md §B1` commitment.

The dispatch path the patch installs runs on **every** call to a registered embind method, not just methods with multiple overloads — every `proto[methodName]` invocation now goes through `overloadTable[args.length] → getSignature(args, keys) → signatures[signature].apply(this, args)`. The per-call cost of this path is:

1. **Unknown today.** No PoC or production benchmark isolates dispatch cost from OCCT compute cost.
2. **Bounded only by guess.** The strategic doc asserts the cost is "acceptable" without a number. That assertion is undefendable in upstream embind PR review.
3. **Variable in N.** For an arity bucket containing N same-arity overloads, the patched dispatcher runs a linear `signaturesArray` scan with per-arg type discrimination. Worst-case CAD targets (`BRepBuilderAPI_MakeEdge` 3-arg bucket) have **8+** entries.

The question this experiment answers:

> Given pristine upstream embind as baseline, and `libembind-overloading.patch` as patched, what is the per-call dispatch overhead (ns/op) for: (a) single-overload methods (per-call tax), (b) N-overload methods at single arity (scan cost), and (c) a realistic CAD workload (end-to-end %)?

### Scope and Non-Goals

**In scope**:

- Per-call dispatch tax for methods with 1 overload (tax-on-every-method)
- Scan cost growth as N grows from 2 → 8 overloads in a single arity bucket
- End-to-end percentage overhead on a birdhouse-equivalent call sequence
- Registration-time (one-shot) cost of the patched libembind on Module init
- Bundle-size delta from the patch in the produced JS glue

**Out of scope**:

- C2 (arity fan-out for trailing defaults) cost — that concern is being retired per the strategic doc; benchmarking it would be wasted effort
- OCCT WASM compute cost (orthogonal; the mock C++ bodies are trivial by design to isolate dispatch)
- Cross-runtime comparison vs pybind11 — that lives in `experiments/build123d-vs-ocjs/`
- The R1+R2 `Object.hasOwn` registration-time gate cost — measured trivially (one-shot, negligible) by `libembind-fan-out-poc`'s registration matrix; not the per-call concern this experiment targets

## Methodology

### Two libembind states

The vendored `assimpjs/emsdk/upstream/emscripten/src/lib/libembind.js` currently has the OCJS overloading patch baked into its `.pristine` snapshot (verified: 21 occurrences of `ensureOverloadSignatureTable`/`getSignature`/`cppTypeToJsType` matchers, where pristine upstream embind has 0). The existing `libembind-fan-out-poc/apply-libembind-patch.sh` toggles R1+R2 gates on top of that pre-patched baseline — that is **not** the toggle we want here.

This experiment needs to toggle the **entire C1 mechanism**:

| State        | How to produce                                                                                                                          | Behaviour                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Baseline** | Reverse-apply `src/patches/libembind-overloading.patch` against the vendored libembind.js (or vendor a fresh upstream emsdk libembind). | Upstream arity-only dispatch. Registering two same-arity ctors throws at module init.      |
| **Patched**  | Vendored libembind.js as-is (the current `.pristine` snapshot).                                                                         | Same-arity, type-based dispatch via `getSignature` + `cppTypeToJsType` + per-arg matching. |

A new `apply-libembind-patch.sh` in `experiments/poc-overload-dispatch-cost/` should encode this toggle. Recommended approach:

```bash
# Snapshot the OCJS-patched vendored libembind on first run as .ocjs-patched
# Compute the true upstream pristine by reverse-applying our patch:
patch -R -o "${LIBEMBIND}.upstream-pristine" "${LIBEMBIND}.ocjs-patched" \
  < /Users/rifont/git/tau/repos/opencascade.js/src/patches/libembind-overloading.patch

# baseline mode: cp .upstream-pristine → libembind.js
# patched  mode: cp .ocjs-patched      → libembind.js
```

If `patch -R` cannot cleanly reverse (line drift), fall back to vendoring a fresh upstream emscripten libembind.js of matching version and using it as `.upstream-pristine`. Either way, the toggle must be **deterministic** and **byte-reversible** so build artifacts hash identically across negative→positive→negative cycles.

### Two C++ corpora

The mock C++ must exercise dispatch behaviour identical to what OCJS bindgen produces for real OCCT classes, without dragging in OCCT itself. Two corpora are needed because the baseline (unpatched) libembind throws at registration if two ctors share the same arity — the unique-name escape hatch must be used to keep the baseline build linkable.

| Corpus | C++ JS-binding shape                                                                                                                                                      | Builds against           | Purpose                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | Single name per group: `class_<EdgeMaker>("EdgeMaker").constructor<gp_Lin>().constructor<gp_Circ>()...` — N same-arity ctors registered to one JS name `EdgeMaker(arg)`.  | Patched only             | Production OCJS pattern. Measures dispatcher-on cost as N grows.                                                                                                       |
| **B**  | Unique name per overload: `function("makeEdge_FromLin", &fromLin).function("makeEdge_FromCirc", &fromCirc)...` — same C++ bodies, exposed under distinct JS-callable IDs. | Baseline **and** patched | Floor (no dispatch at all) and patched-overhead-when-unused control. Also supports a JS-side `instanceof`-chain wrapper that mimics what a consumer would write today. |

The **same** trivial C++ bodies are used in both corpora to remove signal noise from compute cost. The bodies must do enough that the optimizer cannot elide them (set a member counter, return an int that the JS side observes) but no actual geometry work.

### Hot-loop bench harness

Reuse the pattern proven in `experiments/q67-rbv-cost/pure-cpp-bench.mjs` and `experiments/option-d-comprehensive-poc/bench.mjs`:

- `process.hrtime.bigint()` for ns precision (not `performance.now()` ms → noisy at sub-µs scales).
- `WARMUP = 20_000` iters before the measured loop (V8 tier-up to TurboFan).
- `ITERATIONS = 200_000` per sample; `REPEATS = 15` samples; report median + min + std.
- Pre-construct all argument objects outside the bench loop so allocation cost does not leak into dispatch timing.
- Force `global.gc()` between bench cases when `--expose-gc` is available; ignore otherwise.
- Emit `results.json` plus a stdout markdown table for the research-doc appendix.

### Run matrix

Each measurement is a (corpus × state × bench) tuple. The matrix below distinguishes the three benches:

| Bench | Corpus | libembind state | Calls in hot loop                                                               | Measures                                                                                                                             |
| ----- | ------ | --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| M1    | B      | Baseline        | `Module.makeEdge_FromLin(precomputedLin)` direct                                | **Floor**: cost of a `craftInvokerFunction` invoker with **zero** dispatch. The fundamental embind call cost.                        |
| M1′   | B      | Patched         | `Module.makeEdge_FromLin(precomputedLin)` direct                                | **Patched per-call tax on single-overload methods.** Difference from M1 is the tax the patch imposes on every wrapped method.        |
| M2    | A      | Patched         | `Module.MakeEdge(precomputedArg)` where group size N ∈ {2, 4, 6, 8}             | **Scan cost growth.** Run once per N; expect linear cost-in-N from `signaturesArray.some()` iteration in `getSignature`.             |
| M2-h  | A      | Patched         | `Module.MakeEdge(precomputedArg)` where the target overload is **last** in scan | **Worst-case scan cost** for the largest N. Confirms the linear-in-N hypothesis vs an O(1) lower bound (target is first).            |
| M3    | B      | Baseline        | JS-side `instanceof` dispatcher chained over unique-named functions             | **Consumer-side cost without the patch.** Mimics what replicad/cad-cli would have to write if libembind C1 didn't exist.             |
| M3′   | B      | Patched         | Same JS-side dispatcher as M3                                                   | **Control:** confirms the patched libembind adds no measurable overhead when same-arity dispatch is bypassed by unique-name binding. |
| M4    | A      | Patched         | Birdhouse-equivalent sequence (15-call sketch + 5-call solid + 3-call CSG)      | **Realistic workload delta.** Full sequence ms; compare to M5 baseline below.                                                        |
| M5    | B      | Baseline        | Same birdhouse-equivalent sequence as M4, routed via M3-style JS dispatchers    | **Realistic baseline.** Pair-compare against M4 for % overhead.                                                                      |

Two derived quantities are the headline numbers:

- **Per-call dispatcher tax** = M1′ − M1 (absolute ns/op imposed on every method)
- **Birdhouse end-to-end overhead** = (M4 − M5) / M5 (percentage)

### Registration-time + bundle-size measurement

Independent of the hot-loop bench, capture two one-shot numbers:

- **R1 — Init time**: `performance.now()` around `await createModule()` for each variant. Median of 30 cold-start runs (clear `--max-old-space-size` JIT cache between runs by spawning a fresh `node` process).
- **R2 — Bundle bytes**: `wc -c` of the `.mjs` glue file in each variant. Patched-minus-baseline is the patch's contribution to deliverable size.

## Findings (from prior PoCs)

The existing experiment inventory contributes the following primitives that this experiment should reuse rather than reinvent:

| Source                                                       | Reusable primitive                                                                      | How it informs this experiment                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `experiments/libembind-fan-out-poc/build.sh`                 | emcc invocation against vendored `assimpjs/emsdk` with `-lembind`                       | Direct copy → just change `EXPORT_NAME` and source files.                              |
| `experiments/libembind-fan-out-poc/apply-libembind-patch.sh` | Snapshot pristine, modify in place, restore — apply/restore lifecycle                   | Direct copy → change the modification step from R1+R2 injection to whole-patch toggle. |
| `experiments/poc-overload-dispatch/broken.cpp` + `fixed.cpp` | C++ pattern for registering same-name, same-arity, class-typed overloads                | Copy `fixed.cpp`'s `select_overload<>` pattern verbatim into Corpus A.                 |
| `experiments/q67-rbv-cost/pure-cpp-bench.mjs`                | `process.hrtime.bigint()` warmup → iters → median ns/op harness, REPEATS-sample summary | Copy verbatim; change call-site lambda to dispatch case under test.                    |
| `experiments/option-d-comprehensive-poc/bench.mjs`           | sized-run with v8 heap delta + wasm-mem delta capture, `results.json` emission          | Copy summary/emission code; size dimension collapses to N (overload count).            |

This means **most of the experiment is glue, not new infrastructure** — the implementing agent assembles ~5 known-working pieces, adds a mock C++ corpus (~300 LOC), and a small JS bench runner (~150 LOC).

## Experiment Design

### Layout

```
experiments/poc-overload-dispatch-cost/
├── README.md                       Run instructions + headline result table
├── apply-libembind-patch.sh        Toggle baseline ⇄ patched libembind state
├── build.sh                        emcc build → variant.mjs + variant.wasm
├── corpus-a-overloaded.cpp         Corpus A — same-name same-arity registrations
├── corpus-b-unique-named.cpp       Corpus B — unique-named per-overload registrations
├── mock-occt.hpp                   Shared trivial mocks of gp_Lin/Circ/Elips/Hypr/Parab/Geom_Curve + EdgeMaker/FaceMaker/AlgoBoolean
├── bench-per-call.mjs              Bench M1, M1′ — per-call dispatcher tax
├── bench-scan-cost.mjs             Bench M2, M2-h — scan-cost-in-N
├── bench-js-dispatcher.mjs         Bench M3, M3′ — JS-side instanceof control
├── bench-birdhouse.mjs             Bench M4, M5 — realistic CAD workload
├── bench-init.mjs                  Bench R1 — module init wall-time
├── run.mjs                         Orchestrator — runs all benches both variants, emits results.json
├── results.json                    Auto-generated bench output
└── results.md                      Auto-generated markdown summary table
```

### `mock-occt.hpp` — what the mocks must look like

The mock C++ types must be **trivially constructible**, **embind-registerable** as `class_<T>`, and **shape-discriminable** at the JS layer via `instanceof`. They model the OCCT classes that appear in `BRepBuilderAPI_MakeEdge`'s overload signature:

```cpp
// mock-occt.hpp — sized so .delete() cost matches gp_* envelopes within ~10ns
struct gp_Lin   { double a; gp_Lin  (double v=0): a(v) {} };
struct gp_Circ  { double a; gp_Circ (double v=0): a(v) {} };
struct gp_Elips { double a; gp_Elips(double v=0): a(v) {} };
struct gp_Hypr  { double a; gp_Hypr (double v=0): a(v) {} };
struct gp_Parab { double a; gp_Parab(double v=0): a(v) {} };
struct Geom_Curve { double a; Geom_Curve(double v=0): a(v) {} };

// Faux EdgeMaker — distinct overload bodies that touch state so the optimizer
// cannot elide. The DISPATCH cost is what we're measuring, the BODY cost is
// constant noise across all variants. Bodies must be ≤10ns so the dispatcher
// signal isn't drowned out.
struct EdgeMaker {
  int routed = 0;  // Set per ctor so JS-side can verify the right overload fired.
  EdgeMaker(const gp_Lin&   ) : routed(1) {}
  EdgeMaker(const gp_Circ&  ) : routed(2) {}
  EdgeMaker(const gp_Elips& ) : routed(3) {}
  EdgeMaker(const gp_Hypr&  ) : routed(4) {}
  EdgeMaker(const gp_Parab& ) : routed(5) {}
  EdgeMaker(const Geom_Curve&) : routed(6) {}
};
```

### Corpus A — same-name registrations (patched libembind required)

```cpp
// corpus-a-overloaded.cpp
#include <emscripten/bind.h>
#include "mock-occt.hpp"
using namespace emscripten;

EMSCRIPTEN_BINDINGS(corpus_a) {
  class_<gp_Lin   >("gp_Lin"   ).constructor<double>().property("a", &gp_Lin::a);
  class_<gp_Circ  >("gp_Circ"  ).constructor<double>().property("a", &gp_Circ::a);
  // … gp_Elips, gp_Hypr, gp_Parab, Geom_Curve same shape …

  class_<EdgeMaker>("EdgeMaker")
    .constructor<const gp_Lin&   >()
    .constructor<const gp_Circ&  >()
    .constructor<const gp_Elips& >()  // N=4 build truncates here for the scan-cost matrix
    .constructor<const gp_Hypr&  >()  // N=6 build extends here
    .constructor<const gp_Parab& >()  // N=8 build adds these last two (Geom_Curve + a synthetic 8th)
    .constructor<const Geom_Curve&>()
    .property("routed", &EdgeMaker::routed);
}
```

The N-scaling matrix (N=2, 4, 6, 8) is realised by compiling the same source with **different `-DCORPUS_A_N=k`** flags that gate which `.constructor<>` lines are emitted under `#if`. This keeps the source single-file and ensures the C++ bodies are byte-identical across N values.

### Corpus B — unique-named registrations (works against either state)

```cpp
// corpus-b-unique-named.cpp
#include <emscripten/bind.h>
#include "mock-occt.hpp"
using namespace emscripten;

EdgeMaker makeEdge_FromLin   (const gp_Lin&    x) { return EdgeMaker(x); }
EdgeMaker makeEdge_FromCirc  (const gp_Circ&   x) { return EdgeMaker(x); }
EdgeMaker makeEdge_FromElips (const gp_Elips&  x) { return EdgeMaker(x); }
EdgeMaker makeEdge_FromHypr  (const gp_Hypr&   x) { return EdgeMaker(x); }
EdgeMaker makeEdge_FromParab (const gp_Parab&  x) { return EdgeMaker(x); }
EdgeMaker makeEdge_FromCurve (const Geom_Curve&x) { return EdgeMaker(x); }

EMSCRIPTEN_BINDINGS(corpus_b) {
  // class_ regs identical to corpus_a …
  class_<EdgeMaker>("EdgeMaker").property("routed", &EdgeMaker::routed);

  function("makeEdge_FromLin",   &makeEdge_FromLin);
  function("makeEdge_FromCirc",  &makeEdge_FromCirc);
  function("makeEdge_FromElips", &makeEdge_FromElips);
  function("makeEdge_FromHypr",  &makeEdge_FromHypr);
  function("makeEdge_FromParab", &makeEdge_FromParab);
  function("makeEdge_FromCurve", &makeEdge_FromCurve);
}
```

### JS-side `instanceof` dispatcher (bench M3 / M5)

The dispatcher mimics what a CAD library wrapper (replicad-shape-helpers level) would emit if libembind didn't support C1. It is intentionally hand-written, **not auto-generated**, so the bench measures the realistic upper bound of the consumer escape hatch:

```js
// bench-js-dispatcher.mjs (excerpt)
const dispatchMakeEdge = (mod, arg) => {
  if (arg instanceof mod.gp_Lin) return mod.makeEdge_FromLin(arg);
  if (arg instanceof mod.gp_Circ) return mod.makeEdge_FromCirc(arg);
  if (arg instanceof mod.gp_Elips) return mod.makeEdge_FromElips(arg);
  if (arg instanceof mod.gp_Hypr) return mod.makeEdge_FromHypr(arg);
  if (arg instanceof mod.gp_Parab) return mod.makeEdge_FromParab(arg);
  if (arg instanceof mod.Geom_Curve) return mod.makeEdge_FromCurve(arg);
  throw new TypeError('dispatchMakeEdge: no overload for ' + arg);
};
```

The order of `instanceof` checks matters; bench both "target first" (best case) and "target last" (worst case) to bracket the consumer cost the same way M2/M2-h brackets the patched dispatcher.

## Metrics

### Headline numbers

| ID  | Name                          | Formula                                    | Expected unit  | What it proves                                                                |
| --- | ----------------------------- | ------------------------------------------ | -------------- | ----------------------------------------------------------------------------- |
| H1  | Per-call dispatcher tax       | `M1′ − M1`                                 | ns/op          | The cost the patch imposes on **every** embind method, dispatched or not.     |
| H2  | Linear-in-N coefficient       | `slope(M2 vs N)`                           | ns/op/overload | Per-extra-overload scan cost. Confirms or refutes O(N) hypothesis.            |
| H3  | Birdhouse end-to-end overhead | `(M4 − M5) / M5 × 100`                     | %              | Realistic-workload impact. Dominates the "is this acceptable?" judgment.      |
| H4  | Consumer-side cost gap        | `M1′ − M3`                                 | ns/op          | Is the patched dispatcher faster or slower than a hand-written JS dispatcher? |
| H5  | Bundle-size cost              | `bytes(patched.mjs) − bytes(baseline.mjs)` | bytes          | Shipped-to-browser footprint of the patch.                                    |
| H6  | Module-init cost              | `R1.patched − R1.baseline`                 | ms             | One-shot cost paid at `createModule()` time.                                  |

### Diagnostic numbers (kept in `results.json`, not in the headline table)

- V8 heap delta per 1000 calls (catches accidental allocation regressions in the dispatcher)
- WASM linear-memory delta per 1000 calls (sanity check: dispatcher must not touch wasm heap)
- Std-dev / median ratio per sample (gates how trustworthy each median is; flag any case >15%)

## Hypotheses

| #   | Hypothesis                                                                                                                                                                       | Test                    | Decision-relevant?                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The patched dispatcher imposes a measurable per-call tax (`H1 > 0`) on single-overload methods, because the same `overloadTable[args.length].signatures[sig].apply()` path runs. | M1 vs M1′               | If `H1` is meaningful (>100 ns), it informs whether OCJS should emit the dispatch shim only for classes that actually have same-arity ambiguity (bindgen optimisation).                                                        |
| 2   | Scan cost is `O(N)` in overload count at fixed arity, with slope dominated by the per-arg `instanceof` chain in `getSignature` (5–7 conditional checks per arg per key).         | M2 across N ∈ {2,4,6,8} | If slope is steep, justifies a bindgen change to emit the dispatcher in argument-discrimination order (most-selective-first). If shallow, no action needed.                                                                    |
| 3   | Realistic CAD workload (birdhouse-equivalent) overhead is <5% because WASM OCCT compute time dwarfs JS dispatch.                                                                 | M4 vs M5                | The deciding number for whether C1 is "free" in practice. If <5%, defends Option C unconditionally; if 5–15%, defends Option C with caveats; if >15%, forces a re-think (per-class opt-in? consumer-wrapper escape hatch?).    |
| 4   | The patched dispatcher is within ±20% of a hand-written `instanceof` chain (`                                                                                                    | H4                      | < 20%`).                                                                                                                                                                                                                       | M1′ vs M3 | If patched dispatcher is materially slower than what users could write themselves, weakens the "libembind should ship this" upstream argument. If competitive, strengthens it. |
| 5   | The patched libembind adds <100 KB minified to the produced .mjs.                                                                                                                | H5                      | Materiality check for the OCJS published artifact size. Closure-compiled patched libembind is ~25 KB by inspection; if measured >100 KB, raises a flag for the upstream PR (don't increase wasm-pack bundle baselines by 5%+). |
| 6   | Module init cost is dominated by class registration; per-class registration tax from R1+R2 gates is ≤1 µs/class.                                                                 | R1 across variants      | Confirms init-time overhead is acceptable for OCJS's 4441-symbol full build. If a 4ms tax exists across 4441 classes, that's ~16 sec at module load — would need attention.                                                    |

## Recommendations for the Implementing Agent

| #   | Action                                                                                                                                                                                                                                             | Priority         | Effort | Impact                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Scaffold the experiment layout per [Experiment Design](#experiment-design), copying the build/apply scaffolding from `libembind-fan-out-poc` verbatim.                                                                                             | P0               | Low    | Removes setup as a risk; the existing scaffolding is known-working.                                                                     |
| R2  | Implement `apply-libembind-patch.sh` for the **whole-patch** toggle (not the R1+R2 hunk toggle the existing PoC uses). Include the `patch -R` reverse-apply for upstream pristine.                                                                 | P0               | Low    | Without this toggle the whole experiment cannot run.                                                                                    |
| R3  | Author `mock-occt.hpp` per spec — keep bodies trivial, sized to ≤10 ns each. Add a sanity assertion in JS that the `routed` member matches the expected overload index per call.                                                                   | P0               | Low    | Correctness pin: if dispatch is wrong, perf numbers are noise. The `routed` member also doubles as the "optimizer cannot elide" anchor. |
| R4  | Build Corpus A under `-DCORPUS_A_N=k` for k ∈ {2, 4, 6, 8}. Verify each build artifact loads under the patched libembind without throwing.                                                                                                         | P0               | Low    | Required for M2 scan-cost matrix.                                                                                                       |
| R5  | Implement bench harness per `q67-rbv-cost/pure-cpp-bench.mjs` shape; run all matrix cells; emit `results.json` + `results.md`.                                                                                                                     | P0               | Med    | Headline output.                                                                                                                        |
| R6  | Pre-register expected hypothesis outcomes in `README.md` **before running the bench**, so the result is interpreted as confirmation/refutation rather than post-hoc reasoning.                                                                     | P1               | Low    | Defensibility — pre-registration is standard practice in any cost-justification document.                                               |
| R7  | After landing results, update `ocjs-libembind-strategic-direction-assessment.md` §"Option C" with the measured numbers replacing the implied-but-unmeasured cost claims.                                                                           | P1               | Low    | Closes the loop on the strategic doc.                                                                                                   |
| R8  | If H3 (realistic overhead <5%) is **refuted**, fork into a follow-up research doc that explores per-class opt-in dispatch in bindgen (`emit C1 shim only when class has same-arity ambiguity`). Do **not** attempt the optimisation pre-emptively. | P2 (conditional) | Med    | Avoids speculative optimisation; only fires if data demands it.                                                                         |

## Code Skeletons

### `apply-libembind-patch.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
EMSDK_ROOT="/Users/rifont/git/tau/repos/assimpjs/emsdk/upstream/emscripten"
LIBEMBIND="${EMSDK_ROOT}/src/lib/libembind.js"
OCJS_PATCH="/Users/rifont/git/tau/repos/opencascade.js/src/patches/libembind-overloading.patch"
PATCHED_SNAPSHOT="${LIBEMBIND}.ocjs-patched"
UPSTREAM_SNAPSHOT="${LIBEMBIND}.upstream-pristine"

[[ -f "${PATCHED_SNAPSHOT}" ]] || cp "${LIBEMBIND}" "${PATCHED_SNAPSHOT}"
if [[ ! -f "${UPSTREAM_SNAPSHOT}" ]]; then
  # Produce upstream pristine by reverse-applying the OCJS overloading patch.
  cp "${PATCHED_SNAPSHOT}" "${UPSTREAM_SNAPSHOT}"
  patch -R -p1 -d "${EMSDK_ROOT}" -i "${OCJS_PATCH}" || {
    echo "patch -R failed — line drift or hunk mismatch."
    echo "Fall back to vendoring a fresh upstream libembind.js of matching emcc version."
    exit 1
  }
  cp "${LIBEMBIND}" "${UPSTREAM_SNAPSHOT}"
fi

case "${1:-baseline}" in
  baseline) cp "${UPSTREAM_SNAPSHOT}" "${LIBEMBIND}" ;;
  patched)  cp "${PATCHED_SNAPSHOT}"  "${LIBEMBIND}" ;;
  restore)  cp "${PATCHED_SNAPSHOT}"  "${LIBEMBIND}" ;;
  *) echo "Usage: $0 [baseline|patched|restore]" >&2; exit 1 ;;
esac
```

### `bench-per-call.mjs` (M1 / M1′ — single-overload tax)

```js
import { performance } from 'node:perf_hooks';
import createBaseline from './corpus-b-baseline.mjs';
import createPatched from './corpus-b-patched.mjs';

const ITERATIONS = parseInt(process.env.ITERATIONS ?? '200000', 10);
const WARMUP = parseInt(process.env.WARMUP ?? '20000', 10);
const REPEATS = parseInt(process.env.REPEATS ?? '15', 10);

const bench = (label, fn) => {
  for (let i = 0; i < WARMUP; i++) fn(i);
  const samples = [];
  for (let r = 0; r < REPEATS; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) fn(i);
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / ITERATIONS);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return { label, median_ns: median, min_ns: samples[0], max_ns: samples.at(-1) };
};

const baseline = await createBaseline();
const patched = await createPatched();

const lin_b = new baseline.gp_Lin(1);
const lin_p = new patched.gp_Lin(1);

const r1 = bench('M1  baseline direct', () => baseline.makeEdge_FromLin(lin_b));
const r1p = bench('M1′ patched  direct', () => patched.makeEdge_FromLin(lin_p));

console.log(JSON.stringify({ M1: r1, M1p: r1p, tax_ns: r1p.median_ns - r1.median_ns }, null, 2));
```

### Birdhouse-equivalent call sequence (M4 / M5)

The birdhouse model (verified by reading `libs/tau-examples/src/kernels/replicad/birdhouse/main.ts`) executes the following OCJS-translated sequence per render. Mirror it 1-to-1 in the mock, then run 1000× in the bench.

```text
Sketch (toblerone outline):
  4× gp_Pnt + 4× MakeEdge(gp_Pnt, gp_Pnt) + 1× MakeWire(4 edges) + 1× MakeFace(wire, planeOnly=false)
Extrude to solid:
  1× BRepPrimAPI_MakePrism(face, vector, copy, canonize)
Shell:
  1× BRepOffsetAPI_MakeThickSolid + selector iteration
Optional fillet (filletEdges = true):
  1× BRepFilletAPI_MakeFillet + 2× edge selection .Add(radius, edge)
Circular hole sketch:
  1× drawCircle → 1× gp_Circ + 1× MakeEdge(gp_Circ) + 1× MakeWire + 1× MakeFace
  1× MakePrism (extruded hole)
CSG:
  1× BRepAlgoAPI_Cut(base, hole)
  1× clone (TopoDS_Builder copy)
  1× rotation (gp_Trsf + BRepBuilderAPI_Transform)
  1× BRepAlgoAPI_Fuse(base, rotated)
Hook sketch + extrude + final fuse:
  ~10 draw ops → 10× MakeEdge variants + MakeWire + MakeFace + MakePrism
  1× BRepAlgoAPI_Fuse(body, hook)
TOTAL  ≈ 35 OCCT class instantiations per render, ≈ 15 of which exercise same-arity overload buckets.
```

The mock implementation must register **at least the same number** of same-arity overloads in `EdgeMaker`/`FaceMaker`/`AlgoBoolean` to mimic the per-bucket scan cost the patched libembind would pay. It does **not** need to do any geometry work — the `routed` member counter suffices.

## References

- [`docs/research/ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md) — Option C and the cost-quantification gap this experiment fills
- [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md) — Defect catalog with cluster framing (C1 = same-arity dispatch, C2 = arity fan-out)
- [`docs/research/ocjs-trailing-default-arity-fan-out.md`](./ocjs-trailing-default-arity-fan-out.md) — Original eigenquestion doc that introduced the C1/C2 mechanisms
- `repos/opencascade.js/src/patches/libembind-overloading.patch` — The patch this experiment quantifies (current state, post-revert)
- `repos/opencascade.js/src/patches/libembind-overloading_BAK.patch` — Backup of the discarded buggy iteration (Path B + lookup-table extras); **not** the patch under test
- `repos/opencascade.js/experiments/libembind-fan-out-poc/` — Source pattern for build/apply scaffolding
- `repos/opencascade.js/experiments/poc-overload-dispatch/` — Correctness PoC; source pattern for the C++ binding shape
- `repos/opencascade.js/experiments/q67-rbv-cost/` — Source pattern for the ns/op bench harness
- `libs/tau-examples/src/kernels/replicad/birdhouse/main.ts` — Real-world workload reference (35 OCCT instantiations / render)
- `repos/replicad/packages/replicad/src/shapeHelpers.ts` — Real-world OCCT call-site distribution (see Appendix A)
- `repos/opencascade.js/deps/OCCT/src/ModelingAlgorithms/TKTopAlgo/BRepBuilderAPI/BRepBuilderAPI_MakeEdge.hxx` — Authoritative source for the 6-way same-arity 1-arg overload group (Tier 1 target)
- [`donalffons/opencascade.js#301`](https://github.com/donalffons/opencascade.js/pull/301) — Upstream PR where this experiment's results become evidence

## Appendix A — Real-World Same-Arity Overload Inventory (Birdhouse + Replicad)

Sourced by grep over `repos/replicad/packages/replicad/src/{shapeHelpers,shapes,addThickness,curves,geom,measureShape}.ts` and cross-referenced against OCCT header signatures.

| OCCT class                    | Same-arity overload group                                               | Group size N            | Birdhouse hits / render | Replicad hits / typical model |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------- | ----------------------- | ----------------------------- |
| `BRepBuilderAPI_MakeEdge`     | 1-arg (gp_Lin/Circ/Elips/Hypr/Parab/Geom_Curve)                         | **6**                   | ~10                     | ~25–100                       |
| `BRepBuilderAPI_MakeEdge`     | 2-arg (TopoDS_Vertex×2, gp_Pnt×2, Geom_Curve+range, Geom2d_Curve+range) | **4**                   | ~4                      | ~10–40                        |
| `BRepBuilderAPI_MakeEdge`     | 3-arg ((Lin/Circ/Elips/Hypr/Parab)×(p1,p2:double or P1,P2:gp_Pnt))      | **10**                  | ~2                      | ~5–20                         |
| `BRepBuilderAPI_MakeFace`     | 1-arg (TopoDS_Face, Geom_Surface)                                       | **2**                   | 2                       | ~3–10                         |
| `BRepBuilderAPI_MakeFace`     | 2-arg (wire+planeOnly:bool, face+wire)                                  | **2**                   | 2                       | ~3–10                         |
| `BRepBuilderAPI_MakeFace`     | 3-arg (surface+wire+inside:bool, face+wire+orientation)                 | **2**                   | 0                       | ~1–5                          |
| `BRepBuilderAPI_MakeWire`     | 1-arg (TopoDS_Edge, TopoDS_Wire)                                        | **2**                   | 2                       | ~3–10                         |
| `gp_Ax2` / `gp_Ax3`           | 2-arg (origin+direction)                                                | **1** (no C1 ambiguity) | many                    | many                          |
| `gp_Ax2` / `gp_Ax3`           | 3-arg (origin+direction+xDirection)                                     | **1**                   | many                    | many                          |
| `BRepAlgoAPI_Fuse/Cut/Common` | 2-arg (s1, s2)                                                          | **1**                   | 3                       | ~3–8                          |
| `BRepAlgoAPI_Fuse/Cut/Common` | 3-arg (s1, s2, progressRange)                                           | **1**                   | 0 (replicad uses 3-arg) | ~3–8                          |

**Takeaway**: the dominant same-arity buckets are `BRepBuilderAPI_MakeEdge`'s 1-arg (N=6) and 3-arg (N=10) groups. The 3-arg group is the worst-case scan target for M2; the 1-arg group is the highest-frequency target for M4. Most other OCCT classes consumed by replicad/birdhouse have N ≤ 2, so the linear-scan term remains bounded in practice — confirms why H3 is expected to land in the "small percentage" range.

## Appendix B — libembind Patch Anatomy (the cost surface)

Annotated from `src/patches/libembind-overloading.patch` (current state, post-revert; 219 added LOC).

### Per-call dispatcher path (the per-call tax)

Inside `_embind_register_class_function`, after registration, every wrapped method goes through:

```js
// Installed by the patch when an arity bucket has multiple registered signatures.
proto[methodName].overloadTable[args.length] = function (...args) {
  var keys = proto[methodName].overloadTable[args.length].signaturesArray;
  var signature = getSignature(args, keys); // ← scan
  if (!proto[methodName].overloadTable[args.length].signatures.hasOwnProperty(signature)) {
    /* throw with humanName + types */
  }
  return proto[methodName].overloadTable[args.length].signatures[signature].apply(this, args);
};
```

Per-call cost components:

1. `overloadTable[args.length]` lookup (hash)
2. `.signaturesArray` read (property access)
3. `getSignature(args, keys)` — `.some()` over keys, `.every()` over arg slots, 5–8 conditional checks per slot:
   - `field === 'emscripten::val'` literal compare
   - `typeof field === 'number'` + `registeredTypes[field].name === 'emscripten::val'`
   - `typeof args[i] === 'bigint'`
   - `typeof args[i] === 'object'` + nested `instanceof` chain
   - `typeof args[i] === field`
   - Five further primitive-name string-equality compares
4. `.signatures.hasOwnProperty(signature)` validation (hash)
5. `.signatures[signature].apply(this, args)` — extra hop vs direct call

For single-overload methods, the patch's `ensureOverloadSignatureTable` path is **not** entered, and the per-call cost reduces to a slightly heavier `craftInvokerFunction` invoker (the upstream invoker mechanism is unchanged). **This is the per-call tax that M1 vs M1′ measures.**

For multi-overload methods, the full scan path is hot. The per-arg conditional chain is the dominant cost; this is what M2 across N measures.

### Registration-time path (one-shot)

`exposePublicSymbol` / `replacePublicSymbol` / `_embind_register_class_constructor` / `_embind_register_class_function` / `_embind_register_class_class_function` are all touched to thread `rawSignatureString` and `signaturesArray` through. The R1+R2 `Object.hasOwn` gates also live here. All registration paths run **once per registered symbol** at module init.

For a 4441-symbol OCJS full build, the patched registration overhead per symbol must be small enough not to inflate init time materially. R1/R6 measurements pin this.

### Bundle-size contribution

The patch adds ~219 LOC of JavaScript to `libembind.js`, of which ~80 LOC is `getSignature` + `cppTypeToJsType` + the lookup table, ~60 LOC is registration-path threading, and the rest is comments + error-formatting branches. After Closure Compiler optimisation in the OCJS production build, the contribution should compress to roughly 3–10 KB. H5 measures this.
