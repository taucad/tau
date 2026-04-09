---
title: 'Kernel Architecture Policy'
description: 'CAD runtime worker architecture from editor to geometry computation. Covers ProjectMachine, CadMachine, RuntimeClient, plugin model, transport, and lifecycle.'
status: active
created: '2026-02-18'
updated: '2026-03-05'
---

# Kernel Architecture Policy

Internal reference for the CAD runtime worker architecture: from editor to geometry computation.

## Rationale

A layered kernel API (Client, Transport, Protocol) separates consumer convenience from framework primitives. The plugin model (kernels, bundlers, middleware) keeps the framework generic while enabling CAD-specific capabilities. Single-worker-per-compilation-unit and lazy kernel loading minimize memory footprint.

## Architecture Overview

```text
Route (projects_.$id)
  └─ ProjectMachine (1 per project)
       ├─ FileManagerMachine (1 per project, shared)
       ├─ EditorMachine (1 per project, UI state)
       ├─ ViewGraphics: Map<viewId, GraphicsMachine>
       │    └─ GraphicsMachine (1 per viewer panel, WebGL rendering)
       └─ CompilationUnits: Map<entryFile, CadMachine>
            └─ CadMachine (1 per entry file, headless computation)
                 └─ KernelMachine (1 per CadMachine)
                      └─ RuntimeClient → RuntimeTransport → Worker
                           └─ KernelRuntimeWorker (1 Web Worker per KernelMachine)
                                ├─ Loaded kernel modules (via defineKernel)
                                ├─ Loaded bundler modules (via defineBundler, routed by extension)
                                └─ Middleware chain (via defineMiddleware)
```

## Layered Architecture

The kernel API follows a three-layer design. Each layer has a distinct audience and abstraction level:

```text
┌────────────────────────────────────────────────────────┐
│  RuntimeClient (consumer-facing)                        │
│  Promise-based, lazy initialization, event subscription│
├────────────────────────────────────────────────────────┤
│  RuntimeTransport (framework-level)                     │
│  Event-driven, transport-agnostic, zero Promises       │
├────────────────────────────────────────────────────────┤
│  RuntimeCommand / RuntimeResponse (protocol)             │
│  Typed discriminated unions, requestId correlation      │
└────────────────────────────────────────────────────────┘
```

**Why both Client and Transport?** Transport is the primitive -- pure messages with zero abstraction overhead. Client adds Promise correlation (~1μs overhead vs 100ms–10s render times). Both are exposed: consumers use `RuntimeClient`, framework authors use `RuntimeTransport` directly.

## Entity Model

| Entity                  | Purpose                                                                                                                                                                                                                                                            | Layer         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **RuntimeClient**       | High-level facade. Lazy, Promise-based, event-subscribable. Supports inline code rendering (`CodeInput`) and filesystem rendering (`FileInput`). Emits `geometry` event on render completion. Auto-cancels superseded renders. Created by `createRuntimeClient()`. | Consumer      |
| **RuntimeTransport**    | Event-driven message channel between realms. Default: `createWorkerTransport()`.                                                                                                                                                                                   | Framework     |
| **RuntimeWorkerClient** | Protocol client wrapping a Transport with request/response correlation and typed callbacks.                                                                                                                                                                        | Framework     |
| **KernelRuntimeWorker** | Worker-side orchestrator. Manages kernel selection, middleware chain, bundler routing.                                                                                                                                                                             | Worker        |
| **RuntimeFileSystem**   | 10-method Node.js `fs.promises`-compatible interface. Bridged from main thread → worker via MessagePort.                                                                                                                                                           | Consumer      |
| **KernelDefinition**    | Kernel plugin contract (author API, via `defineKernel`). Runs in worker.                                                                                                                                                                                           | Plugin Author |
| **BundlerDefinition**   | Bundler plugin contract (author API, via `defineBundler`). Declares supported `extensions`.                                                                                                                                                                        | Plugin Author |
| **KernelMiddleware**    | Middleware plugin contract (author API, via `defineMiddleware`). Wraps kernel operations.                                                                                                                                                                          | Plugin Author |
| **KernelPlugin**        | Registration object returned by consumer factory functions like `replicad()`. Runs on main thread.                                                                                                                                                                 | Consumer      |
| **MiddlewarePlugin**    | Registration object returned by consumer factory functions like `parameterCache()`.                                                                                                                                                                                | Consumer      |
| **BundlerPlugin**       | Registration object returned by consumer factory functions like `esbuild()`.                                                                                                                                                                                       | Consumer      |
| **KernelRuntime**       | Services injected into kernel methods: filesystem, logger, bundler, tracer.                                                                                                                                                                                        | Plugin Author |
| **Realm**               | Execution environment: main thread, Web Worker, Node.js `worker_threads`, remote server.                                                                                                                                                                           | Conceptual    |

## API Audiences

Two distinct "define" patterns serve different audiences:

| Audience          | Pattern                                                   | Example                      | Runs In      |
| ----------------- | --------------------------------------------------------- | ---------------------------- | ------------ |
| **Plugin author** | `defineKernel()`, `defineBundler()`, `defineMiddleware()` | Implement a new CAD kernel   | Worker realm |
| **Consumer**      | `replicad()`, `esbuild()`, `parameterCache()`             | Select and configure plugins | Main thread  |

## Three-Pillar Plugin Model

All non-generic capabilities are provided by injectable plugins, not hardcoded in the framework:

| Plugin Type | Author API                              | Consumer API                            | Purpose                                                          | Example                                               |
| ----------- | --------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Kernel      | `defineKernel` → `KernelDefinition`     | `replicad()` → `KernelPlugin`           | Geometry computation, parameter extraction, export               | replicad, manifold, jscad, openscad, zoo, buerli, tau |
| Bundler     | `defineBundler` → `BundlerDefinition`   | `esbuild()` → `BundlerPlugin`           | File bundling, code execution, module registry, import detection | esbuild bundler                                       |
| Middleware  | `defineMiddleware` → `KernelMiddleware` | `parameterCache()` → `MiddlewarePlugin` | Operation wrapping (caching, transforms, edge detection)         | geometry-cache, parameter-cache                       |

### Multi-Bundler Support

Multiple bundlers can be registered simultaneously. Each bundler declares the file extensions it handles via `extensions: string[]` in its `BundlerDefinition`. The framework routes operations to the correct bundler by file extension:

- `registerModule` calls are broadcast to all loaded bundlers
- `bundle`, `detectImports`, `resolveDependencies` are routed to the bundler matching the file extension
- Bundlers are lazily loaded -- only initialized when a file with a matching extension is encountered
- Managed internally via `Map<extension, BundlerDefinition>` and `Map<extension, LoadedBundler>`

### Machine Multiplicity

| Component           | Per-project count       | Per-viewer-panel count | Notes                                          |
| ------------------- | ----------------------- | ---------------------- | ---------------------------------------------- |
| ProjectMachine      | 1                       | --                     | Root state machine                             |
| FileManagerMachine  | 1                       | --                     | Shared across all units                        |
| CadMachine          | 1 per unique entry file | --                     | Shared when multiple panels view the same file |
| KernelMachine       | 1 per CadMachine        | --                     | Always 1:1 with CadMachine                     |
| RuntimeClient       | 1 per KernelMachine     | --                     | Manages Worker lifecycle                       |
| KernelRuntimeWorker | 1 per RuntimeClient     | --                     | Single worker, loads kernel on demand          |
| GraphicsMachine     | --                      | 1                      | WebGL renderer per panel                       |

### Memory Impact

With the single-worker-per-CU architecture, only the WASM runtime for the selected kernel is loaded:

- replicad file: ~55-66 MB (OpenCASCADE WASM)
- manifold file: ~14 MB (Manifold WASM)
- openscad file: ~14 MB (Manifold WASM)
- buerli file: ~302 KB + ClassCAD WASM (loaded at runtime via API key)
- jscad file: ~5 MB
- kcl file: ~3 MB (KCL WASM)
- STEP/STL file: ~5 MB (converter)

Previously, all 5 kernels were loaded eagerly (~90 MB per CadMachine).

## RuntimeClient Lifecycle

```text
1. createRuntimeClient(options)                          → RuntimeClient created, no Worker yet
2. client.on('geometry', handler)                       → Subscribe to render results (any time)
3. client.render({ code: { 'box.ts': '...' } })        → Auto-creates filesystem, auto-connects, renders
4. client.render({ file, parameters, changedPaths })    → Invalidates caches, renders from filesystem
5. client.connect({ port })                             → Explicit connection for worker bridges
6. client.terminate()                                   → Worker terminated, resources cleaned up
```

### RenderInput Type

The `render()` method accepts two input shapes via generic overloads:

**Inline code mode** (`CodeInput<T>`): A filename-to-content map. When the code object has a single key, `file` is optional (the runtime picks the only key). When multiple keys exist, `file` is required to specify the entry point. Auto-creates an in-memory filesystem, writes code, connects, and renders. Not compatible with port-based connections.

**Filesystem mode** (`FileInput`): Renders from a connected filesystem. `file` can be a string shorthand (e.g., `'/src/main.ts'`) or a `GeometryFile` object. `changedPaths` absorbs the old `notifyFileChanged` pattern -- the client internally notifies the worker about changed files before rendering.

### Geometry Event

When any render completes (success or failure), the `geometry` event fires with the full `HashedGeometryResult`. This enables fire-and-forget render calls where the consumer subscribes once and receives all results reactively.

### Auto-Cancellation (Latest-Wins)

When `render()` is called while a previous render is in-flight, the previous render is cancelled via `cancelPendingRender()`. The cancelled render's Promise rejects with `RenderSupersededError`. Only the latest render's result fires the `geometry` event. For pull consumers (CLI), renders are sequential so cancellation never triggers.

## RuntimeFileSystem

10 required methods matching Node.js `fs.promises.*`. All paths are absolute.

| Method      | Signature                                           | Purpose                                 |
| ----------- | --------------------------------------------------- | --------------------------------------- |
| `readFile`  | `(path, encoding?) → Promise<string \| Uint8Array>` | Read file as text or binary             |
| `writeFile` | `(path, data) → Promise<void>`                      | Write text or binary file               |
| `mkdir`     | `(path, options?) → Promise<void>`                  | Create directory (optionally recursive) |
| `readdir`   | `(path) → Promise<string[]>`                        | List directory entries                  |
| `unlink`    | `(path) → Promise<void>`                            | Delete file                             |
| `rmdir`     | `(path) → Promise<void>`                            | Remove directory                        |
| `rename`    | `(oldPath, newPath) → Promise<void>`                | Rename/move file or directory           |
| `stat`      | `(path) → Promise<{ type, size, mtimeMs }>`         | Get file/directory metadata             |
| `lstat`     | `(path) → Promise<{ type, size, mtimeMs }>`         | Like stat, but does not follow symlinks |
| `exists`    | `(path) → Promise<boolean>`                         | Check if path exists                    |

The framework builds higher-level operations from these primitives internally:

- `ensureDirectoryExists(path)` via `mkdir(path, { recursive: true })`
- `readFiles(paths)` via `Promise.all(paths.map(readFile))`
- `getDirectoryContents(dir)` via `readdir(dir)` + `Promise.all(names.map(readFile))`
- `getDirectoryStat(dir)` via `readdir(dir)` + `Promise.all(names.map(stat))`

Convenience constructors: `fromNodeFS(basePath)`, `fromMemoryFS()`, `fromFsLike(fsLike, rootPath?)`.

## Transport Abstraction

```typescript
type RuntimeTransport = {
  send(message: RuntimeCommand, transferables?: Transferable[]): void;
  onMessage(handler: (message: RuntimeResponse) => void): void;
  close(): void;
};
```

**Built-in:** `createWorkerTransport(workerUrl)` wraps a Web Worker as a `RuntimeTransport`.

**Future transports:** WebSocket (remote kernel server), HTTP + SSE (serverless endpoints), `worker_threads` (Node.js).

## Data Flow: File Edit to Geometry Display

```
1. User edits code in Monaco editor
   │
2. FileManager writes file → emits fileWritten event
   │
3. use-project.tsx iterates all compilationUnits with changed path (absolute)
   │
4. Each CadMachine receives setFile event
   │  ├─ Different file → immediate render
   │  └─ Same file → 500ms debounce (bufferingFile state)
   │
5. CadMachine enters rendering state → sends createGeometry to KernelMachine
   │
6. KernelMachine pipeline:
   │  ├─ Lazily creates RuntimeClient (ensureRuntimeClient)
   │  ├─ Subscribes to geometry/progress/parametersResolved events once
   │  ├─ RuntimeClient creates Worker + Transport on first connect
   │  ├─ Worker selects kernel via three-pass detection
   │  ├─ render: unified pipeline (deps → params → geometry)
   │  ├─ changedPaths passed to render() for cache invalidation (no separate notifyFileChanged)
   │  └─ Auto-cancellation: new render supersedes in-flight render
   │
7. CadMachine receives geometryComputed → updates context.geometries
   │
8. ViewerContent useEffect bridges geometries → GraphicsMachine
   │
9. GraphicsMachine → CadViewer → GltfMesh renders to WebGL canvas
```

### Debouncing

| Trigger                         | Debounce | Rationale                                |
| ------------------------------- | -------- | ---------------------------------------- |
| File content change (same file) | 500ms    | Avoids recompiling on every keystroke    |
| Parameter change                | 50ms     | Slider drags need responsive feedback    |
| File switch (different file)    | 0ms      | User intent is clear, render immediately |

## Worker Lifecycle

### Lazy Initialization

The RuntimeClient creates the Worker lazily on first `connect()` or `render()`:

1. `createRuntimeClient(options)` — returns client, no Worker yet
2. `client.connect({ fileSystem })` — creates Worker via `createWorkerTransport(workerUrl)`
3. `RuntimeWorkerClient.initialize()` sends kernel config, middleware config, and bundler config
4. Worker loads bundler modules via `import(bundlerModuleUrl)` for matching extensions
5. Kernel module loading is deferred until `selectKernel()` determines which kernel is needed

Only the WASM runtime for the selected kernel is ever loaded.

### Cleanup Chain

```
ProjectMachine.stopStatefulActors()
  → enqueue.stopChild(cadMachine)
    → CadMachine stops
      → KernelMachine exit action: destroyWorkers()
        → kernelClient.terminate()
          → workerClient.cleanup()
          → transport.close()
```

## Kernel Selection (Three-Pass Detection)

### Detection Strategy

```
1. Check selectionCache (full file path as key) → hit? return immediately

2. Pass 1: Extension + regex fast path
   - Try each kernel config's detectImport regex against the entry file
   - Extension-only kernels (openscad, zoo) match immediately
   - Regex kernels (replicad, manifold, jscad) test entry file content

3. Pass 2: Bundler-assisted detection (transitive)
   - If no kernel matched AND a bundler handles this file's extension:
   - Route to the correct bundler via extension matching
   - Call bundler.detectImports(entryPath) — no modules need to be registered
   - detectImports marks bare specifiers as external, walks the full import tree
   - Returns { detectedModules: ['replicad'], dependencies: [...] }
   - Match detectedModules against each kernel config's builtinModuleNames
   - Select highest-priority match; initialize ALL matching kernels (multi-module)

4. Pass 3: Catch-all fallback
   - Try any extensions: ['*'] config (tau converter)
```

### Detection Priority

```
Priority: openscad → zoo → replicad → manifold → jscad → buerli → tau
```

| Kernel   | Detection Method              | Scope                   |
| -------- | ----------------------------- | ----------------------- |
| OpenScad | Extension: `.scad`            | Immediate               |
| Zoo      | Extension: `.kcl`             | Immediate               |
| Replicad | Regex + bundler detectImports | Entry file + transitive |
| Manifold | Regex + bundler detectImports | Entry file + transitive |
| Jscad    | Regex + bundler detectImports | Entry file + transitive |
| Tau      | Extension: `*` (catch-all)    | Fallback                |

### Multi-Module Registration

When detection finds imports matching multiple kernels (e.g., both `replicad` and `@jscad/modeling`), the framework:

1. Selects the highest-priority kernel for geometry computation
2. Initializes ALL matching kernels so their modules are registered

This ensures all library modules are available at bundle time.

### Selection Cache Invalidation

The selection cache is invalidated when `changedPaths` is provided in the render input (or via the escape-hatch `notifyFileChanged`), since changed imports may shift which kernel handles a file. The cache uses full file paths as keys to prevent collisions.

## Plugin Architecture

### `defineBundler`

Bundler plugins handle file bundling, code execution, and module registry. The esbuild bundler (`esbuild.bundler.ts`) is the default implementation.

Each bundler declares which file extensions it handles via `extensions: string[]`:

```typescript
export default defineBundler({
  extensions: ['ts', 'js', 'tsx', 'jsx'],
  // ...methods
});
```

Key methods:

- `detectImports(input)` — lightweight pass that discovers bare-specifier imports transitively using esbuild externals mode. No modules need to be registered. Used for kernel selection.
- `bundle(input)` — full production bundle with all registered modules resolved. Called after kernel selection and initialization.
- `execute(code)` — run bundled code via dynamic import (Blob URL / data URL).
- `registerModule(name, module)` — register/update a builtin module for resolution during bundle().
- `resolveDependencies(input)` — optional fast-path dependency resolution.

### `defineKernel`

Kernel modules define geometry computation logic. Each kernel is an ES module loaded via `import(kernelModuleUrl)`:

- `onInitialize(options, runtime)` — load WASM, register builtin modules. `options` is type-safe via the `Options` generic inferred from `optionsSchema`
- `onGetDependencies(input, runtime, ctx)` — return file dependencies
- `onGetParameters(input, runtime, ctx)` — extract parameters from code
- `onCreateGeometry(input, runtime, ctx)` — compute geometry + return nativeHandle. `input.tessellation` provides preview quality when specified
- `onExportGeometry(input, runtime, ctx, nativeHandle)` — export using stored handle. `input.tessellation` provides export quality when specified

### MessagePort Protocol

The kernel machine communicates with the worker via typed MessagePort events through the `RuntimeTransport` interface:

- All request/response commands carry a `requestId` for correlation
- Fire-and-forget commands (`fileChanged`, `configureMiddleware`, `cleanup`) have no requestId
- `cancel` command is used by auto-cancellation (latest-wins semantics) when a new `render()` supersedes an in-flight one
- `fileChanged` command is sent internally by the client when `changedPaths` is provided in the render input
- `progress` events stream render phase transitions to the UI
- `telemetry` events batch performance entries for the kernel panel

### ESBuild Metafile

The bundler produces a metafile with all resolved module paths:

| Namespace   | Example Key                           | Description                      |
| ----------- | ------------------------------------- | -------------------------------- |
| `zenfs:`    | `zenfs:main.ts`                       | Project-relative file            |
| `zenfs:`    | `zenfs:/node_modules/lodash/index.js` | CDN-cached module                |
| `builtin:`  | `builtin:replicad`                    | Runtime-registered kernel module |
| `http-url:` | `http-url:https://esm.sh/...`         | HTTP-fetched module              |

During detection, bare specifiers appear as external imports in `metafile.outputs[chunk].imports` rather than in `metafile.inputs`, since they are not resolved.

## Package Exports

```
@taucad/runtime          → createRuntimeClient, types, presets, fromNodeFS, fromMemoryFS, fromFsLike
@taucad/runtime/kernels  → replicad(), manifold(), zoo(), openscad(), jscad(), buerli(), tau()
@taucad/runtime/middleware → parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()
@taucad/runtime/bundler  → esbuild()
@taucad/runtime/transport → RuntimeTransport, createWorkerTransport()
@taucad/runtime/testing  → Testing utilities (createTestFilesystem, mocks)
```

Individual plugin subpaths are also maintained for direct imports (e.g., `@taucad/runtime/kernels/replicad`).

## Tessellation

Tessellation controls the quality of geometry meshing across the render and export pipelines. It is a first-class, cross-cutting concern formalized as a shared type in `@taucad/types`.

### Shared Type

```typescript
type Tessellation = {
  linearTolerance: number; // Maximum chord deviation (mm)
  angularTolerance: number; // Maximum angle between face normals (degrees)
};
```

### Configuration Levels

Tessellation can be configured at two levels, with per-call overrides taking precedence:

1. **Client-level defaults** — set once in `createRuntimeClient(options)`:

```typescript
createRuntimeClient({
  tessellation: {
    preview: { linearTolerance: 0.1, angularTolerance: 30 }, // Faster, lower quality
    export: { linearTolerance: 0.01, angularTolerance: 30 }, // Slower, higher quality
  },
  // ...
});
```

Two explicit slots (`preview` and `export`) make the quality distinction visible and intentional. Preview tessellation is used by `render()`, export tessellation is used by `export()`.

2. **Per-call overrides** — passed as `callOptions` to individual methods:

```typescript
client.render({
  file,
  parameters,
  tessellation: { linearTolerance: 0.05, angularTolerance: 15 },
});
client.export('stl', {
  tessellation: { linearTolerance: 0.005, angularTolerance: 10 },
});
```

### Resolution Order

For both `render` and `export`: `callOptions.tessellation > client option (preview/export) > kernel default`.

If no tessellation is specified at any level, each kernel applies its own internal defaults.

### Per-Kernel Interpretation

| Kernel       | Preview Default | Export Default | Mechanism                                                                                                                              |
| ------------ | --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Replicad** | `0.1 / 30°`     | `0.01 / 30°`   | Passed to `.mesh()` and `.meshEdges()`                                                                                                 |
| **Manifold** | ignored         | ignored        | Uses Manifold's own tessellation; fixed by model/API output                                                                            |
| **OpenSCAD** | none            | n/a            | Injected as `$fs` (linear) and `$fa` (angular) CLI arguments at render time. Export reuses baked geometry — override logged as warning |
| **Zoo/KCL**  | ignored         | ignored        | Tessellation is server-side; future integration point                                                                                  |
| **JSCAD**    | ignored         | ignored        | Uses fixed internal tessellation                                                                                                       |

### Threading Path

```
RuntimeClient.render({ file, parameters, tessellation?, changedPaths? })
  → resolves: input.tessellation ?? options.tessellation.preview
    → RuntimeWorkerClient.render(..., tessellation?)
      → RuntimeCommand { type: 'render', tessellation? }
        → dispatcher → KernelWorker.render(..., tessellation?)
          → KernelWorker.createGeometry(..., tessellation?)
            → CreateGeometryInput { tessellation? }
              → KernelDefinition.onCreateGeometry(input, runtime, ctx)
```

Export follows the same pattern via `exportGeometry` → `ExportGeometryInput { tessellation? }`.

## Plugin Options & Validation

All plugins use Zod schemas for option validation via a common `optionsSchema` pattern:

| Plugin Type | Schema Property                   | Validated At                                        |
| ----------- | --------------------------------- | --------------------------------------------------- |
| Kernel      | `KernelDefinition.optionsSchema`  | `ensureKernelInitialized()` before `initialize()`   |
| Bundler     | `BundlerDefinition.optionsSchema` | `ensureBundlerForExtension()` before `initialize()` |
| Middleware  | `KernelMiddleware.optionsSchema`  | `loadMiddleware()` during middleware resolution     |

Consumer-facing input uses `options` naming; validated output uses `config` internally within `defineX` implementations. The `Options` generic type is inferred from the Zod schema, giving plugin authors type-safe access in their callbacks without manual casting.

## Caching Strategy

### File-Level Caches (persist across render cycles)

| Cache               | Invalidation                                                         | Purpose                                             |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `fileHashCache`     | Per-path via `changedPaths` in render input (or `notifyFileChanged`) | Avoid re-hashing unchanged files                    |
| `fileContentCache`  | Per-path via `changedPaths` in render input (or `notifyFileChanged`) | Avoid re-reading unchanged files                    |
| `bundleResultCache` | Dependency-aware: only entries whose deps overlap with changed files | Avoid re-bundling when deps haven't changed         |
| `selectionCache`    | Cleared entirely on any file change                                  | Ensure kernel detection re-runs when imports change |

### Per-Render Caches (cleared each render cycle)

| Cache                   | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `renderDependencyCache` | Reuse dependency computation between getParams and createGeometry |
| `cachedDetectionDeps`   | Reuse deps from detectImports for getDependencies (zero cost)     |

## Future Work -- Render Pipeline Cancellation

### Problem: Render Interleaving on the Worker

The worker-side dispatcher (`runtime-worker-dispatcher.ts`) does not serialize render operations. When rapid parameter changes trigger back-to-back renders, the event loop processes the second render's `postMessage` at an `await` yield point of the first render. Both renders share mutable worker state (tracer, caches, `onProgress` callback), causing corruption.

The tracer crash is fixed by epoch-scoped spans (see `RuntimeTracer`), but the broader interleaving problem remains: stale renders waste compute time running the full geometry pipeline even when superseded. The `cancel` command sent by `RuntimeWorkerClient.cancelPendingRender()` is currently a no-op on the worker side.

### Proposed Architecture: Dispatcher Serialization with Cooperative Cancellation

The cancellation architecture has three layers, each targeting a different execution context:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Framework AbortSignal (async yield points)         │
│ AbortController lives in dispatcher, signal passed to       │
│ KernelWorker.render(). Checked via signal.throwIfAborted()  │
│ at every await boundary.                                    │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: WASM cooperative cancellation (sync compute)       │
│ OpenCASCADE: Message_ProgressIndicator.UserBreak()          │
│ Polled during long tessellation/boolean operations.         │
│ Connected to AbortSignal via progress callback.             │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: SharedArrayBuffer flag (cross-thread sync signal)  │
│ Main thread sets flag → worker reads atomically.            │
│ Bypasses postMessage latency for time-critical cancellation.│
│ Optional optimization for sub-millisecond response.         │
└─────────────────────────────────────────────────────────────┘
```

### Dispatcher Serialization

The dispatcher should maintain a render lock and an `AbortController`:

1. On `render` command: abort the previous controller, await the render lock (previous render exits fast via cooperative cancellation), create a new `AbortController`, pass `signal` to `worker.render()`
2. On `cancel` command: call `currentAbort.abort()` instead of the current no-op
3. Aborted renders are silently discarded (no response sent to main thread)
4. Only the latest render's result is sent back as `geometryComputed`

Key constraint: `AbortSignal` cannot be transferred via `postMessage` (not `Transferable`), so the `AbortController` must live on the worker side in the dispatcher. The main thread's `cancel` command triggers the abort.

### Cooperative Cancellation in KernelWorker

Add `signal?: AbortSignal` to `KernelWorker.render()` and insert `signal.throwIfAborted()` at every async yield point:

- `render()`: before `getParameters()`, before `createGeometry()`
- `getParameters()`: before middleware chain
- `createGeometry()`: before middleware chain
- `computeBaseDependencies()`: after `onGetDependencies()`

Use `AbortSignal.any()` to combine the render cancellation signal with any future timeout or user-initiated cancel signals. Use the built-in `signal.throwIfAborted()` (throws `DOMException` with `name === 'AbortError'`) rather than a custom helper.

### WASM Cancellation (OpenCASCADE)

For kernels with long-running synchronous WASM operations (replicad/OpenCASCADE), connect the `AbortSignal` to the OpenCASCADE progress indicator:

- `Message_ProgressIndicator.UserBreak()` is polled by the WASM runtime during tessellation and boolean operations
- Return `true` from the progress callback when `signal.aborted` to trigger cooperative exit from WASM
- This is the only way to interrupt synchronous WASM computation without terminating the worker

### References

- [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) -- standard cooperative cancellation
- [MDN AbortSignal.any()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static) -- combining multiple signals
- [MDN AbortSignal.throwIfAborted()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/throwIfAborted) -- built-in abort check
- [Prioritized Task Scheduling API](https://wicg.github.io/scheduling-apis/) -- TaskController/AbortSignal integration pattern
- [OpenCASCADE.js Progress Indicator](https://ocjs.org/docs/stable/usage/progress) -- WASM cooperative cancellation via `Message_ProgressIndicator`

## Monaco IntelliSense Type Pipeline

The editor provides IntelliSense (autocompletion, hover, diagnostics) for kernel imports via bundled `.d.ts` files registered with Monaco's TypeScript language service.

### Architecture

```
Kernel package .d.ts files
  → extract-<id>-types.ts (extraction script)
    → <id>.bundled.json (JSON map: module path → raw .d.ts content)
      → @taucad/api-extractor (parses JSON internally, exports typed KernelTypesMap)
        → javascript-contribution.ts (iterates typed maps → addExtraLib per entry)
          → Monaco TypeScript language service
```

### Why JSON Maps

Each kernel exports a JSON map of `Record<string, string>` where keys are module paths (e.g. `@jscad/modeling`, `@jscad/modeling/primitives`) and values are raw `.d.ts` content. This uniform format exists because:

- **Module identity = file path**: Monaco's TypeScript service resolves `import { cube } from '@jscad/modeling/primitives'` by looking for a virtual file at `file:///node_modules/@jscad/modeling/primitives/index.d.ts`. Each subpath export needs its own `addExtraLib` registration.
- **No `declare module` wrappers**: Earlier versions wrapped content in `declare module '<pkg>' { ... }` blocks. This caused TS1038 errors (`'declare' modifier cannot be used in an already ambient context`) because the source `.d.ts` files already use `export declare`. Raw module files registered at the correct virtual path avoid this entirely.
- **Uniform consumer code**: Every kernel uses the same format regardless of whether it has one entry point (replicad) or fifteen (JSCAD). The consumer in `javascript-contribution.ts` is a single `flatMap` over all kernel type maps.
- **Typed exports**: `@taucad/api-extractor` parses the JSON internally and exports typed `KernelTypesMap` objects plus a pre-built `kernelTypeMaps` array. Consumers use these directly — no `JSON.parse` or type assertions needed.

### Adding Types for a New Kernel

1. Create `libs/api-extractor/src/extract-<id>-types.ts` with a `buildBundledTypes(): Record<string, string>` function
2. Write output to `libs/api-extractor/src/generated/<id>/<id>.bundled.json`
3. Also write individual `.d.ts` files under `generated/<id>/modules/` for type-level testing
4. In `libs/api-extractor/src/index.ts`: import the raw JSON, parse it via `parseTypesMap`, export as a typed `KernelTypesMap`, and add it to the `kernelTypeMaps` array
5. No changes needed in `javascript-contribution.ts` — it imports `kernelTypeMaps` which already includes all kernels
6. Add `.test-d.ts` type-level tests under `generated/<id>/` using `tsconfig.typetest.json` path mappings

### Type-Level Testing

Type-level tests (`.test-d.ts` files) verify that the generated types resolve correctly when imported via module names. They use a separate `tsconfig.typetest.json` with `moduleResolution: Bundler` and path mappings pointing at the `modules/` directory structure. These tests run via `vitest --typecheck` (not `tsgo`) because the path mappings require Bundler resolution mode.
