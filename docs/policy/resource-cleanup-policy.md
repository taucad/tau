---
title: 'Resource Cleanup Policy'
description: 'Disposable interface, semantic vocabulary (close/terminate/stop), DisposableStore, toDisposable, and cleanup naming conventions.'
status: active
created: '2026-03-10'
updated: '2026-09-30'
related:
  - docs/policy/library-api-policy.md
---

# Resource Cleanup Policy

Conventions for resource lifecycle management, cleanup naming, and bulk disposal. These rules govern how every object that holds resources exposes cleanup in Tau's libraries.

## Rationale

A universal `Disposable` interface enables bulk cleanup via `DisposableStore` and future TC39 `using` declarations. Semantic names (`close`, `terminate`, `stop`) align with Web APIs and improve discoverability. Avoiding `cleanup` as a method name prevents ambiguity with `dispose` and matches industry conventions (Monaco, Three.js, TC39).

For the core API design rules that reference these conventions, see [Library API Policy](library-api-policy.md). For stability annotations and deprecation of cleanup APIs, see [API Evolution Policy](api-evolution-policy.md). For stability annotations and deprecation of cleanup APIs, see [API Evolution Policy](api-evolution-policy.md).

## 1. The Universal Interface

Every object that holds resources must implement the `Disposable` interface so it can participate in bulk cleanup. Semantic method names (`close`, `terminate`, `stop`) coexist as the discoverable, domain-specific API; `dispose()` is the universal protocol that enables infrastructure-level patterns like `DisposableStore` and TC39's `using` declarations.

This design follows the convergent pattern of TC39 Explicit Resource Management (`Symbol.dispose`, `DisposableStack`), .NET Framework Design Guidelines (`IDisposable` + domain aliases), and VSCode/Monaco (`IDisposable`, `toDisposable`, `DisposableStore`).

Define in `libs/types`:

```typescript
type Disposable = {
  dispose(): void;
};
```

Every object that needs cleanup implements `Disposable`. This is the single requirement for bulk management. Async variants return `Promise<void>` from `dispose()` when teardown requires async work.

## 2. Semantic Vocabulary

Semantic names provide discoverability and describe **what** the cleanup does. They are the primary API consumers call directly. The `dispose()` method delegates to the semantic method (or vice versa when `dispose` is itself the natural term).

| Term                | Scope                                                         | Web/TC39 alignment                                    |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `dispose()`         | General resource release (the default and universal protocol) | TC39 `Symbol.dispose`, Monaco `IDisposable`, Three.js |
| `close()`           | Connections, transports, streams                              | `WebSocket.close()`, `MessagePort.close()`            |
| `terminate()`       | Workers and processes                                         | `Worker.terminate()`                                  |
| `stop()`            | Running computations, actors                                  | XState `actor.stop()`, AI SDK `chat.stop()`           |
| Return `() => void` | Subscriptions and one-time registrations                      | React `useEffect`, RxJS                               |

`**dispose` is the default.\*\* When none of the specific terms (`close`, `terminate`, `stop`) apply, `dispose` is both the semantic name and the protocol method.

## 3. How Semantic Names and `Disposable` Coexist

When an object has a meaningful semantic cleanup name, it exposes **both** the semantic method and `dispose()`. The semantic method contains the real logic; `dispose()` delegates to it:

```typescript
// Transport: close() is the semantic API, dispose() adapts
type RuntimeTransport = Disposable & {
  send(message: RuntimeCommand): void;
  onMessage(handler: (message: RuntimeResponse) => void): void;
  close(): void;
};

// Implementation: dispose delegates to close
function createWorkerTransport(worker: Worker): RuntimeTransport {
  return {
    send(message) {
      worker.postMessage(message);
    },
    onMessage(handler) {
      worker.addEventListener('message', (event) => handler(event.data));
    },
    close() {
      worker.terminate();
    },
    dispose() {
      this.close();
    },
  };
}

// RuntimeClient: terminate() is the semantic API, dispose() adapts
type RuntimeClient = Disposable & {
  render(input: RenderInput): Promise<void>;
  terminate(): void;
};
```

When `dispose` IS the natural semantic term (bridges, proxies, telemetry, Three.js objects), there is no separate semantic method — `dispose()` serves both roles:

```typescript
// Bridge: dispose is already the right semantic name
type BridgeHandle = Disposable & {
  port: MessagePort;
};
```

## 4. Choosing the Right Term

Use this decision tree to pick the semantic name. Regardless of choice, always implement `Disposable`:

1. **Is the resource a connection, transport, or stream?** → `close()` + `Disposable`
2. **Is the resource a Worker or subprocess?** → `terminate()` + `Disposable`
3. **Is the resource a running computation or actor?** → `stop()` + `Disposable`
4. **Is the resource an event subscription?** → return `() => void` (see [Library API Policy § 7](library-api-policy.md#7-subscribe-anytime-events))
5. **Everything else** → `dispose()` alone (serves as both semantic name and protocol)

## 5. Adapter Utilities

Two utility functions bridge non-conforming resources into the `Disposable` protocol:

### `toDisposable(fn)`

Wraps a bare `() => void` cleanup function into a `Disposable` object. Guarantees the function is called at most once. Modeled after VSCode's `toDisposable`.

```typescript
function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}
```

Use cases:

- Wrapping the return value of `client.on('progress', handler)` before storing
- Wrapping `() => worker.terminate()` for external `Worker` objects we don't control
- Wrapping `clearInterval` / `removeEventListener` calls

```typescript
// Wrap a subscription cleanup
const unsubscribe = client.on('progress', handler);
store.add(toDisposable(unsubscribe));

// Wrap an external Worker
store.add(toDisposable(() => worker.terminate()));

// Wrap a timer
const id = setInterval(poll, 5000);
store.add(toDisposable(() => clearInterval(id)));
```

### `isDisposable(value)`

Type guard for duck-typing disposable objects:

```typescript
function isDisposable(value: unknown): value is Disposable {
  return typeof value === 'object' && value !== null && 'dispose' in value && typeof value.dispose === 'function';
}
```

## 6. Bulk Cleanup with `DisposableStore`

`DisposableStore` replaces ad-hoc `(() => void)[]` arrays and provides safe bulk cleanup. Modeled after VSCode's `DisposableStore` (PR #80661), which replaced bare `IDisposable[]` because arrays silently leak resources added after disposal.

```typescript
class DisposableStore implements Disposable {
  private readonly items = new Set<Disposable>();
  private disposed = false;

  add<T extends Disposable>(disposable: T): T {
    if (this.disposed) {
      console.warn('Adding to an already-disposed store — resource will leak');
    }
    this.items.add(disposable);
    return disposable;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const errors: unknown[] = [];
    for (const item of this.items) {
      try {
        item.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.items.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Errors during disposal');
    }
  }
}
```

Usage in practice:

```typescript
// XState machine context: one store replaces multiple ad-hoc arrays
type KernelMachineContext = {
  resources: DisposableStore;
  kernelClient?: RuntimeClient;
};

// During initialization: add heterogeneous resources to one store
const store = context.resources;
store.add(client); // RuntimeClient (has dispose → terminate)
store.add(bridge); // BridgeHandle (has dispose)
store.add(toDisposable(client.on('progress', handler))); // wrapped subscription
store.add(toDisposable(client.on('log', handler))); // wrapped subscription

// During teardown: one call cleans up everything
context.resources.dispose();
```

## 7. Patterns

**Factory functions returning handles** — return a `Disposable` object:

```typescript
function createFileSystemBridge(worker: Worker): BridgeHandle {
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

**Listener registrations** — return a bare `() => void` (wrap with `toDisposable` at the storage site):

```typescript
function exposeFileSystem(handlers: FileSystemHandlers): () => void {
  self.addEventListener('message', handler);
  return () => {
    self.removeEventListener('message', handler);
  };
}
```

**Orchestration methods** that tear down multiple sub-resources call the appropriate semantic method on each:

```typescript
public async dispose(): Promise<void> {
  this.telemetryCollector?.dispose();  // dispose sub-resource
  this.fileSystem?.dispose();          // dispose sub-resource
  this.transport?.close();             // close connection
  await this.onDispose();              // framework hook
}
```

**Or, preferably, delegate to a `DisposableStore`:**

```typescript
public async dispose(): Promise<void> {
  await this.onDispose();
  this.resources.dispose();
}
```

## 8. Framework Lifecycle Hooks

Lifecycle hooks called by the framework follow the `on*` prefix convention ([Library API Policy § 5](library-api-policy.md#5-naming-conventions)). The cleanup hook is `onDispose`, not `cleanup`:

```typescript
// CORRECT: follows on* convention
type KernelDefinition = {
  initialize(options, services): Promise<Context>;
  evaluate(input, services, context): Promise<Result>;
  onDispose?(context): Promise<void>;
};

// CORRECT: protected hook for subclasses
protected async onDispose(): Promise<void> {
  // Override in subclass for custom cleanup
}

// INCORRECT: breaks on* convention
type KernelDefinition = {
  cleanup?(context): Promise<void>;  // should be onDispose
};
```

## 9. Naming Stored Cleanup References

Store the **resource handle** (which is `Disposable`), not a bare cleanup function. This preserves the resource's identity and enables type-safe access to its other properties:

```typescript
// CORRECT: store handles, use DisposableStore for bulk
type MachineContext = {
  bridge?: BridgeHandle; // Disposable, also has .port
  resources: DisposableStore; // bulk cleanup for subscriptions + handles
  kernelClient?: RuntimeClient; // Disposable, also has .render(), .terminate()
};

// CORRECT: add to store during setup
const bridge = createFileSystemBridge(worker);
context.bridge = bridge;
context.resources.add(bridge);
context.resources.add(toDisposable(client.on('log', handler)));

// CORRECT: bulk cleanup
context.resources.dispose();

// INCORRECT: bare functions with verb names
type MachineContext = {
  bridgeDispose?: () => void; // loses resource identity
  eventCleanups: (() => void)[]; // unsafe, no leak detection
};
```

## 10. The `cleanup` Term

**Do not use `cleanup` as a method name for resource release.** It is not aligned with any standard (TC39, Web APIs, Monaco, Three.js) and creates ambiguity with `dispose`.

Permitted uses of `cleanup`:

- **Domain-specific maintenance** that is not lifecycle teardown: `cleanupOldCacheEntries()`, `cleanupStaleSessions()`. These are operational housekeeping, not resource disposal.
- **Internal implementation detail** inside a function body (local variable name in a `finally` block) where no public API is exposed.

The v2 plugin contract uses `onDispose` for kernel, bundler, and transcoder hooks. The framework calls each hook during disposal; a bundler's hook must not be skipped. Runtime-owned objects expose `dispose()` (or their semantic close/terminate method), independently of plugin hook naming. The current worker protocol still carries an internal `cleanup` command during graceful shutdown; that command is not an author hook and should not be exposed as one.

- `KernelDefinition.cleanup?()` → `KernelDefinition.onDispose?()`
- `BundlerDefinition.cleanup?()` → `BundlerDefinition.onDispose?()`
- `TranscoderDefinition.cleanup?()` → `TranscoderDefinition.onDispose?()`

## 11. Async Dispose

When disposal requires async work (closing WebSocket, flushing buffers, WASM teardown), return `Promise<void>` from `dispose()`. Prefer this over `Symbol.asyncDispose` until the TC39 proposal reaches broader runtime support:

```typescript
// CORRECT: async dispose for resources requiring teardown
public async dispose(): Promise<void> {
  await this.flushBuffers();
  this.websocket.close();
  this.removeAllListeners();
}

// Future: when Symbol.asyncDispose is widely supported
async [Symbol.asyncDispose](): Promise<void> {
  await this.dispose();
}
```

## 12. TC39 `DisposableStack` Forward-Compatibility

The `toDisposable` / `DisposableStore` utilities are designed as stepping stones toward TC39's `DisposableStack`. When `DisposableStack` reaches baseline browser support, the migration path is direct:

```typescript
// Today (our utilities)
const store = new DisposableStore();
store.add(bridge);
store.add(toDisposable(() => worker.terminate()));

// Future (TC39 native)
using stack = new DisposableStack();
stack.use(bridge);
stack.adopt(worker, (w) => w.terminate());
```

Our `Disposable` type is structurally compatible with TC39's `{ [Symbol.dispose](): void }` — adding the symbol method to existing `Disposable` implementations will be a non-breaking change.

## 13. Anti-Patterns

```typescript
// INCORRECT: cleanup as method name (use dispose)
public async cleanup(): Promise<void> { ... }

// INCORRECT: destroy as method name (use dispose or terminate)
public destroy(): void { ... }

// INCORRECT: teardown as method name (use dispose)
public teardown(): void { ... }

// INCORRECT: release as method name (use dispose, unless it's releaseLock on streams)
public release(): void { ... }

// INCORRECT: ad-hoc cleanup arrays (use DisposableStore)
const cleanups: (() => void)[] = [];
cleanups.push(unsubscribe1, unsubscribe2);
for (const fn of cleanups) fn();

// INCORRECT: storing bare cleanup functions with verb names
context.bridgeDispose?.();

// INCORRECT: mixing dispose and cleanup on the same object
class Worker {
  dispose(): void { ... }
  cleanup(): void { ... }
}

// INCORRECT: semantic method without Disposable (can't bulk-manage)
type Transport = {
  close(): void;    // no dispose() — can't add to DisposableStore
};
```

## Summary Table

| Situation                       | Semantic name                                  | `Disposable`                             | Returns                   |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------- | ------------------------- |
| General resource release        | `dispose()` (is the semantic name)             | yes                                      | `void` or `Promise<void>` |
| Connection / transport / stream | `close()`                                      | yes, `dispose()` calls `close()`         | `void`                    |
| Worker / process                | `terminate()`                                  | yes, `dispose()` calls `terminate()`     | `void`                    |
| Computation / actor             | `stop()`                                       | yes, `dispose()` calls `stop()`          | `void`                    |
| Event subscription              | `on(event, handler)`                           | wrap with `toDisposable` at storage site | `() => void`              |
| Listener setup                  | `exposeX()` / `listenX()`                      | wrap with `toDisposable` at storage site | `() => void`              |
| Framework lifecycle hook        | `onDispose()`                                  | n/a (called by framework)                | `Promise<void>`           |
| Bulk management                 | `DisposableStore.dispose()`                    | yes (is itself `Disposable`)             | `void`                    |
| Domain housekeeping             | descriptive verb, e.g. `cleanupStaleEntries()` | no (not lifecycle)                       | varies                    |
