---
title: 'OCJS optional-overload strategic review'
description: 'Independent strategic review of the OCJS trailing-default migration, optional-vs-val framing, eigenquestions, and emitter decision matrix.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: comparison
related:
  - docs/research/ocjs-v8-bindings-remaining-issues.md
  - docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md
  - docs/research/ocjs-rbv-handle-output-param-elision.md
  - docs/research/unified-return-by-value.md
  - docs/research/emscripten-idiomatic-js.md
---

# OCJS optional-overload strategic review

Independent review of the in-flight OCJS migration from arity-fan-out trailing-default emission toward `std::optional<T>`-wrapped bindings, with special attention to whether the strategic recommendation to build a `emscripten::val`-dispatch alternative should be accepted.

## Executive Summary

Verdict: **partially concur** with the recommendation to build Corpus C and run a three-way A/B/C bench. The bench is necessary because the current failure set shows that `std::optional<T>` is not merely an implementation swap for arity fan-out; it changes the binding's semantic vocabulary. The part I would modify is the decision framing: do not ask which one primitive should replace fan-out globally. Ask which C++ source semantic each argument position carries, then choose `std::optional`, `emscripten::val`, native embind overloads, or explicit suffix/facade emission per shape.

The eigenquestion is: **what distinction does the C++ call site depend on that JavaScript can or cannot represent at runtime?** If the distinction is only "argument omitted, use the C++ default expression", omission is a call-shape choice and should not be conflated with `Maybe<T>`. If the distinction is runtime type identity, nullability, output mutation, smart-pointer reassignment, or template-instantiated surface shape, `std::optional<T>` either does not answer the question or answers the wrong one.

The single most important adjustment I recommend is to turn the Strategic Assessment into an emitter decision matrix, not an A/B/C horse race. Corpus C should still be built, but its output should be a per-shape verdict table: optional for pure trailing defaults where omitted means "default expression"; val for runtime discrimination and mixed shape dispatch; RBV-specific wrappers for output params and return wrappers; fan-out only as a baseline or temporary fallback.

## Scope and Methodology

I created a detached worktree at `/Users/rifont/.cursor/worktrees/ocjs-review-7f3a9c2d/tau-176651a9b66b`, checked for `.cursor/worktrees.json` in both the root checkout and worktree, and found no setup configuration.

Important availability note: the clean worktree did **not** contain the in-flight untracked research files named in the prompt:

- `docs/research/ocjs-optional-overload-poc-coverage-gaps.md`
- `docs/research/ocjs-optional-overload-resolution-blueprint.md`
- `docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`
- `docs/research/ocjs-libembind-strategic-direction-assessment.md`
- `repos/opencascade.js/experiments/poc-occt-integration/README.md`
- generated `repos/opencascade.js/build/bindings/**/*.cpp`

I therefore treated the prompt's summary of Findings 1-6, R9-R14, and S.1-S.9 as the review target, and grounded the analysis in tracked material that was available inside the worktree:

- `docs/research/ocjs-v8-bindings-remaining-issues.md`
- `docs/research/ocjs-rbv-non-copyable-and-integer-overload-dedup.md`
- `docs/research/ocjs-rbv-universal-reference-passthrough.md`
- `docs/research/ocjs-rbv-handle-output-param-elision.md`
- `docs/research/unified-return-by-value.md`
- `docs/research/ocjs-type-resolution-failures.md`
- `docs/research/emscripten-idiomatic-js.md`
- hydrated `repos/opencascade.js` source via `pnpm repos clone opencascade.js`
- `repos/opencascade.js/src/patches/libembind-overloading.patch`
- `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py`
- `repos/opencascade.js/src/ocjs_bindgen/codegen/dispatch.py`
- `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/{constructor,method}.py`
- `repos/opencascade.js/src/ocjs_bindgen/codegen/rbv.py`
- smoke tests for default args, overload clobber, ambiguous overloads, RBV, and handle output elision.

That caveat affects confidence in exact edits to the absent S/R sections, but not the core strategic conclusion: the tracked OCJS source already demonstrates multiple semantic axes that cannot be collapsed into a single optional-wrapper primitive.

## Q1: Concurrence Check

### Verdict: Partially Concur

I concur with the key caution in S.8 as described: **do not keep deepening the `std::optional<T>` path before testing a val-dispatch alternative against the real failure corpus**. Seven-plus unexpected smoke failures after a green PoC is exactly the signal that the PoC's model did not cover the true semantic product space.

I only partially concur because a three-way A/B/C bench can still be misleading if it asks, "Which primitive wins?" The right question is, "Which primitive is valid for this C++ source shape?" Some shapes are not competitors:

| Shape                               | Why this is not a global primitive race                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure trailing defaults              | `std::optional<T>` can model JS omission if the default expression can be reconstructed safely. `emscripten::val` is more flexible but may be an unnecessary runtime tax. |
| Same-arity type overloads           | `std::optional<T>` does not solve runtime type discrimination; val dispatch or embind signature dispatch is the core primitive.                                           |
| Output parameters                   | Neither trailing-default optional nor fan-out is the core issue; RBV envelope semantics decide the JS surface.                                                            |
| `Handle<T>&` output params          | The tracked architecture already found that input elision, not optional wrapping, is the correct lever.                                                                   |
| JS-indistinguishable overload twins | The correct answer may be deduplication or suffix-only explicit escape hatches, not val or optional.                                                                      |

The current codebase already embodies this: same-arity overload clobbers were fixed by routing groups through `_emitValDispatchMethod`, while `FindKey(size_t)`/`FindKey(int)` was fixed by AST-time JS-signature deduplication, and `Handle<T>&` was fixed by eliding the JS input slot. Those are three different answers to three different source semantics.

### Why Corpus C Is Still Worth Building

Corpus C should be built because `emscripten::val` is the only tested primitive that can observe the actual JS values: omitted/undefined/null/object/string/number/integer-ness/registered-class identity. It is therefore the correct stress primitive for failure discovery. It can answer:

- whether omitted arguments can be detected without arity fan-out;
- whether `undefined` and `null` should be accepted, rejected, or interpreted differently;
- whether defaulted `Handle<T>`/object parameters require null sentinel behavior;
- whether multi-overload groups can remain suffix-free without embind clobbering;
- whether code size/runtime costs are acceptable at OCJS scale.

But Corpus C should not be promoted to "replace optional everywhere" unless it also beats optional on simple trailing-default constructors and methods. The output of the bench should be a **decision matrix**, not a single winner.

## Q2: Eigenquestion Identification

### The Fundamental Eigenquestions

1. **Is absence a call-shape request or a value?**

   In C++, a trailing default is not a runtime value. The call `foo(a)` means the compiler selected a function declaration and substituted a default expression for later parameters. By contrast, `std::optional<T>` is a runtime value: present or disengaged. JavaScript's `undefined` can mean either "argument omitted" or "explicit undefined value". The migration must not collapse these concepts accidentally.

2. **Can JavaScript express the C++ distinction at runtime?**

   Some distinctions survive:
   - class identity via `instanceof`;
   - string/number/boolean;
   - integer vs non-integer number, within limits;
   - `null` vs `undefined`;
   - object presence.

   Some distinctions do not survive:
   - `int` vs `size_t` for ordinary JS numbers;
   - `char` vs `const char*` if both are surfaced as strings;
   - const vs non-const overloads;
   - template/SFINAE distinctions after instantiation if the JS wire types match;
   - multiple C++ default expressions that produce the same JS arity and type signature.

3. **Is the argument an input, output, in/out, or ownership/lifetime carrier?**

   Output params (`T&`) are not primarily optional/default problems. They are impedance mismatches between C++ reference mutation and JS call semantics. The existing RBV research showed several subcases:
   - primitive outputs can become returned fields;
   - class `T&` outputs can be passed by `val` and decoded to `T&`, preserving identity;
   - non-const `Handle<T>&` is output-only by OCCT convention and should have the JS input slot elided;
   - smart-pointer reassignment does not propagate through `val::as<SmartPtr<T>&>()`, so handle outputs need fresh wrapper fields and disposer semantics.

4. **Does C++ overload resolution encode semantic alternatives or accidental compatibility shims?**

   `FindKey(size_t)` plus `FindKey(int)` is not a meaningful JS overload set. It is a source-level OCCT migration shim. The correct JS behavior is one primary method, preferably the modern canonical signature. Conversely, `SetColor(TDF_Label, Quantity_Color, ...)` vs `SetColor(TopoDS_Shape, Quantity_Color, ...)` is a real semantic overload and must remain suffix-free if JS can discriminate it.

5. **Can the generated surface remain coherent for both humans and agentic callers?**

   An API where `Bounds()` sometimes means "no args", sometimes `Bounds(0,0,0,0)`, sometimes `{ current }`, and sometimes `_3` suffixes is hostile. The emitter needs a stable taxonomy visible in `.d.ts`, smoke tests, JSDoc, and possibly a policy doc.

### The Single Most Important Question

**For each C++ parameter position and overload group, what semantic distinction must be preserved, and does the JavaScript runtime preserve enough information to preserve it without a suffix or facade?**

Once answered, everything else falls into place:

- If JS can preserve the distinction cheaply, use native/val dispatch.
- If JS cannot preserve it but one overload semantically subsumes the other, dedupe.
- If JS cannot preserve it and both meanings are real, expose a primary only when there is a principled default plus suffixed escape hatches, or keep suffixed variants.
- If the distinction is output/lifetime rather than input selection, route through RBV/envelope policy.
- If the distinction is "C++ omitted argument", use a default-argument strategy, not a nullable-value strategy.

## Q3: Reframing Test

### Framing: "The JavaScript interface should mimic the C++ interface, both ergonomically and in intent"

This framing makes the problem tractable because it separates **surface ceremony** from **semantic intent**.

Mimicking ergonomically does not mean transliterating every C++ parameter literally. A JS developer should not need to allocate placeholder out parameters to ask a surface for its bounds. If the C++ intent is "compute bounds into four references", the JS ergonomic equivalent is:

```ts
const { U1, U2, V1, V2 } = surface.Bounds();
```

or, following existing OCJS capitalization, whatever field names are generated from OCCT parameter names. The user should not have to write an out-param ceremony merely because C++ lacks tuple returns in older APIs.

Mimicking in intent means that when C++ overload resolution carries real semantic meaning, the JS API preserves it if JS can express it. Examples:

- `SetColor(label, color, type)` and `SetColor(shape, color, type)` should both be `SetColor`, with runtime dispatch on `TDF_Label` vs `TopoDS_Shape`.
- `FindKey(size_t)` and `FindKey(int)` should not both be first-class JS overloads because JS cannot express the distinction and the `int` variant is a compatibility shim.
- `std::optional<T>` return values should surface as `T | undefined` or a clear nullable union, because the C++ intent is data optionality, not omitted call arguments.
- `Handle<T>&` outputs should return a fresh handle field, because the C++ intent is assignment to an output handle, not mutation of a JS-supplied placeholder.

### Primitive Implications

| Primitive          | Best interpretation under the framing                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `std::optional<T>` | Good for defaulted trailing inputs only when omission means "use the C++ default" and for actual C++ optional value semantics. Dangerous as a generic representation for every omitted JS argument because it can blur omission, undefined, null, and Maybe.        |
| `emscripten::val`  | Good for runtime discrimination, omission/null/undefined policy, class identity checks, output class reference passthrough, and mixed overload groups. Too blunt for simple cases where native embind signatures already preserve intent.                           |
| Hybrid             | The likely correct answer. Use typed/native paths for simple arity and default cases, val only where runtime information is needed, RBV for output/lifetime shapes, dedup/suffix for JS-indistinguishable cases.                                                    |
| Fan-out            | Useful as an empirical baseline and maybe for narrow simple constructor cases. Poor as the long-term general primitive because it duplicates registrations, interacts badly with embind's `(name, arity)` behavior, and hides semantic conflicts until smoke tests. |

### SFINAE, ADL, and Template Surfaces

C++ overload resolution has mechanisms JS cannot mimic directly: SFINAE, ADL, template partial specialization, implicit conversions, and typedef-driven alias surfaces. The JS layer should not pretend to reproduce those mechanisms dynamically. It should expose the **resolved concrete instantiations** that the bindgen selected, then make the JS runtime contract honest for those concrete signatures.

For NCollection and template-instantiated surfaces, this means source-level resolution and audit tooling matter more than a runtime primitive. Once `NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher` exists as a concrete binding, the emitter can decide whether `FindKey` is deduped, val-dispatched, or suffixed based on the concrete signatures.

## Q4: Canonical Overload and Argument Shape Matrix

The following table is the decision matrix I would make canonical for emitter work. "Best primitive" means the likely production choice, not necessarily the only experiment to run.

| #   | C++ source pattern                                                                     | Example surface encountered                                                                                        | Expected JS call                                                             | Best primitive                                                         | Justification                                                                                                                                          | Open questions                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Single overload with trailing defaults                                                 | `BRepMesh_IncrementalMesh(shape, linearDeflection, isRelative = false, angDeflection = ..., isInParallel = false)` | `new oc.BRepMesh_IncrementalMesh(shape, 0.1)` and longer prefixes            | `std::optional<T>` or narrow fan-out baseline                          | Omitted trailing args genuinely mean "use C++ defaults". Optional can reduce fan-out if it preserves arity ergonomics and default expressions exactly. | Can every default expression be emitted safely? How are non-literal defaults represented? Does embind accept omitted args or only explicit `undefined`?        |
| 2   | Single overload with non-trailing required args                                        | Rare/invalid for C++ defaults                                                                                      | Normal full required call                                                    | Native typed binding                                                   | C++ only permits defaults after the first defaulted parameter in a declaration.                                                                        | Need merged declaration audit when defaults appear in separate declarations.                                                                                   |
| 3   | Multi-overload, unique arities, no defaults                                            | Many OCCT methods after suffix-free work                                                                           | `foo(a)` / `foo(a,b)`                                                        | Native embind overload by arity                                        | Arity is the same discriminator JS and embind already preserve.                                                                                        | Ensure default expansions do not create a same-arity collision.                                                                                                |
| 4   | Multi-overload, one sibling has trailing defaults that overlap another sibling's arity | `foo(T1, T2 = def)` plus `foo(T1)` or related constructors                                                         | `foo(t1)` should select the intended C++ semantic                            | Hybrid: source audit plus val or dedup                                 | This is the dangerous shape: omitted default and true shorter overload compete for the same JS call.                                                   | Need catalog audit to decide whether shorter overload is semantic or redundant.                                                                                |
| 5   | Degenerate sibling constructors                                                        | `C(T1, T2 = def)` plus `C(T2 = def)` / same min arity after defaults                                               | `new C(...)` without suffix when JS can discriminate; suffix otherwise       | Val if JS-distinguishable, suffix if not                               | Constructor dispatch cannot rely only on arity when defaults collapse.                                                                                 | Need negative tests where both reduced signatures start with `number` or both object-compatible.                                                               |
| 6   | Same-name same-arity class-typed overloads                                             | `XCAFDoc_ColorTool.SetColor(label                                                                                  | shape, color, type)`; `NCollection_List.Append(shape                         | list)`                                                                 | `tool.SetColor(boxShape, color, type)`                                                                                                                 | `emscripten::val` dispatch                                                                                                                                     | Runtime `instanceof` preserves the semantic distinction. Existing tracked fix routes these through `_emitValDispatchMethod`. | Need stable behavior for inheritance and handles to derived classes. |
| 7   | Same-name same-arity static plus instance overloads                                    | `XCAFDoc_ColorTool.GetColor` shape/label variants                                                                  | `oc.Class.GetColor(...)` and `instance.GetColor(...)`                        | Split val dispatchers                                                  | Current source splits static and instance subsets because one dispatcher cannot be both `class_function` and instance `.function`.                     | Need coverage for defaulted params in only one subset.                                                                                                         |
| 8   | JS-indistinguishable integer twins                                                     | `FindKey(size_t)` plus `FindKey(int)`                                                                              | `map.FindKey(1)`                                                             | Dedup, prefer modern canonical                                         | JS cannot represent the distinction. Existing source scores wider/unsigned and keeps `size_t`.                                                         | Audit all NCollection size_t migration twins.                                                                                                                  |
| 9   | Integer vs floating overloads                                                          | `SetCoord(int, double)` vs coordinate pair; `TCollection_AsciiString(int                                           | double)`                                                                     | Integer literals route to integer overload; non-integers route to real | Val/dispatch with `Number.isInteger`                                                                                                                   | JS preserves integer-ness imperfectly but usefully. Tests already document that `10.0` is integer.                                                             | Define range policy for values outside C++ integer range and for `NaN`/`Infinity`.                                           |
| 10  | `char` vs `const char*`                                                                | `TCollection_AsciiString` constructors                                                                             | String calls should hit C-string unless a char overload is explicitly needed | Hybrid: TS classification plus suffix escape                           | Runtime both are strings. Current TS-only classifier separates `string_char`; runtime cannot truly discriminate.                                       | Decide whether single-character strings should ever route to `char` automatically.                                                                             |
| 11  | Enum vs string overloads / enum string values                                          | enum registered with string-valued embind                                                                          | `foo(oc.Enum.X)` or string enum value                                        | Val dispatch with enum membership check                                | Existing dispatch checks module enum object membership for `string_enum`.                                                                              | Ensure enum string values cannot collide with arbitrary string overloads.                                                                                      |
| 12  | Raw pointer params                                                                     | Low-level APIs, raw pointer outputs                                                                                | Usually unbindable or `nullptr` sentinel                                     | Explicit policy / keep filtered                                        | `dispatch._convert_args` maps raw pointer params to `nullptr` unless C-string. This is not an optional-default problem.                                | Audit whether any raw pointer param should surface as nullable `null`.                                                                                         |
| 13  | Function-pointer/callback params                                                       | OCCT callback or allocator hooks                                                                                   | Usually not exposed in raw API                                               | Keep filtered or custom facade                                         | Embind cannot synthesize safe JS function pointer bindings generically.                                                                                | Catalog any smoke-relevant callbacks before default migration touches them.                                                                                    |
| 14  | Primitive output params on const methods                                               | `Geom_Surface.Bounds(double&,...) const`; `Bnd_Box.Get(...)`                                                       | Ideally `surface.Bounds()` returns object                                    | RBV wrapper, possibly arity-tolerant val/default wrapper               | Intent is output, not JS input. Ergonomic mimic suggests no placeholder args for pure out params.                                                      | Existing tracked work accepted full-arity placeholders because OCCT direction tags were incomplete; strategic doc should revisit with source/const heuristics. |
| 15  | Primitive in/out params                                                                | `gp_Trsf.Transforms(double&, double&, double&)`                                                                    | `trsf.Transforms(x, y, z)` returns updated object                            | RBV full-arity input-passthrough                                       | These are genuine inputs and outputs; omission would lose intent.                                                                                      | Need JSDoc to distinguish in/out from pure out.                                                                                                                |
| 16  | Class `T&` output or in/out param                                                      | `BRepGraph&`, class output refs                                                                                    | Caller passes instance if input/inout; returned field aliases same instance  | RBV + val reference passthrough                                        | POCs showed `val::as<T&>()` preserves identity and supports non-copyable types.                                                                        | Need copy/deleted-copy audit for every class output.                                                                                                           |
| 17  | `Handle<T>&` output param                                                              | `GeomLib.To3d(..., Handle<Geom_Curve>&)`                                                                           | No JS placeholder; return handle field in disposable envelope                | RBV input elision                                                      | Existing research showed smart-pointer reassignment does not propagate to caller; JS input is gratuitous.                                              | Audit any `Handle<T>&` that violates output-only OCCT convention.                                                                                              |
| 18  | `const Handle<T>&` input param                                                         | Curves, surfaces, documents as inputs                                                                              | Pass existing handle/object                                                  | Native typed binding                                                   | This is input, not optional or output.                                                                                                                 | Null handling: should `null` be accepted for nullable handles? Need source-level convention.                                                                   |
| 19  | Actual `std::optional<T>` return                                                       | Type-resolution docs map optional to `T                                                                            | undefined`                                                                   | `const maybe = obj.foo()`                                              | Native optional value mapping                                                                                                                          | This is real Maybe semantics and should stay distinct from omitted arguments.                                                                                  | Need smoke tests for return optional and optional field disposal if `T` is managed.                                          |
| 20  | Actual `std::optional<T>` parameter, non-default semantic                              | T3-style APIs if present                                                                                           | `foo(value)` or `foo(undefined)` explicitly                                  | `std::optional<T>` with explicit undefined policy                      | Here optional is the source semantic, not an implementation trick.                                                                                     | Need catalog to find real OCCT optional params vs generated wrappers.                                                                                          |
| 21  | Defaulted object/handle param where C++ default is null/default-constructed            | `Message_ProgressRange = Message_ProgressRange()` style                                                            | `foo(a)` should use default progress                                         | `std::optional<T>` or val omission wrapper                             | Omitted means default object, not necessarily null.                                                                                                    | Need ensure wrapper constructs the same default expression, not just `T{}` if source uses named sentinel.                                                      |
| 22  | Defaulted enum/boolean policy flags                                                    | Boolean flags, enum mode defaults                                                                                  | `foo(shape)` or `foo(shape, mode)`                                           | `std::optional<T>` likely best                                         | Simple scalar defaults are the best optional candidate.                                                                                                | Need verify TS optional marker matches runtime omit, undefined, and null behavior.                                                                             |
| 23  | Return-by-value non-copyable class / reference returns needing wrapper                 | RBV docs mention non-copyable value returns and thread-local staging                                               | Normal call returns managed object or val                                    | RBV/native return wrapper                                              | The issue is embind wire marshal/copyability, not argument optionality.                                                                                | Need ensure optional default wrappers do not bypass return wrapper path.                                                                                       |
| 24  | Mixed return types in overload group                                                   | Same method name with void and non-void overloads                                                                  | One JS method if type-dispatchable                                           | Val dispatch with `emscripten::val` return                             | Current dispatcher has `mixed_returns` path returning `val::undefined()` for void.                                                                     | TS overload declarations must mirror runtime exactly.                                                                                                          |
| 25  | RBV-elided arity collisions                                                            | One overload has stripped handle output so JS arity collides with another                                          | Single call should select richer envelope when equivalent                    | JS-effective dedup / RBV collision dispatch                            | Current source ranks envelope richness and emits collision dispatch.                                                                                   | Optional-default migration must use JS-effective arity, not raw C++ arity.                                                                                     |
| 26  | NCollection template-instantiated containers                                           | `NCollection_List_TopoDS_Shape`, maps, arrays                                                                      | Normal concrete class names                                                  | Source generation + typed/val dispatch as needed                       | Template discovery decides which concrete classes exist; optional vs val is downstream.                                                                | Audit defaulted template params and typedef aliases with omitted template defaults.                                                                            |
| 27  | ADL/free function/static helper surfaces                                               | Builtin wrappers, static functions                                                                                 | Namespaced/static calls                                                      | Explicit generated facades                                             | JS has no ADL. The emitter should expose resolved names intentionally.                                                                                 | Need naming and collision policy outside overload migration.                                                                                                   |
| 28  | Nullable object arguments                                                              | `null` accepted by embind for class handles in some paths                                                          | `foo(null)` only when C++ accepts null                                       | Val or native with explicit null policy                                | `null` is a value, not omission. It should not silently mean "use default" unless source says so.                                                      | Catalog OCCT APIs where null handle is meaningful.                                                                                                             |
| 29  | Explicit `undefined` argument                                                          | `foo(a, undefined)`                                                                                                | Should usually match omission only for trailing default args                 | Optional/val policy                                                    | JS callers and agents may pass `undefined` explicitly. Define it once.                                                                                 | Decide whether `null` is rejected where `undefined` omits.                                                                                                     |
| 30  | Unbindable/SFINAE-only overloads                                                       | Template-only, deleted, rvalue refs                                                                                | Not present or suffixed/custom                                               | Filter at source                                                       | The current source already filters rvalue refs and deleted constructors.                                                                               | Ensure optional wrapper does not resurrect filtered overloads.                                                                                                 |

## Q5: Adjusted Recommendations

### Add

| #   | Recommendation                                                                                                                                                                      | Priority | Effort | Impact                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------ |
| A1  | Replace the global "optional vs val vs fan-out" framing with the emitter decision matrix above.                                                                                     | P0       | Low    | Prevents a false single-primitive decision and gives reviewers a source of truth.          |
| A2  | Build Corpus C, but score it per matrix row: correctness, JS ergonomics, TS declaration fidelity, generated C++ size, linked WASM size, runtime dispatch cost, and failure clarity. | P0       | Medium | Turns S.8 into actionable evidence rather than a broad strategy pause.                     |
| A3  | Add a "semantic absence policy": `omitted`, explicit `undefined`, explicit `null`, and actual `std::optional<T>` must be documented as separate concepts.                           | P0       | Low    | Avoids the central semantic bug in optional-wrapper migrations.                            |
| A4  | Add catalog queries for overlapping default-expanded arities: any overload group where `min_arity..max_arity` ranges intersect another overload's arity range.                      | P0       | Medium | Finds degenerate constructors and sibling overloads before smoke tests do.                 |
| A5  | Add JS-effective signature collision checks after RBV elision and after default expansion, not just raw C++ arity checks.                                                           | P0       | Medium | Default args and stripped output params both change JS arity; this is where clobbers hide. |
| A6  | Add negative tests for `null` vs `undefined` vs omitted on scalar, object, handle, and enum defaults.                                                                               | P0       | Medium | Forces the migration to define absence semantics.                                          |
| A7  | Add a "real Maybe" corpus for actual `std::optional<T>` params/returns, separate from trailing default tests.                                                                       | P1       | Medium | Prevents default-argument machinery from polluting true optional value semantics.          |
| A8  | Add generated `.d.ts` contract tests that compare runtime-callable primaries against declared primaries for every smoke-target method.                                              | P1       | Medium | Generalizes the `FindKey` and overload-clobber regressions.                                |
| A9  | Add JSDoc language for pure-out vs in/out vs defaulted input so agentic callers know whether to pass placeholders or rely on returned fields.                                       | P1       | Low    | Improves LLM tool-use and human DX.                                                        |

### Drop

| Recommendation to drop                                                                                                                     | Why                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any statement that implies `std::optional<T>` should become the universal replacement for trailing fan-out before Corpus C runs.           | It conflates omitted/default semantics with runtime Maybe semantics and ignores overload/type dispatch.                                                    |
| Any statement that treats fan-out as the fallback of record without distinguishing baseline, temporary fallback, and production primitive. | Fan-out is useful for comparison but has known registration/clobber and code-size risks.                                                                   |
| Any recommendation to fix failures by per-class allowlists before exhausting generic source-shape predicates.                              | The tracked codebase repeatedly found generic causes: same-arity clobber, JS-indistinguishable integer twins, handle output elision, RBV arity collisions. |

### Modify Existing Strategic Recommendations

Because the exact R8'-R18 and S1-S6 text was not present in the clean worktree, these modifications are phrased by intent rather than line edit.

| Existing area            | Modification                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R9-R14 PoC experiments   | Keep them, but require each experiment to map its result back to the canonical matrix. A failing case should create or update a matrix row, not only a one-off recommendation.   |
| S.1 optional semantics   | Split into "omitted default argument" and "actual optional value". They are different source semantics even if both can surface as `undefined` in TS.                            |
| S.2 val alternative      | Promote val from "alternative implementation primitive" to "diagnostic and runtime-discrimination primitive". It should be used where JS runtime values are the source of truth. |
| S.3 benchmark            | Add code-size and linked-WASM-size deltas, not only runtime. OCJS is large enough that binding duplication matters.                                                              |
| S.4 failure taxonomy     | Reclassify failures by source semantic: default overlap, JS-indistinguishable overload, output/lifetime, return wrapper, template instantiation, nullability.                    |
| S.5 migration sequencing | Freeze new optional-wrapper broadening until the matrix and overlap audit land, but allow isolated fixes for rows with already-proven primitives.                                |
| S.6 decision rule        | Replace "pick optional/val/fan-out" with "pick per shape; default to the least dynamic primitive that preserves source intent and JS ergonomics."                                |
| S.8 three-way bench      | Keep the bench, but make its success criterion per-row correctness and migration guidance, not one global winner.                                                                |

### New PoC Experiments Beyond R9-R14

| #   | Experiment                                                                                                                                                | Why it matters                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| N1  | Omitted vs explicit `undefined` vs `null` for scalar defaults, class defaults, handle defaults, and enum defaults.                                        | This is the semantic core of the optional migration.                                                           |
| N2  | Overlap generator: synthesize `C(int, double = 1.0)`, `C(int)`, `C(double = 1.0)`, and `C(std::optional<int>)` variants and assert generated JS behavior. | Captures degenerate sibling constructors and optional-value collisions.                                        |
| N3  | Default expression fidelity: literals, enum constants, default constructors, static sentinels, `Message_ProgressRange()`, and named constants.            | `std::optional<T>` wrappers must reconstruct C++ defaults exactly or delegate to C++ overloads that do.        |
| N4  | Nullability of handles and class pointers: `null` as C++ null handle vs invalid object vs omitted default.                                                | Prevents `null` from becoming an accidental synonym for omission.                                              |
| N5  | JS-effective signature audit after RBV and default expansion together.                                                                                    | Defaults and RBV stripping compose; most PoCs test them separately.                                            |
| N6  | Mixed static/instance + trailing defaults.                                                                                                                | Existing source already needs static/instance split for same-name groups; defaults can reintroduce collisions. |
| N7  | Actual `std::optional<T>` return/param corpus.                                                                                                            | Validates the real Maybe surface independently from trailing defaults.                                         |
| N8  | Error-message comparison for invalid signatures across optional, val, and fan-out.                                                                        | Agentic callers need actionable error messages, not only passing happy paths.                                  |

### Catalog Audits Needed

| Audit                           | Candidate classes/YAMLs                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default-expanded arity overlaps | `BRepMesh_IncrementalMesh`, `BRepAlgoAPI_Fuse`, `BRepOffsetAPI_MakeThickSolid`, `BRepBuilderAPI_MakeEdge`, `BRepBuilderAPI_MakeFace`, `GeomAPI_*`, `Extrema_*`, `Message_ProgressRange` users. |
| Degenerate constructors         | `gp_*` value types, `TCollection_AsciiString`, `TCollection_ExtendedString`, `BRepPrimAPI_MakeBox`, `BRepBuilderAPI_MakeEdge`.                                                                 |
| Integer twins                   | All `NCollection_*` maps/lists/indexed maps affected by OCCT V8 `size_t` migration: `FindKey`, `FindIndex`, `Add`, `Remove`, accessors.                                                        |
| Same-arity class overloads      | `XCAFDoc_ColorTool`, `NCollection_List_*`, `TopTools_*`, `BRepOffsetAPI_*`, `BRepAlgoAPI_*`.                                                                                                   |
| Pure-out vs in/out refs         | `Geom_Surface.Bounds`, `Bnd_Box.Get`, `BRep_Tool.Range`, `BRep_Tool.Curve`, `gp_Trsf.Transforms`, `GeomAPI_ProjectPointOnSurf.LowerDistanceParameters`.                                        |
| Handle output elision           | `GeomLib.To3d`, `Geom2dAdaptor.MakeCurve`, `BRepLib_FindSurface`, `BRepTools.Read`, `GeomFill_GordonBuilder.Perform`.                                                                          |
| Non-copyable / RBV returns      | `BRepGraph_Builder.Add`, BRepGraph classes, nested V8 structs with deleted copy constructors.                                                                                                  |
| Nullable/default object args    | Progress range, allocator, optional tool/context handles, `Handle_*` parameters with documented null behavior.                                                                                 |

## Final Recommendation

Keep the strategic pause implied by S.8, but make it sharper:

1. Build Corpus C and bench A/B/C.
2. Add the matrix in this document to the primary research doc.
3. Refuse a global primitive decision.
4. Make every emitter branch justify itself against source semantics and JS representability.

The migration is not fundamentally about replacing arity fan-out with `std::optional<T>`. It is about making OCJS's generated JavaScript API mimic the C++ API's **intent** while removing C++-only ceremony. Once that is the framing, `std::optional`, `emscripten::val`, fan-out, RBV envelopes, deduplication, and suffix escape hatches each become tools with bounded domains instead of rival grand strategies.
