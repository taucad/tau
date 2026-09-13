---
title: 'OCJS Option C Bifurcation — std::optional<T> Validation Experiment Design'
description: 'Design spec for an isolated PoC empirically validating the Option C strategic direction (keep C1 same-arity dispatch, retire C2 fan-out via upstream std::optional<T>) using C++ mocks that exercise the five catalog defects expected to collapse.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: investigation
related:
  - docs/research/ocjs-libembind-strategic-direction-assessment.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-trailing-default-arity-fan-out.md
  - docs/research/ocjs-embind-js-dispatch-failures.md
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-suffix-free-overload-cost-experiment-design.md
---

# OCJS Option C Bifurcation — `std::optional<T>` Validation Experiment Design

Design spec for `experiments/poc-option-c-validation/` — a self-contained correctness PoC that empirically validates the **Option C** strategic direction from [`ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md): keep C1 (same-arity type-based dispatch) intact, retire C2 (arity fan-out for trailing C++ defaults) in favour of upstream embind's canonical `std::optional<T>` + `register_optional<T>` mechanism (Emscripten 3.1.68 / [PR #22591](https://github.com/emscripten-core/emscripten/issues/22389)).

## Executive Summary

The strategic-direction assessment claims that adopting upstream `std::optional<T>` for trailing C++ default arguments collapses **5 of 8** catalog defects (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE) to zero work while preserving every published v3 commitment in [`BREAKING_CHANGES.md §B1`](../../repos/opencascade.js/BREAKING_CHANGES.md). The claim rests today on **architectural reasoning** — a hunk-by-hunk audit of `libembind-overloading.patch` and a reading of upstream embind's optional-argument support. It has **not been validated empirically**.

This document specifies a two-corpus, one-libembind-variant correctness PoC that produces a 6-row pass/fail matrix grounding the Option C recommendation in measured rather than implied behaviour:

- **Corpus A** mimics what `src/ocjs_bindgen/codegen/bindings.py` emits **today** (arity fan-out via `optional_override` lambdas, one registration per trailing-default arity).
- **Corpus B** mimics what bindgen would emit **after R5** (single registration per overload using `std::optional<T>` arg + `register_optional<T>()` upfront).
- Both corpora link against the **same C1-only libembind patch already shipping** — a clarification this PoC scoping pass surfaces (see [Finding 0](#finding-0-the-current-libembind-patch-is-already-c1-only)) that strengthens the Option C case beyond the strategic doc's framing.

If the 6-row matrix shows Corpus A FAILing all 5 catalog defects while Corpus B PASSes them all, **and** Corpus A and Corpus B both PASS the C1 §B1 happy-path control, Option C is empirically validated as the correct direction. The implementing agent then opens R5 with the PoC binding files as the canonical reference for what post-R5 bindgen output should look like.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings (from prior PoCs and scoping)](#findings-from-prior-pocs-and-scoping)
- [Experiment Design](#experiment-design)
- [Test Matrix](#test-matrix)
- [Hypotheses](#hypotheses)
- [Decision Rules](#decision-rules)
- [Recommendations for the Implementing Agent](#recommendations-for-the-implementing-agent)
- [Code Skeletons](#code-skeletons)
- [References](#references)
- [Appendix A — Catalog Defect → Mock OCCT Pattern Mapping](#appendix-a--catalog-defect--mock-occt-pattern-mapping)
- [Appendix B — Bindgen Translation Rule (post-R5)](#appendix-b--bindgen-translation-rule-post-r5)
- [Appendix C — Boundaries and Out-of-Scope Defects](#appendix-c--boundaries-and-out-of-scope-defects)

## Problem Statement

The strategic-direction assessment in [`ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md) bifurcates the taucad `libembind-overloading.patch` into two architecturally distinct concerns and recommends **Option C** — keep the load-bearing **C1** concern (same-arity type-based dispatch, shipped as `BREAKING_CHANGES.md §B1` suffix-free overloads) and retire the **C2** concern (arity fan-out for trailing C++ default arguments) in favour of upstream embind's canonical `std::optional<T>` mechanism merged in [Emscripten 3.1.68 / PR #22591](https://github.com/emscripten-core/emscripten/issues/22389).

The recommendation's payoff is large: **5 of 8** outstanding catalog defects collapse to zero work (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE). Adopting it would meaningfully reduce the fork's long-term maintenance burden and align the trailing-default story with where upstream embind is going.

The recommendation's risk is also large: if `std::optional<T>` does **not** compose cleanly with the C1 dispatcher — for example if a same-arity overload group containing one variant with a trailing `std::optional` confuses the `signaturesArray` lookup — then Option C silently regresses §B1's suffix-free overloads. **This regression risk is unquantified.**

The question this PoC answers:

> Given the **current** C1-only libembind patch (no modifications), can a hand-written `corpus-b-optional.cpp` mimicking post-R5 bindgen output (one registration per overload, trailing C++ defaults emitted as `std::optional<T>`, `register_optional<T>()` for every wrapped type) PASS all five catalog defects (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE) **without** regressing the C1 §B1 same-arity overload happy-path that `corpus-a-fan-out.cpp` (mimicking current bindgen output) passes?

### Scope and Non-Goals

**In scope**:

- Correctness validation of `std::optional<T>` composing with the shipped C1 libembind patch.
- Hand-written reference binding shapes (`corpus-a-fan-out.cpp`, `corpus-b-optional.cpp`) that serve as a contract for what post-R5 bindgen must emit.
- Pass/fail matrix for the 5 trailing-default catalog defects + 1 C1 §B1 control.
- A ~50-line `mock-bindgen.py` sketch demonstrating that the bindgen translation rule (C++ default → `std::optional<T>`) is mechanical, not heuristic — concrete evidence for the strategic doc's R5 "MEDIUM effort, mechanical" claim.
- Smoke verification that `register_optional<T>()` works for every OCCT-likely type family used in trailing defaults: primitives (`double`, `int`, `bool`), strings (`std::string`), value-types (gp_Pnt-style structs), `Handle<T>` substitutes, and embind `value_object` return shapes.

**Out of scope**:

- **Per-call performance** — this is a correctness PoC, not a perf PoC. Once Option C is committed, a follow-on bench can measure whether `std::optional<T>` unwrap is slower than the fan-out lambda. Per upstream's relaxed-arity verification path in [PR #22591](https://github.com/emscripten-core/emscripten/issues/22389), the difference is expected to be negligible (a single missing-arg → `std::nullopt` materialisation per call), but that claim is not the load-bearing one for the Option C decision.
- **FO-R1 (cross-sibling stomp)** — orthogonal C1 architectural defect, separately tracked under R4 (own-property-only proto walk) and already covered empirically by [`experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/). Including FO-R1 cases here would muddy the C2-retirement signal.
- **DF-R2b (RBV collision handler)** — C1-side fix, separately tracked.
- **CTJ-1 / CTJ-2 (cppTypeToJsType minifier brittleness)** — C1-side hot-patch fragility, separately tracked.
- **Constructor trailing defaults** — bindgen's constructor.py path also fans out trailing defaults, but the dispatch surface is the same `signaturesArray` machinery on `constructor_body`. The 5 catalog defects all manifest at method dispatch; constructor parity is left to a follow-on if needed.
- **Running against the full vendored OCCT** — that's the integration test that happens during R5. This PoC validates the translation rule against minimal C++ mocks.

## Methodology

1. **Audit the C1/C2 separation in code.** Cross-reference the strategic doc's Finding 4 against the actual contents of [`src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) and [`src/ocjs_bindgen/codegen/bindings.py`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py). This produces [Finding 0](#finding-0-the-current-libembind-patch-is-already-c1-only) below — the bifurcation is even cleaner than the strategic doc says.
2. **Map each catalog defect to a minimum C++ mock.** Walk the catalog ([`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md)) and for each of FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE construct a 5-to-15-line C++ class declaration that reproduces the gate condition currently skipping fan-out emission in [`src/ocjs_bindgen/codegen/bindings.py:1720-1727`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py).
3. **Hand-write Corpus A** (`corpus-a-fan-out.cpp`) to mirror what `bindings.py` emits today: separate `function("Build", optional_override([](Self&) { self.Build(); }))` and `function("Build", optional_override([](Self&, T pr) { self.Build(pr); }))` registrations per arity. Where a gate currently skips fan-out, register only the full-arity form (this is the defect — the JS call with omitted arg throws because no arity-N-minus-1 binding exists).
4. **Hand-write Corpus B** (`corpus-b-optional.cpp`) to mirror post-R5 bindgen output: one registration per overload using `std::optional<T>` arg + `register_optional<T>()` upfront, lambdas that unwrap via `if (pr) self.Build(*pr); else self.Build();`.
5. **Build both corpora against the unchanged C1-only `libembind.ocjs-patched.js`** (already vendored at `experiments/poc-overload-dispatch-cost/libembind.ocjs-patched.js`). This is the load-bearing test: Option C requires zero libembind modification.
6. **Run the 6-row test matrix** via `run.test.mjs` (1 C1 §B1 control + 5 catalog defects), assert PASS/FAIL expectations, commit `results.json` as empirical evidence.
7. **Author the `mock-bindgen.py` sketch** — a ~50-line Python script that ingests a tiny `mock-occt-decl.txt` definition and emits either Corpus A or Corpus B shape. Concrete evidence that R5's bindgen change is mechanical, not heuristic.

## Findings (from prior PoCs and scoping)

### Finding 0: The current libembind patch is already C1-only

The strategic-direction assessment's [Finding 4](./ocjs-libembind-strategic-direction-assessment.md#finding-4-the-libembind-patch-combines-two-architecturally-distinct-concerns-under-one-file) and the [Strategic Options §C](./ocjs-libembind-strategic-direction-assessment.md#option-c--bifurcate-keep-c1-retire-c2) both imply the libembind patch contains C2 (trailing-default) hunks that would need surgical removal. **Direct inspection contradicts this**: the current 429-line `src/patches/libembind-overloading.patch` is **entirely** C1 (same-arity type-based dispatch). Every hunk falls into one of these C1 categories:

| Hunk category                                            | Purpose                                                                                    | Lines (approx) |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| `$getSignature` / `$cppTypeToJsType` definitions         | Per-call type matching against `signaturesArray`                                           | ~70            |
| `$ensureOverloadSignatureTable` / `$ensureOverloadTable` | Lazy construction of the per-(name,arity) signature dispatcher                             | ~50            |
| `_embind_register_class_function` modifications          | Wire member-function registrations through `signaturesArray` + R1/R2 `Object.hasOwn` gates | ~80            |
| `_embind_register_class_class_function` modifications    | Static method parity (same as above, on the class object)                                  | ~70            |
| `_embind_register_class_constructor` modifications       | Ctor parity (`constructor_body[arity].signaturesArray`)                                    | ~70            |
| `_embind_register_function` modifications                | Free-function parity                                                                       | ~90            |

The trailing-default fan-out (C2) lives **entirely in bindgen Python**: the `_countTrailingDefaults` AST walker and the four gate predicates (`hasCStringArgs`, `returnIsCString`, `numOverloads > 1`, `_returnTypeRequiresValueWrapper`) at [`src/ocjs_bindgen/codegen/bindings.py:793-897, 1442-1452, 1586, 1698-1755, 3219-3241`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py).

**Implication for Option C**: the bifurcation is cleaner than the strategic doc framed it. The libembind patch does not shrink "~40%" under Option C — it shrinks **0%**. The C2 retirement is a **pure bindgen change**: delete `_countTrailingDefaults`, delete the gate predicates, and switch the emission to `std::optional<T>` + `register_optional<T>`. The libembind patch already supports this — `register_optional<T>` is upstream embind's mechanism, runs through `_embind_register_optional` which is unchanged by the C1 patch.

This finding strengthens the Option C case: **the experiment requires no libembind variant construction** beyond the C1-only patch that is already shipped and vendored at `experiments/poc-overload-dispatch-cost/libembind.ocjs-patched.js`.

### Finding 1: Upstream `std::optional<T>` is the canonical mechanism for trailing defaults

From the strategic doc's Finding 3: Emscripten 3.1.68 / PR #22591 added relaxed argument-count verification to embind's per-arity dispatcher, allowing trailing `std::optional<T>` slots to be omitted from the JS call. The C++ binding lambda receives `std::nullopt` for omitted args. **No bindgen-side arity fan-out is needed.**

The PoC must therefore demonstrate two things about `std::optional<T>` interaction:

- **(a) Composition with C1**: a same-arity overload group containing one variant with a trailing `std::optional` must not confuse the `signaturesArray` lookup. The C1 dispatcher matches on full-arity argument types; when a JS caller invokes `method(a, b)` against a binding registered as `method(A, B, std::optional<C>)`, embind's relaxed-arity verifier materialises `std::nullopt` for the missing `c` arg **before** C1's `getSignature` runs. C1 sees the same arity it registered. There is no architectural conflict.
- **(b) Coverage of OCCT trailing-default types**: every C++ type appearing as a trailing default in OCCT must be wrappable via `register_optional<T>()`. Coverage check: primitives (`double`, `int`, `bool`), `std::string`, value-types (gp*Pnt-style structs registered as `class*<T>`), `Handle<T>`substitutes (registered as smart-pointer wrappers), and the v3`value_object<T>`return types used in RBV. The PoC's`corpus-b-optional.cpp`must include at least one`register_optional<T>` for each family.

### Finding 2: The five collapsing defects share one root cause

All five C2 catalog defects (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE) trace to the **same root cause**: the gate predicates at [`src/ocjs_bindgen/codegen/bindings.py:1720-1727`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) block trailing-default fan-out emission whenever the method is "complex" (multiple overloads, cstring wrappers, output params, RBV return). The result is that the bindgen emits **only the full-arity binding**, and the JS caller invoking the method with the C++ default args omitted hits a `BindingError: function 'X' called with N args, expected M`.

Each defect is one specific gate condition:

- **FO-R3**: arity-0 truncation on inheritance (override method emits the full-arity binding, base class's arity-0 inherited binding is shadowed because the patched libembind's R1/R2 gates correctly isolate the override but the truncation table isn't repopulated).
- **TR-CW**: `hasCStringArgs` gate — methods taking `char*` skip fan-out because the cstring-wrapper lambda already wraps the call, and the fan-out logic doesn't compose with it.
- **TR-MO**: `numOverloads > 1` gate — methods that are members of a same-arity overload group skip fan-out because the dispatcher disambiguates by signature, not arity, and the fan-out logic would emit ambiguous arity-N-minus-1 registrations.
- **TR-RBV**: `_returnTypeRequiresValueWrapper` gate — methods returning RBV envelopes skip fan-out because the envelope-construction lambda already wraps the call.
- **TR-GATE**: the parity of two gates (e.g. cstring + RBV) trips both gates simultaneously, doubly skipping fan-out.

The unifying observation: **every gate exists because fan-out lambdas don't compose cleanly with other binding wrappers** (cstring, RBV, multi-overload dispatch). `std::optional<T>` sidesteps all of them by moving the default-handling into the C++ lambda body, where it composes with whatever other wrapping is already present.

### Finding 3: Prior PoCs cover correctness for C1 but not for C2 retirement

- [`experiments/poc-overload-dispatch/`](../../repos/opencascade.js/experiments/poc-overload-dispatch/) proves C1 (same-arity type dispatch) is functionally correct (9/9 pass with the patch, 2/9 without). This experiment is C1-only and says nothing about trailing defaults.
- [`experiments/poc-overload-dispatch-cost/`](../../repos/opencascade.js/experiments/poc-overload-dispatch-cost/) quantifies C1's per-call performance cost (~264 ns/call same-arity tax). This experiment is perf-only and uses no trailing defaults.
- [`experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/) proves R1+R2's `Object.hasOwn` cross-sibling regression guard (FO-R1 correctness). This experiment is the inheritance-isolation harness and shares some mock topology with what this PoC needs but does not exercise the C2 gates.

**This PoC fills the empirical gap** for the C2 retirement decision. It is the only experiment that compares fan-out vs `std::optional<T>` head-to-head against the five catalog defects.

## Experiment Design

### Layout

```
experiments/poc-option-c-validation/
├── README.md                          — headline result, layout, reproducing
├── mock-occt.hpp                      — minimal C++ OCCT mock corpus
├── corpus-a-fan-out.cpp               — bindings.cpp emitted by CURRENT bindgen
├── corpus-b-optional.cpp              — bindings.cpp emitted by PROPOSED bindgen
├── mock-bindgen.py                    — ~50-line bindgen translation rule sketch
├── mock-occt-decl.txt                 — tiny input for mock-bindgen.py
├── libembind.ocjs-patched.js          — vendored C1-only libembind (copied from poc-overload-dispatch-cost/)
├── apply-libembind-patch.sh           — restore-only helper (no toggle needed; same patch for both builds)
├── build.sh                           — `emcc` driver for both corpora
├── run.test.mjs                       — 6-row test matrix harness
└── results.json                       — committed pass/fail evidence
```

### Build matrix

| Variant | Corpus                  | libembind state                                | Output                      |
| ------- | ----------------------- | ---------------------------------------------- | --------------------------- |
| **A**   | `corpus-a-fan-out.cpp`  | `libembind.ocjs-patched.js` (current C1 patch) | `mod-a-fan-out.{mjs,wasm}`  |
| **B**   | `corpus-b-optional.cpp` | `libembind.ocjs-patched.js` (current C1 patch) | `mod-b-optional.{mjs,wasm}` |

The same libembind for both. This is the load-bearing simplification surfaced by [Finding 0](#finding-0-the-current-libembind-patch-is-already-c1-only) — no toggling required, no patch surgery required.

### Mock OCCT corpus (`mock-occt.hpp`)

The corpus defines the minimum classes needed to reproduce each of the five catalog defects plus the C1 §B1 control. Bodies are trivial (set a `routed` member) to isolate dispatch behaviour from real C++ logic. Each class is named after the OCCT pattern it stands in for.

```cpp
// === C1 §B1 control — same-arity type dispatch ===
struct Vec3   { double x, y, z; Vec3(double xv=0, double yv=0, double zv=0): x(xv), y(yv), z(zv) {} };
struct XYZ    { double x, y, z; XYZ (double xv=0, double yv=0, double zv=0): x(xv), y(yv), z(zv) {} };

// Mimics gp_Pnt with same-arity (3 args, two type variants):
struct Pnt {
  int routed = 0;
  Pnt(double, double, double) : routed(1) {}
  Pnt(const XYZ&)              : routed(2) {}   // arity 1, type-distinguished from below
  Pnt(const Vec3&)             : routed(3) {}   // arity 1, type-distinguished from above
};

// === FO-R3: arity-0 truncation in inheritance ===
struct ProgressRange { int handle = 0; };

struct Base_Algo {
  int lastBuildBy = 0;
  virtual ~Base_Algo() = default;
  virtual void Build(const ProgressRange& = {}) { lastBuildBy = 1; }
};

struct Derived_Algo : Base_Algo {
  void Build(const ProgressRange& = {}) override { lastBuildBy = 2; }
};

// === TR-CW: cstring arg + trailing default ===
enum OpenMode { ReadOnly = 0, ReadWrite = 1 };

struct StrTool {
  int routed = 0;
  // Trips bindgen's `hasCStringArgs` gate today.
  void Set(const char* /*name*/, OpenMode mode = ReadOnly) { routed = (mode == ReadOnly) ? 1 : 2; }
};

// === TR-MO: same-arity overload group + trailing default ===
struct Edge { int id = 0; };
struct Loc  { int id = 0; };

struct Sampler {
  int routed = 0;
  // Two same-arity overloads, BOTH with trailing defaults — trips `numOverloads > 1` gate.
  void Sample(const Edge&, const Loc&, double first = 0.0, double last = 1.0) { routed = 1; (void)first; (void)last; }
  void Sample(const Edge&,             double first = 0.0, double last = 1.0) { routed = 2; (void)first; (void)last; }
};

// === TR-RBV: value_object return + trailing default ===
struct CurveResult { int handle = 0; double first = 0; double last = 0; };

struct CurveTool {
  int routed = 0;
  // Trips `_returnTypeRequiresValueWrapper` gate today.
  CurveResult GetCurve(const Edge&, double tol = 1e-6) {
    routed = (tol > 0.5) ? 1 : 2;
    return CurveResult{1, 0.0, 1.0};
  }
};

// === TR-GATE: cstring + RBV combined ===
struct Combo {
  int routed = 0;
  // Trips BOTH `hasCStringArgs` AND `_returnTypeRequiresValueWrapper` gates today.
  CurveResult Proc(const char* /*name*/, double t = 1e-3) {
    routed = (t > 0.5) ? 1 : 2;
    return CurveResult{2, 0.0, 1.0};
  }
};
```

### Corpus A binding shape (current bindgen emission)

`corpus-a-fan-out.cpp` registers each class as `bindings.py` would today. For methods where any gate currently skips fan-out, **only the full-arity binding is registered** — this is what makes the catalog defect reproducible.

```cpp
EMSCRIPTEN_BINDINGS(corpus_a) {
  using namespace emscripten;

  // C1 §B1 control — both arity-1 overloads register under the same name.
  value_object<XYZ>("XYZ").field("x", &XYZ::x).field("y", &XYZ::y).field("z", &XYZ::z);
  value_object<Vec3>("Vec3").field("x", &Vec3::x).field("y", &Vec3::y).field("z", &Vec3::z);
  class_<Pnt>("Pnt")
    .constructor<double, double, double>()
    .constructor<const XYZ&>()
    .constructor<const Vec3&>()
    .property("routed", &Pnt::routed);

  // FO-R3 — Base + Derived with arity-0 override + trailing default.
  // Current bindgen emits the full-arity registration AND the arity-0 truncation:
  value_object<ProgressRange>("ProgressRange").field("handle", &ProgressRange::handle);
  class_<Base_Algo>("Base_Algo")
    .constructor<>()
    .function("Build", optional_override([](Base_Algo& self, const ProgressRange& pr) { self.Build(pr); }))
    .function("Build", optional_override([](Base_Algo& self) { self.Build(); }))   // arity-0 truncation
    .property("lastBuildBy", &Base_Algo::lastBuildBy);
  class_<Derived_Algo, base<Base_Algo>>("Derived_Algo")
    .constructor<>()
    .function("Build", optional_override([](Derived_Algo& self, const ProgressRange& pr) { self.Build(pr); }))
    .function("Build", optional_override([](Derived_Algo& self) { self.Build(); })); // arity-0 truncation

  // TR-CW — cstring args trip the gate; only full arity registers.
  enum_<OpenMode>("OpenMode").value("ReadOnly", ReadOnly).value("ReadWrite", ReadWrite);
  class_<StrTool>("StrTool")
    .constructor<>()
    .function("Set", optional_override([](StrTool& self, std::string name, OpenMode mode) {
      self.Set(name.c_str(), mode);
    }))
    // ⚠ NO arity-1 truncation — bindgen's hasCStringArgs gate skips it. This is the defect.
    .property("routed", &StrTool::routed);

  // TR-MO — multi-overload trips the gate; only full arities register.
  class_<Edge>("Edge").constructor<>().property("id", &Edge::id);
  class_<Loc>("Loc").constructor<>().property("id", &Loc::id);
  class_<Sampler>("Sampler")
    .constructor<>()
    .function("Sample", select_overload<void(const Edge&, const Loc&, double, double)>(&Sampler::Sample))
    .function("Sample", select_overload<void(const Edge&,             double, double)>(&Sampler::Sample))
    // ⚠ NO truncations — bindgen's numOverloads>1 gate skips them. Defect.
    .property("routed", &Sampler::routed);

  // TR-RBV — value_object return trips the gate; only full arity registers.
  value_object<CurveResult>("CurveResult")
    .field("handle", &CurveResult::handle)
    .field("first",  &CurveResult::first)
    .field("last",   &CurveResult::last);
  class_<CurveTool>("CurveTool")
    .constructor<>()
    .function("GetCurve", optional_override([](CurveTool& self, const Edge& e, double tol) {
      return self.GetCurve(e, tol);
    }))
    // ⚠ NO arity-1 truncation — _returnTypeRequiresValueWrapper gate skips it. Defect.
    .property("routed", &CurveTool::routed);

  // TR-GATE — both gates trip.
  class_<Combo>("Combo")
    .constructor<>()
    .function("Proc", optional_override([](Combo& self, std::string name, double t) {
      return self.Proc(name.c_str(), t);
    }))
    // ⚠ NO arity-1 truncation — both hasCStringArgs and _returnTypeRequiresValueWrapper gates skip it. Defect.
    .property("routed", &Combo::routed);
}
```

### Corpus B binding shape (proposed post-R5 bindgen emission)

`corpus-b-optional.cpp` registers each class with `std::optional<T>` for trailing-default args + `register_optional<T>()` for every wrapped type. **One registration per overload** — the dispatcher uses upstream embind's relaxed-arity verifier (PR #22591) to materialise `std::nullopt` for omitted args.

```cpp
EMSCRIPTEN_BINDINGS(corpus_b) {
  using namespace emscripten;

  // C1 §B1 control — unchanged from Corpus A (no trailing defaults in this path).
  value_object<XYZ>("XYZ").field("x", &XYZ::x).field("y", &XYZ::y).field("z", &XYZ::z);
  value_object<Vec3>("Vec3").field("x", &Vec3::x).field("y", &Vec3::y).field("z", &Vec3::z);
  class_<Pnt>("Pnt")
    .constructor<double, double, double>()
    .constructor<const XYZ&>()
    .constructor<const Vec3&>()
    .property("routed", &Pnt::routed);

  // FO-R3 — single registration per class, optional unwraps to default ProgressRange.
  register_optional<ProgressRange>();
  value_object<ProgressRange>("ProgressRange").field("handle", &ProgressRange::handle);
  class_<Base_Algo>("Base_Algo")
    .constructor<>()
    .function("Build", optional_override([](Base_Algo& self, std::optional<ProgressRange> pr) {
      if (pr) self.Build(*pr); else self.Build();
    }))
    .property("lastBuildBy", &Base_Algo::lastBuildBy);
  class_<Derived_Algo, base<Base_Algo>>("Derived_Algo")
    .constructor<>()
    .function("Build", optional_override([](Derived_Algo& self, std::optional<ProgressRange> pr) {
      if (pr) self.Build(*pr); else self.Build();
    }));

  // TR-CW — single registration; optional OpenMode unwraps to ReadOnly default.
  register_optional<OpenMode>();
  enum_<OpenMode>("OpenMode").value("ReadOnly", ReadOnly).value("ReadWrite", ReadWrite);
  class_<StrTool>("StrTool")
    .constructor<>()
    .function("Set", optional_override([](StrTool& self, std::string name, std::optional<OpenMode> mode) {
      self.Set(name.c_str(), mode.value_or(ReadOnly));
    }))
    .property("routed", &StrTool::routed);

  // TR-MO — same-arity overload group, each registered ONCE with optional doubles.
  register_optional<double>();
  class_<Edge>("Edge").constructor<>().property("id", &Edge::id);
  class_<Loc>("Loc").constructor<>().property("id", &Loc::id);
  class_<Sampler>("Sampler")
    .constructor<>()
    .function("Sample", optional_override([](Sampler& self, const Edge& e, const Loc& l, std::optional<double> first, std::optional<double> last) {
      self.Sample(e, l, first.value_or(0.0), last.value_or(1.0));
    }))
    .function("Sample", optional_override([](Sampler& self, const Edge& e,             std::optional<double> first, std::optional<double> last) {
      self.Sample(e, first.value_or(0.0), last.value_or(1.0));
    }))
    .property("routed", &Sampler::routed);

  // TR-RBV — single registration; RBV envelope returns normally.
  value_object<CurveResult>("CurveResult")
    .field("handle", &CurveResult::handle)
    .field("first",  &CurveResult::first)
    .field("last",   &CurveResult::last);
  class_<CurveTool>("CurveTool")
    .constructor<>()
    .function("GetCurve", optional_override([](CurveTool& self, const Edge& e, std::optional<double> tol) {
      return self.GetCurve(e, tol.value_or(1e-6));
    }))
    .property("routed", &CurveTool::routed);

  // TR-GATE — both wrappers compose with std::optional.
  class_<Combo>("Combo")
    .constructor<>()
    .function("Proc", optional_override([](Combo& self, std::string name, std::optional<double> t) {
      return self.Proc(name.c_str(), t.value_or(1e-3));
    }))
    .property("routed", &Combo::routed);
}
```

Note: `register_optional<double>()` is called once and covers all `std::optional<double>` uses globally; the same applies to other primitive optionals.

## Test Matrix

`run.test.mjs` invokes the same six tests against both modules. Each test asserts the C++ `routed` / `lastBuildBy` member matches the expected branch.

| #   | Test                                                                   | Method called from JS                          | Expected `routed` (or `lastBuildBy`) | Corpus A | Corpus B | Catalog defect   |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------ | :------: | :------: | ---------------- |
| 1   | C1 §B1 control — `new Pnt(1, 2, 3)` resolves to the 3-double ctor      | `new mod.Pnt(1, 2, 3)`                         | `routed === 1`                       | **PASS** | **PASS** | (none — control) |
| 1b  | C1 §B1 control — `new Pnt(xyz)` resolves to the XYZ-taking ctor        | `new mod.Pnt({x:1,y:2,z:3})`                   | `routed === 2`                       | **PASS** | **PASS** | (none — control) |
| 2   | FO-R3 — `derived.Build()` invokes `Derived_Algo::Build`                | `d.Build()`                                    | `lastBuildBy === 2`                  | **FAIL** | **PASS** | FO-R3            |
| 3   | TR-CW — `tool.Set("file")` invokes `Set(name, ReadOnly)`               | `t.Set('file')`                                | `routed === 1`                       | **FAIL** | **PASS** | TR-CW            |
| 4   | TR-MO — `sampler.Sample(edge)` invokes `Sample(Edge, first=0, last=1)` | `s.Sample(edge)`                               | `routed === 2`                       | **FAIL** | **PASS** | TR-MO            |
| 5   | TR-RBV — `tool.GetCurve(edge)` returns envelope using default tol      | `t.GetCurve(edge)` → `{handle:1, first, last}` | `routed === 2 && r.handle === 1`     | **FAIL** | **PASS** | TR-RBV           |
| 6   | TR-GATE — `combo.Proc("x")` returns envelope using default t           | `c.Proc('x')` → `{handle:2, first, last}`      | `routed === 2 && r.handle === 2`     | **FAIL** | **PASS** | TR-GATE          |

Total: **7 tests** (control × 2 variants + 5 defect tests). Corpus A is expected to score **2/7** (controls only); Corpus B is expected to score **7/7**.

The runner exits 0 if both modules match their expected outcomes and exits 1 if either deviates. `results.json` records every test's actual vs expected for both modules.

## Hypotheses

| #   | Hypothesis                                                                                                                                                                                                                                | Falsified by                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| H1  | Corpus B compiles cleanly against the unchanged C1-only `libembind.ocjs-patched.js` — `std::optional<T>` + `register_optional<T>` requires no libembind patch modification.                                                               | A link error referencing `_embind_register_optional` or a `getSignature` `TypeError` involving `std::optional` typeids.    |
| H2  | All 5 catalog defects (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE) PASS in Corpus B while FAILing in Corpus A. Defect rows in the matrix flip wholesale.                                                                                        | Any defect row failing in Corpus B (Option C is not viable for that defect — investigate the gate-specific cause).         |
| H3  | C1 §B1 happy-path (tests 1 and 1b) PASSes identically in both corpora — no regression to v3's load-bearing suffix-free overload commitment.                                                                                               | Either control failing in Corpus B (`std::optional` interferes with the C1 dispatcher's `signaturesArray` lookup — fatal). |
| H4  | The bindgen translation rule is mechanical: `mock-bindgen.py` ≤ 60 lines and produces both Corpus A and Corpus B from the same input declaration set.                                                                                     | The translation requiring per-defect logic, heuristic gate predicates, or runtime type inspection in the bindgen emitter.  |
| H5  | `register_optional<T>` works for every C++ type family OCCT uses in trailing defaults: primitives (`double`, `int`, `bool`), enums (`OpenMode`), value-types (`ProgressRange`-style structs), and `value_object<T>` return-type carriers. | `register_optional<T>` failing to compile or link for any of these families — would force a hybrid C2-fan-out fallback.    |

## Decision Rules

The PoC produces an Option C verdict per the following table.

| Outcome                                                      | Verdict                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Corpus A scores 2/7 and Corpus B scores 7/7 (H1–H5 all hold) | **Option C validated.** Proceed with R5 in `src/ocjs_bindgen/codegen/bindings.py`.               |
| Corpus B scores ≥ 6/7 with one failure in TR-MO or TR-GATE   | **Option C partially viable.** R5 lands but the failing defect needs an addendum design pass.    |
| Corpus B scores < 5/7 OR any C1 control fails in Corpus B    | **Option C NOT viable as designed.** Reopen the strategic-direction doc with the PoC evidence.   |
| H1 falsified (Corpus B fails to link)                        | **Option C requires a libembind addendum.** Investigate the missing wiring before committing R5. |

## Recommendations for the Implementing Agent

| #   | Action                                                                                                                                                                                                                                                                                                                             | Priority     | Effort | Impact                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ | ----------------------------------------------------- |
| I1  | Scaffold `experiments/poc-option-c-validation/` per the layout in [Experiment Design](#experiment-design). Copy `libembind.ocjs-patched.js` verbatim from `experiments/poc-overload-dispatch-cost/libembind.ocjs-patched.js` (Finding 0 — same patch).                                                                             | P0           | Low    | High — sets harness baseline                          |
| I2  | Author `mock-occt.hpp` per the [Mock OCCT corpus](#mock-occt-corpus-mock-occthpp) section. Keep bodies trivial — the experiment validates dispatch, not C++ logic.                                                                                                                                                                 | P0           | Low    | High — defines the test surface                       |
| I3  | Hand-write `corpus-a-fan-out.cpp` and `corpus-b-optional.cpp` per the [Corpus A](#corpus-a-binding-shape-current-bindgen-emission) and [Corpus B](#corpus-b-binding-shape-proposed-post-r5-bindgen-emission) sections. These files are the reference contract for what post-R5 bindgen must emit.                                  | P0           | Medium | High — load-bearing artifact                          |
| I4  | Author `build.sh` mirroring `experiments/poc-overload-dispatch-cost/build.sh`'s emcc invocation pattern. Use the vendored `assimpjs/emsdk` toolchain. Compile each corpus into its own `.mjs` + `.wasm`.                                                                                                                           | P0           | Low    | Medium                                                |
| I5  | Author `run.test.mjs` per the [Test Matrix](#test-matrix) section. Color-coded PASS/FAIL output, exit 0 iff Corpus A matches its expected 2/7 and Corpus B matches its expected 7/7. Mirror the assertion style of `experiments/libembind-fan-out-poc/run.test.mjs`.                                                               | P0           | Low    | High — produces the empirical evidence                |
| I6  | Author `mock-bindgen.py` (~50 lines): read `mock-occt-decl.txt` (a small DSL — one class + methods + trailing-default annotations per line), emit either Corpus A or Corpus B shape based on a `--variant {a,b}` CLI flag. This is empirical evidence for H4 (mechanical translation rule).                                        | P1           | Medium | Medium — concretises the R5 implementation contract   |
| I7  | Commit `results.json` capturing the actual matrix output. Add a `README.md` at the experiment root summarising the headline result (e.g. "Corpus A: 2/7. Corpus B: 7/7. Option C validated."), the layout, and the reproducing commands.                                                                                           | P0           | Low    | High — the artifact future contributors reach for     |
| I8  | After this PoC validates Option C, update [`ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md) Finding 4 to incorporate Finding 0 of this PoC: the bifurcation requires **zero** libembind patch modification, not ~40% shrinkage as currently stated on line 213.             | P1           | Low    | Medium — corrects the strategic-doc's only inaccuracy |
| I9  | After R5 lands in `src/ocjs_bindgen/codegen/bindings.py`, run the full OCJS smoke suite (`pnpm vitest run tests/smoke/`) against the rebuilt `dist/opencascade_full.{js,wasm}` to verify the catalog defects vanish at the integration level. This PoC validates the **direction**; the smoke suite validates the **integration**. | P0 (post-R5) | Medium | High — full-system confirmation                       |

## Code Skeletons

### `apply-libembind-patch.sh` (no-op toggle for symmetry with sibling PoCs)

```bash
#!/usr/bin/env bash
# This PoC uses ONE libembind state (the current C1 patch, vendored as
# libembind.ocjs-patched.js). No toggle is needed — Finding 0 establishes
# that the C2 retirement requires zero libembind modification.
# This script exists for symmetry with sibling PoCs (`poc-overload-dispatch-cost/`,
# `libembind-fan-out-poc/`) that DO toggle libembind variants.
set -euo pipefail
cd "$(dirname "$0")"

EMSDK_LIBEMBIND="/Users/rifont/git/tau/repos/assimpjs/emsdk/upstream/emscripten/src/lib/libembind.js"
PATCHED_SNAPSHOT="$(pwd)/libembind.ocjs-patched.js"

[[ -f "${PATCHED_SNAPSHOT}" ]] || { echo "Missing ${PATCHED_SNAPSHOT}" >&2; exit 1; }

case "${1:-apply}" in
  apply|restore)
    cp "${PATCHED_SNAPSHOT}" "${EMSDK_LIBEMBIND}"
    echo "applied: ocjs-patched C1-only libembind"
    ;;
  *)
    echo "Usage: $0 [apply|restore]" >&2
    exit 1
    ;;
esac
```

### `build.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
./apply-libembind-patch.sh apply

EMSDK="/Users/rifont/git/tau/repos/assimpjs/emsdk"
source "${EMSDK}/emsdk_env.sh" > /dev/null

COMMON_FLAGS=(
  -std=c++20
  -O2
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sENVIRONMENT=node
  -sALLOW_MEMORY_GROWTH=1
  -lembind
  --bind
  -I.
)

build() {
  local label="$1"; shift
  local out="$1"; shift
  local cpp="$1"; shift
  echo "── building ${label} ──"
  emcc "${COMMON_FLAGS[@]}" "${cpp}" -o "${out}"
}

build "Corpus A (fan-out)"      mod-a-fan-out.mjs   corpus-a-fan-out.cpp
build "Corpus B (std::optional)" mod-b-optional.mjs corpus-b-optional.cpp

echo "✓ all corpora built"
```

### `run.test.mjs` (test matrix structure)

```js
import createA from './mod-a-fan-out.mjs';
import createB from './mod-b-optional.mjs';

const buildCases = (mod) => [
  {
    id: '1',
    name: 'C1 §B1 ctor — Pnt(1,2,3) → 3-double',
    run: () => {
      const p = new mod.Pnt(1, 2, 3);
      const r = p.routed;
      p.delete();
      return r === 1 ? null : `expected 1, got ${r}`;
    },
  },
  {
    id: '1b',
    name: 'C1 §B1 ctor — Pnt(xyz) → XYZ-taking',
    run: () => {
      const p = new mod.Pnt({ x: 1, y: 2, z: 3 });
      const r = p.routed;
      p.delete();
      return r === 2 ? null : `expected 2, got ${r}`;
    },
  },
  {
    id: '2',
    name: 'FO-R3 — derived.Build() invokes Derived_Algo::Build',
    run: () => {
      const d = new mod.Derived_Algo();
      d.Build();
      const r = d.lastBuildBy;
      d.delete();
      return r === 2 ? null : `expected 2, got ${r}`;
    },
  },
  {
    id: '3',
    name: 'TR-CW — Set("file") with default OpenMode',
    run: () => {
      const t = new mod.StrTool();
      t.Set('file');
      const r = t.routed;
      t.delete();
      return r === 1 ? null : `expected 1, got ${r}`;
    },
  },
  {
    id: '4',
    name: 'TR-MO — Sample(edge) with default first/last',
    run: () => {
      const s = new mod.Sampler();
      const e = new mod.Edge();
      s.Sample(e);
      const r = s.routed;
      e.delete();
      s.delete();
      return r === 2 ? null : `expected 2, got ${r}`;
    },
  },
  {
    id: '5',
    name: 'TR-RBV — GetCurve(edge) with default tol',
    run: () => {
      const t = new mod.CurveTool();
      const e = new mod.Edge();
      const cr = t.GetCurve(e);
      const r = t.routed;
      e.delete();
      t.delete();
      return r === 2 && cr.handle === 1 ? null : `expected routed=2 handle=1, got routed=${r} handle=${cr.handle}`;
    },
  },
  {
    id: '6',
    name: 'TR-GATE — Proc("x") with default t',
    run: () => {
      const c = new mod.Combo();
      const cr = c.Proc('x');
      const r = c.routed;
      c.delete();
      return r === 2 && cr.handle === 2 ? null : `expected routed=2 handle=2, got routed=${r} handle=${cr.handle}`;
    },
  },
];

const runModule = async (label, factory, expectedFailing) => {
  const mod = await factory({});
  const cases = buildCases(mod);
  const results = cases.map((c) => {
    try {
      const err = c.run();
      return { id: c.id, name: c.name, status: err == null ? 'PASS' : 'FAIL', detail: err };
    } catch (e) {
      return { id: c.id, name: c.name, status: 'FAIL', detail: `THREW: ${e?.message ?? e}` };
    }
  });
  const pass = results.filter((r) => r.status === 'PASS').length;
  const total = results.length;
  console.log(`\n══════ ${label} — ${pass}/${total} passed ══════`);
  for (const r of results)
    console.log(
      `  [${r.status === 'PASS' ? 'PASS' : 'FAIL'}] ${r.id.padEnd(3)} ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`,
    );
  return { label, pass, total, results };
};

const a = await runModule('Corpus A (current bindgen fan-out)', createA, ['2', '3', '4', '5', '6']);
const b = await runModule('Corpus B (proposed std::optional)', createB, []);

const aExpected = a.results.every((r) => (['1', '1b'].includes(r.id) ? r.status === 'PASS' : r.status === 'FAIL'));
const bExpected = b.results.every((r) => r.status === 'PASS');
console.log('\n══════ verdict ══════');
console.log(
  `  Corpus A: ${a.pass}/${a.total} — expected 2/${a.total} (controls only).  ${aExpected ? '✓ matches expectation' : '✗ DEVIATES'}`,
);
console.log(
  `  Corpus B: ${b.pass}/${b.total} — expected ${b.total}/${b.total} (all pass). ${bExpected ? '✓ matches expectation' : '✗ DEVIATES'}`,
);
const verdict =
  aExpected && bExpected ? 'Option C VALIDATED.' : 'Option C NOT validated — review the deviating rows above.';
console.log(`  ${verdict}\n`);

import * as fs from 'node:fs';
fs.writeFileSync('./results.json', JSON.stringify({ a, b, verdict, timestamp: new Date().toISOString() }, null, 2));
process.exit(aExpected && bExpected ? 0 : 1);
```

### `mock-bindgen.py` (translation-rule sketch)

The full script lives in the experiment dir; this skeleton illustrates the mechanical-translation claim (H4) at the design level. Inputs are a tiny DSL line per method; outputs are the corpus binding fragments.

```python
#!/usr/bin/env python3
# Emits Corpus A (fan-out) or Corpus B (std::optional) binding fragments from
# a minimal DSL. Proves the bindgen translation rule is mechanical (H4).
#
# DSL example (one per line):
#   class StrTool method Set arg const_char_ptr name arg OpenMode mode default ReadOnly
#   class Sampler method Sample arg Edge& e arg Loc& l arg double first default 0.0 arg double last default 1.0
import sys

def parse(line):
    # ... returns dict(class, method, args=[(type, name, default_or_None), ...])
    ...

def emit_corpus_a(spec):
    # Single full-arity registration via optional_override.
    # NO truncation emit if any gate trips: cstring arg, multi-overload, RBV return.
    full = ', '.join(f'{t} {n}' for t, n, _ in spec['args'])
    body = f'self.{spec["method"]}({", ".join(n for _, n, _ in spec["args"])})'
    return f'.function("{spec["method"]}", optional_override([](self_t& self, {full}) {{ {body}; }}))'

def emit_corpus_b(spec):
    # Wrap every trailing-default arg in std::optional<T>, register_optional<T>().
    full, registers = [], set()
    for t, n, d in spec['args']:
        if d is not None:
            full.append(f'std::optional<{t}> {n}')
            registers.add(t)
        else:
            full.append(f'{t} {n}')
    unpack = ', '.join(f'{n}.value_or({d})' if d else n for t, n, d in spec['args'])
    body = f'self.{spec["method"]}({unpack})'
    fn = f'.function("{spec["method"]}", optional_override([](self_t& self, {", ".join(full)}) {{ {body}; }}))'
    regs = '\n'.join(f'register_optional<{t}>();' for t in sorted(registers))
    return regs + '\n' + fn

if __name__ == '__main__':
    variant = sys.argv[1]  # 'a' or 'b'
    for line in sys.stdin:
        if not line.strip(): continue
        spec = parse(line)
        print(emit_corpus_a(spec) if variant == 'a' else emit_corpus_b(spec))
```

The full implementation grows this to ~60 lines (handles class/method grouping, the `register_optional` deduplication across methods of one class). The point of the sketch: the rule fits in **one branch** (`emit_corpus_b` vs `emit_corpus_a`) — no per-defect logic, no heuristic gate predicates.

## References

- Source: [`docs/research/ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md) — Option C strategic decision being validated.
- Source: [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md) — the 8 catalog defects, of which 5 are the validation target.
- Source: [`docs/research/ocjs-trailing-default-arity-fan-out.md`](./ocjs-trailing-default-arity-fan-out.md) — prior fork-side investigation of the C2 mechanism this PoC retires.
- Source: [`docs/research/ocjs-suffix-free-overload-cost-experiment-design.md`](./ocjs-suffix-free-overload-cost-experiment-design.md) — precedent experiment design (toggle-libembind, mock-OCCT-corpus, run.test.mjs idioms reused here).
- Source: [`repos/opencascade.js/src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) — 429 lines, purely C1 (verified in Finding 0).
- Source: [`repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) — `_countTrailingDefaults` + 4 gate predicates at lines 793, 890, 897, 1442, 1452, 1586, 1698-1755, 3219-3241.
- Source: [`repos/opencascade.js/experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/) — sibling PoC for FO-R1; provides the `apply-libembind-patch.sh` toggle pattern and the `run.test.mjs` assertion style this PoC reuses.
- Source: [`repos/opencascade.js/experiments/poc-overload-dispatch-cost/`](../../repos/opencascade.js/experiments/poc-overload-dispatch-cost/) — sibling PoC for C1 cost; provides the vendored `libembind.ocjs-patched.js` snapshot this PoC reuses verbatim.
- Upstream: [emscripten/issues/22389](https://github.com/emscripten-core/emscripten/issues/22389) + [PR #22591](https://github.com/emscripten-core/emscripten/pull/22591) — canonical `std::optional<T>` + `register_optional<T>` mechanism merged in Emscripten 3.1.68.
- Upstream: [embind documentation — overloaded functions](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html#overloaded-functions) — confirms embind's relaxed-arity verifier materialises `std::nullopt` for omitted trailing args without bindgen cooperation.

## Appendix A — Catalog Defect → Mock OCCT Pattern Mapping

| Catalog defect | Real OCCT class triggering it (full.yml)                                                                                                                         | Why bindgen skips fan-out today                                                                                                                                                                            | Mock C++ in this PoC                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **FO-R3**      | `BRepBuilderAPI_MakeChamfer::Build(progress = Message_ProgressRange())` overriding `BRepBuilderAPI_MakeShape::Build()`                                           | Inherited arity-0 truncation table is shadowed by override registration; current R1/R2 gates correctly isolate own-property registrations but don't repopulate the truncation.                             | `Base_Algo` + `Derived_Algo` with virtual `Build(ProgressRange = {})`         |
| **TR-CW**      | `Standard_AsciiString::Standard_AsciiString(const char*, Standard_Integer = -1)` and method variants                                                             | `hasCStringArgs` gate (`bindings.py:1724`) skips fan-out because the cstring-wrapper lambda is already emitted; bindgen can't compose them.                                                                | `StrTool::Set(const char*, OpenMode = ReadOnly)`                              |
| **TR-MO**      | `BRep_Tool::Curve(edge, loc, first=0, last=0)` is one of multiple same-arity overloads (also `Curve(edge, first, last)`)                                         | `numOverloads > 1` gate (`bindings.py:1722` via the enclosing overload count check) skips fan-out because the dispatcher disambiguates by signature; fan-out would emit ambiguous arity-truncated lambdas. | `Sampler` with two same-arity `Sample` overloads, each with trailing defaults |
| **TR-RBV**     | `BRep_Tool::Curve(...)` → `Handle<Geom_Curve>` envelope return                                                                                                   | `_returnTypeRequiresValueWrapper` gate (`bindings.py:1726`) skips fan-out because the envelope-construction lambda is already wrapping the return.                                                         | `CurveTool::GetCurve(Edge, double tol = 1e-6) -> CurveResult`                 |
| **TR-GATE**    | Any combination of two or more of the above (e.g. `XCAFDoc_*::ProcessText(const char* msg, Quantity_Color color = …) -> ProcessResult` would trip cstring + RBV) | Multiple gates trip simultaneously; current bindgen has no shared helper for the gate parity (the strategic doc tracks this as the "parity of two gates" defect).                                          | `Combo::Proc(const char*, double t = 1e-3) -> CurveResult`                    |

## Appendix B — Bindgen Translation Rule (post-R5)

The R5 change in `src/ocjs_bindgen/codegen/bindings.py` is concisely:

**Before** (the four gate predicates at lines 1720-1727):

```python
nDefaults = self._countTrailingDefaults(method)
if (
  nDefaults > 0
  and numOverloads == 1
  and not hasOutputParams
  and not hasCStringArgs
  and not returnIsCString
  and not self._returnTypeRequiresValueWrapper(method)
):
  # ... emit per-arity truncated lambdas via optional_override
```

**After** (R5):

```python
# Emit one binding per overload. Trailing-default args become std::optional<T>
# in the lambda signature; the lambda body calls .value_or(default) per arg.
# register_optional<T>() is emitted once per distinct T, deduplicated across
# the EMSCRIPTEN_BINDINGS block.
for i, arg in enumerate(args):
  if arg.has_default:
    lambda_decl[i] = f'std::optional<{arg.type}> {arg.name}'
    call_expr[i]   = f'{arg.name}.value_or({arg.default_cpp_literal})'
    optional_types_to_register.add(arg.type)
  else:
    lambda_decl[i] = f'{arg.type} {arg.name}'
    call_expr[i]   = arg.name
# ... emit single .function() registration; emit register_optional<T>() once per type
```

The entire C2 retirement is contained within this loop. The four gate predicates (`hasCStringArgs`, `returnIsCString`, `numOverloads > 1`, `_returnTypeRequiresValueWrapper`) and `_countTrailingDefaults` itself become **dead code** and can be deleted in the same commit.

The translation composes naturally with the cstring-wrapper, RBV-envelope, and multi-overload emit paths because the trailing-default handling now lives **inside** the per-overload lambda body, not as a separate per-arity registration. The composition gates disappear because there is nothing left to gate.

## Appendix C — Boundaries and Out-of-Scope Defects

| Defect (catalog ID)               | Concern | Why excluded from this PoC                                                                                                                                                                                                       | Where it's tracked / validated                                                          |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **FO-R1**                         | C1      | Orthogonal architectural defect (own-property proto walk). Including it would muddy the C2-retirement signal.                                                                                                                    | `experiments/libembind-fan-out-poc/` + R4 (own-property fix)                            |
| **DF-R2b**                        | C1      | RBV collision handler for `Handle<>` vs `val` same-arity overloads. C1-side fix, separate.                                                                                                                                       | R4 / R5 follow-on                                                                       |
| **CTJ-1 / CTJ-2**                 | C1      | `cppTypeToJsType` minifier brittleness. C1-side hot-patch, separate.                                                                                                                                                             | R3 (postset-based fix)                                                                  |
| **Constructor trailing defaults** | C2      | Bindgen's `constructor.py` also fans out trailing defaults via the same `_countTrailingDefaults` walker. The dispatch surface is identical (`constructor_body[arity].signaturesArray`), so the validation argument carries over. | Verified separately during R5 integration; this PoC focuses on the method-dispatch path |
