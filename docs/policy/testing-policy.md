---
title: 'Testing Policy'
description: 'Writing high-quality tests across the Tau monorepo. Assert observable behavior, error assertions, resource cleanup, mock factories, and async patterns. Covers Vitest, kernel tests, and API tests.'
status: active
created: '2026-03-09'
updated: '2026-11-28'
related:
  - docs/policy/react-testing-policy.md
  - docs/policy/typescript-policy.md
  - docs/policy/geospec-policy.md
  - docs/research/typescript-overloads.md
  - docs/research/mesh-continuity-test-semantics.md
  - docs/research/ci-flake-quarantine-blueprint.md
---

# Testing Policy

Internal reference for writing high-quality tests across the Tau monorepo. Distilled from patterns observed in `packages/runtime`, `apps/ui`, and `apps/api`.

**See also:** [React Testing Policy](react-testing-policy.md) for hook and component testing patterns specific to `apps/ui`.

## Rationale

Tests that assert implementation details become brittle when refactoring and provide false confidence. Asserting observable behavior ensures tests verify what consumers and collaborators actually care about. Consistent patterns for error assertions, resource cleanup, and mock factories reduce bugs and improve maintainability across the monorepo.

## 1. Assert Observable Behavior, Not Implementation

Every assertion must verify something a consumer or collaborator can observe. A test that only checks "does not throw" without verifying the resulting state is incomplete.

```typescript
// INCORRECT: asserts nothing meaningful
it('should close ports on dispose', () => {
  const handle = createBridgePort(fs);
  expect(() => handle.dispose()).not.toThrow(); // proves nothing
});

// CORRECT: asserts the observable effect of closing ports
it('should close both ports on dispose, preventing further communication', async () => {
  vi.useFakeTimers();
  try {
    const handler = vi.fn().mockResolvedValue('ok');
    const handle = createBridgePort({ ping: handler });
    const proxy = createBridgeProxy<{ ping(): Promise<string> }>(handle.port);

    expect(await proxy.ping()).toBe('ok');
    expect(handler).toHaveBeenCalledOnce();

    handle.dispose();

    const pendingCall = proxy.ping();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pendingCall).rejects.toThrow('timed out');
    expect(handler).toHaveBeenCalledOnce(); // server never received the call
  } finally {
    vi.useRealTimers();
  }
});
```

**Rule of thumb:** If you remove the function under test and the test still passes, the test is broken.

## 2. Test Naming

Use `it('should <verb> <outcome> [when <condition>]')` for consistency.

```typescript
// CORRECT
it('should reject pending calls when disposed');
it('should skip fetch for recently failed packages');
it('should preserve error name across the bridge');

// INCORRECT: imperative without "should" (unclear what's being asserted), or vague
it('renders single-key code object');
it('works correctly');
it('handles errors');
```

Nest `describe` blocks by feature or scenario:

```typescript
describe('ModuleManager', () => {
  describe('cache hit / miss', () => { ... });
  describe('retry backoff', () => { ... });
  describe('CDN fallback', () => { ... });
});
```

## 3. Error Assertions

Always assert both the error message and the error type when testing error propagation. Use `rejects.toThrow` for async rejections. Use `expect.fail('reason')` after a call that should throw, so the test fails with a clear message if the exception is not raised.

```typescript
// CORRECT: asserts message and type
try {
  await call('fail', []);
  expect.fail('should have thrown');
} catch (error) {
  expect((error as Error).message).toBe('type mismatch');
  expect((error as Error).name).toBe('TypeError');
}

// CORRECT: async rejection
await expect(proxy.readFile('/missing.txt')).rejects.toThrow('ENOENT');

// INCORRECT: catches everything without inspecting
try {
  await riskyCall();
} catch {
  // test passes but we don't know what was thrown
}
```

## 4. Resource Cleanup

Always clean up resources (timers, workers, ports, mocks) in `afterEach` or `finally` blocks. Never rely on the happy path reaching a manual cleanup call. Cleanup does not make sharing safe: no test depends on what another left behind (§ 16.7).

```typescript
// INCORRECT: cleanup only runs if the test passes
it('should timeout', async () => {
  vi.useFakeTimers();
  // ... if an assertion fails here, real timers are never restored
  vi.useRealTimers();
});

// CORRECT: finally guarantees cleanup
it('should timeout', async () => {
  vi.useFakeTimers();
  try {
    // ... test logic
  } finally {
    vi.useRealTimers();
  }
});
```

For shared resources (workers, servers, connections), use `afterEach`:

```typescript
let activeCleanup: (() => void) | undefined;

afterEach(() => {
  activeCleanup?.();
  activeCleanup = undefined;
});
```

### 4.1 Returning Multiple Disposables From a Test Helper

When a helper produces several owning handles that the caller needs to use together (e.g. an explorer iteration that yields a face, an edge, a triangulation, and a location), do NOT bundle them with a `cleanup: () => void` callback returned alongside the handles. The pattern is fragile: any intermediate handle bound by `using` inside the helper is disposed at helper return, leaving the outer-scope bindings the caller is expected to use as references to disposed objects (use-after-dispose on the consumer side). The disposer-idempotency guard from the unified RBV work only covers `val::object` envelopes, not raw embind handles.

Use `DisposableStack.move()` to transfer ownership of every accumulated handle from the helper's local stack to a caller-owned stack returned to the test:

```typescript
function getFirstTriangulatedEdge(shape: TopoDS_Shape): DisposableStack & {
  edge: TopoDS_Edge;
  triangulation: Poly_Triangulation;
  location: TopLoc_Location;
} {
  using outer = new DisposableStack();
  const explorer = outer.use(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE));
  while (explorer.More()) {
    using iterStack = new DisposableStack();
    const face = iterStack.use(oc.TopoDS.Face(explorer.Current()));
    const triangulation = iterStack.use(BRep_Tool.Triangulation(face, location));
    if (!triangulation.IsNull()) {
      // Transfer ownership to a stack the caller receives: `using` here no longer disposes the moved handles
      const moved = iterStack.move();
      return Object.assign(moved, { edge, triangulation, location });
    }
    explorer.Next();
  }
  throw new Error('no triangulated edge found');
}

// Caller drives lifecycle directly via `using`:
it('does the thing', () => {
  using bundle = getFirstTriangulatedEdge(shape);
  expect(bundle.edge).toBeDefined();
}); // bundle.dispose() runs all the moved disposers in LIFO order
```

Canonical reference: [`smoke-brep-tool-overloads.test.ts:28-103`](https://github.com/taucad/opencascade.js/blob/main/tests/smoke/smoke-brep-tool-overloads.test.ts); prior art for adopting an RBV container via `stack.use(...)`: [`smoke-output-params-disposal.test.ts`](https://github.com/taucad/opencascade.js/blob/main/tests/smoke/smoke-output-params-disposal.test.ts) (around line 122).

## 5. Type-Safe Mocks with `mock<T>()`

Use `mock<T>()` from `vitest-mock-extended` where the package already depends on it to create typed test doubles. Never use `as unknown as T` to cast partial objects to full types. A dedicated testing package may instead expose an explicit, Vitest-backed object literal when doing so removes `vitest-mock-extended` from the production package's dependency surface; keep the one necessary interface assertion inside that shared factory.

**Why**: `as unknown as` bypasses the compiler entirely: when the real type changes, tests using it still compile and pass with stale shapes, hiding regressions. `mock<T>()` returns a deep Proxy that satisfies the full interface, auto-stubbing methods with `vi.fn()` and properties with `undefined`, while allowing overrides.

```typescript
import { mock, mockDeep } from 'vitest-mock-extended';

// CORRECT: typed mock with overrides
const client = mock<RuntimeClient>({ terminate: vi.fn() });
const options = mock<RuntimeClientOptions>();
const ref = mock<ProjectContext['fileManagerRef']>({ send: vi.fn() });

// CORRECT: `mockDeep<T>()` for deeply nested mocks (NestJS services, complex interfaces)
const mockResult = mockDeep<StreamTextResult>();

// INCORRECT: bypasses type system
const client = {} as unknown as RuntimeClient;
```

For domain objects with sensible defaults, use shared factory functions:

```typescript
import { createMockFileSystem } from '@taucad/runtime-testing';

const filesystem = createMockFileSystem();
filesystem.mocks.exists.mockResolvedValue(true);
```

**Limitation**: `mock<T>()` returns a Proxy. Objects that must be serialized (`JSON.stringify`, `postMessage`, `structuredClone`) cannot use `mock<T>()`. In those cases, use a plain object with a single `as T` assertion. See `docs/research/typescript-overloads.md` for why overloaded function types are incompatible with `vi.fn()` mapped types.

## 6. Async Patterns

Prefer `await expect(promise).rejects.toThrow()` over try/catch for simple rejection tests. Use try/catch only when inspecting multiple error properties. Both forms are the examples in § 3.

For fake timers with async operations, start the call without awaiting it, advance with `await vi.advanceTimersByTimeAsync(...)`, then await the assertion on the pending promise, and restore real timers in `finally`. The § 1 example shows the whole sequence.

## 7. Immutability and Side-Effect Checks

When a function must not mutate its inputs, verify the original values are unchanged after the call. Verify that outputs are new references.

```typescript
it('should not mutate the original array', async () => {
  const original = [{ id: 1, name: 'test' }];
  const originalCopy = structuredClone(original);

  const result = transform(original);

  expect(original).toEqual(originalCopy); // input unchanged
  expect(result).not.toBe(original); // new reference
});
```

## 8. Avoid Console Output in Tests

Do not leave `console.log` or `console.error` in test files. If diagnostic output is needed during development, remove it before committing, or turn it into an assertion: `expect(entries).toHaveLength(fileCount)` instead of logging `entries.length`.

## 9. Structure Assertions Over Existence Assertions

When testing structured data (objects, arrays, geometry), assert the shape and specific values, not just that the result exists or has length > 0.

```typescript
// INCORRECT: only checks existence
expect(result.data.length).toBeGreaterThan(0);

// CORRECT: checks structure
expect(result.data[0]).toEqual(
  expect.objectContaining({
    type: 'mesh',
    vertices: expect.any(Float32Array),
  }),
);
```

## 10. Test File Organization

| Convention        | Pattern                                             |
| ----------------- | --------------------------------------------------- |
| Placement         | `*.test.ts` co-located next to the source file      |
| Imports           | `import { describe, it, expect, vi } from 'vitest'` |
| Top `describe`    | Module or unit under test                           |
| Nested `describe` | Feature, scenario, or behavior group                |
| Section comments  | Use `// ===` separators for large test files        |
| Shared helpers    | Place in `testing/` directory with explicit exports |

## 11. No Type Assertions for Mocks

Never use `as unknown as T` to create mock objects or cast return values. The reason and the CORRECT and INCORRECT forms are in § 5.

| Scenario                    | Pattern                                  | Notes                                          |
| --------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Partial interface stub      | `mock<ServiceType>({ method: vi.fn() })` | Auto-stubs missing members                     |
| Empty configuration         | `mock<ConfigType>()`                     | All properties default to `undefined`          |
| Deep nested mock            | `mockDeep<ComplexType>()`                | Recursively mocks nested objects               |
| Serialized data             | `{ field: 'value' } as DataType`         | Single assertion for plain data                |
| Intentionally invalid input | `'bad' as unknown as ValidType`          | Error-path tests only; requires oxlint-disable |

## 12. Geometry-Test Surface

The agent-facing geometry-test surface is GeoSpec: Vitest-style `*.geospec.ts` / `*.geospec.js` files executed by `test_model` through the browser-connected Tau runner or the standalone GeoSpec CLI. Agent-facing checks must remain semantically non-overlapping and produce spatially useful diagnostics.

1. **Non-overlap rule.** Every agent-facing check must answer a question no existing check can. `boundingBox` answers size/position; `connectedComponents` answers spatial-chunk count; `watertight` answers per-geometry-unit closed-manifold; measurement checks answer physical scalar/center properties; BRep feature checks require exact feature evidence. Adding a new check requires demonstrating, in writing in the proposal, that no existing check (with reasonable parameter tuning) can answer the new question.
2. **Closed-manifold evidence does not prove a Boolean fuse.** Assert `watertight` per geometry unit (e.g. `lib/<part>.ts`) to test surface closure, not a single material-connected solid or successful Boolean welding. Multiple disjoint solids and separated nested boundaries can be closed. `connectedComponents` retains its spatial-material/contact proposition; an AABB cluster count is not sufficient proof either. Retain a failing regression and an explicit unsupported qualification when the required connectivity evidence is unavailable; never substitute surface closure or weaken the proposition.
3. **Strict topology, not slicer acceptance.** A mesh is `watertight` only when every spatially welded mesh edge has exactly two incident triangles (`irregularEdges === 0`). `openBoundaryEdges` identify holes; `nonManifoldEdges` identify over-adjacent/coincident surfaces. Slicers may still repair or print non-manifold meshes, but that belongs in a separately named printable/slicer-tolerant check, not `watertight`.
4. **Geometry evidence only.** Mesh checks must operate purely on geometry files/bytes such as GLB/glTF. No kernel `extras`, no per-kernel metadata propagation, no scene-level cooperation. BRep/topology checks must consume explicit BRep/STEP evidence and return typed unsupported diagnostics when that evidence is unavailable. Future kernels emit valid geometry evidence and the checks work; if a check needs more than the evidence tells it, redesign the algorithm (see [`mesh-continuity-test-semantics.md`](../research/mesh-continuity-test-semantics.md) for the AABB-clustering rewrite of `connectedComponents`).
5. **AABB is broad-phase only for relationships.** Axis-aligned bounding boxes may prune candidates, assert explicit envelopes, and enrich diagnostics, but they must not decide production contact, clearance, containment, mate, shaft/bore, fastener, port, or manufacturability relationships. Return an unsupported-evidence diagnostic when relationship-grade evidence is unavailable.
6. **Adversarial false-positive fixtures are mandatory.** Every new geometric matcher must include a fixture where the tempting broad-phase or approximate shortcut would pass while the real relationship fails, such as overlapping AABBs with separated mating faces or aligned envelopes with misaligned analytic axes. Relationship matcher tests must assert the diagnostic evidence type, not only pass/fail status.
7. **Keep kernel-author assertions out of production packages.** Raw mesh-count / vertex-count assertions remain available to kernel authors via `expectMeshCount` / `expectVertexCount` in `@taucad/runtime-testing` alongside runtime harnesses and mocks. Production packages expose no testing subpath. The kernel-author and agent-facing surfaces intentionally do not share a vocabulary; do not mirror low-level helpers into the agent surface.

## 13. Cross-Layer Contract Changes

A change that crosses a public operation, plugin authoring contract, worker RPC, cache identity, generated artifact, or durable migration is not covered by one unit-test layer. Its plan must name and run the applicable gates:

- runtime unit tests for normalization, capability composition, route selection, participant identity, and failure behavior;
- `.test-d.ts` positive and negative tests for exact public inference;
- first-party provider/kernel conformance tests for every migrated implementation;
- integration tests across middleware/transcoder routes and cache hits/misses;
- failure-injection and restart tests for durable or cross-store migrations;
- deterministic generator checks for checked-in artifacts;
- browser/renderer tests when the result depends on workers, WebGPU, codecs, or pixels.

Omitting a layer requires an explicit reason tied to the change's observable boundary. `bytes.length > 0` is insufficient when semantic, round-trip, byte-equality, or pixel evidence is available.

## 14. Re-Home Provider Coverage Before Deleting Its Owner

Replacing an execution plane, provider adapter, or transport deletes the tests that lived there. Before that deletion lands, inventory the checks that protect opaque provider replay metadata — signatures, continuation tokens, cache handles, any value the provider requires back byte-exactly — and name their successor in the new plane. A generic codec that compiles against the new plane does not prove it carries a provider-specific field the old adapter handled deliberately.

Credentialed provider coverage and deterministic simulated coverage are separate claims. Completion evidence states which one it has. A simulated fixture proves the field survives Tau's own boundaries; only a credentialed run against the provider proves the provider accepts the replay.

## 15. Preserve Meaningful Regression Evidence

For a non-trivial behavior fix, establish the smallest failing semantic check before its correction. Preserve applicable existing regression tests; remove tests only when their behavior is deliberately retired, not to hide a failure. Tests for a non-shipping feature are deleted or completed with that feature rather than permanently skipped. A reversible prose-only change does not need a new test.

Never skip, disable or delete a test, or remove its assertions, to get green. A failing gating test stops gating only through a § 16.3 quarantine entry, and a quarantined test still runs and reports.

Run the affected project typecheck for TypeScript changes. Verify changed UI behavior visually and changed runtime behavior through execution before claiming success; report unavailable checks as unverified. For an exact cross-pipeline byte contract, make the parity regression fail before changing the pipeline. Converter round trips compare the re-imported geometry to the declared reference model and investigate deviations instead of accepting format-specific drift.

Streaming tests assert provider-neutral state and lifecycle outcomes. Do not lock shared tests to one provider's usage counts or incidental preamble ordering. Public typing changes need positive consumer fixtures and negative `@ts-expect-error` cases whose unexpected acceptance fails the typecheck. Upstream regression tests use parsed/structural assertions instead of regexes over source text.

Byte-locked file snapshots stay formatter-exempt. A serializer is appropriate only if its representation remains stable at the configured formatter width. Geometry export checks verify the declared exact-byte contract or export/re-import/re-mesh semantics; non-empty output alone does not establish correctness.

Run coverage explicitly when validating coverage thresholds. A normal passing test target does not exercise them. Investigate denominator exclusions or generated-code distortion before changing a threshold, and keep dated measurements in evidence rather than permanent policy.

## 16. Root-Cause CI Failures Before Re-Running

A CI or merge-queue failure in a project the change affects, including a crash with no failing assertion, is never re-queued or re-run to green by hand. Root-cause it, fix it in that PR or a prerequisite PR, and show the before/after evidence. Re-queue only a failure in a project the diff does not affect, with evidence that it also fails without the change. The only retry is the recorded one of § 16.2; nothing else re-runs a test, a task, a job or a queue entry.

The thresholds below are the operator's bounds decision (O3 in the [CI flake quarantine blueprint](../research/ci-flake-quarantine-blueprint.md#decisions-for-the-operator)); the evidence behind them is that blueprint's [quarantine thresholds from history](../research/ci-flake-quarantine-blueprint.md#quarantine-thresholds-from-history-2026-11-25). The shared reporter (`@taucad/vitest-ci`) enforces § 16.2, with the run budget in the `Run affected tasks` gate. Until it and `validate-quarantine` enforce § 16.3–16.4, no test is quarantined.

### 16.1 Definition of Green

A task is green when every gating test passed, at most on its second attempt; every second-attempt pass is recorded; and every failing test that does not gate is named in a valid `quarantine.json` entry on the tested commit. A test that fails every attempt on one task hash is a failure whatever its history, so a retry never turns a deterministic regression green. The merge queue stays `ALLGREEN`: each entry's own merge commit must be green. A missing or unreadable outcome file, an entry that matches no test, or an expired entry fails the task or the validator; none counts as a pass.

### 16.2 Recorded Retry

| Rule                       | Requirement                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| One attempt more           | CI gives every Vitest test one in-process retry, set by the shared helper; no suite sets a higher count                         |
| Recorded                   | A retried pass is written to the outcome record, the job summary and a warning annotation, and counts as a flake event          |
| Own changes earn no credit | A test in a file the entry's diff changes, or a new test, gets no retry credit: its retried pass fails the task                 |
| Budget                     | More than three retried passes in a task fail it; more than five in a run fail it                                               |
| Under verification         | A test whose fix is being verified (§ 16.5) has no retry                                                                        |
| Infrastructure steps       | Non-test steps (apt, downloads, browser install) retry up to three times with backoff, each retry recorded as a job-level event |
| No other retry             | No task-level or job-level automatic re-run, no automatic re-queue, and no manual re-queue of an affected project               |

A retried pass is debt, not a home: a test that keeps needing it is quarantined and fixed (§ 16.3). Changed and new test files run ten times with shuffled order on the pull request, capped at 5 minutes, and a failure there fails the pull request and is fixed under § 16.7. Do not knowingly land a new or changed test that flakes.

### 16.3 Quarantine

A flake is a pass and a failure of one test on the same inputs (one Nx task hash, or a retry inside one execution). A test whose flake events meet the blueprint's entry rule (D3: two in its last 80 executions, or three in 230) is quarantined:

- **Where.** One `quarantine.json` at the root of the project that owns the test, on `main`. Quarantine state never lives in a repository variable, an issue label or an outside service.
- **Scope.** One test identity, optionally narrowed to a variant (browser, OS, target). Never a file, a suite or a project.
- **Entry.** Each entry names the test, owner, issue, class, quarantine date, expiry date and evidence. The ledger job opens the entry's pull request; it lands through the merge queue without a human when `validate-quarantine` passes. Until it lands, § 16.2 carries the test.
- **Effect.** The quarantined test runs in the same job as before; its failure is printed, annotated and recorded. Only the task's verdict ignores it.
- **Who edits it.** Only the ledger job adds, releases or expires entries; a fix never touches them (§ 16.5).
- **Retraction.** A flake event recorded in error (a reporter defect, not a flake) is removed only by a `retractions` entry in `scripts/src/flake-ledger.json` naming the test, the event kinds, a cut-off time, the reason and the issue; the next ingestion drops it and notes the retraction in the ledger state. Nobody edits the `flake-ledger` branch by hand.

| Bound                    | Value                                                       | When reached                                                         |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Entries in the workspace | 20                                                          | No new quarantine; the flake keeps gating behind the retry           |
| Entries per project      | 8                                                           | The same, for that project                                           |
| Age                      | 14 days                                                     | The entry is removed, the test gates again and the operator is paged |
| Renewal                  | Once, by the operator, to 28 days in all                    | A further renewal fails validation                                   |
| Return after release     | A return within 30 days of release counts as the same entry | Goes to the operator, not the agent                                  |

### 16.4 Never-Quarantine Set

Tests for money, data integrity, security boundaries and the formal models are never quarantined and always gate. `validate-quarantine` rejects an entry for them. A flake there pages the operator and starts an agent at once.

### 16.5 Fixing and Releasing a Flake

An agent reproduces, classifies and fixes the flake through the normal merge queue. The fix states its mechanism, the reproducing mode with its failure count before the fix, and at least 100 straight passes after it.

| Fix                                                                                                               | Landing                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Test-only, reproduced, with the stress proof and a green `validate-flake-fix`                                     | Auto-merges through the queue   |
| Touches product code, widens a tolerance (including a raised timeout) or loosens a matcher, or was not reproduced | Waits for the operator's review |

A flake fix never skips or disables a test (`skip`, `todo`, `fails`, a false `runIf`), deletes a test or assertions, raises `retry` or any other retry count, pins test order (§ 16.7), adds a fixed sleep instead of awaiting the condition, or edits `quarantine.json`, the ledger, the reporter, the validators or a workflow. `validate-flake-fix` rejects each of these but the pin, which lint rejects in test options and in config. A fix may raise a test or hook timeout only when its pull request states the measured p99 that justifies the new value on a `Timeout-budget:` line; such a fix is classed tolerance, never auto-merges and needs the operator's review.

Release is mechanical, by the ledger job: 100 consecutive executions without a failure after a linked fix lands, over at least two days, or 300 without a fix. A failure during verification returns the test to quarantine.

### 16.6 Shadow Rows

A shadow row is an end-to-end suite on probation for the merge-queue gate. It runs and reports, but none of its tests gate. Probation and quarantine are one mechanism. Both run and report, and both leave on 100 straight passes. The rulings are Q1 and global review ruling 8 in the [CI decomposition blueprint](../research/ci-decomposition-blueprint.md#resolved--no-clear-alternative), and D5 and FQ-13 in the [CI flake quarantine blueprint](../research/ci-flake-quarantine-blueprint.md).

| Rule               | Requirement                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where it is listed | In the `dependsOn` of the project's `test:e2e:shadow` target. A suite is in `test:e2e:shadow` or in `test:e2e:queue`, never both                                                                                                                                                                                                                                         |
| Where it runs      | One row per suite in the `e2e-shadow` lane of `ci.yml`. It runs in the merge queue, and on a push to `main` the queue did not prove, whenever its project (or its `metadata.lane`) is selected, and never on a pull request                                                                                                                                              |
| Never gates        | The required gate does not need the lane, `Fail fast` does not watch it, and `continue-on-error` keeps a failure out of the run's conclusion. Its retried passes do not count toward the run's § 16.2 budget                                                                                                                                                             |
| Counted            | The flake ledger counts each row's consecutive passing runs (`shadowRows` in `ledger.json`) from the same outcome rows as every test. Any failure of the row resets the count to 0, including a failure the entry under test caused, because that failure lands on `main` with the entry. A pass on the recorded retry counts as a pass and is reported beside the count |
| Never quarantined  | Flake events from a shadow row never count toward the § 16.3 entry rule, so a shadow row is never quarantined                                                                                                                                                                                                                                                            |
| Promotion          | At 100 consecutive passing runs, `shadow-row-promotion.yml` opens a pull request that moves the suite to `test:e2e:queue`. The pull request is never auto-merged, because promotion changes the gate                                                                                                                                                                     |
| Red tests          | A red test is never skipped, disabled or quarantined to keep its row green. Its file is held out of the row, keeps running where it ran before, and gets an owner issue. The target's `metadata.description` names every held-out file with that issue                                                                                                                   |

The held-out files now:

| Project                                 | Held out                                                      | Owner issues |
| --------------------------------------- | ------------------------------------------------------------- | ------------ |
| `desktop-e2e`                           | desktop-adaptive-mode                                         | #2891        |
| `desktop-e2e`                           | desktop-onboarding-offline, two-client                        | #2285        |
| `desktop-e2e`                           | desktop-share-link-copy, sync-refusals, desktop-print-dry-run | #2754        |
| `ui-e2e` (`test:e2e:browser-host-chat`) | chat-isolated-workspace                                       | #2283        |
| `ui-e2e` (`test:e2e:browser-host-chat`) | browser-agent-host                                            | #2890, #2297 |

A held-out file joins its row when its issue closes. The project's `metadata.description` is the source of truth, and this table follows it.

### 16.7 Order Independence

Make every test pass alone and in any order. Never let a test depend on state another test created, changed or left behind.

**Why**: An order dependence is a failure waiting for a different order; burn-in shuffles changed files (§ 16.2) to find it on the pull request, not on `main` later.

**Enforced by**: `tau-lint/no-pinned-test-order` (flags `shuffle: false` in Vitest test and suite options, and `sequence.shuffle: false` or `sequence.shuffle.tests: false` in Vitest config)

- **Shared fixtures are read-only.** Treat what `beforeAll` builds as read-only. Create whatever a test mutates (stores, refs, tags, remotes, files, module state, globals, timers) per test, in `beforeEach` or as a per-test copy of a template built once. Otherwise write only under names the test owns, and assert on those names or relative to the state the test found.
- **Never pin order.** `{ shuffle: false }` on `describe`, `it` or `test`, `sequence.shuffle: false` or `sequence.shuffle: { tests: false }` in a config, or a raised retry count never fixes an order dependence; each only switches off the check that reports it.
- **Fix it before merge.** Fix a shuffled burn-in failure at the fixture, in that pull request or a linked one, before merge. This includes a failure that predates the pull request and that its change only exposed.

Motivating case: `packages/revisions/src/revision-port.conformance.test.ts` built one store per adapter in `beforeAll` (the transport suite, one git http-backend remote), and its tests read and moved that store's tags, refs and checkouts. "The first version after Start is V2" held only because earlier tests ran first and cleaned up. Shuffled with no retry, 17 tests failed, on `main` too; nobody saw it until taucad/tau#2909 touched the file and burn-in selected it. The suites were then pinned with `{ shuffle: false }` to unblock that pull request, which hid the dependence. taucad/tau#2523 fixed the fixtures as below and the pins were removed.

CORRECT:

```typescript
// Reads store-wide state (every tag): runs on a store of its own
it('should list only the version it tagged', async () => {
  await onItsOwnStore(async ({ port, child }) => {
    const created = await port.tag({ name: 'Ready for print', revisionId: child });
    expect(await port.listTags()).toStrictEqual([created]);
  });
});

// Shares the beforeAll store: writes a name of its own, asserts on that name
it('should list a version it tagged', async () => {
  const created = await port.tag({ name: 'Lid of this row', revisionId: child });
  expect(await port.listTags()).toContainEqual(created);
});

// Every test mutates the remote: one per test
beforeEach(async () => {
  fixture = await startGitHttpBackend({ root });
});
```

INCORRECT:

```typescript
// Pinned so that earlier tests have tagged and cleaned up the shared store
describe('RevisionPort conformance', { shuffle: false }, () => {
  it('should number the first version after Start 2', async () => {
    const created = await port.tag({ name: 'Ready for print', revisionId: child });
    expect(created.number).toBe(2); // 3 when another test tagged first
  });
});
```

## Summary Checklist

Before merging a test:

- [ ] Every `it` block has at least one meaningful assertion on observable behavior
- [ ] Error tests assert message and/or error type
- [ ] Resources are cleaned up in `afterEach` or `finally`
- [ ] Fake timers are restored in `finally`
- [ ] No `console.log` statements
- [ ] Mock objects use `mock<T>()` from `vitest-mock-extended`, not `as unknown as`
- [ ] Mock factories are shared, not duplicated per test file
- [ ] Test names follow `should <verb> <outcome>` pattern
- [ ] Structured data assertions check shape, not just existence
- [ ] A flaky test is fixed at its cause, not skipped, slept on or given more retries, and any longer timeout carries a measured `Timeout-budget:`
- [ ] The test passes alone and in any order: a shared `beforeAll` fixture is read-only or written only under names the test owns, and no order is pinned (§ 16.7)
