---
title: 'Language FS Bridge Implementation'
description: 'Implementation contract for shared Monaco language-server filesystem bridge (R1–R9); executable spec for libs/lsp-fs and apps/ui integration.'
status: draft
created: '2026-05-07'
updated: '2026-05-07'
category: architecture
related:
  - docs/research/scalable-language-contribution-fs-architecture.md
  - docs/architecture/runtime-topology.md
  - docs/policy/filesystem-policy.md
---

# Language FS Bridge Implementation

Executable contract for landing R1–R9 from `scalable-language-contribution-fs-architecture.md`: shared `fs/*` custom JSON-RPC requests, FM-backed `SharedPool` Tier 0 reads, KCL + OpenSCAD consumers. **Out of scope**: R10 (sync `Atomics.wait` slot), R11 (JS/TS `serverHost`).

## Executive Summary

The parent blueprint is a long-form architecture audit; this document is the **engineering contract** implementers follow until `docs/policy/language-contribution-policy.md` (R9) captures binding rules. Wire method names, TypeScript module layout, URI conversion, and tiered reads are normative here; code should match, or the spec should be updated first.

## Problem Statement

Several Monaco language contributions need workspace filesystem access. One-off postMessage protocols (legacy KCL) duplicate effort and diverge from VS Code LSP-extension practice. This file pins the **single** protocol and integration points so Phase 0b–3 implement without reinterpretation.

## Methodology

- Parent blueprint: [scalable-language-contribution-fs-architecture.md](scalable-language-contribution-fs-architecture.md).
- FM / SAB ownership: [runtime-topology.md](../architecture/runtime-topology.md).
- Docs gate: `pnpm docs:validate`.

## Findings

### Finding 1: Wire protocol

Custom requests use these **method strings** (VS Code HTML/CSS alignment):

| Method         | Param type                          | Result                                                                                                                                                |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs/content`   | `{ uri: string }`                   | `Uint8Array` (serialized on JSON-RPC as base64 or byte array per `json-rpc-2.0` transport — implementation uses structured clone compatible payloads) |
| `fs/stat`      | `string` (URI)                      | `FileStat`                                                                                                                                            |
| `fs/readDir`   | `string` (directory URI)            | `Array<[string, FileType]>`                                                                                                                           |
| `fs/findFiles` | `{ pattern: string; max?: number }` | `string[]` (`file://` URIs)                                                                                                                           |

`FileType`: `Unknown = 0`, `File = 1`, `Directory = 2`, `SymbolicLink = 64`.

`FileStat`: `{ type: FileType; ctime: number; mtime: number; size: number }` with times in **milliseconds**.

Declared in `libs/lsp-fs/src/protocol.ts` using `RequestType` from `vscode-languageserver-protocol`.

### Finding 2: `LanguageWorkerHandle`

`libs/lsp-fs/src/handle.ts` exports:

```typescript
export type LanguageWorkerHandle = {
  readonly port: MessagePort;
  readonly filePoolBuffer?: SharedArrayBuffer;
};
```

KCL passes this on worker `init` when introducing multi-port init; until then `filePoolBuffer` may be posted on the existing init payload alongside `KclLspWorkerOptions`.

### Finding 3: `ActivationContext`

Add `treeService: FileTreeService` and `filePoolBuffer?: SharedArrayBuffer` to `ActivationContext` in [apps/ui/app/lib/monaco-language-registry.ts](../../apps/ui/app/lib/monaco-language-registry.ts). Populate from the file-manager snapshot in the Monaco provider host.

### Finding 4: URI-only boundary

All `fs/*` URI parameters are absolute `file://` URIs. Conversion uses `vscode-uri`. Relative path guessing and multi-candidate directory walks are removed from KCL FS resolution.

### Finding 5: Tier 0 vs Tier 1

- **Tier 0**: `SharedPool.resolveCopy(absolutePath)` where `absolutePath` matches the key the FM worker stores in `WorkspaceFileService.readFile` (full path string).
- **Tier 1**: JSON-RPC `fs/*` from worker (or in-process client) to main; `serveLanguageFileSystemRequests` uses `FileSystemClient.readFile` / `stat` / `FileTreeService.listDirectory` / `FileSystemClient.searchFiles`, mapping paths with `vscode-uri`.

### Finding 6: KCL worker FS shim

The Rust/wasm-bindgen surface stays: **`readFile(path: string)`**, **`exists(path: string)`**, **`getAllFiles(path: string)`** (returns `Promise<string>` of JSON-stringified filenames). Internals **do not** use `lspWorkerEventType.fileReadRequest` etc. They call the shared worker-side helper from `libs/lsp-fs` that performs Tier 0 then sends `fs/*` JSON-RPC to the main thread over **worker `postMessage` JSON payloads** (not the WASM LSP byte queue). The main thread handles those with the same `serveLanguageFileSystemRequests` logic as other consumers.

### Finding 7: `libs/lsp-fs` layout

Subpath exports only (no behavioural barrel): `./protocol`, `./handle`, `./client` (worker/main shared Tier0+Tier1 reader). Follow [library-api-policy.md](../policy/library-api-policy.md) and sibling `libs/chat` `exports` pattern.

### Finding 8: OpenSCAD

Main-thread only: in-process paired `JSONRPCServerAndClient` + `serveLanguageFileSystemRequests` + `attachLanguageFsClient` for `include` / `use` resolution.

## Recommendations

| #   | Action                                           | Plan phase   |
| --- | ------------------------------------------------ | ------------ |
| R1  | `protocol.ts` + package scaffold                 | 0b           |
| R2  | `serveLanguageFileSystemRequests` in `apps/ui`   | 1            |
| R3  | `bindMonacoModelsToLspConnection`                | 1            |
| R4  | `LanguageWorkerHandle` + worker `filePoolBuffer` | 0b–2         |
| R5  | `ActivationContext` + host wiring                | 0b           |
| R6  | KCL migration                                    | 2            |
| R7  | OpenSCAD in-process RPC                          | 3            |
| R8  | `vscode-uri` at workspace root                   | 1            |
| R9  | Policy doc                                       | 4            |
| R10 | Sync `Atomics.wait` FS slot                      | **deferred** |
| R11 | JS/TS `serverHost`                               | **deferred** |

## Trade-offs

- **Worker FS JSON-RPC over `postMessage`** keeps WASM LSP framing untouched and avoids multiplexing on `intoServer`/`fromServer`.
- **In-process JSON-RPC for OpenSCAD** duplicates transport setup once for symmetry with KCL handlers rather than a second direct-only API.

## References

- [scalable-language-contribution-fs-architecture.md](scalable-language-contribution-fs-architecture.md)
- [runtime-topology.md](../architecture/runtime-topology.md)
- [filesystem-policy.md](../policy/filesystem-policy.md)
