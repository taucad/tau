# Filesystem scene spike adapter contract

Source-only experiment on `spike/filesystem-scene-api-oct2026`, based on
`faecc9ac8f456b7fa5639fc0eb146012e3e499c8`. No production package export or
baseline UI writer changes. The renderer lane owns renderer integration.

`sceneViewSchema` extends the existing `workbenchViewSchema`, at the existing
`.tau/workbench/views/<id>.json` path. Additional fields: `assetDirectory`, a
canonical project-relative folder of direct `.glb` children; `lighting`, exactly
the existing `StudioLightingSettings` field names and defaults (see
`apps/ui/app/components/geometry/graphics/three/utils/lights.utils.ts`). Intensities
are finite 0–100; key size/exposure finite >0–100. Cameras, FOV, up direction,
display grid/axes and grid unit retain the existing workbench grammar. This
experiment's codec accepts these additions; production's strict codec does not.

A `SceneCandidate` has immutable metadata `revision` and `readAsset(digest)`
returning an owned copy of immutable GLB bytes. Asset IDs are SHA-256; geometryId
hashes the sorted path/digest inventory; revision.id also includes presentation.
No new compute cache or completed-part reference protocol is introduced.
Existing file references, URI resolution and assembly publication remain with
their owners. This spike accepts only embedded-resource GLB 2.0, not external
URI glTF, data URI resources, required extensions or CAD source evaluation.

`SceneAdapter.prepare(candidate, signal)` decodes/validates all geometry in
isolation and returns `{commit, dispose}`. `commit()` synchronously replaces the
visible geometry and applies the candidate presentation atomically. It must be
no-throw after preparation; failure-prone renderer work belongs in prepare.
`dispose()` is idempotent, non-throwing, and releases only that prepared resource
inventory. Superseded preparation is disposed without commit. The old inventory
is disposed only after successful replacement. `present(revision)` atomically
applies camera/lights/grid/axes with no geometry decode/evaluation and no-throw
semantics. Preserve these ownership rules in Three.js and native adapters.

The reconciler double-reads the complete bounded asset closure around a settling
interval, then validates and atomically replaces its in-memory revision pointer.
Watch events only accelerate this process; polling handles losses and startup
always re-reads actual files. Two equal scans establish a stable observation,
not a multi-file author transaction. Stage a complete replacement directory and
then change `assetDirectory` for coherent multi-asset author updates.

Last-known-good survives invalid writes during the running session. This spike
does **not** persist last-known-good across process restart: an invalid startup
has no visible revision. A production durable pointer must use the existing
host-owned workspace store, not a second cache or project control store.

The local source is Linux-only, read-only, rejects symlink components/hardlinks,
non-regular files, noncanonical paths, oversize files, changing opened files,
and opened identities not matching `/proc/self/fd`. It is an explicit local
experiment host, not a production filesystem authority or hostile-code sandbox.
Production composes an agent-rooted, policy-masked provider with the existing
single mutation authority. File data never authorizes secrets, permissions,
sharing, export publication, paid work, printer operations or arbitrary code.
