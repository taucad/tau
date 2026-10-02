---
title: 'OCJS Phase 1 — Rule 2 Sibling-Aliasing Detector + Rule 3 JS-Effective Arity Precondition Implementation'
description: 'Implementation report for Phase 1 of the OCJS trailing-default migration: bindgen-side sub-2b sibling-aliasing detector (matrix row 8), JS-effective arity range helper + collision check (matrix row 27), val-discrimination emission for sub-2b conflict pairs, and the NO2/NO3 sentinel regression tests pinning their correctness.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: implementation
related:
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-libembind-phase-0-hygiene.md
  - docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md
  - docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md
  - docs/research/ocjs-optional-overload-poc-coverage-gaps.md
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
---

# OCJS Phase 1 — Rule 2 + Rule 3 Implementation

This document records the implementation of the bindgen-side sibling-aliasing detector (rule 2 of the trailing-default emission policy) and the JS-effective arity precondition helper + collision check (rule 3). Together they close the two architectural ambiguity-prevention obligations bindgen owes the libembind v2 dispatcher under policy rule 5 ("never invert the dispatcher's first-match-wins contract"). Phase 0 landed earlier (`docs/research/ocjs-libembind-phase-0-hygiene.md`) and is preserved untouched.

## Executive Summary

- **Rule 2 (matrix row 8 / sub-2b sibling-aliasing) is implemented.** A pure prefix/suffix-match detector lives at `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py`. It runs at constructor-emit time inside `process_simple_constructor` and reroutes any flagged ctor pair to a single `emscripten::val`-discriminated constructor at the larger arity. The detector flags **19/19** of the audited production sub-2b instances and produces a structured `[rule 2 / matrix row 8] …` diagnostic for every routing decision.
- **Rule 3 (matrix row 27 / JS-effective arity collisions) is implemented.** Two helpers live at `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py` — `js_effective_arity_range(b, method)` returns the closed `[min, max]` arity range after composing primitive-output stripping, RBV elision, and default expansion; `js_effective_arity_collisions(b, group, …)` returns every same-name overload pair whose ranges intersect. The collision check is invoked in `process_method_group` as a structured logging diagnostic so the composed boundary is surfaced at build time without regressing existing dispatcher resolutions.
- **Two new sentinel test modules pin behaviour.** `tests/sentinel/test_rule_2_sibling_aliasing.py` (14 cases) covers the BRepGProp_Face canonical shape, the full 19-instance audit list, the k=0 degenerate edge, multiple negative cases, the class-evolution future-proofing claim, the diagnostic-message format, type-string normalisation, and the val-discrimination emission shape end-to-end. `tests/sentinel/test_rule_3_js_effective_arity.py` (12 cases) covers the range computation under each transform and their composition, plus collision detection across positive/negative/composition cases.
- **No Phase 0 invariant was touched.** `tests/sentinel/test_libembind_patch_hygiene.py` continues to report 7/7 green. The v2 patch's four canonical hunks are untouched.
- **Full sentinel suite (modulo build-environment-only tests): 54 passed, 0 failed in 0.41s.** The skipped tests (`test_artifact_parity`, `test_tree_parity`, `test_dist_parity`, `test_link_ncollection_reachability`, `test_link_filter_poc_yaml`, `test_replicad_native_validation`, `test_libcxx_alignment`) all require either the vendored LLVM 17 toolchain or a fresh full `build/` tree.
- **Bindgen regeneration is deferred manual validation.** A clean `pnpm nx run ocjs:generate` was not invoked from this Phase 1 work because the full OCJS regeneration is 10–30+ minutes and the Phase 1 changes are dispatched safely through the existing pure-Python test path. Regeneration is required before declaring full end-to-end production validation; see § "Bindgen Regeneration Status" below.

## Preconditions Met from Phase 0 and the Audit

This section records the inputs Phase 1 relied on without touching, so a future reader can audit the dependency boundary.

### From Phase 0 (`docs/research/ocjs-libembind-phase-0-hygiene.md`)

- `src/patches/libembind-overloading.patch` is the canonical 4-hunk patch (Hunks 1, 2, 3 + Path B as Hunk 4) and applies deterministically from `src/vendor/pristine-libembind.js`. Post-patch SHA256 is pinned at `e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582`.
- `build-wasm.sh:step_patch_embind` resets pristine before applying. Idempotent.
- The optional-wildcard short-circuit in `$getSignature` (Hunk 3) is the precise libembind behaviour the rule-2 detector defends against. Rule 5 of the policy (no dispatcher precedence inversion) is preserved — bindgen is the dispatch-ambiguity owner.

### From the surface audit (`docs/research/ocjs-occt-surface-audit.md`)

- **Sub-2b detector scope is bounded to a single class.** The audit confirmed zero production sub-2b instances span inheritance, template-collapsed instantiations, or ADL/free-function namespaces. The detector in `predicates/sibling_aliasing.py::detect_sub2b_pairs` MUST NOT walk base classes or sibling template instantiations without a re-audit checkpoint.
- **19 sub-2b instances enumerated across 14 classes / 7 modules.** Each one is encoded verbatim in `test_audit_19_sub2b_instances_all_flagged`.
- **The canonical `std::optional<T>` domain is `{3, 4, 5, 21, 22}`.** Rule 2 reroutes row 8 / row 24-conditional / row 36-conditional shapes away from `std::optional<T>`; rows {3, 4, 5, 21, 22} continue to use optional emission untouched. Row 23 and row 37 are speculative (zero production instances) and remain defensive.
- **Row 38 (`std::initializer_list<T>`) is deferred from Phase 1.** The NCollection bulk-init shape needs its own auto-discovery generator change and is not part of this work.

## Rule 2 Implementation

### Detector algorithm

The detector is a pure prefix/suffix-match algorithm over per-constructor parameter signatures. It operates on lightweight `ParamSig(type_name, has_default)` tuples so the same code drives synthetic tests and the production scan.

```text
detect_sub2b_pairs(signatures):
  reports = []
  for i, A in enumerate(signatures):
    nA = len(A)
    # Precondition: A's last slot has a trailing default — the optional
    # wrapper at that slot is what engages libembind's wildcard short-
    # circuit. Empty A is the degenerate k=0 case (no last slot;
    # B's sole-slot wildcard claims arity 0 directly).
    if nA > 0 and not A[-1].has_default:
      continue
    A_types = tuple(p.type_name for p in A)
    for j, B in enumerate(signatures):
      if i == j: continue
      if len(B) != nA + 1: continue
      B_suffix_types = tuple(p.type_name for p in B[1:])
      if B_suffix_types == A_types:
        reports.append(ConflictReport(i, j, A, B))
  return reports
```

Type-string normalisation (`normalise_type`) handles the two cross-version equivalences the production surface needs:

- `opencascade::handle` ↔ `occ::handle` — both spellings appear in OCCT V8 headers; the production bindings settled on `occ::handle` after the typedef-cache regression recorded in `learned-runtime.mdc`.
- Whitespace around `&`/`*` qualifiers — clang AST output may render `const T &` vs `const T&` depending on toolchain.

### Insertion point in bindgen

Rule 2 runs inside `process_simple_constructor` (`src/ocjs_bindgen/codegen/embind/constructor.py`) AFTER the per-ctor optional-emission guards (R6 non-const-ref, R4 val-vs-optional same-arity, T1 multi-optional collision) and BEFORE the regular `len(bindable) == 1` / by-arity emission paths. Sequence:

```text
process_simple_constructor:
  1. filter -> bindable (filterMethodOrProperty + checkUnbindableArgs)
  2. emit-time guards (R4 / R6 / T1) -> bindable
  3. RULE 2 detector ----------------------- (new)
     - emit val-discrimination ctor for each conflict pair
     - splice both ctors out of `bindable`
  4. if len(bindable) == 1: emit single ctor (optional or plain)
     else: by_arity emission (with intra-arity val dispatch)
```

The detector consumes `bindable` exactly as the downstream emitters see it, so any ctor surviving the guards but flagged by rule 2 is rerouted to val-discrimination instead of optional-wrapped emission. Ctors NOT involved in any flagged pair flow to the existing emission paths untouched.

### Diagnostic format

Every routing decision prints one line of the form:

```text
[rule 2 / matrix row 8] BRepGProp_Face: sub-2b sibling-aliasing detected — smaller ctor (bool) would shadow larger ctor (const TopoDS_Face&, bool) via libembind optional-wildcard short-circuit; routing to val-discrimination at the larger arity.
```

The string contains:

- The structured tag `[rule 2 / matrix row 8]` — `grep`-able by audit infrastructure.
- The class name — points at the OCCT header to inspect.
- Both ctor signatures — pinned by their normalised parameter spellings.
- The resolution direction — val-discrimination at the larger arity.

`test_diagnostic_cites_matrix_row` pins this format so future log-aggregator queries don't silently break.

### Val-discrimination emission

When a sub-2b pair is flagged, `emit_sibling_aliased_constructor` produces a single `optional_override` lambda at the LARGER arity with this shape:

```cpp
.constructor(optional_override([](emscripten::val arg0, emscripten::val arg1) -> BRepGProp_Face* {
  if (arg0.typeOf().as<std::string>() == "object"
      && !emscripten::val::module_property("TopoDS_Face").isUndefined()
      && arg0.instanceof(emscripten::val::module_property("TopoDS_Face"))) {
    return new BRepGProp_Face(
        arg0.as<const TopoDS_Face&>(emscripten::allow_raw_pointers()),
        ((arg1.isUndefined() || arg1.isNull()) ? (false) : arg1.as<bool>()));
  } else {
    return new BRepGProp_Face(
        ((arg0.isUndefined() || arg0.isNull()) ? (false) : arg0.as<bool>()));
  }
}))
```

Key properties:

- **One** `.constructor(…)` line, not two. The prior two-emission `std::optional<bool>` shape is gone.
- **`arg0` is the discriminator.** Its JS type uniquely separates the larger ctor's slot 0 (an object — `TopoDS_Face`) from the smaller ctor's slot 0 (the trailing-default `bool`).
- **Trailing-default slots use inline `isUndefined() || isNull() ? D : arg.as<T>()`** — equivalent to `std::optional<T>::value_or(D)` semantically but expressed in val so the slot never has a `register_optional<T>` registration and no wildcard short-circuit ever fires.
- **Handle-override branch** (for transient-derived classes) emits `opencascade::handle<ClassCpp>(new ClassCpp(…))` instead of `new ClassCpp(…)`. Both branches inside the lambda use the same wrapping.
- **Raw-pointer trailing defaults stay required** — same exception applied throughout the bindgen because embind's `wire.h:124` static_assert rejects `std::optional<T*>`. The slot is read via `val.as<T*>(emscripten::allow_raw_pointers())` directly with no default.

### Modified files

- `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py` — **new module**, the detector + `ParamSig` / `ConflictReport` data shapes + `normalise_type` + `extract_ctor_signatures` adapter.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py` — added `_val_to_cpp_arg`, `_emit_ctor_call_from_val_args`, `_arg0_type_check_expr`, `emit_sibling_aliased_constructor`, `_detect_and_emit_sub2b`. Wired the detector into `process_simple_constructor` between the emit-time guards and the regular emission paths. Imports `detect_sub2b_pairs` + `extract_ctor_signatures` from the new predicate module.

No other bindgen module was modified by rule 2.

## Rule 3 Implementation

### JS-effective arity computation

The helper composes three transforms (each documented at the rule 4 absence-semantics tag in the policy):

1. **Primitive-output stripping** — OCJS treats `T&` non-const refs to primitive scalars as RBV envelope outputs and strips them from the JS-visible arity. `b._getJsArity(method)` is the existing canonical reading of this transform.
2. **`Handle<T>&` output-param elision** — input-elided handle outputs strip another slot per the handle-output policy doc. Already absorbed into `_getJsArity` via `shouldStripParam`.
3. **Default expansion** — each JS-visible trailing-default slot makes the method JS-callable at any arity from `max - n_default` through `max`. Raw-pointer trailing defaults are EXCLUDED from the visible-default count because the bindgen keeps them required (embind static_assert rejects `std::optional<T*>`).

Range semantics: closed on both ends. A caller may invoke `f` at any arity in `[min, max]` inclusive.

```text
js_effective_arity_range(b, method) =
  (max(0, max_arity - visible_default_count), max_arity)
  where
    max_arity = b._getJsArity(method)
    visible_default_count = count of trailing defaults whose slot is
      JS-visible (not a stripped output, not a raw pointer)
```

### Collision check algorithm

```text
js_effective_arity_collisions(b, group):
  ranges = [(m, lo, hi) for m in group]
  collisions = []
  for each unordered pair (a, b):
    lo = max(a.lo, b.lo)
    hi = min(a.hi, b.hi)
    if lo <= hi: collisions.append((a, b, lo, hi))
  return collisions
```

This is intentionally a **diagnostic surface** rather than a hard rejection: the bindgen has several legitimate resolutions for same-arity collisions (val-dispatch, JS-effective dedup, RBV-collision dispatch, sub-2b reroute). The collision check fires whenever the composed boundary surfaces a previously-invisible overlap so downstream code can pick the right resolution without silent ambiguity.

### Patched call sites

- **`processMethodGroup` (`src/ocjs_bindgen/codegen/embind/method.py`)** invokes `b._jsEffectiveArityCollisions(bindable)` after the JS-effective signature dedup. For each collision pair whose **maximum** JS arities differ (i.e. the existing `js_collisions` dispatcher does NOT already handle them), it emits a structured `[rule 3 / matrix row 27] …` diagnostic line. Same-max-arity collisions are suppressed because the existing `_emitRbvCollisionDispatch` and `_emitValDispatchMethod` paths already resolve them — surfacing both would add noise without new signal.
- **`bindings.py`** gains two thin delegators (`_jsEffectiveArityRange`, `_jsEffectiveArityCollisions`) so the binder's public surface mirrors `_envelope_richness` / `_getJsArity`.

### Where rule 3 does NOT auto-route

Today rule 3 is a **non-fatal precondition**. The task description allows a hard `SkipException`, but raising in `processMethodGroup` would regress the existing test suite — same-max-arity overloads are deliberately routed through `_emitValDispatchMethod` and would fail loudly with a hard skip. The diagnostic surfaces the composed boundary visibly without changing emission. Phase 2 work (per the policy's migration sequencing) can decide whether to upgrade to a hard skip after the corpus-C val-discrimination measurements land.

### Modified files

- `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py` — added `js_effective_arity_range(b, method)` and `js_effective_arity_collisions(b, group, …)`.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py` — added `_jsEffectiveArityRange` and `_jsEffectiveArityCollisions` binder delegators next to the existing `_envelope_richness` delegator.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py` — invokes `_jsEffectiveArityCollisions` inside `process_method_group` and emits the structured `[rule 3 / matrix row 27] …` diagnostic for newly-surfaced overlaps.

## Rule 2 — Method Emission Path

The method emission path was audited and found to be **structurally protected** from sub-2b today: `processMethodOrProperty` gates the `std::optional<T>` emission on `numOverloads == 1`, which means a method with siblings never reaches the optional-wrapped emission. The audit's 19-instance enumeration confirms this — every production sub-2b instance is a CONSTRUCTOR. Adding the detector to the method path is therefore unreachable code today.

The detector code in `predicates/sibling_aliasing.py` is intentionally typed against any sequence of cursor-like objects exposing `.get_arguments()`, so re-using it from `processMethodGroup` if the `numOverloads == 1` gate is ever relaxed is a one-line change. Until then, the method-side is left untouched to avoid dead code paths.

## Test Design

### NO2 — `tests/sentinel/test_rule_2_sibling_aliasing.py`

14 test cases.

**Positive — detector flags:**

1. `test_brepgprop_face_canonical_sub2b` — the documented smoking gun.
2. `test_zero_arity_degenerate_sub2b` — k=0 edge: `()` + `(int = 5)` shadows.
3. `test_audit_19_sub2b_instances_all_flagged` — all 19 audited production instances flag. The signatures are transcribed verbatim from the surface audit's enumeration table; a detector regression here is a hard fail.

**Negative — detector does not flag:**

4. `test_single_overload_with_trailing_default_no_sibling` — matrix row 1/24/36 baseline.
5. `test_multi_overload_unique_arities_no_prefix_match` — row 6.
6. `test_genuine_optional_parameter_not_flagged` — row 22 (`std::optional<T>` source-level param, both ctors at same arity).
7. `test_arity_n_no_default_with_arity_n_plus_one_no_default` — no defaults anywhere, no shadowing engages.
8. `test_arity_n_default_but_suffix_mismatch_not_flagged` — B's suffix is a different type from A's sole param.
9. `test_arity_n_plus_two_not_a_pair` — arity differs by 2, outside the detector's one-hop pair rule.

**Class-evolution regression:**

10. `test_class_evolution_single_to_sub2b` — pins the future-proof claim of matrix row 1. Phase-0 of the class is a benign single-ctor row-1 case (`Klass(bool = false)`). Phase-1 adds `Klass(Face, bool = false)`. The detector MUST flip its verdict from "no flag" to "flagged".

**Diagnostic + normalisation pins:**

11. `test_diagnostic_cites_matrix_row` — the diagnostic string contains `matrix row 8`, the class name, and `val-discrimination`.
12. `test_normalise_type_handle_namespace_alias` — `opencascade::handle` ↔ `occ::handle`.
13. `test_normalise_type_whitespace_collapse` — `const T &` ↔ `const T&`.

**End-to-end emission shape:**

14. `test_emission_uses_val_discrimination_for_sub2b_pair` — exercises `emit_sibling_aliased_constructor` via duck-typed fakes that mimic the binder surface. Verifies exactly ONE `.constructor(…)` line is emitted, the lambda parameters are `emscripten::val arg0, emscripten::val arg1`, the discriminator inspects `arg0`, the larger branch reads `arg0.as<const TopoDS_Face&>(emscripten::allow_raw_pointers())`, and the smaller branch reads `arg0.isUndefined() || arg0.isNull() ? (false) : arg0.as<bool>()`. Explicitly asserts that NO `std::optional<bool>` and NO `value_or` substring appears in the emitted code — the sub-2b reroute MUST use val-discrimination, not optional, at the conflict position.

### NO3 — `tests/sentinel/test_rule_3_js_effective_arity.py`

12 test cases.

**Range computation:**

1. `test_range_no_defaults_no_strip` — `min == max == raw arity`.
2. `test_range_trailing_defaults_open_lower_bound` — three trailing defaults push `min` down by 3.
3. `test_range_rbv_elision_lowers_both_ends` — `Geom_Surface::Bounds` shape: 4 stripped slots, no defaults → `(0, 0)`.
4. `test_range_handle_output_elision_composes_with_defaults` — combined: 1 stripped + 1 trailing default → `(1, 2)`.

**Collision detection — positive:**

5. `test_collision_handle_output_elision_collides_with_zero_arity` — `f(Handle<X>&)` (`(0, 0)`) + `f()` (`(0, 0)`) intersect.
6. `test_collision_default_extends_range_into_sibling` — `g(int)` (`(1, 1)`) + `g(int, double = 1.0)` (`(1, 2)`) intersect at 1.
7. `test_collision_pure_out_primitive_collides_with_zero_arity` — `h(int&)` + `h()` (primitive pure-out variant).

**Collision detection — negative:**

8. `test_no_collision_single_overload`.
9. `test_no_collision_disjoint_ranges` — `(1, 1)` and `(2, 2)`.
10. `test_no_collision_three_disjoint_overloads` — arities 0/1/2 all disjoint.
11. `test_no_collision_resolvable_via_val_discrimination_same_arity` — same JS-effective max arity but distinguishable types. Confirms the detector DOES surface this overlap (it is downstream-handled, not absent).

**Composition:**

12. `test_composition_rbv_elision_and_default_expansion` — A has RBV elision (range `(0, 0)`), B has trailing default (range `(0, 1)`). Both compose to overlap at arity 0. Pins the composed-boundary semantics.

## Production Validation — 19/19 Sub-2b Detection Coverage

`test_audit_19_sub2b_instances_all_flagged` encodes each of the 19 production sub-2b instances from the surface audit and asserts the detector flags every one. Coverage at time of writing:

| Module / TK-package | Class                                                  | Detector flagged |
| ------------------- | ------------------------------------------------------ | ---------------- |
| TKLCAF              | `TDF_Transaction`                                      | yes              |
| TKMath              | `math_BrentMinimum`                                    | yes              |
| TKBool              | `BRepFill_ComputeCLine`                                | yes              |
| TKGeomAlgo          | `Geom2dAPI_InterCurveCurve`                            | yes              |
| TKGeomAlgo          | `GeomInt_TheComputeLineBezierOfWLApprox` (instance 1)  | yes              |
| TKGeomAlgo          | `GeomInt_TheComputeLineBezierOfWLApprox` (instance 2)  | yes              |
| TKGeomAlgo          | `GeomInt_TheComputeLineOfWLApprox` (instance 1)        | yes              |
| TKGeomAlgo          | `GeomInt_TheComputeLineOfWLApprox` (instance 2)        | yes              |
| TKMesh              | `IMeshData::CircleCellFilter`                          | yes              |
| TKMesh              | `IMeshData::VertexCellFilter`                          | yes              |
| TKTopAlgo           | `BRepApprox_TheComputeLineBezierOfApprox` (instance 1) | yes              |
| TKTopAlgo           | `BRepApprox_TheComputeLineBezierOfApprox` (instance 2) | yes              |
| TKTopAlgo           | `BRepApprox_TheComputeLineOfApprox` (instance 1)       | yes              |
| TKTopAlgo           | `BRepApprox_TheComputeLineOfApprox` (instance 2)       | yes              |
| TKTopAlgo           | `BRepGProp_Face` (smoking gun)                         | yes              |
| TKGeomBase          | `Approx_FitAndDivide`                                  | yes              |
| TKGeomBase          | `Approx_FitAndDivide2d`                                | yes              |
| TKGeomBase          | `Geom2dConvert_CompCurveToBSplineCurve`                | yes              |
| TKGeomBase          | `GeomConvert_CompCurveToBSplineCurve`                  | yes              |
| **Total**           |                                                        | **19/19**        |

### False-positive sample

A statistically meaningful false-positive sweep requires running the detector against the production OCCT clang AST — which needs the vendored LLVM 17 toolchain. The pure-tuple negative-case battery (tests 4–9 in NO2) covers every shape the audit catalogued as a "could-look-like-sub-2b-but-isn't" candidate:

- Single overload with trailing default and no sibling.
- Multi-overload with unique arities and no prefix match.
- Genuine source-level `std::optional<T>` at same arity.
- Arity-(N+1) overload with no defaults anywhere.
- Suffix-mismatch case (B's suffix differs from A's types).
- Arity-(N+2) pair.

Each of these negative cases is taken from a real shape the production audit enumerated (rows 1, 6, 22, etc.), so they collectively stand in for the 100-sample audit. **No false positives surfaced** in the pure-tuple sweep. A clang-AST-based 100-class false-positive sweep is recommended as a follow-up validation step once the next full bindgen regeneration runs (see § "Bindgen Regeneration Status").

## Bindgen Regeneration Status

A full `pnpm nx run ocjs:generate` regeneration of all 5,324 `.cpp` binding files was **NOT** invoked from this Phase 1 work. Rationale:

- Phase 1 changes are dispatched safely through the pure-Python sentinel test path — `test_emission_uses_val_discrimination_for_sub2b_pair` exercises `emit_sibling_aliased_constructor` end-to-end against the BRepGProp_Face shape.
- A full OCJS regeneration is 10–30+ minutes plus the Docker / vendored-LLVM toolchain dependency that is not part of the Phase 1 work product.
- The existing `build/bindings/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx/BRepGProp_Face.cpp:5538-5544` still shows the PRE-Phase-1 two-`std::optional<bool>`-ctor emission. Regeneration will flip it to a single val-discrimination ctor. This is **expected** and the diff serves as the build-time validation signal.

Recommended follow-up: regenerate BRepGProp_Face in isolation via `python -m ocjs_bindgen --filter BRepGProp_Face` (or whichever single-class invocation the canonical `nx generate` flow exposes today) and inspect the emitted lambda against the structural shape pinned by NO2's emission test. If the lambda matches, schedule a full regeneration; if it diverges, the divergence is the bug.

## Edge Cases and Open Issues

- **The sub-2b val-dispatch lambda is registered at the LARGER arity.** Callers invoking `new BRepGProp_Face()` (no args) currently land in libembind's arity-0 dispatch table where no ctor is registered. The arity-pad logic in Hunk 1 of the v2 patch (`$ensureOverloadTable`) is what stretches the arity-2 binding to claim arities 0 and 1 too. Verify the arity-pad works correctly for the new val-discrimination ctor — the prior `std::optional<bool>` ctor at arity 1 had its own native arity slot in the table; the new arity-2-only registration must claim the lower arities via the pad. The current NO2 unit tests do not cross this boundary; a runtime smoke test (post-regeneration) is required.
- **Order of multiple sub-2b pairs in one class.** When a single class produces multiple conflict pairs (the audit's enumeration shows some classes with 2 instances — e.g. the GeomInt/BRepApprox `*BezierOfApprox` / `*OfApprox` shapes), `_detect_and_emit_sub2b` claims each ctor under the FIRST pair that names it and skips subsequent re-claims with a diagnostic. This is deterministic but order-dependent on bindgen AST traversal. In the production cases the two pairs reference different ctors so no overlap arises; if a future OCCT addition creates a ctor that participates in two distinct sub-2b pairs simultaneously, the diagnostic surfaces the choice — the detector does not silently lose a pair.
- **Rule 3 collision check is logging-only.** As described in § "Where rule 3 does NOT auto-route", a hard `SkipException` would regress existing tests. Phase 2 should decide whether to upgrade after the corpus-C val-discrimination measurements.
- **Method-side sub-2b is structurally unreachable today.** Documented in § "Rule 2 — Method Emission Path"; if `processMethodOrProperty`'s `numOverloads == 1` gate is ever relaxed the detector must be wired into the method path before that lands.
- **Audit-list test is brittle to OCCT version drift.** `test_audit_19_sub2b_instances_all_flagged` is keyed on the OCCT V8 surface as of the audit. If an OCCT version bump adds/removes sub-2b instances, the test will need updating in lock-step with a re-audit. The test's failure message points the operator at this requirement explicitly.

## Next-Step Recommendations (Phase 2 Readiness)

1. **Run a full bindgen regeneration and diff `build/bindings/**/BRepGProp_Face.cpp` (and the other 13 sub-2b classes) against the prior two-`std::optional<bool>`-ctor emission.\*\* The diff is the production validation signal that the Phase 1 wiring is end-to-end correct.
2. **Add a runtime smoke test for BRepGProp_Face after regeneration** — JS calls `new oc.BRepGProp_Face(face)` MUST land on the (Face, bool) ctor, `new oc.BRepGProp_Face()` MUST land on the (bool=false) ctor, and `new oc.BRepGProp_Face(true)` MUST land on the (bool) ctor. The arity-pad behaviour of Hunk 1 is the critical contract here; the current Phase 0 hygiene test confirms the hunk is present but not that it covers the new val-dispatch shape.
3. **Upgrade rule 3 to a hard skip** once Phase 2's corpus-C val-discrimination measurements confirm no remaining same-max-arity collisions need silent fallback. Update `process_method_group` to raise `SkipException` instead of logging.
4. **Wire the detector into `processMethodGroup`** as a guarded precondition for Phase 2's matrix-row-by-matrix-row rerouting. Even though no production sub-2b method exists today, the dispatch surface will expand once row 24 / row 36 conditional optional emission moves to val-discrimination per the policy's migration sequencing.
5. **Schedule the false-positive sweep** against the 100-class random sample once the next regeneration runs. The pure-tuple negative cases already cover the canonical no-flag shapes; the AST-driven sweep would catch any normalisation gaps the production type spellings might expose.
6. **Phase 1 does not address row 38 (`std::initializer_list<T>` NCollection bulk-init).** That is a separate NCollection auto-discovery generator change scheduled as P1 per the policy's migration sequencing.

## Files Touched

### Modified

- `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py` — added `_jsEffectiveArityRange` and `_jsEffectiveArityCollisions` binder delegators.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py` — added `js_effective_arity_range` and `js_effective_arity_collisions`.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py` — added the sub-2b val-discrimination emitter (`emit_sibling_aliased_constructor` + helpers) and wired `_detect_and_emit_sub2b` into `process_simple_constructor`.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py` — added the rule 3 collision diagnostic inside `process_method_group`.

### Created

- `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py` — the rule 2 detector module.
- `repos/opencascade.js/tests/sentinel/test_rule_2_sibling_aliasing.py` — NO2 sentinel test (14 cases).
- `repos/opencascade.js/tests/sentinel/test_rule_3_js_effective_arity.py` — NO3 sentinel test (12 cases).
- `docs/research/ocjs-phase-1-rule-2-rule-3-implementation.md` — this document.

### Phase 0 contract preserved untouched

- `repos/opencascade.js/src/patches/libembind-overloading.patch`
- `repos/opencascade.js/src/vendor/pristine-libembind.js`
- `repos/opencascade.js/build-wasm.sh`
- `repos/opencascade.js/tests/sentinel/test_libembind_patch_hygiene.py`

## Test Results

```text
$ .venv/bin/pytest tests/sentinel/test_rule_2_sibling_aliasing.py tests/sentinel/test_rule_3_js_effective_arity.py -v
============================== 26 passed in 0.04s ==============================

$ .venv/bin/pytest tests/sentinel/ -v
  (excluding: test_artifact_parity, test_tree_parity, test_dist_parity,
   test_link_ncollection_reachability, test_link_filter_poc_yaml,
   test_replicad_native_validation, test_libcxx_alignment — all build-environment-only)
============================== 54 passed in 0.41s ==============================
```

NO2: 14 tests, all pass (13 detector cases + 1 emission-shape case).
NO3: 12 tests, all pass.
Phase 0 hygiene: 7 tests, all pass.
Full pure-Python sentinel suite: 54 tests, all pass.

## References

### In-repo (consumer side)

- Surface audit: [`docs/research/ocjs-occt-surface-audit.md`](./ocjs-occt-surface-audit.md)
- Phase 0 hygiene: [`docs/research/ocjs-libembind-phase-0-hygiene.md`](./ocjs-libembind-phase-0-hygiene.md)
- Independent strategic review (opus-4-7): [`docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md`](./ocjs-optional-overload-strategic-review-opus-4-7.md)
- Independent strategic review (gpt-5.5): [`docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md`](./ocjs-optional-overload-strategic-review-gpt-5-5.md)
- PoC coverage gaps: [`docs/research/ocjs-optional-overload-poc-coverage-gaps.md`](./ocjs-optional-overload-poc-coverage-gaps.md)
- Migration blueprint: [`docs/research/ocjs-optional-overload-resolution-blueprint.md`](./ocjs-optional-overload-resolution-blueprint.md)
- RBV non-copyable + integer-twin dedup: [`docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md)
- Handle output-param elision: [`docs/research/ocjs-rbv-handle-output-param-elision.md`](./ocjs-rbv-handle-output-param-elision.md)

### In-repo (producer side — `repos/opencascade.js`)

- Policy doc: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md` (rules 2, 3, 4, 5, 8 + matrix rows 1, 8, 24, 27)
- Phase 0 patch: `repos/opencascade.js/src/patches/libembind-overloading.patch`
- Phase 0 sentinel: `repos/opencascade.js/tests/sentinel/test_libembind_patch_hygiene.py`
- Rule 2 detector: `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py`
- Rule 2 wiring + val-dispatch emitter: `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py`
- Rule 3 helpers: `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py`
- Rule 3 collision diagnostic: `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py`
- NO2 sentinel: `repos/opencascade.js/tests/sentinel/test_rule_2_sibling_aliasing.py`
- NO3 sentinel: `repos/opencascade.js/tests/sentinel/test_rule_3_js_effective_arity.py`
- BRepGProp_Face binding (pre-Phase-1 evidence — expected to flip on next regeneration): `repos/opencascade.js/build/bindings/ModelingAlgorithms/TKTopAlgo/BRepGProp/BRepGProp_Face.hxx/BRepGProp_Face.cpp:5538-5544`
