---
title: 'OCJS Smoke-Test Quality + Activation Pass'
description: 'Inventory of as-unknown-as cast removals, stub activations, unused @ts-expect-error findings, and final smoke/regression counts for the opencascade.js test suite.'
status: active
created: '2026-05-29'
updated: '2026-05-29'
category: audit
related:
  - docs/research/ocjs-phase-4-smoke-readiness.md
  - docs/research/ocjs-occt-surface-audit.md
---

# OCJS Smoke-Test Quality + Activation Pass

Two-workstream quality pass over `repos/opencascade.js/tests/`: (1) eliminate every `as unknown as` type-suppression cast, and (2) activate all placeholder/stub smoke tests into real, doc-grounded coverage.

## Executive Summary

All `as unknown as` casts (and both stray `as any` casts) are gone from `tests/` — replaced by direct typed calls (Pattern A), `@ts-expect-error` negative pins (Pattern B), `Reflect.construct` + typed accessors (sub-2b regression pins), or typed `keyof` indexing (`BRepGraph`). Every placeholder stub (`expect(true).toBe(true)`, speculative `describe.skip`/`it.skip`) is replaced with either active assertions or genuinely-conditional flag-gated bodies that fail-on-activation. Three `@ts-expect-error` directives came back **unused** — each is a recorded finding (the type is looser than the test author assumed, or the sibling's rebuild resolved the type side). Final state: **lint clean**, **typecheck clean except 6 pre-existing bindgen `.d.ts` errors** (HArray member-typedef resolution, owned by the bindgen), and **smoke+regression = 454 passed / 1 failed / 12 skipped**, the single failure being a documented POST-PHASE-4 activated-coverage pin awaiting a bindgen arity-pad binding.

## Scope and Non-Goals

**In scope**: test files, test helpers, the sub-2b regression-pin generator (`scripts/generate-sub2b-regression-pins.py`), and this note.
**Out of scope** (sibling subagent owns the bindgen): `src/ocjs_bindgen/**`, WASM rebuilds, `docs/research/ocjs-phase-4-build-outcome.md`, and the generated `dist/opencascade_full.d.ts` surface.

## Methodology

- Enumerated casts with `rg -n "as unknown as" tests/` and stubs with `rg -n "describe.skip|it.skip|expect\(true\).toBe\(true\)|TODO\(phase-4\)|POST-PHASE-4 placeholder" tests/`.
- Classified each cast as Pattern A (binding accepts the value → direct call + behavioral assertion), Pattern B (type-invalid negative case → `@ts-expect-error` + runtime `.toThrow`), or a bindgen-gap finding.
- Cross-referenced the trailing-default emission policy (38-row matrix / 10 rules) and `dist/opencascade_full.d.ts` to confirm the correct target type for each call shape.
- Verified with `pnpm typecheck`, `pnpm lint`, and `pnpm exec vitest run tests/smoke/ tests/regression/` against the freshly rebuilt artifacts.

## Findings

### Workstream 1 — Cast inventory

`rg -n "as unknown as" tests/` → **0**. `rg -n "as any" tests/` → **0**.

| File                                            | Casts              | Resolution                                                                                                               |
| ----------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `smoke-optional-handle-defaults.test.ts`        | 2                  | Pattern A (`undefined` direct call) + Pattern B (`null` → `@ts-expect-error`, rule-5 throw)                              |
| `smoke-rule-5-strict-null-rejection.test.ts`    | 6                  | Pattern B across rows 1/2/24/33/34/36 (`@ts-expect-error` + `.toThrow(/null is not a valid value/)`)                     |
| `smoke-optional-value-defaults.test.ts`         | 3                  | 1 Pattern A (`undefined`) + 2 Pattern B (`null`)                                                                         |
| `smoke-optional-static-methods.test.ts`         | 1                  | Pattern A — **finding F1** (see below): static `BRepLib.BuildCurve3d` already declares all trailing optionals            |
| `smoke-multioverload-trailing-defaults.test.ts` | 1                  | Pattern A + **finding F2**: 2-arg `Add` type-accepted via structural `TopoDS_Face` overload; runtime pin retained        |
| `smoke-cstring-trailing-defaults.test.ts`       | 1                  | Pattern B — directive **used** (genuine gap: `IFSelect_Act.SetGroup` `file` param required in `.d.ts`)                   |
| `smoke-non-planar-face.test.ts`                 | 1 (4 calls)        | Pattern A + **finding F2** (same structural-overload acceptance)                                                         |
| `smoke-sub-2a-semantic-conflict.test.ts`        | 3 + dynamic lookup | Pattern A — direct typed `new oc.BRepMesh_IncrementalMesh(...)`, `using params = new oc.IMeshTools_Parameters()`         |
| `smoke-output-params-disposal.test.ts`          | 2                  | Removed (return type already carries `[Symbol.dispose]`) + stub activated                                                |
| `smoke-genuine-optional-param.test.ts`          | 3 + helper         | Pattern A + `@ts-expect-error` (row-22 permissive null; arity-pad gap)                                                   |
| `smoke-initializer-list-bulk-init.test.ts`      | 2 + helpers        | Pattern A — typed `new oc.NCollection_List_handle_BOPDS_PaveBlock(...)` + `using`                                        |
| `smoke-brep-graph.test.ts`                      | 8                  | Typed `keyof` indexing over view accessors (`topo[name]`, `oc[opsClassName]`) + `using view`                             |
| `tests/regression/sub-2b/*.test.ts`             | 15 (one per pin)   | Generator rewritten: `oc.<Class>` typed accessor + `Reflect.construct` (no cast); disposable fixtures inlined as `using` |
| `dts-docs.test.ts`                              | 2 (`as any`)       | Typed narrowing `(node as ts.Node & { jsDoc?: ts.JSDoc[] })` for the TS compiler-internal `.jsDoc`                       |

### Finding F1 — `BRepLib.BuildCurve3d` is not a bindgen gap

The original cast assumed the `.d.ts` declared only `BuildCurve3d(edge)`. In fact the **static** overload at `opencascade_full.d.ts:132435` declares
`static BuildCurve3d(E, Tolerance?, Continuity?, MaxDegree?, MaxSegment?): boolean` — all four trailing defaults are optional. The arity-1 grep hit was a _different_ class's instance method. The cast was pure laziness; removed → clean Pattern A. The `@ts-expect-error` was unused (= type already accepts the call), confirming the gap does not exist.

### Finding F2 — `BRepOffsetAPI_MakeFilling.Add(edge, order)` is type-accepted via structural overload

The 2-arg `Add(edge, GeomAbs_C0)` call shape does **not** trip the type system, but not because a trailing default is emitted. `TopoDS_Edge` is structurally assignable to `TopoDS_Face` (OCJS handle wrappers are near-empty classes), so the call binds to the arity-2 `Add(Support: TopoDS_Face, Order)` overload at the type level. The two `@ts-expect-error` directives (multioverload + 4× non-planar-face) were therefore **unused** and were removed; the runtime `.not.toThrow()` pins are retained as the actual regression signal (embind dispatches the edge to the `(Constr, Order, IsBound)` branch and throws pre-Phase-4). **Actionable for bindgen review**: OCJS class structural compatibility means a wrong-overload argument (`Edge` where `Face` is declared) is not type-caught — a latent class of silent misuse.

### Finding F3 — `smoke-thrusections-build-arg` `Build()` arg-trap: type side resolved by rebuild

A pre-existing `@ts-expect-error` on `loft.Build()` came back unused against the freshly rebuilt `.d.ts`: the progress arg is now typed optional (`Build(theRange?: Message_ProgressRange)`), so omission is type-valid. The stale directive was removed and the comment updated; the runtime `.not.toThrow()` pin (the minified `'Zc'` crash repro) remains the live acceptance criterion. The 7-section positive control in the same file was also converted from a manual `allocs[]`/`try-finally` to the established per-iteration `using` loop pattern (mirrors `smoke-sweep-loft.test.ts`; `ThruSections.AddWire` copies the wire) to satisfy `require-using-on-disposable`.

### Finding F4 (pre-existing, bindgen-owned) — HArray member-typedef resolution

`tests/harray-member-types.test-d.ts` fails typecheck with 6 errors: `NCollection_HArray1_*['Array1' | 'ChangeArray1']` return types resolve to `any`/`never` instead of the concrete `NCollection_Array1_*` typedef. This is a `.d.ts` generation gap (template-argument resolution for member typedefs), not introduced by this pass and not fixable without touching the bindgen. It is the sole blocker to a fully-clean `pnpm typecheck` and is flagged for the bindgen owner.

### Workstream 2 — Activated-stub inventory

`rg -n "expect\(true\).toBe\(true\)" tests/` → **0**. Remaining `it.skip`/`describe.skip` are all genuinely-conditional (`skipIf(!FLAG)` flag gates or the `if (!dts)` availability guard at `dts-validation.test.ts:710`).

| File                                     | Row/rule pinned                                     | Concrete OCCT target                                                        | Activation                                                                                                                                  | Current verdict    |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `smoke-row-30-permissive-null.test.ts`   | Matrix row 30 (permissive-null carve-out) vs rule 5 | `BRepAlgoAPI_Fuse.Build(Message_ProgressRange)` (value-typed reporter slot) | Replaced existence-pin + 3 `it.skip` placeholders with 2 active **carve-out-scoping** tests (undefined→default succeeds; null→rule-5 throw) | PASS (both)        |
| `smoke-output-params-disposal.test.ts`   | RBV `[Symbol.dispose]` idempotency                  | `BRep_Tool.PolygonOnTriangulation`                                          | Replaced `expect(true)` with `P`/`T` presence + idempotent dispose assertions                                                               | PASS               |
| `smoke-optional-return-types.test.ts`    | T3 `std::optional<T>` return                        | none ships yet                                                              | 3 `expect(true)` → gate-premise pins (`OPTIONAL_RETURN_AVAILABLE=false`)                                                                    | SKIP (gate closed) |
| `smoke-mixed-fanout-optional.test.ts`    | U1 mixed fan-out + optional                         | none ships yet                                                              | 3 `expect(true)` → gate-premise pins (`MIXED_DISPATCH_AVAILABLE=false`)                                                                     | SKIP (gate closed) |
| `smoke-optional-lifetime-hammer.test.ts` | U4 `optional<handle<T>>` refcount                   | none ships yet                                                              | 1 `expect(true)` → gate-premise pin                                                                                                         | SKIP (gate closed) |
| `smoke-optional-value-defaults.test.ts`  | Matrix rows 2/4/36 class-value defaults             | non-RBV-blocked observable site (e.g. `= TopLoc_Location()`)                | `describe.skip`/`it.skip` → `skipIf(!CLASS_VALUE_DEFAULT_AVAILABLE)` with real premise body                                                 | SKIP (gate closed) |

**Row-30 finding**: a genuine search found **no concrete row-30 production target**. The Phase-3 reporter seed set (`Message_ProgressIndicator`, `Message_ProgressRange`, `Message_Report`) lists `Message_ProgressRange`, but its real call sites (`Build(const Message_ProgressRange& = ...)`) pass the reporter by const-ref **value** (matrix row 2 → rule-5 strict-null), not as a nullable `Handle<T>` sentinel. Both `smoke-rule-5` (Row 2) and `smoke-optional-handle-defaults` (c) already pin `Build(null)` as a rule-5 throw. A permissive-null row-30 test would contradict those pins, so the activated coverage instead asserts the carve-out's **correct non-application** — the `undefined → default` / `null → throw` divergence that proves the classifier is scoped out of value-typed slots. When a real `Handle<Message_Report>` defaulted writer slot is identified, a sibling `describe` asserting the permissive direction should be added.

**Gate-premise pins**: for the four forward-looking files whose target binding does not yet exist, the trivial `expect(true).toBe(true)` body was replaced with `expect(<GATE>).toBe(false)` plus the real intended body sketched in comments. The `skipIf(!<GATE>)` keeps them skipped while the gate is closed; flipping the gate un-skips them and they fail at the premise pin, forcing the real body to be written (a self-documenting activation forcing-function rather than a silent green stub).

### Unused `@ts-expect-error` summary (the requested findings)

| Directive site                                         | Why unused                                                      | Action                         |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------ |
| `smoke-optional-static-methods.test.ts` (BuildCurve3d) | Static overload already declares trailing optionals (F1)        | Removed → clean Pattern A      |
| `smoke-multioverload` + `smoke-non-planar-face` (Add)  | `TopoDS_Edge`→`TopoDS_Face` structural overload acceptance (F2) | Removed; runtime pins retained |
| `smoke-thrusections-build-arg` (Build, pre-existing)   | Rebuilt `.d.ts` types progress arg optional (F3)                | Removed; runtime pin retained  |

## Recommendations

| #   | Action                                                                                                                                                                                                                      | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Bindgen: fix HArray member-typedef resolution so `NCollection_HArray1_*.Array1()` returns the concrete `NCollection_Array1_*` (unblocks full `pnpm typecheck`) — F4                                                         | P1       | Med    | High   |
| R2  | Bindgen review: consider nominal-ish branding for `TopoDS_*` wrappers so wrong-overload args (`Edge` vs `Face`) are type-caught — F2                                                                                        | P2       | High   | Med    |
| R3  | When a real `Handle<Message_Report>` defaulted writer slot is found, add the permissive-direction row-30 `describe`                                                                                                         | P2       | Low    | Med    |
| R4  | Flip the four activation gates (`OPTIONAL_RETURN_AVAILABLE`, `MIXED_DISPATCH_AVAILABLE`, `OPTIONAL_HANDLE_PARAM_AVAILABLE`, `CLASS_VALUE_DEFAULT_AVAILABLE`) as each binding ships; the premise pins will force real bodies | P3       | Low    | Med    |

## Final counts

- `as unknown as` in `tests/`: **0**
- `as any` in `tests/`: **0**
- `expect(true).toBe(true)` placeholder stubs: **0**
- Non-conditional `describe.skip`/`it.skip` placeholders: **0** (remaining skips are `skipIf(!FLAG)` gates and the `dts-validation` availability guard)
- `pnpm lint`: **clean** (exit 0)
- `pnpm typecheck`: clean **except 6 pre-existing bindgen `.d.ts` errors** (F4, `harray-member-types.test-d.ts`)
- `pnpm exec vitest run tests/smoke/ tests/regression/`: **454 passed / 1 failed / 12 skipped** (467 tests, 104 files)
  - The 1 failure: `smoke-genuine-optional-param` "(a) omitted theAvoidKind (arity-pad)" → `BindingError: parameter 0 has unknown type N24BRepGraph_ParentExplorer6ConfigE` — activated-coverage pin awaiting the bindgen arity-pad/Config binding, documented POST-PHASE-4. Not a module-load/syntax/import error.

## References

- Policy: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`
- Related: `docs/research/ocjs-phase-4-smoke-readiness.md`, `docs/research/ocjs-occt-surface-audit.md`
- Generator: `repos/opencascade.js/scripts/generate-sub2b-regression-pins.py`
- Lint rule: `repos/opencascade.js/tools/eslint-plugin/require-using-on-disposable.js`
