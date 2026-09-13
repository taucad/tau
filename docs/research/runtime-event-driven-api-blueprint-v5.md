---
title: 'Runtime Event-Driven API Blueprint v5'
description: 'Final @taucad/runtime blueprint: autonomous live mode (openFile/updateParameters + on-event) shared by viewer and RPC; export(format, options?) for imperative bytes; XState-state freshness; behaviour-complete RuntimeTransport hides SAB; explicit connect; deterministic terminate.'
status: draft
created: '2026-04-22'
updated: '2026-05-08'
category: architecture
related:
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/architecture/runtime-topology.md
  - docs/research/runtime-event-driven-api-blueprint.md
  - docs/research/runtime-event-driven-api-blueprint-v2.md
  - docs/research/runtime-event-driven-api-blueprint-v3.md
  - docs/research/runtime-event-driven-api-blueprint-v4.md
  - docs/research/shared-memory-geometry-pipeline.md
  - docs/research/capabilities-manifest-api-audit.md
  - docs/research/runtime-client-type-safety-audit.md
  - docs/research/cli-runtime-ergonomics.md
  - docs/research/safari-cross-origin-isolation.md
  - docs/research/lazy-capabilities-manifest.md
  - docs/research/nativehandle-serialization-and-pipeline-architecture.md
  - docs/research/agent-loop-safeguards.md
---

# Runtime Event-Driven API Blueprint v5

Final blueprint for the `@taucad/runtime` consumer API. Corrects three v4 mistakes — the viewer does not call `export()`, RPC handlers must stay event-driven, and the always-warm-native-handle "invariant" was over-engineering — while preserving v4's render-vs-export dichotomy and `openFile`/`updateParameters` primitives. Single-arg `export(format)` survives as the "use default options for this format" overload powered by the existing opportunistic native-handle cache, not by a new contract.

> **Canonical-name reconciliation note** (Finding 1 / R1 in [`runtime-blueprint-v5-implementation-audit.md`](runtime-blueprint-v5-implementation-audit.md))
>
> Three names in this document have been canonicalised to the more legible implementation names. Wherever this blueprint reads:
>
> | Blueprint name (this doc)             | **Canonical name** (use this in code, JSDoc, and all new prose) |
> | ------------------------------------- | --------------------------------------------------------------- |
> | `RenderSettlement`                    | **`RenderOutcome`**                                             |
> | `NoActiveRenderContextError`          | **`NoRenderOutcomeError`**                                      |
> | `RuntimeTransport.observeWorkerState` | **`RuntimeTransport.onWorkerStateChange`**                      |
>
> The blueprint prose below is preserved as the historical design record; the implementation, [`library-api-policy.md`](../policy/library-api-policy.md), and [`runtime-topology.md`](../architecture/runtime-topology.md) all use the canonical names. New documentation must follow the canonical names exclusively.

## Executive Summary

v4 introduced two structural corrections that survive into v5:

- **Render and export are different modes**, not different argument shapes for the same verb. `client.render(input)` is removed; `openFile`/`updateParameters` (autonomous) and `export(format, options?)` (imperative one-shot or live "Save As") are the canonical surface.
- **`Geometry` already only carries bytes**, so migrating tests/benchmarks/CLI to `export('glb', input)` has zero semantic loss.

But v4 also introduced three local mistakes that v5 corrects:

1. **The viewer does not call `export()`.** The viewer subscribes to `client.on('geometry', ...)` and renders the GLB bytes the kernel already emitted. v4's "live exports must be near-instant" framing implied otherwise. v5 makes this explicit: autonomous-mode consumers (viewer, `useRender`, RPC handlers) consume from the event stream; imperative-mode consumers (CLI, "Save As" buttons, tests, benchmarks) call `export(format, options?)`.
2. **RPC handlers must stay event-driven, not migrate to `client.export`.** The product property the chat agent relies on — _"the LLM's geometry tests run against the same `Uint8Array` the user is looking at, the moment it is available"_ — is a parity guarantee that a separate `export()` round-trip silently breaks. RPC reads from `cad.machine.context.geometry` and uses XState state + the `RenderSettlement` Promise to gate freshness.
3. **The always-warm-native-handle "invariant" was unnecessary**. v4 R5 promised that kernels would always retain the most recent successful render's `nativeHandle`, so that single-arg `export(format)` could skip kernel re-execution. With #1 and #2 corrected, the only consumer of single-arg `export(format)` is the live-pane "Save As with defaults" UX. The existing opportunistic `nativeHandle` cache (already in `kernel-worker.ts:208-211, 1278-1336`) handles that case well enough as a pragmatic optimization. No contract is needed.

The single-arg `export(format)` overload is **kept** — its purpose is "use the default export options for this format, against the current render context." Two-arg `export(format, options)` overrides those defaults. Imperative callers (CLI) pass `{ file, parameters, ...formatOptions }` as the options bag, which has the side-effect of bootstrapping a one-shot render context inside the worker for callers that don't have one. This matches today's `client.export` shape exactly; nothing about the existing implementation needs to change.

v5 also restores the **transport + lifecycle** story that v3 finished but v4 silently dropped:

- **`RuntimeTransport` is the behaviour-complete abstraction.** The runtime client never reads `SharedArrayBuffer`, `crossOriginIsolated`, signal slots, or pool keys. The transport owns SAB internally and exposes polymorphic `observeWorkerState` / `signalAbort` / `resolveGeometry` / `describe` / `close` methods. A future `createWebSocketTransport` slots in unmodified.
- **Single ordered event channel.** All worker→main events flow through one `postMessage` stream in worker emit order. SAB shrinks to a single internal `abortGeneration` slot (plus its `abortReason` cousin) used only for main→worker cooperative abort polled by WASM. No worker→main SAB writes survive — the cross-channel race is eliminated by construction.
- **`connect()` is explicit and required — manually invoked by `cad.machine`.** v3 prescribed an opt-in pre-warm, then v5 (pre-amendment) tried to drop the method entirely in favour of auto-connect. Implementation reality vetoes auto-connect: connection takes a `MessagePort` from `useFileManager`, a `filePoolBuffer` allocated in `fileManager.machine`, and runtime options that only the calling state machine knows. Synthesising those at construction time would require pushing every dependency into `createRuntimeClient(options)` and re-architecting `cad.machine`'s wiring layer. v5 reinstates `connect(options): Promise<void>` as a first-class public method. The runtime client transitions through `unconnected → connecting → connected → terminated` and rejects every command before connection settles. `cad.machine` is the sole production caller of `connect`.
- **`terminate()` is deterministic — no hanging Promises, no orphan handlers.** All in-flight Promises (`connect`, `openFile`, `updateParameters`, `setOptions`, `export`) reject on the next microtask with `RuntimeTerminatedError`; all `on(...)` subscriptions are auto-disposed; subsequent method calls throw `RuntimeTerminatedError` synchronously; `terminate()` itself is idempotent.
- **Event surface tightened.** `on('activeKernel', ...)` is renamed to `on('activeKernelChanged', ...)` (verb-tense parity with `geometry`/`state`/`error`). `on('fileResolutionFailed', ...)` is dropped — it had no consumer and the equivalent failure surfaces through `on('error', ...)` with a typed bundle issue. `on('telemetry', ...)` is **kept** — it carries OTEL-shaped runtime telemetry consumed by debug overlays.

The combined surface is **8 public methods + `on()` + 3 read-only getters** (`capabilities`, `activeKernelId`, `lifecycleState`), with `client.render`, `client.setFile`, `client.setParameters`, `client.notifyFileChanged`, `client.cancelPendingRender`, `client.setRenderTimeout`, `client.geometryPool`, `client.lastRequestedGeneration`, and `client.incrementAbortGeneration` all removed; `client.connect` is **kept**. Freshness logic is owned by `cad.machine` (it can — and should — know about its own state machine); generations stay strictly internal to the runtime worker; SAB stays scoped to internal cooperative-abort signalling, hidden behind the transport. A single `RuntimeClient` simultaneously serves both the autonomous (event-stream) and imperative (Promise) delivery shapes; the consumer picks based on what they want, not based on which client they have.

## Table of Contents

- [Scope and Non-Goals](#scope-and-non-goals)
- [The Render-vs-Export Dichotomy, Refined](#the-render-vs-export-dichotomy-refined)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: Geometry already only carries bytes — render and export return the same payload kind](#finding-1-geometry-already-only-carries-bytes--render-and-export-return-the-same-payload-kind)
  - [Finding 2: Two delivery shapes, one client](#finding-2-two-delivery-shapes-one-client)
  - [Finding 3: The viewer is an autonomous-mode consumer that consumes from on('geometry'), not from export()](#finding-3-the-viewer-is-an-autonomous-mode-consumer-that-consumes-from-ongeometry-not-from-export)
  - [Finding 4: render() is removed; openFile and updateParameters drive the autonomous mode](#finding-4-render-is-removed-openfile-and-updateparameters-drive-the-autonomous-mode)
  - [Finding 5: export(format, options?) is the imperative workhorse and the live "Save As" verb](#finding-5-exportformat-options-is-the-imperative-workhorse-and-the-live-save-as-verb)
  - [Finding 6: The always-warm-native-handle "invariant" was unnecessary — keep the opportunistic cache as-is](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is)
  - [Finding 7: No 'memory' pseudo-format](#finding-7-no-memory-pseudo-format)
  - [Finding 8: CLI never needs a render verb](#finding-8-cli-never-needs-a-render-verb)
  - [Finding 9: RPC handlers MUST stay event-driven via cad.machine — they must NOT migrate to client.export](#finding-9-rpc-handlers-must-stay-event-driven-via-cadmachine--they-must-not-migrate-to-clientexport)
  - [Finding 10: Freshness is solved by XState state + the RenderSettlement Promise — no generations on the public surface](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface)
  - [Finding 11: useRender is autonomous-mode and must migrate to event subscription](#finding-11-userender-is-autonomous-mode-and-must-migrate-to-event-subscription)
  - [Finding 12: Test helpers move to export trivially](#finding-12-test-helpers-move-to-export-trivially)
  - [Finding 13: Library API Policy compliance — point-by-point](#finding-13-library-api-policy-compliance--point-by-point)
  - [Finding 14: Inheritance from v3 + corrections to v4](#finding-14-inheritance-from-v3--corrections-to-v4)
- [Transport & Lifecycle](#transport--lifecycle)
  - [Finding 15: RuntimeTransport is the behaviour-complete abstraction (no flag struct)](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct)
  - [Finding 16: All worker→main events flow through a single ordered postMessage channel](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel)
  - [Finding 17: SAB scope = single internal abortGeneration (and its abortReason cousin)](#finding-17-sab-scope--single-internal-abortgeneration-and-its-abortreason-cousin)
  - [Finding 18: connect() is explicit and required — manually invoked by cad.machine](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)
  - [Finding 19: terminate() is deterministic — no hanging Promises, no orphan handlers](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)
  - [Finding 20: createWebSocketTransport pre-stub validates the abstraction](#finding-20-createwebsockettransport-pre-stub-validates-the-abstraction)
  - [Should consumers see SAB? A transparency analysis](#should-consumers-see-sab-a-transparency-analysis)
  - [Target Transport Architecture](#target-transport-architecture)
  - [Cooperative Abort Plumbing](#cooperative-abort-plumbing)
- [Target API Surface](#target-api-surface)
- [Recommendations](#recommendations)
- [Migration Plan](#migration-plan)
- [Trade-offs vs v4](#trade-offs-vs-v4)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [Appendix A: Full Consumer Call-Site Inventory](#appendix-a-full-consumer-call-site-inventory)
- [Appendix B: Per-Mode Contract](#appendix-b-per-mode-contract)
- [Appendix C: Inheritance and corrections from v1, v2, v3, v4](#appendix-c-inheritance-and-corrections-from-v1-v2-v3-v4)
- [Appendix D: Per-Render Event Lifecycle Contract](#appendix-d-per-render-event-lifecycle-contract)
- [Appendix E: Full API Surface Audit Table](#appendix-e-full-api-surface-audit-table)
- [Appendix F: Per-Symbol Migration Call-Site Inventory](#appendix-f-per-symbol-migration-call-site-inventory)
- [Appendix G: Production-Readiness Acceptance Gates](#appendix-g-production-readiness-acceptance-gates)

## Scope and Non-Goals

**In scope:**

- Public API surface of `@taucad/runtime` (`createRuntimeClient`, `RuntimeClient`).
- The render-vs-export dichotomy: which mode each consumer uses and why.
- Freshness coordination for the chat RPC handlers (the "test what the user sees" property).
- Migration of every in-tree `client.render(...)` call site.
- Library API Policy compliance pass for the new surface.
- The `RuntimeTransport` interface contract that hides SAB from the runtime client and from consumers.
- SAB layout reduction (worker→main slots removed; main→worker `abortGeneration` only).
- Single-ordered event channel contract for all worker→main delivery.
- Lifecycle contract: explicit `connect(options): Promise<void>` (manually invoked by `cad.machine`); deterministic `terminate()` that rejects in-flight Promises and disposes subscriptions.
- Forward-compatibility with `createWebSocketTransport` (shares the same surface unmodified).

**Out of scope:**

- Plugin authoring contracts (`defineKernel`, `defineMiddleware`, `defineBundler`, `defineTranscoder`).
- Internal cache invalidation algorithms — covered by [`runtime-topology.md`](../architecture/runtime-topology.md).
- Type-level audits — covered by [`runtime-client-type-safety-audit.md`](runtime-client-type-safety-audit.md).
- Capabilities-manifest contents — covered by [`capabilities-manifest-api-audit.md`](capabilities-manifest-api-audit.md).
- Backwards-compatibility shims — explicitly disallowed by reviewer.
- Hardening the existing `nativeHandle` cache into a contract — v5 explicitly chooses not to (see [Finding 6](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is)).

## The Render-vs-Export Dichotomy, Refined

v4 framed the dichotomy as "autonomous live mode vs imperative one-shot mode" and bound it to _who calls_ (UI panes vs CLI). v5 sharpens that framing: the dichotomy is about **how results are delivered**, and a single client serves both delivery shapes simultaneously.

### Two delivery shapes

| Property                    | Event stream (autonomous)                                                                                                                      | Promise (imperative)                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Trigger surface             | `openFile`, `updateParameters`, `setOptions`; or none (autonomous re-renders from file watch / parameter file change)                          | `export(format, options?)`                                                                 |
| Delivery surface            | `client.on('geometry'\|'state'\|'progress'\|...)`                                                                                              | `await client.export(...)`                                                                 |
| When does the result arrive | Whenever the kernel emits a new render — could be many over a session                                                                          | Once per call, at Promise settlement                                                       |
| Supersession                | Yes — newer render replaces older event payload; auto-aborts in-flight prior renders                                                           | No — each `export` Promise is independent                                                  |
| Lifetime                    | Subscription is long-lived; results stream continuously                                                                                        | Per-call                                                                                   |
| Used by                     | Viewer (`cad.machine`), `useRender` (React hook), chat RPC handlers (read from cad.machine), benchmark profiling loops that watch live updates | CLI, "Save As STL/STEP/3MF" UI buttons, tests, headless one-shot benchmarks, AR conversion |

### A single client serves both shapes

The same `RuntimeClient` instance can have:

- Active `on(...)` subscriptions delivering the live event stream for the viewer, AND
- Concurrent `export('stl', {...})` calls returning Promises for "Save As" buttons.

The shapes don't overlap. Event-stream consumers never await `export`; Promise consumers never subscribe. Because the kernel maintains an in-memory `nativeHandle` after each successful live render (opportunistically — see [Finding 6](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is)), the two shapes share work transparently when the inputs match.

### Why this matters for the dichotomy framing

The v4 framing "autonomous = UI; imperative = CLI" implied RPC handlers must pick a side. They naturally fall into the _autonomous_ delivery shape (because they need parity with what the viewer is looking at), but they live in code that _looks_ imperative (a `Promise<RpcResult>` per tool call). v5 clarifies that the RPC's _outer_ return is a Promise (because that's what the LLM tool layer expects), while its _internal_ mechanism reads from the autonomous event stream the viewer is consuming. The two are not in tension.

## Methodology

Approach taken:

1. Re-read v4 in full; identified three claims that did not survive a freshness/parity review by the reviewer.
2. Walked the viewer rendering pipeline (`cad.machine.ts:113-160` → `<gltf-mesh>` → graphics) to confirm the viewer reads bytes from `on('geometry')`, never from `export`.
3. Walked the existing `nativeHandle` cache (`kernel-worker.ts:208-211, 637, 959, 1278-1336`) to confirm whether the cache's current opportunistic behaviour is sufficient for the live "Save As" UX without elevating it to a contract.
4. Audited the chat RPC handlers (`apps/ui/app/hooks/rpc-handlers.ts`) and the `awaitFreshRender` design previously planned (TDD tasks t5/t6) to confirm that XState state + `RenderSettlement` Promise resolution is sufficient for freshness without exposing generations.
5. Re-checked every consumer of today's `client.export(format, ...)` to confirm both single-arg and two-arg forms have real uses (live-context with defaults vs explicit input/options).
6. Re-checked `library-api-policy.md` for compliance against the revised surface.

## Findings

### Finding 1: Geometry already only carries bytes — render and export return the same payload kind

**Status from v4: Survives unchanged.**

`Geometry` is `GeometryResponse & { hash: string }`, where for 3D output `GeometryGltf = { format: 'gltf'; content: Uint8Array<ArrayBuffer> }`. There is no structured mesh on `Geometry`. Every existing `client.render` consumer extracts `.content` (bytes) and parses with `gltf-transform`. Migrating those consumers to `client.export('glb', input)` is a verb rename with no semantic loss.

See v4 §"Finding 1" for the full evidence table; the underlying types are unchanged.

### Finding 2: Two delivery shapes, one client

**Status from v4: Reframed.**

v4 presented the dichotomy as two consumer modes, each with a separate code path:

- _Autonomous_: UI pane code that uses `setFile`/`setParameters` + `on(...)` events.
- _Imperative_: CLI/test code that uses `client.export(...)`.

That framing is structurally correct but understates one fact: **the same `RuntimeClient` instance can serve both shapes at once**, and consumers within a single subsystem may use both shapes concurrently. Concretely:

| Subsystem                                                     | Uses event stream                                          | Uses `export` Promise                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Viewer (`cad.machine` + `<gltf-mesh>`)                        | ✅ for live geometry display                               | ❌                                                    |
| Chat RPC handlers (`fetchGeometry`, `getKernelResult`)        | ✅ reads `cad.machine.context.geometry` populated by event | ❌                                                    |
| Quick Export UI (`chat-converter.tsx`, `chat-parameters.tsx`) | ❌                                                         | ✅ for `client.export('stl' \| 'step' \| ..., {...})` |
| `useRender` React hook                                        | ✅ for live geometry                                       | ✅ via the `exportGeometry` callback                  |
| CLI (`taucad export`)                                         | ❌                                                         | ✅                                                    |
| Headless tests/benchmarks                                     | ❌ (most cases)                                            | ✅                                                    |

So a single UI pane has **all three** at once: a live event subscription (viewer), an event subscription read by the RPC handler (chat agent), and an export call when the user clicks "Save As" (Quick Export). One client, three concurrent uses, no conflicts.

This is why v5 prefers "delivery shapes" over "modes": consumers pick a shape per call, not per client lifetime.

### Finding 3: The viewer is an autonomous-mode consumer that consumes from on('geometry'), not from export()

**Status from v4: NEW (corrects an implicit confusion in v4 §"Finding 6").**

v4's wording "live exports must be near-instant" implied the viewer might call `export()` for display. It does not.

**Evidence**: `apps/ui/app/machines/cad.machine.ts:113-160`:

```typescript
const client = createRuntimeClient(kernelOptions);

client.on('geometry', (result) => machineRef.send({ type: 'geometry', result }));
client.on('state', (state) => machineRef.send({ type: 'state', state }));
client.on('progress', (p) => machineRef.send({ type: 'progress', progress: p }));
// ... etc.

client.setFile(file, parameters);
```

The geometry that the viewer displays is the `result` argument passed into the `'geometry'` handler. It is the same `Uint8Array<ArrayBuffer>` the kernel emitted. The viewer pipeline is:

```
KernelWorker createGeometry success
  → emits 'geometry' event
    → cad.machine context.geometry := result
      → graphics.machine consumes context.geometry
        → <gltf-mesh> parses bytes via gltf-transform/three
          → renders to canvas
```

There is no `export` call anywhere on this path. v5 makes this explicit so future readers (and future API designers) don't mistakenly wire the viewer through `export`.

**Implication for the v4 always-warm-native-handle invariant** ([Finding 6](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is)): with the viewer off the `export` path, the only consumer of single-arg `export(format)` is the user-initiated "Save As with defaults" UX. That's a single button click whose latency budget is "perceived instant" (~100ms), well within the existing opportunistic cache's reach without needing a hardened contract.

### Finding 4: render() is removed; openFile and updateParameters drive the autonomous mode

**Status from v4: Survives.** See v4 §"Finding 3, 5" for full reasoning. Recap:

- `setFile` → `openFile`: re-watches entry file, runs `executeRender()` immediately. Promise resolves with `RenderSettlement`.
- `setParameters` → `updateParameters`: 50ms debounce, no re-watch. Promise resolves with `RenderSettlement`.
- Both fix the §7 (no void async) policy violation today's surface has.
- `setOptions` joins them (also Promise-returning) for runtime option updates.

`render(input)` is not on the public surface in v5 (same as v4).

### Finding 5: export(format, options?) is the imperative workhorse and the live "Save As" verb

**Status from v4: Refined; both overloads kept.**

v4 §"Finding 4" + §"Finding 12" treated `export(format)` (no input) as an autonomous-mode call dependent on a never-cleared native handle. v5 unifies the framing: `export` has two overloads serving two intents that share a worker-level pipeline.

| Overload                  | Purpose                                                                                                     | Caller examples                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export(format)`          | Use default export options for `format`, against the current render context                                 | Live-pane "Save As <Format>" button (defaults flow). Requires a prior successful render in this client (errors with `NoActiveRenderContextError` otherwise) |
| `export(format, options)` | Override defaults; `options` may also include `{ file, parameters }` to bootstrap a one-shot render context | CLI, Quick Export with non-default options, tests, benchmarks                                                                                               |

The two-arg form is what every imperative consumer uses today (`packages/cli/src/commands/export.ts:82` passes `{ file, parameters }`). The one-arg form is the live "Save As with defaults" affordance.

**No contract is added** about what the worker does internally to make either form fast. The existing `nativeHandle` cache's opportunistic behaviour is sufficient (see [Finding 6](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is)).

**Library API Policy compliance**:

- §1 single concern: ✅ both overloads produce bytes for one format.
- §4 ≤3 positional: ✅ (1 or 2).
- §5 no flag args: ✅.
- §7 no void async: ✅ both return `Promise<ExportResult>`.

### Finding 6: The always-warm-native-handle "invariant" was unnecessary — keep the opportunistic cache as-is

**Status from v4: REVERSED.**

v4 R5 promised that kernels would always retain the most recent successful render's `nativeHandle` until replacement/termination/explicit invalidation. That promise was added solely to make single-arg `export(format)` near-instant.

**Why v5 reverses it**:

1. With [Finding 3](#finding-3-the-viewer-is-an-autonomous-mode-consumer-that-consumes-from-ongeometry-not-from-export) and [Finding 9](#finding-9-rpc-handlers-must-stay-event-driven-via-cadmachine--they-must-not-migrate-to-clientexport), the only consumer of single-arg `export(format)` is the user-initiated "Save As with defaults" UX. That's an interactive action (~100ms latency budget), not a sub-millisecond hot path.
2. The existing implementation already has a three-tier fallback: warm `nativeHandle` (instant) → `lastSerializedHandle` deserialize (fast) → re-run `createGeometry` (kernel cost, but only when the cache truly missed). For the "Save As" use case, even the slowest tier meets the latency budget for a button click.
3. Codifying "always warm" as a contract introduces a constraint the kernel must defend across every refactor (e.g., the existing abort cleanup at `kernel-worker.ts:637` that nulls `nativeHandle` would have to be re-architected to satisfy the invariant). Cost outweighs benefit.

**v5 stance**: keep the existing implementation unchanged. The current opportunistic cache is good enough for the only consumer that depends on it. No new tests, no new doc contract, no new constraint.

**Trade-off**: in the unlikely worst case (user clicks "Save As" immediately after a render abort cleared `nativeHandle` and the deserialize path also fails), the kernel re-runs `createGeometry` once. That's the same behaviour as today and is acceptable.

### Finding 7: No 'memory' pseudo-format

**Status from v4: Survives.** See v4 §"Finding 7" for the full argument; the conclusion is unchanged. Tests/benchmarks call `client.export('glb', input)` and parse bytes with `gltf-transform`.

### Finding 8: CLI never needs a render verb

**Status from v4: Survives.** The CLI calls `client.export(format, { file, parameters, ...formatOptions })` exclusively. There is no `render` command and there will never be one.

### Finding 9: RPC handlers MUST stay event-driven via cad.machine — they must NOT migrate to client.export

**Status from v4: REVERSED.** v4 R8 prescribed migrating `rpc-handlers.ts` to call `client.export('glb', input)`. v5 reverts this prescription and reinstates the event-driven path.

**Why v5 reverses it** — three independent failures of the v4 R8 approach:

#### Parity failure (the user-facing one)

The chat agent's contract with the LLM is _"the geometry I tested against is the geometry the user is looking at."_ This parity property powers the entire test/edit/iterate loop:

- LLM says: "Edit `main.scad` to add a 5mm fillet."
- User watches the viewer update.
- LLM calls `test_model` to validate the change.
- The tested geometry must be the same bytes the user just saw.

**With v4 R8**: the RPC issues `client.export('glb', { file: targetFile, parameters: <snapshot> })`. The export goes through its own pipeline pass with its own input snapshot. If the user has been moving sliders since the LLM last sampled `parameters`, the RPC's snapshot is stale and the test runs against a different geometry than the viewer shows. The parity property silently breaks.

**With v5 (revert)**: the RPC reads `cad.machine.context.geometry`, which is set by the most recent `'geometry'` event — the same `Uint8Array` the viewer is rendering. Parity is preserved by construction.

#### Latency failure

**With v4 R8**: each RPC call pays a fresh worker round-trip + GLB encode + postMessage even when the live pane just rendered the same thing seconds ago. Even with the warm native handle cache, this is on the order of tens of milliseconds and produces a duplicate `Uint8Array` the runtime must garbage-collect.

**With v5 (revert)**: the RPC reads `context.geometry` synchronously. If `state === 'idle'`, the read is `O(1)`. If `state === 'rendering'`, the RPC waits on the next event tick.

#### Semantic failure

**With v4 R8**: the RPC's freshness depends on the input snapshot it built. There is no notion of "current pane state" because the export is one-shot. If the LLM tool's input is stale (e.g., the agent had outdated parameter context from a prior turn), the RPC successfully exports a stale-but-syntactically-valid GLB, and the test passes/fails against the wrong geometry.

**With v5 (revert)**: freshness is "what is currently displayed in this pane" — there is no separate snapshot to drift. The pane state IS the agent's source of truth.

**This is what led me to v4 R5 and v4 R8 in the first place**: I tried to remove the `awaitFreshRender` helper because I assumed exposing generations on the public surface was the only way to coordinate freshness. v5 demonstrates that freshness coordination lives entirely in `cad.machine` (which owns its state machine) and the runtime client never needs to expose generations. See [Finding 10](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface).

### Finding 10: Freshness is solved by XState state + the RenderSettlement Promise — no generations on the public surface

**Status from v4: NEW (replaces v4 R8's `client.export`-based freshness mechanism).**

The "latent issue" v4 R8 was trying to solve: the RPC needs the _latest_ geometry — not whatever happened to be in `context.geometry` from before the LLM's edit landed.

**Two-fact freshness primitive**:

1. `cad.machine` already tracks `state: 'idle' | 'rendering' | 'error'` from the runtime's `state` events (existing wiring at `cad.machine.ts:113-160`).
2. `openFile` and `updateParameters` (per [Finding 4](#finding-4-render-is-removed-openfile-and-updateparameters-drive-the-autonomous-mode)) return `Promise<RenderSettlement>`; the Promise resolves _after_ the corresponding `'geometry'` event fires, so awaiting it is functionally equivalent to "wait for my latest user-intent to settle."

**The reborn `awaitFreshRender` helper** (`apps/ui/app/machines/await-fresh-render.ts`):

```typescript
export async function awaitFreshRender(
  machine: ActorRefFrom<typeof cadMachine>,
  intent: { file: string; parameters: Record<string, unknown> },
): Promise<HashedGeometryResult> {
  const snapshot = machine.getSnapshot();
  const intentMatchesContext =
    snapshot.context.currentFile === intent.file && deepEqual(snapshot.context.currentParameters, intent.parameters);

  if (!intentMatchesContext) {
    machine.send({ type: 'reissueOpenFile', input: intent });
  }

  const settled = await waitFor(
    machine,
    (s) =>
      s.matches('ready.idle') &&
      s.context.geometry !== undefined &&
      s.context.lastSettledIntentId === s.context.lastRequestedIntentId,
  );

  return settled.context.geometry!;
}
```

Where `lastRequestedIntentId` and `lastSettledIntentId` are **internal XState bookkeeping** — opaque tokens generated locally by `cad.machine` whenever it issues `openFile`/`updateParameters` and updated on Promise settlement. They never appear on the runtime client's public surface. They are XState's equivalent of generations, scoped to the layer that needs them.

**Why this is strictly better than v4 R8**:

| Property                                   | v4 R8 (`client.export`)                | v5 (event-driven via cad.machine)   |
| ------------------------------------------ | -------------------------------------- | ----------------------------------- |
| Generations on public client surface       | No                                     | No                                  |
| Generation-equivalent state in cad.machine | No (cad.machine had no state to track) | Yes (intent IDs internal to XState) |
| Parity with viewer                         | No                                     | Yes                                 |
| Latency on cache hit                       | Tens of ms (round-trip)                | Sub-ms (synchronous context read)   |
| Duplicate work                             | Yes (parallel pipeline)                | No                                  |
| Stale snapshot risk                        | Yes                                    | No                                  |

### Finding 11: useRender is autonomous-mode and must migrate to event subscription

**Status from v4: Survives.** See v4 §"Finding 10" for the full evidence and prescribed shape. Recap:

- Today's `useRender` calls `await client.render(...)` inside `useEffect` with a `cancelled` flag — Promise-correlated under the hood, racing across React commits.
- v5 prescription: subscribe to `client.on('geometry', ...)` once on mount; trigger via `client.openFile(...)` / `client.updateParameters(...)` on dependency change; let the runtime handle supersession internally.

### Finding 12: Test helpers move to export trivially

**Status from v4: Survives.** Each test that calls `client.render({ code, file })` becomes `client.export('glb', { code, file })`. Helpers parse `result.data.bytes` instead of `result.data[0].content`. One-line changes per call site.

### Finding 13: Library API Policy compliance — point-by-point

The v5 surface against [`library-api-policy.md`](../policy/library-api-policy.md):

| Method                            | §1 Single concern                                                                                                        | §2 Naming | §3 Async returns Promise    | §4 ≤3 positional | §5 No flag args                                               | §6 Errors typed                                                                                                   | §7 No void async |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------- | ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- |
| `connect(options)`                | ✅ activates the runtime ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))    | ✅        | ✅ `Promise<void>`          | ✅ (1)           | ✅ — `ConnectOptions` is a flat options object, not flag args | ✅ `RuntimeConnectionError`, `RuntimeReconnectError`, `RuntimeNotConnectedError`                                  | ✅               |
| `terminate()`                     | ✅ deterministic teardown ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)) | ✅        | n/a (sync void)             | ✅ (0)           | ✅                                                            | ✅ rejects in-flight with `RuntimeTerminatedError`; subsequent calls throw `RuntimeTerminatedError` synchronously | ✅               |
| `openFile(input)`                 | ✅ open file = autonomous-mode entry                                                                                     | ✅        | ✅ resolves on settlement   | ✅ (1)           | ✅                                                            | ✅ `RenderError`, `BundleError`, `KernelError`, `RuntimeNotConnectedError`                                        | ✅               |
| `updateParameters(parameters)`    | ✅ slider/input change                                                                                                   | ✅        | ✅ resolves on settlement   | ✅ (1)           | ✅                                                            | ✅ same as openFile                                                                                               | ✅               |
| `setOptions(options)`             | ✅ runtime option update                                                                                                 | ✅        | ✅                          | ✅ (1)           | ✅                                                            | ✅                                                                                                                | ✅               |
| `export(format)`                  | ✅ produce bytes (defaults)                                                                                              | ✅        | ✅                          | ✅ (1)           | ✅                                                            | ✅ `ExportError`, `NoActiveRenderContextError`                                                                    | ✅               |
| `export(format, options)`         | ✅ produce bytes (custom)                                                                                                | ✅        | ✅                          | ✅ (2)           | ✅                                                            | ✅ `ExportError`                                                                                                  | ✅               |
| `routesFor(format)`               | ✅ capability query                                                                                                      | ✅        | n/a (sync)                  | ✅ (1)           | ✅                                                            | n/a                                                                                                               | ✅               |
| `bestRouteFor(format, kernelId?)` | ✅ capability query                                                                                                      | ✅        | n/a (sync)                  | ✅ (2)           | ✅                                                            | n/a                                                                                                               | ✅               |
| `on(event, handler)`              | ✅                                                                                                                       | ✅        | n/a (returns `Unsubscribe`) | ✅ (2)           | ✅ auto-disposed on `terminate()`                             | n/a                                                                                                               | ✅               |

Result: **8 methods + `on()` + 3 read-only getters** (`capabilities`, `activeKernelId`, `lifecycleState`). Two `export` overloads share a row each but count as one symbol from the policy's perspective. (v5 pre-amendment briefly proposed 7 methods after dropping `connect()`; the amendment reinstates `connect()` and adds the `lifecycleState` getter.)

### Finding 14: Inheritance from v3 + corrections to v4

| Finding/Recommendation                                                                             | v3                                    | v4                              | v5                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Generations are public API                                                                         | ❌                                    | ❌                              | ❌                                                                                                   |
| Generations are internal cooperative-abort primitive                                               | ✅                                    | ✅                              | ✅                                                                                                   |
| Behavior-complete `RuntimeTransport` (no flags)                                                    | ✅                                    | ✅                              | ✅                                                                                                   |
| Single ordered event channel                                                                       | ✅                                    | ✅                              | ✅                                                                                                   |
| SAB scope = single internal `abortGeneration`                                                      | ✅                                    | ✅                              | ✅                                                                                                   |
| `notifyFileChanged`/`cancelPendingRender`/`setRenderTimeout`/`geometryPool` removed                | ✅                                    | ✅                              | ✅                                                                                                   |
| `setFile`/`setParameters` (void async) replaced by Promise-returning `openFile`/`updateParameters` | n/a (collapsed into `render`)         | ✅                              | ✅                                                                                                   |
| `render(input)` Promise as universal mutator                                                       | ✅                                    | ❌ removed                      | ❌ removed                                                                                           |
| `Geometry` already only carries bytes                                                              | n/a                                   | ✅ noted                        | ✅ noted                                                                                             |
| Two consumer modes split: render vs export                                                         | n/a                                   | ✅                              | ✅ refined to "two delivery shapes"                                                                  |
| **No-input `export(format)` overload kept**                                                        | n/a                                   | ✅ but tied to handle invariant | ✅ kept; default options for format; opportunistic cache                                             |
| **Always-warm-native-handle invariant**                                                            | n/a                                   | ✅ added (R5)                   | ❌ **reversed** — opportunistic cache stays as-is                                                    |
| **RPC handlers migrate to `client.export`**                                                        | n/a                                   | ✅ R8 prescribed                | ❌ **reversed** — RPC stays event-driven                                                             |
| **`awaitFreshRender` helper**                                                                      | n/a                                   | ❌ dropped (R23 re-scoping)     | ✅ **reborn** on XState state + `RenderSettlement`                                                   |
| 'memory' pseudo-format                                                                             | n/a                                   | ❌ rejected                     | ❌ rejected                                                                                          |
| One client per pane invariant                                                                      | ✅                                    | ✅                              | ✅                                                                                                   |
| Two delivery shapes shared by one client                                                           | n/a                                   | partial                         | ✅ explicit                                                                                          |
| **Public `connect(options)` method**                                                               | ✅ kept (lazy + opt-in pre-warm, R10) | ✅ kept                         | ✅ **kept** — explicit, required, manually invoked by `cad.machine` (Finding 18)                     |
| **Deterministic `terminate()` contract**                                                           | implicit                              | implicit                        | ✅ **explicit** — in-flight rejection + subscription disposal + sync-throw + idempotent (Finding 19) |
| **`createWebSocketTransport` pre-stub**                                                            | ✅ R14                                | implicit                        | ✅ R37 explicit (Finding 20)                                                                         |
| **Per-render event lifecycle contract**                                                            | ✅ Appendix B                         | implicit                        | ✅ Appendix D explicit                                                                               |
| **Full API surface audit table**                                                                   | ✅ Appendix A                         | partial                         | ✅ Appendix E updated                                                                                |
| Library API Policy compliance audit                                                                | ✅                                    | ✅                              | ✅ (re-done for v5 surface)                                                                          |

## Transport & Lifecycle

Findings 1–14 above cover the render/export dichotomy and freshness coordination — the v4→v5 delta. v5 also restores a **second story** that v3 had completed but v4 silently dropped: the **transport abstraction** that ensures the runtime client never depends on `SharedArrayBuffer`, `crossOriginIsolated`, signal slots, pool keys, or any wire-protocol detail directly, plus the **lifecycle contract** that pins down what `connect` and `terminate` actually do.

Why this matters: without these findings codified in v5, the recommendations from v3 (move SAB monitoring into the transport, shrink the SAB layout, eliminate the half-lazy `connect()` ambiguity) would be lost when implementers consult v5 as the canonical blueprint. Worse, the "leaky `transport.capabilities.sharedMemory ? sabPath : msgPath`" pattern v2 proposed could re-emerge under a new name. v5 anchors the abstraction explicitly so it survives the next round of refactors.

User direction tightens v3's lifecycle position in two ways:

1. **`connect()` stays — and is required.** v3 prescribed an opt-in pre-warm; v5 (pre-amendment) tried to drop it for an auto-connect-on-first-command model; that model was rejected on review. The downstream consequences proved too disruptive: connection options (`MessagePort` from `useFileManager`, `filePoolBuffer` from `fileManager.machine`, runtime options from invocation context) are state-machine-local and cannot reasonably be pushed up into `createRuntimeClient(options)` construction. v5 retains `connect(options): Promise<void>` as an explicit, required public method. The runtime client transitions through `unconnected → connecting → connected → terminated`; commands issued before connection settles reject synchronously with `RuntimeNotConnectedError`. **`cad.machine` is the only production caller**; tests and the CLI go through `createNodeClient` which wraps `connect` internally.
2. **`terminate()` is deterministic** — no hanging Promises, no orphan handlers, no lingering worker.

### Finding 15: RuntimeTransport is the behaviour-complete abstraction (no flag struct)

**Status from v3: Survives unchanged.** Re-stated here because v4 and v5 (pre-amendment) under-specified it.

v2 proposed `transport.capabilities.sharedMemory` so the runtime client could branch:

```typescript
const monitor = transport.capabilities.sharedMemory
  ? createSabStateMonitor(this.signalView)
  : createMessageStateMonitor(this.transport);
```

This violates **Tell, Don't Ask** (the client asks the transport "what kind are you?" and then performs the SAB logic itself), **Open-Closed** (every new transport requires updating every client-side branch), and **Single Responsibility** (the runtime client ends up knowing about both SAB-monitoring and message-monitoring). It also forces the consumer one layer up to see the same flag if any decision needs to bubble.

**v5 contract**: `RuntimeTransport` is a behaviour-complete interface. Each transport implementation owns its SAB-vs-message decision **internally**. The runtime client calls polymorphic methods and never branches on transport identity:

```typescript
type RuntimeTransport = {
  send(command: RuntimeCommand, transferables?: Transferable[]): void;
  onMessage(handler: (message: RuntimeResponse) => void): void;

  observeWorkerState(handler: (state: WorkerState, detail?: string) => void): Unsubscribe;
  signalAbort(reason: AbortReason): void;
  resolveGeometry(payload: GeometryTransport): Promise<Geometry>;

  describe(): TransportDescriptor;
  close(): void;
};

type TransportDescriptor = {
  readonly name: 'in-process' | 'worker' | 'websocket' | string;
  readonly locality: 'in-process' | 'worker' | 'remote';
  readonly sharedMemory: boolean;
  readonly latencyClass: 'sub-millisecond' | 'low' | 'high';
};
```

`describe()` returns a **diagnostic-only** descriptor — for telemetry overlays, debug logs, and `LogEntry.data`. It is never used for control flow. The runtime client must not branch on `descriptor.sharedMemory`. (Any caller who _thinks_ it needs to branch is solving the problem at the wrong layer; the right answer is to add a behaviour-complete method to the transport.)

**Library API Policy compliance**:

- §1 single concern: ✅ each method has one job.
- §3 flat options: ✅ no nested flag structs.
- §11 no optional methods: ✅ every method is required.
- The descriptor is `Readonly<{...}>` per §3.

### Finding 16: All worker→main events flow through a single ordered postMessage channel

**Status from v3: Survives unchanged.** Re-stated for v5.

Today two channels run independently: SAB monitor (state, abortGeneration, progress) and `postMessage` (geometry, error, parametersResolved, log, capabilities, telemetry, activeKernel). These are not synchronised — a consumer subscribed to both can see `state: idle` (from SAB) before `geometry` (from postMessage) even when the worker emitted `geometry` first.

This is the root cause of the race that the original RPC-handlers investigation surfaced: consumer code that waits for `state === 'idle'` and then reads geometry can read the geometry from the **previous** render because the new render's `state: idle` arrived ahead of its `geometry` event.

**v5 contract**: every worker→main event flows through one ordered `postMessage` stream in worker emit order. The transport implementation drains the stream and dispatches via `onMessage`; `observeWorkerState` reads from the same stream. There are no out-of-band side channels for state or progress.

This makes [Finding 10](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface)'s freshness algorithm sound: when `state: idle` arrives, every prior result for that render has already been delivered to subscribers.

### Finding 17: SAB scope = single internal abortGeneration (and its abortReason cousin)

**Status from v3: Survives unchanged.** Re-stated for v5.

Once event ordering is solved by single-channel `postMessage` delivery (Finding 16), SAB's role reduces to one coherent purpose: **let WASM polling code see "the work you're doing has been superseded" without crossing the JS boundary**.

| Slot                                            | Direction     | Purpose                                                     | v5 status                                           |
| ----------------------------------------------- | ------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `signalSlot.abortGeneration`                    | main → worker | Cooperative abort polled by WASM via `cooperative-abort.ts` | ✅ kept (internal)                                  |
| `signalSlot.abortReason`                        | main → worker | Encodes why abort was requested                             | ✅ kept (internal, implementation-coupled to abort) |
| `signalSlot.workerState`                        | worker → main | Worker state snapshot                                       | ❌ removed — flows via postMessage                  |
| `signalSlot.progressPercent`                    | worker → main | Progress percentage                                         | ❌ removed — flows via postMessage                  |
| `signalSlot.latestGeneration` (was v1 proposal) | worker → main | Latest settled render generation                            | ❌ never introduced                                 |

The two surviving slots are both main→worker, both internal-only, both serve cooperative abort. SAB's signal buffer shrinks accordingly and the dispatcher logic simplifies.

**Forward-compatibility implication**: a remote transport (WebSocket) doesn't need to emulate any worker→main SAB slot — the wire-message channel carries everything. `signalAbort(reason)` on a remote transport is a wire command (`{ type: 'abort', requestId, reason }`); on an in-process or worker transport it is `Atomics.store(signalView, signalSlot.abortGeneration, …)` + `Atomics.notify(...)`.

**Internal-only declaration**: `cooperative-abort.ts`, `signalSlot`, `AbortReason`, and the SAB allocation paths are all marked `@internal`. They do not appear in the published `@taucad/runtime` type surface; tooling that audits public exports should confirm they are absent.

### Finding 18: connect() is explicit and required — manually invoked by cad.machine

**Status from v3: KEPT (explicit & required).** v3 prescribed "fully lazy with an opt-in `connect()` method for explicit pre-warm" (v3 R10). v5 (pre-amendment) tried to drop the method entirely in favour of auto-connect on the first command. Implementation review reverses that: **`connect(options)` stays as a first-class public method**, and connection is required before any command may be issued.

**Why auto-connect was rejected on review**:

The auto-connect proposal assumed connection options could be pushed into `createRuntimeClient(options)` at construction time. They cannot, in production wiring:

| Connection option                                      | Source                                                            | Construction-time availability                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `port: MessagePort`                                    | `useFileManager` hook → `fileManager.machine` snapshot            | Not available at `createRuntimeClient` time — needs the FM machine's worker port, which the FM machine allocates lazily |
| `filePoolBuffer: SharedArrayBuffer`                    | `fileManager.machine.context.filePoolBuffer`                      | Same — allocated by the FM machine, not by the runtime                                                                  |
| `fileSystem: FileSystem` (Node)                        | `fromNodeFs(rootDir)` constructed at command-line resolution      | Available in the CLI but flows through `createNodeClient`, not direct construction                                      |
| `renderTimeout`, `kernelOptions`, `transcoderRegistry` | Per-pane invocation (autonomous mode), per-command override (CLI) | Often invocation-local                                                                                                  |

Pushing all of these into construction would force `cad.machine` to defer `createRuntimeClient(...)` until _after_ the FM machine reaches `ready` and exposes its `filePoolBuffer` — which is exactly what the existing explicit `connect(...)` step does today. The auto-connect proposal traded one explicit `await client.connect(...)` line for an architecturally equivalent (but less transparent) construction-time barrier.

**v5 contract**:

- `createRuntimeClient(options)` constructs a client with its kernel/transcoder registry, render timeout, and cooperative-abort options. Construction does **not** establish the worker, transport, or kernel binding; no I/O happens.
- `client.connect(connectOptions): Promise<void>` is required. `connectOptions` carries the runtime-local items: `{ port?, filePoolBuffer?, fileSystem? }`. At least one of `port` or `fileSystem` must be present.
- Calling any command (`openFile`, `updateParameters`, `setOptions`, `export`) before `connect()` resolves rejects synchronously (or microtask-async for in-flight cases) with `RuntimeNotConnectedError`. The runtime client never auto-bootstraps a connection — the consumer is the source of truth for _when_ the connection happens.
- `connect()` is idempotent in a constrained sense: calling it twice with the same options resolves the same shared Promise; calling it twice with different options throws `RuntimeReconnectError` synchronously (you cannot mutate the connection — terminate the client and create a new one instead).
- Connection failure rejects with `RuntimeConnectionError` (typed, with `cause: 'transport-construction' | 'capabilities-resolution' | 'kernel-binding' | 'port-handshake'`). Failure does **not** transition the client to terminated state; the consumer may retry by calling `connect()` again with the same or new options.
- Synchronous read-only getters (`capabilities`, `activeKernelId`) and synchronous capability queries (`routesFor`, `bestRouteFor`) return `undefined` / `[]` before `connect()` resolves. Once it resolves they reflect the connected manifest.
- `client.on('capabilities', …)` fires once on connection settlement, regardless of when the subscription was attached (subscribe-anytime per `library-api-policy.md` §7).
- The active state machine of the client is `unconnected → connecting → connected → terminated`. Each transition is observable via `on('state', ...)` and via `client.lifecycleState` (a typed read-only getter).

**Production caller inventory**:

| Caller                                            | Connect site                                                                             | Notes                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/ui/app/machines/cad.machine.ts`             | `connectKernelActor` (currently line ~190)                                               | Sole production caller; existing call site is preserved post-migration |
| `apps/ui/app/machines/cad-preview.machine.ts`     | n/a — preview machine spawns its own `cadMachine` actor and inherits the connect pattern | No direct connect call                                                 |
| `packages/cli/src/commands/export.ts`             | Indirectly via `createNodeClient(...)`                                                   | The factory awaits `connect(...)` internally before returning          |
| `packages/runtime/src/node/create-node-client.ts` | Internal `await client.connect({ fileSystem })`                                          | Hides connect behind the Node factory                                  |
| Tests                                             | Per-test `await client.connect({ ... })` in fixtures                                     | Direct caller; no change from today                                    |

The _only_ migration this finding requires is the connection-options shape — moving `port`/`filePoolBuffer`/`fileSystem` into `ConnectOptions` and out of any other code path that currently smuggles them in via `createRuntimeClient`. **No call site is deleted.**

**Why this is strictly better than the auto-connect proposal**:

| Property                                    | Auto-connect (v5 pre-amendment)                     | Explicit `connect()` (v5 final)                                    |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `cad.machine` rewiring                      | FM machine becomes `createRuntimeClient` parent     | Unchanged from today                                               |
| First-command behaviour                     | Implicitly waits for connection                     | Synchronous error if not connected                                 |
| Connection-failure recovery                 | Per-call retry                                      | `client.connect()` retry loop owned by consumer                    |
| Discoverability of connection step          | Hidden                                              | Explicit method in IDE autocomplete                                |
| Equivalence with `createNodeClient` factory | Forces every consumer to mirror the factory pattern | Factory is the optional sugar; direct callers see the same surface |

**Library API Policy compliance**:

- §1 single concern: ✅ `connect()` owns the activation step distinctly from construction.
- §3 async returns Promise: ✅ `Promise<void>`.
- §4 ≤3 positional: ✅ (1).
- §6 errors typed: ✅ `RuntimeConnectionError`, `RuntimeReconnectError`, `RuntimeNotConnectedError`.
- §7 no void async: ✅ returns `Promise<void>` (not `void`).

### Finding 19: terminate() is deterministic — no hanging Promises, no orphan handlers

**Status from v4: NEW (v3 left this implicit).**

User direction: "make the terminate behaviour specific, we must avoid all hanging promises." Today's implementation has subtle gaps: in-flight `render` Promises can hang past `terminate()` if the worker's last response was already in-flight on the postMessage channel; `on(...)` handlers may fire one final event after termination if the message was already queued.

**v5 contract** for `terminate()`:

1. **In-flight Promise rejection (microtask-async)**: All Promises returned by `connect`, `openFile`, `updateParameters`, `setOptions`, and `export` that have not yet resolved/rejected reject on the **next microtask** with `RuntimeTerminatedError`. Microtask-async (not synchronous) so callers in the middle of iterating `.then()` chains are not re-entered. Termination during `connect()` cancels the in-flight transport handshake; the consumer must construct a new client to retry.
2. **Subscription auto-disposal**: All `on(...)` subscriptions registered before `terminate()` stop firing immediately. The `Unsubscribe` functions returned earlier become no-ops if invoked post-terminate.
3. **Subsequent calls throw synchronously**: Calling any method on a terminated client throws `RuntimeTerminatedError` synchronously. This includes `on(...)` (cannot subscribe to a terminated client) and the synchronous getters (which throw rather than return stale data).
4. **Idempotent**: `client.terminate()` called twice is a no-op the second time. No double-throw, no double-rejection.
5. **Worker teardown**: `transport.close()` is invoked synchronously inside `terminate()`. The transport implementation is responsible for terminating the underlying worker (`worker.terminate()`) and releasing any internally-held SAB allocations and `SharedPool` instances.
6. **No orphan messages**: Any `postMessage` events the transport receives after `transport.close()` are dropped silently. The runtime client must not dispatch them to subscribers (subscriptions are already disposed by step 2) or use them to settle Promises (Promises are already rejected by step 1).
7. **terminate() is synchronous-void**: `terminate(): void`. Consumers do not `await` it. There is no "drain" mode — drain semantics belong to the consumer (await pending Promises before calling `terminate()`).

**Typed error**: `RuntimeTerminatedError extends Error` with discriminator `code: 'RUNTIME_TERMINATED'` and `cause?: 'explicit' | 'connection-failed' | 'transport-closed'`. The `cause` lets consumers distinguish user-initiated termination from involuntary teardown (e.g., the underlying worker crashed and the runtime client transitioned to terminated state to clean up).

**Why microtask-async rejection (not sync)**: synchronous rejection inside `terminate()` would re-enter consumer code while `terminate()` is still executing. If a `.then()` handler on the rejected Promise calls another method on the same client, it would observe the client in a half-terminated state (Promises rejected but transport not yet closed). Microtask-async ensures `terminate()` completes its full teardown before any rejection handler runs.

**Tests**: a `client.terminate()` test suite must lock all seven invariants. `R36` adds these.

**Library API Policy compliance**:

- §6 errors typed: ✅ `RuntimeTerminatedError` is a typed discriminated error.
- §7 subscribe-anytime: ✅ subscriptions are disposed at terminate, but the contract is "subscribe before terminate works; subscribe after terminate throws" — well-defined.
- §10 no high-level wrappers: ✅ no drain helpers added.

### Finding 20: createWebSocketTransport pre-stub validates the abstraction

**Status from v3: Survives.**

Even though no production consumer ships a remote transport today, pre-stubbing `createWebSocketTransport(url)` to implement the behaviour-complete `RuntimeTransport` interface (with `send`/`signalAbort` throwing `'not implemented'`) does two things:

1. **Type-checks the abstraction**: if the interface ever leaks SAB-shaped requirements, the WebSocket stub will fail to implement it. The stub is a compile-time guard against future regressions.
2. **Documents the forward path**: the stub's source code shows exactly how a remote transport would implement each method (e.g., `observeWorkerState` becomes a wire-message subscription, `signalAbort` becomes a wire command, `resolveGeometry` returns inline bytes from the wire response).

**v5 prescription**: ship `createWebSocketTransport` as a stub in `packages/runtime/src/transport/websocket-transport.ts`. Mark it `@internal` until a real implementation lands. Add a transport contract test that instantiates each transport (`createInProcessTransport`, `createWorkerTransport`, `createWebSocketTransport`) and asserts they all satisfy the same interface shape via a `assertConformsToTransport(transport)` helper.

### Should consumers see SAB? A transparency analysis

**Question**: should SAB-vs-fallback be **fully internalised** to the client (consumer-transparent) or should the consumer make the choice themselves?

**Answer**: fully internalised, with a narrow opt-in for advanced cases.

| Decision axis                      | Internalise                                   | Expose                           |
| ---------------------------------- | --------------------------------------------- | -------------------------------- |
| Consumer code complexity           | ✓ Single API surface                          | ✗ Branching code per environment |
| Future-proofing for new transports | ✓ Add transport, no consumer change           | ✗ Every consumer must update     |
| Testability                        | ⚠ Need force-degrade hook for tests           | ✓ Tests can pick mode            |
| Diagnostics / observability        | ⚠ Need readonly descriptor accessor           | ✓ Trivial                        |
| Performance tuning by consumer     | ⚠ Consumer can swap transport at construction | ✓ Direct knob                    |

The rule that resolves this:

- **Control flow**: never branch on transport mode. Internalise. (Finding 15.)
- **Diagnostics**: expose `transport.describe()` for telemetry, debug overlays, and "why is my geometry slow?" investigations.
- **Tuning**: consumers express preference by constructing the transport they want (`createInProcessTransport({ shared: false })` to force degradation in tests) — not by calling a runtime knob on the client.

This mirrors the philosophy of `fetch` (transport details are properties of the request/response, not knobs on consumers) and Three.js renderers (consumers choose the renderer at construction; rendering code is renderer-agnostic).

The CLI is a clean test of the rule: `taucad export` works in Node where `crossOriginIsolated` is irrelevant, in a browser where it might be true or false, and (future) over a WebSocket to a remote runtime worker. The CLI source code never references SAB. v5 preserves that property for every consumer.

### Target Transport Architecture

A four-layer model where each layer hides the implementation details of the layer below.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 4: Consumer surface (apps, CLI, tests)                        │
│  • await client.connect({ port?, filePoolBuffer?, fileSystem? })     │
│  • await client.openFile({ file, parameters?, options? })            │
│  • await client.updateParameters(parameters)                         │
│  • await client.export(format, options?)                             │
│  • client.on('geometry' | 'state' | 'error' | 'progress' | …, cb)    │
│  • client.capabilities (kernels, transcoders)                        │
│  • client.terminate()                                                │
│  ── Explicit connect(). No generations. No SAB. No requestIds. ──    │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 3: Runtime client (correlation, coalescing, lifecycle)        │
│  • Pending render Promise (one outstanding per intent kind at a time)│
│  • Subscribes once to transport.observeWorkerState (single channel)  │
│  • Forwards events to subscribers in arrival order                   │
│  • Explicit connect(); commands before connect throw                 │
│  • Lifecycle: unconnected → connecting → connected → terminated      │
│  • Deterministic terminate (rejects in-flight, disposes subscriptions)│
├──────────────────────────────────────────────────────────────────────┤
│  Layer 2: Behaviour-complete transport                               │
│  • send(command, transferables?)                                     │
│  • onMessage(RuntimeResponse)                                        │
│  • observeWorkerState(handler) → unsubscribe                         │
│  • signalAbort(reason)                                               │
│  • resolveGeometry(payload) → Promise<Geometry>                      │
│  • describe() → diagnostic descriptor (read-only)                    │
│  • close()                                                           │
│  • Implementations:                                                  │
│    - createInProcessTransport (SAB internally when COI available)    │
│    - createWorkerTransport    (SAB internally when COI available)    │
│    - createWebSocketTransport (future, fully message-based)          │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 1: Wire protocol (JSON + optional Transferables)              │
│  • RuntimeCommand / RuntimeResponse — JSON-serialisable              │
│  • Each command carries an internal requestId (string)               │
│  • Each response either carries a requestId (correlated) or          │
│    'autonomous' (broadcast)                                          │
│  • Geometry payloads: inline bytes OR pool key (when SAB)            │
└──────────────────────────────────────────────────────────────────────┘
```

Internally, between layers 1 and 3, a single SAB slot survives: `signalSlot.abortGeneration` (plus the implementation-coupled `abortReason`). It is never exposed outwards.

**Per-implementation contract**:

| Transport                         | `observeWorkerState`                                                       | `signalAbort`                                                                                                                       | `resolveGeometry`                                                        | `describe().sharedMemory` |
| --------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------- |
| `createInProcessTransport`        | Drains the same `postMessage` ring as `onMessage`; no separate SAB monitor | If COI → `Atomics.store(signalView, abortGeneration, ++gen)` + `Atomics.notify`; else → wire `{ type: 'abort', requestId, reason }` | If pool key → `pool.resolve(key)`; else → inline bytes from the response | `crossOriginIsolated`     |
| `createWorkerTransport`           | Same as in-process; reads from one `postMessage` stream                    | Same dual path as in-process                                                                                                        | Same dual path as in-process                                             | `crossOriginIsolated`     |
| `createWebSocketTransport` (stub) | Wire-message subscription                                                  | Wire command `{ type: 'abort', requestId, reason }`                                                                                 | Inline bytes from wire response (no SAB ever)                            | `false`                   |

The runtime client calls `transport.observeWorkerState(...)`, `transport.signalAbort(reason)`, and `transport.resolveGeometry(payload)` — never `Atomics.*`, never `crossOriginIsolated`, never `pool.resolve(key)` directly.

### Cooperative Abort Plumbing

The full chain from a supersession trigger to the WASM polling loop:

```
1. User issues client.updateParameters(newParams)               ← Consumer call
2. Runtime client coalesces: bumps internal pendingIntentId    ← Layer 3 (private)
3. Runtime client → transport.signalAbort('supersede')         ← Layer 2 contract
4. In-process/worker transport:
     Atomics.store(signalView, signalSlot.abortGeneration, ++gen)
     Atomics.store(signalView, signalSlot.abortReason, REASON_SUPERSEDE)
     Atomics.notify(signalView, signalSlot.abortGeneration, +∞)
   WebSocket transport:
     ws.send({ type: 'abort', requestId, reason: 'supersede' })
5. Worker:
     cooperative-abort.ts: WASM polling reads abortGeneration
       → if gen > localGen → throw RenderAbortedError from inside WASM
6. Worker emits { type: 'error', code: 'RENDER_ABORTED', requestId } via postMessage
7. Layer 3 sees the abort error, settles the prior pending Promise's
   RenderSettlement as { superseded: true } (not as a rejection — supersede
   is a normal lifecycle transition, only RuntimeTerminatedError rejects)
8. New render proceeds with new pendingIntentId
```

The cooperative-abort module (`cooperative-abort.ts`) is `@internal`; consumers never see it. The wire-format `{ type: 'abort' }` command is the WebSocket-friendly fallback when SAB is unavailable.

## Target API Surface

```typescript
type RuntimeClient<Kernels, Transcoders> = {
  // ----- Lifecycle -----
  // connect() is explicit and required before any command (Finding 18).
  // terminate() rejects in-flight Promises and disposes subscriptions (Finding 19).
  connect(options: ConnectOptions): Promise<void>;
  terminate(): void;

  // ----- Autonomous live-render mode -----
  openFile(input: OpenFileInput): Promise<RenderSettlement>;
  updateParameters(parameters: Record<string, unknown>): Promise<RenderSettlement>;
  setOptions(options: KernelOptions<Kernels>): Promise<RenderSettlement>;

  // ----- Imperative one-shot mode (also the live "Save As" verb) -----
  export(format: Format): Promise<ExportResult>;
  export(format: Format, options: ExportOptions): Promise<ExportResult>;

  // ----- Capability queries (synchronous, read-only) -----
  // Return undefined / [] before connect() resolves; after, reflect the connected manifest.
  routesFor(format: Format): readonly ExportRoute[];
  bestRouteFor(format: Format, kernelId?: KernelId): ExportRoute | undefined;

  // ----- Read-only state -----
  // capabilities / activeKernelId are undefined before connect() resolves.
  readonly capabilities: CapabilitiesManifest | undefined;
  readonly activeKernelId: KernelId | undefined;
  readonly lifecycleState: 'unconnected' | 'connecting' | 'connected' | 'terminated';

  // ----- Event subscriptions (autonomous-mode delivery) -----
  // Subscribe-anytime per library-api-policy.md §7. Auto-disposed on terminate().
  on(event: 'geometry', handler: (result: HashedGeometryResult) => void): Unsubscribe;
  on(event: 'state', handler: (state: WorkerState, detail?: string) => void): Unsubscribe;
  on(event: 'progress', handler: (progress: number) => void): Unsubscribe;
  on(event: 'error', handler: (error: KernelIssue) => void): Unsubscribe;
  on(event: 'parametersResolved', handler: (result: ParametersResolved) => void): Unsubscribe;
  on(event: 'capabilities', handler: (manifest: CapabilitiesManifest) => void): Unsubscribe;
  on(event: 'log', handler: (entry: LogEntry) => void): Unsubscribe;
  on(event: 'telemetry', handler: (entry: TelemetryEntry) => void): Unsubscribe;
  on(event: 'activeKernelChanged', handler: (id: KernelId) => void): Unsubscribe;
};
```

`createRuntimeClient(options)` carries kernel/transcoder registries, render timeout, and cooperative-abort options. Runtime-local items (`port`, `filePoolBuffer`, `fileSystem`) are passed to `connect(options)` at activation time by the caller (see [Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)).

### Input shapes

```typescript
type ConnectOptions = {
  // Exactly one of `port` or `fileSystem` is required.
  // `filePoolBuffer` is required when the file manager exposes a file SAB pool.
  port?: MessagePort;
  filePoolBuffer?: SharedArrayBuffer;
  fileSystem?: FileSystem;
};

type OpenFileInput =
  | { file: string | { path: string; filename: string }; parameters?: Record<string, unknown>; options?: KernelOptions }
  | { code: Record<string, string>; file?: string; parameters?: Record<string, unknown>; options?: KernelOptions };

type ExportOptions = {
  file?: string | { path: string; filename: string };
  code?: Record<string, string>;
  parameters?: Record<string, unknown>;
  // Per-format options merged in by the schema-resolved manifest
  [key: string]: unknown;
};

type RenderSettlement = { superseded: false; geometry: HashedGeometryResult } | { superseded: true };
```

> Note: `ConnectOptions` is the **only** v5 location where `MessagePort` / `SharedArrayBuffer` types appear on the `RuntimeClient` public surface. They are accepted opaquely and forwarded to the transport layer; the runtime client never reads from them directly (see [Finding 15](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct)).

### Removed from today's surface

| Removed                                 | Replaced by                                                                                      | Rationale                                                                   | Production call sites to migrate                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render(input)`                         | `openFile`/`updateParameters` for autonomous mode; `export(format, options)` for imperative mode | Mode confusion; `Geometry` already carries only bytes                       | None in production (only tests/benchmarks); see [Appendix A](#appendix-a-full-consumer-call-site-inventory) and [Appendix F](#appendix-f-per-symbol-migration-call-site-inventory)                                                                                                                         |
| `setFile(file, params, options)` (void) | `openFile(input): Promise<RenderSettlement>`                                                     | Rename + Promise per §7                                                     | `cad.machine.ts:353,361,499`; `cad-preview.machine.ts` (no direct call but inherits via spawned actor); `kernel.integration.test.ts:174`; `runtime-worker-client.test.ts` (×6); `render-input.test-d.ts:358`                                                                                               |
| `setParameters(params)` (void)          | `updateParameters(params): Promise<RenderSettlement>`                                            | Rename + Promise per §7                                                     | `cad-preview.machine.ts:64,116`; `runtime-worker-client.test.ts` (×3)                                                                                                                                                                                                                                      |
| `notifyFileChanged(paths)`              | Internal worker file-watch loop                                                                  | v3 F8 redundant in filesystem mode                                          | `runtime-client.ts:796` (internal — moves into `openFile({ code })` private path); `benchmark-runner.ts:235` (rewrite per R14); `runtime-client.test.ts:243`; `in-process-transport.test.ts:145`. Worker-level direct calls (`worker.notifyFileChanged(...)` in kernel tests) stay — they are internal API |
| `cancelPendingRender()`                 | Built into supersession of `openFile`/`updateParameters`                                         | v3 F11 subsumed                                                             | None known on the public client surface                                                                                                                                                                                                                                                                    |
| `setRenderTimeout(ms)`                  | `RuntimeClientOptions.renderTimeout` (constructor) **or** `setOptions({ renderTimeout })` (live) | v3 F9 duplicate                                                             | `cad.machine.ts:371,501`; `runtime-worker-client.test.ts` (×4)                                                                                                                                                                                                                                             |
| `geometryPool` getter                   | Internal                                                                                         | v3 F10 leaks SAB                                                            | None — currently only read by internal pipeline code                                                                                                                                                                                                                                                       |
| `lastRequestedGeneration` getter        | Internal                                                                                         | Never needed publicly                                                       | None                                                                                                                                                                                                                                                                                                       |
| `incrementAbortGeneration()`            | Internal supersession                                                                            | Never needed publicly                                                       | None                                                                                                                                                                                                                                                                                                       |
| `on('activeKernel', ...)`               | `on('activeKernelChanged', ...)`                                                                 | Verb-tense parity with `geometry`/`state`/`error`                           | `cad.machine.ts` (1 site); any test asserting the event name                                                                                                                                                                                                                                               |
| `on('fileResolutionFailed', ...)`       | `on('error', ...)` with typed bundle issue                                                       | Had no consumer; the equivalent failure surfaces through `on('error', ...)` | None — never wired up to any consumer                                                                                                                                                                                                                                                                      |

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Priority | Effort | Impact                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------- |
| R1  | Add `openFile(input): Promise<RenderSettlement>` to `RuntimeClient`; resolves on settlement, returns `{ superseded: true }` if a newer call wins                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | P0       | M      | Foundational                                 |
| R2  | Add `updateParameters(parameters): Promise<RenderSettlement>` with same settlement semantics as R1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P0       | M      | Foundational                                 |
| R3  | Keep `export(format)` and `export(format, options)` overloads exactly as the implementation supports today; document `NoActiveRenderContextError` for the no-options form on a fresh client                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P0       | S      | Clarifies workhorse                          |
| R4  | Remove `render(input)` from the public `RuntimeClient` surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P0       | S      | Eliminates dichotomy                         |
| R5  | **No invariant added.** Keep the existing opportunistic `nativeHandle` cache behaviour in `kernel-worker.ts` unchanged. Document in a one-line comment that the cache is an optimization for repeated identical-input exports, not a contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P0       | XS     | Avoids over-engineering                      |
| R6  | Migrate `useRender` (`packages/react/src/hooks/use-render.ts`) to call `openFile`/`updateParameters` and subscribe to `'geometry'` / `'state'` / `'parametersResolved'` events; drop the `useEffect`/`cancelled` pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P0       | M      | Production hook correctness                  |
| R7  | Migrate `cad.machine.ts` (`apps/ui/app/machines/cad.machine.ts`): replace `client.setFile` → `client.openFile`, `client.setParameters` → `client.updateParameters`. Add internal `lastRequestedIntentId` / `lastSettledIntentId` tokens for freshness coordination ([Finding 10](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface)). These tokens are XState-internal — they do not appear on `RuntimeClient`                                                                                                                                                                                                                                                                                              | P0       | M      | UI parity + freshness foundation             |
| R8  | **Reborn `awaitFreshRender` helper** at `apps/ui/app/machines/await-fresh-render.ts`: implements the algorithm in [Finding 10](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface), reads `cad.machine.context.geometry`, optionally re-issues `openFile`, awaits state settlement                                                                                                                                                                                                                                                                                                                                                                                                                           | P0       | M      | RPC freshness                                |
| R9  | Migrate RPC handlers (`apps/ui/app/hooks/rpc-handlers.ts`): keep the existing event-driven path but route through the reborn `awaitFreshRender`. **Do NOT migrate to `client.export`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P0       | M      | Preserves parity property                    |
| R10 | Migrate API benchmark consumer (`apps/api/app/benchmarks/model-benchmark-geometry.ts:56`): `client.render → client.export('glb', { code, file })`; drop the `result.data.find(...)` extraction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P0       | S      | Benchmark correctness                        |
| R11 | Migrate analysis test (`apps/api/app/api/analysis/geometry-analysis.service.test.ts:28`): `client.render → client.export('glb', ...)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P1       | S      | Test consistency                             |
| R12 | Migrate testing-package tests (`packages/testing/src/geometry/{analyze-glb,connected-components,evaluate-requirement,watertight}.test.ts`): one-line rename                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P1       | S      | Test consistency                             |
| R13 | Migrate `kernel-geometry-testing.utils.ts`: `extractGltfFromResult(CreateGeometryResult)` → `extractGltfFromExportResult(ExportResult)`; rewrite `createGeometryTestHelpers` to consume `ExportResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P1       | S      | Helper alignment                             |
| R14 | Migrate runtime benchmark runner (`packages/runtime/src/benchmarks/benchmark-runner.ts:235`): `client.render → client.export('glb', ...)`. Replace `client.notifyFileChanged(...)` with file-write→export pattern (each iteration is independent)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P1       | M      | Benchmark correctness                        |
| R15 | Verify AR conversion (`apps/ui/app/hooks/use-ar.ts`) and Quick Export (`chat-converter.tsx`, `chat-parameters.tsx`, `use-export-to-disk.ts`) — already on `client.export`; no changes expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P2       | XS     | Verification                                 |
| R16 | Migrate transport-level test (`packages/runtime/src/transport/in-process-transport.test.ts`): `render → export('glb', ...)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P1       | S      | Test consistency                             |
| R17 | Migrate runtime client test suite (`packages/runtime/src/client/runtime-client.test.ts`): ~25 `client.render` calls. Each becomes `export('glb', ...)` for one-shot intent or `openFile(...)` + event-await for autonomous intent. Audit each call for which mode the test is exercising                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P1       | L      | Test consistency + coverage realignment      |
| R18 | Migrate runtime worker-client test (`packages/runtime/src/framework/runtime-worker-client.test.ts`): 7 `client.render` calls. Same audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P1       | M      | Test consistency                             |
| R19 | Update type-level tests (`packages/runtime/src/types/define-plugin.test-d.ts`, `packages/runtime/src/client/render-input.test-d.ts`): replace `client.render(...)` type assertions with `client.export(...)` and `client.openFile(...)` assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P1       | M      | Type-level coverage                          |
| R20 | Worker-level tests (`packages/runtime/src/framework/kernel-worker.test.ts`, `packages/runtime/src/kernels/replicad/replicad.kernel.test.ts`, `kernels/openscad/src/openscad.kernel.test.ts`) call `worker.render(...)` directly — that is internal API; assess whether the worker-level surface should also rename or stay                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P2       | M      | Internal API decision                        |
| R21 | Update `runtime-topology.md` protocol table: remove `render(...)` row from the public surface; document `openFile`/`updateParameters` and both `export` overloads. **Do not document an always-warm-handle invariant** — note only that the existing `nativeHandle` cache is an opportunistic optimization                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P0       | S      | Architecture doc parity                      |
| R22 | Update `library-api-policy.md` if needed: add an example of "supersession with auto-resolved Promise" pattern for the `RenderSettlement` discriminated union                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P2       | S      | Policy reference                             |
| R23 | Add a runtime-client test asserting `client.export('glb')` (no options) on a freshly-connected client throws `NoActiveRenderContextError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | P0       | S      | Lock the contract                            |
| R24 | Add a runtime-client test asserting `client.openFile(...)` Promise resolves with `{ superseded: true }` when a second call follows before the first settles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P0       | S      | Lock the contract                            |
| R25 | Add a `cad.machine` test for `lastRequestedIntentId` / `lastSettledIntentId` tracking — bumps on every `openFile`/`updateParameters`, settles on `'geometry'` event arrival; out-of-order events do not regress `lastSettledIntentId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P0       | M      | Lock the freshness primitive                 |
| R26 | Add an `awaitFreshRender` test suite (`apps/ui/app/machines/await-fresh-render.test.ts`): settled-no-op, defensive `openFile` re-issue when intent mismatches context, no-preempt for in-flight render covering the request, RENDER_TIMEOUT, monotonic-safe out-of-order completion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | P0       | M      | Lock the helper                              |
| R27 | Re-write `rpc-handlers.test.ts` using real `cadMachine` + `vitest-mock-extended`: bootstrap, mid-render covering, post-edit fresh snapshot via event arrival, NO_TOP_LEVEL_GEOMETRY, FILE_NOT_FOUND, RENDER_TIMEOUT, headless graphics, parity between `getKernelResult` and `fetchGeometry`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P0       | L      | RPC correctness                              |
| R28 | Update `@taucad/runtime` JSDoc and `README` to lead with the autonomous-mode story (open + subscribe) and the imperative-mode story (export); remove all `client.render(...)` examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | P1       | M      | DX clarity                                   |
| R29 | Update `useRender` JSDoc to describe the new event-driven pattern; update its `@example` block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | P1       | S      | Public API docs                              |
| R30 | **Behaviour-complete `RuntimeTransport`**: add the methods `observeWorkerState`, `signalAbort`, `resolveGeometry`, `describe`, `close`. Implement in `createInProcessTransport` and `createWorkerTransport`. The runtime client reads zero `signalView` / `crossOriginIsolated` / `SharedArrayBuffer` references after this lands ([Finding 15](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct))                                                                                                                                                                                                                                                                                                                                           | P0       | M      | Foundational                                 |
| R31 | **Single ordered event channel**: route all worker→main events through `postMessage` in worker emit order. Drop the v2 idea of gating `stateChanged` on `!sabPresent`; state events always come via `postMessage` regardless of SAB presence ([Finding 16](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel))                                                                                                                                                                                                                                                                                                                                                                                                                              | P0       | M      | High                                         |
| R32 | **Shrink the SAB layout** to `signalSlot.abortGeneration` + `signalSlot.abortReason` only. Remove `signalSlot.workerState` and `signalSlot.progressPercent`. Mark `cooperative-abort.ts`, `signalSlot`, `AbortReason` as `@internal` ([Finding 17](#finding-17-sab-scope--single-internal-abortgeneration-and-its-abortreason-cousin))                                                                                                                                                                                                                                                                                                                                                                                                                                        | P0       | M      | High                                         |
| R33 | **Wire-format `{ type: 'abort', requestId, reason }`** command for transports without SAB. Worker handler increments local `renderGeneration` from the message ([Finding 17](#finding-17-sab-scope--single-internal-abortgeneration-and-its-abortreason-cousin) + [Cooperative Abort Plumbing](#cooperative-abort-plumbing))                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P0       | S      | Forward-compat                               |
| R34 | **Keep `connect(options): Promise<void>` as required public method**. Define `ConnectOptions = { port?, filePoolBuffer?, fileSystem? }`. Add typed `RuntimeNotConnectedError` (commands before connect), `RuntimeConnectionError` (connect failed), `RuntimeReconnectError` (connect called twice with different options). Add `lifecycleState: 'unconnected' \| 'connecting' \| 'connected' \| 'terminated'` read-only getter. **Do not** add auto-connect; `cad.machine` is the sole production caller and remains so post-migration ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))                                                                                                                                           | P0       | S      | Lock the lifecycle                           |
| R35 | **Connect-time guard**: add a synchronous `assertConnected()` internal helper called at the top of every command method (`openFile`, `updateParameters`, `setOptions`, `export`). It throws `RuntimeNotConnectedError` if `lifecycleState !== 'connected'`. Add `runtime-client-connect.test.ts` covering: connect success transitions through all four states; commands before connect throw synchronously; connect failure leaves client in `unconnected` (re-callable); connect called twice with same options resolves the same Promise; connect called twice with different options throws `RuntimeReconnectError`; connect after terminate throws `RuntimeTerminatedError` ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)) | P0       | M      | Lock the contract                            |
| R36 | **Deterministic `terminate()`**: implement the seven-invariant contract from [Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers). Add a typed `RuntimeTerminatedError` with `cause: 'explicit' \| 'connection-failed' \| 'transport-closed'`. Add a `terminate.test.ts` that locks each invariant: in-flight rejection on next microtask (including in-flight `connect()`), subscriptions disposed, subsequent calls throw, idempotent, transport closed, no orphan messages, sync-void return                                                                                                                                                                                                                                       | P0       | M      | Lock the contract                            |
| R37 | **Pre-stub `createWebSocketTransport(url)`** implementing the behaviour-complete `RuntimeTransport` interface, with `send`/`signalAbort` throwing `'not implemented'`. Mark `@internal`. Add a transport conformance test (`assertConformsToTransport(transport)`) that all three transports must satisfy ([Finding 20](#finding-20-createwebsockettransport-pre-stub-validates-the-abstraction))                                                                                                                                                                                                                                                                                                                                                                             | P1       | S      | Forward-compat validation                    |
| R38 | **Rename public event `'activeKernel'` → `'activeKernelChanged'`** so the public surface matches the wire protocol (the worker dispatcher, `RuntimeResponse` discriminator, and worker-client decode path already use `activeKernelChanged` — only the public `RuntimeClient` event-bag still uses the legacy short name). Touch points: `runtime-client.ts` event-bag key, `on(...)` typed overload, internal handlers `Set`, replay-on-subscribe branch, JSDoc; `cad.machine.ts` `client.on(...)` call; `runtime-client.test.ts` subscription assertions. The full file:line inventory is in [Appendix F.6](#f6--clientonactivekernel----clientonactivekernelchanged--r38-phase-3b)                                                                                         | P0       | S      | Public-surface parity with the wire protocol |
| R39 | **Remove `on('fileResolutionFailed', ...)`** from the `RuntimeClient` event surface. Delete the matching emit path in the runtime worker. The equivalent failure surfaces through `on('error', ...)` with a typed `BundleError`; tests must assert that path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | P0       | S      | Drop unused surface                          |
| R40 | **Keep `on('telemetry', ...)`** as a public event with a typed `TelemetryEntry` payload (timestamp, name, attributes, durationMs?). Used by debug overlays and OTEL collectors. Audit the existing emit sites in the worker; ensure the type is exported from `@taucad/runtime`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P0       | S      | Telemetry surface contract                   |
| R41 | **Explicit removal of `setFile` / `setParameters` / `setRenderTimeout` / `notifyFileChanged`** from the `RuntimeClient` interface and runtime-client.ts implementation, after consumer migration completes (Phase 4). Removal is unconditional — there are no shims, deprecation warnings, or backwards-compat wrappers. Confirm via a public-API audit that no exported symbol references the old names. Removal call site checklist is in [Appendix F](#appendix-f-per-symbol-migration-call-site-inventory)                                                                                                                                                                                                                                                                | P0       | S      | Hard surface deletion                        |

## Migration Plan

The migration is one coordinated change because the public methods `render`, `setFile`, `setParameters`, `setRenderTimeout`, `notifyFileChanged`, `cancelPendingRender`, `geometryPool`, `lastRequestedGeneration`, and `incrementAbortGeneration` are being removed. `connect` is **not** removed — it is kept and tightened (typed errors, lifecycle state). Sequencing matters: transport refactor and runtime impl land first (no consumer-visible change), then new surface, then event renames, then consumer migration, then removal.

### Phase A — Transport refactor (P0, internal-only, no consumer-visible change)

Pure refactor that consolidates SAB ownership inside the transport layer. No public API change.

- **R30**: add `observeWorkerState` / `signalAbort` / `resolveGeometry` / `describe` / `close` to `RuntimeTransport`; implement in `createInProcessTransport` and `createWorkerTransport`. Move SAB allocation out of the runtime client.
- **R31**: route all worker→main events through one `postMessage` channel in worker emit order.
- **R32**: shrink the SAB layout to `signalSlot.abortGeneration` + `signalSlot.abortReason`. Remove `signalSlot.workerState` / `signalSlot.progressPercent`.
- **R33**: add wire-format `{ type: 'abort', requestId, reason }` for non-SAB transports.
- **R37**: pre-stub `createWebSocketTransport(url)` to validate the abstraction.
- Tests: each transport's `describe()` reports correctly; the `assertConformsToTransport(t)` helper passes for all three; cross-channel state ordering tests start passing deterministically.

After Phase A the runtime client reads zero `signalView` / `crossOriginIsolated` / `SharedArrayBuffer` references and consumer behaviour is unchanged.

### Phase 0 — Foundations (P0, parallelisable, no consumer-visible change)

- **R5** (no-op): document the `nativeHandle` cache comment.
- **R21**: update `runtime-topology.md` protocol table (no invariant section); document Phase A's transport contract there too.

### Phase 1 — New surface, parallel to old (P0)

- **R1, R2, R3**: add `openFile`, `updateParameters`, document `export` overloads. Old `render`, `setFile`, `setParameters` remain temporarily so consumer migration can land independently.
- **R23, R24**: lock the no-context export error and the supersession-Promise behaviour with tests.

### Phase 2 — Freshness foundation (P0, depends on Phase 1)

- **R7**: `cad.machine.ts` rename + add internal intent-ID tracking.
- **R8**: implement `awaitFreshRender` helper.
- **R25, R26**: lock the helper and the cad.machine tracking with tests.

### Phase 3 — Lifecycle contract (P0, depends on Phase A + Phase 1)

- **R34**: define `ConnectOptions`, the `lifecycleState` getter, and the typed errors (`RuntimeNotConnectedError`, `RuntimeConnectionError`, `RuntimeReconnectError`). Update `runtime-client.ts` to enforce the lifecycle.
- **R35**: implement the connect-time guard on every command method; land `runtime-client-connect.test.ts` locking the contract.
- **R36**: implement deterministic `terminate()`. Land `terminate.test.ts` locking the seven invariants from [Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers).
- **No production caller migration in this phase.** `cad.machine.ts` already calls `await client.connect({ port, filePoolBuffer })`; the only change is that the options shape is now typed as `ConnectOptions` and `port`/`filePoolBuffer` are no longer passed via positional/legacy paths.

### Phase 3b — Event surface renames (P0, depends on Phase 1)

- **R38**: rename the public `RuntimeClient` event from `'activeKernel'` → `'activeKernelChanged'`. The wire protocol (`RuntimeResponse` discriminator, worker dispatcher emit, worker-client decode) already uses `activeKernelChanged` — only the public client surface and its consumer (`cad.machine.ts` + tests) needs the rename. See [Appendix F.6](#f6--clientonactivekernel----clientonactivekernelchanged--r38-phase-3b) for the precise file:line inventory.
- **R39**: remove `'fileResolutionFailed'` event surface — delete the worker emit path; delete the public type; verify no consumer was subscribed (`rg "on\('fileResolutionFailed'"` returns nothing post-deletion).
- **R40**: confirm `'telemetry'` event remains exported with a typed payload `TelemetryEntry`. Add a snapshot test asserting the event fires and carries the expected shape.

### Phase 4 — Production consumer migration (P0/P1, parallelisable)

Production consumers first (P0):

- **R6**: `useRender` → event-subscription pattern.
- **R9**: `rpc-handlers.ts` keeps event-driven path but routes through `awaitFreshRender`. **R27** rewrites tests.
- **R10**: API benchmark `model-benchmark-geometry.ts`.

Then test/benchmark consumers (P1):

- **R11–R14, R16–R19**: all `client.render` test/benchmark sites.
- **R13**: test helper rewrite.

### Phase 5 — Public surface removal (P0)

- **R4 + R41**: delete the following symbols from `RuntimeClient` interface, runtime-client.ts implementation, the `RuntimeCommand` discriminated union, and any test fixture imports:
  - `render(input)`
  - `setFile(file, params, options)` — replaced by `openFile`
  - `setParameters(params)` — replaced by `updateParameters`
  - `setRenderTimeout(seconds)` — replaced by `RuntimeClientOptions.renderTimeout` or `setOptions({ renderTimeout })`
  - `notifyFileChanged(paths)` — internal worker file-watch handles file changes; inline-code mode uses the private `setFiles` worker command
  - `cancelPendingRender()` — superseded by `RenderSettlement.superseded`
  - `geometryPool` getter — internalised behind transport
  - `lastRequestedGeneration` getter
  - `incrementAbortGeneration()` method
- **No `connect` removal.** `client.connect` stays on the type and the runtime; this phase deletes only the symbols listed above.
- **R20**: decide worker-level surface naming.
- **Public-API audit**: run `pnpm rg "client\.(setFile|setParameters|setRenderTimeout|notifyFileChanged|cancelPendingRender|render|geometryPool|lastRequestedGeneration|incrementAbortGeneration)"` across the workspace; expect zero hits outside of historical changelog/research docs.

### Phase 6 — Documentation (P1)

- **R22, R28, R29**: update policy, README, hook JSDoc. Lead with "construct → connect → command → events / Promise". Show `await client.connect({ port, filePoolBuffer })` in every autonomous-mode example and `await createNodeClient(rootDir)` (which wraps connect internally) in every CLI example.

### Re-scoping the pending TDD plan (vs v4)

Compared to the v4 re-scoping (which dropped the freshness-helper tasks), v5 re-instates most of them with the modified shape from [Finding 10](#finding-10-freshness-is-solved-by-xstate-state--the-rendersettlement-promise--no-generations-on-the-public-surface):

| Pending task                                                            | v4 verdict                        | v5 verdict                                                                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| t1 Runtime tests (latestGeneration SAB slot, generation-stamped events) | Internal-only                     | **Internal-only** (unchanged) — cooperative-abort plumbing                                                                                  |
| t2 Runtime impl                                                         | Same                              | **Same** — internal SAB slot + generation field on internal responses                                                                       |
| t3 cad.machine tests (intent tracking)                                  | Drop                              | **Re-instate** as `lastRequestedIntentId` / `lastSettledIntentId` (R25). No `lastRequestedGeneration` field on the runtime client           |
| t4 cad.machine impl                                                     | Drop                              | **Re-instate** as XState-internal tracking (R7). State stays `'idle' \| 'rendering' \| 'error'` derived from runtime `'state'` events       |
| t5 await-fresh-render tests                                             | Drop                              | **Re-instate** (R26) using the algorithm from Finding 10                                                                                    |
| t6 await-fresh-render impl                                              | Drop                              | **Re-instate** (R8) on top of v5 primitives                                                                                                 |
| t7 project.machine write-fanout tests                                   | Keep                              | Keep                                                                                                                                        |
| t8 project.machine fanout impl                                          | Re-scope (no `notifyFileChanged`) | Same — relies on FS worker → kernel-worker watch path                                                                                       |
| t9 RPC handler tests                                                    | Re-scope around `client.export`   | **Re-instate** (R27) around the event-driven path: assert that `awaitFreshRender` is awaited and `cad.machine.context.geometry` is consumed |
| t10 RPC handler impl                                                    | Migrate to `client.export`        | **Re-instate** (R9) using `awaitFreshRender`; **NOT** `client.export`                                                                       |
| t11 RENDER_TIMEOUT in `rpcClientErrorCodeSchema`                        | Keep                              | Keep                                                                                                                                        |
| t12 kernel.integration.test.ts edit-then-fetch                          | Re-scope around `client.export`   | **Re-instate** around event-stream: edit file → next `'geometry'` event carries updated payload → RPC reads it via `awaitFreshRender`       |
| t13 Final gate                                                          | Keep                              | Keep                                                                                                                                        |

Net effect: v5 brings the original TDD plan structure back (t3–t6, t9–t10, t12 reborn) but with the architectural cleanup that none of them require generation-tracking on the public runtime client surface.

## Trade-offs vs v4

| Dimension                                  | v4                                                     | v5                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public method count                        | 8 + `on()`                                             | **8 + `on()` + 3 getters** (same method count; `lifecycleState` getter added)                                                                                                                                                                                                           |
| `connect(options)`                         | Kept (lazy)                                            | **Kept and tightened** — explicit, required, manually invoked by `cad.machine`; typed `RuntimeNotConnectedError`/`RuntimeConnectionError`/`RuntimeReconnectError`; `lifecycleState` getter ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)) |
| `terminate()` contract                     | Implicit                                               | **Deterministic** — in-flight Promises (incl. `connect`) reject with `RuntimeTerminatedError` next microtask, subscriptions disposed, subsequent calls throw, idempotent ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers))                 |
| Event surface                              | `activeKernel`, `fileResolutionFailed`, `telemetry`, … | `activeKernelChanged` (renamed), `fileResolutionFailed` removed, `telemetry` retained — see R38/R39/R40                                                                                                                                                                                 |
| `export(format)` no-options overload       | Kept; required always-warm-handle invariant            | Kept; relies on existing opportunistic cache only                                                                                                                                                                                                                                       |
| Always-warm-native-handle invariant        | New contract                                           | Reverted — no contract added                                                                                                                                                                                                                                                            |
| RPC freshness mechanism                    | `client.export('glb', ...)` per call                   | `awaitFreshRender` reading `cad.machine.context.geometry`                                                                                                                                                                                                                               |
| Parity between RPC tests and viewer        | Not guaranteed                                         | Guaranteed by construction                                                                                                                                                                                                                                                              |
| Latency of RPC freshness check (cache hit) | Tens of ms                                             | Sub-ms                                                                                                                                                                                                                                                                                  |
| Duplicate GLB blobs per RPC call           | One extra                                              | None                                                                                                                                                                                                                                                                                    |
| Transport abstraction                      | Implicit / leaky                                       | **Explicit `RuntimeTransport` (behaviour-complete)** — no SAB references in the runtime client ([Finding 15](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct))                                                                                        |
| SAB layout                                 | All four slots                                         | **Two main→worker slots only** (`abortGeneration` + `abortReason`) ([Finding 17](#finding-17-sab-scope--single-internal-abortgeneration-and-its-abortreason-cousin))                                                                                                                    |
| Cross-channel state ordering               | Race possible                                          | **Single ordered postMessage channel** ([Finding 16](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel))                                                                                                                                              |
| Kernel impl changes                        | R5 hardening required                                  | None — implementation untouched (R5 is now no-op); transport refactor is consumer-invisible                                                                                                                                                                                             |
| Pending TDD task list                      | t3–t6, t9, t10, t12 dropped                            | All re-instated with modified shape; transport tests added (R30, R36, R37)                                                                                                                                                                                                              |
| Conceptual onboarding                      | "render is removed; use openFile + export"             | "construct → connect → call command → consume via on('geometry') or await Promise; export is for byte production"                                                                                                                                                                       |
| Forward-compat with WebSocket transport    | ✅ same                                                | ✅ **validated** by `createWebSocketTransport` pre-stub ([Finding 20](#finding-20-createwebsockettransport-pre-stub-validates-the-abstraction))                                                                                                                                         |
| Library API Policy compliance              | ✅                                                     | ✅ (re-audited for revised surface)                                                                                                                                                                                                                                                     |

v5 is strictly an architectural correction over v4 that fixes the parity property, removes a needless invariant, restores the transport story v4 silently dropped, and tightens the lifecycle contract. The public method count is **unchanged** at 8 (a `lifecycleState` getter is added but no method is added or removed at this surface; nine sub-symbols are removed but `connect` survives). Internal complexity moves from the runtime client into the transport implementations where it belongs.

## Code Examples

### Autonomous mode — UI pane (the new `cad.machine` shape)

```typescript
const client = createRuntimeClient(kernelOptions);

const subs = [
  client.on('geometry', (result) => machineRef.send({ type: 'geometry', result })),
  client.on('state', (state) => machineRef.send({ type: 'state', state })),
  client.on('progress', (progress) => machineRef.send({ type: 'progress', progress })),
  client.on('error', (error) => machineRef.send({ type: 'kernelIssue', error })),
  client.on('parametersResolved', (resolved) => machineRef.send({ type: 'parametersResolved', resolved })),
  client.on('activeKernelChanged', (id) => machineRef.send({ type: 'activeKernelChanged', id })),
  client.on('telemetry', (entry) => debugOverlay.record(entry)),
];

await client.connect({ port, filePoolBuffer });

await client.openFile({ file: '/projects/abc/main.scad', parameters: initialParams });

await client.updateParameters({ ...initialParams, height: 42 });

await client.openFile({ file: '/projects/abc/other.scad' });
```

`connect()` is an explicit step performed by `cad.machine`'s `connectKernelActor`. Subscriptions may be attached before or after `connect()`; commands attempted before `connect()` resolves throw `RuntimeNotConnectedError` synchronously.

### Imperative mode — CLI (unchanged from today)

```typescript
const client = await createNodeClient(inputDirectory);
try {
  const result = await client.export('glb', { file: 'main.scad', parameters });
  if (!result.success) throw new Error(result.issues.map((i) => i.message).join('\n'));
  await writeFile(outputPath, result.data.bytes);
} finally {
  client.terminate();
}
```

`createNodeClient` is an `async` factory: it constructs the client and `await`s `client.connect({ fileSystem })` internally before returning. CLI consumers never call `connect()` directly — the factory hides it. Direct callers (in tests, etc.) call `client.connect({ ... })` themselves.

### Lifecycle and deterministic termination

```typescript
const client = createRuntimeClient(kernelOptions);

const cleanup = client.on('geometry', (result) => display(result));

await client.connect({ port, filePoolBuffer });

const renderPromise = client.openFile({ file: 'main.scad', parameters });

setTimeout(() => client.terminate(), 100);

try {
  await renderPromise;
} catch (error) {
  if (error instanceof RuntimeTerminatedError) {
    console.log('Render aborted because client was terminated:', error.cause);
  }
}

cleanup();

await client.export('glb', { file: 'main.scad' });
```

After `terminate()`:

- Any `await`ed Promise — including any in-flight `connect()` — rejects with `RuntimeTerminatedError` on the next microtask.
- `cleanup()` is a safe no-op (subscriptions are auto-disposed at terminate).
- Any subsequent method call (`export`, `openFile`, `on`, even `connect`) throws `RuntimeTerminatedError` synchronously.
- `client.terminate()` called again is a no-op.

### Connect-error recovery

```typescript
const client = createRuntimeClient(kernelOptions);

while (true) {
  try {
    await client.connect({ port, filePoolBuffer });
    break;
  } catch (error) {
    if (error instanceof RuntimeConnectionError && error.cause === 'port-handshake') {
      await delay(500);
      continue;
    }
    throw error;
  }
}
```

`RuntimeConnectionError` does **not** transition the client to terminated state — the consumer may retry `connect()` arbitrarily many times. `RuntimeReconnectError` is thrown only if a _different_ `ConnectOptions` is passed on retry; identical options resolve the same shared Promise.

### Live "Save As <Format>" with default options

```typescript
// Connection was established earlier in this pane's lifecycle.
await client.openFile({ file: '/projects/abc/main.scad', parameters });

const stl = await client.export('stl');
const step = await client.export('step');

const stlHighRes = await client.export('stl', { tolerance: 0.001 });
```

The single-arg form uses defaults; the two-arg form overrides. Both reuse the live render context. Performance comes from the existing opportunistic `nativeHandle` cache — no contract or invariant required.

### Imperative mode — Test (post-migration)

```typescript
const client = createRuntimeClient(kernelOptions);
await client.connect({ fileSystem: createMemoryFs() });

const result = await client.export('glb', { code: { 'main.ts': boxCode } });
const stats = await analyzeGlb(result.data.bytes);
expect(stats.vertexCount).toBe(8);
expect(stats.connectedComponents(0.01)).toBe(1);
```

### RPC handler (event-driven path, post-migration)

```typescript
async fetchGeometry({ targetFile, parameters }: FetchGeometryArgs): Promise<FetchGeometryRpcResult> {
  const cadMachine = await ensureGeometryUnit(targetFile);

  try {
    const geometry = await awaitFreshRender(cadMachine, { file: targetFile, parameters });
    const gltfPart = geometry.data.find((g) => g.format === 'gltf');
    if (!gltfPart) {
      return { ok: false, error: 'NO_TOP_LEVEL_GEOMETRY' };
    }
    return { ok: true, glb: gltfPart.content };
  } catch (error) {
    if (isRenderTimeoutError(error)) return { ok: false, error: 'RENDER_TIMEOUT' };
    if (isFileNotFoundError(error)) return { ok: false, error: 'FILE_NOT_FOUND' };
    return { ok: false, error: 'UNKNOWN' };
  }
}
```

The RPC reads from the live `cad.machine` instead of issuing a duplicate `export('glb', ...)`. The `Uint8Array` returned to the LLM is the same byte buffer the viewer is rendering.

## Diagrams

### Autonomous mode — viewer + RPC share the same event stream

```
┌─────────────────┐
│  Viewer         │
│  (<gltf-mesh>)  │ ◀──┐
└─────────────────┘    │
                       │
┌─────────────────┐    │   on('geometry', result)
│  Chat RPC       │ ◀──┤
│  handler        │    │   ────────────────────────┐
│  (via cad-      │    │                           │
│   machine)      │    │                           │
└─────────────────┘    │                           │
                       │                           ▼
                       │       ┌──────────────────────────────────┐
                       └────── │  cad.machine                     │
                               │   - context.geometry             │
                               │   - context.lastRequestedIntent  │
                               │   - context.lastSettledIntent    │
                               │   - state: idle | rendering      │
                               └──────────────────────────────────┘
                                                  ▲
                                                  │ openFile / updateParameters
                                                  │
                                            ┌──────────────────────┐
                                            │  RuntimeClient       │
                                            │  (per pane)          │
                                            └──────────────────────┘
                                                  │
                                                  ▼
                                            ┌──────────────────────┐
                                            │  KernelWorker        │
                                            │  - currentFile       │
                                            │  - currentParameters │
                                            │  - nativeHandle      │
                                            │   (opportunistic     │
                                            │    cache, no         │
                                            │    invariant)        │
                                            └──────────────────────┘
```

### Imperative mode — Save As / CLI / tests

```
┌─────────────────┐    export(format) or                ┌──────────────────────┐
│  CLI / Save As  │    export(format, options)          │  RuntimeClient       │
│  / Test / Bench │ ────────────────────────────────▶   │                      │
│                 │                                     │   bundle → render →  │
│                 │ ◀──── Promise<ExportResult> ─────   │   export → resolve   │
│                 │                                     │   (or: reuse warm    │
│                 │                                     │    nativeHandle      │
│                 │                                     │    opportunistically)│
└─────────────────┘                                     └──────────────────────┘
```

### RPC freshness coordination (no generations on client surface)

```
                    ┌───────────────────────────────────────────┐
                    │  awaitFreshRender(cadMachine, intent)     │
                    │   1. Check intent vs context              │
                    │   2. If mismatch: send 'reissueOpenFile'  │
                    │   3. waitFor(state.matches('ready.idle')  │
                    │              && lastSettled == lastReq)   │
                    │   4. Return context.geometry              │
                    └───────────────────────────────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │  cad.machine                    │
                │   intent IDs are XState-local   │
                │   never escape to RuntimeClient │
                └─────────────────────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │  RuntimeClient public surface:  │
                │   no generation, no intent ID,  │
                │   only RenderSettlement Promise │
                │   + on('geometry') events       │
                └─────────────────────────────────┘
```

## Appendix A: Full Consumer Call-Site Inventory

Every in-tree call to `client.render(...)` (excluding direct `worker.render(...)` calls), with v5 migration:

| File                                                            | Line                                                     | Mode                    | v5 verb                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/app/machines/cad.machine.ts`                           | 113-160 (calls `client.setFile`/`setParameters` today)   | Autonomous              | `client.openFile` / `client.updateParameters`                                                                           |
| `packages/react/src/hooks/use-render.ts`                        | 148                                                      | Autonomous              | Refactor to event-subscription on `'geometry'`; trigger via `client.openFile` / `client.updateParameters`               |
| `apps/ui/app/hooks/rpc-handlers.ts`                             | 250, 276 (today routes through cad.machine geometry)     | Autonomous              | **Stays event-driven** via `awaitFreshRender` — does NOT migrate to `client.export`                                     |
| `apps/api/app/benchmarks/model-benchmark-geometry.ts`           | 56                                                       | Imperative              | `client.export('glb', { code, file })`                                                                                  |
| `apps/api/app/api/analysis/geometry-analysis.service.test.ts`   | 28                                                       | Imperative              | `client.export('glb', { code: { [filename]: code }, file: filename })`                                                  |
| `packages/testing/src/geometry/connected-components.test.ts`    | 21                                                       | Imperative              | `client.export('glb', ...)`                                                                                             |
| `packages/testing/src/geometry/evaluate-requirement.test.ts`    | 20                                                       | Imperative              | `client.export('glb', ...)`                                                                                             |
| `packages/testing/src/geometry/analyze-glb.test.ts`             | 17                                                       | Imperative              | `client.export('glb', ...)`                                                                                             |
| `packages/testing/src/geometry/watertight.test.ts`              | 18                                                       | Imperative              | `client.export('glb', ...)`                                                                                             |
| `apps/ui/app/machines/kernel.integration.test.ts`               | 141, 195                                                 | Imperative (test)       | `client.export('glb', ...)`                                                                                             |
| `packages/runtime/src/benchmarks/benchmark-runner.ts`           | 235                                                      | Imperative              | `client.export('glb', { file, parameters })`; replace `client.notifyFileChanged(...)` with file-write→export sequencing |
| `packages/runtime/src/transport/in-process-transport.test.ts`   | 51, 78, 109, 132, 147, 164                               | Imperative              | `client.export('glb', ...)`                                                                                             |
| `packages/runtime/src/client/runtime-client.test.ts`            | ~25 sites                                                | Mixed                   | Per-test audit: imperative → `client.export('glb', ...)`; autonomous → `client.openFile(...)` + event await             |
| `packages/runtime/src/framework/runtime-worker-client.test.ts`  | 56, 87, 126, 140, 167, 271, 320                          | Mixed                   | Same audit                                                                                                              |
| `packages/runtime/src/types/define-plugin.test-d.ts`            | 2391, 2399, 2403, 3250                                   | Type-level              | Replace `client.render(...)` type assertions with `client.export(...)` and `client.openFile(...)`                       |
| `packages/runtime/src/client/render-input.test-d.ts`            | 206, 211, 224, 230, 234, 238, 243, 248, 253, 342, 350    | Type-level              | Same; rename file to `open-file-input.test-d.ts`                                                                        |
| `packages/runtime/src/framework/kernel-worker.test.ts`          | 294, 320                                                 | Worker-level (internal) | Decision per R20                                                                                                        |
| `packages/runtime/src/kernels/replicad/replicad.kernel.test.ts` | 2937, 3073, 3082, 3321, 3347, 3410                       | Worker-level (internal) | Decision per R20                                                                                                        |
| `kernels/openscad/src/openscad.kernel.test.ts`                  | 2103, 2127                                               | Worker-level (internal) | Decision per R20                                                                                                        |
| `packages/runtime/src/client/runtime-client.ts`                 | 470 (JSDoc), 734 (`input.client.render` — internal call) | Internal/docs           | Update JSDoc to `client.export` example; rewrite the internal call as needed                                            |

**Total**: ~80 call sites across ~18 files. The bulk (~70%) is test code where the change is a one-line rename. The chat-RPC handler (`rpc-handlers.ts`) **keeps** its event-driven path; it does NOT appear in the export-migration column.

## Appendix B: Per-Mode Contract

### Autonomous mode (event-stream delivery)

| Aspect                     | Contract                                                                                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation prerequisite    | `await client.connect({ port, filePoolBuffer })` must resolve before any trigger verb may be called ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))                                                                                        |
| Trigger verbs              | `openFile(input)`, `updateParameters(parameters)`, `setOptions(options)`                                                                                                                                                                                                                |
| Pre-connect behaviour      | All trigger verbs throw `RuntimeNotConnectedError` synchronously                                                                                                                                                                                                                        |
| Promise return             | `Promise<RenderSettlement>` — resolves on the _next_ settled render that this call started or covered                                                                                                                                                                                   |
| Supersession               | A subsequent trigger before settlement causes the prior Promise to resolve with `{ superseded: true }`                                                                                                                                                                                  |
| Result delivery            | `on('geometry')`, `on('state')`, `on('progress')`, `on('error')`                                                                                                                                                                                                                        |
| Event ordering             | Single ordered postMessage channel; events arrive in worker-emit order                                                                                                                                                                                                                  |
| Lifetime                   | Trigger/event-stream pair lives for the lifetime of the client                                                                                                                                                                                                                          |
| Watch loop                 | `openFile` (re)starts the file watch; `updateParameters` does not                                                                                                                                                                                                                       |
| Debouncing                 | `updateParameters` debounced 50ms; `openFile` immediate                                                                                                                                                                                                                                 |
| Used by                    | Viewer, RPC handlers (via cad.machine), `useRender`, autonomous tests                                                                                                                                                                                                                   |
| Freshness coordination     | `cad.machine` internal intent IDs + `RenderSettlement` Promise — no public-surface generations                                                                                                                                                                                          |
| Lifecycle on `terminate()` | All in-flight `Promise<RenderSettlement>` reject with `RuntimeTerminatedError` on the next microtask; `on(...)` subscriptions are auto-disposed; subsequent triggers throw synchronously ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)) |

### Imperative mode (Promise-correlated delivery)

| Aspect                      | Contract                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation prerequisite     | `await client.connect({ ... })` must resolve before `export(...)` may be called. CLI consumers go through `createNodeClient(rootDir)` which awaits `connect` internally                                                                             |
| Trigger verbs               | `export(format)`, `export(format, options)`                                                                                                                                                                                                         |
| Pre-connect behaviour       | `export(...)` throws `RuntimeNotConnectedError` synchronously                                                                                                                                                                                       |
| Promise return              | `Promise<ExportResult>` — resolves once with the bytes for that format                                                                                                                                                                              |
| Supersession                | None — each call is independent                                                                                                                                                                                                                     |
| Event subscription          | Optional but typically not used by imperative consumers                                                                                                                                                                                             |
| Lifetime                    | Per call; client may be created+terminated per batch (CLI) or shared with autonomous consumers (live "Save As")                                                                                                                                     |
| Single-arg form             | Uses default export options for `format`, against the current render context. Throws `NoActiveRenderContextError` on a fresh client with no prior `openFile` settlement                                                                             |
| Two-arg form                | Overrides default options; may include `{ file, parameters, code }` to bootstrap one-shot context for callers without a live context (CLI mode)                                                                                                     |
| Performance characteristics | Opportunistic reuse of warm `nativeHandle` when input matches; otherwise full pipeline. No contract on warmth                                                                                                                                       |
| Used by                     | CLI, "Save As" UI buttons, headless tests, headless benchmarks, AR conversion, programmatic exports                                                                                                                                                 |
| Lifecycle on `terminate()`  | All in-flight `Promise<ExportResult>` reject with `RuntimeTerminatedError` on the next microtask; subsequent `export(...)` calls throw synchronously ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)) |

## Appendix C: Inheritance and corrections from v1, v2, v3, v4

Cumulative survival table:

| Concept                                                  | v1       | v2       | v3                               | v4                                           | v5                                                                                                                                                                                                                       |
| -------------------------------------------------------- | -------- | -------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generations are public API                               | ✅       | ❌       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| Generations are internal-only abort primitive            | n/a      | ✅       | ✅                               | ✅                                           | ✅                                                                                                                                                                                                                       |
| `TransportCapabilities` flag struct                      | n/a      | ✅       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| Behavior-complete `RuntimeTransport` interface           | n/a      | n/a      | ✅                               | ✅                                           | ✅                                                                                                                                                                                                                       |
| Single ordered event channel                             | n/a      | partial  | ✅                               | ✅                                           | ✅                                                                                                                                                                                                                       |
| SAB scope = single internal `abortGeneration` flag       | n/a      | partial  | ✅                               | ✅                                           | ✅                                                                                                                                                                                                                       |
| `notifyFileChanged` on public surface                    | ✅       | ✅       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| `cancelPendingRender` on public surface                  | ✅       | ✅       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| `setRenderTimeout` on public surface                     | ✅       | ✅       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| `geometryPool` getter on public surface                  | ✅       | ✅       | ❌                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| `setFile`/`setParameters` (void async)                   | ✅       | ✅       | ❌ collapsed into `render`       | ❌ → `openFile`/`updateParameters` (Promise) | ❌ → same as v4                                                                                                                                                                                                          |
| `RenderSession` abstraction                              | n/a      | n/a      | considered then dropped          | n/a                                          | n/a                                                                                                                                                                                                                      |
| `render(input)` Promise as universal mutator             | n/a      | n/a      | ✅                               | ❌                                           | ❌                                                                                                                                                                                                                       |
| Render vs export dichotomy                               | n/a      | n/a      | n/a                              | ✅                                           | ✅ refined to "two delivery shapes"                                                                                                                                                                                      |
| One client per pane invariant                            | implicit | implicit | ✅ named                         | ✅                                           | ✅                                                                                                                                                                                                                       |
| `Geometry` already only carries bytes                    | n/a      | n/a      | n/a                              | ✅ noted                                     | ✅ noted                                                                                                                                                                                                                 |
| `export(format)` no-options overload                     | n/a      | n/a      | n/a                              | ✅ tied to handle invariant                  | ✅ kept; defaults for format; opportunistic cache                                                                                                                                                                        |
| Always-warm-native-handle invariant                      | implicit | implicit | implicit                         | ✅ codified (R5)                             | ❌ **reverted** — opportunistic cache, no contract                                                                                                                                                                       |
| 'memory' pseudo-format for `export`                      | n/a      | n/a      | n/a                              | ❌ rejected                                  | ❌ rejected                                                                                                                                                                                                              |
| RPC handlers migrate to `client.export`                  | n/a      | n/a      | n/a                              | ✅ R8 prescribed                             | ❌ **reverted** — RPC stays event-driven                                                                                                                                                                                 |
| `awaitFreshRender` helper                                | n/a      | n/a      | n/a                              | ❌ dropped (R23 re-scoping)                  | ✅ **reborn** on XState state + `RenderSettlement`                                                                                                                                                                       |
| Viewer consumes via `on('geometry')`, never via `export` | implicit | implicit | implicit                         | implicit                                     | ✅ **explicit** ([Finding 3](#finding-3-the-viewer-is-an-autonomous-mode-consumer-that-consumes-from-ongeometry-not-from-export))                                                                                        |
| Two delivery shapes shared by one client                 | implicit | implicit | partial                          | partial                                      | ✅ **explicit** ([Finding 2](#finding-2-two-delivery-shapes-one-client))                                                                                                                                                 |
| Public `connect(options)` method                         | ✅       | ✅       | ✅ kept as opt-in pre-warm (R10) | ✅ kept                                      | ✅ **kept and tightened** — explicit, required, manually invoked by `cad.machine`; typed errors; `lifecycleState` getter ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))    |
| Lazy connection                                          | partial  | partial  | ✅ + opt-in pre-warm             | ✅ + opt-in pre-warm                         | ❌ — connect is required before any command (auto-connect rejected on review)                                                                                                                                            |
| `'activeKernel'` event name                              | n/a      | n/a      | implicit                         | ✅ used                                      | ❌ → renamed to `'activeKernelChanged'` (R38)                                                                                                                                                                            |
| `'fileResolutionFailed'` event                           | n/a      | n/a      | proposed                         | proposed                                     | ❌ removed — never had a consumer (R39)                                                                                                                                                                                  |
| `'telemetry'` event                                      | n/a      | n/a      | implicit                         | ✅                                           | ✅ kept with typed `TelemetryEntry` payload (R40)                                                                                                                                                                        |
| `lifecycleState` read-only getter                        | n/a      | n/a      | n/a                              | n/a                                          | ✅ added                                                                                                                                                                                                                 |
| `RuntimeNotConnectedError` typed error                   | n/a      | n/a      | n/a                              | n/a                                          | ✅ added (Finding 18, R34)                                                                                                                                                                                               |
| `RuntimeReconnectError` typed error                      | n/a      | n/a      | n/a                              | n/a                                          | ✅ added (Finding 18, R34)                                                                                                                                                                                               |
| Deterministic `terminate()` contract                     | implicit | implicit | implicit                         | implicit                                     | ✅ **explicit** — in-flight rejection (microtask), subscription auto-disposal, sync-throw on subsequent calls, idempotent ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)) |
| `RuntimeTerminatedError` typed error                     | n/a      | n/a      | n/a                              | n/a                                          | ✅ added                                                                                                                                                                                                                 |
| `RuntimeConnectionError` typed error                     | n/a      | n/a      | implicit                         | implicit                                     | ✅ added (Finding 18, R35)                                                                                                                                                                                               |
| `TransportDescriptor` (diagnostic-only)                  | n/a      | n/a      | ✅                               | implicit                                     | ✅ explicit                                                                                                                                                                                                              |
| `createWebSocketTransport` pre-stub                      | n/a      | proposed | ✅ R14                           | implicit                                     | ✅ R37 explicit ([Finding 20](#finding-20-createwebsockettransport-pre-stub-validates-the-abstraction))                                                                                                                  |
| Library API Policy compliance audit                      | partial  | ✅       | ✅                               | ✅                                           | ✅ (redone for v5 surface)                                                                                                                                                                                               |

## Appendix D: Per-Render Event Lifecycle Contract

For a single intent (one `openFile`, `updateParameters`, or `setOptions` call):

```
1. state: 'rendering'                                        (must be first)
2. progress (0..N times, monotonic percent)                  (zero or more)
3. parametersResolved                                        (zero or one)
4. geometry  XOR  error                                      (exactly one)
5. state: 'idle'                                             (must be last)
```

**Promise resolution semantics** (for the `Promise<RenderSettlement>` returned by `openFile`/`updateParameters`/`setOptions`):

- Step 4 with `geometry` → Promise resolves with `{ superseded: false, geometry }`.
- Step 4 with `error` → Promise rejects with the typed error (`RenderTimeoutError`, `BundleError`, `KernelError`).
- A new trigger (any of `openFile`/`updateParameters`/`setOptions`) before step 4 → previous Promise resolves with `{ superseded: true }`. Supersession is **not** a rejection — it is a normal lifecycle transition, distinct from `RuntimeTerminatedError` which **is** a rejection.
- `client.terminate()` before step 4 → previous Promise rejects on the next microtask with `RuntimeTerminatedError` ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers)).

**Promise resolution semantics** (for the `Promise<ExportResult>` returned by `export(format, options?)`):

- Same lifecycle steps 1–5 are emitted by the worker (visible to subscribers if any are attached).
- Step 4 with `geometry` → bytes are produced from the matching format's transcoder edge, then the Promise resolves with `{ success: true, data: { bytes, ... } }`.
- Step 4 with `error` or transcoder failure → Promise resolves with `{ success: false, issues: [...] }` (or rejects for unrecoverable infrastructure errors).
- `export` calls **do not supersede** other `export` calls — each is independent and runs to completion.
- `client.terminate()` before completion → Promise rejects on the next microtask with `RuntimeTerminatedError`.

**For an autonomous re-render triggered by a file watch (no pending Promise)**:

- Same lifecycle steps 1–5, but step 4 does not resolve any Promise — the `'geometry'`/`'error'` event fires for subscribers and the cycle continues.

**Cross-render ordering**:

- `state: 'idle'` from intent N is always observed before `state: 'rendering'` from intent N+1.
- Events for intent N and intent N+1 never interleave (single ordered channel — [Finding 16](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel)).

Tests must assert these orderings at the message level (`transport.onMessage` log) and at the consumer level (`client.on(...)` arrival order).

## Appendix E: Full API Surface Audit Table

Status legend: ✓ keep, ⚠ refactor, ✗ remove, + add.

| Surface element                                                                                                                                        | v5 status       | Rationale                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.openFile(input)`                                                                                                                               | +               | New: autonomous-mode entry; replaces `setFile`                                                                                                                                                                                               |
| `client.updateParameters(parameters)`                                                                                                                  | +               | New: autonomous-mode parameter update; replaces `setParameters`                                                                                                                                                                              |
| `client.setOptions(options)`                                                                                                                           | +               | New: autonomous-mode runtime-options update                                                                                                                                                                                                  |
| `client.export(format)`                                                                                                                                | ✓               | Use default options against current render context (live "Save As")                                                                                                                                                                          |
| `client.export(format, options)`                                                                                                                       | ✓               | Override defaults; may bootstrap one-shot context via `{ file, parameters, code }`                                                                                                                                                           |
| `client.render(input)`                                                                                                                                 | ✗               | Removed — split into autonomous (`openFile`/`updateParameters`) + imperative (`export`)                                                                                                                                                      |
| `client.connect(options)`                                                                                                                              | ✓               | Kept and tightened — `ConnectOptions = { port?, filePoolBuffer?, fileSystem? }`. Required before any command. Manually invoked by `cad.machine` ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)) |
| `client.terminate()`                                                                                                                                   | ⚠               | Behaviour tightened: deterministic teardown ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers))                                                                                                   |
| `client.setFile(file, params, opts)`                                                                                                                   | ✗               | Replaced by `openFile` (Promise-returning); call sites in [Appendix F](#appendix-f-per-symbol-migration-call-site-inventory)                                                                                                                 |
| `client.setParameters(params)`                                                                                                                         | ✗               | Replaced by `updateParameters` (Promise-returning); call sites in [Appendix F](#appendix-f-per-symbol-migration-call-site-inventory)                                                                                                         |
| `client.notifyFileChanged(paths)`                                                                                                                      | ✗               | Redundant in filesystem mode; absorbed by inline `openFile({ code })` private helper                                                                                                                                                         |
| `client.cancelPendingRender()`                                                                                                                         | ✗               | Subsumed by render supersession (`RenderSettlement.superseded`)                                                                                                                                                                              |
| `client.setRenderTimeout(seconds)`                                                                                                                     | ✗               | Replaced by `RuntimeClientOptions.renderTimeout` (constructor) or `setOptions({ renderTimeout })` (live)                                                                                                                                     |
| `client.geometryPool`                                                                                                                                  | ✗               | Leaks SAB internals; pool moves into transport                                                                                                                                                                                               |
| `client.lastRequestedGeneration`                                                                                                                       | ✗               | Internal-only; never exposed                                                                                                                                                                                                                 |
| `client.incrementAbortGeneration()`                                                                                                                    | ✗               | Internal supersession only                                                                                                                                                                                                                   |
| `client.routesFor(format)`                                                                                                                             | ✓               | Capabilities-derived helper; unchanged. Returns `[]` before `connect()` resolves                                                                                                                                                             |
| `client.bestRouteFor(format, kernelId?)`                                                                                                               | ✓               | Capabilities-derived helper; unchanged. Returns `undefined` before `connect()` resolves                                                                                                                                                      |
| `client.capabilities` (getter)                                                                                                                         | ✓               | Kernel/transcoder capabilities; `undefined` before `connect()` resolves                                                                                                                                                                      |
| `client.activeKernelId` (getter)                                                                                                                       | ✓               | Active kernel identifier; `undefined` before `connect()` resolves                                                                                                                                                                            |
| `client.lifecycleState` (getter)                                                                                                                       | +               | Read-only `'unconnected' \| 'connecting' \| 'connected' \| 'terminated'` ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))                                                                        |
| `client.on('geometry' \| 'state' \| 'progress' \| 'error' \| 'parametersResolved' \| 'capabilities' \| 'log' \| 'telemetry' \| 'activeKernelChanged')` | ✓               | Subscribe-anytime; auto-disposed on `terminate()`                                                                                                                                                                                            |
| `client.on('activeKernel', ...)`                                                                                                                       | ✗               | Renamed to `'activeKernelChanged'` (R38)                                                                                                                                                                                                     |
| `client.on('fileResolutionFailed', ...)`                                                                                                               | ✗               | Removed — equivalent failure surfaces through `on('error', ...)` (R39)                                                                                                                                                                       |
| `RuntimeCommand.requestId`                                                                                                                             | ⚠               | Mandatory on every command (string)                                                                                                                                                                                                          |
| `RuntimeResponse.requestId`                                                                                                                            | ⚠               | Either a string for correlated responses or `'autonomous'`                                                                                                                                                                                   |
| `RuntimeCommand: 'render'`                                                                                                                             | ⚠               | Becomes a wire-level command derived from `openFile`/`updateParameters`/`export`; no longer a public verb                                                                                                                                    |
| `RuntimeCommand: 'cancel'`                                                                                                                             | ✗               | Replaced by render supersession                                                                                                                                                                                                              |
| `RuntimeCommand: 'fileChanged'`                                                                                                                        | ✗               | Removed; inline path uses `setFiles`                                                                                                                                                                                                         |
| `RuntimeCommand: 'setFiles'`                                                                                                                           | + (private)     | Inline `openFile({ code })` writes-then-renders atomically                                                                                                                                                                                   |
| `RuntimeCommand: 'abort'`                                                                                                                              | +               | `{ requestId, reason }`. Wire-format fallback for transports without SAB ([Cooperative Abort Plumbing](#cooperative-abort-plumbing))                                                                                                         |
| `RuntimeCommand: 'setFile'`                                                                                                                            | ✗               | Subsumed by `openFile`                                                                                                                                                                                                                       |
| `RuntimeCommand: 'setParameters'`                                                                                                                      | ✗               | Subsumed by `updateParameters`                                                                                                                                                                                                               |
| `signalSlot.abortGeneration`                                                                                                                           | ✓ (`@internal`) | Stays SAB-only. Internal cooperative abort flag                                                                                                                                                                                              |
| `signalSlot.abortReason`                                                                                                                               | ✓ (`@internal`) | Implementation-coupled to abort                                                                                                                                                                                                              |
| `signalSlot.workerState`                                                                                                                               | ✗               | Removed; state events flow via `postMessage` only ([Finding 16](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel))                                                                                        |
| `signalSlot.progressPercent`                                                                                                                           | ✗               | Removed; progress events flow via `postMessage` only                                                                                                                                                                                         |
| `signalSlot.latestGeneration` (was v1)                                                                                                                 | ✗               | Never introduced                                                                                                                                                                                                                             |
| `RuntimeTransport.send`                                                                                                                                | ✓               | Unchanged                                                                                                                                                                                                                                    |
| `RuntimeTransport.onMessage`                                                                                                                           | ✓               | Unchanged                                                                                                                                                                                                                                    |
| `RuntimeTransport.close`                                                                                                                               | ✓               | Unchanged; called by `client.terminate()` ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers))                                                                                                     |
| `RuntimeTransport.observeWorkerState`                                                                                                                  | +               | Behaviour-complete API; replaces SAB-monitor in client ([Finding 15](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct))                                                                                     |
| `RuntimeTransport.signalAbort`                                                                                                                         | +               | Behaviour-complete API; replaces `incrementAbortGeneration` in client                                                                                                                                                                        |
| `RuntimeTransport.resolveGeometry`                                                                                                                     | +               | Behaviour-complete API; replaces `resolveTransportResult` in client                                                                                                                                                                          |
| `RuntimeTransport.describe`                                                                                                                            | +               | Diagnostic-only descriptor; not for control flow                                                                                                                                                                                             |
| `RuntimeTransport.capabilities`                                                                                                                        | ✗               | Was v2 proposal; replaced by behaviour-complete methods                                                                                                                                                                                      |
| `TransportCapabilities` type                                                                                                                           | ✗               | Was v2 proposal; replaced by `TransportDescriptor` (read-only, diagnostic)                                                                                                                                                                   |
| `TransportDescriptor` type                                                                                                                             | +               | `{ name, locality, sharedMemory, latencyClass }` — diagnostic only                                                                                                                                                                           |
| `createInProcessTransport`                                                                                                                             | ⚠               | Implements behaviour-complete interface; owns SAB internally                                                                                                                                                                                 |
| `createWorkerTransport`                                                                                                                                | ⚠               | Implements behaviour-complete interface; owns SAB internally                                                                                                                                                                                 |
| `createWebSocketTransport`                                                                                                                             | + (stub)        | R37. Implements behaviour-complete interface; pre-stub validates the abstraction ([Finding 20](#finding-20-createwebsockettransport-pre-stub-validates-the-abstraction))                                                                     |
| `inspectCrossOriginIsolation()`                                                                                                                        | ✓               | Stays as a global probe; consumed by `createInProcessTransport`/`createWorkerTransport`                                                                                                                                                      |
| `cooperative-abort.ts` exports                                                                                                                         | ⚠ (`@internal`) | Not part of the public package surface                                                                                                                                                                                                       |
| `RuntimeTerminatedError`                                                                                                                               | +               | Typed error with discriminator `code: 'RUNTIME_TERMINATED'` and `cause: 'explicit' \| 'connection-failed' \| 'transport-closed'` ([Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers))              |
| `RuntimeConnectionError`                                                                                                                               | +               | Typed error for `connect()` failure with `cause: 'transport-construction' \| 'capabilities-resolution' \| 'kernel-binding' \| 'port-handshake'` ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)) |
| `RuntimeNotConnectedError`                                                                                                                             | +               | Typed error thrown synchronously by command methods called before `connect()` resolves ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))                                                          |
| `RuntimeReconnectError`                                                                                                                                | +               | Typed error thrown synchronously when `connect()` is called twice with different options ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine))                                                        |
| `NoActiveRenderContextError`                                                                                                                           | +               | Typed error for `export(format)` (no options) on a fresh client ([Finding 5](#finding-5-exportformat-options-is-the-imperative-workhorse-and-the-live-save-as-verb))                                                                         |
| `RenderSettlement`                                                                                                                                     | +               | Discriminated union `{ superseded: false; geometry } \| { superseded: true }` ([Finding 4](#finding-4-render-is-removed-openfile-and-updateparameters-drive-the-autonomous-mode))                                                            |

## Appendix F: Per-Symbol Migration Call-Site Inventory

This appendix is the **authoritative checklist** for migration. It enumerates every production and test call site that touches a removed or renamed `RuntimeClient` surface element, the v5 replacement, and the migration phase ([Migration Plan](#migration-plan)) it belongs to. Phase 5 (public surface removal) is not allowed to land until every row below is ✓.

Convention: file paths are workspace-relative. Line numbers reflect the working tree at the time this blueprint was authored — they are advisory anchors, not invariants.

### F.1 — `client.setFile(...)` → `client.openFile(...)` (R2, R41, Phase 4)

| Call site                                                      | Line(s)                      | Migration                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/app/machines/cad.machine.ts`                          | 353, 361, 499                | Replace each `setFile(file)` / `setFile(file, params, opts)` with `openFile({ file, parameters, options })` and consume the returned `Promise<RenderSettlement>` to update `lastRequestedGeneration` / `settledRenderGeneration` (R12, R14) |
| `packages/runtime/src/framework/runtime-worker-client.test.ts` | 479, 482, 502, 510, 513, 662 | Replace with `openFile` calls; assert `RenderSettlement` shape, including supersession test cases                                                                                                                                           |
| `apps/ui/app/machines/kernel.integration.test.ts`              | 174                          | Replace with `openFile`; this is the geometry-unit bootstrap path                                                                                                                                                                           |
| `packages/runtime/src/client/render-input.test-d.ts`           | 358                          | Replace `setFile` type test with `openFile` type test (`tessellation` is now an `options.tessellation` field on `OpenFileInput`)                                                                                                            |
| `packages/runtime/src/client/runtime-client.ts`                | 855                          | Delete the `setFile` implementation entirely (Phase 5) — `openFile` is the only entry point                                                                                                                                                 |

### F.2 — `client.setParameters(...)` → `client.updateParameters(...)` (R2, R41, Phase 4)

| Call site                                                      | Line(s)            | Migration                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/ui/app/machines/cad-preview.machine.ts`                  | 64, 116            | Replace with `updateParameters(parameters)`; preview machine remains fire-and-forget but should at least observe `RenderSettlement.superseded` for log correlation |
| `packages/runtime/src/framework/runtime-worker-client.test.ts` | 491, 494, 511, 690 | Replace with `updateParameters`; add supersession assertions where prior tests asserted only the first parameter set                                               |
| `packages/runtime/src/client/runtime-client.ts`                | 859                | Delete the `setParameters` implementation entirely (Phase 5)                                                                                                       |

### F.3 — `client.setRenderTimeout(...)` → `RuntimeClientOptions.renderTimeout` / `client.setOptions({ renderTimeout })` (R2, R41, Phase 4)

| Call site                                                      | Line(s)            | Migration                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/app/machines/cad.machine.ts`                          | 371, 501           | Replace with `client.setOptions({ renderTimeout: event.seconds })`. Initialise via `createRuntimeClient({ renderTimeout: context.renderTimeout })` at construction; remove the post-`connect` `setRenderTimeout` call |
| `packages/runtime/src/framework/runtime-worker-client.test.ts` | 593, 723, 763, 804 | Replace with `setOptions({ renderTimeout })`; the test that asserted `setRenderTimeout(0)` becomes a `setOptions({ renderTimeout: 0 })` test asserting the timeout is disabled                                        |
| `packages/runtime/src/client/runtime-client.ts`                | 684, 863           | Delete the `setRenderTimeout` implementation entirely (Phase 5); `setOptions` is the only post-connect mutator                                                                                                        |

### F.4 — `client.notifyFileChanged(...)` → automatic via filesystem event subscription (R2, R41, Phase 4)

| Call site                                                       | Line(s)                            | Migration                                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/benchmarks/benchmark-runner.ts`           | 226                                | Switch the benchmark runner to imperative mode: `await client.export(format, { code })`. Inline `code` carries the latest source — no `notifyFileChanged` needed                  |
| `packages/runtime/src/client/runtime-client.ts`                 | 796, 867                           | Delete the `notifyFileChanged` implementation entirely (Phase 5) — the inline `setFiles` private wire-format is the only remaining path                                           |
| `packages/runtime/src/client/runtime-client.test.ts`            | 243                                | Replace with `export(format, { code })` flow; assert that subsequent `code` updates produce updated bytes                                                                         |
| `packages/runtime/src/transport/in-process-transport.test.ts`   | 145                                | Same pattern — switch to `export({ code })`                                                                                                                                       |
| `packages/runtime/src/framework/kernel-worker.test.ts`          | 230                                | This is a kernel-worker-internal test of `notifyFileChanged` (still a wire command). Keep but rename the asserted command to the new internal `setFiles`/inline-code path         |
| `packages/runtime/src/framework/runtime-worker-dispatcher.ts`   | 241                                | The dispatcher still receives `fileChanged` from the watch loop in autonomous mode; this is internal plumbing and stays. Audit that no public `notifyFileChanged` surface remains |
| `kernels/openscad/src/openscad.kernel.test.ts`                  | 2137                               | Rewrite as `openFile({ code })` re-render assertion                                                                                                                               |
| `packages/runtime/src/kernels/replicad/replicad.kernel.test.ts` | 2983, 3030, 3140, 3214, 3290, 3383 | Same — six call sites; rewrite as `openFile({ code })` re-render assertions                                                                                                       |
| `packages/runtime/src/framework/kernel-runtime-worker.test.ts`  | 273                                | Same — rewrite as `openFile({ code })` re-render assertion                                                                                                                        |

### F.5 — `client.connect(options)` (R34, R41, Phase 3)

`connect` is **kept**, not removed. The audit below confirms that `cad.machine` is the sole production caller and that all remaining call sites are tests.

| Call site                                                        | Line(s)                   | Migration                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ui/app/machines/cad.machine.ts`                            | (in `connectKernelActor`) | No migration of the call itself; `connect` stays explicit. Wire up `lifecycleState` consumption (R34) and handle `RuntimeConnectionError` in the failure transition (R34, Finding 18) |
| `packages/runtime/src/client/runtime-client.ts`                  | (`connect` impl)          | Add the `unconnected → connecting → connected → terminated` state machine, the `assertConnected()` guard at every command entry (R35), and the typed errors                           |
| `packages/runtime/src/framework/runtime-worker-client.test.ts`   | (multiple)                | Add lifecycle-state assertions; add the new test file `runtime-client-connect.test.ts` per R35                                                                                        |
| `packages/runtime/src/client/runtime-client-coi-warning.test.ts` | (`.connect(...)` calls)   | No behavioural change; verify the COI warning still fires before the `connecting → connected` transition                                                                              |
| `packages/runtime/src/client/runtime-client.test.ts`             | (multiple)                | Update tests that assumed connect was implicit; add `RuntimeNotConnectedError` cases for every command method                                                                         |
| `packages/runtime/src/benchmarks/cpu-profiler.ts`                | (`.connect(...)`)         | Internal `WebInspector.connect()` (Chrome DevTools Protocol) — **not** `RuntimeClient.connect`. Excluded from this migration; left as a documented false-positive                     |

### F.6 — `client.on('activeKernel', ...)` → `client.on('activeKernelChanged', ...)` (R38, Phase 3b)

The wire protocol already uses `activeKernelChanged`. R38 only renames the **public client surface** so it matches. Each row below is a hard requirement for the public-surface audit (G.1) and the zero-hit grep gate (G.4).

**Rename targets (must change):**

| Call site                                            | Line(s)                                                                             | Migration                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/client/runtime-client.ts`      | 241 (`HandlerSet.activeKernel` field)                                               | Rename to `activeKernelChanged: Set<(kernelId: string \| undefined) => void>`                            |
| `packages/runtime/src/client/runtime-client.ts`      | 251 (JSDoc example referencing `on('activeKernel')`)                                | Update JSDoc example to `on('activeKernelChanged')`                                                      |
| `packages/runtime/src/client/runtime-client.ts`      | 423 (typed `on(event: 'activeKernel', ...)` overload)                               | Rename overload event string literal to `'activeKernelChanged'`                                          |
| `packages/runtime/src/client/runtime-client.ts`      | 518 (`activeKernel: new Set()` initialiser inside the `handlers` bag)               | Rename to `activeKernelChanged: new Set()`                                                               |
| `packages/runtime/src/client/runtime-client.ts`      | 600 (`for (const handler of handlers.activeKernel)` inside `onActiveKernelChanged`) | Update to `handlers.activeKernelChanged`                                                                 |
| `packages/runtime/src/client/runtime-client.ts`      | 880 (replay-on-subscribe branch `event === 'activeKernel'`)                         | Update event-string compare to `'activeKernelChanged'`                                                   |
| `apps/ui/app/machines/cad.machine.ts`                | 180                                                                                 | Rename event string in `client.on(...)` to `'activeKernelChanged'`                                       |
| `packages/runtime/src/client/runtime-client.test.ts` | 1625 (`describe('activeKernel event', …)`)                                          | Rename describe block to `'activeKernelChanged event'`                                                   |
| `packages/runtime/src/client/runtime-client.test.ts` | 1657 (`'should emit activeKernel event …'`)                                         | Rename test name                                                                                         |
| `packages/runtime/src/client/runtime-client.test.ts` | 1664, 1708                                                                          | Rename event string in subscription assertions                                                           |
| `packages/runtime/src/client/runtime-client.test.ts` | 1701 (`'should allow unsubscribing from activeKernel event'`)                       | Rename test name                                                                                         |
| `packages/runtime/src/client/runtime-client.test.ts` | new test                                                                            | Add a `*.test-d.ts` coverage that `client.on('activeKernel', …)` is a TypeScript error post-rename (G.4) |

**No rename required (already correct on the wire — confirm via re-grep, do not edit):**

| File                                                                                                                                                                                                                                                                                                                                   | Line(s)                                                    | Reason                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/runtime/src/types/runtime-protocol.types.ts`                                                                                                                                                                                                                                                                                 | 229 (`type: 'activeKernelChanged'`)                        | Wire-protocol discriminator already uses the long form                                                                                                 |
| `packages/runtime/src/framework/runtime-worker-dispatcher.ts`                                                                                                                                                                                                                                                                          | 172 (`respond({ type: 'activeKernelChanged', kernelId })`) | Worker dispatcher emit already uses the long form                                                                                                      |
| `packages/runtime/src/framework/runtime-worker-client.ts`                                                                                                                                                                                                                                                                              | 611 (`case 'activeKernelChanged':`)                        | Worker-client decode already uses the long form                                                                                                        |
| `packages/runtime/src/framework/kernel-runtime-worker.ts`                                                                                                                                                                                                                                                                              | 84, 212, 235, 248, 258, 267, 278, 279, 515, 519, 521       | Internal field `activeKernelId` and the internal callback `onActiveKernelChanged` — these are _not_ the public event name and are out of scope for R38 |
| `packages/runtime/src/framework/kernel-worker.ts`                                                                                                                                                                                                                                                                                      | 917, 918, 2040, 2042, 2046, 2054, 2069, 2130, 2658, 2659   | Internal `getActiveKernelId()` reads — not the public event name; out of scope                                                                         |
| `packages/runtime/src/framework/runtime-worker-dispatcher.test.ts`                                                                                                                                                                                                                                                                     | 704, 705, 732, 733, 761, 762                               | Asserts wire-format `activeKernelChanged` — already matches; no edit needed                                                                            |
| `packages/runtime/src/framework/runtime-worker-client.test.ts`                                                                                                                                                                                                                                                                         | 826, 827, 834, 848                                         | Asserts wire-format `activeKernelChanged` — already matches; no edit needed                                                                            |
| `apps/ui/app/machines/cad.machine.ts`                                                                                                                                                                                                                                                                                                  | 45, 72, 380, 381, 453, 512, 541, 575, 610, 646             | XState event of the same long name — internal to the UI machine, unrelated to the public client event surface                                          |
| `apps/ui/app/hooks/use-monaco-model-service.{ts,tsx,test.tsx}`, `apps/ui/app/lib/kernel-monaco-language.utils.ts`                                                                                                                                                                                                                      | various                                                    | Read `cadMachine.activeKernelId` getter — unrelated to the public client event                                                                         |
| `apps/ui/app/db/indexeddb-storage.{ts,test.ts}`, `apps/ui/app/hooks/use-project-manager.{tsx,test.ts}`, `apps/ui/app/hooks/chat-persistence.machine.test.ts`, `apps/ui/app/components/chat/chat-kernel-selector.tsx`, `apps/ui/app/components/files/export-selector.test.tsx`, `apps/ui/app/routes/projects_.$id/chat-stack-trace.tsx` | various                                                    | `Chat.activeKernel` field — chat persistence, unrelated to the runtime client event                                                                    |

### F.7 — `client.on('fileResolutionFailed', ...)` → removed (R39, Phase 3b)

No production callers in the working tree. The proposal in earlier drafts of this blueprint never landed in shipped code.

| Call site | Line(s) | Migration                                                                                                                                             |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| n/a       | n/a     | Remove the proposed event from the runtime-client event-bag schema. File-resolution failures are surfaced via the existing `on('error', ...)` channel |

### F.8 — `client.on('telemetry', ...)` retained (R40, no migration)

| Call site                                                     | Line(s) | Confirmed retained |
| ------------------------------------------------------------- | ------- | ------------------ |
| `apps/ui/app/machines/cad.machine.ts`                         | 171     | ✓                  |
| `packages/runtime/src/benchmarks/benchmark-runner.ts`         | 203     | ✓                  |
| `packages/runtime/src/transport/in-process-transport.test.ts` | 74      | ✓                  |
| `packages/runtime/src/client/runtime-client.test.ts`          | 503     | ✓                  |

The `telemetry` event keeps its current `PerformanceEntryData[]` payload, formalised as the typed `TelemetryEntry[]` (R40).

### F.9 — `client.render(...)` → split (R3, Phase 4)

No production callers in `apps/`, `kernels/`, or `packages/cli/`. The remaining callers are entirely in tests, benchmarks, and `runtime-client.ts` itself. Tests should migrate to `client.export(...)` (Finding 1) and benchmarks to `client.export(...)` per F.4 above.

### F.10 — Internal/wire surface (no consumer migration)

The following are internal-only and require code-level edits in `runtime-client.ts` / `runtime-worker-client.ts` / `runtime-worker-dispatcher.ts` / `kernel-worker.ts` only — there are no consumer call sites:

- `client.geometryPool` getter (deletion)
- `client.lastRequestedGeneration` getter (deletion)
- `client.incrementAbortGeneration()` (deletion)
- `client.cancelPendingRender()` (deletion)
- `signalSlot.workerState` / `signalSlot.progressPercent` (deletion; events flow via postMessage only)
- `RuntimeCommand: 'cancel'` / `'fileChanged'` / `'setFile'` / `'setParameters'` (deletion; replaced by `'setFiles'` and `'abort'`)

## Appendix G: Production-Readiness Acceptance Gates

The blueprint is "production ready" only when every gate below is met. CI must enforce these before Phase 5 (public surface removal) lands.

### G.1 — Surface compliance gates

- [ ] `RuntimeClient` interface in `packages/runtime/src/client/runtime-client.ts` exports exactly the eight public methods specified in [Target API Surface](#target-api-surface) (`connect`, `terminate`, `openFile`, `updateParameters`, `setOptions`, `export` ×2 overloads, `routesFor`, `bestRouteFor`) plus the read-only getters (`capabilities`, `activeKernelId`, `lifecycleState`) and the typed `on(...)` overloads. No symbols beyond this list are exported as part of the public package surface.
- [ ] No `@deprecated` annotations exist for the removed surface elements — they are deleted, not deprecated (per [`library-api-policy.md`](../policy/library-api-policy.md): no deprecation branches for unreleased internal APIs).
- [ ] A public-API audit script in `packages/runtime/scripts/audit-public-surface.ts` (new) diffs the actual exports against the blueprint surface and fails CI if either side drifts.
- [ ] Every public method has a JSDoc block with `@public` and at least one `@example <caption>...</caption>` codeblock, conforming to [`jsdoc-policy.md`](../policy/jsdoc-policy.md).

### G.2 — Lifecycle gates

- [ ] `runtime-client-connect.test.ts` (new) asserts every transition in the `unconnected → connecting → connected → terminated` state machine, including: connect-before-command guard ([Finding 18](#finding-18-connect-is-explicit-and-required--manually-invoked-by-cadmachine)), idempotent connect with same options, `RuntimeReconnectError` on different options, `RuntimeConnectionError` on transport handshake failure, terminate during in-flight connect.
- [ ] `terminate.test.ts` (new) asserts every invariant in [Finding 19](#finding-19-terminate-is-deterministic--no-hanging-promises-no-orphan-handlers): in-flight Promise rejection on next microtask (covering `connect`, `openFile`, `updateParameters`, `setOptions`, `export`), subscription auto-disposal, sync rejection on subsequent calls, idempotent re-termination, transport closure.
- [ ] No production code in `apps/`, `kernels/`, `packages/`, or `libs/` calls a removed method (`setFile`, `setParameters`, `setRenderTimeout`, `notifyFileChanged`, `cancelPendingRender`, `incrementAbortGeneration`, `render`).

### G.3 — Transport gates

- [ ] `RuntimeTransport` interface ([Finding 15](#finding-15-runtimetransport-is-the-behaviour-complete-abstraction-no-flag-struct)) exports the behaviour-complete API (`send`, `onMessage`, `observeWorkerState`, `signalAbort`, `resolveGeometry`, `describe`, `close`).
- [ ] `runtime-client.ts` and `runtime-worker-client.ts` contain no direct references to `SharedArrayBuffer`, `Atomics`, or `signalBuffer` — all such references live in `transport/in-process-transport.ts` / `transport/worker-transport.ts` only.
- [ ] `createWebSocketTransport` stub (R37) compiles against the same interface and a no-op test covers `transport.describe().sharedMemory === false` and that `signalAbort()` falls back to the `'abort'` postMessage command.
- [ ] All worker-to-main events flow through one ordered `postMessage` channel ([Finding 16](#finding-16-all-workermain-events-flow-through-a-single-ordered-postmessage-channel)). `runtime-worker-dispatcher.test.ts` proves no event is duplicated to a SAB monitor.

### G.4 — Event surface gates

- [ ] No `'activeKernel'` event subscription remains — only `'activeKernelChanged'`.
- [ ] **Zero-hit grep gate**: `pnpm rg "on\(\s*['\"]activeKernel['\"]"` returns **zero** results across the workspace, excluding historical changelog/research docs and the `Chat.activeKernel` persistence field (which is unrelated). Same gate for the bag-key form: `pnpm rg "handlers\.activeKernel\b"` returns **zero** results in `packages/runtime/`.
- [ ] No `'fileResolutionFailed'` event subscription or emit site remains.
- [ ] **Zero-hit grep gate**: `pnpm rg "fileResolutionFailed"` returns **zero** results across `apps/`, `packages/`, `libs/`, and `kernels/` (the legacy event name is fully erased from the source tree).
- [ ] `'telemetry'` event payload is typed as `TelemetryEntry[]` everywhere it is consumed.
- [ ] Subscribing to a removed/legacy event is a TypeScript compile error (verified by a `*.test-d.ts` file per [`testing-policy.md`](../policy/testing-policy.md)).

### G.5 — Migration completeness gates

- [ ] Every row in [Appendix F](#appendix-f-per-symbol-migration-call-site-inventory) is ✓.
- [ ] `pnpm nx test runtime`, `pnpm nx test ui`, `pnpm nx test cli`, `pnpm nx test chat` all pass with `--watch=false`.
- [ ] `pnpm nx typecheck` passes for all affected projects (`runtime`, `ui`, `cli`, `openscad`, `react`, `chat`).
- [ ] `pnpm nx lint` passes for all affected projects.
- [ ] `kernel.integration.test.ts` includes the edit-then-fetch case from todo `t12-integration` and passes deterministically (no flakes across 50 reruns).
- [ ] Manual smoke check (recorded in the PR description) confirms post-edit `fetchGeometry` returns updated geometry under both COI and non-COI server profiles.

### G.6 — Documentation gates

- [ ] `docs/architecture/runtime-topology.md` updated to reflect explicit `connect()` and the `unconnected → connecting → connected → terminated` lifecycle.
- [ ] `apps/ui/content/docs/(runtime)/...` consumer docs updated with the construct → connect → command → events / Promise pattern.
- [ ] `pnpm docs:validate` passes.

## References

- [`docs/research/runtime-event-driven-api-blueprint.md`](runtime-event-driven-api-blueprint.md) — v1, original blueprint
- [`docs/research/runtime-event-driven-api-blueprint-v2.md`](runtime-event-driven-api-blueprint-v2.md) — v2, capability-flag iteration
- [`docs/research/runtime-event-driven-api-blueprint-v3.md`](runtime-event-driven-api-blueprint-v3.md) — v3, unified `render(input)` (corrected by v4)
- [`docs/research/runtime-event-driven-api-blueprint-v4.md`](runtime-event-driven-api-blueprint-v4.md) — v4, render-vs-export split (three local mistakes corrected by v5)
- [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) — public API rules
- [`docs/architecture/runtime-topology.md`](../architecture/runtime-topology.md) — autonomous reactive render service
- [`docs/research/shared-memory-geometry-pipeline.md`](shared-memory-geometry-pipeline.md) — SAB pipeline
- [`docs/research/nativehandle-serialization-and-pipeline-architecture.md`](nativehandle-serialization-and-pipeline-architecture.md) — native handle lifecycle (related to the opportunistic cache referenced in [Finding 6](#finding-6-the-always-warm-native-handle-invariant-was-unnecessary--keep-the-opportunistic-cache-as-is))
- [`docs/research/cli-runtime-ergonomics.md`](cli-runtime-ergonomics.md) — CLI consumer profile
- [`docs/research/capabilities-manifest-api-audit.md`](capabilities-manifest-api-audit.md) — capabilities surface (orthogonal)
- [`docs/research/agent-loop-safeguards.md`](agent-loop-safeguards.md) — chat agent freshness/parity property (Finding 9)
