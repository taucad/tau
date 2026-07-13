---
title: 'Filesystem Authority Policy'
description: 'The single-filesystem-authority invariant: one FM-worker authority per host, one provider instance per storage root, mounts as pure routing from persistent config, content-addressed discovery, cross-tab coherence, and webaccess handle lifecycle rules.'
status: active
created: '2026-07-13'
updated: '2026-07-13'
related:
  - docs/policy/filesystem-policy.md
  - docs/policy/project-manifest-policy.md
  - docs/policy/storage-policy.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
  - docs/research/filesystem-first-policy-alignment.md
---

# Filesystem Authority Policy

Internal reference for filesystem topology: who owns storage, who may instantiate providers, how routing is configured, how projects are discovered, and how tabs stay coherent. Read/write semantics, watch pipelines, and RPC patterns stay in `docs/policy/filesystem-policy.md`; this policy governs the layer beneath them.

This policy absorbs the former "Backend & Provider Rules" of `docs/policy/filesystem-policy.md` (old Rules 11–13e — mapping table at the end). The ZenFS-era mechanics those rules prescribed (`resolveMountConfig`, `IndexedDBStore` preload) are retired; the live architecture is `MountTable` + `ProviderRegistry` + direct providers (`packages/filesystem/src/{mount-table,provider-registry}.ts`, `backend/direct-idb-provider.ts`).

## Rationale

The thumbnail refresh-loss bug class (v3 forensics) had two structural causes: every `mount()` created a fresh provider instance over the same backing store — for IndexedDB, multiple `DirectIdbProvider`s whose hydrate-once path indexes never learn of each other's writes — and mounts were registered by page lifecycle, so `/projects/<id>/…` stopped resolving the moment the user navigated away. Patching symptoms leaves the class alive. The fix is an invariant, derived from first principles in `docs/research/headless-thumbnail-rendering-architecture-v4.md` (Finding 5), that makes the browser filesystem behave like an OS filesystem.

## The Invariant

Requirements the filesystem must satisfy at all times:

| Req | Statement                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | One canonical absolute namespace (`/projects/<id>/…`) resolvable at any time from any consumer — never dependent on which page is open      |
| B   | Heterogeneous storage roots: IndexedDB database(s), the OPFS root, N webaccess directory handles, ephemeral memory scratch                  |
| C   | Coherence: two reads of the same path through any route observe the same bytes; a write is immediately visible to every consumer in the tab |
| D   | Reactivity: watchers fire for all writers — in-app, cross-tab, external-on-disk — including the appearance of new projects                  |
| E   | All consumers (main thread, kernel workers, feature workers) reach storage through one authority via bridges                                |
| F   | Cross-tab safety: serialized writes and change propagation                                                                                  |

The invariant that satisfies them: **one provider instance per storage root, shared by every mount routing into that root; mounts are pure routing entries registered from persistent config at authority boot, never from page lifecycle.**

## Rules

### 1. Single filesystem authority per host

All filesystem I/O runs in one place per host — the file-manager worker in the browser, the runtime filesystem in the CLI. Every consumer (main thread, kernel workers, thumbnail/capture workers) reaches it via MessagePort bridges. No thread outside the authority may instantiate providers, open backing stores, or import backend modules.

**Why**: Requirement C is unenforceable with more than one writer topology; every coherence mechanism in this policy assumes a single chokepoint.

### 2. One provider instance per storage root

A storage root is an IndexedDB database, the OPFS root, or one webaccess directory handle. Exactly one provider instance exists per root, keyed as the `ProviderRegistry` standalone cache already keys them (`webaccess:<workspaceId>` for webaccess, else the backend id). Mount resolution must reuse that instance — per-mount fresh instances are forbidden.

**Why**: Providers hydrate in-memory indexes once per instance (`DirectIdbProvider._paths`); two instances over one database means one instance's writes are invisible to the other's index — the ENOENT-despite-row-exists class.

> **Adoption**: the standalone-provider cache complies today; `createMountProvider`'s deliberately-uncached contract (`provider-registry.ts`) is retired by v4 R3, which extends the cache keying to mount providers.

CORRECT:

```typescript
// Mount resolution and standalone reads share the per-root instance
const provider = registry.getProvider(scopeKey); // 'webaccess:<workspaceId>' | backend id
```

INCORRECT:

```typescript
// Fresh provider per mount — second instance never sees the first's writes
const provider = registry.createMountProvider(scope);
mountTable.mount(prefix, provider, config);
```

### 3. Mounts are pure routing, registered from persistent config

`MountTable` entries map a path prefix to `(provider, subpath)` by longest-prefix match — nothing else. Routing is registered at FM-worker boot (and on `ProjectFileSystemConfig` change) from the persisted config for all known projects. Page navigation must not mount or unmount routing; page lifecycle governs watch scopes and UI services only.

**Why**: Requirement A — a path that resolves only while its page is open is not a filesystem, and every consumer that outlives the page (thumbnail worker, discovery, cross-tab events) breaks.

> **Adoption**: project mounts are page-lifecycle-coupled today (`file-manager.machine.ts` mounts on project open); v4 R3 moves registration to worker boot.

### 4. Absolute canonical paths everywhere

All cross-boundary filesystem APIs take absolute canonical paths (`/projects/<id>/…`). No consumer may depend on a "current project" ambient context for path resolution; normalization (separators, duplicate slashes) happens at the authority boundary.

**Why**: Relative or context-dependent paths reintroduce requirement-A failures through the back door.

### 5. Project discovery is content-addressed

The authority owns a discovery plane: scan configured storage roots for `/projects/*/tau.json`, parse and validate manifests as untrusted input (`docs/policy/project-manifest-policy.md` Rules 4 and 9), serve the project list, and emit change events when projects appear or disappear — `FileSystemObserver` where available, visibility-aware polling otherwise. An invalid manifest quarantines that project (structured error surfaced); it must never sink the whole list.

**Why**: Existence is the manifest on disk (manifest policy Rule 1); a registry that must be told about projects locks out disk-level and agent-driven creation.

### 6. Cross-tab coherence has one mechanism

Cross-tab writes serialize via Web Locks (`tau-fs-write:<path>`) and propagate via BroadcastChannel (`tau-fs-changes`) — `packages/filesystem/src/cross-tab-coordinator.ts`. The provider index-repair fallback (consult the backing store on index miss before reporting ENOENT) is defense-in-depth for cross-tab races only; within a tab, Rule 2 makes index staleness structurally impossible. Do not add new coherence side channels.

### 7. Backend isolation

Each backend (`indexeddb`, `webaccess`, `opfs`, `memory`) is an independent storage system. A provider must never reach into another provider's storage root; operations on one backend must not affect another.

### 8. Standalone read instances are cached and never write

Standalone providers (used to browse a backend without mounting it, e.g. the files route grid) are read-only consumers of the same per-root instances (Rule 2), obtained through the `ProviderRegistry` cache. All writes go through the authority's mounted path and its serialization queue — a standalone handle must never be used for mutation.

**Why**: Reads through a shared instance are coherent by construction; writes outside the queue bypass locks, invalidation, and change events.

### 9. WebAccess handle lifecycle is workspace-scoped

The `webaccess` backend is multi-workspace: every `FileSystemDirectoryHandle` lives behind a first-class `workspaceId` (plain `string`, `wsp_*` prefix) and is owned by the multi-store `tau-fs-handles` IndexedDB schema (`workspaces`, `handles`, `configs`, `meta`). The legacy single-`'root'` handle pattern is forbidden.

- Hand-off to the worker uses structured clone (handles are not transferable). The FM machine resolves the project's bound `workspaceId` from `configs[projectId]`, reads its handle from `handles[workspaceId]`, then mounts the webaccess prefix in a single discriminated call: `proxy.mount(prefix, { backend: 'webaccess', directoryHandle, workspaceId, preservePath: true })`. The worker is stateless w.r.t. webaccess identity — no `setDirectoryHandle` knob, no ambient "active handle" between RPCs.
- Permission must be re-requested from a user gesture after page reload. The FM machine surfaces a structured `unavailableReason` (`'missing' | 'permission'`) — silent downgrade to IndexedDB is forbidden (Rule 10).
- Cross-workspace project access is forbidden. If a project's bound `workspaceId` does not match the currently active workspace, the FM machine must refuse to open and route through the `webAccessUnavailable` state (no implicit re-binding).

### 10. No silent backend downgrade

Every code path that fails to resolve a webaccess workspace (handle missing from IDB, permission revoked, `showDirectoryPicker` unsupported, picker aborted) must throw `WorkspaceDirectoryRequiredError` with one of the typed `code`s (`'missing' | 'permission' | 'unsupported'`). Call sites translate the error to actionable UI:

- `/projects/new`: `toast.error` with a "Manage Workspaces" action, plus an inline `WorkspaceDirectoryPanel` that prevents submission until the workspace is connected.
- `/projects/$id`: the `ProjectUnavailableOverlay` indirection renders `WorkspaceUnavailableRecovery` (full-shell overlay, not a banner — the dockview underneath must be fully covered).
- Settings + `/files`: the relevant workspace row renders `WorkspaceDirectoryPanel` (row / banner variant) with `[Connect]` / `[Grant Access]` / `[Change Folder]` controls scoped to that workspace.

It is forbidden to catch a `WorkspaceDirectoryRequiredError` and fall back to `indexeddb` — a project's backend binding is immutable once written to `configs[projectId]`.

### 11. Workspace IDs are generated; project bindings live in one place

Workspace identifiers must be minted via `generatePrefixedId(idPrefix.workspace)` from `@taucad/utils`. They are plain `string`s — there is no branded `WorkspaceId` type. Treat them as opaque identifiers: do not derive them from `handle.name`, content hashes, or any other property of the underlying directory (those values change as the user re-points or renames the folder).

`ProjectFileSystemConfig.workspaceId` is the **single source of truth** for the project ↔ workspace binding. The `fileManagerMachine` MUST NOT carry that identity as ambient context; the machine's `activeWorkspaceId` / `activeWorkspaceName` fields are per-init _outputs_ populated by `initializeServicesActor` and cleared on every `setRoot` transition. The machine MUST NOT mutate `ProjectFileSystemConfig` directly — there is no actor-side self-persist branch.

Any user-driven workspace change MUST go through the binding-transaction helper `bindProjectToWorkspace` on `useFileManager`. The helper performs three steps in order: (1) write `ProjectFileSystemConfig` with the new `{ projectId, backend: 'webaccess', workspaceId }`, (2) emit the `workspaceSwap` telemetry event, (3) dispatch `reloadWorkspace` (no payload) on the FM machine. The machine then re-runs `initializeServicesActor`, which reads the fresh persistent record. Subsequent project loads are silent because the persistent record already has the right binding.

Missing or stale bindings surface `WorkspaceDirectoryRequiredError('missing')` via the recovery overlay; legacy projects without an explicit `workspaceId` are prompted on first load. The v2 → v3 IDB migration only promotes the legacy `'root'` handle to a regular workspace row — it does not auto-bind projects.

### 12. Project creation is a single mount → write → unmount transaction

Project creation MUST mount the project prefix on the workspace's storage, persist the file set, then unmount — atomically, inside `useProjectManager.createProject`. Webaccess creation MUST pass `(directoryHandle, workspaceId)` together via `MountConfig`; there is no separate handle-priming step. `memory` is rejected outright with `WorkspaceDirectoryRequiredError('unsupported')` — projects must commit to a durable backend at creation.

The transaction is the only legitimate way to write a project's seed files. UI surfaces (`/projects/new`, "duplicate", remix-from-publication) MUST go through `createProject`; ad-hoc `fileManager.mount` + `writeFiles` flows from non-creation call sites are forbidden because they don't perform the `setProjectFileSystemConfig` write that binds the project to its backend. Creation writes the project's `tau.json` as part of the same transaction (manifest policy Rule 1).

### 13. Root FM is pinned to `indexeddb`; `initialBackend` is required

The root `<FileManagerProvider rootDirectory='/'>` MUST be instantiated with `initialBackend='indexeddb'`. `initialBackend` is a required prop; the provider's TypeScript surface compile-time-rejects `webaccess` without an accompanying `projectId` so a workspace-bound FM can only be mounted inside a project route.

The root provider MUST NOT consume the `filesystem-backend` cookie at mount time. The cookie is a _project-creation default_ read by `/projects/new` and `/files`, never the seed for the root machine. Cross-tab cookie flips therefore cannot break the root FM, and a stale `memory` cookie value is coerced back to `indexeddb` via `coerceFilesystemBackendCookie` at every selector read site.

### 14. Standalone provider cache is keyed by `workspaceId`; invalidation has a typed contract

`ProviderRegistry` caches one standalone provider per `(backend, workspaceId)` pair. Webaccess entries MUST NOT be keyed by `handle.name` — two workspaces pointing at folders with the same name would collide. The registry exposes `invalidateStandaloneProvider(backend, workspaceId?)`:

- `invalidateStandaloneProvider('webaccess', workspaceId)` drops exactly one entry; required by `/files` "Change Folder", `forgetWorkspace`, and `bindProjectToWorkspace` (recovery binding) so the next standalone read uses the fresh handle.
- `invalidateStandaloneProvider('webaccess')` drops every webaccess entry; reserved for the worker boot path.
- `invalidateStandaloneProvider(non-webaccess)` drops the single backend entry.

Failure to invalidate after a handle swap is a bug — the registry will silently serve reads against the previous handle until the cache entry is replaced by reload.

## Anti-Patterns

- Creating a provider per mount, per page, or per call. One instance per storage root, always (Rule 2).
- Mounting project routing from page/component lifecycle, or unmounting it on navigation (Rule 3).
- ZenFS-era patterns: `resolveMountConfig`, per-instance data preloads, the `tau-fs` single-store schema. The API is removed; any doc or comment prescribing it is stale.
- Keying anything webaccess by `handle.name` (Rule 14) or holding an ambient "active handle" in the worker (Rule 9).
- Catching `WorkspaceDirectoryRequiredError` and falling back to another backend (Rule 10).
- Adding a second cross-tab coherence channel instead of using `CrossTabCoordinator` (Rule 6).

## Rule Mapping (former filesystem-policy numbering)

Code and docs citing the old numbers resolve here:

| Old (`filesystem-policy.md`)               | Here                             |
| ------------------------------------------ | -------------------------------- |
| Rule 11 — Backend isolation                | Rule 7                           |
| Rule 12 — Standalone instance safety/reuse | Rule 8 (ZenFS mechanics retired) |
| Rule 13 — WebAccess handle lifecycle       | Rule 9                           |
| Rule 13a — No silent backend downgrade     | Rule 10                          |
| Rule 13b — Workspace IDs / binding         | Rule 11                          |
| Rule 13c — Creation transaction            | Rule 12                          |
| Rule 13d — Root FM pinned to indexeddb     | Rule 13                          |
| Rule 13e — Standalone cache keying         | Rule 14                          |

## References

- Implementation: `packages/filesystem/src/{mount-table.ts,provider-registry.ts,cross-tab-coordinator.ts}`, `packages/filesystem/src/backend/direct-idb-provider.ts`, `apps/ui/app/filesystem/{handle-store.ts,workspace-errors.ts}`, `apps/ui/app/machines/file-manager.{machine,worker}.ts`
- Research: `docs/research/headless-thumbnail-rendering-architecture-v4.md` (Finding 5, R3)
- Related: `docs/policy/filesystem-policy.md` (read/write/watch/RPC rules), `docs/policy/project-manifest-policy.md` (discovery contract)
