---
title: 'LSP Integration Outstanding Issues'
description: 'Audit of the Tier-2 sync FS + Monaco TS worker bridge with smoking-gun root causes for closed-file diagnostics, third-party module squigglies, and Cmd+Click navigation failures.'
status: draft
created: '2026-05-08'
updated: '2026-05-08'
category: investigation
related:
  - docs/research/scalable-language-contribution-fs-architecture.md
---

# LSP Integration Outstanding Issues

End-to-end audit of the `@taucad/lsp` + `@taucad/lsp-fs/sync` bridge that powers Monaco TypeScript IntelliSense for closed workspace files and ATA-injected third-party packages.

## Executive Summary

Three independent bugs collude to produce the symptoms reported in `Untitled-1` (Project `proj_WUJaoS2QOBc8i8WFagztF`, fresh worker session):

1. `TextDecoder.decode()` throws `TypeError` on the SAB-backed arena view in Chromium-family browsers, so EVERY `readFile`/`statMtimeVersion`/`readdir` slot call that returns ≥1 byte raises an `exception` from the client. Closed workspace files (`lib/cube.ts`, `lib/cylinder.ts`) end up with `version === ''` and effectively disappear from the TS language service program.
2. `tau-sync-ts-worker.directoryExists()` consults only the workspace FS, never the `_extraLibs` map, so NodeJs module resolution for ATA-registered packages (`replicad`, `opencascade.js`, `@jscad/modeling`, `manifold-3d`) is short-circuited even though their `.d.ts` content is loaded — the editor renders red squigglies on `import 'replicad'` while hover still works from the cached program.
3. The custom JS module resolver does not perform the TypeScript `.js → .ts` rewrite required by the project's own `import './lib/cylinder.js'` style, so the Monaco-level definition provider can never produce a `LocationLink` for relative imports written in NodeNext form.

Once (1) is fixed, the upstream TS LS will once again include closed workspace files in its program and Cmd+Click on exports from those files will work via Monaco's built-in navigation. (2) and (3) need targeted fixes in `tau-sync-ts-worker.ts` and `javascript-module-resolver.ts` respectively. A handful of smaller issues (missing transitive ATA types, suboptimal `moduleResolution`, sticky `getScriptVersion` for `lib.*.d.ts` virtual files, dangling FM-side slot when a second TS worker spawns, library-api-policy violations in the navigation opener) are enumerated as P1/P2 follow-ups.

A targeted cross-reference against Microsoft's `vscode` + `vscode-wasm` source (the canonical prior art for browser-hosted TS LS over a sync FS bridge) **independently validates every P0/P1 root cause** and surfaces three additional architectural amendments, captured as Findings 10–12. The biggest delta: VS Code's `TypeScriptDefinitionProvider` does NOT do its own module resolution at the extension layer — it delegates entirely to tsserver via `definitionAndBoundSpan`. Once R5 lands (correct `moduleResolution`), Tau's custom `javascript-definition-provider.ts` + `javascript-module-resolver.ts` become redundant and can be deleted (R10), which dissolves Finding 3 by construction.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: `TextDecoder` rejects SAB arena views](#finding-1-textdecoder-rejects-sab-arena-views)
  - [Finding 2: `directoryExists` ignores virtual `_extraLibs` paths](#finding-2-directoryexists-ignores-virtual-_extralibs-paths)
  - [Finding 3: Module resolver missing `.js → .ts` rewrite](#finding-3-module-resolver-missing-js--ts-rewrite)
  - [Finding 4: `getScriptVersion` falls through for `libFileMap` entries](#finding-4-getscriptversion-falls-through-for-libfilemap-entries)
  - [Finding 5: `moduleResolution: NodeJs` is the wrong default](#finding-5-moduleresolution-nodejs-is-the-wrong-default)
  - [Finding 6: Missing ATA types for transitive dependencies](#finding-6-missing-ata-types-for-transitive-dependencies)
  - [Finding 7: FM-side `attachSyncFsServer` is single-slot](#finding-7-fm-side-attachsyncfsserver-is-single-slot)
  - [Finding 8: Library-api-policy violations in navigation opener](#finding-8-library-api-policy-violations-in-navigation-opener)
  - [Finding 9: Two-step `perform` write order is racy on stale completion](#finding-9-two-step-perform-write-order-is-racy-on-stale-completion)
  - [Finding 10: Custom JS definition provider duplicates tsserver's own resolution](#finding-10-custom-js-definition-provider-duplicates-tsservers-own-resolution)
  - [Finding 11: Single-port FM bridge vs. VS Code's per-channel topology](#finding-11-single-port-fm-bridge-vs-vs-codes-per-channel-topology)
  - [Finding 12: No `signalReady()` handshake on the FM bridge](#finding-12-no-signalready-handshake-on-the-fm-bridge)
- [Recommendations](#recommendations)
- [Appendix](#appendix)

## Problem Statement

User-reported symptoms after a fresh load of project `proj_WUJaoS2QOBc8i8WFagztF` (one open file `main.ts`, with closed siblings `lib/cube.ts` and `lib/cylinder.ts`, and a third-party import of `replicad`):

| #   | Symptom                                                                                                                                            | Confirmed in `Untitled-1`                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| S1  | Closed workspace files (`lib/cylinder.ts`) draw NO squigglies and hover for their exports works, but Cmd+Click on those exports does not navigate. | Yes — see lines 273, 278, 1223 onward.                           |
| S2  | Cmd+Click on the bare specifier `replicad` does not navigate.                                                                                      | Yes — line 3392 user log.                                        |
| S3  | `replicad` import keeps a red squiggle even though the type definitions hover correctly.                                                           | Yes — screenshot 2; lines 257, 288 `directoryExists slot:error`. |
| S4  | Opened files behave correctly.                                                                                                                     | Implied baseline, used to bound the regression scope.            |

A 4 085-line console capture (`/Users/rifont/.cursor/projects/Users-rifont-git-tau/uploads/Untitled-1-L1-L4085-0.txt`) was provided. The dominant log noise is `[sync-fs:statMtimeVersion:slot:exception]` for `lib/cube.ts` and `lib/cylinder.ts`, and `[sync-fs:directoryExists:slot:error]` for `node_modules/replicad`, `node_modules/opencascade.js`, and friends.

## Methodology

1. Re-read the Tier-2 sync wire (`libs/lsp-fs/src/sync/sync-fs-{client,server,protocol}.ts`) end to end against the diagnostic taxonomy in `monaco-ts-worker.entry.ts`.
2. Walked the `tau-sync-ts-worker.ts` overrides against the upstream `node_modules/monaco-editor/esm/vs/language/typescript/tsWorker.js` source to identify which host methods short-circuit on `_extraLibs`/`libFileMap` and which fall through to syncFs.
3. Diffed `javascript-contribution.ts`, `javascript-module-resolver.ts`, `javascript-definition-provider.ts`, and `monaco-navigation-service.ts` against the user's actual import style (`import { makeCylinderTool } from './lib/cylinder.js'`) and the `kernelTypeMaps` shape in `libs/api-extractor/src/index.ts`.
4. Verified the `replicad.bundled.json` payload key set (`['replicad']` only — no `replicad-opencascadejs` / `manifold-3d` companions) directly off the JSON.
5. Cross-referenced the workspace memory note "browser `TextDecoder` rejects `SharedArrayBuffer`-backed views — copy at consumer boundary required" against every `decoder.decode(arena.subarray(...))` call in `sync-fs-client.ts`.
6. Read Microsoft's `vscode/extensions/typescript-language-features` (`serverProcess.browser.ts`, `definitions.ts`, `filesystems/{ata,autoInstallerFs,memFs}.ts`) and the dedicated `vscode-wasm/sync-api-common` package end-to-end as prior art for browser TS LS + sync FS, to validate every recommendation against an independently-evolved production implementation. Findings 10–12 were extracted from this comparison.

## Findings

### Finding 1: `TextDecoder` rejects SAB arena views

**Severity**: P0 — root cause of every `slot:exception` in the log; cascades into every other observed symptom for closed files.

**Evidence**

The arena view in `sync-fs-client.ts` is built off the `SharedArrayBuffer` allocated by `openTauLanguageHostPort`:

```96:97:libs/lsp-fs/src/sync/sync-fs-client.ts
  const int32 = new Int32Array(options.slotSab, 0, slotInt32Length);
  const arenaBytes = options.arenaBytes ?? options.arenaSab.byteLength;
  const arena = new Uint8Array(options.arenaSab, 0, arenaBytes);
```

Every read path then decodes a subarray of `arena` directly:

```202:204:libs/lsp-fs/src/sync/sync-fs-client.ts
        if (outcome === 'empty') {
          return '';
        }
        return decoder.decode(arena.subarray(0, payloadByteLength));
```

```432:433:libs/lsp-fs/src/sync/sync-fs-client.ts
        }
        const version = decoder.decode(arena.subarray(0, payloadByteLength));
```

In Chromium, `TextDecoder.decode()` on a `Uint8Array<SharedArrayBuffer>` (or `subarray()` of one) throws `TypeError: The provided ArrayBufferView value must not be shared`. This is precisely the regression already documented in `AGENTS.md`:

> browser `TextDecoder` rejects `SharedArrayBuffer`-backed views — copy at consumer boundary required

The probe path matches the symptom one-to-one:

```203:218:libs/lsp-fs/src/sync/sync-fs-client.ts
        return decoder.decode(arena.subarray(0, payloadByteLength));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        onProbe?.({
          op: 'readFile',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'slot',
          outcome: 'exception',
          detail,
        });
        return undefined;
      } finally {
        Atomics.store(int32, slotIndex.state, syncState.idle);
      }
```

That is why the log shows the **two consecutive probes for the same path** for cylinder.ts at log lines 277-278 — `slot:ok` is emitted on the success path **before** the `decoder.decode` call, then the catch block re-emits `slot:exception` for the same op:

```text
Untitled-1:277  [sync-fs:readFile:slot:ok]        cylinder.ts errorCode=0 payloadBytes=373
Untitled-1:278  [sync-fs:readFile:slot:exception] cylinder.ts errorCode=undefined payloadBytes=undefined
Untitled-1:279  [lsp:getScriptText:miss]          file:///lib/cylinder.ts
```

`fileExists`/`directoryExists` do NOT decode the payload (they only inspect `errorCode` + `payloadByteLength`), which is exactly why those branches show `slot:error` / `slot:ok` but never `slot:exception`. `readdir` would throw too — there are no `readdir` slot calls in this trace because the TS host never exercised it for these particular paths.

**Cascading effect on `getScriptVersion`**

Upstream `TypeScriptWorker.getScriptVersion` returns `''` for any non-mirror, non-default-lib, non-extraLib file. Our override falls through to `syncFsClient.getScriptVersionForPath`, which throws because of the same TextDecoder bug, returns `undefined`, and `tau-sync-ts-worker.ts` records:

```62:82:libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts
  public override getScriptVersion(fileName: string): string {
    const baseVersion = super.getScriptVersion(fileName);
    if (baseVersion !== '') {
      this.diagnostic?.record({
        category: 'getScriptVersion',
        outcome: this._classifyBaseHit(fileName),
        fileName,
        detail: baseVersion,
      });
      return baseVersion;
    }

    const syncVersion = this.syncFsClient.getScriptVersionForPath(fileName);
    this.diagnostic?.record({
      category: 'getScriptVersion',
      outcome: syncVersion === undefined ? 'miss' : 'sync',
      fileName,
      detail: syncVersion,
    });
    return syncVersion ?? '';
  }
```

`syncVersion === undefined` → `''` returned to TS. TypeScript's language service interprets an empty version as "file is not in the program" and stops considering it for definition / reference / rename. That is why **Cmd+Click on exports from a closed file silently fails** even though the user can see the alias hover (the alias hover lands in a code path that re-reads `_getScriptText` directly via the pool tier, which never decodes through the SAB arena).

**Fix**

Copy the payload bytes into a transient `ArrayBuffer` view at the boundary before handing them to `TextDecoder`. VS Code's `sync-api-common` package documents this exact bug and its preferred idiom is `view.slice()` (returns a new `Uint8Array` backed by a regular `ArrayBuffer`):

```700:707:repos/vscode-wasm/sync-api-common/src/common/connection.ts
        // We need to slice the Uint8Array we received since it is a view onto a
        // shared array buffer and in the browser the text decoder throws when
        // reading from a Uint8Array. Since this seems to be the correct behavior
        // anyways (the array could otherwise change underneath) we do the same
        // for NodeJS
        const data = resultType.mode === 'binary'
          ? lazyResult.data
          : JSON.parse(this.textDecoder.decode((lazyResult.data as Uint8Array).slice()));
```

…and the symmetric server-side decode at line 798 uses the same pattern. Adopt `view.slice()` for parity with the canonical idiom (it is byte-equivalent to `new Uint8Array(view)` but better signals intent and matches the documented contract: "the array could otherwise change underneath"):

```typescript
return decoder.decode(arena.subarray(0, payloadByteLength).slice());
```

Apply to all three decode sites (`readFileText`, `getScriptVersionForPath`, `getDirectories`) AND any future encoder/decoder paths added on the server side.

---

### Finding 2: `directoryExists` ignores virtual `_extraLibs` paths

**Severity**: P0 — root cause of S3 (red squigglies on `replicad`).

**Evidence**

`tau-sync-ts-worker.fileExists` correctly merges the upstream `_getScriptText` lookup (which covers `_extraLibs[fileName]` and `libFileMap[fileName]`) with the syncFs fallback:

```92:110:libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts
  public fileExists(path: string): boolean {
    const fromBase = super._getScriptText(path);
    if (fromBase !== undefined) {
      this.diagnostic?.record({
        category: 'fileExists',
        outcome: this._classifyBaseHit(path),
        fileName: path,
      });
      return true;
    }

    const exists = this.syncFsClient.fileExists(path);
    this.diagnostic?.record({
      category: 'fileExists',
      outcome: exists ? 'sync' : 'miss',
      fileName: path,
    });
    return exists;
  }
```

But `directoryExists` makes no such consultation:

```128:137:libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts
  /** @remarks Declared for TS {@link ts.LanguageServiceHost} module resolution; not on base class. */
  public directoryExists(directoryName: string): boolean {
    const exists = this.syncFsClient.directoryExists(directoryName);
    this.diagnostic?.record({
      category: 'directoryExists',
      outcome: exists ? 'sync' : 'miss',
      fileName: directoryName,
    });
    return exists;
  }
```

The TypeScript NodeJs module resolution algorithm gates its `node_modules/<pkg>/{package.json,index.d.ts}` candidates on `directoryExists('/node_modules/<pkg>')`. With this override, every ATA-injected package directory comes back `false` and the resolution path is abandoned, even though the bundled `index.d.ts` content is sitting in `_extraLibs`. The log shows the smoking gun:

```text
Untitled-1:288  [sync-fs:directoryExists:slot:error] file:///node_modules/replicad payloadBytes=0
Untitled-1:289  [lsp:directoryExists:miss]           file:///node_modules/replicad
Untitled-1:290  [lsp:getScriptText:static]           file:///node_modules/replicad/index.d.ts
```

The `:static` hit at line 290 only happens because TS is later reaching the file directly from `getScriptFileNames()` (which returns `Object.keys(this._extraLibs)`), NOT through the resolution algorithm — so the import statement itself fails to resolve and the editor draws the `Cannot find module 'replicad'` red squiggle.

**Fix (strengthened against VS Code's `AutoInstallerFs` reference implementation)**

VS Code is even more aggressive: `AutoInstallerFs.stat()` unconditionally pretends every `node_modules` and `@types` directory exists, then lazily materialises package contents only when TS later asks for a specific file:

```89:98:repos/vscode/extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts
        // We pretend every single node_modules or @types directory ever actually
        // exists.
        if (basename(mapped.path) === 'node_modules' || basename(mapped.path) === '@types') {
            return {
                mtime: 0,
                ctime: 0,
                type: vscode.FileType.Directory,
                size: 0
            };
        }
```

Architectural insight: **`directoryExists` is a gate that must be permissive to start the NodeJs resolution lookup chain**. The actual "package not installed" failure surfaces later at `fileExists('node_modules/<pkg>/package.json')` or its `index.d.ts` peer. Mirror this in Tau:

```typescript
public directoryExists(directoryName: string): boolean {
  const base = directoryName.split('/').filter(Boolean).at(-1);
  if (base === 'node_modules' || base === '@types') {
    this.diagnostic?.record({ category: 'directoryExists', outcome: 'static', fileName: directoryName });
    return true;
  }
  const prefix = directoryName.endsWith('/') ? directoryName : `${directoryName}/`;
  const extraLibs = (this as unknown as { _extraLibs?: Record<string, unknown> })._extraLibs;
  if (extraLibs) {
    for (const path of Object.keys(extraLibs)) {
      if (path.startsWith(prefix)) {
        this.diagnostic?.record({ category: 'directoryExists', outcome: 'static', fileName: directoryName });
        return true;
      }
    }
  }
  return this.syncFsClient.directoryExists(directoryName);
}
```

Pair this with a synthetic `package.json` extra-lib alongside each ATA-registered package so NodeJs resolution completes end-to-end without relying on TS's "fall through to `index.d.ts`" branch:

```typescript
// In TypeAcquisitionService.initialize, alongside the index.d.ts addExtraLib:
monaco.typescript.typescriptDefaults.addExtraLib(
  JSON.stringify({ name: staticType.packageName, types: 'index.d.ts' }),
  `file:///node_modules/${staticType.packageName}/package.json`,
);
```

(Cache the prefix tree if profiling shows the per-call scan is hot — there are O(few hundred) extraLib paths today.)

---

### Finding 3: Module resolver missing `.js → .ts` rewrite

**Severity**: P0 — root cause of S2 for the relative `'./lib/cylinder.js'` form (the dominant style in the project's own examples).

**Evidence**

The project's `main.ts` uses TypeScript's NodeNext-style import:

```typescript
import { makeCylinderTool } from './lib/cylinder.js';
```

The actual file on disk is `lib/cylinder.ts`. The custom resolver tries the raw specifier first and never strips the extension before adding `.ts`:

```59:80:apps/ui/app/lib/javascript-module-resolver.ts
  private async resolveRelative(specifier: string, fromPath: string): Promise<ResolveResult | undefined> {
    const directory = fromPath.slice(0, Math.max(0, fromPath.lastIndexOf('/'))) || '';
    const basePath = this.normalizePath(`${directory}/${specifier}`);

    // Extension resolution order (common TypeScript project conventions)
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    // Try each extension until we find a match (sequential is intentional for short-circuit)
    // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      // oxlint-disable-next-line no-await-in-loop -- Sequential checks to short-circuit on first match
      if (await this.fileManager.exists(fullPath)) {
        return {
          resolvedPath: `/${fullPath}`,
          isCdn: false,
        };
      }
    }

    return undefined;
  }
```

For `specifier === './lib/cylinder.js'`, `basePath = 'lib/cylinder.js'`, then we test `lib/cylinder.js`, `lib/cylinder.js.ts`, `lib/cylinder.js.tsx`, `lib/cylinder.js.js`, `lib/cylinder.js.jsx`, `lib/cylinder.js/index.ts`, … none of which exists. Returns `undefined`. The custom definition provider then yields no `LocationLink`, and Cmd+Click degrades to whatever Monaco's TS LS produces (which is also broken as long as Finding 1 stands).

**Fix**

Strip recognised JS-family extensions before iterating, in addition to the bare-form attempt:

```typescript
const jsToTsRewrites: Record<string, readonly string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.tsx', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
};

const trailing = Object.keys(jsToTsRewrites).find((ext) => specifier.endsWith(ext));
const baseNoExt = trailing ? specifier.slice(0, -trailing.length) : specifier;
const candidates = trailing ? jsToTsRewrites[trailing] : ['', '.ts', '.tsx', '.js', '.jsx'];
const directories = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
const probes = [...candidates.map((ext) => baseNoExt + ext), ...directories.map((suffix) => baseNoExt + suffix)];
```

This mirrors what TypeScript itself does under `moduleResolution: NodeNext`/`Bundler` and aligns with the project's own example code style.

---

### Finding 4: `getScriptVersion` falls through for `libFileMap` entries

**Severity**: P1 — log noise + redundant slot round-trips, NOT a user-visible bug once Finding 1 is fixed (because the slot calls would then return `notFound` cheaply rather than hanging in retry loops).

**Evidence**

Upstream:

```51:61:node_modules/monaco-editor/esm/vs/language/typescript/tsWorker.js
  getScriptVersion(fileName) {
    let model = this._getModel(fileName);
    if (model) {
      return model.version.toString();
    } else if (this.isDefaultLibFileName(fileName)) {
      return "1";
    } else if (fileName in this._extraLibs) {
      return String(this._extraLibs[fileName].version);
    }
    return "";
  }
```

`isDefaultLibFileName` only matches the **single** active `lib.<target>.full.d.ts`. Every other `lib.*.d.ts` (e.g. `lib.es5.d.ts`, `lib.es2015.d.ts`) is in `libFileMap` (and therefore returned by `_getScriptText`) but produces an empty version. The trace shows the resulting per-tick noise:

```text
Untitled-1:1224  [sync-fs:statMtimeVersion:slot:notFound] lib.es5.d.ts
Untitled-1:1225  [sync-fs:statMtimeVersion:slot:notFound] lib.es2015.d.ts
Untitled-1:1226  [sync-fs:statMtimeVersion:slot:notFound] lib.es2015.collection.d.ts
…
```

(repeats every ~85 lines for the duration of the trace).

**Fix**

In `tau-sync-ts-worker.getScriptVersion`, short-circuit when the upstream `_getScriptText` finds the file (which means it lives in `libFileMap` even though `getScriptVersion` upstream returned `''`):

```typescript
public override getScriptVersion(fileName: string): string {
  const baseVersion = super.getScriptVersion(fileName);
  if (baseVersion !== '') return baseVersion;

  // libFileMap fallthrough: super._getScriptText recognises it; pin the version
  // to '1' (libs are immutable) before paying for a syncFs round-trip.
  if (super._getScriptText(fileName) !== undefined) {
    this.diagnostic?.record({
      category: 'getScriptVersion',
      outcome: 'static',
      fileName,
      detail: '1',
    });
    return '1';
  }

  const syncVersion = this.syncFsClient.getScriptVersionForPath(fileName);
  // … existing tail
}
```

---

### Finding 5: `moduleResolution: NodeJs` is the wrong default

**Severity**: P1 — partially overlaps Finding 3 but is a surface-area nit.

**Evidence**

```55:69:apps/ui/app/lib/javascript-contribution.ts
    monaco.typescript.typescriptDefaults.setCompilerOptions({
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      allowImportingTsExtensions: true,
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.typescript.ScriptTarget.ESNext,
      module: monaco.typescript.ModuleKind.ESNext,
      noLib: false,
      allowNonTsExtensions: true,
      noEmit: true,
      esModuleInterop: true,
      baseUrl: '.',
    });
```

`NodeJs` is the legacy CommonJS-style algorithm. With ESM (`module: ESNext`) projects that use `.js` import suffixes for `.ts` source (NodeNext convention), the built-in resolver is mis-paired and won't perform the `.js → .ts` rewrite either. The Tau project examples consistently emit `from './lib/foo.js'` style imports.

**Fix**

Switch to `Bundler` (preferred for editor IntelliSense without forcing the user to author NodeNext-correct paths) or `NodeNext` (strictest and matches the import style on disk):

```typescript
moduleResolution: monaco.typescript.ModuleResolutionKind.Bundler,
```

Once Bundler is in place, the custom resolver in Finding 3 still pays its way for the **navigation** code path (Monaco doesn't wire its module-resolution cache into our `provideDefinition`), but the TS LS itself will correctly resolve and type-check the import.

---

### Finding 6: Missing ATA types for transitive dependencies

**Severity**: P1 — extra red squigglies inside ATA-injected `.d.ts` files.

**Evidence**

`replicad.bundled.json` ships a single key:

```bash
$ python3 -c "import json; print(list(json.load(open('libs/api-extractor/src/generated/replicad/replicad.bundled.json')).keys()))"
['replicad']
```

…but the bundled `index.d.ts` body imports from `replicad-opencascadejs` and `manifold-3d`:

```1:8:libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts
// Bundled type declarations for replicad.
// Auto-generated by extract-replicad-api.ts - do not edit manually.

import { Adaptor3d_Surface } from 'replicad-opencascadejs';
import { Bnd_Box } from 'replicad-opencascadejs';
import { Bnd_Box2d } from 'replicad-opencascadejs';
import type { Box } from 'manifold-3d';
import { BRepAdaptor_CompCurve } from 'replicad-opencascadejs';
```

`replicad-opencascadejs` is NOT in any of the four `kernelTypeMaps` (`opencascadeTypes` ships under the key `opencascade.js`, not `replicad-opencascadejs`). `manifold-3d` IS shipped via `manifoldTypes`. So every `replicad-opencascadejs` import inside the replicad bundle is unresolved, generating the `Cannot find module 'replicad-opencascadejs'` red squiggle that the user sees on top of Finding 2.

**Fix**

Either (a) ship a stub for `replicad-opencascadejs` (the source already has `replicad-opencascadejs-stub.d.ts` adjacent to the generated bundle but it is not wired into `kernelTypeMaps`), or (b) preprocess the bundle so the `replicad-opencascadejs` symbols are in-lined as ambient declarations next to the `replicad` module.

---

### Finding 7: FM-side `attachSyncFsServer` is single-slot

**Severity**: P2 — latent risk, NOT triggered in the user's trace because the project only uses `.ts` files (so only one TS worker is spawned).

**Evidence**

`MonacoEnvironment.getWorker` is invoked separately for each Monaco language label. With the registered language list including both `typescript` and `javascript` ids, opening any `.js` file alongside an existing `.ts` file produces a SECOND TS worker:

```76:99:apps/ui/app/lib/monaco.lib.ts
      if (label === 'typescript' || label === 'javascript') {
        performance.mark('ts-worker:create');
        const init = createTauLanguageHostInit();
        if (init) {
          const worker = new Worker(
            new URL('../../node_modules/@taucad/lsp/src/monaco-ts-worker/monaco-ts-worker.entry.ts', import.meta.url),
            …
          );
          worker.postMessage({ type: 'tau:init', port: init.port, … }, [init.port]);
```

Each call to `createTauLanguageHostInit` allocates a fresh `MessageChannel` + `slotSab` + `arenaSab` via `openTauLanguageHostPort` and posts `languageFsSyncAttach` to the FM worker. The FM worker handler unconditionally disposes the previous server before attaching the new one:

```186:207:apps/ui/app/machines/file-manager.worker.ts
      languageFsSyncDispose?.dispose();
      const workspace: SyncFsWorkspaceAdapter = { … };
      languageFsSyncDispose = attachSyncFsServer({
        port: data.port,
        slotSab: data.slotSab,
        arenaSab: data.arenaSab,
        workspace,
      });
      console.debug('[FM-Worker] languageFs sync FS attach');
```

Once the second worker attaches, the first worker's port has no listener on the FM side. Any subsequent `perform()` from that worker:

```127:128:libs/lsp-fs/src/sync/sync-fs-client.ts
    while (Atomics.load(int32, slotIndex.state) === syncState.pending) {
      Atomics.wait(int32, slotIndex.state, syncState.pending);
    }
```

…blocks indefinitely (`Atomics.wait` defaults to `Infinity` timeout) because nobody flips the slot back to `ready`. The first worker effectively freezes its TS LS on the next `_getScriptText`/`getScriptVersion` call.

**Fix options** (pick one — they form a layered defence)

- **R7a (priority bump to P1) — add a `perform()` timeout.** Every Microsoft sync-RPC implementation in `vscode-wasm` plumbs a per-call timeout that surfaces as `RPCErrno.TimedOut`. Tau's omitted timeout is an outlier:

  ```666:680:repos/vscode-wasm/sync-api-common/src/common/connection.ts
        // Wait for the answer
        const result = Atomics.wait(sync, 0, 0, timeout);
        switch (result) {
            case 'timed-out':
                return { errno: RPCErrno.TimedOut };
            case 'not-equal':
                const value = Atomics.load(sync, 0);
                // If the value === 1 the service has already
                // provided the result. Otherwise we actually
                // don't know what happened :-(.
                if (value !== 1) {
                    return { errno: RPCErrno.UnknownError };
                }
        }
  ```

  Default ~5 s, configurable per op, surfaced through the existing probe taxonomy as `syncError.timedOut`. Independently valuable: a wedged FM worker would currently freeze TS LS forever; with a timeout the slot falls back to "missing" cleanly.

- **Track each `attachSyncFsServer` registration by an opaque handle** returned with the `languageFsSyncAttach` ack so consumers can detach independently and the FM worker never disposes-and-replaces. Aligns with VS Code's per-server-per-channel topology (see Finding 11) and with `docs/research/scalable-language-contribution-fs-architecture.md`'s long-term plan for one bridge per language.

- **R7b (optional follow-up, P2) — adopt VS Code's per-request SAB pattern.** `BaseClientConnection._sendRequest` allocates a fresh `SharedArrayBuffer` per call sized exactly for that call's payload + result (`sync-api-common/src/common/connection.ts:643`). This eliminates Findings 7 and 9 by construction (no shared mutable slot, no orphan-on-rebind risk) at the cost of a `new SharedArrayBuffer(...)` per RPC. For a Tau workspace with a few hundred resolution probes per program rebuild this is likely fine — a quick benchmark would confirm. Bonus: unlocks payloads larger than the current 4 MiB arena via VS Code's `VariableResult` two-step fetch pattern (`connection.ts:689-715`), useful for vendored bundles like `opencascade.js`.

- **Cap the worker count** — multiplex `typescript` and `javascript` onto a single worker (Monaco does NOT require separate workers per language in our usage). Cheapest mitigation; orthogonal to the above.

---

### Finding 8: Library-api-policy violations in navigation opener

**Severity**: P2 — code-quality / consistency.

**Evidence**

```143:163:apps/ui/app/lib/monaco-navigation-service.ts
      // Ensure the target model exists (async, fire-and-forget)
      // async-iife: bootstrap — ensure model exists before openFile; cannot block navigation hook
      void (async (): Promise<void> => {
        try {
          await modelService.getOrEnsureModel(relativePath);
          const isReadOnly = handler.isReadOnly?.(relativePath) ?? false;

          editorRef.send({
            type: 'openFile',
            path: relativePath,
            source: 'user',
            readOnly: isReadOnly,
            lineNumber,
            column,
          });
        } catch {
          pendingNavigation = undefined;
          clearTimeout(pendingTimerId);
          pendingTimerId = undefined;
        }
      })();
```

`AGENTS.md` calls out the workspace ban:

> no IIFE-just-to-consume-a-thenable patterns (`void (async () => …)()` is banned)

Refactor into a named helper or a `.then(...)` chain so the intent (fire-and-forget bootstrap) is explicit and discoverable.

A second smaller smell in the same file: `extractPathFromUri` returns the raw path slice without normalising `file:///` URIs that arrive from the upstream TS LS for ATA virtual files (e.g. `file:///node_modules/replicad/index.d.ts`). The handler match step then runs `isJsFile('node_modules/replicad/index.d.ts')`, which returns `true`, but `modelService.getOrEnsureModel('node_modules/replicad/…')` will not have a matching IndexedDB-backed file. We should explicitly opt OUT of opening read-only ATA virtual files (or open them in a read-only Monaco model with the extraLib content as the source) rather than silently no-op.

---

### Finding 9: Two-step `perform` write order is racy on stale completion

**Severity**: P3 — defensive hardening; not implicated in the current trace.

**Evidence**

```114:134:libs/lsp-fs/src/sync/sync-fs-client.ts
  const perform = (op: SyncFsOp, absolutePath: string): void => {
    if (disposed) {
      throw new Error('sync-fs: client disposed');
    }
    const myRequest = ++requestId;
    Atomics.store(int32, slotIndex.state, syncState.pending);
    Atomics.store(int32, slotIndex.requestId, myRequest);
    Atomics.store(int32, slotIndex.errorCode, syncError.ok);
    Atomics.store(int32, slotIndex.payloadLength, 0);

    const message: TauSyncFsWireMessage = { tau: 'sync-fs', op, requestId: myRequest, path: absolutePath };
    options.port.postMessage(message);

    while (Atomics.load(int32, slotIndex.state) === syncState.pending) {
      Atomics.wait(int32, slotIndex.state, syncState.pending);
    }

    if (Atomics.load(int32, slotIndex.requestId) !== myRequest) {
      throw new Error('sync-fs: stale request completion');
    }
  };
```

The state-vs-requestId writes are not atomic and the FM-side handler enqueues messages serially. If two unrelated subsystems ever shared a slot (today they don't — see Finding 7), the server could observe `state === pending` with the old `requestId` momentarily and the resulting `invalidRequest` finish would race the new write. Today the only fallout would be a `slot:error` outcome, not data corruption, but the invariant is brittle.

**Fix**

Make the slot a CAS write: pack `state | requestId` into a single 32-bit cell (15-bit request id, 1-bit state) or use `Atomics.compareExchange` so the FM side cannot observe a half-updated slot.

---

### Finding 10: Custom JS definition provider duplicates tsserver's own resolution

**Severity**: P0 — surfaced by VS Code cross-reference; dissolves Finding 3 and Finding 5's residual concerns.

**Evidence**

VS Code's `TypeScriptDefinitionProvider` does NOT do its own module resolution at the extension layer. It delegates EVERYTHING to tsserver via a single `definitionAndBoundSpan` request:

```17:60:repos/vscode/extensions/typescript-language-features/src/languageFeatures/definitions.ts
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.DefinitionLink[] | vscode.Definition | undefined> {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return undefined;
        }

        const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
        const response = await this.client.execute('definitionAndBoundSpan', args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
```

Module resolution including the `.js → .ts` rewrite is handled by tsserver itself based on `tsconfig.json`'s `moduleResolution`. Monaco's bundled TS worker exposes the same `getDefinitionAtPosition` API and Monaco automatically registers a TypeScript definition provider that wires through it.

Tau's `apps/ui/app/lib/javascript-definition-provider.ts` + `javascript-module-resolver.ts` are **redundant work that races Monaco's built-in provider**. When our custom provider returns `undefined` (the common case for bare specifiers and any relative path it can't resolve), Monaco's built-in provider is queried; if our provider returns a `LocationLink`, both sets are merged. We have no semantic need to ship our own module resolver — TS's own resolver works correctly the moment R5 (switch to `Bundler` / `NodeNext`) lands.

**Fix**

Delete `apps/ui/app/lib/javascript-definition-provider.ts` and `apps/ui/app/lib/javascript-module-resolver.ts` after R5 ships. Verify Cmd+Click navigation works through Monaco's built-in TS definition provider end-to-end. This makes Finding 3 (the `.js → .ts` rewrite gap) moot — TS's own resolver does it correctly under `Bundler`/`NodeNext`. R3 then becomes "validate via test that Monaco's built-in provider handles `'./lib/cylinder.js'`-style imports under the new `moduleResolution`" instead of "implement our own rewrite table."

---

### Finding 11: Single-port FM bridge vs. VS Code's per-channel topology

**Severity**: P2 — architectural shape, frames the Finding 7 fix.

**Evidence**

VS Code's browser TS server creates **three independent `MessageChannel`s** per worker — `tsserverChannel` (sync RPC), `watcherChannel` (file-watch async), and `syncChannel` (sync FS). Each channel has a single owner, and the `syncFs` channel is the ONLY one that uses SAB:

```93:154:repos/vscode/extensions/typescript-language-features/src/tsServer/serverProcess.browser.ts
        const tsserverChannel = new MessageChannel();
        const watcherChannel = new MessageChannel();
        const syncChannel = new MessageChannel();
        this._tsserver = tsserverChannel.port2;
        this._watcher = watcherChannel.port2;
        this._syncFs = syncChannel.port2;
```

Each `WorkerServerProcess` spawns a fresh `ApiService('vscode-wasm-typescript', connection)` over the new `syncChannel`, so per-worker isolation is automatic — no FM-side singleton exists to be torn down by a sibling worker.

Tau collapses sync FS + everything into a single port via `languageFsSyncAttach`. That is fine for the current scope, but the long-term implication is: **the FM worker should expose a per-worker handler map (Finding 7 fix), not a `dispose-and-replace` global**. Each channel should be addressed independently so a second TS worker (or future KCL/OpenSCAD LSP workers, per `docs/research/scalable-language-contribution-fs-architecture.md`) doesn't tear down its sibling.

**Fix**

Phrase the FM-side fix not as "Map<MessagePort, …>" alone but as "track each `attachSyncFsServer` registration by an opaque handle returned with the `languageFsSyncAttach` ack, so consumers can detach independently and the FM worker never disposes-and-replaces." Directly aligns with VS Code's per-server isolation. Folded into R7 (above).

---

### Finding 12: No `signalReady()` handshake on the FM bridge

**Severity**: P3 — defensive hardening; tiny first-call race window.

**Evidence**

VS Code's `BaseClientConnection.serviceReady()` returns a promise that resolves when the server side calls `signalReady()` after binding all handlers (`sync-api-common/src/common/connection.ts:594`, `sync-api-common/src/browser/connection.ts:42-44`):

```155:155:repos/vscode/extensions/typescript-language-features/src/tsServer/serverProcess.browser.ts
        connection.signalReady();
```

Tau's client just starts sending `perform()` calls as soon as the worker binds the port; with the current shared-slot design, a race on the very first call could explain part of the early `slot:exception` cluster at log line 273 (the first-ever `statMtimeVersion` for `lib/cube.ts` happens immediately after `[lsp:diagnostic] sync FS bound` at line 246).

VS Code also defines a 32-bit `RPCErrno` enum shared across all four of their sync-RPC implementations (`sync-api-common`, `wasm-kit`, `wasm-component-model`, `wasm-wasi-core`). Tau's `syncError` enum (`ok | notFound | isDirectory | tooLarge | ioError | aborted | invalidRequest`) is comparable but tied to the FS domain; if we generalise the bridge for KCL/OpenSCAD LSPs (per the scalable language contribution research doc), broaden to a domain-agnostic errno space.

**Fix**

Add a `signalReady()` handshake before `setTauLanguageHostPortFactory` returns so the TS worker cannot issue a `perform()` against a half-bound FM-side handler. Defer the errno generalisation until the second LSP transport ships.

---

## Recommendations

Recommendations are ordered by priority. R1, R2, R5, R10 together restore every observed user symptom (closed-file diagnostics, Cmd+Click on closed-file exports, third-party module resolution, Cmd+Click on `'./lib/foo.js'` style imports).

| #   | Action                                                                                                                                                                                                                                                                                                                                             | Priority | Effort | Impact                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Copy SAB-backed arena bytes through `view.slice()` before every `decoder.decode(...)` in `sync-fs-client.ts` (matches VS Code's documented idiom in `sync-api-common`).                                                                                                                                                                            | P0       | XS     | Fixes every `slot:exception`; restores closed-file diagnostics & Cmd+Click on closed-file exports.                                                                               |
| R2  | In `tau-sync-ts-worker.directoryExists`: (a) return `true` unconditionally for any `node_modules` / `@types` basename (mirrors VS Code's `AutoInstallerFs`), (b) consult `_extraLibs` prefix matches, then (c) fall through to syncFs. Pair with synthetic `package.json` extra-libs in `TypeAcquisitionService` for every ATA-registered package. | P0       | S      | Removes red squigglies on `replicad`/`opencascade.js`/`@jscad/modeling`/`manifold-3d` imports without relying on TS's `index.d.ts`-fallthrough branch.                           |
| R5  | Switch `setCompilerOptions.moduleResolution` from `NodeJs` to `Bundler` (or `NodeNext`).                                                                                                                                                                                                                                                           | P0       | XS     | Aligns Monaco TS LS resolution with the project's own import style; precondition for R10.                                                                                        |
| R10 | After R5: delete `apps/ui/app/lib/javascript-definition-provider.ts` and `apps/ui/app/lib/javascript-module-resolver.ts`. Verify Cmd+Click works through Monaco's built-in TS definition provider.                                                                                                                                                 | P0       | S      | Removes redundant resolver that races Monaco's built-in provider; dissolves Finding 3 by construction (TS's own resolver does `.js → .ts` rewrite under `Bundler`/`NodeNext`).   |
| R3  | (Re-scoped) Add an integration test asserting Monaco's built-in TS definition provider resolves `'./lib/cylinder.js'` to `lib/cylinder.ts` once R5/R10 land. No production code change.                                                                                                                                                            | P1       | XS     | Regression guard for the NodeNext-style import navigation behaviour.                                                                                                             |
| R4  | Short-circuit `getScriptVersion` to `'1'` when `super._getScriptText` recognises the file (covers all `libFileMap` entries).                                                                                                                                                                                                                       | P1       | XS     | Removes per-tick `lib.*.d.ts` noise; cuts redundant slot round-trips.                                                                                                            |
| R6  | Wire `replicad-opencascadejs-stub.d.ts` (and any other transitive dep types) into `kernelTypeMaps`.                                                                                                                                                                                                                                                | P1       | S      | Removes "Cannot find module 'replicad-opencascadejs'" inside the replicad bundle.                                                                                                |
| R7a | Add a default `perform()` timeout (~5 s, configurable per op) surfacing as `syncError.timedOut`. Every `vscode-wasm` sync-RPC implementation does this; Tau's omitted timeout is an outlier.                                                                                                                                                       | P1       | XS     | Prevents indefinite TS LS freeze on a wedged FM worker; cleanly degrades to "missing" instead.                                                                                   |
| R7b | Track each `attachSyncFsServer` registration by an opaque handle returned with the `languageFsSyncAttach` ack so consumers can detach independently and the FM worker never disposes-and-replaces.                                                                                                                                                 | P2       | M      | Prevents TS LS freeze when both `typescript` and `javascript` workers spawn; aligns with VS Code's per-channel topology and the scalable language-contribution architecture doc. |
| R8  | Refactor `monaco-navigation-service.ts` to drop the banned `void (async () => …)()` IIFE; handle ATA-only URIs explicitly.                                                                                                                                                                                                                         | P2       | S      | Library-api-policy compliance + correct behaviour for read-only virtual files.                                                                                                   |
| R9  | Pack state/requestId into a single CAS cell in `sync-fs-protocol.ts` so half-updated slots are unobservable.                                                                                                                                                                                                                                       | P3       | M      | Defensive hardening; unblocks future multi-port sharing.                                                                                                                         |
| R11 | Add a `signalReady()` handshake before `setTauLanguageHostPortFactory` returns so the TS worker cannot issue a `perform()` against a half-bound FM-side handler.                                                                                                                                                                                   | P3       | S      | Closes a tiny first-call race window during worker bootstrap.                                                                                                                    |
| R12 | (Optional, P2 follow-up) Adopt VS Code's per-request `SharedArrayBuffer` allocation pattern + `VariableResult` two-step fetch. Eliminates Findings 7 and 9 by construction; unlocks payloads larger than the current 4 MiB arena.                                                                                                                  | P2       | L      | Architectural simplification; benchmark first to confirm acceptable allocation overhead vs. the fixed-arena design.                                                              |

## Code Examples

### R1 — Drop-in patch shape

```typescript
// libs/lsp-fs/src/sync/sync-fs-client.ts
function decodeArena(decoder: TextDecoder, arena: Uint8Array, length: number): string {
  // TextDecoder rejects SAB-backed views in Chromium. .slice() returns a fresh
  // Uint8Array backed by a regular ArrayBuffer (matches VS Code's idiom in
  // sync-api-common; also defends against the arena mutating mid-decode).
  return decoder.decode(arena.subarray(0, length).slice());
}
```

Apply at every existing call site:

```typescript
return decodeArena(decoder, arena, payloadByteLength);
```

### R2 — Drop-in patch shape

```typescript
// libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts
private static _hasExtraLibUnder(extraLibs: Record<string, unknown> | undefined, prefix: string): boolean {
  if (!extraLibs) return false;
  const probe = prefix.endsWith('/') ? prefix : `${prefix}/`;
  for (const path of Object.keys(extraLibs)) {
    if (path.startsWith(probe)) return true;
  }
  return false;
}

public directoryExists(directoryName: string): boolean {
  // Permissive gate: TS NodeJs resolution probes node_modules/<pkg> before it
  // probes any specific file. Mirror VS Code's AutoInstallerFs.stat() and let
  // the actual "not installed" failure surface at fileExists time instead.
  const base = directoryName.split('/').filter(Boolean).at(-1);
  if (base === 'node_modules' || base === '@types') {
    this.diagnostic?.record({ category: 'directoryExists', outcome: 'static', fileName: directoryName });
    return true;
  }
  const extraLibs = (this as unknown as { _extraLibs?: Record<string, unknown> })._extraLibs;
  if (TauSyncTsWorker._hasExtraLibUnder(extraLibs, directoryName)) {
    this.diagnostic?.record({ category: 'directoryExists', outcome: 'static', fileName: directoryName });
    return true;
  }
  const exists = this.syncFsClient.directoryExists(directoryName);
  this.diagnostic?.record({ category: 'directoryExists', outcome: exists ? 'sync' : 'miss', fileName: directoryName });
  return exists;
}
```

Companion change in `apps/ui/app/lib/type-acquisition-service.ts` to register a synthetic `package.json` for every ATA-injected package so NodeJs resolution completes through the canonical algorithm:

```typescript
// inside TypeAcquisitionService.initialize, alongside the existing index.d.ts addExtraLib
monaco.typescript.typescriptDefaults.addExtraLib(
  JSON.stringify({ name: staticType.packageName, types: 'index.d.ts' }),
  `file:///node_modules/${staticType.packageName}/package.json`,
);
```

## Appendix

### A. Probe-outcome cardinality across the user trace

| Outcome                               | Count    | Notes                                                         |
| ------------------------------------- | -------- | ------------------------------------------------------------- |
| `slot:exception` (`statMtimeVersion`) | 41       | Always for `lib/cube.ts` or `lib/cylinder.ts` (Finding 1).    |
| `slot:exception` (`readFile`)         | 1        | `lib/cylinder.ts`, line 278 (Finding 1).                      |
| `slot:notFound`                       | hundreds | Dominated by `lib.*.d.ts` (Finding 4).                        |
| `slot:error` (`directoryExists`)      | hundreds | `node_modules/<pkg>` lookups (Finding 2).                     |
| `slot:ok` (`directoryExists`)         | dozens   | Workspace root + `/lib`.                                      |
| `pool:ok`                             | dozens   | Tier-0 `SharedPool` hits for `cube.ts`/`cylinder.ts` content. |

### B. Why hovers still work for closed files even with Finding 1 active

Hover lookups for an alias on the import line travel through `_getScriptText` ONCE during initial program build (when the closed file is first discovered through module resolution). The Tier-0 pool short-circuits the SAB decode entirely:

```168:181:libs/lsp-fs/src/sync/sync-fs-client.ts
      const fromPool = pool?.resolveCopy(target.absolutePath);
      if (fromPool) {
        const decoded = decoder.decode(fromPool);
        onProbe?.({
          op: 'readFile',
          fileName,
          relativePath: target.relativePath,
          absolutePath: target.absolutePath,
          tier: 'pool',
          outcome: 'ok',
          payloadBytes: fromPool.byteLength,
        });
        return decoded;
      }
```

`pool.resolveCopy` already returns a regular `Uint8Array` (it copies out of the pool arena), so `TextDecoder.decode` accepts it. That single successful decode populates the TS LS program with cylinder.ts's exports, which is enough for hover. Definition resolution, however, depends on `getScriptVersion` returning a non-empty string each tick — which requires the SAB-backed `statMtimeVersion` decode in Finding 1. That's the asymmetry the user is observing.

### C. VS Code prior-art cross-reference

A targeted review of `repos/vscode/extensions/typescript-language-features` and `repos/vscode-wasm/sync-api-common` was performed to validate every recommendation against an independently-evolved production implementation. Headline outcome: VS Code converges with our P0/P1 fixes on every single root cause, validating Findings 1, 2, and 7 directly. Three additional architectural insights surfaced as Findings 10–12.

| Tau finding                                     | VS Code equivalent                                                                                                                      | Relationship                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finding 1 (`TextDecoder` + SAB)                 | `sync-api-common/src/common/connection.ts:700-707, 798` — uses `view.slice()` with documenting comment                                  | **Validated**. Tightened R1 to use `view.slice()` for parity with the canonical idiom.                                                                 |
| Finding 2 (`directoryExists` ignores extraLibs) | `extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts:89-98` — pretends every `node_modules`/`@types` dir exists  | **Validated + strengthened**. R2 now mirrors VS Code's permissive gate AND adds a synthetic `package.json` extra-lib for end-to-end NodeJs resolution. |
| Finding 3 (`.js → .ts` rewrite)                 | N/A — VS Code delegates resolution entirely to tsserver                                                                                 | **Dissolved by Finding 10/R10**. Deleting our custom resolver removes the gap; TS's own resolver does the rewrite under `Bundler`/`NodeNext`.          |
| Finding 7 (single-slot FM bridge, no timeout)   | `sync-api-common/src/common/connection.ts:643, 666-680` — fresh SAB per request + `Atomics.wait` timeout with `RPCErrno.TimedOut`       | **Validated + split**. R7a (timeout, P1) bumped from P2; R7b (per-request SAB) added as optional P2 follow-up.                                         |
| Finding 9 (racy two-step `perform`)             | Same as Finding 7 — VS Code's per-request SAB sidesteps the race by construction                                                        | **Dissolved if R12 lands**; otherwise R9 stands.                                                                                                       |
| Finding 10 (NEW)                                | `extensions/typescript-language-features/src/languageFeatures/definitions.ts:17-60` — pure `definitionAndBoundSpan` delegate            | Custom JS definition provider should be deleted. R10.                                                                                                  |
| Finding 11 (NEW)                                | `extensions/typescript-language-features/src/tsServer/serverProcess.browser.ts:93-154` — three independent `MessageChannel`s per worker | Frames the R7b architectural shape.                                                                                                                    |
| Finding 12 (NEW)                                | `sync-api-common/src/common/connection.ts:594` + `:42-44` (browser) — `signalReady()` handshake                                         | R11 closes a small first-call race window.                                                                                                             |

### D. Files inspected

**Tau workspace**

- `libs/lsp-fs/src/sync/sync-fs-protocol.ts`
- `libs/lsp-fs/src/sync/sync-fs-client.ts`
- `libs/lsp-fs/src/sync/sync-fs-server.ts`
- `libs/lsp/src/monaco-ts-worker/monaco-ts-worker.entry.ts`
- `libs/lsp/src/monaco-ts-worker/tau-sync-ts-worker.ts`
- `libs/lsp/src/language-fs-sync-host.ts`
- `apps/ui/app/lib/monaco.lib.ts`
- `apps/ui/app/lib/javascript-contribution.ts`
- `apps/ui/app/lib/javascript-module-resolver.ts`
- `apps/ui/app/lib/javascript-definition-provider.ts`
- `apps/ui/app/lib/monaco-navigation-service.ts`
- `apps/ui/app/lib/monaco-model-service.ts`
- `apps/ui/app/machines/file-manager.worker.ts`
- `apps/ui/app/lib/type-acquisition-service.ts`
- `libs/api-extractor/src/index.ts`
- `node_modules/monaco-editor/esm/vs/language/typescript/tsWorker.js`

**External (managed via `repos.yaml`)**

- `repos/vscode/extensions/typescript-language-features/src/tsServer/serverProcess.browser.ts`
- `repos/vscode/extensions/typescript-language-features/src/languageFeatures/definitions.ts`
- `repos/vscode/extensions/typescript-language-features/src/filesystems/ata.ts`
- `repos/vscode/extensions/typescript-language-features/src/filesystems/autoInstallerFs.ts`
- `repos/vscode/extensions/typescript-language-features/src/filesystems/memFs.ts`
- `repos/vscode-wasm/sync-api-common/src/common/connection.ts`
- `repos/vscode-wasm/sync-api-common/src/browser/connection.ts`
