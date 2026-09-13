---
title: 'Cmd+Click Regression & node_modules Mount Unification'
description: 'Root-cause investigation of post-MonacoWorkspaceFs Cmd+Click failures on TypeScript workspace files and bundled-types packages (replicad), and a recommendation to collapse extraLibs into a real read-only node_modules mount.'
status: draft
created: '2026-05-09'
updated: '2026-05-09'
category: investigation
related:
  - docs/research/monaco-filesystem-integration-blueprint.md
  - docs/research/node-modules-single-source-of-truth.md
  - docs/research/monaco-typescript-intellisense-investigation.md
  - docs/research/vscode-style-resolution-and-virtual-types.md
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/policy/language-contribution-policy.md
  - docs/policy/filesystem-policy.md
---

# Cmd+Click Regression & node_modules Mount Unification

Root-cause investigation of two Cmd+Click failures observed after the Monaco Filesystem Integration Blueprint Phases 3–5 landed: (a) navigation on workspace TypeScript imports (`./lib/cylinder.ts`) silently no-ops, and (b) bundled-types packages (`replicad`, `opencascade.js`) cannot be opened in a tab even though hover IntelliSense for them works.

## Executive Summary

After Phases 3–5 of the Monaco Filesystem Integration Blueprint, hover IntelliSense is reliable for both project files and bundled types, KCL/OpenSCAD Cmd+Click work end-to-end, but TypeScript Cmd+Click is broken in two ways with two different root causes that share one architectural smell.

1. **Workspace `.ts` files** (`./lib/cylinder.ts`) — the gold link decoration never appears. The end-to-end materialisation chain (`DefinitionAdapter` → `MaterializingLibFiles.fetchLibFilesIfNecessary` → `WorkspaceFs.openTextDocument` → `editor.createModel`) is **structurally correct and unit-tested green** (`cmd-click-regression.test.ts`), but in production `WorkspaceFileSystemProvider.readText` calls `FileContentService.resolve(path)` for files that the lazy main-thread file tree has never walked. `FileContentService.resolve` reaches the FM worker and _should_ return `{kind:'text'}`, but if the worker hits any binary/too-large/orphaned outcome the materialiser throws and the entry is dropped silently — `DefinitionAdapter` strips locations whose model is `null`. The smoking gun is **silent drop** of the only resolved location, not an explicit error.

2. **Bundled-types packages** (`replicad`, `opencascade.js`) — the TS worker resolves `import 'replicad'` correctly (hover renders `module file:///node_modules/replicad/index`), but Cmd+Click fails because the URI `file:///node_modules/replicad/index.d.ts` lives **only** inside Monaco's `_extraLibs` map. `WorkspaceFileSystemProvider.readText` falls back to `lookupExtraLibContent(uri, extraLibs)` and does materialise a model, but the editor opener (`registerMonacoNavigation`) sends `{type:'openFile', path:'node_modules/replicad/index.d.ts'}` to a project that has no such file in its file tree, no entry in `FileContentService`, and no SAB pool entry. The dockview tab opens against a path the rest of the editor stack treats as orphaned — every subsequent re-render races with `'orphaned'` outcomes.

The two issues share one architectural smell: **bundled `.d.ts` content lives in three parallel registries (`_extraLibs`, `MaterializingLibFiles` materialised models, `FileContentService` cache) that never reconcile**. The four-month-old `node-modules-single-source-of-truth.md` blueprint already prescribed the canonical fix; the recent `MonacoWorkspaceFs` work added the materialisation layer that makes it implementable but did not collapse the populator.

Recommendation: a read-only `tau-bundled-types` mount table entry under `/node_modules/` populated once at activation from `kernelTypeMaps`, fed through the same `FileContentService` → `WorkspaceFileSystemProvider` chain every other workspace file uses. The `extraLibs` `addExtraLib` calls become **secondary** projections derived from the mount, not the source of truth. Cmd+Click on `replicad` then hits the same code path as Cmd+Click on `./lib/cylinder.ts`; the file tree can surface a collapsed read-only `node_modules/` group; agents and grep can find package source.

**Addendum:** A legacy regex-based `LinkProvider` for relative import specifiers (`createTauImportLinkProvider`, removed in the same follow-up) was redundant after `MaterializingLibFiles` + stock `DefinitionAdapter` began resolving workspace imports with the real TS module resolver. It still registered alongside the definition provider and fired second with the **literal** path from the source string (e.g. `./lib/params.js` in ESM-aware TS), which opened an orphan `params.js` tab and left a persistent `LinkProvider` underline on every relative import. That symptom was not the FS dual-store issue; R1 and Finding 2 below remain the right architectural follow-ups.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [References](#references)

## Problem Statement

User reports two regressions after Monaco Filesystem Integration Blueprint Phases 3–5:

1. **TS workspace Cmd+Click broken** (img3 in the bug report). Inside a `replicad` kernel project with `main.ts` that imports `./lib/cylinder.ts`, hover on `makeCylinder` correctly shows `(alias) function makeCylinder(...)` — IntelliSense works — but Cmd+Hover shows no gold link decoration on either the `./lib/cylinder.ts` specifier or the `makeCylinder` symbol, and Cmd+Click is a no-op.

2. **Bundled-types Cmd+Click broken** (img4/img5 in the bug report). Hover on the bare `replicad` import shows `module file:///node_modules/replicad/index` — TS resolution succeeded — but Cmd+Click does nothing. DevTools console (img5) shows the `tau-sync-ts-worker.entry` emitting a cascade of `[sync-fs:directoryExists:slot:error]` and `[sync-fs:fileExists:slot:error]` probes for both `lib/node_modules/replicad{,.ts,.tsx,.d.ts}` (importer-relative `node_modules` walk) and `node_modules/replicad{,.ts,.tsx,.d.ts}` (root-level), every probe returning `errorCode: 0, payloadBytes: 0`. The diagnostic for `file:///node_modules/replicad.d.ts` confirms the resolver tried the "file with extension appended to bare specifier" form, never reached `node_modules/replicad/index.d.ts` via the FM worker, and only succeeded later by dipping into `_extraLibs`.

The user's framing is correct — bundled definitions live "in the wrong place" because they live in two places: a Monaco-private `addExtraLib` registry and a separate `MonacoWorkspaceFs` materialisation step that synthesises models on demand. Mount tables, which already coordinate multi-backend filesystem composition for the workspace itself (`packages/filesystem/src/mount-table.ts`), are the canonical primitive for unifying them.

## Methodology

1. Re-read the post-Phase-3-5 stack: `apps/ui/app/lib/monaco-typescript-extras/{materializing-lib-files,register-materializing-typescript-providers}.ts`, `apps/ui/app/lib/monaco-workspace-fs/{monaco-workspace-fs,workspace-file-system-provider,extra-libs-file-system-provider}.ts`, `apps/ui/app/lib/{monaco-model-service,monaco-navigation-service,type-acquisition-service,javascript-contribution}.ts`, `libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts`, `libs/lsp-fs/src/sync/{sync-fs-client,sync-fs-server}.ts`.
2. Diffed against the upstream Monaco 0.55.x `LibFiles`/`DefinitionAdapter` source (`node_modules/monaco-editor/esm/vs/language/typescript/{tsWorker,languageFeatures}.js`).
3. Cross-referenced the existing-and-still-relevant blueprints: `monaco-filesystem-integration-blueprint.md` (the materialisation registry that just landed), `node-modules-single-source-of-truth.md` (the prior `addExtraLib`-vs-FS analysis), `monaco-typescript-intellisense-investigation.md` (lazy tree preloader background), `vscode-style-resolution-and-virtual-types.md` (the resolver-and-virtual-types story).
4. Walked the user-reported probe sequence in img5 line by line and matched each entry against the worker overrides in `tau-sync-ts-worker.ts` and the slot wire format in `sync-fs-client.ts` / `sync-fs-server.ts`.
5. Inventoried existing tests that should have caught the regression (`cmd-click-regression.test.ts`, `materializing-rename-adapter.test.ts`, `tau-ts-definition-adapters.test.ts`, `workspace-file-system-provider.test.ts`) to confirm the test coverage gap that hides the production failure.

## Findings

### Finding 1: The post-blueprint architecture is structurally correct

The `DefinitionAdapter` provided by `monaco-editor/esm/vs/language/typescript/languageFeatures.js` (lines 626–660) does exactly the right thing:

```js
const entries = await worker.getDefinitionAtPosition(resource.toString(), offset);
await this._libFiles.fetchLibFilesIfNecessary(entries.map((e) => Uri.parse(e.fileName)));
const result = [];
for (const entry of entries) {
  const refModel = this._libFiles.getOrCreateModel(entry.fileName);
  if (refModel) {
    result.push({ uri: refModel.uri, range: this._textSpanToRange(refModel, entry.textSpan) });
  }
}
return result;
```

The Tau `MaterializingLibFiles.fetchLibFilesIfNecessary` override is also correct:

```ts
public override async fetchLibFilesIfNecessary(uris: readonly monaco.Uri[]): Promise<void> {
  await super.fetchLibFilesIfNecessary(uris);
  const projectUris = uris.filter((uri) => this.workspaceFsRef.canMaterialise(uri));
  await this.workspaceFsRef.materialiseUrisForWorkspaceEdit(projectUris);
}
```

After Phases 3–5 the materialisation chain bottoms out in `WorkspaceFileSystemProvider.readText` which checks `FileContentService.resolve(path)` first, then falls back to `lookupExtraLibContent(uri, extraLibs)`. This was specifically designed in P4 to make Cmd+Click on bundled-types URIs work without a separate scheme.

The unit test `apps/ui/app/lib/monaco-typescript-extras/cmd-click-regression.test.ts` exercises this entire chain end-to-end and **passes** — `DefinitionAdapter.provideDefinition` returns a `Location` whose `uri.path === '/lib/cube.js'` after a stub `WorkspaceFileSystemProvider` materialises the file. The architecture is not what's broken.

### Finding 2: Smoking gun for workspace `.ts` Cmd+Click — silent drop on `FileContentService.resolve` non-text outcome

`WorkspaceFileSystemProvider.readText` calls `readPathAsText`:

```ts
async function readPathAsText(contentService, uri, path, extraLibs): Promise<string> {
  const outcome = await contentService.resolve(path);
  if (outcome.kind === 'text') return decodeTextFile(outcome.content);
  if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
    throw new MonacoWorkspaceFileNotFoundError(uri);
  }
  const fromExtraLibs = lookupExtraLibContent(uri, extraLibs);
  if (fromExtraLibs !== undefined) return fromExtraLibs;
  throw new MonacoWorkspaceFileNotFoundError(uri);
}
```

`MonacoWorkspaceFs.openTextDocument` swallows the throw:

```ts
try {
  text = await fsProvider.readText(uri);
} catch {
  return undefined;
}
```

`MaterializingLibFiles.getOrCreateModel` then sees no upstream model and falls through to `peekModel(uri)` which returns `undefined`. `DefinitionAdapter` drops the entry. **The user sees no decoration and no navigation, with no console error.**

Three reproducible failure modes for the `outcome` branch:

| Outcome     | When                                                                                    | Today's behaviour                                        |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `orphaned`  | FM worker `proxy.readFile` returns ENOENT — file was renamed, deleted, or never written | Falls back to extraLibs (no match) → throw → silent drop |
| `binary`    | `seemsBinary(data)` heuristic flips on (BOM/NUL in first 512 bytes)                     | Throw → silent drop                                      |
| `too-large` | File exceeds `openSizeBytes`                                                            | Throw → silent drop                                      |
| `error`     | I/O error other than ENOENT                                                             | Throw → silent drop                                      |

For an unopened workspace `.ts` file the _expected_ outcome is `text`, but **the failure surface is asymmetric**: the worker-side `SyncFsClient` (Tier 2) reads the same file via `Atomics.wait` against the FM worker's `stat`/`readFileBytes`, which independently respects ENOENT but does **not** consult `FileContentService`'s in-memory cache or its outcome map. The TS worker's `_getScriptText` may succeed (worker-side sync FS) at the same instant `FileContentService.resolve` (main-thread async cache) returns `orphaned` for the same path — the two layers race, the worker resolves the import for hover, and the main-thread materialiser drops the result.

The smoking-gun pattern explains why hover works ("the worker has the bytes") but Cmd+Click silently fails ("the main thread thinks the file is missing"). It is not a logic bug in any single function — it is a **layering bug** across two resolution paths that should agree but don't.

The correct fix is not to make `FileContentService.resolve` aware of every worker-side read — that path is already canonical for opened files. It is to make `MonacoWorkspaceFs` materialisation route through the same Tier-2 sync FS that the TS worker just used, so worker and main thread _see the same bytes_. In practice that means `WorkspaceFileSystemProvider.readText` should ask `SyncFsClient`-equivalent main-thread code (or the FM worker proxy directly via `proxy.readFile(absolutePath)`) when `FileContentService.resolve` returns `orphaned`, before declaring the file missing.

### Finding 3: Smoking gun for `replicad` Cmd+Click — bundled types live in only one of three registries the navigation chain consults

`TypeAcquisitionService.initialize` registers each kernel package twice via `addExtraLib`:

```ts
const filePath = `file:///node_modules/${pkg}/index.d.ts`;
const tsDisposable = monaco.typescript.typescriptDefaults.addExtraLib(content, filePath);
const jsDisposable = monaco.typescript.javascriptDefaults.addExtraLib(content, filePath);
// + a synthetic package.json with {types: 'index.d.ts'}
```

The TS worker's `_extraLibs` map gets two entries per package (`/index.d.ts` + `/package.json`). The TS resolver finds them, hover works, the worker returns `getDefinitionAtPosition` results pointing at `file:///node_modules/replicad/index.d.ts`.

`MaterializingLibFiles.fetchLibFilesIfNecessary([Uri.parse('file:///node_modules/replicad/index.d.ts')])`:

1. `super.fetchLibFilesIfNecessary` (Monaco's `LibFiles`) — only fetches built-in `lib.*.d.ts`. No-op for replicad.
2. Tau extension: `canMaterialise(uri)` → `true` (the `file:` scheme has a provider). `materialiseUrisForWorkspaceEdit([uri])` → `openTextDocument(uri)` → `editor.getModel(uri)` returns `null` → `provider.readText(uri)` → `readPathAsText`:
   - `contentService.resolve('node_modules/replicad/index.d.ts')` → `proxy.readFile('/projects/.../node_modules/replicad/index.d.ts')` → ENOENT → `{kind:'orphaned'}`.
   - Fallback: `lookupExtraLibContent(uri, extraLibs)` → key `'file:///node_modules/replicad/index.d.ts'` → **hit** → returns `.d.ts` content.
   - `editor.createModel(content, 'typescript', uri)` → model exists.
3. Back in `DefinitionAdapter`: `getOrCreateModel(entry.fileName)` → upstream `editor.getModel(uri)` finds the just-created model → returns `Location`.
4. Monaco invokes `IEditorService.openCodeEditor(uri)`. Tau's `registerEditorOpener` accepts (`canMaterialise === true`), sends `{type:'openFile', path:'node_modules/replicad/index.d.ts', readOnly:true}` to `editorRef`.
5. Editor machine pushes the path into `openFiles[]`. Dockview mounts a `<CodeEditor>` for it.
6. `CodeEditor` calls `modelService.acquireModel(path)` → `getOrEnsureModel('node_modules/replicad/index.d.ts')` → `workspaceFs.openTextDocument(uri)` → `editor.getModel(uri)` finds the model from step 2 → returns it.

In principle the chain closes. In practice, three subtle gaps cause the visible regression:

| Gap                                                                                                                                                                                                                                                                                                                  | Symptom                                                                                                                                                  | Root cause                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **G1**. The model from step 2 is created with no provider-side `onDidChange` hook (`onDidChange` returns `{dispose(){}}`) and no `FileContentService` outcome entry.                                                                                                                                                 | After any session reset (project switch, kernel switch, ATA `onProjectSessionChange`) the model dangles with content that no event channel can refresh.  | `WorkspaceFileSystemProvider` treats `extraLibs` as a passive lookup, not an event source. |
| **G2**. The dockview tab is opened by the editor machine _before_ `acquireModel` resolves. If the user clicks the tab during the brief async window, `CodeEditor` may render against an empty/loading state.                                                                                                         | "Empty pane" / flashing on first Cmd+Click.                                                                                                              | Editor machine `openFile` action is fire-and-forget; model materialisation is async.       |
| **G3**. On every subsequent `FileContentService.resolve` for the same path (e.g. background re-sync, `treeService.searchFiles` walk, agent `read_file` tool), the outcome stays `orphaned` because the file genuinely doesn't exist on the FM. The model in `monaco.editor` and the `outcomes` map disagree forever. | Inconsistent agent/grep behaviour: `read_file('node_modules/replicad/index.d.ts')` fails for the agent even though the user can read it in a Monaco tab. | `extraLibs` is invisible to `FileContentService`.                                          |

These three gaps reduce the user-visible behaviour to: **Cmd+Click on `replicad` _might_ open a tab, the tab _might_ render the bytes, but the rest of the editor stack (file tree, search, agent tools, write-protection) treats the path as if the file doesn't exist.** The hover continues to work because hover never leaves the TS worker's `_extraLibs` map.

### Finding 4: The cascade of `slot:error` probes in img5 is not the root cause

The probe sequence visible in DevTools is **TypeScript's normal bundler-mode resolution algorithm** trying every candidate path before settling on the one that resolves. For `import 'replicad'` from `file:///lib/main.ts`:

```
directoryExists('replicad')                    // bare-name probe (fails, harmless)
directoryExists('file:///lib')                  // importer dir (succeeds)
fileExists('file:///lib/package.json')         // local package.json (fails)
fileExists('file:///package.json')             // root package.json (fails)
directoryExists('file:///lib/node_modules/replicad')   // walk-up (fails)
fileExists('file:///lib/node_modules/replicad{.ts,.tsx,.d.ts}')   // extension probe (fails)
directoryExists('file:///lib/node_modules/@types/replicad')       // @types fallback (fails)
fileExists('file:///lib/node_modules/@types/replicad.d.ts')       // (fails)
...same pattern from project root...
fileExists('file:///node_modules/replicad{.ts,.tsx,.d.ts}')       // extension probe (fails)
[directoryExists('file:///node_modules/replicad') → 'static' via extraLibs short-circuit, NOT shown in slot:error filter]
fileExists('file:///node_modules/replicad/package.json') → super._getScriptText hit via _extraLibs → true
_getScriptText → '{"name":"replicad","types":"index.d.ts"}'
fileExists('file:///node_modules/replicad/index.d.ts') → super._getScriptText hit → true
_getScriptText → bundled .d.ts content
```

The successful directory and file checks short-circuit through `tau-sync-ts-worker.directoryExists` (extraLibs key prefix match) and `tau-sync-ts-worker.fileExists` (`super._getScriptText` returns content from `_extraLibs`) — both are logged with outcome `'static'`, which is filtered out of the user's `:slot:` console view. **The "noisy" probes are normal TypeScript resolver exhaustion, not a bug.** What's broken is downstream of resolution, in the materialisation-vs-FS dual store.

That said, two diagnostic improvements would have shortened the investigation:

- `slotOutcomeFor` in `sync-fs-client.ts` distinguishes `notFound` from `error` based on errno but the FM worker `finishPathPresenceFromStat` returns `(syncError.ok, payloadLength=0)` for both ENOENT _and_ "stat returned a file when a directory was asked for". The client's `errorCode === ok && payloadByteLength === 0` branch logs the outcome as `'error'` even when the FM worker meant "false" cleanly. Renaming to `'absent'` (or treating `(ok, 0)` as the canonical "absent" signal) would clean up the diagnostic.
- The slot probe currently logs all `'static'` and `'sync'` hits at the same level as misses; toggling `'static'`/`'mirror'` outcomes off by default would have made the genuine failures visible without scrolling past 30 lines of normal resolver chatter.

Neither fixes the regression, but both reduce future debugging cost.

### Finding 5: Three parallel populators, one scheme — the `node-modules-single-source-of-truth.md` smell still applies

`node-modules-single-source-of-truth.md` (April 2026) inventoried three "node_modules" worlds:

| World | Where                                                                                    | What                       | Who reads                                 |
| ----- | ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------- |
| A     | OPFS `tau-node-modules` mount, `/node_modules/<pkg>/index.js`                            | Bundled JS from esm.sh     | Runtime kernel worker (esbuild `onLoad`)  |
| B     | `_extraLibs` inside Monaco's TS worker, keyed by `file:///node_modules/<pkg>/index.d.ts` | `.d.ts` blob per package   | TS language service for hover/diagnostics |
| C     | `TypeAcquisitionService.fetchCache` main-thread `Map`                                    | Same `.d.ts` payloads as B | Avoids re-fetch on session change         |

Phases 3–5 of the Monaco Filesystem Integration Blueprint added a fourth resolution path:

| World | Where                                                                       | What                                          | Who reads                                                     |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| D     | `MonacoWorkspaceFs.editor.createModel` materialised from `extraLibs` lookup | Same `.d.ts` blobs, materialised on Cmd+Click | Monaco's editor model registry, dockview tabs, opener service |

Worlds A, B/C, and D **share a `file:///node_modules/<pkg>/...` URI namespace but never share storage**. The lookup table that `WorkspaceFileSystemProvider` uses to convert a `file://` URI into a file is `extraLibs` from world B; the populator that loaded `extraLibs` is world C; the bundler runtime's `node_modules` is world A; and the materialised models from D are owned by Monaco. Each world has its own lifecycle, none has an event channel into the others, and the user-visible system behaves as the union of their inconsistencies.

The asymmetry that actually trips the regression: **A is a real mount, B/C/D are virtual.** Worlds B/C/D are invisible to `FileContentService`, the file tree, search, agents, and the write/read mutation pipeline. The only way an unopened TS file can be Cmd+Click-target-able is for that file to either be in a `monaco.editor` model already (A's URI namespace, materialised models for opened tabs) or to be reachable by `MonacoWorkspaceFs.openTextDocument` — which today bottoms out in either `FileContentService` (good for project files) or `extraLibs` (good for ATA-registered types). Workspace project files that the lazy tree hasn't expanded yet end up in a no-man's-land between the two.

Mount-table unification (R1 below) collapses worlds B/C/D into A: bundled types become **read-only mount entries** under `/node_modules/`, populated once at activation by reading `kernelTypeMaps`. After unification:

- `FileContentService.resolve('node_modules/replicad/index.d.ts')` returns `{kind:'text'}` because the file is in the mount.
- `lookupExtraLibContent` becomes dead code — its only caller short-circuits before reaching it.
- `addExtraLib` becomes a _projection_ the TS worker still needs (its `_extraLibs` is its own resolution authority and that's not changing), but the projection is _derived_ from the mount, not the source of truth. A single populator writes once to the mount, then walks the mount and replays into `addExtraLib`.
- The dockview tab opens against a path the FS knows about; G1/G2/G3 from Finding 3 disappear.
- The agent's `read_file` tool can read kernel `.d.ts` files; grep can find them; the file tree can show a collapsed `node_modules/` group exactly the way VS Code does.
- The user's stated goal — _"folks who are wanting to dig into the actual code of the kernel can cmd+click on text like `replicad` and view the actual node_modules code"_ — falls out for free.

### Finding 6: VS Code's analogue is `vscode-node-modules:` (and friends), not `addExtraLib`

VS Code's TypeScript Language Features extension (`repos/vscode/extensions/typescript-language-features/`) doesn't use anything analogous to Monaco's `addExtraLib`. It registers `FileSystemProvider`s for the synthetic schemes it owns:

- `vscode-node-modules:/...` — virtual workspace `node_modules` for the web build (`src/filesystems/autoInstallerFs.ts`).
- `vscode-global-typings:/...` — bundled stdlib + `@types/*` (`src/filesystems/ata.ts`).
- `vscode-test-data:/...` — fixture files for tests.

Every navigation, search, peek, and rename hits these providers through the same `vscode.workspace.fs` API project files use. There is no separate "TS worker types" registry that has to be reconciled with the workspace FS — the workspace FS _is_ the only registry.

Tau's `MonacoWorkspaceFs` is the equivalent of `vscode.workspace.fs`. The blueprint design (R7) specifically called out a `MonacoFileSystemProvider` per scheme, with `extraLibs` as a fallback inside `WorkspaceFileSystemProvider` only as a stop-gap until the mount-table approach lands. This investigation is the moment to retire the stop-gap.

## Recommendations

| #      | Action                                                                                                                                                                                                                                                                                                                                                          | Priority | Effort | Impact                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------- |
| **R1** | Introduce a read-only `tau-bundled-types` mount under `/node_modules/`, populated once at activation from `kernelTypeMaps`. Wire through `mount-table.ts` so `FileContentService.resolve('node_modules/<pkg>/index.d.ts')` returns `{kind:'text'}`. Derive `addExtraLib` calls from the mount (single populator, one source of truth).                          | P0       | Medium | High — fixes node_modules Cmd+Click and unifies all four worlds |
| **R2** | Make `WorkspaceFileSystemProvider.readText` consult the FM worker's complete index (`proxy.readFile(absolutePath)` with ENOENT → fall through, not throw) before declaring a file `MonacoWorkspaceFileNotFoundError`. Closes the lazy-tree race that drops workspace `.ts` Cmd+Click.                                                                           | P0       | Low    | High — fixes TS workspace Cmd+Click                             |
| **R3** | Surface bundled-types files in the file tree as a collapsed read-only `node_modules/` group (mirrors VS Code). The mount makes this a one-line `FileTreeService` configuration.                                                                                                                                                                                 | P1       | Low    | Medium — DX win, agent reachability                             |
| **R4** | Once R1 lands, retire `WorkspaceFileSystemProvider`'s `extraLibs` fallback and `lookupExtraLibContent`. ATA-registered dynamic packages (`lodash`, `three`) write into the same mount on resolution.                                                                                                                                                            | P1       | Medium | Medium — code-debt reduction, eliminates dual-source bug class  |
| **R5** | Make the editor machine `openFile` action _await_ `modelService.acquireModel` before emitting `fileOpened`, eliminating G2 (the brief empty-pane window on first Cmd+Click).                                                                                                                                                                                    | P2       | Low    | Low — UX polish                                                 |
| **R6** | Improve `SyncFsClient` diagnostics: add an `'absent'` outcome distinct from `'error'` for the `(syncError.ok, payloadLength=0)` case; suppress `'static'`/`'mirror'`/`'pool'` outcomes from the default debug log so genuine failures are visible.                                                                                                              | P2       | Low    | Low — debugging ergonomics                                      |
| **R7** | Add an integration test under `apps/ui-e2e` that exercises both Cmd+Click paths against a live project (workspace `.ts` file + `replicad` import), using Playwright's `page.keyboard.down('Meta')` + `mouse.click`. The unit test (`cmd-click-regression.test.ts`) does not catch the lazy-tree race because the test stub provider returns text synchronously. | P1       | Medium | High — prevents regression of the now-fixed paths               |

### Recommendation Sequencing

1. R2 (smoking gun for TS workspace Cmd+Click — fastest path to user value).
2. R1 (architectural fix for node_modules — unblocks R3/R4 and matches the user's explicit ask).
3. R3 + R7 (visible polish + regression coverage).
4. R4 + R5 + R6 (cleanup + ergonomics).

R1 and R2 are independent and can land in either order; R1 has higher long-term impact, R2 has shorter time-to-fix.

## Trade-offs

### R1: real mount vs continued `extraLibs`

| Dimension                      | Real `node_modules/` mount (R1)                                                                                                      | Continue with `addExtraLib`                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Cmd+Click on `replicad`        | Works through the same code path as project files                                                                                    | Works _only_ through the materialiser fallback; race-prone |
| File tree visibility           | Yes (collapsed read-only group)                                                                                                      | No (invisible to file tree)                                |
| Agent `read_file` / grep       | Yes — agent can dig into kernel source                                                                                               | No — agent gets ENOENT                                     |
| Storage                        | OPFS `tau-bundled-types` mount, ~few MB total for kernel types                                                                       | Lives in TS worker memory only                             |
| Persistence                    | Persists across sessions                                                                                                             | Re-injected on every load                                  |
| Populator complexity           | One walker that writes mount entries from `kernelTypeMaps`; one optional walker that mirrors mount → `addExtraLib` for the TS worker | One direct `addExtraLib` per package                       |
| TS worker sees the same bytes? | Yes, projected from the mount                                                                                                        | Yes, by definition                                         |
| Migration risk                 | Medium — touches `TypeAcquisitionService`, `MountTable`, `FileTreeService`                                                           | None                                                       |
| Aligns with VS Code precedent  | Yes (mirrors `vscode-node-modules:`)                                                                                                 | No (Monaco-specific)                                       |
| Long-term debt                 | Eliminates worlds B/C/D                                                                                                              | Worlds B/C/D persist indefinitely                          |

### R2: FM worker fallback in `readText`

| Dimension                       | Add FM proxy fallback (R2)                                                                                 | Keep `FileContentService.resolve`-only    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Workspace Cmd+Click reliability | High (worker and main thread agree on bytes)                                                               | Race-prone (drops on `orphaned`)          |
| Cache discipline                | `FileContentService` still authoritative for opened files; new path only fires for unopened-and-`orphaned` | `FileContentService` always authoritative |
| Performance                     | One extra `proxy.readFile` per Cmd+Click on unopened file (~1ms)                                           | None                                      |
| Architectural consistency       | Matches the worker-side Tier-2 sync FS read pattern                                                        | Inconsistent with worker behaviour        |

### R5: synchronous tab open

| Dimension               | Await `acquireModel` (R5)                   | Fire-and-forget (today)       |
| ----------------------- | ------------------------------------------- | ----------------------------- |
| First-click latency     | +50-200ms (model materialisation)           | 0ms                           |
| First-paint correctness | Tab content renders ready                   | Brief loading flash           |
| Error handling          | Can refuse to open if materialisation fails | Always opens, even on failure |

R5's latency cost is low enough that the correctness win is worth it, especially after R1/R2 make materialisation reliable.

## Code Examples

### Smoking gun for workspace `.ts` Cmd+Click

```ts
// apps/ui/app/lib/monaco-workspace-fs/workspace-file-system-provider.ts
async function readPathAsText(contentService, uri, path, extraLibs): Promise<string> {
  const outcome = await contentService.resolve(path);
  if (outcome.kind === 'text') return decodeTextFile(outcome.content);

  // BUG: 'orphaned' from FileContentService doesn't mean the file doesn't exist —
  // it means FileContentService hasn't seen it yet. The FM worker may have it.
  if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
    throw new MonacoWorkspaceFileNotFoundError(uri);
  }

  const fromExtraLibs = lookupExtraLibContent(uri, extraLibs);
  if (fromExtraLibs !== undefined) return fromExtraLibs;

  // BUG: Workspace .ts files that the lazy tree hasn't seen end up here.
  // The TS worker's syncFsClient already read the bytes successfully via the FM proxy.
  throw new MonacoWorkspaceFileNotFoundError(uri);
}
```

### Proposed R2 fix sketch

```ts
async function readPathAsText(contentService, uri, path, extraLibs, fmProxy): Promise<string> {
  const outcome = await contentService.resolve(path);
  if (outcome.kind === 'text') return decodeTextFile(outcome.content);
  if (outcome.kind === 'binary' || outcome.kind === 'too-large') {
    throw new MonacoWorkspaceFileNotFoundError(uri);
  }

  // R2: orphaned (or error) — try a direct FM-worker read before declaring missing.
  // Mirrors the Tier-2 sync FS path the TS worker uses.
  if (outcome.kind === 'orphaned' || outcome.kind === 'error') {
    try {
      const bytes = await fmProxy.readFile(joinPath(workspaceRoot, path));
      if (!seemsBinary(bytes)) {
        // Populate FileContentService so the next call short-circuits.
        contentService.cacheText(path, bytes);
        return decodeTextFile(bytes);
      }
    } catch {
      // ENOENT or other error — fall through to extraLibs/throw.
    }
  }

  const fromExtraLibs = lookupExtraLibContent(uri, extraLibs);
  if (fromExtraLibs !== undefined) return fromExtraLibs;

  throw new MonacoWorkspaceFileNotFoundError(uri);
}
```

### R1: bundled-types mount populator (sketch)

```ts
// apps/ui/app/lib/monaco-language-registry.ts (or new bundled-types-mount.ts)
const BUNDLED_TYPES_MOUNT_PREFIX = '/node_modules';

function populateBundledTypesMount(mountTable: MountTable, kernelTypeMaps: KernelTypesMap[]): void {
  const provider = new MemoryProvider({ readOnly: true });
  for (const typesMap of kernelTypeMaps) {
    for (const [packageName, content] of Object.entries(typesMap)) {
      provider.write(`/${packageName}/index.d.ts`, content);
      provider.write(`/${packageName}/package.json`, JSON.stringify({ name: packageName, types: 'index.d.ts' }));
    }
  }
  mountTable.mount(BUNDLED_TYPES_MOUNT_PREFIX, provider, { backend: 'memory', readOnly: true });
}

// Replace TypeAcquisitionService static-types branch:
function deriveExtraLibsFromMount(monaco, mountTable): Disposable[] {
  const disposables: Disposable[] = [];
  const tree = mountTable.list(BUNDLED_TYPES_MOUNT_PREFIX, { recursive: true });
  for (const path of tree) {
    if (!path.endsWith('.d.ts') && !path.endsWith('package.json')) continue;
    const content = mountTable.readText(path);
    const fileUri = `file://${path}`;
    disposables.push(monaco.typescript.typescriptDefaults.addExtraLib(content, fileUri));
    disposables.push(monaco.typescript.javascriptDefaults.addExtraLib(content, fileUri));
  }
  return disposables;
}
```

After R1 lands, `WorkspaceFileSystemProvider.readText`'s `extraLibs` fallback path becomes dead code (no path can reach it without `FileContentService.resolve` returning `'text'` first, courtesy of the mount), and R4 retires it.

## Diagrams

### Today: dual-source materialisation

```
                        Cmd+Click on 'replicad'
                                   │
                                   ▼
              DefinitionAdapter.provideDefinition
                                   │
                                   ▼
       worker.getDefinitionAtPosition('main.ts', offset)
                                   │
                  ┌────────────────┴────────────────┐
                  ▼                                 ▼
          tau-sync-ts-worker                 _extraLibs map (in worker)
       (resolver probes)                    file:///node_modules/replicad/index.d.ts
                  │                                 │
                  └────────────► returns {fileName: 'file:///node_modules/replicad/index.d.ts'}
                                   │
                                   ▼
             MaterializingLibFiles.fetchLibFilesIfNecessary
                                   │
                                   ▼
                    MonacoWorkspaceFs.openTextDocument
                                   │
                                   ▼
                  WorkspaceFileSystemProvider.readText
                                   │
                  ┌────────────────┴────────────────┐
                  ▼                                 ▼
       FileContentService.resolve         lookupExtraLibContent (fallback)
       → 'orphaned' (FM has no file)      → main thread reads typescriptDefaults.getExtraLibs()
                  │                                 │
                  └────────────► returns content from extraLibs
                                   │
                                   ▼
                    editor.createModel(content, 'typescript', uri)
                                   │
                                   ▼
                          DefinitionAdapter returns Location
                                   │
                                   ▼
                    Tau editor opener → editorRef.send('openFile')
                                   │
                                   ▼
              EditorMachine: tab in openFiles[], dockview mounts CodeEditor
                                   │
                                   ▼
                CodeEditor → modelService.acquireModel(path)
                                   │ (model already exists, returned)
                                   ▼
                          Tab renders bundled .d.ts content
```

### After R1+R2: single-source mount

```
ACTIVATION (once)
─────────────────
kernelTypeMaps  ─────► populateBundledTypesMount  ─────► MountTable.mount('/node_modules', MemoryProvider, readOnly)
                                                                │
                                                                ▼
                                                       FileContentService can resolve
                                                       'node_modules/replicad/index.d.ts' → text
                                                                │
                                                                ▼
                                                       deriveExtraLibsFromMount (projection)
                                                                │
                                                                ▼
                                                       monaco.typescript.*.addExtraLib(...)
                                                       (TS worker still needs its own _extraLibs)


CMD+CLICK
─────────
Cmd+Click 'replicad'
        │
        ▼
DefinitionAdapter.provideDefinition
        │
        ▼
TS worker resolves via its _extraLibs (unchanged)
        │
        ▼
returns Location { uri: file:///node_modules/replicad/index.d.ts }
        │
        ▼
MaterializingLibFiles.fetchLibFilesIfNecessary
        │
        ▼
WorkspaceFileSystemProvider.readText
        │
        ▼
FileContentService.resolve  →  {kind: 'text'}  ✓  (mount serves it)
        │
        ▼
editor.createModel(content, 'typescript', uri)
        │
        ▼
Tab opens. File tree shows it. Agent can read it. Grep finds it. One source.
```

## References

- [Monaco Filesystem Integration Blueprint](./monaco-filesystem-integration-blueprint.md) — the Phases 3–5 design that makes R1 implementable.
- [node_modules as Single Source of Truth](./node-modules-single-source-of-truth.md) — the prior architectural framing of the mount unification, predates the materialisation work; R1 in this doc makes it concrete given the post-blueprint substrate.
- [VSCode-Style Module Resolution & Virtual Type Definitions](./vscode-style-resolution-and-virtual-types.md) — the resolver/virtual-types blueprint that the bundled-types mount feeds into.
- [Monaco TypeScript IntelliSense Reliability Investigation](./monaco-typescript-intellisense-investigation.md) — the lazy-tree preloader background that motivates R2.
- [Scalable Language Contribution FS Architecture](./scalable-language-contribution-fs-architecture.md) — the Tier-2 sync FS pipeline R2 mirrors on the main thread.
- Policy: [language-contribution-policy.md](../policy/language-contribution-policy.md), [filesystem-policy.md](../policy/filesystem-policy.md).
- VS Code precedent: `repos/vscode/extensions/typescript-language-features/src/filesystems/{ata,autoInstallerFs}.ts` (per-scheme `FileSystemProvider`s for synthetic node_modules and global typings).
- Upstream Monaco source: `node_modules/monaco-editor/esm/vs/language/typescript/{tsWorker,languageFeatures}.js` (lines 17–81 for `_getScriptText`/`_extraLibs`, 626–660 for `DefinitionAdapter.provideDefinition`, 123–177 for `LibFiles`).
