---
title: 'Runtime Event-Driven API Blueprint v5 — Implementation Audit'
description: 'Methodical audit of every Finding, Recommendation, Phase, and Acceptance Gate in runtime-event-driven-api-blueprint-v5.md against the @taucad/runtime source tree; identifies partially or unimplemented items with evidence and prioritised remediation.'
status: superseded
created: '2026-04-22'
updated: '2026-05-08'
category: audit
related:
  - docs/research/runtime-event-driven-api-blueprint-v5.md
  - docs/policy/library-api-policy.md
  - docs/policy/jsdoc-policy.md
  - docs/architecture/runtime-topology.md
---

# Runtime Event-Driven API Blueprint v5 — Implementation Audit

Compares every Finding, Recommendation (R1–R41), migration phase, and acceptance gate (G.1–G.6) in [`runtime-event-driven-api-blueprint-v5.md`](runtime-event-driven-api-blueprint-v5.md) against the current `packages/runtime` source tree. Identifies items that landed only partially, with the wrong shape, or not at all.

> **Closeout note (`2026-04-22`)**: every Finding (1–11) and every Recommendation (R1–R13) below has been implemented. Status legend symbols throughout this document have been flipped to ✅ where the underlying gap was closed, with the closing source-tree evidence captured inline. The "Three structural gaps remain" framing in the original Executive Summary was true on the day the audit was written; that section has been rewritten below to reflect the closed state. The original gap inventory is preserved in the per-finding sections so the audit doubles as a historical record of what shipped.

## Executive Summary (closed state — `2026-04-22`)

The blueprint is **fully implemented**. The migration backbone — `openFile` / `updateParameters` / `setOptions` / `RenderOutcome` semantics, removal of the legacy `setFile` / `setParameters` / `setRenderTimeout` / `notifyFileChanged` / `cancelPendingRender` / `geometryPool` / `lastRequestedGeneration` / `incrementAbortGeneration` surface, the `audit-public-surface.mts` allowlist gate (now also enforcing sibling-export discipline on `index.ts`), the SAB-shrunk `signalSlot { abortGeneration, abortReason }` layout, the `'activeKernelChanged'` event rename, the `'fileResolutionFailed'` removal, and the `createWebSocketTransport` stub — all landed in the original wave.

The three structural gaps called out at audit time have been closed:

1. **Naming drift** — `RenderOutcome`, `NoRenderOutcomeError`, and `RuntimeTransport.onWorkerStateChange` are now the canonical names. The blueprint, [`library-api-policy.md`](../policy/library-api-policy.md), and [`runtime-topology.md`](../architecture/runtime-topology.md) all use them; the blueprint v5 doc carries an explicit canonical-name reconciliation table at the top of the document.
2. **`RuntimeReconnectError`** — implemented as a public, realm-safe error class with a typed `causeKind: 'fileSystem-mismatch' | 'port-mismatch' | 'filePoolBuffer-mismatch'` discriminator and an `isRuntimeReconnectError` guard. Calling `connect()` a second time with **identical** options is now an idempotent no-op; calling with **different** options rejects with `RuntimeReconnectError` carrying the precise mismatch cause.
3. **Acceptance Gate G.3 (transport encapsulation)** — `runtime-client.ts` and `runtime-worker-client.ts` no longer construct `SharedArrayBuffer` instances or read `Atomics`/`signalBuffer` directly. The `RuntimeTransport` abstraction owns all SAB lifecycle via `configureMemory` and `abortGeneration`; consumers of the public surface never see `SharedArrayBuffer` from a runtime API.

Smaller gaps closed in the same pass:

- Typed `cause` discriminators on `RuntimeConnectionError` and `RuntimeTerminatedError` (Finding 5)
- `'abort'` wire-command dispatcher case (Finding 4)
- `cooperative-abort.ts` `@internal` JSDoc on file header and three exports (Finding 8) — backed by an in-tree surface test
- `TelemetryEntry` typed payload alias (Finding 9)
- `signalBuffer` removed from transport return types and from `transport-conformance.test.ts` assertions (Finding 10)
- **NEW Finding 11** — string-matching error classification (`runtime-client.ts:769` substring check, `apps/ui/app/machines/await-fresh-render.ts` regex on XState's error message, Zoo SDK "Nothing to export" substring) replaced with stable `error.code` getters, an owned `Promise.race`-based timeout helper, and a dedicated `isZooEmptyExportError` wrapper. `KernelIssue` payloads now carry a `code: KernelIssueCode` field everywhere.

## Table of Contents

- [Methodology](#methodology)
- [Findings](#findings)
  - [Naming drift between blueprint and implementation](#finding-1-naming-drift-between-blueprint-and-implementation)
  - [Missing typed errors](#finding-2-missing-typed-errors)
  - [Transport encapsulation incomplete](#finding-3-transport-encapsulation-incomplete-g3)
  - [Wire-format `'abort'` command has no worker handler](#finding-4-wire-format-abort-command-has-no-worker-handler-r33)
  - [Untyped `cause` on lifecycle errors](#finding-5-untyped-cause-on-lifecycle-errors-r34-r36)
  - [`terminate()` semantics partially deterministic](#finding-6-terminate-semantics-partially-deterministic-r36)
  - [`RuntimeWorkerClient` re-exported as public](#finding-7-runtimeworkerclient-re-exported-as-public-g1)
  - [`cooperative-abort.ts` JSDoc missing `@internal`](#finding-8-cooperative-abortts-jsdoc-missing-internal-r32)
  - [Telemetry payload uses `PerformanceEntryData[]`, not `TelemetryEntry[]`](#finding-9-telemetry-payload-uses-performanceentrydata-not-telemetryentry-r40)
  - [`signalBuffer` still readable on transports in tests](#finding-10-signalbuffer-still-readable-on-transports-in-tests-g3)
  - [String-matching error classification](#finding-11-string-matching-error-classification-new)
- [Per-Recommendation Status Matrix](#per-recommendation-status-matrix)
- [Acceptance Gate Status](#acceptance-gate-status)
- [Recommendations](#recommendations)
- [Appendix A: Evidence Index](#appendix-a-evidence-index)

## Methodology

For each Finding (1–20), Recommendation (R1–R41), migration phase (Phase A, 0–6), and acceptance gate (G.1–G.6) in the blueprint, the audit cross-checks the listed touch points against the working tree:

- Public exports: `packages/runtime/src/index.ts`, `RuntimeClient` type literal in `packages/runtime/src/client/runtime-client.ts`, `RuntimeTransport` in `packages/runtime/src/transport/runtime-transport.ts`.
- Internal surface: `packages/runtime/src/framework/{kernel-worker.ts,runtime-worker-client.ts,runtime-worker-dispatcher.ts,cooperative-abort.ts}`, `packages/runtime/src/transport/{in-process-transport.ts,worker-transport.ts,websocket-transport.ts,transport-conformance.test.ts}`, `packages/runtime/src/types/runtime-protocol.types.ts`.
- Test coverage: `packages/runtime/src/client/runtime-client-{connect,terminate,open-file,export-auto-connect}.test.ts`, `packages/runtime/src/client/runtime-client-events.test-d.ts`, `packages/runtime/src/transport/transport-conformance.test.ts`.
- Audit script: `packages/runtime/scripts/audit-public-surface.mts`.

Status legend used throughout:

| Symbol | Meaning                                                                      |
| ------ | ---------------------------------------------------------------------------- |
| ✅     | Implemented as specified                                                     |
| ⚠      | Partially implemented or implemented with naming drift                       |
| ❌     | Not implemented                                                              |
| 🚫     | Out of scope for this audit (e.g. R20 worker-level naming decision deferred) |

## Findings

### Finding 1: Naming drift between blueprint and implementation

Three public types in the shipped surface use different names from the blueprint. The audit's preferred direction (see [Recommendations](#recommendations)) is to canonicalise on the more legible names — `RenderOutcome`, `NoRenderOutcomeError`, `onWorkerStateChange` — and update the blueprint to match.

| Blueprint name                        | Implementation name                    | Preferred name             | Location                            | Comment                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------- | -------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RenderSettlement`                    | `RenderOutcome`                        | **`RenderOutcome`**        | `runtime-client.ts:126`             | Used in 8 JSDoc/prose references in the blueprint (Findings 4, 5, 9, 10; R1, R2, R22, R24; trade-offs table). The implementation already chose `RenderOutcome` during the runtime-naming-audit work; it reads more naturally and parallels other discriminated-union return types.           |
| `NoActiveRenderContextError`          | `NoRenderOutcomeError`                 | **`NoRenderOutcomeError`** | `runtime-client.ts:140`             | R3, R23, Finding 5, and Appendix E specify `NoActiveRenderContextError`. The implementation name (renamed from the legacy `NoRenderResultError` during this audit work) is symmetrical with `RenderOutcome` ("there is no `RenderOutcome` to draw from yet") and is the preferred direction. |
| `RuntimeTransport.observeWorkerState` | `RuntimeTransport.onWorkerStateChange` | **`onWorkerStateChange`**  | `transport/runtime-transport.ts:82` | R30, Finding 15, and Acceptance Gate G.3 specify `observeWorkerState`. The implementation's `onWorkerStateChange` already matches the `client.on(...)` event-subscription convention used everywhere else on the public surface.                                                             |

**Severity**: Medium — pure naming, no behaviour gap.
**Recommendation**: Update the blueprint to the preferred names. The `NoRenderResultError` → `NoRenderOutcomeError` rename is already complete in code. See [Recommendations R1–R3](#recommendations).

### Finding 2: Missing typed errors

The blueprint specifies two typed errors that are not present in the source tree:

| Error class                  | Blueprint reference              | Search                                                             |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `RuntimeReconnectError`      | R34, Finding 18, Appendix E, G.2 | `rg "RuntimeReconnectError" packages/runtime/src` → 0 matches      |
| `NoActiveRenderContextError` | R3, R23, Finding 5, Appendix E   | `rg "NoActiveRenderContextError" packages/runtime/src` → 0 matches |

`NoActiveRenderContextError` is a [Finding 1](#finding-1-naming-drift-between-blueprint-and-implementation) rename gap that has been closed: the behaviour ships under `NoRenderOutcomeError` (renamed from the legacy `NoRenderResultError` during this audit work) and the audit treats that as the canonical name. `RuntimeReconnectError` is a real **semantic gap**: the blueprint promises a synchronous throw when `connect()` is called twice with different options; today's implementation silently treats the second call as a no-op (it short-circuits when `lifecycleState !== 'unconnected'`). This audit subsumes and replaces the prior single-issue research note that captured the same gap in isolation.

**Severity**: High (`RuntimeReconnectError` only — the naming concern is resolved).

### Finding 3: Transport encapsulation incomplete (G.3)

Acceptance Gate G.3 requires:

> `runtime-client.ts` and `runtime-worker-client.ts` contain no direct references to `SharedArrayBuffer`, `Atomics`, or `signalBuffer` — all such references live in `transport/in-process-transport.ts` / `transport/worker-transport.ts` only.

Current state (from `rg "SharedArrayBuffer|signalBuffer|Atomics" packages/runtime/src/{client,framework}` excluding test files):

| File                                 | Direct references                                                 | Notes                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client/runtime-client.ts`           | 9 hits across lines 322, 365, 371, 389, 396–397, 727, 814, 939    | `_geometryPoolBuffer = new SharedArrayBuffer(geometry.bytes)` (line 939) is the canonical violation: the runtime client allocates SAB itself instead of asking the transport for a pool.                           |
| `framework/runtime-worker-client.ts` | 7 hits across lines 29, 184, 188–190, 204–207, 222, 237, 242, 245 | `signalBuffer` getter (line 188), `Atomics.load(view, signalSlot.abortGeneration)` (line 245), and the `geometryPoolBuffer` / `filePoolBuffer` constructor option fields (lines 205–207) all leak the abstraction. |

The `RuntimeTransport` interface itself is shaped correctly (`onWorkerStateChange`, `signalAbort`, `resolveGeometry`, `describe`, `close` are present), but it is not yet load-bearing — the runtime client and worker-client still own SAB lifecycle directly. This is the biggest architectural delta against the blueprint.

**Severity**: High — blocks G.3 and the `createWebSocketTransport` parity story (Finding 20 in the blueprint).

### Finding 4: Wire-format `'abort'` command has no worker handler (R33)

R33 specifies a wire-format `{ type: 'abort', requestId, reason }` command for transports without SAB. The protocol type union has the discriminator (`packages/runtime/src/types/runtime-protocol.types.ts:131`) but the worker dispatcher has no `case 'abort':` branch.

```
$ rg "case 'abort':" packages/runtime/src
(no results)
```

`runtime-worker-dispatcher.ts:129` `switch (message.type)` covers `initialize`, `render`, `openFile`, `updateParameters`, `setOptions`, `fileChanged`, `configureMiddleware`, `export`, `cleanup`. The `'abort'` arm is missing, so non-SAB transports cannot abort renders — `createWebSocketTransport.signalAbort` correctly throws `'not implemented'`, hiding this gap, but the future remote runtime worker will need the handler before becoming functional.

**Severity**: Medium — only matters once a non-SAB transport ships.

### Finding 5: Untyped `cause` on lifecycle errors (R34, R36)

The blueprint specifies typed discriminated `cause` properties on the two new lifecycle errors:

| Error                    | Blueprint `cause` union                                                                         | Implementation                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `RuntimeConnectionError` | `'transport-construction' \| 'capabilities-resolution' \| 'kernel-binding' \| 'port-handshake'` | `cause: unknown` (`runtime-client.ts:214`)               |
| `RuntimeTerminatedError` | `'explicit' \| 'connection-failed' \| 'transport-closed'`                                       | No `cause` property at all (`runtime-client.ts:251–263`) |

`RuntimeConnectionError` accepts `cause` in its constructor but stores it as `unknown`. Consumers cannot pattern-match on `error.cause === 'port-handshake'` as the blueprint's connect-error-recovery code example (lines 1063–1078) suggests.

**Severity**: Medium — degrades the typed-error DX promise.

### Finding 6: `terminate()` semantics partially deterministic (R36)

R36 / Finding 19 / G.2 define seven invariants for `terminate()`. Status:

| Invariant                                                              | Status | Evidence                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-flight `openFile`/`updateParameters`/`setOptions` Promise rejection | ⚠      | `runtime-client.ts:1319–1322` rejects `pendingRender` synchronously, not "on the next microtask"                                                                                                                  |
| In-flight `connect()` Promise rejection                                | ❌     | `terminate()` does not interact with an in-flight `connect()` deferred — the connect flow simply settles whatever it was going to settle                                                                          |
| In-flight `export()` Promise rejection                                 | ❌     | `terminate()` does not track `export` Promises; they will hang or reject opportunistically when the worker disappears                                                                                             |
| Subscriptions auto-disposed                                            | ✅     | `runtime-client.ts:1332–1334` clears every handler set                                                                                                                                                            |
| Subsequent calls throw `RuntimeTerminatedError`                        | ⚠      | Command APIs go through `assertActive(...)` which throws; **`on(...)` does NOT throw** (`runtime-client.ts:1235–1252` adds the handler to the now-cleared set without checking `lifecycleState === 'terminated'`) |
| Idempotent re-termination                                              | ✅     | `runtime-client.ts:1311–1314` early-returns when already terminated                                                                                                                                               |
| Transport `.close()` invoked                                           | ⚠      | `workerClient?.terminate()` is called (line 1326), but the transport is not asked to `close()` — the worker-client owns transport lifecycle, which works in practice but is undocumented                          |

**Severity**: High for `connect()`/`export()` rejection (no test coverage either); Medium for the microtask-vs-synchronous nuance.

### Finding 7: `RuntimeWorkerClient` re-exported as public (G.1)

`packages/runtime/src/index.ts:63` does `export { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';`. The blueprint architecture (Finding 15, Appendix E) treats `RuntimeWorkerClient` as an **internal layer-3 component** that consumers should not see — the public surface is `RuntimeClient` only.

`audit-public-surface.mts` enforces the `RuntimeClient` member allowlist but does not flag sibling exports from the package barrel. G.1's "no symbols beyond this list are exported as part of the public package surface" is therefore unenforced.

**Severity**: Medium — DX-leaks an internal layer.

### Finding 8: `cooperative-abort.ts` JSDoc missing `@internal` (R32)

R32 explicitly requires `cooperative-abort.ts`, `signalSlot`, and `AbortReason` marked `@internal`. Status:

| Symbol                                                          | `@internal` | Notes                                                          |
| --------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| `signalSlot` (`runtime-protocol.types.ts:182`)                  | ✅          | Tag present                                                    |
| `abortReason` enum (`runtime-protocol.types.ts:192`)            | ✅          | Tag present                                                    |
| `cooperative-abort.ts` file header                              | ❌          | JSDoc has no `@internal` (lines 1–15)                          |
| Exported `setAbortContext` / `clearAbortContext` / `checkAbort` | ❌          | None of the three exports carry `@internal` (lines 30, 36, 46) |

The file is not re-exported from `packages/runtime/src/index.ts`, so the practical public-surface impact is zero — but `pnpm nx lint runtime` does not enforce the missing tags via the existing `tau-lint(require-public-export-jsdoc)` rule, and a future barrel-edit could leak the symbols silently.

**Severity**: Low — defensive hygiene.

### Finding 9: Telemetry payload uses `PerformanceEntryData[]`, not `TelemetryEntry[]` (R40)

R40 / G.4 specify that the `'telemetry'` event payload type is `TelemetryEntry[]` (with fields `timestamp, name, attributes, durationMs?`). The implementation keeps the existing `PerformanceEntryData[]` payload (`runtime-client.ts:402`, `runtime-worker-client.ts:115`).

Functionally the events fire correctly (Appendix F.8 in the blueprint confirms four production subscribers) — the gap is the missing typed alias. Consumers cannot import a `TelemetryEntry` type, and the telemetry test has nothing to assert against the blueprint's normalised shape.

**Severity**: Low — naming and a missing exported type alias.

### Finding 10: `signalBuffer` still readable on transports in tests (G.3)

`packages/runtime/src/transport/transport-conformance.test.ts` accesses `transport.signalBuffer` directly (lines 60, 63, 64, 88, 91, 156). G.3 requires the transport to expose only `send`, `onMessage`, `onWorkerStateChange` (or `observeWorkerState`), `signalAbort`, `resolveGeometry`, `describe`, `close` — `signalBuffer` is not on the contract.

The test only compiles because `createInProcessTransport` and `createWorkerTransport` add `signalBuffer` to their concrete return types as test-only escape hatches. The conformance-test suite is therefore validating a _broader_ surface than the public interface.

**Severity**: Low — test plumbing only, but it weakens the conformance promise.

### Finding 11: String-matching error classification (NEW)

Added during implementation of [Recommendation R7](#recommendations) (typed `cause` on lifecycle errors). Three production code paths classified errors by substring-matching `Error.message` rather than by a stable contract — a textbook DX-promise smoking gun, since `Error.message` is human prose and may legitimately change with a runtime/library upgrade.

| File                                            | Line(s) at audit time | Anti-pattern                                                                                                  | Why it was wrong                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/client/runtime-client.ts` | 769                   | `if (issue.message.includes('Render timed out'))` to detect render timeout from a `KernelIssue`               | `KernelIssue` had no typed `code` field, forcing the client to scrape the kernel's prose. Locale changes, kernel upgrades, or message rewording would silently break the branch                                                                                  |
| `apps/ui/app/machines/await-fresh-render.ts`    | 70-ish                | `if (error instanceof Error && /timeout/i.test(error.message))` to detect XState's `waitFor` timeout          | The helper depended on XState's _internal_ error message format, which is library-version-coupled. Two CI green builds across an XState minor bump could easily diverge                                                                                          |
| `packages/runtime/src/kernels/zoo/kcl-utils.ts` | inline                | `errorMessage.includes('Nothing to export') \|\| errorMessage.includes('internal_engine: Nothing to export')` | Substring against an upstream Zoo SDK message. The Zoo SDK does not (yet) expose typed errors, so the substring is unavoidable — but burying it in a call site means we cannot find or update all the substring sites when the SDK eventually ships typed errors |

The closing changes:

- `KernelIssue` gained a required `code: KernelIssueCode` field. Every kernel emitter, helper (`createKernelError`, `kernel-module-helpers.ts`), middleware, and bundler-failure path was updated to set the appropriate code (`'BUNDLER_FAILED'`, `'RUNTIME'`, `'RENDER_TIMEOUT'`, etc.). `runtime-client.ts:769` now branches on `issue.code === 'RENDER_TIMEOUT'`. Test fixtures across `jscad`, `zoo`, `kernel-module-helpers`, and `replicad` were updated to assert the new field.
- Every public lifecycle/render error class gained a stable `code` getter (`'RUNTIME_NOT_CONNECTED'`, `'RUNTIME_CONNECTION'`, `'RUNTIME_RECONNECT'`, `'RUNTIME_TERMINATED'`, `'RENDER_TIMEOUT'`, `'RENDER_ABORTED'`, `'NO_RENDER_OUTCOME'`). Two new transport errors (`SharedPoolEntryNotFoundError`, `TransportCapabilityError`) shipped with `'SHARED_POOL_ENTRY_NOT_FOUND'` / `'TRANSPORT_CAPABILITY'` codes and matching realm-safe `is*` guards. The full table is documented in [`apps/ui/content/docs/(runtime)/api/client.mdx`](../../apps/ui/content/docs/%28runtime%29/api/client.mdx#error-code-reference) and [`apps/ui/content/docs/(runtime)/guides/error-handling.mdx`](../../apps/ui/content/docs/%28runtime%29/guides/error-handling.mdx).
- `await-fresh-render.ts` no longer relies on XState's prose. It owns its own `Promise.race` against a `setTimeout`-driven local timer; XState's `waitFor` runs with a generous `innerTimeoutSlop` so the local timer always wins. A regression test asserts `error.code === 'RENDER_TIMEOUT'` on the thrown `AwaitFreshRenderTimeoutError` directly, with a comment explicitly forbidding reintroduction of the regex check.
- The Zoo SDK substring is now isolated behind `packages/runtime/src/kernels/zoo/zoo-error-detection.ts` — a single helper `isZooEmptyExportError(error)` with a JSDoc explaining why the substring approach is unavoidable today and pointing the next maintainer at the upstream SDK as the place to fix it. When Zoo ships typed errors, we replace one helper, not nine call sites.

**Severity at discovery**: High — the `runtime-client.ts:769` line was actively producing wrong-classification incidents whenever a kernel emitted an error containing the word "timed out" but unrelated to a render timeout.

**Status**: ✅ Closed.

## Per-Recommendation Status Matrix

| #   | Recommendation (abbreviated)                                                                                                                               | Status | Evidence                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `openFile(input): Promise<RenderSettlement>`                                                                                                               | ✅     | Implemented as `RenderOutcome` — preferred name (Finding 1). `runtime-client.ts:577`                                                                                                               |
| R2  | `updateParameters(parameters): Promise<RenderSettlement>`                                                                                                  | ✅     | Implemented as `RenderOutcome` — preferred name. `runtime-client.ts:1197`                                                                                                                          |
| R3  | `export(format)` / `export(format, options)` overloads, document `NoActiveRenderContextError`                                                              | ✅     | Overloads present; error class shipped as `NoRenderOutcomeError` (preferred name, renamed from the legacy `NoRenderResultError`). Blueprint cross-ref text closes when updated per R1              |
| R4  | Remove `render(input)` from public surface                                                                                                                 | ✅     | Removed. `audit-public-surface.mts:50` lists `render` as forbidden                                                                                                                                 |
| R5  | One-line comment on opportunistic `nativeHandle` cache                                                                                                     | ✅     | Cache comment present at `runtime-client.ts:1114–1116` (export path); equivalent guidance now lives near the kernel-side cache too                                                                 |
| R6  | Migrate `useRender` to event subscription                                                                                                                  | ✅     | Verified in prior runtime-naming-audit implementation                                                                                                                                              |
| R7  | Migrate `cad.machine.ts` to `openFile`/`updateParameters` + intent-ID tracking                                                                             | ✅     | `lastRequestedRenderId` / `lastSettledRenderId` present                                                                                                                                            |
| R8  | `awaitFreshRender` helper                                                                                                                                  | ✅     | `apps/ui/app/machines/await-fresh-render.ts`                                                                                                                                                       |
| R9  | Migrate RPC handlers via `awaitFreshRender` (NOT `client.export`)                                                                                          | ✅     | `apps/ui/app/hooks/rpc-handlers.ts` consumes `awaitFreshRender`                                                                                                                                    |
| R10 | API benchmark consumer to `client.export('glb', ...)`                                                                                                      | ✅     | `apps/api/app/benchmarks/model-benchmark-geometry.ts`                                                                                                                                              |
| R11 | Analysis test rename                                                                                                                                       | ✅     | `apps/api/app/api/analysis/geometry-analysis.service.test.ts`                                                                                                                                      |
| R12 | Testing-package one-line renames                                                                                                                           | ✅     | `packages/testing/src/geometry/*.test.ts`                                                                                                                                                          |
| R13 | `kernel-geometry-testing.utils.ts` migration                                                                                                               | ✅     | `extractGltfFromExportResult` exists                                                                                                                                                               |
| R14 | Runtime benchmark runner migration                                                                                                                         | ✅     | `packages/runtime/src/benchmarks/benchmark-runner.ts`                                                                                                                                              |
| R15 | Verify AR conversion + Quick Export already on `client.export`                                                                                             | ✅     | No source changes required                                                                                                                                                                         |
| R16 | Transport-level test migration                                                                                                                             | ✅     | `packages/runtime/src/transport/in-process-transport.test.ts`                                                                                                                                      |
| R17 | `runtime-client.test.ts` 25-call migration                                                                                                                 | ✅     | All `client.render` calls replaced                                                                                                                                                                 |
| R18 | `runtime-worker-client.test.ts` 7-call migration                                                                                                           | ✅     | Idem                                                                                                                                                                                               |
| R19 | Type-level test rewrites                                                                                                                                   | ✅     | `define-plugin.test-d.ts`, `render-input.test-d.ts` updated                                                                                                                                        |
| R20 | Worker-level surface naming decision                                                                                                                       | 🚫     | Deferred; `worker.render(...)` retained as the internal API                                                                                                                                        |
| R21 | `runtime-topology.md` protocol table update                                                                                                                | ✅     | Includes `openFile`/`updateParameters`/`export`; no always-warm-handle invariant                                                                                                                   |
| R22 | `library-api-policy.md` example for supersession                                                                                                           | ✅     | Policy uses `RenderOutcome` — preferred name; blueprint cross-ref text closes when updated per R1                                                                                                  |
| R23 | Test asserting `export('glb')` (no options) on fresh client throws `NoActiveRenderContextError`                                                            | ✅     | Covered by `runtime-client-export-no-settled-render.test.ts` asserting `NoRenderOutcomeError` (preferred name)                                                                                     |
| R24 | Supersession Promise resolves with `{ superseded: true }`                                                                                                  | ✅     | Covered in `runtime-client-open-file.test.ts`                                                                                                                                                      |
| R25 | `cad.machine` test for intent-ID tracking                                                                                                                  | ✅     | Present in machine tests                                                                                                                                                                           |
| R26 | `await-fresh-render.test.ts` suite                                                                                                                         | ✅     | Implemented                                                                                                                                                                                        |
| R27 | Re-write `rpc-handlers.test.ts`                                                                                                                            | ✅     | Implemented                                                                                                                                                                                        |
| R28 | `@taucad/runtime` JSDoc / README leads with autonomous + imperative stories                                                                                | ✅     | README updated; "no ceremony" prose removed                                                                                                                                                        |
| R29 | `useRender` JSDoc + `@example` rewrite                                                                                                                     | ✅     | Implemented                                                                                                                                                                                        |
| R30 | Behaviour-complete `RuntimeTransport` (`onWorkerStateChange`, `signalAbort`, `resolveGeometry`, `describe`, `close`, `configureMemory`, `abortGeneration`) | ✅     | All methods present; SAB lifecycle moved into the transport (Finding 3 closed)                                                                                                                     |
| R31 | Single ordered `postMessage` channel                                                                                                                       | ✅     | All worker→main events flow through `RuntimeWorkerClient`'s message handler                                                                                                                        |
| R32 | Shrink SAB to `signalSlot { abortGeneration, abortReason }`; mark internal                                                                                 | ✅     | Layout shrunk; `signalSlot`/`abortReason`/`cooperative-abort.ts` file header + three exports all carry `@internal` (Finding 8 closed)                                                              |
| R33 | Wire-format `{ type: 'abort', requestId, reason }` command                                                                                                 | ✅     | Dispatcher case in `runtime-worker-dispatcher.ts` + `worker.handleWireAbort` in `kernel-worker.ts` (Finding 4 closed)                                                                              |
| R34 | Keep `connect(options)`; add typed `RuntimeNotConnectedError` / `RuntimeConnectionError` / `RuntimeReconnectError`; `lifecycleState` getter                | ✅     | All four classes shipped; `RuntimeReconnectError` (Finding 2) ships with typed `causeKind`; `RuntimeConnectionError` ships with typed `cause` (Finding 5)                                          |
| R35 | `assertConnected()` guard at every command method; `runtime-client-connect.test.ts`                                                                        | ✅     | `assertActive(...)` guard implemented for every command; `runtime-client-connect.test.ts` covers idempotent-same-options, different-options-error, typed-cause, and terminate-during-connect cases |
| R36 | Deterministic `terminate()`; seven invariants; `terminate.test.ts`                                                                                         | ✅     | All seven invariants implemented (Finding 6 closed); `runtime-client-terminate.test.ts` locks each one                                                                                             |
| R37 | Pre-stub `createWebSocketTransport(url)` + conformance suite                                                                                               | ✅     | `transport/websocket-transport.ts` + `transport/transport-conformance.test.ts`                                                                                                                     |
| R38 | Rename event `'activeKernel'` → `'activeKernelChanged'`                                                                                                    | ✅     | `runtime-client.ts:408`, type-d test guards the legacy name                                                                                                                                        |
| R39 | Remove `'fileResolutionFailed'` event                                                                                                                      | ✅     | Type-d test guards the legacy name                                                                                                                                                                 |
| R40 | Keep `'telemetry'` with typed `TelemetryEntry` payload                                                                                                     | ✅     | `TelemetryEntry` alias shipped; event payload typed end-to-end (Finding 9 closed)                                                                                                                  |
| R41 | Phase 5 deletion list (paired with R4)                                                                                                                     | ✅     | All nine forbidden symbols gone; audit script enforces                                                                                                                                             |

## Acceptance Gate Status

| Gate | Item                                                                                                                                                                                      | Status | Evidence                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G.1  | `RuntimeClient` exports exactly the eight methods + three getters                                                                                                                         | ✅     | `audit-public-surface.mts` allowlist matches. `pnpm tsx packages/runtime/scripts/audit-public-surface.mts` passes                                                                                                                             |
| G.1  | No `@deprecated` on removed surface                                                                                                                                                       | ✅     | All deletions are hard removals                                                                                                                                                                                                               |
| G.1  | Audit script in `packages/runtime/scripts/audit-public-surface.ts`                                                                                                                        | ✅     | Implemented as `.mts` (TS-go's preferred ESM extension); the deviation from the blueprint's `.ts` suffix is intentional and now codified in the script header                                                                                 |
| G.1  | Every public method has `@public` JSDoc + `@example`                                                                                                                                      | ✅     | Verified during the JSDoc sweep                                                                                                                                                                                                               |
| G.1  | "No symbols beyond this list are exported as part of the public package surface"                                                                                                          | ✅     | `RuntimeWorkerClient` removed from `packages/runtime/src/index.ts` (Finding 7 closed); `audit-public-surface.mts` now enumerates sibling exports against an allowlist + forbidden list (R10), wired as `pnpm nx audit-public-surface runtime` |
| G.2  | `runtime-client-connect.test.ts` covers all transitions, idempotent connect, `RuntimeReconnectError` on different options, typed-cause `RuntimeConnectionError`, terminate-during-connect | ✅     | All cases covered, including the dedicated reconnect-error suite                                                                                                                                                                              |
| G.2  | `terminate.test.ts` covers all seven invariants                                                                                                                                           | ✅     | All seven invariants asserted in `runtime-client-terminate.test.ts`                                                                                                                                                                           |
| G.2  | No production code calls a removed method                                                                                                                                                 | ✅     | `pnpm rg "client\.(setFile\|setParameters\|...)"` returns zero outside historical docs                                                                                                                                                        |
| G.3  | `RuntimeTransport` exports behaviour-complete API                                                                                                                                         | ✅     | All methods present including `configureMemory`/`abortGeneration` for SAB ownership                                                                                                                                                           |
| G.3  | `runtime-client.ts` and `runtime-worker-client.ts` contain no direct SAB / Atomics / signalBuffer references                                                                              | ✅     | All 16 prior references removed; SAB lifecycle is owned by the transport (Finding 3 closed). `pnpm rg "SharedArrayBuffer\|signalBuffer\|Atomics" packages/runtime/src/{client,framework}` returns only typed-comment references               |
| G.3  | `createWebSocketTransport` stub + `transport.describe().sharedMemory === false`                                                                                                           | ✅     | `websocket-transport.ts:31`, conformance test asserts                                                                                                                                                                                         |
| G.3  | All worker→main events flow through one ordered `postMessage` channel                                                                                                                     | ✅     | Verified — no SAB-monitor duplicates in dispatcher                                                                                                                                                                                            |
| G.4  | No `'activeKernel'` event subscription remains                                                                                                                                            | ✅     | Type-d guard + zero source hits                                                                                                                                                                                                               |
| G.4  | Zero-hit grep for `handlers.activeKernel` in `packages/runtime/`                                                                                                                          | ✅     | Pass                                                                                                                                                                                                                                          |
| G.4  | No `'fileResolutionFailed'` subscription or emit                                                                                                                                          | ✅     | Pass                                                                                                                                                                                                                                          |
| G.4  | `'telemetry'` typed as `TelemetryEntry[]`                                                                                                                                                 | ✅     | `TelemetryEntry` alias exported and threaded through `runtime-client.ts` + `runtime-worker-client.ts` (Finding 9 closed)                                                                                                                      |
| G.4  | Subscribing to a removed event is a TypeScript compile error                                                                                                                              | ✅     | `runtime-client-events.test-d.ts:30–37`                                                                                                                                                                                                       |
| G.5  | Every Appendix F row ✓                                                                                                                                                                    | ✅     | F.1–F.10 verified during prior plan executions                                                                                                                                                                                                |
| G.5  | `pnpm nx test/typecheck/lint runtime/ui/cli/chat` pass                                                                                                                                    | ✅     | Confirmed during prior plan validation                                                                                                                                                                                                        |
| G.5  | `kernel.integration.test.ts` deterministic edit-then-fetch                                                                                                                                | ✅     | Implemented                                                                                                                                                                                                                                   |
| G.5  | Manual COI / non-COI smoke check                                                                                                                                                          | 🚫     | Out of scope for source-tree audit                                                                                                                                                                                                            |
| G.6  | `runtime-topology.md` updated                                                                                                                                                             | ✅     | Reflects explicit `connect()` and four-state lifecycle                                                                                                                                                                                        |
| G.6  | `apps/ui/content/docs/(runtime)/...` updated                                                                                                                                              | ✅     | Construct → connect → command → events / Promise pattern                                                                                                                                                                                      |
| G.6  | `pnpm docs:validate` passes                                                                                                                                                               | ✅     | Two pre-existing warnings on unrelated files only                                                                                                                                                                                             |

## Recommendations

All recommendations below have been implemented. The status column reflects the final state; the original action prose is preserved as a historical record of the planned scope.

| #   | Action                                                                                                                                                                                                                           | Status | Closing evidence                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Canonicalise on `RenderOutcome` — update [`runtime-event-driven-api-blueprint-v5.md`](runtime-event-driven-api-blueprint-v5.md) and [`library-api-policy.md`](../policy/library-api-policy.md) to use `RenderOutcome` everywhere | ✅     | Blueprint v5 carries a top-of-doc canonical-name reconciliation table; policy and `runtime-topology.md` already used `RenderOutcome`                                                                  |
| R2  | Rename `NoRenderResultError` → `NoRenderOutcomeError`                                                                                                                                                                            | ✅     | Class, `name` literal, type guard `isNoRenderOutcomeError`, throw site, JSDoc cross-references, and the dedicated test all use the new name                                                           |
| R3  | Canonicalise on `onWorkerStateChange` — update the blueprint and `runtime-topology.md` to match the implementation                                                                                                               | ✅     | Captured in the blueprint's reconciliation table; topology and policy already consistent                                                                                                              |
| R4  | Implement `RuntimeReconnectError` — synchronous reject on second `connect()` with structurally different options; typed `causeKind`; dedicated test cases per G.2                                                                | ✅     | `RuntimeReconnectError` + `isRuntimeReconnectError` exported; `runtime-client.ts` `diffConnectOptions` enforces the contract; tests cover identical-options idempotence and all three mismatch causes |
| R5  | Move SAB allocation out of `runtime-client.ts` — transport owns SAB lifecycle                                                                                                                                                    | ✅     | `RuntimeTransport.configureMemory` / `abortGeneration` now own SAB; `runtime-client.ts` and `runtime-worker-client.ts` no longer construct `SharedArrayBuffer` (Finding 3 closed)                     |
| R6  | Add `'abort'` dispatcher case in `runtime-worker-dispatcher.ts`                                                                                                                                                                  | ✅     | `case 'abort':` plus `worker.handleWireAbort` shipped (Finding 4 closed)                                                                                                                              |
| R7  | Type the `cause` discriminators on `RuntimeConnectionError` and `RuntimeTerminatedError`                                                                                                                                         | ✅     | `RuntimeConnectionCause` / `RuntimeTerminatedCause` discriminated unions exported; construction sites updated (Finding 5 closed)                                                                      |
| R8  | Tighten `terminate()` — seven invariants                                                                                                                                                                                         | ✅     | All seven invariants asserted in `runtime-client-terminate.test.ts` (Finding 6 closed)                                                                                                                |
| R9  | Stop re-exporting `RuntimeWorkerClient` from `packages/runtime/src/index.ts`                                                                                                                                                     | ✅     | Removed; `index.surface.test.ts` regression sentinel + `audit-public-surface.mts` sibling-export check (Finding 7 closed)                                                                             |
| R10 | Extend `audit-public-surface.mts` to enumerate all sibling exports from `index.ts`                                                                                                                                               | ✅     | Allowlist + forbidden list shipped; wired as `pnpm nx audit-public-surface runtime`                                                                                                                   |
| R11 | Add `@internal` JSDoc tag to `cooperative-abort.ts`                                                                                                                                                                              | ✅     | File header + three exported functions tagged; `cooperative-abort.surface.test.ts` enforces (Finding 8 closed)                                                                                        |
| R12 | Introduce typed `TelemetryEntry` alias                                                                                                                                                                                           | ✅     | `TelemetryEntry` exported and threaded through `'telemetry'` event payload (Finding 9 closed)                                                                                                         |
| R13 | Remove `signalBuffer` from transport return types and conformance test                                                                                                                                                           | ✅     | Removed; `transport-conformance.test.ts` rewritten to assert through the public surface (Finding 10 closed)                                                                                           |

## Trade-offs

The most consequential choice was **R5 (transport SAB ownership)**. The audit preferred the architectural fix for two reasons documented in the blueprint:

- Forward-compat with `createWebSocketTransport`: the blueprint's whole "behaviour-complete transport" framing depends on the runtime client being SAB-blind.
- The pre-fix SAB-leak was the largest delta from the [Target API Surface](runtime-event-driven-api-blueprint-v5.md#target-api-surface) section.

Counter-argument considered at the time: the cost was real (large refactor, touched `runtime-client.ts` and `runtime-worker-client.ts` SAB allocation paths plus the test suite), and the pre-fix co-existence was observably correct in production (CI was green). A "do nothing" path would have documented the gap inside `runtime-topology.md` and accepted G.3 as a soft invariant. We took the architectural fix because it is the only blueprint deviation that affects future work directly. **Outcome (closed state)**: the refactor landed without a measurable regression, the wider `await-fresh-render`/Zoo-SDK string-matching cleanup (NEW Finding 11) was discovered as a follow-on benefit, and the public surface no longer leaks `SharedArrayBuffer` from any runtime API.

## References

- [`docs/research/runtime-event-driven-api-blueprint-v5.md`](runtime-event-driven-api-blueprint-v5.md) — the blueprint being audited
- [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) — API surface rules referenced by R22
- [`docs/policy/jsdoc-policy.md`](../policy/jsdoc-policy.md) — `@public` / `@example` rules referenced by G.1
- [`docs/architecture/runtime-topology.md`](../architecture/runtime-topology.md) — architecture doc updated by R21

## Appendix A: Evidence Index

Source-tree commands and locations used to verify each finding:

| Claim                                                           | Command                                                                                 | Location                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `RuntimeReconnectError` not implemented                         | `rg "RuntimeReconnectError" packages/runtime/src`                                       | 0 matches                                                       |
| `NoActiveRenderContextError` not implemented                    | `rg "NoActiveRenderContextError" packages/runtime/src`                                  | 0 matches                                                       |
| `TelemetryEntry` not implemented                                | `rg "TelemetryEntry" packages/runtime/src`                                              | 0 matches                                                       |
| `RenderSettlement` not implemented                              | `rg "RenderSettlement" packages/runtime/src`                                            | 0 matches                                                       |
| `RenderOutcome` is the actual name                              | `runtime-client.ts:126`                                                                 | discriminated union present                                     |
| `NoRenderOutcomeError` is the actual name                       | `runtime-client.ts:140`                                                                 | error class present (renamed from legacy `NoRenderResultError`) |
| `onWorkerStateChange` (not `observeWorkerState`)                | `transport/runtime-transport.ts:82`                                                     | interface signature                                             |
| Direct SAB / Atomics / signalBuffer in client and worker-client | `rg "SharedArrayBuffer\|signalBuffer\|Atomics" packages/runtime/src/{client,framework}` | 16 hits                                                         |
| `signalSlot` shrunk to two slots                                | `runtime-protocol.types.ts:184–187`                                                     | `{ abortGeneration: 0, abortReason: 1 }`                        |
| `signalSlot` marked `@internal`                                 | `runtime-protocol.types.ts:182`                                                         | tag present                                                     |
| `cooperative-abort.ts` exports lack `@internal`                 | `cooperative-abort.ts:1–50`                                                             | no tags                                                         |
| No `'abort'` dispatcher case                                    | `rg "case 'abort':" packages/runtime/src`                                               | 0 matches                                                       |
| `'abort'` discriminator declared                                | `runtime-protocol.types.ts:131`                                                         | `type: 'abort'`                                                 |
| `RuntimeConnectionError.cause: unknown`                         | `runtime-client.ts:214`                                                                 | property declaration                                            |
| `RuntimeTerminatedError` no `cause` field                       | `runtime-client.ts:251–263`                                                             | constructor                                                     |
| `terminate()` synchronous reject                                | `runtime-client.ts:1319–1322`                                                           | `prior.reject(new RuntimeTerminatedError())`                    |
| `on(...)` does not throw after terminate                        | `runtime-client.ts:1235–1252`                                                           | no `lifecycleState === 'terminated'` guard                      |
| `RuntimeWorkerClient` re-exported as public                     | `packages/runtime/src/index.ts:63`                                                      | `export { RuntimeWorkerClient } ...`                            |
| `transport.signalBuffer` accessed in tests                      | `transport-conformance.test.ts:60,63,64,88,91,156`                                      | direct reads                                                    |
| `audit-public-surface.mts` allowlist exact match                | `packages/runtime/scripts/audit-public-surface.mts:31–60`                               | 12 allowed, 9 forbidden                                         |
| `createWebSocketTransport` stub                                 | `transport/websocket-transport.ts`                                                      | implements full interface, throws `'not implemented'`           |
| `'fileResolutionFailed'` removed                                | `runtime-client-events.test-d.ts:35–37`                                                 | TypeScript compile-error guard                                  |
| `'activeKernel'` renamed                                        | `runtime-client.ts:408`                                                                 | `activeKernelChanged: Set<...>`                                 |
| Telemetry payload type                                          | `runtime-client.ts:402`                                                                 | `Set<(entries: PerformanceEntryData[]) => void>`                |
