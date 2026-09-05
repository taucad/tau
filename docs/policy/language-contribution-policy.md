---
title: 'Language Contribution Policy'
description: 'Monaco and Shiki language registration, shared workspace filesystem tiers, and TypeScript worker ownership'
status: active
created: '2026-05-07'
updated: '2026-09-05'
related:
  - docs/research/language-fs-bridge-implementation.md
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
---

# Language Contribution Policy

Language contributions share one workspace filesystem contract and activate only when their language is needed. Monaco, Shiki, LSP workers, and the custom TypeScript worker may expose different capabilities, but they must agree on language identity, URI semantics, and declaration ownership.

## Rules

### 1. Use `@taucad/lsp-fs` for language workspace access

The shared protocol owns `fs/content`, `fs/stat`, `fs/readDir`, and `fs/findFiles`, plus its pool and synchronous channel. Do not add a contribution-specific request enum, base64 encoding, or filesystem bridge.

### 2. Use `file://` URIs across the asynchronous wire

Tier 1 JSON-RPC requests carry Monaco-style `file://` URIs. Convert them to workspace-relative paths only in the main-thread bridge through `monacoFileUriToWorkspaceRelative` and `WorkspacePathResolver`.

Do not send ambiguous raw paths or probe multiple guessed workspace keys.

### 3. Use the defined read tiers

- Tier 0 reads a copy from the shared file pool when available.
- Tier 1 uses the `fs/*` JSON-RPC bridge when Tier 0 misses.
- Tier 2 uses the `@taucad/lsp-fs/sync` SharedArrayBuffer request channel for synchronous TypeScript language-service probes.

Tier 2 is TypeScript-worker infrastructure. Other language contributions must not add blocking reads without an explicit architecture change and cross-origin-isolation support.

### 4. Keep the file manager authoritative

`serveLanguageFileSystemRequests` and `LanguageFsBridge` delegate to the current `FileManagerApi`, `FileTreeService`, and filesystem search owner. They must not fetch workspace files independently or maintain a second tree.

Filesystem authority events update the pool and worker view. Polling may detect missed change signals but must remain a bounded fallback.

### 5. Keep the TypeScript worker entry explicit

`apps/libs/lsp/src/monaco-ts-worker/monaco-ts-worker.entry.ts` owns Monaco's worker boot sequence. It must bind the sync filesystem before initializing `TauSyncTsWorker`, and it must avoid the upstream double-initialize race.

Use the exported Monaco worker surface and module-worker entry. Do not configure `customWorkerPath`, `importScripts`, or other classic-worker loading paths for this worker.

### 6. Preserve TypeScript host fallback order

`TauSyncTsWorker` checks Monaco mirror models and static/extra libraries before Tier 2. Closed workspace files may then use the synchronous client. Preserve stable script versions and the synthetic `node_modules` and `@types` directory behavior required by module resolution.

Mount generated dependency declarations at their canonical `/node_modules` paths. Do not copy declarations into each workspace or make optional `repos/` checkouts a runtime requirement. When a generator projects a canonical virtual-module map into a directory, remove the prior projection before writing the current map so deleted modules cannot survive as stale declarations.

### 7. Activate contributions on demand

Register language loaders through Monaco's `onLanguage` or the existing extension-driven contribution registry. Do not import every grammar, WASM server, declaration set, or worker during editor startup.

Dispose registrations and workers when their owning editor or project scope ends.

### 8. Keep editor and documentation grammars aligned

Precompile shared TextMate grammars in `libs/grammars`. Monaco contributions and the docs Shiki highlighter must use the same canonical language ID, extensions, aliases, and upstream grammar revision.

Do not fetch grammars at runtime. Follow the `add-monaco-language` skill for a new language.

### 9. Fail visibly without breaking basic editing

If an optional LSP or materializing provider cannot start, report a diagnostic and keep syntax highlighting and ordinary text editing available. Do not swallow initialization failures or silently run heavy worker code on the main thread.

### 10. Test each boundary

Cover URI normalization, Tier 0 and Tier 1 fallback, Tier 2 closed-file reads, version lookup, synthetic dependency directories, worker boot ordering, lazy activation, and disposal. Use the smallest real worker integration needed to prove the browser boundary.

## Ownership

- Shared protocol and clients: `apps/libs/lsp-fs/src`
- Tier 2 client/server: `apps/libs/lsp-fs/src/sync`
- Main-thread bridge: `apps/libs/lsp/src/language-fs-bridge.ts`
- TypeScript worker: `apps/libs/lsp/src/monaco-ts-worker`
- UI language contributions: `apps/ui/app/lib/*-language`
- TypeScript materializing providers: `apps/ui/app/lib/monaco-typescript-extras`
- Shared grammars: `libs/grammars`
