---
title: 'Abort Signal Policy'
description: 'Where cancellation signals live in runtime APIs, who checks them, what plugin authors must and must not do with AbortSignal, and how cancellation is tested.'
status: active
created: '2026-08-13'
updated: '2026-08-13'
related:
  - docs/research/runtime-abort-signal-migration.md
  - docs/research/runtime-stage-review-closeout-charter.md
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-api-policy.md
---

# Abort Signal Policy

Internal reference for how cancellation flows through `@taucad/runtime` and its plugins: where `AbortSignal` values are born, which layer checks them, and what a kernel, bundler, middleware, or transcoder author is obligated to do.

## Rationale

Cancellation is cooperative: an `abort()` only takes effect where something honors the signal. Almost all operation time is spent suspended inside awaited primitives, and no check can run while execution is suspended — so the signal must **reach the primitive** that can actually stop (a socket teardown, an engine cancel, an instrumented filesystem call). Checks sprinkled between awaits execute in microseconds of synchronous glue, cannot interrupt the awaits around them, and teach authors a wrong mental model ("where do I sprinkle `throwIfAborted()`?"). The framework therefore owns boundary checks and instruments its own primitives once; authors only forward the signal to long-running work they call directly. This matches the WHATWG integration guidance, Node.js core conventions, and the author contracts of TanStack Query, tRPC, and the Rollup/Vite plugin ecosystems (which impose zero sprinkled checks on authors).

## Rules

### 1. Signals Arrive on the Runtime Argument — Never Create Your Own

The per-operation signal is framework-born (the render cancellation record's `AbortController`, aborted with `RenderAbortedError` on supersede or timeout) and delivered to authors as `runtime.signal` (`KernelRuntime.signal`, `BundlerRuntime.signal`, `KernelMiddlewareRuntime.signal`). It is fresh per operation.

Authors never construct, retain, or compose the operation signal. Do not stash it on plugin context, do not wrap it in a new controller, do not pass it across operations.

**Why**: A retained signal outlives its operation and either leaks listeners or aborts work it does not own.

### 2. The Framework Owns Boundary Checks — Do Not Duplicate Them

The framework already checks the operation signal at every structural boundary:

| Boundary              | Mechanism                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Operation admission   | operation queue sets the per-operation signal and rejects aborted admissions              |
| Hook boundaries       | bundler facade and execute paths check before invoking a plugin hook and after it returns |
| Render phases         | parameter → geometry → post-geometry phase transitions re-check currency                  |
| Filesystem primitives | every `runtime.filesystem` call runs through the signal-instrumented bridge               |
| WASM kernel calls     | the kernel proxy's cooperative-abort check runs per native API call                       |

A `signal.throwIfAborted()` in a plugin hook that only guards calls already covered by this table is noise and must not be written.

CORRECT:

```typescript
async bundle({ entryPath }, _runtime, context) {
  // The facade checked the signal at the hook boundary; the VM's filesystem
  // reads run through the instrumented bridge. Nothing to check here.
  return toBundleResult(await context.vm.bundle(entryPath));
},
```

INCORRECT:

```typescript
async bundle({ entryPath }, { signal }, context) {
  signal.throwIfAborted(); // duplicate of the facade's boundary check
  const result = await context.vm.bundle(entryPath);
  signal.throwIfAborted(); // cannot interrupt the await above; boundary re-checks anyway
  return toBundleResult(result);
},
```

### 3. Forward the Signal to Cancellable Primitives You Call Directly

The author contract is one obligation: pass `runtime.signal` to every cancellable API the hook calls directly — `fetch(url, { signal })`, engine clients with a `{ signal }` option, websocket RPC helpers, and (once supported) VM entry points.

**Why**: Forwarding is the only mechanism that can settle an in-flight await; this is the entire author-side story in TanStack Query and tRPC.

CORRECT:

```typescript
async createGeometry({ entryPath }, { filesystem, signal }, context) {
  const code = await filesystem.readFile(entryPath, 'utf8'); // framework-instrumented
  const utilities = await getKclUtilitiesWithEngine(context);
  const result = await utilities.executeProgram(program, entryPath, { signal });
  return toGeometryResult(result);
},
```

INCORRECT:

```typescript
async createGeometry(input, { signal }, context) {
  signal.throwIfAborted(); // boundary already checked
  const result = await runLongEngineCall(); // signal never reaches the engine: uncancellable
  signal.throwIfAborted(); // too late to matter
  return result;
},
```

### 4. Cancellable Primitives Own the Listener Dance

The `signal.addEventListener('abort', stop, { once: true })` + `finally removeEventListener` pattern belongs **inside** the cancellable primitive, behind a `{ signal }` option — implemented once, next to the state it must tear down. Hook bodies never hand-roll abort listeners.

**Why**: The attach/detach dance is leak-prone enough that Node.js core added `events.addAbortListener` after undici shipped listener-leak bugs; every hand-rolled copy is another chance to get it wrong, and the primitive is the only layer that knows how to stop itself.

CORRECT:

```typescript
// Inside the engine utility (once):
async executeProgram(program, path, options?: { signal?: AbortSignal }) {
  return this.withAbort(options?.signal, () => this.roundTrip(program, path));
}

// withAbort: throwIfAborted at start; addEventListener('abort', () => this.cancel(),
// { once: true }); finally removeEventListener.
```

INCORRECT:

```typescript
// Inside a kernel hook:
const cancel = () => void utilities.cancel();
signal.addEventListener('abort', cancel, { once: true });
try {
  await utilities.executeProgram(program, path);
} finally {
  signal.removeEventListener('abort', cancel); // per-hook ceremony, duplicated per call site
}
```

### 5. Periodic Checkpoints Only Inside CPU-Bound Loops You Own

`signal.throwIfAborted()` may be called repeatedly in exactly one situation: inside a genuinely CPU-bound loop the author owns, where no await yields control — roughly once per iteration batch or at least every ~50 ms of compute. This is the only repeated use MDN sanctions, and the kernel proxy's per-native-call cooperative check is its framework-side analogue.

CORRECT:

```typescript
for (const [index, face] of mesh.faces.entries()) {
  if (index % 1000 === 0) {
    signal.throwIfAborted();
  }
  tessellate(face);
}
```

### 6. Abort Rejections Propagate Untouched

Never catch an abort rejection (`RenderAbortedError`, `AbortError`, `signal.reason`) to continue working, and never remap it to a `KernelIssue` or a different error. Rethrow it (or simply do not catch it); the framework settles operation state and public promises. When a primitive rejects on abort, it must reject with `signal.reason`, not a generic substitute.

**Why**: Catch-and-continue produces work that outlives its operation; remapping breaks the framework's abort classification and the discriminated supersession outcomes built on it.

### 7. No Race Wrappers

Do not build or use `Promise.race([work, abortPromise])`-style combinators to "make work abortable." The wrapper rejects while the underlying work keeps running — zombie bundles holding the VM, zombie engine commands streaming frames, native handles created after the operation ended (colliding with the worker's handle-reachability sweep).

**Why**: `abort()` firing does not mean the work stopped; only the leaf can stop it. A race hides the zombie instead of preventing it.

### 8. Every Forwarded Signal Gets One Cancellation Test

Each plugin that forwards a signal to a primitive carries exactly one red-first cancellation contract test, modeled on the Zoo engine cancellation test: start the hook against a mock primitive that never resolves until cancelled; await the pending state; `controller.abort(reason)`; assert (1) the hook's promise rejects with the reason, (2) the primitive's cancel path ran exactly once, (3) no further primitive calls occur.

## Anti-Patterns

- `throwIfAborted()` between consecutive awaits of signal-aware primitives.
- `throwIfAborted()` guarding a synchronous return.
- Doc examples that open every hook with `signal.throwIfAborted()` — examples teach the author contract; they must show forwarding, not sprinkling.
- Abort listeners attached in hook bodies instead of inside the primitive.
- Catching abort errors to return partial results.
- Retaining `runtime.signal` on plugin context.

## Known Limitations

- One-shot `esbuild.build()` has no cancellation API — only the incremental `context()` API supports `cancel()`. Until the VM migrates to build contexts, bundle-phase cancellation resolves at the surrounding framework boundaries; do not add sprinkled checks to compensate (they cannot interrupt the build either).
- The Zoo engine wire protocol has no per-request server-side cancel frame; local rejection of pending commands is the available lever, owned by the engine utility per Rule 4.

## References

- WHATWG DOM — AbortController/AbortSignal API integration: https://dom.spec.whatwg.org/#abortcontroller-api-integration
- MDN — AbortSignal and `throwIfAborted()` library guidance: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- Node.js — `events.addAbortListener` rationale: https://nodejs.org/api/events.html#eventsaddabortlistenersignal-listener
- TanStack Query — query cancellation author contract: https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation
- esbuild — cancellation is context-API only: https://esbuild.github.io/api/#cancel
- Research: `docs/research/runtime-abort-signal-migration.md` (site-by-site audit, migration table, and evidence for the framework-coverage claims)
