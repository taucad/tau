# Kernel Topology: Autonomous Reactive Render Service

## Status

**Proposal** -- documenting the target architecture for the kernel render pipeline. The current plan (filesystem watch-based overhaul) builds the foundation (watch infrastructure, bridge protocol, event pipeline) that makes this topology possible. This document captures the full vision for follow-up implementation.

**Updated for runtime source API migration** ([docs/research/runtime-source-api-unification-blueprint.md](../research/runtime-source-api-unification-blueprint.md)). The public client surface is `render` / `updateParameters` / `setOptions` / `setRenderTimeout` / `export` / `connect` / `terminate` / `on`; `render({ source })` accepts either inline `source.files` or filesystem-backed `source.path`, and `export(format, { source?, parameters?, exportOptions? })` keeps plugin-owned export options nested under `exportOptions`. Transport behaviour is encapsulated by the `RuntimeTransport` interface (in-process, worker, or future websocket); the client and `RuntimeWorkerClient` no longer touch `SharedArrayBuffer` directly. The `signalSlot` SAB channel shrinks to two slots (`abortGeneration`, `abortReason`); `workerState` and `progressPercent` are delivered through the same ordered `postMessage` channel as every other event. The kernel `nativeHandle` cache is opportunistic, not contractual -- single-arg `client.export(format)` rejects with `NoRenderOutcomeError` when no prior render context exists.

**Updated for rooted runtime filesystems** ([docs/research/runtime-model-load-project-root-regression-v3.md](../research/runtime-model-load-project-root-regression-v3.md)). Trusted host composition selects one authority-global project route and supplies the runtime with an opaque, fully writable rooted filesystem. Runtime paths and watches are local to virtual `/`; runtime and headless code receive no project id, global route, authorization object, or authority-global file-pool buffer.

---

## Problem Statement

The current kernel render pipeline uses a command-driven, main-thread-orchestrated model with an 8-hop relay chain:

```
Editor writes file
  → FileService.writeFile() [File Manager Worker]
  → fileManagerRef.send({ fileWritten }) [Main Thread]
  → use-project.tsx fanout to ALL geometry units [Main Thread]
  → cadMachine debounce (500ms) [Main Thread]
  → kernelMachine.createGeometry [Main Thread]
  → RuntimeClient.render({ changedPaths }) [Main Thread]
  → RuntimeWorkerClient.notifyFileChanged() [Main Thread → Worker]
  → KernelWorker.render() [Kernel Worker]
```

Issues with this topology:

1. **Blind fanout**: Every file write triggers re-renders for ALL geometry units, regardless of whether the file is in that unit's dependency tree.
2. **changedPaths threading**: Changed file paths are manually threaded through 6 layers just to call `Map.delete()` on caches that live in the worker.
3. **Main thread orchestration overhead**: The main thread decides when to render, but has no information about dependency graphs or cache state -- that knowledge lives in the worker.
4. **Round-trip latency**: Watch event → main thread → render command → worker adds unnecessary latency to the hot path.

---

## Target Architecture

The runtime worker becomes an **autonomous reactive render service**. Like a Language Server in LSP, it watches its dependencies, debounces changes, renders, and pushes results -- without the main thread telling it when to act.

### Thread Topology

```
┌───────────────────────────────────────────────────────────────────────┐
│ MAIN THREAD  (display + user input only)                              │
│                                                                       │
│  Editor ── render / updateParameters / setOptions ───▶ RuntimeClient   │
│           setRenderTimeout (client-local control) ───▶       │        │
│  Params UI ┘                             │    ▲                       │
│                                     (1) transport.signalAbort(reason) │
│                                     (2) postMessage                  │
│  Three.js ◀── geometry ────────────────┘    │ events                 │
│  Progress ◀── progress ─────────────────────┘                       │
│  Errors   ◀── error ───────────────────────┘                        │
│                                                                       │
│  cadMachine: idle | rendering | error  (display state only)           │
│  FileContentService ── ordinary FM client/optional UI-local cache   │
└───────────────────┬───────────────────────────────────────────────────┘
                    │ MessagePort          SharedArrayBuffer(s)
                    │ (kernel + rooted FS) (abort + geometry pool)
                  ┌─▼──────────────────────────┼────────────────┐
                  │ KERNEL WORKER              ▼                │
                  │ (autonomous render service)                  │
                  │                                             │
                  │  ┌─ entry path                              │
                  │  ├─ parameters                              │
                  │  ├─ watch subscription ◀─── fs events       │
                  │  ├─ 500ms file debounce timer               │
                  │  ├─ 50ms param debounce timer               │
                  │  ├─ render generation counter                │
                  │  ├─ OC Proxy abort check (Atomics.load)     │
                  │  ├─ fileHashCache, fileContentCache          │
                  │  ├─ bundleResultCache                       │
                  │  ├─ geometryPool (SharedPool, SAB-backed)   │
                  │  └─ render() → push geometry                │
                  │                    ▲                         │
                  │                    │ watch events            │
                  │         ┌──────────┴──────────┐             │
                  │         │ File Manager Worker │             │
                  │         │ rooted writable FS  │             │
                  │         └─────────────────────┘             │
                  └─────────────────────────────────────────────┘
```

### Protocol

The protocol shifts from request/response to event-driven, with shared-memory channels for abort signaling and zero-copy data transport.

**Shared memory (out-of-band):**

| Resource              | Owner              | Setup                                                                                                                                   | Purpose                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cooperative-abort SAB | `RuntimeTransport` | Allocated inside `RuntimeTransport.configureMemory`; forwarded to the worker via `InitializeMemoryHandle`                               | Abort generation channel. Transport raises the signal via `signalAbort(reason)` (writing `Atomics.add(abortGeneration, 1)` on SAB-capable transports) **before** posting the supersession message. The worker's OC Proxy reads the generation at each WASM call boundary. The runtime client never touches `Atomics` or the SAB. |
| Geometry pool SAB     | `RuntimeTransport` | Allocated inside `RuntimeTransport.configureMemory` from the `sharedMemory.geometry` descriptor; forwarded via `InitializeMemoryHandle` | LRU-backed pool for zero-copy geometry (GLB) transfer from worker to main thread. Dispatcher stores; `RuntimeClient.resolveGeometry()` resolves bytes — consumers stay transfer-mode agnostic.                                                                                                                                   |

**Main thread → Worker (commands, infrequent):**

| Command                                    | Trigger                                | Worker Behavior                                                                                                                    |
| ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `render({ source: { path }, parameters })` | User opens file, project loads         | Render immediately, discover deps, start watching                                                                                  |
| `updateParameters(parameters)`             | User adjusts slider/input              | Store params, debounce 50ms, re-render                                                                                             |
| `setOptions({ renderOptions })`            | User adjusts kernel render options     | Replace kernel render options and render the active source                                                                         |
| `render({ source: { files } })`            | Inline-code mode (CLI, tests, hooks)   | Stage inline source files and render from the inferred or explicit entry                                                           |
| `export(format, input?)`                   | User clicks export, CLI export command | One-shot export: with `source`, render+export; without `source`, export current native; plugin options live under `exportOptions`  |
| `abort(reason)`                            | RuntimeClient supersedes prior render  | Bumps abort generation; in-flight render terminates with the internal cooperative-abort marker (`RenderAbortedError`, `@internal`) |

`render`, `updateParameters`, and `setOptions` resolve with a `RenderOutcome` discriminated union: `{ superseded: false; geometry }` on the settled render, or `{ superseded: true }` when a newer selected preview preempted it. That successor may be another public command or an autonomous watched-filesystem rerender; selected geometry is always authoritative on the `geometry` event because an autonomous successor has no public outcome. `connect()` is required before any of the above and is idempotent. Runtime configuration is fixed when the client and transport are constructed; `connect()` accepts no authorization or project options.

`setRenderTimeout(renderTimeout)` is not a worker command. It synchronously updates main-thread client control state for subsequent renders, sends no notification, and returns `void`. Zero disables timeout enforcement. An in-flight render retains the timeout captured when it began.

**Worker → Main thread (events, pushed reactively):**

| Event                 | Trigger                                     | Main Thread Behavior         |
| --------------------- | ------------------------------------------- | ---------------------------- |
| `geometryComputed`    | Render completes                            | Update Three.js scene        |
| `parametersResolved`  | Parameters extracted                        | Update parameter UI controls |
| `stateChanged`        | Worker state changes (postMessage, ordered) | Update progress indicator    |
| `progress`            | During render (postMessage, ordered)        | Progress bar                 |
| `activeKernelChanged` | Active kernel selection switches            | Update kernel-aware UI       |
| `error`               | Render fails / timeout                      | Diagnostics panel            |
| `log`, `telemetry`    | Ongoing                                     | Console, perf panel          |

All worker → main events flow through a single ordered `postMessage` channel; SAB is reserved for the transport-owned cooperative-abort signal channel and geometry pool. Filesystem traffic uses the rooted bridge's transfer/copy path so every operation crosses the same filesystem enforcement boundary. Six commands in. Seven event types out. One ordered event channel. Two shared-memory channels.

---

## Worker Internal Render Loop

After receiving `openFile`, the worker manages its own render lifecycle:

```
openFile({ file, parameters })
  → store file + parameters
  → render() immediately (abort any in-progress render)
  → discover deps → set up watch subscription
  → push geometryComputed → resolve openFile RenderOutcome{ superseded: false, geometry }

watch event (file in dependency graph changed)
  → invalidate caches (sync Map.delete, atomic)
  → start/reset 500ms debounce timer
  → timer fires → render() (abort any in-progress render)
  → discover new deps → diff watch set (add new, remove stale)
  → push geometryComputed

updateParameters(parameters)
  → store new parameters
  → start/reset 50ms debounce timer
  → timer fires → render() (abort any in-progress render)
  → push geometryComputed → resolve updateParameters RenderOutcome

setOptions({ renderOptions })
  → replace kernel render options
  → render() (abort any in-progress render)
  → push geometryComputed → resolve setOptions RenderOutcome

export(format, input?)
  → with input: render+export, return bytes
  → without input: export from opportunistic nativeHandle, or reject with NoRenderOutcomeError

abort(reason)
  → bump abortGeneration; in-flight render terminates with RenderAbortedError
  → superseded openFile/updateParameters Promise resolves with { superseded: true }
```

### Render Cancellation

Two goals must be satisfied simultaneously:

1. **Start the latest render as soon as possible** -- don't block behind an in-progress render.
2. **Abort the superseded render as quickly as possible** -- don't waste CPU on geometry the user will never see.

A render pipeline has both **async phases** (bundling, code execution, GLTF conversion) and **synchronous WASM phases** (user `main()` calling OpenCASCADE, `BRepMesh_IncrementalMesh`, `RWGltf_CafWriter.Perform`). Each phase requires a different abort mechanism. All three strategies below work together:

#### Strategy 1: Proxy-based cooperative abort (OC-based kernels)

The `oc-tracing.ts` Proxy (shared at `packages/runtime/src/kernels/occt/oc-tracing.ts` between the Replicad and OpenCascade kernels alongside `oc-exceptions.ts` and `oc-kernel-error.ts`) already intercepts every OpenCASCADE API call -- constructors, methods, and property access on Emscripten-bound objects. A typical user `main()` makes 500-5000 individual OC calls. Adding an abort check to this Proxy gives sub-millisecond abort granularity during the heaviest synchronous phase:

```typescript
// Conceptual -- the real implementation layers onto the existing oc-tracing Proxy
const wrapper = function (this: unknown, ...args: unknown[]): unknown {
  if (Atomics.load(abortFlag, 0) !== currentGeneration) {
    throw new RenderAbortedError();
  }
  try {
    return wrapResult(Reflect.apply(member, target, args));
  } catch (error: unknown) {
    return rethrowIfWasmException(error);
  }
};
```

Overhead: one `Atomics.load()` per OC call (~1ns). Given that OC calls themselves take microseconds to milliseconds, this is unmeasurable noise.

This strategy covers Replicad and OpenCascade kernels. JSCAD (pure JS), Manifold, Zoo/KCL, and Tau use strategy 2.

#### Strategy 2: Async boundary abort (all kernels)

Between `await` points in the render pipeline (bundle → execute → main → `meshGeometry` (tessellate/pack → GLTF)), check the abort flag. The mesh phase is a separate kernel boundary for kernels that defer display work (Replicad, OpenCascade, Zoo, JSCAD, and OpenSCAD), adding an abort checkpoint between build and display packing — and it runs only on the display path, so exports skip it entirely. Every kernel's render passes through these phases:

```typescript
private async executeRender(): Promise<void> {
  const generation = ++this.renderGeneration;
  Atomics.store(this.abortFlag, 0, generation);
  this.pushState('rendering');

  const bundleResult = await this.bundle(this.currentFile);
  if (generation !== this.renderGeneration) return;  // abort checkpoint

  const executeResult = await this.execute(bundleResult.code);
  if (generation !== this.renderGeneration) return;  // abort checkpoint

  const geometry = await this.computeGeometry(executeResult, this.currentParameters);
  if (generation !== this.renderGeneration) return;  // abort checkpoint

  this.pushGeometry(geometry);
  this.updateWatchSet(geometry.dependencies);
  this.pushState('idle');
}
```

For JSCAD and Manifold, where the compute phase is async JS without a WASM Proxy, these async boundary checks provide the abort mechanism.

#### Strategy 3: Generation counter (universal correctness guarantee)

Even if neither strategy 1 nor 2 aborts the render in time (e.g., a single long `BRepMesh_IncrementalMesh` call that can't be interrupted), the generation counter guarantees correctness. A completed render whose generation doesn't match `this.renderGeneration` is silently discarded. No stale geometry ever reaches the UI.

#### SharedArrayBuffer for cross-thread abort signal

The abort flag must be readable during **synchronous WASM execution**, when the worker's event loop is blocked and cannot process messages. A worker-local boolean flag can only be updated between macro tasks -- useless during a 3-second `user main()` full of OC calls.

`SharedArrayBuffer` solves this. It provides a memory region visible to both the main thread and the runtime worker simultaneously:

```
┌─────────────┐         SharedArrayBuffer          ┌─────────────────┐
│ Main Thread  │     ┌──────────────────────┐     │ Kernel Worker    │
│              │     │ Int32Array[1]        │     │                 │
│ setParams()  │────▶│ abortGeneration = N  │◀────│ proxy reads at  │
│ setFile()    │     └──────────────────────┘     │ each OC call    │
└─────────────┘                                    └─────────────────┘
```

1. Main thread calls `openFile()` or `updateParameters()` on `RuntimeClient`.
2. `RuntimeClient` invokes `transport.signalAbort(reason)`, which writes `Atomics.store(abortFlag, 0, newGeneration)` **before** posting the message.
3. Kernel worker is mid-WASM. Its event loop is blocked. The MessagePort message queues.
4. Next OC Proxy call reads `Atomics.load(abortFlag, 0)` -- sees mismatch -- throws `RenderAbortedError`.
5. Render aborts, catch block swallows the error.
6. Worker event loop resumes, processes the queued `openFile`/`updateParameters` message.
7. New render starts; the superseded Promise resolves with `{ superseded: true }`.

Cross-origin isolation (COOP + COEP headers) is already a prerequisite for Tau -- `assertCrossOriginIsolated()` is called during kernel initialization for OpenCASCADE's pthread support. No new requirements.

For **watch events** (originating from the file manager worker, not the main thread), the signal arrives as a MessagePort message to the runtime worker. During synchronous WASM, these queue. The abort for watch events takes effect at the next async boundary (strategy 2) rather than mid-WASM (strategy 1). This is acceptable because the file debounce timer (500ms) already adds latency -- saving a few hundred milliseconds of wasted WASM computation is a marginal improvement that doesn't justify the complexity of a three-way SharedArrayBuffer.

#### Signal channel slot layout and notification strategy

The `SharedArrayBuffer` signal channel carries two `Int32` slots. Both flow main → worker (the only direction SAB is required for, because the worker's event loop is blocked during synchronous WASM execution). Worker → main signalling (`workerState`, `progressPercent`, `renderPhase`) flows through the same ordered `postMessage` channel as every other event -- collapsed into a single delivery surface to eliminate ordering races between SAB monitor wakeups and message-port events:

| Slot                  | Direction     | Mechanism                                          | Rationale                                                                                                                                                                                                       |
| --------------------- | ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abortGeneration` (0) | main → worker | `Atomics.store` / `Atomics.load` (polled by proxy) | The OC Proxy checks this before every WASM call (~thousands per render), so detection latency is effectively zero. No thread is sleeping and waiting to be woken -- `Atomics.notify` would have no target.      |
| `abortReason` (1)     | main → worker | `Atomics.store` / `Atomics.load` (read on abort)   | Discriminates supersession from termination so the worker can throw the correct internal abort marker (`RenderAbortedError` for supersession — never surfaced on the public surface; teardown for termination). |

Total signal buffer: **8 bytes** (`signalBufferByteLength = 8`, `signalBufferMaxByteLength = 16`). The slot layout (`signalSlot`) and `abortReason` enum are `@internal` -- transports own SAB allocation and access; `RuntimeClient` and `RuntimeWorkerClient` never touch `Atomics` or `SharedArrayBuffer` directly.

The key design principle: **SAB is only required for main → worker signals that must arrive while the worker thread is blocked in synchronous WASM. Every other signal flows through the ordered `postMessage` channel so consumers see one totally-ordered event stream.**

#### Per-kernel abort capabilities

| Kernel          | Proxy abort (strategy 1) | Async abort (strategy 2)   | Mid-WASM abort?         | Worst-case abort latency   |
| --------------- | ------------------------ | -------------------------- | ----------------------- | -------------------------- |
| **Replicad**    | Yes (OC Proxy)           | Yes                        | Yes (SharedArrayBuffer) | < 1ms (next OC call)       |
| **OpenCascade** | Yes (OC Proxy)           | Yes                        | Yes (SharedArrayBuffer) | < 1ms (next OC call)       |
| **JSCAD**       | N/A (no WASM)            | Yes                        | N/A                     | < 10ms (next await)        |
| **Manifold**    | Possible (WASM Proxy)    | Yes                        | Possible                | < 10ms                     |
| **Zoo/KCL**     | N/A (remote)             | Yes (WebSocket cancel)     | N/A                     | < 50ms                     |
| **OpenSCAD**    | N/A (single `callMain`)  | Yes (create→mesh boundary) | No                      | Full `callMain()` duration |
| **Tau**         | N/A (conversion)         | Yes                        | N/A                     | < 10ms                     |

OpenSCAD remains the mid-WASM outlier: its native build is one synchronous `callMain()` invocation with no JS/WASM boundary to intercept. After `callMain()` returns, the async create→mesh boundary can discard a superseded display before OFF-to-GLB conversion. The generation counter (strategy 3) handles correctness during the synchronous call. See "JSPI & Future Work" for the long-term fix.

---

## Concurrency Model

### Why concurrent renders are briefly necessary

In a single-threaded Web Worker, two renders cannot execute truly in parallel. But there is a critical window between "abort signal set" and "old render actually stops" where both the intent for a new render and the dying old render coexist. The design must handle this cleanly.

Consider a user dragging a parameter slider. Each slider tick generates an `updateParameters` command:

```
t=0.000  Render A starts (generation=1), enters user main()
t=0.200  Slider tick → updateParameters arrives
           Main thread: transport.signalAbort('superseded')
             → Atomics.store(abortFlag, 0, 2)            ← instant
           Main thread: postMessage({ updateParameters }) ← queues
t=0.200  Render A: next OC Proxy call
           Atomics.load(abortFlag, 0) → 2 ≠ 1            ← mismatch
           throw RenderAbortedError                       ← abort
t=0.201  Render A catch block: swallow abort, resolve prior Promise with { superseded: true }
t=0.201  Event loop processes queued updateParameters
           scheduleRender(50ms)                           ← 50ms param debounce
t=0.251  Render B starts (generation=2)
t=0.450  Render B completes → push geometry, resolve { superseded: false, geometry }
```

Total time from slider tick to geometry: **250ms** (50ms debounce + 200ms render).

Without abort, render A runs to completion (say 3 seconds), THEN render B starts. Total: **3250ms**. The abort saves 3 seconds of latency.

### Overlap is bounded and safe

The overlap window (t=0.200 to t=0.201 in the example above) is the time between `Atomics.store` and the next OC Proxy check. Since OC calls are rapid-fire during `main()`, this is typically **< 1ms**. During this overlap:

- Render A is still executing synchronously on the worker thread.
- Render B is "intended" (generation counter incremented, message queued) but not yet executing.
- No data races: the worker is single-threaded. Cache mutations are sequential.

### When the old render is in an async phase

If the abort signal arrives while render A is between `await` points (bundling, code execution), the worker's event loop processes the `setParameters` message immediately. The generation counter check at the next continuation discards the old render without needing the Proxy at all.

### Cache invalidation during overlap

Cache invalidation (`Map.delete()`) is synchronous and monotonically correct:

1. If render A already consumed old data before invalidation → result is stale, but discarded by generation counter.
2. If render A hits the invalidated cache after a watch event → it re-reads fresh data → correct.
3. Invalidation never produces partial or corrupt state.

### Parameter changes during file debounce

`updateParameters` resets to its own shorter debounce (50ms). If both a file change and parameter change arrive, the shorter timer wins and the render uses the latest state for both.

---

## Shared Memory Data Transport

Beyond the abort signal channel, the runtime may use a transport-owned `SharedArrayBuffer`-backed `SharedPool` (from `@taucad/memory`) for zero-copy geometry exchange. The filesystem authority's shared pool is not part of the runtime transport.

### Geometry Pool (Transport-owned)

The geometry pool eliminates `postMessage` transfer overhead for geometry data (GLB files, typically 100KB–10MB). The runtime client never allocates the SAB itself — it forwards the `sharedMemory.geometry` descriptor to `RuntimeTransport.configureMemory`, which allocates the backing buffer and exposes it to both the dispatcher (worker side) and `RuntimeClient.resolveGeometry` (main side). The flow:

```
Kernel Worker                                Main Thread
─────────────                                ───────────
toTransportGeometry()
  ├─ geometryPool.store(hash, glbBytes)      RuntimeClient receives geometryComputed
  ├─ success → { delivery: 'pooled', key }     ├─ geometryPool.resolveCopy(key)
  └─ fail    → { delivery: 'inline', bytes }   ├─ copies into standalone ArrayBuffer
                                                └─ emits to Three.js consumer
```

The `resolveCopy()` step produces a `Uint8Array<ArrayBuffer>` (not SAB-backed) because downstream consumers (Three.js `GLTFLoader`, `TextDecoder`) reject `SharedArrayBuffer`-backed views. The copy is a single `slice()` — far cheaper than structured clone via `postMessage`.

When SAB is unavailable (non-secure context, missing COEP/COOP), the dispatcher falls back to `inline` delivery and geometry flows via `postMessage` transfer. The `GltfContentDelivery` discriminated union (`'pooled' | 'inline'`) makes this transparent to consumers.

**Configuration:**

```typescript
const client = createRuntimeClient({
  kernels,
  sharedMemory: {
    geometry: { bytes: 50 * 1024 * 1024, maxEntries: 64, eviction: 'lru' },
  },
});
```

### Rooted filesystem bridge (filesystem-owned)

Trusted host code opens a scoped bridge for one selected project. The file-manager worker creates a writable rooted WFS view whose local `/` maps to the captured project mount. The runtime receives an opaque `RuntimeFileSystem` constructed from a connection factory; each runtime binding or retry opens a fresh scoped connection. Reads, writes, watches, `/.tau/cache`, and project-local `/node_modules` all travel through that bridge.

The authority-global shared file pool is deliberately absent from the runtime transport. A pool hit can return bytes before rooted RPC dispatch and would therefore bypass the confinement boundary. A capability-local pool remains deferred until measurements justify it.

### Domain-Driven SAB Allocation

Each runtime shared-memory domain owns its pool:

| Pool     | Owner              | Allocator                                      | Consumers                                                         |
| -------- | ------------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| Abort    | `RuntimeTransport` | `RuntimeTransport.configureMemory` (transport) | Transport (write via `signalAbort`), kernel OC Proxy (read)       |
| Geometry | `RuntimeTransport` | `RuntimeTransport.configureMemory` (transport) | Worker dispatcher (store), `RuntimeClient.resolveGeometry` (read) |

This keeps ownership aligned with domain boundaries: runtime transports own abort and geometry memory, while filesystem reachability and delivery stay inside the filesystem bridge.

### Graceful Degradation

When `SharedArrayBuffer` is unavailable:

1. **Abort + Geometry pool**: `RuntimeTransport.configureMemory` returns `{}` (no `signalBuffer`, no `geometryPoolBuffer`). The runtime client receives the empty handle and does not enable pooled geometry; `signalAbort(reason)` falls back to posting a wire-format `'abort'` command. No consumer code branches on this.
   Filesystem bridge operations do not depend on SAB availability. No consumer code needs SAB awareness; abort and geometry fallback remain encapsulated inside the transport.

---

## JSPI & Future Work

**JSPI (WebAssembly JS Promise Integration)** allows synchronous WASM code to suspend at JS import boundaries. In theory, this could enable aborting mid-`BRepMesh_IncrementalMesh` -- the one blocking call that the Proxy cannot intercept because it's a single WASM invocation.

### Current status (March 2026)

| Platform           | Support                                                         |
| ------------------ | --------------------------------------------------------------- |
| Chrome desktop     | Shipping (137+)                                                 |
| Edge desktop       | Shipping (137+)                                                 |
| Firefox desktop    | Shipping (147+)                                                 |
| **Safari desktop** | **Not supported** (Interop 2026 focus area)                     |
| **All mobile**     | **Not supported** (Chrome Android, Firefox Android, iOS Safari) |

### Blockers for adoption

1. **Safari** -- not shipping, and represents ~18-20% of global browser share. Even as an Interop 2026 focus area, there's no guarantee of a shipping date.
2. **Mobile** -- no support on any mobile browser. Chrome Android 145 doesn't ship it.
3. **Emscripten ASYNCIFY=2** -- the JSPI backend is experimental. Known bugs include function arguments arriving as `null`, failing pthread integration, and missing embind support.
4. **OpenCASCADE recompilation** -- the WASM binary would need recompilation with `-sASYNCIFY=2` or `-sJSPI`. Asyncify instrumentation increases binary size 2-3x (~30MB → ~60-90MB). JSPI mode avoids the size increase but inherits the experimental Emscripten bugs.
5. **JSPI doesn't inherently enable cancellation** -- it suspends at JS import boundaries, not at arbitrary points. To cancel mid-`BRepMesh_IncrementalMesh`, OpenCASCADE's C++ code would need periodic callbacks to a JS function that returns a Promise, allowing JSPI to suspend. This requires C++ source modifications.

### Recommendation

Track JSPI for 2027+. When Safari ships support and Emscripten stabilizes ASYNCIFY=2, evaluate recompiling OpenCASCADE with checkpoint callbacks for the meshing phase. Until then, the Proxy-based abort (strategy 1) covers > 95% of render time for typical models, and the generation counter (strategy 3) guarantees correctness for the remaining synchronous WASM phases that can't be interrupted.

---

## Impact on Existing Components

### cadMachine (absorbs kernelMachine)

**Before:** cadMachine (~770 lines) + kernelMachine (~630 lines) = ~1400 lines across two machines. cadMachine manages render orchestration, debounce timers, changedPaths accumulation, timeout handling, and 7 states. kernelMachine manages RuntimeClient lifecycle and forwards events between client and cadMachine.

**After:** Single unified machine, ~150 lines. Handles RuntimeClient lifecycle (connect, subscribe, terminate), tracks `lastRequestedRenderId` / `lastSettledRenderId` for freshness-aware RPC consumers, and reflects worker-reported state:

```
states: connecting | idle | rendering | error
events in: geometryComputed, parametersResolved, stateChanged, progress, activeKernelChanged, error
events out: openFile → client, updateParameters → client, setOptions → client, setRenderTimeout → client, export → client
lifecycle: connecting invokes RuntimeClient.connect, idle/rendering/error reflect worker state
```

No `bufferingFile`, `bufferingParameters`, `createGeometry`, `changedPaths`, `isDifferentFile`, timeout actor, timeout acknowledgement state, or separate kernelMachine. The worker handles scheduling and debounce; cadMachine stores the user-selected timeout and applies it through the client's synchronous control plane. RPC handlers consult `cad.machine` via the `awaitFreshRender` helper -- they never call `client.export` for view-aligned data, ensuring tests run against exactly the geometry the user sees.

### kernelMachine → eliminated

**Before:** ~630 lines. Manages RuntimeClient lifecycle, forwards createGeometry to client.render(), forwards events between client and cadMachine. Acts as a middleman that adds indirection without independent decision-making.

**After:** Eliminated entirely. Its responsibilities collapse into cadMachine:

- **RuntimeClient creation and connection** -- handled by a promise actor invoked from cadMachine's `connecting` state. Branches on `error instanceof RuntimeConnectionError` to surface `error.cause` as the issue's `data` field.
- **Event forwarding** -- cadMachine subscribes directly to `RuntimeClient.on(...)` events including `'activeKernelChanged'`. No intermediate machine needed.
- **Lifecycle cleanup** -- cadMachine's `exit` action calls `client.terminate()`. Per the v5 termination contract, in-flight Promises reject with `RuntimeTerminatedError` on the next microtask.

The current kernelMachine exists because the old protocol required orchestrating `createGeometry` → `render()` → result forwarding. With the autonomous worker model, there is no render command to orchestrate -- the worker self-renders. CAD render intent maps directly to `RuntimeClient` methods (`render`, `updateParameters`, `setOptions`, and `export`), while timeout configuration calls the synchronous `setRenderTimeout` control setter. An intermediate machine adds no value.

### use-project.tsx

**Before:** Lines 148-167 subscribe to `fileWritten` and fan out `setFile` to every geometry unit.

**After:** Entire relay deleted. Nothing replaces it -- the worker watches its own dependencies.

### RuntimeClient

**One host, one trust domain.** A runtime host serves exactly one trust domain. The filesystem root, the kernel set and the process privileges are chosen at host bootstrap and are not negotiable over the wire; a host must not be shared between mutually distrusting clients, and multi-tenant hosting is out of contract.

**Model code runs with host-process privilege.** Under `createNodeClient` and any inline/in-process Node arm, model modules are imported into the host process with no `vm` context and no capability restriction -- a model can read and write anything the host process can. The mitigation that exists is a process boundary: put untrusted models behind `nodeWorkerTransport`, `webSocketHost`, or the Electron utility process, which bounds a compromise to that process's own filesystem root and lifetime.

Becomes the primary reactive API surface. Transports own SAB allocation (geometry pool, abort channel); the client itself contains zero `Atomics`/`SharedArrayBuffer` references. The wire-level abort signal is delegated through `transport.signalAbort(reason)` before the supersession `postMessage`:

```typescript
const client = createRuntimeClient({
  transport: webWorkerTransport({
    createWorker,
    fileSystem: fromFileSystemBridge(() =>
      openFileSystemBridge(fileManagerWorker, {
        root: '/projects/xxx',
      }),
    ),
  }),
});

// Trusted composition selected the global route above. Runtime sees only the rooted
// filesystem and project-local paths. connect() takes no arguments.
await client.connect();

// These return Promise<RenderOutcome>: { superseded: false, geometry } or { superseded: true }.
const a = await client.render({ source: { path: '/main.ts' }, parameters: {} });
const b = await client.updateParameters({ width: 10 });
client.setRenderTimeout(60_000);
await client.setOptions({ renderOptions: { tessellation: { linearTolerance: 0.05 } } });

client.on('geometry', (result) => {
  /* Three.js -- geometry bytes are already ArrayBuffer-backed (SAB resolved) */
});
client.on('parametersResolved', (schema) => {
  /* parameter UI */
});
client.on('state', (state) => {
  /* 'idle' | 'rendering' | 'error' */
});
client.on('activeKernelChanged', (kernelId) => {
  /* update kernel-aware UI */
});

// Imperative one-shot export (e.g. CLI, Save As). With input it always renders fresh;
// without input it uses the opportunistic native handle from the most recent settled render
// or rejects with NoRenderOutcomeError.
const glb = await client.export('glb', {
  source: { path: '/main.ts' },
  parameters: { width: 10 },
});

await client.terminate();
// All subsequent method calls throw RuntimeTerminatedError synchronously.
// All in-flight Promises reject on the next microtask. transport.close() is called exactly once.
```

This is a clean, publishable API for `@taucad/runtime` as an npm package. All consumers receive resolved `ArrayBuffer`-backed geometry via the `'geometry'` event; the `geometryPool` accessor is removed from the public surface.

### KernelWorker

Gains a render loop, abort infrastructure, watch subscription management, and shared memory pools. Worker-internal methods are renamed in lockstep with the public surface for vocabulary parity (`handleSetFile` → `handleOpenFile`, `handleSetParameters` → `handleUpdateParameters`). New internal methods:

- `scheduleRender(delayMs)` -- debounced render scheduling with abort of in-progress render
- `executeRender()` -- generation-checked render execution with abort checkpoints
- `updateWatchSet(dependencies)` -- incremental watch subscription diffing
- OC Proxy integration: reads `Atomics.load(abortFlag, 0)` at each WASM call boundary
- `setGeometryPoolBuffer(sab)` -- the transport allocates the optional geometry SAB and passes it via `initialize`; filesystem bindings arrive independently as rooted bridge ports.

### RuntimeCommand / RuntimeResponse protocol

Simplified. `render`, `fileChanged`, `cancel`, `setFile`, `setParameters`, and `notifyFileChanged` commands were removed. `openFile`, `updateParameters`, `setOptions`, `setFiles`, and `abort` were added. There is deliberately no worker-protocol `setRenderTimeout` command: the public setter changes main-thread client control state only. `stateChanged`, `progress`, and `activeKernelChanged` flow through the single ordered `postMessage` channel.

---

## Comparison to Prior Art

### Vite HMR

| Concept              | Vite                                | Tau (target)                                         |
| -------------------- | ----------------------------------- | ---------------------------------------------------- |
| File watcher         | chokidar (OS-level)                 | `FileService.watch()` (VFS-level via ChangeEventBus) |
| Dependency graph     | Module graph (import analysis)      | Bundle deps (esbuild metafile) + kernel resolvers    |
| Change detection     | Watcher + module graph invalidation | Watch subscription scoped to dependency set          |
| Debounce             | HMR batching                        | Worker-internal 500ms/50ms timers                    |
| Rebuild trigger      | HMR update pushed to browser        | `geometryComputed` pushed to main thread             |
| Scheduling authority | Vite dev server (autonomous)        | Kernel worker (autonomous)                           |

### VS Code Language Server Protocol

| Concept         | LSP                           | Tau (target)                          |
| --------------- | ----------------------------- | ------------------------------------- |
| Server role     | Autonomous analysis service   | Autonomous render service             |
| Client role     | Display + user input          | Display + user input                  |
| Communication   | JSON-RPC events               | MessagePort events                    |
| File watching   | Server watches workspace      | Worker watches dependency graph       |
| Result delivery | Push diagnostics, completions | Push geometry, parameters, errors     |
| Lifecycle       | Client starts/stops server    | Main thread creates/terminates worker |

The runtime worker is essentially a "geometry server" following the same architectural pattern that powers every modern code editor.

---

## Why Not Move cadMachine to the Worker?

Considered and rejected. The XState machines provide:

1. **React integration** -- `useSelector`, `useActorRef` require main-thread machines.
2. **DevTools** -- XState inspector for debugging state transitions.
3. **Lightweight** -- The machines are event routers, not computation. The main thread cost is near-zero.

The right split is: **worker owns computation and scheduling, main thread owns display state and user interaction**.

---

## Prerequisites

The filesystem watch-based overhaul plan provides the foundation:

1. **`FileService.watch()` API** -- Server-side filtered watch subscriptions.
2. **Bridge watch protocol** -- `watch`/`unwatch` control messages over MessagePort.
3. **Event pipeline** -- Normalize → coalesce → filter → deliver.
4. **Watch registry** -- Dedup, ref-counting, lifecycle cleanup.

These components must be implemented first. The autonomous render loop is the follow-up that consumes them.

---

## Implementation Sequence

1. Complete filesystem watch infrastructure (current plan).
2. Add `openFile`, `updateParameters`, `setOptions`, `setFiles`, `abort` commands to kernel protocol.
3. Keep SAB allocation inside the `RuntimeTransport` layer for the abort channel and geometry pool; bind project files through a writable rooted filesystem bridge with no authority-global pool.
4. Wire `SharedPool` LRU caches on both main thread and worker.
5. Extend the shared OC Proxy (`packages/runtime/src/kernels/occt/oc-tracing.ts` / new `oc-abort.ts`) with `Atomics.load` abort check. Add `RenderAbortedError` type.
6. Implement worker-internal render loop with debounce, generation counter, and abort checkpoints at async boundaries.
7. Add watch subscription management to `KernelWorker` (`updateWatchSet`).
8. Wire watch events → debounced re-render inside worker (no main thread round-trip).
9. Route `stateChanged`, `progress`, and `activeKernelChanged` through the single ordered `postMessage` channel.
10. Collapse `kernelMachine` into `cadMachine` -- move RuntimeClient lifecycle (creation, connection, event subscription, cleanup) into cadMachine as a `connecting` state with a promise actor.
11. Simplify unified `cadMachine` to display-state machine (connecting | idle | rendering | error) and add `lastRequestedRenderId` / `lastSettledRenderId` for freshness coordination.
12. Remove `use-project.tsx` relay, `changedPaths` threading, `notifyFileChanged` command.
13. Update `RuntimeClient` API to the v5 surface (explicit `connect`, `lifecycleState`, deterministic `terminate`, typed errors).
14. Delete `kernel.machine.ts`.
15. Add `awaitFreshRender` helper at `apps/ui/app/machines/await-fresh-render.ts`; wire RPC handlers (`getKernelResult`, `fetchGeometry`) through it.
