# Filesystem

`libs/filesystem` owns virtual paths, mount routing, provider composition, rooted views, mutations, and watch semantics. `apps/libs/fs-client` owns UI file-manager facades. Follow `docs/policy/filesystem-policy.md`, `docs/policy/filesystem-authority-policy.md`, and `docs/policy/event-fanout-policy.md`.

## Owners

`WorkspaceFileService` is a composition root, not an implementation: its own surface is topology (mounts, project routes, project-directory lifecycle, external-change polling, storage-root teardown) plus the per-path primitives trusted composition still calls. Add work to the owner, not to the Service.

- `mutation-pipeline.ts` — every write: locks, commit, cache/index bookkeeping, events, batch semantics, move/copy/duplicate porcelain.
- `rooted-views.ts` — one captured mount per view; confined, mask-checked reads, writes and porcelain; `ESTALE` after its mount goes.
- `tree-index.ts` — one `TreeIndex` per root behind `TreeIndexes`; serves rooted `search`/`statTree` with no provider walk. Topology changes evict only affected roots; path-less reset/dispose may clear all.
- `content-ops/` — `walk`, `contents`, `archive`: pure reads over the port at `@taucad/filesystem/content-ops`. The only place ZIP encoding lives.
- `path-registry.ts` — owns `PathRegistry` rows and `tauPathPolicy`; the mechanism core accepts an injected `PathPolicy` and never imports this module.
- `project-routes.ts` — the only speller of `/projects/<id>`, `/checkouts/<id>`, `/previews/<id>`, `/node_modules`; read `MountEntry.kind`, never `segments[1]`.
- `project-directories.ts` — discovery, pending commit, adopt, permanent delete, manifest I/O; the only L1 module that names `ProjectManifest`.
- `external-change-ingest.ts`, `remote-changes.ts`, `backend/scope.ts` — normalised facts from each backend's declared `observe()` capability and the storage-scope discriminant. No `backend === '…'` branch outside `backend/`.

Revision algorithms are not here: `@taucad/revisions/algorithms`. Revision effect owners are `git-tree-id`, `handle-table`, `case-collisions`, `apply-tree`, `chat-effects`, `sync-queue`, `revision-projection`, and `remotes`; capture owns a 64 MiB per-checkout `(path,size,mtimeMs)` memo with a 2 s racy guard, and apply stages one batch. `import-boundary.test.ts` keeps the filesystem/revisions boundary closed.

## Local invariants

- Canonicalize at ingress before routing or provider I/O. `WorkspaceFileService` owns mount lifecycle and longest-prefix resolution.
- A rooted view captures one exact mount, confines every operation to its prefix, preserves full write/watch behavior, and fails closed after that mount disappears. It must never fall through to a broader mount.
- Use rooted views instead of adding parallel `*Scoped` methods to filesystem clients or services.
- `composeView` and revision capture take an injected `PathPolicy`; composition sites pass `tauPathPolicy`. A non-default revision policy also passes its own rows to `generatedIgnoreContent`.
- Every rooted bridge open declares `'user'`, `'agent'` or `'working-copy'`; `'working-copy'` is unmasked and trusted only. The fs-client owner keys connections by `(root, consumer)`.
- Implement batch writes through the canonical per-resource mutation path. Completion requires durable provider commit, writer-side cache and tree updates, and exact-path event delivery.
- Keep dependency-scoped kernel watches separate from coalesced directory-scoped UI observation. Preserve exact virtual paths; enter conservative resync only for explicit information-loss signals.
- Normalize provider quirks at the provider boundary. `FileSystemAccessProvider` filters Chromium `.crswap` atomic-write artifacts before directory snapshots reach generic consumers.
- Use `FileStat` from `@taucad/types` as the one stat result shape; provider adapters normalize their metadata into it.

Validate with `pnpm nx lint filesystem`, `pnpm nx test filesystem --watch=false`, `pnpm nx typecheck filesystem`, and `pnpm nx build filesystem`.
