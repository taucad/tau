---
title: 'Worker Lifecycle Policy'
description: 'Standard patterns for creating, managing, and terminating Web Workers in Tau, plus worker topology: when a feature warrants its own worker, runtime-client consumers, and bridge writes. Covers lazy creation, termination, cleanup, mobile budgets, XState/React integration.'
status: active
created: '2026-03-04'
updated: '2026-07-21'
related:
  - docs/policy/compatibility-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/research/worker-management.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
---

# Worker Lifecycle Policy

Internal reference for Web Worker lifecycle in the Tau application. Standard patterns for creating, managing, and terminating Web Workers. Orchestration-agnostic — applies whether workers are managed by XState, React hooks, or raw JavaScript.

## Rationale

Workers consume significant memory (120+ MB each for WASM kernels). Unmanaged workers cause leaks, mobile tab crashes, and race conditions. Explicit ownership, error-isolated cleanup, and mobile-first budgets ensure predictable behavior across device classes.

## Core Principles

1. **Every worker must have an owner** — a single code path responsible for both creation and termination
2. **Termination must be guaranteed** — cleanup must survive errors, aborts, and race conditions
3. **Resources must be explicitly released** — workers, MessagePorts, Blob URLs, event listeners
4. **Mobile-first worker budgets** — design for constrained devices; desktop gets the surplus
5. **Worker-per-feature isolation** — independent compute features get independent workers; orchestration and authoritative project writes remain with the owner (Rules 13–15)

## Worker Lifecycle Phases

```
CREATE → INITIALIZE → ACTIVE → (IDLE) → TERMINATE → DISPOSED
```

| Phase          | Entry condition                                 | Exit condition                           |
| -------------- | ----------------------------------------------- | ---------------------------------------- |
| **CREATE**     | Owner allocates `new Worker(url)`               | Worker's `message` handler is registered |
| **INITIALIZE** | First message exchange (handshake, WASM init)   | Worker reports ready                     |
| **ACTIVE**     | Work items dispatched                           | No pending work                          |
| **IDLE**       | No work for `idleTimeout` duration              | New work arrives or timeout expires      |
| **TERMINATE**  | Owner calls `worker.terminate()`                | Worker thread destroyed                  |
| **DISPOSED**   | All references cleared (ports, listeners, refs) | GC collects                              |

---

## Creation Rules

### Rule 1: Lazy creation

Create workers only when first needed, not eagerly on mount.

```typescript
// CORRECT: Lazy creation
async function ensureWorker(): Promise<Worker> {
  if (!workerRef.current) {
    workerRef.current = new Worker(workerUrl, { type: 'module' });
  }
  return workerRef.current;
}

// INCORRECT: Eager creation at module scope
const worker = new Worker(workerUrl, { type: 'module' }); // Created even if never used
```

**Exception**: Workers that are always needed (e.g., file-manager root worker) may be created eagerly during application startup.

### Rule 2: Persistent references

Store worker references in locations that survive re-renders and closures.

| Pattern               | When to use              |
| --------------------- | ------------------------ |
| `useRef<Worker>`      | Component-scoped workers |
| Machine context       | XState-managed workers   |
| Module-level variable | Singleton workers        |

Never store workers in `useState` (triggers re-renders) or local variables (lost on scope exit).

### Rule 3: Blob URL cleanup

When creating workers from inline code via `URL.createObjectURL`, revoke the URL immediately after the Worker constructor returns:

```typescript
const blob = new Blob([workerCode], { type: 'application/javascript' });
const url = URL.createObjectURL(blob);
const worker = new Worker(url);
URL.revokeObjectURL(url); // Worker has already loaded the script
```

### Rule 4: Worker count budgets

| Device class       | Max concurrent workers | Detection                            |
| ------------------ | ---------------------- | ------------------------------------ |
| Mobile (≤4 cores)  | 2                      | `navigator.hardwareConcurrency <= 4` |
| Tablet (4-8 cores) | 4                      | `navigator.hardwareConcurrency <= 8` |
| Desktop (8+ cores) | `hardwareConcurrency`  | Default                              |

Kernel workers consume 120+ MB each (WASM heap). On mobile Safari, exceeding ~200 MB total page memory causes silent tab crashes.

The headless image feature is one lazy worker shared by thumbnails and plain image captures. Its owner terminates it after 60 seconds without queued or active work. This is the budget control for the initial implementation; measuring whether a shorter adaptive timeout is worthwhile is post-implementation work, not a prerequisite abstraction.

---

## Termination Rules

### Rule 5: Error-isolated cleanup

Cleanup chains must survive individual failures. Never let one failing cleanup prevent subsequent cleanups from running.

```typescript
// CORRECT: Error-isolated cleanup
function destroyWorkers(context: WorkerContext): void {
  context.destroyed = true;

  for (const cleanup of context.cleanups) {
    try {
      cleanup();
    } catch (error) {
      console.error('[WorkerCleanup] cleanup failed:', error);
    }
  }
  context.cleanups = [];

  // Always runs, regardless of cleanup errors above
  if (context.worker) {
    context.worker.terminate();
    context.worker = undefined;
  }
}

// INCORRECT: Cleanup chain can be interrupted
function destroyWorkers(context: WorkerContext): void {
  for (const cleanup of context.cleanups) {
    cleanup(); // If this throws, terminate() never runs
  }
  context.worker?.terminate();
}
```

### Rule 6: Cleanup resource checklist

When terminating a worker, clean up in this order:

1. **Set destroyed flag** — prevents async operations from recreating the worker
2. **Unsubscribe event listeners** — remove `onmessage`, `onerror` handlers
3. **Close MessagePorts** — call `port.close()` on all associated ports
4. **Call `worker.terminate()`** — kills the worker thread
5. **Null references** — set worker and related references to `undefined`

```typescript
function dispose(): void {
  destroyed = true; // 1. Flag
  worker.onmessage = null; // 2. Listeners
  worker.onerror = null;
  for (const port of ports) {
    port.close(); // 3. Ports
  }
  worker.terminate(); // 4. Terminate
  worker = undefined; // 5. Null ref
  ports.clear();
}
```

### Rule 7: Graceful shutdown for stateful workers

For workers with in-flight operations (e.g., mid-render kernel workers), use a message-based shutdown handshake with a forced timeout:

```typescript
async function gracefulShutdown(worker: Worker, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      resolve();
    }, timeoutMs);

    const handler = (event: MessageEvent): void => {
      if (event.data.type === 'SHUTDOWN_ACK') {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        worker.terminate();
        resolve();
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'SHUTDOWN' });
  });
}
```

For non-stateful workers or time-critical cleanup (component unmount), immediate `terminate()` is acceptable.

---

## Async Safety Rules

### Rule 8: No fire-and-forget async in cleanup-sensitive paths

When an async operation creates or uses a worker, the operation must be cancellable. Fire-and-forget patterns (`void (async () => { ... })()`) escape lifecycle management.

```typescript
// INCORRECT: Fire-and-forget — not tracked, not cancellable
entry: ({ context }) => {
  void (async () => {
    const worker = await createExpensiveWorker();
    context.worker = worker;
  })();
}

// CORRECT (XState): Invoked promise actor — cancelled on state exit
invoke: {
  src: fromPromise(async ({ signal }) => {
    const worker = await createExpensiveWorker();
    signal.throwIfAborted();
    return worker;
  }),
  onDone: assign({ worker: ({ event }) => event.output }),
}

// CORRECT (React): Cancelled flag in useEffect
useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();

  (async () => {
    const worker = await createExpensiveWorker(controller.signal);
    if (!cancelled) {
      workerRef.current = worker;
    } else {
      worker.terminate();
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
  };
}, []);
```

### Rule 9: Guard against post-teardown creation

After setting a destroyed/cancelled flag, always check it before creating or using workers:

```typescript
async function ensureWorker(context: WorkerContext): Promise<Worker> {
  if (context.destroyed) {
    throw new Error('Cannot create worker after destruction');
  }
  // ... await some async operation ...
  if (context.destroyed) {
    throw new Error('Worker context was destroyed during initialization');
  }
  const worker = new Worker(url);
  context.worker = worker;
  return worker;
}
```

Check the flag at every yield point (after every `await`).

---

## XState Integration Patterns

### Pattern A: Worker as invoked callback actor

Best for workers tied to a specific machine state. Cleanup is automatic on state exit.

```typescript
const workerActor = fromCallback(({ sendBack }) => {
  const worker = new Worker(workerUrl, { type: 'module' });

  worker.onmessage = (event) => {
    sendBack({ type: 'WORKER_RESULT', data: event.data });
  };

  // Cleanup: guaranteed to run when actor is stopped (state exit or machine stop)
  return () => {
    worker.terminate();
  };
});

// Usage in machine:
states: {
  active: {
    invoke: { src: 'workerActor', id: 'worker' },
    // Worker auto-stops when leaving 'active' state
  }
}
```

### Pattern B: Worker in machine context with exit cleanup

Best for workers whose lifecycle spans the entire machine (not tied to a single state).

```typescript
setup({
  actions: {
    destroyWorker({ context }) {
      context.destroyed = true;
      if (context.worker) {
        context.worker.terminate();
        context.worker = undefined;
      }
    },
  },
}).createMachine({
  exit: ['destroyWorker'],
  // ...
});
```

**Critical**: `exit` actions on the root machine config run when the machine receives `XSTATE_STOP`. This is the last-resort cleanup.

### Pattern C: Async worker initialization as invoked promise

Best for workers that require async setup (WASM compilation, filesystem connection).

```typescript
const initWorkerActor = fromPromise<Worker>(async ({ signal }) => {
  const worker = new Worker(workerUrl, { type: 'module' });
  await waitForWorkerReady(worker, signal);
  signal.throwIfAborted();
  return worker;
});

// In machine:
states: {
  initializing: {
    invoke: {
      src: 'initWorkerActor',
      onDone: {
        target: 'ready',
        actions: assign({ worker: ({ event }) => event.output }),
      },
      onError: {
        target: 'error',
        // Worker creation failed; no cleanup needed (worker.terminate() on error)
      },
    },
  },
}
```

**Key property**: `fromPromise` receives an `AbortController.signal`. When the state exits (e.g., machine stops during initialization), the signal is aborted and the promise is rejected.

### XState cleanup guarantees

| Mechanism                      | Cleanup guarantee                                 | Use case                         |
| ------------------------------ | ------------------------------------------------- | -------------------------------- |
| `fromCallback` return function | Called on actor stop (state exit or machine stop) | Worker lifecycle tied to a state |
| `fromPromise` abort signal     | Aborted on actor stop                             | Async initialization             |
| Machine `exit` action          | Runs on `XSTATE_STOP`                             | Machine-wide cleanup             |
| `stopChild(ref)`               | Sends `XSTATE_STOP` to the child                  | Dynamic child actor cleanup      |

**Known limitation**: The XState v5 source contains a TODO noting that if exit actions or `stopChildren` throw, child actors may be orphaned. Always use error-isolated cleanup (Rule 5).

---

## React Integration Patterns

### Pattern: useEffect with cleanup

```typescript
function useKernelWorker(url: string): Worker | undefined {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(url, { type: 'module' });
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [url]);

  return workerRef.current ?? undefined;
}
```

### Anti-patterns

| Pattern                                     | Problem                                                | Fix                                      |
| ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `useState(new Worker(...))`                 | Re-created on re-renders                               | Use `useRef`                             |
| Module-scope `new Worker(...)`              | Created before component mounts                        | Lazy init in `useEffect`                 |
| Missing cleanup return                      | Worker leaks on unmount                                | Always `return () => worker.terminate()` |
| `void (async () => { ... })()` in useEffect | Not cancellable                                        | Use AbortController + cancelled flag     |
| Relying on `useActorRef` input changes      | `useActorRef` does not recreate actors on input change | Use `key` prop or explicit events        |

---

## MessagePort and Transfer Rules

### Rule 10: Always use transfer lists for binary data

```typescript
// CORRECT: Zero-copy transfer (buffer detached after send)
const buffer = new Uint8Array(largeData).buffer;
worker.postMessage({ type: 'DATA', buffer }, [buffer]);

// INCORRECT: Structured clone (copies the entire buffer)
worker.postMessage({ type: 'DATA', buffer });
```

Transferable types: `ArrayBuffer`, `MessagePort`, `ReadableStream`, `WritableStream`, `TransformStream`, `ImageBitmap`, `OffscreenCanvas`.

### Rule 11: Close ports explicitly

```typescript
const channel = new MessageChannel();
// ... use channel.port1, channel.port2 ...

// On cleanup:
channel.port1.close();
channel.port2.close();
```

Unclosed ports hold references to their message handlers, preventing GC of associated closures.

### Rule 12: Return disposable handles from bridge factories

Bridge creation functions must return a `{ port, dispose }` handle so callers can clean up both ends of the channel:

```typescript
type BridgeHandle = {
  port: MessagePort;
  dispose(): void;
};

function createBridge(worker: Worker): BridgeHandle {
  const channel = new MessageChannel();
  worker.postMessage({ type: 'bridge', port: channel.port1 }, [channel.port1]);
  return {
    port: channel.port2,
    dispose() {
      channel.port2.close();
    },
  };
}
```

---

## Worker Topology Rules

### Rule 13: Worker-per-feature — when a new worker is mandatory

Adding a worker is always acceptable. It is **mandatory** when any row below says so; reuse an existing worker only when none does:

| Situation                                                                                                          | Verdict                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| The feature's compute would serialize behind another feature's compute (thumbnail render vs parameter-edit render) | New worker                            |
| An agent-facing capability must stay responsive during interactive compute                                         | New worker                            |
| Byte processing (encode/decode/transcode) would otherwise land on the main thread                                  | New worker                            |
| Sequential phases of one feature (a kernel's build → mesh → export pipeline)                                       | Reuse                                 |
| Same feature, too infrequent to justify a resident worker                                                          | Reuse, or lazy spawn + idle terminate |

Worker count is the cheap resource; main-thread latency and interactive-render latency are the scarce ones. Budgets (Rule 4) still bound totals on constrained devices — pair every new worker with lazy creation (Rule 1) and idle termination.

Thumbnails and plain agent captures are two requests of the same infrequent **headless image** feature. They share one serialized queue, runtime client, file-pool buffer, lazy worker, and idle timeout. They do not justify separate WASM workers merely because their callers differ.

**Why**: JavaScript is single-threaded per realm; two features sharing a worker serialize even when logically independent.

### Rule 14: Feature workers may embed a full runtime client

A feature worker may consume `createRuntimeClient` with the shared runtime definition (kernels + middleware), becoming a peer of the interactive worker rather than a bespoke pipeline. Cache identity includes kernel inputs and the selected **mutative** middleware participants for the phase and route: stable plugin ID, version, options, and selected order. Non-mutative per-client taps (`mutates: false`) are allowed because they cannot alter cached bytes and are excluded from artifact identity. A mutative middleware that participates in a selected phase or route must be hashed even when it happens to make no byte change for one request.

**Why**: Dogfooding the runtime keeps one pathway across browser/CLI/agent hosts; any chain difference silently forks the cache instead of hitting it.

### Rule 15: Encoded results return to the authoritative writer

A feature worker may return a bounded, owned encoded artifact (`Uint8Array<ArrayBuffer>`) to its main-thread orchestrator with ownership transfer. The orchestrator writes that artifact through the one authoritative `FileManager` instance, and consumers learn of it through ordinary filesystem change events. Geometry buffers and intermediate kernel state must not make this hop.

**Why**: Encoding stays off the main thread while durable project mutation stays behind one filesystem authority. The bounded transfer avoids copying, and the authoritative write ensures watchers, cross-tab propagation, caches, and activity rules observe one mutation path.

CORRECT:

```typescript
// Worker: render → encode → transfer ownership to the orchestrator
const webp = await renderGlbToImage(meshArtifact, options);
postMessage({ type: 'imageReady', bytes: webp }, [webp.buffer]);

// Main-thread owner: one authoritative project write
await fileManager.client.writeFile(thumbnailPath, webp);
```

INCORRECT:

```typescript
// Incorrect: a feature worker creates a second durable project writer
await bridgedFilesystem.writeFile(thumbnailPath, webp);
```

---

## Diagnostics

### Development-time worker audit

Add a worker registry that logs creation and termination events in development:

```typescript
if (import.meta.env.DEV) {
  const activeWorkers = new Map<string, { created: number; url: string }>();

  globalThis.__workerRegistry = {
    register(id: string, url: string) {
      activeWorkers.set(id, { created: Date.now(), url });
      console.debug(`[Worker] created: ${id} (${url}), total: ${activeWorkers.size}`);
    },
    unregister(id: string) {
      activeWorkers.delete(id);
      console.debug(`[Worker] terminated: ${id}, total: ${activeWorkers.size}`);
    },
    dump() {
      console.table(
        [...activeWorkers.entries()].map(([id, info]) => ({
          id,
          url: info.url,
          aliveFor: `${((Date.now() - info.created) / 1000).toFixed(1)}s`,
        })),
      );
    },
  };
}
```

### Production monitoring

Use `performance.measureUserAgentSpecificMemory()` (requires cross-origin isolation) to track memory consumption per-worker. This API distinguishes between window, worker, and shared memory:

```typescript
if (crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
  const result = await performance.measureUserAgentSpecificMemory();
  const workerBytes = result.breakdown
    .filter((entry) => entry.types.includes('Worker'))
    .reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`Worker memory: ${(workerBytes / 1024 / 1024).toFixed(1)} MB`);
}
```

---

## References

- [MDN: Worker.terminate()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate)
- [MDN: DedicatedWorkerGlobalScope.close()](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/close)
- [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [Chrome: Transferable objects – Lightning fast](https://developer.chrome.com/blog/transferable-objects-lightning-fast)
- [HTML Living Standard: Workers](https://html.spec.whatwg.org/dev/workers.html)
- [XState v5: Callback actors](https://stately.ai/docs/callback-actors)
- [XState v5: Invoked actors](https://stately.ai/docs/invoke)
- [web.dev: Off the Main Thread](https://web.dev/articles/off-main-thread)
- [ES Module Asset Injection Policy](./es-module-policy.md)
- [Worker Management Research](../research/worker-management.md)
