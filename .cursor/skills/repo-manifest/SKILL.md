---
name: repo-manifest
description: Manages external dependency repos via repos.yaml manifest. Clone, sync, fork, add, remove, and explore upstream source code. Use when exploring dependency source, contributing to upstream forks, cloning external repos, or when the user mentions repos.yaml, repo manifest, or upstream repos.
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

`-g` (group), `-b` (branch), `-d` (description), `-p` (path)

### Auto-populated Descriptions

When adding or cloning a repo without a description, the CLI automatically fetches it from GitHub via `gh repo view`.

## Reading the Manifest

Read `repos.yaml` directly for project landscape context without cloning:

```yaml
owner: taucad          # Org used for automated forking
repos:
  langchainjs:
    upstream: langchain-ai/langchainjs
    fork: taucad/langchainjs       # fork field = writable
    branch: feat/...
    description: LangChain.js - LLM framework
  three.js:
    upstream: mrdoob/three.js      # no fork = read-only
    branch: dev
```

- Repos with `fork` field: you can push to origin (the fork). Upstream is read-only.
- Repos without `fork`: origin points to upstream. Read-only exploration.

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

| Group | Purpose |
|---|---|
| `cad` | Core CAD/geometry: replicad, opencascade.js, manifold, OCCT, lib3mf, bitbybit |
| `slicers` | 3D printer slicers: BambuStudio, OrcaSlicer, PrusaSlicer |
| `ai` | AI/LLM frameworks: langchainjs, langgraphjs, ai |
| `3d` | 3D rendering: three.js, react-three-fiber, model-viewer, glTF-Transform |
| `dev-tools` | Dev tools: nx, pnpm, vscode, typescript-go, xstate |
| `tscircuit` | tscircuit EDA ecosystem |
| `zenfs` | ZenFS filesystem abstractions |

## For Agents

- Read `repos.yaml` first to understand what repos exist and their relationships
- Use `pnpm repos add <owner/repo> -g <group>` to add new repos (descriptions auto-fetched)
- Use `pnpm repos list --json` for structured output
- Use `pnpm repos clone --group <name>` to selectively clone only what you need
- All commands support `--json` for machine-readable output
- Clone is idempotent -- safe to re-run without checking state
- Runs on `node` natively (no tsx needed for headless commands)
