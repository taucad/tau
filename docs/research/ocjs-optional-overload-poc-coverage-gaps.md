---
title: 'OCJS Optional-Overload PoC Coverage Gaps and Front-Loadable Experiments'
description: 'Stocktake of the unplanned trial-and-error work surfaced during the optional-overload migration, mapped to missing PoC experiments and the architecturally correct canonical approach for each gap.'
status: active
created: '2026-05-28'
updated: '2026-05-28'
category: audit
related:
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-libembind-strategic-direction-assessment.md
  - docs/research/ocjs-trailing-default-arity-fan-out.md
---

# OCJS Optional-Overload PoC Coverage Gaps and Front-Loadable Experiments

Stocktake of the unplanned work that surfaced after Step 1 (libembind v2 patch swap) and Step 4 (bindgen `processMethodOrProperty` migration) of the optional-overload migration plan landed. Each gap is traced to a PoC experiment that should have been front-loaded under `repos/opencascade.js/experiments/poc-occt-integration/`, the canonical architectural fix is identified, and a concrete experiment design is proposed.

## Executive Summary

The optional-overload migration entered execution claiming Gates 1–3 + R1–R6 + T1–T5 + U1/U3/U4/U8 had discharged every risk against real OCCT (`poc-occt-integration/README.md`: 96/96 expectations met). After running the migrated emitter end-to-end against the full smoke suite, **11 smoke tests remain failing**. Cross-checked against `main`: the **4 additional failures** (`smoke-brep-gprop-face` ×2, `smoke-cstring-dispatch` ×2) **also reproduce on the stashed state** — i.e. they are not directly caused by the migration's bindgen edits. However:

- **The `smoke-cstring-dispatch` failures share the dispatcher fix surface with this migration.** They are caused by `cppTypeToJsType` minifier elimination + the canonical `$getSignature` lacking a primitive-priority path ("Path B" per [`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md) §Finding 3) — exactly the same patch file (`libembind-overloading.patch`) the v2 migration owns. **Treating them as separate is the wrong framing**: the migration's "make libembind dispatcher complete" prong (canonical approach §1) must also fold Path B back into the v2 patch, otherwise CTJ-1/CTJ-2 mitigation gets silently lost when the migration ships.
- **The `smoke-brep-gprop-face` failures are also caused by this migration** — sub-class 2b of the dispatch-cross-arity gap (Finding 2). Smoking gun: `BRepGProp_Face(bool = false)` + `BRepGProp_Face(Face, bool = false)` migration-emitted as arity-1 `(optional<bool>)` + arity-2 `(Face, optional<bool>)`. The test's `new oc.BRepGProp_Face(face)` matches the arity-1 ctor via the optional-wildcard short-circuit (`fieldType.optional === true → return true`), truthy-coerces the Face to `bool(true)` via `register_optional<bool>::toWireType`, and constructs `BRepGProp_Face(true)` with **no face loaded**. The subsequent `.Bounds()` returns zeros (no surface to bound) and `.Normal()` crashes with `null function or function signature mismatch` (vtable through the null `mySurface`). **The dispatch path is documented in full in Appendix B (Finding 2 sub-class 2b).** Pre-migration fan-out emitted TWO arity-1 entries (`<bool>` + `<Face>` truncation); `instanceof TopoDS_Face` won — the test passed. Migration collapsed them into ONE wildcard-only entry, silently breaking every class with the `C(T1, T2=def)` + `C(T2=def)` pattern.

There is also a **patch-application hygiene defect** that surfaced during this analysis: `deps/emsdk/upstream/emscripten/src/lib/libembind.js` currently contains **five duplicate `$getSignature` definitions** (lines 58, 168, 238, 308, 388). Each prior patch iteration appended a new definition without removing the previous; only the LAST survives at runtime (JS object-literal duplicate-key semantics). This file state is NOT what a clean build produces — it's an artefact of incremental patch re-application during this session. On a clean build the canonical patch produces exactly one definition (verified by inspecting `experiments/poc-occt-integration/libembind.production+arity-pad.js`, which has 1). The defect explains why intermediate Path B variants appeared in earlier patch drafts but cannot survive a clean build cycle — see Finding 6 (extended) and the new Recommendation R17 below.

The 7 migration-attributable failures cluster into five architecturally distinct gaps the PoC did **not** validate:

1. **NULL-COERCION** (4 failures) — `EmValOptionalType<T>::toWireType(null)` does **not** map to `std::nullopt` for value-typed `T`; only handle-typed `T` accepts `null`. R3 only tested the handle path.
2. **DISPATCH-CROSS-ARITY** (3 failures — 2 sub-classes) —
   - **Sub-class 2a**: When a class registers ctors at overlapping arities with different JS-type signatures at the same parameter position (e.g. `BRepMesh_IncrementalMesh` `{0, 3, 5}` where arity 3 is `(Shape, IMeshTools_Parameters, …)` and arity 5 is `(Shape, double, …)`), the dispatcher cannot fall through from a wrong-typed exact-arity match.
   - **Sub-class 2b** _(smoking-gun migration regression)_: When the source has `C(T1, T2 = default)` + `C(T2 = default)`, migration emits an arity-N `(optional<T2>)` ctor and an arity-(N+1) `(T1, optional<T2>)` ctor. For `new C(t1Instance)`, the dispatcher's optional-wildcard branch short-circuits at the arity-N entry, truthy-coerces the `T1` instance to `T2`, and constructs `C(T2=true)` with the `T1` argument lost. `BRepGProp_Face` is the proof — three test failures (`smoke-brep-gprop-face` ×2 + the chain that depends on Bounds/Normal). Pre-migration fan-out emitted TWO arity-N entries (`<T2>` + `<T1>` truncation); `instanceof T1` won. Migration collapsed them to one wildcard-only entry. **R1 + Gate 2 covered `{0, 5}` and `{0, 3}` but never the degenerate-sibling pattern `{1, 2}` where the smaller is a truncation-of-larger that becomes wildcard-only after optional wrapping.**
3. **MULTI-OVERLOAD-BINDGEN-GAP** (1 failure) — The bindgen `numOverloads == 1` gate excludes multi-overload methods with trailing defaults (TR-MO) from optional-wrapping; the migration preserved this gate, so methods like `BRepOffsetAPI_MakeFilling.Add(edge, order, IsBound=true)` continue to use fan-out (which is now stripped). No PoC binding shape exercised `f(EdgeOrFace, ...)` + `f(Edge, ..., bool=true)` co-emission.
4. **CSTRING-BINDGEN-GAP** (1 failure) — The `hasCStringArgs || returnIsCString` gate excludes cstring-wrapper methods (TR-CW) from optional-wrapping; the migration preserved this gate, so `IFSelect_Act.SetGroup(group, file="")` continues to fail on the 1-arg call. No PoC binding shape exercised `f(std::string, std::optional<std::string>)` with `value_or("").c_str()`.
5. **OBSOLETE-TEST-PIN** (1 failure) — `smoke-rbv-trailing-defaults.test.ts` is a defect pin that asserts the **fan-out** shape (`>=3 .class_function("Perform"` entries). Per the catalog's Recommendation R0, this pin should be retired (or rewritten to assert the new single-binding shape) when the underlying gate is removed.

Architectural verdict: **the dispatcher (`libembind-overloading.v2.patch`) is correct as built; every gap is either an emitter gap or an experiment the PoC should have run** to prevent end-to-end trial-and-error during migration. The canonical fix is to (a) tighten `EmValOptionalType::toWireType` to accept `null` for value types (one additional libembind hunk), (b) make `libembind`'s arity-pad type-aware across all candidate arities (already implemented in the in-tree hot-edit; should be folded back into `v2.patch`), and (c) delete the `numOverloads == 1`, `hasCStringArgs`, `returnIsCString` gates in `bindings.py` per the blueprint's Step 4. This document recommends **six new PoC experiments (R9–R14)** to be added under `experiments/poc-occt-integration/` so the same class of regressions never escapes to the smoke suite again.

> **⚠ STRATEGIC RESERVATION** _(added after author's strategic-review pass)_. The recommendations above are the **minimum work to make the current `std::optional<T>` approach functional**. They do **not** answer the more important question: **is `std::optional<T>` the right primitive for "C++ trailing default argument" at all?** Each new production OCCT shape (degenerate-sibling ctor pairs, multi-overload trailing defaults, cstring composition, null-coercion semantics) is producing **a new libembind hunk** with **diminishing upstream-alignment**. The semantic mismatch — `std::optional<T>` models "Maybe T or undefined", we want "default-argument with concrete C++ default" — is at the root of every new failure mode. **See [§Strategic Assessment](#strategic-assessment-are-we-on-the-right-track) below before committing more engineering to the optional path**; the alternative (`emscripten::val` + explicit discrimination, already the dominant OCJS idiom with 27,787 usages across 5,324 binding files) likely dissolves most of the open problems without requiring any new libembind hunks at all.

## Strategic Assessment: Are We On The Right Track?

This section was added during a strategic-review pass after the per-failure analysis was complete. It deliberately zooms out from "how do we fix each failure" to "is the high-level approach producing the right outcomes." The conclusion is **mixed**: the optional-overload migration's headline goal (collapse N fan-out registrations into 1) is sound, but the **mechanism chosen (`std::optional<T>`)** is producing a steady stream of new failures, each of which costs a new libembind hunk, each of which weakens upstream alignment and dispatcher performance. There is a credible alternative (`emscripten::val` + explicit discrimination) that already dominates the existing OCJS codebase, dissolves most of the new failure classes, and stays inside upstream-canonical embind. **The PoC should empirically compare both before this migration ships further.**

### S.1 The shape of the problem

The original motivation for the migration was **bundle size + libembind patch maintenance**: N fan-out registrations per method cost roughly +6% JS-glue bytes per migrated method (PoC's `bench-wallclock-results.json`), and the C2 portion of the patch carried `signaturesArray` book-keeping that grew with every new overload arity. Migrating to a single `std::optional<T>` binding per method was supposed to **shrink** the patch (catalog R7' explicitly claims this — "5 of 8 catalog defects collapse to zero work under Option C").

What actually happened in the patch-size dimension:

| Patch state                                                           | Lines     | Hunks    | Notes                                                                                                          |
| --------------------------------------------------------------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Pre-migration baseline (`main`, committed)                            | 429       | 13       | C1 + C2 carrying R1/R2 prototype guards                                                                        |
| PoC v2 patch (`libembind-overloading.v2.patch`)                       | 483       | 14       | C1 + C2 + arity-pad + optional-wildcard. **+54 lines / +1 hunk (claimed)**                                     |
| Current in-tree (with hot-edits during migration)                     | ~520      | ~15      | C1 + C2 + arity-pad + optional-wildcard + type-aware fallback hunk                                             |
| **Projected to make smoke suite green** (R9 + R10 + R10b + R18 hunks) | **~620+** | **~18+** | Adds null-coercion (Hunk 4), cross-arity type-aware (Hunk 5), concrete-beats-wildcard (Hunk 6), Path B fold-in |

The PoC asserted "+54 lines / +1 hunk vs current production." Reality on the way to a working smoke suite is **5x that**, with each new hunk solving exactly one shape that the PoC did not exercise. **This pattern does not show any sign of terminating** — every new OCCT class with a new C++-default-argument shape risks adding another hunk.

### S.2 The semantic root cause

The fundamental issue is that `std::optional<T>` and "C++ trailing default argument" are **two different semantic primitives** that we are forcing to share an implementation:

| Dimension                    | `std::optional<T>` (embind canonical)              | C++ trailing default arg (what OCCT actually has)                                  |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| What "absence" means         | The caller chose to provide no value (`undefined`) | The caller did not specify a value; the **declared C++ default** is used           |
| The "default" value          | `std::nullopt` — fundamentally distinct from any T | A concrete T instance (e.g. `Message_ProgressRange()`, `false`, `1.0`, `Handle()`) |
| Wire-protocol contract       | `undefined` ↔ `nullopt`; `T` ↔ `optional<T>(T)`    | `(absent)` ↔ `T(<default-expr>)`; `T` ↔ `T`                                        |
| Null semantics               | Upstream: only `undefined` is nullopt              | OCCT users naturally pass `null` to mean "use default"                             |
| Type ambiguity at JS surface | `T \| undefined` — distinguishable                 | `T` — caller cannot express "use default" except by absence                        |

Every failure in this document is downstream of forcing the right column into the left column:

- **NULL-COERCION** (Finding 1): `null` ≠ `undefined` for `EmValOptionalType<T>::toWireType` in upstream. OCJS wants both to mean "use default." We need a libembind hunk to change the contract.
- **Sub-class 2b shadowing** (Finding 2): `optional<bool>` wildcard match accepts a `TopoDS_Face` instance and truthy-coerces it to `bool(true)`. The semantic mismatch is the bug: `optional<bool>` should mean "either bool or absence," not "wildcard accept-anything-then-truthy-coerce." But because the optional layer is **outside** the type system, the wildcard short-circuit is unavoidable in a generic dispatcher.
- **R4 collision**: `f(val)` and `f(optional<T>)` are indistinguishable to the dispatcher because optional's wildcard matches everything val matches. Forcing two semantically different intents through the same dispatch produces silent unreachability.
- **R6 output-param confusion**: `T&` mutated output vs `T = default` immutable input share C++ syntax structure (the `=` may or may not be present), forcing a bindgen-side classifier that errors on misclassification.
- **T1 multi-optional collision**: Two same-arity siblings both wildcard-matching produces last-of-registration-wins, which is implementation-defined.

Each of these requires either a **libembind hunk** or a **bindgen guard** that exists **only because `std::optional<T>` is the wrong primitive for the job**. None of these would arise if the default-argument concept were modeled with `val` + explicit `isUndefined()`/`isNull()` discrimination inside the lambda body — which is exactly the pattern OCJS already uses for runtime polymorphism in 27,787 places across 5,324 binding files.

### S.3 The val-dispatch alternative — what it looks like

Today bindgen emits two distinct trailing-default styles depending on context:

```cpp
// Today: trailing default via std::optional<T> (this migration's emission)
.function("Build",
  optional_override([](Self& self, std::optional<Message_ProgressRange> p) {
    return self.Build(p.value_or(Message_ProgressRange()));
  }), allow_raw_pointers())

// Today: same-arity polymorphism via emscripten::val (OCJS's dominant pattern, e.g. TCollection_ExtendedString)
.constructor(optional_override([](emscripten::val arg0) -> TCollection_ExtendedString* {
  if (arg0.typeOf().as<std::string>() == "number" && Number.isInteger(arg0)) {
    return new TCollection_ExtendedString(arg0.as<const int>());
  }
  return new TCollection_ExtendedString(arg0.as<const double>());
}))
```

If we adopted the val-dispatch pattern for trailing defaults too, the emission becomes uniform:

```cpp
// Proposed: trailing default via emscripten::val + explicit discrimination
.function("Build",
  optional_override([](Self& self, emscripten::val p) {
    return self.Build(
      (p.isUndefined() || p.isNull())
        ? Message_ProgressRange()
        : p.as<Message_ProgressRange>(emscripten::allow_raw_pointers()));
  }), allow_raw_pointers())
```

What this changes:

| Dimension                                                              | `std::optional<T>` approach (current migration)                                                                                                                                                                         | `emscripten::val` + discrimination                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Libembind hunks needed for trailing defaults**                       | 1 (arity-pad ctor) + 1 (arity-pad method) + 1 (optional-wildcard `$getSignature`) + 1 (null→nullopt `toWireType`) + 1 (type-aware cross-arity fallback) + 1 (concrete-beats-wildcard precedence) = **6 hunks, growing** | **0** — uses existing upstream embind val handling                                                                                                                                                                                                     |
| **R4 val-vs-optional same-arity ambiguity**                            | Requires bindgen-side guard (`predicates/optional_emission_guards.py`)                                                                                                                                                  | **Does not arise** — only val-typed slots, no optional<T> at all                                                                                                                                                                                       |
| **R6 non-const-ref-in-optional**                                       | Requires bindgen-side guard                                                                                                                                                                                             | **Does not arise** — val cannot be misclassified as output param                                                                                                                                                                                       |
| **T1 multi-optional same-arity collision**                             | Requires bindgen-side guard                                                                                                                                                                                             | **Does not arise** — no `optional<T>` types in dispatch table                                                                                                                                                                                          |
| **Sub-class 2b degenerate-sibling shadowing** (`BRepGProp_Face(face)`) | Requires dispatcher precedence hunk (Hunk 6) or bindgen merge into single val-discriminated ctor                                                                                                                        | **Trivially handled** — `arg0.instanceof(Face)` check inside the lambda body discriminates correctly with zero ambiguity                                                                                                                               |
| **Null-coercion symmetry**                                             | Requires Hunk 4 in `EmValOptionalType<T>::toWireType` (upstream incompatible)                                                                                                                                           | **Trivially handled** — `arg0.isNull() \|\| arg0.isUndefined()` in lambda body, no embind contract change                                                                                                                                              |
| **Multi-overload + trailing default (TR-MO)**                          | Requires deleting `numOverloads == 1` gate + dispatcher correctly routing                                                                                                                                               | **Each overload is independent** — own val-discrimination in its own lambda, no dispatch ambiguity                                                                                                                                                     |
| **CString + trailing default (TR-CW)**                                 | Requires deleting `hasCStringArgs` gate + composing `value_or("").c_str()`                                                                                                                                              | `arg.isUndefined() ? "" : arg.as<std::string>().c_str()` — uniform with non-cstring path                                                                                                                                                               |
| **Per-call runtime cost**                                              | One `EmValOptionalType<T>::toWireType` + one `value_or(...)` + one C++ copy/move                                                                                                                                        | One `val::isUndefined()` (single JS call) + one `val::as<T>()` if present + one C++ copy/move. **Same machinery; one fewer template instantiation per type.**                                                                                          |
| **WASM size delta vs fan-out**                                         | PoC measured +6,161 B / +0.17% per migrated ctor                                                                                                                                                                        | **Not yet measured** — empirically TBD; likely comparable since each ctor still emits one lambda with one typeId conversion. Could be smaller because no per-T `register_optional<T>` is emitted (one less embind machinery cost per distinct T type). |
| **Upstream alignment**                                                 | Diverging — Hunks 4, 5, 6 are not upstream-compatible (changed semantic contract, dispatch precedence inversion)                                                                                                        | **Strictly inside upstream-canonical embind**; the dispatch hunks needed for the val-dispatch path are exactly the arity-pad hunks already in v1, no new ones                                                                                          |
| **Bindgen-side guards required**                                       | R4, R6, T1 — three new emit-time validators                                                                                                                                                                             | **None** for trailing defaults; existing val-dispatch path already handles ambiguity at the lambda body level                                                                                                                                          |
| **TypeScript surface**                                                 | `T \| undefined`                                                                                                                                                                                                        | `T \| undefined` (identical)                                                                                                                                                                                                                           |
| **C++ type safety inside lambda**                                      | Stronger — `std::optional<T>` is statically typed                                                                                                                                                                       | Weaker — `emscripten::val` is dynamically typed; mistakes surface as runtime `BindingError` from `val::as<T>()`                                                                                                                                        |
| **Existing codebase fit**                                              | Net-new pattern — 0 existing call sites                                                                                                                                                                                 | **27,787 existing usages across 5,324 binding files**; idiomatic in OCJS bindgen                                                                                                                                                                       |

### S.4 Performance assessment — can we measure real impact?

**What we have measured (PoC):**

- Corpus B (`std::optional<T>`) vs Corpus A (fan-out) on a sphere build+mesh, 300 iterations median: −0.005 ms (−0.56%, noise).
- Bundle: +30,008 B / +0.84% for the full Corpus B (includes all R3–R6 + T1–T4 + U1/U3/U4 probe bindings). Pure single-ctor migration: +6,161 B / +0.17%.

**What we have NOT measured:**

1. Per-call dispatcher cost under the **full set of hunks needed to pass smoke** (currently 4 hunks shipped, 3 more proposed). Each hunk adds branches to the hot path of `$getSignature` and `$ensureOverloadTable`. The PoC measured Corpus B with **3 hunks** — the post-fix dispatcher has at least **6**.
2. Per-call cost on a method called in tight loops (e.g. `gp_Pnt::X()`, `TopExp_Explorer::More()`, `Adaptor3d_Surface::Value()` — the hot inner loops of every CAD operation). Sphere meshing is one workload; replicad's actual workflow is many more.
3. Corpus C (val-dispatch for trailing defaults) — never built. **This is the key missing data point.** We need to run Corpus C through the same `bench-wallclock.mjs` workload + a parallel WASM-size measurement, then compare three-way (A/B/C) before committing further to either path.

**Performance risk envelope.** Each new hunk adds 5–15 JS instructions to a hot path the dispatcher takes per method call. A library-level decision to add 3 more hunks (sub-class 2a fallback + sub-class 2b precedence + null-coercion) might add up to 30–50 instructions per `$getSignature` call. For a CAD operation that calls `gp_Pnt::X()` 100K times per frame, this is potentially measurable. **The PoC's 0.56% noise figure is from the pre-hunk-explosion state and does not represent the projected post-fix state.**

**Action.** Before any of R9/R10/R10b/R18 lands as a libembind hunk, run a controlled bench against Corpus C with the val-dispatch alternative. If Corpus C performs comparably (or better) and produces a smaller patch, the val-dispatch path is strictly dominant on every dimension that matters.

### S.5 Upstream alignment audit — what would Emscripten accept?

Per-hunk assessment of upstream merge probability:

| Hunk                                        | What it does                                                        | Upstream merge probability                                                                            | Why                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hunk 1 (arity-pad ctor)                     | Pads omitted args to `undefined` before signature lookup, ctor path | **Medium-high** — extends behavior, no contract change. Aligns with Emscripten PR #22591's direction. | New behavior, but additive; doesn't break existing callers                            |
| Hunk 2 (arity-pad method)                   | Same for method dispatch                                            | **Medium-high** — same reasoning                                                                      | Symmetric to Hunk 1                                                                   |
| Hunk 3 (optional-wildcard `$getSignature`)  | Treats `EmValOptionalType` slots as wildcards                       | **Medium** — depends on whether upstream wants `optional<T>` to wildcard-match                        | Reasonable extension but changes semantic of getSignature for an existing type        |
| Hunk 4 (null→nullopt `toWireType`)          | Maps both `null` and `undefined` to nullopt                         | **Low** — changes a documented contract                                                               | Existing JS code that depends on null≠absence breaks silently                         |
| Hunk 5 (cross-arity type-aware fallback)    | When exact arity has wrong type, try higher arities                 | **Medium-low** — substantial behavior change                                                          | Inverts dispatcher's "first match wins" assumption                                    |
| Hunk 6 (concrete-beats-wildcard precedence) | Wildcard-only exact arity loses to concrete higher arity            | **Very low** — precedence inversion                                                                   | Touches the core dispatch contract; existing apps depending on first-match-wins break |
| **Path B (primitive-priority)**             | Adds `std::string`/`std::wstring`/numeric typeId-resolved matching  | **Medium** — workaround for emcc minifier elimination                                                 | Might be moot once the underlying `cppTypeToJsType` issue is fixed properly           |

Strategic implication: **the more hunks we accumulate, the further OCJS forks from upstream embind**. Each hunk is a maintenance liability — every new emscripten release means re-validating that we're not regressing the dispatcher in subtle ways. The val-dispatch alternative does not require Hunks 4, 5, or 6, and the bindgen guards (R4, R6, T1) become unnecessary. We end up needing just the arity-pad hunks (1 and 2) and possibly the optional-wildcard hunk (3) for any genuine `std::optional<T>` returns (T3 surface), nothing more.

### S.6 Are all problems mechanically tractable?

Honest per-problem assessment under the current `std::optional<T>` trajectory:

| Problem                                                       | Mechanical fix exists?                                                                        | Cost                                                      | Risk                                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NULL-COERCION                                                 | Yes — Hunk 4                                                                                  | Low (one libembind hunk)                                  | **Forks from upstream**; CTJ-2 style minifier elimination could break it again                                                                                                                  |
| DISPATCH-CROSS-ARITY 2a                                       | Yes — Hunk 5 (already in-tree)                                                                | Low–Medium                                                | Acceptable; type-aware fallback is a defensible refinement                                                                                                                                      |
| DISPATCH-CROSS-ARITY 2b                                       | Yes — Hunk 6 OR bindgen-side val-discrimination merge                                         | **Medium–High** if Hunk 6 (precedence inversion is risky) | If we choose bindgen-side merge, we're already doing val-dispatch for ambiguous shapes — that's the val-dispatch alternative for trailing defaults too                                          |
| MULTI-OVERLOAD-BINDGEN-GAP (TR-MO)                            | Yes — delete `numOverloads == 1` gate + ensure dispatcher handles same-name optional siblings | Medium                                                    | New same-arity-optional collisions may surface and need T1 guards to fire                                                                                                                       |
| CSTRING-BINDGEN-GAP (TR-CW)                                   | Yes — delete `hasCStringArgs` gate + emit `value_or("").c_str()` composition                  | Low                                                       | None obvious                                                                                                                                                                                    |
| OBSOLETE-TEST-PIN                                             | Yes — rewrite test or delete                                                                  | Low                                                       | Per-pin negotiation in PR review                                                                                                                                                                |
| Patch-application hygiene (Finding 6)                         | Yes — reset-then-apply in `step_patch_embind`                                                 | Low                                                       | None                                                                                                                                                                                            |
| **Unknown next OCCT shape that surfaces during a YAML audit** | **Unknown** — every new shape may produce a new hunk                                          | **Unbounded**                                             | **This is the strategic risk.** We have no upper bound on the number of new hunks needed because we have no empirical lower bound on the OCCT shapes that don't compose with `std::optional<T>` |

The eighth row is the strategic concern: **the migration is bounded on the known failures but unbounded on the unknown ones**. Every new shape we discover (and the per-class catalog audit in Recommendation 4 + 5 of the blueprint will surface more) potentially produces a new hunk. The val-dispatch alternative is **bounded** — it handles every shape inside the lambda body with `isUndefined()` / `isNull()` / `instanceof T` checks, none of which require dispatcher modifications.

### S.7 What does the gut-feel say?

Speaking plainly:

1. **The PoC oversold its coverage.** "96/96 expectations met" was true for the synthetic corpora exercised, but the corpora did not include any of the OCCT shapes that have broken production (degenerate-sibling ctors, multi-overload trailing defaults, cstring+optional composition, null-coercion semantics). Trusting the PoC's discharge of risks led us into a position where every production OCCT class is surfacing a new hunk.
2. **The patch is growing exponentially, not converging.** Started at 429 lines; PoC claimed 483 (+54); reality is heading to 620+ with 18+ hunks, and we have no empirical reason to believe that's the end.
3. **We are forking from upstream embind, not extending it.** Hunks 4, 5, 6 are not upstream-acceptable. We're building a custom-fork dispatcher that will be a maintenance liability for every emscripten release.
4. **The semantic primitive is wrong.** `std::optional<T>` is `Maybe<T>`. C++ trailing default args are not `Maybe<T>` — they're "default-on-absence." The mismatch shows up at every boundary.
5. **The existing OCJS idiom dominates.** 27,787 val-dispatch usages across 5,324 files. The proposed val-dispatch-for-trailing-defaults isn't a new pattern — it's an extension of an established one. We're not asking the codebase to learn anything new; we'd actually be **unifying two patterns into one**.
6. **The "trial-and-error" feedback from the user is the leading signal.** The user explicitly called out "we should have frontloaded as much as possible." The reason we couldn't frontload more was that **the underlying primitive choice is generating new failures faster than we can anticipate them**. The right response isn't more experiments under the same primitive; it's questioning the primitive choice.

**Verdict: we should adjust course.** Not necessarily abandon the migration — its bundle-size and patch-shrinkage motivations remain valid — but **swap the implementation primitive from `std::optional<T>` to `emscripten::val` + explicit discrimination** before sinking more engineering into the optional path. This preserves every claimed benefit (single binding per method, no fan-out, smaller libembind patch) while eliminating the entire class of dispatcher hunks we've been accumulating.

### S.8 Strategic recommendation

Replace the current migration plan's Step 3+ (bindgen emits `std::optional<T>`) with the val-dispatch plan, and pause adding more libembind hunks:

| Step   | Action                                                                                                                                                                                                                                                                                                                                                           | Rationale                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **S1** | **Stop** adding new libembind hunks for Hunks 4 / 5 / 6 / Path B until Corpus C (val-dispatch) has been built and benched against Corpus B.                                                                                                                                                                                                                      | Avoid sunk-cost commitment to a primitive we may abandon             |
| **S2** | Add **Corpus C** to `experiments/poc-occt-integration/` — same OCCT shapes as Corpus B (single-ctor + multi-ctor + cstring + degenerate-sibling) but emitted with `emscripten::val` + explicit `isUndefined()` / `isNull()` / `instanceof` checks inside the lambda body.                                                                                        | Empirically establish whether val-dispatch is performance-comparable |
| **S3** | Run **three-way bench** (Corpus A fan-out / Corpus B optional / Corpus C val-dispatch): WASM size, JS-glue size, sphere meshing wall-clock, replicad realistic workload wall-clock, per-call dispatcher microbench.                                                                                                                                              | Get the empirical data the original PoC should have collected        |
| **S4** | Run Corpus C against **the same R1–R6 / T1–T5 / U1–U8 risk catalog** as Corpus B. Quantify which risks dissolve, which remain.                                                                                                                                                                                                                                   | Compare risk surface area                                            |
| **S5** | If Corpus C is performance-comparable AND has smaller risk surface AND requires fewer libembind hunks, **switch the migration's primitive choice** to val-dispatch. Update the blueprint, the bindgen emitter, and this document. The libembind v2 patch becomes much smaller (Hunks 1 + 2 only, possibly 3 for T3 returns).                                     | Convergent path on every measured dimension                          |
| **S6** | If Corpus C is substantively worse on performance or some other dimension we have not yet identified, **document the trade-off explicitly** and proceed with the optional path, **but limit it to the shapes that genuinely benefit** (single overload, single trailing default, no degenerate-sibling collision). Use val-dispatch for the ambiguous remainder. | Hybrid strategy that gets the best of both                           |

This is **not** asking to throw away the PoC's existing work. Corpus B's findings about smart_ptr composition (Gate 3 + R3 + U4), non-default-constructible T (T4), `-sEVAL_CTORS=2` neutrality (T5), and per-call lifetime balance (U3) all remain valuable evidence for the cases where `std::optional<T>` continues to be the right choice (genuine `Maybe<T>` returns per T3; functions whose semantic IS "user may or may not provide a value"). It IS asking to **stop treating `std::optional<T>` as the universal answer for trailing C++ default arguments** when the empirical evidence is that the universal answer is producing per-shape hunks at an unsustainable rate.

### S.9 What this means for the rest of this document

Findings 1–6 and Recommendations R8'–R18 below remain accurate **as the work needed to make the optional-path complete**. They are correctly scoped against the current trajectory. The strategic question is whether we should be on that trajectory at all.

If the strategic recommendation is accepted, most of Findings 1, 2 (sub-class 2b), 3, 4 and Recommendations R9, R10b, R15, R18 become **unnecessary** — they exist only because the optional primitive forced them into existence. The val-dispatch alternative handles every one of those shapes natively without per-shape engineering.

**Read the rest of this document as the "complete-the-optional-path" plan; treat §Strategic Assessment as the meta-recommendation to potentially redirect first.**

## Table of Contents

- [Strategic Assessment: Are We On The Right Track?](#strategic-assessment-are-we-on-the-right-track)
- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: NULL-COERCION — R3 only validated the handle path](#finding-1-null-coercion--r3-only-validated-the-handle-path)
  - [Finding 2: DISPATCH-CROSS-ARITY — overlapping arities with semantic conflict](#finding-2-dispatch-cross-arity--overlapping-arities-with-semantic-conflict)
  - [Finding 3: MULTI-OVERLOAD-BINDGEN-GAP — TR-MO not exercised by U1](#finding-3-multi-overload-bindgen-gap--tr-mo-not-exercised-by-u1)
  - [Finding 4: CSTRING-BINDGEN-GAP — TR-CW not exercised by R5](#finding-4-cstring-bindgen-gap--tr-cw-not-exercised-by-r5)
  - [Finding 5: OBSOLETE-TEST-PIN — TR-RBV pin asserts fan-out emission shape](#finding-5-obsolete-test-pin--tr-rbv-pin-asserts-fan-out-emission-shape)
  - [Finding 6: Patch-application fragility — v2 path absolute vs relative](#finding-6-patch-application-fragility--v2-path-absolute-vs-relative)
- [Recommendations](#recommendations)
- [Front-Loadable PoC Experiment Designs](#front-loadable-poc-experiment-designs)
- [Architecturally Correct Canonical Approach](#architecturally-correct-canonical-approach)
- [Risks and Open Questions](#risks-and-open-questions)
- [Appendix A: Failure-to-Finding Cross-Reference](#appendix-a-failure-to-finding-cross-reference)
- [Appendix B: Per-Failure Binding Evidence](#appendix-b-per-failure-binding-evidence)

## Problem Statement

The optional-overload migration was scoped against the PoC's claim of 96/96 expectations met. Execution then surfaced eleven smoke failures, four of which are pre-existing baseline failures and seven of which are migration-attributable. The blueprint's acceptance gate (`docs/research/ocjs-optional-overload-resolution-blueprint.md` §Acceptance Criteria: "All 85 smoke files green") is not met.

The PoC's reproducible-test design is excellent — every claim has a verifiable artefact under `experiments/poc-occt-integration/results.*.json`. The gap is **coverage**: five architectural shapes that exist in production OCCT bindings were never exercised by a PoC corpus. Without those experiments, the trial-and-error happened during migration instead of during PoC, producing the user feedback: "we should have frontloaded as much as possible."

This document inventories the missing experiments, classifies each failure against the closest PoC risk that should have caught it, and proposes additions to the PoC corpus before the migration is re-attempted on the next cycle.

## Methodology

1. Ran `pnpm test` against the partially-migrated build (libembind v2 applied; bindgen migrated for constructors + single-overload methods).
2. Captured failure counts and error messages: 11 failures across 8 test files.
3. Stashed working copy and re-ran the four most-suspicious files against `main`'s build to determine which failures are pre-existing — confirmed `smoke-brep-gprop-face` (2) and `smoke-cstring-dispatch` (2) fail on `main` with byte-identical errors.
4. For each migration-attributable failure, inspected the generated C++ binding at `build/bindings/**/*.cpp` to determine whether the failure is (a) bindgen never emitted optional-wrapped binding, (b) bindgen emitted it but dispatcher rejected the call, (c) bindgen emitted it but `toWireType` rejected the JS value at the embind boundary, or (d) test pin asserts an obsolete shape.
5. Cross-referenced each failure against `experiments/poc-occt-integration/README.md` to identify which R/T/U experiment was closest and what it actually tested.
6. Read the catalog's Recommendation R7' ("Retire C2 in bindgen — delete the four gate predicates") to confirm the bindgen gates that survived the migration must be removed.

## Findings

### Finding 1: NULL-COERCION — R3 only validated the handle path

**Symptom.** Four smoke tests fail with `BindingError: null is not a valid <T>` or `WebAssembly.Exception{}` when JS passes explicit `null` as a trailing-default arg:

| Smoke test                                | Call shape                                                                | Failure                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `smoke-optional-handle-defaults.test.ts`  | `fuse.Build(null)` (BRepAlgoAPI_Fuse)                                     | `null is not a valid Message_ProgressRange`                              |
| `smoke-optional-handle-defaults.test.ts`  | `chamfer.Build(null)` (BRepFilletAPI_MakeChamfer)                         | `null is not a valid Message_ProgressRange`                              |
| `smoke-optional-value-defaults.test.ts`   | `new BRepMesh_IncrementalMesh(shape, 0.1, null, null, null)`              | `WebAssembly.Exception` from `register_optional<bool>::toWireType(null)` |
| `smoke-cstring-trailing-defaults.test.ts` | `IFSelect_Act.SetGroup('grp', null)` (when reached after CSTRING-GAP fix) | `Cannot pass non-string to std::string`                                  |

**Root cause.** OCCT's `Message_ProgressRange` is a non-handle **value type** registered via `class_<>("Message_ProgressRange")`. The bindgen emits `std::optional<Message_ProgressRange>`. Embind's `EmValOptionalType<T>::toWireType` only maps `undefined` → `std::nullopt`; `null` is forwarded to the underlying `T` conversion, which then throws `null is not a valid <T>`.

Cross-reference to the PoC: R3 tested `std::optional<opencascade::handle<IM_Handled>>` — i.e. **handle-typed optionals**, where `null` is a valid handle (`opencascade::handle<T>()` is a null handle). The R3 result matrix showed `(c) explicit null → 0 ✓` — but the underlying mechanism is handle-specific (`genericPointerToWireType` accepts `null` as a null pointer), not optional-specific. R5 shape 2 (`r5_handle_default`) similarly only exercised the handle path.

No PoC experiment tested:

- `std::optional<MessageType>` where `MessageType` is a value class with `class_<>(...)` registration (no smart_ptr).
- `std::optional<std::string>` where `std::string` is a primitive embind type.
- `std::optional<bool>` / `std::optional<double>` for primitive defaults with `null` (only `undefined` was tested).

**Architecturally correct fix.** The contract OCJS surfaces is "`null` and `undefined` both mean nullopt at the JS boundary for any `std::optional<T>`". This is **not** what upstream embind ships. The fix is a **fourth libembind hunk** in `EmValOptionalType<T>::toWireType` that special-cases `null`:

```cpp
static WireType toWireType(val v, rvp::default_tag) {
  if (v.isUndefined() || v.isNull()) {
    // OCJS bounded extension: treat null and undefined as nullopt uniformly
    // across value-typed and handle-typed std::optional<T>, matching the
    // JS surface contract.
    return std::optional<T>{};
  }
  return std::optional<T>(v.as<T>());
}
```

**PoC experiment to add (R9, see below)**: bind one `std::optional<T>` per representative T category (primitive `bool`, primitive `double`, primitive `std::string`, value class `gp_Pnt`, value class with non-trivial dtor `LifecycleTrack`, handle `opencascade::handle<IM_Handled>`), and exercise all four call shapes (omitted, value, `null`, `undefined`) per category. Failing today; will pass after the toWireType hunk lands.

### Finding 2: DISPATCH-CROSS-ARITY — overlapping arities with semantic conflict

**Symptoms (three failing tests, two sub-classes).**

| Test                               | Call                                                         | Failure                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke-defaults.test.ts`           | `new BRepMesh_IncrementalMesh(shape, 0.1, true)` (3-arg)     | `BindingError: Cannot pass "0.1" as a IMeshTools_Parameters` — sub-class 2a: WRONG-TYPED EXACT-ARITY MATCH                                              |
| `smoke-brep-gprop-face.test.ts` ×2 | `new oc.BRepGProp_Face(face)` then `.Bounds()` / `.Normal()` | `Bounds` returns all zeros; `Normal` throws `null function or function signature mismatch` — sub-class 2b: SHADOWING OPTIONAL-WILDCARD AT SMALLER ARITY |

**Sub-class 2a: wrong-typed exact-arity match (`BRepMesh_IncrementalMesh`).** Ctors registered at arities `{0, 3, 5}`:

```cpp
.constructor<>()
.constructor(optional_override([](const TopoDS_Shape&, const IMeshTools_Parameters&, std::optional<Message_ProgressRange>) { … }))
.constructor(optional_override([](const TopoDS_Shape&, const double, std::optional<bool>, std::optional<double>, std::optional<bool>) { … }))
```

The user's call `(shape, 0.1, true)` is exact-arity 3. Without type-aware fallback, the dispatcher tries the arity-3 ctor `(Shape, IMeshTools_Parameters, Range)` and `0.1` fails to convert. The intended dispatch is to the arity-5 ctor `(Shape, double, …)` with the trailing two args arity-padded.

**Sub-class 2b: shadowing optional-wildcard at smaller arity (`BRepGProp_Face`).** This is the smoking-gun migration regression. C++ source:

```cpp
BRepGProp_Face(const bool IsUseSpan = false);                                   // arity 0 OR 1 with bool
BRepGProp_Face(const TopoDS_Face& F, const bool IsUseSpan = false);             // arity 1 OR 2 with face
```

Migration emission:

```cpp
.constructor(optional_override([](std::optional<bool> IsUseSpan) {
  return new BRepGProp_Face(IsUseSpan.value_or((false)));
}), allow_raw_pointers())
.constructor(optional_override([](const TopoDS_Face & F, std::optional<bool> IsUseSpan) {
  return new BRepGProp_Face(F, IsUseSpan.value_or((false)));
}), allow_raw_pointers())
```

Two arities: 1 and 2. Test call `new oc.BRepGProp_Face(face)` (1-arg, `face instanceof TopoDS_Face`):

1. Dispatcher enters exact-arity branch for arity 1.
2. `signaturesArray` for arity 1 has **one entry**: `[typeId(EmValOptionalType<bool>)]` where `registeredTypes[typeId].optional === true`.
3. `$getSignature` short-circuits on the optional-wildcard branch (`if (fieldType.optional === true) return true`) before any concrete-type check runs.
4. Routes to the arity-1 ctor, passes `face` to `register_optional<bool>::toWireType`.
5. `EmValOptionalType<bool>::toWireType(face)` is `v.isUndefined() ? nullopt : v.as<bool>()`; `face` is not undefined, so `val::as<bool>()` truthy-coerces the object → `true`.
6. Constructor runs as `BRepGProp_Face(IsUseSpan=true)` — **with no face loaded**.
7. Test proceeds to `gpropFace.Bounds(0,0,0,0)` → operates on an unloaded face → returns zeros for U1/U2/V1/V2 (no surface to bound).
8. Test proceeds to `gpropFace.Normal(u, v, P, VNor)` → OCCT's `BRepGProp_Face::Normal` dereferences `mySurface` (null because no face loaded) → vtable indirect call through null → WASM-level `null function or function signature mismatch`.

**Pre-migration behaviour (proof this was passing on `main`).** Fan-out emission would have produced FOUR arity-1 ctor registrations:

```cpp
.constructor<>()                            // arity 0
.constructor<const bool>()                  // arity 1 (bool overload)
.constructor<const TopoDS_Face &>()         // arity 1 (truncation of (Face, bool=false))
.constructor<const TopoDS_Face &, const bool>()  // arity 2
```

For `(face)`, the arity-1 `signaturesArray` had TWO entries: `['boolean']` and `[typeId(TopoDS_Face)]`. `$getSignature` checked them in registration order: `'boolean'` fails (`typeof face !== 'boolean'`); `instanceof TopoDS_Face` matches. Dispatch routed to the truncation ctor, which correctly called `BRepGProp_Face(F)` with the face loaded.

**Migration collapsed the two arity-1 entries into ONE wildcard-only entry.** Every class with the source pattern `(T1, T2 = default)` + `(T2 = default)` — i.e. an overload pair where the smaller ctor is a degenerate sibling of the larger — now silently breaks for the JS surface `new C(t1Instance)`. This pattern is common in OCCT (any "set up empty, load later" + "set up with input" ctor pair).

Cross-reference to the PoC: Gate 2 validated production-density `{0, 1, 2, 2*, 3, 4}` for `BRepPrimAPI_MakeSphere` — but those arities have a consistent JS-type prefix (all start with `gp_Pnt` or `Standard_Real`). Gates 1–3 + R1 used `BRepMesh_IncrementalMesh` for the arity-pad ctor smoke (`run.test.mjs` row 6 — `IM(sphere, 0.5)` → 306 triangles) but only at full-arity (5) or omitted-default. **The two cases that broke production** — overlapping arities with semantic conflict (sub-class 2a) and an overload pair where the smaller's optional shadows the larger's first-arg dispatch (sub-class 2b) — were never exercised.

**Architecturally correct fix.** Sub-class 2a is purely dispatcher-side. Sub-class 2b requires both dispatcher and a deeper architectural decision because the failure happens at exact-arity match, before any cross-arity fallback would fire.

**Sub-class 2a fix (dispatcher).** When the call arity has an exact-match `constructor_body[N].func` but its `signaturesArray` entry does not match `args` by **concrete** JS type, fall through to the cross-arity pad loop instead of throwing. This is implemented in the in-tree edit of `libembind.js` (the two-stage type-aware dispatch with `_exactSigOk` boolean) but not yet folded back into `src/patches/libembind-overloading.patch`. **Action**: regenerate `libembind-overloading.v2.patch` from the current in-tree libembind to capture this hunk (see R8').

**Sub-class 2b fix (dispatcher precedence).** The current optional-wildcard branch returns `true` unconditionally for any optional-typed slot, before checking whether a higher arity has a concrete-typed match for the same argument prefix. The architectural fix is to make the dispatcher **weight concrete-type matches higher than wildcard matches at higher arities** when both are admissible:

```js
// New two-stage exact-arity logic in $ensureOverloadTable & ctor dispatch
function tryExactArity(args) {
  var sigArr = overloadTable[args.length].signaturesArray;
  // Stage 1: prefer a concrete-typed match (every slot is either concrete-matched OR optional-wildcard).
  for (var key of sigArr) {
    var hasConcrete = false;
    var allMatch = key.every((field, i) => {
      var ft = registeredTypes[field];
      if (ft && ft.optional === true) return true; // wildcard
      hasConcrete = true;
      return matchConcrete(field, args[i]); // existing concrete check
    });
    if (allMatch && hasConcrete) return key;
  }
  // Stage 2: if no exact arity had a concrete-typed key, check higher arities for concrete prefix matches.
  for (var n = args.length + 1; n <= maxArity; n++) {
    var sigArrN = overloadTable[n]?.signaturesArray ?? [];
    for (var key of sigArrN) {
      var prefixMatches = args.every((arg, i) => matchConcrete(key[i], arg));
      var trailingAllOptional = key.slice(args.length).every((f) => registeredTypes[f]?.optional === true);
      if (prefixMatches && trailingAllOptional) {
        return { padTo: n, key }; // commit to higher arity
      }
    }
  }
  // Stage 3: existing wildcard-only exact match (last-resort).
  return sigArr[0];
}
```

The key insight: an arity-1 ctor whose only signature is `[optional<bool>]` should **lose** to an arity-2 ctor whose signature is `[TopoDS_Face, optional<bool>]` when the call is `(face)`, because the higher arity matches by concrete type while the lower arity matches only by wildcard. The optional-wildcard was designed for trailing-default omission (genuine "no value provided"), not for arg-type discrimination.

**Sub-class 2b fix (bindgen alternative).** An equally valid architectural option: when bindgen detects the source pattern `C(T1, T2 = default)` + `C(T2 = default)` (i.e. the smaller ctor is a prefix-truncated sibling of the larger), **refuse to emit them as two separate optional-wrapped ctors**. Instead emit a single val-discriminated dispatcher at the larger arity:

```cpp
.constructor(optional_override([](emscripten::val arg0, std::optional<bool> IsUseSpan) {
  if (arg0.isUndefined()) {
    return new BRepGProp_Face(IsUseSpan.value_or(false));                  // smaller ctor
  } else if (arg0.instanceof(emscripten::val::module_property("TopoDS_Face"))) {
    return new BRepGProp_Face(arg0.as<const TopoDS_Face&>(emscripten::allow_raw_pointers()), IsUseSpan.value_or(false));  // larger ctor
  } else if (arg0.typeOf().as<std::string>() == "boolean") {
    return new BRepGProp_Face(arg0.as<bool>());                            // smaller ctor with explicit bool
  }
  throw std::runtime_error("...");
}))
```

This is the same val-discrimination pattern OCJS already uses for the int-vs-double-vs-string cases (R4 / CTJ-1). It's more verbose at the bindgen level but eliminates the dispatcher ambiguity entirely — every emission produces exactly one ctor entry, no wildcard shadowing possible. The trade-off: more C++ code per binding, but stable observable JS behaviour without depending on dispatcher precedence rules.

**Recommended path**: ship both. Dispatcher-side fix solves the general case; bindgen-side fix removes the pattern from the source at emission time. The R10 + R10b experiments below validate each independently.

**PoC experiment to add (R10 + R10b)**: see [Front-Loadable PoC Experiment Designs](#front-loadable-poc-experiment-designs).

### Finding 3: MULTI-OVERLOAD-BINDGEN-GAP — TR-MO not exercised by U1

**Symptom.** `smoke-multioverload-trailing-defaults.test.ts` fails: `filling.Add(edge, GeomAbs_C0)` throws `BindingError: Expected null or instance of TopoDS_Face, got an instance of TopoDS_Shape`.

**Root cause.** `BRepOffsetAPI_MakeFilling.Add` has four overloads:

| Arity | Signature                                                                                |
| ----- | ---------------------------------------------------------------------------------------- |
| 1     | `Add(const gp_Pnt&)`                                                                     |
| 2     | `Add(const TopoDS_Face&, const GeomAbs_Shape)`                                           |
| 3     | `Add(const TopoDS_Edge&, const GeomAbs_Shape, const bool IsBound = true)` ← TR-MO target |
| 4     | val-dispatched `(double, double, Face, GeomAbs)` (CTJ-1 path)                            |

The bindgen `numOverloads == 1` gate (`bindings.py:1884`) excludes multi-overload methods from optional-wrapping. The arity-3 overload is therefore emitted as a plain `.function("Add", select_overload<int(const TopoDS_Edge&, const GeomAbs_Shape, const bool)>(...)` — without `std::optional<bool>`. The 2-arg call `(edge, GeomAbs_C0)` arity-pads to 3 with `undefined`, but the arity-3 ctor expects a `bool` at position 3, not `undefined → nullopt → true`. The dispatcher then falls back to the arity-2 overload `(Face, GeomAbs)`, where `edge instanceof TopoDS_Shape` matches `TopoDS_Face` (both inherit from `TopoDS_Shape`), and the call enters the wrong overload.

Cross-reference to the PoC: U1 (`bindings-optional.cpp::MixedClass`) binds `method_fanout` (4 same-name arity registrations) **alongside** `method_optional` (1 lambda with `std::optional`). But both are on the **same class** with **different method names** — they never collide on the same name. The actual TR-MO scenario — multiple overloads of the **same name** where one has trailing defaults — was not exercised. The U1 result `9/9 pass` proved that "fan-out and optional patterns coexist in one class without dispatcher confusion" but did **not** prove "trailing-default optional emission inside a multi-overload group works".

**Architecturally correct fix.** Per the blueprint Step 4 + catalog Recommendation R7':

1. Delete the `numOverloads == 1` constraint at `bindings.py:1884`. Multi-overload methods should emit `std::optional<T>` for each overload that has trailing defaults; the libembind dispatcher already handles same-name overloads via `signaturesArray`.
2. Ensure the R4/T1 guards still fire if the new emission produces collision shapes (val vs optional same-arity sibling, or all-optional same-arity sibling group).

**PoC experiment to add (R11)**: build a synthetic class with three `.function("X", …)` overloads of the SAME name — arity 1 (no defaults), arity 2 (no defaults, different prefix type), arity 3 (one trailing default `bool=true`). Emit all three as optional-wrapped where applicable. Exercise every call shape including the 2-arg call against the arity-3 overload (must hit the trailing-default path) and the 2-arg call against the arity-2 overload (must hit the non-trailing-default path). Assert dispatch correctness via a probe int returned per overload.

### Finding 4: CSTRING-BINDGEN-GAP — TR-CW not exercised by R5

**Symptom.** `smoke-cstring-trailing-defaults.test.ts` fails: `IFSelect_Act.SetGroup('mygroup')` throws `BindingError: Cannot pass non-string to std::string`.

**Root cause.** OCCT's `IFSelect_Act::SetGroup(const Standard_CString group, const Standard_CString file = "")` has a trailing `const char*` default. Today the bindgen emits a cstring-wrapper without optional:

```cpp
.class_function("SetGroup",
  ((void (*)(std::string, std::string))[](std::string group, std::string file) -> void {
    IFSelect_Act::SetGroup(strdup(group.c_str()), strdup(file.c_str()));
  }), allow_raw_pointers())
```

The bindgen `not hasCStringArgs` gate (`bindings.py:1886`) excludes cstring-wrapper methods from optional-wrapping. Only the arity-2 binding exists; 1-arg calls fail because `args[1]` is `undefined`, `.as<std::string>()` throws.

Cross-reference to the PoC: R5 tested four real-OCCT trailing-default categories (`Precision::Confusion()`, `Handle()`, `TopLoc_Location()`, `const T& foo = T()`) — but every R5 binding used the **bindgen-emitted** `std::optional<T>` directly. None used the cstring-wrapper composition (`std::string` → `.c_str()` → `Standard_CString`). The cstring path requires `value_or("").c_str()` to nest the optional inside the cstring conversion, which is a translation pattern R5 never validated.

**Architecturally correct fix.** Per Recommendation R7':

1. Delete the `not hasCStringArgs` constraint at `bindings.py:1886`.
2. Update the cstring-wrapper lambda emitter to compose `std::optional<std::string>` with `.c_str()`:

```cpp
.class_function("SetGroup",
  optional_override([](std::string group, std::optional<std::string> file) -> void {
    IFSelect_Act::SetGroup(strdup(group.c_str()), strdup(file.value_or("").c_str()));
  }), allow_raw_pointers())
```

3. Same for `returnIsCString` — the return path doesn't need any optional treatment but the gate must be deleted in symmetry.

**PoC experiment to add (R12)**: bind `f(std::string, std::optional<std::string>)` with `value_or("").c_str()` composition. Exercise (a) 1-arg call with the default kicking in, (b) 2-arg call with explicit string, (c) 2-arg call with `undefined`, (d) 2-arg call with `null` (combines with NULL-COERCION findings). Probe via a copy of the resulting cstring back to JS.

### Finding 5: OBSOLETE-TEST-PIN — TR-RBV pin asserts fan-out emission shape

**Symptom.** `smoke-rbv-trailing-defaults.test.ts` fails: `expected 1 to be greater than or equal to 3` — the test asserts that the compiled `BRepGraph_Transform.cpp` contains `>= 3` `.class_function("Perform"` entries (the pre-fix fan-out shape), but the new emission contains exactly **one** entry (the post-fix optional-wrapped lambda).

**Root cause.** The test was written as a deterministic regression pin against the **OLD** fan-out fix shape (per its own docstring: "after the TR-RBV fix lands the bindgen will emit THREE entries (arity 4 plus the two trailing-default truncations)"). The actual fix shape is one optional-wrapped lambda — a different emission shape that achieves the same observable behavior (C++ default values are preserved via `.value_or(D)` instead of via truncation).

Cross-reference to the PoC and catalog: the catalog's Recommendation R0 explicitly states:

> Under Option C, the TR-CW/TR-MO/TR-RBV/TR-GATE pins will be retired alongside the gate predicates they assert against.

The migration plan inherits this guidance. The test was authored before the Option C decision and asserts the wrong shape post-Option-C.

**Architecturally correct fix.** Two equally-defensible options:

| Option                      | What it does                                                                                                                                                                                                                                          | Strength                                                                                                                    | Weakness                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **A. Delete the test**      | Remove the file entirely                                                                                                                                                                                                                              | Matches catalog R0 literally — the gate it pinned no longer exists                                                          | Loses the **counterfactual** half of the test (the 4-arg happy-path call), which is still useful as a forward regression pin |
| **B. Update the assertion** | Keep the counterfactual; replace the codegen-count assertion with a stronger assertion: `.class_function("Perform"` contains exactly 1 entry **and** that entry's body contains `.value_or(true)` and `.value_or(false)` (the C++ defaults preserved) | Stronger guarantee than the original (asserts the fix shape AND that defaults are preserved); retains useful counterfactual | One file edit; requires PR review to justify the assertion change                                                            |

Recommended: **Option B** with a docstring update explaining the migration-time rewrite. This is **not** weakening the test (the new assertion is stronger), but the blueprint's strict reading ("no smoke test may be modified") arguably forbids it. Resolve in PR review by treating the original assertion as a now-incorrect implementation detail and the new assertion as the canonical migration-aware pin.

**PoC experiment to add (R13)**: no new experiment needed — this finding is documentation-only. But add a guideline to the PoC README that **test pins must assert observable behavior, not emission shape**, so the next architectural pivot doesn't invalidate the pins by changing how the same observable behavior is achieved.

### Finding 6 (extended): Patch-application fragility — v2 path absolute vs relative AND duplicate-key accumulation

**Symptom (B): duplicate `$getSignature` accumulation.** After multiple patch iterations during this migration session, `deps/emsdk/upstream/emscripten/src/lib/libembind.js` accumulated **five** copies of `$getSignature` at lines 58, 168, 238, 308, 388. Each prior application of `libembind-overloading.patch` (with intermediate revisions) inserted a fresh definition at line ~55 without removing the previous, because the patch hunks are `@@ -55,6 +55,N @@`-style additive insertions and the build pipeline's `step_patch_embind` records only a hash of the patch file, not of the resulting `libembind.js`. JS object-literal semantics keep only the LAST duplicate key — so the dispatcher's behaviour silently follows the most-recently-applied patch's definition, irrespective of any earlier "Path B" or experimental variants. This explains why intermediate Path B drafts (catalog Finding 3) appeared during debug cycles but cannot persist across clean rebuilds.

**Implications.**

1. **CTJ-1/CTJ-2 mitigation is unstable.** Path B has never lived in the canonical committed patch (`grep -A 80 '\$getSignature:' src/patches/libembind-overloading.patch` confirms no `std::string`/`std::wstring` priority branch). It only appeared in transient in-tree edits during rebuild cycles. The catalog's claim that CTJ-1/CTJ-2 is "passing via Path B" only holds when a manual hot-patch is layered after build — there is no script for this and no CI assertion that it persists. The 2 `smoke-cstring-dispatch.test.ts` failures (`TCollection_ExtendedString(42)` returning Length 1 instead of 2) are the consequence: char ctor `<const char>` is registered before the val ctor at arity 1; for arg `42` (typeof === 'number'), the char ctor's signaturesArray entry `'number'` matches first and routes to `'*'` (ASCII 42 = char) instead of the val ctor's int/double dispatch.
2. **The v2 patch must include Path B as a fourth hunk.** Per the canonical-approach §1, the v2 patch should be the union of (a) v1's existing hunks, (b) the optional-wildcard hunk, (c) the arity-pad hunks, and (d) **Path B added to `$getSignature`** so it lives in the source-of-truth patch file rather than as a manual post-link mutation. Without Path B in the canonical patch, the migration ships a dispatcher that loses CTJ-1/CTJ-2 mitigation silently.
3. **The build pipeline must reset to pristine before patching.** `build-wasm.sh:step_patch_embind` should copy the pristine `libembind.js` from a stored backup before each apply, not rely on hash-skipping. Otherwise iterative debug cycles accumulate duplicates that pass local tests (because the LAST patch wins) but silently regress when a fresh contributor rebuilds.

**Symptom (A) [unchanged]: v2 patch absolute vs relative paths.**

**Symptom.** During migration, the v2 patch (`experiments/poc-occt-integration/libembind-overloading.v2.patch`) was copied byte-for-byte into `src/patches/libembind-overloading.patch`. The build script (`build-wasm.sh:706`) runs `patch -p0` from `$EMSDK/upstream/emscripten/` — which expects relative paths like `src/lib/libembind.js`. The v2 patch as authored by the PoC carried **absolute paths** (`/Users/rifont/git/tau/repos/emscripten/src/lib/libembind.js`) inherited from the PoC's `diff -u` invocation. The patch silently applied to the wrong file (`repos/emscripten/`) on first attempt, leaving the build's actual emsdk `libembind.js` unpatched.

This was caught only by inspecting the **compiled** WASM-glue JS for the absence of arity-pad helpers and reverse-tracing to the patch target. The PoC's U8 test asserted clean-apply against pristine upstream but did **not** assert the apply works when invoked from the `$EMSDK/upstream/emscripten/` working directory with `patch -p0` (the actual build-script invocation).

**Architecturally correct fix.** The v2 patch must use repo-relative paths matching the build-script's working directory. Update the PoC's patch-generation step to produce `src/lib/libembind.js` headers, mirroring the v1 patch's format. Verify by running `cd $EMSDK/upstream/emscripten && patch -p0 < <patch>` from a CI step (not just `patch -p0 < <patch>` from the PoC directory).

**PoC experiment to add (U8.1)**: extend `u8.test.sh` to (a) `cp $EMSDK/upstream/emscripten/src/lib/libembind.js /tmp/pristine.js`, (b) `cd $EMSDK/upstream/emscripten && patch -p0 < libembind-overloading.v2.patch`, (c) verify `grep -c 'Gate-1 hunk' src/lib/libembind.js` returns 3 (one per hunk). This is the actual invocation the production build pipeline uses; the existing U8 check uses a different invocation.

Additionally, when the partial hot-edit work landed in `deps/emsdk/upstream/emscripten/src/lib/libembind.js` (the type-aware dispatch fix), it was applied **outside** the patch lifecycle, leaving the patch file out-of-sync with the runtime artefact. The build script's `step_patch_embind` records a hash of the patch file but not of the resulting libembind.js — so the next clean build will revert the hot-edit without warning. The fix is to **fold the hot-edit back into the patch file** and verify via `u8.test.sh` before the migration PR lands.

## Recommendations

| #       | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                | Priority | Effort | Impact                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R8'** | Fold the in-tree libembind hot-edit (type-aware two-stage dispatch in both ctor and method paths) back into `libembind-overloading.v2.patch`. Regenerate the patch from `pristine + production + arity-pad + type-aware-fallback` and run U8 against the production build script's invocation.                                                                                                                                                        | P0       | Low    | High — without this, the next clean build silently reverts the type-aware fallback and DISPATCH-CROSS-ARITY regressions                                |
| **R9**  | Add `r9-optional-toWireType-null.test.mjs` to the PoC. Bind one `std::optional<T>` per representative T category (primitive bool/double/string, value class `gp_Pnt`, value class with non-trivial dtor, handle). Exercise all four call shapes (omitted / value / null / undefined) per category. Add the `EmValOptionalType<T>::toWireType` hunk that accepts null as nullopt (one additional libembind hunk).                                      | P0       | Medium | High — closes the NULL-COERCION gap                                                                                                                    |
| **R10** | Add `r10-overlapping-arities.test.mjs` to the PoC. Build a synthetic class with three ctors at arities `{0, A, B}` where the first `A-1` JS-type positions disagree. Exercise every call arity in `[1, B]`. Validate the dispatcher's type-aware fallback.                                                                                                                                                                                            | P0       | Medium | High — closes the DISPATCH-CROSS-ARITY gap and pins the regression                                                                                     |
| **R11** | Add `r11-multioverload-trailing.test.mjs` to the PoC. Build a synthetic class with three same-name overloads — arity 1, arity 2 (different prefix type), arity 3 (one trailing default). Emit all three as optional-wrapped. Exercise every call shape. Pins TR-MO behaviour.                                                                                                                                                                         | P0       | Medium | High — proves the `numOverloads == 1` gate can be safely deleted                                                                                       |
| **R12** | Add `r12-cstring-trailing.test.mjs` to the PoC. Bind `f(std::string, std::optional<std::string>)` with `value_or("").c_str()`. Exercise omitted/value/null/undefined for the optional. Pins TR-CW behaviour.                                                                                                                                                                                                                                          | P0       | Low    | High — proves the `hasCStringArgs` gate can be safely deleted                                                                                          |
| **R13** | Update `experiments/poc-occt-integration/README.md` with a "Coverage matrix" section that explicitly enumerates which `std::optional<T>` shape categories (T type × call shape × overload context × wrapper context) are validated and which are not. Forces future PoC pivots to identify gaps systematically rather than ad-hoc.                                                                                                                    | P1       | Low    | Medium — process improvement                                                                                                                           |
| **R14** | Update `u8.test.sh` to run the build-script's actual invocation (`cd $EMSDK/upstream/emscripten && patch -p0 < <patch>`) in addition to the existing `diff -u` round-trip. Catches Finding 6 before it ships.                                                                                                                                                                                                                                         | P0       | Low    | High — closes the patch-application fragility gap                                                                                                      |
| **R15** | Delete the bindgen gates at `bindings.py:1884–1888` (numOverloads, hasCStringArgs, returnIsCString, returnTypeRequiresValueWrapper) once R11/R12 are green in the PoC. This is the actual Step 4 of the migration; the current emitter is INCOMPLETE and the migration cannot be claimed done.                                                                                                                                                        | P0       | Medium | High — required to declare the migration complete                                                                                                      |
| **R16** | Update `smoke-rbv-trailing-defaults.test.ts` (Finding 5) to assert observable-behavior rather than emission-shape. Either delete (Option A) or rewrite the assertion (Option B). Document the rationale in the PR.                                                                                                                                                                                                                                    | P1       | Low    | Medium                                                                                                                                                 |
| **R17** | Make `build-wasm.sh:step_patch_embind` reset `deps/emsdk/upstream/emscripten/src/lib/libembind.js` to a pristine snapshot BEFORE applying the patch, on every invocation. Currently it skips re-apply on hash-match, leaving duplicate `$getSignature` (and other duplicate keys) accumulated from earlier debug cycles. The reset eliminates Finding 6 (extended) and makes patch application idempotent at the file level, not just the hash level. | **P0**   | Low    | High — without this, the migration's v2 patch can silently differ between a clean CI build and a local rebuild that's been through multiple iterations |
| **R18** | Fold Path B (primitive `std::string`/`std::wstring`/numeric/bool matching at the typeId-resolved layer) into the v2 `libembind-overloading.patch`'s `$getSignature` definition. Path B has never lived in the canonical patch; this migration is the right vehicle to land it since the v2 patch already rewrites `$getSignature`. Closes the 2 `smoke-cstring-dispatch.test.ts` failures (CTJ-1/CTJ-2 mitigation made stable across clean rebuilds). | **P0**   | Low    | High — closes CTJ-1/CTJ-2 in the same patch landing, eliminates the hot-patch tribal-knowledge dependency described in catalog Finding 3               |

## Front-Loadable PoC Experiment Designs

The following six experiments would have prevented every migration-attributable failure if added to the PoC before bindgen migration started.

### R9 — `std::optional<T>::toWireType(null)` across T categories

**Goal.** Validate that `null` and `undefined` both collapse to `std::nullopt` for every T category OCCT uses with `std::optional`.

**Approach.** New file `experiments/poc-occt-integration/r9.test.mjs` exercising `bindings-optional.cpp` additions:

```cpp
// Primitive scalar
function("r9_opt_bool",   optional_override([](std::optional<bool>   v) { return v.has_value() ? (v.value() ? 1 : 0) : -1; }));
function("r9_opt_double", optional_override([](std::optional<double> v) { return v.has_value() ? v.value() : -1.0; }));
function("r9_opt_string", optional_override([](std::optional<std::string> v) -> std::string { return v.value_or(std::string("DEFAULT")); }));

// Value class (no smart_ptr)
function("r9_opt_value_class", optional_override([](std::optional<gp_Pnt> v) { return v.has_value() ? v.value().X() : -1.0; }));

// Handle (smart_ptr)
function("r9_opt_handle", optional_override([](std::optional<opencascade::handle<IM_Handled>> v) -> int { return v.has_value() ? 1 : 0; }));
```

For each binding, exercise four call shapes: `f()`, `f(value)`, `f(null)`, `f(undefined)`. Expected: `null` and `undefined` both collapse to nullopt; only `f(value)` reaches the value branch.

**Failure mode before fix.** `f(null)` for `r9_opt_bool` / `r9_opt_double` / `r9_opt_string` / `r9_opt_value_class` throws `null is not a valid <T>` from upstream embind. Only `r9_opt_handle` passes (R3 confirmed this).

**Failure mode after fix.** All pass; failure indicates either (a) `EmValOptionalType<T>::toWireType` hunk regression or (b) downstream contract violation.

### R10 — Overlapping arities with semantic conflict (sub-class 2a)

**Goal.** Validate that the dispatcher selects the correct ctor by JS-type signature when multiple ctors share intermediate arities.

**Approach.** New synthetic class in `bindings-optional.cpp`:

```cpp
struct OverlapCtor {
  int routed_by;
  OverlapCtor(const gp_Pnt&, const IM_Handled&, std::optional<gp_Pnt> = gp_Pnt())             : routed_by(3) {}
  OverlapCtor(const gp_Pnt&, double, std::optional<bool> = false, std::optional<double> = 0.5, std::optional<bool> = false) : routed_by(5) {}
};
class_<OverlapCtor>("OverlapCtor")
  .property("routedBy", &OverlapCtor::routed_by)
  .constructor(optional_override([](const gp_Pnt& p, const IM_Handled& h, std::optional<gp_Pnt> q) { return new OverlapCtor(p, h, q.value_or(gp_Pnt())); }))
  .constructor(optional_override([](const gp_Pnt& p, double d, std::optional<bool> b1, std::optional<double> d2, std::optional<bool> b2)
    { return new OverlapCtor(p, d, b1.value_or(false), d2.value_or(0.5), b2.value_or(false)); }));
```

Exercise every arity from 1 to 5 with deliberately-ambiguous JS arg types:

| Call                            | Expected `routedBy` | Why                                                                                                     |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `new OverlapCtor(p, h)`         | 3                   | exact-arity 2 unavailable, pad to 3 with undefined; signature `(Pnt, IM_Handled)` matches arity-3       |
| `new OverlapCtor(p, 0.1)`       | 5                   | exact-arity 2 unavailable, pad to 3 fails (Pnt, number vs Pnt, IM_Handled), pad to 5 succeeds           |
| `new OverlapCtor(p, 0.1, true)` | 5                   | exact-arity 3 has wrong signature (Pnt, IM_Handled, Pnt) vs call (Pnt, number, bool); fall through to 5 |

**Failure mode before fix.** The middle call routes to arity 3 (IMeshTools_Parameters-shaped) and throws on the JS-type mismatch.

**Failure mode after fix.** Three calls route to `routedBy=3`, `5`, `5` respectively.

### R10b — Shadowing optional-wildcard at smaller arity (sub-class 2b)

**Goal.** Validate that an arity-N ctor whose only sig is `[optional<T>]` does NOT shadow an arity-(N+1) ctor whose sig is `[ConcreteClass, optional<T>]` when the call is `(concreteClassInstance)`. This is the exact `BRepGProp_Face` regression pattern.

**Approach.** Synthetic class mirroring `BRepGProp_Face`'s signature pair:

```cpp
struct ShadowCtor {
  int routed_by;
  bool flag;
  TopoDS_Shape* shape_holder = nullptr;

  ShadowCtor(std::optional<bool> b)
    : routed_by(1), flag(b.value_or(false)) {}
  ShadowCtor(const TopoDS_Shape& s, std::optional<bool> b)
    : routed_by(2), flag(b.value_or(false)), shape_holder(new TopoDS_Shape(s)) {}
};
class_<ShadowCtor>("ShadowCtor")
  .property("routedBy", &ShadowCtor::routed_by)
  .property("flag", &ShadowCtor::flag)
  .property("hasShape", optional_override([](const ShadowCtor& self) { return self.shape_holder != nullptr; }))
  .constructor(optional_override([](std::optional<bool> b) { return new ShadowCtor(b); }))
  .constructor(optional_override([](const TopoDS_Shape& s, std::optional<bool> b) { return new ShadowCtor(s, b); }));
```

Exercise every JS-surface call shape:

| Call                          | Expected `routedBy`                                                        | Expected `flag`                                   | Expected `hasShape` |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------- |
| `new ShadowCtor()`            | 1 (arity-pad to 1, wildcard)                                               | `false` (nullopt)                                 | `false`             |
| `new ShadowCtor(true)`        | 1 (concrete bool match)                                                    | `true`                                            | `false`             |
| `new ShadowCtor(undefined)`   | 1 (undefined → nullopt)                                                    | `false`                                           | `false`             |
| `new ShadowCtor(shape)`       | **2** (concrete shape match at higher arity beats wildcard at exact arity) | `false` (arity-pad to 2 with undefined → nullopt) | **true**            |
| `new ShadowCtor(shape, true)` | 2 (exact arity-2 concrete match)                                           | `true`                                            | `true`              |

**Failure mode before fix (today).** The fourth row's `routedBy` is 1, `flag` is `true` (object truthy-coerced), `hasShape` is `false` — exact `BRepGProp_Face` regression. WASM-level crashes follow if downstream code dereferences the unset `shape_holder`.

**Failure mode after fix.** All five rows pass. The dispatcher precedence rule "concrete higher-arity beats wildcard exact-arity" makes `(shape)` correctly route to ctor-2.

**Bonus assertion.** Also exercise `new ShadowCtor(42)` — what should happen? Spec choice: throw `BindingError: invalid signature (number) - expects ... (boolean | TopoDS_Shape)`. Tests both that the wildcard fallback only fires when concrete fails AND that the fallback throws loudly rather than silently truthy-coercing.

### R11 — Multi-overload same-name with trailing default

**Goal.** Validate `numOverloads > 1` + trailing-default composition.

**Approach.** Synthetic class with three same-name overloads:

```cpp
struct MultiOver {
  int Add(const gp_Pnt&)                                     { return 1; }
  int Add(const TopoDS_Face&, const GeomAbs_Shape)           { return 2; }
  int Add(const TopoDS_Edge&, const GeomAbs_Shape, bool=true){ return 3; }
};
class_<MultiOver>("MultiOver")
  .constructor<>()
  .function("Add", select_overload<int(const gp_Pnt&), MultiOver>(&MultiOver::Add))
  .function("Add", select_overload<int(const TopoDS_Face&, const GeomAbs_Shape), MultiOver>(&MultiOver::Add))
  .function("Add", optional_override([](MultiOver& self, const TopoDS_Edge& e, const GeomAbs_Shape g, std::optional<bool> b) { return self.Add(e, g, b.value_or(true)); }));
```

Exercise all four call shapes — `(pnt)`, `(face, GeomAbs)`, `(edge, GeomAbs)` (must hit arity-3 trailing-default branch), `(edge, GeomAbs, false)` — and assert the returned int matches the expected overload.

**Failure mode before fix.** Bindgen `numOverloads == 1` gate prevents the third overload from being optional-wrapped. With the gate removed, the dispatcher must correctly route `(edge, GeomAbs)` to the trailing-default branch (3) rather than the arity-2 `(Face, GeomAbs)` branch (2), since edge `instanceof TopoDS_Shape` but not `TopoDS_Face`.

**Failure mode after fix.** All four call shapes pass with correct `routedBy` integers.

### R12 — C-string-wrapper with trailing default

**Goal.** Validate that `std::optional<std::string>` composes with `strdup(...)` / `.c_str()` cstring conversion.

**Approach.**

```cpp
// Simulate the IFSelect_Act::SetGroup pattern.
class_<CStrTrailing>("CStrTrailing")
  .class_function("SetGroup",
    optional_override([](std::string group, std::optional<std::string> file) -> std::string {
      // Mirror the bindgen-emitted cstring composition.
      const char* g = strdup(group.c_str());
      const char* f = strdup(file.value_or(std::string("")).c_str());
      std::string result = std::string(g) + "|" + std::string(f);
      return result;
    }));
```

Exercise: `SetGroup('a', 'b')` → `"a|b"`, `SetGroup('a')` → `"a|"`, `SetGroup('a', undefined)` → `"a|"`, `SetGroup('a', null)` → `"a|"` (depends on NULL-COERCION fix).

**Failure mode before fix.** Bindgen `hasCStringArgs` gate prevents optional-wrapping; the unwrapped cstring lambda throws `Cannot pass non-string to std::string` on `undefined`/missing.

**Failure mode after fix.** All four call shapes return the expected concatenation.

### U8.1 — Production-build-script patch invocation

**Goal.** Validate that `libembind-overloading.v2.patch` applies cleanly via the build script's exact invocation.

**Approach.** Add to `u8.test.sh`:

```bash
# Test 5: production build-script invocation
EMSDK_LIBEMBIND="$EMSDK/upstream/emscripten/src/lib/libembind.js"
cp "$EMSDK_LIBEMBIND" "/tmp/u8.1.pristine"
cd "$EMSDK/upstream/emscripten" || exit 1
if patch -p0 -N --ignore-whitespace --no-backup-if-mismatch < "$OCJS_ROOT/src/patches/libembind-overloading.patch"; then
  HUNK_COUNT=$(grep -c 'Gate-1 hunk' src/lib/libembind.js)
  [ "$HUNK_COUNT" -eq 3 ] || { echo "FAIL: expected 3 Gate-1 hunks, got $HUNK_COUNT" >&2; exit 1; }
  # Restore pristine for repeatability.
  cp "/tmp/u8.1.pristine" "$EMSDK_LIBEMBIND"
else
  echo "FAIL: patch did not apply" >&2; exit 1
fi
```

**Failure mode before fix.** Absolute paths in the patch header cause `patch -p0` to look at `/Users/rifont/...` (the PoC author's machine), missing the file. Apply silently succeeds in `repos/emscripten/` (unrelated tree) on machines where that tree exists.

**Failure mode after fix.** Patch applies cleanly to `$EMSDK/upstream/emscripten/src/lib/libembind.js`; all three Gate-1 hunks present.

### R13 (process) — Coverage matrix in PoC README

**Goal.** Force future PoC pivots to enumerate gaps systematically.

**Approach.** Add to `experiments/poc-occt-integration/README.md`:

```markdown
## Coverage matrix

| Dimension                           | Values validated                                        | Values NOT validated (open)                                                 |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `std::optional<T>` inner T category | `bool`, `double`, primitive class (`gp_Pnt`), handle    | (none — closed by R9)                                                       |
| Call shapes per T                   | omitted, value, undefined                               | null for value classes (closed by R9)                                       |
| Overload context                    | single method, mixed fan-out + optional different names | same-name multi-overload with optional (closed by R11)                      |
| Wrapper context                     | bare optional_override lambda                           | cstring-wrapper + optional (closed by R12)                                  |
| Arity overlap                       | non-overlapping `{0, A}`, `{0, B}`                      | overlapping `{0, A, B}` with semantic conflict (closed by R10)              |
| Patch invocation                    | diff-roundtrip from PoC working dir                     | build-script invocation from `$EMSDK/upstream/emscripten/` (closed by U8.1) |
```

Each row's "NOT validated" column **must** be empty before any PoC graduates to a migration plan.

## Architecturally Correct Canonical Approach

The five gaps surfaced during migration share a common architectural pattern: **the JS surface contract OCJS wants to provide is stricter than what upstream embind ships, and stricter than what the existing PoC corpus validated**. The canonical approach is therefore four-pronged:

1. **Make the libembind dispatcher complete.** The v2 patch already covers arity-pad (hunks 1+2) and optional-wildcard in `$getSignature` (hunk 3). A fourth hunk in `EmValOptionalType<T>::toWireType` (Finding 1) makes `null` and `undefined` symmetric for nullopt across all T. A fifth in-tree hot-edit (Findings 2 + dispatch correctness) makes the dispatcher type-aware across all candidate arities (not just exact-match). Both must be folded back into the canonical patch file.

2. **Make the bindgen emitter complete.** Per blueprint Step 4 + catalog R7', the four C2-cluster gates in `bindings.py:1884–1888` (numOverloads, hasCStringArgs, returnIsCString, returnTypeRequiresValueWrapper) must be **deleted**, not preserved. Each gate exists only because the OLD fan-out couldn't compose with the wrapper path it gates. `std::optional<T>` composition removes the need for the gate. The migration plan currently treats the gates as "still needed" — they are not, and TR-MO/TR-CW remain broken until they are deleted.

3. **Make the PoC coverage matrix exhaustive.** The five gaps in this document represent a coverage deficit, not a design deficit. Add R9–R12 + U8.1 to the corpus; refresh the R13 matrix; treat empty NOT-validated cells as the only acceptable state before declaring the PoC done.

4. **Make the test pins observable-behavior-driven.** Findings 5 (TR-RBV pin) shows the cost of pinning emission shape rather than observable behavior. Update the pin and adopt the principle for future pins (R16 + matching note in `docs/policy/testing-policy.md` if not already covered).

The combined effect is that the migration's acceptance gate (the 85-file smoke suite) becomes a function of the PoC's coverage matrix, not of trial-and-error during emitter changes. Every smoke failure during a future migration pivot should trace to a missing PoC row, not to an undiscovered architectural defect.

## Risks and Open Questions

| Risk                                                                           | Mitigation                                                                                                                                                                                                                                           | Open question                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EmValOptionalType::toWireType hunk regresses other embind users**            | The hunk only widens the accepted JS values (adds null on top of undefined); existing code paths that pass valid `T` instances are unchanged.                                                                                                        | Should the hunk be upstreamed? `null → nullopt` is a defensible interpretation but upstream may prefer the strict undefined-only contract.                                                                     |
| **Type-aware dispatch fallback adds runtime cost**                             | The fallback only fires when the exact-arity signature doesn't match; in the common case (correct types) it's a single hash lookup.                                                                                                                  | Measure with `bench-wallclock.mjs` after the fallback hunk lands — the PoC didn't measure this configuration.                                                                                                  |
| **Multi-overload + optional emission may surface R4/T1 collisions**            | The R4 and T1 guards are already in place at `predicates/optional_emission_guards.py`; they trigger emit-time errors.                                                                                                                                | Need a YAML audit (catalog Open Items §4, §5) to find which classes today have shape colliding under the new emission.                                                                                         |
| **`Standard_CString` semantics vs `std::optional<std::string>::value_or("")`** | The empty-string default matches the C++ source default (`= ""`) for `IFSelect_Act::SetGroup`. Other cstring trailing-default sites may use non-empty defaults — bindgen must extract those via `_extractDefaultExpr` exactly as for value defaults. | Audit other `Standard_CString` trailing-default call sites in OCCT to confirm none use shape `= other_function()` requiring deeper extraction.                                                                 |
| **U8.1 reveals additional patch-header drift across emsdk versions**           | The patch is generated against emsdk 5.0.1 (see `build-wasm.sh:686`); newer versions may shift context.                                                                                                                                              | Lock the build to a known emsdk version OR generate patch variants per version. The PoC validated against 5.0.1 only.                                                                                          |
| **TR-RBV pin retirement requires PR review approval**                          | Documented under Finding 5; Option B preserves the counterfactual.                                                                                                                                                                                   | If reviewers insist on the literal blueprint reading ("no smoke test may be modified"), revert to Option A (delete) and re-confirm coverage via the existing RBV smoke tests.                                  |
| **In-tree libembind hot-edit will be reverted on next clean build**            | Build script's `step_patch_embind` records patch-file hash; if hash matches, skips re-apply. But running `apply-patches` with a different patch reverts and re-applies. The hot-edit isn't tracked.                                                  | **Must** fold the hot-edit into the patch file (R8') before the migration PR lands. Verified by `pnpm nx run ocjs:apply-patches --skip-nx-cache` ending with 3 Gate-1 hunks + the type-aware fallback markers. |

## Appendix A: Failure-to-Finding Cross-Reference

| Smoke test                                      | Tests failing | Finding                                      | PoC experiment that should have caught it       | Architectural fix                                                                                                                                  |
| ----------------------------------------------- | ------------- | -------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke-optional-handle-defaults.test.ts`        | 2             | Finding 1                                    | R9 (new)                                        | libembind `toWireType` hunk accepts null                                                                                                           |
| `smoke-optional-value-defaults.test.ts`         | 1             | Finding 1                                    | R9 (new)                                        | libembind `toWireType` hunk accepts null                                                                                                           |
| `smoke-cstring-trailing-defaults.test.ts`       | 1             | Finding 1 + Finding 4                        | R9 + R12 (new)                                  | libembind hunk + bindgen `hasCStringArgs` gate removal                                                                                             |
| `smoke-defaults.test.ts`                        | 1             | Finding 2                                    | R10 (new)                                       | libembind type-aware fallback across arities                                                                                                       |
| `smoke-multioverload-trailing-defaults.test.ts` | 1             | Finding 3                                    | R11 (new)                                       | bindgen `numOverloads == 1` gate removal                                                                                                           |
| `smoke-rbv-trailing-defaults.test.ts`           | 1             | Finding 5                                    | n/a (documentation-only)                        | rewrite test assertion to observable behaviour                                                                                                     |
| `smoke-brep-gprop-face.test.ts`                 | 2             | Finding 2 (sub-class 2b)                     | R10b (new) — shadow-ctor test                   | dispatcher precedence: concrete higher-arity beats wildcard exact-arity; OR bindgen-side val-discrimination merge of degenerate sibling ctor pairs |
| `smoke-cstring-dispatch.test.ts`                | 2             | shares fix surface with Finding 6 (extended) | n/a — separate behaviour but same patch surface | R18 — fold Path B into the v2 `$getSignature` alongside the optional-wildcard hunk                                                                 |

## Appendix B: Per-Failure Binding Evidence

### Finding 1: `BRepAlgoAPI_Fuse.Build(null)`

Binding emission at `build/bindings/ModelingAlgorithms/TKBO/BRepAlgoAPI/BRepAlgoAPI_Fuse.hxx/BRepAlgoAPI_Fuse.cpp`:

```cpp
emscripten::register_optional<Message_ProgressRange>();
class_<BRepAlgoAPI_Fuse, base<BRepAlgoAPI_BooleanOperation>>("BRepAlgoAPI_Fuse")
  .constructor<>()
  .constructor(optional_override([](const TopoDS_Shape & S1, const TopoDS_Shape & S2, std::optional<Message_ProgressRange> theRange) {
    return new BRepAlgoAPI_Fuse(S1, S2, theRange.value_or((Message_ProgressRange ( ))));
  }), allow_raw_pointers())
;
```

`Message_ProgressRange` is registered as a `class_<>(...)` value type, not a smart_ptr. `EmValOptionalType<Message_ProgressRange>::toWireType(null)` forwards `null` to `val::as<Message_ProgressRange>()`, which throws.

### Finding 2 (sub-class 2a): `BRepMesh_IncrementalMesh(shape, 0.1, true)`

Binding emission at `build/bindings/ModelingAlgorithms/TKMesh/BRepMesh/BRepMesh_IncrementalMesh.hxx/BRepMesh_IncrementalMesh.cpp` (relevant ctor block):

```cpp
.constructor<>()
.constructor(optional_override([](const TopoDS_Shape & theShape, const IMeshTools_Parameters & theParameters, std::optional<Message_ProgressRange> theRange) { ... }))
.constructor(optional_override([](const TopoDS_Shape & theShape, const double theLinDeflection, std::optional<bool> isRelative, std::optional<double> theAngDeflection, std::optional<bool> isInParallel) { ... }))
```

Three arity slots: `0`, `3`, `5`. Call `(shape, 0.1, true)` lands at exact arity 3; signature for arity-3 entry is `(Shape, IMeshTools_Parameters, Message_ProgressRange)`; `0.1` (number) fails to match `IMeshTools_Parameters`. The libembind v2 dispatcher (pre-hot-edit) had no fallback to try arity 5; it returned a hard error. The in-tree hot-edit added the fallback; needs to be folded back into the patch.

### Finding 2 (sub-class 2b): `new BRepGProp_Face(face)` — smoking-gun migration regression

C++ source at `deps/OCCT/src/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx`:

```cpp
BRepGProp_Face(const bool IsUseSpan = false);
BRepGProp_Face(const TopoDS_Face& F, const bool IsUseSpan = false);
```

Migration emission at `build/bindings/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx/BRepGProp_Face.cpp`:

```cpp
emscripten::register_optional<bool>();
class_<BRepGProp_Face>("BRepGProp_Face")
  .constructor(optional_override([](std::optional<bool> IsUseSpan) {
    return new BRepGProp_Face(IsUseSpan.value_or((false)));
  }), allow_raw_pointers())
  .constructor(optional_override([](const TopoDS_Face & F, std::optional<bool> IsUseSpan) {
    return new BRepGProp_Face(F, IsUseSpan.value_or((false)));
  }), allow_raw_pointers())
  ...
  .function("Bounds",
    optional_override([](const BRepGProp_Face& self, double U1, double U2, double V1, double V2) -> BRepGProp_Face_Bounds_Result {
      self.Bounds(U1, U2, V1, V2);                                      // ← reads mySurface, which is null
      return BRepGProp_Face_Bounds_Result{U1, U2, V1, V2};               // ← all zeros
    }), allow_raw_pointers())
  .function("Normal",
    optional_override([](const BRepGProp_Face& self, const double U, const double V, ::emscripten::val P, ::emscripten::val VNor) -> void {
      self.Normal(U, V, *P.as<gp_Pnt*>(...), *VNor.as<gp_Vec*>(...));     // ← null mySurface → vtable through null
    }), allow_raw_pointers())
```

Dispatch trace for `new oc.BRepGProp_Face(face)` (1-arg with `face instanceof oc.TopoDS_Face`):

```
1. dispatcher.constructor_body[1].func is defined (arity-1 ctor present)
2. signaturesArray[1] = [ [typeId-of-EmValOptionalType<bool>] ]
3. $getSignature(args=[face], keys=[[typeId-of-optional<bool>]])
   → key[0] === typeId-of-optional<bool>
   → registeredTypes[typeId-of-optional<bool>].optional === true
   → optional-wildcard short-circuit returns true  ← THIS IS THE BUG
4. dispatch routes to arity-1 ctor with args=[face]
5. EmValOptionalType<bool>::toWireType(face)
   → face.isUndefined() === false
   → return std::optional<bool>(face.as<bool>())   ← face truthy-coerces to bool(true)
6. lambda body: new BRepGProp_Face(IsUseSpan.value_or(false))
   → IsUseSpan = optional<bool>(true)
   → calls C++ ctor BRepGProp_Face(true)
   → mySurface, myFace stay null/default
7. test continues to gpropFace.Bounds(0,0,0,0)
   → self.Bounds(U1,U2,V1,V2) reads mySurface->...
   → mySurface is null
   → either short-circuits to no-op (Bounds returns 0/0/0/0) or
   → if it gets to surface evaluation, vtable indirect via null → WASM null function trap
```

Pre-migration (fan-out) emission would have been (reconstructed from the catalog's description of fan-out shape, plus the binding-style of similar classes):

```cpp
.constructor<>()                                     // arity 0
.constructor<const bool>()                            // arity 1, bool
.constructor<const TopoDS_Face &>()                   // arity 1, Face (truncation)
.constructor<const TopoDS_Face &, const bool>()       // arity 2
```

For `(face)`, the arity-1 `signaturesArray` had TWO entries: `'boolean'` and `[typeId-of-TopoDS_Face]`. `$getSignature` iterated in registration order — `'boolean'` failed (`typeof face !== 'boolean'`); `instanceof TopoDS_Face` succeeded; dispatch routed to the truncation ctor; face was loaded correctly. Test passed.

**The migration's optional-wrapping collapsed two arity-1 entries into one wildcard-only entry, and the wildcard branch short-circuits before concrete-type matching at higher arities runs.** Every OCCT class with the pattern `C(T1, T2 = default)` + `C(T2 = default)` (e.g. `BRepGProp_Face`, possibly many others) now silently fails for the JS surface `new C(t1Instance)` — the face is never loaded.

### Finding 3: `BRepOffsetAPI_MakeFilling.Add(edge, GeomAbs_C0)`

Binding emission at `build/bindings/ModelingAlgorithms/TKOffset/BRepOffsetAPI/BRepOffsetAPI_MakeFilling.hxx/BRepOffsetAPI_MakeFilling.cpp`:

```cpp
.function("Add", select_overload<int(const gp_Pnt &), BRepOffsetAPI_MakeFilling>(&BRepOffsetAPI_MakeFilling::Add), allow_raw_pointers())
.function("Add", select_overload<int(const TopoDS_Face &, const GeomAbs_Shape), BRepOffsetAPI_MakeFilling>(&BRepOffsetAPI_MakeFilling::Add), allow_raw_pointers())
.function("Add", select_overload<int(const TopoDS_Edge &, const GeomAbs_Shape, const bool), BRepOffsetAPI_MakeFilling>(&BRepOffsetAPI_MakeFilling::Add), allow_raw_pointers())
.function("Add", optional_override([](BRepOffsetAPI_MakeFilling& self, emscripten::val arg0, emscripten::val arg1, emscripten::val arg2, emscripten::val arg3) { ... }))
```

The arity-3 overload `(Edge, GeomAbs, bool)` is emitted as a bare `select_overload` because `numOverloads > 1` gates off optional-wrapping in `bindings.py:1884`. Call `(edge, GeomAbs)` falls back to the arity-2 `(Face, GeomAbs)` overload because the libembind dispatcher cannot arity-pad an arity-3 ctor that doesn't take `std::optional<bool>` at position 3.

### Finding 4: `IFSelect_Act.SetGroup('mygroup')`

Binding emission at `build/bindings/DataExchange/TKXSBase/IFSelect/IFSelect_Act.hxx/IFSelect_Act.cpp`:

```cpp
.class_function("SetGroup",
  ((void (*)(std::string, std::string))[](std::string group, std::string file) -> void {
    IFSelect_Act::SetGroup(strdup(group.c_str()), strdup(file.c_str()));
  }
), allow_raw_pointers())
```

Bare `std::string, std::string` — no `std::optional<std::string>`. Bindgen `hasCStringArgs` gate prevented optional-wrapping. The 1-arg call `SetGroup('mygroup')` reaches the dispatcher with `args.length == 1`; no arity-1 entry exists; no fallback to arity 2 with `value_or("").c_str()` is possible because the binding doesn't take optional.

## References

- PoC source of truth: [`repos/opencascade.js/experiments/poc-occt-integration/README.md`](../../repos/opencascade.js/experiments/poc-occt-integration/README.md)
- Migration plan: [`docs/research/ocjs-optional-overload-resolution-blueprint.md`](./ocjs-optional-overload-resolution-blueprint.md)
- Catalog of outstanding issues + R7' (gate retirement): [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md)
- Strategic direction Option C: [`docs/research/ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md)
- Predecessor research: [`docs/research/ocjs-trailing-default-arity-fan-out.md`](./ocjs-trailing-default-arity-fan-out.md)
- Source: [`repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) (lines 1881–1949)
- Source: [`repos/opencascade.js/src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch)
- Smoke tests: [`repos/opencascade.js/tests/smoke/`](../../repos/opencascade.js/tests/smoke/)
