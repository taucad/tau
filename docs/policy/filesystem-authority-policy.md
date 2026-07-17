---
title: 'Filesystem Authority Policy'
description: 'The single-filesystem-authority invariant: one FM-worker authority per host, one provider instance per storage root, mounts as pure routing from persistent config, manifest-based discovery, cross-tab coherence, and webaccess handle lifecycle rules.'
status: active
created: '2026-07-13'
updated: '2026-07-17'
related:
  - docs/policy/filesystem-policy.md
  - docs/policy/project-manifest-policy.md
  - docs/policy/storage-policy.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
  - docs/research/runtime-model-load-project-root-regression-v3.md
  - docs/research/tau-json-project-library-state-boundary.md
---

# Filesystem Authority Policy

Internal reference for filesystem topology: who owns storage, who may instantiate providers, how routing is configured, how projects are discovered, and how tabs stay coherent. Read/write semantics, watch pipelines, and RPC patterns stay in `docs/policy/filesystem-policy.md`; this policy governs the layer beneath them.

This policy absorbs the former "Backend & Provider Rules" of `docs/policy/filesystem-policy.md` (old Rules 11–13e — mapping table at the end). The ZenFS-era mechanics those rules prescribed (`resolveMountConfig`, `IndexedDBStore` preload) are retired; the live architecture is `MountTable` + `ProviderRegistry` + direct providers (`packages/filesystem/src/{mount-table,provider-registry}.ts`, `backend/direct-idb-provider.ts`).

## Rationale

The thumbnail refresh-loss bug class (v3 forensics) had two structural causes: every `mount()` created a fresh provider instance over the same backing store — for IndexedDB, multiple `DirectIdbProvider`s whose hydrate-once path indexes never learn of each other's writes — and mounts were registered by page lifecycle, so `/projects/<id>/…` stopped resolving the moment the user navigated away. Patching symptoms leaves the class alive. The fix is an invariant, derived from first principles in `docs/research/headless-thumbnail-rendering-architecture-v4.md` (Finding 5), that makes the browser filesystem behave like an OS filesystem.

## The Invariant

Requirements the filesystem must satisfy at all times:

| Req | Statement                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | One canonical absolute namespace (`/projects/<id>/…`) resolvable at any time from any consumer — never dependent on which page is open        |
| B   | Heterogeneous storage roots: IndexedDB database(s), the OPFS root, N webaccess directory handles, ephemeral memory scratch                    |
| C   | Coherence: two reads of the same path through any route observe the same bytes; a write is immediately visible to every consumer in the tab   |
| D   | Reactivity: watchers fire for all writers — in-app, cross-tab, external-on-disk — including the appearance of new projects                    |
| E   | All consumers reach storage through one authority; runtime consumers receive only writable rooted views, never the authority-global namespace |
| F   | Cross-tab safety: serialized writes and change propagation                                                                                    |

The invariant that satisfies them: **one provider instance per storage root, shared by every mount routing into that root; mounts are pure routing entries registered from persistent config at authority boot, never from page lifecycle.**

## Rules

### 1. Single filesystem authority per host

All filesystem I/O runs in one place per host — the file-manager worker in the browser, or the caller-supplied rooted filesystem in CLI/Node environments. Trusted administration uses the authority-global namespace to select and configure project routes. Runtime, GeoSpec, preview, chat, and headless consumers receive only an opaque, fully writable rooted filesystem whose virtual `/` is one selected project. No feature worker may instantiate providers, open backing stores, inspect global routes, or receive the authority-global shared file pool. The main thread remains the writer of asset thumbnail files declared by `tau.json`.

**Why**: Requirement C is unenforceable with more than one writer topology; every coherence mechanism in this policy assumes a single chokepoint.

### 2. One provider instance per storage root

A storage root is one IndexedDB database, the origin's OPFS root, one webaccess directory entry, or an explicitly named memory root. Exactly one provider instance exists per `storageRootKey`: `indexeddb:<database-prefix>`, `opfs:origin`, `webaccess:<workspaceId>`, or a caller-supplied `memory:<scope>`. Mount resolution and scoped reads reuse that instance — per-mount fresh instances are forbidden. Webaccess workspace creation uses `FileSystemDirectoryHandle.isSameEntry()` to preserve the existing `workspaceId` when the user selects the same physical directory again; folder names are never identity.

**Why**: Providers hydrate in-memory indexes once per instance (`DirectIdbProvider._paths`); two instances over one database means one instance's writes are invisible to the other's index — the ENOENT-despite-row-exists class.

CORRECT:

```typescript
// Mount resolution and standalone reads share the per-root instance
const provider = registry.getProvider(scope); // scope carries the canonical storageRootKey
```

INCORRECT:

```typescript
// Fresh provider per mount — second instance never sees the first's writes
const provider = createProvider(scope);
mountTable.mount(prefix, provider, config);
```

### 3. Mounts are pure routing, registered from persistent config

`MountTable` entries map a virtual path prefix to `(provider, providerBasePath)` by longest-prefix match — nothing else. Routing is registered at FM-worker boot and replaced from `ProjectRootConfiguration` whenever persisted project bindings change. Discovery returns physical locators; the main-thread project manager persists any newly discovered logical route and calls `syncProjectRoots()`. Page navigation must not mount or unmount routing; page lifecycle governs watch scopes and UI services only. Creating a rooted view captures the exact resolved mount entry, provider, and provider base path; later operations on that view never re-enter global longest-prefix routing.

**Why**: Requirement A — a path that resolves only while its page is open is not a filesystem, and every consumer that outlives the page (thumbnail worker, discovery, cross-tab events) breaks.

> **Adoption**: project mounts are page-lifecycle-coupled today (`file-manager.machine.ts` mounts on project open); v4 R3 moves registration to worker boot.

### 4. Use the namespace owned by each boundary

Trusted authority and administration APIs take canonical global paths such as `/projects/<id>/…`. A rooted filesystem takes canonical project-local absolute paths such as `/src/main.ts`, with virtual `cwd = /`. Neither boundary accepts relative paths, backslashes, URLs, drive-letter paths, control characters, or traversal above its own `/`. Do not infer a project root from a filename or ambient "current project" state.

**Why**: Global paths select authority routes; local paths operate inside an already-selected filesystem. Mixing those namespaces leaks routing and authorization concerns into runtime code.

### 5. Project discovery is manifest-based

The authority owns a discovery plane: scan configured storage roots for `/projects/*/tau.json`, parse and validate manifests as untrusted input (`docs/policy/project-manifest-policy.md` Rules 4 and 14), preserve the physical `ProjectLocator`, detect duplicate logical IDs, serve the project list, and emit change events when projects appear or disappear. Use `FileSystemObserver` where available and visibility-aware polling otherwise. An invalid manifest, adoption-required directory, or duplicate ID quarantines only that entry with a structured status; it must never sink the whole list.

After discovery, the UI may left-join host-local `ProjectLibraryState` for recency, soft-delete visibility, and revision initialization. That row never establishes existence, supplies manifest content, or changes the physical locator. A missing row is seeded only after a valid manifest is discovered; an inaccessible root does not prove absence and must not trigger local-state cleanup. React Query remains the current listing cache. The authority gains no additional memory or persistent manifest projection without a measured need and a separately reviewed rebuild/invalidation contract.

**Why**: Existence is the manifest on disk (manifest policy Rule 1); a registry that must be told about projects locks out disk-level and agent-driven creation.

### 6. Cross-tab coherence has one mechanism

Cross-tab writes serialize via Web Locks (`tau-fs-write:<path>`) and propagate via BroadcastChannel (`tau-fs-changes`) — `packages/filesystem/src/cross-tab-coordinator.ts`. The provider index-repair fallback (consult the backing store on index miss before reporting ENOENT) is defense-in-depth for cross-tab races only; within a tab, Rule 2 makes index staleness structurally impossible. Do not add new coherence side channels.

### 7. Backend isolation

Each backend (`indexeddb`, `webaccess`, `opfs`, `memory`) is an independent storage system. A provider must never reach into another provider's storage root; operations on one backend must not affect another.

### 8. Scoped providers are cached; only authority operations may mutate them

Standalone providers (used to browse or discover a backend without mounting it, e.g. the files route grid) reuse the same per-root instances from `ProviderRegistry` (Rule 2). Feature code receives read-only discovery results, never a raw provider. Mutations normally use a mounted authority path. The narrow exceptions—project adoption/remint, creation at an allocated physical basename, and confirmed permanent deletion at an observed `ProjectLocator`—remain named `WorkspaceFileService` authority operations. They take an explicit storage scope and exact physical path, acquire logical-project and physical-directory locks, re-establish identity where applicable, and publish the ordinary authority invalidation/events.

**Why**: Reads through a shared instance are coherent by construction. Raw provider mutation would bypass locks, invalidation, and change events; a named authority operation preserves those guarantees when no mounted logical route can safely identify the target.

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

### 12. Project creation is a single bind → route-sync → write → verify transaction

Project creation MUST persist the project's backend binding, synchronize authority routes, write the seed file set and `tau.json`, then read back and validate the manifest — as one serialized transaction inside `useProjectManager.createProject`. Webaccess creation resolves `(directoryHandle, workspaceId)` before persisting the binding; there is no ambient handle-priming step. `memory` is rejected with `WorkspaceDirectoryRequiredError('unsupported')` — durable projects must commit to a durable backend at creation.

The transaction is the only legitimate way to write a project's seed files. UI surfaces (`/projects/new`, duplicate, remix-from-publication) MUST go through the project manager; ad-hoc mount/write flows are forbidden because they omit persistent binding, route synchronization, or manifest verification. Creation writes `tau.json` last so discovery never observes a half-created project.

### 13. Root FM is pinned to `indexeddb`; `initialBackend` is required

The root `<FileManagerProvider rootDirectory='/'>` MUST be instantiated with `initialBackend='indexeddb'`. `initialBackend` is a required prop; the provider's TypeScript surface compile-time-rejects `webaccess` without an accompanying `projectId` so a workspace-bound FM can only be mounted inside a project route.

The root provider MUST NOT consume the `filesystem-backend` cookie at mount time. The cookie is a _project-creation default_ read by `/projects/new` and `/files`, never the seed for the root machine. Cross-tab cookie flips therefore cannot break the root FM, and a stale `memory` cookie value is coerced back to `indexeddb` via `coerceFilesystemBackendCookie` at every selector read site.

### 14. Provider disposal is keyed by canonical `storageRootKey`

`ProviderRegistry` caches one provider per canonical `storageRootKey`. Webaccess entries MUST NOT be keyed by `handle.name` — two folders can share a name and one physical directory may be renamed. The filesystem client exposes `disposeStorageRoot(storageRootKey)`, which disposes exactly that provider. Changing or forgetting a workspace disposes `webaccess:<workspaceId>` before the next route sync/read; whole-authority teardown uses `disposeAll()`.

Failure to dispose after replacing a handle is a bug — the registry would otherwise continue serving the previous provider instance under the stable root key.

### 15. Rooted views are the runtime reachability boundary

`WorkspaceFileService.createRootedFileSystem(authorityRoot)` must resolve `authorityRoot` once to an exact project mount and return the ordinary full read/write/watch filesystem surface rebased to local `/`. Reads, writes, directory operations, rename operands, existence checks, and watches all resolve segment-by-segment inside that captured subtree. `..` may collapse local segments but may never ascend above `/`; a mount replacement invalidates the captured view instead of retargeting it.

The view is not read-only. Source files, generated files, `/.tau/cache`, and project-local `/node_modules` are all writable and persist through the underlying provider. No rights matrix, write allowlist, grant lifecycle, route generation, receipt, or service worker participates in this boundary. Runtime and headless code receive the opaque filesystem and local path only; project selection and authority-global routing remain in trusted composition code.

**Why**: Reachability is enforced once, before provider I/O, without asking every runtime layer to reproduce authorization logic.

## Anti-Patterns

- Creating a provider per mount, per page, or per call. One instance per storage root, always (Rule 2).
- Mounting project routing from page/component lifecycle, or unmounting it on navigation (Rule 3).
- ZenFS-era patterns: `resolveMountConfig`, per-instance data preloads, the `tau-fs` single-store schema. The API is removed; any doc or comment prescribing it is stale.
- Keying anything webaccess by `handle.name` (Rules 2 and 14) or holding an ambient "active handle" in the worker (Rule 9).
- Catching `WorkspaceDirectoryRequiredError` and falling back to another backend (Rule 10).
- Adding a second cross-tab coherence channel instead of using `CrossTabCoordinator` (Rule 6).
- Treating `ProjectLibraryState` as a discovery registry or using it to recover manifest fields (Rule 5).
- Passing an authority-global bridge, global file-pool buffer, project id, or global `/projects/<id>` path into runtime/headless code instead of issuing a rooted view (Rules 4 and 15).
- Reintroducing read-only source views or cache-only write allowlists; a rooted runtime filesystem is fully writable inside its virtual tree (Rule 15).

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

- Implementation: `packages/filesystem/src/{mount-table.ts,provider-registry.ts,cross-tab-coordinator.ts,workspace-file-service.ts}`, `packages/filesystem/src/backend/direct-idb-provider.ts`, `apps/ui/app/filesystem/{handle-store.ts,workspace-errors.ts}`, `apps/ui/app/machines/file-manager.{machine,worker}.ts`
- Research: `docs/research/headless-thumbnail-rendering-architecture-v4.md` (Finding 5, R3)
- Research: `docs/research/runtime-model-load-project-root-regression-v3.md` (rooted runtime filesystem boundary)
- Related: `docs/policy/filesystem-policy.md` (read/write/watch/RPC rules), `docs/policy/project-manifest-policy.md` (discovery contract)
