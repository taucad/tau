---
title: 'Editor Filesystem Surface Audit'
description: 'End-to-end audit of the editor file-explorer, the Monaco code-viewer registry, and every surface that depends on file paths — drag-and-drop, rename, delete, create, copy/paste, dirty state — with VS Code prior art and a primitive-first recommendation set to battle-proof the editor before launch.'
status: draft
created: '2026-05-20'
updated: '2026-05-21'
category: audit
related:
  - docs/policy/filesystem-policy.md
  - docs/research/filesystem-architecture.md
  - docs/research/filesystem-access-api-cohesion-audit.md
  - docs/research/agent-filesystem-stale-cache-audit.md
---

# Editor Filesystem Surface Audit

End-to-end audit of `apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx` plus the Monaco code-viewer registry it feeds into (`chat-editor-dockview.tsx`, `chat-editor-code-viewer.tsx`, `chat-editor-markdown-viewer.tsx`, `chat-editor-plan-viewer.tsx`, `chat-editor-breadcrumbs.tsx`) and every editor surface that holds a file path. The audit catalogues the broken behaviours visible today (folder drag, rename leaks, stuck "File not found" tabs, edits resurrecting files at pre-rename paths) and traces them back to a shared root cause: the filesystem layer exposes a **single-file** mutation surface (`rename`, `unlink`, `duplicateFile`) and the editor wires UI mutations directly to file paths instead of routing them through a unified, **stat-returning**, **operation-typed** channel that surface owners can subscribe to.

The audit's anchor is VS Code's `IFileService` + `IWorkingCopyFileService` pair (under `repos/vscode/src/vs/platform/files/common/files.ts` and `repos/vscode/src/vs/workbench/services/workingCopy/common/workingCopyFileService.ts`). VS Code converged on a small set of primitives — `move(folder)`, `copy(folder)`, `createFolder`, `del(recursive)`, plus a single `onDidRunOperation` channel emitting a discriminated `FileOperation` union — that the rest of the workbench (text models, editor tabs, breadcrumbs, watchers, markers, history, TS server import-rewriter) consumes without ever holding raw paths. Tau's stack today does not have those primitives and several surfaces (Dockview editor tabs, Dockview viewer panels, `viewSettings`, `geometryUnits`, `project.assets.mechanical.main`, **every component in the Monaco viewer registry**) hold onto paths that go stale the moment a user renames or moves a file. The audit additionally identifies a critical class of missing primitives around the **dirty / save / revert** axis that VS Code anchors on `TextFileWorkingCopy` — without that axis, every keystroke writes to disk, agent overwrites cannot be reverted, and there is no untitled-buffer concept.

## Executive Summary

Three high-visibility bugs surfaced by the user are all instances of the same architectural gap:

1. **Folder drag never moves** — provider `rename()` only mutates single files; folders are not in the `_paths` set so `direct-idb-provider.rename` throws ENOENT and the promise rejection is swallowed by `headless-tree`'s `onDrop` callback. Same gap exists in `fs-access-provider` and `memory-provider` (single-file `readFileRaw`/`writeFile`/`unlink` path only).
2. **Rename leaks the old tab** — `editorMachine.renameFile` updates `context.openFiles`/`activeFilePath`, but the Dockview panels (keyed by `event.path` in `chat-editor-dockview.tsx`) are never told the path changed. A fresh `fileOpened` is emitted for `newPath` only when the renamed file was the active file, which **adds** a new panel without **removing** the old one. The old panel renders the orphaned `FileEditor` and shows "File not found".
3. **Cross-surface staleness after rename** — at minimum, `viewSettings[viewId].entryFile`, `project.assets.mechanical.main`, `projectMachine.context.mainEntryFile`, `projectMachine.context.geometryUnits` (Map keyed by entryFile), and the Dockview viewer panels' `entryFile` param all hold the pre-rename path. The same applies to **move** (drag) and **delete** of any open file.

A fourth, **previously-unreported** bug surfaces when the audit traces the code-viewer surface (`chat-editor-code-viewer.tsx`, `chat-editor-markdown-viewer.tsx`, `chat-editor-breadcrumbs.tsx`, `chat-editor-dockview.tsx`'s `FileEditor`):

4. **Editing a leaked rename tab silently resurrects the file at the pre-rename path** — `handleCodeChange` in `chat-editor-dockview.tsx:139–151` is closed over the stale `filePath`. When the user types into the leaked tab from bug 2, `fileManager.writeFile(filePath, encoded, …)` writes to the **old** path with the cached pre-rename bytes plus the new edits. End state: two copies of the file exist on disk and the user's edits land on the wrong one. This is data corruption, classified P0 alongside the other rename leaks.

The audit also catalogues a missing primitive class around the **dirty / save / revert** axis: every keystroke today triggers `writeFile`, with no debounce, no save concept, no untitled buffers, no "file changed on disk" reconciliation against agent overwrites, and no revert. VS Code's `TextFileWorkingCopy` is the prior art.

**The architectural reframing.** A naive read of bugs 2/4 is "the rename event isn't plumbed to Dockview" — and the natural fix is to plumb yet another event. The audit rejects that as a symptom-level fix. The real cause is that the editor machine and Dockview **both** own "what's open", keyed by file path, kept in sync via ad-hoc events. The eigenquestion is _who owns this state?_ and the answer mirrors VS Code's `IEditorService` / `IEditorGroupsService` split: the editor machine owns the open-tab set and per-tab metadata, Dockview owns layout only, and tabs are identified by a stable `paneId` (uuid) whose `path` is a _property_, not an identity. Under that model, rename becomes a single `assign` on the editor machine's `openFiles[]` and a reconciler-style `useEffect` updates Dockview — there is no rename event for Dockview to subscribe to because Dockview is no longer a separate store. This reframing collapses several findings (F2, F4, F20, F21, F27) and several recommendations into one structural change captured as **R3** below.

The audit identifies 28 findings spanning five classes (broken-today, latent-bug, missing-primitive, missing-UX, code-viewer surface), recommends 5 P0 changes that mechanically resolve issues 1–4 (introduce `move`/`copy`/`createFolder`/`del` primitives, an `onDidRunOperation` channel, a single-source-of-truth refactor that makes Dockview a reconciler-style render of the editor machine, and a `handleCodeChange` rebind via stable tab id), plus 16 P1/P2 recommendations covering bulk edits + undo, TS file-rename refactor (`getEditsForFileRename`), dirty/save/revert state, save participants, diff editor, confirmation dialogs, conflict handling, keyboard copy/paste, and persisted-state sweeps. Together these align Tau's filesystem surface with VS Code's proven primitives so the editor is launch-ready without ad-hoc patching at each consumer.

**Update 2026-05-21** — the multi-workspace filesystem refactor (`eb131e2ed`) landed several of the audit's foundational asks. The canonical `ChangeEvent` discriminated union, origin-tagged mutation context, `mkdir({ recursive })`, `rmdir({ scope, recursive })`, typed errors at workspace boundaries, and `onDidChangeOutcome` channels are now built. R2/R4/R5/R6 reframe from "introduce" to "extend / migrate UI" — see the [Recent Filesystem Stack Evolution](#recent-filesystem-stack-evolution-2026-05-21) section for the changelog. Findings F1/F2/F3 (folder-rename, leaked tabs, the open-tab-set reframing in R3) and the entire class A/B/D/E catalogue are **unaffected** — the foundation work makes them easier to fix, not different in shape.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Architecture Recap](#architecture-recap)
- [Recent Filesystem Stack Evolution (2026-05-21)](#recent-filesystem-stack-evolution-2026-05-21)
- [Code Viewer Surface (Monaco Editor Registry)](#code-viewer-surface-monaco-editor-registry)
- [Architectural Reframing: Single Source of Truth for the Open-Tab Set](#architectural-reframing-single-source-of-truth-for-the-open-tab-set)
- [Findings](#findings)
- [VS Code Prior Art](#vs-code-prior-art)
- [Recommendations](#recommendations)
- [Cross-Surface Impact Matrix](#cross-surface-impact-matrix)
- [Roadmap](#roadmap)
- [Appendix: Primitive Comparison Table](#appendix-primitive-comparison-table)

## Problem Statement

Three user-reported symptoms, observed in the editor screenshots accompanying the audit request:

1. Dragging a folder from one location to another (e.g. `chat_IXMb1iUP7qD…` into another folder slot) shows the drag affordance and a drop highlight, but releasing does nothing — the folder stays where it was.
2. Renaming `test.txt` via the explorer's Rename menu item opens `test2.txt` in the Tiptap-style chat editor (`chat-editor.tsx`) **and** keeps the old `test.txt` tab open. Clicking the old tab renders the editor's "File not found" placeholder.
3. The renamed file's other consumers (viewer panel, parameter cache, "main entry file") continue to reference the pre-rename path until the next route reload, so the geometry viewer for the renamed file shows "File not found" or never renders.

These symptoms point to a hypothesis: the editor lacks a unified, **operation-typed**, **stat-returning** mutation surface that every consumer (Dockview tabs, viewer panels, Monaco model service, marker service, project assets pointer, geometry unit registry, parameter cache) can subscribe to. Instead the file-tree component calls `contentService.rename` directly and then manually fans out a single `editorRef.send({ type: 'renameFile', oldPath, newPath })` event; everything outside the editor machine learns about the change only through indirect side-effects (`fileOpened` re-emits, content `peekOutcome` flipping to `orphaned`, etc.).

## Methodology

- Read `apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx` end-to-end (≈ 1,950 lines) and traced every callback into the provider stack.
- Walked the `FileContentService` (`packages/fs-client/src/file-content-service.ts`) and `WorkspaceFileService` (`packages/filesystem/src/workspace-file-service.ts`) rename/delete/copy code paths.
- Inspected each backend provider's `rename`/`unlink`/`rmdir` implementation (`direct-idb-provider.ts`, `fs-access-provider.ts`, `memory-provider.ts`) to confirm folder semantics.
- Cross-referenced consumer surfaces holding file paths: `editorMachine.openFiles`/`activeFilePath`/`viewSettings`, `projectMachine.mainEntryFile`/`geometryUnits`, `chat-editor-dockview.tsx`, `chat-viewer.tsx`, `monaco-model-service.ts`, `monaco-marker-service`, `project.assets.mechanical.main` (persisted in IDB).
- Walked the Monaco viewer registry (`chat-editor-viewer-registry.ts`, `chat-editor-code-viewer.tsx`, `chat-editor-markdown-viewer.tsx`, `chat-editor-plan-viewer.tsx`, `chat-editor-breadcrumbs.tsx`, `chat-editor-too-large-warning.tsx`, `chat-editor-binary-warning.tsx`, `chat-editor-error-placeholder.tsx`) plus the underlying `code-editor.client.tsx` Monaco wrapper to map every code path that reads or writes a file path.
- Surveyed VS Code prior art in `repos/vscode/src/vs/platform/files/common/files.ts`, `repos/vscode/src/vs/workbench/services/workingCopy/common/workingCopyFileService.ts`, `repos/vscode/src/vs/workbench/services/textfile/common/textFileEditorModelManager.ts`, `repos/vscode/src/vs/workbench/contrib/files/browser/views/explorerViewer.ts`, plus the TypeScript extension's file-rename refactor wiring (`repos/vscode/extensions/typescript-language-features/src/languageFeatures/updatePathsOnRename.ts`).
- **2026-05-21 refresh** — re-walked the filesystem/fs-client stack after the multi-workspace landing (commit `eb131e2ed feat(ui): implement multi-workspace filesystem architecture with explicit bindings`, plus follow-ups `3c993fb1f`, `7b34e2705`). New surface area: `packages/filesystem/src/mount-table.ts`, `packages/filesystem/src/workspace-errors.ts`, `packages/filesystem/src/event-origin-registry.ts`, `packages/filesystem/src/change-event-bus.ts`, `packages/fs-client/src/worker-change-channel.ts`, `apps/ui/app/filesystem/workspace-errors.ts`, `apps/ui/app/routes/projects_.$id/file-manager-error.tsx`. The refresh updates findings F8/F14/F16/F17 and recommendations R2/R4/R5/R6 with current-status amendments; the rest of the audit (the open-tab-set reframing and class A/B/D/E findings) is unaffected.

## Architecture Recap

The current data flow on a rename from the file tree:

```text
ChatEditorFileTree
  ↓ item.startRenaming()  (headless-tree)
  ↓ onRename(newName)
  ↓
  ├─→ renameFile(oldPath, newPath)   (use-file-manager.tsx)
  │     ↓
  │     contentService.rename
  │       ↓
  │       proxy.rename → worker → workspaceFileService.rename
  │         ↓
  │         provider.rename     ← FILE-ONLY (ENOENT on folders)
  │       ↓
  │       cache.rename(oldPath,newPath)
  │       publishOutcome(newPath, oldOutcome)
  │       notifyGlobalSubscribers({ type: 'renamed', oldPath, newPath })
  │
  └─→ editorRef.send({ type: 'renameFile', oldPath, newPath })
        ↓
        editorMachine.renameFile (action)
          ↓
          assign openFiles  (path migrated)
          assign activeFilePath (if was renamed file)
          emit fileOpened(newPath)   ONLY IF active file was renamed
```

Surfaces that learn about the change:

| Surface                                        | Subscribes via                             | Outcome on rename                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded file cache                             | `contentService.rename`                    | OK — `cache.rename` migrates                                                                                                                              |
| Outcome map (`peekOutcome`)                    | `contentService.rename` + `publishOutcome` | OK — outcome moved from oldPath to newPath                                                                                                                |
| File-tree map (`useFileTreeMap`)               | content channel `renamed` event            | OK — `FileTreeService.handleWorkerFileRenamed` migrates the tree node                                                                                     |
| Monaco model service                           | `onDidContentChange` `renamed`             | OK — disposes old URI's model, creates new one, calls `markerService.migrateUri`                                                                          |
| Marker service                                 | called by Monaco model service             | OK                                                                                                                                                        |
| Editor machine `openFiles`/`activeFile`        | explicit `editorRef.send({ renameFile })`  | OK — path migrated                                                                                                                                        |
| **Dockview editor panel id**                   | NONE                                       | **Stale** — old panel id persists with `id=oldPath`, `params.filePath=oldPath`. New `fileOpened` adds a parallel panel with `id=newPath`. User sees both. |
| **Dockview editor panel title**                | NONE                                       | **Stale** — `panel.setTitle` never called                                                                                                                 |
| **Dockview viewer panel `entryFile`**          | NONE                                       | **Stale** — viewer keeps rendering old path; falls into `isMissing` branch, shows "File not found"                                                        |
| **`editorMachine.viewSettings.entryFile`**     | NONE                                       | **Stale** — persisted state retains old path; reload restores broken viewer state                                                                         |
| **`projectMachine.mainEntryFile`**             | NONE                                       | **Stale** — affects "main file" UI, default kernel selection, export flows                                                                                |
| **`projectMachine.geometryUnits` Map**         | NONE                                       | **Stale** — old key holds the cad actor; the renamed file has no associated cad actor; `chat-viewer.tsx` falls into "Initializing viewer..."              |
| **Persisted `project.assets.mechanical.main`** | NONE                                       | **Stale** — IDB row still points at the pre-rename path; next project open silently picks the wrong main file                                             |
| Parameter cache (.tau/cache/parameters)        | NONE                                       | **Orphaned** — cache files keyed by source path persist forever                                                                                           |
| Open chat references (`@path` chips)           | NONE                                       | **Stale** — chip pills carry the pre-rename path                                                                                                          |

The bolded rows split into two categories: **dual-store surfaces** (Dockview editor / viewer panels) where the editor machine already holds the right state but a redundant second store doesn't get told, and **single-store surfaces** (project machine, persisted assets, parameter cache, chat chips) that genuinely own state nobody else holds. The first category is collapsed by the [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set) (R3) — turning Dockview into a render over the editor machine. The second category earns the file-operation participant pattern (also R3, but for stores rather than renders). The two halves are different fixes for what looks at first glance like the same problem.

## Recent Filesystem Stack Evolution (2026-05-21)

Between the initial audit (2026-05-20) and the refresh, the multi-workspace filesystem refactor landed (`eb131e2ed`). Several foundational pieces the audit asked for are now built; this section is the changelog the rest of the doc reads against so findings and recommendations stay in sync with the code.

### Primitives now landed (worker + RPC + UI hook)

- **`WorkspaceFileService.mkdir(path, { recursive? })`** + matching `FileSystemClient.mkdir` + `useFileManager().mkdir(...)`. Emits a `directoryChanged` event on the parent and updates the in-memory file tree.
- **`WorkspaceFileService.rmdir(path, { scope, recursive })`** + matching `FileSystemClient.rmdir`. Recursive walk is gated on an **explicit** `scope` (standalone provider); mount-routed `{ recursive: true }` deliberately throws so the caller is forced to declare which workspace it is deleting from.
- **`WorkspaceFileService.copyDirectory(source, destination)`** + matching client method + `useFileManager().copyDirectory(...)`. Already used by project bootstrap; emits per-file `fileWritten` events and a `batchWritten` aggregate on the content channel.

What remains missing at the primitive layer: a directory-aware `rename`/`move`, a typed `copy` for single files that is not the current `duplicateFile(source, destination)` (which forces same-folder semantics in the UI), and `canMove`/`canRename`/`canCreate`/`canDelete` preflights.

### Canonical change-event channel

`@taucad/types` now defines:

```ts
export type ChangeEvent =
  | { type: 'fileWritten'; path: string; backend: FileSystemBackend }
  | { type: 'fileDeleted'; path: string; backend: FileSystemBackend }
  | { type: 'fileRenamed'; oldPath: string; newPath: string; backend: FileSystemBackend }
  | { type: 'directoryChanged'; path: string; backend: FileSystemBackend }
  | { type: 'backendChanged'; backend: FileSystemBackend };
```

Worker-side: `WorkspaceFileService` emits these via `ChangeEventBus` and `WorkerChangeChannel` re-emits them as workspace-relative variants to main-thread subscribers (`WorkerRelativeRenameEvent`, etc.). `FileContentService.onDidContentChange` is implemented in terms of this channel.

Origin tagging is built in: `WorkspaceMutationContext.originClientId` flows from every mutating call site through to `tagEventOrigin(event, originClientId)` so subscribers can self-skip events they themselves emitted (`packages/filesystem/src/event-origin-registry.ts`). This is the participant-self-skip primitive that R3's participant pattern requires.

Gaps relative to VS Code's `IFileOperationEvent`: no explicit `COPY` discriminator (today's copies surface as `fileWritten` + `batchWritten`), and CREATE for files/folders is conflated with `fileWritten`/`directoryChanged`. These are deltas worth closing under R2, not blocking foundations.

### Typed errors at workspace boundaries

The bridge between worker and UI now propagates typed errors with stable `code` discriminators rather than string-matched `Error` shapes:

| Error                             | Where                              | `code` discriminator                                                                       |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `MissingWorkspaceHandleError`     | `packages/filesystem` worker side  | `'missing-workspace-handle'`                                                               |
| `WorkspaceDirectoryRequiredError` | `apps/ui/app/filesystem`           | `'missing' \| 'permission' \| 'unsupported'`                                               |
| `WorkspaceScopeViolationError`    | `packages/fs-client` (synchronous) | thrown by `FileContentService.rename/delete/duplicate` when keys escape the workspace root |
| `FileManagerNotReadyError`        | `apps/ui/app/filesystem`           | `'proxy-timeout' \| 'services-timeout' \| 'machine-error'`                                 |

`FileManagerError` (`apps/ui/app/routes/projects_.$id/file-manager-error.tsx`) is the new fatal-FM-error overlay; it is the concrete proof of the typed-error pattern bearing fruit at the UI layer. R6's preflight calls (`canMove` etc.) can return these typed errors directly — they no longer need to be invented; the discriminator union exists.

### Multi-workspace mount table

`MountConfig` and `WorkspaceScope` are now discriminated unions where webaccess variants carry mandatory `{ directoryHandle: FileSystemDirectoryHandle, workspaceId: string }`. The compiler forbids ambient handle state. `MountTable` does longest-prefix routing; standalone providers are cached by `(backend, workspaceId)` so two workspaces with the same folder name never share a provider. `bindProjectToWorkspace(workspaceId)` is a single-transaction project↔workspace binding; `ProjectFileSystemConfig.workspaceId` (persisted) is the authority.

What this means for the audit: every cross-mount finding (F11) is now framed against a stricter invariant — moves _between_ workspaces must declare both ends explicitly. The single-file fallback in `WorkspaceFileService.rename` still risks data loss for directory moves, but the workspace identity is now unambiguous, which simplifies the eventual `move` primitive (R1) implementation.

### New event channels on `FileContentService`

- `onDidChangeOrphaned(handler)` — fires when a path transitions between orphaned and non-orphaned.
- `onDidChangeOutcome(handler)` — fires on every outcome transition (`loading` / `text` / `binary` / `too-large` / `orphaned` / `error`). Explicitly modelled on VS Code's `TextFileEditorModelManager.onDidResolve`.

These channels strengthen R3's render-side story: the Dockview reconciler `useEffect` can subscribe to `onDidChangeOutcome` to drive viewer state transitions (`isMissing`, `isTooLarge`, `binary` warning) instead of polling `peekOutcome` per render.

### `FileSystemClientFacade` + `WorkspaceFacade` split (`useFileManager()`)

The `useFileManager()` shape changed: in addition to the per-FM `writeFile`/`readFile`/`renameFile`/etc. cache facade, the hook now exposes:

- `client: FileSystemClientFacade` — generic RPC dispatch (cache-free reads/writes, cross-workspace ops by absolute path).
- `workspace: WorkspaceFacade` — mount lifecycle (`mount(prefix, config)`, `unmount(prefix)`, `invalidateStandaloneProvider(backend, workspaceId?)`).
- `activeWorkspaceId`, `activeWorkspaceName`, `unavailableReason` (`'missing' \| 'permission'`).
- `bindProjectToWorkspace(workspaceId)`.

The doctrine is the one Tau settled on after the workspace-binding audit: **scope is a context dimension on the facade, not a method-suffix axis** (`learned-fs-client.mdc`). R3's editor-machine participant subscribes to the change channel via the _client_ facade, not by reaching into a `*Scoped` variant.

### Net impact on this audit

| Audit item | Before refresh                   | After refresh                                                                                                                                                                  |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 / F3    | Open                             | Open — provider `rename` still file-only on every backend                                                                                                                      |
| F8         | P1, missing                      | P1, **half-built** — `rmdir({ scope, recursive })` exists; mount route TODO                                                                                                    |
| F11        | Open                             | Open but cross-mount semantics now stricter (`MountConfig` discriminator)                                                                                                      |
| F14        | P1, `.gitkeep` workaround        | **Worker-layer resolved** — `mkdir` lands; UI still calls `.gitkeep`                                                                                                           |
| F16        | P0, missing entirely             | **Largely done** — `ChangeEvent` union + origin tagging in `@taucad/types`/`packages/filesystem`; COPY discriminator + folder-CREATE distinction still missing                 |
| F17        | P1, missing                      | **Partially mitigated** — typed errors with `code` discriminators thrown at the right boundaries; UI surfaces switch on `code`. `canMove`/`canRename` preflights still missing |
| R2         | "Introduce a channel"            | "Extend the existing channel: add COPY, split file/folder CREATE/DELETE"                                                                                                       |
| R4         | "Introduce `createFolder`"       | "Migrate UI from `.gitkeep` workaround to the existing `mkdir` primitive"                                                                                                      |
| R5         | "Introduce `del({ recursive })`" | "Promote the existing `rmdir({ scope, recursive })` to a mount-routed code path (or document the scope requirement explicitly)"                                                |
| R6         | "Introduce preflights"           | Still required, but error-axis half is already typed                                                                                                                           |

Everything else (R1, R3, R7–R21, all of class A/B/D/E findings) is unchanged. In particular **the open-tab-set reframing (R3) is unaffected** — the new typed-error and event-channel work make R3 _easier_ to implement, not different in shape.

## Code Viewer Surface (Monaco Editor Registry)

The Tiptap-style `apps/ui/app/components/chat/tiptap/chat-editor.tsx` referenced in the original bug report is the chat composer, not the code editor that displays a file's contents. The component that opens when the user double-clicks `test.txt` in the explorer is `apps/ui/app/routes/projects_.$id/chat-editor-code-viewer.tsx`, dispatched through a small registry:

| Layer                                                                                                        | Role                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-editor-layout.tsx`                                                                                     | `FloatingPanel` shell; mounts `EditorDockview`                                                                                                                    |
| `chat-editor-dockview.tsx` (`FileEditor`)                                                                    | One panel per file; subscribes `useFileContent(filePath)`, acquires `modelService.acquireModel(filePath)`, owns the write-back `handleCodeChange`                 |
| `chat-editor-viewer-registry.ts` → `resolveViewer({ name, path }, { planModeEnabled })`                      | Picks the viewer by extension: `*.plan.md` → plan viewer; `*.md` → markdown viewer; everything else → code viewer                                                 |
| `chat-editor-code-viewer.tsx`                                                                                | Mounts `<CodeEditor path={createMonacoPath(filePath)} defaultValue={content} onChange={onChange} onValidate={onValidate} />` plus breadcrumbs                     |
| `chat-editor-markdown-viewer.tsx`                                                                            | Same Monaco wrapper inside a `<Tabs key={filePath}>` with a Preview pane rendering `<MarkdownViewerChat>{content}</MarkdownViewerChat>`                           |
| `chat-editor-plan-viewer.tsx`                                                                                | Read-only markdown preview only — no `CodeEditor`, no `onChange`                                                                                                  |
| `chat-editor-breadcrumbs.tsx`                                                                                | Derives breadcrumbs entirely from `filePath.split('/')`; each crumb opens a `FileSelector` rooted at `parentPath`                                                 |
| `chat-editor-too-large-warning.tsx` / `chat-editor-binary-warning.tsx` / `chat-editor-error-placeholder.tsx` | Fallback UI for outcomes `tooLarge`, `binary`, and `error` returned by `FileContentService.resolve`                                                               |
| `code-editor.client.tsx`                                                                                     | Monaco wrapper. Uses `keepCurrentModel`, `fixedOverflowWidgets`, a shared overflow-widgets DOM node on `document.body`, and force-tokenises the first 5,000 lines |
| `monaco-model-service.ts`                                                                                    | Ref-counted Monaco model registry keyed by relative path. Subscribes `FileContentService.onDidContentChange` and migrates URIs on `renamed`                       |
| `monaco-navigation-service.ts`                                                                               | `monaco.editor.registerEditorOpener` opens cross-model navigations via `editorRef.send({ type: 'openFile' })`                                                     |
| `monaco-typescript-extras/materializing-rename-adapter.ts`                                                   | In-file **symbol** rename (`findRenameLocations`) with workspace materialisation — _not_ file-level rename refactor                                               |

Every component in this stack receives the **file path as a prop or closure capture** and re-derives its state from that string. The set of paths that flow downstream from a single `FileEditor` render:

1. `properties.params.filePath` (Dockview panel parameter) → `<FileEditor filePath>` prop
2. `useFileContent(filePath)` → outcome subscription keyed by path
3. `modelService.acquireModel(filePath)` → ref-counted Monaco model URI
4. `contentService.resolve(filePath, …)` → loads bytes from worker
5. `fileManager.writeFile(filePath, encoded, { source: 'editor' })` → write-back **closed over `filePath`**
6. `<CodeEditor path={createMonacoPath(filePath)} defaultValue={content} ...>` → Monaco URI + initial value
7. `<ChatEditorBreadcrumbs filePath={filePath}>` → breadcrumb segments + `FileSelector` `parentPath`
8. `<Tabs key={filePath}>` (markdown viewer) → React mount key
9. `panel.api.setTitle(fileName)` only when the user clicks the breadcrumb `FileSelector` (manual remap)

Because the **panel id and panel params are not updated** by the rename flow (Finding 2, Class A), every consumer in this list keeps the pre-rename path forever. The leaked tab is not just visually orphaned — it is **actively wired to write to the old path**, which produces a second, more dangerous failure mode documented as Finding 20 below.

## Architectural Reframing: Single Source of Truth for the Open-Tab Set

Before walking the findings, this section names the cross-cutting cause that several of them share. Bugs 2 (leaked tab), 4 (viewer stale), 19 (stale `filePath` propagation), 20 (write-back resurrects file), 21 (acquireModel ref-count drift), and 27 (`<Tabs key={filePath}>` reset) are _all_ surface symptoms of one architectural decision: the editor machine and Dockview both store "what's open", both keyed by file path, kept in sync via ad-hoc events.

### The eigenquestion

> **Who owns the "what's open in the editor" state — Dockview or the editor machine — and what is each one _for_?**

Today both own it, redundantly:

| State concept                               | Editor machine                                 | Dockview                                 |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| The set of open files                       | `openFiles: { path, readOnly }[]`              | the set of panels, with `id = path`      |
| Which one is focused                        | `activeFilePath`                               | the active panel within the active group |
| Per-tab metadata (read-only, view settings) | `openFiles[i]`, `viewSettings[viewId]`         | `panel.params`                           |
| Tab/group layout (splits, sizes, ordering)  | nothing                                        | dockview's internal grid                 |
| Persisted layout                            | `editorLayout` serialised blob (from Dockview) | source of the blob                       |

Two stores → bidirectional sync → drift. Every new operation (rename, move, delete, agent overwrite) has to be plumbed into both stores by hand. Each missed plumb is a bug — Findings 2, 4, 19, 20, 21, 27 are the bugs we have today; the next one is whichever operation we forget to wire next.

### What VS Code does

VS Code has two services that look like they overlap but don't:

- **`IEditorService`** owns _editor inputs_ — the abstract "this URI is open with these options". An editor input is a stable handle whose **URI is a property, not an identity**. Renaming a file mutates the URI on the existing input; the input itself never changes identity.
- **`IEditorGroupsService`** owns _groups_ — the split layout. A group holds a list of `EditorInput` references. Groups manage their own active editor and ordering.

The UI (`EditorPart`, tabs control, grid splitter) is rendered _from_ these models — it does not own any state. That's why a rename in VS Code has **no "update the tab" step at all**:

1. `IWorkingCopyFileService.onWillRunWorkingCopyFileOperation(MOVE)` fires.
2. `TextFileEditorModelManager` re-resolves the working copy under the new URI in-place (`repos/vscode/src/vs/workbench/services/textfile/common/textFileEditorModelManager.ts:189–326`).
3. Tabs derive their label from `editor.getName()` which reads the input's current URI.
4. No tab is closed, no tab is added, nothing is "migrated" through a custom event. The label re-renders because the URI it reads from changed.

The tab is **not keyed by the path**. It is keyed by the editor input's identity. The path is a _projection_ of that identity for display.

### The reframing applied to Tau

Three options were considered:

- **Option A — Single source of truth + Dockview as render**: The editor machine becomes the sole owner of the open-tab set. Each open entry gets a stable `paneId` (uuid); the path is a property. Dockview is reconciled from this state via a `useEffect` that diffs `openFiles` against `dockApi.panels` and issues `addPanel`/`removePanel`/`updateParameters`/`setTitle`. User-initiated Dockview events (close X, reorder, split) translate into editor-machine events; the reconciler is then a no-op next tick because state already matches.
- **Option B — Keep today's path-as-id, but call Dockview's API directly from the move participant**: Smallest diff. Still two stores. Still bidirectional sync. Still O(N²) coupling for every future operation. Rejected — it is the maintenance burden we are trying to eliminate, just renamed.
- **Option C — Full `EditorInput` abstraction (literal VS Code parity)**: Unlocks multiple-inputs-per-file (diff editor, compare-with-saved, untitled). Most invasive. Option A is a strict prefix of Option C — once R18 + R20 land, `openFiles[i]` evolves naturally from `{ paneId, path, readOnly }` into `{ paneId, input: EditorInput }`.

**Decision**: Adopt Option A now. This collapses the rename plumbing for the tab surface from "introduce a new event channel + a synthetic `panelMigrated` event + a Dockview subscriber" into "rewrite the path field on `openFiles[i]`; the reconciler handles the rest". The participant pattern (R3) is still the right answer for _other_ stateful surfaces — `projectMachine.mainEntryFile`/`geometryUnits`, persisted `project.assets.mechanical.main`, parameter cache, chat `@path` chips, telemetry hashes — because those genuinely _are_ separate stores with separate owners. The editor-tab surface drops out of the participant chain because it ceases to be a separate store.

### Concrete shape after the refactor

**Terminology (2026-05-22)**: Editor pane ids use `paneId` / `idPrefix.pane` (`pane_*` via `generatePrefixedId`). Browser-tab coordination in `CrossTabCoordinator` keeps `tabId` / `idPrefix.tab` (`tab_*`) — the two must not be conflated.

```ts
type OpenFile = {
  paneId: string;       // identity — never changes for the lifetime of the tab
  path: string;        // content — rewritten on rename/move
  readOnly: boolean;
  viewId?: string;     // links to viewSettings entries
};

editorMachine.context.openFiles: OpenFile[];
editorMachine.context.activePaneId: string | undefined;
```

The Dockview reconciler (sketch — to live in `chat-editor-dockview.tsx`):

```tsx
useEffect(() => {
  if (!dockApi) return;
  const desired = new Map(openFiles.map((f) => [f.paneId, f]));
  const current = new Map(dockApi.panels.map((p) => [p.id, p]));

  for (const [paneId, file] of desired) {
    const panel = current.get(paneId);
    if (!panel) {
      dockApi.addPanel({
        id: paneId,
        component: 'editor',
        title: basename(file.path),
        params: { filePath: file.path, readOnly: file.readOnly },
      });
    } else {
      const params = panel.params as EditorPanelParameters;
      if (params.filePath !== file.path) {
        panel.api.updateParameters({ filePath: file.path, readOnly: file.readOnly });
        panel.api.setTitle(basename(file.path));
      }
    }
  }

  for (const [paneId, panel] of current) {
    if (!desired.has(paneId)) {
      dockApi.removePanel(panel);
    }
  }

  if (activePaneId) {
    const panel = current.get(activePaneId) ?? dockApi.panels.find((p) => p.id === activePaneId);
    if (panel && !panel.api.isActive) panel.api.setActive();
  }
}, [dockApi, openFiles, activePaneId]);
```

User-initiated Dockview events translate into editor-machine intents (`onDidRemovePanel` → `closeTab(paneId)`, `onDidActivePanelChange` → `setActiveTab(paneId)`, `onDidMovePanel` → `reorderTabs(...)`); the reconciler then sees state and DOM already match and is a no-op. Persisted Dockview layout migrates one-shot at load: panel ids that look like legacy paths (`id.includes('/')`) are rewritten to fresh uuids with a `path → paneId` map kept long enough to remap the editor machine's restored `openFiles`.

### Why this matters for the rest of the audit

Once Option A lands:

- **F2** collapses — no `panelMigrated` event needed; the reconciler updates params + title in place.
- **F4** collapses for the same reason in the viewer panel (`viewId` is already a stable id; `entryFile` is a property rewritten by the reconciler).
- **F19** collapses — `filePath` does update on rename because the panel params are reconciled from `openFiles[i].path`.
- **F20** collapses — `handleCodeChange` reads the current `path` via a ref into the `openFiles` entry indexed by stable `paneId`, so the write target is always live (R16 reduces to "look up by paneId").
- **F21** collapses — `acquireModel`/`releaseModel` happen by stable `paneId`, the model service still migrates its own keying on the worker's rename event, and the two never cross-talk through path.
- **F27** collapses — `<Tabs key={paneId}>` instead of `key={filePath}`.

The reframed R3 captured in the Recommendations section is what gets implemented; `panelMigrated` is explicitly _not_ introduced.

## Findings

Findings are numbered, prioritised P0 (must-fix before launch), P1 (must-fix before broad rollout), P2 (UX/polish), and grouped by class.

### Class A — Broken Today (visible to any user)

#### Finding 1: Folder drag silently fails (P0)

**Symptom**: Dragging a folder in the explorer shows the drag affordance + drop highlight, but releasing does nothing.

**Root cause**: All three backend providers' `rename(from, to)` implementations are **file-only**:

```281:292:packages/filesystem/src/backend/direct-idb-provider.ts
  public async rename(from: string, to: string): Promise<void> {
    this._ensureOpen();
    if (!this._paths.has(from)) {
      throw this._enoent(from);
    }
    ...
  }
```

`_paths` is the file-only set; directories live in `_dirs`. A folder rename therefore throws `ENOENT(from)`. The same shape exists in `fs-access-provider.rename` (`readFileRaw(from)` only reads a file handle) and `memory-provider.rename`.

In the explorer's drag handler the throw is awaited inside a `for…of` loop:

```491:529:apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx
    async onDrop(draggedItems, target) {
      ...
      for (const item of draggedItems) {
        const oldPath = item.getId();
        ...
        await renameFile(oldPath, newPath);
        editorRef.send({ type: 'renameFile', oldPath, newPath });
      }
    },
```

`renameFile` rejects, the loop bails, no user-facing error toast fires (the error-toast wiring only listens to `contentService.onDidContentChange`, which is never invoked because the rename never succeeded).

**Impact**: Folders cannot be reorganised at all. Users have to delete and rebuild, losing any nested geometry/parameter cache.

**Fix preview**: Introduce a first-class `move(source, target, overwrite?)` primitive in `WorkspaceFileService` that handles both files and directories. The directory branch enumerates entries via `getDirectoryContents`, writes them all under the new prefix, and unlinks the old subtree atomically.

#### Finding 2: Renaming an open file leaks the old Dockview tab (P0)

**Symptom**: Rename `test.txt` → `test2.txt`. The new tab opens (image 4), but the old `test.txt` tab persists and shows "File not found" when activated (image 5).

**Root cause** (architectural, see the [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set) section): the editor machine and Dockview both store "what's open", both keyed by file path. There is no path-renaming event from one to the other, so the two stores drift the moment any path changes. The proximate code-level evidence is that `chat-editor-dockview.tsx` keys Dockview panels on `event.path`:

```352:401:apps/ui/app/routes/projects_.$id/chat-editor-dockview.tsx
    const openFileSub = editorRef.on('fileOpened', (event) => {
      ...
      const existingPanel = api.panels.find((p) => p.id === event.path);
      if (existingPanel) {
        existingPanel.api.setActive();
      } else {
        api.addPanel({
          id: event.path,
          component: 'editor',
          title: fileName,
          params: { filePath: event.path, readOnly: event.readOnly },
        });
      }
      ...
    });
```

The editor machine's `renameFile` action migrates the path inside `openFiles[]` but only re-emits `fileOpened` when the **active** file was the one renamed:

```547:556:apps/ui/app/machines/editor.machine.ts
      // Emit fileOpened for the renamed file so CAD machine updates its reference
      if (
        newActiveFilePath &&
        (context.activeFilePath === oldPath || context.activeFilePath?.startsWith(`${oldPath}/`))
      ) {
        enqueue.emit({
          type: 'fileOpened',
          path: newActiveFilePath,
        });
      }
```

The result is:

- The old panel (`id=oldPath`) is **never removed**.
- A new panel (`id=newPath`) is added when the renamed file was active, but never via a controlled migration — `addPanel` runs in `isSyncingFromMachine=true` so the `closeFile` event never fires for the old id.

There is no `fileRenamed` event in the editor machine's emitted union, and no listener anywhere in `chat-editor-dockview.tsx` for the `renamed` content-change event either.

**Impact**: Every rename of an open file leaves an orphaned tab. Closing it works (Dockview removes the panel), but the UX presents the user with a broken-looking second copy of their file. The same broken pattern applies to drag-rename (moves) of any open file.

**Fix preview**: Do _not_ introduce a synthetic `panelMigrated` event. Instead, make the editor machine the sole owner of the open-tab set (each entry keyed by a stable `paneId`, with `path` as a property), subscribe the machine to `onDidRunOperation(MOVE)`, and rewrite `path` in place on the matching `openFiles[i]`. Dockview becomes a `useEffect` reconciler that diffs the machine state against `dockApi.panels` and issues `addPanel`/`removePanel`/`updateParameters`/`setTitle`. See [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set) for the full design and the Option A/B/C trade-off; the consolidated recommendation is **R3**.

#### Finding 3: Folder rename via the Rename button silently fails (P0)

Same root cause as Finding 1 (providers can't rename a directory). The Rename button calls `void renameFile(oldPath, newPath)` (fire-and-forget) in `onRename`:

```540:556:apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx
      if (item.isFolder()) {
        // Remember if folder was expanded
        const wasExpanded = item.isExpanded();

        // Rename the folder directly - LightningFS supports directory rename natively
        void renameFile(oldPath, newPath);

        // Update file explorer paths atomically (no close/open to avoid fallback behavior)
        editorRef.send({ type: 'renameFile', oldPath, newPath });
        ...
      }
```

The comment "LightningFS supports directory rename natively" is stale — LightningFS was removed in the move to direct IDB/OPFS/FS Access providers. The provider promises reject, but the editor machine still ran `renameFile`, so the tree shows the new name briefly until the next worker tree refresh wipes it.

**Impact**: Folder renames appear to half-succeed (the tree label flickers to the new name) then revert. Open files under the folder lose their paths in the editor machine but the worker FS retains the old structure → editor tabs go stale.

#### Finding 4: Viewer panel does not migrate on rename (P0)

**Symptom**: A viewer panel rendering `main.ts` keeps `entryFile='main.ts'` after rename to `main2.ts`. `useFileTreeMap` returns no entry for `main.ts`, content service publishes `kind: 'orphaned'`, viewer shows "File not found" with a `FileSelector` fallback.

**Root cause**: Same architectural pattern as F2, but on the viewer side. `chat-viewer.tsx` is a Dockview panel keyed by `viewId` (already stable — does not change on rename), with `params.entryFile` as a value. `editorMachine.viewSettings[viewId].entryFile` is the persisted source of truth. Neither updates on rename. The same staleness affects `projectMachine.geometryUnits.get(entryFile)` — keyed on the pre-rename path.

**Impact**: All viewer panels for any file that gets renamed go orphaned. The reopen-renderer overlay is meaningless because the entry file no longer exists. The user has to manually pick a new file from the viewer's `FileSelector`.

**Fix preview**: The viewer panel id (`viewId`) is already stable, so this is even simpler than F2 — `editorMachine` rewrites `viewSettings[viewId].entryFile` in place on `onDidRunOperation(MOVE)`, the Dockview reconciler (same `useEffect` as F2's fix) calls `panel.api.updateParameters({ entryFile: newPath })` + `panel.api.setTitle`, and `projectMachine` participates separately to re-key `geometryUnits` (F5 / R3-participants).

#### Finding 5: Project "main" pointer goes stale (P1)

`apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx:231–235` reads `project.assets.mechanical.main` to seed the initial open file. Renaming the main file silently invalidates this pointer, and `projectMachine.mainEntryFile` (used for the export action, parameter pane defaults, and CAD bootstrap) stays pinned to the old path until the next route reload, at which point the `main` field still has the old value because no one wrote it back.

**Impact**: Renaming `main.ts` is effectively forbidden — the project loses its entry-file identity. On reload the editor opens the old (now non-existent) main and shows "File not found".

### Class B — Latent Bugs (broken under specific user flows)

#### Finding 6: Drag of an open file leaks tabs the same way rename does (P0)

The drag handler at `chat-editor-file-tree.tsx:491–529` performs `renameFile(oldPath, newPath)` then `editorRef.send({ type: 'renameFile' })`. The Dockview consequences are identical to Finding 2 — moving a file out of folder `a/` into folder `b/` (via drag) leaks the `a/file.ext` panel in the editor.

#### Finding 7: Drag of multiple selected items is non-atomic and partial-failure unsafe (P1)

`onDrop`:

```509:528:apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx
      // Move each dragged item
      for (const item of draggedItems) {
        ...
        await renameFile(oldPath, newPath);
        editorRef.send({ type: 'renameFile', oldPath, newPath });
      }
```

A single failure (target name collision, provider error, etc.) aborts the loop. Already-moved items remain at their new locations; pending items remain at the old. No transaction / rollback. No user-visible report of which subset moved.

VS Code uses `applyBulkEdit(resourceFileEdits, { undoLabel, progressLabel })` (see `explorerViewer.ts:1991–2025`) so the user gets a single undoable transaction, a conflict prompt with overwrite confirmation, and a progress UI for large moves.

#### Finding 8: Delete of a directory does not flush open files atomically (P1)

`confirmDelete` in `chat-editor-file-tree.tsx:847–883`:

```javascript
if (isFolder && treeService) {
  void treeService.deleteDirectory(path);
  // Close any open files under this directory
  for (const [key] of fileTreeMap) {
    if (key.startsWith(`${path}/`)) {
      ...
      editorRef.send({ type: 'closeFile', path: key });
    }
  }
}
```

The deletion is fire-and-forget (`void treeService.deleteDirectory(path)`). If the worker delete fails part-way, the editor machine has already closed every tab under the directory while the actual files still exist on disk. The user then sees an empty file tree (closed tabs) but the files reappear on next worker re-sync.

Worse, `treeService.deleteDirectory` (`packages/fs-client/src/file-tree-service.ts:366–406`) walks the lazy tree, not the worker's authoritative directory. If sub-directories haven't been listed yet, they are skipped: only files known to the tree get unlinked, then `rmdir` is called on each parent (which **fails** if unlisted children still exist). Result: partial deletion with phantom files left behind under the old path.

**Status after 2026-05-21 refresh**: half-built. `WorkspaceFileService.rmdir(path, { scope, recursive: true })` now exists for explicit-scope recursive removal; the explorer can switch off the lazy-tree walker by routing folder deletes through `client.rmdir(path, { scope, recursive: true })`. The mount-routed recursive branch (`rmdir({ recursive: true })` without scope) deliberately throws, so the migration path is "pass the active workspace's scope explicitly". See R5 status note.

#### Finding 9: Rename collision and overwrite go undetected (P1)

`onRename` and `onDrop` compute `newPath` without checking `allPaths`. Provider `rename` on IDB does `_idbPut(to, data); _idbDelete(from)` — it silently overwrites an existing file at `to`. FS Access does the same via `writeFile`. There is no overwrite confirmation, no `canMove`/`canRename` preflight, no `targetFolder/{name} already exists` toast.

Pending-input dialogs (`PendingFolderInput.validate`, `PendingFileInput.validate`) DO check `allPaths.has(fullPath)` but rename does not, despite the same risk.

#### Finding 10: Same-name move yields silent data loss (P1)

Drag `a/foo.ts` onto a folder `b/` already containing `b/foo.ts`. The move overwrites `b/foo.ts` without any prompt. VS Code's `doHandleExplorerDropOnMove` (`explorerViewer.ts:1988–2026`) catches `FileOperationResult.FILE_MOVE_CONFLICT`, surfaces `getMultipleFilesOverwriteConfirm`, and re-runs the bulk edit only if the user accepts.

#### Finding 11: Cross-mount move falls back to silent copy+delete (P1)

`WorkspaceFileService.rename`:

```390:417:packages/filesystem/src/workspace-file-service.ts
  public async rename(from: string, to: string, context?: WorkspaceMutationContext): Promise<void> {
    return this._resourceQueue.queueFor(from, async () => {
      const source = this._resolveProvider(from);
      const target = this._resolveProvider(to);

      if (source.provider === target.provider) {
        await source.provider.rename(source.path, target.path);
      } else {
        console.warn('[WorkspaceFileService] Cross-mount rename: copy+delete', from, '->', to);
        const data = await source.provider.readFile(source.path);
        await target.provider.writeFile(target.path, data);
        await source.provider.unlink(source.path);
      }
      ...
```

The cross-mount path also reads a **single** file — folder moves across mounts (e.g. bundled-types overlay → user workspace) silently lose every nested file beyond the root. The `console.warn` is the only telemetry.

#### Finding 12: Worker `fileRenamed` event reaches the file-tree service, but not the editor / dockview / viewer (P1)

`FileContentService` already listens to the worker's `fileRenamed` change event and migrates outcomes (`file-content-service.ts:605–622`). The editor machine, Dockview, and viewer do not. This means that even if a rename happens **outside** the explorer (CLI tool call, external workspace handle), the editor tabs go stale exactly the same way as Finding 2.

This is the smoking gun for the "agents that move files break the UI" class — the `edit_file` / `rename_file` chat tool will produce the same orphan tab the manual Rename button does.

### Class C — Missing Primitives (no path forward without them)

#### Finding 13: No `move` primitive (P0)

`FileSystemClient.rename` is single-file. `WorkspaceFileService.rename` calls `provider.rename` (single-file). No backend exposes `renameDirectory` / `moveDirectory`. The only directory-mutation primitives are `copyDirectory` (recursive copy) and `deleteDirectory` (recursive delete via the tree service walk).

#### Finding 14: No `createFolder` primitive (P1)

Folder creation uses a `.gitkeep` workaround:

```1215:1230:apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx
                  onSubmit={(name) => {
                    const gitkeepPath = `${name}/.gitkeep`;
                    void writeFile(gitkeepPath, encodeTextFile(''), {
                      source: 'user',
                    });
                    setPendingFolder(undefined);
                    setExpandedItems((previous) => [...previous, name]);
                  }}
```

`FileSystemClient.mkdir` exists, but it is never wired from the UI for explicit folder creation. The `.gitkeep` hack:

- Leaves a permanent placeholder file the user must manually delete to "empty" the folder.
- Confuses tool-driven flows (`list_dir`, `grep_search`) that have to filter `.gitkeep` out.
- Conflicts with users whose actual `.gitkeep` files have meaningful content.

**Status after 2026-05-21 refresh**: worker-layer resolved. `WorkspaceFileService.mkdir(path, { recursive? })` + `FileSystemClient.mkdir` + `useFileManager().mkdir(...)` are wired end-to-end and emit a `directoryChanged` event. The UI's `.gitkeep` workaround in `chat-editor-file-tree.tsx` is now the only remaining piece — it needs a one-line replacement to `fileManager.mkdir(name, { recursive: true })`. See R4 status note.

#### Finding 15: No `copy` primitive for files (P2)

`contentService.duplicate(source, dest)` reads bytes then writes them — that's the explorer's "Duplicate" action. It is **same-folder only** because the explorer derives the destination from the source's parent directory:

```890:935:apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx
      ...
      for (const item of items) {
        const originalPath = item.getId();
        ...
        const directory = originalPath.includes('/') ? parentDirectory(originalPath) : '';
        ...
        let duplicateName = `${baseName} copy${extension}`;
        let duplicatePath = directory ? `${directory}/${duplicateName}` : duplicateName;
        ...
      }
```

There is no cross-folder copy action (Cmd-C / Cmd-V), no drag-with-modifier-key copy, no `copy(folder, dest)` API for folders.

#### Finding 16: No `onDidRunOperation` channel (P0)

The closest equivalent is `FileContentService.onDidContentChange`, which fires for `written | read | renamed | deleted | batchWritten` events. It is **content-scoped** — directory operations don't appear (no `directoryCreated`, no `directoryDeleted`, no `directoryMoved`), and the payload doesn't carry the new stat. Consumers wanting "the file was just moved, give me the new full path + stat" have to assemble it from path manipulations.

A canonical `IFileOperationEvent` channel emitting `CREATE | DELETE | MOVE | COPY | WRITE` with a target stat (mirroring `repos/vscode/.../files.ts:940–972`) would:

- Let Dockview migrate tabs on `MOVE` without the explorer having to manually `editorRef.send({ renameFile })`.
- Let the project machine update `mainEntryFile` and `assets.mechanical.main` on `MOVE` of any file whose path matches.
- Let the geometry-unit registry remap its Map key on `MOVE`.
- Let the parameter cache invalidate on `DELETE` / `MOVE`.
- Let the viewer migrate its `entryFile` on `MOVE`.

**Status after 2026-05-21 refresh**: largely landed. The canonical `ChangeEvent` discriminated union exists in `@taucad/types` (`fileWritten | fileDeleted | fileRenamed | directoryChanged | backendChanged`) and is emitted worker-side via `ChangeEventBus`. `WorkerChangeChannel` re-emits workspace-relative variants to main-thread subscribers. `WorkspaceMutationContext.originClientId` + `tagEventOrigin` give participants the self-skip primitive they need. The remaining gaps are:

- **No explicit `COPY` discriminator** — today's copies surface as `fileWritten` (per-file) or `batchWritten` (aggregated on the content channel); a participant that needs to mirror state on COPY cannot distinguish it from a regular WRITE.
- **CREATE for files vs. folders is conflated** — files announce themselves as `fileWritten`, folders as `directoryChanged`; the participant has to know the path semantics to interpret.
- **MOVE does not carry the target stat** — `fileRenamed` payload is `{ oldPath, newPath, backend }` without size/mtime; a participant has to re-stat to learn the new file's metadata.

R2 reframes accordingly from "introduce the channel" to "extend the existing channel with COPY + file/folder CREATE distinction + target stat".

#### Finding 17: No `canMove`/`canRename`/`canDelete` preflight (P1)

VS Code's `IFileService.canMove(source, target, overwrite?)` returns `Error | true` without performing the mutation, so the UI can validate before showing the rename confirm or drag-drop overwrite prompt. Tau has no equivalent; the only validation is `allPaths.has(fullPath)` performed manually inside `PendingFolderInput`/`PendingFileInput` and not at all during rename/drag.

**Status after 2026-05-21 refresh**: partially mitigated on the error axis. Typed errors with stable `code` discriminators (`MissingWorkspaceHandleError`, `WorkspaceDirectoryRequiredError`, `WorkspaceScopeViolationError`, `FileManagerNotReadyError`) are now thrown at the right boundaries; `FileContentService.rename`/`delete`/`duplicate` throw `WorkspaceScopeViolationError` synchronously before any worker round-trip. UI surfaces switch on `error.code` rather than parsing strings (`apps/ui/app/filesystem/workspace-errors.ts`, `apps/ui/app/routes/projects_.$id/file-manager-error.tsx`). The remaining gap is the **preflight** itself — a `canMove(source, target, { overwrite? })` call that returns `Error | true` without performing the mutation, so the explorer can validate before showing the confirm prompt. The typed-error half of R6 is done; the can-API half is not.

### Class D — Missing UX (table-stakes for an editor)

#### Finding 18: No keyboard copy/cut/paste (P2)

The explorer supports Delete via the `customDelete` hotkey (line 578) but **no** copy (Cmd-C), cut (Cmd-X), or paste (Cmd-V). Drag-with-Ctrl-as-copy (the VS Code `isCopy = (originalEvent.ctrlKey && !isMacintosh) || (originalEvent.altKey && isMacintosh)` pattern) is also missing.

Other missing UX (lower priority but worth surfacing):

- Drag-to-OS desktop (export folder via OS file drop) — not implemented.
- "Reveal in OS file explorer" — N/A (browser-only), but no equivalent "Reveal in workspace" cross-link.
- Multi-select range with Shift-click — partially works via headless-tree's `selectUpTo`, but no visual indicator.
- "Find references" / "Find in folder" from a context menu — only "Search files" (global) exists.
- Rename on F2 — works (headless-tree default), but no on-screen hint.
- Conflict-handling dialogs ("name already exists" with rename/overwrite/cancel) — replaced with inline `PendingFolderInput.error`.

### Class E — Monaco Code Viewer Surface (file-rename downstream effects)

#### Finding 19: Stale `filePath` propagates through every viewer registry component (P0)

`chat-editor-code-viewer.tsx`, `chat-editor-markdown-viewer.tsx`, `chat-editor-plan-viewer.tsx`, and `chat-editor-breadcrumbs.tsx` all read `filePath` from props and re-derive their entire state from it (Monaco `path` URI, breadcrumb segments, `FileSelector` `parentPath`, `<Tabs key={filePath}>` mount key, `MarkdownViewerChat` content body). Because the Dockview panel id and `panel.params.filePath` are never updated by the rename flow (Finding 2), every prop in this stack stays frozen at the pre-rename path forever. Breadcrumbs show the old path, breadcrumb `FileSelector` queries a `parentPath` that may not exist (especially after a folder rename), Monaco's URI points at the disposed model — the entire viewer is internally consistent but bound to a path the worker no longer knows.

This is a direct downstream consequence of the dual-store problem described in [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set). Under R3 (Option A), the reconciler calls `panel.api.updateParameters({ filePath: newPath })`; React re-renders the `FileEditor` with the fresh prop and every downstream component sees the new path on the next commit. No per-component event subscription required.

#### Finding 20: `handleCodeChange` writes back to the stale path (P0 — data corruption)

`chat-editor-dockview.tsx:139–151` closes over `filePath` in the write-back callback:

```text
const handleCodeChange = useCallback(
  (value) => {
    if (readOnly) return;
    const encoded = encodeTextFile(value ?? '');
    void fileManager.writeFile(filePath, encoded, { source: 'editor' });
  },
  [readOnly, fileManager, filePath],
);
```

After a rename, the leaked tab's `filePath` is still the old path. The Monaco model service has already disposed the old URI's model (correctly) and migrated the new one (also correctly). But Monaco's `<Editor keepCurrentModel>` instance inside the leaked panel keeps its own reference and creates a fresh empty model for the disposed URI when the user clicks back to the tab — pre-populated with `defaultValue={content}` (the **cached pre-rename bytes**). If the user types anything in that tab, `handleCodeChange` fires `fileManager.writeFile(oldPath, …)` and **resurrects the file at the pre-rename path** with the cached content plus the new edits. End state: two copies of the file, the old one containing edits the user thought they were making to the new one.

This is data corruption, not just a UI glitch. It must be P0.

**Fix shape under R3**: with the editor machine as sole source of truth and panels keyed by stable `paneId`, `handleCodeChange` looks up the current `path` from `openFiles.find(f => f.paneId === panelId)?.path` via a ref. The closure never closes over a string path. If `openFiles[i].path` updates in place on rename, the write target is always live by construction (R16).

#### Finding 21: `acquireModel(stalePath)` mis-decrements the ref count on the wrong path (P1)

`FileEditor`'s effect at `chat-editor-dockview.tsx:154–163` calls `modelService.acquireModel(filePath)` on mount and `modelService.releaseModel(filePath)` on unmount. The rename handler in `monaco-model-service.ts` migrates the ref-counted hold from `oldPath` to `newPath` internally, so the new model is held under the new key. But the leaked panel still holds the old key in its effect closure; when the user finally closes the leaked tab, `releaseModel(oldPath)` decrements a **non-existent** counter (best case) or — if a non-host re-acquired the same old path in the interim — decrements the wrong one. The bug is subtle (it cancels itself in the typical flow) but the invariant is broken.

**Fix shape under R3**: acquire/release happen by stable `paneId` translated through the live `openFiles[paneId].path` lookup; the model service still migrates its own keying on the worker's rename event but the editor never holds a stale path across the boundary.

#### Finding 22: No "update imports on file rename" refactor (P1)

VS Code's TypeScript extension subscribes to `IFileService.onDidRunOperation(MOVE)` and runs `getEditsForFileRename(source, target)` against the TS server, producing a workspace edit that rewrites every `import` / `require` path that pointed at the moved file (`repos/vscode/extensions/typescript-language-features/src/languageFeatures/updatePathsOnRename.ts:223`). Tau ships a `MaterializingRenameAdapter` that handles **symbol** rename inside one file but has no file-rename refactor wiring. Renaming `lib/util.ts` → `lib/utility.ts` leaves every `from './util'` broken with no prompt and no automatic fix.

#### Finding 23: No dirty / save / revert axis (P1)

Every keystroke executes `fileManager.writeFile(filePath, encoded, { source: 'editor' })` with no debounce, no dirty flag, no Cmd-S concept, no `revert`, no "you have unsaved changes" prompt, and no untitled buffers. Implications:

- **Race-prone**: fast typing queues parallel writes through the worker proxy; ordering is undefined if the worker round-trips out of order.
- **No safety net**: a single keystroke commits irreversibly. The previous bytes are gone the moment the next character is typed.
- **Agent collisions**: when the chat agent calls `edit_file` mid-typing, the user's just-typed bytes are clobbered with no `queueModelReload`-style "file changed on disk; reload, overwrite, compare?" prompt. VS Code's `TextFileEditorModel` handles this exact scenario (`repos/vscode/src/vs/workbench/services/textfile/common/textFileEditorModelManager.ts`).
- **No untitled buffers**: the explorer's "New File" flow forces the user to commit to a filename before typing one character of content. There is no scratch buffer.

#### Finding 24: No save participants (`onWillSave` / `onDidSave`) (P2)

Inverse of Finding 23. Because there is no save concept, there is no extension point for format-on-save (Prettier), lint-on-save (ESLint), trim-trailing-whitespace, organise-imports, or any of the dozens of editor-extension hooks that VS Code's `IStoredFileWorkingCopySaveParticipant` exposes.

#### Finding 25: No diff editor (P2)

There is no `monaco.editor.createDiffEditor` mounted anywhere in the application. The agent's `edit_file` tool renders diffs inside chat messages, but the user cannot:

- Compare two arbitrary files ("Compare with…").
- View the diff between the live model and the last-saved bytes ("Compare Active File with Saved" — irrelevant today because of Finding 23 but a hard requirement once dirty state lands).
- Preview a bulk-edit before applying it (prerequisite for Recommendation R10 — bulk-edit + undo on multi-item drag).

The CSS variable `--vscode-multiDiffEditor-background` is overridden in `code-editor.client.tsx:232` for a feature that doesn't exist yet.

#### Finding 26: No untitled buffers (P2)

VS Code's `untitled://` URIs let the user type first and name later. Tau has no equivalent — "New File" demands a filename and extension before mounting an editor. Combined with Finding 23 (no dirty state), this means the user must always commit to disk before they have anything to commit.

#### Finding 27: `<Tabs key={filePath}>` will reset on rename once the path actually updates (P2)

`chat-editor-markdown-viewer.tsx:20` keys the Preview/Markdown tab on `filePath`. Today the key never changes (Finding 19), so the bug is masked. Once R3 makes `filePath` update on rename, the markdown viewer's mount key will change too, blowing away the user's tab selection (Preview vs. Markdown) on every rename. The key should be the stable `paneId` (passed down from the Dockview panel id under R3, see [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set)). Captured as R21 — landing it in the same change as R3 prevents the regression from ever being user-visible.

#### Finding 28: Breadcrumb `FileSelector` points at a non-existent parent after folder rename (P2)

Each breadcrumb in `chat-editor-breadcrumbs.tsx:40–49` derives `parentPath` from `filePath.split('/').slice(0, index)`. After a folder rename (Findings 1, 3), opening the `FileSelector` queries a directory that the worker has never heard of; the dropdown shows an empty result. Once Findings 1/3 are fixed and Finding 19 is mitigated, this resolves itself — listing F28 explicitly so it doesn't get missed during the migration.

## VS Code Prior Art

VS Code centralises the entire mutation surface on two services:

### `IFileService` — bytes & metadata layer

`repos/vscode/src/vs/platform/files/common/files.ts:28–270` defines the workbench-wide file primitives. Key methods:

| Method                                          | Folder support? | Returns stat? | Emits `FileOperation` |
| ----------------------------------------------- | --------------- | ------------- | --------------------- |
| `writeFile(resource, buffer, options?)`         | n/a (file)      | yes           | WRITE                 |
| `move(source, target, overwrite?)`              | **yes**         | yes           | MOVE                  |
| `copy(source, target, overwrite?)`              | **yes**         | yes           | COPY                  |
| `cloneFile(source, target)`                     | no (file)       | no            | n/a                   |
| `createFile(resource, buffer?, options?)`       | n/a (file)      | yes           | CREATE                |
| `createFolder(resource)`                        | **yes**         | yes           | CREATE                |
| `del(resource, { recursive?, useTrash? })`      | **yes**         | n/a           | DELETE                |
| `canMove`/`canCopy`/`canCreateFile`/`canDelete` | preflight       | n/a           | n/a                   |

A single `readonly onDidRunOperation: Event<FileOperationEvent>` channel emits a discriminated union:

```940:972:repos/vscode/src/vs/platform/files/common/files.ts
export const enum FileOperation {
  CREATE,
  DELETE,
  MOVE,
  COPY,
  WRITE
}

export interface IFileOperationEvent {

  readonly resource: URI;
  readonly operation: FileOperation;

  isOperation(operation: FileOperation.DELETE | FileOperation.WRITE): boolean;
  isOperation(operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY): this is IFileOperationEventWithMetadata;
}

export interface IFileOperationEventWithMetadata extends IFileOperationEvent {
  readonly target: IFileStatWithMetadata;
}
```

Every move/copy/create operation returns `IFileStatWithMetadata` so consumers don't need to re-stat the target.

### `IWorkingCopyFileService` — editor / open-document layer

`repos/vscode/src/vs/workbench/services/workingCopy/common/workingCopyFileService.ts:157–266` layers on three event channels:

- `onWillRunWorkingCopyFileOperation` — fired before the file op; participants can join a long-running promise to capture state (e.g. dirty text content, encoding, language).
- `onDidRunWorkingCopyFileOperation` — fired after; participants restore state at the new location.
- `onDidFailWorkingCopyFileOperation` — fired on failure; participants undo their partial state changes.

`textFileEditorModelManager.ts:189–326` shows the editor's pattern:

- **Before** a MOVE: remember every text model whose URI is `isEqualOrParent(model.resource, source)` plus its dirty snapshot, language, encoding.
- **After** the MOVE: re-resolve each remembered model at its new URI, restore dirty content, restore explicit language id.
- **On failure**: re-mark the dirty flag.

This pattern works for **directory** moves too — every model under the moved directory is migrated atomically without the explorer knowing they existed.

### Bulk edit / undo

VS Code's drag handler builds a `ResourceFileEdit[]` array and pushes it through `explorerService.applyBulkEdit(edits, options)` (see `explorerViewer.ts:1988–2026`). The bulk edit:

- Is registered with the undo stack — a single Cmd-Z undoes the whole drag.
- Detects `FileOperationResult.FILE_MOVE_CONFLICT` and surfaces an overwrite-confirm dialog.
- Reports progress for large moves.
- Coalesces children when a parent folder is also being moved.

### `IEditorService` + `IEditorGroupsService` — the open-tab-set layer

The pair that anchors the [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set):

- **`IEditorService`** (`repos/vscode/src/vs/workbench/services/editor/common/editorService.ts`) owns _editor inputs_ — `EditorInput` instances whose URI is a property. `openEditor`, `closeEditor`, `replaceEditors`, `openEditors`, `getEditors(EditorsOrder)` form the API. The set of open editors lives here, not in the UI.
- **`IEditorGroupsService`** (`repos/vscode/src/vs/workbench/services/editor/common/editorGroupsService.ts`) owns _groups_ — the split-pane layout. Each `IEditorGroup` exposes `openEditor`, `closeEditor`, `moveEditor`, `getEditor(index)`, `activeEditor`. The grid splitter and tab control are render-only views over this model.

Together they implement the "stable input identity, URI as property, UI is render-only" pattern that makes rename a trivial mutation in VS Code:

1. `IWorkingCopyFileService.onWillRunWorkingCopyFileOperation(MOVE)` fires.
2. `TextFileEditorModelManager` re-resolves the working copy under the new URI in place.
3. Tabs derive `editor.getName()` from the input's current URI — the label re-renders automatically.

The lesson directly drives R3: editor machine = `IEditorService`-equivalent (owns the open-tab set + `paneId` identities), Dockview = `IEditorGroupsService`-equivalent (owns layout), and the React render is the equivalent of the tabs control / grid splitter (derives from the two stores, owns nothing).

## Recommendations

Numbered recommendations with priority, effort estimate, and the findings they close.

| #      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Priority | Effort | Closes                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------------------------------- |
| **R1** | Introduce `move(source, target, { overwrite? }): Promise<FileStat>` on `WorkspaceFileService`, the worker `FileSystemClient` RPC, and `FileContentService`. The directory branch walks the source subtree (via `getDirectoryContents` style enumeration), writes every file under the new prefix, deletes the old subtree, all inside one resource-queue critical section. Backend providers gain a directory-aware `rename` that the workspace service calls when source and target resolve to the same provider; otherwise the service falls back to copy+delete with the **directory** branch (today's cross-mount fallback is single-file).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | P0       | M      | F1, F3, F6, F11, F13               |
| **R2** | **Reframed post-2026-05-21**: the canonical `ChangeEvent` union + `ChangeEventBus` + `WorkerChangeChannel` + `WorkspaceMutationContext.originClientId` already exist (see [Recent Filesystem Stack Evolution](#recent-filesystem-stack-evolution-2026-05-21)). The remaining work is to **extend** the existing union with (a) an explicit `fileCopied` / `directoryCopied` discriminator so participants can react to COPY without conflating it with WRITE, (b) a `directoryCreated` / `directoryDeleted` split distinct from the coarse `directoryChanged`, and (c) a `target?: FileStat` payload on `fileRenamed`/`fileCopied`/`fileWritten`/`directoryCreated` so participants don't have to re-stat to learn the new metadata. `FileContentService.onDidContentChange` already routes through the channel — no compat shim needed, just additive discriminators.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P0       | S      | F2, F4, F5, F12, F16               |
| **R3** | Make the **editor machine the sole source of truth** for the open-tab set and migrate Dockview to a reconciler render. Concretely: (a) add a stable `paneId: string` (uuid) to each `openFiles[i]`, with `path`/`readOnly` as properties; rename `activeFilePath` → `activePaneId`; (b) subscribe the editor machine to `onDidRunOperation` (R2) and rewrite `openFiles[i].path` + `viewSettings[viewId].entryFile` in place on MOVE, drop on DELETE; (c) rewrite `chat-editor-dockview.tsx` so panels are keyed by `paneId`, params come from a `useEffect` that diffs `openFiles` against `dockApi.panels` and issues `addPanel`/`removePanel`/`updateParameters`/`setTitle` to converge; (d) translate Dockview's user-initiated events (`onDidRemovePanel`, `onDidActivePanelChange`, `onDidMovePanel`) into editor-machine intents so the reconciler is a no-op on the next tick; (e) one-shot migration of persisted `editorLayout`: rewrite legacy path-as-id panel ids to fresh uuids, keep a `path→paneId` map long enough to remap restored `openFiles`. **No `panelMigrated` event is introduced.** `projectMachine` still registers a participant for `geometryUnits` re-keying, `mainEntryFile`, and persisted `assets.mechanical.main` — those genuinely are separate stores with separate owners and earn the participant pattern. See [Architectural Reframing](#architectural-reframing-single-source-of-truth-for-the-open-tab-set) for the Option A/B/C analysis. | P0       | M      | F2, F4, F5, F6, F19, F20, F21, F27 |
| **R4** | **Reframed post-2026-05-21**: the `mkdir(path, { recursive? })` primitive already exists end-to-end (`WorkspaceFileService` → `FileSystemClient` → `useFileManager().mkdir`). The remaining work is UI-only: replace the `.gitkeep` workaround in `chat-editor-file-tree.tsx`'s new-folder pending input with `await fileManager.mkdir(name, { recursive: true })`, and delete every consumer-side filter for `.gitkeep`. Migration note: existing projects that contain real `.gitkeep` files keep them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P0       | XS     | F14                                |
| **R5** | **Reframed post-2026-05-21**: `WorkspaceFileService.rmdir(path, { scope, recursive: true })` exists for explicit-scope recursive removal, deliberately throwing on mount-routed `{ recursive: true }`. The remaining work is to (a) migrate `confirmDelete` in the explorer to `await fileManager.client.rmdir(path, { scope: activeWorkspaceScope, recursive: true })` for folders, (b) delete the lazy-tree-walking `treeService.deleteDirectory` implementation, and (c) decide whether to lift the explicit-scope requirement to a mount-routed code path (the stricter requirement avoids cross-workspace surprise deletes, which is the architecturally cleaner choice — recommendation is to keep it and document it explicitly).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P0       | S      | F8                                 |

P1 layer (must-fix before broad rollout):

| #      | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority                                                                                                                                                                                                                                                 | Effort | Closes  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | ------------ |
| **R6** | **Half-mitigated post-2026-05-21**: typed errors with stable `code` discriminators (`MissingWorkspaceHandleError`, `WorkspaceDirectoryRequiredError`, `WorkspaceScopeViolationError`, `FileManagerNotReadyError`) are already thrown at the right boundaries; UI surfaces switch on `error.code` rather than parsing strings. The remaining half is the **preflight** itself: introduce `canMove(source, target, { overwrite? })` / `canRename` / `canCreate` / `canDelete` returning `true | Error`(re-using the existing typed-error union) without performing the mutation. The explorer's drag, rename, and delete handlers call these before mutating and surface`error.code`-based copy in a toast / inline error instead of failing mid-flight. | P1     | S       | F9, F10, F17 |
| **R7** | Replace the explorer's per-item `for…of` drag loop with a single `bulkMove(edits)` call that wraps every operation in a worker-side transaction and surfaces a single toast on partial failure (with the count of moved + failed items). For now the "transaction" can be best-effort + rollback-on-error; full undo is R10.                                                                                                                                                                | P1                                                                                                                                                                                                                                                       | M      | F7      |
| **R8** | Add a "name already exists at this location" overwrite confirmation dialog reused across rename, drag, and paste flows. Mirror VS Code's `getMultipleFilesOverwriteConfirm` with a "do not ask again" checkbox.                                                                                                                                                                                                                                                                             | P1                                                                                                                                                                                                                                                       | S      | F9, F10 |
| **R9** | Drop the "directory-walking" deleteDirectory implementation in favour of a worker-side recursive primitive (R5). The IndexedDB provider can do this in a single `IDBTransaction`; the FS Access provider has native `removeEntry(name, { recursive: true })`; the in-memory provider walks `_paths` by prefix.                                                                                                                                                                              | P1                                                                                                                                                                                                                                                       | S      | F8      |

P2 layer (UX polish):

| #       | Action                                                                                                                                                                                                                                                                                                      | Priority                                                                                                                                                    | Effort                                  | Closes |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ | --- | --- |
| **R10** | Introduce an undo/redo stack for explorer mutations. Every R7 `bulkMove`/`bulkDelete`/`createFolder` returns a `ResourceFileEdit[]` with an `undo()` continuation. Keyboard binding: Cmd-Z / Cmd-Shift-Z while the explorer has focus. Mirrors VS Code's `applyBulkEdit({ undoLabel, confirmBeforeUndo })`. | P2                                                                                                                                                          | L                                       | F7     |
| **R11** | Add explorer-scoped Cmd-C / Cmd-X / Cmd-V handlers. The model is a per-tab clipboard: copy/cut writes a `{ paths, operation: 'copy'                                                                                                                                                                         | 'cut' }`payload to`navigator.clipboard.writeText(JSON.stringify(…))`(or in-memory state) and paste invokes`bulkCopy`/`bulkMove` against the focused folder. | P2                                      | M      | F18 |
| **R12** | Add Ctrl-as-copy drag modifier (Alt on macOS) mirroring VS Code's `isCopy = (originalEvent.ctrlKey && !isMacintosh)                                                                                                                                                                                         |                                                                                                                                                             | (originalEvent.altKey && isMacintosh)`. | P2     | S   | F18 |
| **R13** | Surface conflict / progress UI via a single `<ExplorerOperationProgress>` overlay tracked from `WorkspaceFileService`'s `onDidRunOperation` channel — the user can see "Moving 23 files to `lib/`…" with a cancel button. Replaces the silent fire-and-forget pattern.                                      | P2                                                                                                                                                          | M                                       | F7     |
| **R14** | Sweep every persisted store for stale paths after any `move`: chat `@path` chips, parameter cache, telemetry hashes, recently-opened lists. Driven entirely off the `onDidRunOperation` MOVE channel.                                                                                                       | P2                                                                                                                                                          | S                                       | F12    |
| **R15** | Document the new mutation surface in `docs/policy/filesystem-policy.md` and add a `filesystem-rename-architecture.md` companion that enumerates the participant pattern (mirrors `runtime-event-driven-api-blueprint-v5.md`'s structure).                                                                   | P2                                                                                                                                                          | S                                       | n/a    |

Code-viewer surface (depends on R2/R3):

| #       | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Priority | Effort | Closes |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| **R16** | After R3 lands, change `handleCodeChange` to look up the current `path` from the editor machine via the panel's stable `paneId` (`openFiles.find(f => f.paneId === panelId)?.path`) through a ref, so the write target always reflects the live `openFiles[i].path`. Add an integration test that types into the editor _after_ a rename and asserts the write goes to the **new** path. If R3 has to ship in two phases, gate the editor's Monaco `<CodeEditor>` behind `key={paneId}` and disable `onChange` whenever the resolved `openFiles[i]` is missing, so the data-corruption path (F20) cannot occur even during the transition. | P0       | S      | F20    |
| **R17** | Wire the TypeScript file-rename refactor: in the FileOperationParticipant for `move`, call the TS worker's `getEditsForFileRename(source, target)` and apply the returned text edits as a single bulk edit atomically with the move. Mirror `repos/vscode/extensions/typescript-language-features/src/languageFeatures/updatePathsOnRename.ts:223`. Invalidate the TS worker's project graph for the affected files so diagnostics regenerate.                                                                                                                                                                                             | P1       | M      | F22    |
| **R18** | Introduce a `dirty / save / revert` axis on text-editor models. Adopt the VS Code `TextFileWorkingCopy` shape: in-memory edits separate from on-disk bytes, `isDirty()`, Cmd-S `save()`, Cmd-Shift-S "Save As…", "Revert File", untitled buffers via an `untitled://` URI scheme, and an external-write reconciliation prompt ("Reload" / "Overwrite" / "Compare") modelled on `textFileEditorModelManager.queueModelReload`. Auto-save remains the default (preserves today's UX) but is configurable per workspace. Resolves the agent-overwrite race and unlocks R19/R20.                                                               | P1       | L      | F23    |
| **R19** | Once R18 lands, expose `onWillSave(participant)` and `onDidSave(participant)` channels so formatters, linters, organisers, and VCS hooks can participate. Wire Prettier + ESLint on save as the first concrete consumer.                                                                                                                                                                                                                                                                                                                                                                                                                   | P2       | M      | F24    |
| **R20** | Add a diff editor surface (`monaco.editor.createDiffEditor`) for "Compare with…", "Compare Active File with Saved" (post-R18), and bulk-edit preview (prerequisite for R10).                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P2       | M      | F25    |
| **R21** | Key `<Tabs>` in `chat-editor-markdown-viewer.tsx` on the stable `paneId` (Dockview panel id under R3) instead of `filePath`. Pass `paneId` as a prop through the viewer registry so every viewer that wants identity-stable React keys can use it. Audit every `key={filePath}` use across the editor for the same anti-pattern (currently only the markdown viewer). Land in the same change as R3 so the F27 regression is never user-visible.                                                                                                                                                                                           | P2       | S      | F27    |

## Cross-Surface Impact Matrix

Tracking which surfaces must subscribe to which operation types (post-R2/R3):

Surfaces are split into **stores** (own state, subscribe to operation events to mutate themselves) and **renders** (derive state from a store, reconciled on render — no event subscription needed).

| Surface                                            | Kind   | CREATE             | DELETE                                   | MOVE                                                               | COPY                     | WRITE                    |
| -------------------------------------------------- | ------ | ------------------ | ---------------------------------------- | ------------------------------------------------------------------ | ------------------------ | ------------------------ |
| `BoundedFileCache`                                 | store  | n/a                | invalidate                               | migrate (file) / drop subtree (dir)                                | clone                    | invalidate               |
| `FileContentService.outcomes` map                  | store  | n/a                | publish `orphaned`                       | re-publish under newPath                                           | n/a                      | re-publish               |
| `FileContentService.pendingResolves` map           | store  | n/a                | drop                                     | re-key                                                             | n/a                      | drop                     |
| `FileTreeService` lazy tree                        | store  | add                | remove                                   | migrate prefix                                                     | add subtree              | refresh stat             |
| `editorMachine.openFiles[paneId].path`             | store  | append entry       | drop entry                               | rewrite `path` in place                                            | n/a                      | n/a                      |
| `editorMachine.viewSettings[viewId].entryFile`     | store  | n/a                | clear                                    | rewrite in place                                                   | n/a                      | n/a                      |
| `projectMachine.mainEntryFile`                     | store  | n/a                | clear if matches                         | rewrite if matches                                                 | n/a                      | n/a                      |
| `projectMachine.geometryUnits` Map                 | store  | n/a                | delete entry                             | re-key                                                             | n/a                      | n/a                      |
| `project.assets.mechanical.main` (IDB)             | store  | n/a                | clear if matches                         | rewrite if matches                                                 | n/a                      | n/a                      |
| Dockview editor panels (id = `paneId`, post-R3)    | render | add via reconciler | remove via reconciler                    | `updateParameters({ filePath })` + `setTitle` via reconciler       | reconciler-managed       | n/a                      |
| Dockview viewer panels (id = `viewId`)             | render | n/a                | reconciler removes if owning view closes | `updateParameters({ entryFile })` + `setTitle` via reconciler      | n/a                      | n/a                      |
| `FileEditor` `handleCodeChange` write target       | render | n/a                | unmount                                  | reads live `path` via `paneId` lookup (R16)                        | n/a                      | n/a                      |
| `FileEditor` `useFileContent(filePath)` sub        | render | new outcome        | orphaned outcome                         | re-subscribes on prop change                                       | n/a                      | re-publish               |
| `FileEditor` `modelService.acquireModel` hold      | render | n/a                | release                                  | acquire-by-`paneId` → live path; model service migrates internally | clone hold               | n/a                      |
| `<CodeEditor path>` Monaco URI                     | render | new model          | dispose                                  | new URI from live `path`; service reuses migrated model            | clone                    | reload                   |
| Markdown viewer `<Tabs key>`                       | render | n/a                | n/a                                      | keyed on `paneId` (R21) — stable across rename                     | n/a                      | n/a                      |
| Plan viewer / breadcrumb FileSelector              | render | n/a                | n/a                                      | re-renders with new path / parentPath                              | n/a                      | n/a                      |
| Monaco model service                               | store  | revert             | dispose                                  | dispose old / create new (URI-keyed)                               | clone                    | reload                   |
| Monaco marker service                              | store  | n/a                | remove                                   | `migrateUri`                                                       | n/a                      | n/a                      |
| Monaco TS worker project graph                     | store  | n/a                | drop file                                | invalidate + `getEditsForFileRename` (R17)                         | n/a                      | n/a                      |
| Chat `@path` chips                                 | store  | n/a                | mark stale (red strikethrough)           | rewrite                                                            | n/a                      | n/a                      |
| Parameter cache (`.tau/cache/parameters/`)         | store  | n/a                | invalidate                               | migrate                                                            | clone                    | invalidate               |
| Telemetry hashes (project-activity-tracker)        | store  | n/a                | n/a                                      | bump on rename                                                     | n/a                      | n/a                      |
| Working-copy dirty flag / autosave debouncer (R18) | store  | start fresh        | drop                                     | preserve dirty state, re-anchor URI                                | clone with `dirty=false` | reconcile external write |

Stores that earn a `FileOperationParticipant` subscription under R3 are those marked `store`. Renders do not subscribe — they re-derive from their backing store on the next render commit. The structural pay-off of R3 is that the entire **render** column collapses into one `useEffect` reconciler in `chat-editor-dockview.tsx`; no per-surface event plumbing.

Today the bolded surfaces have **zero** subscribers — they discover the path is stale only via downstream symptoms ("File not found", empty viewer, broken export).

## Roadmap

1. **Week 1** — Land R1 (`move` primitive: directory-aware `rename` at the provider layer + cross-mount fallback that walks subtrees). This is the one remaining structural filesystem gap that no UI workaround can paper over — `mkdir` / `rmdir({ scope, recursive })` already exist, so R4 and R5 are now UI-side migrations (single-PR scope each). Cover R1 with golden-path tests in `packages/filesystem/src/workspace-file-service.test.ts` and `packages/filesystem/src/backend/*-provider.test.ts`. In the same week, complete the UI migrations for R4 (replace `.gitkeep` with `mkdir`) and R5 (route folder delete through `rmdir({ scope, recursive: true })`, delete `treeService.deleteDirectory`).
2. **Week 2** — Land R2 (extend the existing `ChangeEvent` union with `fileCopied`/`directoryCopied`, `directoryCreated`/`directoryDeleted`, and `target?: FileStat` payloads). This is now an additive change rather than a new channel — no compat shim needed because consumers already route through `WorkerChangeChannel`/`onDidContentChange`.
3. **Week 2–3** — Land R3 in three sub-steps that **must ship as one atomic change** so the editor-tab surface is never half-migrated:
   - 3a. Introduce `paneId` on `openFiles[]` + `activePaneId`; write the one-shot `editorLayout` migration; keep the existing event-driven Dockview wiring working in parallel.
   - 3b. Rewrite `chat-editor-dockview.tsx` as a reconciler `useEffect` keyed on `paneId`; delete the legacy `fileOpened`/`closeFile` add/remove handlers; translate `onDidRemovePanel`/`onDidActivePanelChange`/`onDidMovePanel` into editor-machine intents.
   - 3c. Subscribe `editorMachine` to `onDidRunOperation(MOVE|DELETE)`; rewrite `openFiles[i].path` and `viewSettings[viewId].entryFile` in place; subscribe `projectMachine` for `geometryUnits`/`mainEntryFile`/`assets.mechanical.main`; land R16 (`handleCodeChange` reads live path by `paneId`) and R21 (`<Tabs key={paneId}>`) in the same PR.

   After step 3, Findings 2/4/5/6/12/19/20/21/27 are mechanically closed in one stroke.

4. **Week 3** — Land R6/R7/R8/R9 (preflight, bulk, conflict UI, recursive delete tightening). Land R17 (TS file-rename refactor) on top of R3 — it plugs into the same `onDidRunOperation(MOVE)` participant.
5. **Week 4** — Land R18 (dirty/save/revert axis + untitled buffers). This is the largest single change; it unblocks R19 and R20 and addresses the agent-overwrite race.
6. **Week 5+** — Land R10/R11/R12/R13/R14/R15/R19/R20 in priority order.

A pre-launch readiness gate: every **store** in the Impact Matrix must be subscribed to the relevant operation types via the participant pattern, and every **render** must derive purely from its backing store. The verification is a single integration test that renames a directory containing an open editor file (with unsaved edits in flight under R18), an active viewer, an active CAD actor, and the project main pointer, then asserts every surface — including the Monaco code/markdown viewer panels (`paneId` stable, `filePath` updated), breadcrumb `parentPath` resolution, the TS server's import graph, the markdown viewer's `<Tabs>` selection (preserved across rename), and the (R18) dirty/save/revert state — reflects the new path with no data loss and no leaked tabs.

## Appendix: Primitive Comparison Table

| Primitive                      | Tau today                                                | VS Code (`IFileService`)                                                                        | Recommended                                                                                    |
| ------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| File rename                    | `rename(file)` (provider)                                | `move(file, file, overwrite?)` returns stat                                                     | `move(resource, target, { overwrite? })` returns stat                                          |
| Folder rename                  | **missing**                                              | `move(folder, folder, overwrite?)` returns stat                                                 | `move` (same primitive)                                                                        |
| File move (cross-folder)       | `rename(file)`                                           | `move`                                                                                          | `move`                                                                                         |
| Folder move                    | **missing** (cross-mount loses subtree)                  | `move`                                                                                          | `move`                                                                                         |
| File copy                      | `duplicate` (same folder only)                           | `copy(file, file, overwrite?)` returns stat                                                     | `copy(resource, target, { overwrite? })`                                                       |
| Folder copy                    | `copyDirectory`                                          | `copy(folder, folder, overwrite?)`                                                              | `copy` (same primitive)                                                                        |
| File delete                    | `unlink`                                                 | `del(resource, { recursive: false })`                                                           | `del(resource, { recursive: false })`                                                          |
| Folder delete (recursive)      | `deleteDirectory` (lazy-tree walk)                       | `del(resource, { recursive: true, useTrash? })`                                                 | `del(resource, { recursive: true })`                                                           |
| File create with bytes         | `writeFile`                                              | `createFile(resource, buffer?, { overwrite? })`                                                 | `createFile(resource, buffer?, { overwrite? })`                                                |
| Folder create                  | `.gitkeep` workaround                                    | `createFolder(resource)`                                                                        | `createFolder(resource)`                                                                       |
| Preflight (can I rename here?) | **missing**                                              | `canMove`/`canCopy`/`canCreateFile`/`canDelete`                                                 | `canMove`/`canRename`/`canCreate`/`canDelete`                                                  |
| Operation event channel        | `onDidContentChange` (content-only)                      | `onDidRunOperation` (`CREATE`/`DELETE`/`MOVE`/`COPY`/`WRITE` discriminated union)               | `onDidRunOperation` (same shape)                                                               |
| Before-operation participant   | **missing**                                              | `onWillRunWorkingCopyFileOperation` join API                                                    | `onWillRunOperation` join API                                                                  |
| After-operation participant    | implicit (caller fans out)                               | `onDidRunWorkingCopyFileOperation`                                                              | `onDidRunOperation` (recommended)                                                              |
| Failure compensation           | implicit                                                 | `onDidFailWorkingCopyFileOperation`                                                             | `onDidFailOperation`                                                                           |
| Bulk edit / undo               | **missing**                                              | `applyBulkEdit(ResourceFileEdit[], options)`                                                    | `applyBulkEdit` (R10)                                                                          |
| Drag-as-copy modifier          | **missing**                                              | Ctrl on Windows, Alt on macOS                                                                   | same (R12)                                                                                     |
| Conflict UI                    | **missing**                                              | `getMultipleFilesOverwriteConfirm`                                                              | `<ExplorerOperationProgress>` (R13)                                                            |
| Dirty / save / revert          | **missing** (writes on every keystroke)                  | `TextFileWorkingCopy` (`isDirty`, `save`, `revert`, untitled buffers, external-write reconcile) | `TextFileWorkingCopy`-equivalent (R18)                                                         |
| Save participants              | **missing** (no save event)                              | `IStoredFileWorkingCopySaveParticipant` (`onWillSave` / `onDidSave`)                            | `onWillSave` / `onDidSave` (R19)                                                               |
| Diff editor                    | **missing**                                              | `monaco.editor.createDiffEditor`                                                                | `createDiffEditor` for compare/saved-vs-disk/bulk preview (R20)                                |
| File-rename import refactor    | **missing** (TS imports break)                           | `getEditsForFileRename` wired to `onDidRunFileOperation(MOVE)`                                  | TS file-rename participant (R17)                                                               |
| Symbol rename (LSP)            | `MaterializingRenameAdapter`                             | `provideRenameEdits`                                                                            | Already present (no change)                                                                    |
| Open-tab set ownership         | **dual** (editor machine + Dockview, both keyed by path) | `IEditorService` owns inputs; `IEditorGroupsService` owns groups; UI is render-only             | Editor machine sole owner; Dockview reconciled render keyed by stable `paneId` (R3 / Option A) |
| Tab identity                   | file path (mutates on rename)                            | `EditorInput` (stable; URI is a property)                                                       | stable `paneId: string` (uuid) — `path` is a property (R3)                                     |
| Path-as-id consequence         | every rename leaks a tab + 5 other findings              | n/a — never path-keyed                                                                          | one rename = one `assign`; reconciler converges Dockview (R3)                                  |

## References

- `apps/ui/app/routes/projects_.$id/chat-editor-file-tree.tsx` — the explorer.
- `apps/ui/app/routes/projects_.$id/chat-editor-dockview.tsx` — the editor tab host (Dockview keyed on path).
- `apps/ui/app/routes/projects_.$id/chat-editor-viewer-registry.ts` — extension-based viewer dispatch.
- `apps/ui/app/routes/projects_.$id/chat-editor-code-viewer.tsx` — Monaco code editor wrapper bound to `filePath`.
- `apps/ui/app/routes/projects_.$id/chat-editor-markdown-viewer.tsx` — Markdown + Monaco split with `<Tabs key={filePath}>`.
- `apps/ui/app/routes/projects_.$id/chat-editor-plan-viewer.tsx` — read-only markdown preview for `*.plan.md`.
- `apps/ui/app/routes/projects_.$id/chat-editor-breadcrumbs.tsx` — breadcrumb segments derived from `filePath.split('/')`.
- `apps/ui/app/routes/projects_.$id/chat-editor-viewer.types.ts` — `ChatEditorViewerProps`, `createMonacoPath`.
- `apps/ui/app/routes/projects_.$id/chat-viewer.tsx` — the viewer panel (Dockview keyed on viewId, entryFile in params).
- `apps/ui/app/components/code/code-editor.client.tsx` — Monaco wrapper (`keepCurrentModel`, `fixedOverflowWidgets`, force-tokenisation).
- `apps/ui/app/lib/monaco-model-service.ts` — ref-counted Monaco model registry; URI migration on `renamed`.
- `apps/ui/app/lib/monaco-typescript-extras/materializing-rename-adapter.ts` — in-file symbol rename (TS server `findRenameLocations`).
- `apps/ui/app/lib/monaco-navigation-service.ts` — cross-model `registerEditorOpener` routed through `editorRef`.
- `apps/ui/app/machines/editor.machine.ts` — `renameFile` action; `viewSettings` keyed by viewId with `entryFile` value.
- `apps/ui/app/machines/project.machine.ts` — `mainEntryFile`, `geometryUnits` (Map keyed by entryFile).
- `packages/fs-client/src/file-content-service.ts` — `rename`, `delete`, `duplicate`, `onDidContentChange`, `onDidChangeOrphaned`, `onDidChangeOutcome`.
- `packages/fs-client/src/file-system-client.ts` — `FileSystemClient` RPC surface (mount-aware; carries `WorkspaceScope` on standalone-provider calls).
- `packages/fs-client/src/file-tree-service.ts` — `deleteDirectory` (lazy-tree walk; to be replaced by R5).
- `packages/fs-client/src/worker-change-channel.ts` — main-thread fan-out of worker `ChangeEvent` events (workspace-relative paths).
- `packages/filesystem/src/workspace-file-service.ts:387–422` — `rename` calls provider single-file rename; cross-mount fallback handles single files only.
- `packages/filesystem/src/workspace-file-service.ts:361–385` — `mkdir({ recursive? })`.
- `packages/filesystem/src/workspace-file-service.ts:457–499` — `rmdir({ scope, recursive })`.
- `packages/filesystem/src/mount-table.ts` — `MountConfig` / `WorkspaceScope` discriminated unions; longest-prefix routing; webaccess `{ directoryHandle, workspaceId }` invariant.
- `packages/filesystem/src/change-event-bus.ts` — worker-side `ChangeEvent` fan-out.
- `packages/filesystem/src/event-origin-registry.ts` — `tagEventOrigin` / `getEventOrigin` (participant self-skip primitive).
- `packages/filesystem/src/workspace-errors.ts` — `MissingWorkspaceHandleError`.
- `packages/filesystem/src/in-memory-file-tree.ts:213–242` — directory rename is correct at the index layer (whole subtree reattaches); only the provider layer is the blocker for F1/F3.
- `packages/filesystem/src/backend/direct-idb-provider.ts:270–292` — file-only `rename` (throws ENOENT for directories).
- `packages/filesystem/src/backend/fs-access-provider.ts:172–177` — file-only `rename` (single-file `readFileRaw + writeFile + unlink`).
- `apps/ui/app/filesystem/workspace-errors.ts` — UI-side typed-error classes (`WorkspaceDirectoryRequiredError`, `FileManagerNotReadyError`).
- `apps/ui/app/routes/projects_.$id/file-manager-error.tsx` — fatal-FM-error overlay (typed-error pattern bearing fruit at the UI layer).
- `libs/types/src/types/filesystem.types.ts:30–35` — canonical `ChangeEvent` discriminated union.
- `repos/vscode/src/vs/platform/files/common/files.ts:28–270, 940–972` — `IFileService` + `IFileOperationEvent`.
- `repos/vscode/src/vs/workbench/services/workingCopy/common/workingCopyFileService.ts:157–266` — `IWorkingCopyFileService`.
- `repos/vscode/src/vs/workbench/services/textfile/common/textFileEditorModelManager.ts:189–326` — text model migration on MOVE.
- `repos/vscode/src/vs/workbench/contrib/files/browser/views/explorerViewer.ts:1783–2026` — explorer drag/drop + `applyBulkEdit`.
- `repos/vscode/src/vs/workbench/services/editor/common/editorService.ts` — `IEditorService` (owns the editor-input set).
- `repos/vscode/src/vs/workbench/services/editor/common/editorGroupsService.ts` — `IEditorGroupsService` (owns the group/split layout).
- `repos/vscode/extensions/typescript-language-features/src/languageFeatures/updatePathsOnRename.ts:21–223` — TS server `getEditsForFileRename` wired to `onDidRunFileOperation(MOVE)`.

Related policy / research:

- `docs/policy/filesystem-policy.md` — current filesystem invariants.
- `docs/research/filesystem-architecture.md` — backend topology.
- `docs/research/filesystem-access-api-cohesion-audit.md` — workspace identity & handle propagation (resolved upstream of this audit).
- `docs/research/agent-filesystem-stale-cache-audit.md` — agent-side stale-cache issues; the move-time stale-cache issue here is the editor-side analogue.

## Implementation Status

Tracks which audit recommendations have landed in the implementation pass alongside this document. Items marked **landed** are merged; items marked **open** are deferred to a follow-up pass.

| R#               | Status | One-line summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1               | landed | Directory-aware `move(source, target, { overwrite? }): FileStat` primitive on every provider (direct-idb, fs-access, memory); `WorkspaceFileService.rename` is now an alias for `move`; cross-mount fallback walks the subtree; `FileSystemClient.move` RPC + `useFileManager.moveFile` facade exposed end-to-end.                                                                                                                                                                                                       |
| R2               | landed | `ChangeEvent` union extended with `fileCopied` / `directoryCreated` / `directoryDeleted` / `directoryRenamed` / `directoryCopied` discriminators; emitted from `WorkspaceFileService.mkdir` / `rmdir` / `duplicateFile` / `copyDirectory`; consumed by `FileTreeService` / `FileContentService` / `MonacoModelService`; `ContentChangeEvent` mirrors the new shape.                                                                                                                                                      |
| R3               | landed | Editor machine is the sole owner of the open-tab set; `OpenFile` carries a stable UUID `paneId`; Dockview is a pure idempotent reconciler keyed by `paneId` (no `isSyncingFromMachine` guard); file path is a property of the tab, never its identity. Legacy persisted layouts are migrated by `migrateEditorLayoutPanelIds`. `file-operation-participants.ts` routes filesystem `ContentChangeEvent`s into editor + project machine intents; UI components no longer issue `renameFile` / cascading `closeFile` calls. |
| R4               | landed | `mkdir(name, { recursive: true })` replaces the legacy `.gitkeep` workaround in `PendingFolderInput`. `directoryCreated` event drives the "Created folder" toast.                                                                                                                                                                                                                                                                                                                                                        |
| R5               | landed | `rmdir(path, { recursive: true })` replaces `treeService.deleteDirectory` in `confirmDelete`; `directoryDeleted` event drives the "Deleted folder" toast.                                                                                                                                                                                                                                                                                                                                                                |
| R9               | landed | `FileTreeService.deleteDirectory` removed (was a lazy-tree walk; cascading closes now flow through the participant).                                                                                                                                                                                                                                                                                                                                                                                                     |
| R16              | landed | `handleCodeChange` resolves the live file path via `openFiles.find(f => f.paneId === paneId)?.path` at write-time; `<ViewerComponent key={paneId}>` prevents React remount on rename; writes are suppressed when the tab is no longer open (closes F20 — typing into a recently-renamed editor no longer resurrects the file at the pre-rename path).                                                                                                                                                                    |
| R21              | landed | `chat-editor-markdown-viewer.tsx` keys `<Tabs>` on `paneId`, not `filePath` (closes F27); `paneId` threaded through `ChatEditorViewerProps`. Grep audit confirms zero `key={filePath}` matches under `apps/ui/app/routes/projects_.$id/`.                                                                                                                                                                                                                                                                                |
| R6               | open   | `canMove` / `canRename` / `canCreate` / `canDelete` typed-error preflights + `workspaceErrorCopy` registry deferred.                                                                                                                                                                                                                                                                                                                                                                                                     |
| R7               | open   | `bulkMove(edits, { overwrite? })` transactional move (rollback-on-error) deferred; explorer onDrop still uses per-item sequential `renameFile` calls.                                                                                                                                                                                                                                                                                                                                                                    |
| R8               | open   | `OverwriteConfirmDialog` (VS Code parity, `do not ask again for this session`) deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R17              | open   | Monaco TS worker `getEditsForFileRename` import-rewrite participant deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R10–R15, R18–R20 | open   | Tracked separately in the audit body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The landed set closes F1, F3, F6, F7 (partial — cascading writes are atomic at the provider layer), F11, F13, F17 (workspace-relative path validity), F20, F22 (folder rename now survives across editor + project state), F23 (Monaco model migration on directory rename), F27. Remaining items (preflights, bulkMove transaction, overwrite dialog, TS import rewriter) are tracked above.
