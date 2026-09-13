---
title: 'Monaco TypeScript IntelliSense Reliability Investigation'
description: 'Root-cause investigation of flaky Monaco TS IntelliSense, race conditions in model lifecycle and FS sync, comparison with VS Code Web tsserver, and recommended remediation.'
status: draft
created: '2026-05-07'
updated: '2026-05-07'
category: investigation
related:
  - docs/policy/filesystem-policy.md
---

# Monaco TypeScript IntelliSense Reliability Investigation

Root-cause analysis of intermittent "Cannot find module" / missing-IntelliSense
failures in the Monaco editor inside `apps/ui`, with a side-by-side comparison
to VS Code Web's tsserver integration and a prioritised remediation plan.

## Executive Summary

The reproducible smoking gun is that **Tau's Monaco TypeScript stack only ever
sees JS/TS files that have been explicitly preloaded as `monaco.editor`
models** — the standalone `ts.worker` has no filesystem access of its own.
Tau's preloader (`MonacoModelService.syncAllInBackground`) walks
`treeService.getTreeSnapshot()` once at session start and treats it as the
authoritative file list, but the `FileTreeService` snapshot is **lazy**: it
only contains directories that the file tree component has explicitly
expanded via `listDirectory(path)`. So any subdirectory the user has not
expanded (e.g. `lib/`) and is not on the active-file ancestor chain never
gets walked — the files inside it never become Monaco models, and TS reports
`Cannot find module './lib/head'` (TS2307) on imports even though the files
exist on disk and in the worker-side filesystem index.

Around that core defect sit a cluster of secondary races (no re-sync when
the tree later grows, `'read'` content events ignored by the model service,
`syncBackgroundFile` clobbering editor-held content, session-switch effect
ordering) that turn the bug into "flaky" instead of "always broken".

The recommended fix is two-tiered:

- **Short-term** (P0): Drive the preloader off the worker-side **complete**
  filesystem index (`proxy.getDirectoryStat('')`) instead of the lazy main-
  thread tree snapshot, and subscribe to subsequent tree growth so newly-
  discovered JS files get models too.
- **Long-term** (P2): Adopt VS Code Web's architecturally correct pattern —
  give the TS worker a `serverHost` shim that exposes
  `readFile`/`fileExists`/`directoryExists`/`getDirectories`/`readDirectory`
  back into the main-thread `FileTreeService`/`FileContentService`, so the
  TS language service can resolve modules by walking the FS itself instead
  of relying on every file being preloaded as a model.

## Problem Statement

Users see intermittent failures of TS IntelliSense in the chat editor:

- `Cannot find module './lib/head' or its corresponding type declarations.
(2307)` on relative imports (img 3 in the bug report) even when
  `lib/head.ts` exists on disk and is referenced by an open `main.ts`.
- Hover/go-to-definition/auto-import sometimes work and sometimes do not,
  depending on which directories the user has expanded in the file tree.
- Errors persist until the user manually opens the imported file in a tab,
  at which point IntelliSense recovers — strongly suggesting "the model
  doesn't exist yet" rather than "TS got the wrong content".

The user's hypothesis ("models are not opened when they do not have a tab
open") is correct, and explains the flakiness: whether IntelliSense works
depends on whether some other code path has already created Monaco models
for the imported files — typically because the user expanded the directory
in the file tree at some point.

## Methodology

1. Read the full Monaco integration layer in `apps/ui/app/lib/`:
   `monaco.lib.ts`, `monaco-model-service.ts`, `type-acquisition-service.ts`,
   `monaco-language-registry.ts`, `javascript-contribution.ts`,
   `javascript-module-resolver.ts`, plus consumer wiring in
   `code-editor.client.tsx`, `chat-editor-dockview.tsx`,
   `chat-editor-file-tree.tsx`, and the
   `MonacoModelServiceProvider` in `use-monaco-model-service.tsx`.
2. Read the filesystem layer in `packages/fs-client/`:
   `file-tree-service.ts`, `file-content-service.ts`, and the worker change
   channel.
3. Cross-reference VS Code's TypeScript language extension at
   `repos/vscode/extensions/typescript-language-features/`:
   `web/src/serverHost.ts`, `src/tsServer/bufferSyncSupport.ts`, and
   `src/filesystems/{ata,memFs,autoInstallerFs}.ts`.
4. Trace the data flow that fires when the agent / user / worker writes a
   file (`FileContentService.write` → `notifyGlobalSubscribers` →
   `MonacoModelService.handleContentChange`) and the model creation paths
   (`acquireModel`, `syncBackgroundFile`, `applyWritten`).
5. Map the TS worker's view of the world: monaco's
   `setEagerModelSync(true)` mirrors `monaco.editor.getModels()` content
   into the worker; the standalone TS worker has no `readFile`/
   `directoryExists` host methods, so anything not in `getModels()` is
   invisible to the language service.

## Architecture Overview

### Tau's Monaco TS pipeline (today)

```
Browser main thread                       │  monaco TS worker (Web Worker)
                                          │
File tree component ── listDirectory ──┐  │
                                       ▼  │
                          FileTreeService  │
                                   │       │
                       (lazy `_tree` Map)  │
                                   │       │
                                   ▼       │
   MonacoModelService.syncAllInBackground  │
   ── tree.values().filter(isJsLikeFile) ──┐
                                           │
                            createModel ───┼──► setEagerModelSync mirrors
   acquireModel(path) (when tab opens) ────┤    every Monaco model into the
                                           │    worker.
   FileContentService.onDidContentChange ──┤
   ── 'written' / 'batchWritten' / etc ────┘    NO filesystem access here.
                                                Modules resolved against
                                                in-worker model set ONLY.
```

Models for `kernel-prompt-configs/replicad`'s built-in types and external
package types are layered on via `monaco.typescript.typescriptDefaults
.addExtraLib(content, file:///node_modules/<pkg>/index.d.ts)` from
`TypeAcquisitionService` (`apps/ui/app/lib/type-acquisition-service.ts`).

### VS Code Web's TS pipeline (reference)

```
Browser main thread (extension host)     │  tsserver web worker (TS LSP)
                                         │
TextDocumentManager (open buffers)       │  serverHost = {
   ── didOpen / didChange / didClose ───►│    readFile, writeFile, fileExists,
   bufferSyncSupport.ts batches them     │    directoryExists, getDirectories,
                                         │    readDirectory, getModifiedTime,
ApiClient (vscode-sync-api) ◄────────────┤    realpath, watchFile, ...
   └── proxies ALL FS reads through      │  }   (web/src/serverHost.ts)
       vscode.workspace.fs synchronously │
       via SharedArrayBuffer.            │  tsserver runs its own module
                                         │  resolution by traversing this
                                         │  host — never assumes preloaded
                                         │  buffers, only diffs them in.
```

Two crucial differences:

1. **VS Code Web's TS worker has FS access.** Files only need to be opened
   as a buffer when the user is _editing_ them. tsserver discovers
   imports by doing real `readFile`/`directoryExists`/`readDirectory`
   walks against the workspace FS.
2. **VS Code only opens what the user is editing as a buffer.** All other
   files are read on demand by tsserver. There is no "warm every JS file
   in the project as a buffer" preloader, because there doesn't need to be.

Tau's standalone monaco `ts.worker` (`monaco-editor/esm/vs/language/
typescript/ts.worker`) does **not** carry the VS Code `serverHost`. It
synthesises a host from the live `monaco.editor` model set. So Tau's
"preload everything" strategy is the only available substitute — and it has
to be airtight to behave like VS Code, but currently isn't.

## Findings

### Finding 1 (smoking gun): The preloader walks a lazy tree snapshot, not the workspace

`MonacoModelService.startBackgroundSync` (`apps/ui/app/lib/monaco-model
-service.ts`, lines 396–455) reads the tree exactly once:

```400:421:apps/ui/app/lib/monaco-model-service.ts
  private async syncAllInBackground(): Promise<void> {
    if (!this.treeService || !this.monaco) {
      return;
    }

    const capturedEpoch = this.epoch;
    const signal = this.abortController?.signal;

    try {
      const tree = this.treeService.getTreeSnapshot();

      if (this.epoch !== capturedEpoch || signal?.aborted) {
        return;
      }

      const jsFiles = [...tree.values()].filter(
        (entry) => entry.type === 'file' && isJsLikeFile(entry.path) && !entry.path.includes('node_modules'),
      );
```

`treeService.getTreeSnapshot()` returns the backing `_tree: Map<string,
FileEntry>` (`packages/fs-client/src/file-tree-service.ts` line 157). That
map is populated **only** by explicit `listDirectory(path)` calls — there
is no recursive walk anywhere in `FileTreeService` that fills it eagerly.

Concretely, on a fresh project load:

- `FileTreeService` is constructed; `_tree` is empty.
- The file-tree component (`chat-editor-file-tree.tsx`, line 307) seeds
  expansion with just `[rootId]`, then calls `listDirectory('')` on the
  root, populating top-level entries. Subdirectories are loaded lazily as
  the user expands them (line 323) or when the active file's ancestor
  chain triggers them (line 378 `useEffect`).
- `MonacoModelServiceProvider` initialises `MonacoModelService`, which
  calls `syncAllInBackground` immediately (line 104).
- `syncAllInBackground` sees only the root-level entries — for the
  reproduction in img 3, that means `main.ts` and the `lib/` directory
  itself, but **not** any files inside `lib/`.
- `setEagerModelSync(true)` mirrors `main.ts` into the TS worker. The TS
  worker tries to resolve `./lib/head` against its model set, finds
  nothing, and emits TS2307.

This is the dominant root cause of img 3.

### Finding 2: No re-sync when the tree grows after init

Even after the user later expands `lib/` (which calls
`treeService.listDirectory('lib')` and populates `_tree` with `lib/head.ts`,
`lib/handle.ts`), **no code path re-runs `syncAllInBackground`**.
`MonacoModelService` only subscribes to `FileContentService.onDidContent
Change` (line 94) — never to `FileTreeService` listing changes. There is
no `treeService.subscribePath` listener in the model service.

So:

- A user who expands the directory in the tree gets the children loaded
  into the tree but **still no Monaco models** for those files.
- The error remains until the user actually opens `lib/head.ts` in a tab
  (which calls `acquireModel`), or until something writes to the file
  (which goes through `applyWritten`).

### Finding 3: `'read'` content events drop new files on the floor

`FileContentService` distinguishes two notify shapes for new content:

- `'written'` — emitted by `write()`, `writeFiles()`, including
  agent / chat-tool writes.
- `'read'` — emitted by `refreshOutcomeInPlace()` (worker-driven
  external writes that Tau's tab is subscribed to) and by `computeOutcome`
  on a fresh resolve (`apps/ui/app/lib/...` line 633 / 662).

`MonacoModelService.handleContentChange` (lines 274–339) handles
`'written'`/`'batchWritten'`/`'deleted'`/`'renamed'` but **silently
ignores `'read'`** (line 335 `case 'read': { break; }`). Combined with
Finding 1, this means even when something successfully reads
`lib/head.ts` from disk and emits a `'read'` event, no model is created.

`FileContentService.onWorkerFileWritten` makes this worse: it short-
circuits via `shouldRefreshWorkerPath()` (line 583), which only refreshes
if the path is already tracked (`outcomes.has || cache.has ||
hasPathSubscribers`). So a worker-driven external file write (other tab,
runtime worker writing a new file) never reaches `MonacoModelService`
unless something on the main thread is already watching that path.

### Finding 4: Background sync clobbers editor-held content

`syncBackgroundFile` (lines 457–521) does a content-equality check, but
when content differs it calls `existingModel.setValue(text)` regardless of
whether the model is editor-held:

```489:505:apps/ui/app/lib/monaco-model-service.ts
      const existingModel = this.monaco.editor.getModel(uri);
      if (existingModel) {
        // Update content if it differs from the filesystem (fixes stale model content)
        if (existingModel.getValue() !== text) {
          existingModel.setValue(text);

          // Safety net: immediately clear TypeScript/JavaScript worker markers
          // from the previous project. The TS worker will re-validate the updated
          // content asynchronously and set fresh markers, but clearing now prevents
          // stale errors from showing during the debounce window.
          this.monaco.editor.setModelMarkers(existingModel, 'typescript', []);
          this.monaco.editor.setModelMarkers(existingModel, 'javascript', []);
        }

        this.syncedPaths.add(filePath);
        return;
      }
```

`setValue` resets the model entirely (loses Monaco's per-edit
undo/redo stack, focus/cursor/scroll/IME state, and any in-flight
typing). The current `applyWritten` path (line 354) correctly uses
`pushEditOperations` for editor-held models — `syncBackgroundFile`
should use the same branch. This is currently masked because content
typically _does_ match (writes route through the same cache), but a
race here can clobber the user's keystrokes when a worker-side refresh
lands during a typing burst.

### Finding 5: `setProjectSession()` vs `acquireModel()` effect ordering

`MonacoModelServiceProvider` runs `setProjectSession()` from a
`useEffect` keyed on `[projectId, services.modelService]` (line 108).
The `FileEditor`'s `acquireModel` runs from a child `useEffect` keyed
on `[modelService, filePath]` (`chat-editor-dockview.tsx` line 145).

Under React 19 commit-phase effect ordering, **child effects run first**
when both components re-render in the same render. So when `projectId`
changes without a route remount (rare, but possible — e.g. a programmatic
`useProject` swap):

1. Child effect: `acquireModel(filePath)` → creates / caches a model in
   `editorHolds`.
2. Parent effect: `setProjectSession()` → `disposeAllModels()` walks
   `editorHolds` and disposes that just-created model.

The editor is now bound to a disposed model. In practice the `projects_.
$id` route remounts on `projectId` change so this path is rare, but the
code is structurally vulnerable. The session epoch check inside
`getOrEnsureModel` is best-effort (lines 199–207): the
`monaco.editor.createModel` call at line 224 has no atomicity guarantee
against `disposeAllModels`.

### Finding 6: TS worker has no native FS adapter

The standalone monaco `ts.worker` synthesises its TS `LanguageServiceHost`
from the live monaco model set; it has no `readFile`/`fileExists`/
`directoryExists`/`getDirectories`/`readDirectory` shim that VS Code Web
provides via `sync-api-client`. This is by design — monaco-editor's
worker is meant to be self-contained — but it means **the only way for
the TS worker to see a file is for that file to exist as a Monaco model
when `setEagerModelSync(true)` is on**.

Tau's strategy of "preload all JS files as background models" is the
correct workaround for this constraint; the bugs all stem from the
preloader being incomplete (Findings 1–3) and the model lifecycle
having races against the editor (Findings 4–5).

### Finding 7: ATA ignores relative imports

`TypeAcquisitionService.scanModelImports` (`apps/ui/app/lib/type-
acquisition-service.ts`, line 334) handles two import categories:

- Bare specifiers (`'lodash'`, `'@scope/pkg'`): fetched from esm.sh.
- CDN URLs (`'https://...'`): fetched directly.

Relative imports (`'./lib/head'`, `'../utils/x.js'`) are not handled at
all — they fall through both branches. ATA could trigger
`acquireModel(resolvedPath)` for them as a defensive belt-and-braces, so
that even when the preloader misses a file, opening any other file that
imports it would warm it into Monaco.

### Finding 8: `disposeAllModels` only walks tracked paths

`disposeAllModels` (lines 572–587) intentionally avoids touching
`addExtraLib` virtual files and other non-tracked models, which is
correct. But during `setProjectSession()` it walks
`editorHolds ∪ backgroundAccessTimes ∪ syncedPaths`. If a model exists in
`monaco.editor.getModels()` but for some reason was created without
flowing through this service (e.g. via `applyWritten` → `createModel`
without `syncedPaths.add` ever executing — there's no such path today
but it's a latent foot-gun), it survives session changes and produces
stale "ghost" content visible to the TS worker after the new project's
files are loaded.

### Finding 9: `node_modules` filter is path-substring based

Both `syncAllInBackground` (line 420) and `applyWritten` (line 378) use
`!path.includes('node_modules')` to skip vendored deps — but that
substring also matches innocent paths like `examples/node_modules-demo/
foo.ts` or `docs/about-node_modules.md`. Low probability of harm, but
worth tightening to a path-segment check (`!hasNodeModulesSegment(path)`).

### Finding 10: Static type acquisition is append-only across re-init

`TypeAcquisitionService.initialize` (line 108) is called from the
`activate()` of `jsTsContribution` (`javascript-contribution.ts`, line
113), which the registry guards to run at most once per activation
epoch. But the `staticDisposables` array is appended to every time, and
`dispose()` is the only path that clears it. Today the registry's
activation lifecycle keeps this single-use, but if anyone ever wires
`jsTsContribution.activate()` to be called more than once per epoch (or
without disposing first), the same package types get registered N times
under the same `file:///node_modules/<pkg>/index.d.ts` URI — Monaco
allows duplicate `addExtraLib` registrations and they layer on top of
each other unpredictably.

### Finding 11: The eviction TTL silently shrinks the model set

`MonacoModelService.evictStaleBackgroundModels` runs every 60s and
disposes models whose `backgroundAccessTimes` is older than 1 hour
(lines 525–556). Eviction also happens when `backgroundAccessTimes.size

> 200` (the hard cap). For a long-running session on a project with
> hundreds of JS files, transitive deps that aren't recently touched can
> get evicted, causing "Cannot find module" errors to _re-appear_ after
> working fine for an hour. This is observable as flakiness that develops
> over time within a single session — likely contributes to user reports
> of "intellisense was working, then suddenly stopped".

## Race-Condition Catalogue

Numbered for easy referencing in PRs and follow-ups.

| #   | Race                                                                                                                       | Where                                    | Severity  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- |
| Z1  | Preloader reads a lazy tree once; sub-directories never enter Monaco                                                       | `syncAllInBackground` line 413           | P0        |
| Z2  | No re-sync when `treeService` later loads new directories                                                                  | Missing tree subscription                | P0        |
| Z3  | `'read'` events ignored, dropping content from non-tab-creating updates                                                    | `handleContentChange` line 335           | P1        |
| Z4  | `onWorkerFileWritten` short-circuits via `shouldRefreshWorkerPath`                                                         | `file-content-service.ts` line 502       | P1        |
| Z5  | `syncBackgroundFile.setValue` clobbers editor-held models                                                                  | `monaco-model-service.ts` line 493       | P1        |
| Z6  | Effect ordering: `acquireModel` precedes `setProjectSession`, models destroyed                                             | `use-monaco-model-service.tsx` line 108  | P2        |
| Z7  | `getOrEnsureModel.createModel` has no atomicity vs `disposeAllModels`                                                      | `monaco-model-service.ts` line 224       | P2        |
| Z8  | TS worker only sees Monaco models; no FS shim                                                                              | Architectural (monaco standalone worker) | P2 (long) |
| Z9  | ATA does not eagerly resolve relative imports                                                                              | `type-acquisition-service.ts` line 334   | P2        |
| Z10 | TTL/cap eviction can drop transitive deps after first hour                                                                 | `monaco-model-service.ts` lines 525–556  | P2        |
| Z11 | `setProjectSession` re-runs `syncAllInBackground` on the **still-lazy** new tree; same Z1 problem after every project swap | `monaco-model-service.ts` line 157       | P0        |
| Z12 | `node_modules` substring filter is too loose                                                                               | `monaco-model-service.ts` lines 378, 420 | P3        |
| Z13 | `staticDisposables` not deduped if `activate` ever runs twice without disposal                                             | `type-acquisition-service.ts` line 113   | P3        |

## Comparison: Tau vs VS Code Web

| Concern                          | Tau (today)                                                     | VS Code Web                                                          |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| TS worker FS access              | ❌ None — synthesised from monaco models only                   | ✅ Full `readFile`/`directoryExists`/etc. via `sync-api-client`      |
| Files visible to TS              | Only files explicitly preloaded as `monaco.editor` models       | Anything tsserver can `readFile`/`readDirectory`                     |
| Buffer sync (open editors)       | `setEagerModelSync(true)` (eager mirror of every model)         | `bufferSyncSupport.ts` batched `didOpen`/`didChange`/`didClose`      |
| Cross-file imports               | Require model-set coverage before TS will resolve               | Resolved by tsserver against FS at need                              |
| Workspace discovery              | Depends on lazy main-thread tree snapshot                       | tsserver crawls the FS itself, driven by `tsconfig.json` includes    |
| Type acquisition (external pkgs) | `TypeAcquisitionService` → esm.sh + `addExtraLib`               | `AutoInstallerFs` mounts npm packages under `vscode-node-modules`    |
| Ambient lib injection            | `addExtraLib` for built-in package types (`replicad`, `kcl`, …) | `lib.*.d.ts` shipped with tsserver, plus `@types` resolved from FS   |
| FS write → model update          | `'written'`/`'batchWritten'` only; `'read'` ignored             | tsserver re-reads via host on next request — no separate sync needed |
| Eviction                         | TTL 1h + hard cap 200 (custom)                                  | tsserver internal LRU + project graph (driven by `tsconfig`)         |

The biggest delta is the FS shim — VS Code Web treats tsserver as the
authoritative project discoverer, while Tau treats the main thread as
the authoritative project discoverer and ships the discoveries to
tsserver as models. The latter only works if discovery is comprehensive.

## Reproduction (img 3 path)

1. Open a project where `main.ts` imports `./lib/head` and `./lib/handle`.
2. The file-tree component starts collapsed (`expandedItems = [rootId]`)
   so `listDirectory('lib')` is never called at boot.
3. `MonacoModelService.initialize` runs `syncAllInBackground`. Tree
   contains only `main.ts` and the `lib/` directory entry; `lib/head.ts`
   and `lib/handle.ts` are **not** in the tree.
4. The TS worker mirrors `main.ts` only. Resolution of `./lib/head`
   fails → TS2307 "Cannot find module" decoration on the import line
   (matches img 3 exactly).
5. The error persists until the user (a) expands `lib/` in the file
   tree AND (b) opens `lib/head.ts` in a tab so `acquireModel` runs —
   step (a) alone is insufficient because of Z2.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                 | Priority | Effort | Impact    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | --------- |
| R1  | In `MonacoModelService.startBackgroundSync`, drive the JS-file enumeration off `proxy.getDirectoryStat('')` (the worker-side **complete** index) instead of the lazy main-thread tree snapshot. Filters via `isJsLikeFile`.                                                                            | P0       | S      | High      |
| R2  | Subscribe `MonacoModelService` to `FileTreeService` listing changes (e.g. `treeService.subscribePath('', cb)` plus a per-directory subscription on listing growth) so directories loaded later trigger re-enqueue.                                                                                     | P0       | S      | High      |
| R3  | Re-run R1 inside `setProjectSession()` so newly-switched projects also enumerate their full file set, fixing Z11.                                                                                                                                                                                      | P0       | XS     | High      |
| R4  | Make `MonacoModelService.handleContentChange` honour `'read'` events as well as `'written'` — when a `'read'` for a JS-like path arrives and no model exists, create the model. Closes Z3.                                                                                                             | P1       | XS     | Med       |
| R5  | In `syncBackgroundFile`, skip `setValue` when the model is editor-held; or use the `pushEditOperations`/`pushStackElement` branch from `applyWritten`. Closes Z5.                                                                                                                                      | P1       | XS     | Med       |
| R6  | Add a relative-import resolver to `TypeAcquisitionService.scanModelImports`: when an open model's import is relative, call `modelService.acquireModel(resolvedPath)` (using `ModuleResolver`) so even a missing-from-preloader file warms on first reference. Closes Z9.                               | P1       | S      | Med       |
| R7  | In `FileContentService.onWorkerFileWritten`, drop the `shouldRefreshWorkerPath` short-circuit for JS-like extensions (or hoist the heuristic to subscribers); always emit `'written'` so consumers can decide. Closes Z4.                                                                              | P2       | S      | Med       |
| R8  | Tighten the `node_modules` filter to a path-segment check via a small util (`isInsideNodeModules`). Closes Z12.                                                                                                                                                                                        | P3       | XS     | Low       |
| R9  | Audit `TypeAcquisitionService.staticDisposables` lifecycle and dispose on every `initialize` re-entry to defuse Z13.                                                                                                                                                                                   | P3       | XS     | Low       |
| R10 | Drop or extend the 1-hour TTL eviction for transitive-dep models, OR pin any model that has been observed as an import target (whitelist by import graph). Closes Z10.                                                                                                                                 | P2       | M      | Med       |
| R11 | (Long term) Replace the standalone monaco `ts.worker` with a custom worker that exposes a `serverHost`-style FS shim, mirroring VS Code Web's `web/src/serverHost.ts`. tsserver then drives module resolution off the real FS. This removes Z1/Z2/Z11 entirely and is the architecturally correct fix. | P2       | L      | Very High |

R1 + R2 + R3 alone close img 3 reliably; R4 + R5 + R6 close the
secondary races that contribute to the "flaky" feel.

### R1 implementation sketch

```ts
// MonacoModelService.syncAllInBackground (recommended)
private async syncAllInBackground(): Promise<void> {
  if (!this.fileManagerApi || !this.monaco) {
    return;
  }
  const capturedEpoch = this.epoch;
  const signal = this.abortController?.signal;
  try {
    // Worker-side complete index. Already used by FileTreeService.searchFiles
    // for warming, but the resulting entries never make it back to the main
    // thread tree. We re-use the same call to drive Monaco preload.
    const entries = await this.fileManagerApi.getDirectoryStat('');
    if (this.epoch !== capturedEpoch || signal?.aborted) return;

    const jsFiles = entries.filter(
      (entry) =>
        entry.type === 'file' &&
        isJsLikeFile(entry.path) &&
        !isInsideNodeModules(entry.path),
    );
    // ... existing batch processing loop ...
  } catch {
    // worker enumeration failed — keep silent; acquireModel still works
    // for explicit opens.
  }
}
```

Plumbed via the existing `getDirectoryStat` already exposed on
`FileManagerApi` (`use-monaco-model-service.tsx` line 43). No new
worker RPC needed.

### R2 implementation sketch

`FileTreeService` exposes `subscribePath(path, callback)` (line 315) for
per-directory listing-change notifications. `MonacoModelService` should
subscribe at construction time:

```ts
// In MonacoModelService.initialize, after wiring contentUnsubscribe
this.treeUnsubscribe = treeService.subscribePath('', () => {
  // tree grew somewhere — re-enqueue any newly-discovered JS files.
  this.scheduleRescan();
});
```

A debounced `scheduleRescan` recomputes the diff (`tree.values()` minus
`syncedPaths`) and feeds it into the existing `requestIdleCallback`
batcher. Idempotent because `syncBackgroundFile` already short-circuits
on `syncedPaths.has(filePath)`.

### R11 long-term direction

Adopt a `serverHost`-style shim in a custom TS worker:

```
ts.worker (custom)
├── ts.server.ServerHost
│   ├── readFile(path)        ──► postMessage → main thread → contentService.resolveBytes(path)
│   ├── fileExists(path)      ──► postMessage → main thread → treeService.exists(path)
│   ├── directoryExists(path) ──► same
│   ├── getDirectories(path)  ──► readShallowDirectory → directories only
│   ├── readDirectory(...)    ──► matchFiles + getDirectoryStat at the worker FS
│   └── getModifiedTime(path) ──► proxy.stat(path).mtimeMs
└── createLanguageService(host)
```

This requires either:

- Sync IPC via `SharedArrayBuffer` + `Atomics.wait` (the `sync-api-
client` model VS Code uses) — Tau already has SAB infrastructure
  (`packages/memory`, `geometryPool`, `filePoolBuffer`), so the plumbing
  exists; or
- Switching tsserver to its async-friendly request modes (newer TS
  versions have partial support).

Once this is in place, Z1/Z2/Z11 become non-issues: tsserver will read
files on demand, and the entire "preload models" subsystem can be
deleted (or kept only for the small set of always-open buffer files).

## Diagrams

### Current data flow (broken case)

```
[user] opens project
  ▼
project route mounts ──► MonacoModelServiceProvider
                            │
                            ▼
                    MonacoModelService.initialize()
                            │
                            ▼
                    syncAllInBackground()
                            │
                            ▼
                    treeService.getTreeSnapshot()  ◄── lazy: { 'main.ts', 'lib' (dir) }
                            │
                            ▼
                    filter isJsLikeFile  ──►  [ 'main.ts' ]   ✗ no lib/head, lib/handle
                            │
                            ▼
                    createModel('main.ts')
                            │
                            ▼ (setEagerModelSync mirrors)
                    [ts.worker]   resolve './lib/head'  ──► not found → TS2307 ✗
```

### Recommended data flow

```
[user] opens project
  ▼
project route mounts ──► MonacoModelServiceProvider
                            │
                            ▼
                    MonacoModelService.initialize()
                            │
                            ▼
                    fileManagerApi.getDirectoryStat('')   ◄── worker-side full index
                            │
                            ▼
                    [ 'main.ts', 'lib/head.ts', 'lib/handle.ts', ... ]
                            │
                            ▼
                    createModel for each (idle-batched)
                            │
                            ▼ (setEagerModelSync mirrors all)
                    [ts.worker]   resolve './lib/head'  ──► found → IntelliSense ✓
                            │
        treeService.subscribePath ◄────────────────────────────────────┐
                            ▼                                          │
                    on listing growth → scheduleRescan ────────────────┘
```

## References

- VS Code Web TS server host: `repos/vscode/extensions/typescript-
language-features/web/src/serverHost.ts`
- VS Code TS buffer sync: `repos/vscode/extensions/typescript-
language-features/src/tsServer/bufferSyncSupport.ts`
- VS Code ATA web filesystems: `repos/vscode/extensions/typescript-
language-features/src/filesystems/ata.ts`
- Monaco TS worker docs: https://github.com/microsoft/monaco-editor/
  blob/main/src/language/typescript/README.md
- Tau Monaco model service: `apps/ui/app/lib/monaco-model-service.ts`
- Tau type acquisition: `apps/ui/app/lib/type-acquisition-service.ts`
- Tau JS/TS contribution: `apps/ui/app/lib/javascript-contribution.ts`
- Tau filesystem client: `packages/fs-client/src/file-tree-service.ts`,
  `packages/fs-client/src/file-content-service.ts`
- Filesystem policy: `docs/policy/filesystem-policy.md`

## Appendix: Hot file paths cited

| Symbol / behaviour                      | Path                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Lazy `_tree` Map                        | `packages/fs-client/src/file-tree-service.ts:103`                            |
| `getTreeSnapshot()` returns `_tree`     | `packages/fs-client/src/file-tree-service.ts:157`                            |
| Background sync entry point             | `apps/ui/app/lib/monaco-model-service.ts:404`                                |
| `setEagerModelSync(true)` (TS)          | `apps/ui/app/lib/javascript-contribution.ts:71`                              |
| `setEagerModelSync(true)` (JS)          | `apps/ui/app/lib/javascript-contribution.ts:83`                              |
| `'read'` event ignored                  | `apps/ui/app/lib/monaco-model-service.ts:335`                                |
| `'written'`/`'batchWritten'` create     | `apps/ui/app/lib/monaco-model-service.ts:341`                                |
| `setValue` clobbers editor-held         | `apps/ui/app/lib/monaco-model-service.ts:493`                                |
| `disposeAllModels` (tracked-only)       | `apps/ui/app/lib/monaco-model-service.ts:572`                                |
| `setProjectSession`                     | `apps/ui/app/lib/monaco-model-service.ts:137`                                |
| ATA bare/CDN scan                       | `apps/ui/app/lib/type-acquisition-service.ts:334`                            |
| `shouldRefreshWorkerPath` short-circuit | `packages/fs-client/src/file-content-service.ts:583`                         |
| File-tree expansion → `listDirectory`   | `apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx:323, 378`        |
| Editor effect: `acquireModel`/release   | `apps/ui/app/routes/projects_.$id/chat-editor-dockview.tsx:145`              |
| VS Code Web `serverHost` (reference)    | `repos/vscode/extensions/typescript-language-features/web/src/serverHost.ts` |
