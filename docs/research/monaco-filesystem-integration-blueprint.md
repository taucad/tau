---
title: 'Monaco Filesystem Integration Blueprint'
description: 'Architecture blueprint for a canonical URI-to-model materialization layer that unifies how every Monaco language feature (definitions, references, rename, peek, ATA) consults the workspace filesystem. Builds on the LSP FS bridge by defining the layer above it.'
status: draft
created: '2026-05-08'
updated: '2026-05-09'
category: architecture
related:
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/research/monaco-typescript-intellisense-investigation.md
  - docs/research/language-fs-bridge-implementation.md
  - docs/research/vscode-typescript-features.md
  - docs/research/vscode-style-resolution-and-virtual-types.md
  - docs/research/vscode-fs-performance.md
  - docs/research/filesystem-architecture.md
  - docs/policy/vision-policy.md
  - docs/policy/language-contribution-policy.md
  - docs/policy/filesystem-policy.md
---

# Monaco Filesystem Integration Blueprint

Architectural blueprint for the layer above the existing `@taucad/lsp-fs` worker bridge: a canonical URI-to-`ITextModel` materialization registry (`MonacoWorkspaceFs`) that subsumes every Monaco language feature's "I have a URI, get me a model" code path — eliminating per-language reinvention and unblocking JS/TS Cmd+Click on project files.

## Executive Summary

Tau's FS surface fans out into eight purpose-built primitives (`FileSystemService`, `WorkspaceFileService`, `FileSystemClient`, `FileContentService`, `FileTreeService`, `LanguageFsClient`, `SyncFsClient`, `SharedPool`) and one Monaco-side service (`MonacoModelService`). Together they cover storage, transport, content caching, watch fan-out, and mount routing for **paths**. What they collectively do **not** cover is the conversion of an arbitrary `monaco.Uri` (potentially across multiple schemes — `file://`, future `inmemory://`, `vscode-node-modules://`, `tau-kernel://`) into the `ITextModel` that every Monaco language-feature provider expects when returning navigation results.

Three concrete consumers each invent their own answer today: KCL's `ensureModelForUri` helper threaded through `getOrEnsureModel` callbacks, OpenSCAD's "create-scratch-model-then-`finally`-dispose" dance inside `provideDefinition`, and Monaco's bundled JS/TS `LibFiles.getOrCreateModel` (which silently returns `null` for project-file URIs and is the smoking-gun behind the recently regressed Cmd+Click on `./lib/cube.js`). VS Code centralises this in **`workspace.fs` + `FileSystemProvider` (per-scheme) + `TextDocumentContentProvider` (per-scheme, read-only synthetic) + `openTextDocument(uri)`** — every language feature bottoms out in this stack.

Recommendation (R1): introduce `MonacoWorkspaceFs` (~250 lines after splitting providers) as a scheme-keyed registry of `MonacoFileSystemProvider`s **and** `MonacoTextDocumentContentProvider`s with a single `openTextDocument(uri): Promise<ITextModel>` materialisation entry point; refactor `MonacoModelService.getOrEnsureModel`, the `monaco-navigation-service` opener, and the `ensureModelForUri` helpers in KCL/OpenSCAD to delegate; install a `MaterializingLibFiles` subclass on `monaco-editor`'s built-in JS/TS adapters so `DefinitionAdapter`/`ReferenceAdapter`/`RenameAdapter` materialise via the same registry instead of returning `null`. Author Tau-side `ImplementationAdapter`/`TypeDefinitionAdapter`/`WorkspaceSymbolAdapter`/`CallHierarchyAdapter` against the same `MaterializingLibFiles` to fill the gap Monaco's bundled JS/TS leaves. Make `onDidChange` required on every provider so file-change → model-update propagates uniformly; add a `materialiseUrisForWorkspaceEdit` helper so multi-URI refactors (Rename, CodeAction) reach unmaterialised models; expose `findFiles(pattern)` so `WorkspaceSymbolProvider` and future workspace-walking providers have a canonical primitive; make `WorkspaceFileSystemProvider` mount-aware so multi-root storage topologies (Phase 4-6 ECAD/firmware/simulation libraries) compose without registry changes. Net effect: Cmd+Click restored for JS/TS project files, the full URI-returning provider family is unblocked in one move, ~150 lines of per-language materialisation code deleted, every future language contribution becomes a three-line `register(scheme, provider)` call, and Phase 2-6 kernels inherit a Monaco filesystem surface that was complete before they were authored.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Eigenquestion](#eigenquestion)
- [Methodology](#methodology)
- [Findings](#findings)
- [Target Architecture](#target-architecture)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [Roadmap](#roadmap)
- [Out of Scope (Future Planning)](#out-of-scope-future-planning)
- [References](#references)

## Problem Statement

Three concrete symptoms that share one root cause:

1. **JS/TS Cmd+Click on project files broke** when the custom `javascript-definition-provider.ts` was deleted (R10 of the LSP P0 plan). Hover and Cmd+Click on `replicad` work because they live in `addExtraLib`. Hover and Cmd+Click on `./lib/cube.js` fail because Monaco's bundled `DefinitionAdapter` calls `LibFiles.getOrCreateModel(fileName)` which only materialises three URI classes (already-open editor models, `lib.*.d.ts`, and `extraLibs`) and returns `null` for everything else — including legitimate workspace files the TS worker successfully resolved through Tau's Tier-2 sync FS.

2. **KCL has had to hand-thread `getOrEnsureModel` through every provider** (`apps/ui/app/lib/kcl-language/lsp/providers/definition-provider.ts:118-119`, then again at the call sites at lines 178-179 and 196-197). Without that callback Monaco refuses to render the Cmd+hover underline because it pre-validates the target model exists. The provider also keeps a fallback path (lines 304-342) that reaches into `fileManager.readFile` and calls `monaco.editor.createModel` directly — a second model-materialisation implementation, in case the callback wasn't injected.

3. **OpenSCAD creates a Monaco model just to parse it, then disposes it in a `finally` block** (`apps/ui/app/lib/openscad-language/openscad-definition.ts:73-98`). The model exists for a single AST walk and is never registered with the editor opener. The `targetUri` returned in the resulting `Location` will then trigger the navigation opener, which will materialise _another_ model for the same URI through `MonacoModelService.getOrEnsureModel`. Two materialisation paths for one navigation.

Each language solves its own slice of the same problem. The next contribution (Python via Pyright WASM, Rust via rust-analyzer) inherits zero infrastructure for this. JS/TS — already shipped — can't even solve it without subclassing Monaco's bundled adapter.

The lower-level FS bridge (`@taucad/lsp-fs`) is the right answer for "language worker needs to read a workspace byte stream." It is **not** the right answer for "Monaco main thread has a `monaco.Uri` and needs a registered `ITextModel` to render Cmd+hover, peek, references, or rename" — that's a strictly Monaco concern that lives upstream of any worker-side LSP.

## Eigenquestion

> **For a given `monaco.Uri`, who is authoritative for materialising it as a registered Monaco `ITextModel` — across every URI scheme, every language-feature consumer (definition, references, rename, peek, ATA, navigation), and every kind of resource (open editor file, on-disk workspace file, external dep typing, ATA cache, kernel-emitted artefact)?**

This question subsumes:

- The JS/TS Cmd+Click regression (today no answer exists for `file://` URIs that aren't already open).
- KCL's `getOrEnsureModel` injection (a per-language ad-hoc answer for `file://`).
- OpenSCAD's scratch-model dance (an inline answer for the same scheme).
- ATA's relationship to `file:///node_modules/<pkg>/index.d.ts` (today a separate `addExtraLib` registry the materialisation layer can't see).
- Future languages whose servers will return `Location`s with their own URI schemes (e.g. Python's `inmemory://stdlib/...`).
- The kernel runtime's eventual desire to surface generated artefacts (e.g. `tau-kernel://render-output/glb-preview.txt`) as readable, navigable Monaco buffers.
- The wider URI-returning provider family (Implementation, TypeDefinition, WorkspaceSymbol, CallHierarchy, DocumentLink) Monaco's bundled JS/TS doesn't ship — Tau-authored adapters that hit the same registry close the gap.
- Multi-URI `WorkspaceEdit` application (Rename across files, CodeAction refactors): every target URI must materialise _before_ Monaco unwraps the edit.
- Multi-mount workspaces (Phase 4-6 ECAD libraries, firmware headers shared with electrical, simulation packs): URI → owning mount → underlying provider must resolve transparently.
- Read-only synthetic content (kernel artefact previews, future `git:` revisions, `output:` log streams) versus writable backing-store content — two registries, one resolution path.
- File-change propagation: when `FileContentService` (or any future provider) emits a change event, every open model on that URI updates without per-scheme listener wiring on the model service.

Crystallising the question this way reframes "fix Cmd+Click" as one specialisation of a single architectural primitive. Every other URI-bound language feature inherits the same fix, and the registry's contract is rich enough that Phase 2-6 languages don't reopen the design space.

## Scope and Non-Goals

**In scope**: the Monaco-side URI→`ITextModel` materialisation registry split into `MonacoFileSystemProvider` + `MonacoTextDocumentContentProvider`; refactors of `MonacoModelService` (URI-keyed delegating model store), `monaco-navigation-service`, `ensureModelForUri` call sites; adapter swap for built-in JS/TS `DefinitionAdapter`/`ReferenceAdapter`/`RenameAdapter` via `MaterializingLibFiles`; Tau-authored adapters for `Implementation`/`TypeDefinition`/`WorkspaceSymbol`/`CallHierarchy` that the bundled JS/TS doesn't ship (close the gap with VS Code's TS extension, all backed by the same registry); workspace-walking primitives (`findFiles`) on the registry; `WorkspaceEdit` pre-materialisation helper; multi-mount-aware `WorkspaceFileSystemProvider`; uniform `onDidChange` contract across all providers wired into `MonacoModelService`'s update loop; alignment with `addExtraLib`-registered virtual files via an `ExtraLibsFileSystemProvider`; `tau-kernel://` content provider for kernel artefact previews.

**Out of scope** (this blueprint): redesigning the worker-side `@taucad/lsp-fs` JSON-RPC + Tier-0/1/2 read pipeline (covered by [scalable-language-contribution-fs-architecture.md](./scalable-language-contribution-fs-architecture.md)); replacing Monaco's bundled `ts.worker` with a custom `serverHost`-aware build (R11 of [monaco-typescript-intellisense-investigation.md](./monaco-typescript-intellisense-investigation.md)); choosing the upstream WASM build for any specific future language; the storage-tier `FileSystemProvider` discriminators (`indexeddb` / `opfs` / `webaccess` / `memory`) and their backend selection logic (already settled in [filesystem-mount-only-architecture.md](./filesystem-mount-only-architecture.md)).

**Out of scope** (deferred to future planning, captured in [§ Out of Scope (Future Planning)](#out-of-scope-future-planning)): provider families that don't depend on URI→model materialisation (`HoverProvider`, `CompletionItemProvider`, `SignatureHelpProvider`, `DocumentFormattingProvider`, `DocumentSymbolProvider`, `FoldingRangeProvider`, `SemanticTokensProvider`, `InlayHintsProvider`, `DocumentHighlightProvider`, `SelectionRangeProvider`, `LinkedEditingRangeProvider`, `DocumentColorProvider`); content-search RPC (`findInFiles`); `git:` / `output:` content providers; cross-mount path normalisation policies; the publication/fork content-provider story.

## Methodology

- Walked every FS-shaped primitive in the repo: `packages/filesystem/`, `packages/fs-client/`, `libs/lsp-fs/`, `libs/lsp/`, plus the Monaco-side services in `apps/ui/app/lib/{monaco-model-service,monaco-navigation-service,monaco-language-registry,type-acquisition-service}.ts` and per-language `*-register-language.ts` modules.
- Re-read each language contribution's `provideDefinition` for how they bridge URI → model: KCL (`kcl-language/lsp/providers/definition-provider.ts`), OpenSCAD (`openscad-language/openscad-definition.ts`), JS/TS (no contribution — relies on Monaco's bundled `DefinitionAdapter`).
- Re-read the bundled `monaco-editor/esm/vs/language/typescript/languageFeatures.js` (last reviewed in the prior LSP P0 cycle) to confirm the `LibFiles.getOrCreateModel` bottleneck and the publicly exported adapter classes.
- Walked VS Code's `workspace.fs`, `FileSystemProvider`, `TextDocumentContentProvider`, and `openTextDocument` declarations in `repos/vscode/src/vscode-dts/vscode.d.ts` (lines 9598-9700, 1845-1872, 14155-14200) to extract the canonical primitive shapes.
- Cross-referenced `repos/vscode/extensions/typescript-language-features/src/filesystems/{ata,autoInstallerFs}.ts` for the per-scheme `FileSystemProvider` registration pattern (`vscode-node-modules`, `vscode-global-typings`).
- Inventoried existing research that touches this surface: [scalable-language-contribution-fs-architecture.md](./scalable-language-contribution-fs-architecture.md) (worker-side bridge — settled), [monaco-typescript-intellisense-investigation.md](./monaco-typescript-intellisense-investigation.md) (Tier-2 sync FS — settled), [vscode-style-resolution-and-virtual-types.md](./vscode-style-resolution-and-virtual-types.md), [vscode-typescript-features.md](./vscode-typescript-features.md).
- Grounded against [`docs/policy/vision-policy.md`](../policy/vision-policy.md) — specifically _"Files are the interface"_ and _"Everything is pluggable"_ design principles, since the materialisation registry is the Monaco-side projection of those principles.

## Findings

### Vision alignment

The vision policy's first design principle is _"Code is the interface."_ Code lives in files. Every engineering artefact — geometry, circuits, firmware, tests, requirements — is reachable through the workspace. Phase 1 ships seven kernels with first-party language tooling. Phases 2-6 add ECAD (TSCircuit, Atopile), firmware (Arduino, MicroPython), simulation (FEA, ngspice). **Each new pillar is one or more new Monaco-resident languages whose features must navigate, peek, rename, and refactor across files the user owns.** A unified URI-to-model authority is the lowest-level enabler for that scaling story; per-language reinvention is incompatible with the cadence of new kernels Phase 4-6 implies.

The second design principle — _"Everything is pluggable; the `defineKernel()` pattern scales to any engineering domain"_ — is the runtime expression of the same thesis. The Monaco-side equivalent is a _scheme-keyed provider registry_: every contribution registers a `MonacoFileSystemProvider` for the schemes it owns, the registry brokers the rest.

### Inventory: filesystem capabilities in the repo

| Capability                                                                                                   | Module                                                                        | Layer            | Reusable for Monaco URI→model?                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Storage providers (IDB / OPFS / FS-Access / Memory)                                                          | `packages/filesystem/src/backend/*-provider.ts`                               | L1 storage       | No — wrong abstraction (path-based, async-only, no Monaco awareness)                                         |
| Mount routing across providers                                                                               | `packages/filesystem/src/mount-table.ts`                                      | L2               | Indirectly — backs the workspace `FileSystemService`                                                         |
| Provider façade + watch fan-out + content cache                                                              | `packages/filesystem/src/file-system-service.ts`                              | L2               | No — same reason as L1                                                                                       |
| Workspace mutating ops + change-event publication                                                            | `packages/filesystem/src/workspace-file-service.ts`                           | L2               | No                                                                                                           |
| Bounded LRU file-byte cache                                                                                  | `packages/filesystem/src/bounded-file-cache.ts`                               | L2 helper        | Yes — backing store option for the new registry's content-bytes tier                                         |
| Cross-tab coordinator (`navigator.locks` + `BroadcastChannel`)                                               | `packages/filesystem/src/cross-tab-coordinator.ts`                            | L2 helper        | Yes — invariant: registry must respect cross-tab invalidation                                                |
| Worker filesystem RPC client (`FileSystemClient` interface)                                                  | `packages/fs-client/src/file-system-client.ts`                                | L3 transport     | Yes — inputs to a `WorkspaceFileSystemProvider`                                                              |
| Main-thread content authority (binary sniff, `FileContentResult` discriminated union, oversized-file gating) | `packages/fs-client/src/file-content-service.ts`                              | L3 main-thread   | **Yes — primary reusable substrate** for the `file://` provider's text materialisation                       |
| Main-thread tree authority (`stat`, `listDirectory`)                                                         | `packages/fs-client/src/file-tree-service.ts`                                 | L3 main-thread   | Yes — backs `MonacoFileSystemProvider.stat`/`readDirectory`                                                  |
| Worker-relative change channel + path resolver                                                               | `packages/fs-client/src/{worker-change-channel,workspace-path-resolver}.ts`   | L3 main-thread   | Yes — drives `onDidChangeFile` events                                                                        |
| Cross-thread `SharedArrayBuffer` content pool                                                                | `packages/memory/src/shared-pool.ts`                                          | L4 perf          | Indirectly — Tier-0 cache for worker-side reads (already wired through `LanguageFsClient`)                   |
| Async LSP-style FS for workers (`fs/content`, `fs/stat`, `fs/readDir`, `fs/findFiles`)                       | `libs/lsp-fs/src/{protocol,client}.ts` + `libs/lsp/src/language-fs-bridge.ts` | L5 worker bridge | Worker-side — no overlap (different consumer)                                                                |
| Sync FS shim (Tier-2 `Atomics.wait`)                                                                         | `libs/lsp-fs/src/sync/sync-fs-{protocol,client}.ts`                           | L5 worker bridge | Worker-side — no overlap                                                                                     |
| `LanguageContributionRegistry` two-phase activation                                                          | `apps/ui/app/lib/monaco-language-registry.ts`                                 | L6 Monaco wiring | Yes — registry where contributions hand `MonacoFileSystemProvider`s in via `ActivationContext`               |
| `MonacoModelService` (path-keyed model lifecycle, ref-counted holds)                                         | `apps/ui/app/lib/monaco-model-service.ts`                                     | L6 Monaco wiring | **Yes — refactor target**: collapses `getOrEnsureModel(path)` onto the new registry                          |
| `MonacoNavigationService` (`registerEditorOpener` global handler)                                            | `apps/ui/app/lib/monaco-navigation-service.ts`                                | L6 Monaco wiring | **Yes — refactor target**: scheme dispatch replaces `extractPathFromUri`/`canHandle` chain                   |
| `TypeAcquisitionService` (`addExtraLib` registrations for kernel `.d.ts` + esm.sh ATA)                       | `apps/ui/app/lib/type-acquisition-service.ts`                                 | L6 Monaco wiring | Yes — registers a `extraLibs://` provider so `MaterializingLibFiles` can fall back through the same registry |
| Per-language `ensureModelForUri` helper (KCL)                                                                | `apps/ui/app/lib/kcl-language/lsp/providers/definition-provider.ts:304-342`   | L7 contribution  | **Delete** after R1                                                                                          |
| Per-language scratch-model dance (OpenSCAD)                                                                  | `apps/ui/app/lib/openscad-language/openscad-definition.ts:73-98`              | L7 contribution  | **Delete** after R1                                                                                          |

**Verdict**: layers L1-L5 are stable foundations; the gap is at L6, where three almost-identical mini-services exist instead of one canonical primitive that L7 contributions can consume.

### Finding 1: Monaco's bundled JS/TS adapter is the hard constraint

The `monaco-editor` ESM build ships `DefinitionAdapter` / `ReferencesAdapter` / `RenameAdapter` in `monaco-editor/esm/vs/language/typescript/languageFeatures.js`. Each one consumes a shared `LibFiles` instance and ends with:

```javascript
const refModel = this._libFiles.getOrCreateModel(entry.fileName);
if (refModel) { result.push({ uri: refModel.uri, ... }); }
```

`LibFiles.getOrCreateModel(fileName)` then does exactly three things in order:

1. `editor.getModel(uri)` — return if a model is already open.
2. If `isLibFile(uri) && _hasFetchedLibFiles` — synthesise from `lib.*.d.ts` map.
3. If `getExtraLibs()[fileName]` — synthesise from `addExtraLib`-registered content.

Project files — the `file:///lib/cube.js` URI the TS worker just successfully resolved through Tau's Tier-2 sync FS — fall through every branch and return `null`. The adapter then drops the entry from its result array. Cmd+Click sees an empty `Definition[]` and does nothing.

The same `LibFiles` instance is used by the `ReferencesAdapter` and `RenameAdapter`. Find-all-references and rename-symbol-across-files have the identical bug, just less visibly (no one has triggered them on a project file yet).

**Constraint**: `LibFiles`, `DefinitionAdapter`, `ReferencesAdapter`, and `RenameAdapter` are _exported classes_ from the bundled `languageFeatures.js`. Subclassing `LibFiles` and re-registering subclassed adapters is supported (Monaco's own `setupMode` uses `new ClassName(...)` constructors that we can swap by re-registering providers after `setModeConfiguration({ definitions: false, ... })`). This is the only feasible architectural seam — patching the bundle is rejected (no support, breaks on every Monaco bump).

### Finding 2: `MonacoModelService.getOrEnsureModel` is path-keyed, not URI-keyed

`MonacoModelService` (`apps/ui/app/lib/monaco-model-service.ts`) takes a `path: string` everywhere — `getOrEnsureModel(relativePath)`, `editorHolds: Map<string, number>`, `syncedPaths: Set<string>`. The Monaco URI is reconstructed via `monaco.Uri.file(\`/${path}\`)`at the boundary. This works for the`file://`scheme today and is wired into the existing`monaco-navigation-service.ts` opener at line 147 (`await modelService.getOrEnsureModel(relativePath)`).

The model service is the right _kind_ of service — it owns ref-counts, session epochs, content-change subscriptions, marker tagging. What it lacks is the _scheme-aware dispatch_ that lets `getOrEnsureModel` work for `extraLibs://`, `inmemory://`, or future kernel-emitted schemes. Refactoring its internal map keys from `path` to `uri.toString()` and adding a scheme-router on the read side covers every new use case without touching the ref-count semantics that already work.

### Finding 3: KCL and OpenSCAD have already paid the per-language tax

KCL injects `getOrEnsureModel` four levels deep: the global is captured at module scope (`globalGetOrEnsureModel`) in `kcl-register-language.ts`, passed into `createDefinitionProvider`, captured in closure, called from `ensureModelForUri`, with a fallback path that re-implements the materialisation logic from scratch in case the callback isn't initialised yet. ~80 lines of plumbing.

OpenSCAD avoids the injection by paying a different price: it `monaco.editor.createModel(text, 'openscad', targetUri)` for each `use`/`include` import the user has, runs its AST analyser against the throwaway model, and disposes it in `finally`. The model is invisible to the editor opener, so when the user actually Cmd+Clicks the navigation will materialise a _second_ model for the same URI through whatever path the opener takes.

Both patterns are correct individually. Both are incompatible with adding a third, fourth, fifth language without paying the tax again.

### Finding 4: VS Code's three-piece primitive is the canonical answer

From `repos/vscode/src/vscode-dts/vscode.d.ts`:

| VS Code primitive                                                                                                                                                                         | What it owns                                                                                                                                    | Tau equivalent today                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode.workspace.fs` (`FileSystem` interface)                                                                                                                                            | Façade for `stat` / `readDirectory` / `readFile` / `writeFile` / `createDirectory` / `delete` / `rename` / `copy` against any registered scheme | `FileSystemClient` (path-based, no scheme awareness)                                                                                              |
| `vscode.workspace.registerFileSystemProvider(scheme, provider, options)` → `FileSystemProvider` interface (`stat`, `readDirectory`, `readFile`, `writeFile`, `delete`, `rename`, `watch`) | Per-scheme provider that `workspace.fs` and `openTextDocument` dispatch through                                                                 | None — Tau hardcodes the `file://` semantics in five places                                                                                       |
| `vscode.workspace.openTextDocument(uri)`                                                                                                                                                  | Returns a `TextDocument`, materialising the resource on demand by consulting `FileSystemProvider`s and `TextDocumentContentProvider`s           | None — Monaco has `editor.getModel(uri)` (lookup-only) and `editor.createModel(text, lang, uri)` (low-level constructor); no unified materialiser |

VS Code's `typescript-language-features` extension uses this directly: `AutoInstallerFs` registers under the `vscode-node-modules` scheme; `MemFs` registers under `vscode-global-typings` (`repos/vscode/extensions/typescript-language-features/src/filesystems/`). When tsserver (browser-build) returns a `DefinitionLink` whose `targetUri` is `vscode-node-modules:///node_modules/three/index.d.ts`, the editor calls `workspace.openTextDocument(targetUri)`, which routes through the registered provider, which materialises the bytes — no per-language code involved.

**This is the architecture Tau needs for L6.** The shape transposes 1:1 to Monaco: `MonacoWorkspaceFs` ≈ `workspace.fs`; `MonacoFileSystemProvider` ≈ `FileSystemProvider`; `openTextDocument(uri): Promise<ITextModel>` ≈ `workspace.openTextDocument`.

### Finding 5: `addExtraLib` is a degenerate `FileSystemProvider`

ATA's `addExtraLib(content, 'file:///node_modules/<pkg>/index.d.ts')` is structurally a write into a virtual filesystem keyed by Monaco URI. The call returns a disposable, the write is observable by Monaco's TS worker via `_extraLibs`, and the JS/TS `LibFiles.getOrCreateModel` reads from it as branch (3).

If `MonacoWorkspaceFs` exposed an `extraLibs://` provider that proxies to `typescriptDefaults.getExtraLibs()` and `javascriptDefaults.getExtraLibs()`, then a `MaterializingLibFiles` subclass that consults `MonacoWorkspaceFs.openTextDocument(uri)` after its three built-in branches would automatically continue to honour ATA _and_ support project files in the same code path. ATA stops being a parallel registry.

### Finding 6: The `monaco-navigation-service` opener is the right execution point

`monaco.editor.registerEditorOpener` is the official Monaco public API for cross-model navigation (`apps/ui/app/lib/monaco-navigation-service.ts:90-168`). It already runs for every Cmd+Click whose target model isn't open. Today its handler chain is `extractPathFromUri → handlers.find(h => h.canHandle(path)) → modelService.getOrEnsureModel(path) → editorRef.send({ type: 'openFile', ... })`.

Replacing `handlers.find(h => h.canHandle(path))` with `workspaceFs.canMaterialise(uri)` and the `getOrEnsureModel(path)` with `workspaceFs.openTextDocument(uri)` gives every scheme a uniform path through the same opener. The file-opening side-effect (`editorRef.send`) becomes scheme-conditional: a registered provider can opt out (e.g. `tau-kernel://` artefact previews open in a viewer pane, not the editor).

### Finding 7: The existing JS/TS Tier-2 sync FS already proves the worker-side is solved

The TS worker at `libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts` reaches the workspace via `SyncFsClient.readFileText(fileName)` → SAB `Atomics.wait` → FM-worker server. This already works today and powers go-to-definition's _resolution_ phase: the TS worker correctly returns `{ fileName: 'file:///lib/cube.js', textSpan: { ... } }` for `./lib/cube.js` imports. The break is downstream, on the main thread, when `LibFiles.getOrCreateModel` can't materialise the model.

This bounds the fix sharply: every byte the renderer needs is already accessible through `FileContentService` (which the FM-owned `SharedPool` populates as a side effect of the same Tier-2 reads). `MonacoWorkspaceFs.openTextDocument` for `file://` reduces to a thin wrapper around `FileContentService.resolve(path)` returning a `text` outcome, then `monaco.editor.createModel(decode(bytes), language, uri)`.

### Finding 8: The URI-returning provider family is wider than Definition/References/Rename

Monaco's bundled JS/TS adapters consume `LibFiles` in exactly three places (`DefinitionAdapter` line 626, `ReferenceAdapter` line 661, `RenameAdapter` line 912 of `monaco-editor/esm/vs/language/typescript/languageFeatures.js`). Definition and References call `await this._libFiles.fetchLibFilesIfNecessary(uris)` _before_ `getOrCreateModel`, giving us an async warm-up hook to pre-materialise project-file URIs. Rename does **not** call the warm-up — it goes straight to the synchronous `getOrCreateModel` and `throw new Error(\`Unknown file ${renameLocation.fileName}.\`)` if the model is missing.

VS Code's `vscode.languages.register*Provider` surface (`vscode.d.ts` lines 14900-15234) plus the bundled Monaco adapters reveal a wider URI-returning family that Tau will hit as the language catalogue grows:

| Provider                  | Returns URIs in                                   | Bundled in Monaco JS/TS?  | Future Tau languages need it                                    |
| ------------------------- | ------------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `DefinitionProvider`      | `Definition \| DefinitionLink[]`                  | Yes (`DefinitionAdapter`) | Every kernel                                                    |
| `TypeDefinitionProvider`  | `Definition \| DefinitionLink[]`                  | No                        | TS/Python/Rust/SysML                                            |
| `ImplementationProvider`  | `Definition \| DefinitionLink[]`                  | No                        | TS/Python/Rust                                                  |
| `DeclarationProvider`     | `Definition \| DefinitionLink[]`                  | No                        | C/C++ family (post-Phase 5 firmware)                            |
| `ReferenceProvider`       | `Location[]`                                      | Yes (`ReferenceAdapter`)  | Every kernel                                                    |
| `RenameProvider`          | `WorkspaceEdit` (multi-URI)                       | Yes (`RenameAdapter`)     | Every kernel                                                    |
| `WorkspaceSymbolProvider` | `SymbolInformation[]` (each carries a URI)        | No                        | Cmd+T global symbol search across kernels                       |
| `CallHierarchyProvider`   | `CallHierarchyItem[]` (URIs)                      | No                        | TS/Rust/firmware co-design                                      |
| `TypeHierarchyProvider`   | `TypeHierarchyItem[]` (URIs)                      | No                        | TS/Java/Rust                                                    |
| `DocumentLinkProvider`    | `DocumentLink[]` with `target: Uri`               | No                        | OpenSCAD `use <lib/foo.scad>`, KCL `import "./x.kcl"`, Markdown |
| `CodeActionProvider`      | `Command \| CodeAction` (often a `WorkspaceEdit`) | Yes (single-doc only)     | Refactors that touch multiple files                             |

**Implication**: bundled Monaco JS/TS already lacks Implementation/TypeDefinition/WorkspaceSymbol/CallHierarchy/TypeHierarchy out of the box — features VS Code's TS extension adds on top of `tsserver`. R10 (Tau-authored adapters) ships them concurrently with the `LibFiles` swap so the JS/TS upgrade is a single coherent landing rather than a partial restoration of parity.

### Finding 9: `TextDocumentContentProvider` is a separate primitive from `FileSystemProvider`

VS Code intentionally has **two** scheme-keyed registries that `openTextDocument` (line 14155-14192) consults:

- `vscode.workspace.registerFileSystemProvider(scheme, provider, options)` — full POSIX-shaped FS (`stat`, `readDirectory`, `readFile`, `writeFile`, `delete`, `rename`, `createDirectory`, `copy`, `watch`, `onDidChangeFile`). For schemes that own a real backing store. Used by `vscode-node-modules`, `vscode-global-typings`, `ftp`, `ssh`, `memfs`.
- `vscode.workspace.registerTextDocumentContentProvider(scheme, provider)` — single method `provideTextDocumentContent(uri, token): string`, plus optional `onDidChange: Event<Uri>`. For **read-only synthetic content with no backing store**: `git:` historical revisions, `output:` console streams, `walkthrough:` tutorials, ephemeral diffs. Defined at `vscode.d.ts:1841-1872`.

The blueprint's first pass conflated them under one `MonacoFileSystemProvider`. They split because:

- **Different write semantics**: `FileSystemProvider` is writable by default (`isReadonly` opt-in); content providers are always read-only.
- **Different lifecycle**: content providers are pure functions of `(uri, time)`; FS providers own a directory tree with referential identity.
- **Different cardinality**: content-provider URIs are typically ephemeral (every revision/timestamp gets its own URI); FS provider URIs are stable workspace identities.
- **Different `openTextDocument` precedence**: VS Code consults FS providers first, then content providers (`vscode.d.ts:14161-14162`). Conflating them collapses this resolution order.

Tau's near-term needs cover both shapes:

| Tau scheme                    | Shape                                     | Rationale                                                                              |
| ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `file://`                     | `FileSystemProvider`                      | Workspace-backed, writable, watchable                                                  |
| `extraLibs://`                | `FileSystemProvider` (`isReadonly: true`) | ATA-managed `.d.ts` content; provider proxies `getExtraLibs()`                         |
| `inmemory://`                 | `FileSystemProvider`                      | Test harness / scratch buffers; writable                                               |
| `tau-kernel://`               | `TextDocumentContentProvider`             | Kernel-emitted artefact previews (GLB metadata, OCCT XCAF dumps); ephemeral, read-only |
| `tau-publication://` (future) | `FileSystemProvider`                      | Fork-from-publication snapshot; stable identity, writable post-fork                    |
| `git://` (future, Phase 5+)   | `TextDocumentContentProvider`             | Historical revisions; pure function of `(sha, path)`                                   |
| `output://` (future)          | `TextDocumentContentProvider`             | Build / kernel-runner log streams                                                      |

### Finding 10: `WorkspaceEdit` application across multi-URI providers is silent on materialisation

`RenameAdapter.provideRenameEdits` (line 917) calls `findRenameLocations(...)` then iterates each `renameLocation`:

```javascript
for (const renameLocation of renameLocations) {
  const model2 = this._libFiles.getOrCreateModel(renameLocation.fileName);
  if (model2) { edits.push({ resource: model2.uri, ... }); }
  else { throw new Error(`Unknown file ${renameLocation.fileName}.`); }
}
```

Every URI in the `WorkspaceEdit` must already be materialisable at the moment Monaco unwraps the edit. Monaco's edit-application path then calls `pushEditOperations` on each resource — it does **not** await any `openTextDocument` along the way. Unmaterialised URIs in the edit are silently dropped (or, in `RenameAdapter`'s case, throw). The same constraint applies to `CodeActionProvider`s that return `WorkspaceEdit`s for cross-file refactors (organize-imports, fix-all, extract-to-new-file).

The synchronous `LibFiles.getOrCreateModel` can't perform async I/O. Two viable strategies:

1. **Pre-materialise inside the adapter wrapper**: subclass `RenameAdapter` so `provideRenameEdits` calls `await Promise.all(uris.map(uri => fs.openTextDocument(uri)))` between `findRenameLocations` and the `getOrCreateModel` loop. The synchronous lookup then hits the registry's cache.
2. **Synchronous peek path on the registry**: `MonacoWorkspaceFs.peekModel(uri)` returns `ITextModel | undefined` without I/O when the underlying provider has the bytes cached (e.g. `FileContentService.peekOutcome(path) === 'text'`). Misses fall back to (1).

Both are needed. (1) covers Rename and any future multi-URI refactor; (2) covers the Definition/References fast path where eager warm-up already completed.

### Finding 11: Workspace-walking primitives (`findFiles` / `findInFiles`) belong on the registry

`WorkspaceSymbolProvider` (Cmd+T) and per-language "find references in workspace" implementations need a content-search story. VS Code exposes:

- `workspace.findFiles(include, exclude?, maxResults?, token?): Thenable<Uri[]>` (`vscode.d.ts:14093`) — filename glob.
- `workspace.findTextInFiles(query, options): Thenable<TextSearchComplete>` — content grep across workspace.

Tau already has `FileSystemClient.searchFiles(basePath, query, opts)` (filename-only), exposed through the LSP bridge as `fs/findFiles` (`libs/lsp/src/language-fs-bridge.ts:158-175`). There is no content-search RPC today — none of the seven shipped languages need it yet, but `WorkspaceSymbolProvider` for the JS/TS upgrade does.

The registry is the right home for both because the answer is scheme-aware: `file://` searches the workspace via `FileSystemClient.searchFiles`; `extraLibs://` searches the `getExtraLibs()` keys; `tau-kernel://` is unsearchable (provider returns empty array). Provider-local `findFiles` keeps the registry's contract scheme-agnostic while letting each provider answer with knowledge of its own data shape.

### Finding 12: File-change propagation needs a uniform `onDidChange` contract

Today `MonacoModelService.handleContentChange` listens to `FileContentService.onDidContentChange` and updates open models via `pushEditOperations` (preserves undo) or `setValue` (non-held). After R2 the model service delegates materialisation to the registry — so the change-propagation responsibility either:

- (a) stays on the model service and the registry is purely materialisation-shaped; the model service grows scheme-specific listener wiring for every new provider; or
- (b) moves into each `MonacoFileSystemProvider` via a required `onDidChange?(uri, listener)` hook that the registry adapts into the existing `pushEditOperations` pipeline.

Option (b) matches VS Code's `FileSystemProvider.onDidChangeFile: Event<FileChangeEvent[]>` (`vscode.d.ts:9612`). Each provider knows what change-event source applies to its scheme — the registry doesn't. Without (b), every future scheme that wants live-reload semantics either reimplements the model service's update loop or has stale models.

Concrete provider sources:

| Provider                                          | `onDidChange` source                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WorkspaceFileSystemProvider` (`file://`)         | `FileContentService.onDidContentChange` filtered to `fileWritten`/`fileRenamed`      |
| `ExtraLibsFileSystemProvider` (`extraLibs://`)    | Disposable lifecycle of `addExtraLib` / `removeExtraLib`; emit on add and on dispose |
| `InMemoryFileSystemProvider` (`inmemory://`)      | Provider's own write path                                                            |
| `KernelArtefactContentProvider` (`tau-kernel://`) | Kernel runtime's artefact-emission bus                                               |

### Finding 13: `WorkspaceFileSystemProvider` must be mount-aware from day one

`packages/filesystem/src/mount-table.ts` already supports multiple mounts at distinct path prefixes; `FileSystemService.mount(prefix, provider, config)` is the single entry point. Vision Phase 4-6 spells out multi-root scenarios explicitly:

- **Phase 4 (ECAD)**: shared `.kicad_lib` library mounted from a separate storage backend; `mechanical/`, `electrical/`, `firmware/` may live in independent backends as the project structure complicates.
- **Phase 5 (firmware)**: hardware-firmware co-design imports headers across boundaries (e.g. `electrical/pinmap.h` consumed by `firmware/main.cpp`).
- **Phase 6 (robotic systems)**: fleet variants reference parameterised library mounts.

If `WorkspaceFileSystemProvider` is constructed with a single root (`paths.toAbsolutePath(...)`) it can't materialise URIs that fall under a non-root mount. The retro-fit later requires breaking the constructor and revisiting every `monacoFileUriToWorkspaceRelative` call site. Building mount-awareness in from day one means: take the `MountTable` (or `WorkspaceFileService`) at construction; resolve URI path → owning mount → underlying provider read; preserve the URI as the addressable identity so cross-mount go-to-definition (e.g. JS/TS file in `workspace/src/` references `lib/three.d.ts` mounted from `workspace/.taucad/types/`) works without per-mount-type code.

## Target Architecture

### Layer cake

```
L7  Language contributions  ───────  KCL · OpenSCAD · JS/TS · Python · Rust · USD · SysML · …
L6  Monaco wiring (NEW)     ───────  MonacoWorkspaceFs  (URI → ITextModel)
                                     MaterializingLibFiles  (JS/TS adapter swap)
                                     MonacoModelService  (refactored: URI-keyed)
                                     MonacoNavigationService  (refactored: scheme dispatch)
                                     TypeAcquisitionService  (provider for extraLibs:// scheme)
L5  Worker FS bridge        ───────  @taucad/lsp-fs  (fs/content, fs/stat, fs/readDir, fs/findFiles)
                                     @taucad/lsp-fs/sync  (Atomics.wait Tier-2)
L4  Cross-thread perf       ───────  @taucad/memory  (SharedPool, Tier-0 zero-IPC reads)
L3  Main-thread authority   ───────  @taucad/fs-client  (FileContentService, FileTreeService, FileSystemClient)
L2  Workspace service       ───────  @taucad/filesystem  (FileSystemService, MountTable, WatchRegistry)
L1  Storage providers       ───────  IDB · OPFS · FS-Access · Memory
```

L1-L5 are existing and unchanged. L7 contributions stop reinventing materialisation. L6 grows one new module (`MonacoWorkspaceFs`), refactors three existing modules (`MonacoModelService`, `MonacoNavigationService`, `TypeAcquisitionService`), and ships one carefully scoped Monaco-internal adapter swap (`MaterializingLibFiles`).

### `MonacoWorkspaceFs` interface (proposed)

The registry holds **two** scheme-keyed dictionaries — full file-system providers and read-only synthetic content providers — to mirror VS Code's `FileSystemProvider` / `TextDocumentContentProvider` split (Finding 9).

```typescript
export type MonacoFileSystemProvider = Readonly<{
  /** URI scheme this provider handles, e.g. `'file'`, `'extraLibs'`, `'inmemory'`. */
  scheme: string;
  /** Return the Monaco language id for `uri`, or `undefined` to fall back to extension inference. */
  languageId?(uri: monaco.Uri): string | undefined;
  /** Whether the materialised model should be opened read-only. */
  isReadOnly?(uri: monaco.Uri): boolean;
  /** Resolve `uri` to text. Provider may throw `FileNotFoundError`. */
  readText(uri: monaco.Uri): Promise<string>;
  /** Synchronous fast-path when bytes are cached in-process; misses return undefined. */
  peekText?(uri: monaco.Uri): string | undefined;
  /** Whether opening this URI in the user's editor pane is appropriate (vs viewer-only). */
  openInEditor?(uri: monaco.Uri): boolean;
  /** REQUIRED in v1: change subscription so MonacoModelService can update open models uniformly. */
  onDidChange(uri: monaco.Uri, listener: () => void): { dispose(): void };
  /** Workspace-walking primitive for WorkspaceSymbolProvider et al.; provider may answer `[]`. */
  findFiles?(pattern: string, options?: { maxResults?: number }): Promise<readonly monaco.Uri[]>;
}>;

export type MonacoTextDocumentContentProvider = Readonly<{
  /** URI scheme this provider handles, e.g. `'tau-kernel'`, future `'git'`, `'output'`. */
  scheme: string;
  /** Return the Monaco language id for `uri`, or `undefined` to fall back to extension inference. */
  languageId?(uri: monaco.Uri): string | undefined;
  /** Pure function (uri, time) -> text. Always read-only. */
  provideTextDocumentContent(uri: monaco.Uri): Promise<string>;
  /** Optional change event when underlying source updates (e.g. new kernel render). */
  onDidChange?(uri: monaco.Uri, listener: () => void): { dispose(): void };
}>;

export type WorkspaceEditUriCollector = (uris: readonly monaco.Uri[]) => Promise<void>;

export type MonacoWorkspaceFs = Readonly<{
  registerFileSystemProvider(provider: MonacoFileSystemProvider): { dispose(): void };
  registerTextDocumentContentProvider(provider: MonacoTextDocumentContentProvider): { dispose(): void };
  hasProvider(scheme: string): boolean;
  /** Single materialisation entry point. Idempotent: returns existing model if registered.
   *  Resolution order: file-system providers (Finding 9) → content providers → undefined. */
  openTextDocument(uri: monaco.Uri): Promise<monaco.editor.ITextModel | undefined>;
  /** Synchronous fast-path; returns existing model or peek-cached materialisation, no I/O. */
  peekModel(uri: monaco.Uri): monaco.editor.ITextModel | undefined;
  /** Pre-materialise every URI in a WorkspaceEdit before Monaco unwraps the edit (Finding 10). */
  materialiseUrisForWorkspaceEdit(uris: readonly monaco.Uri[]): Promise<void>;
  /** Cross-scheme workspace-walking; fan-out to provider.findFiles, merge URIs (Finding 11). */
  findFiles(pattern: string, options?: { maxResults?: number }): Promise<readonly monaco.Uri[]>;
  /** True iff some registered provider claims this URI's scheme. */
  canMaterialise(uri: monaco.Uri): boolean;
}>;
```

Five providers ship in the first pass:

| Scheme                       | Kind    | Provider                        | Backed by                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`                       | FS      | `WorkspaceFileSystemProvider`   | `MountTable` → `FileContentService.resolve(mountRelativePath)` per owning mount (Finding 13) — handles binary sniff, oversized-file gate, watch-driven reload via `onDidContentChange`                                                                                        |
| `extraLibs`                  | FS      | `ExtraLibsFileSystemProvider`   | `typescriptDefaults.getExtraLibs()` + `javascriptDefaults.getExtraLibs()` — closes the gap that today only Monaco's bundled `LibFiles` can read; `read-only: true`; `openInEditor: true` (peek/source-of-typings is legitimate); `onDidChange` fires on `addExtraLib`/dispose |
| `inmemory`                   | FS      | `InMemoryFileSystemProvider`    | `Map<string, string>` seeded by callers (test harnesses, kernel preview overlays); `read-only: false`; `onDidChange` fires on internal write                                                                                                                                  |
| `tau-kernel`                 | Content | `KernelArtefactContentProvider` | Kernel runtime's artefact-emission bus (e.g. GLB metadata dumps, OCCT XCAF tree exports); `onDidChange` fires on new artefact for the same logical key                                                                                                                        |
| `tau-publication` (Phase 2+) | FS      | `PublicationContentProvider`    | Read-only snapshot of a publication's file tree (peek-into-shared-project before forking); writable post-fork via copy-into-workspace                                                                                                                                         |

Future schemes (`vscode-node-modules://` if/when ATA stops embedding into `addExtraLib`, `git://` for Phase 5+ history scrub, `output://` for build/runner log streams) plug in with one `registerFileSystemProvider` or `registerTextDocumentContentProvider` call from each contribution's `activate()`.

### `MaterializingLibFiles` (Monaco JS/TS adapter swap)

Subclass `LibFiles` from `monaco-editor/esm/vs/language/typescript/languageFeatures.js`, override `getOrCreateModel` to:

1. Run the three upstream branches verbatim (`getModel` / `lib.*.d.ts` / `extraLibs`).
2. Branch 4 (NEW): if `workspaceFs.canMaterialise(uri)`, return `workspaceFs.peekModel(uri)` (already-cached); on miss return `null` and rely on the wrapper-side eager warmup.

The synchronous constraint is real — `LibFiles.getOrCreateModel` is called from the synchronous body of `DefinitionAdapter.provideDefinition`. Two patterns combine to cover it:

- **Eager warmup before the synchronous loop**: `DefinitionAdapter`/`ReferenceAdapter` call `await this._libFiles.fetchLibFilesIfNecessary(uris)` at line ~624/659 _before_ the synchronous `getOrCreateModel` loop. Subclass that hook (or wrap the adapter) so it also calls `await workspaceFs.materialiseUrisForWorkspaceEdit(uris)` for every project-file URI in the worker response. The synchronous lookup then hits the cache.
- **`peekModel` sync fast-path for `file://`**: `WorkspaceFileSystemProvider.peekText(uri)` consults `FileContentService.peekOutcome(path)`; on `'text'` we synchronously materialise via `monaco.editor.createModel(text, languageId, uri)`. Misses fall through to the eager-warmup path on the next call.

`RenameAdapter` (which doesn't have a built-in async warmup) requires Recommendation R12: a Tau-side `MaterializingRenameAdapter` subclass that overrides `provideRenameEdits` to run `await workspaceFs.materialiseUrisForWorkspaceEdit(renameLocations.map(l => monaco.Uri.parse(l.fileName)))` between `findRenameLocations` and the `getOrCreateModel` loop.

Re-register `DefinitionAdapter`, `ReferenceAdapter`, `MaterializingRenameAdapter` against the subclassed `LibFiles` after disabling the built-in providers via `monaco.typescript.typescriptDefaults.setModeConfiguration({ ...defaults, definitions: false, references: false, rename: false })` and then `monaco.languages.registerDefinitionProvider('typescript', new DefinitionAdapter(libFiles, workerAccessor))` (constructor signature is `(_libFiles, worker)` per `languageFeatures.js:626`; mirror for JS/JSX/TSX). This is the documented Monaco extension surface.

### Tau-authored adapters for the gap Monaco's bundled JS/TS leaves (R10)

Monaco's bundled JS/TS does not ship adapters for `Implementation` / `TypeDefinition` / `WorkspaceSymbol` / `CallHierarchy` / `TypeHierarchy` / `DocumentLink`. The TS worker's underlying `LanguageService` (`@typescript/vfs`-style host wired via `tau-sync-ts-worker.ts`) exposes the corresponding `getImplementationAtPosition`, `getTypeDefinitionAtPosition`, `getNavigateToItems`, `provideCallHierarchyItems`, `provideCallHierarchyIncomingCalls`, `provideCallHierarchyOutgoingCalls` calls. Author each adapter under `apps/ui/app/lib/monaco-typescript-extras/` against `MaterializingLibFiles` and the existing `workerAccessor`:

| Adapter                  | TS Service call                                                                                           | Extra warmup needed                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ImplementationAdapter`  | `getImplementationAtPosition`                                                                             | Pre-materialise result URIs (mirrors `DefinitionAdapter`)                                                                                                          |
| `TypeDefinitionAdapter`  | `getTypeDefinitionAtPosition`                                                                             | Pre-materialise result URIs                                                                                                                                        |
| `WorkspaceSymbolAdapter` | `getNavigateToItems(query, maxResultCount, undefined)`                                                    | Returns `SymbolInformation[]` with filename URIs; no per-URI materialisation needed for the result list itself, but click-through goes through the registry opener |
| `CallHierarchyAdapter`   | `provideCallHierarchyItems` + `getIncomingCalls` + `getOutgoingCalls`                                     | Pre-materialise on each direction expansion                                                                                                                        |
| `TypeHierarchyAdapter`   | (Not yet exposed by Monaco's `TypeScriptWorker`; defer until R11 worker extension or upstream hook lands) | n/a                                                                                                                                                                |
| `DocumentLinkAdapter`    | Walks AST imports via worker; emits `{ range, target: monaco.Uri }`                                       | None — link click goes through the registered editor opener                                                                                                        |

These adapters are out-of-the-box wins once the registry exists: each is ~50 lines following the exact shape of bundled `DefinitionAdapter`. They land in the same PR series as R4 because every one of them requires `MaterializingLibFiles` to be useful.

### `MonacoModelService` change-propagation contract (R11)

After R2, `MonacoModelService` keeps its responsibility for owning `monaco.editor` model lifecycle but delegates materialisation to the registry. The change-propagation contract becomes:

1. On `openTextDocument(uri)`, the registry resolves the provider and calls `provider.onDidChange(uri, listener)`. The `listener` invokes `MonacoModelService.refreshContent(uri)`.
2. `refreshContent` calls `provider.readText(uri)` (or `peekText` if synchronous), compares against `model.getValue()`, and applies the diff via `pushEditOperations` (preserves undo for held models) or `setValue` (non-held, e.g. ATA cache models).
3. On `model.dispose()`, the registry disposes the `onDidChange` subscription.

This is uniform across every scheme. No more `MonacoModelService.handleContentChange` listening to `FileContentService.onDidContentChange` — that wiring moves into `WorkspaceFileSystemProvider` where it belongs.

### Multi-mount `WorkspaceFileSystemProvider` (R15)

Construct `WorkspaceFileSystemProvider` with the live `MountTable` (or `WorkspaceFileService` which already wraps it). For an incoming `monaco.Uri` with scheme `file`:

1. Extract path: `pathFromUri(uri)`.
2. Resolve owning mount: `mountTable.resolveMount(path)` returns `{ mount, relativePath }`.
3. Read via that mount's `FileContentService` instance.

For URI fan-out (Finding 11's `findFiles`), iterate every mount in `mountTable.mounts` and merge results, prefixing each result with its mount path before reconstructing the URI. This keeps the provider scheme-shaped (one `file://` namespace) while delegating storage routing to the existing mount infrastructure. Phase 4-6 multi-root workspaces (ECAD libraries, firmware-electrical co-design, fleet variant simulation packs) drop in by registering additional mounts — the registry contract doesn't change.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Priority | Effort | Impact                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Introduce `MonacoWorkspaceFs` registry under `apps/ui/app/lib/monaco-workspace-fs/` with **split** `MonacoFileSystemProvider` and `MonacoTextDocumentContentProvider` registries (Finding 9); ship `WorkspaceFileSystemProvider` (`file://`) + `ExtraLibsFileSystemProvider` (`extraLibs://`) + `InMemoryFileSystemProvider` (`inmemory://`) in the first pass. ~250 lines + colocated tests.                                                                                                                      | P0       | Medium | High — foundation for every later step                                                                                                                               |
| R2  | Refactor `MonacoModelService.getOrEnsureModel(path)` → `getOrEnsureModel(uri)` and delegate to `MonacoWorkspaceFs.openTextDocument`. Internal maps keyed on `uri.toString()`. Existing `path` callers wrap via `monaco.Uri.file(\`/${path}\`)` at the boundary.                                                                                                                                                                                                                                                    | P0       | Low    | Eliminates the dual-source-of-truth between path lookup and URI lookup                                                                                               |
| R3  | Refactor `monaco-navigation-service` opener: replace `handlers.find(h => h.canHandle(path))` with `workspaceFs.canMaterialise(uri)`; replace `modelService.getOrEnsureModel(relativePath)` with `workspaceFs.openTextDocument(resource)`. Delete the per-handler `canHandle`/`isReadOnly` interface.                                                                                                                                                                                                               | P0       | Low    | One opener handles every scheme uniformly                                                                                                                            |
| R4  | Subclass `LibFiles` as `MaterializingLibFiles`; re-register `DefinitionAdapter`/`ReferenceAdapter` for `typescript`/`javascript`/`typescriptreact`/`javascriptreact` against the subclass (constructor signature is `(libFiles, worker)` per `languageFeatures.js:626`); ship `MaterializingRenameAdapter` (R12 below) in the same PR series. Add unit tests asserting `provideDefinition`, `provideReferences`, and `provideRenameEdits` each return URIs/edits for `./lib/cube.js`.                              | P0       | Medium | Closes the JS/TS Cmd+Click regression for definition, references, and rename simultaneously                                                                          |
| R5  | Delete `ensureModelForUri` from `kcl-language/lsp/providers/definition-provider.ts` (and the `getOrEnsureModel` plumbing in `kcl-register-language.ts`); KCL's provider returns a `Location` and Monaco's editor opener handles materialisation through `MonacoWorkspaceFs`.                                                                                                                                                                                                                                       | P1       | Low    | -80 lines; deletes the "fallback path" double-implementation                                                                                                         |
| R6  | Delete OpenSCAD's scratch-model dance in `openscad-definition.ts:73-98`; add a `WorkspaceTextProvider` helper on `MonacoWorkspaceFs` that returns `{ text, dispose }` for read-only AST analysis without registering a model in `monaco.editor`. The opener still routes the eventual navigation through the registry.                                                                                                                                                                                             | P1       | Low    | -25 lines; one materialisation per navigation                                                                                                                        |
| R7  | Migrate `TypeAcquisitionService` to register an `extraLibs://`-backed provider against `MonacoWorkspaceFs` instead of (or in parallel with) `addExtraLib`. Once `MaterializingLibFiles` is in place, the static kernel `.d.ts` and esm.sh-fetched typings become first-class navigable URIs (peek-into-typings improves: today peeking jumps to a synthesised model with no provenance, after R7 the URI carries the registered provider's metadata).                                                              | P2       | Medium | Aligns ATA with the canonical primitive; unblocks future "fork the typings file into the workspace" UX                                                               |
| R8  | Once R1-R6 land, codify in `docs/policy/language-contribution-policy.md`: "Language contributions must not call `monaco.editor.createModel` directly; navigation results return URIs and the registry materialises." Add a custom oxlint JS rule under `libs/oxlint/` that bans `monaco.editor.createModel` outside `monaco-workspace-fs/`, `monaco-model-service.ts`, and tests.                                                                                                                                  | P2       | Low    | Prevents the next contribution from re-introducing per-language materialisation                                                                                      |
| R9  | Introduce a `tau-kernel://` `MonacoTextDocumentContentProvider` for kernel-emitted artefact previews (GLB metadata dumps, OCCT XCAF tree exports). Surfaces as Cmd+Click targets from chat tool outputs. Goes through the content-provider registry (Finding 9), not the FS registry.                                                                                                                                                                                                                              | P3       | Medium | Extends the navigation surface to include AI-generated artefacts in line with vision-policy Phase 2-6                                                                |
| R10 | Author Tau-side `ImplementationAdapter`/`TypeDefinitionAdapter`/`WorkspaceSymbolAdapter`/`CallHierarchyAdapter`/`DocumentLinkAdapter` under `apps/ui/app/lib/monaco-typescript-extras/`, registered against `MaterializingLibFiles` from R4 (Finding 8). Each ~50 lines following bundled `DefinitionAdapter` shape. Tests assert each provider returns URIs that the registry can materialise.                                                                                                                    | P1       | Medium | Brings JS/TS feature parity with VS Code's TS extension; closes the gap Monaco's bundled ts adapter leaves                                                           |
| R11 | Add `MonacoFileSystemProvider.onDidChange` as REQUIRED in v1; route every provider's events through `MonacoModelService.refreshContent(uri)` (`pushEditOperations` for held models, `setValue` for non-held). Move `FileContentService.onDidContentChange` wiring out of `MonacoModelService` and into `WorkspaceFileSystemProvider` where it belongs (Finding 12).                                                                                                                                                | P0       | Low    | Makes file-change → model-update uniform across every scheme; eliminates per-scheme listener wiring on the model service                                             |
| R12 | Ship `MaterializingRenameAdapter` (Finding 10): subclass `RenameAdapter`, override `provideRenameEdits` to call `await workspaceFs.materialiseUrisForWorkspaceEdit(...)` between `findRenameLocations` and the synchronous `getOrCreateModel` loop. Bundled `RenameAdapter` throws `Unknown file ${fileName}` for unmaterialised URIs — this is the rename equivalent of the Cmd+Click bug. Test asserts cross-file rename (`makeCube` defined in `./lib/cube.js`, used in `main.js`) applies edits to both files. | P0       | Medium | Closes the rename-across-unopened-files gap; same primitive unblocks future CodeAction-based refactors that emit cross-file `WorkspaceEdit`s                         |
| R13 | Expose `MonacoWorkspaceFs.findFiles(pattern, options?)` (Finding 11): fan out to each file-system provider's optional `findFiles`, merge results. `WorkspaceFileSystemProvider.findFiles` delegates to `FileSystemClient.searchFiles` (existing); `ExtraLibsFileSystemProvider.findFiles` walks `getExtraLibs()` keys; content providers return `[]`. Required by R10's `WorkspaceSymbolAdapter`.                                                                                                                  | P1       | Low    | Single workspace-walking primitive; future content-search RPC plugs in here                                                                                          |
| R14 | Make `MonacoWorkspaceFs.openTextDocument` resolution order explicit: file-system providers first, then content providers (Finding 9, mirrors VS Code `vscode.d.ts:14161-14162`). Unit test asserts a `tau-kernel://` content provider doesn't shadow a same-scheme FS provider if one is registered later.                                                                                                                                                                                                         | P0       | Low    | Locks in the precedence so future schemes can't accidentally swap order                                                                                              |
| R15 | Construct `WorkspaceFileSystemProvider` with the live `MountTable` (or `WorkspaceFileService`) instead of a single root path (Finding 13). URI → mount resolution → underlying provider read happens inside the provider; `findFiles` fan-out iterates every mount. Validated by adding a second mount in tests and asserting cross-mount go-to-definition materialises through the registry.                                                                                                                      | P1       | Medium | Unblocks Phase 4-6 multi-root storage topologies (ECAD libs, firmware-electrical co-design, fleet variant simulation packs) without re-opening the registry contract |

## Trade-offs

| Approach                                                                                      | Pros                                                                                                                                                                                                                                                                                                                                                                                          | Cons                                                                                                                                                                                                                                                                                          | Verdict                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Status quo** (per-language materialisation)                                                 | No new code                                                                                                                                                                                                                                                                                                                                                                                   | Each new language pays the tax; JS/TS Cmd+Click stays broken; ATA can't be aligned; rename across unopened files throws; cross-mount go-to-definition impossible                                                                                                                              | Reject — incompatible with vision-policy scaling                     |
| **Patch `monaco-editor` package (`pnpm patch`)**                                              | Simplest possible diff for the JS/TS fix                                                                                                                                                                                                                                                                                                                                                      | Breaks on every Monaco bump; doesn't address KCL/OpenSCAD/future; user explicitly preferred algorithmic fixes over patches                                                                                                                                                                    | Reject                                                               |
| **Restore the deleted `javascript-definition-provider.ts`**                                   | Restores Cmd+Click for JS/TS only                                                                                                                                                                                                                                                                                                                                                             | Re-introduces the manual definition provider that was deleted because Monaco's bundled adapter is the right place; doesn't close the references / rename gap; per-language tax persists                                                                                                       | Reject — same problem with a different mask                          |
| **Single combined `MonacoFileSystemProvider` (no content-provider split)**                    | Smaller registry surface                                                                                                                                                                                                                                                                                                                                                                      | Conflates writable backing-store and read-only synthetic content (Finding 9); collapses VS Code's documented resolution order; future `tau-kernel://`/`output://`/`git://` schemes have to fake `stat`/`readDirectory` semantics they don't own                                               | Reject — keep the split that VS Code converged on after years of use |
| **Single-root `WorkspaceFileSystemProvider` with deferred multi-mount migration**             | Minimal first-pass implementation                                                                                                                                                                                                                                                                                                                                                             | Phase 4-6 ECAD/firmware/simulation libraries (Finding 13) require breaking the constructor and revisiting every URI→path call site mid-flight; the cost of mount-awareness in v1 is small (`MountTable` already exists) compared to the retro-fit cost                                        | Reject — build mount-awareness in from day one (R15)                 |
| **Optional `onDidChange` on providers (model service hand-rolls per-scheme listeners)**       | Easier provider authoring                                                                                                                                                                                                                                                                                                                                                                     | Every new scheme that wants live-reload either re-implements the model-service update loop or has stale models (Finding 12); ad-hoc per-scheme wiring on the model service is precisely the per-language tax we're trying to eliminate                                                        | Reject — require `onDidChange` in v1 (R11)                           |
| **Defer Tau-authored extras adapters (Implementation/TypeDef/WorkspaceSymbol/CallHierarchy)** | Smaller P1 scope                                                                                                                                                                                                                                                                                                                                                                              | Half a JS/TS upgrade — users get definition/references/rename via the registry but lose Cmd+Shift+T (workspace symbols) and Cmd+Shift+I (implementations) silently because Monaco's bundled JS/TS doesn't ship them at all (Finding 8); ships in the same PR series for ~50 lines per adapter | Reject — author concurrently with R4 (R10)                           |
| **`MonacoWorkspaceFs` registry (R1-R15)**                                                     | One canonical primitive across both file-system and content-provider shapes; closes JS/TS regression for definition + references + rename + implementation + type-definition + workspace-symbol + call-hierarchy in one PR series; deletes ~150 lines of per-language code; uniform `onDidChange`; multi-mount-aware from v1; unblocks Phase 2-6 languages with zero further registry changes | Larger Monaco-internal adapter swap (`MaterializingLibFiles` + `MaterializingRenameAdapter` + 5 extras adapters); requires re-baselining `MonacoModelService` to URI keys                                                                                                                     | **Adopt**                                                            |
| **Adopt `vscode-uri` schemes wholesale** (`vscode-node-modules`, `vscode-global-typings`)     | Direct VS Code parity; future ports of VS Code extensions become trivial                                                                                                                                                                                                                                                                                                                      | URIs leak VS Code-specific scheme names into Tau code; unnecessary semantic baggage; `extraLibs://` and `tau-kernel://` are clearer for our consumers                                                                                                                                         | Reject — borrow the _pattern_, not the scheme strings                |

## Code Examples

### R3: refactored `monaco-navigation-service` opener

```typescript
const openerDisposable = monaco.editor.registerEditorOpener({
  openCodeEditor(_source, resource, selectionOrPosition) {
    if (!workspaceFs.canMaterialise(resource)) {
      return false;
    }

    const { lineNumber, column } = readPosition(selectionOrPosition);
    pendingNavigation = { uri: resource, lineNumber, column };

    void (async () => {
      try {
        const model = await workspaceFs.openTextDocument(resource);
        if (!model) {
          pendingNavigation = undefined;
          return;
        }
        const provider = workspaceFs.getProvider(resource.scheme);
        if (provider?.openInEditor?.(resource) ?? true) {
          editorRef.send({
            type: 'openFile',
            path: extractPathFromUri(resource.path),
            source: 'user',
            readOnly: provider?.isReadOnly?.(resource) ?? false,
            lineNumber,
            column,
          });
        }
      } catch {
        pendingNavigation = undefined;
      }
    })();

    return true;
  },
});
```

The opener no longer cares about scheme, language, or read-only logic. Every concern lives in the provider.

### R4 + R12: `MaterializingLibFiles` adapter swap with rename pre-materialisation

Constructor signature note: `LibFiles` is `(worker)`; `DefinitionAdapter` / `ReferenceAdapter` / `RenameAdapter` are all `(libFiles, worker)` per `monaco-editor/esm/vs/language/typescript/languageFeatures.js:626/660/911`. Pass arguments in that order at construction time.

```typescript
import {
  LibFiles,
  DefinitionAdapter,
  ReferenceAdapter,
  RenameAdapter,
} from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';

class MaterializingLibFiles extends LibFiles {
  public constructor(
    worker: unknown,
    private readonly fs: MonacoWorkspaceFs,
  ) {
    super(worker);
  }

  public override getOrCreateModel(fileName: string): monaco.editor.ITextModel | null {
    const upstream = super.getOrCreateModel(fileName);
    if (upstream) return upstream;
    const uri = monaco.Uri.parse(fileName);
    return this.fs.peekModel(uri) ?? null;
  }

  public override async fetchLibFilesIfNecessary(uris: readonly monaco.Uri[]): Promise<void> {
    await super.fetchLibFilesIfNecessary(uris);
    const projectFileUris = uris.filter((uri) => this.fs.canMaterialise(uri));
    await this.fs.materialiseUrisForWorkspaceEdit(projectFileUris);
  }
}

class MaterializingRenameAdapter extends RenameAdapter {
  public constructor(
    libFiles: MaterializingLibFiles,
    worker: unknown,
    private readonly fs: MonacoWorkspaceFs,
  ) {
    super(libFiles, worker);
  }

  public override async provideRenameEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    newName: string,
    token: monaco.CancellationToken,
  ): Promise<(monaco.languages.WorkspaceEdit & monaco.languages.Rejection) | undefined> {
    const worker = await (
      this as unknown as {
        _worker(uri: monaco.Uri): Promise<{
          findRenameLocations(...args: unknown[]): Promise<readonly { fileName: string }[] | undefined>;
        }>;
      }
    )._worker(model.uri);

    const offset = model.getOffsetAt(position);
    const renameLocations = await worker.findRenameLocations(model.uri.toString(), offset, false, false, false);
    if (!renameLocations) return undefined;
    if (token.isCancellationRequested) return undefined;

    await this.fs.materialiseUrisForWorkspaceEdit(renameLocations.map((l) => monaco.Uri.parse(l.fileName)));

    return super.provideRenameEdits(model, position, newName, token);
  }
}

monaco.typescript.typescriptDefaults.setModeConfiguration({
  ...monaco.typescript.typescriptDefaults.modeConfiguration,
  definitions: false,
  references: false,
  rename: false,
});

const libFiles = new MaterializingLibFiles(workerAccessor, workspaceFs);
for (const lang of ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']) {
  monaco.languages.registerDefinitionProvider(lang, new DefinitionAdapter(libFiles, workerAccessor));
  monaco.languages.registerReferenceProvider(lang, new ReferenceAdapter(libFiles, workerAccessor));
  monaco.languages.registerRenameProvider(lang, new MaterializingRenameAdapter(libFiles, workerAccessor, workspaceFs));
}
```

`peekModel` returns the synchronously-cached model when `WorkspaceFileSystemProvider.peekText(uri)` resolves a `text` outcome; the eager-warmup path runs inside `fetchLibFilesIfNecessary` (called by `DefinitionAdapter`/`ReferenceAdapter` _before_ the synchronous `getOrCreateModel` loop) and inside `MaterializingRenameAdapter.provideRenameEdits` (which the bundled `RenameAdapter` doesn't pre-warm — Finding 10).

### R6: OpenSCAD without scratch models

```typescript
async function definitionInImportedFile(options: {
  workspaceFs: MonacoWorkspaceFs;
  targetUri: Monaco.Uri;
  wordText: string;
  mode: 'use' | 'include';
}): Promise<Monaco.languages.Location | undefined> {
  const reader = await options.workspaceFs.openTextProvider(options.targetUri);
  if (!reader) return undefined;
  try {
    const lineNumber = findDeclarationLine(reader.text, options.wordText, options.mode);
    if (lineNumber === undefined) return undefined;
    return {
      uri: options.targetUri,
      range: new monaco.Range(lineNumber, 1, lineNumber, reader.lineLength(lineNumber) + 1),
    };
  } finally {
    reader.dispose();
  }
}
```

`openTextProvider` returns text + utility functions without registering a model in `monaco.editor`; the navigation `Location` returned to Monaco still routes through the editor opener for actual model creation.

### R10: `WorkspaceSymbolAdapter` against `MaterializingLibFiles`

```typescript
import { Adapter } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';

export class WorkspaceSymbolAdapter extends Adapter implements monaco.languages.WorkspaceSymbolProvider {
  public constructor(
    private readonly libFiles: MaterializingLibFiles,
    worker: (...uris: monaco.Uri[]) => Promise<TauTypeScriptWorker>,
  ) {
    super(worker);
  }

  public async provideWorkspaceSymbols(
    query: string,
    token: monaco.CancellationToken,
  ): Promise<monaco.languages.WorkspaceSymbol[]> {
    const worker = await this._worker();
    if (token.isCancellationRequested) return [];

    const items = await worker.getNavigateToItems(query, /* maxResults */ 256, undefined, true);
    if (!items) return [];

    await this.libFiles.fetchLibFilesIfNecessary(items.map((item) => monaco.Uri.parse(item.fileName)));

    return items.map((item) => ({
      name: item.name,
      containerName: item.containerName ?? '',
      kind: convertSymbolKind(item.kind),
      location: {
        uri: monaco.Uri.parse(item.fileName),
        range: textSpanToRange(item),
      },
    }));
  }
}

monaco.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolAdapter(libFiles, workerAccessor));
```

The adapter is a thin shell over a TS service call the bundled JS/TS doesn't expose to Monaco. Pre-materialising via `fetchLibFilesIfNecessary` ensures click-through from the symbol list works the moment the first result is selected. Implementation/TypeDefinition/CallHierarchy/DocumentLink follow the same shape.

### R13: `findFiles` fan-out across providers

```typescript
async function findFiles(
  this: MonacoWorkspaceFsImpl,
  pattern: string,
  options?: { maxResults?: number },
): Promise<readonly monaco.Uri[]> {
  const max = options?.maxResults ?? Number.POSITIVE_INFINITY;
  const results: monaco.Uri[] = [];
  for (const provider of this.fileSystemProviders.values()) {
    if (!provider.findFiles) continue;
    const remaining = max - results.length;
    if (remaining <= 0) break;
    const batch = await provider.findFiles(pattern, { maxResults: remaining });
    results.push(...batch);
  }
  return results;
}
```

## Diagrams

### Data flow: Cmd+Click on `./lib/cube.js` under R1-R4

```
┌────────────────┐  Cmd+Click   ┌──────────────────────┐
│ Monaco editor  │─────────────▶│  DefinitionAdapter    │
└────────────────┘              │  (re-registered ours) │
                                └──────────┬────────────┘
                                           │ getDefinitionAtPosition
                                           ▼
                                ┌──────────────────────┐
                                │  TauSyncTsWorker     │  Tier-0/1/2 read pipeline (existing)
                                │  (libs/lsp/...)       │  → file:///lib/cube.js, span={...}
                                └──────────┬────────────┘
                                           │ entries[]
                                           ▼
                                ┌──────────────────────────┐
                                │  MaterializingLibFiles    │
                                │  .getOrCreateModel(uri)   │
                                └──────────┬────────────────┘
                                           │ branches 1-3 miss
                                           ▼
                                ┌──────────────────────────────┐
                                │ MonacoWorkspaceFs.peekModel  │  ← R1
                                └──────────┬────────────────────┘
                                           │ provider['file'] hit
                                           ▼
                                ┌──────────────────────────────┐
                                │ WorkspaceFileSystemProvider  │
                                │  .readText(uri)               │
                                └──────────┬────────────────────┘
                                           │ FileContentService.resolve
                                           ▼
                                ┌──────────────────────────────┐
                                │ FileContentService (existing)│
                                │  → text outcome              │
                                └──────────┬────────────────────┘
                                           │
                                           ▼
                                ┌──────────────────────────────┐
                                │ monaco.editor.createModel    │
                                │  (registered in registry)    │
                                └──────────┬────────────────────┘
                                           │ Location[]
                                           ▼
                                ┌──────────────────────────────┐
                                │ Monaco editor opener          │  ← R3
                                │  (workspaceFs.canMaterialise) │
                                └──────────────────────────────┘
```

Every step except the last two layers and the `peekModel` arrow already exists today. R1-R4 are bolted onto the working pipeline.

### Provider registry topology

```
                                     ┌──────────────────────┐
                                     │  MonacoWorkspaceFs   │
                                     │  (split registries)  │
                                     └──────────┬───────────┘
              ┌─────────────────────────────────┴─────────────────────────────────┐
              │                                                                   │
              ▼                                                                   ▼
   FileSystemProvider registry                                  TextDocumentContentProvider registry
   (resolution priority: 1)                                     (resolution priority: 2)
              │                                                                   │
   ┌──────────┼──────────┬──────────────────────┐               ┌─────────────────┼────────────────┐
   │          │          │                      │               │                 │                │
   ▼          ▼          ▼                      ▼               ▼                 ▼                ▼
┌────────┐ ┌──────────┐ ┌──────────┐  ┌────────────────┐ ┌────────────────┐ ┌─────────────┐ ┌────────────┐
│ file://│ │extraLibs:│ │inmemory: │  │tau-publication:│ │ tau-kernel://  │ │  git://     │ │ output://  │
│        │ │ //       │ │ //       │  │ //  (Phase 2+) │ │ (R9)           │ │ (Phase 5+)  │ │ (Phase 5+) │
└───┬────┘ └────┬─────┘ └────┬─────┘  └───────┬────────┘ └───────┬────────┘ └──────┬──────┘ └──────┬─────┘
    │           │            │                │                  │                  │               │
    ▼           ▼            ▼                ▼                  ▼                  ▼               ▼
MountTable→   typescript   in-memory    publication       kernel artefact     git revision      log stream
FileContentSvc Defaults     Map         snapshot (R/O)    bus (R/O)           store (R/O)       bus (R/O)
(R15)         .getExtraLibs
              + js variant
```

Adding a Phase 5 firmware language (Arduino) becomes: register a `MonacoFileSystemProvider` for `file://` URIs whose path matches `*.ino`/`*.cpp`/`*.h`, with `languageId: 'arduino'`. Adding a Phase 6 robotic-system spec format: register a `tau-spec://` provider. Neither touches the registry, the model service, the navigation service, or any existing contribution.

## Roadmap

Phased so each step is independently mergeable, type-safe end-to-end, and behind tests. P0-P2 are the smoking-gun fix path (Cmd+Click + cross-file rename + workspace symbol restored). P3-P5 are dedup. P6-P8 are vision-extensibility for Phase 2-6 languages.

| Phase                     | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Exit criteria                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — Foundation           | R1 + R2 + R11 + R14 + R15: `MonacoWorkspaceFs` module with split FS / content-provider registries, explicit resolution order, mount-aware `WorkspaceFileSystemProvider`, required `onDidChange` plumbed into `MonacoModelService.refreshContent`. URI-keyed `MonacoModelService`. `WorkspaceFileSystemProvider` (multi-mount) + `InMemoryFileSystemProvider` ship as the registered providers. Existing path-based `getOrEnsureModel` callers compile via boundary wrappers. | `pnpm nx test ui app/lib/monaco-workspace-fs --watch=false` green (precedence + multi-mount + onDidChange + materialiseUrisForWorkspaceEdit + findFiles tests); `pnpm nx test ui app/lib/monaco-model-service --watch=false` still green; behaviour unchanged for end users.                                                                                                  |
| P1 — JS/TS fix            | R3 + R4 + R12 + `ExtraLibsFileSystemProvider`: navigation opener refactor + `MaterializingLibFiles` (eager warmup via `fetchLibFilesIfNecessary`) + `MaterializingRenameAdapter` + `extraLibs://` provider.                                                                                                                                                                                                                                                                  | New unit tests: `provideDefinition` on `import { makeCube } from './lib/cube.js'` returns a `Location` whose `uri` materialises; `provideReferences` finds usages across closed files; `provideRenameEdits` applies edits to both `./lib/cube.js` and `main.js` simultaneously. Manual regression: Cmd+Click on `replicad`, `./lib/cube.js`, and `lib.dom.d.ts` all navigate. |
| P2 — JS/TS extras parity  | R10 + R13: `Implementation`/`TypeDefinition`/`WorkspaceSymbol`/`CallHierarchy`/`DocumentLink` adapters under `monaco-typescript-extras/`, registered against `MaterializingLibFiles`; `MonacoWorkspaceFs.findFiles` exposed and consumed by `WorkspaceSymbolAdapter`.                                                                                                                                                                                                        | Each adapter has a unit test asserting URI materialisation through the registry. Manual: Cmd+Shift+T (workspace symbol) lists symbols from unopened files; Cmd+Shift+I (implementation) navigates across files.                                                                                                                                                               |
| P3 — Contribution dedup   | R5 + R6: KCL `getOrEnsureModel` plumbing deletion + OpenSCAD scratch-model deletion (+ `WorkspaceTextProvider` helper for OpenSCAD AST analysis).                                                                                                                                                                                                                                                                                                                            | Existing KCL/OpenSCAD navigation tests still green; line counts in the touched files drop ~105 lines combined.                                                                                                                                                                                                                                                                |
| P4 — ATA alignment        | R7: TAS migrates to `extraLibs://` provider registration (parallel with `addExtraLib` until callers are off the legacy path).                                                                                                                                                                                                                                                                                                                                                | ATA static + dynamic kernel typings appear as URIs the registry can materialise; existing `javascript-contribution-static-kernel-types.test.ts` extended with a "navigate from import to typings" assertion.                                                                                                                                                                  |
| P5 — Policy enforcement   | R8: oxlint JS rule + `language-contribution-policy.md` update.                                                                                                                                                                                                                                                                                                                                                                                                               | New rule fires on a fixture file that calls `monaco.editor.createModel` outside the allowlist (`monaco-workspace-fs/`, `monaco-model-service.ts`, tests).                                                                                                                                                                                                                     |
| P6 — Vision extensibility | R9: `tau-kernel://` `MonacoTextDocumentContentProvider` for chat-tool artefact previews.                                                                                                                                                                                                                                                                                                                                                                                     | Cmd+Click from `chat-message-tool-test-model` GLB metadata into a generated `tau-kernel://` URI opens a registered viewer.                                                                                                                                                                                                                                                    |
| P7 — Phase 2 publications | `tau-publication://` `MonacoFileSystemProvider` for forking shared projects.                                                                                                                                                                                                                                                                                                                                                                                                 | Peek-into-publication shows files via the registry; "fork into workspace" copies bytes through the provider's `readText` path.                                                                                                                                                                                                                                                |
| P8 — Phase 4-6 languages  | New language contributions register their providers without touching the registry.                                                                                                                                                                                                                                                                                                                                                                                           | Adding Arduino / SysML / Python / Rust requires zero registry changes; each contribution is a single `register*Provider` call from its `activate()`.                                                                                                                                                                                                                          |

## Out of Scope (Future Planning)

This blueprint is bounded to the **URI → `ITextModel` materialisation primitive** and the providers that depend on it. VS Code's language-feature surface includes a wider catalogue of registration APIs (`vscode.d.ts:14900-15234`) — most don't depend on materialising other URIs and can be authored directly against `monaco.languages.register*Provider` without going through `MonacoWorkspaceFs`. They are catalogued here so future planning phases can reference a single inventory rather than re-walking `vscode.d.ts`.

### Position-local provider family (no foreign URI materialisation)

These providers operate on a single `ITextModel` at a position; their results don't return URIs that need materialising. They land per-language as part of each contribution, not as a registry concern.

| Provider                       | Monaco bundled (JS/TS)? | Per-language ownership | Notes                                            |
| ------------------------------ | ----------------------- | ---------------------- | ------------------------------------------------ |
| `HoverProvider`                | Yes                     | Each kernel            | LSP `textDocument/hover`                         |
| `CompletionItemProvider`       | Yes                     | Each kernel            | LSP `textDocument/completion`                    |
| `SignatureHelpProvider`        | Yes                     | Each kernel            | LSP `textDocument/signatureHelp`                 |
| `DocumentHighlightProvider`    | Yes (TS only)           | Each kernel            | LSP `textDocument/documentHighlight`             |
| `SelectionRangeProvider`       | Yes                     | Each kernel            | LSP `textDocument/selectionRange`                |
| `LinkedEditingRangeProvider`   | No                      | Each kernel            | LSP `textDocument/linkedEditingRange`            |
| `InlineCompletionItemProvider` | Yes                     | Each kernel            | Cursor-style inline ghost text; orthogonal to FS |

### Document-shaped provider family (single-URI focus)

These providers contribute UI overlays on a single document; they don't materialise foreign URIs and don't need the registry.

| Provider                                                                                      | Monaco bundled (JS/TS)? | Per-language ownership | Notes                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- | -------------------------------------------------------- |
| `DocumentSymbolProvider`                                                                      | Yes                     | Each kernel            | LSP `textDocument/documentSymbol` — outline view         |
| `FoldingRangeProvider`                                                                        | Yes                     | Each kernel            | Outline-driven code folding                              |
| `DocumentFormattingProvider` / `DocumentRangeFormattingProvider` / `OnTypeFormattingProvider` | Yes                     | Each kernel            | Formatter integration; emits text edits for one document |
| `SemanticTokensProvider` (`Document` / `DocumentRange`)                                       | Yes                     | Each kernel            | Theme-aware semantic colouring                           |
| `InlayHintsProvider`                                                                          | Yes                     | Each kernel            | Inline parameter / type hints                            |
| `DocumentColorProvider`                                                                       | Yes                     | Each kernel            | Inline colour swatches in CSS-shaped languages           |
| `EvaluatableExpressionProvider`                                                               | No                      | Debug feature          | Out of scope until Tau ships a debugger                  |
| `InlineValuesProvider`                                                                        | No                      | Debug feature          | Out of scope until Tau ships a debugger                  |
| `DocumentDropEditProvider` / `DocumentPasteEditProvider`                                      | No                      | Per-editor concern     | UI-driven, not FS-driven                                 |

### Diagnostics / problems pipeline

`vscode.languages.createDiagnosticCollection` and the `DiagnosticsProvider` shape are owned per-language via Monaco's `setModelMarkers`. The registry has no role: each LSP worker pushes markers to the active model directly. Out of scope.

### Workspace-walking primitives beyond `findFiles`

| Primitive                                                                        | Status          | Notes                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace.findInFiles(query, options)` (content grep)                           | Future planning | No Tau RPC today; first consumer would be a `WorkspaceSymbolProvider` for non-LSP languages. Would extend `MonacoWorkspaceFs` with `findInFiles`; provider methods plug into existing `FileSystemClient` if/when the bridge gains content-search RPC. |
| `workspace.applyEdit(edit, metadata)` (programmatic `WorkspaceEdit` application) | Future planning | Out of scope until a UI surface (e.g. CodeAction batch apply, refactor wizard) needs it; until then `materialiseUrisForWorkspaceEdit` (R12) covers the language-feature path.                                                                         |
| `workspace.openNotebookDocument` / notebook providers                            | Out of scope    | Tau has no notebook surface in the Vision; revisit if a Phase 6 simulation REPL appears.                                                                                                                                                              |
| `workspace.fs.copy` / `workspace.fs.rename` cross-scheme                         | Future planning | Existing `FileSystemClient` covers single-scheme moves; cross-scheme (e.g. `tau-publication://` → `file://` on fork) is one explicit method on `MonacoWorkspaceFs` when the publication flow lands.                                                   |

### Additional content-provider schemes (beyond `tau-kernel://`)

Each is a `MonacoTextDocumentContentProvider` candidate that lights up when the corresponding feature ships. None require registry changes — only a single `registerTextDocumentContentProvider(scheme, provider)` call.

| Scheme                  | Trigger                                                                         | Notes                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `git://`                | Vision Phase 5 (collaborative history)                                          | Shows historical revisions of `file://` URIs; provider answers `provideTextDocumentContent({sha, path}) → string` |
| `output://`             | Build / kernel-runner log surfacing                                             | Each runner gets its own URI; `onDidChange` fires per-line append                                                 |
| `tau-diff://`           | Future "compare against publication" UX                                         | Pure function of `(baseUri, headUri) → unified-diff text`                                                         |
| `tau-readme-preview://` | Markdown README preview pane (publication route already does this inline today) | Could move to a content provider when the preview surface generalises                                             |

### Provider features explicitly NOT bundled by Monaco JS/TS even after R10

`TypeHierarchyProvider` is the only URI-returning provider in VS Code's catalogue that Monaco's `TypeScriptWorker` doesn't expose a corresponding TS service call for. Lighting it up requires either upstream Monaco work (extend `TypeScriptWorker` with `provideTypeHierarchy*`) or a custom worker build (R11 of `monaco-typescript-intellisense-investigation.md`). Catalogued here so future planning knows the dependency.

### Cross-cutting policy questions

| Question                           | Future planning notes                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URI canonicalisation across mounts | When a single workspace path is accessible via multiple URIs (e.g. `file:///workspace/foo.js` vs `file:///workspace/sub/../foo.js`), pick one canonical form at the registry boundary. Today every consumer round-trips through `monaco.Uri.toString()`; future R requires explicit normalisation policy. |
| Cross-mount path normalisation     | Phase 4-6 ECAD libs may share a path under multiple mount prefixes (e.g. `/workspace/lib/three.d.ts` and `/workspace/.taucad/types/three.d.ts` resolving to the same backing store). Decide whether the registry presents a unified URI or each mount keeps its own.                                      |
| Provider revocation lifecycle      | `registerFileSystemProvider` returns `IDisposable`; document the contract for what happens to open models on disposal (close? mark read-only? throw on next read?).                                                                                                                                       |
| Multi-tab provider coordination    | Today `CrossTabCoordinator` syncs `file://` writes across tabs. Future schemes (`extraLibs://` ATA cache, `inmemory://` test scratch) need explicit decisions on cross-tab semantics — out of scope until a non-`file://` provider needs it.                                                              |

## References

- VS Code primitives: `repos/vscode/src/vscode-dts/vscode.d.ts` lines 9598-9700 (`FileSystemProvider`), 1845-1872 (`TextDocumentContentProvider`), 14155-14200 (`workspace.openTextDocument`).
- VS Code TS extension FS providers: `repos/vscode/extensions/typescript-language-features/src/filesystems/{ata.ts, autoInstallerFs.ts, memFs.ts}`.
- Monaco bundled adapter classes: `node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js` (`LibFiles`, `DefinitionAdapter`, `ReferencesAdapter`, `RenameAdapter`).
- Monaco public adapter swap surface: `node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js` (`setModeConfiguration`).
- Existing related research: [scalable-language-contribution-fs-architecture.md](./scalable-language-contribution-fs-architecture.md), [monaco-typescript-intellisense-investigation.md](./monaco-typescript-intellisense-investigation.md), [language-fs-bridge-implementation.md](./language-fs-bridge-implementation.md), [vscode-style-resolution-and-virtual-types.md](./vscode-style-resolution-and-virtual-types.md), [vscode-typescript-features.md](./vscode-typescript-features.md).
- Policies: [vision-policy.md](../policy/vision-policy.md), [language-contribution-policy.md](../policy/language-contribution-policy.md), [filesystem-policy.md](../policy/filesystem-policy.md), [library-api-policy.md](../policy/library-api-policy.md).

## Appendix: smoking-gun call sites

| File                                                                                                                                       | Lines                                                                      | What it does today                                                                                              | What it does after R1-R15                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js`                                                                | `LibFiles.getOrCreateModel` (~line 525)                                    | Returns `null` for project-file URIs; drops the entry from `Definition[]`                                       | Subclass branch 4 falls into `MonacoWorkspaceFs.peekModel(uri)`                                                                                                         |
| `node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js`                                                                | `LibFiles.fetchLibFilesIfNecessary` (~line 545)                            | Fetches missing `lib.*.d.ts` only                                                                               | Subclass also pre-materialises project-file URIs via `MonacoWorkspaceFs.materialiseUrisForWorkspaceEdit`                                                                |
| `node_modules/monaco-editor/esm/vs/language/typescript/languageFeatures.js`                                                                | `RenameAdapter.provideRenameEdits` (line 911-940)                          | Throws `Unknown file ${fileName}` for unmaterialised URIs because there's no `fetchLibFilesIfNecessary` warm-up | `MaterializingRenameAdapter` subclass calls `materialiseUrisForWorkspaceEdit` before super (R12)                                                                        |
| `apps/ui/app/lib/monaco-model-service.ts`                                                                                                  | `getOrEnsureModel(path)`, `handleContentChange`, `pushEditOperations` site | Path-keyed materialiser for `file://` only; listens to `FileContentService.onDidContentChange` directly         | URI-keyed; delegates materialisation to `MonacoWorkspaceFs.openTextDocument(uri)`; consumes `provider.onDidChange` events through registry-wired `refreshContent` (R11) |
| `apps/ui/app/lib/monaco-navigation-service.ts`                                                                                             | 90-168 (opener)                                                            | `extractPathFromUri` + `handlers.find(h => h.canHandle(path))` + `modelService.getOrEnsureModel(relativePath)`  | `workspaceFs.canMaterialise(uri)` + `workspaceFs.openTextDocument(uri)` + scheme-routed `editorRef.send` (R3)                                                           |
| `apps/ui/app/lib/kcl-language/lsp/providers/definition-provider.ts`                                                                        | 118-119, 178-179, 196-197, 304-342                                         | `getOrEnsureModel` injection + `ensureModelForUri` fallback that re-implements materialisation                  | Provider returns `Location` only; opener materialises (R5)                                                                                                              |
| `apps/ui/app/lib/openscad-language/openscad-definition.ts`                                                                                 | 73-98                                                                      | `monaco.editor.createModel(text, 'openscad', targetUri)` then `dispose()` in `finally`                          | `workspaceFs.openTextProvider(uri)` returns text + helpers without touching `monaco.editor` (R6)                                                                        |
| `apps/ui/app/lib/type-acquisition-service.ts`                                                                                              | 99 (`addExtraLib`)                                                         | Direct registration on `typescriptDefaults`/`javascriptDefaults`                                                | `extraLibs://` provider proxies to the same `getExtraLibs()` getters; consumers see one URI scheme (R7)                                                                 |
| (new) `apps/ui/app/lib/monaco-workspace-fs/workspace-file-system-provider.ts`                                                              | n/a                                                                        | Doesn't exist                                                                                                   | Multi-mount-aware `file://` provider built on `MountTable` + `FileContentService` (R15)                                                                                 |
| (new) `apps/ui/app/lib/monaco-typescript-extras/{implementation,type-definition,workspace-symbol,call-hierarchy,document-link}-adapter.ts` | n/a                                                                        | Doesn't exist                                                                                                   | Tau-authored adapters against `MaterializingLibFiles` (R10)                                                                                                             |
