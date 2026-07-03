---
title: 'RPC & Filesystem Bridge Policy'
description: 'MessagePort bridge architecture for connecting filesystem implementations to kernel workers across thread boundaries. Covers RuntimeFileSystemBase, the opaque RuntimeFileSystem, from* constructors, and Bridge RPC primitives.'
status: active
created: '2026-03-03'
updated: '2026-05-01'
related:
  - docs/research/comlink-rpc-practices.md
  - docs/research/fs-bridge-port-migration.md
---

# RPC & Filesystem Bridge Policy

Internal reference for the MessagePort bridge architecture used to connect filesystem implementations to kernel workers across thread boundaries.

## Rationale

The kernel package needs two distinct communication systems: RuntimeTransport for typed protocol messages (render, export, cancel) and Bridge RPC for generic method calls across MessagePort. Merging them would either over-complicate the bridge or under-type the transport. The three-layer architecture (primitives → constructors → bridge) keeps the interface clean while enabling worker-to-worker filesystem access without main-thread relay.

## Architectural Overview

The kernel package has two distinct communication systems, each purpose-built for its domain:

```
┌─────────────────────────────────────────────────────────────────┐
│ RuntimeTransport                                                 │
│ Typed protocol messages: render, export, cancel, fileChanged    │
│ Discriminated unions, requestId correlation, fire-and-forget    │
│ Implementations: Worker, InProcess, (future: WebSocket, HTTP)   │
├─────────────────────────────────────────────────────────────────┤
│ Bridge RPC                                                      │
│ Generic method calls: { id, method, args } → { id, result }     │
│ Serves any object's methods over MessagePort                    │
│ Always request/response, structured error propagation           │
│ Primary use: filesystem access across thread boundaries         │
└─────────────────────────────────────────────────────────────────┘
```

**Why two systems?** They solve different problems. RuntimeTransport carries complex, typed protocol messages with many fields, fire-and-forget commands, and transport-agnostic design (WebSocket, HTTP, FFI). The Bridge carries simple method calls and is always MessagePort-based, always request/response. Merging them would either over-complicate the bridge or under-type the transport.

## Three-Layer Filesystem Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Layer 1: RuntimeFileSystemBase (11 primitives)                 │
│         + RuntimeFileSystem (Base + enhanced helpers)           │
│ createRuntimeFileSystem(base) adds default helpers             │
├───────────────────────────────────────────────────────────────┤
│ Layer 2: Constructors (from* factories)                       │
│ Return the opaque RuntimeFileSystem (transport-ready):        │
│ fromNodeFs, fromMemoryFs, fromFsLikeOpaque,                   │
│ fromBrowserFs, fromWorkerOpaque                               │
├───────────────────────────────────────────────────────────────┤
│ Layer 3: Bridge RPC (MessagePort transport)                   │
│ Serve/consume any object across thread boundaries:            │
│ createBridgeServer, createBridgePort, createBridgeCall        │
│ createBridgeProxy<T>(port) (generic Proxy-based RPC)          │
│ catchMessages(port) (initialization buffering)                │
│ extractTransferables(value) (zero-copy binary transfer)       │
│ exposeFileSystem, createFileSystemBridge (high-level wrappers)│
└───────────────────────────────────────────────────────────────┘
```

### Layer 1: RuntimeFileSystem

The contract interface is split into two types:

**`RuntimeFileSystemBase`** -- the 11 Node.js `fs.promises`-compatible primitives that filesystem backends must implement:

```typescript
type RuntimeFileSystemBase = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
};
```

**`RuntimeFileSystem`** -- extends Base with higher-level helpers that have default implementations built from the primitives:

```typescript
type RuntimeFileSystem = RuntimeFileSystemBase & {
  readFiles(paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  readdirContents(dirPath: string): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  readdirStat(dirPath: string): Promise<FileStatEntry[]>;
  ensureDir(path: string): Promise<void>;
};
```

**`createRuntimeFileSystem(base)`** wraps a `RuntimeFileSystemBase` with default implementations for the enhanced methods. Backends may supply optimized overrides:

```typescript
const fs = createRuntimeFileSystem(base); // defaults: readFiles = Promise.all(paths.map(readFile)), etc.
const fs = createRuntimeFileSystem({ ...base, readFiles: optimizedBatchRead }); // override
```

**Design decisions:**

- **Type split keeps the interface clean.** Filesystem backends implement only the 11 primitives (`RuntimeFileSystemBase`). The wrapper adds the helpers, so consumers always get the full `RuntimeFileSystem` with zero optional methods.
- **Simplified stat return.** Returns `FileStat = { type: 'file' | 'dir'; size; mtimeMs }` (from `@taucad/types`) instead of a full Node.js `Stats` object. This avoids serialization complexity across MessagePort while providing the metadata kernels actually need. `FileStatEntry` extends `FileStat` with `path` and `name` for directory listing results. `NativeStats` and `toFileStat()` (from `@taucad/types/constants`) handle the conversion from Node.js-style `isDirectory()` methods.
- **`lstat` mirrors `stat`.** Required by `isomorphic-git`. Implementations without symlink support (ZenFS, in-memory) delegate `lstat` to `stat`.
- **`exists` is explicit.** While `stat` + catch achieves the same result, `exists` is a common enough operation that an explicit method reduces boilerplate and improves readability.
- **Enhanced method naming uses fs-style abbreviations.** `readdir` + `Contents` = `readdirContents`, `readdir` + `Stat` = `readdirStat`, `ensure` + `Dir` = `ensureDir`. Consistent with the existing `readdir`, `mkdir` primitives.

### Layer 2: Constructors

Factory functions that create `RuntimeFileSystemBase` from various sources. Each normalizes a different source API into the 11-primitive contract.

| Constructor                           | Source                         | Use Case                                                   |
| ------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `fromNodeFs(basePath)`                | Node.js `fs.promises`          | CLI tools, benchmarks, SSR, tests                          |
| `fromMemoryFs(files?)`                | In-memory Map                  | Inline code rendering, unit tests                          |
| `fromFsLikeOpaque(fsLike, rootPath?)` | Any `{ promises: ... }` object | ZenFS, BrowserFS, memfs, or any fs.promises-compatible API |
| `fromBrowserFs(...)`                  | Browser FileSystem APIs        | OPFS, FS Access, in-memory browser fs                      |
| `fromWorkerOpaque(worker)`            | Cross-thread `MessagePort`     | Browser editor with a dedicated File Manager worker        |

All constructors return the opaque {@link RuntimeFileSystem} type — consumers cannot inspect or branch on its internals. The transport plugin reads it through internal helpers in `transport/_internal/` to set up the appropriate channel.

**Naming convention:** All constructors use the `from*` prefix per the library API policy. The name describes _what the source is_, not _what library it comes from_.

#### `fromNodeFs` vs `fromFsLikeOpaque`: why both exist

These serve different environments with different constraints:

- **`fromNodeFs(basePath)`** handles `require('node:fs/promises')` internally via dynamic require, preventing bundlers from including Node.js builtins in browser projects. It uses `path.resolve()` for OS-aware path resolution. This is genuinely Node.js-specific.

- **`fromFsLikeOpaque(fsLike, rootPath?)`** accepts any object with a `promises` namespace matching the `FsLike` shape. This covers ZenFS, BrowserFS, memfs, polyfills, and any future fs-compatible library. The caller provides the fs object; the constructor just normalizes return types (Buffer → Uint8Array, stat → simplified shape).

They cannot be collapsed because `fromNodeFs` must do a dynamic `require()` internally to avoid bundler issues, while `fromFsLikeOpaque` must accept the fs object as a parameter because the caller controls which fs instance to use.

### Layer 3: Bridge RPC

Generic MessagePort-based RPC primitives for serving any object's methods across thread boundaries.

#### Protocol

```
Client                          Server
  │                               │
  │  { id: 1, method, args }  ──► │  dispatch handlers[method](...args)
  │                               │
  │  ◄── { id: 1, result }       │  success
  │  ◄── { id: 1, error }        │  failure (BridgeError)
```

Every request carries a monotonically increasing `id`. The server dispatches by method name, calls the function, and responds with `{ id, result }` or `{ id, error }`. Errors are serialized as `BridgeError` objects preserving name, stack, errno code, and metadata.

#### Primitives

| Function                                   | Level | Purpose                                                                                                                                        |
| ------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBridgeServer(handlers, port)`       | Low   | Serve an object's methods over an RPC **`Port`** (wrap bare `MessagePort`s with **`wrapMessagePort`**)                                         |
| `createBridgePort(handlers)`               | Low   | Convenience: **`createBridgeServer`** + **`MessageChannel`**. Returns **`BridgePort`** (raw **`MessagePort`**) for transfer                    |
| `createBridgeCall(port)`                   | Low   | Generic RPC client: **`{ call, dispose }`** (requires **`Port`**, not a bare **`MessagePort`**)                                                |
| `createBridgeProxy<T>(port)`               | Low   | Generic **`Proxy`**-based RPC client (**`Port`**-backed wire)                                                                                  |
| `catchMessages(port)`                      | Low   | Buffer incoming messages during initialization, replay on demand                                                                               |
| `extractTransferables(value)`              | Low   | Walk nested values and collect **`ArrayBuffer`** transferables (de-duplicated)                                                                 |
| `createRuntimeFileSystem(base)`            | Mid   | Wrap **`RuntimeFileSystemBase`** with default enhanced method implementations                                                                  |
| `exposeFileSystem(handlers, options?)`     | High  | Worker-side: listen for incoming bridge ports                                                                                                  |
| `createFileSystemBridge(worker, options?)` | High  | Client isolate: **`MessageChannel`** + transfer to FS worker — returns **`FileSystemBridge`** (wrapped **`Port`** for **`createBridgeProxy`**) |

See **`docs/research/filesystem-bridge-runtime-inversion-blueprint.md`** for why generic object bridge primitives live under **`@taucad/rpc/bridge`**, filesystem-specific bridge helpers live under **`@taucad/fs-bridge`**, and runtime consumes an opened filesystem bridge connection via **`fromFileSystemBridge(connection)`**.

**Naming split:** Generic bridge primitives use the `Bridge` prefix. Filesystem-typed functions use the `FileSystem` prefix. This distinction is intentional: `createBridgeServer` serves _any_ object (generic `<T extends Record<string, unknown>>`), while `createBridgeProxy<RuntimeFileSystemBase>` returns a typed filesystem proxy.

#### High-Level Wrappers: expose/bridge pair

`exposeFileSystem` and `createFileSystemBridge` form a matched pair for zero-config worker setup:

```typescript
// Worker side (file-manager.worker.ts):
exposeFileSystem(fileManager);

// Kernel worker:
export const runtime = presets.all();
createRuntimeWorker({ runtime });

// Main thread (app shell):
import type { runtime } from './kernel-worker';

const client = createRuntimeClient<typeof runtime>({
  transport: webWorkerTransport({
    url: kernelWorkerUrl,
    fileSystem: fromWorkerOpaque(fileManagerWorker),
  }),
});
await client.connect();
```

The transport creates the FS bridge `MessagePort` internally; the worker-hosted filesystem and the kernel worker communicate without the app passing a raw `MessagePort` anywhere on the public API.

## Connection Modes

`RuntimeClient.connect()` takes **no arguments**. Every wire concern (filesystem bridge, file pool SAB, abort signal channel) is closed over by the {@link TransportPlugin} the consumer hands to `createRuntimeClient({ transport })`.

```typescript
import type { runtime } from './kernel-worker';

const client = createRuntimeClient<typeof runtime>({
  transport: webWorkerTransport({
    url: kernelWorkerUrl,
    fileSystem: fromMemoryFs(files), // or fromNodeFs / fromBrowserFs / fromWorkerOpaque
    filePoolBuffer, // optional, externally allocated SAB
  }),
});
await client.connect();
```

### Inline and worker-hosted `fileSystem`

The transport's **`fileSystem`** option (on bundled callables such as `webWorkerTransport({ ... })` / `nodeWorkerTransport({ ... })`) accepts the opaque `RuntimeFileSystem` returned by any `from*` factory. For inline factories (`fromMemoryFs`, `fromNodeFs`, `fromFsLikeOpaque`, `fromBrowserFs`), the transport creates a `MessageChannel` internally and bridges the in-process or Node-backed `RuntimeFileSystemBase` into the kernel worker. For port-backed factories (`fromWorkerOpaque`), the transport binds the supplied port directly. Cross-process kernel hosts (Electron main, native subprocess) author a custom transport (e.g. **renderer:** `electronUtilityTransport({ port })`) and construct the **`RuntimeTransportHost`** on the host side with **`electronUtilityHost({ fileSystem })`** for `createRuntimeHost({ transport })`.

| Factory                                                                | When to use                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fromMemoryFs` / `fromNodeFs` / `fromFsLikeOpaque` / `fromBrowserFs`   | same-thread or single-process FS source                                                 |
| `fromWorkerOpaque`                                                     | browser editor with a `FileService` / FS worker that speaks the bridge protocol         |
| _(named host factories such as `electronUtilityHost({ fileSystem })`)_ | cross-process kernel host (e.g. Electron utility process) that owns the real filesystem |

## Subpath Export Structure

```
@taucad/runtime              → fromNodeFs, fromMemoryFs, fromFsLikeOpaque, fromBrowserFs, fromWorkerOpaque
@taucad/runtime/filesystem   → opaque RuntimeFileSystem type + same factories
@taucad/runtime/transport    → defineRuntimeTransport, inProcessTransport, webWorkerTransport, nodeWorkerTransport
                               (the only place that needs a transport author touchpoint)
```

The main entry exports constructors because they're the most common consumer need. The `/filesystem` subpath exports bridge primitives for app integrators who need custom worker topologies.

## ZenFS Decoupling

The runtime package must be completely decoupled from ZenFS. The package provides a `node:fs`-compatible interface (`RuntimeFileSystem`) and constructors that normalize various fs implementations into that interface. No ZenFS types, imports, or naming should appear in the public API.

**Current state:** Completed. `fromZenFS` and `ZenFSLike` have been renamed to `fromFsLikeOpaque` and `FsLike` respectively. The function accepts _any_ object with a `promises` namespace -- not just ZenFS. The dead `fromProxy` code from the Comlink era has been removed.

**Exception:** Test utilities (`kernel-testing.utils.ts`) may import ZenFS directly as a concrete implementation for testing. This is acceptable because test utilities are not consumer-facing API.

**Rationale:** A developer using a different browser filesystem (e.g., BrowserFS, memfs, lightning-fs) can pass it to `fromFsLikeOpaque()` without confusion about library-specific naming.

## Architectural Invariants

1. **RuntimeFileSystem is the only filesystem dependency in the framework.** Kernels, bundlers, and middleware never see MessagePort, Bridge, or constructor details. They receive `RuntimeFileSystem` via `KernelRuntime.fileSystem`.

2. **Bridge primitives are generic.** `createBridgeServer<T>`, `createBridgePort<T>`, `createBridgeCall`, and `createBridgeProxy<T>` work with any object, not just filesystems. This enables the app to serve a `FileManager` (which has methods beyond `RuntimeFileSystem`) through the same bridge infrastructure. `createBridgeProxy<T>(port)` eliminates the need for hand-written per-method stubs by using JavaScript's `Proxy` to auto-dispatch.

3. **Constructors normalize, not extend.** Each `from*` function converts a source API to exactly the `RuntimeFileSystemBase` interface -- the 11 primitives, no extra methods, no source-specific behavior leaking through.

4. **Zero-copy binary transfer.** `extractTransferables` scans values for `ArrayBuffer` instances and includes them in the `postMessage` transfer list. This avoids expensive structured-clone copies for large file content (CAD files can be tens of MB).

5. **Initialization safety.** `catchMessages(port)` buffers incoming messages until the server is ready, then replays them. This prevents lost requests during worker initialization.

6. **One serialization point per browser tab.** In the browser, all filesystem mutations flow through a single file-manager worker with a serialization queue. The bridge primitives enable multiple consumers (kernel workers, git, main thread) to connect to this single worker. This prevents the ZenFS TOCTOU race condition documented in `zen-fs/core#256`.

7. **Errors propagate with full context.** `BridgeError` preserves the worker-side error's name, stack trace, errno code, and metadata. The consumer-side proxy reconstructs a proper `Error` object, so `catch` blocks and error boundaries work naturally.

## Naming Rationale

### Why `createBridgeServer` not `createFileSystemServer`

The function is generic (`<T extends Record<string, unknown>>`), not `RuntimeFileSystem`. Naming it `createFileSystemServer` would be misleading when it's used to serve a `FileManager` with 20+ methods. The name should describe what the function does, not just its most common use case (library API policy Section 5: "Describe the action, not the architecture").

### Why `exposeFileSystem` keeps the `FileSystem` prefix

`exposeFileSystem` is the worker-side counterpart to `createFileSystemBridge`. Together they form a named pair. While `exposeFileSystem` is generic (`<T extends Record<string, unknown>>`), its documented purpose and primary use case is filesystem exposure. The pair naming provides better discoverability than generic alternatives like `exposeBridgeService`.

## Open Questions

### Where do filesystem bridge helpers live?

```
@taucad/rpc/bridge  → generic object-over-MessagePort primitives
@taucad/fs-bridge   → filesystem-specific bridge adapters
@taucad/filesystem  → pure filesystem domain types/providers
@taucad/runtime     → consumes RuntimeFileSystem handles
```

Generic bridge primitives must not import filesystem or runtime code. Core filesystem must not import RPC or runtime code. `@taucad/fs-bridge` is the adapter package allowed to depend on both `@taucad/filesystem` and `@taucad/rpc/bridge`.

### Should `fromFsLikeOpaque` accept Node.js `fs` directly?

Node.js `fs` has a `.promises` namespace matching `FsLike`. In theory, `fromFsLikeOpaque(require('fs'))` would work. However, `fromNodeFs` adds `path.resolve()` for OS-aware path resolution, which `fromFsLikeOpaque` does not (it uses simple string concatenation). Recommend keeping both: `fromNodeFs` for Node.js environments, `fromFsLikeOpaque` for browser/polyfill environments.
