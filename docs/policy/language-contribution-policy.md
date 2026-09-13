---
title: 'Language Contribution Policy'
description: 'Norms for Monaco language features that read the workspace filesystem (URI-only wire, shared pool, LSP sync).'
status: active
created: '2026-05-07'
updated: '2026-05-09'
related:
  - docs/research/language-fs-bridge-implementation.md
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/policy/filesystem-policy.md
---

# Language Contribution Policy

Internal reference for Monaco language contributions that resolve imports or library files from the user workspace (KCL LSP, OpenSCAD `use`/`include`, future kernels).

## Rationale

Language servers and providers must not invent ad-hoc main-thread RPC envelopes or path guessing. A single `fs/*` JSON-RPC contract and a shared file-pool read path keep behavior consistent, testable, and safe across workers and in-process hosts.

## Rules

### 1. Protocol ownership

Implement workspace reads with `@taucad/lsp-fs` (`fs/content`, `fs/stat`, `fs/readDir`, `fs/findFiles`). Do not add parallel request-type enums or duplicate base64 wire encodings in app code.

**Why**: One schema for tooling, middleware, and tests.

### 2. URI-only on the wire

All `fs/*` requests use Monaco-style `file://` URIs (`params.uri`). Resolve to workspace-relative keys only inside `serveLanguageFileSystemRequests` (or equivalent bridge), via `monacoFileUriToWorkspaceRelative` and `WorkspacePathResolver`. Do not pass ambiguous raw paths or multi-candidate fallbacks across the bridge.

**Why**: Eliminates path-resolution drift between worker WASM, main thread, and the file manager.

### 3. Tiered reads

Consumers use `attachLanguageFsClient`: Tier 0 `SharedPool.resolveCopy` when `filePoolBuffer` is present; Tier 1 `fs/*` JSON-RPC when the pool misses. Do not add ad-hoc “sync” blocking reads (Tier 2) in contributions until explicitly specified in research/policy.

**Why**: Keeps hot paths fast and IPC bounded.

### 4. Main-thread bridge

Register `fs/*` handlers with `serveLanguageFileSystemRequests` on a `JSONRPCServer` that is fed requests from workers or in-process clients. Delegate to `FileManagerApi.readFile`, `FileTreeService`, and `FileSystemClient.searchFiles` only—never to ad-hoc fetch or guessing.

**Why**: FM remains the sole writer to the pool and authoritative for tree state.

### 5. Monaco document sync

Wire `textDocument/didOpen` / `didChange` / `didClose` through `bindMonacoModelsToLspConnection` (or the same lifecycle semantics). Do not duplicate model listeners per feature in ways that can double-notify the server.

**Why**: One consistent sync contract for every LSP-backed language.

### 6. Worker init shape

Pass `filePoolBuffer` and workspace root into workers that use `attachLanguageFsClient`, matching `LanguageWorkerHandle` / `KclLspWorkerOptions`. Do not rely on implicit globals for cwd or pool attachment.

**Why**: Makes initialization explicit and parallel to `RuntimeClient.connect`.

### 7. URI → model materialisation

Navigation providers (definitions, links, etc.) must return `Location` values with a target `uri` and must **not** call `monaco.editor.createModel` to force-open imported targets. The `MonacoWorkspaceFs` registry materialises models through `openTextDocument`, `openTextProvider`, and `peekModel`, after workspace / ATA resolution.

Workspace-relative `file://` reads may fall through to Monaco `addExtraLib` / ATA virtual typings via `WorkspaceFileSystemProvider` extra-lib lookup so Cmd+Click on `file:///node_modules/...` stays consistent with the TS worker.

Enforced by `tau-lint/no-monaco-create-model` (see `.oxlintrc.json`).

## Anti-Patterns

- Custom `postMessage` envelopes for file bytes alongside LSP traffic when `fs/*` JSON-RPC suffices.
- Opening every imported file eagerly in Monaco solely to satisfy the language service; prefer lazy reads through `fs/content`.
- String-slicing `file://` paths instead of `vscode-uri` at boundaries that affect resolution.

## Summary Checklist

- [ ] `fs/*` methods and types imported from `@taucad/lsp-fs/protocol` (or `server-side` where appropriate).
- [ ] URIs at the bridge; workspace-relative keys only inside the bridge.
- [ ] Pool + JSON-RPC tiers used for reads; no duplicate encodings.
- [ ] Model lifecycle bound via `bindMonacoModelsToLspConnection` for LSP languages.
- [ ] No direct `monaco.editor.createModel` calls in contribution code (use `MonacoWorkspaceFs`; rule: `tau-lint/no-monaco-create-model`).

## References

- Implementation contract: `docs/research/language-fs-bridge-implementation.md`
- Parent blueprint: `docs/research/scalable-language-contribution-fs-architecture.md`
- Filesystem rules: `docs/policy/filesystem-policy.md`
