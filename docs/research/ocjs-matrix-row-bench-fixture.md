---
title: 'OCJS Matrix-Row Bench Fixture — Per-Row Scoring + Q3 Quantification'
description: 'Per-row bench fixture for the 38-row OCJS trailing-default emission matrix. Scores correctness × JS-glue bytes × WASM bytes × runtime × dispatch-error-clarity × TS-fidelity for every row; quantifies val-vs-optional per-call overhead for the rows where both primitives are candidates (Q3).'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: implementation
related:
  - docs/research/ocjs-occt-surface-audit.md
  - docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md
  - docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md
  - docs/research/ocjs-optional-overload-poc-coverage-gaps.md
  - docs/research/ocjs-optional-overload-resolution-blueprint.md
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
  - repos/opencascade.js/experiments/poc-occt-integration/README.md
  - repos/opencascade.js/experiments/matrix-row-bench/README.md
---

# OCJS Matrix-Row Bench Fixture — Per-Row Scoring + Q3 Quantification

Bench fixture used in Phase 3 to score every row of the 38-row OCJS trailing-default emission matrix on six axes (correctness × JS-glue bytes × WASM bytes × runtime × dispatch-error-clarity × TS-fidelity). Additionally quantifies the val-vs-optional per-call overhead (Open Question 3) for the rows where both primitives are candidates (1, 2, 24, 33, 34, 36).

## Executive Summary

The fixture is built as a sibling experiment at `repos/opencascade.js/experiments/matrix-row-bench/` (not as an extension of `poc-occt-integration/`, because the per-row scoring concern is orthogonal to the PoC's risk-coverage concern). It is **scaffolded end-to-end**: harness, runner, scoring tools, build script, all 38 per-row test files, val + optional Q3 variants, and baseline reports all exist and execute cleanly in scaffold-mode against `node bench-runner.mjs`.

- **Coverage**: 38 of 38 rows have per-row test files written and a fully wired scoring path. Live baseline ran cleanly with the val + optional Q3 variants linked; 4 rows (8, 24, 27, 34) report `pending-phase-1` because their verdicts depend on the bindgen regeneration landing in Phase 4.
- **Q3 quantification — RESOLVED**: rows 1, 2, 24, 33, 34, 36 measured live. **`emscripten::val` is faster than `std::optional<T>` on every row**, by 7 % – 55 %. The original +15 % "val might be too slow" concern is empirically inverted; no perf ceiling is required.
- **Baseline run mode**: live. End-to-end via `./build.sh all` (~10 s wall on darwin/clang, requires the prebuilt OCCT toolkit archives + emsdk that the sibling PoC also uses) then `node bench-runner.mjs`. Baseline report at `results/bench-baseline-2026-05-28.{json,md}`. Reproducibility: three back-to-back runs agree to ±3 ns/call after the batched-nanobench rewrite.
- **No CI ceiling gate**: per the post-Q3-resolution discussion, no automated regression gate is added — the bench fixture and recorded baseline serve as durable evidence; future regression investigation re-runs the same fixture.

## Harness Design

### Layout

```text
experiments/matrix-row-bench/
├── README.md                              experiment-local how-to
├── bench-runner.mjs                       main entry; aggregates, emits reports
├── build.sh                               emcc link (rows / val / optional / all)
├── harness.mjs                            defineRow(); per-row outcome capture
├── rows/
│   ├── registry.mjs                       38-row registry (single source of truth)
│   └── row-NN-<slug>.test.mjs (×38)       per-row test files
├── bindings/
│   ├── bindings-rows.cpp                  combined synthetic + targeted-real-OCCT
│   ├── bindings-rows-val.cpp              Q3 val variant (rows 1, 2, 24, 33, 34, 36)
│   └── bindings-rows-optional.cpp         Q3 optional variant (same six rows)
├── scoring/
│   ├── glue-size-diff.mjs                 JS+WASM bytes delta per variant
│   ├── runtime-bench.mjs                  N=10000 + warmup-100 per-call microbench
│   ├── error-clarity.mjs                  0–3 BindingError actionability rubric
│   └── ts-fidelity.mjs                    declared-vs-callable TS surface diff
└── results/
    ├── bench-baseline-YYYY-MM-DD.json     structured per-row table
    ├── bench-baseline-YYYY-MM-DD.md       human-readable rendering of same data
    └── per-row/row-NN.json                per-row structured result (one per test)
```

### Per-row test contract

Every per-row test file is small and uniform — it imports `defineRow` from `harness.mjs` and calls it once with `(rowId, runner)`. The harness owns module loading, shape iteration, runtime + correctness + error-clarity capture, and per-row JSON emission. Each per-row file therefore stays under 30 lines and the variability lives in the registry (`rows/registry.mjs`) and in the `runner` body.

The runner signature is:

```js
defineRow(rowId, async ({ mod, shape, mode }) => {
  // 'live' or 'scaffold'; mod is the loaded WASM module or null in scaffold
  // shape is one entry from registry's `shapes` array
  return { result?: any, error?: string };
});
```

### Mode detection (live vs scaffold)

The harness probes `mod-rows.mjs` at startup:

- If present and loadable → `mode='live'`; runner is invoked against the real bindings.
- If absent or load-fails → `mode='scaffold'`; each shape produces a `pending-build` placeholder so the bench runner can still aggregate a complete 38-row report.

This split makes the fixture executable as a scaffold immediately (today) without blocking on the bindings build, while wiring live execution as a single `./build.sh all` away.

### Scoring axis definitions

| Axis                  | Metric                   | Pass criterion                                              | Implementation                                                                                                                                       |
| --------------------- | ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness           | bool                     | every expected JS call shape returns the expected behaviour | `shape.errorExpected` flips the assertion for negative shapes; `verdict='pass'` only when every shape correct.                                       |
| Error-message clarity | 0–3 score                | ≥2 is acceptable                                            | rubric: 0 bare BindingError; 1 non-empty; 2 names position OR types; 3 names position + expected + received. Surfaced via `errorClarityMax` per row. |
| TS fidelity           | bool + diff              | declared overloads match callable signatures                | scaffold today; live wiring requires Phase 1 bindgen TS emitter integration (`pending-ts-emitter` marker).                                           |
| JS-glue bytes         | signed int delta         | informational                                               | `glue-size-diff.mjs` measures `mod-rows*.mjs` vs `mod-rows.mjs` baseline.                                                                            |
| WASM bytes            | signed int delta         | informational                                               | same module, `.wasm` files.                                                                                                                          |
| Runtime               | ns/call mean ± p95 + p99 | row-specific                                                | `runtime-bench.mjs` with N=10000 + warmup-100 per shape per primitive.                                                                               |

### Q3 quantification (val-vs-optional per-call overhead)

Six rows have BOTH primitives as candidates per the policy matrix:

| Row | Description                                   | val-shape                           | optional-shape                       |
| --- | --------------------------------------------- | ----------------------------------- | ------------------------------------ |
| 1   | Single overload, trailing scalar default      | val + `isUndefined()/isNull()`      | `std::optional<T>` + `value_or(D)`   |
| 2   | Single overload, trailing value-class default | val + `isUndefined()` → `T{}`       | `std::optional<T>` + `value_or(T{})` |
| 24  | Defaulted scalar policy flags                 | val (if rule 2 finds sibling alias) | `std::optional<T>` (if no sibling)   |
| 33  | Cstring-wrapper trailing default              | val inside cstring lambda           | `std::optional<std::string>`         |
| 34  | Multi-overload trailing default               | val at trailing position            | `std::optional<T>`                   |
| 36  | Defaulted trailing param = T{}                | val (if rule 2 finds sibling alias) | `std::optional<T>`                   |

Each row has matching bindings in `bindings-rows-val.cpp` (e.g. `Q3_Row01_Val::set(val arg)`) and `bindings-rows-optional.cpp` (e.g. `Q3_Row01_Opt::set(std::optional<bool> v)`). The bench runner loads both modules and feeds the same logical inputs to each in a tight microbench loop (`runtime-bench.mjs`):

```js
benchPair({
  rowId: 1,
  valCallable: (args) => valMod.Q3_Row01_Val.prototype.set.apply(inst, args),
  optCallable: (args) => optMod.Q3_Row01_Opt.prototype.set.apply(inst, args),
  shapes: [
    { name: 'omitted', args: [] },
    { name: 'value-true', args: [true] },
  ],
});
```

Output per row:

- `valShapes[]` — per-shape mean/p95/p99 ns under val
- `optionalShapes[]` — same under optional
- `perShapeDelta[]` — `{ deltaNs, deltaPct }` per shape
- `overall` — geometric-style `{ meanValNs, meanOptNs, deltaNs, deltaPct }` summary

### Q3 ceiling — closed

The Q3 ceiling was originally proposed as a +15 % per-call slowdown threshold (val vs optional) — a guardrail in case val turned out to be too slow to justify per the matrix's val-owned rows. The live baseline inverts the premise:

| Row | Pattern                         | opt ns/call | val ns/call | Δ ns | Δ %   |
| --- | ------------------------------- | ----------- | ----------- | ---- | ----- |
| 1   | scalar trailing default         | 41          | 38          | −3   | −7 %  |
| 2   | value-class default             | 74          | 49          | −25  | −34 % |
| 24  | multi scalar policy flags       | 73          | 48          | −25  | −34 % |
| 33  | cstring trailing default        | 221         | 181         | −40  | −18 % |
| 34  | multi-overload trailing default | 208         | 94          | −114 | −55 % |
| 36  | default-constructed trailing    | 166         | 88          | −78  | −47 % |

`val` is faster than `std::optional<T>` on every measured Q3 row. Mechanism: `_embind_register_optional` registers as `Object.assign({optional:true}, EmValType)` (`src/vendor/pristine-libembind.js:612`) — both primitives ultimately pipe through the same JS-native interop, but optional adds a C++-side tagged-union wrap step that val skips. WASM size also favours val (variant module is 4.7 KiB smaller).

**Decision**: no perf ceiling CI gate is introduced. The recorded baseline (`results/bench-baseline-2026-05-28.{json,md}`) is durable evidence; any future regression investigation re-runs the same fixture. The `--q3-threshold` flag is retained as informational only — it controls report rendering but does not gate CI.

**Caveats** (already documented in the bench report itself):

1. Numbers are from synthetic microbenches with near-empty C++ method bodies. Real OCCT methods do orders of magnitude more work per call; per-call dispatch cost is a sub-1 % fraction of real-world latency on those.
2. The measurement covers marshalling + dispatch only — no kernel work.
3. Per-shape detail shows the savings concentrate on **value-supplied** shapes (where optional has to marshal a concrete `T`), not on the omitted-trailing case.

**Methodology** (changed mid-investigation):

The original microbench timed one call per `performance.now()` sample. Node's `performance.now()` has ~1 µs resolution, so single-call timing on a 40-ns operation was dominated by noise (run-to-run swings of ±100 % were observed). The harness was rewritten to use a batched-nanobench pattern: each sample times a tight loop of 2,000 calls, dividing the elapsed time by the batch size. Three back-to-back runs of the batched harness agree to ±3 ns/call.

## Per-Row Coverage Table

All 38 rows have per-row test files written and a fully wired scoring path. The current verdict distribution (live baseline mode) is:

| Group                                                                   | Count | Row IDs                                                               |
| ----------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| `pass` (live run, correct verdict)                                      | 19    | 1, 2, 4, 5, 6, 11, 13, 14, 15, 23, 26, 28, 29, 30, 31, 32, 35, 36, 37 |
| `fail` (live run, expected to clear after Phase 4 bindgen regeneration) | 15    | 3, 7, 9, 10, 12, 16, 17, 18, 19, 20, 21, 22, 25, 33, 38               |
| `pending-phase-1` (verdict depends on Phase 4 bindgen output)           | 4     | 8, 24, 27, 34                                                         |
| Speculative (zero production instances; defensive)                      | 3     | 23, 35, 37                                                            |

The `fail` group is expected — these rows exercise the production bindgen output that has not yet been regenerated to match the policy matrix. They become `pass` after the Phase 4 big-bang regeneration.

Per-row test files (all 38 written):

| #   | Slug                                    | Primitive     | Production instances   | Q3-relevant | Pending              |
| --- | --------------------------------------- | ------------- | ---------------------- | ----------- | -------------------- |
| 1   | scalar-trailing-default                 | val           | 700                    | yes         | build                |
| 2   | value-class-default                     | val           | 150                    | yes         | build                |
| 3   | handle-null-default                     | optional      | 210                    | —           | build                |
| 4   | const-ref-anonymous-temporary           | optional      | 30                     | —           | build                |
| 5   | scoped-constant-default                 | optional      | 15                     | —           | build                |
| 6   | multi-overload-unique-arities           | native        | 760                    | —           | build                |
| 7   | sub-2a-semantic-conflict                | val           | 50                     | —           | build                |
| 8   | sub-2b-degenerate-siblings              | val           | 19                     | —           | build + Phase 1      |
| 9   | same-arity-class-typed                  | val           | 1226                   | —           | build                |
| 10  | static-instance-same-arity              | val           | 1                      | —           | build                |
| 11  | integer-twins-dedup                     | dedup         | unknown                | —           | build                |
| 12  | integer-vs-floating                     | val           | 10                     | —           | build                |
| 13  | char-vs-cstring                         | suffix        | 5                      | —           | build                |
| 14  | enum-vs-string                          | val           | 10                     | —           | build                |
| 15  | raw-pointer-defaults                    | filter        | unknown                | —           | build                |
| 16  | rbv-primitive-pure-out                  | rbv           | 451                    | —           | build                |
| 17  | rbv-primitive-in-out                    | rbv           | 451                    | —           | build                |
| 18  | rbv-class-output                        | rbv           | 451                    | —           | build                |
| 19  | rbv-handle-output                       | rbv           | 451                    | —           | build                |
| 20  | const-handle-input                      | native        | 2203                   | —           | build                |
| 21  | genuine-optional-return                 | optional      | 1+                     | —           | build                |
| 22  | genuine-optional-param                  | optional      | 4+                     | —           | build                |
| 23  | handle-non-null-default-speculative     | val           | 0 (speculative)        | —           | build                |
| 24  | multi-default-scalar-policy-flags       | optional      | absorbed-by-1/3/8      | yes         | build + Phase 1      |
| 25  | rbv-non-copyable-returns                | rbv           | 451                    | —           | build                |
| 26  | mixed-return-overload-groups            | mixed         | 148                    | —           | build                |
| 27  | rbv-elided-arity-collisions             | rbv           | unknown                | —           | build + Phase 1      |
| 28  | ncollection-template-instantiations     | template      | 890                    | —           | build                |
| 29  | adl-free-function-facade                | facade        | 7034                   | —           | build                |
| 30  | nullable-object-args                    | val           | unknown                | —           | build                |
| 31  | explicit-undefined-arg                  | cross-cutting | unknown                | —           | build                |
| 32  | sfinae-deleted-only                     | filter        | 0 (filtered at source) | —           | build                |
| 33  | cstring-wrapper-trailing-default        | val           | 3                      | yes         | build                |
| 34  | multi-overload-trailing-default         | val           | 20                     | yes         | build + Phase 1      |
| 35  | all-optional-sibling-rejection          | reject        | 0 (speculative)        | —           | build                |
| 36  | default-constructed-trailing            | optional      | 5                      | yes         | build                |
| 37  | reference-default-singleton-speculative | val           | 0 (speculative)        | —           | build                |
| 38  | initializer-list-bulk-init              | val           | 61                     | —           | build (design probe) |

Counts:

- **Written**: 38 of 38.
- **Run live**: 38 of 38 (verdicts: 19 `pass`, 15 `fail` (expected — pending Phase 4 bindgen regeneration), 4 `pending-phase-1` (also pending Phase 4)).

## Q3 Quantification — Closed

Live numbers from `experiments/matrix-row-bench/results/bench-baseline-2026-05-28.md` (50 samples × 2,000-call batches, ±3 ns reproducible):

| Row | Description                       | mean(opt) ns | mean(val) ns | Δ ns | Δ %    | Verdict    |
| --- | --------------------------------- | ------------ | ------------ | ---- | ------ | ---------- |
| 1   | scalar-trailing-default           | 41           | 38           | −3   | −7.32  | val faster |
| 2   | value-class-default               | 74           | 49           | −25  | −33.78 | val faster |
| 24  | multi-default-scalar-policy-flags | 73           | 48           | −25  | −34.25 | val faster |
| 33  | cstring-wrapper-trailing-default  | 221          | 181          | −40  | −18.10 | val faster |
| 34  | multi-overload-trailing-default   | 208          | 94           | −114 | −54.81 | val faster |
| 36  | default-constructed-trailing      | 166          | 88           | −78  | −46.99 | val faster |

**Outcome**: val is faster than optional on every Q3 row, by 7 % – 55 %. The originally-anticipated single-digit overhead never materialised — the relative ordering is reversed. Q3 is closed.

Bundle deltas (from the same baseline report): val variant is −10,694 bytes WASM / −6,895 bytes JS vs the combined-rows baseline; optional variant is −6,015 bytes WASM / −6,640 bytes JS. Val also wins on size by ~4.7 KiB in WASM.

## Phase 3 Readiness Assessment

The fixture is fully scaffolded and live-baselined. Three remaining steps round it out for Phase 3 reference:

### 1. (Done) Live baseline executed

```bash
cd repos/opencascade.js/experiments/matrix-row-bench
./build.sh all && node bench-runner.mjs
```

Build links three WASM modules in ~10 s wall on darwin/clang (`mod-rows`, `mod-rows-val`, `mod-rows-optional`). Runner emits `results/bench-baseline-<date>.{json,md}` with the full 38-row coverage table + Q3 quantification.

### 2. Wire the bindgen TS emitter for live TS-fidelity scoring

The TS-fidelity axis currently emits `pending-ts-emitter` for every row. To wire live:

1. Add a `--with-ts-emitter` flag to `bench-runner.mjs` that invokes `python -m ocjs_bindgen --filter Row<NN>_<Class> --tsdir <tmp>` per row.
2. Parse the emitted `.d.ts` via the TypeScript compiler API (already a workspace dep) to extract overload signatures by class+method name.
3. Cross-check each declared signature against the row's `shapes` array. Mark `tsFidelity.match = true` only when every declared overload accepts at least one shape's arg-tuple types AND every callable shape matches at least one declared overload.

Skeleton for the bindgen invocation already exists in `paths.py`; the integration is mechanical.

### 3. (Done) Phase 1 has landed

Rule 2 (sibling-aliasing detector) and rule 3 (JS-effective arity precondition) shipped in Phase 1. Rows 8, 24, 27, 34 currently still report `pending-phase-1` in the live bench because their bindings depend on the Phase 4 big-bang regeneration — once the production WASM is regenerated against the new bindgen, the verdicts settle.

### 4. Optional: extend `bindings-rows.cpp` to cover more real OCCT classes

Today the combined bindings file includes a minimal real-OCCT slice (`gp_Pnt`, `TopoDS_Shape`) plus the synthetic Row01..Row37 fixtures. Rows whose test subject is a real OCCT class (`BRepGProp_Face`, `TCollection_AsciiString`, `BRepMesh_IncrementalMesh`, etc.) will fall back to the "binding unavailable" path until the bindings are added. Two options:

- (a) Hand-author the per-class bindings in `bindings-rows.cpp` for the rows that warrant real-OCCT execution.
- (b) Use the existing production bindings (link against the full OCJS WASM at `dist/`) — heavier but covers every row natively.

Option (b) becomes natural once Phase 4 regeneration ships — the production WASM gives us full real-OCCT coverage without per-row hand-authoring.

## Open Issues

- **TS-fidelity wiring**: scaffold today; live wiring is a Phase-4-or-later follow-up (mechanical integration described in §2).
- **Real OCCT row coverage in the combined bindings module**: minimal slice today; defer to Phase 4 (link against regenerated production WASM).
- **NCollection initializer_list (row 38) is a design probe**: the fixture emits both candidate primitive variants (val-array dispatch vs filter-and-suffix); the production binding currently emits but is unreachable from JS. Either implement the val-array adapter or filter the row at the bindgen layer per the policy matrix recommendation.

## References

### In-tau (consumer repo)

- Surface audit (driving doc): [`ocjs-occt-surface-audit.md`](./ocjs-occt-surface-audit.md)
- Strategic reviews: [`ocjs-optional-overload-strategic-review-opus-4-7.md`](./ocjs-optional-overload-strategic-review-opus-4-7.md), [`ocjs-optional-overload-strategic-review-gpt-5-5.md`](./ocjs-optional-overload-strategic-review-gpt-5-5.md)
- Parent gap analysis: [`ocjs-optional-overload-poc-coverage-gaps.md`](./ocjs-optional-overload-poc-coverage-gaps.md)
- Migration blueprint: [`ocjs-optional-overload-resolution-blueprint.md`](./ocjs-optional-overload-resolution-blueprint.md)

### In-repo (OCJS)

- Policy: `repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`
- Sibling PoC: `repos/opencascade.js/experiments/poc-occt-integration/README.md`
- Bench fixture: `repos/opencascade.js/experiments/matrix-row-bench/README.md`
- Combined bindings: `repos/opencascade.js/experiments/matrix-row-bench/bindings/bindings-rows.cpp`
- Q3 val variant: `repos/opencascade.js/experiments/matrix-row-bench/bindings/bindings-rows-val.cpp`
- Q3 optional variant: `repos/opencascade.js/experiments/matrix-row-bench/bindings/bindings-rows-optional.cpp`
- Build script: `repos/opencascade.js/experiments/matrix-row-bench/build.sh`
- Bench runner: `repos/opencascade.js/experiments/matrix-row-bench/bench-runner.mjs`
- Baseline report (scaffold mode): `repos/opencascade.js/experiments/matrix-row-bench/results/bench-baseline-2026-05-28.{json,md}`
