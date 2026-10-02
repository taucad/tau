---
title: 'ZIP Download Streaming and Shared Ignore-List Architecture'
description: 'Audit of the ZIP-download hot path and recommendation for a shared `.gitignore`-style filter applied across zip, copy, publish, import, and agent walks'
status: draft
created: '2026-05-19'
updated: '2026-05-19'
category: audit
related:
  - docs/policy/filesystem-policy.md
  - docs/research/filesystem-explicit-workspace-boundaries.md
---

# ZIP Download Streaming and Shared Ignore-List Architecture

Audit of how Tau builds ZIP archives in-browser, why "Download as ZIP" stalls or fails for medium/large workspaces, and where a shared `.gitignore`-style ignore filter should be introduced so that the same exclusion semantics apply to download, copy, publish, import, and agent traversal call sites.

## Executive Summary

The current ZIP path (`WorkspaceFileService.getZippedDirectory`) is two unrelated worst-cases compounded:

1. **A fully buffered, serially-traversed read pipeline** that loads every byte of the directory into a `Record<string, Uint8Array>` in worker RAM _before_ compression even starts (one `readdir` → one `stat` → one `readFile` per entry, every step awaited in a single recursion). A 200-file project with 50 MB of GLB caches under `.tau/` round-trips IndexedDB ~600 times serially and pins 50–150 MB of worker heap before any ZIP byte is produced.
2. **A monolithic JSZip blob materialization** (`zip.generateAsync({ type: 'blob' })`) that buffers a second copy of the entire archive in memory, runs single-threaded, and is widely benchmarked at 3–10× slower than modern alternatives (`fflate`, `client-zip`).

There is no ignore filter: `.tau/cache`, `.tau/skills`, `/node_modules/` (OPFS-mounted kernel typings), agent transcripts, screenshots, exported GLBs, and `out-tsc/`/`dist/` from imported repos are all packed into every user ZIP. This makes ZIPs unnecessarily large _and_ directly causes the download stall the user reported, because the cache content is exactly what dominates the read+buffer cost.

The publish pipeline (`publish.machine.ts`) already carries an ignore policy (`publishForbiddenPathPrefixes` + `isPublishableTauPath`), but it is reimplemented in-band and only after `getDirectoryContents` has already loaded everything. Five other sites would benefit from the same filter (zip, copy-directory, drag-drop import, zip import, chat `grep`/`glob`/`list_dir`).

**Recommended direction**: replace `getDirectoryContents` + JSZip with a streaming pipeline (`@zip.js/zip.js` or `client-zip`, each yielding a `ReadableStream<Uint8Array>` with no buffered intermediate), driven by a generator that walks the tree with parallel `stat` and serialised traversal, gated by a single `WorkspaceIgnoreMatcher` (`.gitignore` grammar via `ignore`) seeded with built-in Tau defaults and overlay-able per-workspace `.tauignore`. Plumb the same matcher into copy-directory, publish, import, and the chat agent's recursive walks.

## Problem Statement

A user opened the `/files` route on a workspace that contains ~290 projects backed by IndexedDB (`indexeddb` column in the attached screenshot) and triggered "Download as ZIP" via the folder action menu (`apps/ui/app/routes/files/route.tsx` `handleDownloadFolderZip`). The action either never completes, fails silently after a long stall, or completes after a delay long enough that the user perceives it as broken.

The request:

1. Identify every reason this is slow.
2. Add a `.gitignore`-style ignore list so the Tau cache (`.tau/cache`, `.tau/skills`, transcripts, screenshots, GLB artifacts) and similar non-essential content are excluded from the download.
3. Identify every other call site that would benefit from sharing the same ignore mechanism.
4. Document findings via `create-research`.

## Methodology

- Static read of the entire ZIP code path from UI click handler down to the IDB provider's per-file `_idbGet` transaction.
- Trace of every alternative call site that recursively walks the workspace (`copyDirectory`, `getDirectoryContents`, `publish.machine.ts`, `import.worker.ts`, `import-disk.machine.ts`, chat RPC handlers).
- Comparison against published JSZip benchmarks and the streaming APIs of `client-zip` and `@zip.js/zip.js` (Conformance v2 / Streams API based).
- Cross-check against existing policy and learned facts (`publishForbiddenPathPrefixes`, `publishableTauSubdirectory`, `.tau/` convention).
- File evidence cited with `line:filepath` references; line numbers are read from current `main` state at the time of authorship.

## Findings

### Finding 1: Zipping is sequential, fully buffered, and main-thread-coupled

`WorkspaceFileService.getZippedDirectory` (`packages/filesystem/src/workspace-file-service.ts:577-586`) is the only entry point. It calls `getDirectoryContents(path)` which fans into the strictly serial `_getDirectoryContentsInternal`:

```1104:1133:packages/filesystem/src/workspace-file-service.ts
  private async _getDirectoryContentsInternal(
    provider: {
      readdir(path: string): Promise<string[]>;
      stat(path: string): Promise<FileStat>;
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    },
    path: string,
  ): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};

    const collect = async (currentPath: string, basePath: string): Promise<void> => {
      const entries = await provider.readdir(currentPath);
      for (const entry of entries) {
        const fullPath = joinPath(currentPath, entry);
        // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive collection
        const stat = await provider.stat(fullPath);
        if (stat.type === 'file') {
          const relativePath = basePath === '/' ? fullPath.slice(1) : fullPath.slice(basePath.length + 1);
          // oxlint-disable-next-line no-await-in-loop -- Sequential reads required for recursive collection
          files[relativePath] = await provider.readFile(fullPath);
        } else {
          // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive collection
          await collect(fullPath, basePath);
        }
      }
    };

    await collect(path, path);
    return files;
  }
```

Costs per file when the active provider is `DirectIdbProvider`:

- One `readdir` per directory — O(1) on the in-memory path index, cheap.
- One `stat` per entry. For files whose size was never cached, `stat` performs a full `_idbGet` (one IDB transaction) just to learn the byte length even though we are about to read the body in the next statement (`packages/filesystem/src/backend/direct-idb-provider.ts:218-233`). For a fresh page load with no warm cache, this is a 2× round trip per file.
- One `readFile` per file — yet another `_idbGet` transaction (`packages/filesystem/src/backend/direct-idb-provider.ts:338-349`).

So a directory of N files = ~`2N + D` independent IDB transactions, each crossing the event loop, all serialised by the `await` in the for-loop. There is no batching (`getAll`, `getAllKeys`, range queries) and no parallelism even though IDB tolerates concurrent readonly transactions on independent keys.

Then the second buffering pass:

```577:586:packages/filesystem/src/workspace-file-service.ts
  public async getZippedDirectory(path: string): Promise<Blob> {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- JSZip is the library's class name
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const files = await this.getDirectoryContents(path);
    for (const [relativePath, content] of Object.entries(files)) {
      zip.file(relativePath, content);
    }
    return zip.generateAsync({ type: 'blob' });
  }
```

Memory profile at peak:

| Tier                      | Bytes held                            |
| ------------------------- | ------------------------------------- |
| `files` record            | Sum of every uncompressed file        |
| JSZip internal node graph | Per-entry metadata + slice references |
| `generateAsync` output    | Full archive byte buffer              |
| Returned `Blob`           | Final archive (browser-owned)         |

For a workspace mid-screenshot (290 projects × ~hundreds of KB of `.tau/cache/*.glb` and screenshots per project), peak worker heap is bounded by **2× total uncompressed bytes**, which on Chrome's default worker memory cap is the most likely failure mode. JSZip is also single-threaded; the worker is fully occupied for the duration.

### Finding 2: No ignore semantics — Tau cache is the bulk of every ZIP

`getZippedDirectory` packs whatever bytes exist under the requested directory. Today that includes:

| Path                           | Origin                                                                       | Should it ship?           |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------- |
| `.tau/parameters/*.json`       | RJSF preference / parameter overrides                                        | ✅ Yes (it's user intent) |
| `.tau/export/preferences.json` | `chat-converter.tsx:94` — `preferencesPath = '.tau/export/preferences.json'` | ⚠ Optional (user setting) |
| `.tau/cache/**`                | Geometry caches, GLB artifacts                                               | ❌ No                     |
| `.tau/skills/**`               | Per-project agent skills (when stored)                                       | ❌ No                     |
| `.tau/agents/**`               | Agent transcripts                                                            | ❌ No                     |
| Imported `node_modules/**`     | When a user drag-drops a real repo                                           | ❌ No                     |
| Imported `dist/`, `out-tsc/`   | Build artifacts from imported repos                                          | ❌ No                     |
| `.git/objects/**`              | Imported git repos                                                           | ❌ No                     |
| Editor-generated GLB exports   | `chat-converter.tsx` writes exports under `/projects/<id>/...`               | ⚠ Depends on user         |

The `.tau/` directory is the project's reserved convention (see `libs/types/src/constants/publication.constants.ts:69` — `publishableTauSubdirectory = '.tau/parameters/'` is the only piece publish accepts). The download flow does not apply the same logic; it ships everything.

`/node_modules/` is mounted as an OPFS-backed virtual prefix (`apps/ui/app/machines/file-manager.worker.ts:118` — `mountTable.mount('/node_modules', nodeModulesProvider, { backend: 'opfs' })`) holding kernel typings (`@taucad/openscad`, `replicad`, etc.). If a `/files` user clicks "Download as ZIP" on `/` for the IndexedDB column they would get the project tree, but for webaccess columns over real folders the user's actual `node_modules` is fair game and historically the **majority** of bytes.

### Finding 3: The publish path already implements an ignore rule — divergently

`apps/ui/app/utils/publish.utils.ts` and `libs/types/src/constants/publication.constants.ts` ship the only ignore-filter Tau has today:

```60:82:libs/types/src/constants/publication.constants.ts
export const publishForbiddenPathPrefixes = ['node_modules/', '.git/objects/', 'dist/', 'out-tsc/'] as const;

/**
 * The single subdirectory under `.tau/` that ships with publications (parameter overrides
 * consumed by `parameterFileResolverMiddleware`). Everything else under `.tau/` (artifacts,
 * cache, transcripts, skills, exports, AGENTS.md, etc.) is local-only.
 */
export const publishableTauSubdirectory = '.tau/parameters/';

export function isPublishableTauPath(normalizedPath: string): boolean {
  if (!normalizedPath.startsWith(publishableTauSubdirectory)) {
    return false;
  }
  return normalizedPath.length > publishableTauSubdirectory.length;
}
```

`publish.machine.ts` consumes this via `isForbiddenPublishRelativePath` _after_ a full `getDirectoryContents` walk — meaning publishing inherits the same buffer-everything cost as zip download, then discards bytes it never needed to load. The rule is bespoke (prefix list + special `.tau/` carve-out) and lives behind a static constant rather than a pattern grammar (no globs, no negation, no per-workspace override).

### Finding 4: JSZip is the wrong library for the job (size + speed)

Public benchmarks and library characteristics:

| Library          | Streaming output?                                                 | Web Streams API?                           | Worker-friendly?              | Bundle (min) | Notes                                                                                  |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `jszip` 3.10     | No (returns `Blob`/`Uint8Array` at the end)                       | Partial via `nodeStream`/`stream` (legacy) | Single-threaded               | ~94 kB       | Holds whole archive in RAM; default STORE per entry (no compression) → giant archives. |
| `fflate`         | Yes (`Zip`/`AsyncZipDeflate` callback API)                        | No (callback-based)                        | Yes                           | ~9 kB        | Fastest in-browser zip; uses Web Workers for DEFLATE.                                  |
| `client-zip`     | Yes (`downloadZip` returns `Response` with body `ReadableStream`) | Yes (Web Streams)                          | Trivial                       | ~3 kB        | STORE-only by design; ideal when speed > size.                                         |
| `@zip.js/zip.js` | Yes (`ZipWriter` + `WritableStream`)                              | Yes                                        | Yes (uses Workers internally) | ~30 kB       | Full feature set, DEFLATE, AES, ZIP64, web-streams-end-to-end.                         |

Tau already pays the JSZip bundle cost for three other callers (`zip.machine.ts`, `unzip.machine.ts`, `import-disk.machine.ts`, `import.worker.ts`, `chat-converter.tsx`). All five run the same buffered-then-zip pattern.

### Finding 5: Sites that would benefit from a shared ignore matcher

Every recursive workspace walk would. Ranked by user-visible impact:

| #   | Site                                                                                                           | Operation                          | Today                                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| 1   | `apps/ui/app/routes/files/route.tsx:831` `handleDownloadFolderZip`                                             | `/files` per-folder ZIP            | No filter                                                     |
| 2   | `apps/ui/app/routes/projects_.$id/project-command-items.tsx:52` `handleDownloadZip`                            | Command palette "Download ZIP"     | No filter                                                     |
| 3   | `apps/ui/app/routes/projects_.$id_.preview/preview-desktop.tsx:38` `handleDownloadZip`                         | Preview-route "Download ZIP" CTA   | No filter                                                     |
| 4   | `packages/filesystem/src/workspace-file-service.ts:524` `copyDirectory`                                        | Duplicate project / copy folder    | No filter (copies caches into the duplicate)                  |
| 5   | `apps/ui/app/machines/publish.machine.ts:110` `collectPublishFilesActor`                                       | Publish (`/v/:id` sharing)         | In-band post-load filter via `isForbiddenPublishRelativePath` |
| 6   | `apps/ui/app/utils/file-reader.utils.ts` `readFromDataTransfer` / `readFromDirectoryHandle`                    | Drag-drop / "open folder" import   | No filter (imports `node_modules` and `.git/`)                |
| 7   | `apps/ui/app/workers/import.worker.ts:97` + `apps/ui/app/machines/import-disk.machine.ts:97` `extractZipActor` | ZIP import                         | No filter                                                     |
| 8   | `libs/chat/src/rpc/handlers/handle-grep.ts:20` `collectFilePaths`                                              | Chat agent `grep`                  | No filter                                                     |
| 9   | `libs/chat/src/rpc/handlers/handle-glob-search.ts:12` `collectFileEntries`                                     | Chat agent `glob_search`           | No filter (`minimatch` runs after collecting everything)      |
| 10  | `apps/ui/app/machines/zip.machine.ts` + `chat-converter.tsx:328` `zipMultiple` flow                            | Multi-format export bundled as ZIP | No filter                                                     |
| 11  | `apps/api/app/api/publications/publications.service.ts:58-61`                                                  | Server-side publish guard          | Mirrors `publishForbiddenPathPrefixes` (already enforced)     |

Sites 5 + 11 already enforce a forbidden-path policy; the rest leak the cache, build outputs, agent transcripts, and (worst case for imports) the user's entire `node_modules`. The shared matcher would replace 5's in-band filter, layer onto 6 to drop `node_modules`/`.git` before they hit IndexedDB at all, and give 8/9 a token-budget reprieve (the chat agent currently lists/greps junk paths it should never see).

### Finding 6: `bulkImport` exists on write — there is no `bulkRead`

`DirectIdbProvider.bulkImport` (`packages/filesystem/src/backend/direct-idb-provider.ts:300-326`) coalesces many writes into a single `readwrite` IDB transaction with `durability: 'relaxed'`. The symmetric `bulkRead(paths: string[])` does not exist; every read opens its own short-lived `readonly` transaction (`_idbGet`, line 523). Even when `getDirectoryContents` is asked for thousands of files, the provider hands out one transaction per file. This is the principal reason a "warm" workspace ZIP still takes seconds.

### Finding 7: No back-pressure on the comlink return path

`contentService.getZippedDirectory(path)` returns `Promise<Blob>` across the worker boundary. With JSZip's monolithic output, the worker can post the Blob in one `postMessage` once `generateAsync` resolves — but for the duration of generation the worker is unresponsive (no FS watch deliveries, no LSP responses if it shares the worker, etc.). The UI shows no progress because no progress is reported back through the RPC. The toast (`project-command-items.tsx:57-71`) just says "Creating ZIP archive..." with no percentage.

### Finding 8: Compression policy is undecided

JSZip defaults to `STORE` per entry unless `generateAsync({ compression: 'DEFLATE' })` is passed. The current call site (`workspace-file-service.ts:585`) passes nothing → STORE. ZIPs of CAD source + binary GLB / PNG end up only ~5–15% smaller than uncompressed source because GLB and PNG do not deflate, but text source files compress 4–8×. A `DEFLATE`-by-default with binary-mime carve-out (`.glb`, `.png`, `.zip`, `.usdz`, `.step.gz`) would roughly halve typical archive size at low CPU cost. `client-zip` is STORE-only (intentional); `fflate` and `@zip.js/zip.js` give per-entry control.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                               | Priority | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Introduce `WorkspaceIgnoreMatcher` in `packages/filesystem` using `ignore` (gitignore grammar). Seed with built-in defaults; overlayable from `/.tauignore` per workspace and per-call extras.                                                                                                                                                                                                       | P0       | M      | High   |
| R2  | Replace `getDirectoryContents` + JSZip with a streaming pipeline. Author a `WorkspaceFileService.zipDirectoryStream(path, options)` that returns `ReadableStream<Uint8Array>`. Use `@zip.js/zip.js` (full feature set, web-streams end-to-end) or `client-zip` (smallest, STORE-only). Walk the tree with `readdirWithStats` (no per-file stat probe) and `provider.readFileStream` where available. | P0       | L      | High   |
| R3  | Plumb the matcher into `getZippedDirectory` (zip), `copyDirectory` (duplicate project), `publish.machine.ts` (replace `isForbiddenPublishRelativePath`), `file-reader.utils.ts` (drag-drop import), `import.worker.ts` / `import-disk.machine.ts` (ZIP import), and the chat `grep`/`glob` handlers.                                                                                                 | P0       | M      | High   |
| R4  | Add `provider.bulkRead(paths: string[])` to `DirectIdbProvider` using a single `readonly` transaction over all keys, mirroring `bulkImport`. Use it in `_getDirectoryContentsInternal` and in the new streaming walker for the IDB backend.                                                                                                                                                          | P1       | S      | High   |
| R5  | Stream the final blob to the user via the browser's File System Access API `showSaveFilePicker` + `FileSystemWritableFileStream` when available, with a `Response.body` → `URL.createObjectURL(Blob)` fallback for browsers without it. Eliminates the second buffered copy in the main thread.                                                                                                      | P1       | M      | Med    |
| R6  | Report progress through the RPC (`onProgress: (processed, total, byteCount)`) so the toast can render a percentage. Use the matcher's enumeration phase to compute `total` cheaply.                                                                                                                                                                                                                  | P1       | S      | Med    |
| R7  | Default compression to `DEFLATE` with per-extension carve-out for already-compressed mimes (`.glb`, `.gltf`+binary, `.png`, `.jpg`, `.zip`, `.usdz`, `.webp`, `.avif`, `.br`, `.gz`).                                                                                                                                                                                                                | P2       | S      | Med    |
| R8  | Remove `jszip` from the four other call sites once the streaming wrapper is in place — `zip.machine.ts`, `unzip.machine.ts`, `import-disk.machine.ts`, `import.worker.ts`, `chat-converter.tsx zipMultiple`. Track lockfile bundle delta in CI via the existing `size-limit` ratchet.                                                                                                                | P2       | M      | Med    |
| R9  | Add `WorkspaceIgnoreMatcher` to chat `list_dir`/`glob_search`/`grep` so the agent never sees `.tau/cache`/`node_modules` paths (token budget + result-quality win). Configurable via `system-prompt` settings if the user explicitly wants junk visible.                                                                                                                                             | P2       | S      | Med    |

## Trade-offs

### Library choice: `@zip.js/zip.js` vs `client-zip` vs `fflate`

| Concern                              | `@zip.js/zip.js`                        | `client-zip`                          | `fflate`                                       |
| ------------------------------------ | --------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Streaming output                     | `WritableStream` end-to-end (preferred) | `Response.body` `ReadableStream` only | Callback chunks; can adapt to `ReadableStream` |
| Compression                          | STORE + DEFLATE + AES                   | STORE only (by design)                | STORE + DEFLATE                                |
| Built-in worker offload              | Yes (internal worker pool)              | No (single-threaded)                  | Yes (`AsyncZipDeflate` uses workers)           |
| Bundle size (min, no compression)    | ~30 kB                                  | ~3 kB                                 | ~9 kB                                          |
| Replaces JSZip on extract path too   | Yes                                     | No (writer-only)                      | Yes (`Unzip`/`AsyncUnzip`)                     |
| Suitability for future encrypted ZIP | Yes                                     | No                                    | No                                             |

**Recommendation**: `@zip.js/zip.js` — single library covering zip _and_ unzip on streams, with DEFLATE control and a worker pool. The ~30 kB delta over JSZip's ~94 kB net-saves bundle size while unblocking R7. `client-zip` is the right choice if we ever ship a "fast STORE-only" express path, but it cannot replace the extract callers.

### Filter language: `.gitignore` vs glob list vs custom DSL

`.gitignore` syntax (via the `ignore` npm package) is the de facto industry pattern, supports negation (`!.tau/parameters/`), parent re-includes, and is what users already know. It also gives publish a way to express "everything under `.tau/` except `.tau/parameters/`" without a special function. Alternatives (raw `minimatch` glob list, custom JSON DSL) lose negation or invent terminology.

### Stored ignore: built-in only vs `.tauignore` file vs both

Built-ins must cover the Tau-specific paths a workspace cannot opt back in to (`.tau/cache/`, agent transcripts, runtime-only OPFS mounts visible through the virtual tree). A workspace-local `.tauignore` (sibling to `.gitignore`) lets advanced users tighten or loosen the policy for their own publish/zip flows. A typical `.gitignore` already in the workspace can be honoured opportunistically (most CAD projects don't ship one, so this is a bonus rather than a requirement). All three layers compose cleanly under `ignore`.

## Code Examples

### Built-in defaults

```typescript
// packages/filesystem/src/workspace-ignore-matcher.ts (proposed)
export const tauBuiltinIgnorePatterns = [
  // Tau project conventions
  '.tau/**',
  '!.tau/parameters/**',
  '!.tau/export/preferences.json',

  // Imported repo junk
  'node_modules/',
  '.git/',
  'dist/',
  'out-tsc/',
  'build/',
  '.next/',
  '.turbo/',
  '.cache/',

  // OS & editor noise
  '.DS_Store',
  'Thumbs.db',
  '*.swp',
  '*.swo',
];
```

### Streaming ZIP wrapper

```typescript
// packages/filesystem/src/workspace-file-service.ts (proposed shape)
public async zipDirectoryStream(
  path: string,
  options?: { matcher?: WorkspaceIgnoreMatcher; signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> {
  const matcher = options?.matcher ?? defaultMatcher;
  const { provider, path: rootPath } = this._resolveProvider(path);

  const { ZipWriter } = await import('@zip.js/zip.js');
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = new ZipWriter(writable);

  // Producer: walk + add entries without ever buffering the full set
  void (async () => {
    try {
      for await (const entry of walkFiltered(provider, rootPath, matcher, options?.signal)) {
        const stream = provider.readFileStream
          ? await provider.readFileStream(entry.absolutePath, { signal: options?.signal })
          : bufferToStream(await provider.readFile(entry.absolutePath));
        await writer.add(entry.relativePath, stream, {
          level: shouldCompress(entry.relativePath) ? 6 : 0,
          dataDescriptor: true,
        });
      }
      await writer.close();
    } catch (error) {
      await writable.abort(error);
    }
  })();

  return readable;
}
```

### Streaming save (R5)

```typescript
async function downloadDirectoryStreaming(
  fileManager: FileManagerContext,
  path: string,
  filename: string,
): Promise<void> {
  const stream = await fileManager.zipDirectoryStream(path);

  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({ suggestedName: filename });
    const writable = await handle.createWritable();
    await stream.pipeTo(writable);
    return;
  }

  // Fallback: Response → Blob → object URL
  const blob = await new Response(stream).blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

## Diagrams

### Current pipeline (worker, single-threaded, fully buffered)

```
UI click
  └─► proxy.getZippedDirectory(path)               // RPC
        └─► WorkspaceFileService.getZippedDirectory
              ├─► getDirectoryContents(path)       //  ┐
              │     └─► collect(...) (serial)       //  │
              │           ├─► readdir              //  │  Phase 1
              │           ├─► stat (N×)            //  │  fully buffers
              │           └─► readFile (N×)        //  │  every byte
              │             (IDB tx per file)      //  ┘
              ├─► new JSZip()
              ├─► for each → zip.file(name, bytes)
              └─► zip.generateAsync({ type:'blob' })  // single-threaded
                    └─► postMessage(blob)             // worker unresponsive until done
UI ◄── Blob ──┘
  └─► URL.createObjectURL → <a download> click
```

### Proposed pipeline (worker → main as a stream, ignore-filtered, parallel reads)

```
UI click
  └─► proxy.zipDirectoryStream(path, { matcher })   // RPC returns ReadableStream
        └─► WorkspaceFileService.zipDirectoryStream
              ├─► walkFiltered (gen):
              │     ├─► readdirWithStats           // batched stat
              │     ├─► matcher.test(relPath)      // drop ignored before read
              │     └─► yield { absolutePath, relativePath }
              ├─► ZipWriter on { writable } half of TransformStream
              └─► per entry:
                    ├─► provider.readFileStream(absolutePath)   // capability-driven
                    └─► writer.add(relPath, stream, { level }) // streams chunk-by-chunk
                                                                // worker stays responsive
UI ◄── ReadableStream ──┘
  └─► R5: pipeTo(FileSystemWritableFileStream) or new Response(stream).blob()
```

## References

- `packages/filesystem/src/workspace-file-service.ts:577-586` — current `getZippedDirectory`.
- `packages/filesystem/src/workspace-file-service.ts:1104-1133` — serial recursive collector.
- `packages/filesystem/src/backend/direct-idb-provider.ts:300-326` — `bulkImport` exists; `bulkRead` does not.
- `apps/ui/app/utils/publish.utils.ts` + `libs/types/src/constants/publication.constants.ts:60-82` — the publish ignore policy (canonical inspiration for the shared matcher).
- `apps/ui/app/routes/projects_.$id/chat-converter.tsx:94` — confirms `.tau/` is Tau's reserved project-internal convention.
- `apps/ui/app/machines/file-manager.worker.ts:118` — `/node_modules` OPFS mount.
- Library docs: [@zip.js/zip.js — "Zipping data into a Blob"](https://gildas-lormeau.github.io/zip.js/api/index.html), [client-zip](https://github.com/Touffy/client-zip), [fflate streaming API](https://github.com/101arrowz/fflate).
- Related: `docs/policy/filesystem-policy.md`, `docs/research/filesystem-explicit-workspace-boundaries.md`.

## Appendix: Full ignore-aware call-site mapping

| Call site                                                                                                        | Today                                           | After R1 + R3                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/ui/app/routes/files/route.tsx` `handleDownloadFolderZip`                                                   | `getZippedDirectory(path)`                      | `zipDirectoryStream(path, { matcher: defaults })`                            |
| `apps/ui/app/routes/projects_.$id/project-command-items.tsx` `handleDownloadZip`                                 | `getZippedDirectory(/projects/<id>)`            | Streaming + matcher; toast shows percentage from R6                          |
| `apps/ui/app/routes/projects_.$id_.preview/preview-desktop.tsx` `handleDownloadZip`                              | `getZippedDirectory(/projects/<id>)`            | Streaming + matcher                                                          |
| `packages/filesystem/src/workspace-file-service.ts:524` `copyDirectory`                                          | Walks → writes every file                       | Skip ignored entries; option `{ matcher }`                                   |
| `apps/ui/app/machines/publish.machine.ts:97` `collectPublishFilesActor`                                          | Walks → `isForbiddenPublishRelativePath` filter | Iterate streamed entries through the same matcher (delete in-band predicate) |
| `apps/ui/app/utils/file-reader.utils.ts` `readFromDataTransfer` / `readFromDirectoryHandle` / `readFromFileList` | Imports every entry from drag-drop / picker     | Skip ignored before reading body                                             |
| `apps/ui/app/workers/import.worker.ts:97` + `apps/ui/app/machines/import-disk.machine.ts:97` `extractZipActor`   | Extracts every zip entry                        | Skip ignored entries; configurable per import (e.g. allow `node_modules`)    |
| `libs/chat/src/rpc/handlers/handle-grep.ts:20` `collectFilePaths`                                                | Recurses every file then greps                  | Skip ignored before stat/read                                                |
| `libs/chat/src/rpc/handlers/handle-glob-search.ts:12` `collectFileEntries`                                       | Recurses every file then minimatch              | Skip ignored before glob match                                               |
| `apps/api/app/api/publications/publications.service.ts:58-61`                                                    | Server-side prefix guard                        | Keep server-side rule as defence-in-depth; matcher feeds the same constant   |
