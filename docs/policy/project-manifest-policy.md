---
title: 'Project Manifest Policy'
description: 'Authority contract for the strict first-release tau.json manifest, host-local project library state, lifecycle overlays, and filesystem-first discovery.'
status: active
created: '2026-07-13'
updated: '2026-08-28'
related:
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/filesystem-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-api-policy.md
  - docs/policy/storage-policy.md
  - docs/policy/vision-policy.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
  - docs/research/project-updated-at-activity-boundary.md
  - docs/research/tau-json-project-library-state-boundary.md
---

# Project Manifest Policy

Internal reference for the `tau.json` project manifest and its boundary with host-local project library state. It defines which facts are portable project content, which facts are local application state, and how filesystem discovery and the local overlay compose without creating two project authorities.

> **Status: active** — this is the first-release v1 contract. The unreleased draft implementation cuts directly to it as specified by `docs/research/tau-json-project-library-state-boundary.md`; no manifest-version migration or compatibility layer ships.

## Rationale

Tau's filesystem-first model makes project intent reachable to users, agents, CLIs, Git, and every host. That does not mean every browser-library fact belongs in a portable file. Trash state, semantic recent-project ordering, and chat revision pointers have no faithful filesystem representation and are meaningless to a headless consumer without the corresponding local application state.

The governing invariant is:

> `tau.json` is the sole portable authority for project existence and declarative content. `ProjectLibraryState` is a narrow host-local overlay for lifecycle and application state that the filesystem cannot express. Neither source mirrors the other's fields, and only a valid discovered manifest can establish a project.

## Authority Table

| Concern                             | Authoritative home                                      | Examples                                                            |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Portable project declaration        | `/tau.json`                                             | schema URL, logical ID, name, description, tags, and the main asset |
| Authored or generated project files | Project filesystem                                      | entry paths, `.tau/parameters/<entryPath>.json`, asset thumbnails   |
| Host-local library lifecycle        | `projectLibraryStates` object store                     | `lastActivityAt`, `deletedAt`                                       |
| Host-local revision pointer         | `projectLibraryStates` object store                     | `revisionState` while chats remain browser-local                    |
| Physical storage binding            | `ProjectFileSystemConfig` in `tau-fs-handles`           | backend, workspace ID, storage root                                 |
| Rebuildable presentation cache      | Memory only unless separately justified by measurements | React Query project results, thumbnail object URLs                  |

## Rules

### 1. A valid manifest establishes project existence

A directory containing a valid `tau.json` on a configured storage root **is** a project. Discovery scans `/projects/*/tau.json`; no object-store row may create a project, suppress discovery of an active project, or substitute for a missing manifest.

After discovery, the UI may left-join `ProjectLibraryState` by validated logical project ID to sort the library, hide a soft-deleted project, or initialize revision state. This overlay affects local presentation and lifecycle only. A stale row without a discovered manifest is not a project.

**Why**: Disk-level project creation and external edits must work without registering content through one browser profile. The local overlay remembers browser intent but never becomes content authority.

### 2. `tau.json` is portable, declarative, and user-visible

The manifest lives at the project root, not under `.tau/`. A field belongs in it only when all of the following are true:

1. a user, agent, CLI, or another host needs the value to understand or operate on the project;
2. the value remains meaningful when the project directory is copied, checked out, or opened in another profile;
3. the value cannot be derived unambiguously from another canonical project file;
4. Tau can define stable validation semantics for it.

Operational timestamps, local trash status, cached projections, chat-row pointers, and browser storage locators fail this test and stay out of `tau.json`.

### 3. Manifest and runtime types are separate

`ProjectManifest`, `ProjectLibraryState`, and the UI's composed project view are distinct types. A manifest serializer accepts only `ProjectManifest` and constructs its output field by field. It must never spread a runtime project object or persist a composed view wholesale.

The manifest schema and every nested object are strict. Unknown properties in a document claiming the v1 schema are validation errors; they are not silently retained. A future extension requires a deliberately revised contract or a separately designed explicit extension point.

**Why**: The pre-release draft's combination of `.loose()` schemas, `ProjectManifest = Project & …`, and `{ ...project }` serialization let top-level `thumbnail` and later runtime fields leak onto disk despite not being part of the typed contract.

CORRECT:

```typescript
const manifest: ProjectManifest = {
  $schema: projectManifestSchemaUrl,
  id: project.id,
  name: project.name,
  description: project.description,
  tags: project.tags,
  assets: project.assets,
};
```

INCORRECT:

```typescript
const manifest = { ...project, $schema: projectManifestSchemaUrl };
```

### 4. `$schema` is the manifest's sole on-disk version discriminator

The current and only supported URL is `https://tau.new/schemas/tau-schema-v1.json`. `tau.json` carries that URL in `$schema` and does not duplicate the same fact in `schemaVersion`.

Because no manifest contract has shipped, Tau replaces the draft implementation at that URL before release. Readers accept the exact v1 URL and strict v1 shape; an unknown or malformed URL returns a structured unsupported-schema issue without mutating bytes. No old-manifest parser, forward-migration branch, or second schema URL exists in the first release.

The published JSON Schema is generated from the strict Zod schema. Once v1 is released, its URL and bytes are immutable. A future incompatible contract receives a new URL only when that contract is actually designed.

This URL rule applies to Tau-owned, user-visible JSON documents that expose `$schema`. Other durable formats still require one explicit version discriminator appropriate to their format, but must not carry two synchronized representations of the same version.

### 5. V1 declares exactly one first-class main asset

`assets` is a strict object with exactly one required `main` property. `main` declares:

- `entryPath`: the normalized project-relative file that starts evaluation;
- optional `thumbnail`: the unique Tau-managed project-relative WebP output slot associated with that asset.

`entryPath` is preferred over `entry`, `file`, `source`, or `path`: it matches Tau's established public vocabulary and describes both the file kind and its role. This manifest value is canonical, project-relative, and has no leading `/`. A runtime consumer may pass it unchanged as `source.path`; plugin authors receive the same root-relative identity. Tau currently supports one first-class entry and mechanical projects only. Additional asset keys, a `discipline` constant, and an arbitrary asset map have no current consumer and are forbidden. They may be deliberately designed when a second entry or non-mechanical workflow actually requires them.

The canonical v1 asset shape is:

```json
{
  "assets": {
    "main": {
      "entryPath": "main.ts",
      "thumbnail": "thumbnail.webp"
    }
  }
}
```

Parameters are not embedded and no `parametersFile` pointer is added. The sidecar path is derived canonically as `.tau/parameters/<entryPath>.json`. Asset `version` and `dependencies` fields require a real resolution contract before they may return; speculative or derived values do not belong in the manifest.

The strict schema validates each declared path as a normalized project-relative POSIX path. It deliberately performs no speculative cross-field or filesystem-existence validation. The thumbnail owner may apply the narrower safety checks required before replacing the declared output bytes. Authored previews that Tau must preserve require a different future field.

**Why**: The draft `assets.mechanical` shape conflated classification with identity. `assets.main` describes the one real entry without repeating an unused classification or prematurely designing multi-entry behavior. The thumbnail belongs beside the entry that owns it instead of at the manifest root.

### 6. Local library state is minimal and field-scoped

The UI may persist exactly one `ProjectLibraryState` row per logical project ID with this responsibility:

```typescript
type ProjectLibraryState = {
  projectId: string;
  lastActivityAt: number;
  deletedAt?: number;
  revisionState?: PersistedRevisionState;
};
```

Do not add manifest-derived name, description, author, tags, assets, entry paths, thumbnails, physical locators, or file bytes to this row. Do not add a generic partial-update API. Mutations use field-scoped atomic operations such as `touchProjectActivity`, `trashProject`, `restoreProject`, and `setProjectRevisionState` under the storage policy's keyed-transaction rules.

`createdAt` is intentionally absent. Tau currently has no product behavior that needs a portable project-creation claim, and filesystem birth time is not portable. If a future feature needs “added to this library,” name it `addedAt` and keep it local; if it needs authored provenance, define that separate portable concept explicitly.

### 7. Project recency is semantic, never inferred from raw mtimes

`lastActivityAt` means the most recent material project-domain activity. It is updated by the existing project activity boundary for authored file changes, meaningful metadata edits, parameter changes, and committed chat operations. Generated thumbnails, manifest persistence, cache writes, route hydration, generated labels, and no-op repairs do not affect it.

Filesystem mtimes may be used as reconciliation or cache-invalidation observations. They are never the authority for project creation or semantic recency, never require recursive project scans on library listing, and never bypass the project-domain classifier.

When a valid project is discovered without local state, first discovery may seed `lastActivityAt` to the discovery time. The one-off pre-release workspace cutover quiesces normal discovery and preserves each known project's semantic draft `updatedAt` as `lastActivityAt` before that fallback can run.

### 8. Soft deletion is a local tombstone; permanent deletion removes bytes

Soft delete sets `ProjectLibraryState.deletedAt` and leaves the project directory, manifest, chats, editor state, and storage binding intact so the project can be restored. Restore clears the tombstone. The UI must describe this as recoverable local trash, not permanent filesystem deletion.

Permanent deletion is a separate confirmed operation. It uses the existing crash-resumable project-operation journal to remove the project directory and associated chat, editor, locator, legacy, and library-state records.

If local library state is lost, a still-valid manifest is rediscovered as active. This fail-open behavior favors data recovery. A disconnected or inaccessible storage root must never be mistaken for permanent deletion and must not cause local-state garbage collection.

### 9. Revision state follows its authoritative chat history

`revisionState` remains host-local while restore depends on browser-local `Chat` rows and full file-operation snapshots. Sparse `.tau/transcripts/*.jsonl` logs do not contain enough information to reconstruct those revisions. Copying a project to a host without its chats initializes revision state at the existing clean tip default.

If Tau later promotes a lossless on-disk chat archive to authority, the archive and revision state migrate together under a new policy. Moving only dangling turn IDs into `tau.json` is forbidden.

### 10. Single writers, watch convergence, and loop guards remain mandatory

In-app manifest writes are serialized by the project manager/project machine boundary. Creation, duplication, import, legacy object-store conversion, and live metadata changes all use the same strict v1 serializer. Components and feature workers request changes through that owner and never write `tau.json` directly.

External writers edit the manifest itself. The app converges by watching, re-parsing, and replacing only the manifest slice of the composed project view; local library state remains untouched. Machine-origin write guards and coalescing prevent write/watch loops.

The thumbnail owner writes bytes to the path declared by the target asset. Parameter owners write only canonical sidecars. Neither generated write counts as project activity.

### 11. Listing optimization is measured and cannot become authority

The current Projects query uses React Query for in-memory caching/deduplication and filesystem events plus polling for convergence. The first-release cutover adds no second discovery cache. Measure cold and repeated listing before adding another layer; a performance miss is separate work, not permission to mirror manifest content into local lifecycle state.

A persistent manifest projection is not part of the current design. If measured cold-start scale later justifies one, it must be explicitly rebuildable, fingerprinted against the manifest, and unable to establish existence or overwrite filesystem content. It remains distinct from authoritative `ProjectLibraryState`.

### 12. The pre-release draft cuts over once; no manifest migration subsystem ships

No manifest contract has been released, so the repository replaces the draft shape directly with strict v1. Repository fixtures, generated schemas, constructors, and consumers switch together. Runtime code does not retain a draft parser, compatibility aliases, migration journal, recovery UI, content-addressed manifest backup format, or a second schema URL.

The known user workspace is handled as an explicit one-off implementation task against its exact browser origin/profile. Quiesce normal discovery and writes; take an exact-byte backup outside the projects tree; snapshot every available draft `updatedAt`, `deletedAt`, and `revisionState`; and reject duplicate logical IDs, unsafe paths, and destination collisions. Before mutation, preflight every source manifest and proposed strict-v1 output. Missing files referenced by an already-broken draft are reported and preserved as declarations; the cutover neither guesses replacements nor adds cross-field validation.

After a successful preflight, seed exact local rows before discovery can create fallback timestamps, preserve valid parameter sidecars, and replace every manifest through temporary-file writes. Verify every manifest and per-project local value—not only aggregate counts—before deleting temporary artifacts and resuming discovery. On failure, restore original manifest bytes and prior local rows and remove only sidecars created by the task. None of this becomes a production import or migration API.

The existing object-store-to-filesystem conversion is a separate legacy-storage concern. While legacy rows remain, it emits the final strict v1 shape through the ordinary serializer and maps legacy `updatedAt`, `deletedAt`, and `revisionState` to `ProjectLibraryState`. It verifies both destinations before clearing the old row. It must not introduce a manifest-to-manifest migration path.

### 13. Non-project spaces carry no manifest

Ephemeral preview/converter mounts and server-rendered publication surfaces are not projects and must not write `tau.json`. Manifest presence is the discriminator Rule 1 depends on; scratch spaces use purpose-specific inputs instead of a fake project record.

### 14. Manifests are untrusted input and paths come from discovery

Readers bound bytes before `JSON.parse`, validate through the selected strict schema, and quarantine only the invalid entry with a structured reason. Physical provider paths come exclusively from the discovery `ProjectLocator`. A validated manifest `id` is logical identity and may name a virtual route only after duplicate-ID detection; it is never joined into a provider path.

## Anti-Patterns

- Reintroducing `schemaVersion` beside a versioned `$schema` URL.
- Defining `ProjectManifest` as an intersection with a runtime/UI project type.
- Using `.loose()`, `.passthrough()`, or spread serialization for a known manifest version.
- Persisting manifest-derived fields in `projectLibraryStates` “for convenience” or using a local row to establish project existence.
- Deriving project recency from directory mtime, max descendant mtime, Git checkout time, or thumbnail writes.
- Keeping `createdAt` without a named, consumed semantic.
- Embedding parameters or adding a sidecar pointer that duplicates the canonical parameter path.
- Using a classification such as `mechanical` as an asset ID, or adding a classification field before a non-mechanical consumer exists.
- Keeping revision turn IDs portable while their authoritative chats remain local.
- Treating a missing workspace as deletion or clearing local state after an incomplete discovery scan.
- Shipping a parser, migration framework, or recovery UI for the unreleased draft manifest.
- Clearing a legacy object-store row before its final strict v1 filesystem project and mapped local state both verify successfully.

## Summary Checklist

- [ ] Valid `tau.json` remains the only project-existence authority.
- [ ] Manifest, library-state, and composed UI types are separate; serialization is explicit.
- [ ] `$schema` is the sole manifest version field; strict v1 is generated and becomes immutable when released.
- [ ] The v1 schema and every nested object reject unknown properties.
- [ ] `assets` contains exactly `main`; `assets.main.entryPath` is required and `thumbnail` is optional.
- [ ] `author`, `discipline`, and speculative additional asset keys are absent.
- [ ] The thumbnail owner alone performs overwrite-safety checks for a declared thumbnail path.
- [ ] Parameters live only in canonical per-entry sidecars.
- [ ] Local state contains only `lastActivityAt`, `deletedAt`, and revision state.
- [ ] Activity is decided by project-domain events, never raw filesystem timestamps.
- [ ] Soft delete leaves files recoverable; permanent delete is journaled and explicit.
- [ ] The one-off workspace cutover quiesces the target origin, rejects duplicate IDs, globally preflights without mutation, and verifies strict v1 files plus exact seeded state before cleanup.
- [ ] No draft parser, manifest migration/recovery subsystem, or second schema URL ships.
- [ ] Legacy object-store conversion emits strict v1 plus mapped local state and clears a row only after both verify.
- [ ] No new listing cache or persistent projection is added without measurements and a separate authority contract.

## References

- Research: `docs/research/tau-json-project-library-state-boundary.md`
- Research: `docs/research/project-updated-at-activity-boundary.md`
- Research: `docs/research/headless-thumbnail-rendering-architecture-v4.md`
- Related: `docs/policy/storage-policy.md`
- Related: `docs/policy/filesystem-authority-policy.md`
- Related: `docs/policy/library-api-policy.md`
- Related: `docs/policy/vision-policy.md`
