---
title: 'OCJS Build(progressRange) Argument Trap'
description: 'Root cause analysis of the cryptic minified TypeError that derails LLM-driven CAD workflows when calling BRepOffsetAPI_ThruSections.Build() without arguments, including a generator-level fix for all 30+ affected method signatures.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
category: investigation
related:
  - docs/research/runtime-blueprint-v5-implementation-audit.md
  - docs/research/ocjs-additionalcppcode-type-erasure-regression.md
---

# OCJS Build(progressRange) Argument Trap

Root-cause investigation of the embind argument trap that surfaced when an LLM-driven CAD agent attempted to use `BRepOffsetAPI_ThruSections` and lost ~3000 transcript lines chasing memory-management ghosts that were really one missing default argument.

## Executive Summary

Calling `BRepOffsetAPI_ThruSections.Build()` (or any of the 30 other inherited `Build(theRange: Message_ProgressRange)` overrides) without an argument throws `TypeError: Cannot read properties of undefined (reading 'Zc')`. The minified property name (`Zc`/`sd`/`$$`) varies per build but the failure is deterministic and reproducible. The cause is that the OCJS bindings generator drops the C++ default-argument signal (`= Message_ProgressRange()`) when emitting method signatures — both the `.d.ts` declaration and the embind C++ wrapper. Constructors handle trailing defaults correctly via `_countTrailingDefaults`; methods do not. Fix the generator to emit `Build(theRange?: Message_ProgressRange): void` plus a default-constructing `optional_override` lambda, and the failure mode disappears for ~30 call sites at once.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Root Cause Chain](#root-cause-chain)
- [Recommendations](#recommendations)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [Appendix — Full Failure Cascade From the Transcript](#appendix--full-failure-cascade-from-the-transcript)

## Problem Statement

A user-supplied chat transcript (`Downloads/new_chat_2026-05-22T03-05.md`, 8 897 lines) records an LLM CAD agent attempting to loft a speedboat hull through 7 cross-section wires using `BRepOffsetAPI_ThruSections`. On the first invocation the agent receives the message:

```
Status: error
Issues:
  - Cannot read properties of undefined (reading 'Zc')
```

Over the next ~2 500 lines the agent generates and tests **17 distinct hypotheses** for this single error — all wrong. The hypotheses span three unrelated areas:

| Wrong hypothesis                                                              | Lines      |
| ----------------------------------------------------------------------------- | ---------- |
| The B-spline curve handle is freed when `GeomAPI_PointsToBSpline` is deleted  | 1099, 1302 |
| `BRepBuilderAPI_MakeWire` returns a non-owning reference to its internal data | 1320, 2510 |
| The `using` declaration disposes wires before `loft.Build()` finishes         | 1393, 1806 |
| `CheckCompatibility(true)` corrupts wire topology                             | 1407, 1597 |
| Stem section is degenerate; B-spline endpoints don't snap to vertex           | 1574, 1586 |
| Solid capping (`isSolid=true`) is the culprit; try `isSolid=false`            | 5732       |
| `BRepOffsetAPI_ThruSections` has a hard limit at 2 sections                   | 5418, 5919 |
| `BRepFill_Generator` (alternative API) might work                             | 5953       |
| `using pr` disposes the ProgressRange before Build() completes                | 5580       |

The single line that resolves the original error appears at transcript line **2618**:

> **There it is.** `Build()` requires a `Message_ProgressRange` argument — calling it with no argument dereferences `undefined` (`undefined.Zc`).

Every subsequent failure (~lines 2700–7460) is a downstream WASM-trap cascade caused by trying to recover from a poisoned WASM instance — those failures only stop when the agent switches to a fresh `.ts` file, getting a fresh kernel worker.

The investigation goal: **find why a missing argument produces an undecipherable error, prove it is the only real bug, and prescribe a fix that closes the entire failure cascade.**

## Methodology

1. Read the failing transcript end-to-end, indexing every `Status: error` line and the surrounding code.
2. Add a dedicated smoke-test file (`tests/smoke/smoke-thrusections-build-arg.test.ts`) that asserts the failing approach succeeds (so it fails today and pins the regression). Confirm the failure reproduces with the same minified-property pattern.
3. Identify the minified WASM export named `Zc` / `sd` by reading `build-configs/opencascade_full.js` line 155 and the embind argument-coercion functions `lc` (line 67) and `mc` (line 68).
4. Check the OCCT C++ headers for the actual `Build` signature (`deps/OCCT/.../BRepBuilderAPI_MakeShape.hxx` and `BRepOffsetAPI_ThruSections.hxx`).
5. Inspect the OCJS bindings generator (`src/ocjs_bindgen/codegen/`) to find why the default-argument signal is lost on methods but preserved on constructors.
6. Count affected `.d.ts` signatures via grep and audit related call sites in the `Init(...)` family for the same defect.

## Findings

### Finding 1: The smoking gun is a missing required argument, not memory management

`BRepOffsetAPI_ThruSections.Build()` is declared in OCCT as a virtual override with a default-constructed `Message_ProgressRange&`:

```cpp
// deps/OCCT/src/ModelingAlgorithms/TKOffset/BRepOffsetAPI/BRepOffsetAPI_ThruSections.hxx:138
Standard_EXPORT void Build(
  const Message_ProgressRange& theRange = Message_ProgressRange()) override;
```

The OCJS-emitted TypeScript declaration drops the default:

```ts
// build-configs/opencascade_full.d.ts:128322
Build(theRange: Message_ProgressRange): void;
```

When a JS caller invokes `loft.Build()` (no arg), `theRange === undefined`. The embind argument coerciser then fails. With **explicit**, **defaulted‑in‑C++**, OR with `loft.Shape()` (which calls `Build()` internally with a default-constructed range) the same code path succeeds.

Reproduced in the smoke-test suite — see `tests/smoke/smoke-thrusections-build-arg.test.ts`:

| Test                                                                   | Expected | Result on current build                                             |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `Build()` with no argument                                             | success  | **fails** with `Cannot read properties of undefined (reading 'sd')` |
| `Build(progress)` with explicit `Message_ProgressRange`                | success  | passes                                                              |
| `Shape()` without explicit `Build()` (implicit build with default arg) | success  | passes                                                              |
| 7-section straight-edge loft with explicit `progress`                  | success  | passes                                                              |

The 7-section positive control disproves the agent's "3+ section limit" hypothesis: the section count was a downstream symptom of WASM-instance corruption, not a `ThruSections` bug.

### Finding 2: `Zc`/`sd`/etc. is the minified WASM export for `operator new[]`

Line 155 of the unminified glue maps the WASM export named `Zc` to `__Znaj` (Itanium ABI mangled name for `operator new[](unsigned int)`):

```js
// build-configs/opencascade_full.js:155 (excerpted)
g.__Znaj = c.Zc;
g.__ZnajSt11align_val_t = c._c;
g.__Znwj = c.$c;
```

So when consumers see `Cannot read properties of undefined (reading 'Zc')` the JS-level access is the embind handle's smart-pointer record (`b.$$.ptr` in upstream embind, minified to `b.sd` in newer builds; the previous build minified to `Zc`). The minified property name shifts with every relink because emscripten reassigns its export-table indices, so caching the literal `Zc` string in tooling or learned heuristics is unsafe — the structural pattern (TypeError on undefined property of an undefined argument) is the stable fingerprint.

### Finding 3: Embind's `lc` argument coerciser only nullchecks, not undefined-checks

In `build-configs/opencascade_full.js` two near-twin functions handle pointer marshalling. They differ in one critical line:

```js
// line 67 — used for raw class-by-reference args
function lc(a, b) {
  if (null === b) { ... }
  if (!b.sd) throw new V(`Cannot pass "${kc(b)}" as a ${this.name}`);
  // ↑ TypeError when b === undefined: cannot read 'sd' of undefined
}

// line 68 — used for smart-pointer args
function mc(a, b) {
  if (null === b) { ... }
  if (!b || !b.sd) throw new V(`Cannot pass "${kc(b)}" as a ${this.name}`);
  // ↑ falsy check first — handles undefined gracefully
}
```

`Message_ProgressRange&` (a const lvalue reference to a value type) is routed through `lc`, which short-circuits on `null` but not `undefined`. The descriptive `V("Cannot pass ...")` error string is unreachable from the `undefined` path. Patching `lc` to mirror `mc`'s `!b || !b.sd` guard would convert all such errors to the developer-facing form.

### Finding 4: The bindings generator handles default args for constructors only

The OCJS generator already understands trailing defaults — it just doesn't apply that understanding to methods.

| Helper                                                     | Used by constructors?                                                          | Used by methods?                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `_countTrailingDefaults` (`bindings.py:897`)               | yes — `typescript/constructor.py:68,77,96` and `embind/constructor.py:125,138` | **no**                                                                              |
| `numOptional` `?` emit (`typescript/constructor.py:28-31`) | yes                                                                            | **no** — `processMethodOrProperty` (`bindings.py:3088`) emits every arg as required |
| Trailing-default fan-out (additional truncated overloads)  | yes — `typescript/constructor.py:79-81`                                        | **no**                                                                              |

This explains the asymmetry observed in `build-configs/opencascade_full.d.ts`:

```ts
// Constructor with primitive defaults — `?` correctly emitted (line 810)
constructor(theRange: Message_ProgressRange, theName: string, theMin: number,
            theMax: number, theStep: number,
            theIsInf?: boolean, theNewScopeSpan?: number);

// Method with class-typed default — `?` LOST (line 128322 and 29 others)
Build(theRange: Message_ProgressRange): void;

// Method with three primitive defaults — all three LOST (line 128260)
Init(isSolid: boolean, ruled: boolean, pres3d: number): void;
```

The defect is structural: every method whose C++ signature uses `= ...` for a trailing argument silently loses that signal, which cascades to a runtime TypeError when callers translate the C++-style API directly to JS.

### Finding 5: The defect affects ~30+ Build sites and an unknown larger surface

A grep against the emitted `.d.ts` finds **30** occurrences of the exact `Build(theRange: Message_ProgressRange): void;` shape. Every one of them inherits the same trap because they all override `BRepBuilderAPI_MakeShape::Build(const Message_ProgressRange& = Message_ProgressRange())`.

Beyond this immediate set, the defect potentially affects every method declaration in OCCT that uses any default argument — an unknown but large surface. A focused audit would query the bindgen for every `_countTrailingDefaults > 0` non-constructor cursor.

### Finding 6: WASM traps poison the entire instance — recovery requires a fresh worker

The transcript shows the failure cascade widened the moment the agent triggered a true WASM trap (e.g. `memory access out of bounds` from a degenerate `GeomAPI_PointsToBSpline`). After that point, every subsequent OCJS call — including a brand-new `BRepPrimAPI_MakeBox(10, 10, 10).Shape()` — returned `table index is out of bounds`, even though the call itself was correct. The agent's host environment per-file kernel workers; switching to a different `.ts` file restored cleanliness.

This is upstream emscripten/WASM behaviour: an unhandled `RuntimeError` (function-table OOB, memory-access OOB, unreachable trap) abandons the WebAssembly instance. There is no in-place recovery; the module must be re-instantiated. **Long-running OCJS hosts that do not re-instantiate after a trap will display every subsequent call as broken.**

## Root Cause Chain

```
OCCT C++ header
   void Build(const Message_ProgressRange& = Message_ProgressRange())
       │
       ▼  parsed by libclang inside `bindings.py`
       │  arg.get_tokens() contains '=' → hasDefaultValue = true
       │
       ▼  but `processMethodOrProperty` (bindings.py:3073)
       │  never calls `_countTrailingDefaults` or propagates the
       │  default-arg signal to either the .d.ts or the embind emit
       │
       ▼
TypeScript .d.ts                 Embind C++ glue
   Build(theRange: MPR): void;     EMBIND_FUNCTION("Build", &Build)
   ─ no `?` on theRange            ─ no optional_override lambda
   ─ no truncated overload         ─ no default-constructing wrapper
       │                                │
       ▼                                ▼
  caller writes loft.Build()    coerciser lc(a, undefined)
       │                                │
       ▼                                ▼
  argument coerciser receives    `if (!b.sd)` reads .sd on undefined
  undefined for a ref-type arg          │
                                        ▼
                       TypeError: Cannot read properties of
                                  undefined (reading 'sd')
                                  (reading 'Zc' on previous build —
                                   minified-property indices shift)
                                        │
                                        ▼
                       LLM agent misreads opaque error as
                       memory-management bug, generates 17 wrong
                       hypotheses, eventually triggers a real WASM
                       trap that poisons the worker, then mistakes
                       persistent corruption for a section-count
                       bug in ThruSections itself.
```

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                  | Priority | Effort                                                                                                                                                 | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --- | --- |
| R1  | Wire `_countTrailingDefaults` into `processMethodOrProperty` for the TS emit; mark trailing default-args with `?` and emit truncated overloads identical to the constructor flow in `typescript/constructor.py`. Affects `.d.ts` for ~30 inherited `Build` overrides and a larger long-tail of methods. | P0       | M                                                                                                                                                      | High   |
| R2  | Mirror R1 in `embind/method.py` — emit `optional_override` lambdas that default-construct the missing trailing args. Closes the runtime hole that the .d.ts fix alone cannot.                                                                                                                           | P0       | M                                                                                                                                                      | High   |
| R3  | Patch the runtime `lc` argument coerciser in upstream embind (or override locally) to `if (!b                                                                                                                                                                                                           |          | !b.sd) throw new V(...)`so the error becomes the developer-facing`Cannot pass "undefined" as a Message_ProgressRange&`instead of`TypeError: ... 'sd'`. | P1     | S   | Med |
| R4  | Add a CI test that diffs the .d.ts emit against a curated snapshot of expected `?`-bearing signatures so regressions in the trailing-default machinery surface in PR review, not in customer chat transcripts.                                                                                          | P1       | S                                                                                                                                                      | Med    |
| R5  | Document the WASM-trap-poisons-instance behaviour in user-facing docs and the AI-agent context engineering layer; recommend re-instantiating the OCJS module after `RuntimeError`.                                                                                                                      | P2       | S                                                                                                                                                      | Med    |
| R6  | Until R1+R2 ship, surface the workaround in user-facing docs: `loft.Shape()` calls `Build()` internally with a default-constructed `Message_ProgressRange`, so omitting the explicit `Build` step is a safe consumer-side workaround.                                                                   | P2       | XS                                                                                                                                                     | Low    |

## Code Examples

### Failing call (matches the transcript pattern)

```ts
const loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
loft.AddWire(wireA);
loft.AddWire(wireB);
loft.CheckCompatibility(false);

loft.Build(); // ← TypeError: Cannot read properties of undefined (reading 'sd')
const shape = loft.Shape();
```

### Working — explicit ProgressRange

```ts
using progress = new oc.Message_ProgressRange();
loft.Build(progress); // ← succeeds
using shape = loft.Shape();
```

### Working — implicit Build via Shape()

```ts
// No explicit Build call. OCCT's Shape() calls Build() internally with
// a default-constructed Message_ProgressRange.
using shape = loft.Shape(); // ← succeeds
```

### Proposed bindgen output after R1+R2

```ts
// .d.ts emit
Build(theRange?: Message_ProgressRange): void;

// embind C++ emit (sketch)
.function("Build", optional_override(
  [](BRepOffsetAPI_ThruSections& self, emscripten::val theRange) {
    if (theRange.isUndefined() || theRange.isNull()) {
      self.Build(Message_ProgressRange());
    } else {
      self.Build(theRange.as<const Message_ProgressRange&>());
    }
  }
))
```

## Diagrams

```
LLM Agent Failure Mode (current state)
─────────────────────────────────────

  loft.Build()
       │
       ▼
  TypeError: ...reading 'sd'        ← opaque, no API name in message
       │
       ▼
  Agent: "memory bug?" ────────► 6 wrong code rewrites
       │
       ▼
  Try B-spline interp w/ degenerate input
       │
       ▼
  RuntimeError: memory access OOB  ← real WASM trap, instance poisoned
       │
       ▼
  Every subsequent call → table index OOB
       │
       ▼
  Agent: "ThruSections has a section limit" ◄── WRONG, instance is dead
       │
       ▼
  Switch to fresh .ts file → fresh worker → suddenly works
       │
       ▼
  Agent thinks it found a section-count bug. Investigation closes
  with 7-section straight-edge loft + Message_ProgressRange working,
  but 17 wrong hypotheses remain documented in the transcript.

Post-fix Mode (after R1+R2)
────────────────────────────

  loft.Build()                        ← still legal
       │
       ▼
  optional_override lambda sees undefined arg, default-constructs
  Message_ProgressRange C++-side, calls real Build.
       │
       ▼
  Returns successfully. Agent proceeds to next step in 1 turn,
  not 200 turns.
```

## References

- Transcript: `Downloads/new_chat_2026-05-22T03-05.md` (8 897 lines, 79 `Status: error` events, 1 actual root cause)
- Smoke tests: `repos/opencascade.js/tests/smoke/smoke-thrusections-build-arg.test.ts`
- Generator: `repos/opencascade.js/src/ocjs_bindgen/codegen/bindings.py:897` (`_countTrailingDefaults`), `bindings.py:3073` (`processMethodOrProperty`)
- Constructor reference flow: `repos/opencascade.js/src/ocjs_bindgen/codegen/typescript/constructor.py`, `repos/opencascade.js/src/ocjs_bindgen/codegen/embind/constructor.py`
- WASM glue: `repos/opencascade.js/build-configs/opencascade_full.js:67` (`lc`), line 68 (`mc`), line 155 (export-name remap)
- OCCT headers: `deps/OCCT/src/ModelingAlgorithms/TKTopAlgo/BRepBuilderAPI/BRepBuilderAPI_MakeShape.hxx:41`, `deps/OCCT/src/ModelingAlgorithms/TKOffset/BRepOffsetAPI/BRepOffsetAPI_ThruSections.hxx:138`
- Existing positive example: `repos/opencascade.js/tests/smoke/smoke-sweep-loft.test.ts:39` (`pipeShell.Build(progress)`)

## Appendix — Full failure cascade from the transcript

| Transcript line                                                                                                                                                                                                                                            | Status                                                            | Real cause                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1087, 1250, 1790, 1972, 2320, 2401                                                                                                                                                                                                                         | `Cannot read properties of undefined (reading 'Zc')`              | `loft.Build()` missing required `Message_ProgressRange`                                                                                        |
| 2618                                                                                                                                                                                                                                                       | Resolution found — `Build(pr)` documented in `.d.ts`              | The fix                                                                                                                                        |
| 2767                                                                                                                                                                                                                                                       | `memory access out of bounds`                                     | Degenerate `GeomAPI_PointsToBSpline` input — first WASM trap poisons worker                                                                    |
| 3005                                                                                                                                                                                                                                                       | `KernelError: Construction failed — input geometry is degenerate` | `ChangeArray1()` returns a value-copy in emscripten; subsequent SetValue is a no-op (real OCJS quirk, but obscured by poisoned-worker context) |
| 3722, 4004, 4251, 4482, 4662, 4766, 4861, 5062, 5208, 5271, 5329, 5413, 5487, 5575, 5642, 5712, 5799, 5914, 6068, 6247, 6402, 6555, 6647, 6688, 6738, 6773, 6849, 6912, 6941, 6969, 6978, 7006, 7039, 7187, 7206, 7326, 7335, 7385, 7394, 7442, 7451, 7460 | `table index is out of bounds`                                    | Same poisoned WASM instance — every call now returns the trap, regardless of inputs                                                            |
| 7491                                                                                                                                                                                                                                                       | `Status: ready` (in fresh `hull.ts` file)                         | Fresh kernel worker, instance reset                                                                                                            |
| 8473                                                                                                                                                                                                                                                       | `Status: ready` — full speedboat hull renders                     | Working solution: 7 stations × 5 straight-line edges per wire, `loft.Build(pr)`, all OCCT objects in single `gc` array deleted post-Build      |

Net result of the transcript: 1 binding-generator defect → 79 error events → 17 incorrect hypotheses → 6 826 lines of recovery debugging → 1 working hull. Closing R1+R2 collapses this entire arc to a one-shot success.
