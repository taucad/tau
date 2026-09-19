# Filesystem

`libs/filesystem` owns virtual paths, mount routing, provider composition, rooted views, mutations, and watch semantics. `apps/libs/fs-client` owns UI file-manager facades. Follow `docs/policy/filesystem-policy.md`, `docs/policy/filesystem-authority-policy.md`, and `docs/policy/event-fanout-policy.md`.

## Owners

`WorkspaceFileService` is a composition root, not an implementation: its own surface is topology (mounts, project routes, project-directory lifecycle, external-change polling, storage-root teardown) plus the per-path primitives trusted composition still calls. Add work to the owner, not to the Service.

- `mutation-pipeline.ts` — every write: locks, commit, cache/index bookkeeping, events, batch semantics, move/copy/duplicate porcelain.
- `rooted-views.ts` — one captured mount per view; confined, mask-checked reads, writes and porcelain; `ESTALE` after its mount goes.
- `tree-index.ts` — one `TreeIndex` per root behind `TreeIndexes`; serves rooted `search`/`statTree` with no provider walk. Topology changes `clear()` every index.
- `content-ops/` — `walk`, `contents`, `archive`, capture: pure reads over the port at `@taucad/filesystem/content-ops`. The only place ZIP encoding lives.
- `project-routes.ts` — the only speller of `/projects/<id>`, `/checkouts/<id>`, `/previews/<id>`, `/node_modules`; read `MountEntry.kind`, never `segments[1]`.
- `project-directories.ts` — discovery, pending commit, adopt, permanent delete, manifest I/O; the only L1 module that names `ProjectManifest`.
- `external-change-ingest.ts`, `remote-changes.ts`, `backend/scope.ts` — normalised facts from each backend's declared `observe()` capability and the storage-scope discriminant. No `backend === '…'` branch outside `backend/`.

Revision algorithms are not here: `@taucad/revisions/algorithms`. `import-boundary.test.ts` holds these as rules with an empty allow-list — a new violation needs a new owner, not an entry.

## Local invariants

- Canonicalize at ingress before routing or provider I/O. `WorkspaceFileService` owns mount lifecycle and longest-prefix resolution.
- A rooted view captures one exact mount, confines every operation to its prefix, preserves full write/watch behavior, and fails closed after that mount disappears. It must never fall through to a broader mount.
- Use rooted views instead of adding parallel `*Scoped` methods to filesystem clients or services.
- The core never imports the path registry: `composeView` and capture take an injected `PathPolicy`; composition sites pass `tauPathPolicy`. A consumer declares `'user'`, `'agent'` or `'working-copy'` when it opens a rooted connection; `'working-copy'` is the unmasked surface and is trusted composition only.
- Implement batch writes through the canonical per-resource mutation path. Completion requires durable provider commit, writer-side cache and tree updates, and exact-path event delivery.
- Keep dependency-scoped kernel watches separate from coalesced directory-scoped UI observation. Preserve exact virtual paths; enter conservative resync only for explicit information-loss signals.
- Normalize provider quirks at the provider boundary. `FileSystemAccessProvider` filters Chromium `.crswap` atomic-write artifacts before directory snapshots reach generic consumers.
- Use `FileStat` from `@taucad/types` as the one stat result shape; provider adapters normalize their metadata into it.

Validate with `pnpm nx lint filesystem`, `pnpm nx test filesystem --watch=false`, `pnpm nx typecheck filesystem`, and `pnpm nx build filesystem`.
