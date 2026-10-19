---
title: 'Project Manifest Policy'
description: 'Authority contract for the strict first-release tau.json manifest, host-local project library state, lifecycle overlays, and filesystem-first discovery.'
status: active
created: '2026-07-13'
updated: '2026-10-19'
related:
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/filesystem-policy.md
  - docs/policy/revisions-policy.md
  - docs/policy/library-api-policy.md
  - docs/policy/runtime-api-policy.md
  - docs/policy/storage-policy.md
  - docs/policy/vision-policy.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
  - docs/research/project-updated-at-activity-boundary.md
  - docs/research/tau-json-project-library-state-boundary.md
  - docs/research/tau-json-manifest-failure-recovery-blueprint.md
  - docs/research/picogk-entry-isolation-blueprint.md
---

# Project Manifest Policy

Internal reference for the `tau.json` project manifest and its boundary with host-local project library state. It defines which facts are portable project content, which facts are local application state, and how filesystem discovery and the local overlay compose without creating two project authorities.

> **Status: active** — this is the first-release v1 contract. The unreleased draft implementation cuts directly to it as specified by `docs/research/tau-json-project-library-state-boundary.md`; a narrow conversion of the immediately preceding prerelease manifest preserves existing cloud IDs without a general migration framework.

## Rationale

Tau's filesystem-first model makes project intent reachable to users, agents, CLIs, Git, and every host. That does not mean every browser-library fact belongs in a portable file. Trash state, semantic recent-project ordering, and chat revision pointers have no faithful filesystem representation and are meaningless to a headless consumer without the corresponding local application state.

The governing invariant is:

> `tau.json` is the sole portable authority for project existence and declarative content. `ProjectLibraryState` is a narrow host-local overlay for lifecycle and application state that the filesystem cannot express. Neither source mirrors the other's fields, and only a discovered manifest with a readable identity can establish a project.

## Authority Table

| Concern                             | Authoritative home                                      | Examples                                                          |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Portable project declaration        | `/tau.json`                                             | schema URL, name, description, tags, and the main asset           |
| Authored or generated project files | Project filesystem                                      | entry paths, `.tau/parameters/<entryPath>.json`, asset thumbnails |
| Generated project identity          | `.tau/project.json`                                     | versioned, validated `projectId`; protected host-owned metadata   |
| Host-local library lifecycle        | `projectLibraryStates` object store                     | `lastActivityAt`, `deletedAt`                                     |
| Host-local revision pointer         | `projectLibraryStates` object store                     | `revisionState` while chats remain browser-local                  |
| Physical storage binding            | `ProjectFileSystemConfig` in `tau-fs-handles`           | backend, workspace ID, storage root                               |
| Rebuildable presentation cache      | Memory only unless separately justified by measurements | React Query project results, thumbnail object URLs                |

## Rules

### 1. A declaration and resolved identity establish project existence

A directory containing a recognized `tau.json` whose generated identity resolves (Rule 15) on a configured storage root **is** a project. A defective declaration degrades that project and never removes it. Discovery scans `/projects/*/tau.json`; no object-store row may create a project, suppress discovery of an active project, or substitute for a missing manifest.

A pending linked-remote bootstrap is a quarantined provisional directory, not a project. Its protected operation marker proves only recovery ownership and never substitutes for `tau.json`. Discovery admits it only after the reviewed Git tree and setup revision verify and manifest-last publication completes. A local import remains a valid project when its later remote push is pending or refused.

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

The manifest schema and every nested object are strict. Unknown properties in a document claiming the v1 schema are validation errors; they are not silently retained. The degraded reader (Rule 15) reports them and drops them from its view; no writer ever round-trips them. A future extension requires a deliberately revised contract or a separately designed explicit extension point.

**Why**: The pre-release draft's combination of `.loose()` schemas, `ProjectManifest = Project & …`, and `{ ...project }` serialization let top-level `thumbnail` and later runtime fields leak onto disk despite not being part of the typed contract.

CORRECT:

```typescript
const manifest: ProjectManifest = {
  $schema: projectManifestSchemaUrl,
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

The current and only supported URL is `https://tau.new/schemas/tau-v1.json`. `tau.json` carries that URL in `$schema` and does not duplicate the same fact in `schemaVersion`.

Because no manifest contract has shipped, Tau replaces the draft implementation at that URL before release. Readers accept the exact v1 URL and strict v1 shape; an unknown or malformed URL returns a structured unsupported-schema issue without mutating bytes. Only the explicitly named conversion API accepts the exact previous prerelease URL and strict ID-bearing shape; ordinary readers do not.

The published JSON Schema is generated from the strict Zod schema. Once v1 is released, its URL and bytes are immutable. A future incompatible contract receives a new URL only when that contract is actually designed.

This URL rule applies to Tau-owned, user-visible JSON documents that expose `$schema`. Other durable formats still require one explicit version discriminator appropriate to their format, but must not carry two synchronized representations of the same version.

### 5. V1 declares exactly one first-class main asset

`assets` is a strict object with exactly one required `main` property. `main` declares:

- `entryPath`: the normalized project-relative file that starts evaluation;
- optional `thumbnail`: the unique Tau-managed project-relative WebP output slot associated with that asset.

`entryPath` is preferred over `entry`, `file`, `source`, or `path`: it matches Tau's established public vocabulary and describes both the file kind and its role. This manifest value is canonical, project-relative, and has no leading `/`. A runtime consumer may pass it unchanged as `source.path`; plugin authors receive the same root-relative identity. `main` names the file a project opens first; it is not a registry of models. Any other source file opens and evaluates as its own entry without a declaration, and a kernel that compiles several files resolves each entry's sources itself (`docs/research/picogk-entry-isolation-blueprint.md`). Tau supports mechanical projects only. Additional asset keys, a `discipline` constant, and an arbitrary asset map have no current consumer and are forbidden. They may be deliberately designed when a workflow actually requires a second declared asset.

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

**Why**: The draft `assets.mechanical` shape conflated classification with identity. `assets.main` describes the one real entry without repeating an unused classification or prematurely designing multi-entry behavior. The thumbnail belongs beside the entry that owns it instead of at the manifest root. A second model in a project needs a second source file, not a second asset key; an agent that added one bricked a project before Rule 15 existed.

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

External writers edit the manifest itself. The app converges by watching, re-parsing, and replacing only the manifest slice of the composed project view; local library state remains untouched. A defective external edit is surfaced on the open project (Rule 15) and is never silently ignored. Machine-origin write guards and coalescing prevent write/watch loops.

Agent file tools are external writers with a gate. A `tau.json` write through an agent tool or the ACP filesystem must parse strictly without identity fields; otherwise it is refused with the exact issues. Generated `.tau/project.json` is inaccessible through authored agent views. Deleting `tau.json` through an agent tool is refused.

When importing a Git history, validate the pinned declaration before reserving local identity. Use stable remote repository binding for duplicate recognition. An unassociated new clone receives a new local ID, including when its source declaration has a validated previous prerelease ID. Existing authenticated cloud and established local bindings preserve their IDs. Conflicts require explicit resolution and never re-identify another local project. Any declaration conversion belongs to the reviewed setup revision, preserving the imported parent.

The thumbnail owner writes bytes to the path declared by the target asset. Parameter owners write only canonical sidecars. Neither generated write counts as project activity.

### 11. Listing optimization is measured and cannot become authority

The current Projects query uses React Query for in-memory caching/deduplication and filesystem events plus polling for convergence. The first-release cutover adds no second discovery cache. Measure cold and repeated listing before adding another layer; a performance miss is separate work, not permission to mirror manifest content into local lifecycle state.

A persistent manifest projection is not part of the current design. If measured cold-start scale later justifies one, it must be explicitly rebuildable, fingerprinted against the manifest, and unable to establish existence or overwrite filesystem content. It remains distinct from authoritative `ProjectLibraryState`.

### 12. Preserve prerelease IDs through one narrow conversion

The strict parser and all writers use the id-free manifest and new schema URL. The separately named legacy converter recognizes only the exact previous `https://tau.new/schemas/tau-schema-v1.json` contract with a validated ID. It returns an identity candidate and new declaration; it is not an alternate normal parser or a general version-migration registry.

Shared XState actors establish the same generated identity before conditionally replacing the exact original manifest bytes. Existing durable identity, trusted cloud identity and legacy identity must agree. On replacement conflict retain the sidecar, reread and refuse contradictory evidence; never roll back identity or mint another ID. A restart converges on the same record.

Cloud open seeds the authenticated cloud ID before pull. Convert only the current working tree after verified materialization, including historical restore; historical objects and remote repository/database keys remain unchanged. Conversion is an ordinary local revision change. The separate legacy object-store conversion emits the new strict manifest and explicit durable identity, and verifies both before clearing the old row.

### 13. Non-project spaces carry no manifest

Ephemeral preview/converter mounts and server-rendered publication surfaces are not projects and must not write `tau.json`. Manifest presence is the discriminator Rule 1 depends on; scratch spaces use purpose-specific inputs instead of a fake project record.

### 14. Manifests are untrusted input and paths come from discovery

Readers bound bytes before `JSON.parse`, validate through the selected strict schema, and classify each entry by Rule 15: a declaration defect degrades the entry, while an identity failure quarantines only that entry with a structured reason that names the problem. Physical provider paths come exclusively from the discovery `ProjectLocator`. A validated generated `projectId` is logical identity and may name a virtual route only after duplicate-ID detection; it is never joined into a provider path.

### 15. Identity and declarations have separate failure states

`readProjectManifestBytes` in `@taucad/types` reads the declaration only. Strict valid bytes are usable; a recognized defective declaration yields a normalized, write-protected view with exact issues. Unreadable, oversized or foreign-schema bytes remain quarantined. No parser generates identity.

The shared `@taucad/project-core/identity` XState lifecycle resolves `.tau/project.json`, a strict `{version: 1, projectId}` record, using injected read, random-ID generation and atomic create-if-absent actors. Concurrent initializers reread the winning record. Trusted evidence conflicts are explicit refusals; path hashes, directory basenames and fresh-per-read random fallbacks are forbidden. Read-only storage may reuse a record or an explicit host-local stable binding; otherwise report persistence unavailable.

Discovery carries `projectId` beside `manifest` and physical `locator`. Initialize only after recognizing a declaration or validated legacy conversion. Explicit native host admission may bootstrap identity before a declaration exists, preserving empty-directory `tau serve`; the sidecar alone never establishes project existence. A named runtime `Project` may compose `id` with declaration fields, but it is never serialized wholesale.

Keep generated identity hidden from agent views and exclude it from normal revisions and portable shares. Watch identity changes and invalidate resolved bindings through the owning machine. A raw copy retaining the sidecar retains identity and follows duplicate quarantine; explicit Duplicate creates a fresh identity. A move preserving the record retains identity.

Degraded views are lossy. Refuse implicit writes while degraded; explicit Repair alone canonicalizes them and is unavailable for JSON syntax errors. Adopt restores a remembered route identity only after fresh uniqueness verification. Duplicate resolution changes bindings without rewriting project content. Preserve both manifest and generated identity through partial deletion failure.

**Why**: Authoring a declaration must not require minting an ID, while a broken declaration must not erase an established route, chats or recovery ownership.

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
- Expanding the narrow prerelease conversion into a general compatibility framework.
- Clearing a legacy object-store row before its final strict v1 filesystem project and mapped local state both verify successfully.
- Quarantining a project whose identity reads because its declaration is defective.
- Writing a degraded manifest other than through an explicit Repair, or offering Repair for a JSON syntax error.
- Silently ignoring a defective external or agent edit of an open project's manifest.
- Declaring another source file in `assets` so that it can be evaluated.

## Summary Checklist

- [ ] An identifiable `tau.json` remains the only project-existence authority; a declaration defect degrades and never removes a project.
- [ ] Degraded manifests are surfaced with their exact issues, write-protected, and canonicalized only by an explicit Repair.
- [ ] Agent `tau.json` writes parse strictly without identity fields; agent deletion of `tau.json` is refused.
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
- [ ] Prerelease conversion persists matching identity before exact-byte conditional replacement and preserves cloud repository IDs.
- [ ] Normal parsing accepts only the new URL; the narrow named converter alone accepts the previous strict prerelease contract.
- [ ] Legacy object-store conversion emits strict v1 plus mapped local state and clears a row only after both verify.
- [ ] No new listing cache or persistent projection is added without measurements and a separate authority contract.

## References

- Research: `docs/research/tau-json-project-library-state-boundary.md`
- Research: `docs/research/project-updated-at-activity-boundary.md`
- Research: `docs/research/headless-thumbnail-rendering-architecture-v4.md`
- Research: `docs/research/tau-json-manifest-failure-recovery-blueprint.md`
- Research: `docs/research/picogk-entry-isolation-blueprint.md`
- Related: `docs/policy/storage-policy.md`
- Related: `docs/policy/filesystem-authority-policy.md`
- Related: `docs/policy/library-api-policy.md`
- Related: `docs/policy/vision-policy.md`
