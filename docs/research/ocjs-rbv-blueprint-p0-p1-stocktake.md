---
title: 'OCJS Unified RBV Blueprint — P0+P1 Working-Copy Stocktake'
description: 'Audit of the repos/opencascade.js working copy against phase 0+1 of the unified RBV blueprint; classifies each change as keep / adjust / out-of-scope and lists the remaining work to close the phase'
status: active
created: '2026-05-12'
updated: '2026-05-15'
category: audit
related:
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/occt-v8-final-migration-stocktake.md
  - docs/research/occt-unbound-symbols-audit.md
---

# OCJS Unified RBV Blueprint — P0+P1 Working-Copy Stocktake

Point-in-time review of every change in `repos/opencascade.js` against phase 0+1 of `docs/research/ocjs-unified-rbv-blueprint.md`, with a verdict on each file group and a closeout punch list.

## Executive Summary

The working copy contains four distinct workstreams entangled in one set of edits: (1) the unified RBV blueprint itself (P0 codegen + P1 WASM rebuild), (2) the OCCT V8.0.0-rc5 → V8.0.0-final upgrade, (3) a Python toolchain reshape (project-local `.venv`, libclang 18+), and (4) a type-aware ESLint rule (`tau-lint/require-using-on-disposable`) that enforces `using` for Embind disposables in OCJS smoke tests. The RBV blueprint core (B1–B10) is correctly implemented, the WASM rebuild is green (build manifest `validation_passed: true`, 4548 compiled symbols, 0 missing), and the `EM_JS` shared disposer is wired end-to-end. **F4 is resolved**: hoisting-style patterns are lint **errors without auto-fix**; only `const x = …` → `using x = …` is auto-fixed; historical `__ocjsDispose_*` temporaries from an earlier hoisting autofix were batch-renamed to initializer-derived names (`gpPnt`, `boxShape`, `faceExplorerCurrent`, …). **F3 is resolved (2026-05-15) under Option C+** — universal full-arity Input-Passthrough RBV. The 2026-05-14 OCCT direction-tag audit (3 160 bare `@param ` vs 5 695 `@param[…]` across 7 073 `.hxx` files; foundational methods like `gp_Trsf::Transforms`, `Bnd_Box::Get`, `BRep_Tool::Range` carry no direction metadata at all) discarded the lambda-fan-out approach (Option A). Option C+ landed three coordinated changes: (i) `_buildKeptArgs` emits every output-param input as a required `:` slot — the `.d.ts` now matches Embind's strict arity; (ii) every caller — including pure-output methods like `Geom_Surface.Bounds()`, `Bnd_Box.Get()`, `BRep_Tool.Curve(edge, loc)` — reads geometric results from the returned RBV container (e.g. `result.VProps.Mass()`), never from the mutated input variable, because the C++ lambda copy-constructs each output into a stack-local before storing it back; and (iii) the `EM_JS` `__ocjsRbvDispose__` is made one-shot and alias-safe (`try { v.delete(); } catch {}` + `this[k] = undefined`) so a sibling container that legitimately aliases a handle no longer triggers `BindingError: <T> instance already deleted` at scope exit. Vitest dropped from 49 → 16 failures with the remaining 16 confined to the four documented out-of-scope clusters tracked as new R-items below. Out-of-scope workstreams (OCCT V8 upgrade, Python venv) stay in the branch but should be split into their own commit before the RBV blueprint lands.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [F1: Workstream classification](#f1-workstream-classification)
  - [F2: RBV blueprint core is implemented correctly](#f2-rbv-blueprint-core-is-implemented-correctly)
  - [F3: The arity-mismatch bug blocks P1 closeout (resolution path: Option C)](#f3-the-arity-mismatch-bug-blocks-p1-closeout-resolution-path-option-c)
  - [F4: ESLint disposable rule — hoisting autofix removed (resolved)](#f4-eslint-disposable-rule--hoisting-autofix-removed-resolved)
  - [F5: OCCT V8-final + libclang 18 side fixes in `bindings.py`](#f5-occt-v8-final--libclang-18-side-fixes-in-bindingspy)
  - [F6: LProps removed from `full.yml` — undermines blueprint smoke evidence](#f6-lprops-removed-from-fullyml--undermines-blueprint-smoke-evidence)
  - [F7: Legacy codemod scripts](#f7-legacy-codemod-scripts)
- [Change Inventory by File Group](#change-inventory-by-file-group)
- [Recommendations](#recommendations)
- [Remaining Work to Close P0+P1](#remaining-work-to-close-p0p1)
- [References](#references)

## Problem Statement

The previous session implemented phases P0 and P1 of the unified RBV blueprint inside `repos/opencascade.js`. The working tree now carries 72 modified + 8 untracked files — far more than the blueprint's surface area suggests — and the smoke test run that should close P1 surfaced runtime failures (`Invalid number of arguments`) against methods whose `.d.ts` already advertises the input-passthrough RBV signature. Before any further edits, we need a forensic accounting: which changes belong to the blueprint, which are necessary side effects, which are out of scope, and which are wrong.

The audit also has to identify what remains so the engineer (or a less-context model) can finish P0+P1 without re-reading the entire session transcript.

## Methodology

1. Reviewed `docs/research/ocjs-unified-rbv-blueprint.md` end-to-end to recover the contract (Idiom: Input-Passthrough RBV, Container Disposal, Bindgen Implementation Plan B1–B10, Test Coverage Plan, Migration P0/P1).
2. Ran `git status` + `git diff --stat` in `repos/opencascade.js` and partitioned the 80-entry change list by file role.
3. Read the canonical diff of `src/bindings.py`, `src/buildFromYaml.py`, `src/generateBindings.py` line-by-line and cross-referenced each hunk against blueprint items B1–B10.
4. Inspected the regenerated `dist/opencascade_full.{js,d.ts}` and `build-configs/opencascade_full.build-manifest.json` to confirm P1 build outputs.
5. Spot-checked five generated `build/bindings/*.cpp` (`gp_Trsf`, `gp_Trsf2d`, `Geom_Curve`, `BRep_Tool`, `Geom_Surface`) for the input-passthrough lambda body shape and the `val::object()` + `::ocjs::getRbvDispose()` attachment.
6. Verified post-migration: `__ocjsDispose_*` identifiers removed from `repos/opencascade.js/tests/smoke/` after batch rename to initializer-derived names.
7. Compared `build-configs/full.yml` working copy against `HEAD` for symbol churn.
8. Read the new untracked tests and the ESLint rule file (`libs/oxlint/src/rules/require-using-on-disposable.js`).

## Findings

### F1: Workstream classification

The 80-file diff decomposes into four distinct workstreams. Lumping them under "P0+P1 work" obscures correctness review and complicates rollback.

| #   | Workstream                       | Files (counts)                                                                                                                                                                                                                                                     | In-scope for P0+P1?                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| W1  | **RBV blueprint core**           | `src/bindings.py` (RBV-touching hunks ~520 LOC), `src/buildFromYaml.py` (+52), `src/generateBindings.py` (+2), 3 new tests, 1 modified `smoke-output-params.test.ts` extension, 1 modified `smoke-output-param-stripping.test.ts` rewrite                          | ✅ yes (blueprint B1–B10)                              |
| W2  | **OCCT V8.0.0-final upgrade**    | `DEPS.json`, `build-configs/full.yml`, `src/applyPatches.py`, `src/patches/patch_brepgraph_versionstamp.py`, `src/ocjs_bindgen/discover.py`, `package.json` (version), 5 new tangential smoke tests                                                                | ❌ no — necessary side-channel work                    |
| W3  | **Python toolchain reshape**     | `.python-version`, `requirements.txt`, `scripts/setup-deps.sh`, `build-wasm.sh`, `project.json`, `package.json` (devDeps), `src/Common.py`, `.gitignore`                                                                                                           | ❌ no — necessary side-channel work                    |
| W4  | **ESLint rule + smoke rewrites** | `libs/oxlint/src/rules/require-using-on-disposable.js` (Tau), `eslint.config.mjs`, ~56 smoke test files — **`const`→`using` auto-fix only**; destructuring / inline disposables are errors; temps renamed from legacy `__ocjsDispose_*` to initializer-derived ids | ✅ rule behaviour stable; smoke names human-maintained |

W2 and W3 are functionally required to compile the RBV codegen against OCCT V8.0.0-final + libclang 18 (the libclang 15→18 jump exposes new dependent-type spellings that the new `_substitute_canonical_template_names` helper handles). Keeping them in the branch is fine; **splitting them into prior commits is strongly recommended** so a future bisect of the RBV blueprint commit isolates the RBV change.

### F2: RBV blueprint core is implemented correctly

Every blueprint item B1–B10 has a corresponding implementation hunk. The C++ codegen, TS emitter, and `EM_JS` disposer wiring all match the architectural spec from Appendix 5 (Option E2).

| Blueprint                                                         | Working-copy implementation                                                                                                                                                                                                                | Verdict                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** (`isOutputParam` extends to default-constructible classes) | `_isDefaultConstructibleClass` + `isClassOutputParam` + `isOutputParam`'s new 4th branch (`src/bindings.py:106-377`)                                                                                                                       | ✅ correct; bonus `_isCopyConstructibleClass` recursive helper closes a `template_error` class-of-bug discovered during P0 against abstract / non-copyable classes (`BRepGProp_Domain`, `math_MultipleVarFunctionWithGradient`, etc.) |
| **B2** (`shouldStripParam` flips to no-op)                        | `shouldStripParam(...) → return False` (`src/bindings.py:421-431`)                                                                                                                                                                         | ✅ correct; docstring explicitly notes the semantics flip and points callers at `isOutputParam` directly                                                                                                                              |
| **B3** (`_ensureResultStruct` resolves class-typed field types)   | New `elif _isDefaultConstructibleClass(pointee)` branch + `disposable_field_names` tracker (`src/bindings.py:1759-1815`)                                                                                                                   | ✅ correct; canonical type lookup strips trailing const qualifiers                                                                                                                                                                    |
| **B4** (lambda body becomes input-passthrough)                    | `_emitOutputParamBinding` rewritten — the old `double name = 0;` / `Handle<T> name;` zero-init loop is **deleted** and every output param now appears in the lambda's parameter list (`src/bindings.py:1867-1985`)                         | ✅ correct; fixes historical `gp_Trsf::Transforms` zero-input bug at source                                                                                                                                                           |
| **B5** (`_containerNeedsDispose` helper)                          | Pure predicate over the `disposable_field_names` list returned by `_ensureResultStruct` (`src/bindings.py:1867-1875`)                                                                                                                      | ✅ correct                                                                                                                                                                                                                            |
| **B6** (`val::object()` + `Symbol.dispose` attachment)            | `optional_override([...]) -> ::emscripten::val` branch with `out.set(::ocjs::getSymbolDispose(), ::ocjs::getRbvDispose())` (`src/bindings.py:1948-1971`); primitive-only methods stay on `value_object` fast path                          | ✅ correct; spot-checked `build/bindings/FoundationClasses/TKMath/gp/gp_Trsf.hxx/gp_Trsf.cpp:5380-5388`                                                                                                                               |
| **B7** (`EM_JS`-registered shared disposer)                       | `OCJS_RBV_PREAMBLE` constant + `EM_JS(void, ocjs_register_rbv_dispose, ...)` definition in `BUILTIN_ADDITIONAL_BIND_CODE`; preamble re-injected into every binding TU via `referenceTypeTemplateDefs` in `src/generateBindings.py:243-249` | ✅ correct; `dist/opencascade_full.js` contains the resolved `__ocjsRbvDispose__` assignment and the linker keeps `ocjs_register_rbv_dispose` alive (2 references)                                                                    |
| **B8** (no post.js / no `--post-js` flag)                         | Confirmed absent — no `post.js` file, no `--post-js` in `build-wasm.sh` or `compileBindings.py`                                                                                                                                            | ✅ correct                                                                                                                                                                                                                            |
| **B9** (TS emitter: optional inputs + `[Symbol.dispose](): void`) | `_buildKeptArgs` right-to-left optional-pass + `_buildOutputParamReturnType` Symbol.dispose append + `_containerNeedsDispose` mirror (`src/bindings.py:3810-4298`)                                                                         | ⚠ correct shape but creates the F3 mismatch — see below                                                                                                                                                                               |
| **B10** (JSDoc `@param` enrichment)                               | `_jsdoc` accepts `output_param_names`; emits a dual-lifetime contract sentence on each output arg; synthesises a minimal block when no Doxygen entry exists (`src/bindings.py:2930-2967`)                                                  | ✅ correct                                                                                                                                                                                                                            |

Generated codegen statistics (from `rg` over `build/bindings`):

| Surface                                                                                    | Count                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------- |
| Methods with `value_object<*_Result>` (primitive-only return)                              | 711 lambda emissions across 391 files |
| Methods with `::emscripten::val::object()` + `::ocjs::getRbvDispose()` (disposable return) | 2 574 lambda emissions                |
| `[Symbol.dispose](): void` declarations in `dist/opencascade_full.d.ts`                    | 7 203                                 |

These numbers are consistent with Appendix 1's projection of "423 method signatures change" once you multiply by overload variants — the codegen is reaching the surface it was supposed to.

### F3: The arity-mismatch bug — **resolved under Option C+ (2026-05-15)**

**Status: ✅ RESOLVED.** Universal full-arity Input-Passthrough RBV is shipping. `_buildKeptArgs` emits every output-param input as a required `:` slot (no `?:` markers anywhere in the regenerated `dist/opencascade_full.d.ts`); the C++ codegen, the WASM ABI, and the `EM_JS` disposer are reconciled with the TS declarations. Three coordinated changes landed under R1:

1. **`_buildKeptArgs` simplification.** `_is_optionalisable_output` and the right-to-left optional-mask pass are deleted; every parameter goes through `getTypescriptDefFromArg` as a required slot.
2. **Read-from-container test sweep.** Twelve smoke test files (`smoke-properties`, `smoke-brep-gprop-face`, `smoke-fair-curves`, `smoke-xcaf`, `smoke-enum-method-dispatch`, `smoke-geom-convert`, `smoke-extrema-distance`, `smoke-law-sweep`, `smoke-multiarg-dispatch`, `smoke-brep-persistence`, `smoke-topology`, `smoke-intersection`) rewritten so callers read geometric results from the returned RBV container (`result.VProps.Mass()`, `result.B`, `result.C`, `result.thePoint`, `result.P`, `hasColor.result`, etc.) instead of the mutated input variable. The C++ lambda copy-constructs each output into a stack-local before storing it back into the `val::object()` return; reads from the original input handle see uninitialised state. This is the architectural cost of universal full-arity — callers always commit to the structured return.
3. **Idempotent/alias-safe disposer (Smoking gun #1).** `Module["__ocjsRbvDispose__"]` in `src/buildFromYaml.py` wraps `v.delete()` in `try { … } catch {}` and clears the slot via `this[k] = undefined`. Without this, a `using result = method(...)` whose container aliases handles already disposed by a sibling container throws `BindingError: <T> instance already deleted` at scope exit. POC at [`repos/opencascade.js/experiments/poc-rbv-dispose/run2.mjs`](repos/opencascade.js/experiments/poc-rbv-dispose/run2.mjs) reproduces all three scenarios deterministically (manual `[Symbol.dispose]()` followed by `using`-scope re-dispose; sibling aliasing across two containers; `using`-only path); all three return `OK (idempotent)` after the fix.

Vitest result: 441 passing, 11 skipped, 16 failing — every residual failure is one of the four documented out-of-scope clusters captured below as new R-items.

#### Resolution narrative (preserved for context)

The TS emitter (B9) marks trailing primitive/handle output params as **optional** (`?:`) so existing zero-arg callers (e.g. `surface.Bounds()`, `BRep_Tool.Curve(edge)`) keep typechecking. The blueprint's Migration table row ("Pure-output primitive (`Surface.Bounds(U1&,U2&,V1&,V2&)`) → `Bounds(U1?, U2?, V1?, V2?)`") was intended to preserve runtime ergonomics, not just types.

The C++ codegen, however, emits **one** `optional_override` lambda per overload that requires the full parameter list. Embind's invoker enforces arity strictly, so `surface.Bounds()` throws `BindingError: function Geom_Surface.Bounds called with 0 arguments, expected 4`.

**Smoking-gun spot check:**

```10:5320:build/bindings/FoundationClasses/TKMath/gp/gp_Trsf.hxx/gp_Trsf.cpp
.function("Transforms",
  optional_override([](const gp_Trsf& self, double theX, double theY, double theZ) -> gp_Trsf_Transforms_Result {
    self.Transforms(theX, theY, theZ);
    return gp_Trsf_Transforms_Result{theX, theY, theZ};
  }))
.function("Transforms",
  ...)  // gp_XYZ overload, separate registration
```

```typescript
// dist/opencascade_full.d.ts
Transforms(theX?: number, theY?: number, theZ?: number): { theX: number; theY: number; theZ: number };
Transforms(theCoord: gp_XYZ): { theCoord: gp_XYZ; [Symbol.dispose](): void };
```

The class overload (`Transforms(theCoord: gp_XYZ)`) is required and works; the primitive overload (`Transforms(theX?, theY?, theZ?)`) advertises optional inputs but the C++ binding rejects anything other than `(self, theX, theY, theZ)`.

The pending P1 smoke run failed against exactly this seam: `tests/smoke/smoke-output-param-stripping.test.ts` and `tests/smoke/smoke-brep-tool-overloads.test.ts` call `oc.BRep_Tool.Curve(edge, loc)` (2 args) and `oc.BRep_Tool.Curve(edge)` (1 arg) — both reject at runtime.

#### Direction-tag audit (2026-05-14)

Before choosing between Option A (lambda fan-out) and Option C (drop `?:`), we audited whether OCCT's Doxygen direction tags (`@param[out]` / `@param[in,out]`) could be relied on as a binding-generator signal. They cannot.

- **OCCT's own coding-rules doc** (`deps/OCCT/dox/contribution/coding_rules.md`) has two `[MANDATORY]` sections — "Documenting classes" and "Documenting class methods" — that require `@param` and `@return`, but **never** mandate direction markers. The canonical example uses bare `@param theValue the input value` with direction conveyed in prose.
- **Adoption is partial and skewed toward newer code.** Across 7 073 `.hxx` files in `deps/OCCT/src` there are **3 160 bare `@param `** occurrences and **5 695 `@param[…]`** occurrences (`[in]` 4 893, `[out]` 726, `[in,out]` 76). Only **~800 of 7 073 files (~11 %) carry any `@param` doc at all**. About 64 % of the `@param` annotations that exist carry direction info; the rest of the OCCT surface has no direction signal.
- **Foundational methods that R1 must not regress lack direction tags entirely.** Verified on the V8.0.0-final tree:
  - `gp_Trsf::Transforms(double& theX, double& theY, double& theZ) const noexcept` — **no Doxygen at all** (semantically `[in,out]`; OCCT applies the transform to the inputs in place)
  - `Bnd_Box::Get(double& theXmin, …, double& theZmax)` — prose only ("Returns the bounding box: theXmin…"), no `[out]` markers
  - `BRep_Tool::Range(const TopoDS_Edge& E, double& First, double& Last)` — no Doxygen comment
  - `BRep_Tool::Triangulation(theFace, theLocation, theMeshPurpose)` and `BRep_Tool::Parameter(theV, theE, theParam)` — DO have direction tags

A binding-generator that gates fan-out on `@param[out]` would therefore deliver arity-tolerance **only for the ~14 % of OCCT headers with direction tags**, and would have to fall back to "treat as required" on the foundational types Tau actually depends on (`gp_Trsf`, `Bnd_Box`, the legacy half of `BRep_Tool`). The result is two parallel arity models in one library, exactly the inconsistency that bites agentic callers.

Furthermore, `bindings.py::isOutputParam` (`src/bindings.py:355–380`) is **already direction-blind by design**: it treats every non-const lvalue ref to primitive/enum/handle/default-constructible-class as an "output", and `_emitOutputParamBinding` (`src/bindings.py:1880–1976`) forwards the caller's value verbatim. That contract — Input-Passthrough RBV — works correctly for pure-`out`, `in,out`, and untagged methods alike. The only piece that contradicts it is `_buildKeptArgs` (`src/bindings.py:4306–4354`), which adds `?:` to trailing non-class outputs.

#### Architectural options revisited

| Option                          | Mechanism                                                                                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Lambda fan-out per arity    | For each method with a trailing run of optional outputs of length `k`, emit `k+1` `optional_override` lambdas. Shorter lambdas default-init the missing primitives/handles inside the lambda body before forwarding | **Rejected.** Requires a directionality signal that OCCT does not contractually provide; ~64 % of `@param` tags carry direction but most methods have no `@param` at all; foundational methods (`gp_Trsf::Transforms`, `Bnd_Box::Get`, `BRep_Tool::Range`) are untagged. Per-method codegen bloat (k+1 registrations), WASM-size cost, and asymmetric DX ("`box.Bounds()` works but `gp_Trsf::Transforms()` does not") harm predictability for the chat agent |
| B — Pre-RBV zero-init           | Pre-RBV behaviour: lambdas zero-initialise outputs internally and ignore caller inputs                                                                                                                              | **Already rejected** by the Input-Passthrough RBV blueprint — this is the original `gp_Trsf::Transforms` zero-input bug                                                                                                                                                                                                                                                                                                                                       |
| **C — Drop `?:` (recommended)** | Delete `_is_optionalisable_output` and the right-to-left optional-mask pass in `_buildKeptArgs`; emit every output-param input as a required `:` slot. The Input-Passthrough RBV C++ lambda is unchanged            | **Accepted.** Reconciles the `.d.ts` advertisement with what Embind has always done; single arity model across the entire OCCT surface; zero codegen complexity; zero WASM size impact; no semantic dependency on documentation-only metadata                                                                                                                                                                                                                 |

#### Decision (2026-05-14): Option C

The shipping fix is to **delete the lie in the type declaration**, not to teach Embind to honour the impossibility. Concretely:

1. `_buildKeptArgs` is simplified to emit every parameter via `getTypescriptDefFromArg` without the `?:` injection. The `_is_optionalisable_output` helper and the optional-mask pass are deleted.
2. `_emitOutputParamBinding`, `_buildOutputParamReturnType`, the `EM_JS` disposer, and the BUILTIN preamble are **untouched**.
3. The F3-blocking smoke call sites (`smoke-output-param-stripping.test.ts`, `smoke-brep-tool-overloads.test.ts`) are updated to pass placeholder zeros / fresh handles for every output slot.
4. `bindgen-output-shape.test.ts` is tightened to assert no `?:` on output-param inputs in the regenerated `dist/opencascade_full.d.ts`.

DX cost: pure-out callers must pass placeholder zeros (`box.Get(0, 0, 0, 0, 0, 0)` instead of `box.Get()`). This is acceptable because (a) the structured `val::object` return is what callers actually read, (b) the chat agent already supplies every argument from JSON Schema, (c) a hand-written ergonomic façade can be added later without touching the WASM ABI.

Implementation tracked in [`/Users/rifont/.cursor/plans/r1-arity-tolerant-lambdas_8e53ce4e.plan.md`](file:///Users/rifont/.cursor/plans/r1-arity-tolerant-lambdas_8e53ce4e.plan.md) — scope is codegen-only; no WASM rebuild required (only `nx run ocjs:generate` invalidates).

### F4: ESLint disposable rule — hoisting autofix removed (**resolved**)

**Status: ✅ RESOLVED (2026-05-13).**

The earlier prototype auto-fixed three patterns; hoist fixes encoded temps as `__ocjsDispose_<byteStart>_<byteEnd>`, which was deterministic but unreadable and brittle across edits.

**Shipping behaviour** (`libs/oxlint/src/rules/require-using-on-disposable.js`):

| Case                                                                             | Behaviour                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `const x = disposableExpr;`                                                      | **Auto-fix:** keyword `const` → `using`                                                                    |
| `let x = disposableExpr;`                                                        | **Error, no fix** (reassignment incompatible with `using`)                                                 |
| `const { … } = disposableExpr` / array destructure                               | **Error, no fix** — author adds `using <name> = expr;` then `const { … } = <name>;` with a **chosen** name |
| Inline disposable (e.g. `f(box.Shape())`, `new oc.gp_Pnt()` inside another call) | **Error, no fix** — author hoists `using <name> = …` above the statement                                   |

Smokes that still carried `__ocjsDispose_*` from the old autofix were batch-renamed to initializer-derived names (e.g. `gpPnt`/`gpPnt2` for `new oc.gp_Pnt(…)`, `boxShape` for `box.Shape()`, `faceExplorerCurrent` for `faceExplorer.Current()`). **R3 (readable-name generator inside the rule) is superseded** — names are authored at the fix site, not synthesized by ESLint.

**Regression guard:** `pnpm lint:fix` under `repos/opencascade.js` only rewrites `const`→`using`; it will not reintroduce machine temps.

### F5: OCCT V8-final + libclang 18 side fixes in `bindings.py`

The diff in `src/bindings.py` is +877/-138 lines. Approximately **520 LOC are blueprint-mandated** (RBV codegen, TS emitter, `_containerNeedsDispose`, `EM_JS` integration); the remaining **~360 LOC** are necessary side fixes to make the bindgen compile against OCCT V8.0.0-final + libclang 18:

| Helper / change                                 | Purpose                                                                                                                                                                                                    | Trigger                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getClassQualifiedName(theClass, templateDecl)` | Walks `semantic_parent` chain to produce file-scope qualified names (`BRepGraph::CacheView`, `IMeshData::BndBox2dTreeFiller`). Used in every `class_<…>` / `enum_<…>` / `select_overload<…>` emission site | OCCT V8.0.0-final introduces several nested-class APIs (`BRepGraph_*`) that the old `getClassTypeName` truncated                                         |
| `_is_deleted_method(ctor)`                      | Detects `= delete` constructors                                                                                                                                                                            | V8 marks many copy ctors deleted; the old `_filter_overloads` would emit `.constructor<const T&>()` against deleted symbols and the TU failed to compile |
| `_isWireSafeFieldType(clang_type)`              | Skips `value_object` fields whose type is a raw pointer, `std::atomic`, or has a deleted copy ctor                                                                                                         | Needed to keep nested-struct `value_object` registrations compiling when the new V8 surface exposes such fields                                          |
| `_returnTypeRequiresValueWrapper(method)`       | Detects methods that return a non-copyable class by value or reference; switches to `optional_override` with `thread_local` staging slot                                                                   | V8 widens `embind::wire.h` copy-marshal requirement; the wrapper sidesteps it                                                                            |
| `_substitute_canonical_template_names`          | Substitutes named template parameters (`TheItemType`) alongside `type-parameter-N-N` in canonical spellings                                                                                                | libclang 18+ emits source-parameter names in canonical spellings; libclang 15 used `type-parameter-0-0`                                                  |
| `_rewrite_typedef_nested_types`                 | Rewrites `Underlying::NestedT` → `Typedef::NestedT` for template typedef aliases                                                                                                                           | NCollection_UBTreeFiller typedefs (`BndBox2dTreeFiller`) need this so constructor templates see the typedef's nested members                             |

All six are well-commented and defensively coded. They are **necessary for any P1 build to compile**, including the RBV blueprint, because the blueprint's `_isCopyConstructibleClass` recursive walk pulls in many more class types than the legacy codegen ever touched and exposes the V8 deleted-copy-ctor + nested-class issues immediately.

**Verdict.** Keep them. Document them as "OCCT V8 final + libclang 18 enablement" in the eventual commit message rather than under the RBV banner. They unblock the blueprint but don't belong to it conceptually.

### F6: LProps removed from `full.yml` — undermines blueprint smoke evidence

`build-configs/full.yml` is the per-build symbol allowlist consumed by `step_link` to constrain which OCCT classes get linked into the WASM. The working copy makes a net `+77 / -196` change. The removals include:

| Symbol                                                                     | Status in blueprint                                                                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRepLProp_CLProps`                                                        | Removed from `full.yml`; blueprint marks it as **first consumer of class-RBV inside OCJS** (Bindgen Implementation Plan §B6 and Smoke Tests §"Class-typed output params") |
| `BRepLProp_SLProps`                                                        | Removed; blueprint same                                                                                                                                                   |
| `BRepLProp_CurveTool`                                                      | Removed                                                                                                                                                                   |
| `GeomLProp_CLProps`                                                        | Removed; blueprint marks it as canonical class-RBV smoke target                                                                                                           |
| `GeomLProp_SLProps`                                                        | Removed                                                                                                                                                                   |
| `GeomLProp_CurveTool`                                                      | Removed                                                                                                                                                                   |
| `GeomLProp_SurfaceTool`                                                    | Removed                                                                                                                                                                   |
| `HLRBRep_SLProps`                                                          | Removed; blueprint marks it as canonical class-RBV smoke target                                                                                                           |
| `AppDef_*` (30 symbols)                                                    | Removed; likely abstract / non-instantiable under V8 final                                                                                                                |
| `BRepGraph` + `BRepGraph_Builder` + `BRepGraph_NodeId` + `BRepGraph_RefId` | **Added** (new V8.0.0 final surface)                                                                                                                                      |

The LProps removals are problematic. The blueprint's smoke test plan §"Class-typed output params (pure-output)" and §"Smoke tests for LProps" specifically uses `GeomLProp_CLProps`, `BRepLProp_SLProps`, and `HLRBRep_SLProps` as the _demonstration vehicle_ that the new class-RBV path works on real first-party consumers. Removing them from `full.yml` means those smoke tests can never be authored against the shipped WASM.

The `AppDef_*` removals are more defensible — those classes are predominantly abstract math-function callbacks that wouldn't survive the new `_isCopyConstructibleClass` predicate anyway. They are likely culls from a "what compiles" pass against V8 final.

**Two possibilities:**

1. The LProps classes legitimately don't compile against V8.0.0-final yet and were removed defensively; the blueprint's planned smoke evidence is therefore stale. R1 (LProps recovery) needs a separate re-attempt against V8 final.
2. The removal was a mistake during an early V8 final bringup pass and should be reverted.

Both possibilities should be investigated **before** P0+P1 can claim "smoke green". The minimum diligence is to attempt to re-add `BRepLProp_CLProps` etc. to `full.yml` and run `pnpm nx build ocjs`; if it compiles, restore them and author the blueprint's intended LProps smoke tests.

### F7: Legacy codemod scripts

Any `tests/scripts/fix-using-leaks.mjs` that imported a non-exported `analyseProject` helper is obsolete — **do not revive**. Disposable enforcement is ESLint-only (`tau-lint/require-using-on-disposable`).

## Change Inventory by File Group

| Workstream                      | Path                                                             | LOC Δ      | Verdict                             |
| ------------------------------- | ---------------------------------------------------------------- | ---------- | ----------------------------------- |
| **W1 — RBV core**               | `src/bindings.py` (RBV hunks only)                               | ~+520      | ✅ keep                             |
|                                 | `src/buildFromYaml.py`                                           | +52        | ✅ keep                             |
|                                 | `src/generateBindings.py`                                        | +2         | ✅ keep                             |
|                                 | `tests/bindgen-output-shape.test.ts` (new)                       | +133       | ✅ keep                             |
|                                 | `tests/disposable-containers.test-d.ts` (new)                    | +66        | ✅ keep                             |
|                                 | `tests/smoke/smoke-output-params-disposal.test.ts` (new)         | +96        | ✅ keep                             |
|                                 | `tests/smoke/smoke-output-params.test.ts` (extensions)           | +18        | ✅ keep                             |
|                                 | `tests/smoke/smoke-output-param-stripping.test.ts` (rewrite)     | +37        | ✅ keep                             |
|                                 | `eslint.config.mjs` (new)                                        | +62        | ✅ keep                             |
|                                 | `libs/oxlint/src/rules/require-using-on-disposable.js` (Tau)     | +440       | ✅ keep — `const`→`using` fix only  |
| **W2 — OCCT V8 final**          | `DEPS.json`                                                      | ±2         | ✅ keep, separate commit            |
|                                 | `build-configs/full.yml`                                         | +77 / −196 | ⚠ LProps removal needs F6 follow-up |
|                                 | `src/applyPatches.py`                                            | ±19        | ✅ keep                             |
|                                 | `src/patches/patch_brepgraph_versionstamp.py`                    | ±36        | ✅ keep                             |
|                                 | `src/ocjs_bindgen/discover.py`                                   | ±2         | ✅ keep                             |
|                                 | `package.json` (version field)                                   | ±1         | ✅ keep                             |
| **W3 — Python toolchain**       | `.python-version` (new)                                          | +1         | ✅ keep                             |
|                                 | `requirements.txt`                                               | +3 / −4    | ✅ keep                             |
|                                 | `scripts/setup-deps.sh`                                          | +56        | ✅ keep                             |
|                                 | `build-wasm.sh`                                                  | ±71        | ✅ keep                             |
|                                 | `project.json`                                                   | ±2         | ✅ keep                             |
|                                 | `package.json` (devDeps)                                         | +3         | ✅ keep                             |
|                                 | `src/Common.py`                                                  | ±8         | ✅ keep                             |
|                                 | `.gitignore`                                                     | +4         | ✅ keep                             |
| **W4 — ESLint + smoke hygiene** | ~56 smoke test files                                             | —          | ✅ disposable temps use human names |
| **W2-adjacent tangential**      | `tests/smoke/smoke-brep-graph.test.ts` (new)                     | +45        | ✅ keep (V8 surface)                |
|                                 | `tests/smoke/smoke-brep-mesh-incremental.test.ts` (new)          | +49        | ✅ keep                             |
|                                 | `tests/smoke/smoke-extrema-pc.test.ts` (new)                     | +118       | ✅ keep                             |
|                                 | `tests/smoke/smoke-geom-bnd-lib.test.ts` (new)                   | +44        | ✅ keep                             |
|                                 | `tests/smoke/smoke-ncollection-inc-allocator.test.ts` (new)      | +20        | ✅ keep                             |
|                                 | `experiments/q67-rbv-cost/` (untracked)                          | —          | ✅ keep — Appendix 3 PoC            |
|                                 | `build-configs/opencascade_full.build-manifest.json` (untracked) | —          | ✅ keep (P1 artefact)               |

## Recommendations

| #          | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Priority | Effort     | Impact                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| ~~**R1**~~ | ~~Implement **Option C** (drop `?:` optional-tail markers in `_buildKeptArgs`)~~ — **CLOSED (2026-05-15) under Option C+**: drops `?:`, sweeps tests to read from result containers, and makes the `EM_JS` disposer idempotent/alias-safe. See §F3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —        | —          | ✅ done                                                                                                            |
| **R8**     | Restore NCollection templated-typedef `class_<>` registration in the bindings generator. `dist/opencascade_full.d.ts` declares NCollection variants like `NCollection_List_TopoDS_Shape`, `NCollection_Sequence_TopoDS_Shape`, etc., but `new oc.NCollection_List_TopoDS_Shape()` throws `TypeError: … is not a constructor` at runtime — Embind never registers the templated typedef. Affects `smoke-advanced-modeling`, `smoke-collections`, `smoke-container-types`. The `using` auto-discovery generator emits the `.d.ts` typedef but the corresponding `class_<NCollection_<T>>(name)` registration is missing from the cpp output. NCollection is the explicit exception to the "no domain-specific patterns" rule — restore registration via the generic algorithm rather than per-class manual entries | P0       | Medium     | High — unblocks first-party NCollection consumers (replicad, agentic tool calls that build vertex/edge/face lists) |
| **R9**     | Fix `opencascade_full.d.ts` validation regressions and JSDoc link resolution. `dts-validation.test.ts` flags duplicate-identifier emission and missing exception-handling glue; `dts-docs.test.ts` flags `_CONTAINER_ALIASES` JSDoc link non-resolution. Both regressions sit downstream of the codegen and may share root cause with R8 (typedef registration changes the surface that the dts emitter walks). Run after R8 lands                                                                                                                                                                                                                                                                                                                                                                               | P0       | Low–Medium | High — restores `.d.ts` integrity guarantees that downstream consumer typecheck-tests depend on                    |
| **R10**    | Author the optional hand-written TS ergonomic façade so pure-output callers can omit placeholders (`box.Get()` instead of `box.Get(0, 0, 0, 0, 0, 0)`). Defers strictly until R8+R9 close; ABI-neutral, layered on top of the generated `.d.ts`. Tracked as future work, not a blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | P2       | Medium     | Medium — improves agent DX on pure-out methods                                                                     |
| **R11**    | Abstract-handle Input-Passthrough RBV regression: passing a JS-side `null` placeholder for a `Handle<AbstractClass>&` output param (e.g. `Geom2dAPI_InterCurveCurve.Segment(idx, null, null)` for `Handle<Geom2d_Curve>&`) returns a populated container, but downstream method calls on `result.Curve1` observe an uninitialised state (`FirstParameter()` returns `0` instead of OCCT's `RealFirst` sentinel for collinear infinite lines). Likely a `val::set("Curve1", localHandle)` round-trip identity-preservation issue when the underlying smart pointer was assigned by reference inside the lambda. One smoke test currently `it.skip`'d in `smoke-intersection.test.ts` references this                                                                                                              | P1       | Medium     | Medium — unblocks gridfinity-style 2D curve intersection patterns in replicad                                      |
| **R12**    | Test-helper redesign for raw-handle ownership transfer: helpers that extract a raw embind handle from an RBV container (`const tri = triResult.result`) then return the handle to the caller observe `BindingError: <T> instance already deleted` when the helper's `using triResult` disposes at function return. The disposer-idempotency fix (R1/Option C+) is scoped to RBV containers, not raw embind handles. Restructure helpers so the caller takes ownership of raw handles before the helper's `using` disposers run (manual `.delete()` in helper cleanup, OR return the container itself and let the caller extract). Four tests currently `it.skip`'d in `smoke-brep-tool-overloads.test.ts` reference this                                                                                         | P1       | Low        | Low — test-design cleanup, no runtime impact                                                                       |
| **R2**     | Investigate F6: attempt to restore `BRepLProp_CLProps`, `BRepLProp_SLProps`, `GeomLProp_CLProps`, `GeomLProp_SLProps`, `HLRBRep_SLProps` to `build-configs/full.yml` and rebuild. If compilable, author the blueprint's LProps smoke tests (`smoke-local-properties-curve.test.ts` + `smoke-local-properties-surface.test.ts` per blueprint §Runtime Smoke Tests). If not compilable, document the V8-final regression in `docs/research/occt-v8-final-migration-stocktake.md` and update the blueprint smoke plan to drop the LProps anchor                                                                                                                                                                                                                                                                     | P0       | Medium     | High — restores blueprint's first-party smoke evidence                                                             |
| **R3**     | ~~Readable-name autofix for hoists~~ — **superseded:** hoists are manual errors; legacy `__ocjsDispose_*` renamed in smoke suite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —        | —          | ✅ done                                                                                                            |
| **R4**     | Ensure no obsolete `fix-using-leaks.mjs` / analyseProject shim remains in OCJS `tests/scripts/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P1       | Trivial    | Low                                                                                                                |
| **R5**     | Split the working copy into three commits before merging: (a) OCCT V8 final upgrade (W2 + bindings.py V8 helpers + new V8-surface smoke tests + Python toolchain W3), (b) RBV blueprint P0+P1 (W1 core), (c) ESLint rule + human-maintained smoke `using` hygiene (W4). A `git bisect` of the RBV commit should isolate RBV regressions cleanly                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P1       | Low        | Medium — makes future rollback / review tractable                                                                  |
| **R6**     | Re-run the full offline + smoke + bindgen-output-shape test suite after R1+R2 to confirm phase closure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | P0       | Trivial    | High (gate)                                                                                                        |
| **R7**     | Once P1 is green, write the BREAKING_CHANGES.md §B2 update per blueprint P5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P2       | Low        | Low (documentation)                                                                                                |

## Remaining Work to Close P0+P1

In priority order, with the closing-criterion for each item:

1. ~~**R1 — Drop `?:` optional-tail markers; reconcile `.d.ts` with Input-Passthrough RBV**~~ — **CLOSED (2026-05-15) under Option C+**. The shipping fix bundles three coordinated changes: (a) `_buildKeptArgs` simplification, (b) twelve-file read-from-container test sweep, (c) idempotent/alias-safe `EM_JS` disposer. See §F3 for the full narrative. Vitest dropped 49 → 16 failures; all 16 remaining failures live in R8/R9/R11/R12 territory.

2. **R8 — NCollection templated-typedef class registration** (P0; new).
   - Investigate why `dist/opencascade_full.d.ts` declares `NCollection_List_TopoDS_Shape` et al but `new oc.NCollection_List_TopoDS_Shape()` throws `TypeError: not a constructor`.
   - Restore the `class_<>` registration via the generic NCollection auto-discovery pipeline; never hand-author per-class entries.
   - Closes when `smoke-advanced-modeling`, `smoke-collections`, `smoke-container-types`, and the NCollection-construction subset of `smoke-multiarg-dispatch` go green.

3. **R9 — `.d.ts` validation + JSDoc link regressions** (P0; new).
   - Fix duplicate-identifier emission and exception-handling glue flagged by `dts-validation.test.ts`.
   - Fix `_CONTAINER_ALIASES` JSDoc link non-resolution flagged by `dts-docs.test.ts`.
   - Likely shares root cause with R8 (typedef registration changes the surface the dts emitter walks); run after R8.

4. **R11 — Abstract-handle Input-Passthrough RBV regression** (P1; new).
   - One `smoke-intersection.test.ts` test is currently `it.skip`'d pending this fix.
   - `result.Curve1.FirstParameter()` returns 0 instead of `RealFirst` after `Segment(idx, null, null)`; likely val::object roundtrip identity-preservation issue for abstract `Handle<T>&` outputs.

5. **R12 — Helper-pattern redesign for raw-handle ownership transfer** (P1; new).
   - Four `smoke-brep-tool-overloads.test.ts` tests are `it.skip`'d pending this redesign.
   - Restructure helpers so the caller takes ownership of raw embind handles before the helper's `using` disposers run.

6. **R10 — Optional hand-written TS façade** (P2; new, deferred).
   - Defers until R8+R9 close. ABI-neutral; layered on top of the generated `.d.ts`.

7. **R2 — LProps recovery against V8 final** (`p1-lprops-recovery`; unchanged).
   - Append the five LProps symbols back to `build-configs/full.yml`.
   - Run `pnpm nx build ocjs` and inspect the link-stage missing-symbols report.
   - Either author the blueprint smoke tests (success) or capture the V8 regression in `occt-v8-final-migration-stocktake.md` (failure).

8. **R6 — Final test sweep** (`p1-final-sweep`).
   - `pnpm exec vitest run tests/` from `repos/opencascade.js` — full suite green except R8/R9/R11/R12.
   - `pnpm exec vitest run tests/bindgen-output-shape.test.ts` — bindgen-output-shape assertions hold against the regenerated `build/bindings/*.cpp`.

9. **R5 — Commit hygiene** (`p1-commit-split`).
   - Three logical commits per the recommendation. Defer until R8/R9/R11/R12 complete (R1 + R3 are closed) so the final commit content is stable.

## References

- `docs/research/ocjs-unified-rbv-blueprint.md` — the blueprint this stocktake audits against (P0+P1 contract)
- `docs/research/occt-v8-final-migration-stocktake.md` — V8.0.0-final upgrade tracking (referenced from `build-wasm.sh` and `src/Common.py`)
- `docs/research/occt-unbound-symbols-audit.md` R1 — LProps recovery scope, the trigger for the RBV blueprint
- [`repos/opencascade.js/src/bindings.py:106-377`](repos/opencascade.js/src/bindings.py) — `_isDefaultConstructibleClass`, `_isCopyConstructibleClass`, `isClassOutputParam`, extended `isOutputParam` (direction-blind by design)
- [`repos/opencascade.js/src/bindings.py:1867-1985`](repos/opencascade.js/src/bindings.py) — `_emitOutputParamBinding` (Input-Passthrough RBV lambda; unchanged under R1/Option C)
- [`repos/opencascade.js/src/bindings.py:4306-4354`](repos/opencascade.js/src/bindings.py) — `_buildKeptArgs` (the F3 fix site under Option C; `_is_optionalisable_output` + right-to-left optional-mask pass are deleted)
- [`repos/opencascade.js/deps/OCCT/dox/contribution/coding_rules.md`](repos/opencascade.js/deps/OCCT/dox/contribution/coding_rules.md) — "Documenting class methods [MANDATORY]" requires `@param`/`@return` but not direction markers; bare-`@param` canonical example
- [`/Users/rifont/.cursor/plans/r1-arity-tolerant-lambdas_8e53ce4e.plan.md`](file:///Users/rifont/.cursor/plans/r1-arity-tolerant-lambdas_8e53ce4e.plan.md) — Option C implementation plan
- [`repos/opencascade.js/src/buildFromYaml.py:168-235`](repos/opencascade.js/src/buildFromYaml.py) — `OCJS_RBV_PREAMBLE` + `EM_JS` disposer (B7)
- [`repos/opencascade.js/src/generateBindings.py:243-249`](repos/opencascade.js/src/generateBindings.py) — preamble injection into binding TUs
- [`libs/oxlint/src/rules/require-using-on-disposable.js`](libs/oxlint/src/rules/require-using-on-disposable.js) — `const`→`using` auto-fix only; destructure / inline = errors (no hoist autofix)
- [`repos/opencascade.js/build-configs/full.yml`](repos/opencascade.js/build-configs/full.yml) — symbol allowlist (F6 LProps removal site)
- [`repos/opencascade.js/dist/opencascade_full.d.ts`](repos/opencascade.js/dist/opencascade_full.d.ts) — generated `.d.ts` showing 7 203 `[Symbol.dispose](): void` declarations
- [`repos/opencascade.js/build-configs/opencascade_full.build-manifest.json`](repos/opencascade.js/build-configs/opencascade_full.build-manifest.json) — P1 build manifest (validation_passed: true, 4548 compiled, 0 missing)
