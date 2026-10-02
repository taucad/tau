---
title: 'OCJS Skipped Smoke-Test Reactivation (Phase 4)'
description: 'Reactivation verdicts for the two activation-gated OCJS smoke tests (class-value default recovery; mixed fan-out + std::optional dispatch) against the Phase-4 dist artefacts, including a discovered register_optional<enum> emission gap.'
status: active
created: '2026-05-29'
updated: '2026-05-29'
category: investigation
related:
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-phase-4-build-outcome.md
  - docs/research/ocjs-phase-4-smoke-readiness.md
---

# OCJS Skipped Smoke-Test Reactivation (Phase 4)

Reactivation attempt for the two activation-gated OCJS smoke tests that became newly viable once Phase 4's big-bang regeneration brought genuine `std::optional<T>` emission live in production, validated test-only against the already-built single-threaded `dist/opencascade_full.{js,wasm,d.ts}` (no WASM rebuild).

## Executive Summary

- **Candidate 2 — `CLASS_VALUE_DEFAULT_AVAILABLE` (`smoke-optional-value-defaults.test.ts`): ACTIVATED.** Concrete target `Message_Attribute(const TCollection_AsciiString& theName = TCollection_AsciiString::EmptyString())` — a class-value trailing default emitted via val_default at a non-RBV-blocked ctor site whose recovered default is JS-observable through `GetMessageKey()` (`""`) / `GetName().IsEmpty()` (`true`). The real body passes: omitted → empty default, supplied name → name read back, explicit `null` → rule-5 `BindingError`.
- **Candidate 1 — `MIXED_DISPATCH_AVAILABLE` (`smoke-mixed-fanout-optional.test.ts`): KEPT CLOSED.** The flagship genuine-`std::optional<T>` parameter target (`BRepGraph_ParentExplorer` / `BRepGraph_ChildExplorer`, surface-audit row 22) is **runtime-broken**: `register_optional<BRepGraph_NodeId::Kind>` is never emitted, so the full-arity genuine-optional ctors throw `Cannot construct … due to unbound types: std::optional<BRepGraph_NodeId::Kind>`. No other production class pairs a _working_ `register_optional`-emitted method with an independent fan-out (val_default) sibling on a cleanly constructible class. Per the no-fabrication rule the gate stays closed; the emission gap is the unblock condition.

## Problem Statement

Two smoke tests carried activation gates premised on a pre-Phase-4 world ("no `std::optional`-wrapped lambdas exist in any production binding"). Phase 4 inverted that premise. The task: find a concrete OCCT class/method satisfying each gate's exact shape, flip the flag, and write a real behavioral body — or, if no concrete instance qualifies after a genuine search, keep the gate closed and document why.

## Methodology

- Read the two gated test files, the emission policy (`repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`), and the surface audit (`docs/research/ocjs-occt-surface-audit.md`).
- Hunted the generated bindings (`repos/opencascade.js/build/bindings/**/*.cpp`) and `dist/opencascade_full.d.ts` for the exact emission shapes.
- Enumerated every val_default class-value default expression and every `register_optional<T>` registration via ripgrep over the 5,324 binding files.
- Validated all runtime hypotheses by executing scratch smoke probes against the built `dist/` (`pnpm exec vitest run`), then encoded the confirmed behavior as the real test bodies.

## Findings

### Finding 1: `register_optional` ships for only 5 type families — `BRepGraph_NodeId::Kind` is NOT among them

Enumerating every `register_optional<T>` in the Phase-4 binding surface:

| `T` registered                           | Count |
| ---------------------------------------- | ----- |
| `bool`                                   | 203   |
| `occ::handle<NCollection_BaseAllocator>` | 102   |
| `occ::handle<IntTools_Context>`          | 2     |
| `int`                                    | 1     |
| `TDF_HAllocator`                         | 1     |

There is **no** `register_optional<BRepGraph_NodeId::Kind>` (nor any other enum). Yet `BRepGraph_ParentExplorer` / `BRepGraph_ChildExplorer` emit genuine `std::optional<BRepGraph_NodeId::Kind>` ctor parameters (`theAvoidKind`) plus `value_object` `Config` fields of the same type. The supporting wire registration is missing.

### Finding 2: the row-22 flagship ctors throw "unbound types" at runtime

Arity-by-arity probe of `new oc.BRepGraph_ParentExplorer(graph, node, …)` (box-graph root node):

| Call shape                                                                    | Result                                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `(graph, node)` (arity-2 native)                                              | OK                                                               |
| `(graph, node, Mode)` / `(graph, node, Kind)` (arity-3 val-discrimination)    | OK                                                               |
| `(graph, node, undefined, false)` (arity-4, theMode truncated)                | OK                                                               |
| `(graph, node, Kind, true)` (arity-4)                                         | OK                                                               |
| `(graph, node, undefined, false, Mode)` (arity-5 full genuine-optional)       | **THROW** `unbound types: std::optional<BRepGraph_NodeId::Kind>` |
| `(graph, node, Kind, undefined, false, Mode)` (arity-6 full genuine-optional) | **THROW** (same)                                                 |
| `explorer.GetConfig()`                                                        | **THROW** (same — `Config` carries `std::optional<Kind>` fields) |

The 4-arg truncated form constructs only because libembind's arity-pad routes it away from the unbound full-arity optional invoker. This is why `smoke-genuine-optional-param.test.ts` passes today: its assertions are non-throw / `toBeDefined()` on the 4-arg form, which masks the gap (it never exercises the full-arity ctor nor reads `GetConfig()`).

### Finding 3: the val_default class-value defaults that DID ship, and which are observable

Class-value (non-scalar, non-enum) defaults emitted via the val_default `isUndefined() return (<default>)` lambda:

| Default expression                       | Count | Observable recovery?                                                                |
| ---------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `Message_ProgressRange()`                | 162   | No (progress range has no inspectable default state useful for a smoke)             |
| `StepData_Factors()`                     | 92    | Weak (STEP unit factors; no simple identity predicate)                              |
| `XCAFPrs_Style()`                        | 8     | Possible (style flags) but only on iterator/explorer methods that need richer setup |
| `TCollection_AsciiString::EmptyString()` | 5     | **Yes** — empty-string is directly observable via a getter                          |

The `TopLoc_Location()` / `gp_Trsf()` / `gp_Pnt()` defaults suggested as ideal candidates do **not** appear in the val_default surface (no production method defaults a class value to those at a val_default site).

### Finding 4: `Message_Attribute` is a clean, observable class-value-default target (Candidate 2)

`Message_Attribute(const TCollection_AsciiString& theName = TCollection_AsciiString::EmptyString())`:

- d.ts: `constructor(theName?: TCollection_AsciiString)` (`dist/opencascade_full.d.ts:963-988`).
- Binding emits the val_default lambda with the rule-5 strict-null branch (`build/bindings/FoundationClasses/TKernel/Message/Message_Attribute.hxx/Message_Attribute.cpp`).
- `GetMessageKey()` (`Message_Attribute.cxx:29-32`) returns `!myName.IsEmpty() ? myName.ToCString() : ""`, and `GetName()` returns `myName` — both make the recovered default observable.
- Non-RBV-blocked: `theName` is a ctor input, no output param / RBV elision.

Confirmed runtime behavior (encoded in the activated test):

| Call                                                                        | Observed                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `new oc.Message_Attribute()`                                                | `GetMessageKey() === ''`, `GetName().IsEmpty() === true`    |
| `new oc.Message_Attribute(undefined)`                                       | `GetMessageKey() === ''`                                    |
| `new oc.Message_Attribute(new oc.TCollection_AsciiString('hatch-pattern'))` | `GetMessageKey() === 'hatch-pattern'`                       |
| `new oc.Message_Attribute(null)`                                            | throws `[rule 5 / strict null] null is not a valid value …` |

The supplied-name case proves the `isUndefined() → EmptyString()` branch is genuinely distinct from the explicit `arg.as<const TCollection_AsciiString&>()` branch (default-recovery is not a spurious always-empty result).

### Finding 5: no working genuine-optional + fan-out pair exists for Candidate 1

The gate needs one class carrying BOTH a fan-out (val_default / arity-pad) emission AND a `std::optional`-emitted method/ctor that dispatch independently. Survey of the working `register_optional` types:

| Working optional type               | Carrier classes                                                                                     | Fan-out sibling? / constructibility                                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle<NCollection_BaseAllocator>` | NCollection container ctors (optional allocator, row 3)                                             | No clean fan-out (val_default) sibling method; container methods carry no trailing defaults. `Clear(val)` is val-_discrimination_ (bool vs handle), not a default-on-absence fan-out.   |
| `bool` / `int` (as ctor params)     | sub-2b math/approx classes (`math_BrentMinimum`, `Approx_FitAndDivide*`, `GeomInt_TheComputeLine*`) | Both ctors are all-optional degenerate siblings (optional + optional, not optional + fan-out); not straightforwardly constructible (need `math_*Function` / `AppCont_Function` inputs). |
| `int` (return)                      | `BOPDS_Interf::GetIndexNew()` (row 21)                                                              | Low-level boolean-operation internal class; not meaningfully constructible for a behavioral smoke; no clean fan-out sibling.                                                            |

The `BRepGraph_*Explorer` ctors are the only place that cleanly pairs a genuine-optional slot (`theAvoidKind`) with a fan-out slot (`theMode`, a val_default trailing default) on one registration — and that pair is exactly the gate's intent — but it is runtime-broken per Findings 1–2.

## Reactivation Verdicts

| Gate                            | File                                    | Verdict                 | Concrete target                                                       | d.ts                                  |
| ------------------------------- | --------------------------------------- | ----------------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `CLASS_VALUE_DEFAULT_AVAILABLE` | `smoke-optional-value-defaults.test.ts` | **ACTIVATED — passing** | `Message_Attribute(theName = TCollection_AsciiString::EmptyString())` | `opencascade_full.d.ts:963-988`       |
| `MIXED_DISPATCH_AVAILABLE`      | `smoke-mixed-fanout-optional.test.ts`   | **KEPT CLOSED**         | (would be `BRepGraph_ParentExplorer` once unblocked)                  | `opencascade_full.d.ts:177178-177263` |

## Recommendations

| #   | Action                                                                                                                                                                                                                                           | Priority | Effort            | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------- | ------ |
| R1  | Emit `register_optional<T>` for every enum/class `T` used in a genuine `std::optional<T>` parameter, return, or `value_object` field — starting with `BRepGraph_NodeId::Kind`. Unblocks the row-22 flagship ctors and `GetConfig()`.             | P1       | Low–Med (bindgen) | High   |
| R2  | After R1, activate `MIXED_DISPATCH_AVAILABLE` using `BRepGraph_ParentExplorer`: assert the genuine-optional `theAvoidKind` slot and the val_default `theMode` slot dispatch independently on one ctor registration (readback via `GetConfig()`). | P2       | Low               | Med    |
| R3  | Harden `smoke-genuine-optional-param.test.ts` to exercise the full-arity (5/6-arg) genuine-optional ctor and `GetConfig()` readback so the masked unbound-type gap (Finding 2) fails loudly instead of passing by routing.                       | P2       | Low               | Med    |

## Scope and Non-Goals

**In scope**: test-only reactivation of the two gated smoke tests against the existing Phase-4 `dist/`.
**Out of scope**: rebuilding the WASM or changing bindgen emission (R1/R3 are recommendations for a future bindgen pass, not performed here).

## References

- Policy: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md` (matrix rows 2/22/36)
- Surface audit: `docs/research/ocjs-occt-surface-audit.md` (rows 21/22 confirmation, sub-2b enumeration)
- Phase outcomes: `docs/research/ocjs-phase-4-build-outcome.md`, `docs/research/ocjs-phase-4-smoke-readiness.md`
- val_default codegen: `repos/opencascade.js/src/ocjs_bindgen/codegen/val_default.py`
- Target bindings: `repos/opencascade.js/build/bindings/FoundationClasses/TKernel/Message/Message_Attribute.hxx/Message_Attribute.cpp`; `…/ModelingData/TKBRep/BRepGraph/BRepGraph_ParentExplorer.hxx/BRepGraph_ParentExplorer.cpp`
