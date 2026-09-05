---
name: repos
description: Investigate dependency source code and manage external repos via Tau's public catalog plus optional private Tau Brain overlay. Use when investigating how a library works internally, exploring dependency source, debugging third-party behavior, adding a source to track, or contributing upstream.
---

# Repo Catalogs

Tau tracks optional external source checkouts with one public CLI and up to two fixed local catalogs:

- `<tau-root>/repos.yaml` contains OSS maintenance sources.
- `<tau-root>/repos/tau-brain/repos.yaml` is the optional private overlay for authorized team research.
- Every checkout lives under `<tau-root>/repos`, regardless of which catalog owns it.

The catalogs are source-investigation tooling. Tau install, build, test, and runtime workflows must work without `repos/`, either catalog checkout, or Tau Brain credentials.

## Setup

Public contributors need no setup beyond cloning Tau. Commands read the public catalog when Tau Brain is absent.

Authorized team members clone the optional overlay once:

```bash
GIT_LFS_SKIP_SMUDGE=1 gh repo clone taucad/tau-brain repos/tau-brain
```

Run `git lfs install` before cloning if reference PDFs are needed. Tau Brain defaults to lightweight LFS pointers; fetch a specific PDF with:

```bash
git -C repos/tau-brain lfs pull --include="reference/pdf/<slug>.pdf"
```

## Catalog Semantics

- Reads default to `all`: merge public plus private when the overlay exists, otherwise use public only.
- `--catalog public` reads only the standalone public catalog, even if a present private overlay is malformed.
- `--catalog private` requires Tau Brain and filters resolved repos/groups to private owners.
- New entries default to private. Publishing metadata to Tau requires explicit `--catalog public`.
- `remove`, `fork`, `unfork`, and description hydration update the catalog that owns the repo.
- Private groups may reference public repo definitions. Public groups cannot reference private definitions.
- CLI, JSON, and TUI output label every repo and group with its owning catalog.

## Quick Reference

```bash
# Interactive merged view
pnpm repos

# Inspect
pnpm repos list --json
pnpm repos list --catalog public --json
pnpm repos list --catalog private --json
pnpm repos list --groups --json
pnpm repos status --all --catalog all --json

# Add: private by default, public only when explicitly published
pnpm repos add owner/repo -g <private-group>
pnpm repos add owner/repo --catalog public -g public-maintenance
pnpm repos add owner/repo -b main -d "Description" -c abc123

# Remove and fork: owner is inferred
pnpm repos remove <name>
pnpm repos fork <name>
pnpm repos unfork <name>

# Clone / sync
pnpm repos clone <name>
pnpm repos clone --group <group>
pnpm repos clone --group <group> --catalog private
pnpm repos clone --all --catalog public
pnpm repos sync --all

# Run a command across cloned sources
pnpm repos exec --group <group> -- git status
```

Short flags are `-g` (group), `-b` (branch), `-c` (commit), `-d` (description), and `-p` (path).

When a private add is attempted without Tau Brain, the CLI fails closed with the authorized setup command. Rerun with `--catalog public` only when the source is genuinely required for public OSS maintenance; the CLI never publishes by fallback.

## Manifest Shape

Public catalog:

```yaml
version: 1
repos_dir: repos
owner: taucad
groups:
  public-maintenance:
    repos:
      - shiki
repos:
  shiki:
    upstream: shikijs/shiki
    branch: main
```

Private overlay:

```yaml
version: 1
groups:
  example-group:
    repos:
      - shiki # may resolve from public
      - example-private-source
repos:
  example-private-source:
    upstream: owner/repository
```

The private file cannot define `owner` or `repos_dir`. Names, clone paths, and groups cannot collide across catalogs. Repo paths must remain under `<tau-root>/repos`.

Repo fields:

- `upstream`: canonical `owner/repo` slug.
- `fork`: writable fork slug; absence means origin is upstream.
- `branch`: branch checked out by clone.
- `commit`: optional reproducible commit pin; disables shallow clone.
- `path`: optional path relative to `<tau-root>/repos`.
- `description`: human-readable provenance.
- `shallow`: clone at depth one when no commit pin exists.

## Source Investigation Workflow

For these maintained sources, read the Tau-side maintenance owner before entering the optional checkout, then verify against that checkout's current instructions and source:

| Source                      | Maintenance owner                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OpenCascade.js / libcascade | [Bindings, builds and release evidence](../../../docs/architecture/dependency-maintenance/opencascade-js.md)    |
| Replicad                    | [Geometry and consumer contracts](../../../docs/architecture/dependency-maintenance/replicad.md)                |
| libassimp                   | [Native/WASM and package maintenance](../../../docs/architecture/dependency-maintenance/libassimp.md)           |
| Tau Cloud                   | [Deployment, storage and environment ownership](../../../docs/architecture/dependency-maintenance/tau-cloud.md) |

1. Run `pnpm repos list --json` and search the merged view.
2. Clone a tracked source with `pnpm repos clone <name>`.
3. If absent, add it privately with `pnpm repos add owner/repo --clone`.
4. Read the checkout under `repos/<name>` rather than `node_modules`; it provides history, unminified source, and upstream tests.
5. Use `pnpm repos fork <name>` before contributing through a taucad fork.

## Build

The checked `scripts/dist/repos.mjs` bundle powers CLI commands without a build step. The interactive TUI bundle is gitignored and built with:

```bash
pnpm nx build scripts
```

Source lives in `scripts/src/repos/`; the build produces `dist/repos.mjs` and `dist/repos-tui.mjs`.
