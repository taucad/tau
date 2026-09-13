---
title: 'Origin Client ID Propagation Audit'
description: 'Audit of `originClientId` API surface across the filesystem stack, the eigenquestion that discriminates correct from incorrect placement, and a refined refactor that retains R12 semantics while collapsing forwarder-layer plumbing.'
status: active
created: '2026-05-03'
updated: '2026-05-03'
category: audit
related:
  - docs/research/file-services-architecture-blueprint.md
  - docs/research/editor-flash-on-buffering-cycle.md
  - docs/research/agent-filesystem-stale-cache-audit.md
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
---

# Origin Client ID Propagation Audit

Re-evaluation of the `originClientId` API surface introduced by the bridge skip-originator design (R12 in [`file-services-architecture-blueprint.md`](file-services-architecture-blueprint.md)) — whether the cross-layer plumbing it requires is architecturally justified, and what a smaller-surface design retaining the same correctness would look like.

> **Status update (May 2026):** The per-call `methodContextProvider` mechanism described throughout this audit has since been **replaced** by `bindMutationContextForPort` in `packages/runtime/src/filesystem/filesystem-bridge.ts`. The bridge primitive (`createBridgeServer`) is now a dumb dispatcher with no context-injection hook; mutation context is bound at port-connect time via a per-port typed wrapper closure. References to `methodContextProvider` and `mutatingFilesystemMethodSlots` below are retained as a historical record of the original design. See `docs/policy/filesystem-policy.md` "Bridge self-write suppression" for the current contract.

## Executive Summary

The bridge-layer skip-originator filter (R12) is correct and has to stay — the regression class it prevents (editor flash-on-buffering when a write echoes back to its originator) is real, and the alternative placements considered in the original blueprint (per-facade TTL, typed wire field with `suppressSelf?` flag) were rightly rejected. However the implementation distributes `originClientId` as a typed parameter through five layers (~95 source references across 13 files), three of which act on the value and two of which merely forward it. The forwarder layers (`ChangeEventBus`, `ThrottledWorker`) carry the parameter without ever branching on it, which fails the standard "does varying this argument change this method's behaviour?" test for API surface. A refined design that keeps the parameter only at the author boundary (`WorkspaceFileService` mutating methods) and the consumer boundaries (`EventCoalescer` merge rule, bridge filter) — with origin attached to the event via a small `WeakMap`-backed registry between them — preserves identical observable behaviour while collapsing the surface to ~25 references in ~5 files.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [The Eigenquestion](#the-eigenquestion)
- [Findings](#findings)
- [Trade-offs](#trade-offs)
- [Alternative Designs Considered](#alternative-designs-considered)
- [Recommendations](#recommendations)
- [Code Examples](#code-examples)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

The bridge skip-originator design (R12) was implemented as recommended in [`file-services-architecture-blueprint.md`](file-services-architecture-blueprint.md). Implementation introduced `originClientId` as an explicit parameter on:

- Eight `WorkspaceFileService` mutating methods, via `context?: WorkspaceMutationContext`.
- `ChangeEventBus.emit(event, originClientId?)` and `subscribe((event, originClientId) => …)`.
- `EventCoalescer.push(event, originClientId?)` plus a new `TaggedChangeEvent` wrapper type used throughout its internals.
- `ThrottledWorker` widened to chunk `TaggedChangeEvent`.
- `filesystem-bridge.exposeFileSystem` (port-id tracking, `methodContextProvider`, per-recipient `deliverToHandles`).

The reviewer (user) asked whether the same goals could have been achieved without the cross-cutting churn. This audit interrogates that question and identifies the principle that determines correct placement.

## Methodology

- Re-read the blueprint's "Where does self-write suppression live?" comparison table ([`file-services-architecture-blueprint.md`](file-services-architecture-blueprint.md) lines 540–550) and the surrounding Findings (especially Finding 14 on coalescer mixed-origin merge).
- Inventoried `originClientId` references across the source tree (`Grep` count by file).
- For each layer the bit traverses, classified its role as **author** (creates the event from a call), **consumer** (branches on origin to do real work), or **forwarder** (carries the parameter without acting on it).
- Adversarially tested each candidate alternative against the correctness invariants the blueprint already established (R12 bridge-as-filter, Finding 14 coalescer merge rule).
- Sanity-checked against precedent patterns for transit-only metadata (HTTP request IDs, OpenTelemetry baggage, AsyncLocalStorage, React context).

## The Eigenquestion

> **For each layer the bit passes through, does that layer _act_ on the bit, or merely _forward_ it?**

This is the discriminating question because every other concern (correctness of skip-originator, coalescer merge correctness, no consumer-visible `suppressSelf?` flag, no wire-shape change) is satisfied by both the current design and the proposed refinement. The two designs differ only in how they treat the forwarder layers.

Applied to the present stack:

| Layer                                                                  | Acts on `originClientId`?                                         | What action / why it's a forwarder                                                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceFileService` mutating methods                                | ✅ Acts                                                           | Sole authoring boundary — the only place where the call (which carries provenance from the bridge) becomes the event (which doesn't yet). Origin must enter the event here. |
| `ChangeEventBus.emit/subscribe`                                        | ❌ Forwards                                                       | Broadcasts to subscribers regardless of origin. Origin has zero effect on bus behaviour.                                                                                    |
| `EventCoalescer.push` (transit) / `coalesceTaggedChangeEvents` (logic) | ✅ Acts (in the merge logic) / ❌ Forwards (in the queue transit) | The merge rule (`mergeOriginsFromTagged`) is real semantic work. The transit/queue plumbing is not.                                                                         |
| `ThrottledWorker`                                                      | ❌ Forwards                                                       | Chunks items in flight; doesn't read or use origin.                                                                                                                         |
| `filesystem-bridge.deliverToHandles`                                   | ✅ Acts                                                           | The filter that decides "skip this port for this event".                                                                                                                    |

Three layers genuinely act on the bit; two are pure forwarders; one (the coalescer) splits — its merge logic acts, its queue transit forwards.

## Findings

### Finding 1: The bit itself is necessary; bridge-only schemes break under coalescing

A bridge-only "pending self-write" map (track `{port → Set<path>}` on call entry, consume on outbound delivery) cannot reproduce the chosen design's correctness when self-writes coalesce with concurrent external writes. [`packages/filesystem/src/event-coalescer.ts`](../../packages/filesystem/src/event-coalescer.ts) lines 46–97 collapses two events for the same path with mixed origins into one event with `originClientId === undefined` (Finding 14 of the blueprint), so the originator still receives it because part of its history is external. A bridge-only map cannot distinguish "this is purely my echo" from "this is a coalesced echo+external". Same problem dooms an "echo counter" variant. The bit must travel _with_ the event.

### Finding 2: ~70% of the referenced surface is in forwarder layers

Inventory by file:

| File                                                                                                                                                             | References | Role                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| [`packages/filesystem/src/event-coalescer.ts`](../../packages/filesystem/src/event-coalescer.ts)                                                                 | 27         | Mix: ~6 in merge logic (act), ~21 in transit/types (forward) |
| [`packages/filesystem/src/workspace-file-service.ts`](../../packages/filesystem/src/workspace-file-service.ts)                                                   | 18         | Author boundary (act)                                        |
| [`packages/runtime/src/filesystem/filesystem-bridge.ts`](../../packages/runtime/src/filesystem/filesystem-bridge.ts)                                             | 17         | Filter (act) + port-id tracking                              |
| [`packages/runtime/src/filesystem/filesystem-bridge.test.ts`](../../packages/runtime/src/filesystem/filesystem-bridge.test.ts)                                   | 10         | Test for filter                                              |
| [`packages/runtime/src/transport/_internal/runtime-filesystem-bridge.test.ts`](../../packages/runtime/src/transport/_internal/runtime-filesystem-bridge.test.ts) | 7          | Test for `methodContextProvider`                             |
| [`packages/filesystem/src/event-coalescer.test.ts`](../../packages/filesystem/src/event-coalescer.test.ts)                                                       | 12         | Test for tagged transit                                      |
| [`packages/filesystem/src/change-event-bus.ts`](../../packages/filesystem/src/change-event-bus.ts)                                                               | 5          | Forwarder                                                    |
| [`packages/filesystem/src/change-event-bus.test.ts`](../../packages/filesystem/src/change-event-bus.test.ts)                                                     | 1          | Test for forwarder                                           |
| [`packages/filesystem/src/watch-registry.ts`](../../packages/filesystem/src/watch-registry.ts)                                                                   | 5          | Forwarder                                                    |
| [`packages/filesystem/src/watch-stress.test.ts`](../../packages/filesystem/src/watch-stress.test.ts)                                                             | 4          | Stress test                                                  |
| [`packages/filesystem/src/index.ts`](../../packages/filesystem/src/index.ts)                                                                                     | 3          | Exports `TaggedChangeEvent` + `WorkspaceMutationContext`     |
| [`packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts`](../../packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts)           | 3          | `methodContextProvider` plumbing                             |
| [`packages/filesystem/src/workspace-file-service.test.ts`](../../packages/filesystem/src/workspace-file-service.test.ts)                                         | 3          | Test for author                                              |
| **Total**                                                                                                                                                        | **115**    |                                                              |

Acting layers (`WorkspaceFileService` author + coalescer merge logic + bridge filter): ~31 references. Forwarder layers (`ChangeEventBus`, `EventCoalescer` transit, `ThrottledWorker`, `WatchRegistry`, type re-exports): ~84 references. The forwarder share is the avoidable surface.

### Finding 3: `ChangeEventBus.emit(event, originClientId?)` fails the behaviour-test

Standard test for whether a parameter belongs on a method: does varying it change the method's behaviour? Applied to [`packages/filesystem/src/change-event-bus.ts`](../../packages/filesystem/src/change-event-bus.ts) lines 37–45:

```ts
public emit(event: ChangeEvent, originClientId?: string): void {
  for (const subscriber of this._subscribers) {
    try {
      subscriber.handler(event, originClientId);
    } catch (error) {
      console.error('[ChangeEventBus] Subscriber error:', error);
    }
  }
}
```

Same `event`, varying `originClientId` → identical loop, identical dispatch. The bus reads the parameter only to pass it through. It is plumbing dressed as API.

The same critique applies to `ChangeEventBus.subscribe((event, originClientId) => …)`: the subscriber type changes shape, but the bus itself does no work that depends on the second argument.

### Finding 4: The R4 rejection in the blueprint targeted a different design than "internal annotation"

The blueprint's R4 ("typed `origin` on `ChangeEvent`") was rejected for two reasons (lines 547, 550):

1. Cross-package wire-shape change.
2. Forces a `suppressSelf?: boolean` flag on every consumer subscription.

An _internal-only_ annotation (e.g. `WeakMap<ChangeEvent, string>` scoped to `@taucad/filesystem`, never traversing the wire, never exposed to consumers) carries neither cost. The wire shape of `ChangeEvent` stays unchanged; consumers never see the annotation; no `suppressSelf?` flag exists. The blueprint did not enumerate this fourth option in its decision table.

### Finding 5: The current design scales poorly when a second piece of mutation metadata is added

Consider adding `userId` (audit trail attribution) to mutation metadata. Under the current design:

- Widen `WorkspaceMutationContext` (1 line).
- Either widen `ChangeEventBus.emit(event, originClientId, userId)` or refactor to `(event, context)` (which is the alternative anyway).
- Same widening for `EventCoalescer.push`.
- `TaggedChangeEvent` becomes `{ event, originClientId, userId }`.
- `methodContextProvider` returns `{ originClientId, userId }`.
- All test fixtures in `change-event-bus.test.ts`, `event-coalescer.test.ts`, `watch-stress.test.ts`, `filesystem-bridge.test.ts` update.

Under origin-on-event:

- Widen the `WorkspaceMutationContext` type (1 line).
- Add a second `tagEventUserId(event, ctx.userId)` call inside the affected `WorkspaceFileService` methods.
- Audit subscriber reads `getEventUserId(event)`.
- Zero changes to bus, coalescer transit, throttled worker, their tests.

The current design's cost is per-piece-of-metadata × per-layer; the alternative is per-piece-of-metadata × per-acting-layer.

### Finding 6: AsyncLocalStorage is the "purest" form of opaque baggage but is not viable in this stack

`AsyncLocalStorage` (Node) and the TC39 AsyncContext proposal would let `WorkspaceFileService` shed the `context?` parameter entirely — the bridge would `run({ originClientId: portId }, () => handler(...args))` and the service's emit-site would query the ambient context. However:

- `AsyncLocalStorage` is Node-only. The filesystem stack runs in a Web Worker / browser thread.
- The TC39 AsyncContext proposal is at Stage 2 with no shipped browser implementation.
- Polyfills exist but introduce significant runtime cost on every async boundary.

Therefore the author boundary (`WorkspaceFileService` mutating methods) legitimately retains a `context?` parameter — it is the only place in the stack where call-provenance can enter event-provenance without ambient context. This bounds the "shed the parameter" goal: it applies to forwarder layers, not the author boundary.

## Trade-offs

Side-by-side against first-principles tests:

| Test                                                                                               | Current design                                                                                      | Refined design (origin-on-event for forwarders only)                        | Winner               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------- |
| Layers own data they consume; shed data they don't                                                 | ❌ Forwarder layers carry typed param                                                               | ✅ Only consumer/author layers carry param/helper                           | Refined              |
| Behaviour-test (does varying the param change the method?)                                         | ❌ Fails for `ChangeEventBus.emit/subscribe`, `EventCoalescer.push` transit, `ThrottledWorker.push` | ✅ Passes                                                                   | Refined              |
| Bridge-as-filter (R12)                                                                             | ✅                                                                                                  | ✅                                                                          | Tie                  |
| Coalescer correctness on mixed-origin merges (Finding 14)                                          | ✅                                                                                                  | ✅ — helper reads origin from event in same loop                            | Tie                  |
| Consumer-visible API impact                                                                        | ✅ none                                                                                             | ✅ none                                                                     | Tie                  |
| Wire-shape change                                                                                  | ✅ none                                                                                             | ✅ none — annotation is intra-process only                                  | Tie                  |
| Scalability when adding `userId`/`traceId`-style metadata                                          | ❌ Cascade across 5 APIs + tests                                                                    | ✅ One-line at producer + one read at consumer                              | Refined              |
| Discoverability / grep-ability                                                                     | △ High but **misleading** — finds parameter on layers that don't act on it                          | ✅ Concentrated in named registry helper module — accurate to the data flow | Refined on principle |
| "Spooky action at a distance"                                                                      | ✅ explicit parameters                                                                              | △ helper indirection (named module, not AsyncLocalStorage magic)            | Mild current edge    |
| Total source references                                                                            | ❌ ~115 across 13 files                                                                             | ✅ ~25 across ~5 files                                                      | Refined              |
| Number of new types introduced (`TaggedChangeEvent`, `WorkspaceMutationContext`, generic widening) | ❌ 3                                                                                                | ✅ 1 (`WorkspaceMutationContext` retained at author boundary)               | Refined              |

The single concession to the current design — explicit parameters are easier to debug than helper-module indirection — is bought at the cost of category-error parameters on three APIs. The proposed refinement keeps debuggability at the boundaries that matter (author + consumer) and removes it only from forwarders that have nothing to debug.

## Alternative Designs Considered

| #   | Design                                                                                                                    | Verdict            | Rationale                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Bridge-only `{port → pending paths}` map; no propagation past the bridge                                                  | ❌ Reject          | Cannot represent mixed-origin coalesced events; would suppress legitimate external writes that happen to coalesce with self-writes.                            |
| A2  | Bridge intercepts call, broadcasts directly to peer ports, suppresses `eventBus` emission for self-writes                 | ❌ Reject          | Bridge-emitted self-events and bus-emitted external events for the same path within the coalescing window would no longer merge → consumers see double events. |
| A3  | Move all `eventBus.emit(...)` calls out of `WorkspaceFileService` into the bridge wrapper                                 | ❌ Reject          | Same merge problem as A2; also breaks non-bridge consumers (CLI, Electron PoC) of `WorkspaceFileService` whose contract today is "mutating methods emit".      |
| A4  | `AsyncLocalStorage`-style ambient context                                                                                 | ❌ Reject (today)  | Not natively available in Web Worker / browser environment; polyfills cost too much per async boundary. Revisit if TC39 AsyncContext ships.                    |
| A5  | Origin-on-event via `WeakMap<ChangeEvent, string>` registry, `context?` parameter retained at `WorkspaceFileService` only | ✅ **Recommended** | Keeps R12 bridge-as-filter and Finding 14 merge correctness; eliminates forwarder-layer plumbing; passes the eigenquestion.                                    |

## Recommendations

**Implementation status (2026-05-03):** R2–R8 are implemented in the codebase (`event-origin-registry`, `_emitChangeEvent` on `WorkspaceFileService`, single-arg `ChangeEventBus` / `EventCoalescer.push`, `coalesceChangeEvents`, bridge `getEventOrigin`). R1 remains the standing design constraint (bridge skip-originator).

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort | Impact                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------- |
| R1  | Keep R12 (bridge skip-originator). The regression class it prevents is real; do not revert.                                                                                                                                                                                                                                                                                                 | P0       | —      | —                                                                           |
| R2  | Introduce `packages/filesystem/src/event-origin-registry.ts` — a `WeakMap<ChangeEvent, string>` with `tagEventOrigin(event, id)` and `getEventOrigin(event)`. ~30 lines, fully typed, easily unit-tested.                                                                                                                                                                                   | **P1**   | Low    | Establishes the named indirection module so the helper reads are grep-able. |
| R3  | Inside each `WorkspaceFileService` mutating method, replace `this._eventBus.emit(event, context?.originClientId)` with `if (context?.originClientId !== undefined) tagEventOrigin(event, context.originClientId); this._eventBus.emit(event)`. Author boundary keeps its `context?: WorkspaceMutationContext` parameter (legitimate — see Finding 6).                                       | **P1**   | Low    | Localises the call→event provenance conversion to its rightful layer.       |
| R4  | Drop the second argument from `ChangeEventBus.emit/subscribe`. Bus reverts to origin-blind broadcast. Update `change-event-bus.test.ts` (1 reference).                                                                                                                                                                                                                                      | **P1**   | Low    | Removes Finding 3's category-error parameter.                               |
| R5  | Drop `TaggedChangeEvent`. `EventCoalescer.push(event)` reverts to single-arg. The merge loop reads origin via `getEventOrigin(event)` at the same call-sites it currently reads `item.originClientId`. `coalesceTaggedChangeEvents` renames back to `coalesceChangeEvents`; `mergeOriginsFromTagged` becomes a private helper that takes `ChangeEvent[]`. Update `event-coalescer.test.ts`. | **P1**   | Medium | Collapses the largest single source of churn (27 references → ~6).          |
| R6  | Drop `ThrottledWorker`'s `TaggedChangeEvent` widening — it returns to its pre-R12 shape. Update `watch-stress.test.ts`.                                                                                                                                                                                                                                                                     | **P1**   | Low    | Restores the throttled worker to a generic-free origin-blind chunker.       |
| R7  | Bridge `deliverToHandles` reads origin via `getEventOrigin(event)` instead of destructuring `{ event, originClientId }`. The filter loop is otherwise identical. `filesystem-bridge.test.ts` cross-port assertions stay unchanged behaviourally.                                                                                                                                            | **P1**   | Low    | Single-line internal change.                                                |
| R8  | Document the resulting contract in [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md): "self-write suppression is a bridge-internal concern; `originClientId` is attached to events via the `event-origin-registry` and is never sent over the wire". Prevents the next reviewer from re-litigating R2/R4 placement.                                                      | P2       | Low    | Closes the architectural decision in policy.                                |

Combined R2–R7 shipped as above; R8 is documented in [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md) (Bridge self-write suppression). The regression tests for R12 stay green because the filter and merge rule preserve identical behaviour.

## Code Examples

Proposed `event-origin-registry.ts` (illustrative):

```typescript
import type { ChangeEvent } from '#types.js';

const originRegistry = new WeakMap<ChangeEvent, string>();

/** Tag an event with the bridge port id that initiated the underlying mutation. */
export function tagEventOrigin(event: ChangeEvent, originClientId: string): void {
  originRegistry.set(event, originClientId);
}

/** Read the originating bridge port id for an event, if any. */
export function getEventOrigin(event: ChangeEvent): string | undefined {
  return originRegistry.get(event);
}
```

Proposed shape of the coalescer's merge function (illustrative):

```typescript
function mergeOrigins(history: ChangeEvent[]): string | undefined {
  let sawDefined = false;
  let sawUndefined = false;
  let singleDefined: string | undefined;
  for (const event of history) {
    const origin = getEventOrigin(event);
    if (origin === undefined) {
      sawUndefined = true;
    } else {
      sawDefined = true;
      if (singleDefined === undefined) {
        singleDefined = origin;
      } else if (singleDefined !== origin) {
        return undefined;
      }
    }
  }
  return sawUndefined && sawDefined ? undefined : singleDefined;
}
```

Bridge filter, post-refactor (illustrative):

```typescript
const deliverToHandles = (events: ChangeEvent[]): void => {
  for (const event of events) {
    const originClientId = getEventOrigin(event);
    for (const [recipientPort, handle] of serverHandles) {
      const recipientPortId = portIds.get(recipientPort);
      if (originClientId !== undefined && recipientPortId !== undefined && originClientId === recipientPortId) {
        continue;
      }
      handle.emit('fileChanged', event);
    }
  }
};
```

`WorkspaceFileService.writeFile` post-refactor (illustrative — note the author-boundary parameter is retained):

```typescript
public async writeFile(
  path: string,
  data: Uint8Array<ArrayBuffer> | string,
  context?: WorkspaceMutationContext,
): Promise<void> {
  return this._crossTabCoordinator.withWriteLock(path, async () =>
    this._resourceQueue.queueFor(path, async () => {
      const { provider, path: resolvedPath, backend: resolvedBackend } = this._resolveProvider(path);
      await this._ensureParentDir(provider, resolvedPath);
      await provider.writeFile(resolvedPath, data);

      this._filePool?.invalidate(path);
      const size = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
      this._inMemoryTreeAddFile(path, size);
      this._treeCache.invalidate(parentDirectory(path));

      const event: ChangeEvent = { type: 'fileWritten', path, backend: resolvedBackend };
      if (context?.originClientId !== undefined) {
        tagEventOrigin(event, context.originClientId);
      }
      this._eventBus.emit(event);
    }),
  );
}
```

## References

### Internal docs

- [`file-services-architecture-blueprint.md`](file-services-architecture-blueprint.md) — Source of R12 (bridge skip-originator), R16 (coalescer mixed-origin merge), R17 (`originClientId` propagation through the FS stack), Finding 14 (mixed-origin merge rule).
- [`editor-flash-on-buffering-cycle.md`](editor-flash-on-buffering-cycle.md) — User-visible regression that motivated R12.
- [`agent-filesystem-stale-cache-audit.md`](agent-filesystem-stale-cache-audit.md) — Earlier audit whose remediation introduced the original echo-handling code path.
- [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md) — Target for R8 documentation.
- [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) — Provides the "fail the behaviour-test" framing for parameter scrutiny.

### Source

- [`packages/filesystem/src/workspace-file-service.ts`](../../packages/filesystem/src/workspace-file-service.ts) — Author boundary; eight mutating methods accepting `WorkspaceMutationContext`.
- [`packages/filesystem/src/change-event-bus.ts`](../../packages/filesystem/src/change-event-bus.ts) — Forwarder layer (target for R4).
- [`packages/filesystem/src/event-coalescer.ts`](../../packages/filesystem/src/event-coalescer.ts) — Mixed-acting/forwarding layer (target for R5).
- [`packages/runtime/src/filesystem/filesystem-bridge.ts`](../../packages/runtime/src/filesystem/filesystem-bridge.ts) — Filter + author of `methodContextProvider` (target for R7).
- [`packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts`](../../packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts) — Hosts the `methodContextProvider` plumbing.

### External precedent

- [W3C Trace Context](https://www.w3.org/TR/trace-context/) — Canonical example of intra-process correlation IDs carried as opaque baggage rather than typed parameters per layer.
- [TC39 AsyncContext proposal](https://github.com/tc39/proposal-async-context) — The "ideal" form of opaque baggage for async-call-scoped data; not yet shipped in browsers (informs Finding 6).

## Appendix

### Reference inventory by layer role

| Role                  | Layer                                                    | Source refs | Notes                                                                                       |
| --------------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Author (legitimate)   | `WorkspaceFileService` mutating methods                  | 18          | Only the `context?` parameter and 8 emit-site reads survive R3; remainder is comment/JSDoc. |
| Consumer (legitimate) | `EventCoalescer` merge logic                             | ~6 of 27    | Merge rule retained as `mergeOrigins(ChangeEvent[])` reading the registry.                  |
| Consumer (legitimate) | `filesystem-bridge.deliverToHandles`                     | ~3 of 17    | Filter retained; loses per-recipient `TaggedChangeEvent` destructuring.                     |
| Forwarder (avoidable) | `ChangeEventBus.emit/subscribe`                          | 5           | Eliminated by R4.                                                                           |
| Forwarder (avoidable) | `EventCoalescer.push` transit + `TaggedChangeEvent` type | ~21 of 27   | Eliminated by R5.                                                                           |
| Forwarder (avoidable) | `ThrottledWorker` generic widening                       | implicit    | Eliminated by R6.                                                                           |
| Forwarder (avoidable) | `WatchRegistry`                                          | 5           | Eliminated when bus revert to single-arg.                                                   |
| Forwarder (avoidable) | Test fixtures asserting parameter passthrough            | ~25         | Most simply delete; behaviour-tests reading `getEventOrigin` replace them.                  |

### Why the author boundary keeps its parameter

In a Node-only world `AsyncLocalStorage` could shed even the `context?` parameter on `WorkspaceFileService` — the bridge would `run({ originClientId: portId }, () => handler(...args))` and the service's emit-site would query the ambient context. In a browser/Web Worker world that primitive does not exist (Finding 6). The two practical alternatives — monkey-patching `eventBus.emit` during the call, or stashing port id in a thread-local module variable — are both more brittle than an explicit parameter at the single boundary where call-context legitimately becomes event-context. Therefore the refined design is "shed the parameter from forwarder layers; retain it at the author boundary".
