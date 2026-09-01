---
title: 'File Services Architecture Blueprint'
description: 'Forward-looking architecture for the main-thread file services — root-cause findings from the editor-flash regression, packaging audit, and a phased plan that eliminates the bug class structurally via bridge-layer skip-originator dispatch and shared client infrastructure in @taucad/filesystem.'
status: draft
created: '2026-05-02'
updated: '2026-05-02'
category: architecture
related:
  - docs/research/editor-flash-on-buffering-cycle.md
  - docs/research/agent-filesystem-stale-cache-audit.md
  - docs/research/binary-file-open-perpetual-loading.md
  - docs/policy/filesystem-policy.md
---

# File Services Architecture Blueprint

Forward-looking architecture for the main-thread file services (`FileContentService`, `FileTreeService`) — what's broken today, where the right boundaries lie, and a phased plan to a shared-infrastructure design where the editor-flash class of bug is structurally impossible.

## Executive Summary

Two main-thread services — `FileContentService` (bytes, outcomes) and `FileTreeService` (tree, metadata) — both consume the same FM-worker `fileChanged` push channel. They were extracted from the same machine context (commit `309292451`) but have since drifted: `FileTreeService` patches in place, suppresses self-write echoes, and skips events for unloaded subtrees; `FileContentService` does none of those things. The drift caused the editor-flash regression in commit `fc548205b` (typing in Monaco unmounts the editor every keystroke).

The fix is not to merge the two facades — bytes and metadata are legitimately distinct concerns — but to **(a) eliminate self-echoes at the bridge layer** (the originator never receives its own events; the write `Promise` is the acknowledgment) and **(b) extract the duplicated channel/path/subscriber machinery into a shared client layer** in `@taucad/filesystem`. With those two moves, the regression class becomes structurally impossible: there are no self-echoes for facades to mishandle, and there is one channel-subscription point instead of two parallel ones to drift between.

The bridge-layer fix is the meaningful design change identified during adversarial review. It collapses what were originally three competing approaches (facade-side TTL suppression, typed `origin` wire field, per-subscription `suppressSelf` flag) into one: deliver the event to every port **except** the one that initiated the mutation. No new wire field, no TTL window, no per-handler flag.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Scope and Non-Goals](#scope-and-non-goals)
- [Current Architecture](#current-architecture)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [Recommendations](#recommendations)
- [Phased Roadmap](#phased-roadmap)
- [Trade-offs](#trade-offs)
- [References](#references)

## Problem Statement

Three concerns merge into one investigation:

1. **A user-visible regression.** Every keystroke in Monaco unmounts the code editor — the `LogoLoader` flashes, focus is lost, cursor and IME state are reset. Triggered by commit `fc548205b` ~13 hours before the report. Detailed root-cause in [`editor-flash-on-buffering-cycle.md`](editor-flash-on-buffering-cycle.md).
2. **An architectural drift.** The same regression was structurally impossible in the peer service `FileTreeService` because that service evolved several protections the implementer of `fc548205b` did not port over. The two services have diverged on contracts that should be identical at the channel-subscription layer.
3. **A packaging boundary mismatch.** Both services live in `apps/ui/app/lib/` despite being app-agnostic main-thread clients of `@taucad/filesystem`. The Electron PoC (`examples/electron-tau`) re-implements 185 lines of FS bridging because there is no shared main-thread file client to consume.

Treating only #1 yields a band-aid; treating #2 alone misses the bug; treating #3 alone leaves the bug latent. This blueprint resolves all three.

## Scope and Non-Goals

**In scope**

- `FileContentService`, `FileTreeService`, and the shared infrastructure they should compose
- The `proxy.listen('fileChanged', …)` push channel and its subscribers
- The bridge layer in `packages/runtime/src/filesystem/` and `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts` that marshals events to main-thread ports
- The package boundary between `@taucad/filesystem`, `apps/ui`, and downstream consumers (`examples/electron-tau`, `packages/cli`)
- Render-layer consumers that subscribe via `useSyncExternalStore` (`useFileContent`, `useFileTree`, …)

**Out of scope**

- Worker-side file system providers and `WorkspaceFileService` internals (already in `@taucad/filesystem`, no shape changes proposed; the only addition is an optional `originClientId` argument on mutating methods so the bridge can tag emissions)
- `MonacoModelService` lifecycle — has hard Monaco bindings, stays in `apps/ui/app/lib/`
- The `FilesystemObserverBridge` and `EventCoalescer` primitives — already in `@taucad/filesystem` and correct in shape; coalescer gains an origin-aware merge rule but no new public surface
- Cache replacement policy / sizing for `BoundedFileCache`
- Cross-tab `BroadcastChannel` semantics (treated as `external` by the bridge by definition)
- `git.machine.ts` content subscriptions (separate investigation if needed)

## Current Architecture

```
┌──────────────────────────────────── Main thread ────────────────────────────────────┐
│                                                                                       │
│  React components / hooks                                                             │
│      ↓ useSyncExternalStore                                                           │
│  ┌────────────────────┐    ┌─────────────────┐    ┌───────────────────────┐          │
│  │ FileContentService │    │ FileTreeService │    │ MonacoModelService    │          │
│  │ apps/ui/app/lib/   │    │ apps/ui/app/lib │    │ apps/ui/app/lib/      │          │
│  │ • cache (bytes)    │    │ • _tree Map     │    │ • monaco models       │          │
│  │ • outcomes Map     │    │ • optimistic*   │    │ • markers             │          │
│  │ • subscribers ×4   │    │ • subscribers   │    │ • subscribes via      │          │
│  │ • handleWorker…    │    │ • handleWorker… │    │   onDidContentChange  │          │
│  │   ❌ no source     │    │   ✅ source-aware│    │   ✅ source-aware     │          │
│  │   ❌ blanks outcome│    │   ✅ patch-in-place│  │                       │          │
│  └─────────┬──────────┘    └────────┬────────┘    └───────────────────────┘          │
│            │                        │                                                 │
│            └─── proxy.listen('fileChanged', …) — same channel, two subscribers ──┐    │
│                                                                                   │   │
└────────────────────────────── MessagePort (comlink) ──────────────────────────────┼───┘
                                                                                    ↓
┌─────────────────────────────── FM worker ──────────────────────────────────────────┐
│                                                                                     │
│  exposeFileSystem(workspaceFileService, …)  ← packages/filesystem                   │
│      └─ WorkspaceFileService                                                        │
│           ├─ ProviderRegistry → DirectIdb / Opfs / FsAccess                         │
│           ├─ FileSystemObserverBridge → ChangeEventBus → WatchRegistry              │
│           └─ EventCoalescer + ThrottledWorker (200 ms window)                       │
│  packages/runtime/src/filesystem/filesystem-bridge.ts                                │
│      └─ marshals ChangeEvent → every connected port (no origin discrimination)      │
│  packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts               │
│      └─ legacy: auto-emits unstructured `fileChanged` after every mutating call     │
│         (parallel emission path; predates the structured ChangeEvent contract)      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Two extraction commits laid this down:

| Commit      | Date       | What it did                                                                         |
| ----------- | ---------- | ----------------------------------------------------------------------------------- |
| `309292451` | 2026-04-29 | Extracted `FileContentService` + `FileTreeService` from machine context             |
| `fc548205b` | 2026-05-02 | Wired `contentService.handleWorkerFileChanged` into `proxy.listen` (the regression) |

Lines of code today:

| File                                                                    | Lines | Tests   |
| ----------------------------------------------------------------------- | ----- | ------- |
| `apps/ui/app/lib/file-content-service.ts`                               | 638   | yes     |
| `apps/ui/app/lib/file-tree-service.ts`                                  | 747   | yes     |
| `apps/ui/app/lib/file-content-errors.ts`                                | 49    | yes     |
| `apps/ui/app/lib/seems-binary.ts`                                       | 56    | yes     |
| `apps/ui/app/lib/monaco-model-service.ts`                               | 599   | yes     |
| `packages/filesystem/src/workspace-file-service.ts`                     | 1022  | yes     |
| `packages/runtime/src/filesystem/filesystem-bridge.ts`                  | (TBD) | partial |
| `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts` | (TBD) | partial |

## Findings

Findings are grouped by class. Markers: 🐞 (bug), 🧬 (drift), 📦 (packaging), 🔌 (bridge layer).

### Finding 1 🐞: Open files transition through `loading` on every echo

`FileContentService.handleWorkerFileChanged` (`file-content-service.ts:379-435`) deletes both the cache entry **and** the `outcomes` Map entry on every `fileWritten` echo. `peekOutcome(path)` then returns the shared `loadingOutcome` sentinel; `useFileContent`'s `useSyncExternalStore` consumer re-renders with `result.kind === 'loading'`; `FileEditor` switches to the `<Loader>` branch; the entire `<CodeEditor>` subtree unmounts; Monaco's editor instance is destroyed (`keepCurrentModel` saves the model but not focus/cursor/scroll/IME). One IPC roundtrip later the recovery `resolve(path)` re-publishes `text` and a fresh editor mounts. Detailed trace: [`editor-flash-on-buffering-cycle.md`](editor-flash-on-buffering-cycle.md) — Findings 1–6.

### Finding 2 🐞: Same anti-pattern in three more event branches

| Event type         | Destructive operation                                                | Effect on open editors                                   |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `fileWritten`      | `outcomes.delete(relative)`                                          | Flash on every keystroke (the reported bug).             |
| `fileRenamed`      | `outcomes.delete(old)` + `outcomes.delete(new)`                      | Flash any editor open on either path during rename.      |
| `directoryChanged` | `invalidateUnderPrefix` deletes outcomes for every path under prefix | Flash every open editor under the prefix simultaneously. |
| `backendChanged`   | Clears entire `outcomes` Map and notifies every subscriber           | Flash every open editor during backend swap.             |
| `fileDeleted`      | `publishOutcome(path, { kind: 'orphaned' })` — defined transition    | ✅ correct; only branch using swap-in-place.             |

`fileDeleted` proves the fix is one-line per branch.

### Finding 3 🐞: Failing test codifies the broken contract

`apps/ui/app/lib/file-content-service.test.ts:664-678` asserts `expect(service.peekOutcome('main.ts')).toEqual({ kind: 'loading' })` after a `fileWritten` echo. The test name advertises "out-of-band" semantics the code cannot enforce (no source discriminator exists). A reviewer reading only the title would assume self-echo suppression is in place when it isn't. The replacement test must also use the public `subscribe(path, cb)` + snapshot `peekOutcome` pattern (mirroring how `useFileContent`'s `useSyncExternalStore` reads state) — observing only `peekOutcome` after the fact misses any transient `loading` snapshot the consumer would actually see.

### Finding 4 🐞: Recovery resolve costs one IPC roundtrip per keystroke

After the synchronous flash, `useFileContent`'s effect calls `resolve(path)` → `proxy.readFile(absolutePath)` over comlink. Even on a hot path that's tens of milliseconds. The bridge-layer skip-originator fix (R12) eliminates this roundtrip entirely for self-writes — the originating port never sees the echo, so the consumer never re-enters `loading`, so no recovery resolve is queued.

### Finding 5 🧬: Reference implementation already exists in `FileTreeService`

The peer service `FileTreeService` (extracted weeks before the regression) handles the same `fileChanged` channel correctly:

| Protection                                       | `FileTreeService`                                                                | `FileContentService` (`fc548205b`)                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Patch-in-place on file events                    | `optimisticAdd` / `optimisticDelete` / `optimisticRename`                        | `outcomes.delete` then `notifyPathSubscribers` — readers see `loading`   |
| Skip events for unloaded subtrees                | `_resolvedDirectories.has(parentPath)` guard                                     | Unconditional `cache.delete` + `outcomes.delete` for every event         |
| Debounce directory refresh                       | `scheduleRefresh` coalesces multiple events into one re-fetch                    | `invalidateUnderPrefix` evicts every entry then notifies each subscriber |
| Source-aware self-write filter (content channel) | `if (event.source === 'editor') { return; }` (`file-tree-service.ts:618`, `626`) | ❌ missing                                                               |

`fc548205b` adopted the dispatch shape from the tree service but neither of the protections that make it safe for live consumers.

### Finding 6 🧬: Source-based echo suppression is the dominant pattern at the content channel

Both `MonacoModelService.handleContentChange` (`monaco-model-service.ts:280-285`) and `FileTreeService.handleContentChange` (`file-tree-service.ts:618-631`) use the identical filter `if (event.source === 'editor') { return; }`. The pattern is well-established at the **content** channel (`onDidContentChange`) — but the **worker** channel (`proxy.listen('fileChanged', …)`) carries no `source` field. The traditional proposal would have plumbed an `origin: 'self' | 'external'` field through the wire. Adversarial review (R12) showed this is unnecessary: the bridge already knows which port initiated each mutation, so it can simply skip that port when fanning out the resulting events. No wire-shape change required.

### Finding 7 🧬: Both services duplicate the same machinery

| Concern                                 | `FileContentService` | `FileTreeService`                |
| --------------------------------------- | -------------------- | -------------------------------- |
| `rootPrefix` calculation                | inline               | inline (different formulation)   |
| `toRelativePath(absolute, prefix)`      | private helper       | private helper (different shape) |
| `proxy.listen('fileChanged')` consumer  | yes                  | yes (independent subscription)   |
| Subscriber registry (`Set<() => void>`) | 4 channels           | 1 channel                        |
| Lifecycle (`reset` / `dispose`)         | yes                  | yes                              |
| Echo policy                             | none (the bug)       | source-aware + skip-unloaded     |

Two separate implementations of the same primitives is exactly how `fc548205b` was able to silently drift. A shared layer would make the contract one decision instead of two.

### Finding 8 📦: Packaging precedent already supports moving these to `@taucad/filesystem`

`WorkspaceFileService` is described in its own JSDoc as "Layer 3a UI-side workspace orchestrator" yet lives in `packages/filesystem/src/workspace-file-service.ts`. The package already contains UI-shaped code; moving the main-thread peer is consistent with established practice. Co-location with cache primitives (`BoundedFileCache`, `ChangeEventBus`, `EventCoalescer`, `ThrottledWorker`, `FileSystemObserverBridge`) — all of which the two services compose — would put the consumers in the same directory as their dependencies.

### Finding 9 📦: Electron PoC re-implements 185 lines of FS bridging

`examples/electron-tau/src/main/fs-bridge.ts` exists because there is no shared main-thread file client in `@taucad/filesystem`. A consolidated client in the package would let Electron drop the bespoke bridge and validate the package boundary. Same opportunity exists for `packages/cli` (today goes direct against Node `fs`, would benefit from the cache + outcome layer if/when CLI grows interactive features).

### Finding 10 📦: Only two real blockers prevent the move

Both mechanical:

1. **`FileManagerProxy` lives in apps/ui** (`apps/ui/app/machines/file-manager.machine.types.ts`). Promote the protocol portion to `@taucad/filesystem` as `FileSystemClient`; keep `FileManagerProxy = FileSystemClient & { … }` as the apps/ui-specific extension.
2. **`document.visibilityState` reference in `FileTreeService.startPolling`**. Inject a `VisibilityProvider` interface (`{ isVisible(): boolean; onVisibilityChange(cb): () => void }`); apps/ui supplies a DOM-backed implementation, headless consumers supply a no-op. ~20-line change.

After both: zero apps/ui-only dependencies remain.

### Finding 11 🔌: Two parallel bridge layers carry "fileChanged" with different shapes

`packages/runtime/src/filesystem/filesystem-bridge.ts` is the structured path — it observes `WorkspaceFileService`'s `ChangeEventBus`, runs events through `EventCoalescer` + `ThrottledWorker`, and delivers structured `ChangeEvent`s to every connected port. `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts` is a legacy parallel path: after every mutating method on the proxy (`writeFile`, `mkdir`, `rename`, `unlink`, …) it auto-emits an unstructured `fileChanged` notification to all ports. The two paths existed concurrently because the legacy path predates the structured contract.

For the bridge-layer skip-originator design (R12) to work, every `fileChanged` event must flow through one path that knows the originator. The legacy auto-emit path has no originator concept, so it broadcasts to every port unconditionally — including the originator. Leaving it in place would re-introduce the regression class even after R12. The legacy path must be removed (or rewritten to defer to the structured path) as part of Phase 1.

### Finding 12 🔌: Async `refresh` operations need per-path generation guards

Once `FileContentService` adopts swap-in-place via background re-resolve, two `fileWritten` echoes arriving in quick succession can race: echo 1 starts a `refresh(p)` that does a slow `readFile` + classification; echo 2 starts a second `refresh(p)` that completes first; echo 1's stale result then overwrites the newer outcome. Even though no `loading` flash occurs, the consumer ends up with stale text. The fix is a per-path monotonic generation counter incremented on every refresh start, with the result discarded if the path's generation has advanced by the time the read resolves. Same shape as the existing fix for stale parameter reads (`docs/research/shared-pool-stale-parameter-reads.md`).

### Finding 13 🔌: Naive "swap to text" loses binary / too-large / forceText classification

The original Phase 1 sketch named the helper `swapTextInPlace` and unconditionally replaced the outcome with `{ kind: 'text', … }`. That breaks the discriminated `FileContentResult` contract introduced in [`binary-file-open-perpetual-loading.md`](binary-file-open-perpetual-loading.md): a file that started as `text` could later trip the binary sniffer (BOM + NUL heuristic on the first 512 bytes) or grow past the size cap, and the consumer must observe the `binary` / `too-large` outcome instead of stale text. The refresh helper must run the full `computeOutcome` pipeline — same classification a fresh `resolve()` would — and rename to `refreshOutcomeInPlace` to make this contract explicit.

### Finding 14 🔌: `EventCoalescer` mixed-origin merge needs a defined rule

`EventCoalescer` merges multiple `ChangeEvent`s for the same path within a 200 ms window into a single emission. With the bridge-layer skip-originator design, each event in the coalescing buffer carries its `originClientId`. When two ports write to the same path inside one window, the merged event has no single originator. The defined rule:

- **Same originator across the merged set**: preserve `originClientId` — the originator still gets skipped.
- **Mixed originators**: clear `originClientId` to `undefined` — the merged event is delivered to every port (no port can claim it as a self-write). This is the safe default; missing an event is worse than redelivering one to a port that contributed to the merge.

The rule is local to the coalescer's merge logic, no public-surface change.

## Target Architecture

The target keeps two facades (split-by-concern) but moves them onto a shared infrastructure layer that owns the channel, path resolution, and subscriber registry. One worker subscription, one place to enforce contracts. The bridge layer skips the originator, so facades never have to suppress their own echoes.

```
┌──────────────────────────────────── Main thread ──────────────────────────────────────┐
│                                                                                         │
│  React hooks (useFileContent, useFileTree, useFileMetadata, …)                          │
│      ↓ useSyncExternalStore                                                             │
│  ┌─────────────────────┐         ┌─────────────────────┐                                │
│  │ FileContentService  │         │ FileTreeService     │   ← thin facades               │
│  │ • cache (bytes)     │         │ • _tree Map         │     (~400 lines each)          │
│  │ • outcomes Map      │         │ • optimistic patch  │                                │
│  │ • refreshOutcome…   │         │ • metadata-only API │                                │
│  └──────────┬──────────┘         └──────────┬──────────┘                                │
│             │                                │                                          │
│             └────────────────┬───────────────┘                                          │
│                              ↓                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │ Shared Workspace Client Infrastructure  (@taucad/filesystem/src/client/)       │    │
│  │                                                                                │    │
│  │ • WorkerChangeChannel       — single proxy.listen subscriber; 10 typed Topic<E> fan-outs      │    │
│  │                               • routes by event type to typed handlers         │    │
│  │                               • per-handler `interestedIn` scope predicate     │    │
│  │                               • NO suppression logic (bridge already filtered) │    │
│  │ • WorkspacePathResolver     — rootDirectory, rootPrefix, toRelativePath, …     │    │
│  │ • PathSubscriberRegistry<T> — subscribe(path), notify(path), useSEStore-shaped │    │
│  │ • VisibilityProvider        — isVisible(), onChange(cb) — DI for DOM-free use  │    │
│  │ • RefreshGenerationGuard    — per-path monotonic counter for async refresh     │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│                              ↓                                                          │
│  FileSystemClient interface (was FileManagerProxy, promoted to package)                │
│             │                                                                           │
└────────────────────────── MessagePort (comlink) ────────────────────────────────────────┘
                                                                                          ↓
┌────────────────────────── Bridge layer (packages/runtime) ──────────────────────────────┐
│                                                                                          │
│  filesystem-bridge.ts                                                                    │
│    • dispatchHandler injects the recipient port's id as `originClientId`                 │
│      on every mutating proxy call (writeFile, mkdir, rename, unlink, …)                  │
│    • subscribes to ChangeEventBus, runs through EventCoalescer + ThrottledWorker         │
│    • deliverToHandles fans out: for each connected port,                                 │
│        if (event.originClientId === recipientPortId) continue;  ← skip-originator        │
│        port.postMessage(event)                                                           │
│                                                                                          │
│  transport/_internal/runtime-filesystem-bridge.ts                                        │
│    • legacy mutating-method auto-emit REMOVED                                            │
│      (was: parallel unstructured `fileChanged` to every port; now: defers to bridge)     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                                                                          ↓
[ FM worker — unchanged shape: WorkspaceFileService, ProviderRegistry, ChangeEventBus, … ]
[ WorkspaceFileService mutating methods gain optional trailing `context?: { originClientId? }` ]
[ ChangeEventBus.emit(event, originClientId?) propagates the bit to subscribers ]
```

### Data flow: write originating from Port A (editor) — the regression scenario

```
Port A (editor)        Port B (kernel watcher)        Bridge                 WorkspaceFileService
   │                          │                          │                           │
   │  writeFile(p, bytes) ──────────────────────────────►│  dispatchHandler          │
   │                          │                          │  injects originClientId=A │
   │                          │                          │  ──────────────────────► │
   │                          │                          │                           │
   │                          │                          │   ChangeEventBus.emit(    │
   │                          │                          │     event, originId=A) ◄──│
   │                          │                          │                           │
   │                          │                          │  EventCoalescer (200ms)  │
   │                          │                          │  emits chunk: [{event,A}] │
   │                          │                          │                           │
   │                          │                          │  deliverToHandles:        │
   │                          │     fileChanged ◄──────  │   • for Port A: skip      │
   │                          │                          │   • for Port B: deliver   │
   │  Promise resolves ◄──────────────────────────────── │                           │
   │                          │                          │                           │
   │  (no echo, no flash, no recovery resolve)          │                           │
   │  consumer's outcome stays text(bytes)              │                           │
   │                          │  optimistic patch / kernel re-render                 │
```

The originator's acknowledgment is the resolved write `Promise`. The peer port (`B`) receives the change, runs its own kernel logic. Neither side needs a wire-shape change, a TTL window, or a `suppressSelf` flag.

### Contracts the design enforces

1. **Open-file outcome contract**: once a path has reached `text`, its outcome transitions only to another classification — `text(a) → text(b)`, `text → binary`, `text → too-large`, `text → orphaned`, or `text → error`. Never back to `loading`. Enforced inside `FileContentService` because the outcome Map is owned there.
2. **Single-subscription contract**: exactly one `proxy.listen('fileChanged', …)` subscription per `WorkerChangeChannel`. Both facades subscribe to the channel's typed handlers, not to the proxy directly. Eliminates the "two services drift on the same channel" failure mode by construction.
3. **Skip-originator contract** (bridge layer, R12): the bridge never delivers an event back to the port that initiated the underlying mutation. Self-writes are acknowledged by the resolved write `Promise`; the corresponding `fileChanged` event is delivered only to peer ports.
4. **Scope-skip contract**: events for paths outside any live consumer's subscription scope are no-ops at the channel layer (`interestedIn` predicate on each handler registration). Mirrors `FileTreeService._resolvedDirectories.has(parent)` guard for the content service.
5. **Refresh-generation contract**: every async `refreshOutcomeInPlace(path)` call increments a per-path counter; if the path's counter has advanced by the time the read settles, the result is discarded.
6. **Coalescer mixed-origin rule**: merged events with a single shared `originClientId` preserve it; merged events with mixed origins clear it (delivered to every port).

### Package layout

```
packages/filesystem/src/
  ├── (worker side — unchanged shape)
  │   ├── workspace-file-service.ts            (mutating methods gain optional trailing
  │   │                                          `context?: { originClientId?: string }`)
  │   ├── change-event-bus.ts                  (`emit(event, originClientId?)` and
  │   │                                          `subscribe((event, originClientId) => …)`)
  │   ├── event-coalescer.ts                   (origin-aware merge per Finding 14)
  │   ├── throttled-worker.ts                  (chunk element type widens to carry origin)
  │   ├── file-system-service.ts
  │   ├── provider-registry.ts
  │   ├── watch-registry.ts
  │   ├── backend/filesystem-observer-bridge.ts (emits with originClientId=undefined → external)
  │   ├── bounded-file-cache.ts
  │   └── …
  │
  ├── client/                                    ← NEW: main-thread clients
  │   ├── file-system-client.ts                  (was FileManagerProxy protocol)
  │   ├── workspace-path-resolver.ts             (extracted shared helper)
  │   ├── worker-change-channel.ts               (single proxy.listen owner)
  │   ├── path-subscriber-registry.ts            (extracted shared helper)
  │   ├── visibility-provider.ts                 (interface + DOM impl + headless impl)
  │   ├── refresh-generation-guard.ts            (per-path counter)
  │   ├── file-content-service.ts                (moved from apps/ui)
  │   ├── file-tree-service.ts                   (moved from apps/ui)
  │   ├── file-content-errors.ts                 (moved from apps/ui)
  │   └── seems-binary.ts                        (moved from apps/ui)

packages/filesystem/package.json
  exports:
    "./client/file-system-client":   "./src/client/file-system-client.ts"
    "./client/file-content-service": "./src/client/file-content-service.ts"
    "./client/file-tree-service":    "./src/client/file-tree-service.ts"
    "./client/worker-change-channel":"./src/client/worker-change-channel.ts"
    …  (one subpath per file; no client/index.ts barrel — library-api-policy)
  publishConfig.exports: same set, mirrored
                        (without this consumers of the published tarball get
                         "subpath not exported" errors at install time)

packages/runtime/src/
  ├── filesystem/filesystem-bridge.ts           ← skip-originator dispatch
  └── transport/_internal/runtime-filesystem-bridge.ts
                                                ← legacy auto-emit REMOVED

apps/ui/app/lib/
  ├── monaco-model-service.ts                    ← stays (Monaco-bound)
  └── monaco-*.ts                                ← stay

apps/ui/app/machines/
  └── file-manager.machine.types.ts              ← keeps FileManagerProxy as
                                                    FileSystemClient + { dispose, listen }
                                                    (apps/ui-specific extension)
```

### Refactored facade shape (illustrative)

```typescript
// packages/filesystem/src/client/file-content-service.ts
export class FileContentService {
  constructor(deps: {
    paths: WorkspacePathResolver;
    channel: WorkerChangeChannel; // ← shared with FileTreeService
    cache: BoundedFileCache;
    client: FileSystemClient;
    refreshGuard: RefreshGenerationGuard;
    filePool?: SharedPool;
  }) {
    // The bridge already filtered self-writes. Every event arriving here
    // is an external mutation. By construction.
    deps.channel.onFileWritten({
      interestedIn: (p) => this.outcomes.has(p) || this.cache.has(p),
      handler: (evt) => {
        if (this.outcomes.has(evt.path)) {
          // Open path — re-resolve in background, swap to fresh outcome.
          // Runs full computeOutcome (binary/too-large/text classification).
          void this.refreshOutcomeInPlace(evt.path);
        } else {
          // Closed path — drop cache only. No notify (no subscribers).
          this.cache.delete(evt.path);
        }
      },
    });

    deps.channel.onFileDeleted({
      interestedIn: (p) => this.outcomes.has(p) || this.cache.has(p),
      handler: (evt) => {
        this.cache.delete(evt.path);
        this.publishOutcome(evt.path, { kind: 'orphaned' });
      },
    });
    // …
  }

  private async refreshOutcomeInPlace(path: string): Promise<void> {
    const generation = this.refreshGuard.begin(path);
    const bytes = await this.client.readFile(this.paths.toAbsolutePath(path));
    if (!this.refreshGuard.isCurrent(path, generation)) return; // a newer
    // refresh raced past us
    const outcome = computeOutcome(path, bytes); // full classification
    this.publishOutcome(path, outcome);
  }
}

// packages/filesystem/src/client/file-tree-service.ts
export class FileTreeService {
  constructor(deps: {
    paths: WorkspacePathResolver;
    channel: WorkerChangeChannel; // ← same channel instance
    visibility: VisibilityProvider;
    client: FileSystemClient;
  }) {
    deps.channel.onFileWritten({
      interestedIn: (p) => this._resolvedDirectories.has(this.paths.parentOf(p)),
      handler: (evt) => this.optimisticAdd(evt.path),
    });
    // …
  }
}
```

## Recommendations

Consolidated from the bug-class root cause investigation, the architecture audit, and adversarial review of the implementation plan. R-numbers preserved from the source docs; new R12–R17 introduced by the adversarial review. R2 and R4 from the original investigation are superseded by R12.

| #      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Priority | Effort | Impact | Source |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ | ------ |
| R3     | Invert the failing test (`file-content-service.test.ts:664-678`) to assert the new contract: open files never transition back to `loading`. Tests subscribe via `service.subscribe(path, cb)` and snapshot `peekOutcome` inside the callback (mirrors `useSyncExternalStore`).                                                                                                                                                                                                                    | **P0**   | Low    | High   | flash  |
| R10    | Rename and split the misleading `out-of-band` test into one for verified-external writes and one asserting that bridge-filtered self-writes never reach the consumer.                                                                                                                                                                                                                                                                                                                             | **P0**   | Low    | Medium | flash  |
| R1     | Stop transitioning open files to `loading` on `fileWritten` echoes. Background re-resolve + swap-in-place. Never `outcomes.delete` for an open path.                                                                                                                                                                                                                                                                                                                                              | **P0**   | Low    | High   | flash  |
| R8     | Mirror `FileTreeService`'s patterns (patch-in-place, source-aware filter, unloaded-subtree skip). The reference implementation is in-tree at `file-tree-service.ts:559-637` — port, don't redesign.                                                                                                                                                                                                                                                                                               | **P0**   | Low    | High   | flash  |
| R12    | **Skip-originator at the bridge.** `filesystem-bridge.ts` injects `originClientId` (the recipient port's id) on every mutating proxy call; `deliverToHandles` skips the port whose id matches `event.originClientId`. The `Promise` resolution is the originator's acknowledgment. Replaces R2 (TTL bridge) and R4 (typed `origin` wire field) — both no longer needed.                                                                                                                           | **P0**   | Medium | High   | adv    |
| R13    | **Remove legacy mutating-method auto-emit** in `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts`. The parallel unstructured `fileChanged` broadcast bypasses the bridge's skip-originator filter and would re-introduce the regression. Single source of truth: structured events through `filesystem-bridge.ts`.                                                                                                                                                           | **P0**   | Low    | High   | adv    |
| R15    | Rename `swapTextInPlace` → `refreshOutcomeInPlace`. Run the full `computeOutcome` pipeline (binary sniff, too-large cap, forceText override, text decode) — never force `{ kind: 'text' }`. Preserves the discriminated `FileContentResult` contract from `binary-file-open-perpetual-loading.md`.                                                                                                                                                                                                | **P0**   | Low    | High   | adv    |
| R14    | Per-path `RefreshGenerationGuard` — monotonic counter incremented at `refreshOutcomeInPlace` start; result discarded if path's counter advanced before the async read settles. Prevents stale overwrites under burst writes.                                                                                                                                                                                                                                                                      | **P0**   | Low    | Medium | adv    |
| C2     | Extract the shared layer: `WorkerChangeChannel`, `WorkspacePathResolver`, `PathSubscriberRegistry`, `VisibilityProvider`, `RefreshGenerationGuard`. Both facades consume one `WorkerChangeChannel` instance. (`RecentSelfWrites` from the original plan deleted — superseded by R12.)                                                                                                                                                                                                             | **P0**   | Medium | High   | arch   |
| R5     | Apply the swap-in-place rule to `fileRenamed`, `directoryChanged`, **and** `backendChanged` — not just `fileWritten`. `fileDeleted` is the reference (one-line `publishOutcome` instead of delete+notify).                                                                                                                                                                                                                                                                                        | P1       | Low    | Medium | flash  |
| R9     | Skip events for paths whose parent directory has no live subscribers. Implemented via `interestedIn` predicate on each `WorkerChangeChannel` handler registration. Mirrors `FileTreeService._resolvedDirectories.has(parent)` guard.                                                                                                                                                                                                                                                              | P1       | Low    | Medium | flash  |
| R16    | Origin-aware `EventCoalescer` merge: same-originator merges preserve `originClientId`; mixed-originator merges clear it (delivered to every port). Local to the coalescer's merge logic; no public-surface change.                                                                                                                                                                                                                                                                                | P1       | Low    | Medium | adv    |
| R17    | `WorkspaceFileService` mutating methods (`writeFile`, `writeFiles`, `mkdir`, `rename`, `unlink`, `rmdir`, `duplicateFile`, `copyDirectory`) accept an optional trailing `context?: { originClientId?: string }` and pass it to `eventBus.emit(event, context?.originClientId)` at every emit site. `ChangeEventBus.emit` and `subscribe` carry the bit through. Filesystem-observer events (cross-tab, OS file watcher) emit with `undefined` originClientId → treated as external by every port. | P1       | Medium | High   | adv    |
| C1     | Promote `FileManagerProxy`'s protocol portion into `@taucad/filesystem` as `FileSystemClient`. Keep `FileManagerProxy = FileSystemClient & { listen, dispose }` in apps/ui as the extension.                                                                                                                                                                                                                                                                                                      | P1       | Low    | Medium | arch   |
| C3     | Move `FileContentService`, `FileTreeService`, `file-content-errors.ts`, and `seems-binary.ts` into `packages/filesystem/src/client/`. Refactor to consume the shared layer (C2). Add discrete `./client/*` subpath exports to both `exports` and `publishConfig.exports` blocks of `packages/filesystem/package.json` (no `client/index.ts` barrel — library-api-policy §22).                                                                                                                     | P1       | Medium | High   | arch   |
| C6     | Validate the package boundary by porting `examples/electron-tau/src/main/fs-bridge.ts` to consume the shared client. Surfaces any remaining apps/ui-only assumptions.                                                                                                                                                                                                                                                                                                                             | P2       | Medium | Medium | arch   |
| R6     | Document the contract in `docs/policy/filesystem-policy.md` (or a new `editor-content-policy.md`): "After the first successful resolve, an open path's outcome transitions only between `text(a) → text(b)` or `text → orphaned/error/binary/too-large`. Never to `loading`."                                                                                                                                                                                                                     | P2       | Low    | Medium | flash  |
| C5     | Document the layering in `docs/architecture/file-services.md`: worker-side `WorkspaceFileService` ↔ bridge skip-originator dispatch ↔ main-thread `FileContentService` + `FileTreeService` over `FileSystemClient`, sharing one `WorkerChangeChannel`.                                                                                                                                                                                                                                            | P2       | Low    | Medium | arch   |
| R7     | Audit other `useSyncExternalStore` consumers for the same anti-pattern. Confirmed-correct: `FileTreeService`, `MonacoModelService`. Remaining candidates: graphics providers, parameter UI under `.tau/parameters/`, kernel-state stores.                                                                                                                                                                                                                                                         | P2       | Medium | Medium | flash  |
| R11    | Add telemetry counters via `@taucad/telemetry`: bridge skip-originator skips per port, refresh generations discarded, coalescer mixed-origin merges, recovery-resolve roundtrips. Without this the regression's footprint at scale is invisible.                                                                                                                                                                                                                                                  | P2       | Medium | Medium | flash  |
| C4     | Keep `MonacoModelService` in `apps/ui/app/lib/` — it has hard Monaco editor bindings that don't belong in the package.                                                                                                                                                                                                                                                                                                                                                                            | —        | None   | None   | arch   |
| ~~R2~~ | ~~TTL `RecentSelfWrites` set seeded by `FileContentService.write()`.~~ **Superseded by R12.** Bridge-layer skip-originator removes the need for facade-side suppression entirely. No TTL window, no fragility under tab thrash, no failed-write cleanup.                                                                                                                                                                                                                                          | —        | —      | —      | —      |
| ~~R4~~ | ~~Plumb typed `origin: 'self' \| 'external'` onto `ChangeEvent`.~~ **Superseded by R12.** The bridge already knows the originator without a wire-shape change; carrying `origin` to consumers would only re-expose a discriminator they no longer need to act on. `ChangeEvent` shape unchanged.                                                                                                                                                                                                  | —        | —      | —      | —      |

`source` column: `flash` = `editor-flash-on-buffering-cycle.md`; `arch` = packaging/architecture audit (this doc); `adv` = adversarial review of the original implementation plan.

## Phased Roadmap

Five phases. Each phase is independently mergeable; nothing requires a flag-day cutover. The original plan's Phase 1 (facade band-aid) and Phase 3 (typed `origin` wire field) collapse into a single new Phase 1 — the bridge-layer skip-originator change is small enough to ship together with the facade fix and, crucially, **must** ship together because the facade change relies on the bridge no longer delivering self-echoes.

### Phase 0 — TDD lock-in (P0, ~½ day)

- **R3, R10**: Invert the failing test and split the misleading `out-of-band` test into:
  - one for external writes (asserts swap-in-place, no `loading` snapshot observed via `subscribe(path, cb)` callback),
  - one for self-writes (asserts no event arrives at the facade — bridge-layer test, see Phase 1),
  - one for binary classification preservation under refresh (text → binary on external mutation).
- Tests use the public `subscribe(path, cb)` + snapshot `peekOutcome` pattern; never assert only on post-hoc `peekOutcome` (would miss transient `loading`).
- Tests fail against current code.
- Output: `file-content-service.test.ts` describes the desired contract; test suite is red.

### Phase 1 — Bridge skip-originator + facade refresh-in-place (P0, ~2 days)

This is the load-bearing phase. Three coordinated changes that must ship together:

- **R17**: `WorkspaceFileService` mutating methods accept optional trailing `context?: { originClientId?: string }`; `ChangeEventBus.emit` and `subscribe` carry the bit; `EventCoalescer` chunk element type widens to carry it; `ThrottledWorker` stays generic.
- **R12**: `filesystem-bridge.ts` `dispatchHandler` injects per-port `originClientId` on every mutating proxy call; `deliverToHandles` materializes per-recipient delivery and skips the port whose id matches `event.originClientId`. New `filesystem-bridge.test.ts` cross-port test: two `MessagePort`s, A writes, A receives no echo, B receives the event.
- **R13**: Remove the legacy mutating-method auto-emit in `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts`. Add a regression test asserting only one `fileChanged` reaches each port per write.
- **R16**: `EventCoalescer` merge rule for mixed-origin events.
- **R1, R5, R8, R15**: Rewrite `FileContentService.handleWorkerFileChanged` per branch using `refreshOutcomeInPlace` (full `computeOutcome` pipeline, not text-only). Apply across `fileWritten`, `fileRenamed`, `directoryChanged`, `backendChanged`. `fileDeleted` already correct.
- **R14**: Per-path `RefreshGenerationGuard` inside `FileContentService` (extracted to `packages/filesystem/src/client/refresh-generation-guard.ts` in Phase 2). Tests cover stale-overwrite race.
- Output: editor flash gone; focus and IME state preserved on every keystroke; cross-port writes visible to peers; legacy bridge path gone; classification preserved across refreshes; stale-overwrite race closed. All tests green.

### Phase 2 — Shared infrastructure extraction (P0, ~2-3 days)

- **C2**: Extract `WorkerChangeChannel`, `WorkspacePathResolver`, `PathSubscriberRegistry`, `VisibilityProvider`, `RefreshGenerationGuard` into `packages/filesystem/src/client/`. Both facades stay in `apps/ui/app/lib/` for now but consume the shared layer.
- **R9**: `WorkerChangeChannel` enforces the unloaded-subtree skip uniformly via `interestedIn` predicate per handler registration (no `suppressSelf` flags — the bridge already filtered self-events).
- One `WorkerChangeChannel` instance per `FileManager`; both services subscribe via typed handlers.
- `file-manager.machine.ts` `proxy.listen?.('fileChanged', …)` direct wiring removed; replaced by channel construction. `destroyWorkerAndServices` extended to dispose channel + visibility provider.
- Output: structural impossibility of the regression class. Drift between services becomes a type error. Channel ownership lives in one place.

### Phase 3 — Package boundary move (P1, ~3 days)

- **C1**: Promote `FileSystemClient` to `@taucad/filesystem`.
- **C3**: Move `FileContentService`, `FileTreeService`, `file-content-errors.ts`, `seems-binary.ts` into `packages/filesystem/src/client/`. Tests move with them. Add discrete `./client/*` subpath exports to **both** `exports` and `publishConfig.exports` (omitting the latter is the canonical "works in dev, breaks in install" failure mode for published `@taucad/*` packages).
- **C6**: Port `examples/electron-tau/src/main/fs-bridge.ts` to consume the shared client. Drops ~185 lines from the example and validates the package boundary end-to-end.
- Output: package boundary matches worker/main-thread split. Electron PoC validates the contract end-to-end.

### Phase 4 — Documentation, telemetry, audit (P2, ~2-3 days)

- **R6**: Codify the open-file outcome contract in `docs/policy/filesystem-policy.md`.
- **C5**: New `docs/architecture/file-services.md` covering the layered design, including the bridge skip-originator sequence diagram from this blueprint.
- **R7**: Audit remaining `useSyncExternalStore` consumers. Likely targets: graphics providers, parameter UI, kernel-state stores.
- **R11**: Wire telemetry counters into the existing `@taucad/telemetry` definitions (bridge skip-originator skips per port, refresh generations discarded, coalescer mixed-origin merges).
- Output: contract is enforced by docs and observable by metrics. Future regressions surface as alerts, not user reports.

### Cumulative effort and risk

| Phase | Effort      | Cumulative LOC churn (est.)    | Risk                                                                                                                       |
| ----- | ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0     | ~½ day      | ~80 (test only)                | None — failing tests are documentation                                                                                     |
| 1     | ~2 days     | ~400 (bridge + facade + tests) | Medium — bridge change touches cross-package interfaces; mitigated by Phase 0's failing tests + new bridge cross-port test |
| 2     | ~2-3 days   | ~600 (extracted helpers)       | Medium — shared layer is new code; needs its own tests                                                                     |
| 3     | ~3 days     | ~1500 (file moves + exports)   | Low — mostly mechanical; CI catches regressions; `publishConfig.exports` is the only sharp edge                            |
| 4     | ~2-3 days   | ~300 (docs + telemetry)        | None                                                                                                                       |
| Total | ~10-12 days | ~2900                          | Low overall — phased, each phase mergeable independently                                                                   |

Net effort is comparable to the original plan despite Phase 1 growing because the originally-planned Phase 3 (typed `origin` wire field, ~2 days) is gone entirely, and the `RecentSelfWrites` TTL bridge — extract → maintain → delete — is gone with it.

## Trade-offs

### Should we merge `FileContentService` and `FileTreeService` into one class?

| Approach                                             | Pros                                                                                                                                                                     | Cons                                                                                                       | Verdict |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------- |
| **Two facades, shared infrastructure** (recommended) | Preserves SRP (bytes vs metadata are distinct concerns); single channel-subscription point; bounded file size; matches VS Code's `TextFileService` + `FileService` split | Two public APIs to learn; one extra layer of indirection                                                   | ✅ go   |
| **Single `WorkspaceClient` class**                   | One subscription, one API, atomic invariants                                                                                                                             | Conflates byte concerns with metadata concerns; ~1500 LOC class; couples consumers that need only one side | ❌ no   |
| **Keep current split, no shared layer**              | No churn                                                                                                                                                                 | The flash bug class remains structurally possible; drift continues                                         | ❌ no   |

### Where does self-write suppression live?

This was the central design decision relitigated by adversarial review. Three approaches considered:

| Approach                                          | Where it lives                           | Pros                                                                                                                                                                  | Cons                                                                                                                                                                            | Verdict |
| ------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **TTL `RecentSelfWrites`** (original R2)          | Each facade (or shared layer)            | Self-contained; ships in one PR with no cross-package change                                                                                                          | Heuristic — large writes, slow IPC, and tab thrash all break the window; needs failed-write cleanup; consumer-visible suppression flag if shared                                | ❌ no   |
| **Typed `origin` on `ChangeEvent`** (original R4) | Wire shape (`libs/types`) + every facade | Principled; no timing dependency                                                                                                                                      | Cross-package wire change; consumers receive a discriminator they have to opt into; `suppressSelf?: boolean` per subscription is the smell flag user flagged                    | ❌ no   |
| **Bridge skip-originator** (R12, recommended)     | Bridge layer (`packages/runtime`)        | Originator structurally cannot receive its own echo; no wire-shape change; no TTL; no flag; consumer API stays minimal; failed writes self-clean (no marks to cancel) | Cross-package change still required (`originClientId` propagation through `WorkspaceFileService` → `ChangeEventBus` → `EventCoalescer` → bridge), but consolidated in one place | ✅ go   |

The decisive argument: a `suppressSelf?: boolean` per-subscription flag is the canonical signal of a leaky abstraction — it pushes a wire-level concern out to every consumer. The bridge already has the originator information; refusing to use it forces every downstream layer to reinvent the discriminator. Skip-originator at the bridge means consumers can be entirely ignorant that "self" vs "external" is even a category.

### Should the move to `@taucad/filesystem` happen in the same PR as the bug fix?

**No.** Phase 1 (bug fix in place) and Phase 3 (package move) are deliberately decoupled. The bug fix is urgent and must ship without waiting for the boundary refactor. The package move is mechanical and benefits from being its own PR for review clarity.

### Stay in `apps/ui/app/lib/` vs move to `@taucad/filesystem`

| Argument for staying                 | Argument for moving                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Today's only consumer is `apps/ui`   | `WorkspaceFileService` precedent — UI-shaped code already lives in the package                                |
| `FileManagerProxy` is apps/ui-typed  | The protocol portion is generic; trivially promotable                                                         |
| `document.visibilityState` reference | One ~20-line DI extraction (`VisibilityProvider`)                                                             |
| No churn                             | Electron + future CLI reuse (~185 lines drop today)                                                           |
|                                      | Co-location with cache primitives (`BoundedFileCache`, `ChangeEventBus`, `EventCoalescer`, `ThrottledWorker`) |

The "stay" arguments are all mechanical blockers, not principles. Resolving them is part of Phase 3. The "move" arguments are architectural and cumulative.

### Why remove the legacy `runtime-filesystem-bridge.ts` auto-emit instead of patching it?

`packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts` predates the structured `ChangeEvent` contract. It auto-broadcasts an unstructured `fileChanged` notification to every connected port after every mutating proxy call, with no originator field, no event type, no path metadata. Patching it to honour skip-originator would mean (a) plumbing originator information through a parallel emission path that no longer carries any other event metadata, and (b) keeping two parallel sources of truth for "what changed" — the structured `ChangeEvent` from `WorkspaceFileService.eventBus` and the unstructured legacy notification. The structured path subsumes the legacy one entirely once skip-originator is in place; deletion is the correct move. Single source of truth for `fileChanged` events.

## References

### Internal docs

- [`editor-flash-on-buffering-cycle.md`](editor-flash-on-buffering-cycle.md) — Root-cause investigation for the user-visible regression. R1, R3, R5–R11 originated here.
- [`agent-filesystem-stale-cache-audit.md`](agent-filesystem-stale-cache-audit.md) — The audit whose R2 was implemented as commit `fc548205b`. Establishes why echo handling was added in the first place.
- [`binary-file-open-perpetual-loading.md`](binary-file-open-perpetual-loading.md) — Introduced the discriminated `FileContentResult` outcome type that the flash bug subverts and that R15 protects under refresh.
- [`shared-pool-stale-parameter-reads.md`](shared-pool-stale-parameter-reads.md) — Prior art for the per-path generation-guard pattern (R14).
- [`docs/policy/filesystem-policy.md`](../policy/filesystem-policy.md) — Existing file-system policy (target for the open-file outcome contract from R6).
- [`docs/policy/library-api-policy.md`](../policy/library-api-policy.md) — Bans barrel exports; informs the `client/*` subpath structure (no `client/index.ts`).
- [`docs/architecture/runtime-editor.md`](../architecture/runtime-editor.md) — Editor architecture; should reference C5's new file-services page.

### Source

- `apps/ui/app/lib/file-content-service.ts` — content cache, outcome pipeline, regression site.
- `apps/ui/app/lib/file-tree-service.ts` — tree cache, optimistic patch, the reference implementation for facade rewrite.
- `apps/ui/app/lib/monaco-model-service.ts` — third subscriber to the content channel, source-aware filter exemplar.
- `apps/ui/app/hooks/use-file-content.ts` — `useSyncExternalStore` consumer that observes the regression; defines the test pattern Phase 0 must mirror.
- `apps/ui/app/routes/projects_.$id/chat-editor-dockview.tsx:79-212` — `FileEditor` switch + `LogoLoader` render branch.
- `apps/ui/app/machines/file-manager.machine.ts:265-269` — single point where both services are wired to `proxy.listen('fileChanged', …)`. Removed in Phase 2.
- `apps/ui/app/machines/file-manager.worker.ts` — FM-worker entry; serves `WorkspaceFileService` over `MessagePort`.
- `apps/ui/app/machines/file-manager.machine.types.ts` — `FileManagerProxy` definition (target for C1).
- `packages/filesystem/src/workspace-file-service.ts` — worker-side authority; gains optional trailing `context?: { originClientId? }` on mutating methods (R17).
- `packages/filesystem/src/change-event-bus.ts` — gains `emit(event, originClientId?)` and `subscribe((event, originClientId) => …)` (R17).
- `packages/filesystem/src/event-coalescer.ts` — gains origin-aware merge rule (R16).
- `packages/filesystem/src/index.ts` — package exports; target surface for Phase 3.
- `packages/runtime/src/filesystem/filesystem-bridge.ts` — bridge skip-originator dispatch (R12).
- `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts` — legacy auto-emit removed (R13).
- `examples/electron-tau/src/main/fs-bridge.ts` — bespoke bridge that should consume the shared client (C6).

### Commits

- `309292451` (2026-04-29) — `refactor(ui): extract FileContentService and FileTreeService from machine context`. Original split.
- `fc548205b` (2026-05-02) — `feat(ui): add file change event handler to FileContentService for cache invalidation`. Regression-introducing commit; implemented R2 from `agent-filesystem-stale-cache-audit.md`.
