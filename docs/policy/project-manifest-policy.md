---
title: 'Project Manifest Policy'
description: 'Contract for tau.json project manifests and all Tau-owned on-disk file formats: placement, Zod schema source of truth, schemaVersion migrations, single-writer + watch-reload discipline, loop guards, and canonical artifact paths.'
status: draft
created: '2026-07-13'
updated: '2026-07-13'
related:
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/filesystem-policy.md
  - docs/policy/storage-policy.md
  - docs/policy/vision-policy.md
  - docs/research/headless-thumbnail-rendering-architecture-v4.md
  - docs/research/filesystem-first-policy-alignment.md
---

# Project Manifest Policy

Internal reference for the `tau.json` project manifest and for every on-disk file format Tau owns: where formats live, how they are schematized and versioned, who writes them, and how consumers converge on external changes.

> **Status: draft** — codifies the contract established by `docs/research/headless-thumbnail-rendering-architecture-v4.md` (R1–R3). Flips to `active` when that implementation lands. The rules are binding for that implementation and for any interim code touching project metadata or introducing a new on-disk format.

## Rationale

Project metadata in the IndexedDB object store is a black box: the agent cannot edit a title, a headless CLI shares the filesystem but not the browser's IndexedDB, and a webaccess user cannot manage projects from their own disk. Per `docs/policy/vision-policy.md` ("Files are the interface", "Hosts are peers"), anything an agent, CLI, or user must read or write lives in the project filesystem as a file with a schema. Files that multiple hosts write need explicit contracts — versioning, a single reload discipline, and loop guards — or they silently corrupt and self-trigger. This policy is that contract.

## Rules

### 1. The manifest is the project (content-addressed existence)

A directory containing a valid `tau.json` on a configured storage root **is** a project. Discovery is a scan (`/projects/*/tau.json` per root), not a registry lookup. A project directory dropped into a bound webaccess workspace must appear in the UI without an import step; the import wizard is a convenience for fetching content, never the source of existence.

**Why**: Any registry that must be told about a project locks out disk-level management and agent-driven project creation — the two hosts that never see the browser UI.

INCORRECT:

```typescript
// Existence gated on a store row — a directory on disk "doesn't exist" until registered
const projects = await objectStore.getProjects();
```

CORRECT:

```typescript
// Existence is the manifest on disk
const projects = await discovery.scanProjectRoots(); // parses /projects/*/tau.json per storage root
```

### 2. Placement: `tau.json` at the project root, user-visible

The manifest lives at `/projects/<id>/tau.json` — top level, not under `.tau/`. It is user-visible and user-editable by design; treat external edits as a feature, not a hazard to hide from.

**Why**: A hidden or nested manifest defeats the point — users and agents manage projects by managing files.

### 3. The Zod schema in `packages/types` is the single source of truth

The manifest shape is defined once as `projectManifestSchema` (Zod) in `packages/types`. A JSON Schema is **generated** from it (`z.toJSONSchema`) and published so external editors get validation and autocomplete via the manifest's `$schema` field. Never hand-edit the generated JSON Schema; never re-declare manifest fields in app code, worker code, or tests — import the schema.

**Why**: Two definitions of one on-disk format drift; the drift surfaces as data corruption on the next write, not as a type error.

### 4. Versioning: integer `schemaVersion`, forward-only migrations, structured rejection

Every Tau-owned on-disk format carries an integer `schemaVersion` (manifests start at `1`). Changes to the shape require:

- a new `schemaVersion`,
- a pure migration function `vN → vN+1` in the format's migration registry, applied on read and persisted on the next write,
- readers **rejecting** documents with a `schemaVersion` above their maximum with a structured "newer Tau required" error — never a best-effort partial parse.

**Why**: A best-effort parse of a newer document destroys the fields it didn't understand on the next write; a structured rejection preserves the file and tells the user what to do.

CORRECT:

```typescript
if (raw.schemaVersion > latestManifestVersion) {
  throw new ManifestVersionError({ found: raw.schemaVersion, supported: latestManifestVersion });
}
const manifest = projectManifestSchema.parse(migrateManifest(raw));
```

INCORRECT:

```typescript
// Silent tolerance of unknown versions — data loss on next write
const manifest = projectManifestSchema.passthrough().safeParse(raw).data ?? defaultManifest;
```

### 5. Single in-app writer; external writers converge via watch-reload

In-app, exactly one owner writes each format — for `tau.json`, the project machine. Components, hooks, and other machines request changes through that owner; they never write the file directly. External writers (agent, CLI, `$EDITOR` on a webaccess directory) write the file itself; the app converges by watching the path, re-parsing, validating, and hot-reloading state — the same participant pattern parameter files use.

**Why**: One writer means one serialization point and one validation path; watch-reload means external edits are first-class instead of being overwritten by stale in-app state.

### 6. Loop guards are mandatory

A format whose owner both writes and watches the same path must break the cycle explicitly:

- **Self-reload suppression**: machine-origin writes carry the origin (`source`/origin-tagging mechanism) and are excluded from triggering their own reload.
- **Activity exclusion**: `tau.json`, `thumbnail.webp`, and other generated artifacts are excluded from user-activity recency (`updatedAt` bumping, "Recent Projects" ordering).

**Why**: Without both guards, manifest persistence re-triggers itself (write → watch event → reload → write), and thumbnail regeneration reorders the project list as fake user activity.

### 7. Canonical artifact paths, not pointer fields

Well-known project artifacts live at canonical paths. Consumers resolve them by convention; the manifest carries **no pointer fields** duplicating a path the convention already fixes (there is no `thumbnail` field — presence of `/thumbnail.webp` is the contract).

| Path                            | Artifact                              | Writer                                        |
| ------------------------------- | ------------------------------------- | --------------------------------------------- |
| `/tau.json`                     | Project manifest                      | Project machine (in-app); any host (external) |
| `/thumbnail.webp`               | Project thumbnail                     | Thumbnail worker (browser); CLI export        |
| `/.tau/cache/**`                | Derived caches (geometry, parameters) | Runtime workers                               |
| `/.tau/export/preferences.json` | Export form preferences               | Exporter                                      |

**Why**: A pointer field and a path convention describing the same artifact inevitably disagree; conventions cannot dangle.

### 8. Non-project spaces carry no manifest

Ephemeral mounts (`CadPreviewProvider`'s `{ backend: 'memory' }` scratch spaces, the converter's working directories) and server-rendered surfaces (the publication viewer) are **not** projects and must not write manifests. Manifest presence is the discriminator Rule 1 depends on; polluting scratch space with manifests corrupts discovery.

### 9. Manifests are untrusted input

Discovery parses arbitrary bytes from disk (webaccess directories especially). Readers must bound the parse (size cap before `JSON.parse`), validate through the schema before using any field, and **never derive filesystem paths from manifest contents** — a project's path identity is where the manifest was _found_, never what its `id` field claims. Invalid manifests quarantine that one project with a visible reason — salvage over silent hiding.

**Why**: `joinPath('/projects', manifest.id)` with a hostile `id` escapes the project root; a silently skipped manifest looks like data loss to the user.

### 10. New on-disk formats adopt this policy wholesale

Any future Tau-owned file format (geospec evidence files, export presets, on-disk chat archives if that migration is ever scheduled) follows Rules 3–6: Zod source of truth in a shared package, published JSON Schema when the file is user-editable, integer `schemaVersion` with a migration registry and structured rejection, a single in-app writer with watch-reload, and loop guards when the owner watches its own writes.

**Why**: The manifest machinery (versioning, migration, rejection, reload) is the reusable heavy lifting; formats that skip it re-learn each failure mode separately.

## Anti-Patterns

- Mirroring manifest fields into an IndexedDB row "for faster listing" — that recreates the dual-source-of-truth this policy exists to end. Cache parse results in memory (the discovery service), never in a second persistent store.
- Writing `tau.json` from a component, hook, or test helper instead of routing through the project machine.
- Adding a manifest field that duplicates a canonical path (Rule 7) or embeds bytes (thumbnails are files, not base64 fields).
- Catching a schema-version rejection and substituting defaults — surface the structured error.
- Shipping a shape change without a migration function and version bump because "the field is optional".
- Registering scratch/preview directories in discovery by giving them manifests (Rule 8).
- Joining a manifest-declared `id` (or any manifest field) into a filesystem path — path identity comes from the manifest's location (Rule 9).

## Summary Checklist

- [ ] Format shape defined once in `packages/types` (Zod); JSON Schema generated, not hand-written.
- [ ] `schemaVersion` present; migration registry updated; newer-version reads rejected with a structured error.
- [ ] Exactly one in-app writer; all other in-app call sites route through it.
- [ ] Watch-reload participant converges external edits; machine-origin writes suppressed from self-reload.
- [ ] Generated artifacts excluded from activity recency.
- [ ] No pointer fields for canonical paths; no manifests in non-project spaces.

## References

- Research: `docs/research/headless-thumbnail-rendering-architecture-v4.md` (R1 manifest, R2 discovery, R14 activity hygiene, Finding 4)
- Research: `docs/research/filesystem-first-policy-alignment.md` (themes T1/T4/T6)
- Related: `docs/policy/storage-policy.md` (Rule 0 — what belongs in IndexedDB at all)
- Related: `docs/policy/filesystem-authority-policy.md` (discovery/watch plane, mount routing)
- Related: `docs/policy/vision-policy.md` ("Files are the interface", "Hosts are peers")
