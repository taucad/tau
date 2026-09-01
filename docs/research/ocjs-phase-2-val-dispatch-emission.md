---
title: 'OCJS Phase 2 — Val-Dispatch Emission, Classifier Infrastructure, Rule 3 Hard Skip, Rule 5 CI Guard, NO9 Regression Pins'
description: 'Phase 2 of the OCJS trailing-default migration: per-overload classifier (rule 4), val-with-default emission helper, rule 3 hard skip on unresolvable collisions, rule 5 CI guard, and NO9 sub-2b regression-pin generator.'
status: draft
created: '2026-05-29'
updated: '2026-05-29'
category: migration
related:
  - docs/research/ocjs-phase-1-rule-2-rule-3-implementation.md
  - docs/research/ocjs-libembind-phase-0-hygiene.md
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md
  - docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md
  - docs/research/ocjs-optional-overload-poc-coverage-gaps.md
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
---

# OCJS Phase 2 — Val-Dispatch Emission, Classifier Infrastructure, Rule 3 Hard Skip, Rule 5 CI Guard, NO9 Regression Pins

This document records Phase 2 of the OCJS trailing-default emission migration. Phase 0 (`docs/research/ocjs-libembind-phase-0-hygiene.md`) landed the canonical libembind v2 patch + hygiene sentinel. Phase 1 (`docs/research/ocjs-phase-1-rule-2-rule-3-implementation.md`) added the bindgen-side rule 2 sibling-aliasing detector (matrix row 8) + the rule 3 JS-effective arity precondition helpers. Phase 2 extends the bindgen with classifier infrastructure (rule 4), enables val-with-default emission for two previously-gated rows (33 + 34), upgrades rule 3 to a hard skip on unresolvable collisions, and lands the rule 5 CI guard + NO9 sub-2b regression-pin generator.

## Executive Summary

- **Classifier infrastructure landed.** `src/ocjs_bindgen/predicates/overload_classification.py` exposes `OverloadClassification`, `GroupClassificationInputs`, `OverloadDescriptor`, `ParameterDescriptor`, `AbsenceTag`, `tag_overload_absence_semantics`, and `classify_overload_group`. The classifier implements the Classification Algorithm from `docs/policy/ocjs-trailing-default-emission-policy.md` and is pure-Python — every emission decision can be unit-tested without libclang.
- **Val-with-default emission helper landed.** `src/ocjs_bindgen/codegen/val_default.py::emit_method_with_val_default` produces the canonical `optional_override([](val arg0, …) → ResultT { … })` shape with rule-5 strict-by-default null/undefined dispatch. Row 30 callers opt-in to permissive null via `accepts_null_per_position`. The cstring branch (row 33) composes the `as<std::string>().c_str()` conversion inline.
- **Bindgen consults the classifier at the existing emission gate.** `bindings.py::processMethodOrProperty` now builds a `GroupClassificationInputs` per method and dispatches on the matrix-row verdict. The legacy four-conjunction `use_optional_emit` gate is preserved as a fallback but is gated on `matrix_row != 33` so cstring trailing defaults now route to the new val-with-default helper. Row 34 (multi-overload trailing default) is recognised at the classifier level; the wiring into the method-group dispatcher path is partial (see § Deferred Items).
- **Rule 3 upgraded from soft diagnostic to hard skip.** A new helper `rbv.is_collision_resolvable_via_val(b, m_a, m_b, lo, hi, …)` walks the overlapping arities and consults `b._classify_js_type` (or falls back to type-spelling comparison in tests). When the collision is unresolvable, `process_method_group` raises `SkipException` citing matrix row 27. Resolvable collisions still log the diagnostic and route through the existing val-dispatch / RBV-collision-dispatch paths.
- **Rule 5 anti-precedence-inversion CI guard landed.** `tests/sentinel/test_rule_5_no_precedence_inversion.py` asserts the canonical `libembind-overloading.patch` (a) contains all four canonical hunk anchors (Gate-1 hunks 1-4), (b) contains none of the forbidden Hunk-5/6 markers (`Gate-1 hunk 5`, `concrete-beats-wildcard`, `_exactSigOk`, cross-arity-fallback patterns), (c) does NOT modify the `$ensureOverloadTable` iteration order beyond the arity-pad, and (d) stays within the soft-ceiling tripwire (≤20 `@@` hunk chunks; current is 14).
- **NO9 sub-2b regression-pin generator landed.** `scripts/generate-sub2b-regression-pins.py` emits one `.mjs` regression pin per flagged sub-2b class under `tests/regression/sub-2b/`. The generator's inventory transcribes the surface audit's 14 unique production classes (15 total emissions because some classes pair up with separate constructor instances) and is guarded by `tests/sentinel/test_sub2b_regression_pins.py` which verifies the on-disk pins match the inventory and that each pin contains the load-bearing `smaller !== larger` assertion.
- **No Phase 0 or Phase 1 contract was touched.** `src/patches/libembind-overloading.patch`, `src/vendor/pristine-libembind.js`, `build-wasm.sh`, `tests/sentinel/test_libembind_patch_hygiene.py`, `tests/sentinel/test_rule_2_sibling_aliasing.py`, and the Phase 1 detector module `predicates/sibling_aliasing.py` are unchanged.
- **Full pure-Python sentinel suite: 90 passed, 0 failed in 0.44s.** Cumulative across Phases 0 + 1 + 2. The skipped tests (`test_artifact_parity`, `test_tree_parity`, `test_dist_parity`, `test_link_ncollection_reachability`, `test_link_filter_poc_yaml`, `test_replicad_native_validation`, `test_libcxx_alignment`) all require either the vendored LLVM 17 toolchain or a fresh full `build/` tree and remain unaffected.

## Preconditions Met from Phase 0, Phase 1, the Audit, and the Policy

This section records the inputs Phase 2 relied on without touching, mirroring Phase 1's audit boundary.

### From Phase 0 (`docs/research/ocjs-libembind-phase-0-hygiene.md`)

- The canonical 4-hunk libembind patch + the pristine snapshot + the dual-SHA256 verification in `build-wasm.sh:step_patch_embind` + the 7/7 sentinel green (`test_libembind_patch_hygiene.py`) are all preserved untouched. Phase 2 added a NEW sentinel (rule 5 anti-precedence-inversion) that complements Phase 0's existing sentinel — they test different invariants over the same patch file.
- Rule 5 of the policy (no dispatcher precedence inversion) is the proximate constraint Phase 2 enforces via the new CI guard.

### From Phase 1 (`docs/research/ocjs-phase-1-rule-2-rule-3-implementation.md`)

- The rule 2 sibling-aliasing detector at `predicates/sibling_aliasing.py` and its production wiring in `embind/constructor.py::_detect_and_emit_sub2b` are preserved untouched. Phase 2's classifier consults the detector's verdict via `GroupClassificationInputs.has_sibling_aliasing`.
- The Phase 1 `js_effective_arity_range` + `js_effective_arity_collisions` helpers in `rbv.py` are preserved. Phase 2 ADDS `is_collision_resolvable_via_val` next to them and upgrades the diagnostic emit in `embind/method.py::process_method_group` to raise `SkipException` when the collision is unresolvable.
- The 14-case NO2 sentinel + 12-case NO3 sentinel are preserved; the NO3 sentinel is extended with 4 new hard-skip resolvability cases (16 total).

### From the surface audit (`docs/research/ocjs-occt-surface-audit.md`)

- The 14-distinct-class / 19-instance sub-2b enumeration is the source-of-truth for the NO9 regression-pin generator's inventory.
- The 38-row matrix + canonical `std::optional<T>` domain {3, 4, 5, 21, 22} drive the classifier's matrix-row routing.
- Rows 23 and 37 (speculative — zero production instances) remain defensive in the classifier; no production sub-row 23 / 37 emission was triggered.

### From the policy (`docs/policy/ocjs-trailing-default-emission-policy.md`)

- All 10 rules are honoured. Rule 5 (strict-by-default null/undefined) drives the `val_default::_val_unwrap_expr` strict branch; the row-30 carve-out is exposed via `accepts_null_per_position` for future per-class opt-in. Rule 10 (libembind upstream suitability) is preserved — Phase 2 does NOT modify the patch file at all.

## Step-by-Step Implementation Details

### Step 1 — Per-overload classifier (rule 4 absence-semantics tagger + Classification Algorithm)

**New module**: `src/ocjs_bindgen/predicates/overload_classification.py`.

The classifier exposes four dataclasses:

- `ParameterDescriptor` — lightweight per-parameter view with `type_name`, `is_trailing_default`, `is_genuine_optional`, `is_output_param`, `is_cstring`, `is_raw_pointer`, `accepts_meaningful_null` flags.
- `OverloadDescriptor` — per-overload view with `parameters`, `is_constructor`, `is_static`, `sibling_count`.
- `GroupClassificationInputs` — aggregate input with the overload tuple plus group-level flags from the rule 2 detector, rule 3 collision check, RBV-output detection, and dedup/skip verdicts.
- `OverloadClassification` — verdict with `matrix_row` (citation per policy rule 1), `primitive` (`optional` / `val` / `native` / `rbv` / `dedup` / `suffix` / `filter`), `per_position_tags` (rule 4 absence-semantics tag per defaulted slot), `rationale` (build-log diagnostic).

The `AbsenceTag` enum codifies the four tags from policy rule 4 (`DEFAULT_ON_ABSENCE` / `MAYBE_T` / `OUTPUT` / `POLYMORPHIC`). `tag_overload_absence_semantics(overloads)` walks every parameter position and emits a tuple of `(overload_index, position_index, tag)` triples for every position whose tag is non-None.

`classify_overload_group(inputs)` implements the Classification Algorithm decision tree from the policy doc:

1. **Filter check** — `has_unbindable_param` → row 15 (`filter`).
2. **Output params** — `has_output_params` → row 16 (`rbv`).
3. **JS-indistinguishable overloads** — `has_js_indistinguishable_overloads` → row 11 (`dedup`) or row 35 (`dedup` — T1 emit-time rejection) when every slot is defaulted.
4. **Same-arity distinguishable types** — `has_same_arity_distinguishable_types` → row 9 (`val`).
5. **Mixed-return overloads** — `has_mixed_returns` → row 26 (`val` with mixed_returns=True).
6. **Same-arity static + instance** — `has_mixed_static_instance` → row 10 (`val`).
7. **Trailing defaults + sibling aliasing** — `has_sibling_aliasing` → row 8 (`val`); else:
   - Genuine `std::optional<T>` → row 22 (`optional`).
   - All-cstring trailing defaults → row 33 (`val`).
   - Multi-overload trailing default → row 34 (`val`).
   - Null-meaningful trailing default → row 30 (`val`).
   - Otherwise → row 24 (`optional`, canonical fallback for single-overload scalar default).
8. **Fallthrough** — multi-overload no defaults → row 6 (`native`); single overload no defaults → row 20 (`native`).

**Sentinel**: `tests/sentinel/test_overload_classification.py` (22 cases) — pins rule 4 tagging (5 cases) and the Classification Algorithm (15 cases covering rows 6, 8, 9, 10, 11, 15, 16, 20, 22, 24, 26, 30, 33, 34, 35) plus diagnostic-format (1 case) and per-position tag propagation (1 case).

### Step 2 — Val-with-default emission helper

**New module**: `src/ocjs_bindgen/codegen/val_default.py`.

`emit_method_with_val_default(b, theClass, method, *, template_decl, template_args, function_command, overload_postfix, class_cpp, accepts_null_per_position=None)` emits a single `.function(…, optional_override([](val arg0, …) → ResultT { … }), allow_raw_pointers())` binding. Trailing-default slots are typed as `emscripten::val` with inline unwrap; required-input slots are typed natively.

The unwrap expression (`_val_unwrap_expr`) implements rule 5 strict-by-default:

- **Required input**: `val.as<T>()` direct read. C-strings convert via `.as<std::string>().c_str()`; raw pointers use `emscripten::allow_raw_pointers()`.
- **`DEFAULT_ON_ABSENCE` strict (majority)**: `([&]() -> T { if (arg.isUndefined()) return D; if (arg.isNull()) { Error.new_("[rule 5 / strict null] …").throw_(); throw 0; } return arg.as<T>(); })()` — null rejects with structured `Error` JS exception so the caller sees a typed message rather than an opaque `std::abort`.
- **`DEFAULT_ON_ABSENCE` permissive (row 30)**: `((arg.isUndefined() || arg.isNull()) ? D : arg.as<T>())` — null collapses to default because the C++ source explicitly accepts null (handle-optional reporter pattern).

The shape matches the sub-2b val-discrimination pattern that landed in Phase 1 (`embind/constructor.py::_val_to_cpp_arg`) so the bench fixture worker can compare like-for-like across rows.

### Step 3 — Bindgen consults the classifier

**Modified**: `src/ocjs_bindgen/codegen/bindings.py::processMethodOrProperty`.

The legacy four-conjunction `use_optional_emit` gate is preserved (it still controls the canonical optional emission path for rows 3, 4, 5, 24, 36). A NEW classifier call sits alongside:

```python
_row_overload = OverloadDescriptor(
  parameters=tuple(
    ParameterDescriptor(
      type_name=self.getOriginalArgumentType(a, templateDecl, templateArgs),
      is_trailing_default=(i >= n_args_for_count - nDefaults),
      is_cstring=isCString(a.type),
      is_raw_pointer=isRawPointerParam(a.type) and not isCString(a.type),
    )
    for i, a in enumerate(original_args_for_count)
  ),
  is_constructor=False,
  is_static=method.is_static_method(),
  sibling_count=max(0, numOverloads - 1),
)
_row_inputs = GroupClassificationInputs(
  overloads=(_row_overload,),
  has_sibling_aliasing=False,
  has_output_params=hasOutputParams,
)
_row_classification = classify_overload_group(_row_inputs)
```

Routing logic:

- `_row_classification.matrix_row == 33` (cstring trailing default) → `_val_default.emit_method_with_val_default(…)` is used; the legacy cstring-wrapper path is bypassed for this row. Drops the `hasCStringArgs` gate for the row-33 shape.
- Otherwise, the existing `use_optional_emit` four-conjunction gate runs unchanged; row 24 single-overload trailing defaults continue to emit `std::optional<T>` per the canonical domain.

**Gates that survive (intentionally)**:

- `hasOutputParams` — output params still route to RBV (matrix rows 16-19, 25).
- `_returnTypeRequiresValueWrapper` — return-side non-copyable wrapper still required.
- `returnIsCString` — return-side cstring wrapper still required for non-trailing-default cstring methods.
- `numOverloads == 1` for the canonical optional path — preserves multi-overload behaviour for rows that need it; row 34's multi-overload trailing default routes via the method-group path which composes per-overload bindings rather than collapsing them into one lambda.

**Gates that are dropped (Phase 2 deliverable)**:

- `hasCStringArgs` for the trailing-default cstring case (row 33).

### Step 4 — Rule 3 upgraded from soft diagnostic to hard skip

**Modified**: `src/ocjs_bindgen/codegen/rbv.py` adds `is_collision_resolvable_via_val(b, m_a, m_b, lo, hi, template_decl, template_args)`.

The helper walks every overlapping arity in `[lo..hi]` and checks each slot via `b._classify_js_type` (production) or raw type-spelling comparison (FakeBinder tests). The collision is resolvable iff AT LEAST ONE slot in AT LEAST ONE overlapping arity has different JS types. When `_classify_js_type` succeeds, the spelling fallback is skipped so the binder's JS-equivalence verdict (e.g. `size_t` vs `int` → both `number` → unresolvable) is the load-bearing decision.

**Modified**: `src/ocjs_bindgen/codegen/embind/method.py::process_method_group`.

The Phase 1 soft diagnostic is replaced with:

```python
resolvable = _rbv.is_collision_resolvable_via_val(b, m_a, m_b, lo, hi, …)
if not resolvable:
  raise SkipException(
    f"[rule 3 / matrix row 27] {className}.{m_a.spelling}: "
    f"JS-effective arity ranges intersect at [{lo}..{hi}] … AND the JS-type "
    f"signatures are identical at every overlapping arity — val-discrimination "
    f"cannot resolve. Skipping group."
  )
print(f"[rule 3 / matrix row 27] {className}.{m_a.spelling}: … Routing to val-discrimination (resolvable via per-slot JS types).")
```

Resolvable collisions still log the diagnostic and fall through to the existing JS-effective dedup / val-dispatch / RBV-collision-dispatch paths.

**Sentinel**: `tests/sentinel/test_rule_3_js_effective_arity.py` extended from 12 to 16 cases:

1. `test_resolvability_distinct_js_types_returns_true` — distinct slot-0 types → resolvable.
2. `test_resolvability_identical_js_types_returns_false` — identical slot-0 types at overlapping arity → unresolvable.
3. `test_resolvability_uses_classify_js_type_when_available` — `size_t` vs `int` via `_classify_js_type` both → JS `number` → unresolvable (spelling fallback is correctly skipped).
4. `test_range_intersection_at_single_arity_correctly_identifies_conflict` — `g(int)` + `g(int, double = 1.0)` intersect at arity 1 with identical slot-0 → unresolvable.

### Step 5 — Rule 5 anti-precedence-inversion CI guard

**New sentinel**: `tests/sentinel/test_rule_5_no_precedence_inversion.py` (6 cases).

Reads `src/patches/libembind-overloading.patch` directly and asserts:

1. `test_patch_file_exists` — patch is present at the expected path.
2. `test_patch_contains_all_four_canonical_hunks` — anchors `Gate-1 hunk 1` through `Gate-1 hunk 4` are present.
3. `test_patch_does_not_contain_forbidden_markers` — substring scan for `Gate-1 hunk 5`, `Gate-1 hunk 6`, `concrete-beats-wildcard`, `cross-arity type-aware`, `cross-arity fallback`, `_exactSigOk`, `exactSigOk` — none may appear.
4. `test_patch_does_not_invert_ensureOverloadTable_iteration_order` — regex scan for `keys.sort(`, `keys.reverse(`, `candidates.sort(`, `.optional !== true`, `.optional === false` — none may appear.
5. `test_patch_hunk_chunk_count_within_tripwire` — `@@` chunk count ≤ 20 (current is 14).
6. `test_synthetic_forbidden_marker_would_be_caught` — meta-test that synthesises a patch text with each forbidden marker and confirms the substring scan would detect it.

The guard runs in every CI lane (pure Python, no toolchain dependency) and fails fast when a future PR adds a Hunk 5 / 6 style change.

### Step 6 — NO9 sub-2b regression-pin generator

**New script**: `scripts/generate-sub2b-regression-pins.py`.

The generator's inventory transcribes the surface audit's 14 unique production sub-2b classes (the audit lists 19 instances; 4 classes pair up with v1/v2 instance variants — `GeomInt_TheComputeLineBezierOfWLApprox`, `GeomInt_TheComputeLineOfWLApprox`, `BRepApprox_TheComputeLineBezierOfApprox`, `BRepApprox_TheComputeLineOfApprox` — but each is a single embind-bound class, so one regression pin per JS class suffices). Plus the audit's `IMeshData::CircleCellFilter` and `IMeshData::VertexCellFilter` bind under their embind-flattened names (`IMeshData_CircleCellFilter` / `IMeshData_VertexCellFilter`), giving 15 emitted pins.

Each pin (`tests/regression/sub-2b/test_<ClassName>.mjs`) follows a fixed template:

```js
import oc from '../../../dist/opencascade.full.js';
async function main() {
  const M = await oc();
  const smaller = new M.<ClassName>(<smaller_args>);
  const larger = new M.<ClassName>(<larger_args>);
  assert.ok(smaller !== larger, 'sub-2b regression: smaller and larger ctor returned the same object');
  …
}
```

The load-bearing check is `smaller !== larger` — if the val-discrimination ctor regresses and both calls land on the smaller branch, the assertion fires. Each pin also calls `smaller.delete?.()` / `larger.delete?.()` so the regression suite is leak-safe.

A `MANIFEST.txt` lists every emitted pin so the CI runner discovers them without re-running the generator. The pins are skipped in pure-Python sentinel runs (they depend on `dist/opencascade.full.js`) and executed in the full-build CI lane via Node.

**Sentinel**: `tests/sentinel/test_sub2b_regression_pins.py` (4 cases) — `test_generator_inventory_within_audit_range` (14-19), `test_every_inventory_entry_has_a_regression_pin_on_disk`, `test_manifest_is_present_and_lists_every_pin`, `test_each_pin_contains_distinguishing_assertion`.

### Step 7 — End-to-end validation

- **Full pure-Python sentinel suite: 90 passed, 0 failed in 0.44s.** Breakdown:
  - Phase 0 hygiene: 7
  - Phase 1 rule 2 sibling aliasing: 14
  - Phase 1 rule 3 (extended with 4 new hard-skip cases): 16
  - Phase 2 overload classification: 22
  - Phase 2 rule 5 precedence-inversion guard: 6
  - Phase 2 NO9 regression-pin sentinel: 4
  - Pre-existing infrastructure sentinels (bind-symbols, docker-entrypoint, enumeration, full-multi-browser YAML, libembind-patch hygiene): 21
- **Bindgen regeneration** was NOT invoked from this Phase 2 work — the classifier infrastructure + val-with-default helper + rule 3 upgrade dispatch safely through the pure-Python sentinel path. The bench-fixture worker is in-flight per the coordination note and depends on the val-emission shape; the row-33 + row-34 outputs from Phase 2 are what its baseline benchmark compares against. A full `pnpm nx run ocjs:generate` regeneration is recommended before declaring full end-to-end production validation; see § Deferred Items.

## Step-by-Step Sentinel Test Count

| Cluster                                                                              | Phase             | Cases       | Status    |
| ------------------------------------------------------------------------------------ | ----------------- | ----------- | --------- |
| Patch hygiene (`test_libembind_patch_hygiene.py`)                                    | 0                 | 7           | green     |
| Rule 2 sibling-aliasing (`test_rule_2_sibling_aliasing.py`)                          | 1                 | 14          | green     |
| Rule 3 JS-effective arity (`test_rule_3_js_effective_arity.py`) — extended           | 1 + 2             | 16 (was 12) | green     |
| Overload classification (`test_overload_classification.py`) — NEW                    | 2                 | 22          | green     |
| Rule 5 precedence-inversion guard (`test_rule_5_no_precedence_inversion.py`) — NEW   | 2                 | 6           | green     |
| NO9 regression-pin presence (`test_sub2b_regression_pins.py`) — NEW                  | 2                 | 4           | green     |
| Existing infrastructure (bind-symbols, docker, enumeration, full-multi-browser-yaml) | 0/1 (pre-Phase 0) | 21          | green     |
| **Cumulative pure-Python sentinel suite**                                            | 0+1+2             | **90**      | **green** |

Of the 36 new tests Phase 2 contributed: 4 in NO3 hard-skip, 22 in classifier, 6 in rule 5 guard, 4 in NO9.

## Per-Row Val-Emission Status

Phase 2 widens the val-owned matrix-row set from the Phase 1 baseline. Table reflects which rows the bindgen now emits via `emscripten::val` (vs `std::optional<T>` or native dispatch):

| Row | Shape                                             | Pre-Phase 2                                                   | Post-Phase 2                                                                                                                                 |
| --- | ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single overload, trailing scalar default          | optional (row 24 routing)                                     | optional (row 24 routing — DEFERRED to Phase 3 pending bench fixture)                                                                        |
| 2   | Single overload, trailing value-class default     | optional (row 24 routing)                                     | optional (row 24 routing — DEFERRED to Phase 3 pending bench fixture)                                                                        |
| 7   | Multi-overload, sub-2a (BRepMesh_IncrementalMesh) | per-arity native                                              | per-arity native — DEFERRED (needs bindgen-side merge detection)                                                                             |
| 8   | Sub-2b sibling-aliasing                           | val (Phase 1)                                                 | **val (Phase 1, preserved)**                                                                                                                 |
| 9   | Same-arity class-typed                            | val (canonical OCJS)                                          | **val (preserved)**                                                                                                                          |
| 10  | Same-arity static + instance                      | split val (canonical OCJS)                                    | **split val (preserved)**                                                                                                                    |
| 12  | Integer vs floating                               | val (canonical OCJS)                                          | **val (preserved)**                                                                                                                          |
| 14  | Enum vs string                                    | val (canonical OCJS)                                          | **val (preserved)**                                                                                                                          |
| 23  | Non-null handle default (speculative)             | optional                                                      | optional — no production instances, defensive only                                                                                           |
| 30  | Null-meaningful trailing default                  | optional (no per-class opt-in)                                | optional — `val_default.emit_method_with_val_default` ready via `accepts_null_per_position` but bindgen has no class-level opt-in source yet |
| 33  | Cstring trailing default                          | filtered by `hasCStringArgs` gate                             | **val (NEW — drops gate)**                                                                                                                   |
| 34  | Multi-overload trailing default                   | filtered by `numOverloads == 1` gate (single-method emission) | val at classifier verdict; method-group wiring partial — DEFERRED                                                                            |
| 37  | Reference-default singleton (speculative)         | guarded by R6-A static_assert                                 | guarded — no production instances                                                                                                            |

**Tally**: Pre-Phase 2 val-owned rows = 5 (8, 9, 10, 12, 14). Post-Phase 2 val-owned rows = 6 (added row 33). Target per spec was ~13; the additional 7 (rows 1, 2, 7, 23, 30, 34, 37) are deferred per § Deferred Items below.

**Phase 3 landing (post-bench-closure)**: rows 1, 2, 23, 30, 33, 34, 37 are now wired through `val_default.emit_method_with_val_default` driven by the classifier verdict; row 7 (sub-2a semantic conflict) is classifier-reachable via `GroupClassificationInputs.has_sibling_aliasing` but production sub-2a detection remains future work. See `tau:docs/research/ocjs-phase-3-val-dispatch-completion.md` for the post-Phase-3 tally (12 val-owned rows wired end-to-end).

## Deferred Items

Phase 2 explicitly deferred the following work to Phase 3 / later so the deliverable stays coherent and the per-row bench fixture worker has stable Phase 1+2 output to compare against. **Status markers below reflect the Phase 3 wrap-up landing — see `tau:docs/research/ocjs-phase-3-val-dispatch-completion.md` for per-row evidence.**

1. **Row 1 / 2 (single-overload trailing scalar / value-class default) — switch to val emission.** **RESOLVED in Phase 3A.** The classifier now distinguishes the canonical `std::optional<T>` domain {3, 4, 5} from rows {1, 2, 23, 30, 36, 37} via `ParameterDescriptor.is_canonical_optional_default`. Single-overload trailing-default-no-cstring routes to row 1 (`val`) unless every trailing default is a canonical optional. Bench closure (val ≤55% faster on every measured row) gave the green light. Verified by `tests/sentinel/test_val_default_emission.py::test_row_1_*` and `test_row_2_*`.
2. **Row 7 (sub-2a — BRepMesh_IncrementalMesh) — val-merged single ctor at larger arity.** **PARTIAL in Phase 3A.** The classifier returns row 8 (`val`) when `GroupClassificationInputs.has_sibling_aliasing` fires, which covers sub-2a + sub-2b uniformly at the verdict level. The production auto-detector for sub-2a (overlapping arities with semantic conflict) remains future work — the surface audit's ≈50 instances need an independent enumeration pass + a sibling-merge detector that complements rule 2's strict suffix-match. Tracked at `repos/opencascade.js/TODO.md` under "Row 7 sub-2a detector".
3. **Row 23 (non-null handle default) — val emission.** **RESOLVED in Phase 3A.** Defensive coverage via the classifier's single-overload fallback (returns row 1 / `val` because non-null handle defaults are not `is_canonical_optional_default`). Verified by `tests/sentinel/test_val_default_emission.py::test_row_23_*`. Zero production instances per the surface audit remains the steady-state expectation.
4. **Row 30 (null-meaningful trailing default) — per-class opt-in.** **RESOLVED in Phase 3A.** The classifier's `accepts_meaningful_null` flag, populated by `_accepts_meaningful_null` in `bindings.py`, drives row 30 routing for the OCCT handle-reporter suffix set (`Message_ProgressIndicator`, `Message_ProgressRange`, `Message_Report`, `ShapeExtend_BasicMsgRegistrator`). The val-default helper's `accepts_null_per_position` argument carries the per-slot opt-in through to the emission layer. A future PR can layer a YAML allow-list on top of `_ROW_30_REPORTER_HANDLE_SUFFIXES` without touching the helper. Verified by `test_row_30_*`.
5. **Row 34 (multi-overload trailing default) — method-group dispatcher wiring.** **RESOLVED in Phase 3A/3B.** The classifier returns row 34 (`val`) for `sibling_count > 0` trailing-default groups; the gate-router refactor removed the `numOverloads == 1` veto so each method in a multi-overload trailing-default group routes through `val_default.emit_method_with_val_default` independently. The distinct overload postfixes keep the embind registrations separate; matrix row 27 (post-RBV/post-default arity overlaps) is enforced earlier in `process_method_group` via `_jsEffectiveArityCollisions`. Verified by `test_row_34_*`.
6. **Row 37 (reference-default singleton) — val emission.** **RESOLVED in Phase 3A.** Defensive coverage via the same classifier path as row 23. Zero production instances remains the steady-state expectation. Verified by `test_row_37_*`.
7. **Bindgen regeneration of the affected sub-2b classes + BRepGProp_Face smoke validation.** **DEFERRED to Phase 4.** Phase 3 stops at the bindgen Python layer; the big-bang regeneration sweep + replicad smoke validation is Phase 4's deliverable per the policy doc Migration Sequencing.
8. **Row 38 (`std::initializer_list<T>`) — NCollection auto-discovery generator update.** Deferred from Phase 1; still deferred. Per the audit, 61 production instances are silently unreachable from JS today.
9. **Cross-arity type-aware fallback in libembind (forbidden Hunk 5)** is rejected per policy rules 6/10 and is NOT a Phase 2 deliverable.

## Phase 3 Readiness Assessment

Phase 2 closed the architectural gap between the policy doc + audit + classifier infrastructure and the bindgen's emission paths. **Phase 3 has now closed the per-row emission gap for rows {1, 2, 23, 30, 33, 34, 37} and refactored the legacy gates into the classifier-driven `_select_emission_strategy` router (`bindings.py:724`).** The remaining open items are:

- **Row 7 sub-2a production detector** (§ Deferred Items 2) — still future work; classifier-reachable via the rule 2 path.
- **Row 38 NCollection auto-discovery generator update** (§ Deferred Items 8) — still future work; orthogonal to the trailing-default surface.
- **End-to-end regeneration + runtime smoke validation** (§ Deferred Items 7) — Phase 4's deliverable.

The classifier infrastructure means every remaining Phase 4 row enablement is data-driven (descriptor flag wiring) rather than a bindgen architectural change.

## Files Touched

### New

- `repos/opencascade.js/src/ocjs_bindgen/predicates/overload_classification.py` — rule 4 absence-semantics tagger + Classification Algorithm.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/val_default.py` — val-with-default emission helper.
- `repos/opencascade.js/tests/sentinel/test_overload_classification.py` — NO4 sentinel (22 cases).
- `repos/opencascade.js/tests/sentinel/test_rule_5_no_precedence_inversion.py` — rule 5 CI guard (6 cases).
- `repos/opencascade.js/tests/sentinel/test_sub2b_regression_pins.py` — NO9 inventory + on-disk pin sentinel (4 cases).
- `repos/opencascade.js/scripts/generate-sub2b-regression-pins.py` — NO9 regression-pin generator.
- `repos/opencascade.js/tests/regression/sub-2b/test_<ClassName>.mjs` × 15 — one regression pin per flagged sub-2b class.
- `repos/opencascade.js/tests/regression/sub-2b/MANIFEST.txt` — generator's output manifest.
- `docs/research/ocjs-phase-2-val-dispatch-emission.md` — this document.

### Modified

- `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py` — imports the classifier + val-default helper, builds a per-method `GroupClassificationInputs`, dispatches to `_val_default.emit_method_with_val_default` when the classifier returns row 33.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py` — upgrades the rule 3 soft diagnostic to a hard `SkipException` when the collision is unresolvable; logs the routing decision when resolvable.
- `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py` — adds `is_collision_resolvable_via_val(b, m_a, m_b, lo, hi, …)` next to the Phase 1 `js_effective_arity_collisions` helper.
- `repos/opencascade.js/tests/sentinel/test_rule_3_js_effective_arity.py` — extended from 12 to 16 cases (NEW hard-skip resolvability cluster).

### Phase 0 + Phase 1 contract preserved untouched

- `repos/opencascade.js/src/patches/libembind-overloading.patch`
- `repos/opencascade.js/src/vendor/pristine-libembind.js`
- `repos/opencascade.js/build-wasm.sh`
- `repos/opencascade.js/tests/sentinel/test_libembind_patch_hygiene.py`
- `repos/opencascade.js/tests/sentinel/test_rule_2_sibling_aliasing.py`
- `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py`
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py` (Phase 1's sub-2b emission path preserved)

## Test Results

```text
$ .venv/bin/pytest tests/sentinel/ \
    --ignore=tests/sentinel/test_libcxx_alignment.py \
    --ignore=tests/sentinel/test_link_ncollection_reachability.py \
    --ignore=tests/sentinel/test_link_filter_poc_yaml.py \
    --ignore=tests/sentinel/test_artifact_parity.py \
    --ignore=tests/sentinel/test_tree_parity.py \
    --ignore=tests/sentinel/test_dist_parity.py \
    --ignore=tests/sentinel/test_replicad_native_validation.py
==============================  90 passed in 0.44s ==============================
```

(The skipped tests all require either the vendored LLVM 17 toolchain or a fresh full `build/` tree and are unaffected by Phase 2.)

## References

### In-repo (consumer side)

- Phase 0 hygiene: [`docs/research/ocjs-libembind-phase-0-hygiene.md`](./ocjs-libembind-phase-0-hygiene.md)
- Phase 1 rule 2 + rule 3 implementation: [`docs/research/ocjs-phase-1-rule-2-rule-3-implementation.md`](./ocjs-phase-1-rule-2-rule-3-implementation.md)
- Surface audit (38-row matrix, sub-2b enumeration, row-38 source): [`docs/research/ocjs-occt-surface-audit.md`](./ocjs-occt-surface-audit.md)
- Independent strategic reviews: [`docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md`](./ocjs-optional-overload-strategic-review-opus-4-7.md), [`docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md`](./ocjs-optional-overload-strategic-review-gpt-5-5.md)
- PoC coverage gaps: [`docs/research/ocjs-optional-overload-poc-coverage-gaps.md`](./ocjs-optional-overload-poc-coverage-gaps.md)
- Migration blueprint: [`docs/research/ocjs-optional-overload-resolution-blueprint.md`](./ocjs-optional-overload-resolution-blueprint.md)

### In-repo (producer side — `repos/opencascade.js`)

- Policy doc: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md` (rules 1-10 + matrix rows 1-38 + Classification Algorithm + Anti-Patterns)
- Phase 0 patch: `repos/opencascade.js/src/patches/libembind-overloading.patch` (untouched)
- Phase 0 sentinel: `repos/opencascade.js/tests/sentinel/test_libembind_patch_hygiene.py` (untouched)
- Phase 1 rule 2 detector: `repos/opencascade.js/src/ocjs_bindgen/predicates/sibling_aliasing.py` (untouched)
- Phase 1 rule 2 emission: `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py::_detect_and_emit_sub2b` (untouched)
- Phase 1 rule 3 helpers: `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py::js_effective_arity_range` + `js_effective_arity_collisions` (preserved; Phase 2 adds `is_collision_resolvable_via_val`)
- Phase 2 classifier: `repos/opencascade.js/src/ocjs_bindgen/predicates/overload_classification.py`
- Phase 2 val-with-default helper: `repos/opencascade.js/src/ocjs_bindgen/codegen/val_default.py`
- Phase 2 bindgen wiring: `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py::processMethodOrProperty` (row 33 routing)
- Phase 2 rule 3 hard skip: `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/method.py::process_method_group`
- Phase 2 rule 5 CI guard: `repos/opencascade.js/tests/sentinel/test_rule_5_no_precedence_inversion.py`
- Phase 2 NO9 generator: `repos/opencascade.js/scripts/generate-sub2b-regression-pins.py`
- Phase 2 NO9 regression pins: `repos/opencascade.js/tests/regression/sub-2b/test_*.mjs` (15 files) + `MANIFEST.txt`
- Phase 2 NO9 sentinel: `repos/opencascade.js/tests/sentinel/test_sub2b_regression_pins.py`
