---
title: 'OCJS libembind Patch — Strategic Direction Assessment'
description: 'Step-back evaluation of whether the taucad libembind-overloading.patch is fighting embind or extending it cleanly; reframes the outstanding-issues catalog severity against real consumer evidence and upstream embind canonicals.'
status: active
created: '2026-05-28'
updated: '2026-05-28'
category: investigation
related:
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-trailing-default-arity-fan-out.md
  - docs/research/ocjs-embind-js-dispatch-failures.md
  - docs/research/ocjs-unified-rbv-blueprint.md
---

# OCJS libembind Patch — Strategic Direction Assessment

Step-back evaluation of whether the taucad fork's `libembind-overloading.patch` is fighting embind or extending it cleanly, prompted by visible evidence that real consumers (replicad rendering production CAD models in the Tau UI) are unaffected by the catalogued FO-R1 regression. Includes a reframed severity for the outstanding-issues catalog and a strategic recommendation grounded in upstream embind canonicals.

## Executive Summary

The catalog's prior severity framing — "FO-R1 affects ~100% of non-trivial CAD users" — is **wrong**. A 227-symbol replicad WASM build excludes `BRepFeat_SplitShape` (the cross-sibling registration that mutates `BRepBuilderAPI_MakeShape`'s inherited overload table), so the cross-sibling stomp **never registers and never fires** in production. The OCJS smoke suite tests against the 4,441-symbol `full.yml`; replicad ships 5% of that surface. The birdhouse model rendering in the Tau UI is direct evidence: real consumers using trimmed builds are unaffected.

The strategic question is then: **are we fighting embind by maintaining a 480-line patch, or extending it on a vector the upstream maintainers already acknowledge as valuable?**

The answer is **mixed but recoverable**. The patch combines two architecturally distinct concerns:

1. **Same-arity type-based overload dispatch** (the load-bearing capability behind v3's suffix-free overloads, `new oc.gp_Pnt(1,2,3)` instead of `oc.gp_Pnt_3(1,2,3)`) — this is genuinely novel work the upstream maintainers have considered but never merged ([PR #17445](https://github.com/emscripten-core/emscripten/pull/17445), changes-requested on performance grounds). It is a defensible fork-side commitment, given v3's BREAKING_CHANGES §B1 has shipped it as a primary user-facing value proposition.

2. **Arity fan-out for trailing C++ default arguments** (`Build()` and `Build(progress)` as two separate arity registrations) — this **is** fighting embind. Upstream's canonical solution since [Emscripten 3.1.68 / PR #22591](https://github.com/emscripten-core/emscripten/issues/22389) is `std::optional<T>` + relaxed argument-count verification. Adopting this collapses 5 of 8 catalog defects (TR-CW, TR-MO, TR-RBV, TR-GATE, partial FO-R3) into zero work — just remove the gates and use `std::optional`.

The recommendation is therefore neither "abandon the patch" nor "press on with all eight fixes" but rather **bifurcate the patch by concern**: keep the same-arity type-dispatch portion as a load-bearing fork commitment, retire the arity-fan-out portion in favour of upstream `std::optional<T>`. The result is a smaller patch, fewer defects, and architectural alignment with where upstream embind is going.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: FO-R1 is build-config dependent, not universal](#finding-1-fo-r1-is-build-config-dependent-not-universal)
  - [Finding 2: Upstream embind explicitly does not support type-based overload dispatch](#finding-2-upstream-embind-explicitly-does-not-support-type-based-overload-dispatch)
  - [Finding 3: Upstream's canonical solution for optional parameters is `std::optional<T>` plus relaxed arity verification](#finding-3-upstreams-canonical-solution-for-optional-parameters-is-stdoptionalt-plus-relaxed-arity-verification)
  - [Finding 4: The libembind patch combines two architecturally distinct concerns under one file](#finding-4-the-libembind-patch-combines-two-architecturally-distinct-concerns-under-one-file)
  - [Finding 5: V3's published commitments lock in same-arity dispatch but NOT arity fan-out](#finding-5-v3s-published-commitments-lock-in-same-arity-dispatch-but-not-arity-fan-out)
- [Strategic Options](#strategic-options)
- [Recommendations](#recommendations)
- [Catalog Severity Revisions](#catalog-severity-revisions)
- [References](#references)

## Problem Statement

The [`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](ocjs-bindgen-libembind-outstanding-issues-catalog.md) currently inventories 8 outstanding source-level defects across the fork's bindgen + libembind layers, plus 2 hot-patches that need permanent fixes. A prior prioritization pass framed FO-R1 (cross-sibling dispatch corruption in 3+-level OCCT inheritance) as affecting "~100% of non-trivial CAD users."

Direct observation contradicts this framing. The Tau UI is currently rendering a complex birdhouse CAD model (triangular roof, two boolean-cut wall faces, cylindrical entrance hole, perch — every feature replicad's `shapes.ts` boolean+fillet+chamfer machinery is supposed to invoke). The PR 301 description states "All replicad kernel tests passing (801/801) with V8 WASM builds." If FO-R1 affected ~100% of CAD users, the birdhouse and the 801 kernel tests would all fail.

This investigation answers three questions:

1. Why does the visible production usage work despite the cataloged smoke failures?
2. Are the libembind patches fighting embind's design, or extending it on a tractable vector?
3. Should the fork continue investing in the current direction, or backtrack to a different strategy?

## Methodology

1. Re-read [`repos/opencascade.js/BREAKING_CHANGES.md`](../../repos/opencascade.js/BREAKING_CHANGES.md) §A–§F to recover v3's published commitments to consumers.
2. Re-read [`repos/opencascade.js/src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) line-by-line to map every patch hunk against the architectural concern it serves.
3. Re-read the PR 301 conversation upload (`donalffons/opencascade.js#301`) for the test-plan evidence and the "801/801 kernel tests passing" claim.
4. Compared `build-configs/full.yml` (4,441 bound symbols, kitchen sink) against `repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml` (227 bound symbols, replicad's actual ship) to identify which symbols differ and which trigger FO-R1.
5. Reproduced the FO-R1 failure deterministically (`pnpm vitest run tests/smoke/smoke-fillets-chamfers.test.ts` against the full.yml build) and captured the stack trace.
6. Web-researched upstream embind's canonical position on type-based overloading and optional parameters via official documentation, core-team-tagged GitHub issues, and upstream PRs (#17445, #22591).
7. Cross-referenced against prior fork-side analysis: [`ocjs-trailing-default-arity-fan-out.md`](ocjs-trailing-default-arity-fan-out.md), [`ocjs-embind-js-dispatch-failures.md`](ocjs-embind-js-dispatch-failures.md), [`ocjs-unified-rbv-blueprint.md`](ocjs-unified-rbv-blueprint.md).

## Findings

### Finding 1: FO-R1 is build-config dependent, not universal

The failure stack trace from `smoke-fillets-chamfers.test.ts` running against the full.yml WASM artefact is unambiguous:

```
BindingError: Expected null or instance of BRepFeat_SplitShape,
              got an instance of BRepBuilderAPI_Command
 ❯ Zb.BRepFeat_SplitShape.Build  build-configs/opencascade_full.js:75:118
 ❯ Zb.a.<computed>.Zc.<computed>  build-configs/opencascade_full.js:61:32
 ❯ Zb.a.<computed> [as Build]  build-configs/opencascade_full.js:60:309
 ❯ tests/smoke/smoke-fillets-chamfers.test.ts:27:12   ← fillet.Build(progress)
```

The dispatcher routes `fillet.Build(progress)` to `BRepFeat_SplitShape.Build` because `BRepFeat_SplitShape`'s registration mutated `BRepBuilderAPI_MakeShape`'s inherited overload table at module-init time. `R1+R2`'s `Object.hasOwn` gates prevent the obvious 2-level stomp but are bypassed by the longer 3-level chain (`MakeShape → LocalOperation → MakeChamfer` vs `MakeShape → Command → SplitShape`).

The critical observation: **`BRepFeat_SplitShape` must be registered for this trigger to fire.** It is registered when present in the build YAML.

| Build artefact                            | YAML                                                                                                                                                       | Symbol count | `BRepFeat_SplitShape` present?                          | FO-R1 trigger active? |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- | --------------------- |
| OCJS `full.yml`                           | [`build-configs/full.yml`](../../repos/opencascade.js/build-configs/full.yml)                                                                              | 4,441        | **Yes** (line emitted)                                  | **Yes**               |
| Replicad ship                             | [`replicad-opencascadejs/build-config/custom_build_single.yml`](../../repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml) | 227          | **No** (only `MakeDPrism`, `Form` from BRepFeat family) | **No**                |
| Tau UI (`@taucad/replicad-opencascadejs`) | Same as replicad ship                                                                                                                                      | 227          | **No**                                                  | **No**                |

This reframes the FO-R1 severity completely. The bug is not "100% of CAD users" — it is "consumers who include the `BRepFeat_SplitShape` (or any symbol whose registration order creates a cross-sibling stomp on a shared inherited overload table) in their build." Most real-world consumers ship trimmed builds, and the dominant trimming pattern (replicad's) happens to exclude every symbol currently known to trigger this stomp.

This does not mean FO-R1 is unimportant — it is a real architectural defect, and consumers building custom trim-down YAMLs may hit it unexpectedly. But the catalog's framing as a universal production blocker was wrong. The catalog itself notes (Appendix B.4) that replicad rendering today depends on Path B being present — that observation was correct; the FO-R1 severity inflation around it was not.

### Finding 2: Upstream embind explicitly does not support type-based overload dispatch

The [official embind documentation](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html#overloaded-functions) is unambiguous:

> Constructors and functions can be overloaded on the number of arguments, but **embind does not support overloading based on type**. When specifying an overload, use the `select_overload()` helper function to select the appropriate signature.

The official guidance for same-arity overloads is: **give each variant a distinct JS name** (`foo_int`, `foo_float`) or add a dummy parameter to disambiguate.

This is reinforced by core-team commentary in [emscripten/issues/20117](https://github.com/emscripten-core/emscripten/issues/20117):

> Overloading is only partially supported and it only works on the number of arguments not the types. **We could probably support this, but there's no efficient way to do this in JS.** — @brendandahl

There has been an upstream attempt: [PR #17445 "feat(embind): add support for type-based overloading"](https://github.com/emscripten-core/emscripten/pull/17445), reviewed and marked "changes requested" on performance grounds ("For current consumers of the overload feature this is going to make things much slower, since there's a lot more work that will happen on every call to an overloaded function"). The PR has not merged.

**The taucad fork's `libembind-overloading.patch` is therefore reinventing what upstream PR #17445 proposed**, with broadly the same architecture (a `signaturesArray` per `(name, arity)` slot, `getSignature(args, keys)` doing runtime type-matching). The fork is fighting upstream embind here, but on a vector the maintainers have explicitly acknowledged as valuable — they just couldn't find a performance-acceptable implementation. **Maintaining a fork-side implementation is defensible** if (a) the v3 user-facing commitment to suffix-free overloads is held and (b) the performance overhead is acceptable for the OCCT use case.

### Finding 3: Upstream's canonical solution for optional parameters is `std::optional<T>` plus relaxed arity verification

For trailing default arguments specifically, upstream embind has a **canonical, supported solution** that landed in [Emscripten 3.1.68 / issue #22389 / PR #22591](https://github.com/emscripten-core/emscripten/issues/22389):

```cpp
#include <emscripten/bind.h>
#include <optional>
#include <string>

void FuncWithOptional(std::string arg1, std::optional<std::string> arg2) { /* … */ }

EMSCRIPTEN_BINDINGS(test) {
    using namespace emscripten;
    register_optional<std::string>();
    function("FuncWithOptional", &FuncWithOptional);
}
```

From JS, both invocations succeed natively:

```js
Module.FuncWithOptional('abc', 'def'); // arg2 = std::optional<std::string>("def")
Module.FuncWithOptional('abc'); // arg2 = std::nullopt (omitted entirely)
```

Embind's arity-count verifier was relaxed in PR #22591 to allow trailing `std::optional<T>` slots to be omitted from the JS call. **No bindgen-side arity fan-out is needed.** No `libembind-overloading.patch` extensions are needed. The C++ default-argument problem becomes a bindgen translation problem: emit `default_arg = T()` as `std::optional<T> arg = std::nullopt`, register the optional wrapper.

This is exactly the mechanism the fork's arity-fan-out approach is reinventing — and reinventing badly, given the catalog's TR-CW, TR-MO, TR-RBV, TR-GATE, FO-R3 defects all trace to gate predicates that exist because arity fan-out cannot compose with cstring wrappers / multi-overload dispatch / RBV envelopes. With `std::optional<T>`, the C++ binding lambda handles the unwrap; bindgen never needs to know about trailing-default fan-out at all.

The pattern even composes with the v3 RBV envelope shape (BREAKING_CHANGES §B2): `std::optional<Handle<T>>&` output params become envelope fields without arity-fan-out gymnastics.

### Finding 4: The libembind patch combines two architecturally distinct concerns under one file

Auditing [`libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch) hunk-by-hunk reveals it serves two concerns that should be evaluated independently:

| Concern                                     | Patch hunks                                                                                                                                                                                                      | What it enables                                                                                                            | Required for V3?                                                   | Upstream canonical?                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| **C1: Same-arity type dispatch**            | `$getSignature`, `$cppTypeToJsType`, `$cppTypeToJsTypeNameTable`, `$ensureOverloadSignatureTable`, constructor `signatures{}` map + `signaturesArray`, R1/R2 `Object.hasOwn` gates on `proto[methodName]` lookup | `new oc.gp_Pnt(1,2,3)` vs `new oc.TCollection_AsciiString('hello')` resolve to the right C++ constructor by argument types | **Yes** (BREAKING_CHANGES §B1 ships this as suffix-free overloads) | **No** (PR #17445 changes-requested)     |
| **C2: Arity fan-out for trailing defaults** | Bindgen-side `_countTrailingDefaults` emit logic + gate predicates (`hasCStringArgs`, `numOverloads > 1`, `_returnTypeRequiresValueWrapper`) + `is_override` guard handling                                      | `chamfer.Build()` works as well as `chamfer.Build(progress)` without the caller knowing the C++ default                    | **Partially** (BREAKING_CHANGES §B2/§B3 don't mandate it)          | **Yes** (`std::optional<T>` + PR #22591) |

C1 is the load-bearing capability behind v3's published value proposition. C2 is an ergonomic convenience that has an upstream-canonical alternative.

**The catalog's 8 defects map predominantly to C2:**

| Catalog defect | Concern                                    | Resolved by adopting `std::optional<T>`?                                                                        |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| CTJ-1 / CTJ-2  | C1 (load-bearing for B1)                   | No — orthogonal (these are minifier issues, not arity issues)                                                   |
| FO-R1          | C1 + bindgen registration order            | No — the cross-sibling stomp is a C1 inheritance defect, fixable independently via own-property-only proto walk |
| FO-R3          | C2 (arity-0 truncation emission)           | **Yes** (no truncation emit needed if defaults become `std::optional`)                                          |
| DF-R2b         | C1 (Handle/val signature-table population) | No — same-arity Handle vs val dispatch is the C1 problem                                                        |
| TR-CW          | C2 (cstring-wrapper trailing-default gate) | **Yes** (no gate exists if no fan-out)                                                                          |
| TR-MO          | C2 (multi-overload trailing-default gate)  | **Yes**                                                                                                         |
| TR-RBV         | C2 (RBV trailing-default gate)             | **Yes**                                                                                                         |
| TR-GATE        | C2 (parity of two C2 gates)                | **Yes** (no gates to keep in parity)                                                                            |

**5 of 8 defects (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE) collapse to zero work** if C2 is retired in favour of upstream `std::optional<T>`. The remaining 3 (CTJ-1, CTJ-2, FO-R1, DF-R2b) are C1-side architectural fixes that have to land regardless of which direction C2 takes.

### Finding 5: V3's published commitments lock in same-arity dispatch but NOT arity fan-out

The PR 301 description and `BREAKING_CHANGES.md` enumerate every commitment v3 has made to consumers. Critically, **only the C1 commitments are publicized; C2 is not**.

C1 commitments (locked in):

- **§B1 Suffix-free overloads**: `oc.gp_Pnt_3(1,2,3)` → `oc.gp_Pnt(1,2,3)`. Migration story, smoke test reference, BREAKING change in the PR title. Cannot be revoked without a major-version revert.
- **§B2 Envelope return shape with same-arity overload disambiguation**: `BRep_Tool.Curve(edge, loc, 0, 0)` returns `{returnValue, First, Last}` because the val-dispatched same-arity overload picks the right C++ variant.
- **§D7 Same-arity overload dispatch unified**: "Every same-arity method-overload group is now backed by a single embind val-dispatcher per access mode." Explicitly framed as fixing v2's silent `BindingError`s.

C2 commitments (NOT in BREAKING_CHANGES):

- Trailing C++ default arguments being callable from JS as omitted positional args is **not described anywhere in `BREAKING_CHANGES.md`**. The closest reference is the PR title ("Better default arguments") in commit `82562ac`, but no consumer-facing API contract was published. Consumers are not told "you can omit `.Build()`'s `progress` arg."
- The two `.Build()` patterns in BREAKING_CHANGES are always shown with explicit `progress`: `mesh.Perform(progressRange)` (§B2), `fillet.Build(messageProgressrange)` (§F1).

This means **retiring C2 (arity fan-out) is not a breaking change to v3's published API**. Consumers that have been writing `.Build(progress)` continue to work unchanged. The only consumers affected would be those discovering arity-omission as an undocumented feature — and switching them to `.Build()` calling a `std::optional`-wrapped binding produces the same JS-side ergonomics. The change is **internally architectural, not externally breaking**.

## Strategic Options

Given the above, four directions are coherent:

### Option A — Status quo (continue all 8 catalog fixes)

Keep both C1 and C2. Land R4 (own-property proto walk for FO-R1), R5 (DF-R2b RBV handler), R6 (TR-GATE shared helper), R7 (TR-CW + TR-MO fan-out fixes in `bindings.py`), R2/R3 (CTJ-\* permanent fix).

- **Effort**: HIGH across all 8 defects.
- **Outcome**: Every defect resolved, but the libembind patch grows further and continues fighting embind on the C2 vector.
- **Risk**: Long-term maintenance burden; every emcc upgrade requires reconciling 480+ patch lines plus 100s of lines of bindgen gate logic.

### Option B — Abandon the patch entirely; revert to upstream embind

Drop `libembind-overloading.patch`. Revert §B1 (suffix-free overloads), accept `_N` suffixes again. Adopt `std::optional<T>` for defaults. Accept that v3 ships with v2's `_N`-suffixed overload UX.

- **Effort**: LOW (patch removal); HIGH (consumer migration, doc rewrite, BREAKING_CHANGES revert).
- **Outcome**: Zero patch maintenance; aligned with upstream; loses v3's headline DX improvement.
- **Risk**: Community backlash (PR 301 publicized §B1 as a primary V3 value); replicad and downstream consumers have to revert their `gp_Pnt(…)` calls.

### Option C — Bifurcate: keep C1, retire C2

Keep the same-arity type dispatch portion of `libembind-overloading.patch`. Retire the arity-fan-out portion. Switch bindgen to emit C++ default arguments as `std::optional<T>` and register the optional wrappers. Land R4 (FO-R1 fix) + R5 (DF-R2b) + R2/R3 (CTJ-\*) as the residual C1 work.

- **Effort**: MEDIUM. The bindgen-side C2 removal is mechanical (delete `_countTrailingDefaults`, delete the gate predicates, emit `std::optional<T>` for C++ defaults instead). The patch shrinks by ~40% (the `$ensureOverloadSignatureTable` machinery stays; the trailing-default-related hunks go).
- **Outcome**: 5 of 8 defects vanish (FO-R3, TR-CW, TR-MO, TR-RBV, TR-GATE). The remaining 3 (CTJ-1+CTJ-2, FO-R1, DF-R2b) are bounded architectural fixes.
- **Risk**: LOW. Internally architectural; no BREAKING_CHANGES revert needed; aligns with upstream embind direction.

### Option D — Bifurcate AND upstream the C1 work

Same as Option C, plus open a new upstream PR for the C1 type-dispatch work, addressing the performance concerns that blocked PR #17445 (cache the per-`(name,arity)` type-match decisions, fast-path single-overload slots).

- **Effort**: HIGH (upstream PR review cycle is long; needs benchmarks against the maintainers' performance concerns).
- **Outcome**: Long-term, the fork's C1 patch dissolves into mainline embind. Same defect outcome as Option C in the near term; lower maintenance burden indefinitely.
- **Risk**: MEDIUM. Upstream review may still reject; the work to address performance concerns is non-trivial.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Priority | Effort         | Impact                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------- | --------------------------------------------------------------------------------- |
| R1  | **Adopt Option C** as the strategic direction. Keep `libembind-overloading.patch`'s C1 (same-arity type dispatch) portion; retire the C2 (arity fan-out) portion.                                                                                                                                                                                                                                                                                                              | P0       | Low (decision) | High (sets all subsequent work)                                                   |
| R2  | Land FO-R1's architectural fix: own-property-only proto-walk in `_embind_register_class_function` / `_embind_register_class_class_function`. Materialize the merged overload table as an own property on the registering class, never mutate ancestor own properties. Extend [`experiments/libembind-fan-out-poc/`](../../repos/opencascade.js/experiments/libembind-fan-out-poc/) with a 3-level real-OCCT inheritance shape plus parallel sibling chains as the PoC harness. | P0       | High           | High (unblocks any consumer who trims to include cross-sibling-stomping symbols)  |
| R3  | Land the postset-based `cppTypeToJsType` fix (CTJ-1) and remove Path B from `getSignature` (CTJ-2 collapses once C1 is sound). Open a focused research doc to identify which emcc pass strips the val/valueType branches.                                                                                                                                                                                                                                                      | P0       | Medium         | High (eliminates the silent-rebuild-fragility called out in catalog Appendix B.4) |
| R4  | Land DF-R2b's RBV collision handler fix: when two same-arity overloads collide with one `Handle<>` and one `val`, both land in `signaturesArray`; the runtime dispatcher disambiguates by argument type.                                                                                                                                                                                                                                                                       | P1       | Medium         | Medium (niche surface but architecturally clean)                                  |
| R5  | Retire C2 in bindgen: delete `_countTrailingDefaults`, delete the four gate predicates (`hasCStringArgs`, `returnIsCString`, `numOverloads > 1`, `_returnTypeRequiresValueWrapper`). Replace with C++ default-argument → `std::optional<T>` emission and `register_optional<T>` for every wrapped type. Update [`ocjs-trailing-default-arity-fan-out.md`](ocjs-trailing-default-arity-fan-out.md) to mark the arity-fan-out direction as superseded.                           | P1       | Medium         | High (collapses 5 catalog defects to zero work; aligns with upstream PR #22591)   |
| R6  | After R5 lands, prune the catalog: remove TR-CW, TR-MO, TR-RBV, TR-GATE, FO-R3 rows; promote the remaining 3 defects (CTJ-1, CTJ-2 merged with FO-R1 fix, DF-R2b) under the C1 banner. Promote this strategic-direction doc as the catalog's referenced "why" document.                                                                                                                                                                                                        | P1       | Low            | Medium (catalog clarity)                                                          |
| R7  | **Do not** open the upstream PR (Option D) yet. Defer until the fork-side C1 work has been load-tested for ≥3 release cycles. Upstream review is long and the performance concerns from PR #17445 will require benchmark evidence the fork hasn't yet produced.                                                                                                                                                                                                                | P2       | n/a            | n/a                                                                               |
| R8  | Revise the [`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](ocjs-bindgen-libembind-outstanding-issues-catalog.md) Executive Summary and Appendix B to drop the "100% of CAD users hit FO-R1" framing; replace with "FO-R1 fires only when the build YAML includes symbols whose registration mutates an ancestor's inherited overload table; replicad's 227-symbol build excludes such symbols and is unaffected."                                                     | P0       | Low            | High (corrects the audit's most-misleading claim)                                 |

## Catalog Severity Revisions

Compared to the prior severity framing in [`ocjs-bindgen-libembind-outstanding-issues-catalog.md`](ocjs-bindgen-libembind-outstanding-issues-catalog.md):

| Defect                            | Prior framing                                                       | Revised framing                                                                                                                                                                                                                                                                                                               | Justification                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **FO-R1**                         | "Affects ~100% of non-trivial CAD users; HIGH severity"             | "Affects consumers whose build YAML includes cross-sibling-stomping symbols (e.g. `BRepFeat_SplitShape`). Replicad's 227-symbol ship excludes these and renders correctly. P0 to fix architecturally because the symptom is silent (wrong invoker dispatched, not a `BindingError`), but NOT a universal production blocker." | Reproduced birdhouse rendering; smoke trace shows `BRepFeat_SplitShape.Build` is the corrupting invoker; absent from replicad YAML. |
| **TR-CW, TR-MO, TR-RBV, TR-GATE** | "P1 bindgen completeness gaps requiring per-defect bindgen surgery" | "**Architectural dead-end.** These defects exist only because bindgen emits arity-fan-out lambdas to fake C++ default arguments. Adopting upstream `std::optional<T>` + PR #22591's relaxed arity verification eliminates the gates entirely; the defects collapse to zero work."                                             | Finding 3 — upstream canonical solution exists and is already in Emscripten 3.1.68.                                                 |
| **FO-R3**                         | "P0 arity-0 inherited truncation failure"                           | "Same fate as TR-\* family — disappears under `std::optional<T>` emission because no truncation lambda is needed if the C++ default is wrapped."                                                                                                                                                                              | Finding 4 — FO-R3 is the inherited variant of the same arity-fan-out problem.                                                       |
| **CTJ-1, CTJ-2**                  | "P0 hot-patch fragility; rebuild risk"                              | "Severity confirmed (was correct); the postset-based fix (R3) is the architectural completion."                                                                                                                                                                                                                               | Finding 4 — these are orthogonal to the C1/C2 split and remain critical.                                                            |
| **DF-R2b**                        | "P0 RBV collision handler defect; affects niche static methods"     | "Severity confirmed; localized fix; folds into C1 cleanup pass."                                                                                                                                                                                                                                                              | Unchanged — narrow surface, real defect.                                                                                            |

The headline counts in the Executive Summary should shift from "8 outstanding source-level defects" to "3 architectural defects (C1 cleanup: CTJ-1/CTJ-2 merged with FO-R1 + DF-R2b) + 1 strategic direction change (C2 retirement via `std::optional<T>`)."

## References

- Source: [`repos/opencascade.js/src/patches/libembind-overloading.patch`](../../repos/opencascade.js/src/patches/libembind-overloading.patch)
- Source: [`repos/opencascade.js/BREAKING_CHANGES.md`](../../repos/opencascade.js/BREAKING_CHANGES.md)
- Source: [`repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml`](../../repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single.yml) (227 symbols, no `BRepFeat_SplitShape`)
- Source: [`repos/opencascade.js/build-configs/full.yml`](../../repos/opencascade.js/build-configs/full.yml) (4,441 symbols, includes `BRepFeat_SplitShape` at line referenced in Finding 1)
- Catalog: [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](ocjs-bindgen-libembind-outstanding-issues-catalog.md)
- Prior fork-side analysis: [`docs/research/ocjs-trailing-default-arity-fan-out.md`](ocjs-trailing-default-arity-fan-out.md)
- Prior fork-side analysis: [`docs/research/ocjs-embind-js-dispatch-failures.md`](ocjs-embind-js-dispatch-failures.md)
- Upstream: [emscripten embind documentation — overloaded functions](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html#overloaded-functions) ("embind does not support overloading based on type")
- Upstream: [emscripten/issues/20117](https://github.com/emscripten-core/emscripten/issues/20117) — core-team confirmation that type-based overloading is unsupported
- Upstream: [PR #17445 "feat(embind): add support for type-based overloading"](https://github.com/emscripten-core/emscripten/pull/17445) — review-blocked on performance concerns
- Upstream: [issue #22389 / PR #22591 — Support omitting optional arguments in js embind bindings](https://github.com/emscripten-core/emscripten/issues/22389) — merged in Emscripten 3.1.68; canonical solution for trailing optional parameters
- PR 301 upload: `donalffons/opencascade.js#301` (PR description states "All replicad kernel tests passing (801/801)")
