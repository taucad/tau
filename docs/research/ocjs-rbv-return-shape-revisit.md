---
title: 'OCJS RBV Return-Shape and Memory-Model Revisit'
description: 'Re-evaluates the universal Input-Passthrough RBV return shape against the original OCCT C++ API, surveys the return-shape design space, and recommends a minimal-transformation model that mutates class outputs in place while retaining envelopes for primitives and Handles.'
status: draft
created: '2026-05-13'
updated: '2026-05-13'
category: comparison
related:
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
  - docs/research/ocjs-rbv-universal-reference-passthrough.md
  - docs/research/ocjs-rbv-handle-output-param-elision.md
  - docs/research/ocjs-rbv-test-corpus-contract-drift.md
  - docs/research/wasm-cpp-rbv-prior-art.md
  - docs/research/embind-return-strategy-benchmarks.md
  - docs/research/wasm-smart-pointer-landscape.md
  - docs/research/embind-smart-pointer-stale-ptr.md
  - docs/research/replicad-class-rbv-migration-surface.md
---

# OCJS RBV Return-Shape and Memory-Model Revisit

Re-evaluation of OCJS's universal Input-Passthrough RBV envelope — the `(...args, ...outputPlaceholders) => { result, ...outputs, [Symbol.dispose] }` shape — against the original OCCT C++ signature, the wider C++→WASM ecosystem, and the updated design direction: preserve the C++ shape wherever JavaScript can faithfully represent it, and only introduce envelopes for outputs that JS or Embind cannot represent safely.

## Executive Summary

Today's OCJS bindings emit one of three return shapes (S0/S1/S2) for every method with non-const reference parameters. The S2 shape — a `val::object()` envelope with the C++ return value renamed `result`, every output parameter mirrored as a same-named field, and an attached `[Symbol.dispose]` — is the source of the user's discomfort. It diverges from OCCT in five visible ways: (1) the C++ `bool` return is renamed `result` and is no longer the call's value; (2) class output parameters appear in _both_ the argument list and the result envelope even though JS can mutate object references in place; (3) JSDoc inherited from OCCT (`@returns true if Write …`) is now empirically wrong on 255 methods; (4) `[Symbol.dispose]` decorates what looks semantically like a "boolean result"; (5) the OCCT mental model `Standard_Boolean Write(theStreams, theDocument, …, /* writes theWS */)` no longer maps to anything an OCCT-literate developer would recognise.

The investigation confirms that none of these symptoms is a smoking-gun bug — each is a deliberate trade-off justified by an earlier finding (universal full-arity over Doxygen direction-tag scraping; envelope-with-disposer over per-method curated facades; `[Symbol.dispose]` over manual `.delete()` ceremony). But the trade-off set is unbalanced: we adopted the **strongest** structural transformation (rename return, mirror class inputs, attach disposer) when **weaker** transformations were available and would have preserved more OCCT-fidelity.

The updated recommendation is **minimal transformation**: keep the C++ signature shape whenever JavaScript can model it; transform only the pieces JavaScript or Embind cannot model safely.

| Output kind                                                     | JS can model it directly?                                                   | Recommended JS shape                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Concrete class reference (`gp_Pnt&`, `gp_Pln&`, `Bnd_Box&`)     | Yes — objects have identity and can be mutated in place                     | Caller passes a `using` instance; C++ mutates it; **do not mirror it into the return container**   |
| Primitive / enum reference (`double&`, `int&`, `TopAbs_State&`) | No — JS primitives are pass-by-value                                        | Keep the input-passthrough placeholder and return the updated value in an envelope                 |
| Non-const `Handle<T>&` output                                   | No — Embind smart-pointer references suffer the stale-`$$.ptr` class of bug | Approach G: elide the input position and return the owned Handle in an envelope                    |
| Native C++ return (`bool`, `int`, class by value, etc.)         | Yes                                                                         | Return it directly when no envelope is needed; otherwise place it in the envelope as `returnValue` |

The direction closes the gap without abandoning full OCCT coverage, primitive in/out correctness, or `using` ergonomics:

| #   | Change                                                                                                                                                         | Saves                                                                                                                          | Costs                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| R1  | **Do not mirror concrete class outputs into return containers** — class refs mutate in place and callers read their own object after the call                  | Eliminates the `thePlane`-in-args-and-return duplication; restores OCCT recognisability and pre-RBV mutate-in-place call sites | one additional codegen lane and smoke-test updates that currently read class outputs from envelopes      |
| R2  | **Return native C++ return values directly when no primitive / Handle envelope is needed**                                                                     | Preserves truthful `@returns` JSDoc and avoids unnecessary container ceremony for class-only + native-return methods           | requires the return-type builder to decide whether an envelope is needed after class outputs are removed |
| R3  | **Rename the envelope's C++-return field from `result` to `returnValue`** — only for methods that still need an envelope                                       | DX truth; avoids implying the field is the whole operation's result object                                                     | consumer rename per remaining envelope call site                                                         |
| R4  | **Generate explicit JSDoc for both mutated-in-place class params and envelope fields** — preserve upstream Doxygen text, append concise mechanics wording only | Makes the dts self-explaining without replacing OCCT docs                                                                      | tiny codegen change in `_jsdoc()`                                                                        |

A fourth, weaker option — emit a per-method named `value_object` instead of an inline `{ … }` literal (e.g. `XSControl_Write_Result` instead of `{ result, theWS, … }`) — was considered and rejected: it would shift the discoverability cost from "what does the envelope look like at this call site?" to "where is `XSControl_Write_Result` defined?" without changing the underlying shape.

The eigenquestion is sharpened in [Framing the Eigenquestion](#framing-the-eigenquestion): we have been answering "how do we round-trip C++ output parameters into JavaScript safely?" when the right question is **"how do we hand a JavaScript caller the values an OCCT method produces, in the least-transformed shape that is still safe in JavaScript?"**. The first framing treats the shape as an output of correctness constraints; the second treats OCCT familiarity and JS intuition as first-class constraints.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Framing the Eigenquestion](#framing-the-eigenquestion)
- [Constraint Inventory](#constraint-inventory)
- [Decision History](#decision-history)
- [Design Space](#design-space)
  - [D1: Status quo (Universal Input-Passthrough RBV + `Symbol.dispose`)](#d1-status-quo-universal-input-passthrough-rbv--symboldispose)
  - [D2: Minimal transformation — mutate class outputs in place, envelope only when needed](#d2-minimal-transformation--mutate-class-outputs-in-place-envelope-only-when-needed)
  - [D3: Caller-allocated wrapper (P3, mutate-in-place, no envelope)](#d3-caller-allocated-wrapper-p3-mutate-in-place-no-envelope)
  - [D4: Named C++ result struct + `value_object` (e.g. `XSControl_Write_Result`)](#d4-named-c-result-struct--value_object-eg-xscontrol_write_result)
  - [D5: Curated facade per method (P1 — resolve in C++, never expose)](#d5-curated-facade-per-method-p1--resolve-in-c-never-expose)
  - [D6: JSDoc and `returnValue` mechanics](#d6-jsdoc-and-returnvalue-mechanics)
- [Memory-Model Sub-Question: Is `[Symbol.dispose]` the Right Affordance?](#memory-model-sub-question-is-symboldispose-the-right-affordance)
- [Generated JSDoc Contract](#generated-jsdoc-contract)
- [Prior-Art Comparison](#prior-art-comparison)
- [Trade-off Matrix](#trade-off-matrix)
- [Recommendations](#recommendations)
- [Open Questions](#open-questions)
- [References](#references)

## Problem Statement

The user surfaced the friction against two representative dts emissions (`build-configs/opencascade_full.d.ts`):

```ts
// XSControl-aware DE_Provider::Write overloads
Write(theStreams: any, theDocument: TDocStd_Document, theProgress: Message_ProgressRange):
    { result: boolean; theWS: XSControl_WorkSession; [Symbol.dispose](): void };
Write(theStreams: any, theShape: TopoDS_Shape, theProgress: Message_ProgressRange):
    { result: boolean; theWS: XSControl_WorkSession; [Symbol.dispose](): void };

// XCAFDoc_ClippingPlaneTool::GetClippingPlane
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping: boolean):
    { result: boolean;
      thePlane: gp_Pln;
      theName: TCollection_HAsciiString;
      theCapping: boolean;
      [Symbol.dispose](): void };
```

The four observations bundled in the user's message:

1. **JSDoc lies.** The Doxygen `@returns true if Write operation has ended correctly` survives verbatim into the dts but no longer describes the call's value. The bindgen forwards Doxygen unchanged on every output-param method that returns a value; empirically, **255** methods carry `@returns true …` text whose actual return is now a structured envelope (`rg -c '@returns true' build-configs/opencascade_full.d.ts`).
2. **Args mirror result fields.** `thePlane` appears in both the argument list and the result, "for reasons" — the universal Input-Passthrough RBV contract documented in `BREAKING_CHANGES.md` §B2. Without the rationale that lives in the breaking-changes guide, this looks like accidental duplication.
3. **OCCT recognition gap.** A developer who comes in from C++ OCCT cannot translate `Standard_Boolean Write(Handle<XSControl_WorkSession>& theWS, …)` into the JS signature without re-reading the breaking-changes doc; the function name, the bool-vs-`result` rename, and the `theWS`-as-output-field are all opaque from the dts alone.
4. **`[Symbol.dispose]` on a boolean-flavoured result.** "Why does the return of a write-CAD-file method need to be disposed?" is a fair question; the answer is "because it bundles a `Handle<XSControl_WorkSession>` whose lifetime the C++ code transferred to the caller", but that explanation is not visible at the call site.

The user is explicit that they are not asking us to drop coverage of OCCT, regress performance, or revert the Approach G handle elision. The request is to **re-examine the shape decision in light of all prior research** and propose whether a less opinionated shape would still satisfy the original constraints.

## Framing the Eigenquestion

`docs/research/ocjs-unified-rbv-blueprint.md` framed the eigenquestion as:

> How do we round-trip C++ output parameters into JavaScript so that (a) primitive in/out reads see real input, (b) `[Symbol.dispose]` covers every owned field, (c) no allow-list or direction-tag scraping is required, and (d) the codegen path is uniform across primitive / enum / `Handle<T>` / class outputs?

That framing is correctness-first: every constraint is a property of the binding _as machinery_. It produced the right answer to _that_ question (universal full-arity RBV with conditional `Symbol.dispose`). It is also why every recent finding (Approach G, alias-safe disposer, idempotent `[Symbol.dispose]`) tightened the machinery without re-opening the consumer-facing shape.

The user's framing is different. Re-reading their question against the dts snippets, the eigenquestion they are pointing at is:

> **How do we hand a JavaScript caller the values an OCCT method produces, in a shape that an OCCT developer recognises, without trading away type safety, full coverage, or lifetime correctness?**

The two framings share the same constraints; they differ in priority. The blueprint optimised for codegen uniformity and disposer correctness _first_ and accepted whatever consumer shape fell out. The user is asking for consumer-recognisability _first_ — and accepting whatever codegen shape supports that, as long as the original constraints (coverage, safety, performance) still hold.

This research adopts the second framing.

## Constraint Inventory

The constraint set is unchanged from the prior research; spelling it out makes it easier to score each design candidate against.

| #   | Constraint                                                              | Source                                                                                                                | Hard / soft                     |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| C1  | Preserve the full OCCT API surface (every public method bindable)       | `ocjs-unified-rbv-blueprint.md` Problem Statement; `wasm-cpp-rbv-prior-art.md` Finding 7                              | Hard                            |
| C2  | Primitive in/out reads see real caller input (`gp_Trsf::Transforms`)    | `ocjs-unified-rbv-blueprint.md` Problem Statement bullet 2                                                            | Hard                            |
| C3  | No `Function(src)` / `Function.prototype.bind` (CSP / V8 13.6 compat)   | `ocjs-unified-rbv-blueprint.md` Appendix 5                                                                            | Hard                            |
| C4  | `using` ceremony covers every owned C++ resource (no leak class of bug) | `ocjs-rbv-test-corpus-contract-drift.md` Finding 3                                                                    | Hard                            |
| C5  | No allow-list or direction-tag scraping in the bindgen                  | `ocjs-unified-rbv-blueprint.md` AST-Driven Selection; `ocjs-rbv-blueprint-p0-p1-stocktake.md` F3 (Option A rejection) | Soft (architectural preference) |
| C6  | Single arity model across OCCT (agentic IntelliSense predictability)    | `BREAKING_CHANGES.md` §B2 rationale; `ocjs-rbv-blueprint-p0-p1-stocktake.md` F3 Option C                              | Soft                            |
| C7  | Per-call cost not materially worse than today (~0.9 µs / RBV call)      | `embind-return-strategy-benchmarks.md` Findings 2 & 7                                                                 | Soft                            |
| C8  | Consumer-visible shape is recognisable to an OCCT-literate developer    | New (this doc)                                                                                                        | Soft                            |
| C9  | JSDoc accurately describes what the JS method returns                   | New (this doc; 255 violations today)                                                                                  | Soft                            |

C8 and C9 are the constraints that today's design fails. Every other constraint is satisfied.

## Decision History

The current shape is the cumulative output of six prior research threads. The friction the user surfaced is downstream of decisions taken in that chain; revisiting it requires understanding which decisions are reversible and which are load-bearing.

| Step | Doc                                                              | What it decided                                                                                                                                                                                          | Reversible?                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `embind-smart-pointer-stale-ptr.md`                              | The original `Handle<T>&` output-by-reference pattern produces stale `$$.ptr` after Embind hands the wrapper back. RBV becomes inevitable for `Handle<T>` outputs.                                       | **No** (this is a fact about Embind, not a choice)                                                                                                                                                                  |
| 2    | `embind-return-strategy-benchmarks.md`                           | `value_object` (named fields) beats `value_array` on DX at zero perf cost; `emscripten::val` is 24 % slower than typed returns.                                                                          | **No** (empirical; named fields win)                                                                                                                                                                                |
| 3    | `wasm-cpp-rbv-prior-art.md`                                      | Industry consensus: P1 (resolve in C++) or P2 (value_object return) or P3 (caller-allocated wrapper). The OCJS `{ current }` proxy pattern is OCJS-unique. WebIDL Binder uses `[Ref]` (P3) universally.  | No — these are the canonical options                                                                                                                                                                                |
| 4    | `ocjs-unified-rbv-blueprint.md` (Option B selection)             | Pick **input-passthrough** uniformly: every primitive output is also a JS-facing input. Fixes `gp_Trsf::Transforms` zero-init bug "for free".                                                            | **Reversible only for class outputs** — primitives need passthrough because JS has no by-ref for primitives                                                                                                         |
| 5    | `ocjs-rbv-universal-reference-passthrough.md`                    | PoC proves `val::as<T&>()` for class outputs is 1.41× faster than value-copy, preserves identity (`wrap.classOut === input`), works for non-copyable classes, and obviates `[Symbol.dispose]`.           | **Available** — superseded only for `Handle<T>` outputs (Finding 8); class-output finding (Findings 1-7) still standing                                                                                             |
| 6    | `ocjs-rbv-handle-output-param-elision.md` (Approach G)           | For non-const `Handle<T>&` outputs, drop the JS-facing input entirely; lambda stack-locals a null Handle and writes the populated result into the envelope. 2.29× faster than passthrough.               | **No** — Approach G is the right answer for Handles                                                                                                                                                                 |
| 7    | `ocjs-rbv-blueprint-p0-p1-stocktake.md` §F3 (Option C+ adoption) | Universal full-arity wins over per-method direction-tag analysis; the `.d.ts` admits every output as a required input; consumers read results from the envelope, never from their own mutated variables. | **Reversible for class outputs** — the OCCT-direction-tag rejection (Option A) is a real constraint, but the "read from envelope" rule is a _consequence_ of the value-copy lambda, not of the universal arity rule |

The friction the user is reacting to (args mirror result fields; JSDoc lies; `[Symbol.dispose]` on a boolean) is downstream of **steps 4 and 7**, both of which decided to keep value-copy semantics universally. Step 5 (the reference-passthrough PoC) showed there is a strictly faster, identity-preserving, disposer-free alternative for class outputs — and the only reason it was not adopted at step 7 was the desire for a single uniform contract across primitives, classes, and Handles.

In other words: the consumer-shape friction is the price of codegen uniformity. The PoC numbers say the price is non-trivial: class-reference passthrough restores the OCCT-recognisable semantic (the caller's object is the one C++ mutates) while avoiding the value-copy lane's measured overhead.

## Design Space

Six candidate designs, ordered from the most invasive to the least, every one assessed against the constraint inventory.

### D1: Status quo (Universal Input-Passthrough RBV + `Symbol.dispose`)

What ships today. Every output param is mirrored in the args and in a `val::object()` envelope with conditional `[Symbol.dispose]`. Approach G elides `Handle<T>&` from the arg list but keeps it in the envelope.

| Score against       | Result                                                        |
| ------------------- | ------------------------------------------------------------- |
| C1 coverage         | Pass — every OCCT method is bindable                          |
| C2 in/out reads     | Pass — primitive in/out is the canonical use case             |
| C3 CSP / V8 13.6    | Pass — `EM_JS` disposer, no `bind`                            |
| C4 leak coverage    | Pass — envelope `Symbol.dispose` is alias-safe and idempotent |
| C5 no allow-list    | Pass                                                          |
| C6 single arity     | Pass — every method full-arity                                |
| C7 perf             | Baseline                                                      |
| **C8 recognisable** | **Fail** — return shape is opaque vs C++                      |
| **C9 JSDoc**        | **Fail** — 255 `@returns true …` blocks lie                   |

### D2: Minimal transformation — mutate class outputs in place, envelope only when needed

Take the proven PoC from `ocjs-rbv-universal-reference-passthrough.md` and apply it more aggressively than the first draft of this research recommended: for each output param whose declared type is a non-`Handle<T>` registered class (`gp_Pnt`, `gp_Pln`, `Bnd_Box`, `gp_XYZ`, …), the bindgen emits a lambda parameter typed `val` and decodes it with `val::as<T&>()`, so the caller's instance is mutated in place. **The class output is not mirrored into the return envelope.** Primitive and enum outputs continue to use input-passthrough (no other option for JS primitives); `Handle<T>` outputs keep Approach G elision.

This is the key correction to the earlier D2 framing. Returning `result.thePlane` as an alias of `thePlane` would preserve both read sites, but it would also create an unnecessary identity rule that JS developers have to learn: "some return fields are fresh owned outputs; some are aliases of input arguments." The more reasonable JS contract is smaller:

| Pattern in dts                      | Output kind               | Where to read               |
| ----------------------------------- | ------------------------- | --------------------------- |
| Name appears in args, not in return | Concrete class output     | The input object you passed |
| Name appears in args and return     | Primitive / enum output   | The return envelope         |
| Name appears in return only         | Elided `Handle<T>` output | The return envelope         |

Representative shapes:

```ts
// Class-only, void return: no envelope.
D1(U: number, theP: gp_Pnt, theV1: gp_Vec): void;

// Class-only plus native return: return the native value directly.
GetColor(theLabel: TDF_Label, theType: XCAFDoc_ColorType, theColor: Quantity_Color): boolean;

// Mixed class + primitive + Handle: only non-class outputs appear in the envelope.
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping: boolean):
  { returnValue: boolean;
    theName: TCollection_HAsciiString;
    theCapping: boolean;
    [Symbol.dispose](): void };
```

Consumer code follows the same rule:

```ts
using thePlane = new oc.gp_Pln();
using r = clippingTool.GetClippingPlane(label, thePlane, false);

if (r.returnValue) {
  usePlane(thePlane); // class output: mutated in place
  useName(r.theName); // Handle output: owned by the envelope
}
```

| Score against    | Result                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 coverage      | Pass                                                                                                                                                               |
| C2 in/out reads  | Pass — primitives still use input-passthrough; class outputs are mutated in place, which is the literal C++ semantic                                               |
| C3 CSP / V8      | Pass                                                                                                                                                               |
| C4 leak coverage | Pass — caller's `using` owns each class output; the envelope only disposes fields it owns (notably elided Handles)                                                 |
| C5 no allow-list | Pass — predicate is "is the output param a registered class type that is not `Handle<T>`?", AST-driven                                                             |
| C6 single arity  | **Soft fail** — three output lanes in codegen (primitive passthrough, class mutation, Handle elision); but the dts itself tells callers which side to read from    |
| C7 perf          | **Better** — 1.41× faster on the Copyable POC; zero copy allocation per call                                                                                       |
| C8 recognisable  | **Best practical shape** — concrete class refs look like OCCT (`thePlane` is passed and then read), while primitives / Handles use the smallest safe JS adaptation |
| C9 JSDoc         | **Pass after R4** — JSDoc rewrite needed regardless of D2; D2 itself does not improve JSDoc accuracy                                                               |

The design deliberately gives up the redundant "also read it from `r.thePlane`" convenience. That redundancy looks attractive until ownership enters the picture: if `r.thePlane === thePlane`, then a JS developer has to ask whether the return field is owned, aliased, disposable, or safe to mutate independently. Removing class outputs from the envelope eliminates that ambiguity by construction.

### D3: Caller-allocated wrapper (P3, mutate-in-place, no envelope)

The full WebIDL-Binder / ammo.js / Box2D model. The JS signature exposes the C++ signature as literally as possible for every output type: `GetColor(label, type, color): boolean` mutates `color` in place and returns the OCCT-native `boolean`; a hypothetical Handle-output equivalent would ask the caller to pre-allocate a Handle wrapper and read it after the call.

This is the answer to the user's complaint as stated: full OCCT fidelity, no shape change, JSDoc is correct, no `[Symbol.dispose]` on the return.

| Score against    | Result                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 coverage      | **Partial fail** — primitive refs and `Handle<T>&` outputs cannot use this model safely. Two adaptation models still required.                                  |
| C2 in/out reads  | Pass for classes; **fail for primitives** (JS has no by-ref primitive) and **fail for Handles** (Embind stale-`$$.ptr` after mutable smart-pointer references)  |
| C3 CSP / V8      | Pass                                                                                                                                                            |
| C4 leak coverage | Pass via caller's `using` on each input                                                                                                                         |
| C5 no allow-list | **Soft fail** — bindgen must classify each param as primitive vs class to pick the shape; the bifurcation is AST-driven but introduces the asymmetry C6 forbids |
| C6 single arity  | **Fail** — primitive output methods have a different arity model than class output methods                                                                      |
| C7 perf          | Better than D1 by the value-copy cost (~0.3 µs / call)                                                                                                          |
| C8 recognisable  | **Best** — exact C++ shape                                                                                                                                      |
| C9 JSDoc         | Pass — `@returns true if Write operation has ended correctly` is once again accurate                                                                            |

D3 is what the user's complaint reads as wanting. The reason it is rejected is structural: JS cannot represent `double&` as a by-ref parameter without a wrapper object, and Embind cannot safely expose mutable `Handle<T>&` outputs because the JS wrapper's cached `$$.ptr` goes stale after C++ reassigns the smart pointer. Any "literal C++ shape" design therefore still has to adapt primitives and Handles. D2 is the principled split: preserve literal mutation only for concrete classes, where JS and Embind can actually uphold the C++ contract.

### D4: Named C++ result struct + `value_object` (e.g. `XSControl_Write_Result`)

Keep the universal-arity envelope; only change is to give each one a name. Instead of emitting an inline `{ result: boolean; theWS: XSControl_WorkSession; [Symbol.dispose](): void }` literal, the bindgen registers a named `value_object` and the dts declares `Write(...): XSControl_Write_Result`.

This is what the bindgen does for nested struct results today (S0 path — `BRepGraph_Builder_Result`). The proposal is to extend it to the remaining generated envelope methods.

| Score against   | Result                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1–C7           | Identical to D1                                                                                                                                                       |
| C8 recognisable | **Marginal improvement** — the `XSControl_Write_Result` name is discoverable in IntelliSense; but the _shape_ (mirrored args, `result` rename, disposer) is unchanged |
| C9 JSDoc        | Still fails — the `@returns` text still lies                                                                                                                          |

D4's cost: 2 311 new named types in the dts (one per S2 envelope), most of which are referenced from exactly one method signature. The discoverability shift is "what does this envelope look like at this call site?" → "where is `XSControl_Write_Result` defined and what does _it_ look like?" — which is not necessarily a win. **Recommendation: defer; revisit only if D6 (cosmetic) is insufficient.**

### D5: Curated facade per method (P1 — resolve in C++, never expose)

The CanvasKit model. Each output-param method is hand-written in `BUILTIN_ADDITIONAL_BIND_CODE` to return a domain-natural shape (`{ ok, written: writtenBytes, plane, name, capping }` for `GetClippingPlane`, etc.).

| Score against | Result                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 coverage   | **Fail at scale** — 2 574 disposable-envelope methods today; hand-writing each is 5-10 KLOC of curated C++; impossible at OCJS's coverage goal |
| Others        | Pass per method, where written; nothing for the rest                                                                                           |

Rejected for OCJS specifically because OCJS chose maximum coverage (the architectural commitment from `wasm-cpp-rbv-prior-art.md` Finding 7). CanvasKit, OpenCV.js, and rhino3dm all use this lane _in addition to_ their bulk lane — but they only bind 5-10 % of their parent C++ libraries, not 100 %.

### D6: JSDoc and `returnValue` mechanics

This is no longer just a cosmetic fix. Once class outputs stop being mirrored into the envelope, generated JSDoc becomes the caller's primary explanation for the mixed mechanics. Two coordinated bindgen edits:

1. Wherever today's lambda body writes `out.set("result", ret)`, emit `out.set("returnValue", ret)` (or use the OCCT-canonical name when the method has one — most `bool`-returning OCCT methods name the return implicitly, but a future bindgen pass could opt into named returns where Doxygen `@returns` text supplies one).
2. In `_jsdoc()`, preserve upstream Doxygen text and append concise OCJS mechanics:
   - For mutated-in-place class params, keep the upstream `@param` text and suffix it with wording like `Mutated in place; read the updated value from this argument after the call.`
   - For envelope fields, keep upstream `@returns` text and rewrite the call-level return block to describe the container:

```
@returns A result object with fields:
   returnValue: true if Write operation has ended correctly
   theWS: the populated XSControl_WorkSession handle, owned by the returned envelope
```

| Score against   | Result                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| C1–C7           | Compatible with D2                                                                                                                        |
| C8 recognisable | Stronger — OCCT docs stay visible, and OCJS appends only the mechanics needed to explain mutation vs envelope fields                      |
| C9 JSDoc        | **Pass** — 255 lying `@returns true …` blocks fixed mechanically; mutated-in-place params are documented without replacing upstream prose |

D6 alone leaves the structural complaint intact, but D2+D6 closes both sides: the structural duplication disappears for class outputs, and mixed envelopes become self-explaining in IntelliSense.

## Memory-Model Sub-Question: Is `[Symbol.dispose]` the Right Affordance?

The user separately asked whether `[Symbol.dispose]` on the envelope is the best memory model or whether a better one exists. Four candidates:

| #   | Affordance                                                                         | Mechanism                                                                                                                           | Verdict                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Today: `[Symbol.dispose]` on the envelope, walks fields, idempotent + alias-safe   | `EM_JS`-registered shared disposer + `using` declaration                                                                            | Works; CSP-clean; idempotent; alias-safe. **Adds a member to the return type** which surfaces in IntelliSense even when only a primitive field is read.                                                                           |
| M2  | `FinalizationRegistry` + no explicit `[Symbol.dispose]`                            | Embind already registers each wrapper with `FinalizationRegistry`; owned envelope fields would eventually be reclaimed when GC runs | **Rejected.** Embind's own docs say `FinalizationRegistry` is "best-effort, never guaranteed"; CAD workloads allocate aggressively and rely on prompt disposal to avoid OOM under pressure. `using` semantics are the right tool. |
| M3  | Caller's `using` on the input variable, **no envelope disposer for class outputs** | This is the D2 outcome: concrete class outputs are not envelope fields at all; the caller's variable owns their lifetime            | **Adopt for D2 class outputs.** Already validated by Finding 7 of `ocjs-rbv-universal-reference-passthrough.md`. Drops `Symbol.dispose` whenever the remaining envelope fields contain no owned Handles.                          |
| M4  | `DisposableStack` + manual `stack.use(wrap)`                                       | TC39's batch-disposal primitive                                                                                                     | **Available, not preferred.** `using wrap = …` is more direct. `DisposableStack` is the right answer only when batching across loop iterations.                                                                                   |
| M5  | `WeakRef` + manual lifetime API (`oc.gc.releaseAll()`)                             | Periodic flush                                                                                                                      | **Rejected.** Same `FinalizationRegistry` problem; not deterministic; not what OCJS consumers expect.                                                                                                                             |

The empirical verdict from the wider survey: `Symbol.dispose` is the correct affordance for **owned** values; the question is **which values are owned**. D1 makes every envelope field owned (copy semantics); D2 removes concrete class fields from the envelope entirely and leaves their ownership with the caller. D2 + M3 is therefore strictly better than D1 + M1 _for class outputs_, while M1 stays optimal for Handle fields (which Approach G already produces).

## Generated JSDoc Contract

The updated return-shape contract depends on generated docs being truthful at the call site. The bindgen should preserve upstream OCCT prose and append only the mechanics that are not obvious from C++ Doxygen. This section is intentionally explicit so implementation can be checked against it.

| Surface                                                         | Upstream docs present? | Generated JSDoc rule                                                                                                                                                                                       |
| --------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutated concrete class param (`gp_Pln&`, `gp_Pnt&`, `Bnd_Box&`) | Yes                    | Keep the upstream `@param` description and suffix: `Mutated in place; read the updated value from this argument after the call.`                                                                           |
| Mutated concrete class param                                    | No                     | Emit a concise synthetic `@param`: `Mutated in place; read the updated value from this argument after the call.`                                                                                           |
| Primitive / enum output placeholder                             | Yes                    | Keep upstream `@param` text. If the param remains visible as a placeholder, suffix only enough mechanics to explain that the updated value is returned in the envelope, not written into the JS primitive. |
| Primitive / enum output placeholder                             | No                     | Emit a concise synthetic `@param` only when needed to avoid a silent placeholder.                                                                                                                          |
| Elided `Handle<T>&` output                                      | Any                    | Do not synthesize a noisy `@param` because the slot is not JS-visible. Describe the returned field in the `@returns` envelope block.                                                                       |
| Native C++ return inside an envelope                            | Yes                    | Preserve upstream `@returns` text as the `returnValue` field description.                                                                                                                                  |
| Native C++ return inside an envelope                            | No                     | Emit `returnValue: the C++ return value` or a type-specific equivalent only when an envelope is emitted.                                                                                                   |
| Envelope-owned Handle field                                     | Any                    | Describe the field in the `@returns` envelope block and note that it is owned by the returned envelope.                                                                                                    |
| Envelope with `[Symbol.dispose]`                                | Any                    | Add one concise sentence: `Dispose the returned envelope to release owned Handle fields.`                                                                                                                  |

Representative generated docs:

```ts
/**
 * Returns ClippingPlane defined by label lab Returns False if the label is not in ClippingPlane table or does not define a ClippingPlane.
 * @param thePlane plane to populate. Mutated in place; read the updated value from this argument after the call.
 * @param theCapping initial capping flag. The updated value is returned as `theCapping` in the result object.
 * @returns A result object with fields:
 * - `returnValue`: false if the label is not in the clipping-plane table or does not define a clipping plane.
 * - `theName`: populated clipping-plane name, owned by the returned envelope.
 * - `theCapping`: updated capping flag.
 * Dispose the returned envelope to release owned Handle fields.
 */
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping: boolean):
  { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };
```

The key rule: generated JSDoc explains mechanics without replacing upstream semantics. Existing Doxygen remains the first sentence wherever it exists; OCJS adds only the smallest wording needed to tell a JS caller where to read each output and who owns it.

## Prior-Art Comparison

Cross-tabulating OCJS against the seven libraries surveyed in `wasm-cpp-rbv-prior-art.md`, using their output-param idiom for **methods structurally identical to `DE_Provider::Write`** (a `bool` return + a `Handle<T>&` output + several `const&` inputs):

| Library            | Output-param idiom                                                                                                                           | What the caller writes                                                                                                                                       | How disposal is signalled                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| OCJS today (D1)    | Universal Input-Passthrough RBV envelope + `Symbol.dispose`                                                                                  | `using r = oc.X.Write(streams, doc, progress); if (r.result) use(r.theWS)`                                                                                   | `[Symbol.dispose]()` on the envelope                                      |
| OCJS (D2 proposed) | Minimal transformation: mutate class refs in place; Approach G for Handles; envelope only when primitive / Handle / mixed output requires it | `using r = oc.X.Write(streams, doc, progress); if (r.returnValue) use(r.theWS)` for Handle-only output; `curve.D1(u, p, v); use(p, v)` for class-only output | `[Symbol.dispose]()` on the envelope only when the envelope owns a Handle |
| CanvasKit          | P1 (resolve in C++) — hand-written facade per method                                                                                         | `const ws = canvasKit.Write(streams, doc, progress); use(ws); ws.delete()`                                                                                   | Manual `.delete()`; some types use `sk_sp` finalizer                      |
| OpenCV.js          | Mixed P2 + P5 — `value_object` for aggregates, `val.set` for one-off                                                                         | `const { ok, ws } = cv.Write(streams, doc, progress)`                                                                                                        | `ws.delete()` for `cv::Mat`-shaped types                                  |
| Manifold           | P5 (`val::object`) — explicit return                                                                                                         | `const { changed, mesh } = manifold.Merge(input)`                                                                                                            | `mesh.delete()`                                                           |
| rhino3dm           | P2 (`BND_TUPLE`)                                                                                                                             | `const [ok, ws] = rhino.Write(streams, doc, progress)`                                                                                                       | `ws.delete()`                                                             |
| ammo.js (WebIDL)   | P3 (`[Ref] T` caller-allocated)                                                                                                              | `const ws = new Ammo.XSControl_WorkSession(); const ok = ammo.Write(streams, doc, progress, ws); use(ws)`                                                    | `Ammo.destroy(ws)`                                                        |
| Box2D-WASM         | P3                                                                                                                                           | Same as ammo.js                                                                                                                                              | `Module.destroy(ws)`                                                      |
| Draco              | P3 (`[Ref] T` typed-array sink)                                                                                                              | Same pattern                                                                                                                                                 | `decoder.destroy(out)`                                                    |
| assimpjs           | P1 (collapse to a JSON-shaped result)                                                                                                        | `const result = ajs.ConvertFile(...)`                                                                                                                        | None — value-typed `emscripten::val` POJOs                                |
| occt-import-js     | P1                                                                                                                                           | Same                                                                                                                                                         | None                                                                      |

The matrix shows that **no surveyed library uses a return-envelope that mirrors concrete class input parameters back to the caller as aliases**. The closest peer is Manifold's `{ changed, mesh }` shape (P5), but Manifold's `changed` is the C++ `bool` and `mesh` is the actual mesh — there is no "args-mirror-result" mirroring. D2 brings OCJS back toward the peer consensus: mutate class references in place, return only values that need a JS adaptation.

This is consistent with the cause: every other library either resolves outputs in C++ (P1) so the JS caller never sees the names, or uses P3 (caller-allocated) so the JS caller writes into their own object and the function returns just the C++ return value. The original OCJS input-passthrough RBV choice intentionally kept both sides for every output kind; D2 keeps that only where JS forces it (primitives) or Embind forces it (Handles).

## Trade-off Matrix

Folding the design space and the memory-model sub-question into one comparison. Bold cells mark the dimension where each option is strictly best; (–) marks not applicable.

| Dimension                                    | D1 (status quo)        | D2 (minimal transformation)                                                   | D3 (full P3)                | D4 (named struct)      | D5 (full curated)           | D6 (JSDoc / returnValue)     |
| -------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- | --------------------------- | ---------------------- | --------------------------- | ---------------------------- |
| C1 coverage                                  | full                   | full                                                                          | full                        | full                   | **partial** (manual labour) | full                         |
| C2 primitive in/out                          | pass                   | pass                                                                          | **fail**                    | pass                   | pass                        | pass                         |
| C7 perf vs status quo                        | 1.0×                   | **1.41× (POC)**                                                               | ~1.0× (no envelope)         | 1.0×                   | varies                      | 1.0×                         |
| Envelope allocations per call (class fields) | 1 copy per class field | **0 (class fields omitted)**                                                  | 0                           | 1 copy per class field | 0                           | 1 copy per class field       |
| `Symbol.dispose` on class-only output        | yes (always)           | **no envelope**                                                               | (–)                         | yes                    | manual                      | yes                          |
| `Symbol.dispose` on Handle-only envelope     | yes (Approach G)       | yes (Approach G)                                                              | yes (or manual `.delete()`) | yes                    | manual                      | yes                          |
| C++ return rename `→ result`                 | yes                    | **`returnValue` only when envelope needed**                                   | no                          | yes                    | curated                     | **renames to `returnValue`** |
| JSDoc `@returns` accuracy                    | **255 lies**           | **0 after R4**                                                                | 0 lies                      | 255 lies               | 0 lies (curated)            | **0 lies**                   |
| Codegen complexity                           | medium                 | medium-high (3 lanes)                                                         | high (2 arity models)       | medium                 | very high                   | low                          |
| OCCT-literate recognisability                | low                    | **highest practical** (class refs mutate in place; only unsafe outputs adapt) | **highest**                 | low+name               | **highest** (curated)       | low+JSDoc fix                |
| Single arity contract (C6)                   | yes                    | yes (consumers see one rule)                                                  | **no**                      | yes                    | varies                      | yes                          |
| Risk to chat-agent / IntelliSense            | low (uniform)          | low (dts encodes read site by whether a field appears in the envelope)        | **high** (two arity models) | low                    | low                         | low                          |

Reading the matrix: D2+D6 (combined) dominates D1 on every consumer-facing dimension and matches D1 on the load-bearing machinery dimensions (full coverage, primitive in/out correctness, no allow-list, CSP-clean), at the cost of one new codegen lane and a clearer dts-derived read-site rule. D3 wins on recognisability but at a load-bearing structural cost. D4 alone changes nothing material. D5 is impossible at OCJS coverage scale. D6 alone closes the most-visible defects but does not remove structural duplication.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                | Priority | Effort | Impact                                                                                                                                                                  | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | **Adopt minimal transformation for concrete class outputs.** Non-`Handle<T>` class refs (`gp_Pnt&`, `gp_Pln&`, `Bnd_Box&`, etc.) are JS-facing arguments, decoded with `val::as<T&>()`, mutated in place, and **not mirrored into the return envelope**.                                                                                                                                              | P0       | Medium | High (restores OCCT semantics, preserves pre-RBV mutate-in-place code, eliminates class-output wrapper copies, and removes the `thePlane`-in-args-and-return confusion) | None       |
| R2  | **Return native C++ return values directly when no primitive / Handle envelope is needed.** For class-only output methods with a non-void C++ return, return the native value and mutate class args in place. For class-only void methods, return `void`.                                                                                                                                             | P0       | Medium | High (removes unnecessary containers; makes inherited `@returns` truthful for class-only methods)                                                                       | R1         |
| R3  | **Use envelopes only for primitive outputs, elided Handle outputs, and mixed cases.** Primitive / enum outputs stay input-passthrough fields in the envelope; non-const `Handle<T>&` outputs stay Approach G elided fields; class outputs are omitted from the envelope even in mixed methods.                                                                                                        | P0       | Medium | High (preserves the load-bearing RBV fixes while shrinking the envelope to values JS/Embind cannot model directly)                                                      | R1         |
| R4  | **Rename the envelope's C++-return field from `result` to `returnValue` (or a Doxygen-derived name where one is unambiguous).** Localised codegen change in `_emitOutputParamBinding`; applies only to methods that still need an envelope.                                                                                                                                                           | P1       | Low    | High (DX clarity; removes the implicit "this field is the whole result object" misread of `result`)                                                                     | R3         |
| R5  | **Generate explicit JSDoc for mutated-in-place class params and envelope fields.** Preserve upstream Doxygen docs, appending only concise mechanics wording. Existing `@param` docs for class outputs get a suffix like "Mutated in place; read the updated value from this argument after the call." Existing `@returns` docs are preserved as `returnValue` field text when an envelope is emitted. | P0       | Low    | High (closes the 255-method "JSDoc lies" defect and makes both mutation and container mechanics visible in IntelliSense)                                                | R1, R3, R4 |
| R6  | **Document the dts-derived read-site decision tree.** Put the three-rule mapping ("args only = class mutation; args+return = primitive; return only = Handle") in `BREAKING_CHANGES.md` and any generated consumer-facing docs.                                                                                                                                                                       | P1       | Low    | Medium (teaches the model once; then every signature becomes self-describing)                                                                                           | R1-R5      |
| R7  | **Defer D4 (named per-method `value_object`).** Re-evaluate after R1-R6 ship; only re-open if consumer feedback says inline `{ … }` is still hard to read.                                                                                                                                                                                                                                            | P3       | —      | —                                                                                                                                                                       | R1-R6      |
| R8  | **Reject D3 (full P3).** The two-arity model for primitives regresses C6 and would reintroduce the `gp_Trsf::Transforms` zero-init bug class for the chat agent.                                                                                                                                                                                                                                      | —        | —      | —                                                                                                                                                                       | —          |
| R9  | **Reject D5 (full curated facade).** Incompatible with OCJS's full-coverage commitment.                                                                                                                                                                                                                                                                                                               | —        | —      | —                                                                                                                                                                       | —          |

The shipped path is **R1 → R3 → R4 → R5 → R2 → R6**. R1/R3 define the structural contract; R4/R5 make the remaining envelopes truthful and discoverable; R2 is the cleanup pass that collapses now-unnecessary envelopes to native returns; R6 publishes the decision tree after the generated surface stabilises.

## Open Questions

| Q   | Question                                                                                                                     | Resolution path                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Does omitting class outputs from the envelope make mixed methods harder to learn?                                            | Slightly, but the dts exposes the rule mechanically: args-only means class mutation; args+return means primitive / enum; return-only means elided Handle. R6 should publish that rule prominently.                                                                                 |
| Q2  | What about backwards compatibility for code that already migrated to "read from envelope" for class outputs?                 | OCJS v3 is still pre-release. The production-facing win is stronger: pre-RBV code that reads mutated class args starts working again. Smoke tests written during the Option C+ migration need to move class reads back to the input variable.                                      |
| Q3  | Should generated JSDoc reintroduce noisy output-param prose after we just removed it?                                        | Yes, but only for class params that mutate in place, and only as a concise suffix appended to existing upstream `@param` text. The previously removed "Output buffer; pass a fresh instance..." boilerplate stays gone.                                                            |
| Q4  | How should `_jsdoc()` handle output params with no upstream `@param` entry?                                                  | Emit a minimal `@param` only when the param is JS-visible and mutates in place: `@param theP Mutated in place; read the updated value from this argument after the call.` Do not synthesize noisy placeholder text for elided Handles.                                             |
| Q5  | What about methods with no Doxygen `@returns` text but an emitted envelope?                                                  | Emit a synthetic `@returns A result object …` block describing every envelope field, including ownership for Handle fields and `[Symbol.dispose]()` when present. This is the bindgen's chance to make mixed containers self-documenting.                                          |
| Q6  | Does D2 still require `[Symbol.dispose]` on `GetClippingPlane`?                                                              | Yes. `thePlane: gp_Pln` is removed from the envelope and mutated in place, but `theName: TCollection_HAsciiString` is a `Handle<T>` output returned by Approach G. The envelope still owns `theName`, so it remains disposable.                                                    |
| Q7  | Performance: does class mutation help in OCJS-real workloads, or is the 1.41× POC speedup an artefact of the microbenchmark? | Re-run the OCJS benchmark suite (`pnpm nx run ocjs:benchmark`) with a branch carrying D2 enabled for `gp_Pln`, `gp_Pnt`, `gp_Vec`, `Bnd_Box`. Even if real workload gains compress, the API-shape win remains the primary reason to ship.                                          |
| Q8  | Should D2 change the S0/S1/S2 taxonomy names?                                                                                | Yes. The old taxonomy assumed all output params go through an envelope. After D2, we need a fourth named shape or a renamed taxonomy: class-mutating methods are not S1/S2 envelopes at all. Update `ocjs-rbv-test-corpus-contract-drift.md` or supersede it after implementation. |

## References

- `docs/research/ocjs-unified-rbv-blueprint.md` — Universal Input-Passthrough RBV blueprint; canonical S2 envelope spec and the `EM_JS` disposer.
- `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` — F3 working-copy stocktake; documents the Option C+ adoption (universal full-arity) and the OCCT direction-tag audit that rejected Option A.
- `docs/research/ocjs-rbv-universal-reference-passthrough.md` — **superseded for `Handle<T>` only**; class-typed Findings 1-7 (POC for `val::as<T&>()`) remain valid and underpin R3.
- `docs/research/ocjs-rbv-handle-output-param-elision.md` — Approach G for `Handle<T>` outputs; 2.29× POC speedup; the JS-facing input is dropped entirely.
- `docs/research/ocjs-rbv-test-corpus-contract-drift.md` — S0/S1/S2 return-shape taxonomy; the test-corpus migration that locked the universal-arity contract.
- `docs/research/wasm-cpp-rbv-prior-art.md` — Cross-library survey of 9 C++→WASM libraries; introduces patterns P1-P5; documents the universal "caller-allocated for in/out" convention outside OCJS.
- `docs/research/embind-return-strategy-benchmarks.md` — `value_array` vs `value_object` vs `emscripten::val` benchmark; `value_object` wins on DX at zero perf cost.
- `docs/research/embind-smart-pointer-stale-ptr.md` — Root cause of the original Handle-by-ref crash; the foundational fact that drove OCJS to RBV in the first place.
- `docs/research/wasm-smart-pointer-landscape.md` — Industry survey of smart-pointer handling across WASM/C++ binding stacks; confirms no major project successfully uses `smart_ptr_trait` with mutable references.
- `docs/research/replicad-class-rbv-migration-surface.md` — Quantifies upstream consumer impact of class-RBV at 8 call sites across 4 files in replicad.
- `repos/opencascade.js/BREAKING_CHANGES.md` §B2, §B3 — Public-facing documentation of the Universal Input-Passthrough RBV contract and Approach G Handle elision.
- TC39 Explicit Resource Management proposal (`Symbol.dispose`, `using` declaration) — [`tc39/proposal-explicit-resource-management`](https://github.com/tc39/proposal-explicit-resource-management).
- Emscripten Embind docs (`value_object`, `val::as<T&>()`, smart-pointer traits) — `repos/emscripten/site/source/docs/porting/connecting_cpp_and_javascript/embind.rst`.
