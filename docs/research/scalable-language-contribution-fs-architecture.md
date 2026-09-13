---
title: 'Scalable Language Contribution Filesystem Architecture'
description: 'Architecture blueprint for a shared filesystem bridge across Monaco language contributions (KCL, OpenSCAD, future Python/Rust/etc.), modelled on VS Code Web LSP-extension pattern.'
status: draft
created: '2026-05-07'
updated: '2026-05-07'
category: architecture
related:
  - docs/research/monaco-typescript-intellisense-investigation.md
  - docs/architecture/runtime-topology.md
  - docs/policy/filesystem-policy.md
---

# Scalable Language Contribution Filesystem Architecture

Blueprint for a shared filesystem (FS) bridge so every present and future
Monaco language contribution in `apps/ui` (KCL, OpenSCAD, JS/TS, plus future
Python/Rust/etc.) can resolve imports, hover, and go-to-definition against
the project workspace through one canonical protocol — modelled on the VS
Code Web `*-language-features` extension pattern (HTML/CSS/JSON/Markdown).

## Executive Summary

Tau today has two language islands that need workspace FS access — the JS/TS
stack (no FS — works around it by preloading every JS file as a Monaco
model) and the KCL LSP (its own custom postMessage protocol with three
request/response pairs co-located inside `kcl-lsp-types.ts`). OpenSCAD,
SysML and the rest are next in line. Without a shared primitive each new
language will reinvent the bridge.

VS Code's `html-language-features`, `css-language-features`,
`json-language-features` and `markdown-language-features` solve the same
problem with **one shared LSP custom-request module** (`fs/stat`,
`fs/readDir`, `fs/content`) layered over the existing JSON-RPC connection
and **two shared helpers** (`serveFileSystemRequests` on the client side,
`getFileSystemProvider` on the server side). Every browser-side LSP shares
the protocol byte-for-byte. Only `tsserver` is special — it requires a
synchronous host and uses `@vscode/sync-api-client` (SAB + `Atomics.wait`).

A second pass on `packages/filesystem` / `packages/fs-client` /
`packages/memory` / `packages/runtime` reveals that **Tau already has the
shared-memory infrastructure required to make this maximally fast and
strictly lazy** — the same `SharedPool` + `filePoolBuffer` pipeline that
powers zero-IPC file reads from the kernel runtime worker is directly
reusable by every LSP worker. The FM-owned `SharedArrayBuffer`-backed
content cache is populated **on read** (not preloaded), and any worker
attached to it gets sub-microsecond reads for warm files. Cold reads still
go through the bridge MessagePort and populate the pool as a side effect.
"Never load the workspace up front" falls out of the design naturally.

This pushes the architecture toward a **three-tier read pipeline** for
every LSP-driven `fs/content` request:

1. **Tier 0** — `SharedPool.resolveCopy(path)` — zero IPC, ~10ns.
2. **Tier 1** — bridge `MessagePort` RPC to the FM worker — ~1ms async,
   populates the pool on completion.
3. **Tier 2** _(future, only TS needs it)_ — `Atomics.wait` on a small SAB
   request slot — synchronous-from-async-context, ~10–100µs blocking.

The recommendation is to introduce three small modules in `apps/ui` —
**protocol**, **client adapter** (now SAB-aware), **Monaco↔LSP binding**
— totalling ~300 lines, and migrate KCL onto them. Every LSP worker
spawned by a contribution receives `{ port, filePoolBuffer? }` exactly the
same way the runtime kernel worker does today via
`client.connect({ port, filePoolBuffer })`. Each future language
contribution then adopts the bridge in three lines inside `activate()`.
JS/TS stays an island for now; if/when it gets a `serverHost`, Tier 2
gives it sync access to the same `FileService` without forking the FS
surface.

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

Tau ships seven Monaco language contributions today and is about to grow
the catalogue (Python via Pyright/Ruff WASM, Rust via rust-analyzer WASM,
plus richer SysML/USD support). Each language that needs to resolve
imports, list workspace files or stat a path currently has to invent its
own bridge from the language service back to `FileTreeService` /
`FileContentService`.

The concrete questions:

1. Is there a canonical protocol that every language contribution can
   follow so that "make this LSP server FS-aware" is a one-time integration
   — not per-language work?
2. What does VS Code do, and how much of that is reusable verbatim?
3. Where does Tau already conform to the pattern, and where has it
   accidentally reinvented a parallel mechanism?
4. What is the smallest set of shared modules that lets the next language
   be added without touching `FileTreeService`, `FileContentService`,
   `LanguageContributionRegistry` or any of the existing contributions?

## Scope and Non-Goals

**In scope**: shared FS protocol + helpers for LSP-speaking language
servers running in workers (or in-process JS providers); migration plan
for KCL; implications for OpenSCAD and future contributions.

**Out of scope**: fixing the JS/TS preloader bug (covered by
`monaco-typescript-intellisense-investigation.md`); replacing Monaco's
standalone `ts.worker` with a custom `serverHost`-aware build (covered as
R11 in the same prior doc); choosing the upstream WASM build for any
specific future language (Python, Rust, etc.).

## Methodology

- Walked the seven existing contributions registered against
  `LanguageContributionRegistry` (`apps/ui/app/lib/monaco-language-registry.ts`)
  and inventoried each one's FS surface.
- Read the KCL LSP client end-to-end (`apps/ui/app/lib/kcl-language/lsp/`)
  and traced its custom postMessage envelopes against the `LspFileManager`
  shape.
- Cross-referenced VS Code's four browser-resident `*-language-features`
  extensions in `repos/vscode/extensions/`, with particular focus on the
  shared `requests.ts` modules (client-side and server-side).
- Re-read `repos/vscode/extensions/typescript-language-features/web/src/serverHost.ts`
  to confirm tsserver remains the canonical exception that requires a
  synchronous FS host.
- Audited the `package.json` deps already present in the workspace
  (`vscode-languageserver-protocol`, `json-rpc-2.0`) to scope what would
  need to be added vs reused.
- **Second pass** on the existing shared-memory FS infrastructure across
  `packages/memory`, `packages/filesystem`, `packages/fs-client`, and
  `packages/runtime`. Specifically traced:
  - The `filePoolBuffer` allocation at `apps/ui/app/machines/file-manager.machine.ts:158–175`
    and its lifecycle through the FM worker
    (`apps/ui/app/machines/file-manager.worker.ts:158–164`,
    `WorkspaceFileService.setFilePool` /
    `packages/filesystem/src/workspace-file-service.ts:113–144`).
  - The reader-side fast path in
    `packages/fs-client/src/file-content-service.ts:666–690` which calls
    `filePool.resolveCopy(path)` before falling back to a worker RPC.
  - The runtime kernel worker's identical pattern at
    `packages/runtime/src/framework/kernel-worker.ts:540–566` and the
    bridge proxy short-circuit at
    `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts:565–576`.
  - The `runtime-topology.md` architecture doc to confirm the FM-owns-pool,
    consumers-attach contract and verify that no `Atomics.wait`-backed
    sync FS path exists today (only abort-signal SAB and content-pool SAB).

## Findings

### Inventory: current language contributions and their FS surface

| Contribution                                          | Engine                                      | Workspace FS use                                          | Bridge mechanism                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsTs` (`apps/ui/app/lib/javascript-contribution.ts`) | Monaco standalone `ts.worker` (built-in)    | Required for module resolution, but worker has no FS      | None — Tau preloads every JS file as a Monaco model and uses `setEagerModelSync(true)`. See `monaco-typescript-intellisense-investigation.md`.            |
| `kcl` (`apps/ui/app/lib/kcl-language/`)               | Zoo `kcl-wasm-lib` LSP server in a `Worker` | Required for `import "./lib/foo.kcl"`                     | **Custom postMessage protocol** — `fileReadRequest` / `fileExistsRequest` / `fileListRequest` plus matching `*Response` events (`kcl-lsp-types.ts:8–19`). |
| `openscad` (`apps/ui/app/lib/openscad-language/`)     | TS-side providers only                      | Wanted (for `include`/`use` resolution) but not yet wired | None today.                                                                                                                                               |
| `stepfile` / `stl` / `usd` / `sysml`                  | Shiki tokens only                           | Not yet                                                   | n/a — these will need a bridge as soon as they grow a real language service.                                                                              |

Two key observations from the inventory:

1. **Two of two production language services solve the same problem
   differently** — TS preloads models, KCL postMessages a custom envelope.
   Neither uses LSP's standard custom-request mechanism.
2. **`LspFileManager` is KCL-private** — it lives inside
   `kcl-lsp-client.ts:25–29` and is not surfaced anywhere shared, even
   though its shape (`readFile` / `exists` / `readdir`) is exactly what
   any other language contribution would need.

### Finding 1: VS Code's canonical FS-bridge pattern is three LSP custom requests

`repos/vscode/extensions/html-language-features/server/src/requests.ts` and
its client-side mirror at `client/src/requests.ts` together define the
entire FS bridge for HTML, CSS, JSON and Markdown LSPs. The contract:

```typescript
namespace FsStatRequest {
  type = new RequestType<string, FileStat, any>('fs/stat');
}
namespace FsReadDirRequest {
  type = new RequestType<string, [string, FileType][], any>('fs/readDir');
}
// CSS, Markdown additionally use:
namespace FsContentRequest {
  type = new RequestType<{ uri; encoding? }, string, any>('fs/content');
}
```

Two helpers anchor the pattern:

| Side                    | Helper                                                       | What it does                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server (worker)         | `getFileSystemProvider(handledSchemes, connection, runtime)` | Returns an object with `stat(uri)`/`readDirectory(uri)`/`readFile(uri)`. Each call internally fans out to `connection.sendRequest(FsStatRequest.type, uri)` etc. unless a synchronous in-worker FS is available. |
| Client (extension host) | `serveFileSystemRequests(client, runtime)`                   | Registers `client.onRequest(FsStatRequest.type, …)` handlers that fan out to `vscode.workspace.fs.stat(uri)` / `readDirectory(uri)` / `readFile(uri)`.                                                           |

What this buys VS Code (and would buy Tau):

- **No second channel.** FS calls travel over the same JSON-RPC connection
  the LSP already needs for hover/completion/etc. Existing logging,
  cancellation and error handling apply automatically.
- **Per-server cost is one helper call.** A new browser-side LSP
  (Markdown was added this way — `markdown-language-features`) opts in by
  importing the shared `requests.ts` and adding
  `serveFileSystemRequests(client, runtime)` to its `startClient`.
- **Schema-aware fan-out.** The helper transparently handles
  `file://` URIs via an in-worker FS where available and falls back to
  the LSP request for everything else, without the language code knowing.

### Finding 2: Tau has reinvented a parallel mechanism inside KCL

`apps/ui/app/lib/kcl-language/lsp/kcl-lsp-types.ts:8–19` defines:

```typescript
export const lspWorkerEventType = {
  init: 'init',
  call: 'call',
  fileReadRequest: 'fileReadRequest',
  fileReadResponse: 'fileReadResponse',
  fileExistsRequest: 'fileExistsRequest',
  fileExistsResponse: 'fileExistsResponse',
  fileListRequest: 'fileListRequest',
  fileListResponse: 'fileListResponse',
} as const;
```

`apps/ui/app/lib/kcl-language/lsp/kcl-lsp-client.ts:563–711` then
implements all six request/response handlers directly against
`Worker.postMessage`, parallel to the JSON-RPC `IntoServer` /
`fromServer` codecs the same client already runs for the rest of LSP
traffic. The diff between this and VS Code's pattern is almost entirely
mechanical:

| Concern                | KCL today                                        | VS Code pattern                                                          |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Channel                | Raw `Worker.postMessage` envelopes               | LSP JSON-RPC `RequestType` over the same connection                      |
| Request id allocation  | Custom `requestId: number` counter               | LSP's existing message-id allocator                                      |
| Response correlation   | Manual map keyed by `requestId` (in WASM bridge) | `vscode-jsonrpc` deferred-promise map                                    |
| Cancellation           | None                                             | LSP cancellation token forwards through `connection.sendRequest`         |
| Schema                 | URIs and paths mixed; `Uint8Array` for content   | URIs only; `FileStat` typed; `FileType` enum                             |
| Reuse across languages | Zero — each new WASM gets to invent it again     | Three lines per LSP (`serveFileSystemRequests(connection, fileManager)`) |

### Finding 3: TypeScript is the canonical "stays special" exception

`repos/vscode/extensions/typescript-language-features/web/src/serverHost.ts`
threads `tsserver` through `@vscode/sync-api-client` because tsserver's
`ServerHost` requires synchronous `readFile` / `directoryExists` /
`getDirectories`. The synchronous shim costs SAB + `Atomics.wait` plumbing
that no other LSP needs.

In Tau:

- The standalone `ts.worker` shipped by `monaco-editor@0.55.x` does not
  expose a `serverHost`-style hook at all. The current preload-as-models
  workaround is a consequence — fixing it properly (the R11 path in
  `monaco-typescript-intellisense-investigation.md`) means swapping in a
  custom worker build with a `serverHost`.
- That decision is **decoupled from this blueprint**. The shared LSP-FS
  bridge described here is for async LSP-speaking language services. When
  TS eventually gets its own `serverHost`, it will either (a) reuse the
  same `FileManagerApi` directly (simplest) or (b) add a sync-bridge that
  satisfies the same shape via SAB+`Atomics`. Either way, the rest of the
  language contributions are unaffected.

### Finding 4: Workspace-relative URI semantics need to be standardised

VS Code's bridge speaks `vscode-uri` end to end. Tau's KCL bridge accepts
mixed inputs at `kcl-lsp-client.ts:409–421`:

```typescript
private resolveBridgePathCandidates(rawPath: string): string[] {
  if (rawPath.startsWith('file://')) {
    return [kclUriToWorkspacePath(rawPath)];
  }
  if (rawPath.startsWith('/')) {
    return [rawPath.slice(1)];
  }
  // ... else try every known document directory in turn
}
```

The "try every known directory" fallback exists because the WASM bridge
sometimes hands back a relative `import` path with no anchor — the client
has no way to know which document the bridge is asking on behalf of. Any
shared protocol should mandate **absolute `file://`-style URIs only**
(VS Code's contract), with relative-resolution pushed down into the
language server before the FS call leaves the worker.

### Finding 5: Monaco↔LSP document sync is also duplicated work

`apps/ui/app/lib/kcl-language/kcl-register-language.ts:618–659`
(`setupDocumentSync`) walks `monaco.editor.getModels()`, subscribes to
`onDidCreateModel` / `onWillDisposeModel` / `onDidChangeModelLanguage` and
forwards into `textDocument/didOpen` / `didChange` / `didClose`. This is
the same work `vscode-languageclient/browser`'s `BaseLanguageClient` does
for every VS Code Web LSP. Whoever implements the next LSP-speaking
language in Tau will copy these ~60 lines or recreate them from scratch.

A generic `bindMonacoModelsToLspConnection(monaco, languageId, connection)`
is a natural sibling of the FS bridge — same shape (one helper per
contribution call), same lifecycle semantics, same opportunity to fix
once and apply everywhere.

### Finding 6: The deps to do this properly are already in the workspace

`package.json` already pulls in:

- `vscode-languageserver-protocol@^3.17.5` — `RequestType`, all standard
  LSP requests, message types.
- `json-rpc-2.0@^1.7.1` — what `KclLspClient` already uses.

What's **not** in the workspace:

- `vscode-languageclient` — the heavyweight Node/Electron client. Not
  needed; we don't run inside a VS Code extension host.
- `monaco-languageclient` (`@codingame`) — would also bring
  `@codingame/monaco-vscode-api` chunks. Worth considering as an
  alternative (see [Trade-offs](#trade-offs)) but not required to ship the
  blueprint.
- `vscode-uri` — small, ~6 KB, useful for canonical URI handling. Easy add
  if we adopt the URI-only contract from Finding 4.

Net new dependency footprint to land R1–R3 below: 0 (or `vscode-uri` only).

### Finding 7: The runtime's `filePool` SAB is a drop-in zero-IPC fast path for every LSP

The same SAB-backed file content cache that the kernel runtime worker
attaches to (`packages/runtime/src/framework/kernel-worker.ts:540–566`)
can be attached by any other language worker without a single new
primitive. The relevant pieces — all already shipped:

| Component                   | Location                                                                                                            | Role                                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SharedPool`                | `packages/memory/src/shared-pool.ts:56–227`                                                                         | Lock-free `SharedArrayBuffer`-backed key→bytes cache. `store()` (writer-only), `resolve()`/`resolveCopy()` (readers, any thread). FNV-1a hash, LRU eviction, immutable-once-published entries (`FREE → WRITING → READY → STALE`).                                        |
| `filePoolBuffer` allocation | `apps/ui/app/machines/file-manager.machine.ts:158–175`                                                              | FM machine allocates **once** per project (default 50 MiB); inherited by nested FMs via `sharedFilePoolBuffer` so it isn't duplicated per route.                                                                                                                         |
| FM-worker writer            | `apps/ui/app/machines/file-manager.worker.ts:158–164` + `packages/filesystem/src/workspace-file-service.ts:113–144` | `setFilePool(new SharedPool(buffer))`. Every successful `readFile` writes the bytes into the pool and every `writeFile`/`rename`/`unlink` invalidates them (lines 298, 403–404, 430). Cache is **lazy by construction** — populated on first real read, never preloaded. |
| Main-thread reader          | `packages/fs-client/src/file-content-service.ts:666–690`                                                            | `filePool.resolveCopy(path)` before falling back to worker RPC. Already gates every `FileContentService.resolve()` call.                                                                                                                                                 |
| Cross-worker reader         | `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts:565–576`                                     | Inside `createBridgeProxy`'s `callMethod('readFile', …)`, hits `filePool.resolveCopy(path)` first and returns synchronously inside the resolved Promise. Falls back to `MessagePort` RPC on miss.                                                                        |
| Pool plumbing into a worker | `connect({ port, filePoolBuffer })` on `RuntimeClient` (`apps/ui/content/docs/runtime/api/client.mdx:189`+)         | The kernel worker's pattern. The buffer is passed through the transport into worker init; the worker constructs a `SharedPool(buffer)` reader and the bridge proxy short-circuits reads through it.                                                                      |

The implication: **a KCL or future Pyright/rust-analyzer worker is just
another consumer of this contract**. The shape `{ port: MessagePort,
filePoolBuffer?: SharedArrayBuffer }` is the canonical "language worker
handle" — the same one the kernel worker already accepts. No new SAB
allocation, no new ownership story, no new cache eviction logic. The FM
remains the single owner; every worker (kernel, KCL LSP, future LSPs) is
a reader.

This also resolves the "lazy is hard to enforce" risk that the prior
research doc flagged for JS/TS. The FM's `_filePool?.store()` only fires
inside `readFile()` — there is **no preload path**. The pool grows as the
LSP genuinely accesses files; an LSP working on a 10-file subgraph of a
1000-file workspace touches 10 entries, not 1000.

### Finding 8: There is no `Atomics.wait`-backed sync FS path today — but the missing pieces are well-scoped

`runtime-topology.md` lays out three SABs in production today:

1. **Cooperative-abort SAB** (transport-owned, 8 bytes, two `Int32` slots).
   Read via `Atomics.load` polled by the OC Proxy at every WASM call
   boundary; written via `Atomics.store`. **No `Atomics.wait`**.
2. **Geometry pool SAB** (transport-owned, configurable bytes,
   `SharedPool`). Async write-then-read; readers query bytes already
   published, no blocking primitive needed.
3. **File pool SAB** (FM-owned, default 50 MiB, `SharedPool`). Same
   contract as the geometry pool.

Audit finding: **no occurrence of `Atomics.wait` anywhere in
`packages/`** outside of legacy WASM helper output (`draco_decoder_gltf.js`
etc., which are vendored emscripten dumps, not Tau code). The
sync-from-async pattern that VS Code uses for `tsserver` does not exist
in Tau today.

What is missing for the (Tier 2) sync FS path is small and well-scoped:

| Piece                       | Notes                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync request slot SAB       | ~32 bytes per worker: `[state, requestId, length, errCode, ...payloadOffset]`. Mirrors the layout of the abort-signal SAB.                                                                        |
| Reserved sync content arena | A small bounded `SharedArrayBuffer` for a single in-flight payload (e.g. 4 MiB). Larger reads spill to the bridge port + `Atomics.notify`.                                                        |
| Worker-side sync stub       | `syncReadFile(path)` calls `Atomics.store(slot, REQUEST, n)`, `postMessage({ syncRead, requestId, path })`, then `Atomics.wait(slot, STATE, PENDING)` until the FM worker writes `READY`.         |
| FM-worker handler           | On `syncRead`, fetches via the existing `FileService.readFile`, writes bytes into the sync arena (or signals `TOO_LARGE`), `Atomics.store(slot, STATE, READY)`, `Atomics.notify(slot, STATE, 1)`. |

This is the same shape as `@vscode/sync-api-common`'s `ClientConnection`
(`repos/vscode/extensions/typescript-language-features/web/src/serverHost.ts:7`)
— roughly 150 LOC of new infrastructure. Crucially, it's **only required
for languages whose host is sync-only** (today: tsserver). KCL, OpenSCAD,
Pyright, rust-analyzer, ruff, and Markdown LS are all async-LSP and use
Tier 0+1 only.

### Finding 9: "LSPs drive FS access; never preload" is structurally easier with this stack than with the JS/TS workaround

The current JS/TS preloader (`MonacoModelService.syncAllInBackground`,
covered in detail by `monaco-typescript-intellisense-investigation.md`)
exists because the standalone `ts.worker` cannot pull files on demand —
it only sees what's been pushed in as Monaco models. This forces the
preloader to walk the tree at session start, which then collides with
the lazy `FileTreeService` snapshot (the smoking-gun bug Z1 in the prior
doc).

The proposed bridge inverts that: the LSP drives every read.
Concretely, with R1–R4 in place:

| Scenario                                       | Request flow                                                                                                                        | FS pressure                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| LSP needs a directory listing for autocomplete | `connection.sendRequest(fsReadDirectoryRequest, { uri })` → `treeService.listDirectory(path)`                                       | One `readdir` on the directory the user is actually completing in.              |
| LSP resolves an `import './lib/foo.kcl'`       | `connection.sendRequest(fsContentRequest, { uri })` → Tier 0 hit (if FM has cached it) or Tier 1 `bridge.readFile` (populates pool) | One read per imported file as the LSP encounters it.                            |
| LSP ranks imports across the workspace         | `connection.sendRequest(fsFindFilesRequest, { pattern })` → `treeService.searchFiles` (worker-side index)                           | Walks the worker-side `InMemoryFileTree`, no main-thread tree expansion needed. |
| User opens 10 KCL files                        | Each file's `textDocument/didOpen` ships content; **dependent files are pulled by the LSP, not preloaded**                          | Bounded by the LSP's actual reachability, not the workspace size.               |

The `FileTreeService.listDirectory` lazy-tree problem from the prior doc
**doesn't apply here** because the bridge's `fs/readDir` handler can
delegate directly to the worker-side `getDirectoryStat` (which has the
authoritative recursive index — `packages/fs-client/src/file-tree-service.ts:345`+),
bypassing the main-thread snapshot. The same holds for `fs/findFiles`
backed by `proxy.searchFiles`. So adopting this bridge for KCL
**doesn't inherit** the JS/TS preloader's known race.

## Recommendations

The recommendation set is reorganised around the three-tier read pipeline
identified in Findings 7–9. Tier 0/1 (R1–R6) lands first and unblocks
every async-LSP language; Tier 2 (R10) is sized but deferred until TS
needs it.

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort | Impact                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| R1  | Introduce `libs/lsp-fs/src/protocol.ts` with `fs/content`, `fs/stat`, `fs/readDir`, `fs/findFiles` LSP custom requests + shared `FileStat`/`FileType` types (verbatim VS Code shape, see [Trade-offs](#trade-offs)).                                                                                                                                                                                                        | P0       | Low    | Foundation for every future LSP.                                                                                      |
| R2  | Add `libs/lsp/src/language-fs-bridge.ts` (`@taucad/lsp/language-fs-bridge`) with `serveLanguageFileSystemRequests(connection, { fileManager, treeService, filePool? })`. Routes `fs/content` through Tier 0 (`filePool.resolveCopy`) → Tier 1 (`fileManager.readFile`). Routes `fs/readDir`/`fs/findFiles` through `treeService.listDirectory` / `proxy.searchFiles`. Single point of integration with `@taucad/fs-client`. | P0       | Low    | Every LSP picks up zero-IPC reads + future FS fixes for free.                                                         |
| R3  | Add `libs/lsp/src/monaco-lsp-binding.ts` (`@taucad/lsp/monaco-lsp-binding`) with `bindMonacoModelsToLspConnection(monaco, languageId, connection)` mirroring VS Code's `BaseLanguageClient` document sync.                                                                                                                                                                                                                  | P0       | Low    | Removes ~60 LOC duplication per LSP contribution.                                                                     |
| R4  | Define a canonical **`LanguageWorkerHandle`** = `{ port: MessagePort, filePoolBuffer?: SharedArrayBuffer }` and route it into every LSP worker on init — exact mirror of the runtime kernel worker's `connect({ port, filePoolBuffer })` pattern. The contribution's `activate()` reads `context.fileManagerRef` for the buffer.                                                                                            | P0       | Low    | Makes "language worker = filePool reader" a contract, not a per-language design decision.                             |
| R5  | Extend `ActivationContext` (`apps/ui/app/lib/monaco-language-registry.ts:35–41`) with `treeService: FileTreeService` and `filePoolBuffer?: SharedArrayBuffer` fields so contributions don't have to re-resolve them through `fileManagerRef.getSnapshot().context.…`.                                                                                                                                                       | P0       | Low    | Discoverability + symmetry with kernel worker.                                                                        |
| R6  | Migrate KCL onto R1–R5. Delete the postMessage FS envelope types (`fileReadRequest` etc.) and the bespoke `setupDocumentSync`. Plumb `filePoolBuffer` into the KCL worker so its `fs/content` handler resolves Tier 0 hits without crossing the bridge.                                                                                                                                                                     | P1       | Med    | Net deletion (~150 LOC) + zero-IPC reads for warm imports. Validates the protocol end-to-end against a real consumer. |
| R7  | Wire OpenSCAD `include`/`use` resolution against R2's helper directly from a JS-side provider (no worker needed — OpenSCAD has no LSP). Same helper, no LSP connection — pass an in-process JSON-RPC adapter.                                                                                                                                                                                                               | P2       | Low    | Unlocks go-to-definition on `.scad` includes; demonstrates the bridge serving non-worker consumers too.               |
| R8  | Standardise on `vscode-uri` for URI handling across all language contributions; ban relative paths at the protocol boundary (Finding 4).                                                                                                                                                                                                                                                                                    | P2       | Low    | Eliminates the "try every known directory" fallback in `kcl-lsp-client.ts:409–421`.                                   |
| R9  | Document the bridge in `docs/policy/language-contribution-policy.md` once R1–R6 land and the contract has stabilised.                                                                                                                                                                                                                                                                                                       | P2       | Low    | Promotes blueprint to binding contract.                                                                               |
| R10 | **Tier 2 sync FS slot** (deferred). Build a small SAB-backed sync request slot (state/requestId/length/errCode + bounded sync arena + `Atomics.wait`/`notify`) following the layout sketched in Finding 8. Expose it as a separate `@taucad/lsp-fs/sync` entrypoint so async-LSP consumers don't pay for it.                                                                                                                | P3       | Med    | Unblocks the JS/TS `serverHost` migration (R11 from the prior research doc) without re-inventing FS surface.          |
| R11 | Track JS/TS `serverHost` adoption as a separate workstream; when it lands, point its FS reads at R10's sync slot so the only difference between TS and every other language is the synchrony of the transport.                                                                                                                                                                                                              | P3       | High   | Eventually unifies all 5+ languages on one FS surface.                                                                |

## Trade-offs

### Roll-our-own (R1–R3) vs `monaco-languageclient`

| Dimension                                     | Roll our own (~250 LOC)                                              | `monaco-languageclient`                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle cost                                   | ~0 (uses existing `vscode-languageserver-protocol` + `json-rpc-2.0`) | Pulls in `@codingame/monaco-vscode-api` chunks (flagged in the SSR bundle audit).                                                                                                           |
| Document sync                                 | Manually coded but small (~60 LOC)                                   | Free, battle-tested.                                                                                                                                                                        |
| Provider registration (hover/completion/etc.) | Manual, but Tau already has these per-contribution.                  | Free, shared across all LSPs.                                                                                                                                                               |
| Standard LSP feature surface kept up to date  | Manual                                                               | Tracks `vscode-languageclient` upstream.                                                                                                                                                    |
| FS bridge                                     | We define `tau/fs/*` ourselves (or mirror VS Code's `fs/*`).         | `monaco-languageclient` does not give you the FS bridge — VS Code's `fs/*` lives in the language-features extensions, not the client library. We'd still build R1+R2 on top of either path. |
| Migration cost                                | Refactor KCL once.                                                   | Refactor KCL once + adopt the new bundle.                                                                                                                                                   |

**Verdict**: roll our own for the MVP (R1–R4). Re-evaluate when a third
LSP island is on the horizon and the bundle-vs-LOC trade flips.

### `tau/fs/*` (custom-namespaced) vs `fs/*` (verbatim VS Code)

| Dimension                                | `tau/fs/*`                                          | `fs/*` (VS Code-compatible)                                                                                |
| ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Forward compatibility with upstream LSPs | Need a shim layer to translate.                     | Drop-in compatibility — any language server originally written for VS Code Web works without modification. |
| Risk of accidental name clash            | Low (LSP convention reserves the namespace prefix). | Slightly higher in theory; in practice no LSP defines its own `fs/*`.                                      |
| Mental cost for contributors             | "Tau-specific custom requests".                     | "These are exactly the VS Code Web requests."                                                              |

**Verdict**: prefer `fs/*` (verbatim VS Code) so we can adopt upstream
language servers without translation. The `tau/` prefix only buys us a
namespace we don't actually need.

### URI-only protocol vs. mixed URI/path

| Dimension                              | URI-only                | Mixed                                                  |
| -------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Server-side complexity                 | One canonical resolver. | Each server reinvents path-vs-URI heuristics.          |
| Compatibility with VS Code-origin LSPs | Native.                 | Needs adapter.                                         |
| Required client-side fallback          | None.                   | "Try every known directory" (the current KCL pattern). |

**Verdict**: URI-only at the protocol boundary; relative resolution lives
inside each language server before it sends the request.

### Eager preload (today's JS/TS) vs. LSP-driven lazy reads (target)

| Dimension                                                         | Eager preload (`syncAllInBackground`)                                                                                                          | LSP-driven lazy via `fs/*` + filePool                                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Files touched at session start                                    | Walks `getTreeSnapshot()` — bounded by what the user has expanded, but tries to load everything in scope. Smoking-gun bug Z1 in the prior doc. | Zero. The first `fs/content` fires when the LSP has parsed an `import` statement that needs resolution.                                |
| Memory cost on a 1000-file project where the LSP touches 10 files | All 1000 files admitted as Monaco models (or attempted).                                                                                       | 10 entries in the `SharedPool` (capped at 50 MiB total, LRU-evicted).                                                                  |
| Behaviour as the workspace grows during the session               | New files are missed unless the user expands them in the tree.                                                                                 | LSP requests them on demand the first time it imports them.                                                                            |
| Multi-tab scenarios                                               | Each tab's preloader walks again.                                                                                                              | The FM-owned pool is shared across tabs (cross-tab coordinator + `SharedPool`). Hot reads in one tab warm the pool for every consumer. |
| Cold-read latency                                                 | Synchronous from a model that's already in memory; n/a for files never preloaded (TS2307).                                                     | First read: ~1ms via bridge. Subsequent reads: ~10ns via `SharedPool.resolveCopy`.                                                     |

**Verdict**: lazy + tiered reads beat preload on every axis except the
JS/TS-specific synchronous-host requirement, which is the exact axis
covered by R10 + R11. There is no scenario where the new design loads
**more** than necessary.

### Async LSP (Tier 0+1) vs. sync host (Tier 2)

| Dimension              | Async LSP (`fs/*` over JSON-RPC)                                                                       | Sync host (`Atomics.wait` slot)                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Languages that work    | KCL, OpenSCAD, JSON, HTML, CSS, Markdown, Pyright, Ruff, rust-analyzer, eslint, vue-language-server, … | Just tsserver (and any future language whose host genuinely cannot suspend).     |
| Implementation cost    | R1–R4: ~250 LOC + 0 new deps.                                                                          | R10: ~150 LOC + a sync arena SAB.                                                |
| Per-call latency       | Tier 0 hit: ~10ns. Tier 0 miss → Tier 1: ~1ms.                                                         | Tier 0 hit: ~10ns. Tier 0 miss → Tier 2: ~10–100µs (`Atomics.wait` round-trip).  |
| Worker thread blocking | Never.                                                                                                 | Required (that's the whole point — `serverHost.readFile` returns synchronously). |
| Browser support        | Universal.                                                                                             | Cross-origin isolation only (already required for runtime kernels).              |

**Verdict**: ship Tier 0+1 first; build Tier 2 only when TS adoption is
on the critical path. The two tiers compose — a TS host reading a file
that the FM has already cached hits Tier 0 directly without waking the
sync slot.

## Code Examples

### R1 — protocol module

```typescript
// libs/lsp-fs/src/protocol.ts
import { RequestType } from 'vscode-languageserver-protocol';

export const fileType = {
  unknown: 0,
  file: 1,
  directory: 2,
  symbolicLink: 64,
} as const;

export type FileType = (typeof fileType)[keyof typeof fileType];

export type FileStat = {
  type: FileType;
  /** Milliseconds. */
  ctime: number;
  /** Milliseconds. */
  mtime: number;
  /** Bytes. */
  size: number;
};

export type FsContentWire = { dataBase64: string };

export const fsContentRequest = new RequestType<{ uri: string }, FsContentWire, void>('fs/content');
export const fsStatRequest = new RequestType<{ uri: string }, FileStat, void>('fs/stat');
export const fsReadDirectoryRequest = new RequestType<{ uri: string }, Array<[string, FileType]>, void>('fs/readDir');
export const fsFindFilesRequest = new RequestType<{ pattern: string; max?: number }, string[], void>('fs/findFiles');
```

### R2 — SAB-aware client adapter

The handler **on the LSP-worker side** is the SharedPool reader: when an
LSP worker is wired with `filePoolBuffer`, its `fs/content` handler
short-circuits hot reads through `SharedPool.resolveCopy` before falling
back to a bridge RPC. Pseudocode (running inside the LSP worker):

```typescript
// libs/lsp-fs/src/client.ts -- runs in the LSP worker
import { SharedPool } from '@taucad/memory';
import { fsContentRequest, fsReadDirectoryRequest, fsStatRequest } from '@taucad/lsp-fs/protocol';

export function attachLanguageFsClient(
  connection: Connection, // worker-side LSP connection
  options: { filePoolBuffer?: SharedArrayBuffer },
) {
  const pool = options.filePoolBuffer ? new SharedPool(options.filePoolBuffer) : undefined;

  return {
    async readFile(uri: string): Promise<Uint8Array<ArrayBuffer>> {
      // Tier 0: zero-IPC SAB read
      const cached = pool?.resolveCopy(uri);
      if (cached) return cached;
      // Tier 1: round-trip to the FM worker (which populates the pool as a side effect)
      return connection.sendRequest(fsContentRequest, { uri });
    },
    stat: (uri: string) => connection.sendRequest(fsStatRequest, { uri }),
    readDirectory: (uri: string) => connection.sendRequest(fsReadDirectoryRequest, { uri }),
  };
}
```

The handler **on the main thread** answers Tier 1 misses by delegating
into `FileTreeService` / `FileSystemClient`:

```typescript
// libs/lsp/src/language-fs-bridge.ts -- main thread / extension host side
import type { JSONRPCServerAndClient } from 'json-rpc-2.0';
import type { FileSystemClient, FileTreeService } from '@taucad/fs-client';

import { fileType, fsContentRequest, fsReadDirectoryRequest, fsStatRequest } from '@taucad/lsp-fs/protocol';

type Disposable = { dispose(): void };

export function serveLanguageFileSystemRequests(
  connection: JSONRPCServerAndClient,
  context: {
    fileManager: FileSystemClient; // populates the FM's filePool on read
    treeService: FileTreeService;
  },
): Disposable {
  connection.addMethod(fsContentRequest.method, async ({ uri }) => {
    return context.fileManager.readFile(uriToWorkspacePath(uri)); // FM writes through to filePool
  });
  connection.addMethod(fsStatRequest.method, async (uri: string) => {
    const stat = await context.fileManager.stat(uriToWorkspacePath(uri));
    return {
      type: stat.isDirectory ? fileType.directory : fileType.file,
      ctime: stat.ctimeMs,
      mtime: stat.mtimeMs,
      size: stat.size,
    };
  });
  connection.addMethod(fsReadDirectoryRequest.method, async (uri: string) => {
    const entries = await context.treeService.listDirectory(uriToWorkspacePath(uri));
    return entries.map((entry) => [entry.name, entry.isDirectory ? fileType.directory : fileType.file] as const);
  });
  return { dispose() {} };
}
```

The fact that the worker-side `attachLanguageFsClient` is a Tier 0+1
adapter while the main-thread `serveLanguageFileSystemRequests` is a
plain LSP request handler is **the exact same shape** as the runtime's
existing `createBridgeProxy({ filePool })` (Finding 7) — just generalised
across LSP servers.

### R3 — Monaco↔LSP binding (sketch)

`bindMonacoModelsToLspConnection(monaco, languageId, connection)` walks
`monaco.editor.getModels()` for the language id, fires
`textDocument/didOpen` for each, then subscribes to:

- `monaco.editor.onDidCreateModel` → `didOpen` (filtered by language id)
- `model.onDidChangeContent` → `didChange` (versioned, full-text payload)
- `monaco.editor.onWillDisposeModel` → `didClose`
- `monaco.editor.onDidChangeModelLanguage` → close/open as the id changes

Returns a single `IDisposable` that tears down every subscription.
Direct generalisation of the existing 60-line `setupDocumentSync` in
`apps/ui/app/lib/kcl-language/kcl-register-language.ts:618–659` — same
semantics, every LSP-speaking contribution shares one helper.

### Adoption per contribution (target shape)

```typescript
// apps/ui/app/lib/kcl-language/kcl-register-language.ts (after R6)
activate(context: ActivationContext): ActivationResult {
  const worker = new Worker(new URL('./lsp/kcl-lsp-worker.ts', import.meta.url), { type: 'module' });

  // Identical shape to RuntimeClient.connect({ port, filePoolBuffer }):
  // hand the FM-owned SAB to the LSP worker so its fs/content handler
  // resolves Tier 0 (SharedPool) hits without crossing the bridge.
  const handle: LanguageWorkerHandle = {
    port: createMessagePort(worker),
    filePoolBuffer: context.filePoolBuffer,
  };
  worker.postMessage({ type: 'init', handle }, [handle.port]);

  const connection = createJsonRpcConnection(worker);

  const disposables: Monaco.IDisposable[] = [
    serveLanguageFileSystemRequests(connection, {
      fileManager: context.fileManager,
      treeService: context.treeService,
    }),
    bindMonacoModelsToLspConnection(context.monaco, codeLanguages.kcl, connection),
    registerLspProvidersOnMonaco(context.monaco, codeLanguages.kcl, connection),
  ];

  return { disposables, navigationHandler: { canHandle: (path) => path.endsWith('.kcl') } };
}
```

Four lines in `activate()` per LSP-speaking contribution (including the
worker handle plumb). Adding the next language (Pyright, rust-analyzer,
…) is the same four lines, with the LSP worker constructing
`attachLanguageFsClient(connection, { filePoolBuffer })` on its side.

## Diagrams

### Target: shared LSP-extension bridge with three-tier reads

```text
┌─────────────────────────────────────────────────┐
│ FM Worker  (SOLE FS WRITER, content-pool author) │
│  WorkspaceFileService                            │
│   ├─ readFile() ── writes through to filePool ──┐│
│   └─ writeFile()/rename()/unlink() invalidate ──┤│
│                                                 ▼│
│  filePool  (SharedPool over SharedArrayBuffer)  │ <── single source of truth
└────────────┬────────────────────────────────────┘
             │ buffer attached at worker init
             │ (handle = { port, filePoolBuffer })
             │
   ┌─────────┴──────────────┬──────────────────────┐
   ▼                         ▼                      ▼
┌────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Main thread     │   │ Kernel runtime      │   │ KCL / future LSP    │
│ FileContentSvc  │   │ Worker              │   │ Worker              │
│                 │   │  bridgeProxy        │   │  attachLanguageFs   │
│  Tier 0 ───────│   │   ├─ Tier 0 hit ───│   │   ├─ Tier 0 hit ───│
│   filePool      │   │   │   filePool    │   │   │   filePool      │
│   .resolveCopy  │   │   │   .resolveCopy│   │   │   .resolveCopy  │
│  Tier 1 ───────│   │   └─ Tier 1 miss  │   │   └─ Tier 1 miss   │
│   proxy.readFile│   │      bridge.read  │   │      fs/content    │
│   over bridge   │   │      over bridge  │   │      LSP request   │
└────────────────┘   └─────────────────────┘   └─────────────────────┘

Tier 0:  ~10ns,    SAB-backed lock-free SharedPool.resolveCopy
Tier 1:  ~1ms,     async MessagePort RPC to FM worker
Tier 2:  ~10–100µs, Atomics.wait sync slot (R10, deferred — only TS needs it)
```

### Comparison: today vs. target

```text
TODAY                                   TARGET (R1–R6)
──────                                  ──────────────
JS/TS:    preload all .ts as models     JS/TS:    unchanged (waits on R10/R11)
KCL:      custom postMessage envelopes  KCL:      fs/* LSP + filePool Tier 0/1
OpenSCAD: no FS                         OpenSCAD: in-process fs/* (no worker)
SysML/etc: no FS                        Future:   fs/* LSP + filePool Tier 0/1

TS-future (R10+R11)
───────────────────
ts.worker custom build with serverHost
  ├─ Tier 0 hit: filePool.resolveCopy (sync — already on the SAB)
  └─ Tier 0 miss: Atomics.wait sync slot → FM serves bytes into sync arena
```

## References

- Prior research: `docs/research/monaco-typescript-intellisense-investigation.md`
  — covers the JS/TS preloader bug and the long-term `serverHost` path
  (R11) that this blueprint's R10/R11 connect into Tier 2.
- Architecture doc: `docs/architecture/runtime-topology.md` — defines
  the `filePoolBuffer` contract, FM-owned-pool / consumers-attach
  ownership, and the SAB lifecycle that this blueprint reuses verbatim
  for LSP workers.
- VS Code reference: `repos/vscode/extensions/html-language-features/{client,server}/src/requests.ts`
  — shared `fs/stat` + `fs/readDir` LSP custom requests.
- VS Code reference: `repos/vscode/extensions/css-language-features/client/src/requests.ts`
  — adds `fs/content` to the same pattern.
- VS Code reference: `repos/vscode/extensions/typescript-language-features/web/src/serverHost.ts`
  — the `@vscode/sync-api-client` exception that justifies treating
  tsserver as architecturally distinct (and informs R10's slot layout).
- Tau code reference: `packages/runtime/src/transport/_internal/runtime-filesystem-bridge.ts:565–576`
  — the bridge proxy's `filePool.resolveCopy(path)` short-circuit, the
  exact pattern this blueprint's `attachLanguageFsClient` mirrors.
- LSP spec: <https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/>
  — `RequestType` and custom-request conventions used by `fs/*`.

## Appendix

### A1. Verbatim VS Code request module (server side, HTML)

`repos/vscode/extensions/html-language-features/server/src/requests.ts`
(reference for byte-for-byte protocol parity if we adopt `fs/*`):

```typescript
export namespace FsStatRequest {
  export const type: RequestType<string, FileStat, any> = new RequestType('fs/stat');
}
export namespace FsReadDirRequest {
  export const type: RequestType<string, [string, FileType][], any> = new RequestType('fs/readDir');
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}
export interface FileStat {
  type: FileType;
  ctime: number;
  mtime: number;
  size: number;
}
export interface FileSystemProvider {
  stat(uri: string): Promise<FileStat>;
  readDirectory(uri: string): Promise<[string, FileType][]>;
}
```

### A2. KCL postMessage envelope inventory (today)

| Envelope                                   | Direction                     | Purpose              | Replacement                                            |
| ------------------------------------------ | ----------------------------- | -------------------- | ------------------------------------------------------ |
| `fileReadRequest` / `fileReadResponse`     | worker→client / client→worker | Read file bytes      | `fs/content` LSP request (R1)                          |
| `fileExistsRequest` / `fileExistsResponse` | worker→client / client→worker | Check file existence | `fs/stat` LSP request (returns `FileNotFound` instead) |
| `fileListRequest` / `fileListResponse`     | worker→client / client→worker | List directory       | `fs/readDir` LSP request                               |
| `init`                                     | client→worker                 | Boot WASM            | Stays — orthogonal to FS                               |
| `call`                                     | client→worker                 | Generic call         | Stays — orthogonal to FS                               |

### A3. Files to add / change

| File                                                    | Change                                                                                                                              | Lines (approx)   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `libs/lsp-fs/src/protocol.ts`                           | New — `RequestType`s + `FileStat`/`FileType` + `LanguageWorkerHandle`                                                               | ~50              |
| `libs/lsp-fs/src/client.ts`                             | New — `attachLanguageFsClient` (worker-side, SharedPool reader + JSON-RPC bridge fallback)                                          | ~160             |
| `libs/lsp-fs/package.json`                              | New package shell (re-exports `@taucad/memory` `SharedPool`)                                                                        | ~20              |
| `libs/lsp/src/language-fs-bridge.ts`                    | New — `serveLanguageFileSystemRequests` (main-thread side, delegates to `FileSystemClient`/`FileTreeService`)                       | ~80              |
| `libs/lsp/src/monaco-lsp-binding.ts`                    | New — `bindMonacoModelsToLspConnection`                                                                                             | ~80              |
| `apps/ui/app/lib/monaco-language-registry.ts`           | Add `treeService`, `filePoolBuffer` to `ActivationContext` (R5)                                                                     | ~10              |
| `apps/ui/app/lib/kcl-language/lsp/kcl-lsp-types.ts`     | Delete `fileReadRequest`/`fileExistsRequest`/`fileListRequest` envelopes                                                            | −50              |
| `apps/ui/app/lib/kcl-language/lsp/kcl-lsp-client.ts`    | Delete `handleFileReadRequest`/`handleFileExistsRequest`/`handleFileListRequest` and helpers; replace with `attachLanguageFsClient` | −150 / +20       |
| `apps/ui/app/lib/kcl-language/kcl-register-language.ts` | Replace `setupDocumentSync` with `bindMonacoModelsToLspConnection`; plumb `filePoolBuffer` to KCL worker init                       | −60 / +20        |
| KCL WASM bridge (`repos/.../kcl-wasm-lib`)              | Replace postMessage envelopes with `fs/content`/`fs/stat`/`fs/readDir` LSP requests                                                 | repo-side change |

Net diff for R1–R6: **~+330 / −260 LOC** in `apps/ui` plus a new ~120-LOC
`libs/lsp-fs` package. Slightly net-positive vs the original
estimate because R2 grows to handle the SAB Tier 0 path and R4/R5 add
the `LanguageWorkerHandle`/context plumbing — but this is the
infrastructure that makes the design actually faster than the JS/TS
preloader, not just architecturally cleaner.

R10 (Tier 2 sync slot) adds another ~150 LOC and a separate
`@taucad/lsp-fs/sync` entrypoint. Deferred until TS adoption.

### A4. Existing SAB primitives reused (zero new infra)

| Primitive                          | Location                                                    | Reuse                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SharedPool`                       | `packages/memory/src/shared-pool.ts:56–227`                 | Tier 0 reader inside every LSP worker.                                                                                                   |
| `SharedMemoryArena`                | `packages/memory/src/shared-memory-arena.ts`                | Underlying arena allocator with `FREE → WRITING → READY → STALE` state machine — already battle-tested across kernel + FM + main thread. |
| `WorkspaceFileService.setFilePool` | `packages/filesystem/src/workspace-file-service.ts:113–144` | The single writer of the pool. Every LSP transparently rides on it.                                                                      |
| `filePoolBuffer` allocation        | `apps/ui/app/machines/file-manager.machine.ts:158–175`      | Already 50 MiB, LRU-evicted, inherited by nested FMs. No new allocation.                                                                 |
| Cross-tab coordination             | `packages/filesystem/src/cross-tab-coordinator.ts`          | Pool stays consistent across tabs.                                                                                                       |

All SAB lifecycle, eviction, invalidation, and cross-tab semantics are
**already shipping in production** for the runtime kernel worker. The
LSP integration adds zero new shared-memory contracts.
