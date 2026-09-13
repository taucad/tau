---
title: 'OCJS RBV closure — universal reference-passthrough for class outputs'
description: 'POC-validated unification of RBV around reference-passthrough for class outputs — preserves primitive in/out, eliminates per-call copies, drops [Symbol.dispose] from reference-only envelopes.'
status: superseded
created: '2026-05-12'
updated: '2026-05-13'
category: investigation
superseded_by: docs/research/ocjs-rbv-handle-output-param-elision.md
related:
  - docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md
  - docs/research/ocjs-rbv-handle-output-param-elision.md
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
---

# OCJS RBV closure — universal reference-passthrough for class outputs

End-to-end validation of a single RBV envelope strategy that closes out R1 (the `BRepGraph_Builder.Add` non-disposable-container failure) while simultaneously eliminating an unnecessary per-call copy for every class-typed output param across OCJS.

## Executive Summary

The user's proposed unification — "forward class output params by reference into the container, save memory by sharing identity with the caller's instance, drop `[Symbol.dispose]` when only references and primitives remain" — is fully viable and **strictly dominates** the current `_emitOutputParamBinding` value-copy path on every axis tested. An emscripten POC (`/tmp/rbv-poc/poc.cpp`) compiled with `em++ 5.0.1` and exercised against Node v24.10.0 shows:

| Axis                            | A (value-copy, status quo)              | B (reference-passthrough, proposed)    | Verdict                                       |
| ------------------------------- | --------------------------------------- | -------------------------------------- | --------------------------------------------- |
| Wall-clock (24-byte class)      | 0.964 µs/call                           | 0.682 µs/call                          | **B is 1.41× faster**                         |
| Wall-clock (8 KB non-copyable)  | does not compile                        | 0.813 µs/call                          | **B unique**                                  |
| Heap delta over 200 K calls     | 0 B (with explicit `.delete()` on copy) | 0 B (no copy ever allocated)           | tie at zero, B drops the `.delete()` ceremony |
| Compile-time support            | copyable only                           | copyable + non-copyable                | **B universal**                               |
| Identity (`wrap.out === input`) | false (copy)                            | true (same handle)                     | **B matches C++ semantics**                   |
| Double-free safety              | per-field `.delete()` required          | embind native guard fires if attempted | both safe; B simpler                          |
| Container `[Symbol.dispose]`    | required (frees the copy)               | unnecessary (caller owns lifetime)     | **B eliminates ceremony**                     |

The architectural recommendation is to retire the value-copy path entirely for class output params and replace it with reference-passthrough. Primitives/enums continue using the existing input-passthrough path (JS primitives cannot be referenced through embind). **`Handle<T>` outputs stay on the current copy path** — a follow-up POC against embind's `smart_ptr_trait` ([Finding 8](#finding-8-r6-spike--valassmartptrt-cannot-be-generalised-to-handlet)) proves that `val::as<SmartPtr<T>&>()` returns a reference to a transient smart-pointer fabricated during wire decode, so reassignment inside the lambda never reaches the caller's wrapper. The `[Symbol.dispose]` on the RBV envelope is therefore emitted **only** when at least one field is a Handle<T> output or the method's return type is itself an embind-managed class/Handle requiring lifecycle bookkeeping.

This closes R1 from [`ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md) with a uniform mental model, lower per-call cost, and simpler consumer ergonomics. The four-way wish list in the prompt — backwards compat for primitive in/out, memory-saving class identity preservation, correct disposable semantics, and `[Symbol.dispose]`-free containers when nothing in the envelope is independently owned — is achievable in one design pass.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: `val::as<T&>()` compiles and runs for non-copyable types](#finding-1-valast-compiles-and-runs-for-non-copyable-types)
  - [Finding 2: Reference passthrough preserves caller-side identity](#finding-2-reference-passthrough-preserves-caller-side-identity)
  - [Finding 3: Performance — 1.41× faster than value-copy on small classes](#finding-3-performance--141-faster-than-value-copy-on-small-classes)
  - [Finding 4: Multi-class-output param holds per-slot identity](#finding-4-multi-class-output-param-holds-per-slot-identity)
  - [Finding 5: Mixed primitive + class output params co-exist in one lambda](#finding-5-mixed-primitive--class-output-params-co-exist-in-one-lambda)
  - [Finding 6: Double-free is caught by embind native guards](#finding-6-double-free-is-caught-by-embind-native-guards)
  - [Finding 7: `[Symbol.dispose]` is genuinely unnecessary on reference-only envelopes](#finding-7-symboldispose-is-genuinely-unnecessary-on-reference-only-envelopes)
  - [Finding 8: R6 spike — `val::as<SmartPtr<T>&>` cannot be generalised to Handle<T>](#finding-8-r6-spike--valassmartptrt-cannot-be-generalised-to-handlet)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [Open Questions](#open-questions)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

The previous research doc [`ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md) identified that `BRepGraph_Builder.Add` falls through to the plain `select_overload` path because `BRepGraph(const BRepGraph&) = delete;` disqualifies it from `_emitOutputParamBinding`'s value-copy lambda. R1 in that doc proposed a "ref-only RBV envelope" path that special-cases non-copyable class output params while leaving copyable classes on the existing value-copy path.

The user surfaced a sharper question: **why have two paths at all?** If we forward every class output param by reference rather than by value, we:

1. Continue the existing in-out behaviour for primitive args (input-passthrough is mandatory for primitives — JS has no by-ref).
2. Save per-call memory by avoiding the embind copy-construct (modest on `gp_Pnt`, catastrophic on heavyweight graph types).
3. Get correct disposal semantics because the caller already owns the input handle; the container's class fields share identity with the caller's instance.
4. Drop `[Symbol.dispose]` from the envelope when every field is a reference or primitive — no field owns an independent lifecycle.

The investigation tests whether (1)–(4) actually co-exist under real embind semantics.

## Methodology

1. Set up a clean POC scratch under `/tmp/rbv-poc/`. Sourced `repos/opencascade.js/deps/emsdk/emsdk_env.sh` to activate `em++ 5.0.1` and the bundled Node v24.10.0.
2. Implemented three strategies (`A` value-copy, `B` reference-passthrough, `C` raw-pointer-passthrough) across two class shapes (`Copyable` 24-byte and `NonCopyable` 8 KB payload with `unique_ptr<double[1024]>` plus a deleted copy ctor) in `poc.cpp`. Compiled with `-O2 -std=c++17 -lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node`.
3. Wrote `run.mjs` exercising correctness (identity preservation, in-place mutation), performance (200 K iterations for `Copyable`, 50 K for `NonCopyable` due to the 8 KB allocation cost), and double-free safety. Ran under `node --expose-gc` so `gc()` is callable between samples.
4. Followed up with `poc2.cpp` + `run2.mjs` to validate multi-class-output and mixed-primitive-plus-class scenarios.
5. Validated the `using` ceremony with `run3.mjs` — confirming a reference-only envelope works correctly when only the input has `using` and the container omits `[Symbol.dispose]`.

All sources, build outputs, and raw measurement scripts are reproducible from the snippets in [Code Examples](#code-examples) and [Appendix A1](#a1-poc-source-layout).

## Findings

### Finding 1: `val::as<T&>()` compiles and runs for non-copyable types

`emscripten::val::as<T&>()` template-dispatches through `internalCallWithPolicy<EM_INVOKER_KIND::CAST, …, T&>` (`deps/emsdk/upstream/emscripten/system/include/emscripten/val.h:517-522`). For class-typed `T`, the cast invoker reads the embind-managed pointer slot stored on the JS-side wrapper and returns a `T&` referencing that exact C++ instance. No copy-construction is attempted, so the same template instantiation compiles for `NonCopyable&` where `NonCopyable(const NonCopyable&) = delete;`.

The POC `poc.cpp` exercises this with:

```cpp
val mutateNonCopyable_B_reference(val gVal, int times) {
  NonCopyable& g = gVal.as<NonCopyable&>();
  // … mutate g …
  val out = val::object();
  out.set("classOut", gVal);   // pass the SAME val back
  return out;
}
```

`em++` compiles this clean (no template-instantiation errors), and at runtime `oc.mutateNonCopyable_B_reference(g, 5)` mutates `g` in place — `g.Counter() === 5` after the call. The earlier doc's worry that "embind binds class-typed lambda parameters by value" applies only when the lambda's signature declares the param as `T` (value). Declaring it as `val` and decoding to `T&` inside the body sidesteps that constraint.

### Finding 2: Reference passthrough preserves caller-side identity

Identity is preserved because Strategy B stores the inbound `val` directly into the output `val::object()`:

```
=== CORRECTNESS ===
B: caller.x after call = 11 (expected 11)
B: classOut === caller? IDENTICAL ✓
B: classOut.x = 11
B: result.sum = 36 (expected 36)

A: caller.x after call = 1 (expected 1 — unchanged)
A: classOut === caller? COPY ✓
A: classOut.x = 11 (mutated copy)
```

The contrast is sharp: under A the caller's instance is unchanged and the container owns a separate copy at `wrap.classOut`; under B both the caller and `wrap.classOut` reference the same C++ instance, and the mutation is visible through both handles. B's behaviour matches the C++ semantics of the underlying function — exactly what a developer reading the OCCT signature `Add(BRepGraph& theGraph, …)` would expect.

### Finding 3: Performance — 1.41× faster than value-copy on small classes

```
=== PERFORMANCE — Copyable (24-byte class) ===
A value-copy:  total 192.8ms, 0.964 µs/call, heap delta 0B
B reference:   total 136.4ms, 0.682 µs/call, heap delta 0B
C raw-pointer: total 131.2ms, 0.656 µs/call, heap delta 0B
B vs A speedup: 1.41x
C vs A speedup: 1.47x
```

```
=== PERFORMANCE — NonCopyable (8 KB payload class) ===
A value-copy:   NOT APPLICABLE (deleted copy ctor — would fail to compile)
B reference:    total 40.7ms, 0.813 µs/call, heap delta 0B
C raw-pointer:  total 38.8ms, 0.775 µs/call, heap delta 0B
```

Three points worth noting:

1. **Heap delta is 0 for all strategies post-cleanup** because the benchmark loops `.delete()` the copy under A and let the input fall out of scope under B/C. The "save memory" claim is real but its observable impact is in **allocation churn / fragmentation pressure**, not residual heap. A typical OCCT render fires thousands of these per frame; eliminating the copy-and-free pair per call is a worthwhile constant-factor improvement on the GC/embind layer rather than a memory-floor reduction.
2. **Strategy B is 41 % faster than A for `Copyable`** because it skips both the copy-construct on entry and the `.delete()`-time destruction on exit.
3. **Strategy C (raw pointer + val passthrough) is a further ~4 % faster than B** because it skips the `val::as<T&>()` wire-cast. The marginal gain is not worth losing the typed self-documentation of `T&` lambda parameters and the embind validation of the inbound val's type. **B is the recommended default; C remains available for hot-path optimisations only when profiling justifies it.**

### Finding 4: Multi-class-output param holds per-slot identity

`poc2.cpp` exercises a method that takes two distinct class output params (`Pnt& a, Box& b`) and binds both to the same `val::object()`:

```
=== MULTI-CLASS-OUTPUT-PARAM (B) ===
a.X       = 6 (expected 6)
b.Lo,b.Hi = -5 15 (expected -5, 15)
w.a === a = true (expected true)
w.b === b = true (expected true)
w.a !== w.b = true (expected true — different identities)
w.result.sum = 16 (expected 16)
```

Each slot holds the correct identity independently. This generalises to OCCT methods like `Add(BRepGraph& theGraph, const TopoDS_Shape& theShape, const BRepGraph_NodeId theParent)` where only one class slot is mutable, and to any future multi-graph mutators.

### Finding 5: Mixed primitive + class output params co-exist in one lambda

```
=== MIXED PRIMITIVE + CLASS (B + input-passthrough) ===
p.X       = 12 (expected 12 — class mutated in place)
w.pnt === p = true (expected true)
w.scalar  = 20 (expected 20 — primitive passed through by value)
```

A single `optional_override` lambda can declare class params as `val` (decoded to `T&`) and primitive params as the primitive type (decoded by value). The C++ body reads the primitive normally; the val-decoded class instance is mutated by reference. The output `val::object()` carries the val back for the class slot and the primitive value back for the primitive slot. **Backwards compatibility for primitive in/out is preserved as-is.**

### Finding 6: Double-free is caught by embind native guards

Under Strategy B `wrap.classOut === input`, so a careless caller calling `.delete()` on both would attempt a double-free. embind catches this:

```
=== DOUBLE-FREE SAFETY (Strategy B) ===
B: second delete on identical handle  — threw: Copyable instance already deleted
```

The native guard exists for any class wrapper that has already had `.delete()` called once. This makes B at least as safe as A: A required two distinct `.delete()` calls (one per handle), while B requires only one and protects the redundant case.

### Finding 7: `[Symbol.dispose]` is genuinely unnecessary on reference-only envelopes

```
=== USING ceremony on input only (Strategy B, no container disposer) ===
  inside scope: pnt.X = 11 | wrap.result.sum = 36
  after scope: ranOnce = 36

=== Reference-only container DOES NOT need [Symbol.dispose] ===
  wrap[Symbol.dispose] is: undefined
  (undefined → caller alone owns lifetime, identity-preserved field needs no dispose)

=== `using wrap` on plain val::object (no disposer) ===
  threw (as expected for plain val::object container): TypeError: Symbol(Symbol.dispose) is not a function
```

This is the cleanest result of the whole experiment. The container produced by Strategy B is a plain `val::object()` whose fields are (a) value_object payloads (`Result`) and (b) reference-shared class handles. **None of them owns an independent lifecycle.** The caller's `using` on the input instance fully covers the disposal contract; the container can be discarded as a plain JS object without any ceremony.

The `require-using-on-disposable` oxlint rule fires only for values that implement `Symbol.dispose`. Returning a plain object from `mutateCopyable_B_reference` correctly does not trigger the rule — exactly the desired UX:

```ts
using p = new oc.Copyable(1, 2, 3);
const { result } = oc.mutate(p, dx); // <- no `using` needed on the envelope
// p is the only thing that needed `using`; cleanup at scope exit handles it.
```

The TypeError shown above when `using wrap = …` is attempted on a non-disposable container is the standard JS runtime behaviour and serves as a learn-by-failure signal for callers who reflexively reach for `using`.

### Finding 8: R6 spike — `val::as<SmartPtr<T>&>` cannot be generalised to Handle<T>

**Status**: ⛔ NEGATIVE RESULT — R6 is **not viable**.

A follow-up POC (`/tmp/rbv-poc/handle.cpp`, `/tmp/rbv-poc/run-handle.mjs`) tested whether `val::as<std::shared_ptr<Curve>&>()` — the embind-supported analogue of OCJS's `smart_ptr<opencascade::handle<T>>` — gives the lambda a reference to the JS-side wrapper's underlying smart-pointer storage, such that a C++-side reassignment (`outHandle = std::make_shared<CircleCurve>(99);`) propagates back to the caller.

The core scenario uses a polymorphic refcounted `Curve` base with `LineCurve` and `CircleCurve` subclasses, registered exactly as OCJS registers OCCT handles (`class_<Curve>("Curve").smart_ptr<std::shared_ptr<Curve>>("CurvePtr")`). The lambda reassigns the smart-pointer reference; the test then inspects the caller's JS wrapper to check whether reassignment was observed.

```
=== SCENARIO 0: Reassignment propagation check (CORE QUESTION) ===
  caller h.Kind() === 'Circle'?  false ← THE SMOKING GUN
  w.outHandle === h?             true
  w.outHandle.Kind() = Line (expected Circle if reassignment propagates)
  Verdict: val::as<SmartPtr&>() returns a TEMPORARY — reassignment is LOST
```

```
=== SCENARIO 2: Non-null → reassigned to different concrete subclass ===
before: h.Kind() = Line | h.Value() = 7
after : h.Kind() = Line | h.Value() = 7 (expected Circle, 99)
w.outHandle === h ? true
w.outHandle.Kind() = Line
```

The caller's `h` (and `w.outHandle`, which is the same JS wrapper) still reports `Line` after the lambda reassigned its `CurvePtr&` to a freshly-made `CircleCurve`. The `===` identity test returns `true` because the same `val` was set back into the output container — but the underlying smart pointer instance the wrapper holds is untouched by the reassignment.

**Strategy A (value-copy, status quo) handles this correctly:**

```
=== STRATEGY A (value-copy) — what does it actually do? ===
before: h.Kind() = Line | h.Value() = 7
caller h after: Kind= Line | Value= 7 (if unchanged → A produces a separate JS wrapper)
w.outHandle === h ? false
w.outHandle =  Line(42)
```

Under A, the caller's input wrapper is unchanged (correct — JS callers cannot have their handle silently swapped under them) and `wrap.outHandle` is a **distinct** JS wrapper around the newly-allocated smart pointer. This is the expected OCCT Handle<T> output-param semantic.

#### Root cause — embind's `smart_ptr_trait::share`

The mechanism is fixed by embind's smart-pointer wire protocol. `repos/opencascade.js/deps/emsdk/upstream/emscripten/system/include/emscripten/bind.h:1042-1050` defines the shared-pointer trait specialisation:

```cpp
template<typename PointeeType>
struct smart_ptr_trait<std::shared_ptr<PointeeType>> {
    typedef std::shared_ptr<PointeeType> PointerType;

    static element_type* get(const PointerType& ptr) { return ptr.get(); }
    static sharing_policy get_sharing_policy() { return sharing_policy::BY_EMVAL; }

    static std::shared_ptr<PointeeType>* share(PointeeType* p, EM_VAL v) {
        return new std::shared_ptr<PointeeType>(
            p,
            val_deleter(val::take_ownership(v)));
    }

    static PointerType* construct_null() {
        return new PointerType;
    }
};
```

Every wire-decode of a smart-ptr-typed `val` runs through `share`, which **allocates a brand-new `std::shared_ptr<PointeeType>` on the C++ heap**, wires the val handle into its deleter, and hands the pointer to the cast-invoker as the "decoded" value. `val::as<std::shared_ptr<T>&>()` then returns a reference to _that_ fresh instance, not to the JS wrapper's underlying smart-ptr field. Reassignment mutates the transient; the transient dies at the end of the lambda; the wrapper sees nothing.

Plain `class_<T>` references work differently — they are decoded by reading the JS wrapper's raw `T*` slot directly, and `val::as<T&>()` returns a reference to the canonical C++ instance. That's why Strategy B is correct for plain classes (Findings 1–7) but fundamentally broken for smart pointers.

#### What about pointee mutation without reassignment?

Scenario 3 of the POC confirmed that mutating the pointee in place via the smart pointer DOES propagate (the JS wrapper and the C++ ref both hold smart pointers to the same control block, so `*pointee` mutations are visible). However, OCCT's Handle<T> output param convention is almost universally "reassign to a freshly-built handle" rather than "mutate the existing pointee through the handle" — the in-place case is rare enough that hand-rolling a Strategy-B path for it would add cost and ambiguity for no observable gain.

#### Performance footnote

The benchmark recorded a 1.58× speedup of B over A for Handle reassignment (0.883 µs vs 1.392 µs per call), but **the speedup is on incorrect-semantics code**. The number is reported only for completeness; correctness rules out the strategy regardless.

```
=== PERFORMANCE — Handle reassignment ===
A (value-copy):       139.2ms total, 1.392 µs/call
B (reference):        88.3ms total, 0.883 µs/call  ← faster but WRONG behaviour
B vs A speedup: 1.58x
```

#### Architectural verdict

The R1+R3 unification (universal reference-passthrough for `class_<T>` references, with `[Symbol.dispose]` retained only when at least one field is a Handle<T> output or the return is an embind-managed class/Handle) stands. Handle<T> outputs continue to use the existing value-copy lambda path and continue to attach the EM_JS shared disposer to free the per-call wrapper. The mental model becomes:

| Wire-decoded form             | Strategy                      | `[Symbol.dispose]` on envelope?                                              |
| ----------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Primitive / enum              | input-passthrough             | not required (no embind-managed lifecycle)                                   |
| `class_<T>` reference         | **reference-passthrough (B)** | not required for this field; caller's `using` covers it                      |
| `smart_ptr<Handle<T>>`        | value-copy (status quo)       | **required** — the fresh wrapper around the reassigned Handle owns lifecycle |
| `value_object<Result>` return | by-value field                | not required (POD)                                                           |
| Class-typed return            | embind-managed                | **required** if the return is a freshly-allocated registered class           |

The follow-up cleanup envisaged in the original R6 ("retire `__ocjsRbvDispose__` entirely once Handle outputs also use reference-passthrough") is therefore **not pursuable**. The shared disposer stays as a permanent part of the codegen.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Priority | Effort  | Impact                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Retire the value-copy path in `_emitOutputParamBinding` for class-typed output params. Replace with reference-passthrough: emit `val argN` for each class arg, decode inside the body via `argN.as<T&>()`, and `out.set("argN", argN)` so the container holds the caller's identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | P0       | Med     | Closes `BRepGraph_Builder.Add` and any future non-copyable input-mutator. 1.41× faster on small classes, larger savings on heavyweight types. Caller-side identity matches C++ semantics. |
| R2  | Drop the copy-constructibility precondition (`_isCopyConstructibleClass`) entirely from `isOutputParam`'s class branch. Replace with the lighter precondition of "is a default-constructible, embind-registered class". Default-constructibility is still required so the JS caller can allocate an instance before passing it in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P0       | Low     | Removes ~100 lines of conservative recursive-field walking from `bindings.py`. Eliminates the false-negative class of bug that started this investigation.                                |
| R3  | Update `_containerNeedsDispose` to require `Symbol.dispose` **only when** at least one output field is a Handle<T> output OR the return type is itself an embind-managed class/Handle requiring lifecycle bookkeeping. Class-output fields under R1's reference-passthrough no longer count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P0       | Low     | Strips no-op `Symbol.dispose` from the majority of OCCT method envelopes. Simpler consumer API, lighter `using` lint surface, no behavioural change.                                      |
| R4  | Update the `require-using-on-disposable` oxlint rule documentation to clarify: rule fires on values that implement `Symbol.dispose`. Reference-passthrough envelopes intentionally lack it. No code change needed in the rule; the doc update prevents future "why isn't `using` required?" confusion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P1       | Trivial | DX clarity.                                                                                                                                                                               |
| R5  | Migrate `repos/opencascade.js/tests/smoke/smoke-brep-graph.test.ts` to either: (a) drop `using container` since the envelope is now plain, OR (b) keep `using container` once R3 retains `Symbol.dispose` only for Handle/class returns (Result is a value_object, so the envelope from `BRepGraph_Builder.Add` will lack `Symbol.dispose` after R3 ships). Pick (a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P1       | Trivial | Test mirrors the post-R1 ergonomic.                                                                                                                                                       |
| R6  | ⛔ **Validated negative — do NOT generalise R1 to Handle<T> outputs via reference-passthrough.** The spike documented in [Finding 8](#finding-8-r6-spike--valassmartptrt-cannot-be-generalised-to-handlet) proves embind's `smart_ptr_trait::share` allocates a fresh smart-pointer per wire crossing, so `val::as<SmartPtr<T>&>()` references a transient that dies with the lambda. Reassignment inside the lambda is silently lost. **Closed forward by [`ocjs-rbv-handle-output-param-elision.md`](./ocjs-rbv-handle-output-param-elision.md) (Approach G — input elision)**, which solves the "double dispose stutter" by removing the JS-facing Handle input entirely and declaring a stack-local null Handle inside the C++ lambda — eliminating the gratuitous wrapper that the reference-passthrough idea was trying to alias with. The shared `__ocjsRbvDispose__` EM_JS callback stays as a permanent codegen feature. | P0       | Done    | Closes the question. Prevents a future contributor from re-attempting the reference-passthrough unification.                                                                              |
| R7  | Add a codegen unit test under `repos/opencascade.js/tests/codegen/` that asserts: (a) reference-passthrough lambda emission for class output params, (b) absence of `[Symbol.dispose]` field in the generated TS for envelopes whose only fields are primitives and class references, (c) `BRepGraph_Builder.Add` specifically gets the reference-passthrough lambda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P2       | Low     | Locks the contract at the codegen layer so future bindings rewrites can't regress.                                                                                                        |

## Trade-offs

### Identity-shared vs. distinct-copy semantics

| Dimension                      | A (value-copy, status quo)                                               | B (reference-passthrough, proposed)                                 |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| C++ semantic fidelity          | Caller's instance is unchanged after call (lambda receives a copy).      | Caller's instance is mutated in place (matches C++ `T&` semantics). |
| Required `.delete()` calls     | Two: caller's input AND the container's copy.                            | One: caller's input only.                                           |
| Memory churn per call          | Copy-construct entry + destructor on exit + GC pressure on extra handle. | Zero allocations.                                                   |
| Behaves like upstream OCCT C++ | No (lambda hides the mutation from the caller).                          | Yes (matches the C++ author's expectation).                         |
| Surprise factor                | "I called `Add(graph)`; my graph wasn't modified" — high surprise.       | "I called `Add(graph)`; my graph was modified" — expected.          |

**Verdict**: B is strictly more faithful. The only argument for A — "callers may want an unchanged input to compare against the output" — is poorly served anyway, since OCCT classes rarely overload `operator==` in JS-comparable ways. Callers needing a pre-call snapshot can call the explicit copy constructor (`new oc.Pnt(p.X(), p.Y(), p.Z())`) before invoking the mutator.

### Single path vs. dual path

Keeping both A and B and selecting based on copy-constructibility looks like belt-and-braces but adds complexity for zero observable gain: every method that A would dispatch to also works under B (B is strictly more general). Maintenance cost dominates — the dual path forces every future codegen contributor to understand two divergent shapes. Unifying on B is the simpler design.

### Performance vs. type-safety (B vs. C)

Strategy C (raw pointer + val passthrough) is 3-4 % faster than B by skipping the `val::as<T&>()` wire-cast. The cost is:

- The lambda signature becomes `(Copyable* pnt, val pntVal, …)` — two parameters representing the same logical input. Bind site is harder to read.
- `allow_raw_pointers()` opts out of embind's automatic null/lifetime checks.
- Future codegen contributors will be tempted to drop the `val pntVal` parameter and lose the identity-pass channel.

Given that the 4 % win amounts to ~30 nanoseconds per call, B is the right default. C stays available as an explicit hot-path optimisation only.

## Code Examples

### Strategy B lambda emission (target shape from `_emitOutputParamBinding`)

```cpp
// Before R1 (today, value-copy)
optional_override([](gp_Pnt pnt, const Bnd_Box& bbox) -> ::emscripten::val {
  auto ret = ClassName::Foo(pnt, bbox);          // mutates the COPY
  ::emscripten::val out = ::emscripten::val::object();
  out.set("result", ret);
  out.set("pnt", pnt);                            // fresh embind handle (a new copy)
  // shared EM_JS Symbol.dispose attached by buildFromYaml.py
  return out;
})

// After R1 (proposed, reference-passthrough)
optional_override([](::emscripten::val pntVal, const Bnd_Box& bbox) -> ::emscripten::val {
  gp_Pnt& pnt = pntVal.as<gp_Pnt&>();             // unwrap to C++ ref
  auto ret = ClassName::Foo(pnt, bbox);          // mutates IN PLACE
  ::emscripten::val out = ::emscripten::val::object();
  out.set("result", ret);
  out.set("pnt", pntVal);                         // SAME val the caller passed in
  // No Symbol.dispose unless any field is a Handle<T> output / class return
  return out;
})
```

### Mixed primitive + class lambda

```cpp
// gp_Trsf::Transforms(double& x, double& y, double& z) → primitives only — unchanged.
// New shape — gp_Ax3::Mirror(gp_Pnt& mirrored, gp_Trsf trsf)        — mixes class+primitive.
optional_override([](::emscripten::val mirroredVal, const gp_Trsf trsf) -> ::emscripten::val {
  gp_Pnt& mirrored = mirroredVal.as<gp_Pnt&>();
  ::gp_Ax3::Mirror(mirrored, trsf);
  ::emscripten::val out = ::emscripten::val::object();
  out.set("mirrored", mirroredVal);              // reference passthrough
  return out;
})
```

### Consumer ergonomics under R1

```ts
// Before R1
using out = new oc.Copyable(0, 0, 0);
using wrap = oc.mutate(out, 5); // wrap has Symbol.dispose; both must be `using`
// wrap.classOut is a SEPARATE copy. out is unchanged.

// After R1
using out = new oc.Copyable(0, 0, 0);
const wrap = oc.mutate(out, 5); // wrap is plain object; only `out` needs `using`
// wrap.classOut === out. out has been mutated in place.
```

### Pseudocode patch to `_emitOutputParamBinding`

```python
# bindings.py — replace lines ~1908–1930 (lambda_params construction)

lambda_params = []
val_arg_indices = []     # NEW: indices that need val::as decoding inside the body
passthrough_indices = [] # NEW: indices to set back into the val::object output

if not method.is_static_method():
  constPrefix = "const " if method.is_const_method() else ""
  lambda_params.append(f"{constPrefix}{classTypeName}& self")

for i, arg in enumerate(args):
  name = self._getArgName(arg, i)
  if isOutputParam(arg.type):
    pointee = arg.type.get_pointee()
    if pointee.kind == clang.cindex.TypeKind.ENUM or canonical.kind == clang.cindex.TypeKind.ENUM:
      argType = ...                              # PRIMITIVE PASSTHROUGH (status quo)
    elif _isHandleType(pointee):
      argType = ...                              # HANDLE COPY (status quo until R6)
    elif _isClassOutputParam(arg.type):          # NEW HELPER — replaces _isDefaultConstructibleClass
      argType = "::emscripten::val"              # PASS BY VAL, DECODE INSIDE BODY
      val_arg_indices.append(i)
      passthrough_indices.append((i, name))
    else:
      argType = ...
  lambda_params.append(f"{argType} {name}")

# Body: decode val args to typed refs before forwarding to the C++ call.
body_prelude = "".join(
  f"        {pointee_typename(args[i])}& {self._getArgName(args[i], i)} = "
  f"{self._getArgName(args[i], i)}__val.as<{pointee_typename(args[i])}&>();\n"
  for i in val_arg_indices
)
# … unchanged C++ call assembly …

# Container assembly — write the val handle back, NOT a fresh copy.
for i, name in passthrough_indices:
  body += f'        out.set("{name}", {name}__val);\n'

# `[Symbol.dispose]` emission gated on Handle outputs / Handle returns / class returns ONLY.
```

`_isClassOutputParam` is the renamed-and-relaxed `isClassOutputParam` (`bindings.py:336–353`). It keeps the `_isDefaultConstructibleClass` precondition but drops the copy-ctor walk — a class need only be default-constructible (so the JS caller can build one) and embind-registered (so `val::as<T&>` knows how to decode it).

## Open Questions

These do not block R1 closure but inform follow-up work:

1. ~~**Handle<T> output params (R6)**~~ — RESOLVED NEGATIVE. See [Finding 8](#finding-8-r6-spike--valassmartptrt-cannot-be-generalised-to-handlet). Smart-pointer wire decode allocates a transient per call, so reference-passthrough cannot work for Handle outputs. The shared disposer stays.
2. **C++ reassignment of non-copyable class output params** — `BRepGraph_Builder::Add` mutates the graph via member methods, not assignment. A future OCCT method that does `output = newGraph;` would require copy-assignment which deleted-copy-ctor classes lack. Per OCCT design, this never happens for non-copyable types (the deleted assignment is the upstream invariant); but the codegen should not silently rely on it. Adding a libclang assertion that flags `T& output` parameters where `T` lacks both copy and move assignment when the function body's emitted C++ does `output = …` would be defensive. Out of scope for R1.
3. **Identity-pass through nested `val` returns** — if a method returns an envelope that itself contains another envelope (nested method return), does identity propagate cleanly? OCCT's RBV-shaped methods do not nest today, but a future change to `BRepGraph_Builder.Add → BRepGraph_Builder::AddBatch` could introduce this. Worth a smoke test if/when the nested case arrives.

## References

- POC sources: `/tmp/rbv-poc/poc.cpp`, `/tmp/rbv-poc/poc2.cpp`, `/tmp/rbv-poc/handle.cpp`, `/tmp/rbv-poc/run.mjs`, `/tmp/rbv-poc/run2.mjs`, `/tmp/rbv-poc/run3.mjs`, `/tmp/rbv-poc/run-handle.mjs`.
- Toolchain: `repos/opencascade.js/deps/emsdk` (`em++ 5.0.1`, Node v24.10.0).
- Embind val internals: `repos/opencascade.js/deps/emsdk/upstream/emscripten/system/include/emscripten/val.h:517-522` (template `as<T>` dispatch through `internalCallWithPolicy<EM_INVOKER_KIND::CAST, …>`).
- Embind smart_ptr trait: `repos/opencascade.js/deps/emsdk/upstream/emscripten/system/include/emscripten/bind.h:1033-1054` (`smart_ptr_trait<std::shared_ptr<T>>::share` allocates a fresh smart-pointer per wire decode — root cause of the R6 negative result).
- Generator dispatch entry points (changes land here):
  - `repos/opencascade.js/src/bindings.py:109-157` (`_isDefaultConstructibleClass`)
  - `repos/opencascade.js/src/bindings.py:229-334` (`_isCopyConstructibleClass` — to be removed under R2)
  - `repos/opencascade.js/src/bindings.py:355-380` (`isOutputParam` — class branch relaxed)
  - `repos/opencascade.js/src/bindings.py:1880-1930` (`_emitOutputParamBinding` — primary edit site)
  - `repos/opencascade.js/src/bindings.py:4214-4224` (`_containerNeedsDispose` — TS-side mirror)
- Previous research: [`ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md) — R1 as originally framed (now superseded by the universal-reference-passthrough variant proposed here).
- Architectural background: [`ocjs-unified-rbv-blueprint.md`](./ocjs-unified-rbv-blueprint.md), [`ocjs-rbv-blueprint-p0-p1-stocktake.md`](./ocjs-rbv-blueprint-p0-p1-stocktake.md).

## Appendix

### A1: POC source layout

```
/tmp/rbv-poc/
├── poc.cpp         # Copyable + NonCopyable, strategies A/B/C
├── poc2.cpp        # Multi-class-output (B), mixed primitive+class (B)
├── handle.cpp      # R6 spike — std::shared_ptr<Curve> output param under A vs B
├── run.mjs         # Correctness + perf + double-free safety (plain classes)
├── run2.mjs        # Multi-output + mixed cases
├── run3.mjs        # `using` ergonomics + absence-of-disposer behaviour
├── run-handle.mjs  # Reassignment propagation + perf for Handle-shaped types
├── poc.mjs/.wasm   # emcc outputs (3 modules)
├── poc2.mjs/.wasm
└── handle.mjs/.wasm
```

Build command (both POCs):

```bash
source repos/opencascade.js/deps/emsdk/emsdk_env.sh
em++ -O2 -std=c++17 -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=PocModule \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16MB \
  -sENVIRONMENT=node \
  poc.cpp -o poc.mjs
```

Run: `node --expose-gc run.mjs` (the `--expose-gc` flag enables `global.gc()` for heap-delta sampling).

### A2: Raw run.mjs output (verbatim)

```
=== CORRECTNESS ===
B: caller.x after call = 11 (expected 11)
B: classOut === caller? IDENTICAL ✓
B: classOut.x = 11
B: result.sum = 36 (expected 36)

A: caller.x after call = 1 (expected 1 — unchanged)
A: classOut === caller? COPY ✓
A: classOut.x = 11 (mutated copy)

B (NonCopyable): caller.Counter() = 5 (expected 5)
B (NonCopyable): classOut === caller? IDENTICAL ✓

=== PERFORMANCE — Copyable (24-byte class) ===
A value-copy:  total 192.8ms, 0.964 µs/call, heap delta 0B
B reference:   total 136.4ms, 0.682 µs/call, heap delta 0B
C raw-pointer: total 131.2ms, 0.656 µs/call, heap delta 0B
B vs A speedup: 1.41x
C vs A speedup: 1.47x

=== PERFORMANCE — NonCopyable (8 KB payload class) ===
A value-copy:   NOT APPLICABLE (deleted copy ctor — would fail to compile)
B reference:    total 40.7ms, 0.813 µs/call, heap delta 0B
C raw-pointer:  total 38.8ms, 0.775 µs/call, heap delta 0B

=== DOUBLE-FREE SAFETY (Strategy B) ===
B: second delete on identical handle  — threw: Copyable instance already deleted
```

### A3: Why heap-delta is 0 in every case

Both A and B return `val::object()` containers that live in the embind shadow heap (JS-side data, not WASM-resident). A's "extra copy" is the C++ `Copyable` instance allocated by embind's wire-deserialiser when the lambda parameter is decoded by value — that instance is freed when `wrap.classOut.delete()` runs at the end of each loop iteration. So both strategies converge to zero residual heap _after cleanup_; the cost difference is in the **per-iteration allocate + free pair**, which manifests as wall-clock latency rather than peak memory. The 1.41× speedup quantifies that.

For methods that callers DON'T pair with an explicit `.delete()` (e.g., if the lint rule were removed), Strategy A would leak the copy and Strategy B would not — but that's an outlier scenario the lint rule is designed to prevent in the first place.

### A4: Impact on the existing EM_JS `__ocjsRbvDispose__` callback

Today `buildFromYaml.py` registers a shared EM_JS disposer (`__ocjsRbvDispose__`) and attaches it as the envelope's `[Symbol.dispose]` whenever `_containerNeedsDispose` returns true. Under R1+R3 the disposer is still emitted for envelopes that contain Handle<T> outputs or class returns, but a large fraction of OCCT methods (every class-only output param) stops needing it. The callback itself stays — no source change beyond R3's narrower triggering condition.

The R6 spike (Finding 8) confirms the disposer is **permanent**: smart-pointer outputs cannot use reference passthrough, so `__ocjsRbvDispose__` continues to free the fresh wrapper for each Handle output and each registered-class return. No "retire the disposer" cleanup is possible.

### A5: R6 spike raw output

Verbatim output of `node --expose-gc run-handle.mjs`:

```
=== SCENARIO 0: Reassignment propagation check (CORE QUESTION) ===
  caller h.Kind() === 'Circle'?  false ← THE SMOKING GUN
  w.outHandle === h?             true
  w.outHandle.Kind() = Line (expected Circle if reassignment propagates)
  Verdict: val::as<SmartPtr&>() returns a TEMPORARY — reassignment is LOST

=== SCENARIO 1: Null → freshly assigned (Strategy B) ===
before: h = Line(0)
after : h = Line(0)
w.outHandle === h ? true
w.outHandle =  Line(0)
w.result.value = 42 (expected 42)

=== SCENARIO 2: Non-null → reassigned to different concrete subclass ===
before: h.Kind() = Line | h.Value() = 7
after : h.Kind() = Line | h.Value() = 7 (expected Circle, 99)
w.outHandle === h ? true
w.outHandle.Kind() = Line

=== SCENARIO 3: Pointee mutated in place (no reassignment) ===
h.Value() = 15 (expected 15)
w.outHandle === h ? true
w.result.value = 15 (expected 15)

=== STRATEGY A (value-copy) — what does it actually do? ===
before: h.Kind() = Line | h.Value() = 7
caller h after: Kind= Line | Value= 7 (if unchanged → A produces a separate JS wrapper)
w.outHandle === h ? false
w.outHandle =  Line(42)

=== PERFORMANCE — Handle reassignment ===
A (value-copy):       139.2ms total, 1.392 µs/call
B (reference):        88.3ms total, 0.883 µs/call
B vs A speedup: 1.58x

=== DOUBLE-FREE SAFETY (B, Handle) ===
second delete: threw → BindingError: LineCurve instance already deleted
```
