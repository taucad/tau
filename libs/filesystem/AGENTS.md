# Filesystem

`libs/filesystem` owns virtual paths, mount routing, provider composition, rooted views, mutations, and watch semantics. `apps/libs/fs-client` owns UI file-manager facades. Follow `docs/policy/filesystem-policy.md`, `docs/policy/filesystem-authority-policy.md`, and `docs/policy/event-fanout-policy.md`.

## Local invariants

- Canonicalize at ingress before routing or provider I/O. `WorkspaceFileService` owns mount lifecycle and longest-prefix resolution.
- A rooted view captures one exact mount, confines every operation to its prefix, preserves full write/watch behavior, and fails closed after that mount disappears. It must never fall through to a broader mount.
- Use rooted views instead of adding parallel `*Scoped` methods to filesystem clients or services.
- Implement batch writes through the canonical per-resource mutation path. Completion requires durable provider commit, writer-side cache and tree updates, and exact-path event delivery.
- Keep dependency-scoped kernel watches separate from coalesced directory-scoped UI observation. Preserve exact virtual paths; enter conservative resync only for explicit information-loss signals.
- Normalize provider quirks at the provider boundary. `FileSystemAccessProvider` filters Chromium `.crswap` atomic-write artifacts before directory snapshots reach generic consumers.
- Use `FileStat` from `@taucad/types` as the one stat result shape; provider adapters normalize their metadata into it.

Validate with `pnpm nx lint filesystem`, `pnpm nx test filesystem --watch=false`, `pnpm nx typecheck filesystem`, and `pnpm nx build filesystem`.
