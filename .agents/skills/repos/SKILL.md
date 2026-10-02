---
name: repos
description: Investigate dependency source code and manage external repos via repos.yaml. Use when investigating how a library works internally, exploring dependency source, reading upstream code, debugging third-party behavior, adding a new dependency to track, contributing to upstream forks, or when the user mentions repos.yaml, repo manifest, or upstream repos. Preferred over searching node_modules.
---

# Repo Manifest

Tau tracks ~47 external dependency repos via `repos.yaml` at the workspace root. Repos are cloned into `repos/` (gitignored). The manifest defines upstream URLs, taucad forks, branches, groups, and descriptions.

## Quick Reference

```bash
# Interactive TUI (humans)
pnpm repos

# Add / remove repos
pnpm repos add bitbybit-dev/bitbybit -g cad                # Add by owner/repo slug
pnpm repos add https://github.com/user/repo.git -g ai      # Add by GitHub URL
pnpm repos add owner/repo -g cad -b main -d "Description"  # With branch + description
pnpm repos add owner/repo -g cad -c abc123                 # Pin to specific commit
pnpm repos add owner/repo -g cad --clone                   # Add and clone immediately
pnpm repos remove bitbybit                                  # Remove from manifest
pnpm repos rm bitbybit                                      # Alias for remove

# Clone / sync
pnpm repos clone langchainjs              # Clone specific repo
pnpm repos clone --group cad              # Clone a group
pnpm repos clone --all                    # Clone everything
pnpm repos sync --all                     # Pull latest (ff-only)

# Inspect
pnpm repos list --json                    # All repos from manifest
pnpm repos list --cloned --json           # Only cloned repos
pnpm repos list --groups                  # Show groups
pnpm repos status --all --json            # Branch, dirty, ahead/behind

# Fork management
pnpm repos fork three.js                  # Fork upstream to taucad org
pnpm repos unfork three.js               # Revert to upstream-only

# Run commands across repos
pnpm repos exec --group cad -- git status
```

### Short Flags

`-g` (group), `-b` (branch), `-c` (commit), `-d` (description), `-p` (path)

### Auto-populated Descriptions

When adding or cloning a repo without a description, the CLI automatically fetches it from GitHub via `gh repo view`.

## Reading the Manifest

Read `repos.yaml` directly for project landscape context without cloning:

```yaml
owner: taucad # Org used for automated forking
repos:
  langchainjs:
    upstream: langchain-ai/langchainjs
    fork: taucad/langchainjs # fork field = writable
    branch: feat/...
    description: LangChain.js - LLM framework
  three.js:
    upstream: mrdoob/three.js # no fork = read-only
    branch: dev
```

- Repos with `fork` field: you can push to origin (the fork). Upstream is read-only.
- Repos without `fork`: origin points to upstream. Read-only exploration.
- Repos with `commit` field: pinned to a specific commit hash. Clone checks out that commit; sync verifies/restores it instead of pulling latest.

## Commit Pinning

Pin a repo to a specific upstream commit for reproducible snapshots:

```yaml
repos:
  ForgeCAD:
    upstream: KoStard/ForgeCAD
    fork: rifont/ForgeCAD
    commit: 48853a53c84c943ee95d329524837dd2103ead83
```

- `clone` checks out the pinned commit after cloning (detached HEAD)
- `sync` fetches all remotes then checks out the pinned commit (no `pull --ff-only`)
- `status` shows `✓ <hash>` or `✗ <hash>` to indicate whether HEAD matches
- Shallow clone (`--depth 1`) is disabled when a commit is pinned, since the target commit may not be at the branch tip

## Fork Workflow

To contribute changes upstream through a taucad fork:

1. `pnpm repos fork <name>` -- forks to taucad org, updates YAML and git remotes
2. Work in `repos/<name>/`, commit changes
3. `git push origin <branch>` -- pushes to taucad fork
4. Create PR from taucad fork to upstream via `gh pr create`

## Interactive TUI

Run `pnpm repos` with no arguments to launch the interactive terminal UI:

- **Up/Down** or **j/k** -- navigate repos
- **Left/Right** or **Space** -- toggle fork status (○ upstream / ● forked)
- **Enter** -- clone selected repo
- **s** -- sync selected repo, **S** -- sync all
- **/** -- filter by name or description
- **Tab / Shift+Tab** -- cycle through groups
- **q / Esc** -- quit

## Groups

| Group       | Purpose                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `cad`       | Core CAD/geometry: replicad, opencascade.js, manifold, OCCT, lib3mf, bitbybit |
| `slicers`   | 3D printer slicers: BambuStudio, OrcaSlicer, PrusaSlicer                      |
| `ai`        | AI/LLM frameworks: langchainjs, langgraphjs, ai                               |
| `3d`        | 3D rendering: three.js, react-three-fiber, model-viewer, glTF-Transform       |
| `dev-tools` | Dev tools: nx, pnpm, vscode, typescript-go, xstate                            |
| `tscircuit` | tscircuit EDA ecosystem                                                       |
| `zenfs`     | ZenFS filesystem abstractions                                                 |

## Build

The repos CLI is a bundled single-file script at `scripts/dist/repos.js` (checked into git). CLI commands work immediately with no build step.

The interactive TUI (`pnpm repos` with no args) requires a separate bundle with React/ink that is gitignored:

```bash
pnpm nx build scripts   # Build both CLI + TUI bundles
```

Source files live in `scripts/src/repos/`. The tsdown config at `scripts/tsdown.config.ts` produces two bundles:

- `dist/repos.js` — CLI bundle (~98 KB, checked in)
- `dist/repos-tui.js` — TUI bundle (~1.7 MB, gitignored, needs build)

## For Agents

- Read `repos.yaml` first to understand what repos exist and their relationships
- Use `pnpm repos add <owner/repo> -g <group>` to add new repos (descriptions auto-fetched)
- Use `pnpm repos list --json` for structured output
- Use `pnpm repos clone --group <name>` to selectively clone only what you need
- All commands support `--json` for machine-readable output
- Clone is idempotent -- safe to re-run without checking state
- CLI commands run from the checked-in bundle (no build step needed)
- TUI requires `pnpm nx build scripts` first

## Dependency Investigation Workflow

When you need to understand how a dependency works internally:

1. **Check the manifest**: Read `repos.yaml` or run `pnpm repos list --json` to see if the dependency is tracked
2. **If found**: `pnpm repos clone <name>` then explore `repos/<name>/`
3. **If not found**: `pnpm repos add <owner/repo> -g <group> --clone` to add and clone in one step
4. **Explore source**: Read files directly from `repos/<name>/`. Use Grep/SemanticSearch scoped to that directory.

Never explore `node_modules` for dependency source investigation. The `repos/` directory has full git history, unminified source, and test suites that `node_modules` lacks.
