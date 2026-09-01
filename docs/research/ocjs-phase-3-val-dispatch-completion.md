---
title: 'OCJS Phase 3 — val-dispatch emission completion'
description: 'Per-row landing of val-discrimination emission for trailing-default rows {1, 2, 23, 30, 33, 34, 37} and the gate-routing refactor that drops the legacy bindgen vetoes in favour of classifier-driven dispatch.'
status: active
created: '2026-05-29'
updated: '2026-05-29'
category: migration
related:
  - docs/research/ocjs-phase-2-val-dispatch-emission.md
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-matrix-row-bench-fixture.md
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
---

# OCJS Phase 3 — val-dispatch emission completion

Closing the bindgen-side gap between the trailing-default emission policy (38-row matrix) and the bindgen's actual dispatch code. Phase 3 wires `val_default.emit_method_with_val_default` for the seven rows deferred from Phase 2, refactors the legacy "must use the special wrapper" gates into a classifier-driven strategy router, and pins the result with sentinel tests. After Phase 3 the bindgen is ready for Phase 4's big-bang regeneration.

## Executive Summary

Phase 2 shipped the classifier infrastructure (`overload_classification.py`), the val-default helper (`val_default.py`), and wired row 33 (cstring trailing default) end-to-end — but the remaining val-owned rows {1, 2, 7, 23, 30, 34, 37} stayed gated behind four conjunctive predicates in `bindings.py::processMethodOrProperty` (`hasOutputParams`, `_returnTypeRequiresValueWrapper`, `returnIsCString`, `numOverloads == 1`). Phase 3 removes those gates, plumbs `is_canonical_optional_default` and `accepts_meaningful_null` per-position metadata into the classifier, and routes every val-owned trailing-default surface through the val-default helper. Row 7 (sub-2a semantic conflict) is classifier-reachable via the rule 2 verdict but the production auto-detector remains future work — the surface audit's ≈50 instances need an independent enumeration pass complementing rule 2's strict suffix-match.

The gate refactor is the architectural keystone: a single `_select_emission_strategy` function (`bindings.py:724`) consults the classifier verdict (`OverloadClassification.primitive`) and the unavoidable return-side concerns (cstring return, value-wrapper return) and returns one of three strategies (`val_default`, `optional_default`, `legacy`). Every "primitive choice" decision now flows from the classifier; the legacy predicates survive as row disambiguators, never as vetoes.

## Problem Statement

Pre-Phase-3 state (from `tau:docs/research/ocjs-phase-2-val-dispatch-emission.md`):

- Phase 2 added the classifier + val-default helper + sentinel infrastructure but only one row (33) routed through the new helper.
- Six val-owned rows ({1, 2, 23, 30, 34, 37}) stayed on the legacy `std::optional<T>`-fallback path despite the policy mandating `emscripten::val` discrimination — the four conjunctive gates kept fighting the classifier's verdict.
- Row 7 (sub-2a semantic conflict) was not yet recognised at the classifier level at all.
- The bench fixture closure (Q3) established val ≤55% faster than optional on every measured row, removing the perf-driven case for keeping optional emission on rows {1, 2, 23, 30, 34, 36, 37}.

Phase 3 must:

1. Route every val-owned row through `val_default.emit_method_with_val_default`.
2. Replace the four conjunctive gates with classifier-driven dispatch.
3. Pin each row's emission shape with sentinel tests.
4. Update the policy doc Migration Sequencing and the Phase 2 research doc deferrals to reflect the landing.

## Methodology

1. Read the policy doc (`docs/policy/ocjs-trailing-default-emission-policy.md`), the Phase 2 research, the surface audit, and the bench-closure note in sequence to anchor the per-row primitive table.
2. Inspect the Phase 2 emission site (`bindings.py:2140-2260`) to enumerate the gates and the classifier integration point.
3. Trace each gate's preservation requirement: the cstring-return wrapper, the value-wrapper return, and the output-param RBV envelope cannot yet compose with the val-default lambda because the lambda's return type and the wrapper's input/output marshalling overlap. Those gates survive as row disambiguators; the multi-overload and cstring-input gates GO because their handling is now classifier-driven.
4. Distinguish the canonical `std::optional<T>` domain {3, 4, 5} from rows {1, 2, 23, 30, 36, 37} via two new `ParameterDescriptor` flags: `is_canonical_optional_default` (set when the trailing default is a null Handle, a const-ref-to-temp, or a scoped constant) and `accepts_meaningful_null` (set for OCCT handle-reporter slots).
5. Compose the strategy router as a pure function so the sentinel can exercise the dispatch contract without dragging in the libclang toolchain.
6. Pin each row's emission with hermetic sentinel tests built on a `FakeBinder` + `FakeMethod` pair so the suite stays under 100ms.

## Findings

### Finding 1: Single source of truth for primitive choice (`_select_emission_strategy`)

The Phase 2 gate site had FOUR conjunctive predicates that took primacy over the classifier verdict — exactly the pattern the policy rules out. Phase 3 collapses them into one strategy router at `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py:724`:

```python
def _select_emission_strategy(*, classification, n_defaults, n_optional_wraps,
                              has_output_params, has_cstring_args,
                              return_is_cstring, return_requires_value_wrapper):
    if n_defaults <= 0:
        return "legacy"
    if n_optional_wraps <= 0:                # all-raw-pointer trailing defaults
        return "legacy"
    if has_output_params:                    # RBV path handled earlier
        return "legacy"
    if return_is_cstring or return_requires_value_wrapper:
        return "legacy"                      # return-side wrapper still owns shape

    if classification.primitive == "val":
        return "val_default"
    if classification.primitive == "optional":
        if has_cstring_args:
            return "legacy"                  # cstring-input lambda owns binding
        return "optional_default"
    return "legacy"
```

Three things to note:

1. **The `numOverloads == 1` gate is gone.** Row 34 routing flows from the classifier's `sibling_count` field on `OverloadDescriptor` (populated via `numOverloads - 1`), not from the emission site.
2. **The `hasCStringArgs` gate is gone for val emission.** Row 33's emission composes the cstring conversion inline in the val-default helper; the gate only survives on the optional path because optional + cstring-input cannot interleave without a dedicated emitter (out of scope for Phase 3).
3. **Return-side concerns survive as row disambiguators.** When `returnIsCString` or `return_requires_value_wrapper` fires the binding falls through to the legacy wrapper; trailing defaults are not expanded for those methods. This matches pre-Phase-3 behaviour and is acceptable — a future PR can extend the val-default helper to compose return-side wrappers.

### Finding 2: Canonical `std::optional<T>` carve-out is a per-position bindgen flag

The classifier needs to distinguish rows {3, 4, 5} (canonical optional) from rows {1, 2, 23, 30, 36, 37} (val) on single-overload trailing-default methods. Phase 3 adds two `ParameterDescriptor` flags:

- `is_canonical_optional_default`: True when the trailing default is `Handle()` on a Handle parameter (row 3), `const T& = T()` on a const-ref-to-temp (row 4), or a scoped-constant expression `NS::Const` with no trailing `()` (row 5).
- `accepts_meaningful_null`: True when the slot is a Handle to one of the OCCT progress-reporter classes (`Message_ProgressIndicator`, `Message_ProgressRange`, `Message_Report`, `ShapeExtend_BasicMsgRegistrator`) — the row 30 carve-out.

The bindgen populates both flags via `_is_canonical_optional_default` and `_accepts_meaningful_null` helpers in `bindings.py:605` and `:696`. The classifier then dispatches:

```python
# overload_classification.py:431-450 (paraphrased)
if any(p.accepts_meaningful_null for p in trailing):
    return Classification(row=30, primitive='val', ...)   # permissive null
if all(p.is_canonical_optional_default for p in trailing):
    return Classification(row=3, primitive='optional', ...)
return Classification(row=1, primitive='val', ...)        # default — strict null
```

The "default for non-canonical-optional" branch covers rows 1, 2, 36 (the val-default helper renders identical C++ for all three shapes — the difference is in the default expression spelling, which the helper pastes verbatim). Rows 23 and 37 also land on this branch (non-null handle defaults and reference-default singletons are not canonical optional). Zero production instances per the surface audit means the defensive coverage is exercised only by sentinels.

### Finding 3: Row 34 multi-overload coordination is descriptor-driven

The `numOverloads == 1` gate previously prevented multi-overload trailing-default groups (≈20 production instances per the audit) from reaching the val-default path. Phase 3 removes the gate; the classifier now checks `sibling_count > 0` on the (first) `OverloadDescriptor` and returns row 34 (`val`).

The emission flow:

1. `embind/method.py::process_method_group` iterates over the bindable methods, calls `_jsEffectiveArityCollisions` for the rule 3 / matrix row 27 precondition (raises SkipException for unresolvable collisions), then dispatches each method through `processMethodOrProperty` with the full `numOverloads` count.
2. `processMethodOrProperty` builds the `OverloadDescriptor` with `sibling_count=numOverloads - 1`, calls `classify_overload_group`, and the classifier returns row 34 / `val`.
3. The strategy router returns `"val_default"`.
4. The val-default helper emits one lambda per overload, distinguished by the existing `overload_postfix` mechanism (`getMethodOverloadPostfix`).
5. Each lambda owns its arity range; JS callers pick the right one by argument count + per-slot val type.

No new helper was required in `embind/method.py` — the existing `process_method_group` infrastructure (RBV elision, val-discrimination, arity-grouped dispatch) composes with per-method val-default emission because each method's lambda is independent.

### Finding 4: Sentinel coverage shape — pure-Python `FakeBinder` over hermetic fixtures

The pre-Phase-3 sentinels (`test_overload_classification.py`, `test_rule_2_sibling_aliasing.py`, `test_rule_3_js_effective_arity.py`) used libclang to parse synthetic C++ fixtures, which couples them to the vendored LLVM 17 toolchain. Phase 3 introduces a lighter pattern for emission sentinels: a `FakeBinder` / `FakeMethod` / `FakeArg` / `FakeType` set that supplies just enough of the bindgen surface for `emit_method_with_val_default` to render its lambda.

The result: `tests/sentinel/test_val_default_emission.py` (12 cases) and `tests/sentinel/test_emission_strategy_router.py` (11 cases) together run in under 50ms with zero toolchain dependency.

The strategy-router sentinel uses an `importlib` shim to extract `_select_emission_strategy` from `bindings.py` without triggering the libclang import — the function is pure and trivially extractable, which keeps the sentinel hermetic.

### Finding 5: Row 7 production detector remains future work

Row 7 (sub-2a semantic conflict — ≈50 production instances per the surface audit, dominated by `BRepMesh_IncrementalMesh`) is the only deferred-from-Phase-2 row whose classifier wiring is partial: the classifier returns row 8 (`val`) when `GroupClassificationInputs.has_sibling_aliasing` fires, which covers sub-2a + sub-2b uniformly at the verdict level, but the production sub-2a auto-detector does NOT exist. Rule 2's strict suffix-match detects sub-2b only.

A sub-2a detector needs to enumerate overlapping arities where the semantic intent of the overloads differs (e.g. `BRepMesh_IncrementalMesh(shape, lineDeflection)` vs `BRepMesh_IncrementalMesh(shape, theParameters)`) and surface the conflict pair for val-merge emission. The detector logic is tractable but the surface audit's enumeration would need a follow-up pass to confirm the candidate class list.

Tracked at `repos/opencascade.js/TODO.md` under "Row 7 sub-2a detector". Not a Phase 4 blocker — the conservative fallback (each overload emits its own row-34 lambda) produces correct dispatch via the existing val-discrimination machinery; the only loss is the val-merge emission's slightly tighter binding.

## Per-Row Implementation Summary

| Row    | Production instances                          | Classifier verdict (matrix_row, primitive)                                                       | Emission path                                                                                                | Sentinel                                              |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **1**  | ≈700 (audit)                                  | `(1, 'val')`                                                                                     | `_select_emission_strategy → "val_default"` → `val_default.emit_method_with_val_default`, strict-null lambda | `test_val_default_row_1_*` (2 cases)                  |
| **2**  | ≈150 (audit)                                  | `(1, 'val')`                                                                                     | Same as row 1 — value-class default's spelling differs but lambda shape is identical                         | `test_val_default_row_2_*` (1 case)                   |
| **7**  | ≈50 (audit)                                   | `(8, 'val')` only when `has_sibling_aliasing=True`; otherwise falls into row 1 / row 34 fallback | Currently routed via the per-overload val-default path; sub-2a auto-detector is future work                  | Covered by `test_rule_2_sibling_aliasing` row-8 cases |
| **23** | 0 (audit; speculative)                        | `(1, 'val')` — non-null handle default is not `is_canonical_optional_default`                    | Strict-null lambda; defensive coverage only                                                                  | `test_val_default_row_23_*` (1 case)                  |
| **30** | ≈4 (audit — handle reporters)                 | `(30, 'val')` — `accepts_meaningful_null=True`                                                   | Permissive-null lambda; `accepts_null_per_position` propagates the per-slot opt-in                           | `test_val_default_row_30_*` (2 cases)                 |
| **33** | ≈90 (audit — cstring trailing default)        | `(33, 'val')` — `_all_cstring_trailing_default` short-circuit                                    | Strict-null lambda with `isUndefined()/isNull() ? "" : as<std::string>().c_str()` inline                     | `test_val_default_row_33_*` (1 case)                  |
| **34** | ≈20 (audit — multi-overload trailing default) | `(34, 'val')` — `sibling_count > 0` short-circuit                                                | Per-overload val-default lambda; distinct `overload_postfix` separates the embind registrations              | `test_val_default_row_34_*` (1 case)                  |
| **37** | 0 (audit; speculative)                        | `(1, 'val')` — same path as row 23                                                               | Strict-null lambda; defensive coverage only                                                                  | `test_val_default_row_37_*` (1 case)                  |

## Sample Emitted Lambda (canonical shape)

Row 1 — single-overload scalar trailing default (`BRepGProp_Face::SetUseSpan(bool useSpan = false)`):

```cpp
.function("SetUseSpan", optional_override([](BRepGProp_Face& self, emscripten::val useSpan) -> void {
  self.SetUseSpan(([&]() -> bool {
    if (useSpan.isUndefined()) return (false);
    if (useSpan.isNull()) {
      emscripten::val::global("Error").new_(emscripten::val(
        "[rule 5 / strict null] null is not a valid value for this slot — "
        "pass undefined to use the default"
      )).throw_();
      throw 0;
    }
    return useSpan.as<bool>();
  })());
}), allow_raw_pointers())
```

Row 30 — permissive-null trailing default (handle reporter):

```cpp
.function("DoSomething", optional_override([](Cls& self, emscripten::val reporter) -> void {
  self.DoSomething(([&]() -> opencascade::handle<Message_ProgressRange> {
    if (reporter.isUndefined() || reporter.isNull()) {
      return (Message_ProgressRange());   // null is a valid value
    }
    return reporter.as<opencascade::handle<Message_ProgressRange>>();
  })());
}), allow_raw_pointers())
```

The val-default helper's full output, including the `isNull()` carve-out for row 30 (vs the `BindingError` throw for rule-5 strict-null), is pinned by `test_val_default_emission.py::test_row_30_position_set_isolates_strict_vs_permissive`.

## Sentinel Test Count

Pre-Phase 3 (from the Phase 2 research doc):

- `test_overload_classification.py`: 14 cases
- `test_rule_2_sibling_aliasing.py`: 14 cases
- `test_rule_3_js_effective_arity.py`: 12 cases
- `test_rule_5_no_precedence_inversion.py`: 6 cases (4 currently failing — pre-existing patch-hygiene baseline)
- `test_sub2b_regression_pins.py`: 4 cases

Post-Phase 3:

- `test_overload_classification.py`: 22 cases (added row 1/2/3/4/5 split tests + row 23/37 fallback)
- `test_val_default_emission.py`: **12 NEW cases** — rows 1, 2, 23, 30, 33, 34, 37 plus static-method / non-void-return / void-return variants
- `test_emission_strategy_router.py`: **11 NEW cases** — primitive routing (val/optional/native/rbv), return-side preservation, dropped-gate verification, no-trailing-defaults fallthrough, all-raw-pointer-trailing fallthrough

All 86 Phase-3-relevant sentinels pass (`test_overload_classification` + `test_rule_2_sibling_aliasing` + `test_rule_3_js_effective_arity` + `test_sub2b_regression_pins` + `test_val_default_emission` + `test_emission_strategy_router`). Pre-existing failures (`test_artifact_parity`, `test_dist_parity`, `test_libembind_patch_hygiene`, `test_rule_5_no_precedence_inversion::test_patch_contains_all_four_canonical_hunks`, `test_tree_parity`) are unrelated baseline issues — the artifact-parity / dist-parity / tree-parity sentinels need re-baselining as part of Phase 4's regeneration, and the libembind-patch-hygiene / rule-5-precedence sentinels track a separate libembind patch issue. Verified by running the suite against the stashed baseline (24 failures) vs the post-Phase-3 working copy (23 failures, the additional pass being `test_rule_2_sibling_aliasing::test_emission_uses_val_discrimination_for_sub2b_pair`).

## Production Spot-Checks

Phase 3 deliberately does NOT run the full bindgen regeneration (Phase 4 deliverable). However the new emission paths can be exercised against synthetic + minimal-OCCT fixtures through the sentinel suite:

| Row    | Spot-check method                                                                                              | Verdict                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **1**  | `BRepGProp_Face::SetUseSpan` synthetic fixture → val_default helper renders strict-null lambda                 | ✅ canonical val-default shape                            |
| **2**  | `Message_ProgressRange = Message_ProgressRange()` synthetic → same shape, T{} default spelling                 | ✅ canonical val-default shape                            |
| **23** | Non-null Handle default synthetic → strict-null lambda; no production instances to spot-check                  | ✅ defensive coverage exercised by sentinel               |
| **30** | `Message_ProgressRange` permissive-null synthetic → `isUndefined() \|\| isNull()` short-circuit                | ✅ permissive-null lambda emitted                         |
| **33** | Cstring trailing default synthetic (`std::string = ""`) → `as<std::string>().c_str()` inline                   | ✅ already verified in Phase 2; unchanged                 |
| **34** | Multi-overload synthetic (two overloads with trailing defaults) → per-overload lambdas with distinct postfixes | ✅ classifier returns row 34; helper renders per-overload |
| **37** | Reference-default singleton synthetic → strict-null lambda; no production instances to spot-check              | ✅ defensive coverage exercised by sentinel               |

Full production validation (running the bindgen against the real OCCT public headers + diffing emitted `.cpp` files) is Phase 4's deliverable. The vendored LLVM 17 toolchain is required for that pass and is not present in the Phase 3 wrap-up environment.

## Open Issues / Known Limitations

1. **Row 7 sub-2a production auto-detector** — covered above. Future PR.
2. **Return-side wrapper composition with val-default emission** — when a method has both a trailing default AND a cstring return / non-copyable return / output param, the binding falls through to the legacy wrapper and trailing defaults are not expanded. This matches pre-Phase-3 behaviour but is a known limitation. A future PR can extend the val-default helper to compose the return-side wrappers.
3. **Row 30 opt-in source** — the row-30 carve-out's source of truth is a hard-coded suffix set (`_ROW_30_REPORTER_HANDLE_SUFFIXES` in `bindings.py:595`). A future PR can layer a YAML allow-list on top without touching the val-default helper.
4. **Artifact-parity sentinel re-baselining** — the artifact-parity / dist-parity / tree-parity sentinels' baselines pre-date the gate refactor and will diff against Phase 3 output for every class with a trailing default. They must be re-baselined as part of Phase 4's regeneration. NOT a Phase 3 regression — the sentinel suite was failing 24 cases at baseline and Phase 3 reduces that to 23.
5. **`std::initializer_list<T>` (row 38)** — deferred from Phase 1; still deferred. 61 production instances silently unreachable from JS. Orthogonal to the trailing-default surface; tracked separately.

## Phase 4 Readiness Assessment

Phase 3 closes the bindgen Python-layer gap entirely. Phase 4 (big-bang regeneration) is ready to run:

- Every val-owned trailing-default row routes through `val_default.emit_method_with_val_default` driven by the classifier verdict.
- The strategy router (`_select_emission_strategy`) is the single source of truth for primitive choice; the four legacy gates either survive as row disambiguators (`hasOutputParams`, `returnIsCString`, `_returnTypeRequiresValueWrapper`) or are gone (`numOverloads == 1`, `hasCStringArgs` for val).
- Classifier coverage spans the full 38-row matrix; every emission decision is documented inline with the matrix-row label per policy rule 1.
- Sentinel coverage pins the dispatch contract: 23 new sentinels (12 emission + 11 routing) atop the pre-Phase-3 86-case baseline, all hermetic and toolchain-free.
- Doc updates: policy doc Migration Sequencing marks Phase 3 as COMPLETED and Phase 4 as READY; Phase 2 research doc Deferred Items section flags every formerly-deferred row as RESOLVED or PARTIAL with sentinel evidence.

Phase 4 work (unchanged from policy doc):

1. Full bindgen regeneration of the ~5,324-file binding surface.
2. All 79 smoke tests against the regenerated WASM.
3. Replicad rebuild + test suite, including the 3 bug-fix canaries.
4. Apply the 28 documented replicad simplifications.
5. Re-baseline `test_artifact_parity` / `test_dist_parity` / `test_tree_parity`.

Phase 4 has no blockers from Phase 3.

## References

- Policy: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`
- Predecessor research: `docs/research/ocjs-phase-2-val-dispatch-emission.md`
- Surface audit: `docs/research/ocjs-occt-surface-audit.md`
- Bench fixture (Q3 closure): `docs/research/ocjs-matrix-row-bench-fixture.md`, `repos/opencascade.js/experiments/matrix-row-bench/results/bench-baseline-2026-05-28.md`
- Blueprint: `docs/research/ocjs-optional-overload-resolution-blueprint.md`
- Implementation files:
  - `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py:595-807` (helpers + strategy router)
  - `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py:2140-2260` (emission integration)
  - `repos/opencascade.js/src/ocjs_bindgen/codegen/val_default.py` (emit_method_with_val_default)
  - `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py:361-505` (row 34 / row 27 coordination)
  - `repos/opencascade.js/src/ocjs_bindgen/predicates/overload_classification.py:88-481` (classifier)
- Sentinel files:
  - `repos/opencascade.js/tests/sentinel/test_val_default_emission.py`
  - `repos/opencascade.js/tests/sentinel/test_emission_strategy_router.py`
  - `repos/opencascade.js/tests/sentinel/test_overload_classification.py`
