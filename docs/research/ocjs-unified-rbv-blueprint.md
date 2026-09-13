---
title: 'OCJS Unified RBV and Disposable Container Blueprint'
description: 'Forward-looking blueprint unifying pure-output and in/out reference params under input-passthrough RBV, attaching conditional Symbol.dispose via an EM_JS-registered shared disposer with cached val handles, and specifying the smoke + regression test coverage that locks the contract'
status: draft
created: '2026-05-12'
updated: '2026-05-13'
category: architecture
related:
  - docs/research/wasm-cpp-rbv-prior-art.md
  - docs/research/replicad-class-rbv-migration-surface.md
  - docs/research/disposable-api.md
  - docs/research/occt-unbound-symbols-audit.md
  - docs/research/ocjs-rbv-build-manifest-regressions.md
  - docs/research/ocjs-rbv-test-corpus-contract-drift.md
---

# OCJS Unified RBV and Disposable Container Blueprint

Forward-looking blueprint that consolidates every output-parameter binding under one C++-AST-driven idiom (input-passthrough RBV), wires conditional `[Symbol.dispose]()` onto multi-field return containers, and locks the contract with smoke + type + regression coverage.

**Three-shape consumer surface.** Not every method uses the RBV envelope (`S1` / `S2`): methods with no OCJS-classified output params return values directly (`S0`, e.g. nested POD `value_object` returns). The canonical breakdown of S0/S1/S2, dts examples, and test oracle lives in [`ocjs-rbv-test-corpus-contract-drift.md`](./ocjs-rbv-test-corpus-contract-drift.md); this blueprint remains the design source for input-passthrough RBV and conditional disposal.

## Executive Summary

The OCJS bindgen currently has three independent output-parameter paths (primitives, enums, handles via `value_object` RBV; user-defined class types via embind proxy-mutation; nothing for true in/out methods) and a latent class-of-bug where the primitive RBV lambda default-constructs every output before invoking the C++ method — silently zero-erasing any read-before-write parameter (`gp_Trsf::Transforms(double&, double&, double&)` is the canonical victim, mirrored across six classes).

This blueprint replaces those paths with a single AST-driven idiom — **input-passthrough RBV** — where every output parameter is also a JS-visible input parameter that is forwarded into the C++ call and packed into the `value_object` return. The unified path inherits the existing `value_object` machinery for fields, extends it to user-defined class types (`gp_Pnt`, `gp_Vec`, `Bnd_Box`, …), and fixes the read-before-write bug as a side effect — without any allow/blocklist, manual exemption table, or `@param[in,out]` Doxygen scraping.

Container disposal is decoupled: when a returned container holds at least one embind-managed field (class instance or `Handle<T>`), the bindgen emits a `val::object()` return and attaches `[Symbol.dispose]` from C++ via a shared, unbound disposer registered once at module init through `EM_JS` (CSP-strict-compatible, `-sDYNAMIC_EXECUTION=0` clean) with both the disposer `val` and the `Symbol.dispose` key cached in function-local `static val` storage. Containers whose fields are all primitives, enums, or strings stay as `value_object` POJOs with no `Symbol.dispose` (matching CanvasKit's documented convention). The shipping path resolves a V8 13.6 / Node 24.x bug that rejects `Function.prototype.bind`-produced disposers in `using` declarations — the bindgen-emitted disposer is unbound, sidestepping the bug entirely; the same disposer is forward-compatible with V8 14.1+ / Node 25+ where the bug is fixed.

Test coverage locks all three legs: smoke tests prove runtime behaviour for both pure-output and in/out methods (including the six broken `Transforms` overloads), type-level tests (`tests/*.test-d.ts`) lock the TS signature shape, and a dedicated regression test exercises the bindgen output to prevent re-introducing the legacy `{ current }` pattern or the zero-init lambda body that produced the in/out bug.

Eight open questions are catalogued at the end; none block the blueprint, but each requires explicit resolution before the implementation plan ships.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Investigation Recap](#investigation-recap)
- [Architecture Blueprint](#architecture-blueprint)
  - [Idiom: Input-Passthrough RBV](#idiom-input-passthrough-rbv)
  - [Container Disposal: Conditional `[Symbol.dispose]`](#container-disposal-conditional-symboldispose)
  - [AST-Driven Selection (no allow/blocklist)](#ast-driven-selection-no-allowblocklist)
- [Bindgen Implementation Plan](#bindgen-implementation-plan)
- [Test Coverage Plan](#test-coverage-plan)
  - [Runtime smoke tests](#runtime-smoke-tests)
  - [Type-level tests](#type-level-tests)
  - [Bindgen regression tests](#bindgen-regression-tests)
- [Migration and Rollout](#migration-and-rollout)
- [Open Questions](#open-questions)
- [References](#references)
- [Appendix 1: Affected Surface Snapshot](#appendix-1-affected-surface-snapshot)
- [Appendix 2: Q5 — Bound classes lacking a public default constructor](#appendix-2-q5--bound-classes-lacking-a-public-default-constructor)
- [Appendix 3: Q6 — `value_object` class-RBV copy-cost spike](#appendix-3-q6--value_object-class-rbv-copy-cost-spike)
- [Appendix 4: Q7 — `value_object` + JS-side `Symbol.dispose` vs `val::object()` + C++ dispose](#appendix-4-q7--value_object--js-side-symboldispose-vs-valobject--c-dispose)
- [Appendix 5: Q7 follow-up — V8 `Function.prototype.bind` root cause and the `EM_JS` CSP-safe pivot (E2)](#appendix-5-q7-follow-up--v8-functionprototypebind-root-cause-and-the-em_js-csp-safe-pivot-e2)

## Problem Statement

Three pain points surfaced during the OCCT V8 stocktake-4 closeout investigation and the R1 LProps recovery plan:

1. **Inconsistent output-param idioms.** [`src/bindings.py:109-126`](repos/opencascade.js/src/bindings.py) routes primitives/enums/handles through `value_object` RBV (stripped from JS signature, packed into return). User-defined class types (`gp_Pnt`, `gp_Vec`, `gp_Dir`, `Bnd_Box`, …) fall through unchanged to embind's default proxy-mutation, so the JS caller must allocate a target, pass it as a reference argument, and read back the mutation. The shipped `.d.ts` shows the asymmetry side-by-side on the same surface — `Geom_Curve.D1(U, P, V): void` (proxy-mutation) vs `math_FunctionWithDerivative.D1(U): {F: number; V1: number}` (RBV) for two methods with identical C++ shapes.

2. **Latent in/out class-of-bug.** [`src/bindings.py:1617-1632`](repos/opencascade.js/src/bindings.py) unconditionally emits `double name = 0;` (or `Handle<T> name;` / `EnumT name{};`) in the lambda body before forwarding the C++ call. For methods that read the reference as input before writing — `gp_Trsf::Transforms(double&, double&, double&)`, `gp_Trsf2d::Transforms`, `gp_GTrsf::Transforms`, `gp_GTrsf2d::Transforms`, `Geom_Transformation::Transforms`, `Geom2d_Transformation::Transforms` — the input is silently zero-erased and the JS method returns the transform of the origin instead of the caller's coordinate. The bug is not user-observed today because no Tau workspace or `repos/**` consumer calls the broken zero-arg overload (replicad uses the `gp_XYZ` class overload, which still works via the legacy proxy-mutation path), but the same class of bug will be reproduced for every class-typed in/out method the moment class-RBV is extended naively.

3. **Container disposal is unowned.** When a `value_object` return holds embind-managed fields (e.g. `Handle<Geom_Curve>` for `Geom2dAPI_InterCurveCurve.Segment`, or `gp_Pnt`/`gp_Vec` once class-RBV ships), the caller currently has to delete each destructured field individually. TC39's `using` declaration cannot accept a destructured pattern (TS error 1492 — rejected by committee three times in [tc39/proposal-explicit-resource-management#78](https://github.com/tc39/proposal-explicit-resource-management/issues/78)), so the ergonomic gap is real.

The user direction is explicit: adopt **input-passthrough RBV (Option B)** for unified output-parameter semantics, drive everything from C++ header semantics (not an allow/blocklist), and back the contract with comprehensive runtime + type + regression tests.

## Investigation Recap

The path to this blueprint is documented across four prior research artefacts; this section anchors the decisions back to that evidence.

| #   | Discovery                                                                                                                                                                                                               | Source                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OCJS already runs `value_object` RBV for primitives/enums/handles; class-type outputs are the only remaining gap                                                                                                        | [`tests/smoke/smoke-output-params.test.ts`](repos/opencascade.js/tests/smoke/smoke-output-params.test.ts), [`BREAKING_CHANGES.md` §B2](repos/opencascade.js/BREAKING_CHANGES.md) |
| 2   | 137 OCCT classes × 423 methods take user-defined class-type lvalue refs and would migrate under class-RBV                                                                                                               | `/tmp/rbv-survey.json` (full machine-extracted catalogue)                                                                                                                        |
| 3   | Replicad's exposure is exactly 8 call sites across 4 files (~30 LOC), zero public API change                                                                                                                            | `docs/research/replicad-class-rbv-migration-surface.md` Finding 1                                                                                                                |
| 4   | The `{ current }` proxy-mutation pattern OCJS still uses for class types is **not used by any other surveyed library** (CanvasKit, OpenCV.js, Manifold, rhino3dm, ammo.js, Box2D-WASM, Draco, assimpjs, occt-import-js) | `docs/research/wasm-cpp-rbv-prior-art.md` Finding 2                                                                                                                              |
| 5   | In/out parameters are universally caller-allocated across surveyed libraries — none default-construct input data inside the binding                                                                                     | `docs/research/wasm-cpp-rbv-prior-art.md` Finding 3                                                                                                                              |
| 6   | TC39 explicitly rejected `using { … } = expr` three times — the destructuring pattern is forbidden at the grammar level, not the runtime                                                                                | [tc39/proposal-explicit-resource-management#78](https://github.com/tc39/proposal-explicit-resource-management/issues/78), TS error 1492                                          |
| 7   | Emscripten 5.0.1 attaches `[Symbol.dispose]` to embind class prototypes automatically; OCJS already mirrors the contract in `.d.ts` via [`src/bindings.py:2910`](repos/opencascade.js/src/bindings.py)                  | `docs/research/disposable-api.md`, [`tests/types.test-d.ts:54-59`](repos/opencascade.js/tests/types.test-d.ts)                                                                   |
| 8   | The current `_emitOutputParamBinding` initialises every stripped output to `0` / `Handle()` / enum{} regardless of in/out semantics — primitive in/out bug already shipping, class-type extension would reproduce it    | [`src/bindings.py:1617-1632`](repos/opencascade.js/src/bindings.py), `dist/opencascade_full.d.ts:14562/17949/18086/13942/121297/126635`                                          |

## Architecture Blueprint

### Idiom: Input-Passthrough RBV

Every output parameter — primitive, enum, handle, or user-defined class — is exposed as **both** an input parameter on the JS signature **and** a field on the `value_object` return container. The lambda accepts the caller's value, forwards it into the C++ method by reference (so any read-before-write semantics see the real input), then packs the (possibly-mutated) value into the return struct.

This is the same idiom CanvasKit, ammo.js, Box2D, OpenCV.js (`/IO`) and rhino3dm all converge on — `docs/research/wasm-cpp-rbv-prior-art.md` Finding 3 — applied uniformly across pure-output and in/out methods so the bindgen needs no per-method classification.

**Generated C++ (single template across all output-param kinds):**

```c++
struct Geom_Curve_D1_Result {
  gp_Pnt theP;
  gp_Vec theV1;
};

value_object<Geom_Curve_D1_Result>("Geom_Curve_D1_Result")
  .field("theP", &Geom_Curve_D1_Result::theP)
  .field("theV1", &Geom_Curve_D1_Result::theV1);

class_<Geom_Curve>("Geom_Curve")
  .function("D1", optional_override(
    [](const Geom_Curve& self, double U, gp_Pnt theP, gp_Vec theV1) {
      self.D1(U, theP, theV1);            // C++ may read theP/theV1 first
      return Geom_Curve_D1_Result{theP, theV1};
    }));
```

**Generated TypeScript:**

```typescript
D1(U: number, theP: gp_Pnt, theV1: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  [Symbol.dispose](): void;
};
```

**JS consumer (pure-output, unchanged-behaviour case):**

```typescript
using P = new oc.gp_Pnt();
using V1 = new oc.gp_Vec();
using r = curve.D1(0.5, P, V1); // caller seeds defaults; D1 overwrites them
expect(r.theP.X()).toBeCloseTo(1);
// P, V1, r.theP, r.theV1 all auto-disposed at scope exit
```

**JS consumer (true in/out case — `gp_Trsf::Transforms`):**

```typescript
using coord  = new oc.gp_XYZ(10, 20, 30);   // meaningful input
using result = trsf.Transforms(coord);      // C++ reads (10,20,30), writes back
expect(result.theCoord.X()).toBeCloseTo(...);   // correct transform of (10,20,30)
```

The same lambda template works for both methods because the lambda body is `self.M(args...); return Result{...};` — it never has to decide whether the input mattered.

**Primitive overloads** (e.g. `gp_Trsf::Transforms(double&, double&, double&)`) use the identical shape, with primitive inputs:

```typescript
const { theX, theY, theZ } = trsf.Transforms(10, 20, 30); // ✓ fixed
```

Compare to today's `Transforms(): { theX, theY, theZ }` — caller has no way to pass input, lambda emits `double theX = 0; …; self.Transforms(theX, theY, theZ); return {theX, theY, theZ};` so the JS method always returns the transform of the origin.

#### Why input-passthrough (Option B) over the alternatives

The investigation considered five candidates (see `docs/research/wasm-cpp-rbv-prior-art.md` Findings 1-3 for the cross-library survey):

| Option                                          | Description                                                                       | Reason rejected                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A — Pure-output RBV (default-init in lambda)    | Today's shape extended to class types                                             | Reproduces the existing `Transforms` zero-init bug for every class-typed in/out method, with no signal to the JS consumer            |
| **B — Input-passthrough RBV**                   | Caller passes every output as an input, lambda forwards by ref, returns container | **Chosen.** Unifies the codepath, fixes the in/out bug, requires no per-method classification, matches industry idiom                |
| C — Allowlist exemption (`keep_proxy_mutation`) | Pure-output RBV for most, legacy `{ current }` for in/out                         | Preserves the OCJS-unique pattern indefinitely; manual list drifts; allowlist contradicts "driven by C++ header semantics" directive |
| D — Doxygen `@param[in,out]` scraping           | Pure-output RBV for `[out]`, P3 wrapper for `[in,out]`                            | OCCT's Doxygen tagging coverage is partial; misses unannotated headers; introduces a new failure mode (annotation drift)             |
| E — Caller-allocated WASM heap pointer (P4)     | Pass `uintptr_t`, read back via `HEAPF32`                                         | Highest authoring complexity, lowest per-call overhead — not justified when OCCT call cost dominates anyway                          |

Option B is the only choice that satisfies all three user constraints simultaneously: **(1)** unified semantics (one codepath), **(2)** no allow/blocklist, **(3)** entirely driven by C++ header semantics (a non-const lvalue ref is the only thing the bindgen needs to detect).

#### What changes vs today

| Surface                                                               | Today (after R1's primitive RBV)                   | Under Option B                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pure-output primitive (`Surface.Bounds(U1&,U2&,V1&,V2&)`)             | `Bounds(): {U1,U2,V1,V2}`                          | `Bounds(U1?: number, U2?: number, V1?: number, V2?: number): {U1,U2,V1,V2}` — defaults to 0 |
| Pure-output handle (`Geom2dAPI_InterCurveCurve.Segment(i, C1&, C2&)`) | `Segment(i): {Curve1,Curve2}`                      | `Segment(i, Curve1?: Handle, Curve2?: Handle): {Curve1,Curve2}` — defaults to null handle   |
| Pure-output class (`Geom_Curve.D1(U, P&, V&)`)                        | `D1(U, P, V): void` (proxy-mutation)               | `D1(U, theP: gp_Pnt, theV1: gp_Vec): {theP,theV1,[Symbol.dispose]}`                         |
| In/out primitive (`gp_Trsf.Transforms(x&,y&,z&)`)                     | `Transforms(): {theX,theY,theZ}` (silently broken) | `Transforms(theX: number, theY: number, theZ: number): {theX,theY,theZ}`                    |
| In/out class (`gp_GTrsf.Transforms(coord&)`)                          | `Transforms(coord): void` (proxy-mutation)         | `Transforms(theCoord: gp_XYZ): {theCoord,[Symbol.dispose]}`                                 |

Two ergonomic implications:

- **Primitives and handles get back the input arg in the JS signature** that the existing primitive RBV stripped out. This is the only intentional consumer-visible breaking change beyond class-type RBV extension. Mitigation: the new input args are emitted as **optional** in the TS signature, defaulting to `0` / `null` / `EnumT.0`, so existing `surface.Bounds()` calls (current primitive RBV consumers) keep typechecking.
- **Class-typed in/out gains a copy.** The caller's `gp_XYZ` instance still exists after the call, and `result.theCoord` is a fresh copy holding the mutated values (embind `value_object` semantics). The container's `[Symbol.dispose]` disposes the returned copy; the caller's original is theirs to dispose. Documented in the disposable contract below.

### Container Disposal: Conditional `[Symbol.dispose]`

The bindgen attaches `[Symbol.dispose]()` to a `value_object` container **iff at least one field is an embind-managed type** (a registered `class_<T>` or `Handle<T>`). Primitive-only containers stay as plain POJOs.

| Field shape                                                    | Container `[Symbol.dispose]`? | Rationale                                      |
| -------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `{ U: number; V: number }`                                     | ❌ no                         | Primitives have no lifetime; matches CanvasKit |
| `{ result: boolean; UMin: number; UMax: number }`              | ❌ no                         | All POD                                        |
| `{ enum1: TopAbs_ShapeEnum; n: number }`                       | ❌ no                         | Enums marshalled as strings — no lifetime      |
| `{ theP: gp_Pnt; theV1: gp_Vec }`                              | ✅ yes                        | Both fields are embind class proxies           |
| `{ Curve1: Handle_Geom2d_Curve; Curve2: Handle_Geom2d_Curve }` | ✅ yes                        | Handles are embind-managed                     |
| `{ result: gp_Pnt; success: boolean }`                         | ✅ yes                        | Mixed — any class/handle triggers it           |

**Generated TS shape:**

```typescript
// Primitive-only — no Symbol.dispose
Bounds(U1?: number, U2?: number, V1?: number, V2?: number): {
  U1: number; U2: number; V1: number; V2: number;
};

// With class fields — Symbol.dispose attached
D1(U: number, theP: gp_Pnt, theV1: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  [Symbol.dispose](): void;
};
```

**Runtime contract:**

- `container[Symbol.dispose]()` walks every embind-managed field and calls `.delete()` (or `field[Symbol.dispose]()`) on it.
- Primitive/enum/string fields are no-ops.
- Idempotent: calling twice is safe (mirrors embind's idempotent `.delete()`).
- Container fields are **copies** of whatever the caller passed in (embind value_object copy semantics). The caller's original handles are still live; the caller manages them separately. The container's dispose covers only the returned copies.

**Mechanism (per Q7 follow-up spike — see Appendix 5).** The bindgen emits `val::object()` returns per disposable-container method, attaching `[Symbol.dispose]` from C++ via `val::module_property` lookups of a shared, unbound disposer registered once at module init through `EM_JS`. Both the disposer `val` and the `Symbol.dispose` key `val` are cached in function-local `static val` storage so per-call cost is two `val.set()` calls with pre-resolved handles — no `Function(src)` parsing, no module-property re-lookup per call, no per-method JS wrapping ceremony.

```cpp
// In BUILTIN_ADDITIONAL_BIND_CODE (compiled into the build's .o file as C++,
// EM_JS body emitted into the JS output at link time — CSP-strict compatible,
// no eval/Function constructor at runtime):

#include <emscripten/em_js.h>

EM_JS(void, ocjs_register_rbv_dispose, (), {
  Module["__ocjsRbvDispose__"] = function () {
    for (const k in this) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        if (v && typeof v.delete === 'function') v.delete();
      }
    }
  };
});

// C++11 magic-static — registration runs exactly once before first use:
static val getRbvDispose() {
  static const auto _init = []() { ocjs_register_rbv_dispose(); return 0; }();
  (void)_init;
  static val cached = val::module_property("__ocjsRbvDispose__");
  return cached;
}

static val getSymbolDispose() {
  static val cached = val::global("Symbol")["dispose"];
  return cached;
}

// In every disposable-container-returning lambda emitted by bindgen:
val out = val::object();
out.set("theP", P);
out.set("theV1", V1);
out.set(getSymbolDispose(), getRbvDispose());   // single extra line
return out;
```

The disposer is **unbound** — `Module["__ocjsRbvDispose__"]` is a plain JS function authored inside `EM_JS`. When `using` invokes `container[Symbol.dispose]()` it does so as a method call, so `this` is naturally bound to the container at call-site by standard JS method-call semantics (no `Function.prototype.bind` involved — sidesteps the V8 13.6 bound-function bug entirely; see Appendix 5). The disposer body iterates own enumerable properties and calls `.delete()` on anything that has it; primitives, enums, and the `Symbol.dispose` property itself are skipped harmlessly via duck-typing.

**Caching discipline** is enforced at both attachment sites. `val::module_property("__ocjsRbvDispose__")` (~280 ns per uncached call) and `val::global("Symbol")["dispose"]` (~280 ns per uncached call) are each resolved exactly once per build and cached in function-local `static val` storage. Lambdas call `getRbvDispose()` / `getSymbolDispose()` rather than re-resolving either inline. Removing this discipline costs ~23% per RBV call (verified — see Appendix 5).

**Alternatives rejected (see Appendix 5 for the empirical comparison matrix):**

- `value_object` + JS post-prelude wrap (Appendix 4's tentative recommendation) — requires a separate `post.js` file, `--post-js` build flag, and per-method `__ocjsWrapRbvMethod(...)` codegen synchronised with `bindings.py`. The `EM_JS` path delivers the same V8 13.6 compatibility while keeping the entire mechanism in `bindings.py`/`BUILTIN_ADDITIONAL_BIND_CODE` with zero new build-pipeline file types.
- `val::object()` + C++ `val::set(Symbol.dispose, disposer.call<val>("bind", out))` — the original V5b PoC. Throws `TypeError: Symbol(Symbol.dispose) is not a function` on `using` in Node 24.x because V8 13.6 rejects `Function.prototype.bind`-produced functions in `using`'s callability check. The `.bind(out)` was gratuitous — JS method-call semantics already provide `this` at the call site.
- `val::global("Function")(src)` cached (Option E) — works but requires `-sDYNAMIC_EXECUTION=1`. Some OCJS consumers (Chrome extensions, strict-CSP web apps) need `=0`; `EM_JS` is unconditionally CSP-clean.
- Embind free function via `emscripten::function("...", &cppFn)` — produces an unbound JS callable that `using` accepts, but the embind invoker drops `this`, so the C++ disposer can't iterate the container. Useful as a sanity check (Appendix 5 V7) but not a viable disposer transport.

**Why this matters for `using` ergonomics:**

```typescript
// Without container Symbol.dispose (legacy / primitive-only)
const r = curve.D1(0.5, P, V);
try {
  use(r.theP, r.theV1);
} finally {
  r.theP.delete();
  r.theV1.delete();
}

// With container Symbol.dispose (Option B + class fields)
using r = curve.D1(0.5, P, V);
use(r.theP, r.theV1);
// theP, theV1 auto-disposed via container at scope exit
```

`using { theP, theV1 } = curve.D1(...)` is still a TC39 grammar error (TS 1492) regardless of whether the container has `[Symbol.dispose]` — that limitation does not affect this design, but it's the reason the container-level dispose is worth the codegen complexity. One binding covers N fields.

**`DisposableStack` interop** stays available for the unusual cases where multiple containers from sequential calls need to be aggregated:

```typescript
using stack = new DisposableStack();
for (const u of params) {
  stack.use(curve.D1(u, new oc.gp_Pnt(), new oc.gp_Vec())); // container goes onto the stack
}
```

`stack.use(container)` calls `container[Symbol.dispose]()` at scope exit, which in turn walks the container fields. No new helper needed.

### AST-Driven Selection (no allow/blocklist)

Every routing decision is derived from a single libclang predicate already present in [`src/bindings.py:109`](repos/opencascade.js/src/bindings.py):

```python
def isOutputParam(arg_type):
  """Non-const lvalue reference, pointee not const, pointee not raw pointer."""
  ...
```

The blueprint extends the predicate's pointee-type branch to recognise **default-constructible registered class types** in addition to primitives, enums, and handles. Concretely:

```python
def _isDefaultConstructibleClass(pointee):
  decl = pointee.get_declaration()
  if decl is None or decl.kind not in (CursorKind.CLASS_DECL, CursorKind.STRUCT_DECL,
                                       CursorKind.CLASS_TEMPLATE):
    return False
  ctors = [c for c in decl.get_children()
           if c.kind == CursorKind.CONSTRUCTOR
           and c.access_specifier == AccessSpecifier.PUBLIC]
  return any(len(list(c.get_arguments())) == 0 for c in ctors) or not ctors  # implicit default
```

Routing table (all branches mechanical, AST-only, **no manual list**):

| AST shape                                                       | Detection                                                  | Codegen action                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Non-const lvalue ref to primitive                               | `pointee.spelling in builtInTypes`                         | Input-passthrough RBV; field type = primitive; no container dispose                       |
| Non-const lvalue ref to enum                                    | `TypeKind.ENUM`                                            | Input-passthrough RBV; field type = enum string; no container dispose                     |
| Non-const lvalue ref to `opencascade::handle<T>`                | `_isHandleType(pointee)`                                   | Input-passthrough RBV; field type = handle; **container dispose**                         |
| Non-const lvalue ref to registered, default-constructible class | `_isDefaultConstructibleClass(pointee)` and class is bound | Input-passthrough RBV; field type = class; **container dispose**                          |
| Non-const lvalue ref to class without default ctor              | Same predicate returns `False`                             | Fall through to existing pass-by-ref binding (legacy embind proxy-mutation); rare in OCCT |
| Pointer parameter, `T*`                                         | `isRawPointerParam`                                        | Skip (existing behaviour)                                                                 |
| Const lvalue ref `const T&`                                     | `pointee.is_const_qualified()`                             | Input only — no RBV machinery                                                             |

No method-name allowlist exists. No `@param[in,out]` Doxygen scraping. No per-class exemption file. A method's routing is a pure function of its libclang AST.

**Why this satisfies the user constraint.** The directive was "not rely on an allow/blocklist (i.e. be entirely driven by C++ headers/semantics)". The C++ header semantics the bindgen now leans on are:

1. The parameter is a non-const lvalue reference. (Already detected.)
2. The pointee type is registered in the binding manifest and is default-constructible. (New AST check.)

Both signals come from the headers themselves; neither requires human curation.

## Bindgen Implementation Plan

Concrete bindgen edits, all in [`repos/opencascade.js/src/bindings.py`](repos/opencascade.js/src/bindings.py).

| #       | Module                                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | LOC est.    |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **B1**  | `isOutputParam` (line 109)                             | Add 4th branch: registered, default-constructible class type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | +12         |
| **B2**  | `shouldStripParam` (line 166)                          | **No change in name**, but semantics flip: under Option B, output params are NOT stripped — they appear in the JS signature as inputs. Rename to `isOutputParam` consumers (`_getJsArity`, `_getJsVisibleArgs`, `_emitRbvCollisionDispatch`) so the "kept arg + appears in return" status is explicit                                                                                                                                                                                                                                                                                                                                                              | +25 / −15   |
| **B3**  | `_ensureResultStruct` (line 1478)                      | Field-type resolver branch for class types: `cppType = pointee.get_canonical().spelling.strip()`; field gets registered with `class_<T>` reference, not `value_object` field-of-value_object                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | +12         |
| **B4**  | `_emitOutputParamBinding` (line 1587)                  | **Replace** the entire lambda body that emits `double name = 0;` etc. with the input-passthrough template: every output param is a lambda parameter, forwarded by reference into the C++ call, then captured by-value into the return struct                                                                                                                                                                                                                                                                                                                                                                                                                       | +20 / −18   |
| **B5**  | New helper `_containerNeedsDispose(struct_fields)`     | Returns `True` iff any field's `cppType` resolves to a registered `class_<T>` or `Handle<T>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | +18         |
| **B6**  | `_emitOutputParamBinding` post-amble                   | When `_containerNeedsDispose` returns True, emit a single extra line at the end of the per-method lambda: `out.set(getSymbolDispose(), getRbvDispose());` (where `out` is the `val::object()` return). The lambda's return shape switches from `value_object` to `val::object()` for disposable-container methods only — primitive-only containers stay on `value_object` (faster + no `Symbol.dispose` needed). The class-RBV TS types are preserved via manual `.d.ts` overlays in `bindings.py` (the existing `.d.ts` synthesis layer already handles this; `value_object`'s auto-typing is not load-bearing because OCJS owns the `.d.ts` emitter end-to-end). | +14         |
| **B7**  | New C++ helper block in `BUILTIN_ADDITIONAL_BIND_CODE` | One-time `EM_JS(void, ocjs_register_rbv_dispose, (), { Module["__ocjsRbvDispose__"] = function () { /* iterate own enumerable props, call .delete() on anything that has it */ }; });` block plus `getRbvDispose()`/`getSymbolDispose()` C++ accessors with `static val` caching and a C++11 magic-static `_init` lambda guaranteeing one-shot registration before first call. CSP-strict (`-sDYNAMIC_EXECUTION=0`) clean — `EM_JS` bodies are emitted as normal named JS functions at link time, no `eval`/`Function(src)` at runtime.                                                                                                                            | +28         |
| **B8**  | New JS post-prelude (post.js)                          | **Removed** — no `post.js` file, no `--post-js` build flag, no per-method JS-side wrap codegen, no `__ocjsWrapRbvMethod(...)` helper. The Appendix 5 follow-up spike isolated V8 13.6's `using` rejection as a transient `Function.prototype.bind` bug (fixed upstream in V8 14.1 / Chrome 137 / Node 25+) and verified that an unbound `EM_JS`-registered disposer works on V8 13.6, V8 14.1+, and CSP-strict builds — collapsing the entire B8 surface into B7's single-block C++ registration.                                                                                                                                                                  | 0 (deleted) |
| **B9**  | `processMethodOrProperty` TS emitter                   | Update `_buildOutputParamReturnType` to (a) include output params in the input arg list as optional with sensible defaults, (b) include `[Symbol.dispose](): void` in the return type literal when `_containerNeedsDispose` is True                                                                                                                                                                                                                                                                                                                                                                                                                                | +35         |
| **B10** | New JSDoc emitter helper                               | Attach `@param {T} [name] - Output buffer; pass a fresh instance to receive the result.` to each output param input arg, so Monaco surfaces the semantic to consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | +15         |

**Total estimate.** ~225 lines added / ~33 lines removed in `bindings.py`, plus ~45 LOC of one-time C++/JS prelude. Same Nx-cached `generate → compile-bindings → link` chain as R1; no `compile-sources` regression. WASM rebuild dominates (30-60 min warm cache; ±1h surprise budget for ABI mismatches during the codegen swap).

**Build manifest impact.** The structural shape of the manifest (`build-manifest.json`) stays unchanged: output-param methods continue to bind, just with the new lambda body. `_resultStructDefs` and `_resultStructRegistrations` keep their current emission slots. The bindgen-side validation tests (B-tier in `docs/research/ocjs-rbv-build-manifest-regressions.md`) should not need updating except to assert the new lambda body shape.

**No `bindgen-filters.yaml` changes.** No `keep_proxy_mutation` list, no per-method exemptions. Every routing decision is in `bindings.py`.

## Test Coverage Plan

Three tiers, mirroring OCJS's existing pattern (smoke + type + bindgen-output validation):

### Runtime smoke tests

Extend [`tests/smoke/smoke-output-params.test.ts`](repos/opencascade.js/tests/smoke/smoke-output-params.test.ts) and add new files covering classes the existing suite doesn't reach.

**`tests/smoke/smoke-output-params.test.ts` — extend existing file**

Add three new `describe` blocks:

1. **`Class-typed output params (pure-output)`** — proves the new path for `gp_Pnt&` / `gp_Vec&` / `gp_Dir&` outputs.
   - `Geom_Circle.D1(0): {theP, theV1}` on unit circle at origin → assert `theP.X() ≈ 1, theP.Y() ≈ 0, theV1.Magnitude() ≈ 1, theV1.X() ≈ 0, theV1.Y() ≈ 1`.
   - `Geom_SphericalSurface.D1(0, 0, ...): {theP, theD1U, theD1V}` → assert points on the sphere surface, tangents perpendicular to the radius.
   - `BRepGProp_Face.Normal(u, v, P, VNor): {theP, theVNor}` → assert outward-facing normal for each face of a unit box.
2. **`Class-typed in/out params`** — proves the in/out class case works, locks the fix for the historical proxy-mutation idiom.
   - `gp_Trsf.Transforms(coord)` with translation `(5, 0, 0)` and input `gp_XYZ(1, 2, 3)` → assert `result.theCoord.X() ≈ 6, Y() ≈ 2, Z() ≈ 3`.
   - `gp_GTrsf.Transforms(coord)` with affine scale `2x` and input `gp_XYZ(1, 2, 3)` → assert `result.theCoord.X() ≈ 2`.
   - `gp_Trsf2d.Transforms(coord)` analogue.
   - `gp_GTrsf2d.Transforms(coord)` analogue.
3. **`Primitive in/out params (regression for Transforms zero-init bug)`** — proves the existing latent bug is fixed.
   - `gp_Trsf.Transforms(x, y, z)` with `(1, 2, 3)` input and translation `(5, 0, 0)` → assert `{theX: 6, theY: 2, theZ: 3}`.
   - `gp_Trsf2d.Transforms(x, y)`, `gp_GTrsf.Transforms(x, y, z)`, `gp_GTrsf2d.Transforms(x, y)`, `Geom_Transformation.Transforms`, `Geom2d_Transformation.Transforms` — same shape, one assertion each.
   - **Why this is critical:** these six overloads are the smoking gun for the in/out bug class; this is the first time any smoke test will exercise them with a non-origin input.

**`tests/smoke/smoke-output-params-disposal.test.ts` — new file**

Locks the `[Symbol.dispose]` container contract end-to-end:

```typescript
describe('Container Symbol.dispose semantics', () => {
  it('disposes class fields when the container is consumed by using', () => {
    using P = new oc.gp_Pnt();
    using V = new oc.gp_Vec();
    let containedP: gp_Pnt;
    {
      using r = curve.D1(0.5, P, V);
      containedP = r.theP;
      expect(typeof containedP.delete).toBe('function');
    }
    // r.theP/.theV1 are now disposed; calling delete() again should be safe (idempotent)
    expect(() => containedP.delete()).not.toThrow();
  });

  it('does not attach Symbol.dispose to primitive-only containers', () => {
    const bounds = sphere.Bounds();
    expect(bounds[Symbol.dispose]).toBeUndefined();
  });

  it('attaches Symbol.dispose when at least one field is a class', () => {
    const r = curve.D1(0.5, new oc.gp_Pnt(), new oc.gp_Vec());
    expect(typeof r[Symbol.dispose]).toBe('function');
  });

  it('Symbol.dispose is idempotent', () => {
    const r = curve.D1(0.5, new oc.gp_Pnt(), new oc.gp_Vec());
    r[Symbol.dispose]();
    expect(() => r[Symbol.dispose]()).not.toThrow();
  });

  it('DisposableStack interop disposes the container fields', () => {
    using stack = new DisposableStack();
    for (let i = 0; i < 10; i++) {
      stack.use(curve.D1(i / 10, new oc.gp_Pnt(), new oc.gp_Vec()));
    }
    // 10 containers, 20 fields — all auto-disposed at scope exit
    // (assertion: no GC pressure / no leak — covered by referenceTypes.test.ts existing suite)
  });
});
```

**`tests/smoke/smoke-local-properties-curve.test.ts` + `smoke-local-properties-surface.test.ts` — new files** (already in R1 plan)

The LProps classes (`BRepLProp_CLProps`, `GeomLProp_CLProps`, `BRepLProp_SLProps`, `GeomLProp_SLProps`, `HLRBRep_SLProps`) are the first consumers of class-typed RBV inside OCJS itself. Their smoke tests use the new idiom from day one:

```typescript
using pnt = new oc.gp_Pnt(1, 0, 0);
using props = new oc.GeomLProp_CLProps_3(circle, 0, 2, 1e-6);
using tangentResult = props.Tangent(new oc.gp_Dir(0, 0, 1)); // seed; will be overwritten
expect(tangentResult.theD.X()).toBeCloseTo(0, 5);
expect(tangentResult.theD.Y()).toBeCloseTo(1, 5);
```

(Full curve + surface coverage per the R1 plan's smoke test specification.)

### Type-level tests

Extend [`tests/output-params.test-d.ts`](repos/opencascade.js/tests/output-params.test-d.ts) and add new files.

**`tests/output-params.test-d.ts` — extend existing file**

```typescript
describe('Input-passthrough RBV (Option B) — class-typed outputs', () => {
  it('should accept seed args and return populated container', () => {
    expectTypeOf<Geom_Curve['D1']>().parameters.toEqualTypeOf<[U: number, theP?: gp_Pnt, theV1?: gp_Vec]>();
    type R = ReturnType<Geom_Curve['D1']>;
    expectTypeOf<R>().toHaveProperty('theP');
    expectTypeOf<R>().toHaveProperty('theV1');
    expectTypeOf<R['theP']>().toMatchTypeOf<gp_Pnt>();
  });

  it('should include Symbol.dispose on containers with class fields', () => {
    type R = ReturnType<Geom_Curve['D1']>;
    expectTypeOf<R>().toHaveProperty(Symbol.dispose);
    expectTypeOf<R[typeof Symbol.dispose]>().toEqualTypeOf<() => void>();
  });

  it('should NOT include Symbol.dispose on primitive-only containers', () => {
    type R = ReturnType<Geom_Surface['Bounds']>;
    expectTypeOf<R>().not.toHaveProperty(Symbol.dispose);
  });
});

describe('In/out parameters', () => {
  it('gp_Trsf.Transforms(x, y, z) accepts primitive inputs and returns mutated values', () => {
    expectTypeOf<gp_Trsf['Transforms']>().parameters.toMatchTypeOf<[theX: number, theY: number, theZ: number]>();
    type R = ReturnType<gp_Trsf['Transforms']>;
    expectTypeOf<R>().toEqualTypeOf<{ theX: number; theY: number; theZ: number }>();
  });

  it('gp_GTrsf.Transforms(coord) accepts gp_XYZ input and returns container', () => {
    expectTypeOf<gp_GTrsf['Transforms']>().parameters.toMatchTypeOf<[theCoord: gp_XYZ]>();
    type R = ReturnType<gp_GTrsf['Transforms']>;
    expectTypeOf<R>().toHaveProperty('theCoord');
    expectTypeOf<R>().toHaveProperty(Symbol.dispose);
  });
});
```

**`tests/disposable-containers.test-d.ts` — new file**

Locks the negative + positive contract for `[Symbol.dispose]` emission:

```typescript
import { expectTypeOf, it } from 'vitest';
import type {
  Geom_Curve,
  Geom_Surface,
  Geom_SphericalSurface,
  Geom2dAPI_InterCurveCurve,
  BRepTools,
  gp_Trsf,
} from '../build-configs/opencascade_full';

it('class-field containers expose Symbol.dispose', () => {
  expectTypeOf<ReturnType<Geom_Curve['D1']>>().toHaveProperty(Symbol.dispose);
  expectTypeOf<ReturnType<Geom2dAPI_InterCurveCurve['Segment']>>().toHaveProperty(Symbol.dispose);
});

it('primitive-only containers do NOT expose Symbol.dispose', () => {
  expectTypeOf<ReturnType<Geom_Surface['Bounds']>>().not.toHaveProperty(Symbol.dispose);
  // UVBounds → all-number return
  type UVBounds = ReturnType<(typeof BRepTools)['UVBounds']>;
  expectTypeOf<UVBounds>().not.toHaveProperty(Symbol.dispose);
});

it('Symbol.dispose is callable as a zero-arg void method', () => {
  type R = ReturnType<Geom_Curve['D1']>;
  expectTypeOf<R[typeof Symbol.dispose]>().toEqualTypeOf<() => void>();
});
```

### Bindgen regression tests

Extend [`tests/dts-validation.test.ts`](repos/opencascade.js/tests/dts-validation.test.ts) with structural assertions on the generated `.d.ts`, plus add a new test that parses the generated C++ binding source to lock the lambda body shape.

**`tests/dts-validation.test.ts` — add `describe('Input-passthrough RBV invariants')`**

```typescript
it('every output-param method appears with its output args as optional inputs', () => {
  // Parse the d.ts, find all methods, assert that any method
  // whose return type is `{ ... [Symbol.dispose]?... }` has each return-field name
  // appearing as a parameter in the signature (input-passthrough).
});

it('class-field containers declare [Symbol.dispose](): void', () => {
  // Walk return-type literals; for each that names a class type as a field,
  // assert the literal also declares [Symbol.dispose](): void.
});

it('primitive-only containers do NOT declare [Symbol.dispose](): void', () => {
  // The negative case — for return-type literals whose fields are all
  // `number`/`boolean`/`string`/enum, assert the absence of Symbol.dispose.
});

it('no method declares the legacy proxy-mutation `void` return for class outputs', () => {
  // Smoking-gun regression: scan for `<name>(<args including gp_*>): void`
  // patterns where args contain a registered class type. Any match is a regression
  // back to the legacy idiom.
});
```

**`tests/bindgen-output-shape.test.ts` — new file**

Reads `dist/embind/bindings_*.cpp` (the generated C++ source) and asserts structural invariants on the lambda bodies. This is the bindgen equivalent of the `*.no-named-function-locals.policy.test.ts` workspace tests — it catches regressions in the codegen itself, not the consumer-facing surface.

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { glob } from 'tinyglobby';

const bindingFiles = await glob('dist/embind/bindings_*.cpp', { cwd: ocjsRoot });
const allSource = bindingFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

describe('Bindgen output shape (regression guards)', () => {
  it('does not emit default-initialized primitive output params', () => {
    // The bug: `double theX = 0;` in lambda body before forwarding to C++.
    // After Option B, primitive outputs come from the lambda params; no `= 0` initialization.
    // Tolerate `= 0;` only inside struct field defaults or explicit user code.
    const matches = allSource.matchAll(
      /\b(double|float|int|long|Standard_Real|Standard_Integer)\s+\w+\s*=\s*0\s*;\s*\n\s*\w+\.\w+\([^)]*\1[^)]*\)/g,
    );
    const violations = [...matches].map((m) => m[0]);
    expect(violations, 'Found legacy default-init primitive output pattern').toEqual([]);
  });

  it('does not emit default-constructed Handle output params in lambda bodies', () => {
    // The same anti-pattern for handles: `Handle_T x; self.M(x);`
    const matches = allSource.matchAll(/\bHandle_\w+\s+\w+;\s*\n\s*\w+\.\w+\([^)]*\)/g);
    const violations = [...matches].map((m) => m[0]);
    expect(violations).toEqual([]);
  });

  it('every output-param lambda forwards an input-named local to the C++ call', () => {
    // Positive shape check: the lambda parameter list and the C++ call args agree
    // on every output param name.
    // (Pattern: extract `[](Args) { self.M(args); return Result{args}; }` and verify
    // Args ⊇ return Result{} field names.)
  });

  it('does not emit { current: } proxy-mutation wrappers', () => {
    // Smoking-gun guard against the legacy idiom returning to the codebase.
    expect(allSource).not.toMatch(/val\.set\("current"|\["current"\]/);
  });

  it('every value_object with embind-managed fields registers a JS dispose wrap', () => {
    // Cross-check: for every `value_object<…>("Name")` registration whose fields
    // include a class type or Handle<T>, assert the bindgen also emits a
    // `__ocjsWrapRbvMethod(Module.<Class>.prototype, "<method>", [...fields])`
    // call into the post-prelude. The per-method registry must align with the
    // C++ value_object field list — every dispose-needing field name must appear.
    //
    // Negative regression: when the value_object's fields are all primitives /
    // enums / strings, the bindgen MUST NOT emit a __ocjsWrapRbvMethod() call
    // (matches CanvasKit's POJO contract).
  });
});
```

**`tests/dts-validation.test.ts` — add an in/out fix regression test**

```typescript
it('Transforms primitive overloads accept input coordinates (not zero-arg)', () => {
  // Negative regression: `Transforms(): { theX, theY, theZ }` is the BROKEN signature.
  for (const cls of [
    'gp_Trsf',
    'gp_Trsf2d',
    'gp_GTrsf',
    'gp_GTrsf2d',
    'Geom_Transformation',
    'Geom2d_Transformation',
  ]) {
    const sig = findMethodSignature(dts, cls, 'Transforms');
    expect(sig, `${cls}::Transforms must accept primitive inputs`).toMatch(
      /\(theX:\s*number(,\s*theY:\s*number(,\s*theZ:\s*number)?)?\)/,
    );
  }
});
```

### Test coverage matrix

| Concern                                       | Smoke (runtime)                                                      | Type (`*.test-d.ts`)                                     | Bindgen-output regression                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Class-typed pure-output works                 | `smoke-output-params.test.ts` describe(`Class-typed`) + LProps files | `output-params.test-d.ts` describe(`Class-typed`)        | `bindgen-output-shape.test.ts` lambda-shape invariant                                                       |
| Class-typed in/out works                      | `smoke-output-params.test.ts` describe(`In/out`)                     | `output-params.test-d.ts` describe(`In/out`)             | `dts-validation.test.ts` Transforms-class signature                                                         |
| Primitive in/out bug fixed                    | `smoke-output-params.test.ts` describe(`Primitive in/out`)           | `output-params.test-d.ts` Transforms primitive signature | `dts-validation.test.ts` Transforms-primitive signature + `bindgen-output-shape.test.ts` default-init guard |
| Container Symbol.dispose on class fields      | `smoke-output-params-disposal.test.ts`                               | `disposable-containers.test-d.ts` positive               | `dts-validation.test.ts` Symbol.dispose-present invariant                                                   |
| Container has NO Symbol.dispose on primitives | `smoke-output-params-disposal.test.ts` negative                      | `disposable-containers.test-d.ts` negative               | `dts-validation.test.ts` Symbol.dispose-absent invariant                                                    |
| No regression to `{ current }` proxy          | —                                                                    | —                                                        | `bindgen-output-shape.test.ts` smoking-gun guard                                                            |
| DisposableStack interop                       | `smoke-output-params-disposal.test.ts`                               | —                                                        | —                                                                                                           |

Every cell is non-empty for every concern — runtime + types + codegen all locked.

## Migration and Rollout

| Phase  | Scope                                                                                                                                                                                                                                                                                | Gate                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **P0** | Bindgen edits B1-B10; run `pnpm nx generate ocjs` + `pnpm nx test ocjs` (offline tests, no WASM rebuild)                                                                                                                                                                             | All offline tests green                                        |
| **P1** | Full WASM rebuild (`./build-wasm.sh full`), regenerate `dist/opencascade_full.d.ts`, run smoke suite                                                                                                                                                                                 | All smoke + type tests green; bindgen-output-shape tests green |
| **P2** | Bump `replicad-opencascadejs` tarball with the new WASM; regenerate `repos/replicad/packages/replicad-opencascadejs/src/replicad_single.d.ts`                                                                                                                                        | Tarball builds, `replicad_single.d.ts` reflects new signatures |
| **P3** | Patch the 8 replicad call sites per `docs/research/replicad-class-rbv-migration-surface.md`; open upstream PR to `sgenoud/replicad`                                                                                                                                                  | Replicad's own tests pass; PR opened as draft                  |
| **P4** | Audit Tau workspace for direct OCCT calls that match the migration surface (grep `\.D[0-3]\(.*gp_(Pnt\|Vec\|Dir)`, `\.Add\(.*Bnd_Box`, `\.Transforms\(`)                                                                                                                             | Workspace `pnpm typecheck` stays green                         |
| **P5** | Update `BREAKING_CHANGES.md` Section B2 with the unified decision tree + worked examples; refresh `docs/research/disposable-api.md` with container semantics                                                                                                                         | `pnpm docs:validate` green                                     |
| **P6** | Delete superseded research artefacts after the migration lands: `docs/research/ocjs-rbv-build-manifest-regressions.md` if its findings are fully absorbed; downgrade `wasm-cpp-rbv-prior-art.md` and `replicad-class-rbv-migration-surface.md` to `status: superseded` pointing here | —                                                              |

**No backwards-compat shims, no deprecation phase.** Per the workspace rule ("no backwards compatibility or deprecation paths for unreleased/internal APIs — roll forward with breaking changes"), the migration is a single-cut switchover. Consumers migrate in lockstep with the tarball bump.

## Open Questions

These are the questions that emerged during the investigation. Every question has now been resolved — five via direct user direction, three via one-shot spikes whose findings are captured in Appendices 2-4. Resolutions below are normative; the architecture sections above were updated in lockstep.

| #      | Question                                                                                                               | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | **Should output-param inputs be required or optional in the TS signature?**                                            | **Resolved — keep the blueprint proposal.** Optional with sensible defaults (`0` / `null` / `EnumT.0`) for primitives, enums, and handles (zero-source-change for current primitive-RBV consumers). Required for class-typed inputs (caller must allocate the embind handle anyway). The optionality is purely a TS-level affordance; at runtime, every parameter is forwarded into the C++ call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Q2** | **Field name for the non-void method return when output params exist.**                                                | **Resolved — use `result`.** Today's primitive RBV uses `result` (with a `return_value` collision fallback in `_ensureResultStruct:1526-1529`). Class-RBV adopts the same convention for consistency; the existing collision-avoidance branch already handles edge cases (`gp_*::Coord(int& Index)` family).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Q3** | **Should `Symbol.dispose` on the container dispose the caller's original input handles, or only the returned copies?** | **Resolved — only the returned copies.** Container `[Symbol.dispose]` walks the container's own embind-managed fields and disposes those copies. The caller's original handles stay live for the caller to dispose separately (no surprising aliasing). The disposable smoke test (`smoke-output-params-disposal.test.ts`) locks this invariant explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Q4** | **Methods that take an output param AND return a non-trivial value.**                                                  | **Resolved — yes, the `result` field is auto-disposed when it's an embind-managed type.** Consistent rule: every embind-managed field on the container (any class instance or `Handle<T>`, whether named `result` or otherwise) is included in `[Symbol.dispose]`'s walk. `BRep_Tool.Curve(edge) → {result: Handle_Geom_Curve, First, Last, [Symbol.dispose]}` is the canonical smoke-test case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Q5** | **Classes whose default ctor is private or deleted.**                                                                  | **Resolved by spike — see Appendix 2.** A one-shot scan of the shipped `dist/opencascade_full.d.ts` confirmed that **every one of the 18 distinct class types appearing as RBV output parameters has a public default constructor.** The class-RBV migration has zero affected types in the current OCJS surface. The broader bindgen audience does include 944 classes with arg-only constructors and 262 with no constructor at all — those fall outside the RBV-affected surface today but inform future scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Q6** | **Aliasing through `value_object` copy semantics — performance concern?**                                              | **Resolved by spike — see Appendix 3.** A standalone Emscripten 5.0.1 PoC compared `value_object` class-RBV against output-by-reference (alloc/delete per call). Class-RBV measured **1.150 µs/iter** vs OBR's **1.128 µs/iter** — a 2% delta inside the noise floor (std 0.07 µs). The cost is dominated by JS handle creation per output field, identical between approaches. Hot-loop opt-out via `bindgen-filters.yaml` is **not justified**; class-RBV ships uniformly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Q7** | **`emscripten::val::object()` + C++-attached `[Symbol.dispose]` vs `value_object` + JS-side postscript.**              | **Resolved by two-phase spike — pivot to `val::object()` + `EM_JS`-registered shared disposer with cached `val` handles (Option E2).** See Appendix 5 for the deep follow-up that supersedes Appendix 4's conclusion. Phase 1 (Appendix 4) found Node 24.3 throws `TypeError: Symbol(Symbol.dispose) is not a function` on `using` when the disposer is attached via `val::set(Symbol.dispose, fn.call("bind", out))` and tentatively recommended a JS post-prelude. Phase 2 (Appendix 5) isolated the actual root cause: a transient V8 13.6 bug that rejects **any** `Function.prototype.bind`-produced function in `using` — completely independent of emscripten — fixed in V8 14.1 (Node 25+, Chrome 137+). The `.bind(out)` call in the original PoC was gratuitous because `using` invokes `container[Symbol.dispose]()` as a method call (`this` is naturally the container). Pure-C++ probes (`val::global("Function")(src)`, `emscripten::function(...)`, `class_function`) all produce unbound JS callables that V8 13.6 accepts. The shipping path is `EM_JS`-registered shared disposer (CSP-strict-compatible, `-sDYNAMIC_EXECUTION=0` clean) with both the disposer `val` and the `Symbol.dispose` key cached in `static val`: **1228 ns/op median** on Node 24.3 / V8 13.6 across the full lifecycle suite (sync dispose, `using` scope exit, SuppressedError, DisposableStack). Implementation plan items B6/B7/B8 were rewritten accordingly. |
| **Q8** | **NCollection iterator-style output params.**                                                                          | **Resolved — the smoke test sounds good.** No design change required; the AST predicate continues to handle `NCollection_*&` accumulators as input-passthrough RBV inputs. The disposable smoke test (`smoke-output-params-disposal.test.ts`) explicitly asserts that `container[Symbol.dispose]()` deletes the _container's own copy_ of the NCollection handle but not the (caller-owned) elements inside it — embind's `Handle_NCollection_*` `.delete()` semantics are already non-recursive, so this is a verification step rather than a new contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## References

- `docs/research/wasm-cpp-rbv-prior-art.md` — nine-library survey establishing that input-passthrough is the industry norm and `{ current }` is OCJS-unique
- `docs/research/replicad-class-rbv-migration-surface.md` — 8-call-site replicad impact analysis and the canonical in/out edge case (`gp_GTrsf::Transforms`)
- `docs/research/disposable-api.md` — `[Symbol.dispose]` integration with embind + the TS5+ `using` declaration
- `docs/research/occt-unbound-symbols-audit.md` R1 — LProps recovery scope and the trigger for this blueprint
- `docs/research/ocjs-rbv-build-manifest-regressions.md` — the existing build-manifest checks the bindgen regression tests should extend
- [`repos/opencascade.js/src/bindings.py:109-173`](repos/opencascade.js/src/bindings.py) — current `isOutputParam` / `shouldStripParam` / `isPrimitiveOutputParam` / `isHandleOutputParam` predicates (the AST detection layer)
- [`repos/opencascade.js/src/bindings.py:1478-1668`](repos/opencascade.js/src/bindings.py) — current `_ensureResultStruct` / `_emitOutputParamBinding` (the codegen layer to refactor)
- [`repos/opencascade.js/src/bindings.py:2906-2911`](repos/opencascade.js/src/bindings.py) — current `[Symbol.dispose]` emission for `class_<T>` interfaces (the template the container path mirrors)
- [`repos/opencascade.js/tests/smoke/smoke-output-params.test.ts`](repos/opencascade.js/tests/smoke/smoke-output-params.test.ts) — current runtime contract anchor
- [`repos/opencascade.js/tests/output-params.test-d.ts`](repos/opencascade.js/tests/output-params.test-d.ts) — current type-level contract anchor
- [`repos/opencascade.js/tests/types.test-d.ts:54-59`](repos/opencascade.js/tests/types.test-d.ts) — `Symbol.dispose` on bound class regression test
- [tc39/proposal-explicit-resource-management#78](https://github.com/tc39/proposal-explicit-resource-management/issues/78) — grammar rationale for forbidding `using { … } = expr`
- [microsoft/TypeScript#55527](https://github.com/microsoft/TypeScript/issues/55527) — TS1492 enforcement of the destructuring restriction

## Appendix 1: Affected Surface Snapshot

From the catalogue at `/tmp/rbv-survey.json` (machine-extracted from OCCT headers, filtered against `build-configs/full.yml`):

- **137 bound classes** ship at least one method with a class-typed non-const lvalue reference
- **423 method signatures** change their JS surface (excluding the 4 already filtered out via `bindgen-filters.yaml`)
- **6 primitive in/out overloads** carry the latent zero-init bug today: `gp_Trsf::Transforms(double&,double&,double&)`, `gp_Trsf2d::Transforms(double&,double&)`, `gp_GTrsf::Transforms(double&,double&,double&)`, `gp_GTrsf2d::Transforms(double&,double&)`, `Geom_Transformation::Transforms(double&,double&,double&)`, `Geom2d_Transformation::Transforms(double&,double&)`

**Top-20 affected classes by method count** (representative; full catalogue in `/tmp/rbv-survey.json`):

| Class                                               | Methods      | Notes                                                                   |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `ElCLib`                                            | 48           | Elementary curve evaluators (`D0`/`D1`/`D2`/`D3` per curve family)      |
| `ElSLib`                                            | 36           | Elementary surface evaluators                                           |
| `Geom_Curve` & family                               | ~30          | Curve abstract base + concrete (Line, Circle, Ellipse, BSpline, …)      |
| `Geom_Surface` & family                             | ~25          | Surface abstract base + concrete                                        |
| `BRep_Tool`                                         | ~12          | Topology accessors (`Curve`, `Pnt`, `Tangent`, `Normal`)                |
| `Adaptor3d_Curve` / `Adaptor3d_Surface`             | ~10 each     | Adaptor evaluators (replicad consumers)                                 |
| `BRepLProp_CLProps` / `BRepLProp_SLProps` (R1)      | ~12 each     | Local differential properties — first consumer of class-RBV inside OCJS |
| `GeomLProp_CLProps` / `GeomLProp_SLProps` (R1)      | ~12 each     | Same for geometry kernels                                               |
| `HLRBRep_SLProps` (R1)                              | ~10          | Hidden-line removal surface properties                                  |
| `BRepBndLib` / `BndLib` / `BndLib_Add2dCurve`       | ~25 combined | Bounding box accumulators (in/out semantics)                            |
| `gp_Trsf` / `gp_GTrsf` / `gp_Trsf2d` / `gp_GTrsf2d` | 2 each       | The Transforms family — the in/out canonicals                           |
| `BRepGProp_Face`                                    | ~6           | Face geometric properties (replicad consumer)                           |
| `GeomAPI_ProjectPointOnSurf`                        | ~4           | Projection results                                                      |
| `BRepBlend_*`                                       | ~15 combined | Blend evaluators                                                        |

Patterns dominate: 96% pure-output (evaluators and bounds), 4% in/out (the four `Transforms` overloads and the `*Lib::Add` accumulators). Both classes route through the same input-passthrough lambda template under Option B; no per-class special-casing needed.

## Appendix 2: Q5 — Bound classes lacking a public default constructor

### Question

Are there OCCT classes in the bound surface whose default constructor is private, deleted, or absent — such that the input-passthrough RBV idiom would fail to construct them on the JS side?

### Method

Parsed the shipped `dist/opencascade_full.d.ts` (218,613 lines) directly with a regex-based class extractor and a per-class `constructor()` detector — no libclang rebuild required. The `.d.ts` is the authoritative public surface: every class that appears there has had its constructor signatures emitted by the bindgen. The classification is exhaustive (`with_default_ctor` + `with_only_arg_ctors` + `with_no_ctor` = total). Cross-referenced the result against the 18 distinct class types extracted from `/tmp/rbv-survey.json` that currently appear as non-const lvalue reference output parameters.

Tooling: `/tmp/q5-scan.py` (parser + cross-reference; reproducible in <2 s). Output: `/tmp/q5-default-ctor-scan.json`.

### Findings

**F1: every RBV-affected class type already has a public default constructor.**

The full set of 18 class types that appear as non-const lvalue references in bound OCCT methods (and would therefore be Input-Passthrough RBV inputs after Option B ships) all have a zero-arg `constructor();` line in the shipped `.d.ts`:

`gp_Vec`, `gp_Pnt`, `gp_Vec2d`, `gp_Pnt2d`, `Bnd_Box`, `Bnd_Box2d`, `gp_Dir`, `gp_Circ`, `gp_XYZ`, `TopLoc_Location`, `gp_Dir2d`, `gp_XY`, `gp_Lin`, `gp_Trsf`, `gp_Mat`, `gp_Quaternion`, `gp_Ax3`, `gp_Ax2`.

The `rbv_missing_default` array in `/tmp/q5-default-ctor-scan.json` is **empty** — no class-RBV migration is blocked by this concern, and the AST fallback branch in the bindgen routing table (`Non-const lvalue ref to class without default ctor → legacy proxy-mutation`) is never exercised by the current method surface.

**F2: the broader bindgen audience has 1206 classes that JS cannot directly `new` — but none are RBV-affected.**

| Category                                             | Class count | % of total | RBV-affected?      |
| ---------------------------------------------------- | ----------- | ---------- | ------------------ |
| Public default constructor                           | 2 963       | 71.1%      | 18 (all RBV types) |
| Argument-only constructors (no default)              | 944         | 22.6%      | 0                  |
| No constructor at all (abstract / private / deleted) | 262         | 6.3%       | 0                  |
| **Total bound classes parsed**                       | **4 169**   | **100%**   | **18**             |

The argument-only and no-constructor categories are dominated by abstract bases, registries, and helper classes (`Expr_*`, `math_*`, `IFSelect_*`, `Standard_*` callbacks) — none of which appear as output parameters in any bound method.

**F3: the AST fallback branch is documentary, not load-bearing.**

The Architecture Blueprint's routing table specifies that classes without a public default constructor fall back to legacy embind proxy-mutation. F1 shows this branch has zero matching call sites today. It remains in the bindgen as a defensive guard for future OCCT versions that might introduce new output-param signatures (e.g. v8.x adding `gp_Plane&` output to a new evaluator family — `gp_Plane` _does_ have a default constructor; this is purely hypothetical), but no current class-RBV migration step depends on it.

### No-constructor classes by family (top 10)

| Family prefix   | No-ctor count | Nature                                                      |
| --------------- | ------------- | ----------------------------------------------------------- |
| `IFSelect_*`    | 19            | STEP/IGES interface-selection registries (abstract)         |
| `Geom_*`        | 11            | Abstract curve/surface bases (`Geom_Curve`, `Geom_Surface`) |
| `IGESData_*`    | 10            | IGES protocol abstract bases                                |
| `Blend_*`       | 9             | Blend-function abstract callbacks                           |
| `Expr_*`        | 8             | Expression-tree abstract nodes                              |
| `math_*`        | 7             | Math-callback abstract bases (`math_Function`, etc.)        |
| `IMeshData_*`   | 7             | Meshing abstract data interfaces                            |
| `Geom2d_*`      | 7             | 2D abstract curve bases                                     |
| `NCollection_*` | 6             | Collection iterator/visitor abstracts                       |
| `GeomFill_*`    | 6             | Surface-filling abstract bases                              |

### Argument-only-constructor classes by family (top 10)

| Family prefix    | Arg-only count | Nature                                                       |
| ---------------- | -------------- | ------------------------------------------------------------ |
| `Expr_*`         | 49             | Concrete expression nodes (require children at construction) |
| `math_*`         | 34             | Math algorithms (require domain inputs)                      |
| `GC_*` / `gce_*` | 32 + 23        | Geometric constructors (require defining geometry)           |
| `GeomToStep_*`   | 30             | STEP exporters (require source shape)                        |
| `Standard_*`     | 29             | Exception types and proto-objects (require message strings)  |
| `OSD_*`          | 27             | OS-abstraction classes (require resource identifiers)        |
| `BOPAlgo_*`      | 27             | Boolean-operation algorithm classes                          |
| `GeomFill_*`     | 26             | Concrete surface-fillers                                     |

### Implications

- **No bindgen change required for Q5.** The AST fallback branch stays in place defensively but has no active call sites today.
- **No documentation note required in `BREAKING_CHANGES.md`** about a fallback list — there is no list.
- **Future RBV scope expansion** (e.g. surface evaluators returning `Geom_Plane&` once we ship those) should re-run `/tmp/q5-scan.py` against the regenerated `.d.ts` to confirm the new RBV-target type stays inside the default-constructible set.

## Appendix 3: Q6 — `value_object` class-RBV copy-cost spike

### Question

Returning `gp_Pnt` / `gp_Vec` / `gp_Trsf` by value through `value_object` involves embind copy-constructing the field into the struct, then marshalling the struct across the WASM/JS boundary. For methods called in tight loops (mesh evaluation, curve sampling), is this measurably more expensive than the legacy output-by-reference (OBR) pattern that mutates a caller-allocated buffer in place?

### Method

Built a standalone Emscripten 5.0.1 PoC at [`repos/opencascade.js/experiments/q67-rbv-cost/`](repos/opencascade.js/experiments/q67-rbv-cost) with:

- **`Pnt3`** and **`Vec3`** — `gp_Pnt`/`gp_Vec`-shaped (3 `double`s each, 24 bytes); both bound as `class_<T>` with default + 3-arg constructors and `.X()/.Y()/.Z()` accessors so embind treats them identically to OCCT's geometry classes.
- **`Curve::D2(double u, Pnt3& P, Vec3& V1, Vec3& V2)`** — mirrors the shape of `Geom_Curve::D2`. Body is a parametric helix (`sin`/`cos` + linear) so the optimiser can't fold the work away.
- **Six binding variants** registered on the same `Curve` class.
- Iteration count: 200,000 / repeat × 15 repeats × 20,000 warmup. Node v24.3.0.

Benchmark runner: [`run.mjs`](repos/opencascade.js/experiments/q67-rbv-cost/run.mjs). Raw numbers: [`results.json`](repos/opencascade.js/experiments/q67-rbv-cost/results.json).

### Findings

**F1: class-RBV is within noise of output-by-reference at the natural call site.**

| Variant | Description                                                         | µs/iter (median) | vs V1b OBR             |
| ------- | ------------------------------------------------------------------- | ---------------- | ---------------------- |
| V1      | OBR with **recycled** outputs (pre-allocated once, mutated forever) | 0.027            | reference (optimistic) |
| V1b     | OBR with alloc + delete per call (natural JS API ergonomic)         | **1.066**        | **1.00×**              |
| V2      | `value_object` class-RBV, property access                           | **1.127**        | **1.06×**              |
| V2b     | `value_object` class-RBV, destructuring                             | 1.103            | 1.03×                  |

`value_object` class-RBV adds **+6%** vs alloc/delete OBR — well inside the σ = 0.07 µs noise floor of either measurement. The recycled-OBR variant (V1) is 30× faster than everything else, but that gap is the same illusion documented in `docs/research/embind-return-strategy-benchmarks.md` Finding 4 — production CAD code does not pre-allocate evaluator buffers indefinitely; alloc/delete-per-call is the realistic baseline.

**F2: the cost is dominated by JS handle creation per output field, not by the `value_object` wrapper.**

V2 (class-RBV) and V1b (alloc/delete OBR) both pay for:

1. Three `Object.create(prototype)` calls inside embind's `RegisteredPointer_fromWireType` (one per `Pnt3`/`Vec3`/`Vec3`)
2. Three `attachFinalizer` calls registering each handle with `FinalizationRegistry`
3. Three `rawDestructor` calls at `.delete()` time

V2 additionally pays for the `value_object` POJO wrap (`{theP, theV1, theV2}`) and three field-getter calls (one per `.field()` registration). Each field getter is a typed function (`getterReturnType.fromWireType`) — identical to what V1b's class-handle creation does for each output. **The wrap-and-unwrap of the POJO is zero-cost.**

**F3: destructuring shaves a few % off `value_object`.**

V2b (destructured: `const { theP, theV1, theV2 } = curve.D2_value_object(u);`) measured 1.103 µs vs V2's 1.127 µs — a 2% improvement, presumably because V8's destructuring elides repeated property lookups. The difference is firmly inside the noise band.

**F4: at OCCT call rates, the absolute overhead is irrelevant.**

| Scenario                      | Calls    | Class-RBV overhead | % of typical CAD op                       |
| ----------------------------- | -------- | ------------------ | ----------------------------------------- |
| Single edge evaluator pass    | ~50      | 60 µs              | <0.01% of ~1 s shape build                |
| Dense mesh tessellation       | ~10 000  | 11 ms              | ~1% of ~1 s mesh stage                    |
| Pathological loop (synthetic) | ~100 000 | 110 ms             | ~10% — but pure C++ would dominate anyway |

The actual cost in any realistic geometry pipeline is sub-1%. No per-method opt-out (via `bindgen-filters.yaml` or otherwise) is justified.

### Implications

- **Q6 resolved: ship class-RBV uniformly.** No allowlist, no hot-method exemptions, no per-class escape hatch in `bindgen-filters.yaml`.
- **The existing `embind-return-strategy-benchmarks.md` recommendation generalises.** That research was scoped to `Handle<T>` smart pointer returns; this spike confirms the same conclusion holds for raw class types (`gp_Pnt`-style POD-on-WASM-heap).
- **Future regressions are detectable via the same harness.** `/repos/opencascade.js/experiments/q67-rbv-cost/run.mjs` is the canonical reproduction; a wrapper Nx task could be wired up post-launch if performance budgets ever shift, but is not required for the migration.

## Appendix 4: Q7 — `value_object` + JS-side `Symbol.dispose` vs `val::object()` + C++ dispose

> **⚠ Superseded by [Appendix 5](#appendix-5-q7-follow-up--v8-functionprototypebind-root-cause-and-the-em_js-csp-safe-pivot-e2).** The Phase 1 spike below correctly identified that the V5b PoC's `using` declaration throws on V8 13.6, and tentatively recommended a `value_object` + JS post-prelude wrap. Phase 2 (Appendix 5) isolated the actual root cause — a transient V8 13.6 bug rejecting `Function.prototype.bind`-produced functions in `using`, completely independent of emscripten — and showed that dropping the gratuitous `.bind(out)` from the disposer attachment makes `val::object()` + C++ dispose work on V8 13.6 too. The implementation plan now ships an `EM_JS`-registered shared disposer (Option E2) with cached `val` handles, which is CSP-strict-compatible (`-sDYNAMIC_EXECUTION=0`), keeps the entire mechanism in `bindings.py`/`BUILTIN_ADDITIONAL_BIND_CODE` with no `post.js` file, and runs at 1228 ns/op median on the broken V8 13.6. The rest of this appendix is preserved as historical record of the original PoC and the perf comparisons that informed the pivot decision.

### Question

The Container Disposal mechanism originally proposed in B6/B7/B8 of the implementation plan (pre-spike) switched from `value_object` to `emscripten::val::object()` for class-field containers so `[Symbol.dispose]` could be attached via `val::set(Symbol.dispose, …)` on the C++ side. `value_object` instances are plain `{}` JS objects with no shared prototype (per `libembind.js:_embind_finalize_value_object`'s `fromWireType: (ptr) => { var rv = {}; ... }`), so we cannot mutate a single prototype to add `[Symbol.dispose]` for all instances.

Two alternatives needed quantitative comparison:

1. **value_object + JS-side postscript** — keep `value_object` returns, attach `[Symbol.dispose]` per call via a JS-side wrapper that mutates the POJO after embind returns it.
2. **val::object() + C++ Symbol.dispose** — use `emscripten::val::object()` to construct the JS object on the C++ side, then call `out.set(Symbol.dispose, ...)` to attach a bound disposer.

### Method

Same Emscripten 5.0.1 PoC as Appendix 3, extended with four additional variants on the same `Curve::D2` shape:

| Variant | Mechanism                                                                                     | `using` compatible? |
| ------- | --------------------------------------------------------------------------------------------- | ------------------- |
| V3      | `value_object` + JS-side `withDispose(result)` wrap, manual `[Symbol.dispose]()` call         | ✓                   |
| V3b     | V3 + `using result = withDispose(...)` (lexical resource management)                          | ✓                   |
| V4      | `emscripten::val::object()` populated via `val::set("theP", P)` etc., no dispose              | n/a                 |
| V4b     | V4 + JS-side `withDispose` wrap                                                               | ✓                   |
| V5      | `val::object()` + C++ `out.set(Symbol.dispose, disposer.call<val>("bind", out))`, manual call | only manually       |
| V5b     | V5 + `using result = curve.D2_val_with_dispose(u)`                                            | ✗ **fails**         |

Iteration count: 200,000 / repeat × 15 repeats × 20,000 warmup. Node v24.3.0.

### Findings

**F1: `value_object` is faster than `val::object()` even without dispose attached.**

| Variant                           | µs/iter (median) | vs V2 (value_object, no dispose) |
| --------------------------------- | ---------------- | -------------------------------- |
| V2 — `value_object` (no dispose)  | **1.127**        | 1.00×                            |
| V4 — `val::object()` (no dispose) | 1.640            | **1.45×**                        |

V4 is **45% slower** than V2 with both variants doing the same C++ work and returning a JS object holding three `Pnt3`/`Vec3` handles. The cost difference comes from `val::object()`'s dynamic property-set path (`_emval_set_property` per field) vs `value_object`'s pre-registered field getters compiled into the embind `fromWireType` function.

This corroborates the existing `embind-return-strategy-benchmarks.md` Finding 2 (which measured Handle<T> returns, showing val::object() at 1.24×): the slowdown is even more pronounced for raw class types because each field set is independent rather than batched through the `value_object` field schema.

**F2: `value_object` + JS-side dispose wrap is faster than `value_object` alone.**

| Variant                                                             | µs/iter (median) | Notes                                         |
| ------------------------------------------------------------------- | ---------------- | --------------------------------------------- |
| V2 — `value_object` (no dispose, manual `.delete()` × 3)            | 1.127            | three separate `.delete()` calls              |
| V3 — `value_object` + JS `withDispose`, manual `[Symbol.dispose]()` | **1.069**        | one `[Symbol.dispose]()` call iterates fields |
| V3b — V3 + `using` declaration                                      | 1.171            | adds `using` overhead (small but non-zero)    |

V3 is actually 5% faster than V2 because the disposer iterates the three fields in a single function call — fewer JS↔WASM boundary crossings than three explicit `.delete()` calls. **The dispose wrap is not a tax; it's an ergonomic win.**

**F3: `val::object()` + C++ Symbol.dispose is the slowest path AND breaks `using` declarations.**

| Variant                                                | µs/iter (median) | Result                        |
| ------------------------------------------------------ | ---------------- | ----------------------------- |
| V5 — `val::object()` + C++ Symbol.dispose, manual call | 2.367            | **2.2× slower** than V3       |
| V5b — V5 + `using` declaration                         | —                | **TypeError thrown — see F4** |

The C++ path pays for `val::object()` construction + 3 × `val::set("field", val)` + 1 × `val::global("Symbol")["dispose"]` lookup + 1 × `val::module_property("__rbvDispose__")` + 1 × `disposer.call<val>("bind", out)` + 1 × `val::set(sym, boundFn)`. Every step crosses the JS↔WASM boundary independently — no batching.

**F4: V8's `using` declaration rejects C++-attached disposers.**

When V5 returns `val::object()` with a Symbol.dispose attached on the C++ side, every JS-level callability check passes:

| Probe                                                        | Result                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `typeof result[Symbol.dispose]`                              | `'function'`                                                                          |
| `result[Symbol.dispose] instanceof Function`                 | `true`                                                                                |
| `Object.getOwnPropertySymbols(result)[0] === Symbol.dispose` | `true`                                                                                |
| `Object.getOwnPropertyDescriptor(result, Symbol.dispose)`    | `{ value: [Function: bound ], writable: true, enumerable: true, configurable: true }` |
| `result[Symbol.dispose].call(result)`                        | runs successfully                                                                     |
| `using r = result;`                                          | **TypeError: Symbol(Symbol.dispose) is not a function**                               |

The TypeError is thrown by V8's `using` implementation, not by any code we authored. The bound function returned by embind's `disposer.call<val>("bind", out)` (a `Function.prototype.bind`-produced bound function) fails V8's internal `IsCallable` fast-path even though it passes every spec-mandated callability test from JS userland.

Reproduction in [`v5b-debug.mjs`](repos/opencascade.js/experiments/q67-rbv-cost/v5b-debug.mjs):

1. `plain[Symbol.dispose] = function() {...}; using x = plain` — ✓ works (plain object + plain JS function)
2. `using r = curve.D2_val_with_dispose(0.5)` (val::object() + C++-attached bound disposer) — ✗ throws
3. Copy the C++-attached disposer onto a plain object: `copy[Symbol.dispose] = result[Symbol.dispose]; using y = copy` — ✗ also throws (the _function_ itself is the problem, not the container)
4. Replace the disposer with a plain JS arrow function on the same `val::object()` container: `result[Symbol.dispose] = () => {...}; using r = result` — ✓ works (proves the val::object() container is fine; only the embind-marshalled bound function is unfit)

This is an architectural blocker: the `using` declaration is the primary ergonomic win of the entire Container Disposal mechanism. Without it, callers fall back to manual `result[Symbol.dispose]()` — which is no better than calling `.delete()` directly on each field.

### Decision

Pivot the implementation plan from `val::object()` + C++ dispose to `value_object` + JS-side postscript:

| Aspect                      | val::object() + C++ dispose                             | value_object + JS postscript                                    |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Median per-call cost        | 2.367 µs                                                | 1.069 µs (V3) / 1.171 µs (V3b with `using`)                     |
| `using` declaration support | ✗ rejected by V8                                        | ✓ works                                                         |
| Bindgen complexity          | New C++ helper + `val::module_property` lookup per call | One JS post-prelude helper + N wrap calls at init               |
| Code emitted per method     | ~12 lines C++ lambda + 4-line `val::set` block          | One line: `__ocjsWrapRbvMethod(proto, 'D1', ['theP','theV1']);` |
| AOT compilation             | Partial (val calls escape AOT)                          | Full (value_object is AOT-friendly)                             |

**`value_object` + JS-side postscript wins on every axis.** The implementation plan items B6, B7, B8 were rewritten in lockstep with this finding; the Container Disposal section was updated to specify the new mechanism.

### Implications

- **Implementation plan B7 was deleted** (no C++-side helper required); B6 stays on `value_object` and only registers methods into a JS-visible registry; B8 is the post-prelude helper that walks the registry and attaches per-instance `[Symbol.dispose]` lambdas.
- **The Q7 spike answers an additional question we didn't think to ask:** even if V8 fixes the bound-function `using` rejection in a future Node release, `value_object` is structurally faster (45% on V4 vs V2, 2.2× on V5 vs V3) and there's no path where val::object() catches up.
- **Future-proofing:** if any embind future release adds a built-in mechanism to attach `Symbol.dispose` to value_object containers directly (e.g. a `.dispose_field(...)` method on `value_object<T>`), the bindgen can swap from the JS postscript to the C++ side without changing the consumer-visible TS shape. The chosen mechanism is the smallest-blast-radius design.
- **V8 callability bug should be reported.** The discrepancy where every JS-level callability check passes but `using`'s internal check fails is worth filing upstream. Out of scope for this blueprint but tracked as a follow-up.

### TypeScript DX implications

The chosen mechanism (`value_object` + JS post-prelude that attaches a plain JS function for `[Symbol.dispose]`) directly shapes what every affected method looks like in `dist/opencascade_full.d.ts`, what IDE hover cards display, and how consumers write call sites. This subsection enumerates the seven distinct return-type shapes the bindgen emits and walks each through a concrete consumer example.

#### Seven generated signature shapes

The bindgen's emission is fully determined by two AST predicates: (1) does the method have any output parameters? (2) of those, are any embind-managed (`class_<T>` or `Handle<T>`)? The cross product produces exactly seven cells:

| #   | Shape category                   | Outputs present?           | Any embind-managed? | Container `[Symbol.dispose]`?  | Example                               |
| --- | -------------------------------- | -------------------------- | ------------------- | ------------------------------ | ------------------------------------- |
| 1   | No output params (pure return)   | No                         | n/a                 | n/a                            | `gp_Pnt.X(): number`                  |
| 2   | Pure-output primitive            | Yes                        | No                  | ✗ no                           | `Geom_Surface.Bounds`                 |
| 3   | Pure-output enum                 | Yes                        | No                  | ✗ no                           | `BRep_Tool.Continuity` (hypothetical) |
| 4   | Pure-output class                | Yes                        | Yes (class)         | ✓ yes                          | `Geom_Curve.D1`                       |
| 5   | Pure-output handle               | Yes                        | Yes (Handle)        | ✓ yes                          | `Geom2dAPI_InterCurveCurve.Segment`   |
| 6   | In/out class                     | Yes (read+write)           | Yes (class)         | ✓ yes                          | `gp_GTrsf.Transforms`                 |
| 7   | Mixed return + output (any kind) | Yes (plus non-void return) | Depends             | If any field is embind-managed | `BRep_Tool.Curve`                     |

#### Shape 1 — No output params (baseline, unchanged)

```typescript
export declare class gp_Pnt {
  constructor();
  constructor(theXp: number, theYp: number, theZp: number);
  X(): number;
  Y(): number;
  Z(): number;
  delete(): void;
  [Symbol.dispose](): void;
}
```

Unchanged from today. `[Symbol.dispose]` is already attached to every embind-bound class instance (per [`src/bindings.py:2906-2911`](repos/opencascade.js/src/bindings.py)), so individual handles already participate in `using` declarations. No migration impact.

#### Shape 2 — Pure-output primitive (`Geom_Surface.Bounds`)

```typescript
// BEFORE (today's primitive RBV, default-init bug present but unobservable)
Bounds(): { U1: number; U2: number; V1: number; V2: number };

// AFTER (input-passthrough; container has NO Symbol.dispose — all fields are primitives)
Bounds(
  U1?: number,
  U2?: number,
  V1?: number,
  V2?: number,
): { U1: number; U2: number; V1: number; V2: number };
```

**Consumer call sites:**

```typescript
// Idiomatic call — primitives don't need lifetime management
const { U1, U2, V1, V2 } = surface.Bounds();
// `using` is not needed (and is a TS5 compile error: 'using' requires an initializer
// with Symbol.dispose). The POJO has no Symbol.dispose, matching CanvasKit's contract.

// All four args remain optional; pre-existing call sites (today's primitive RBV
// consumers) keep typechecking with zero edits.
```

No `[Symbol.dispose]` on the container is the architecturally correct outcome — primitives have no lifetime, so attaching a no-op disposer would be vestigial. Q5 + Q6 both confirm we can ship this uniformly without per-method exemption.

#### Shape 4 — Pure-output class (`Geom_Curve.D1`/`D2`/`D3`)

```typescript
// BEFORE (proxy-mutation, today's class-output ergonomic)
D1(U: number, P: gp_Pnt, V1: gp_Vec): void;
D2(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
D3(U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

// AFTER (input-passthrough RBV; container has [Symbol.dispose])
D1(U: number, theP: gp_Pnt, theV1: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  [Symbol.dispose](): void;
};
D2(U: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  theV2: gp_Vec;
  [Symbol.dispose](): void;
};
D3(U: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  theV2: gp_Vec;
  theV3: gp_Vec;
  [Symbol.dispose](): void;
};
```

The input class instances are **required** (per Q1 resolution) — the caller must allocate the embind handles anyway, and `theP?: gp_Pnt` would imply a runtime can-be-null contract that the C++ method can't honour.

**Consumer call sites:**

```typescript
// Idiomatic call with `using` — one binding covers all three returned copies
using P = new oc.gp_Pnt();
using V1 = new oc.gp_Vec();
using V2 = new oc.gp_Vec();
using r = curve.D2(0.5, P, V1, V2);

console.log(r.theP.X(), r.theP.Y(), r.theP.Z()); // mutated values readable
console.log(r.theV1.X(), r.theV2.Y());

// At scope exit (in declaration-reverse order):
//   r[Symbol.dispose]()  → disposes r.theP / r.theV1 / r.theV2 (the returned copies)
//   V2[Symbol.dispose]() → disposes caller's V2
//   V1[Symbol.dispose]() → disposes caller's V1
//   P[Symbol.dispose]()  → disposes caller's P
```

```typescript
// Aggregate call across N samples — DisposableStack covers the whole loop
using stack = new DisposableStack();
const samples: Array<{ theP: gp_Pnt; theV1: gp_Vec }> = [];
for (const u of paramRange) {
  const P = stack.use(new oc.gp_Pnt());
  const V1 = stack.use(new oc.gp_Vec());
  samples.push(stack.use(curve.D1(u, P, V1)));
}
// One scope-exit cleans up 3N handles
```

```typescript
// Per-call inline ergonomic — caller does not retain inputs
using r = curve.D1(0.5, new oc.gp_Pnt(), new oc.gp_Vec());
// `new oc.gp_Pnt()` / `new oc.gp_Vec()` are positional anonymous inputs.
// They're disposed via r[Symbol.dispose]() at scope exit because the
// returned r.theP / r.theV1 are COPIES (Q3 resolution); the original
// anonymous instances leak unless the caller holds a reference.
```

**Important nuance** (called out via JSDoc per B10): the anonymous-input pattern leaks the caller's inputs because `r[Symbol.dispose]` only walks the returned container fields, not the original instances. This matches the C++ value semantic but the bindgen-emitted JSDoc warns the consumer explicitly:

```typescript
/**
 * D1: Computes the point P and the first derivative V of parameter U on
 * the curve.
 *
 * @param U Curve parameter.
 * @param theP Caller-allocated output buffer. The method writes the
 *             computed point into theP; the returned `theP` field is a
 *             fresh copy and is disposed by the container's `Symbol.dispose`.
 *             The caller's original `theP` remains live and must be disposed
 *             separately.
 * @param theV1 Caller-allocated output buffer (same lifetime contract).
 * @returns Container with copies of the mutated outputs plus `Symbol.dispose`.
 */
D1(U: number, theP: gp_Pnt, theV1: gp_Vec): {
  theP: gp_Pnt;
  theV1: gp_Vec;
  [Symbol.dispose](): void;
};
```

Monaco hover-cards now describe the dual-lifetime contract on every output-param method — significant DX improvement over today's `void`-returning proxy-mutation, where the lifetime semantics are entirely implicit.

#### Shape 5 — Pure-output handle (`Geom2dAPI_InterCurveCurve.Segment`)

```typescript
// BEFORE (already running primitive RBV, handles stripped from input)
Segment(theIndex: number): {
  Curve1: Handle_Geom2d_Curve;
  Curve2: Handle_Geom2d_Curve;
};

// AFTER (input-passthrough; container has [Symbol.dispose])
Segment(
  theIndex: number,
  Curve1?: Handle_Geom2d_Curve,
  Curve2?: Handle_Geom2d_Curve,
): {
  Curve1: Handle_Geom2d_Curve;
  Curve2: Handle_Geom2d_Curve;
  [Symbol.dispose](): void;
};
```

Handles get an **optional** signature (per Q1) — the bindgen defaults to a null handle when omitted, so existing primitive-RBV consumers (`intersector.Segment(i)`) keep typechecking. The dispose contract becomes container-driven:

```typescript
// BEFORE (existing primitive-RBV ergonomic — manual delete of each field)
const { Curve1, Curve2 } = intersector.Segment(i);
try {
  use(Curve1, Curve2);
} finally {
  Curve1.delete();
  Curve2.delete();
}

// AFTER (using-driven, one binding)
using r = intersector.Segment(i);
use(r.Curve1, r.Curve2);
// r.Curve1, r.Curve2 auto-disposed at scope exit
```

This is the most common ergonomic improvement across the surface — the `embind-return-strategy-benchmarks.md` recommendation gains its full payoff once the container carries `Symbol.dispose`.

#### Shape 6 — In/out class (`gp_GTrsf.Transforms`, the replicad call site)

```typescript
// BEFORE (proxy-mutation; caller passes a gp_XYZ that's read-then-written)
Transforms(theCoord: gp_XYZ): void;

// AFTER (input-passthrough RBV; required input forces meaningful coord)
Transforms(theCoord: gp_XYZ): {
  theCoord: gp_XYZ;
  [Symbol.dispose](): void;
};
```

The input stays required — there is no sensible default for a coordinate the method will both read and write.

**Consumer (replicad call site — `shapeHelpers.ts:r()`):**

```typescript
// BEFORE (legacy proxy-mutation, today's working path)
const coords = r(p.XYZ());
this.wrapped.Transforms(coords);
return new oc.gp_Pnt(coords);

// AFTER (input-passthrough RBV; the caller MAY destructure or use container directly)
const input = r(p.XYZ());
using { theCoord } = this.wrapped.Transforms(input);
// ⚠ TS1492 — TC39 forbids `using {…} = expr`
//   → in practice replicad will write the destructured form:
const transformed = this.wrapped.Transforms(input);
try {
  return new oc.gp_Pnt(transformed.theCoord);  // copy into the returned gp_Pnt
} finally {
  transformed[Symbol.dispose]();  // disposes the COPY of theCoord
  input.delete();                   // caller manages original separately
}
// Or, using DisposableStack for terseness:
using stack = new DisposableStack();
const input = stack.use(r(p.XYZ()));
const transformed = stack.use(this.wrapped.Transforms(input));
return new oc.gp_Pnt(transformed.theCoord);
```

The migration cost is the +1 input arg type annotation and an extra `dispose` call site (or `DisposableStack` integration). For `replicad`'s 8 affected call sites, the net diff is +~30 LOC per `docs/research/replicad-class-rbv-migration-surface.md`.

#### Shape 7 — Mixed return + output (`BRep_Tool.Curve`)

This is the Q4 case — a method with both a non-void return value AND output parameters. The bindgen packs the return value into a `result` field (per Q2 resolution) and applies the same dispose rule:

```typescript
// BEFORE (today — handle output stripped via primitive RBV; First/Last as fields)
Curve(theEdge: TopoDS_Edge): {
  result: Handle_Geom_Curve;
  First: number;
  Last: number;
};

// AFTER (Symbol.dispose added because `result: Handle_Geom_Curve` is embind-managed)
Curve(
  theEdge: TopoDS_Edge,
  First?: number,
  Last?: number,
): {
  result: Handle_Geom_Curve;
  First: number;
  Last: number;
  [Symbol.dispose](): void;
};
```

Per Q4 the `result` field is included in the container's dispose walk because it's an embind-managed type. `First` and `Last` are primitive fields and stay raw numbers.

**Consumer:**

```typescript
// Idiomatic — handle and primitives in one container with one cleanup
using r = BRep_Tool.Curve(edge);
console.log(`Parameter range: [${r.First}, ${r.Last}]`);
const point = r.result.Value(r.First).Z();
// r[Symbol.dispose]() → r.result.delete(); First/Last fields no-op
```

The same rule applies even when the embind-managed field is named `result` (the C++ method's actual return) rather than `theP` (an explicit output param). The bindgen does not special-case the `result` field — it's just another container field that happens to hold a `Handle_Geom_Curve`.

#### Cross-cutting DX: input arity asymmetry

The seven shapes share one cross-cutting decision: **input arity asymmetry between primitives/handles and class types**.

| Output param C++ type                        | TS input                 | Default          | Rationale                                                      |
| -------------------------------------------- | ------------------------ | ---------------- | -------------------------------------------------------------- |
| `double&` / `int&` / `bool&`                 | `?: number`/`?: boolean` | `0` / `false`    | Primitive RBV consumers already established this default (Q1)  |
| Enum ref (`TopAbs_ShapeEnum&`)               | `?: TopAbs_ShapeEnum`    | first enum value | Enum strings deserialise from the default                      |
| `Handle<T>&`                                 | `?: Handle_T`            | `null` handle    | Existing primitive-RBV consumers established this default (Q1) |
| Class instance ref (`gp_Pnt&`, `gp_XYZ&`, …) | required `name: T`       | n/a              | Caller must allocate an embind handle anyway (Q1)              |

This asymmetry is the only intentional consumer-visible breaking change beyond class-RBV extension. Tau workspace + replicad were both audited against the shape (`docs/research/replicad-class-rbv-migration-surface.md`); the net impact is bounded to ~30 LOC in replicad and zero in the Tau workspace.

#### Negative cases — what TS prevents at compile time

The required-class-input rule from Q1 yields a useful negative DX: TS now catches the entire category of "forgot to pass the output buffer" mistakes at compile time, where today's proxy-mutation silently allowed `surface.Bounds()` to omit args and return undefined results.

```typescript
// BEFORE: TS allowed this; runtime semantics were implicit
curve.D1(0.5);                       // ✓ compiles, ✗ runtime: missing buffers

// AFTER: TS rejects the missing inputs
curve.D1(0.5);                       // ✗ TS2554: Expected 3 arguments, but got 1
curve.D1(0.5, new oc.gp_Pnt());      // ✗ TS2554: Expected 3 arguments, but got 2
curve.D1(0.5, new oc.gp_Vec(), …);   // ✗ TS2345: gp_Vec not assignable to gp_Pnt

// Correct call typechecks
using r = curve.D1(0.5, new oc.gp_Pnt(), new oc.gp_Vec());  // ✓
```

The same wins extend to in/out class methods: `gp_GTrsf.Transforms()` (zero-arg) is now a TS2554 error rather than a silent runtime no-op.

#### `using` declaration and `await using` interop

Every disposable container's `[Symbol.dispose]` is a synchronous JS function. The `using` form covers it; `await using` (which requires `Symbol.asyncDispose`) is intentionally **not** emitted — OCJS bindings have no async cleanup paths.

```typescript
using r1 = curve.D1(0.5, P, V); // ✓ sync dispose
await using r2 = curve.D1(0.5, P, V); // ✗ TS error: Symbol.asyncDispose missing
```

This matches the Emscripten-emitted contract for individual class instances (`[Symbol.dispose]` only, no `[Symbol.asyncDispose]`) and stays consistent.

#### Type-level regression test shape

Each emitted signature is locked by [`tests/output-params.test-d.ts`](repos/opencascade.js/tests/output-params.test-d.ts) using `expectTypeOf` invariants. The new test cells for class-RBV:

```typescript
import { expectTypeOf } from 'vitest';
import type {
  Geom_Curve,
  gp_Pnt,
  gp_Vec,
  gp_XYZ,
  gp_GTrsf,
  Handle_Geom_Curve,
  BRep_Tool,
  TopoDS_Edge,
} from '@taucad/opencascade.js';

it('class-RBV containers expose Symbol.dispose', () => {
  type D1Return = ReturnType<Geom_Curve['D1']>;
  expectTypeOf<D1Return>().toMatchTypeOf<{
    theP: gp_Pnt;
    theV1: gp_Vec;
    [Symbol.dispose](): void;
  }>();
});

it('primitive-only containers do NOT expose Symbol.dispose', () => {
  type BoundsReturn = ReturnType<Geom_Surface['Bounds']>;
  expectTypeOf<BoundsReturn>().toMatchTypeOf<{
    U1: number;
    U2: number;
    V1: number;
    V2: number;
  }>();
  expectTypeOf<BoundsReturn>().not.toHaveProperty(Symbol.dispose);
});

it('in/out class inputs are required, not optional', () => {
  type TransformsParams = Parameters<gp_GTrsf['Transforms']>;
  expectTypeOf<TransformsParams>().toEqualTypeOf<[theCoord: gp_XYZ]>();
});

it('mixed return + output containers expose Symbol.dispose when any field is embind-managed', () => {
  type CurveReturn = ReturnType<BRep_Tool['Curve']>;
  expectTypeOf<CurveReturn>().toMatchTypeOf<{
    result: Handle_Geom_Curve;
    First: number;
    Last: number;
    [Symbol.dispose](): void;
  }>();
});

it('Transforms primitive overload accepts inputs (Q7 root-cause regression test)', () => {
  // The bug today: `Transforms(): { theX, theY, theZ }` zero-inits inputs.
  // Post-Q7 + input-passthrough RBV: the call accepts optional primitives.
  type TransformsParams = Parameters<gp_Trsf['Transforms']>;
  expectTypeOf<TransformsParams>().toMatchTypeOf<[theX?: number, theY?: number, theZ?: number]>();
});
```

Each cell of the test matrix in [Test Coverage Plan](#test-coverage-plan) collapses to one or two `expectTypeOf` assertions of this shape — the regression tests stay below ~80 LOC despite covering 423 affected methods, because the routing is uniform and the type literal is derived mechanically from the field set.

#### Summary

The `value_object` + JS post-prelude decision yields a TS surface that is:

- **Mechanically uniform** — seven enumerable shapes from two AST predicates, no special cases
- **`using`-native** — every container with embind-managed fields participates in lexical resource management
- **Compile-time-safe** — required class inputs catch the entire "forgot the buffer" mistake class at the TS level
- **Backwards-friendly for primitives** — optional primitive/handle inputs preserve zero-source-change for existing primitive-RBV consumers
- **JSDoc-explicit on dual-lifetime semantics** — Monaco hover cards now document the caller-vs-container ownership split explicitly

> The TS surface above is unaffected by the Appendix 5 pivot — the same seven shapes are emitted regardless of whether the runtime path is `value_object` + JS post-prelude (Phase 1 recommendation) or `val::object()` + `EM_JS` shared disposer (Phase 2 / shipping path). `bindings.py` owns the `.d.ts` emission end-to-end; the runtime representation is an implementation detail behind that surface.

## Appendix 5: Q7 follow-up — V8 `Function.prototype.bind` root cause and the `EM_JS` CSP-safe pivot (E2)

### Question

Phase 1 (Appendix 4) concluded that `val::object()` + C++ `Symbol.dispose` was architecturally incompatible with `using` declarations on Node 24.x and recommended a `value_object` + JS post-prelude wrap. That conclusion implied a permanent `post.js` file in the build pipeline plus per-method JS-side codegen synchronised with `bindings.py`. Two follow-up questions emerged:

1. **Is the V8 13.6 `using` rejection actually an architectural limit of `val::object()` + C++ dispose, or an isolatable bug?** If isolatable, can the C++ path be made compatible without JS-side ceremony?
2. **Is there a way forward that has Node 24.x compatibility AND CSP-strict compatibility (`-sDYNAMIC_EXECUTION=0`)** — required by OCJS consumers shipping in Chrome extensions or strict-CSP web apps via the Docker build?

### Method

Three independent threads of investigation, each backed by reproducible experiments under [`repos/opencascade.js/experiments/q67-rbv-cost/`](repos/opencascade.js/experiments/q67-rbv-cost):

1. **V8 bug isolation** — minimal-PoC `using` probes against Node 24.3.0 (V8 13.6.233.10-node.18), Node 24.10.0 (V8 13.6.233.10-node.28), and Node 25.9.0 (V8 14.1.146.11-node.25), comparing plain JS functions, arrow functions, named functions, and `Function.prototype.bind`-produced functions as `Symbol.dispose`. Cross-referenced against the V8 explicit-resource-management commit log and Node.js V8 cherry-pick history.
2. **Pure-C++ disposer probes** — built [`pure-cpp-experiment.cpp`](repos/opencascade.js/experiments/q67-rbv-cost/pure-cpp-experiment.cpp) testing five candidate paths for attaching `Symbol.dispose` to a `val::object()` entirely from C++ (no `post.js`/`--post-js`/`--js-library` files): `val::global("Function")(src)` cached and fresh, embind free function, embind static class function, and embind prototype method. Validated each against V8 13.6's `using` callability check.
3. **CSP-strict build verification** — built [`csp-safe-experiment.cpp`](repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-experiment.cpp) with `-sDYNAMIC_EXECUTION=0` using `EM_JS` to register the shared disposer at link time. Verified the generated JS contains no `eval(` / `new Function(`. Ran the full lifecycle suite (sync dispose, `using` scope exit, SuppressedError, DisposableStack) on Node 24.3 to confirm runtime correctness on the broken V8.

### Findings

**F1: The V8 13.6 `using` rejection is a `Function.prototype.bind`-specific bug, not an architectural limitation.**

Probing pure JS functions (no emscripten involved) against Node 24.3 / V8 13.6 with each function shape as `Symbol.dispose`:

| Function shape                                         | V8 13.6 `using` result                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `function() {}` (anonymous)                            | ✓ OK                                                    |
| `function named() {}`                                  | ✓ OK                                                    |
| `() => {}` (arrow)                                     | ✓ OK                                                    |
| `(function f() {}).bind({})`                           | ✗ `TypeError: Symbol(Symbol.dispose) is not a function` |
| `(function f() {}).bind(null)`                         | ✗ same                                                  |
| `(function f() {}).bind(undefined)`                    | ✗ same                                                  |
| `(function f() {}).bind({}).bind(null)` (double-bound) | ✗ same                                                  |

Every `Function.prototype.bind`-produced function is rejected, even with no emscripten involved. The original V5b PoC's `disposer.call<val>("bind", out)` invocation was the entire source of the rejection.

**F2: The bug is fixed in V8 14.1+ (Node 25+, Chrome 137+).**

Same probe on Node 25.9.0 (V8 14.1.146.11-node.25):

| Function shape                      | V8 14.1 result |
| ----------------------------------- | -------------- |
| `(function f() {}).bind({})`        | ✓ OK           |
| `(function f() {}).bind(null)`      | ✓ OK           |
| `(function f() {}).bind(undefined)` | ✓ OK           |
| Double-bound                        | ✓ OK           |
| Arrow-wrapping-bound                | ✓ OK           |

Re-running the original V5b experiment under Node 25.9 prints `val::object using OK` — the embind `val::object()` + bound C++ dispose path that Appendix 4 declared incompatible actually works natively on V8 14.1+. A separate but related V8 closure-context ERM bug was reported and cherry-picked into Node 24.5.0 via [nodejs/node#58744](https://github.com/nodejs/node/issues/58744) and [#58750](https://github.com/nodejs/node/pull/58750); the bound-function fix landed in V8 main between 13.6 and 14.1 but was not backported to Node 24.x. A Node 24.x backport request is recommended as a separate follow-up (out of scope for this blueprint).

**F3: The `.bind` call was gratuitous.** When `using r = container; ... ` exits scope, V8 invokes `container[Symbol.dispose]()` as a method call. JS method-call semantics provide `this = container` automatically at the call site. The V5b PoC's `disposer.call<val>("bind", out)` was pre-binding `this = out` to defeat any potential re-binding — unnecessary and the source of the entire incompatibility. A simple `out.set(symbol, disposer)` with an **unbound** disposer works on every V8 version.

**F4: Multiple pure-C++ paths produce unbound JS callables that V8 13.6 accepts.**

`pure-cpp-experiment.cpp` builds five candidate variants and probes each on Node 24.3:

| #   | Path                                                                                          | V8 13.6 `using` accepts? | Disposer can access `this` (container)?               | Verdict                        |
| --- | --------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- | ------------------------------ |
| V6  | `val::global("Function")(src)` cached in `static val`                                         | ✓                        | ✓ (JS body iterates `this`)                           | Works — sole CSP-unsafe option |
| V7  | `emscripten::function("name", &cppFn)`                                                        | ✓                        | ✗ (embind invoker drops `this`)                       | Insufficient — no field access |
| V8  | `class_<T>.class_function("name", &cppFn)`                                                    | ✓                        | ✗ (same as V7)                                        | Insufficient                   |
| V9  | `class_<T>.function("name", &member)` on prototype                                            | ✓ (callability check)    | ✗ (embind throws on dispatch — receiver isn't a `T*`) | Insufficient                   |
| V10 | C++ free function `emscripten::function(..., &cppFn)` where `cppFn` takes `val container` arg | ✓                        | ✗ (embind doesn't pass `this` to free functions)      | Insufficient                   |

Only V6 and the not-yet-tested EM_JS path can attach an unbound JS callable that has access to the container at dispose-time.

**F5: `EM_JS` is CSP-strict-compatible.** Building [`csp-safe-experiment.cpp`](repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-experiment.cpp) with `emcc -sDYNAMIC_EXECUTION=0` succeeds. The generated JS contains:

```js
function ocjs_register_rbv_dispose() {
  Module['__ocjsRbvDispose__'] = function () {
    for (const k in this) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        if (v && typeof v.delete === 'function') v.delete();
      }
    }
  };
}
// ... wired into the wasm imports table as `C:ocjs_register_rbv_dispose`
```

`ripgrep` confirms zero `eval(` / `new Function(` / `"eval"` occurrences. The full lifecycle suite (sync dispose, `using` scope exit, SuppressedError, DisposableStack interop) all pass on Node 24.3 / V8 13.6:

```
Node: 24.3.0 V8: 13.6.233.10-node.18
Module.__ocjsRbvDispose__ defined: function
--- EM_JS path: synchronous dispose ---       deleteCount=2  (expected 2)  ✓
--- EM_JS path: `using` scope exit ---        deleteCount=2  (expected 2)  ✓
--- EM_JS path: SuppressedError handling ---  deleteCount=2  (expected 2)  ✓
--- EM_JS path: DisposableStack interop ---   deleteCount=4  (expected 4)  ✓
```

`EM_JS` emits a normal named function via a section of the compiled `.o` file picked up at link time — no runtime `eval`/`Function(src)`, so `-sDYNAMIC_EXECUTION=0` permits it. The function is wired into the wasm imports table and invoked from a C++11 magic-static initializer before any RBV call can reach it.

**F6: Caching both the disposer `val` AND the `Symbol.dispose` key is required for parity with `value_object`.**

Benchmarked on the same harness as Appendix 3 — Node 24.3.0 / V8 13.6, 5 samples × 500,000 iterations each, median ns per `D2`-shaped round-trip including dispose work:

| Variant                                                                     | ns/op (median) | Δ vs E2 cached |
| --------------------------------------------------------------------------- | -------------: | -------------: |
| **E2 EM_JS shared disposer, cached val handles (shipping)**                 |       **1228** |              — |
| E2 EM_JS uncached (re-resolve `Module["..."]` + `Symbol.dispose` each call) |           1509 |           +23% |
| E `Function(src)` cached (V6)                                               |           1304 |            +6% |
| E `Function(src)` fresh per call (V6 fresh)                                 |           2192 |           +78% |
| V7 embind free fn (no-op dispose body — wire-cost floor)                    |           1613 |              — |
| Bare `val::object()` no dispose attached (baseline)                         |           1044 |           −15% |

Removing the cache discipline from EITHER call site adds ~280 ns/op per uncached lookup — both `val::module_property("__ocjsRbvDispose__")` and `val::global("Symbol")["dispose"]` resolve through `_emval_get_module_property` / `_emval_get_global` + `_emval_get_property` wire crossings. Caching both in function-local `static val` storage closes 23% of the per-call cost.

**F7: `value_object` + JS post-prelude (Phase 1 recommendation) measured 1.069 µs in Appendix 3 — within 13% of E2 cached.** The two architectures are perf-equivalent within noise; the decision criterion is not performance but the _number of build-pipeline file types_ and _where the disposer logic lives_. E2 keeps everything in `bindings.py`; Phase 1's recommendation introduced a separate `post.js` + `--post-js` build flag + per-method `__ocjsWrapRbvMethod(...)` codegen.

### Caching specification

The bindgen-emitted C++ MUST cache both the disposer `val` and the `Symbol.dispose` key `val` in function-local `static val` storage. Both accessors run once per module load via C++11 magic-static initialization; subsequent calls return the cached `val` directly without crossing the JS↔WASM boundary.

```cpp
// One-time registration via EM_JS (compiled into the C++ binding code, JS body
// emitted at link time and wired into the wasm imports table):

EM_JS(void, ocjs_register_rbv_dispose, (), {
  Module["__ocjsRbvDispose__"] = function () {
    for (const k in this) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        const v = this[k];
        if (v && typeof v.delete === 'function') v.delete();
      }
    }
  };
});

// Magic-static + cached val: guarantees one-shot registration before first use,
// and one `val::module_property` lookup amortised across the module lifetime.
static val getRbvDispose() {
  static const auto _init = []() { ocjs_register_rbv_dispose(); return 0; }();
  (void)_init;
  static val cached = val::module_property("__ocjsRbvDispose__");
  return cached;
}

// Same pattern for the Symbol.dispose key — one `val::global("Symbol")["dispose"]`
// lookup amortised across the module lifetime.
static val getSymbolDispose() {
  static val cached = val::global("Symbol")["dispose"];
  return cached;
}
```

Per-method lambda emission collapses to one line:

```cpp
out.set(getSymbolDispose(), getRbvDispose());
```

**Why function-local `static val` rather than namespace-level `static val`:** `val` constructors that touch the emscripten runtime (`val::global`, `val::module_property`) cannot run during C++ static initialization in many emscripten configurations — the runtime isn't initialised yet at static-init time. Function-local static guards run on first call (after the runtime is fully up), are thread-safe per C++11, and incur exactly one initialisation per module lifetime.

**Closure-compiler safety:** the `EM_JS` body uses only standard JS surfaces (`for…in`, `Object.prototype.hasOwnProperty.call`, `typeof`, `.delete()`) — no dependency on minified internal symbols. Closure can rename freely without breaking the disposer. If `--closure 1` is enabled for the OCJS build, the EM_JS-emitted function name `ocjs_register_rbv_dispose` is referenced from the wasm imports table by mangled handle, so closure leaves it alone.

**Namespace collision avoidance:** `Module["__ocjsRbvDispose__"]` uses the double-underscore-prefix convention to signal "internal, do not override." If an OCJS user's `Module` config already defines this key, the EM_JS registration silently replaces it — the bindgen should add a one-line `tests/types.test-d.ts` assertion that the key is reserved (existing test fixtures already lock similar Module-property invariants).

### Decision: ship Option E2 (`EM_JS`-registered shared disposer with cached `val` handles)

E2 is selected for the shipping implementation. Compared to the Appendix 4 Phase 1 recommendation (`value_object` + JS post-prelude wrap):

| Architectural criterion                            | Phase 1 (post.js wrap)                          | **E2 (EM_JS + cached val)**                                                                   |
| -------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Source-of-truth location                           | `bindings.py` + `post.js` (two files)           | **`bindings.py` only (EM_JS body inside `BUILTIN_ADDITIONAL_BIND_CODE`)**                     |
| Per-method JS codegen                              | `__ocjsWrapRbvMethod(proto, name, [...fields])` | **none — single `out.set(getSymbolDispose(), getRbvDispose())` C++ line**                     |
| Standalone JS files in build                       | `post.js`                                       | **none**                                                                                      |
| Build flags required                               | `--post-js post.js`                             | **none — `EM_JS` is unconditional emcc support**                                              |
| V8 13.6 / Node 24.x compatibility                  | ✓                                               | **✓**                                                                                         |
| V8 14.1+ / Node 25+ compatibility                  | ✓                                               | **✓**                                                                                         |
| CSP-strict (`-sDYNAMIC_EXECUTION=0`) compatibility | ✓                                               | **✓**                                                                                         |
| TypeScript types                                   | via `value_object` auto-emission                | **via manual `.d.ts` overlays in `bindings.py` (already the OCJS pattern for many surfaces)** |
| Performance (V8 13.6, full dispose work)           | 1.069 µs                                        | **1.228 µs** (+15%, both well within OCCT call-cost dominance)                                |
| Migration to upstream embind landing               | post.js deletion + bindgen rewrite              | **one-line deletion of the `out.set(...)` emission**                                          |

E2 wins on every architectural criterion at a ~15% perf cost that is irrelevant in any realistic OCCT call site (Appendix 3 F4 shows the absolute overhead is sub-1% of typical CAD operations). The single-source-of-truth property is the decisive factor: Phase 1's recommendation introduces a new file type (`post.js`) and a new build flag (`--post-js`) that both have to be kept in lockstep with `bindings.py` codegen; E2 collapses both into the existing `BUILTIN_ADDITIONAL_BIND_CODE` mechanism that already houses OCJS's `TopoDS_Bind_`, `Standard_Failure`, and `OCJS` helper class definitions.

### Implications

- **Implementation plan B6/B7/B8 rewritten** in the table above. Net codegen volume vs Phase 1: **−1 file** (no `post.js`), **−N lines** (one `__ocjsWrapRbvMethod(...)` per disposable-container method, ~280 methods from the Q5 scan), **−1 build flag**.
- **`bindings.py` `.d.ts` synthesis is unchanged** — the seven generated signature shapes from Appendix 4 still apply. `value_object`'s auto-typing benefit was never load-bearing because OCJS owns the `.d.ts` emitter; `val::object()`'s loss of auto-typing is a phantom cost. The bindgen continues to emit `{theP: gp_Pnt; theV1: gp_Vec; [Symbol.dispose](): void}` via the same per-method TS literal synthesis it would have used for `value_object`.
- **Node 24.x backport request** for the V8 bound-function `using` fix is recommended as a separate follow-up (parallel to [#58744](https://github.com/nodejs/node/issues/58744) for the closure-context bug). E2 makes this unnecessary for OCJS shipping correctness but it would benefit the broader ecosystem.
- **Upstream emscripten PR** for native `value_object<T>` Symbol.dispose support (extending [PR #23818](https://github.com/emscripten-core/emscripten/pull/23818)'s `class_<T>` pattern) remains the architecturally complete long-term answer; E2 transitions to it with a one-line bindgen deletion when it lands.
- **CSP-strict OCJS Docker variant becomes possible.** Consumers shipping OCJS into Chrome extensions or `Content-Security-Policy: script-src 'self'`-locked web apps can opt into `-sDYNAMIC_EXECUTION=0` builds without losing `using` / `Symbol.dispose` ergonomics. The existing `bindings.py` codegen flag would need a one-line addition to surface `OCJS_DYNAMIC_EXECUTION` as a build environment variable; out of scope for this blueprint but unblocked by E2.

### References (Appendix 5)

- [`repos/opencascade.js/experiments/q67-rbv-cost/pure-cpp-experiment.cpp`](repos/opencascade.js/experiments/q67-rbv-cost/pure-cpp-experiment.cpp) — five pure-C++ disposer candidates (V6/V7/V8/V9/V10)
- [`repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-experiment.cpp`](repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-experiment.cpp) — EM_JS-based CSP-strict build
- [`repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-functional.mjs`](repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-functional.mjs) — full lifecycle suite on Node 24.3 / V8 13.6
- [`repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-bench.mjs`](repos/opencascade.js/experiments/q67-rbv-cost/csp-safe-bench.mjs) — E2 cached vs uncached vs E vs V7 benchmark
- [emscripten-core/emscripten#23818](https://github.com/emscripten-core/emscripten/pull/23818) — RReverser's `class_<T>` Symbol.dispose PR (March 2025) — the canonical template for the future `value_object<T>` upstream PR
- [nodejs/node#58744](https://github.com/nodejs/node/issues/58744) and [#58750](https://github.com/nodejs/node/pull/58750) — Node 24.x cherry-pick of the V8 ERM closure-context fix (the bound-function fix is a separate, not-yet-backported V8 commit between 13.6 and 14.1)
- [babel/babel#16150](https://github.com/babel/babel/pull/16150) — Babel's analogous fix for the function-as-disposable case (cross-validates that this is a recurring class of ERM implementation bug across runtimes)
