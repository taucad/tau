# Deterministic edit reliability — Tier D

This credential-free Vitest benchmark replays stored tool emissions through `handleEditFile`, the same handler used by the `edit_file` RPC arm. Its in-memory filesystem exercises the production planner, byte checks, stale replan, retry limit, and result handling with deterministic conflict injections. It is a planner/retry replay: the Map does not reproduce the browser authority's asynchronous read/write window and is not evidence for production writer serialization.

Run the full suite with the existing API integration target:

```bash
pnpm nx run api:test:models -- app/testing/edit-bench/edit-bench.test.ts
```

The focused suite makes no network calls and needs no credentials, PostgreSQL, Redis, or Docker. It is kept under `app/testing` so the normal API unit target does not accidentally load the live-model harnesses alongside it; CI should invoke the focused command above.

Production authority concurrency is a separate browser-adapter gate in `apps/ui/app/hooks/rpc-handlers.test.ts`: `preserves both concurrent edits across adapters sharing one filesystem authority`. Run it with:

```bash
npx vitest run --root apps/ui app/hooks/rpc-handlers.test.ts -t 'preserves both concurrent edits'
```

## Fixture contract

`ReplayFixture` stores:

- the source/provenance and case ID;
- each emission's tool name and raw `argumentsJson`, before parsing or normalization;
- exact starting bytes for every file;
- optional exact bytes injected before the first and second CAS attempts; and
- exact final bytes plus either success or a typed production/benchmark error.

Recorded Tier-L fixtures must use `source.kind: 'recorded'` and `argumentsVerbatim: true`. Authored deterministic seeds name the checked-in source from which their starting bytes were copied. The suite compares those authored snapshots with the source files byte-for-byte, so corpus drift fails instead of silently changing the benchmark.

The current store has 20 fixtures:

| Case                                   | Fixtures |
| -------------------------------------- | -------: |
| Legacy portable qualification rows     |        5 |
| Unique match                           |        1 |
| Context widening                       |        1 |
| Ambiguous match/no write               |        1 |
| Ordered pair                           |        1 |
| Deletion                               |        1 |
| EOF append                             |        1 |
| Stale reapply                          |        1 |
| Second CAS conflict                    |        1 |
| Wrong tool selection                   |        1 |
| Non-TypeScript OpenSCAD                |        1 |
| Non-TypeScript KCL                     |        1 |
| `replaceAll` rename                    |        1 |
| Folded Unicode match                   |        1 |
| Wrong target                           |        1 |
| Wrong-but-valid TypeScript parse probe |        1 |

The wrong-but-valid probe is a schema-valid `edit_file` call that commits exact bytes and introduces a TypeScript syntax error. The in-process TypeScript parser classifies it as `WRONG_BUT_VALID`. The SCAD/KCL fixtures assert edit bytes only; they do not claim kernel compilation evidence.

## Legacy evidence limits

The stash JSONL contains 35 aggregate qualification rows but deliberately omits file bytes and tool-call arguments. Of those rows, only the five xAI/Grok `edit_file` rows used the exact portable field names of the one-format contract. They are represented as `qualification-derived` seeds with `argumentsVerbatim: false`; their arguments reconstruct the common qualification task and are **not** live-emission evidence. The Anthropic/Kimi rows used different native field names, and the 20 OpenAI rows used `apply_patch`, so neither maps verbatim to this contract.

The current `libs/tau-examples` tree contains the real OpenSCAD main but no `.kcl` file. The KCL case therefore freezes Tau's checked-in `zoo.prompt.example.kcl` and names that path explicitly. Tier L should replace this fallback with a recorded corpus KCL emission when the corpus contains one.

## Tier L append workflow

Tier L is a later, paid, environment-gated lane: 12 cases × 5 repetitions × 5 models = 300 attempted emissions. For every attempt it must capture the raw provider tool-call arguments before validation, snapshot all starting file bytes, execute the real tool path, grade compile/parse where supported, and append one new `source.kind: 'recorded'` fixture to `fixtures.ts`. Failed or malformed emissions are retained as typed negative fixtures rather than discarded.

After appending, run Tier D without provider credentials. Tier L does not pass unless its measured rows meet all bars:

- schema-valid: 100%;
- apply success: at least 95%;
- wrong target: 0;
- wrong-but-valid: 0;
- malformed: at most 2%;
- ambiguity retry-to-success: at least 90% within one retry;
- stale cases: 5/5; and
- Morph requests: 0.

## Ownership and red-first proof

This benchmark is orchestrator-owned under V10. Implementers may add fixtures, but must not delete, skip, edit, or weaken an existing gate fixture or its assertions. Contract changes require a separate orchestrator-reviewed change with the failure demonstrated first.

The red-first run deliberately changed `unique-match-jscad-cube-size` to expect `size: 23` while the emission applied `size: 24`. The suite failed with:

```text
[unique-match-jscad-cube-size] byte drift in main.ts.
Tests 2 failed | 21 passed
```

After restoring the expected byte, the focused run passed 24/24 tests. A permanent corruption canary clones a valid fixture, flips one expected byte, and asserts that the runner rejects it while naming `red-first-corrupted-byte-canary`.
