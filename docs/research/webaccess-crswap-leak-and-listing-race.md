---
title: 'Webaccess `.crswap` Leak and Directory-Listing Race'
description: 'Root-cause analysis of why Chromium swap files briefly appear in the /files panel and the editor for webaccess workspaces, and how to filter them at the provider boundary'
status: draft
created: '2026-05-20'
updated: '2026-05-20'
category: investigation
related:
  - docs/policy/filesystem-policy.md
  - docs/research/filesystem-explicit-workspace-boundaries.md
  - docs/research/filesystem-access-api-cohesion-audit.md
---

# Webaccess `.crswap` Leak and Directory-Listing Race

Investigation into transient `*.crswap` entries surfacing in Tau's `/files` panel, project file column, and editor tabs whenever the active workspace is `webaccess`-backed; root cause is a leaky abstraction in `FileSystemAccessProvider` that exposes Chromium's swap-file write protocol to every consumer above the provider boundary.

## Executive Summary

Chromium implements `FileSystemFileHandle.createWritable()` by creating a sibling file `<name>.crswap` on the real disk, buffering writes into it, and atomically renaming it onto the target on `close()`. `FileSystemAccessProvider.readdir` and `readdirWithStats` (`packages/filesystem/src/backend/fs-access-provider.ts`) iterate `directoryHandle.entries()` without filtering, so any directory listing that races a concurrent write briefly enumerates the swap file as a real entry. The UI then surfaces it in the `/files` column and even allows it to be opened as an editor tab — at which point the rename completes, the swap vanishes, and the editor shows "File not found" against a tab that can never resolve. There is **zero filtering** anywhere in the stack: `rg crswap` over `packages`, `apps`, `docs` returns no matches.

The fix is provider-local: filter `*.crswap` in `readdir` / `readdirWithStats`, and short-circuit `_resolveFileHandle` on swap-suffixed paths to `ENOENT`. Optional hardening: `createWritable({ mode: 'exclusive' })` to shrink the on-disk swap window. No call site above `FileSystemProvider` needs awareness of browser swap conventions.

## Problem Statement

A user opened a `webaccess`-backed project and observed a phantom file appearing intermittently in the file column. From the reporter's screenshot, the editor pane showed two tabs:

- `main.scad` — the real project source
- `main.scad.crswap` — opened as a tab, right pane shows "File not found"

The `.crswap` entry appears in the file column, then disappears on the next listing pass. When clicked while visible, the editor opens it as a tab; by the time the editor's content load runs, the file is gone. This breaks two things at once: the file-tree listing is non-deterministic (entries appear and vanish without user action), and the editor tab system caches references to entries that are inherently transient.

The behaviour reproduces only when the workspace is `webaccess`. `indexeddb` and `opfs` workspaces do not exhibit it, even when the same write code path runs.

## Methodology

- Read of `FileSystemAccessProvider` end-to-end (`packages/filesystem/src/backend/fs-access-provider.ts`), tracing every code path that hits `createWritable()` or iterates `directoryHandle.entries()`.
- Codebase audit (`rg crswap`, `rg createWritable`, `rg FileSystemWritableFileStream`) over `packages`, `apps`, `docs` to confirm no filter exists at any layer.
- Cross-check against Chromium's File System Access implementation: the `siloed` (default) writable mode allocates a `.crswap` sibling visible to `entries()`; the `exclusive` mode (Chrome 110+) takes an OS file lock instead.
- Trace of the upstream call graph from provider `readdir` → `WorkspaceFileService.readShallowDirectory` (`packages/filesystem/src/workspace-file-service.ts:742`) → `useFileManager.readShallowDirectory` (`apps/ui/app/hooks/use-file-manager.tsx`) → `apps/ui/app/routes/files/route.tsx:478,536` → `ColumnShell` rendering.
- Codebase grep for transient-artefact filters (`.DS_Store`, `Thumbs.db`, `.crdownload`, `.~lock.`, `.tmp`) — none exist.

## Findings

### Finding 1: `createWritable()` exposes swap files to `entries()` on `webaccess` workspaces

`FileSystemAccessProvider.writeFile` uses Chromium's default writable mode:

```56:65:packages/filesystem/src/backend/fs-access-provider.ts
public async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const fileHandle = await this._resolveFileHandle(path, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes);
  } finally {
    await writable.close();
  }
}
```

Default `createWritable()` (mode `'siloed'`) implements crash-safe atomic writes by:

1. Creating a sibling `<name>.crswap` in the same directory **on the real disk**.
2. Buffering all `write()` calls into the swap file.
3. On `close()`, atomically renaming the swap onto the target. If the writer is GC'd or the page is killed before `close()`, the swap survives as an orphan on disk.

Steps 1–3 are not abstracted away by `FileSystemDirectoryHandle.entries()`. The swap entry is fully visible to any concurrent enumeration.

### Finding 2: `readdir` and `readdirWithStats` enumerate without filtering

```73:101:packages/filesystem/src/backend/fs-access-provider.ts
public async readdir(path: string): Promise<string[]> {
  const directoryHandle = await this._resolveDirectoryHandle(path);
  const entries: string[] = [];
  for await (const [name] of directoryHandle.entries()) {
    entries.push(name);
  }
  return entries;
}

public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
  const directoryHandle = await this._resolveDirectoryHandle(path);
  const result: Array<{ name: string } & FileStat> = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'directory') {
      result.push({ name, type: 'dir', size: 0, mtimeMs: Date.now() });
    } else {
      const file = await handle.getFile();
      result.push({ name, type: 'file', size: file.size, mtimeMs: file.lastModified });
    }
  }
  return result;
}
```

Every entry yielded by `entries()` is passed through. There is no allow-list, deny-list, or pattern-based filter for transient or browser-private artefacts. `WorkspaceFileService.readShallowDirectory` and `WorkspaceFileService.readdir` consume these results verbatim and the `/files` route renders them as user-facing tree nodes.

### Finding 3: The race window

The `.crswap` entry is observable in any directory listing executed strictly between `await fileHandle.createWritable()` and the resolution of `await writable.close()`. Sources of writes that hit the same directory the user is viewing:

| Trigger                      | Path written                       | Race likelihood    |
| ---------------------------- | ---------------------------------- | ------------------ |
| Editor save / autosave       | `<project>/<source>`               | Very high (typing) |
| Render artefact persist      | `<project>/.tau/cache/...`         | High during render |
| Screenshot capture           | `<project>/.tau/screenshots/...`   | Medium             |
| Project seed (createProject) | `<project>/<seed files>`           | Once at creation   |
| Duplicate project            | Multiple files under target prefix | Bursty             |
| Import / drag-drop           | Many files                         | Bursty             |
| Agent tool writes            | Various                            | Bursty             |

The listing itself is triggered by: the `/files` panel's per-column reload, FM machine `setRoot` re-init, post-mutation tree refresh in `route.tsx`, and the file-watch tick. Any concurrency between the two surfaces the swap.

### Finding 4: Editor tab system caches a reference to the doomed swap entry

When the user (or a route prefetcher) clicks the briefly-visible swap entry, a tab is registered against `main.scad.crswap`. The editor's content load is asynchronous — by the time it issues `readFile('main.scad.crswap')`, `close()` has already run, the swap is gone, and the read raises `ENOENT`. The right pane in the screenshot shows the resulting "File not found" state. The tab persists because nothing invalidates it; the tab system has no notion that swap entries are transient because no layer has labelled them as such.

This compounds the bug: a transient race becomes a sticky UI failure that requires user action to dismiss.

### Finding 5: `indexeddb` and `opfs` are immune for different reasons

| Backend     | Write API                                      | Swap visible to listing?                         |
| ----------- | ---------------------------------------------- | ------------------------------------------------ |
| `indexeddb` | Single key/value DB, in-Tau schema             | No swap concept                                  |
| `opfs`      | `createSyncAccessHandle()` typically; in-place | Not surfaced via `entries()` in current Chromium |
| `webaccess` | `createWritable()` on real disk                | **Yes — bug surface**                            |

The race window exists only on `webaccess` because that's the only backend whose `entries()` iterator iterates the real on-disk directory and therefore sees the swap.

### Finding 6: Orphaned swaps from prior crashes are also exposed

If a tab is killed mid-write (browser crash, OOM, hard refresh during a long write), Chromium leaves the `.crswap` orphaned on disk indefinitely. Subsequent sessions still enumerate it via the same unfiltered `readdir`. The bug manifests even when no write is in progress, as long as a previous session crashed.

There is no GC for these orphans on the browser side.

### Finding 7: Leaky-abstraction shape

The current architecture asks every consumer above `FileSystemProvider` to know about Chromium's swap convention to defend itself. None do. The full call chain that would need awareness:

| Layer                                       | Aware of `.crswap`? |
| ------------------------------------------- | ------------------- |
| `FileSystemAccessProvider` (origin)         | No (the bug)        |
| `WorkspaceFileService.readShallowDirectory` | No                  |
| `WorkspaceFileService.readdir`              | No                  |
| `FileTreeService` (fs-client)               | No                  |
| `useFileManager.readShallowDirectory`       | No                  |
| `/files` route tree rendering               | No                  |
| Editor tab manager                          | No                  |
| Project file column rendering               | No                  |
| Watch event filter                          | No                  |
| Agent `list_dir` tool                       | No                  |

Filtering at the boundary (provider) is single-source-of-truth; filtering at consumers multiplies failure modes (any unfiltered consumer leaks the swap).

### Finding 8: No related transient filters exist

A wider search for filters of similar transient artefacts returns nothing:

| Pattern        | Source                           | Filter present? |
| -------------- | -------------------------------- | --------------- |
| `*.crswap`     | Chromium FS Access writable swap | No              |
| `*.crdownload` | Chromium download partials       | No              |
| `.~lock.…#`    | LibreOffice lock file            | No              |
| `.DS_Store`    | macOS Finder                     | No              |
| `Thumbs.db`    | Windows Explorer                 | No              |
| `*.tmp`        | Generic                          | No              |

There is no current mechanism into which a `*.crswap` filter could be added — it has to be introduced fresh, and is a candidate centralisation point for any future transient-artefact filtering.

## Recommendations

| #   | Action                                                                                                                                                                                       | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Filter `*.crswap` entries inside `FileSystemAccessProvider.readdir` and `readdirWithStats` via a single `isTransientWebaccessArtifact(name)` helper                                          | P0       | Low    | High   |
| R2  | Short-circuit `_resolveFileHandle` (read paths) with `ENOENT` when the final segment is a transient artefact — defence in depth                                                              | P0       | Low    | Medium |
| R3  | Add a unit test that seeds the mock directory with a `*.crswap` entry and asserts it never appears via `readdir` / `readdirWithStats`                                                        | P0       | Low    | Medium |
| R4  | Switch `createWritable()` to `createWritable({ mode: 'exclusive' })` on Chromium ≥ 110 to shrink the on-disk swap window                                                                     | P1       | Low    | Low    |
| R5  | Add a one-liner under `docs/policy/filesystem-policy.md` Rule 13: transient browser artefacts must be hidden by the provider; no consumer above `FileSystemProvider` needs awareness of them | P1       | Low    | Medium |
| R6  | Generalise the helper to a deny-list (`*.crswap`, future `.DS_Store`, `Thumbs.db`, etc.) so we have a single editable list, not scattered checks                                             | P2       | Low    | Low    |

## Code Examples

### Proposed filter helper (provider-local)

```typescript
// packages/filesystem/src/backend/fs-access-provider.ts

/**
 * Names matching a transient browser-internal artefact convention. These
 * must never escape `FileSystemAccessProvider` — they're implementation
 * details of `FileSystemFileHandle.createWritable()` (Chromium swap files)
 * and of OS-side metadata writers, and exposing them to consumers above
 * the provider boundary produces phantom tree entries and stuck editor
 * tabs (see docs/research/webaccess-crswap-leak-and-listing-race.md).
 */
function isTransientWebaccessArtifact(name: string): boolean {
  // Chromium FS Access API swap file (siloed createWritable mode).
  return name.endsWith('.crswap');
}
```

### Updated `readdir` / `readdirWithStats`

```typescript
public async readdir(path: string): Promise<string[]> {
  const directoryHandle = await this._resolveDirectoryHandle(path);
  const entries: string[] = [];
  for await (const [name] of directoryHandle.entries()) {
    if (isTransientWebaccessArtifact(name)) {
      continue;
    }
    entries.push(name);
  }
  return entries;
}

public async readdirWithStats(path: string): Promise<Array<{ name: string } & FileStat>> {
  const directoryHandle = await this._resolveDirectoryHandle(path);
  const result: Array<{ name: string } & FileStat> = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (isTransientWebaccessArtifact(name)) {
      continue;
    }
    if (handle.kind === 'directory') {
      result.push({ name, type: 'dir', size: 0, mtimeMs: Date.now() });
    } else {
      const file = await handle.getFile();
      result.push({ name, type: 'file', size: file.size, mtimeMs: file.lastModified });
    }
  }
  return result;
}
```

### Defence in depth at `_resolveFileHandle`

```typescript
private async _resolveFileHandle(
  path: string,
  options: { create?: boolean } = {},
): Promise<FileSystemFileHandle> {
  const segments = this._splitPath(path);
  const name = segments.at(-1);
  if (name !== undefined && isTransientWebaccessArtifact(name)) {
    throw this._enoent(path);
  }
  // ...existing resolution
}
```

This ensures any stale reference (e.g. a cached editor tab id) that survives R1's listing filter still fails fast with a typed `ENOENT` rather than racing the rename and producing inconsistent results.

### Optional R4: shrink the swap window

```typescript
const writable = await fileHandle.createWritable({ mode: 'exclusive' });
```

Takes an OS file lock instead of allocating a swap file. Concurrent writers fail loudly rather than silently overwriting via swap rename. Not a substitute for R1 — `mode: 'exclusive'` is Chromium-specific, and orphan `.crswap` files from prior crashed sessions still exist on disk and must still be filtered out.

## Trade-offs

### R1 — filter on enumeration

| Approach                                  | Pros                                                     | Cons                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Provider-local filter (chosen)**        | Single source of truth; every consumer benefits; trivial | None observed                                                                                                       |
| Filter at `WorkspaceFileService`          | One layer up — covers all backends                       | Wrong layer; non-`webaccess` backends don't have swap files; couples generic service to a Chromium-specific name    |
| Filter at `/files` route only             | Localised                                                | Editor tabs, watch events, agent tools, project file column still see the swap; multiplies fix sites                |
| Don't filter; rely on `mode: 'exclusive'` | No code change for listing                               | Still leaks orphan swaps from prior crashes; `mode: 'exclusive'` is Chromium-specific and not universally available |

### Should we ever expose `.crswap` files?

No realistic user need exists. The swap is a browser implementation detail; users cannot meaningfully read, edit, or delete it. A workspace-maintenance flow could orphan-clean swap files explicitly, but it doesn't belong in the `/files` browsing UI — it would be a deliberate "Clean transient artefacts" action with its own dedicated unfiltered enumerator, owned by recovery code rather than the regular provider.

### Should we extend the helper to other patterns now?

R6 (generalise to a deny-list) is P2 because we don't currently have evidence of `.DS_Store`, `Thumbs.db`, etc. causing user-visible breakage. Premature inclusion risks hiding files users genuinely want to see. The helper _structure_ should be deny-list-shaped from the start, but the list itself should grow only with documented evidence.

## Diagrams

### Race timeline

```
write request                                            listing request
     │                                                            │
     │ createWritable()                                            │
     │──────────────────────► creates main.scad.crswap on disk     │
     │                                                            │
     │ write(bytes)                                                │
     │──────────────────────► buffer into swap                     │
     │                                            entries() ───►  │
     │                                            yields:         │
     │                                              main.scad     │
     │                                              main.scad.crswap ← **leak**
     │                                                            │
     │ close()                                                     │
     │──────────────────────► atomic rename                        │
     │                          main.scad.crswap → main.scad       │
     │                                                            │
     │ resolves                                            (next listing
     │                                                     no longer sees swap)
```

### Layered filter location (proposed)

```
┌──────────────────────────────────────────────────────────────────┐
│ /files route, project column, editor tabs, agent list_dir, watch │  ← consumers
│ (none aware of `.crswap`; none should need to be)                │
├──────────────────────────────────────────────────────────────────┤
│ WorkspaceFileService.readShallowDirectory / readdir              │  ← service
│ (passes results through verbatim)                                │
├──────────────────────────────────────────────────────────────────┤
│ FileSystemAccessProvider.readdir / readdirWithStats              │  ← FILTER HERE
│   if (isTransientWebaccessArtifact(name)) continue;              │
│ FileSystemAccessProvider._resolveFileHandle                      │
│   if (isTransientWebaccessArtifact(name)) throw ENOENT;          │
├──────────────────────────────────────────────────────────────────┤
│ FileSystemDirectoryHandle.entries()                              │  ← Chromium
│ (yields swap files unconditionally)                              │
└──────────────────────────────────────────────────────────────────┘
```

## References

- W3C File System Access spec — `FileSystemFileHandle.createWritable()`: https://wicg.github.io/file-system-access/#api-filesystemfilehandle-createwritable
- Chromium issue tracker — siloed write swap mechanism (search `.crswap`)
- Related: `docs/research/filesystem-explicit-workspace-boundaries.md`
- Related: `docs/research/filesystem-access-api-cohesion-audit.md`
- Policy: `docs/policy/filesystem-policy.md`

## Appendix

### File-touch surface for `webaccess` writes (where swaps can race listings)

| File path                                                             | Origin                              | Listing concurrency                        |
| --------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| `packages/filesystem/src/backend/fs-access-provider.ts:56-65`         | `writeFile` (every write goes here) | `readdir` / `readdirWithStats` on same dir |
| `packages/filesystem/src/backend/fs-access-provider.ts:172-177`       | `rename` (writeFile + unlink)       | Same as above                              |
| `apps/ui/app/hooks/use-project-manager.tsx` (createProject seed loop) | First-write burst                   | FM machine init listing                    |
| `apps/ui/app/hooks/use-project-manager.tsx` (duplicateProject copy)   | Bursty                              | FM machine init listing                    |
| `apps/ui/app/routes/files/route.tsx` mutation handlers                | User-driven                         | Per-column reload after mutate             |
