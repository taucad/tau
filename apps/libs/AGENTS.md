# Private Application Libraries

Projects here are private application capabilities consumed from source. Their public imports use declared package exports even though they are not published packages.

## Local Rules

- Keep each project inside its Nx `scope:*` and `layer:*` boundary. Applications may depend on these libraries; `packages/**` and root `libs/**` may not.
- Export only supported entrypoints from `package.json`. Use those subpaths from consumers instead of reaching into another project's source tree.
- Keep dependency injection and environment composition in the consuming app. Library code should accept explicit ports and remain testable without booting an application.
- In `fs-client`, keep `FileContentService`, `FileTreeService`, and `WorkerChangeChannel` as UI facades over `@taucad/filesystem`. Filesystem authority events drive state; polling is a bounded fallback.
- In `lsp-fs`, keep the shared Tier 0 pool, Tier 1 JSON-RPC protocol, and the TypeScript-only Tier 2 synchronous channel. In `lsp`, keep URI normalization and Monaco worker composition. Follow [Language Contribution Policy](../../docs/policy/language-contribution-policy.md) and [Filesystem Policy](../../docs/policy/filesystem-policy.md).
- Follow [Workspace Project Policy](../../docs/policy/workspace-project-policy.md) and [Library API Policy](../../docs/policy/library-api-policy.md) when adding or changing an entrypoint.

## Checks

Read the project's `project.json`, then run its Nx lint, test, typecheck, and build targets as appropriate. Add consumer validation when an exported subpath or wire contract changes.
