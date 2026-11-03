---
title: 'Language Contribution Policy'
description: 'CodeMirror and Lezer language support, code-pane admission, shared filesystem tiers, checked edits and TypeScript worker ownership'
status: active
created: '2026-05-07'
updated: '2026-10-31'
related:
  - docs/research/language-fs-bridge-implementation.md
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
---

# Language Contribution Policy

Language contributions share one workspace filesystem contract and activate only when their language is needed. CodeMirror, the Lezer grammar registry, LSP workers, and the custom TypeScript worker may expose different capabilities, but they must agree on language identity, URI semantics, and declaration ownership.

## Rationale

Editor loading must follow actual source-pane use, while document persistence and language services retain independent lifetimes. Shared filesystem and grammar owners keep split views, closed-file edits and documentation consistent.

## Rules

### 1. Use `@taucad/lsp-fs` for language workspace access

The shared protocol owns `fs/content`, `fs/stat`, `fs/readDir`, and `fs/findFiles`, plus its pool and synchronous channel. Do not add a contribution-specific request enum, base64 encoding, or filesystem bridge.

### 2. Use `file://` URIs across the asynchronous wire

Tier 1 JSON-RPC requests carry canonical `file://` URIs. Convert them to workspace-relative paths only in the main-thread bridge through `languageFileUriToWorkspaceRelative` and `WorkspacePathResolver`.

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

`apps/libs/lsp/src/typescript-worker/worker.entry.ts` owns module-worker boot and the actual TypeScript language service. Bind the rooted synchronous filesystem before admitting requests that need closed-file reads. Use the worker protocol's versioned UTF-16 document changes; never run the TypeScript service on the main thread as a silent fallback.

Do not configure `customWorkerPath`, `importScripts` or other classic-worker paths.

### 6. Preserve TypeScript host fallback order

The TypeScript host checks versioned open documents and standard/static/extra libraries before Tier 2. Closed workspace files may then use the synchronous client. Preserve stable script versions and the synthetic `node_modules` and `@types` directory behavior required by module resolution.

Mount generated dependency declarations at their canonical `/node_modules` paths. Do not copy declarations into each workspace or make optional `repos/` checkouts a runtime requirement. When a generator projects a canonical virtual-module map into a directory, remove the prior projection before writing the current map so deleted modules cannot survive as stale declarations.

### 7. Activate contributions on demand

Import CodeMirror only when a real source pane renders. Import the matching syntax family through `editor-syntax.ts`, and acquire its semantic service separately through `editor-language-runtime.ts`. Metadata modules must not import runtime editor code.

Before admission, request no editor-only JavaScript, CSS, grammar, worker or declarations. This applies to link hover, route prefetch, service-worker precache, viewer-only and shared-model surfaces, Markdown preview and hidden mobile tabs. Do not activate unrelated language families or preload every kernel's declarations. `apps/ui-e2e/src/language-service-laziness.spec.ts` checks this against a production build. A new language service adds its adapter chunk, worker and staged assets to that spec's `languageResources`.

Share backend services per project session and mirror each document once. Abort pending acquisition on pane closure; dispose per-view extensions and release the backend when its last view closes. Cached code modules do not justify keeping workers alive.

### 8. Highlight every code surface through one grammar registry

Every code surface in the app (the editor, hover, signature and completion documentation, chat code blocks, the code and diff viewers, and the conflict editor) highlights through the Lezer registry in `libs/grammars`: `loadLanguage` and `peekLanguage` for parsers, `tauHighlighter` for `tok-*` token classes, and `apps/ui/app/styles/syntax-highlight.css` for the one palette. A surface never resolves languages or paints tokens on its own; `apps/ui/app/components/code/code-surfaces.test.tsx` checks every surface against every language's fixture.

Grammars are committed with their generated parser tables; do not fetch or compile grammars at runtime. Documentation code takes the source document's language for untagged fences, and an adapter maps fence tags its server uses loosely (KCL documentation fences KCL as `js`). Highlighting a code block never starts a language service. Follow the `add-editor-language` skill for a new language.

### 9. Fail visibly without breaking basic editing

If an optional LSP or materializing provider cannot start, report a diagnostic and keep syntax highlighting and ordinary text editing available. Do not swallow initialization failures or silently run heavy worker code on the main thread.

### 10. Preserve document and edit authority

`EditorDocumentSession` owns checked persistence, conflict recording and the shared document history. Views retain independent selection, scroll, focus and decorations. Language workers mirror versioned text; they do not become the filesystem authority.

Before applying a semantic workspace edit, verify every target against the exact worker text used to compute it, validate offsets and read-only provenance, then use the session's checked save path. Refuse stale results before changing any target. Do not acknowledge a failed save as durable success.

### 11. Test each boundary

Cover URI normalization, Tier 0 and Tier 1 fallback, Tier 2 closed-file reads, version lookup, synthetic dependency directories, worker boot ordering, lazy activation, and disposal. Use the smallest real worker integration needed to prove the browser boundary.

## Ownership

- Shared protocol and clients: `apps/libs/lsp-fs/src`
- Tier 2 client/server: `apps/libs/lsp-fs/src/sync`
- Main-thread bridge: `apps/libs/lsp/src/language-fs-bridge.ts`
- TypeScript worker: `apps/libs/lsp/src/typescript-worker`
- UI language contributions: `apps/ui/app/lib/*-language`
- TypeScript view adapters and declarations: `apps/ui/app/lib/typescript-language`
- Neutral document and checked-edit owners: `apps/ui/app/lib/editor-document-session.ts`, `editor-workspace-edits.ts`
- Shared grammars: `libs/grammars`
