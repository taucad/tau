---
title: 'OCJS RBV test corpus contract drift — Class B & Class C smoking guns'
description: 'Two unrelated typecheck regressions in the opencascade.js test suite trace to a single architectural omission: the test corpus encodes the R1 universal-passthrough contract instead of the codegens three actual return shapes.'
status: superseded
created: '2026-05-13'
updated: '2026-05-13'
category: investigation
superseded_by: docs/research/ocjs-rbv-return-shape-revisit.md
related:
  - docs/research/ocjs-rbv-return-shape-revisit.md
  - docs/research/ocjs-rbv-handle-output-param-elision.md
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
  - docs/research/ocjs-rbv-universal-reference-passthrough.md
  - docs/research/ocjs-unified-rbv-blueprint.md
---

> **Superseded by [ocjs-rbv-return-shape-revisit.md](./ocjs-rbv-return-shape-revisit.md) (2026-05-13).** This document analyses the Class B / Class C drift against the prior "universal passthrough" RBV contract where every output param surfaced as a field on a return envelope. The follow-up revisit superseded that contract with the R1-R6 minimal transformation: class output params now mutate in place and are NOT echoed in any envelope, envelopes appear only for primitive / enum / elided-Handle outputs, the envelope's C++-return field is renamed from `result` to `returnValue`, and class-output-only methods collapse to native `void` / native return shapes. The decision tree and migration tables now live in `BREAKING_CHANGES.md §B2`. The Class B "Segment elision" and Class C "BRepGraph_Builder direct return" analyses below remain accurate as historical context but the recommended type-shape oracle and reference-table format have been replaced by the assertions in `tests/output-params.test-d.ts`, `tests/disposable-containers.test-d.ts`, and `tests/bindgen-output-shape.test.ts > no envelope mirrors a concrete class output as a non-return field` / `class outputs forward via *val::as<T*>(allow_raw_pointers())`.

# OCJS RBV test corpus contract drift — Class B & Class C smoking guns

Root-cause analysis for the two remaining typecheck error classes in `repos/opencascade.js/tests/` after Approach G shipped: `Geom2dAPI_InterCurveCurve.Segment` arity drift (Class B) and `BRepGraph_Builder.Add` envelope mismatch (Class C).

## Executive Summary

Both error classes point at the same architectural omission. The codegen has three distinct return shapes depending on output-param composition, but the test corpus (smoke tests + the type-level oracle in `tests/output-params.test-d.ts`) was authored against the original R1 _universal_ input-passthrough RBV contract that predates Approach G and never accounted for non-RBV return shapes. The dts is correct in both classes; the tests encode an outdated mental model. Class B is purely test migration. Class C surfaces a genuine documentation/discoverability gap (the three return shapes are not named or asserted as a contract anywhere) which the recommendation closes via a typed shape oracle in the test corpus.

## Problem Statement

After the Approach G handle output-param elision merge, `pnpm exec tsc --noEmit -p tests/tsconfig.json` reports two residual error classes:

**Class B — `Geom2dAPI_InterCurveCurve.Segment` arity mismatch (10 errors)**

```
tests/output-params.test-d.ts(37,7): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(47,40): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(84,42): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(150,47): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(180,42): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(220,43): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(262,40): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-intersection.test.ts(304,41): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-output-params.test.ts(47,47): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-output-params.test.ts(76,51): error TS2554: Expected 1 arguments, but got 3.
tests/smoke/smoke-rbv-cross-class.test.ts(153,45): error TS2554: Expected 1 arguments, but got 3.
```

**Class C — `BRepGraph_Builder_Result` envelope mismatch (2 errors)**

```
tests/smoke/smoke-brep-graph.test.ts(37,23): error TS2850: The initializer of a 'using' declaration must be either an object with a '[Symbol.dispose]()' method, or be 'null' or 'undefined'.
  Property '[Symbol.dispose]' is missing in type 'BRepGraph_Builder_Result' but required in type 'Disposable'.
tests/smoke/smoke-brep-graph.test.ts(38,30): error TS2339: Property 'result' does not exist on type 'BRepGraph_Builder_Result'.
```

## Methodology

For each class:

1. Read the OCCT C++ source declaration for the affected method (`Geom2dAPI_InterCurveCurve::Segment`, `BRepGraph_Builder::Add`).
2. Inspect the generated TypeScript declarations in `build-configs/opencascade_full.d.ts` (the artifact the test `tsconfig.json` typechecks against).
3. Trace the relevant codepath in `repos/opencascade.js/src/bindings.py` to confirm whether the dts is intentional output or a codegen bug.
4. Inspect the failing tests to identify the contract they encode.
5. Identify whether the smoking gun is in the codegen, the dts, or the test corpus.

## Findings

### Finding 1 (Class B): `Geom2dAPI_InterCurveCurve.Segment` — test corpus encodes the pre-Approach-G contract

**OCCT source** (`deps/OCCT/.../Geom2dAPI/Geom2dAPI_InterCurveCurve.hxx:116-118`):

```cpp
Standard_EXPORT void Segment(const int                  Index,
                             occ::handle<Geom2d_Curve>& Curve1,
                             occ::handle<Geom2d_Curve>& Curve2) const;
```

`Curve1`/`Curve2` are non-const `occ::handle<T>&` — the textbook OCCT output-param shape that Approach G targets.

**Current generated dts** (`build-configs/opencascade_full.d.ts:73113`):

```ts
Segment(Index: number): { Curve1: Geom2d_Curve; Curve2: Geom2d_Curve; [Symbol.dispose](): void };
```

The dts is **correct**. Approach G ran end-to-end: the two `Handle<Geom2d_Curve>&` outputs were stripped from the JS-facing arity and surfaced as named container fields on the return envelope, which carries `[Symbol.dispose]` because both fields are embind-managed.

**Test corpus** (sampled — 11 call sites across 3 smoke files + 1 type-d file):

```ts
// tests/output-params.test-d.ts:35-39
expectTypeOf<Geom2dAPI_InterCurveCurve['Segment']>().toBeCallableWith(
  1,
  null as unknown as Geom2d_Curve,
  null as unknown as Geom2d_Curve,
);

// tests/smoke/smoke-intersection.test.ts:47
using seg = intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE);
```

The test corpus encodes the **R1 universal-input-passthrough** contract from `ocjs-rbv-blueprint-p0-p1-stocktake.md` §F3 (the pre-Approach-G design), where _every_ output param — primitive, class, or `Handle<T>` — remained a required input slot. Approach G narrowed that universal rule (`docs/research/ocjs-rbv-handle-output-param-elision.md`) so `Handle<T>&` outputs are elided from the JS-facing arity entirely.

**Smoking gun**: the Approach G migration shipped the codegen change but did not migrate the dependent test corpus. The dts is the steady-state authority; every Class B error is a stale test call site.

**Cross-reference** — `bindings.py:420-443` documents `shouldStripParam` as the single source of truth for the elision rule and explicitly states that `Handle<T>&` outputs are removed:

```python
def shouldStripParam(arg_type, method):
  """...
    - Handle<T> output (Approach G — input elision): REMOVED from the
      JS-visible surface...
  """
  return isHandleOutputParam(arg_type)
```

This is consistent with the JSDoc comment block at `bindings.py:4332-4347` (`_buildKeptArgs`) that supersedes R1 §F3.

### Finding 2 (Class C): `BRepGraph_Builder_Result` is a `value_object` POD, not an RBV envelope

**OCCT source** (`deps/OCCT/.../BRepGraph/BRepGraph_Builder.hxx:43-58`):

```cpp
struct Result
{
  BRepGraph_NodeId       TopologyRoot;
  BRepGraph_ProductId    Product;
  BRepGraph_OccurrenceId Occurrence;
  BRepGraph_RefId        InsertedRef;
  bool                   Ok = false;
};

[[nodiscard]] static Standard_EXPORT Result Add(BRepGraph&          theGraph,
                                                const TopoDS_Shape& theShape);
```

The two parameters classify as follows under OCJS's output-param taxonomy:

| Param                                | OCJS classification                                        | RBV treatment                                         |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| `BRepGraph& theGraph`                | Non-const class reference (mutation handle, not an output) | Plain JS arg (not an output param under OCJS rules)   |
| `const TopoDS_Shape& theShape`       | Const class reference (input)                              | Plain JS arg                                          |
| Return: `Result` (value-type struct) | Nested struct → emitted as embind `value_object`           | Returned by value; no envelope, no `[Symbol.dispose]` |

The return type `Result` is a default-constructible 5-field POD with no member functions. `bindings.py:1352-1374` emits it as a flat `value_object`:

```python
if fields and not non_field_members:
    ...
    output += f'  value_object<{cppType}>("{structName}")\n'
    for field in fields:
        ...
        output += f'    .field("{field.spelling}", &{cppType}::{field.spelling})\n'
```

**Current generated dts** (`build-configs/opencascade_full.d.ts:145654, 145695-145701`):

```ts
static Add(theGraph: BRepGraph, theShape: TopoDS_Shape): BRepGraph_Builder_Result;
...
export interface BRepGraph_Builder_Result {
  TopologyRoot: BRepGraph_NodeId;
  Product: unknown;
  Occurrence: unknown;
  InsertedRef: BRepGraph_RefId;
  Ok: boolean;
}
```

The dts is **correct**. `Add` has zero OCJS-classified output params, so `_emitOutputParamBinding` is never called and no RBV envelope is synthesised. The return is the OCCT struct itself, copied across the wire by embind.

**Test corpus** (`tests/smoke/smoke-brep-graph.test.ts:37-42`):

```ts
using container = oc.BRepGraph_Builder.Add(graph, shape);
const result = container.result;
expect(result.Ok).toBe(true);
expect(result.TopologyRoot).toBeDefined();
```

The test assumes the _universal RBV envelope_ shape: every cross-boundary return is wrapped as `{ result, [Symbol.dispose] }`. That is the **third** shape `_emitOutputParamBinding` produces (the `val::object()` branch at `bindings.py:1978-1991`), and it only applies when the method has at least one output param.

**Smoking gun**: the test was authored under the same R1-universal mental model that produced Class B. The pull request that introduced `BRepGraph_Builder` smoke coverage anticipated an envelope that the codegen never had reason to synthesise for `Add`. The dts is what the bindings should produce; the test is what needs updating.

### Finding 3: The codegen has three return shapes; the test corpus and source comments never name them as a contract

Tracing `bindings.py` end-to-end shows three mutually exclusive return shapes for methods that cross the C++/JS boundary:

| Shape                             | Trigger                                                                                                                                                                      | C++ emission                                                                                                                                         | TS return type                                                                               | `[Symbol.dispose]`?                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **S0 — Direct return**            | No OCJS-classified output params                                                                                                                                             | No lambda; direct method binding; if return type is a struct it is registered as a separate `value_object<T>`.                                       | The return type as-is (a class instance, a primitive, an enum, or a value_object interface). | No (value_object is a JS POD; class instances retain their own `delete()`/`Symbol.dispose`). |
| **S1 — `value_object` envelope**  | Method has ≥1 primitive/enum output param **and** no embind-managed output (no `Handle<T>` field, no class field).                                                           | `optional_override` returning a stack `StructName{ret, out1, ...}`. Registered as `value_object<StructName>`.                                        | `{ result, out1, ... }` (no `Symbol.dispose`).                                               | No — primitives have no lifetime.                                                            |
| **S2 — `val::object()` envelope** | Method has ≥1 embind-managed output (after Approach G elision, this means a class output param **or** a non-void embind-managed return value combined with an output param). | `optional_override` returning `::emscripten::val::object()` with each field set explicitly; `Symbol.dispose` attached via the shared EM_JS disposer. | `{ result, out1, ..., [Symbol.dispose](): void }`.                                           | Yes.                                                                                         |

The choice between S1 and S2 is driven by `_containerNeedsDispose(disposable_field_names)` (`bindings.py:1881-1889`), which returns `True` iff any field is a class instance or `Handle<T>`. S0 vs (S1 or S2) is determined by whether `_emitOutputParamBinding` is invoked at all — i.e. whether the method has any output params under `isOutputParam`.

Importantly:

- **Class B's `Segment`** → all output params were `Handle<T>&` → all elided by Approach G → the method drops to S2 with `Curve1`/`Curve2` as container fields (because the elided handles re-enter as embind-managed fields).
- **Class C's `Add`** → no output params at all → S0 → direct return of a `value_object<BRepGraph_Builder::Result>`.

The test corpus assumes S2 universally. There is no test or doc that names S0/S1/S2 as a discrete contract or asserts the right shape for each archetype. Even `bindings.py:1906-1916` documents the two envelope variants (the S1/S2 branch) but does not enumerate S0 alongside them as an equal partner. This is the discoverability gap the test corpus stumbled into.

### Finding 4: The `using` keyword on a non-disposable return is a discrete type-system error, not a runtime issue

For Class C, `using container = oc.BRepGraph_Builder.Add(...)` fails type-checking with TS2850 because the return type's interface lacks `[Symbol.dispose]`. This is correct TypeScript behaviour and protects against a real runtime category — `value_object` returns are JS PODs and have no `Symbol.dispose` method to call.

The custom `tau-lint/require-using-on-disposable` rule does the symmetric type-aware check at lint time: it only flags variables whose static type implements `[Symbol.dispose]`. `BRepGraph_Builder_Result` is correctly excluded by that rule. The two protections compose: `using` against a non-disposable is a TS error, `const` against a disposable is a lint error.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                         | Priority | Effort | Impact                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| R1  | Migrate the 8 `Segment(idx, h1, h2)` call sites in `smoke-intersection.test.ts`, `smoke-output-params.test.ts`, `smoke-rbv-cross-class.test.ts` to `Segment(idx)`. Read fields via `seg.Curve1` / `seg.Curve2`. Keep `using`.                                                                                                  | P0       | Low    | Resolves 8 of 11 Class B errors.                                                                                         |
| R2  | Rewrite `tests/output-params.test-d.ts` `Segment` block to assert the Approach G contract: exactly one parameter, return type has `Curve1`/`Curve2` properties, return type has `[Symbol.dispose]`. Add a negative assertion that the legacy 3-arg signature is no longer callable.                                            | P0       | Low    | Closes the type-level oracle gap that allowed the migration to ship without test-coverage protection.                    |
| R3  | Rewrite `tests/smoke/smoke-brep-graph.test.ts:37-42` to drop `using` and read fields directly off the value-object return. Document inline why a value-object return does not need disposal.                                                                                                                                   | P0       | Low    | Resolves both Class C errors.                                                                                            |
| R4  | Expand `tests/output-params.test-d.ts` with one direct `expectTypeOf` block per shape archetype (S0/S1/S2) using one representative method each: `BRepGraph_Builder.Add` (S0), `Geom_Surface.Bounds` (S1), `Geom2dAPI_InterCurveCurve.Segment` (S2). Use vitest's built-in `expectTypeOf` assertions only — no custom helpers. | P1       | Low    | Prevents future shape drift via compile-time assertions, without introducing test machinery that obscures the assertion. |
| R5  | Add a JSDoc summary block at the top of `bindings.py` `processClass` / `_emitOutputParamBinding` enumerating S0/S1/S2 with examples (one OCCT class per shape: `BRepGraph_Builder::Add` for S0, `Geom_Surface::Bounds` for S1, `Geom2dAPI_InterCurveCurve::Segment` for S2).                                                   | P2       | Low    | Codegen self-documenting; future maintainers see the full contract in one place.                                         |
| R6  | Cross-reference the three-shape contract from `docs/research/ocjs-rbv-handle-output-param-elision.md` and `docs/research/ocjs-unified-rbv-blueprint.md` so the blueprint stays the canonical source of truth.                                                                                                                  | P2       | Low    | Closes the documentation loop.                                                                                           |

R1-R3 are mechanical and unblock the typecheck immediately. R4-R6 prevent recurrence by promoting the three-shape model from implicit behaviour to a tested, documented contract.

## Trade-offs

The only meaningful architectural choice surfaced by this investigation is whether to _eliminate_ S0 by routing every value-object return through the S1/S2 envelope unconditionally. That would make the test corpus's universal-envelope assumption correct retroactively.

| Option                                           | Pro                                                                                                                                                                        | Con                                                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Keep S0 (current)**                        | Cheapest path; matches embind's native value_object idiom; no per-call wrapper allocation; no JS-side `[Symbol.dispose]` needed for PODs that have no lifetime to dispose. | Universal-envelope mental model leaks (this investigation).                                                                                                                                       |
| **B — Promote every non-void return to S1 / S2** | One return shape; eliminates the test corpus drift category.                                                                                                               | Adds a wrapper allocation per call for thousands of methods that return primitives or value_objects; the `[Symbol.dispose]` would be a no-op; defeats the entire `_containerNeedsDispose` branch. |

Verdict: **A**. The cost of B (every primitive return paying for a `val::object()` envelope it does not need) outweighs the cost of fixing the test corpus once. R4 closes the leak by asserting each shape archetype directly in the existing type-level oracle file, with no additional helper layer.

## Code Examples

### R1 — Class B test migration shape

Before (test corpus, encoding R1 universal-passthrough):

```ts
using seg = intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE);
expect(seg.Curve1).toBeDefined();
```

After (Approach G shape, matches `build-configs/opencascade_full.d.ts:73113`):

```ts
using seg = intersector.Segment(1);
expect(seg.Curve1).toBeDefined();
expect(seg.Curve2).toBeDefined();
```

### R2 — type-d oracle migration

Before:

```ts
expectTypeOf<Geom2dAPI_InterCurveCurve['Segment']>().toBeCallableWith(
  1,
  null as unknown as Geom2d_Curve,
  null as unknown as Geom2d_Curve,
);
```

After:

```ts
expectTypeOf<Geom2dAPI_InterCurveCurve['Segment']>().toBeCallableWith(1);
expectTypeOf<Geom2dAPI_InterCurveCurve['Segment']>().parameters.toEqualTypeOf<[Index: number]>();
type SegmentReturn = ReturnType<Geom2dAPI_InterCurveCurve['Segment']>;
expectTypeOf<SegmentReturn>().toHaveProperty('Curve1');
expectTypeOf<SegmentReturn>().toHaveProperty('Curve2');
expectTypeOf<SegmentReturn>().toHaveProperty(Symbol.dispose);
```

### R3 — Class C test migration shape

Before (assumes S2 envelope):

```ts
using container = oc.BRepGraph_Builder.Add(graph, shape);
const result = container.result;
expect(result.Ok).toBe(true);
```

After (S0 value-object return; no envelope):

```ts
const result = oc.BRepGraph_Builder.Add(graph, shape);
expect(result.Ok).toBe(true);
expect(result.TopologyRoot).toBeDefined();
expect(result.Product).toBeDefined();
expect(result.Occurrence).toBeDefined();
```

`const` is correct here: `BRepGraph_Builder_Result` is a JS POD (embind `value_object`), not a Disposable. The `tau-lint/require-using-on-disposable` rule's type-aware logic correctly leaves this site alone.

### R4 — direct `expectTypeOf` blocks per shape archetype

One representative method per shape, asserting the observable surface directly. No `ShapeOracle`, no `expectShape`, no custom predicates — vitest's `expectTypeOf` is sufficient and the failure points squarely at the affected property.

```ts
// S0 — direct value_object return: no envelope, no Symbol.dispose, fields on the return.
describe('Shape S0 — direct value_object return (BRepGraph_Builder.Add)', () => {
  type AddReturn = ReturnType<(typeof BRepGraph_Builder)['Add']>;
  it('returns the OCCT struct directly with named fields', () => {
    expectTypeOf<AddReturn>().toHaveProperty('TopologyRoot');
    expectTypeOf<AddReturn>().toHaveProperty('Ok');
    expectTypeOf<AddReturn['Ok']>().toEqualTypeOf<boolean>();
  });
  it('does not wrap in an RBV envelope', () => {
    expectTypeOf<AddReturn>().not.toHaveProperty('result');
    expectTypeOf<AddReturn>().not.toHaveProperty(Symbol.dispose);
  });
});

// S1 — value_object envelope: primitive output fields, no Symbol.dispose.
describe('Shape S1 — value_object envelope (Geom_Surface.Bounds)', () => {
  type BoundsReturn = ReturnType<Geom_Surface['Bounds']>;
  it('exposes each output as a numeric field', () => {
    expectTypeOf<BoundsReturn['U1']>().toEqualTypeOf<number>();
    expectTypeOf<BoundsReturn['V2']>().toEqualTypeOf<number>();
  });
  it('does not carry Symbol.dispose (primitives have no lifetime)', () => {
    expectTypeOf<BoundsReturn>().not.toHaveProperty(Symbol.dispose);
  });
});

// S2 — val::object envelope with Symbol.dispose; Approach G handle elision applied.
describe('Shape S2 — val::object envelope (Geom2dAPI_InterCurveCurve.Segment)', () => {
  type SegmentReturn = ReturnType<Geom2dAPI_InterCurveCurve['Segment']>;
  it('exposes elided Handle outputs as embind-managed fields', () => {
    expectTypeOf<SegmentReturn>().toHaveProperty('Curve1');
    expectTypeOf<SegmentReturn>().toHaveProperty('Curve2');
  });
  it('carries Symbol.dispose for the embind-managed fields', () => {
    expectTypeOf<SegmentReturn>().toHaveProperty(Symbol.dispose);
  });
  it('elides the Handle inputs from the JS-facing arity', () => {
    expectTypeOf<Geom2dAPI_InterCurveCurve['Segment']>().parameters.toEqualTypeOf<[Index: number]>();
  });
});
```

A regression where the codegen flips a method between shapes surfaces as a localised property assertion failure, not a wrapper-type mismatch. The reader sees exactly which property was added or removed.

### R5 — `bindings.py` JSDoc sketch with per-shape consumer DX

The JSDoc block lives above `_emitOutputParamBinding` (the entry point that selects S1 vs S2) and is cross-linked from the S0 path (`processClass` nested-struct emission). Each shape pairs its C++ trigger with the exact dts the consumer sees and the canonical call-site pattern. Shape labels match this research doc and the test corpus in R4.

```python
"""Three return shapes cross the C++/JS boundary. The shape is fully
determined by the OCJS output-param classification of the method's
arguments and the disposability of any embind-managed field:

  S0  Direct return (no envelope).
       Trigger: zero OCJS-classified output params.
       Codegen: native embind binding; struct returns are registered
                separately as `value_object<T>` (see processClass).

       Consumer dts:
           static Add(g: BRepGraph, s: TopoDS_Shape): BRepGraph_Builder_Result;
           interface BRepGraph_Builder_Result {
             TopologyRoot: BRepGraph_NodeId;
             Ok: boolean;
             ...
           }

       Consumer call-site (no `using`, no dispose):
           const result = oc.BRepGraph_Builder.Add(graph, shape);
           if (result.Ok) read(result.TopologyRoot);

  S1  value_object envelope (no Symbol.dispose).
       Trigger: >=1 primitive/enum output param; no embind-managed field.
       Codegen: optional_override returning a stack StructName{...}.

       Consumer dts:
           Bounds(U1: number, U2: number, V1: number, V2: number):
             { U1: number; U2: number; V1: number; V2: number };

       Consumer call-site (input-passthrough; no `using`, no dispose):
           const bounds = surface.Bounds(0, 0, 0, 0);
           const span = bounds.U2 - bounds.U1;

  S2  val::object envelope with Symbol.dispose.
       Trigger: >=1 embind-managed output field (class, Handle<T>, or
                Approach G elided Handle re-entering as a container field).
       Codegen: optional_override returning ::emscripten::val::object();
                Symbol.dispose attached via the shared EM_JS disposer.

       Consumer dts (Approach G handle elision applied):
           Segment(Index: number):
             { Curve1: Geom2d_Curve;
               Curve2: Geom2d_Curve;
               [Symbol.dispose](): void };

       Consumer call-site (`using` mandatory — tau-lint enforces it):
           using seg = intersector.Segment(1);
           read(seg.Curve1, seg.Curve2);
           // seg.Curve1 / seg.Curve2 released when `seg` goes out of scope

Branch authority:
  - S0 vs (S1|S2): whether `_emitOutputParamBinding` runs at all
    (driven by `isOutputParam` across the method's args).
  - S1 vs S2: `_containerNeedsDispose(disposable_field_names)`.

See docs/research/ocjs-rbv-test-corpus-contract-drift.md for the contract
discussion and docs/research/ocjs-rbv-handle-output-param-elision.md for
the Approach G derivation of S2's elided-Handle subcase.
"""
```

The three consumer call-site snippets are the load-bearing part of the block — they make the lifetime-ownership contract visible at the codegen seam (no `using` for S0/S1, `using` required for S2) and let future maintainers cross-check generated dts against the documented archetype without leaving `bindings.py`.

## Diagrams

The three return shapes side by side:

```text
  C++ method signature                      Codegen path              TS return shape

  Result Add(BRepGraph&, const TopoDS&)     S0 (no output params)     Result               (value_object)
  void Bounds(double&, double&, ...)        S1 (prims only)           { U1; U2; V1; V2 }   (value_object envelope)
  void Curve(..., handle<T>&, ...)          S2 (any disposable)       { ...; [Symbol.dispose] }  (val::object envelope)
  void Segment(int, handle<T>&, handle<T>&) S2 + Approach G elision   { Curve1; Curve2; [Symbol.dispose] }
```

Decision tree implemented by `_emitOutputParamBinding` + `_containerNeedsDispose`:

```text
  any OCJS output param?
        │
        ├── no  ─────────────────────────────── S0 (direct return; value_object if struct)
        │
        └── yes
              │
              ├── any embind-managed field? ─── S2 (val::object + Symbol.dispose)
              │
              └── primitives only ────────────── S1 (value_object envelope; no Symbol.dispose)
```

## References

- Codegen: `repos/opencascade.js/src/bindings.py:420-443` (`shouldStripParam`), `:1748-1856` (`_ensureResultStruct`), `:1881-1889` (`_containerNeedsDispose`), `:1891-2002` (`_emitOutputParamBinding`), `:1352-1374` (nested-struct value_object emission), `:4332-4352` (`_buildKeptArgs`).
- OCCT sources: `repos/opencascade.js/deps/OCCT/.../Geom2dAPI_InterCurveCurve.hxx` (Class B target), `repos/opencascade.js/deps/OCCT/.../BRepGraph_Builder.hxx` (Class C target).
- Generated dts: `repos/opencascade.js/build-configs/opencascade_full.d.ts:73067-73121` (`Geom2dAPI_InterCurveCurve`), `:145647-145701` (`BRepGraph_Builder` + `BRepGraph_Builder_Result`).
- Prior R1 contract: `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` §F3.
- Approach G migration: `docs/research/ocjs-rbv-handle-output-param-elision.md`.
- Unified blueprint: `docs/research/ocjs-unified-rbv-blueprint.md`.

## Appendix — Verbatim failing call sites

For mechanical R1 application, the eight grep-matched Class B sites:

| File                                        | Line  | Current call                                                              | Migrated call                                       |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `tests/smoke/smoke-intersection.test.ts`    | 47    | `intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 84    | `intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 150   | `intersector.Segment(i, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(i)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 180   | `intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 220   | `intersector.Segment(i, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(i)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 262   | `intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-intersection.test.ts`    | 304   | `intersector.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`            | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-output-params.test.ts`   | 47    | `intersector.Segment(1, NULL_HANDLE, NULL_HANDLE)`                        | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-output-params.test.ts`   | 76    | `intersector.Segment(1, NULL_HANDLE, NULL_HANDLE)`                        | `intersector.Segment(1)`                            |
| `tests/smoke/smoke-rbv-cross-class.test.ts` | 153   | `inter.Segment(1, NULL_CURVE_HANDLE, NULL_CURVE_HANDLE)`                  | `inter.Segment(1)`                                  |
| `tests/output-params.test-d.ts`             | 35-39 | `toBeCallableWith(1, null as ... Geom2d_Curve, null as ... Geom2d_Curve)` | `toBeCallableWith(1)` plus parameter-list assertion |

After these edits and the R3 edit, expected residual error count from `pnpm exec tsc --noEmit -p tests/tsconfig.json` is zero.
