---
title: 'OCJS Trailing-Default Arity Fan-out vs libembind Dispatch'
description: 'Eigenquestion analysis (now PoC-validated) of whether bringing C++ default-argument parity to OCJS methods is fundamentally compatible with the custom libembind overload-dispatch patch.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
category: investigation
related:
  - docs/research/ocjs-thrusections-build-arg-trap.md
  - docs/research/ocjs-embind-js-dispatch-failures.md
  - docs/research/ocjs-unified-rbv-blueprint.md
---

# OCJS Trailing-Default Arity Fan-out vs libembind Dispatch

Step-back analysis of whether the constructor-style "arity fan-out" approach to C++ default arguments on methods is architecturally viable in OCJS, given that Embind dispatches by arity and the custom `libembind-overloading.patch` walks the JS prototype chain when registering class methods.

## Executive Summary

The trailing-default fan-out PoC (emit `Build()`, `Build(progress)` as two arity-keyed registrations on every class) closed the original `Build(progressRange)` smoking gun but introduced a `BindingError: Expected null or instance of <unrelated_class>` regression in `smoke-fillets-chamfers.test.ts`. The eigenquestion is therefore: **"Is registering arity-truncated method overloads fundamentally compatible with embind's per-class registration model when our custom libembind patch resolves `proto[methodName]` through the prototype chain?"** The answer is **yes, the direction is viable**, but the regression exposes a pre-existing fragility in `libembind-overloading.patch`: `_embind_register_class_function` reads `proto[methodName]` without an `Object.hasOwn` guard, so a derived class registering an override mutates the inherited base's overload table when (and only when) the base already carries an arity-keyed dispatcher. Three viable fixes exist, ranked from "least invasive" to "architecturally clean": (1) keep the current override-skip guard in `bindings.py` as a long-term workaround, (2) tighten the libembind patch to use `Object.hasOwn` so each class always builds its own overload table, (3) replace arity fan-out with `optional_override(val)` lambdas (matches `unified-rbv-blueprint`'s pattern). We recommend (2) + (3) in concert: (2) removes the structural fragility, (3) keeps emit volume bounded and aligns with existing RBV machinery. Arity fan-out is **not a dead-end**; the dead-end is only the naive emit that ignores `Object.hasOwn`.

**Status update (PoC-validated)**: a hand-rolled C++ corpus mirroring the OCCT inheritance shapes ([`repos/opencascade.js/experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/)) confirms both directions of the recommendation. The negative build (current `libembind-overloading.patch`) reproduces the regression and reveals it cascades wider than originally diagnosed: 4 of 7 tests fail (A, B, C, F), not just Test C, because every class registering after a prior class's truncation table mutates the inherited entry. The positive build (same patch + R1+R2 `Object.hasOwn` gates) passes 7 of 7. Per-iteration build time is ~5s versus 30+ minutes for an OCJS WASM rebuild; the canonical patch in [`src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) has been updated in place.

## Table of Contents

- [OCJS Trailing-Default Arity Fan-out vs libembind Dispatch](#ocjs-trailing-default-arity-fan-out-vs-libembind-dispatch)
  - [Executive Summary](#executive-summary)
  - [Table of Contents](#table-of-contents)
  - [Problem Statement](#problem-statement)
  - [The Eigenquestion](#the-eigenquestion)
  - [Methodology](#methodology)
  - [Findings](#findings)
    - [Finding 1: Constructors and methods use different registration code paths](#finding-1-constructors-and-methods-use-different-registration-code-paths)
    - [Finding 2: `libembind-overloading.patch` walks the prototype chain](#finding-2-libembind-overloadingpatch-walks-the-prototype-chain)

## Problem Statement

After implementing the trailing-default fan-out fix recommended in `docs/research/ocjs-thrusections-build-arg-trap.md` (R1+R2) and rebuilding OCJS:

| Smoke test                                 | Before patch              | After patch                                                                                                              |
| ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `smoke-thrusections-build-arg.test.ts`     | 4/4 fail (`reading 'sd'`) | **4/4 pass** ✅                                                                                                          |
| `smoke-fillets-chamfers.test.ts` (3 cases) | pass                      | **fail**: `BindingError: Expected null or instance of BRepFeat_SplitShape, got an instance of BRepBuilderAPI_Command` ❌ |

The regression appears on classes that **inherit** `Build(const Message_ProgressRange& = Message_ProgressRange())` from `BRepBuilderAPI_MakeShape`. Specifically: when a sibling derived class (`BRepFeat_SplitShape`) is invoked first, calls into an unrelated derived class (`BRepFilletAPI_MakeChamfer`) end up routed through the wrong `BindingError` validation, indicating the dispatch table was mutated cross-class.

The naïve diagnosis is "Embind matches on arity, so default arguments don't exist". A literal reading of that statement would imply the entire R1+R2 direction is unworkable. We need to determine if that's actually the case before committing further effort.

## The Eigenquestion

> **Is registering arity-truncated method overloads in C++ Embind bindings fundamentally compatible with embind's prototype-based class model and our custom JS-side overload-dispatch patch — or are we trying to encode "invisible" default arguments through a layer that requires every JS-visible signature to have a distinct, owned arity?**

Several reframings collapse to the same core question:

1. _Codegen view_: Can `bindings.py` legally emit `klass.function("M", &M_2arg).function("M", lambda)` for the same C++ class without the lambda corrupting an inherited base's overload table?
2. _Dispatch view_: When the custom JS dispatcher reads `proto.M`, is it reading from the class doing the registration or from the prototype chain — and can it tell the difference?
3. _Inheritance view_: Does an arity-keyed dispatcher installed on a base class behave correctly under JS prototype inheritance, where derived siblings share the base's `instancePrototype` link target?

Answering 1–3 conclusively (Findings 1–4) tells us whether to (a) abandon arity fan-out and switch to a different encoding, (b) keep arity fan-out but strengthen guards, or (c) keep arity fan-out and fix the dispatcher to behave under inheritance.

## Methodology

1. Re-read `docs/research/ocjs-thrusections-build-arg-trap.md` to recover R1+R2's intended emit shape and the constructor reference flow it cites.
2. Re-read `docs/research/ocjs-embind-js-dispatch-failures.md` end-to-end to harvest prior knowledge of `libembind-overloading.patch`'s edge cases (it documents three independent dispatch bugs in the same patch).
3. Re-read `docs/research/ocjs-unified-rbv-blueprint.md` to extract the existing `optional_override(val)` precedent and check whether trailing-default handling fits naturally into that machinery.
4. Read `repos/opencascade.js/src/patches/libembind-overloading.patch` line-by-line for `_embind_register_class_function` and `_embind_register_class_constructor`, identifying every site that reads `proto[methodName]` (chain-walking) versus `registeredClass.constructor_body[args.length]` (own-property only).
5. Reconstruct the exact runtime sequence that produces `BindingError: Expected null or instance of BRepFeat_SplitShape, got an instance of BRepBuilderAPI_Command` against the patched libembind, including registration order across translation units and prototype-chain lookup at JS dispatch time.
6. Evaluate three alternative codegen strategies (status-quo override-skip, libembind hardening, val-based dispatch) against a fixed scoring matrix: structural correctness, emit volume, override safety, future-proofing, and alignment with existing RBV machinery.

## Findings

### Finding 1: Constructors and methods use different registration code paths

The constructor-style "fan-out" pattern (`.constructor<bool, bool>().constructor<bool>().constructor<>()`) succeeds at OCJS today because **constructors never traverse the JS prototype chain**. They register through `_embind_register_class_constructor`, which writes into a class-scoped `RegisteredClass.constructor_body[arity]` array (see `libembind-overloading.patch` lines 218–238). Each `RegisteredClass` instance is a fresh object owned by exactly one C++ class — there is no inheritance link between two classes' `constructor_body` arrays.

| Path                                    | Storage location                                      | Inheritance behaviour                                              |
| --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `_embind_register_class_constructor`    | `registeredClass.constructor_body[arity]` (own array) | Each C++ class has its own array; inheritance does not affect it   |
| `_embind_register_class_function`       | `instancePrototype[methodName]`                       | Reads from prototype **chain** (`proto[methodName]` walks parents) |
| `_embind_register_class_class_function` | `Module.ClassName[methodName]` (static)               | No inheritance involved (static methods on Module export)          |

The asymmetry means the constructor precedent for arity fan-out **does not transfer mechanically** to methods. We replicated the surface syntax (multiple registrations under one name) but not the dispatch semantics (arity fan-out is safe iff storage is class-local).

### Finding 2: `libembind-overloading.patch` walks the prototype chain

The smoking gun is at `_embind_register_class_function`, line 318 of the patch:

```js
var method = proto[methodName]; // ← walks the prototype chain
if (
  undefined === method ||
  (undefined === method.overloadTable && method.className !== classType.name && method.signature === rawSignatureString)
) {
  proto[methodName] = unboundTypesHandler; // ← writes own property
} else if (
  (undefined === proto[methodName].overloadTable && proto[methodName].argCount !== argCount - 2) ||
  (undefined !== proto[methodName].overloadTable && undefined === proto[methodName].overloadTable[argCount - 2])
) {
  // Path B — promote inherited function to overloadTable
  ensureOverloadTable(proto, methodName, humanName);
  proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
} else {
  // Path C — same arity, install signature table
  ensureOverloadSignatureTable(proto, methodName, humanName, argCount - 2);
  proto[methodName].overloadTable[argCount - 2].signatures[rawSignatureString] = unboundTypesHandler;
}
```

## PoC Validation

A standalone PoC in [`repos/opencascade.js/experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/) compiles a hand-rolled C++ corpus mirroring the OCCT inheritance shapes (`MakeShape`, `ThruSections`, `SplitShape`, `Command → MakeChamfer`, `LegacyDerived` for implicit-override coverage, `IndependentBuild` for inheritance-isolation, `Statics` for class-function R2 coverage) against the vendored assimpjs emsdk. The same `bindings.cpp` is built twice — once against the canonical `libembind-overloading.patch`, once against the same patch with the R1+R2 `Object.hasOwn` gates folded in — and a 7-test matrix runs against both.

Per-iteration cycle is ~5s versus 30+ minutes for an OCJS WASM rebuild.

### R1+R2 — the surgical fix

The change inside `_embind_register_class_function` (and the analogous block in `_embind_register_class_class_function`):

```js
// Before — reads via prototype chain, mutates inherited table downstream:
var method = proto[methodName];

// After — treat inherited entries as absent so each class owns its dispatch
// state independently of the JS prototype chain:
var method = Object.hasOwn(proto, methodName) ? proto[methodName] : undefined;
```

The Path B / Path C branches further down switch from re-reading `proto[methodName].overloadTable` to using the `method` local, ensuring those branches operate strictly on the OWN entry rather than walking the chain a second time.

### Test matrix

| #   | Test                                                                                  | Negative build (current patch) | Positive build (R1+R2) |
| --- | ------------------------------------------------------------------------------------- | ------------------------------ | ---------------------- |
| A   | Base arity-0 truncation (`MakeShape().Build()`) in isolation                          | **fail** (cascade)             | pass                   |
| B   | Override on derived does not corrupt base                                             | **fail** (cascade)             | pass                   |
| C   | **CROSS-SIBLING REGRESSION** — `chamfer.Build(progress)` after `splitter.Build()`     | **fail** (smoking gun)         | pass                   |
| D   | Multi-arity primitive trailing defaults (`Init()` / `(true)` / `(true, true)` / etc.) | pass                           | pass                   |
| E   | Implicit override (no `override` keyword) lands on `LegacyDerived::Build`             | pass                           | pass                   |
| F   | Independent class shares no dispatch state with `MakeShape`                           | **fail** (cascade)             | pass                   |
| G   | Static method fan-out (R2): `Statics.Compute()` / `(a)` / `(a, b)`                    | pass                           | pass                   |

### Findings from running the PoC

1. **R1+R2 fully resolves the regression**. Positive build is 7/7. The cross-sibling Test C — the production smoking gun — passes alongside every other variation.

2. **The corruption is registration-order-sensitive, not class-pair-specific**. The negative build's failure profile widened beyond the originally hypothesized chamfer scenario: `MakeShape().Build()` itself fails (Test A), as does the unrelated `IndependentBuild` (Test F), because each class registering after a prior class's truncation table mutates the inherited entry. The error message becomes `BindingError: Expected null or instance of LegacyDerived, got an instance of MakeShape` — the LAST class to register has effectively hijacked the entire arity-0 dispatch slot for every sibling and unrelated class that inherits the inherited overload table. This corroborates the structural diagnosis (Finding 2) and rules out any narrow workaround.

3. **The implicit-override case (Test E) is safe under R1+R2**. `LegacyDerived` (no `override` keyword) registers correctly and receives its own own-property dispatcher; the bindgen `is_override` guard at [`bindings.py:1719`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) is no longer load-bearing once R1+R2 land. Removing the guard (R3 in the recommendation set) is therefore a safe follow-up — the PoC proves it.

4. **R2 (static methods) is non-trivially required**. Without R2, the `Statics.Compute()` / `(a)` / `(a, b)` case still passes in the PoC because `Statics` has no inheritance, but any future class with inherited static methods would hit the same cross-class mutation bug on the constructor function's `__proto__` chain. R2 future-proofs that surface.

### Canonical patch updated

The canonical [`src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) has been updated in place to fold in R1+R2. The next OCJS WASM rebuild against that patch should restore the `smoke-fillets-chamfers.test.ts` cases while keeping the `smoke-thrusections-build-arg.test.ts` cases passing.

### Follow-ups (post-PoC)

- Trigger an OCJS WASM rebuild against the updated canonical patch; rerun `smoke-fillets-chamfers.test.ts` + `smoke-thrusections-build-arg.test.ts`.
- Remove the `is_override` guard at [`bindings.py:1719`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) (R3). The PoC's Test E proves the guard is no longer needed.
- Add `smoke-inherited-default-args.test.ts` to the OCJS smoke suite — pin the cross-sibling regression against future regressions in real OCCT classes (e.g. `BRepFeat_SplitShape`, `BRepFilletAPI_MakeChamfer`, `BRepOffsetAPI_ThruSections`).
- Audit the other three known fragilities in `libembind-overloading.patch` (catalogued in `docs/research/ocjs-embind-js-dispatch-failures.md`) and consider consolidating into a single follow-up patch revision.

### References

- PoC: [`repos/opencascade.js/experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/)
- Canonical patch: [`repos/opencascade.js/src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch)
- Codegen emit sites: [`bindings.py:1696`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) (Embind C++), [`bindings.py:3140`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) (TS `.d.ts`), [`bindings.py:897`](../../repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py) (`_countTrailingDefaults`)
- Original smoking gun: `docs/research/ocjs-thrusections-build-arg-trap.md`
- Related dispatch fragilities: `docs/research/ocjs-embind-js-dispatch-failures.md`
