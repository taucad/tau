---
name: Kernel API v2 redesign
overview: "Breaking redesign of @taucad/kernels into a world-class, layered CAD kernel API: event-driven transport foundation, tree-shakeable plugin factories, Node.js-compatible filesystem, Promise-based high-level client, and comprehensive JSDoc enforcement."
todos:
  - id: docs-best-practices
    content: Create docs/library-api-best-practices.md with API design patterns distilled from Clerk JS codebase analysis
    status: completed
  - id: filesystem-redesign
    content: Define KernelFileSystem (8 required Node.js-compatible methods), refactor kernel-worker-filemanager-bridge, build framework-internal helpers (readFiles, ensureDirectoryExists, getDirectoryContents, getDirectoryStat)
    status: completed
  - id: transport-interface
    content: Create KernelTransport interface and createWorkerTransport() in packages/kernels/src/transport/; refactor KernelWorkerClient to accept KernelTransport
    status: completed
  - id: remove-canhandle
    content: Remove canHandle from protocol types, KernelWorkerClient, dispatcher, and kernel.machine.ts; internalize into renderEntry error path
    status: completed
  - id: plugin-factories
    content: "Create plugin factory functions: replicad(), zoo(), openscad(), jscad(), tau(), parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection(), esbuild(); create presets.all()"
    status: completed
  - id: multi-bundler
    content: Refactor KernelWorker from single loadedBundler to Map<extension, LoadedBundler>; add extensions to BundlerDefinition; route bundler operations by file extension; change bundler→bundlers (array) in client options
    status: completed
  - id: client-factory
    content: Implement createKernelClient() factory, KernelClient interface with .on() event subscription, lazy Worker creation, and connect() with KernelFileSystem
    status: completed
  - id: define-middleware-rename
    content: Rename createKernelMiddleware() to defineMiddleware() across codebase
    status: completed
  - id: reorganize-exports
    content: "Reorganize package.json exports: @taucad/kernels, /kernels, /middleware, /bundler, /transport, /testing"
    status: completed
  - id: simplify-ui-consumption
    content: Migrate apps/ui to new createKernelClient API with plugin factories and .on() events
    status: in_progress
  - id: update-architecture-doc
    content: Update docs/policy/kernel-architecture-policy.md with v2 entity model, layered architecture, and API tiers
    status: completed
  - id: jsdoc-eslint
    content: Install eslint-plugin-jsdoc, configure rules for packages/, add comprehensive JSDoc to all public APIs
    status: in_progress
  - id: fs-helpers
    content: Ship fromNodeFS() and fromMemoryFS() convenience constructors in @taucad/kernels
    status: completed
isProject: false
---

# Kernel API v2 Redesign

**Breaking change.** No backwards compatibility. This document is the complete specification.

## Design Principles

- **Layered architecture**: Event-driven transport at the bottom, Promise-based client at the top
- **Tree-shakeable plugins**: Import only the kernels/middleware/bundler you need
- **Node.js-compatible filesystem**: 8 required methods matching `fs.promises`, no optional surface
- **Subscribe-anytime events**: `.on(event, handler)` returns unsubscribe, framework-agnostic
- **Factory functions** (`createX`) for instances, **define functions** (`defineX`) for plugin implementations
- **Interface-first design**: All contracts are TypeScript types, implementations are injectable

---

## 1. Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  KernelClient                                               │
│  High-level, Promise-based, lazy initialization             │
│  const result = await client.render(file, params)           │
│  const off = client.on('progress', handler)                 │
├─────────────────────────────────────────────────────────────┤
│  KernelTransport                                            │
│  Low-level, event-driven, transport-agnostic                │
│  transport.send(command)                                    │
│  transport.onMessage(handler)                               │
├─────────────────────────────────────────────────────────────┤
│  KernelCommand / KernelResponse                             │
│  Typed message protocol (discriminated unions)              │
│  Portable across MessagePort, WebSocket, HTTP, native FFI   │
└─────────────────────────────────────────────────────────────┘
```

### Entity model

- **Realm**: Execution environment (main thread, Web Worker, Node.js worker_thread, remote server)
- **Transport**: Communication channel between realms (MessagePort, WebSocket, HTTP)
- **KernelClient**: High-level facade wrapping a Transport with Promises and event subscription
- **KernelRuntimeWorker**: Worker-side orchestrator (kernel selection, middleware chain, bundler)

### Why both layers

The Transport layer is the true primitive -- pure messages, zero abstraction. It maps cleanly to any communication channel and supports future cross-language kernels (Rust, C++ via FFI). The Promise overhead of the Client layer is ~1 microsecond against renders that take 100ms-10s. Both layers are exposed: most consumers use `KernelClient`, framework authors and custom transport builders use `KernelTransport` directly.

---

## 2. Plugin Factory API (Tree-Shakeable Composition)

Each built-in kernel, middleware, and bundler is a **named export factory function** that returns a plugin registration object with the resolved module URL and configuration baked in.

### Consumer API

```typescript
import { createKernelClient } from '@taucad/kernels';
import { replicad, zoo, openscad } from '@taucad/kernels/kernels';
import { parameterCache, geometryCache, gltfEdgeDetection } from '@taucad/kernels/middleware';
import { esbuild } from '@taucad/kernels/bundler';

const client = createKernelClient({
  kernels: [
    replicad({ withExceptions: true, meshConfiguration: { linearTolerance: 0.1 } }),
    zoo({ baseUrl: 'wss://my-server/v1/kernels/zoo' }),
    openscad(),
  ],
  middleware: [
    parameterCache(),
    geometryCache(),
    gltfEdgeDetection(),
  ],
  bundlers: [esbuild()],
});
```

### Plugin types

```typescript
type KernelPlugin = {
  id: string;
  moduleUrl: string;
  extensions: string[];
  detectImport?: RegExp;
  builtinModuleNames?: string[];
  options?: Record<string, unknown>;
};

type MiddlewarePlugin = {
  id: string;
  moduleUrl: string;
  config?: Record<string, unknown>;
};

type BundlerPlugin = {
  id: string;
  moduleUrl: string;
  extensions: string[];       // file types this bundler handles
  options?: Record<string, unknown>;
};
```

### Plugin factory implementation

Each factory resolves its module URL via `new URL()` relative to its own file in the built package:

```typescript
// @taucad/kernels/kernels
export function replicad(options?: ReplicadOptions): KernelPlugin {
  return {
    id: 'replicad',
    moduleUrl: new URL('../kernels/replicad/replicad.kernel.js', import.meta.url).href,
    extensions: ['ts', 'js'],
    detectImport: /import.*from\s+['"]replicad['"]/s,
    builtinModuleNames: ['replicad'],
    options,
  };
}
```

### Custom plugins

Custom kernels/middleware/bundlers use the same shape -- no special API needed:

```typescript
const client = createKernelClient({
  kernels: [
    replicad(),
    {
      id: 'my-kernel',
      moduleUrl: new URL('./my-kernel.ts', import.meta.url).href,
      extensions: ['myext'],
    },
  ],
  bundlers: [
    esbuild(),
    {
      id: 'my-python-bundler',
      moduleUrl: new URL('./python-bundler.ts', import.meta.url).href,
      extensions: ['py'],
    },
  ],
});
```

### Presets

Zero-config defaults for consumers who want everything:

```typescript
import { createKernelClient, presets } from '@taucad/kernels';

const client = createKernelClient(presets.all());

// Or: createKernelClient() defaults to presets.all()
```

### Two audiences, two define functions

- `**defineKernel()**` -- AUTHOR API. Implements a kernel (runs in the worker). Defines `createGeometry`, `getParameters`, etc.
- `**replicad()**` -- CONSUMER API. Selects a kernel (runs on the main thread). Returns a `KernelPlugin` registration object.

Same distinction applies: `defineMiddleware()` vs `parameterCache()`, `defineBundler()` vs `esbuild()`.

---

## 2.5. Multi-Bundler Support

### Problem

The current framework accepts `BundlerConfig` (array) but only ever loads ONE bundler -- `ensureLoadedBundler` short-circuits on the second call at line 739. Bundlers are language-specific (esbuild handles JS/TS, a future bundler might handle Python, WASM text, etc.), so multiple bundlers must coexist.

### Design

`**BundlerDefinition` declares its supported extensions** so it's self-describing:

```typescript
export default defineBundler({
  name: 'EsbuildBundler',
  version: '1.0.0',
  extensions: ['ts', 'js', 'tsx', 'jsx'],   // NEW: what this bundler handles
  async initialize(...) { ... },
  async bundle(...) { ... },
  // ...
});
```

**Consumer factory allows overriding extensions:**

```typescript
esbuild()                                    // default: ['ts', 'js', 'tsx', 'jsx']
esbuild({ extensions: ['ts', 'tsx'] })       // override: TypeScript only
```

### Framework routing

The framework routes all bundler operations by file extension:

- `bundle(entryPath)` -- extract extension from path, route to matching bundler
- `detectImports(entryPath)` -- same
- `resolveDependencies(entryPath)` -- same
- `execute(code)` -- use the bundler for the current file's extension (tracked per render cycle)
- `registerModule(name, entry)` -- register with ALL loaded bundlers (each bundler ignores irrelevant modules)

### Framework changes

`**[packages/kernels/src/framework/kernel-worker.ts](packages/kernels/src/framework/kernel-worker.ts)**`:

```typescript
// Before: single bundler
protected loadedBundler?: { definition: BundlerDefinition; ctx: unknown };

// After: extension -> bundler map
protected loadedBundlers = new Map<string, { definition: BundlerDefinition; ctx: unknown }>();
private pendingBundlerInits = new Map<string, { definition: BundlerDefinition; extensions: string[] }>();
```

`ensureLoadedBundler` registers each bundler for its declared extensions (no short-circuit):

```typescript
public async ensureLoadedBundler(bundlerConfig: BundlerEntry): Promise<void> {
  const mod = await import(bundlerConfig.bundlerModuleUrl);
  const definition = mod.default as BundlerDefinition;
  const extensions = bundlerConfig.extensions ?? definition.extensions;
  for (const ext of extensions) {
    this.pendingBundlerInits.set(ext, { definition, extensions });
  }
}
```

`ensureBundlerForExtension` initializes the correct bundler lazily:

```typescript
protected async ensureBundlerForExtension(ext: string): Promise<LoadedBundler> {
  const existing = this.loadedBundlers.get(ext);
  if (existing) return existing;

  const pending = this.pendingBundlerInits.get(ext);
  if (!pending) throw new Error(`No bundler registered for .${ext} files`);

  const ctx = await pending.definition.initialize({ filesystem, projectPath });
  const loaded = { definition: pending.definition, ctx };
  // Register for all extensions this bundler handles (shared context)
  for (const e of pending.extensions) {
    this.loadedBundlers.set(e, loaded);
  }
  return loaded;
}
```

`createBundlerFacade()` routes by file extension:

```typescript
bundle: async (entryPath: string): Promise<BundleResult> => {
  const ext = getFileExtension(entryPath);
  const bundler = await this.ensureBundlerForExtension(ext);
  return bundler.definition.bundle({ entryPath }, bundler.ctx);
},
```

`hasBundlerAvailable` becomes extension-aware:

```typescript
protected hasBundlerForExtension(ext: string): boolean {
  return this.loadedBundlers.has(ext) || this.pendingBundlerInits.has(ext);
}
```

### KernelRuntimeWorker changes

`**[packages/kernels/src/framework/kernel-runtime-worker.ts](packages/kernels/src/framework/kernel-runtime-worker.ts)**`: Pass 2 (bundler-assisted detection) queries `hasBundlerForExtension(extension)` instead of `hasBundlerAvailable`, and routes `detectImports` to the correct bundler for the file's extension.

### Type changes

`**[libs/types/src/types/kernel-bundler.types.ts](libs/types/src/types/kernel-bundler.types.ts)**`: Add `extensions` to `BundlerDefinition`:

```typescript
type BundlerDefinition<Context> = {
  name: string;
  version: string;
  extensions: string[];          // NEW: file types this bundler handles
  initialize(...): Promise<Context>;
  detectImports(...): Promise<DetectImportsResult>;
  bundle(...): Promise<BundleResult>;
  execute(code: string, context: Context): Promise<ExecuteResult>;
  registerModule(name: string, module: BuiltinModuleEntry, context: Context): void;
  resolveDependencies?(...): Promise<string[]>;
  cleanup?(context: Context): Promise<void>;
};
```

### Protocol: no change needed

`BundlerConfig` is already `BundlerEntry[]`. The initialize command already sends the full array. The only difference is the framework now actually loads all entries instead of just the first.

---

## 3. KernelClient API

### Factory

```typescript
import { createKernelClient } from '@taucad/kernels';

const client = createKernelClient({
  kernels: [replicad(), openscad()],
  middleware: [geometryCache(), gltfEdgeDetection()],
  bundlers: [esbuild()],
});
```

### KernelClient interface

```typescript
type KernelClient = {
  connect(options: { fileSystem: KernelFileSystem }): Promise<void>;

  render(
    file: GeometryFile,
    parameters: Record<string, unknown>,
  ): Promise<CreateGeometryResultCompleted>;

  export(
    format: ExportFormat,
    meshConfig?: { linearTolerance: number; angularTolerance: number },
  ): Promise<ExportGeometryResult>;

  notifyFileChanged(paths: string[]): void;

  on(event: 'log', handler: LogHandler): () => void;
  on(event: 'progress', handler: ProgressHandler): () => void;
  on(event: 'telemetry', handler: TelemetryHandler): () => void;
  on(event: 'parametersResolved', handler: ParametersHandler): () => void;

  terminate(): void;
};
```

### Event subscription

Events use `.on(event, handler)` which returns an unsubscribe function. Subscribable at any time during the client lifecycle, works naturally with React's `useEffect`:

```tsx
function CadViewer({ client }: { client: KernelClient }) {
  const [phase, setPhase] = useState<string>();

  useEffect(() => {
    return client.on('progress', (p) => setPhase(p));
  }, [client]);
}
```

No config-time event binding. No framework-specific packages needed.

### Lifecycle

1. `createKernelClient(options)` -- returns client, no Worker created yet
2. `client.connect({ fileSystem })` -- creates Worker + Transport, initializes protocol
3. `client.render(file, params)` -- auto-connects if not yet connected (lazy)
4. `client.on('event', handler)` -- subscribable at any time, returns unsubscribe
5. `client.terminate()` -- terminates Worker, cleans up

---

## 4. Remove canHandle from Public API

The current flow has an unnecessary main-thread ↔ worker round-trip:

```
main ──canHandle──> worker ──bool──> main ──render──> worker ──geometry──> main
```

After: `render()` handles kernel selection internally. If no kernel matches, the render result carries the error:

```typescript
const result = await client.render(file, params);
if (!result.success) {
  // result.issues contains "No kernel can handle file: main.xyz"
}
```

### Changes

- `**[libs/types/src/types/kernel-protocol.types.ts](libs/types/src/types/kernel-protocol.types.ts)**`: Remove `canHandle` command and `canHandleResult` response
- `**[packages/kernels/src/framework/kernel-worker-client.ts](packages/kernels/src/framework/kernel-worker-client.ts)**`: Remove `canHandle()` method and `pendingCanHandle` state
- `**[packages/kernels/src/framework/kernel-worker-dispatcher.ts](packages/kernels/src/framework/kernel-worker-dispatcher.ts)**`: Remove `canHandle` case
- `**[packages/kernels/src/framework/kernel-worker.ts](packages/kernels/src/framework/kernel-worker.ts)**`: Modify `renderEntry` to return `{ success: false, issues: [...] }` when no kernel matches
- `**[apps/ui/app/machines/kernel.machine.ts](apps/ui/app/machines/kernel.machine.ts)**`: Remove the `canHandle` call before `render`

The `canHandle` method remains **internal** to `KernelRuntimeWorker` for kernel selection logic.

---

## 5. KernelFileSystem (Node.js-Compatible Primitives)

### Design rationale

8 required methods. All map directly to `fs.promises.`*. No optional methods. The framework builds all higher-level operations internally from these primitives.

MessagePort performance is not a concern for batch operations: `Promise.all(paths.map(readFile))` pipelines through the port concurrently (all messages sent in microseconds, responses processed as they arrive). Total time is bounded by the longest individual operation, not the sum.

### Interface

```typescript
type KernelFileSystem = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
  stat(path: string): Promise<{ type: 'file' | 'dir'; size: number; mtimeMs: number }>;
  exists(path: string): Promise<boolean>;
};
```

### Why each method is required

- **readFile** -- every kernel reads source files; core operation
- **writeFile** -- middleware writes cache, bundler writes CDN modules; core operation
- **mkdir** -- framework builds `ensureDirectoryExists(path)` as `mkdir(path, { recursive: true })`; Node.js primitive, replaces the old `ensureDirectoryExists` method
- **readdir** -- OpenSCAD include resolution, cache eviction, directory hashing; Node.js primitive
- **unlink** -- geometry cache eviction deletes old entries; Node.js primitive
- **stat** -- framework builds `getDirectoryStat` from `readdir` + `stat`; needed for dependency tracking
- **exists** -- most called FS method in the kernel (~30+ call sites), trivially cheap, boolean payload; earns its place despite being derivable from `stat`

### What the framework builds internally

```
ensureDirectoryExists(path)  → mkdir(path, { recursive: true })
readFiles(paths)             → Promise.all(paths.map(readFile))
getDirectoryContents(dir)    → readdir(dir) + Promise.all(names.map(readFile))
getDirectoryStat(dir)        → readdir(dir) + Promise.all(names.map(stat))
batchExists(paths)           → Promise.all(paths.map(exists))
```

### Convenience constructors

```typescript
import { fromNodeFS, fromMemoryFS } from '@taucad/kernels';

// Node.js: wraps fs.promises in 10 lines
const fileSystem = fromNodeFS('/path/to/project');

// In-memory: Map-backed, ~15 lines
const fileSystem = fromMemoryFS({
  'main.ts': 'import { draw } from "replicad"; ...',
  'lib/utils.ts': 'export function helper() { ... }',
});

await client.connect({ fileSystem });
```

### MessagePort bridge changes

`[packages/kernels/src/framework/kernel-worker-filemanager-bridge.ts](packages/kernels/src/framework/kernel-worker-filemanager-bridge.ts)` is refactored to proxy only the 8 `KernelFileSystem` methods. The 12+ extra methods (`rename`, `rmdir`, `copyDirectory`, `getZippedDirectory`, `reconfigure`, `setDirectoryHandle`, `readBackendFileTree`, etc.) are removed -- they were app-level operations that leaked into the kernel contract.

---

## 6. Transport Abstraction

### KernelTransport interface

```typescript
type KernelTransport = {
  send(message: KernelCommand, transferables?: Transferable[]): void;
  onMessage(handler: (message: KernelResponse) => void): void;
  close(): void;
};
```

### Built-in: WorkerTransport

```typescript
function createWorkerTransport(workerUrl: string): KernelTransport;
```

- Internally creates `new Worker(workerUrl, { type: 'module' })`
- Wraps `postMessage`/`addEventListener` as `KernelTransport`
- The existing `KernelMessagePort` adapter becomes an implementation detail of this transport

### Advanced usage

```typescript
import { createKernelClient } from '@taucad/kernels';
import { createWorkerTransport } from '@taucad/kernels/transport';

const transport = createWorkerTransport(myCustomWorkerUrl);
const client = createKernelClient({ transport, kernels: [...] });
```

### Future transports (not implemented now, but the interface supports them)

```typescript
// WebSocket transport for remote kernel servers
function createWebSocketTransport(url: string): KernelTransport;

// HTTP + SSE transport for serverless kernel endpoints
function createHttpTransport(endpoint: string): KernelTransport;
```

### Files

- `[packages/kernels/src/transport/kernel-transport.ts](packages/kernels/src/transport/kernel-transport.ts)` (new) -- `KernelTransport` type
- `[packages/kernels/src/transport/worker-transport.ts](packages/kernels/src/transport/worker-transport.ts)` (new) -- `createWorkerTransport()`
- Refactor `[packages/kernels/src/framework/kernel-worker-client.ts](packages/kernels/src/framework/kernel-worker-client.ts)` to accept `KernelTransport` instead of raw `Worker`

---

## 7. Package Exports

### Reorganized subpath exports

```
@taucad/kernels                -- createKernelClient, presets, defineKernel, defineBundler,
                                  fromNodeFS, fromMemoryFS, KernelClient type, KernelFileSystem type
@taucad/kernels/kernels        -- replicad(), zoo(), openscad(), jscad(), tau() plugin factories
@taucad/kernels/middleware     -- defineMiddleware(), parameterCache(), geometryCache(),
                                  gltfCoordinateTransform(), gltfEdgeDetection() plugin factories
@taucad/kernels/bundler        -- defineBundler(), esbuild() plugin factory
@taucad/kernels/transport      -- KernelTransport type, createWorkerTransport()
@taucad/kernels/testing        -- createTestWorker, mocks, geometry helpers
```

### Naming changes

- `createKernelMiddleware()` → `defineMiddleware()` (aligns with `defineKernel`/`defineBundler`)
- `createDefaultConfig()` → removed from public API (internal to `createKernelClient`)
- `KernelFileManager` → `KernelFileSystem` (8 methods, Node.js-compatible)
- `createFileManagerPort()` → internal (handled by `client.connect()`)
- `KernelWorkerClient` → still exported from `@taucad/kernels/transport` for advanced use

---

## 8. UI App Migration

### Before (current)

```typescript
// kernel-worker.constants.ts -- 5 separate exports
import { createDefaultConfig } from '@taucad/kernels';
const baseConfig = createDefaultConfig({ ... });
export const defaultKernelConfig = baseConfig.kernelConfig;
export const debugKernelConfig = defaultKernelConfig.map(...);
export const defaultMiddlewareConfig = baseConfig.middlewareConfig;
export const defaultBundlerConfig = baseConfig.bundlerConfig;
export const runtimeWorkerUrl = baseConfig.workerUrl;

// kernel.machine.ts -- manual Worker creation, canHandle round-trip
const rawWorker = new Worker(runtimeWorkerUrl, { type: 'module' });
const client = new KernelWorkerClient(rawWorker, onLog, onTelemetry);
const port = createFileManagerPort(wrappedFileManager);
await client.initialize({ kernelModules, bundlerConfig }, port, middlewareConfig, bundlerConfig);
const canHandle = await client.canHandle(file);
if (!canHandle) { /* error handling */ }
const result = await client.render(file, params, onParametersResolved, onProgress);
```

### After (v2)

```typescript
// kernel-worker.constants.ts -- single export
import { replicad, zoo, openscad, jscad, tau } from '@taucad/kernels/kernels';
import { parameterCache, geometryCache, gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/kernels/middleware';
import { esbuild } from '@taucad/kernels/bundler';

export const defaultKernelConfig = {
  kernels: [
    openscad(),
    zoo({ baseUrl: `${ENV.TAU_WEBSOCKET_URL}/v1/kernels/zoo` }),
    replicad({ withExceptions: false, meshConfiguration: { linearTolerance: 0.1, angularTolerance: 0.1 } }),
    jscad(),
    tau(),
  ],
  middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
  bundlers: [esbuild()],
};

export const debugKernelConfig = {
  ...defaultKernelConfig,
  kernels: defaultKernelConfig.kernels.map(k =>
    k.id === 'replicad' ? replicad({ withExceptions: true }) : k
  ),
};

// kernel.machine.ts -- simple client usage
const client = createKernelClient(context.kernelConfig);

const off1 = client.on('log', (entry) => parentRef.send({ type: 'kernelLog', ...entry }));
const off2 = client.on('progress', (phase) => parentRef.send({ type: 'kernelProgress', phase }));
const off3 = client.on('telemetry', (entries) => parentRef.send({ type: 'kernelTelemetry', entries }));
const off4 = client.on('parametersResolved', (result) => parentRef.send({ type: 'parametersParsed', ...result }));

await client.connect({ fileSystem: wrappedFileManager });

// No canHandle call -- render returns error result if no kernel matches
const result = await client.render(file, parameters);

// Cleanup
off1(); off2(); off3(); off4();
client.terminate();
```

---

## 9. No Bundler Plugins for 3rd-Party Consumers

For the pre-built npm package, `new URL('./path.js', import.meta.url)` resolves correctly in Webpack 5, Rollup, Vite production builds, and esbuild.

The only edge case is **Vite's dev server** `optimizeDeps` pre-bundling. The fix is one config line (not a plugin):

```typescript
// Consumer's vite.config.ts
optimizeDeps: { exclude: ['@taucad/kernels'] }
```

This is the same standard practice used by sql.js, ffmpeg.wasm, and Monaco Editor. Documented in the package README.

### Internal monorepo

Keep the existing `tsModuleUrlPlugin` in `[apps/ui/vite.config.ts](apps/ui/vite.config.ts)` for raw TypeScript consumption. Internal-only.

### Future: self-contained worker bundle

Update build config to produce a self-contained worker bundle (all kernel/middleware/bundler JS inlined, WASM loaded lazily). Reduces `new URL()` references to just ONE (the worker file). Follow-up task.

---

## 10. Documentation

### `[docs/library-api-best-practices.md](docs/library-api-best-practices.md)` (new)

Distilled from Clerk JS codebase analysis:

- Factory functions (`createX`) for instances, define functions (`defineX`) for plugin implementations
- Flat options with defaults and merging (no deep nesting)
- Subpath exports organized by consumer role
- `.on(event, handler)` returns unsubscribe for framework-agnostic event subscription
- Public-only JSDoc with `@example`, `@internal`, `@deprecated` tags
- TypeScript-first: comprehensive generics, separate type exports
- Lazy initialization for expensive resources
- High-level wrappers with lower-level escape hatches
- Environment-aware conditional exports (`browser`/`node`/`worker` conditions)
- Plugin factories return plain objects, not class instances
- No optional interface methods -- all required, framework builds higher-level ops internally

### `[docs/policy/kernel-architecture-policy.md](docs/policy/kernel-architecture-policy.md)` (update)

Update entity model for v2:

- **KernelClient** -- High-level facade. Lazy, Promise-based, event-subscribable. What consumers use.
- **KernelTransport** -- Event-driven message channel. What custom transport authors implement.
- **KernelWorkerClient** -- Protocol client that wraps a Transport with request/response correlation. Advanced API.
- **KernelRuntimeWorker** -- Worker-side orchestrator. Kernel selection, middleware chain, bundler management.
- **KernelFileSystem** -- 8-method Node.js-compatible filesystem interface. What consumers implement or use helpers for.
- **KernelDefinition** -- Kernel plugin contract (`defineKernel`). Implemented by kernel authors.
- **BundlerDefinition** -- Bundler plugin contract (`defineBundler`). Implemented by bundler authors.
- **KernelMiddleware** -- Middleware plugin contract (`defineMiddleware`). Implemented by middleware authors.
- **KernelPlugin / MiddlewarePlugin / BundlerPlugin** -- Registration objects returned by factory functions. Used by consumers to select plugins.
- **KernelRuntime** -- Services injected into kernel methods (filesystem, logger, bundler, tracer). Internal.

---

## 11. JSDoc Enforcement

### ESLint configuration

Add `eslint-plugin-jsdoc` for `packages/`:

```typescript
// eslint.config.mjs -- add to packages section
{
  files: ['packages/**/*.ts'],
  ignores: ['packages/**/*.{spec,test,config,setup}.ts'],
  rules: {
    'jsdoc/require-jsdoc': ['error', {
      publicOnly: true,
      require: {
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
      },
      contexts: ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'],
    }],
    'jsdoc/require-description': 'error',
    'jsdoc/require-param-description': 'error',
    'jsdoc/require-returns-description': 'error',
    'jsdoc/check-tag-names': ['error', { definedTags: ['internal', 'example'] }],
  },
}
```

### JSDoc standards

Every public export must include:

- A description (1-2 sentences explaining purpose)
- `@param` with description for each parameter
- `@returns` with description
- `@example` for factory functions and key utilities
- `@internal` for framework-only APIs
- `@deprecated` with migration path for deprecated APIs

### Installation

```bash
pnpm install -d eslint-plugin-jsdoc
```

---

## 12. Complete Type Reference

### Consumer-facing types (exported from `@taucad/kernels`)

```typescript
// Client
type KernelClient = {
  connect(options: { fileSystem: KernelFileSystem }): Promise<void>;
  render(file: GeometryFile, parameters: Record<string, unknown>): Promise<CreateGeometryResultCompleted>;
  export(format: ExportFormat, meshConfig?: MeshConfig): Promise<ExportGeometryResult>;
  notifyFileChanged(paths: string[]): void;
  on(event: 'log', handler: LogHandler): () => void;
  on(event: 'progress', handler: ProgressHandler): () => void;
  on(event: 'telemetry', handler: TelemetryHandler): () => void;
  on(event: 'parametersResolved', handler: ParametersHandler): () => void;
  terminate(): void;
};

// Filesystem
type KernelFileSystem = {
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
  stat(path: string): Promise<{ type: 'file' | 'dir'; size: number; mtimeMs: number }>;
  exists(path: string): Promise<boolean>;
};

// Plugin registration (returned by factory functions)
type KernelPlugin = {
  id: string;
  moduleUrl: string;
  extensions: string[];
  detectImport?: RegExp;
  builtinModuleNames?: string[];
  options?: Record<string, unknown>;
};

type MiddlewarePlugin = {
  id: string;
  moduleUrl: string;
  config?: Record<string, unknown>;
};

type BundlerPlugin = {
  id: string;
  moduleUrl: string;
  extensions: string[];       // file types this bundler handles
  options?: Record<string, unknown>;
};

// Client options
type KernelClientOptions = {
  kernels: KernelPlugin[];
  middleware?: MiddlewarePlugin[];
  bundlers?: BundlerPlugin[];
  transport?: KernelTransport;
};
```

### Transport types (exported from `@taucad/kernels/transport`)

```typescript
type KernelTransport = {
  send(message: KernelCommand, transferables?: Transferable[]): void;
  onMessage(handler: (message: KernelResponse) => void): void;
  close(): void;
};
```

### Plugin author types (exported from `@taucad/kernels`)

```typescript
// defineKernel() -- kernel implementation contract
type KernelDefinition<Context, NativeHandle> = {
  name: string;
  version: string;
  initialize(options: Record<string, unknown>, runtime: KernelRuntime): Promise<Context>;
  getDependencies(input: GetDependenciesInput, runtime: KernelRuntime, context: Context): Promise<string[]>;
  getParameters(input: GetParametersInput, runtime: KernelRuntime, context: Context): Promise<GetParametersResult>;
  createGeometry(input: CreateGeometryInput, runtime: KernelRuntime, context: Context): Promise<CreateGeometryOutput<NativeHandle>>;
  exportGeometry(input: ExportGeometryInput, runtime: KernelRuntime, context: Context, nativeHandle: NativeHandle): Promise<ExportGeometryResult>;
  canHandle?(input: CanHandleInput, runtime: KernelRuntime, context: Context): Promise<boolean>;
  cleanup?(context: Context): Promise<void>;
};

// defineMiddleware() -- middleware implementation contract
type KernelMiddleware = {
  name: string;
  version?: string;
  enabled?: boolean;
  stateSchema?: ZodObject;
  configSchema?: ZodObject;
  wrapCreateGeometry?: WrapCreateGeometryHook;
  wrapExportGeometry?: WrapExportGeometryHook;
  wrapGetParameters?: WrapGetParametersHook;
};

// defineBundler() -- bundler implementation contract
type BundlerDefinition<Context> = {
  name: string;
  version: string;
  extensions: string[];       // file types this bundler handles (e.g., ['ts', 'js', 'tsx', 'jsx'])
  initialize(options: BundlerInitOptions): Promise<Context>;
  detectImports(input: BundleInput, context: Context): Promise<DetectImportsResult>;
  bundle(input: BundleInput, context: Context): Promise<BundleResult>;
  execute(code: string, context: Context): Promise<ExecuteResult>;
  registerModule(name: string, module: BuiltinModuleEntry, context: Context): void;
  resolveDependencies?(input: BundleInput, context: Context): Promise<string[]>;
  cleanup?(context: Context): Promise<void>;
};
```

