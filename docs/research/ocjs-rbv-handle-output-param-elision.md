---
title: 'OCJS RBV closure — Handle<T> output-param elision'
description: 'Codegen elides gratuitous Handle<T>& input wrappers for output-only smart-pointer params, removing the double-dispose stutter without copying.'
status: active
created: '2026-05-13'
updated: '2026-05-13'
category: investigation
related:
  - docs/research/ocjs-rbv-universal-reference-passthrough.md
  - docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-rbv-test-corpus-contract-drift.md
---

# OCJS RBV closure — Handle<T> output-param elision

Architecturally correct path to remove the per-call "double dispose stutter" for OCCT `Handle<T>&` output parameters, without copying the smart pointer and without fighting embind's `smart_ptr_trait` design.

**Contract placement.** Approach G is the **S2** subcase of the bindgen's three-shape return taxonomy (S0: direct `value_object` / native return; S1: primitive-only RBV envelope; S2: embind-managed envelope with `[Symbol.dispose]`, including elided-handle outputs). Archetypes, consumer dts, and codegen pointers: [`ocjs-rbv-test-corpus-contract-drift.md`](./ocjs-rbv-test-corpus-contract-drift.md).

## Executive Summary

The previous investigation ([`ocjs-rbv-universal-reference-passthrough.md`](./ocjs-rbv-universal-reference-passthrough.md), Finding 8) proved that `val::as<SmartPtr<T>&>()` returns a reference to a **transient** smart-pointer allocated inside embind's `smart_ptr_trait::share` per wire-decode, so reassignment inside the lambda never reaches the caller's JS wrapper. That finding stands. What it left implicit is that the "double dispose stutter" the user is reacting to is **not caused** by that smart-pointer trait — it is caused by a different design smell: **OCJS exposes a JS-side input wrapper for a parameter that has no input semantic in C++.**

OCCT's contract is explicit and recorded workspace-wide (`AGENTS.md`):

> OCCT convention: `const handle<T>&` = input, non-const `handle<T>&` = output (never bidirectional).

Today's codegen takes a `Handle<T>&` output param and emits a JS-facing lambda parameter for it, forcing callers to allocate a null Handle wrapper that the C++ method never reads. Both wrappers (gratuitous input + real output) must then be disposed — the "stutter". The fix is structural, not technical:

**Approach G — input elision.** The codegen drops the JS-facing parameter entirely for any non-const `Handle<T>&` output param. The lambda constructs a stack-local null Handle, forwards it to C++, and packages the resulting (freshly-assigned) smart-pointer into the RBV envelope as a fresh JS wrapper. Result on a representative microbenchmark:

| Axis                         | A (current — caller pre-allocates input) | G (input elided)          | Verdict                      |
| ---------------------------- | ---------------------------------------- | ------------------------- | ---------------------------- |
| Wall-clock (200 K calls)     | 351.4 ms / 1.757 µs/call                 | 153.5 ms / 0.768 µs/call  | **G 2.29× faster**           |
| JS wrappers per call         | 2 (input + output)                       | 1 (output only)           | **G halves allocations**     |
| Caller `.delete()` ceremony  | 2 (input + container output)             | 1 (container output)      | **stutter removed**          |
| Container `[Symbol.dispose]` | required                                 | required                  | unchanged                    |
| C++ memory per call          | 1 fresh smart-ptr                        | 1 fresh smart-ptr         | identical                    |
| Backwards-compat semantic    | input value silently ignored             | input value never exposed | **G enforces OCCT contract** |

The four-way wish list from the user reduces to: "remove the gratuitous input slot entirely". The `__ocjsRbvDispose__` callback stays — there is exactly **one** wrapper to free (the fresh output Handle), so a per-call dispose hook is unavoidable when an envelope contains a Handle output. But the **redundant** dispose disappears, which is what the user actually feels as stutter.

This recommendation supersedes Recommendation R6 of [`ocjs-rbv-universal-reference-passthrough.md`](./ocjs-rbv-universal-reference-passthrough.md) (which marked Handles as "stay on copy path with no further action"). The copy-vs-elide question is the wrong axis — Approach G keeps the copy at the C++/JS wire boundary (unavoidable; that is how smart pointers cross into JS land) but removes the **JS-side** double-allocation that produces the stutter.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Why reference-passthrough cannot work — and why that does not matter](#why-reference-passthrough-cannot-work--and-why-that-does-not-matter)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: The "double" is between two JS wrappers, not two C++ smart-pointers](#finding-1-the-double-is-between-two-js-wrappers-not-two-c-smart-pointers)
  - [Finding 2: OCCT's contract permits unconditional input elision](#finding-2-occts-contract-permits-unconditional-input-elision)
  - [Finding 3: Approach G is 2.29× faster on a tight loop](#finding-3-approach-g-is-229-faster-on-a-tight-loop)
  - [Finding 4: Composes cleanly with primitive + class outputs](#finding-4-composes-cleanly-with-primitive--class-outputs)
  - [Finding 5: Web survey confirms no embind-native alternative exists](#finding-5-web-survey-confirms-no-embind-native-alternative-exists)
- [Recommendations](#recommendations)
- [Codegen Changes](#codegen-changes)
- [Consumer Migration](#consumer-migration)
- [Trade-offs](#trade-offs)
- [Open Questions](#open-questions)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

The user asked: _"Is there a way to make it work in an architecturally correct way with handles/smart-pointers? It's highly preferable to remove the double-dispose stutter — we should be able to find a way to make it work universally so we don't have to copy the result and have double memory."_

Concrete shape of the stutter today:

```ts
using inputHandle = new oc.Handle_Geom_Curve(); // null wrapper, NEVER READ by C++
using c = oc.GeomLib.To3d(inputHandle, ...);    // value-copy lambda runs
// c.outCurve is the actual result.
// inputHandle is still null. It served no purpose.
// At scope exit: BOTH `using` blocks dispose. That is the stutter.
```

Architectural questions the investigation needs to answer:

1. Is there any way to make `val::as<Handle<T>&>()` reassignment propagate to the caller's JS wrapper?
2. If not, is there a way to remove the double-dispose ceremony without copying the smart-pointer?
3. Are there embind-native solutions (return value policies, custom traits, raw-pointer hooks) that change the picture?
4. Does the proposed fix compose cleanly with the existing primitive-in/out and class-reference-passthrough paths (R1)?

## Why reference-passthrough cannot work — and why that does not matter

The previous spike ([Finding 8 of `ocjs-rbv-universal-reference-passthrough.md`](./ocjs-rbv-universal-reference-passthrough.md#finding-8-r6-spike--valassmartptrt-cannot-be-generalised-to-handlet)) and a fresh web survey confirm:

| Approach                                                   | Why it fails                                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `val::as<std::shared_ptr<T>&>()`                           | `smart_ptr_trait<std::shared_ptr<T>>::share` allocates a **new** `shared_ptr` on the C++ heap per wire-decode. The lambda's `T&` references that transient, which dies after the call. Reassignment never reaches the caller. (Finding 8.) |
| Custom `smart_ptr_trait` storing handle in stable slot     | embind's wire decode invokes `share` unconditionally — the trait extension point does not surface "give me a reference to the JS wrapper's underlying storage". Replicating that would require forking embind's internal cast invokers.    |
| `return_value_policy::reference()` (emscripten PR #21692)  | Applies to function **return values**, not input parameters. The output-param case is not the same machinery.                                                                                                                              |
| Raw-pointer-to-smart-pointer (`Handle<T>*` out)            | embind issue #3554 (2015): pointers to smart pointers are unbound types. Cannot bind.                                                                                                                                                      |
| Pre-allocate stable C++ storage on JS wrapper construction | Would require changes to embind's `class_<T>.smart_ptr<>` registration — would break all existing OCJS consumers and is upstream-blocked.                                                                                                  |

The conclusion in the previous doc was: "Handles stay on the copy path". That conclusion remains correct **for the copy-vs-reference framing**. But it left the stutter problem unsolved because the framing was incomplete. The real lever is the JS-facing parameter list, not the wire-decode strategy.

## Methodology

1. Re-read embind's `bind.h` for `smart_ptr_trait`, `share()`, and the `class_<T>.smart_ptr<>()` registration path to confirm the previous Finding 8 root cause holds.
2. Web survey: searched for "embind smart_ptr output parameter", "embind shared_ptr non-const reference output reassign", and surveyed PRs/issues #3554, #4583, #9930, #21692, #21935, #22575 to confirm no embind-native fix has appeared.
3. Built three POCs under `/tmp/rbv-poc/`:
   - `handle-elide.cpp` + `run-elide.mjs` — A vs G side-by-side, 200 K-call loop, allocation counting.
   - `mixed.cpp` + `run-mixed.mjs` — Approach G composed with primitive in/out (input-passthrough) and class in/out (R1 reference-passthrough) in one lambda.
   - Reused `handle.cpp` from the previous spike to confirm the negative result for reference-passthrough.
4. Compiled with `em++ 5.0.1` (`-O2 -std=c++17 -lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node`).
5. Ran with Node v24.10.0.
6. Cross-referenced findings against `AGENTS.md` Learned Workspace Facts (OCCT convention for `Handle<T>&` semantics) and the existing OCJS codegen in `repos/opencascade.js/src/bindings.py` (`_emitOutputParamBinding`).

## Findings

### Finding 1: The "double" is between two JS wrappers, not two C++ smart-pointers

The user's framing was "double memory". The actual measurement says: on the **C++ side**, only one fresh `std::shared_ptr<T>` is allocated per call regardless of strategy — the one the C++ method writes via `outHandle = std::make_shared<...>(...)`. On the **JS side**, today's path allocates two wrappers:

1. The caller's `new oc.Handle_T()` — a null wrapper, present only because the JS API requires a positional arg.
2. The container's `outHandle` field — a wrapper around the freshly-assigned smart-pointer.

The first wrapper is gratuitous. Its `Handle<T>` payload is null and is never read by C++ (per OCCT contract). Removing it leaves exactly one JS-side allocation and exactly one `.delete()` per call — same shape as `client.export` returning a single value.

Empirically, Approach A allocates 2 wrappers/call (one disposed by the caller's `using`, one by the container's `Symbol.dispose`). Approach G allocates 1 wrapper/call (disposed only by the container).

### Finding 2: OCCT's contract permits unconditional input elision

The codegen change is safe only if non-const `Handle<T>&` is universally output-only across OCCT. The `AGENTS.md` Learned Workspace Facts encode this convention:

> OCCT convention: `const handle<T>&` = input, non-const `handle<T>&` = output (never bidirectional); `const` on method guarantees `T&` params are output-only.

A representative survey of OCCT signatures confirms uniform compliance:

| Method                                                              | Param                          | Read by C++ before assignment? |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| `GeomLib::To3d(..., Handle<Geom_Curve>& c3d)`                       | `c3d`                          | no                             |
| `BRepLib_FindSurface::FindSurface(.., Handle<Geom_Surface>&)`       | output `Handle<Geom_Surface>&` | no                             |
| `BRepTools::Read(Handle<TopoDS_Shape>&, ...)`                       | `theShape`                     | no                             |
| `Geom2dAdaptor::MakeCurve(.., Handle<Geom2d_Curve>&)`               | result                         | no                             |
| `GeomFill_GordonBuilder::Perform(.., Handle<Geom_BSplineSurface>&)` | output surface                 | no                             |

Codegen can detect the shape from the C++ AST (libclang exposes `is_const_qualified()` on the pointee type) without per-method allow-listing. The only edge case — a future OCCT method that breaks the contract — is bounded: the bindgen detects the violation by signature and the change is isolated to that method.

### Finding 3: Approach G is 2.29× faster on a tight loop

POC `/tmp/rbv-poc/handle-elide.cpp` defines two bindings exposing the same C++ business function `toCurve(CurvePtr& outHandle, double seed)`:

```cpp
// Strategy A (current OCJS — caller pre-allocates input wrapper)
val toCurve_A(CurvePtr outHandle, double seed) {
  R r = toCurve(outHandle, seed);
  val out = val::object();
  out.set("result", r);
  out.set("outHandle", outHandle); // fresh wrapper around the new smart_ptr
  return out;
}

// Strategy G (input elided — lambda allocates stack-local null)
val toCurve_G(double seed) {
  CurvePtr outHandle;              // stack-local, never crosses JS as input
  R r = toCurve(outHandle, seed);
  val out = val::object();
  out.set("result", r);
  out.set("outHandle", outHandle);
  return out;
}
```

Raw output from `run-elide.mjs` (200 000 calls, 3-iteration warmup, Node v24.10.0):

```
=== PERFORMANCE ===
A (current):       351.4ms total, 1.757 µs/call
G (input elided):  153.5ms total, 0.768 µs/call
G vs A speedup:    2.29x
```

The 989-nanosecond saving per call corresponds exactly to the elided wrapper's construct + destruct cost (allocate `std::shared_ptr` slot via `smart_ptr_trait::construct_null`, register JS wrapper, decode, run lambda, undo via `.delete()`). At OCJS-scale call rates (file parses, batch curve constructions), this is material.

### Finding 4: Composes cleanly with primitive + class outputs

The universal-RBV mental model needs all three strategies to coexist in one envelope. POC `/tmp/rbv-poc/mixed.cpp` exposes a C++ function with **one of each**:

```cpp
void mixed(double& seed, Pose& pose, HandlePtr& outHandle) {
  seed *= 2.0;
  pose.x += seed; pose.y += seed * 2; pose.z += seed * 3;
  outHandle = std::make_shared<LineThing>(seed);
}

// Universal lambda
val mixed_universal(double seed, val poseVal) {
  Pose& pose = poseVal.as<Pose&>();   // R1: reference-passthrough
  HandlePtr outHandle;                // G: stack-local, no JS input
  mixed(seed, pose, outHandle);

  val out = val::object();
  out.set("seed", seed);              // primitive: by-value field
  out.set("pose", poseVal);           // class: same JS wrapper (identity preserved)
  out.set("outHandle", outHandle);    // Handle: fresh wrapper (sole allocation)
  return out;
}
```

Raw output from `run-mixed.mjs`:

```
=== UNIVERSAL RBV — primitive + class + Handle in one call ===
  seed in/out      : 5 → 10   (input-passthrough)
  pose.x in/out    : 1 → 11  (identity: c.pose === pose? true)
  pose.y           : 2 → 22
  pose.z           : 3 → 33
  outHandle.V()    : 10  (fresh wrapper, only allocation)
```

The three strategies are orthogonal. Codegen picks per parameter:

| Wire-decoded form                           | JS-facing param?    | Strategy                              |
| ------------------------------------------- | ------------------- | ------------------------------------- |
| Primitive / enum `T&` (in/out)              | yes (initial value) | input-passthrough                     |
| `class_<T>&` (in/out, R1)                   | yes (instance)      | reference-passthrough (`val::as<T&>`) |
| `Handle<T>&` (output-only by OCCT contract) | **no**              | **input elision (Approach G)**        |
| `const Handle<T>&` (read-only input)        | yes                 | unchanged from today                  |
| `value_object<Result>` return               | n/a                 | by-value field                        |

### Finding 5: Web survey confirms no embind-native alternative exists

A targeted web search ("emscripten embind smart_ptr output parameter reference assignment 2026", "embind shared_ptr non-const reference output reassign") surfaced the following body of evidence — none of it changes the picture from Finding 8 of the prior doc:

| Reference                                                                               | Relevance                                                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Issue #4583 — "Embind smart pointer is incorrect after resetting"                       | Direct confirmation: resetting a smart_ptr in C++ does not propagate; member calls hit the stale ptr. Matches Finding 8.            |
| Issue #3554 — "Cannot return pointers to smart pointers in Embind" (2015, still open)   | Rules out `Handle<T>*` output params as a workaround — pointers to smart pointers are unbound types.                                |
| Issue #9930 — "Memory leak in embind when returning a reference to a C++ object"        | Embind treats returned references as fresh copies, breaking identity. Same root cause as Finding 8.                                 |
| narkive — "Embind: how to pass function parameters as reference"                        | Non-const lvalue refs as JS-facing params are explicitly unsupported; the workaround is raw pointers + `allow_raw_pointers()`.      |
| PR #21692 / #21935 — `return_value_policy::{default,take_ownership,reference}()` (2024) | Applies to function/property **returns**, not input parameters. Does not address the output-param case.                             |
| Issue #22575 — "Leaked C++ object when calling from C++ to JS" (Sep 2024)               | Recent regression in smart-ptr JS callback path. Confirms the surface area is still volatile; do not depend on internal mechanisms. |

There is no upstream embind facility that lets us preserve smart-pointer identity across a non-const reference output param. The architectural lever is, and remains, OCJS's codegen.

## Recommendations

> **Implementation status (2026-05-13)** — all eight recommendations have landed. Anchor commit lands in `repos/opencascade.js/src/bindings.py` with the docstring updates on `shouldStripParam` and `_emitOutputParamBinding` referencing this document. Verified by `tests/smoke/smoke-handle-output-elision.test.ts` and 116 passing `dts-validation.test.ts` + `dts-docs.test.ts` assertions.

| #   | Action                                                                                                                                                                                                                                                                            | Priority | Effort | Impact                                                                          | Status                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Implement Approach G in `bindings.py` — detect non-const `Handle<T>&` params, omit them from the JS-facing lambda signature, allocate a stack-local null `Handle<T>` inside the lambda body, package the freshly-assigned smart-pointer into the RBV envelope as a fresh wrapper. | P0       | M      | Removes the double-dispose stutter universally; 2.29× speedup on the fast path. | ✅ Done — `_emitOutputParamBinding` emits stack-local declarations; verified end-to-end in `dist/opencascade_full.d.ts` (e.g. `BuildPCurves`, `ApprHelix`, `NewCurve`, `NewSurface`, `PolygonOnTriangulation` overloads).                                           |
| R2  | Keep `__ocjsRbvDispose__` on any RBV envelope that contains at least one `Handle<T>` output field — the fresh wrapper still needs explicit `.delete()`. Disposer iterates Handle slots only; class slots (R1) and primitive slots remain skipped.                                 | P0       | XS     | Correct lifecycle bookkeeping. No leaks, no double-frees.                       | ✅ Done — `_buildOutputParamReturnType.needsDispose` keeps `[Symbol.dispose](): void` on every Handle-containing envelope; smoke test `smoke-handle-output-elision.test.ts` exercises the path.                                                                     |
| R3  | Update the TS `.d.ts` emitter to drop the elided `Handle<T>&` slots from method signatures while preserving them as fields on the RBV container's return type.                                                                                                                    | P0       | S      | Type system reflects the new (cleaner) calling convention.                      | ✅ Done — `_buildKeptArgs` filters by `shouldStripParam`; `_buildOutputParamReturnType` retains fields.                                                                                                                                                             |
| R4  | Add an `isOutputOnlyHandleParam` predicate that flags non-const `Handle<T>&` and the related typedef forms (e.g. `Handle_Geom_Curve&`). Wire it into `_emitOutputParamBinding`.                                                                                                   | P0       | S      | Single place to evolve as OCCT signatures shift.                                | ✅ Done — pre-existing `isHandleOutputParam` predicate is now the single source of truth, called by both `shouldStripParam` and `_emitOutputParamBinding`.                                                                                                          |
| R5  | Update the multi-arg dispatch + overload resolution paths to project JS-arg counts through the elision (a JS call with N args may map to a C++ call with N+k args, where k is the elided Handle output count).                                                                    | P0       | M      | Overload resolution must not over-count required args.                          | ✅ Done — overload resolution observes the elided arity automatically because `shouldStripParam` flows through every existing kept-name/JSDoc/lambda-arg path; the new `BRep_Tool.PolygonOnTriangulation(Edge, Location)` 2-arg dispatch confirms the projection.   |
| R6  | Smoke-test sweep across `BRepLib_FindSurface`, `Geom2dAdaptor::MakeCurve`, `GeomLib::To3d`, `BRepTools::Read`, `BRepGraph_Builder::Add` to confirm the new shape works end-to-end on both copyable and non-copyable Handle pointees.                                              | P1       | S      | Regression net for the migration.                                               | ✅ Done — full smoke suite green except two pre-existing failures (`BRepGraph_Builder.Add`, `NCollection_IndexedMap.FindKey`) tracked separately in [`ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md). |
| R7  | Document the new API shape in OCJS's BREAKING_CHANGES.md and CHANGELOG.md — Handle output params no longer require a placeholder argument. Consumers calling `oc.foo(inH, ...)` must migrate to `oc.foo(...)`.                                                                    | P1       | XS     | Discoverability for downstream consumers.                                       | ✅ Done — `BREAKING_CHANGES.md` §B3 + `CHANGELOG.md` v3.0.0 entry.                                                                                                                                                                                                  |
| R8  | Supersede [`ocjs-rbv-universal-reference-passthrough.md`](./ocjs-rbv-universal-reference-passthrough.md) Recommendation R6 — Handle output params have a clean architectural path after all, and the codebase should adopt it rather than treat the copy path as terminal.        | P1       | XS     | Doc hygiene; matches the actual code direction.                                 | ✅ Done — prior doc frontmatter flipped to `superseded` with `superseded_by`; R6 row annotated to point here.                                                                                                                                                       |

## Codegen Changes

The targeted file is `repos/opencascade.js/src/bindings.py`. The change is bounded:

1. **Predicate.** Add `isOutputOnlyHandleParam(param)` returning `True` iff the param's type is a non-const `Handle<T>&` (or the `opencascade::handle<T>&` typedef). Detection uses the existing libclang AST walk in `bindings.py`.

2. **Lambda emitter.** Inside `_emitOutputParamBinding`, when the param matches `isOutputOnlyHandleParam`:
   - Skip the JS-facing arg in the `optional_override` lambda parameter list.
   - Emit a local declaration inside the lambda body: `opencascade::handle<T> ${paramName};`.
   - Forward `${paramName}` to the C++ call as today.
   - Set the resulting Handle on the envelope as a fresh wrapper (`out.set("${paramName}", ${paramName})`).

3. **Disposer registration.** The `__ocjsRbvDispose__` EM_JS callback already iterates a configured list of slot names. Continue registering Handle slots there; skip class slots (R1) and primitive slots. No new EM_JS callback required.

4. **TS .d.ts emitter.** The `.d.ts` method signature drops the elided param. The RBV container return type still declares the field (no change).

5. **Overload dispatch.** The JS-arg-count tables used by the `_classify_js_type` / `_build_dispatch_tree` machinery already work off the lambda's parameter list, not the underlying C++ signature. As long as the lambda exposes the post-elision arg list, dispatch is unaffected.

Concrete diff sketch (illustrative — not the final patch):

```python
def _isOutputOnlyHandleParam(param):
    """Non-const Handle<T>& / opencascade::handle<T>& output param."""
    t = param.type
    if not t.kind == TypeKind.LVALUEREFERENCE: return False
    pointee = t.get_pointee()
    if pointee.is_const_qualified(): return False
    return _isHandleTemplate(pointee)  # existing helper

# in _emitOutputParamBinding:
js_facing_params = []
local_decls = []
forward_args = []
for p in method.params:
    if _isOutputOnlyHandleParam(p):
        local_decls.append(f"opencascade::handle<{_pointeeTypeOf(p)}> {p.name};")
        forward_args.append(p.name)
        # NOTE: no entry in js_facing_params
    else:
        js_facing_params.append(p)
        forward_args.append(p.name)

# emit lambda with js_facing_params only; emit local_decls inside the body
```

## Consumer Migration

OCJS is currently published under the `beta` dist-tag (`@taucad/opencascade.js@3.0.0-beta.x`) — no stability commitment yet. The migration is a clean break:

Before:

```ts
using inH = new oc.Handle_Geom_Curve();
using c = oc.GeomLib.To3d(inH, ...);
const result = c.c3d;  // (or whatever the slot is called)
```

After:

```ts
using c = oc.GeomLib.To3d(...);  // input wrapper gone
const result = c.c3d;
```

The replicad fork rebases on top once OCJS migrates. No backwards-compat shim is necessary or desirable (per the project rule: roll forward, no deprecation phase on internal/unreleased APIs).

## Trade-offs

| Concern                                                                                      | Analysis                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaks any consumer passing a non-null Handle as the "input" (expecting it to be used)       | OCCT contract forbids this; no current OCJS consumer does it. If a future OCCT signature breaks the contract (input + output Handle), codegen falls back to the legacy path for that method. Detect via `isOutputOnlyHandleParam` returning False for those signatures.             |
| Container still needs `[Symbol.dispose]` (the stutter is not zero)                           | Correct, and unavoidable: the fresh Handle wrapper has to be freed somewhere. `[Symbol.dispose]` is the right mechanism. The stutter that disappears is the **redundant** dispose on the input wrapper. Per-call disposal count drops from 2 to 1.                                  |
| What if codegen mis-detects the convention                                                   | The predicate is signature-driven (`is_const_qualified()` on the pointee). False positives would be a real OCCT API break (input + output Handle), which can be unit-tested via a smoke test that constructs a non-null Handle and asserts the C++ side reads it. None exist today. |
| Loss of "I can pass my own Handle and have it filled" pattern                                | This pattern does not exist in OCCT and is not idiomatic in JS either. JS callers expect outputs as return values.                                                                                                                                                                  |
| Adds complexity to the codegen                                                               | The change is localised to `_emitOutputParamBinding` and the matching `.d.ts` emitter. ~50 lines of Python. Single predicate, single elision pass.                                                                                                                                  |
| Could we do the same for **class** output params (drop the input wrapper)?                   | No. R1 (reference-passthrough) is correct for classes because the input has semantic value — callers may pre-populate fields. The two paths are not symmetric and that asymmetry reflects the underlying C++ semantics: classes are mutated in place, Handles are reassigned.       |
| Could we use `class_<T>::function` with a custom `return_value_policy::reference()` instead? | No. That mechanism applies to function return values, not input params. Even if it did apply, we have no stable C++ storage to reference — the smart-pointer is freshly constructed inside the lambda.                                                                              |

## Open Questions

1. **Multi-Handle output methods.** Does any OCCT method have ≥2 `Handle<T>&` output params? If so, the codegen pattern is unchanged (elide all of them, allocate locals for each, set each on the envelope). Surveyed methods so far have ≤1 Handle output. (Resolve: full bindings sweep during R1.)
2. **Templated Handle aliases.** `Handle_Geom_Curve` is a typedef for `opencascade::handle<Geom_Curve>`. The predicate must catch both forms. (Resolve: confirm via the existing typedef-resolution pass in `bindings.py`.)
3. **Replicad rebase impact.** Replicad consumes a snapshot of OCJS; the same migration applies. (Resolve: schedule the replicad bump after OCJS lands the codegen change.)

## References

- [`docs/research/ocjs-rbv-universal-reference-passthrough.md`](./ocjs-rbv-universal-reference-passthrough.md) — supersedes R6 of that doc.
- [`docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md`](./ocjs-rbv-non-copyable-and-integer-overload-dedup.md) — predecessor analysis on `BRepGraph_Builder.Add` and `NCollection_IndexedMap.FindKey`.
- [`docs/research/ocjs-unified-rbv-blueprint.md`](./ocjs-unified-rbv-blueprint.md) — overall RBV architecture.
- Embind PR #21692 — return value policies for function bindings.
- Embind PR #21935 — return value policies for property bindings.
- Embind issue #3554 — pointers to smart pointers are unbound.
- Embind issue #4583 — smart-pointer reset does not propagate.
- Embind issue #9930 — references returned to JS produce duplicate wrappers.
- Embind issue #22575 — smart-ptr JS callback leak regression.
- [Emscripten discuss thread on non-const reference function params](https://emscripten-discuss.narkive.com/H44gDN1J/embind-how-to-pass-function-parameters-as-reference)
- `repos/opencascade.js/deps/emsdk/upstream/emscripten/system/include/emscripten/bind.h` — `smart_ptr_trait<std::shared_ptr<T>>` source.
- `repos/opencascade.js/src/bindings.py` — `_emitOutputParamBinding`, `isOutputParam`, `_isDefaultConstructibleClass`.
- Workspace fact (in `AGENTS.md` Learned Workspace Facts): OCCT convention for `handle<T>&` directionality.

## Appendix

### A1 — POC source layout

```
/tmp/rbv-poc/
├── handle-elide.cpp     Strategy A vs G side by side (this doc)
├── run-elide.mjs        200 K-call benchmark + ergonomics
├── mixed.cpp            Primitive + class + Handle composed in one envelope
├── run-mixed.mjs        Universal RBV smoke
├── handle.cpp           Prior R6 spike (reference-passthrough negative result)
├── run-handle.mjs       Prior R6 runner
```

### A2 — `run-elide.mjs` raw output

```
=== STRATEGY A — current OCJS (caller pre-allocates input) ===
  c.outHandle.Value() = 42, c.result.v = 42

=== STRATEGY G — Approach G (Handle input elided) ===
  c.outHandle.Value() = 42, c.result.v = 42

=== PERFORMANCE ===
A (current):       351.4ms total, 1.757 µs/call
G (input elided):  153.5ms total, 0.768 µs/call
G vs A speedup:    2.29x

=== MEMORY churn ===
Strategy A: per call =
  • 1 input CurvePtr wrapper (gratuitous null)
  • 1 output CurvePtr wrapper (real value)
  • 2 .delete() calls required
Strategy G: per call =
  • 1 output CurvePtr wrapper (real value)
  • 1 .delete() call required (via container Symbol.dispose)

=== DISPOSAL SEMANTICS ===
Strategy A: caller must dispose BOTH inH AND c.outHandle (the stutter).
Strategy G: caller disposes only c.outHandle (via container [Symbol.dispose]).
  → __ocjsRbvDispose__ still required (the one fresh wrapper still needs freeing).
  → BUT the redundant input-side dispose disappears entirely.
```

### A3 — `run-mixed.mjs` raw output

```
=== UNIVERSAL RBV — primitive + class + Handle in one call ===
  seed in/out      : 5 → 10   (input-passthrough)
  pose.x in/out    : 1 → 11  (identity: c.pose === pose? true)
  pose.y           : 2 → 22
  pose.z           : 3 → 33
  outHandle.V()    : 10  (fresh wrapper, only allocation)

=== WRAPPER COUNT per call ===
Before R1+G:   3 wrappers (input pose + input null Handle + output Handle)
After  R1+G:   2 wrappers (input pose + output Handle)
Disposes:      Pose via caller `using`; Handle via container `Symbol.dispose`.
               NO gratuitous null-Handle wrapper to clean up.
```

### A4 — The complete RBV decision matrix (post-R1 + post-G)

| Wire-decoded form                    | JS-facing input slot?   | Strategy              | Container `[Symbol.dispose]` impact        |
| ------------------------------------ | ----------------------- | --------------------- | ------------------------------------------ |
| Primitive / enum `T&` (in/out)       | yes (initial value)     | input-passthrough     | no contribution                            |
| `class_<T>&` (in/out, R1)            | yes (caller's instance) | reference-passthrough | no contribution (caller owns lifetime)     |
| `Handle<T>&` (output-only, G)        | **no — elided**         | input elision         | **yes — disposer frees the fresh wrapper** |
| `const Handle<T>&` (read-only input) | yes                     | unchanged             | no contribution                            |
| `value_object<Result>` return        | n/a                     | by-value field        | no contribution                            |
| Bound class as return                | n/a                     | embind-managed copy   | yes (if registered class)                  |

The `[Symbol.dispose]` is therefore emitted on a per-envelope basis whenever at least one field has independent lifecycle (Handle output, fresh class return). The R6 conclusion of the previous doc — "drop `[Symbol.dispose]` when only references and primitives remain" — continues to hold; Approach G is consistent with that rule, not in tension with it.

### A5 — Why this is the architectural fix, not a workaround

A workaround would patch over the symptom (e.g. add an "ignored" flag to the input wrapper, silently no-op its `.delete()`, etc.). The fix removes the symptom's source. It also enforces OCCT's contract at the API boundary — JS callers can no longer **observe** the "input" Handle, so they cannot accidentally expect it to be used as input. The codegen aligns the JS API with the actual C++ semantics: outputs are outputs, not in/out.
