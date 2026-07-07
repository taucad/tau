# Kernel-Editor Reactive Architecture

## Status

**Reference** -- documents the reactive integration between the filesystem layer, kernel workers, and the editor UI. Companion to [runtime-topology.md](runtime-topology.md) (autonomous render service) and [filesystem-policy.md](../policy/filesystem-policy.md) (implementation rules).

---

## System Overview

Three runtime contexts collaborate to turn user code into 3D geometry:

```
┌────────────────────────────────────┐
│ Main Thread                        │
│  Editor (Monaco) ─── writes ──▶   │
│  Parameters UI   ─── setParams ──▶│
│  Three.js viewport ◀── geometry   │
│  cadMachine (display state)        │
│  projectMachine (geometry units)  │
└──────────┬──────────┬──────────────┘
           │          │
   MessagePort   MessagePort
           │          │
┌──────────▼──┐  ┌────▼─────────────┐
│ File Manager │  │ Kernel Worker    │
│ Worker       │  │ (per comp. unit) │
│              │  │                  │
│ Workspace FS │◀─│ watch() ──────── │
│ Providers    │  │ render loop      │
│ EventBus     │──│ ──▶ push geometry│
└──────────────┘  └──────────────────┘
```

**File Manager Worker**: single instance hosting `WorkspaceFileService`, `ProviderRegistry`, `ResourceQueue`, `InMemoryFileTree`, and `ChangeEventBus`. Owns mounted browser filesystem access. Serves both the main thread and kernel workers via the bridge protocol.

**Kernel Worker**: one per geometry unit. Runs bundler (esbuild), executes user code, computes geometry, tessellates, and pushes results. Watches its dependency graph via the filesystem bridge.

**Main Thread**: display and user input only. No render orchestration, no dependency tracking, no cache management.

---

## Two Watch Planes

File changes flow through two independent watch planes, each optimized for its consumer:

### Kernel fast path (dependency-scoped)

```
FileService mutation
  → ChangeEventBus.emit()
  → Watch router: normalize → coalesce → filter (by dependency set)
  → Kernel worker handler: invalidate caches, schedule re-render
  → Worker pushes geometryComputed to main thread
```

- Scoped to the kernel's known dependency set (esbuild metafile inputs, SCAD imports, KCL imports)
- Excludes `.tau/cache/**` to avoid self-churn
- Sub-25ms p95 event-to-invalidation latency target
- No main thread involvement

### UI tree path (directory-scoped)

```
FileService mutation
  → ChangeEventBus.emit()
  → Watch router: normalize → coalesce → filter (by watched directories)
  → File manager machine: incremental tree patch
  → React re-render of file explorer
```

- Scoped to directories the user has expanded in the file explorer
- Sub-75ms p95 event-to-patch latency target
- Incremental: only the affected parent directory is re-read

---

## Watch Request Contract

```typescript
type WatchRequest = {
  paths: string[];
  recursive?: boolean;
  includes?: string[];
  excludes?: string[];
  filter?: WatchEventFilter;
  correlationId?: string;
};

type WatchEventFilter = {
  added?: boolean;
  updated?: boolean;
  deleted?: boolean;
  renamed?: boolean;
};

type WatchEvent =
  | { type: 'change'; path: string; correlationId?: string }
  | { type: 'delete'; path: string; correlationId?: string }
  | { type: 'rename'; oldPath: string; newPath: string; correlationId?: string }
  | { type: 'reset'; correlationId?: string }
  | { type: 'overflow'; correlationId?: string };
```

## Event Pipeline

Worker-side, before delivery to subscribers:

1. **Normalize**: canonical absolute paths, separator normalization, duplicate slash removal
2. **Coalesce**: within ~50ms window -- `added→deleted` cancels, `deleted→added` collapses to `updated`, parent delete suppresses child spam, rename emits old/new semantics
3. **Filter**: by path scope (exact or recursive), include/exclude globs, event type mask
4. **Deliver**: only matched events to subscribed ports with correlation IDs

---

## Kernel Rendering Lifecycle

```
1. initialize(options, fileSystemPort)
   → load WASM, configure bundler, set up bridge proxy

2. setFile(file, params)
   → store entry file + parameters
   → render() immediately
   → discover dependencies from bundler metafile
   → watch(dependencies) via filesystem bridge

3. watch event (dependency changed)
   → invalidate fileHashCache, fileContentCache, bundleResultCache
   → schedule debounced re-render (500ms)

4. debounce timer fires
   → render()
   → diff dependency set: add new, remove stale, keep unchanged
   → push geometryComputed to main thread

5. setParameters(params)
   → store new parameters
   → schedule debounced re-render (50ms)

6. export(format)
   → export from last native handle
   → push exported blob
```

### Dependency graphs by kernel

| Kernel      | Dependency source                                         | Shape            |
| ----------- | --------------------------------------------------------- | ---------------- |
| Replicad    | esbuild metafile `inputs`                                 | Deep import tree |
| JSCAD       | esbuild metafile `inputs`                                 | Deep import tree |
| Manifold    | esbuild metafile `inputs`                                 | Deep import tree |
| OpenCascade | esbuild metafile `inputs`                                 | Deep import tree |
| OpenSCAD    | `use`/`include` regex via `getReferencedScadFiles()`      | `.scad` tree     |
| Zoo/KCL     | KCL AST import resolution via `discoverKclDependencies()` | `.kcl` tree      |
| Tau         | Main file + siblings via `readdir(directory)`             | Star             |

---

## Incremental Tree Model

### Startup hydration

On project load, `getDirectoryStat(projectRoot)` provides a one-time recursive snapshot for the initial file explorer state. This is the only permitted full recursive scan.

### Post-startup incremental updates

All post-startup tree changes flow through the watch system:

1. File mutation → `ChangeEventBus` emits `fileWritten`/`fileDeleted`/`fileRenamed`/`directoryChanged`
2. Tree watcher receives event, re-reads only the parent directory via `readDirectory(parentPath)`
3. `DirectoryTreeCache` stores per-directory entry maps, patched incrementally
4. File explorer React tree is updated with minimal re-render

No mutation-triggered full recursive tree scans.

---

## Compilation Unit Lifecycle

A geometry unit is a single `cadMachine` actor managing one runtime worker for one entry file:

```
projectMachine spawns cadMachine(entryFile, kernelType)
  → cadMachine enters 'connecting' state
  → creates RuntimeClient, connects to runtime worker
  → sends setFile(entryFile, initialParams)
  → transitions to 'idle'

  [worker pushes stateChanged('rendering')]
  → cadMachine transitions to 'rendering'

  [worker pushes geometryComputed]
  → cadMachine updates Three.js scene, transitions to 'idle'

  [worker pushes error]
  → cadMachine transitions to 'error', shows diagnostics

  [user changes entry file]
  → cadMachine sends setFile(newFile)

  [build closes]
  → cadMachine disposes RuntimeClient
  → worker terminates, all watches cleaned up
```

---

## Overflow/Resync Protocol

When the event pipeline detects event loss (queue overflow, backend reset):

1. Emit `{ type: 'overflow' }` or `{ type: 'reset' }` to all affected subscribers
2. **Kernel consumers**: clear all dependency caches, set flag for fresh dependency pass on next render
3. **Tree consumers**: trigger targeted parent/subtree rescan (not blind full tree)

No silent event drop is permitted. Every dropped event must trigger an explicit resync.

---

## Comparison to Prior Art

### Vite HMR

| Concept          | Vite                          | Tau                                      |
| ---------------- | ----------------------------- | ---------------------------------------- |
| File watcher     | chokidar (OS-level)           | `FileService.watch()` (VFS-level)        |
| Dependency graph | Module graph                  | esbuild metafile + kernel resolvers      |
| Change detection | Watcher + module invalidation | Watch subscription scoped to deps        |
| Debounce         | HMR batching                  | Worker-internal 500ms/50ms timers        |
| Rebuild trigger  | HMR update pushed to browser  | `geometryComputed` pushed to main thread |

### VS Code Watcher Architecture

| Concept            | VS Code                                  | Tau                                    |
| ------------------ | ---------------------------------------- | -------------------------------------- |
| Watch dedup        | Ref-counted `activeWatchers`             | Request hash → ref-counted registry    |
| Event coalescing   | `EventCoalescer`                         | Normalize → coalesce → filter pipeline |
| Session management | `sessionId` + per-watch `req` UUID       | `correlationId` + per-port ownership   |
| Overflow handling  | Throttled workers + restart/suspend      | Explicit overflow event + resync       |
| Two event planes   | `onDidChangeFile` vs `onDidRunOperation` | Kernel fast path vs UI tree path       |
