---
name: clean-disk
description: >-
  Quickly audits or deletes a conservative allowlist of reproducible developer
  caches to reclaim disk space. Use when disk space is low or the user asks to
  inspect, clean, prune, or remove development cache and build-tool data.
argument-hint: '[dry|delete]'
---

# Clean Disk

Run from the Tau workspace root:

```bash
CLEAN_DISK_REPO="$(git rev-parse --show-toplevel)" .agents/skills/clean-disk/scripts/clean-disk.sh "${1:-dry}"
```

`/clean-disk` and `/clean-disk dry` are read-only. Report the available space
before and after, the candidate total, and each candidate path. Do not describe
the candidate total as guaranteed recovery.

Run `/clean-disk delete` only when the current user explicitly requests
deletion and has seen a current dry run, or a recurring cleanup already has
explicit authorization. Run a fresh dry audit before each authorized deletion. The script skips open cache trees and
revalidates every fixed path immediately before deletion.

For the automation, include registered Tau worktrees explicitly:

```bash
CLEAN_DISK_REPO="$(git rev-parse --show-toplevel)" .agents/skills/clean-disk/scripts/clean-disk.sh dry
# Repeat with delete when authorized.
```

This adds only `.nx/cache` and `node_modules/.vite`. Preserve all other `.nx`
state and installed dependencies. Skip workspace caches when builds, installs or
other Node processes are present (idle Nx daemons alone are allowed), open files
exist, paths resolve through symlink parents, Git tracks cache contents, or local
cache instructions require review. Read each worktree's root instructions before
the run; skip repositories whose instructions prohibit cleanup. Inspection failures
must preserve candidates. Processes can start between checks; defer cleanup when
concurrent work is expected.

Recent safe removals already covered by the home allowlist include npm, uv,
Node downloads, Codex runtime downloads, Homebrew, pnpm download caches and
Electron downloads. These are caches, not the pnpm store or installed packages.
Browser caches remain protected while open. Do not automate research deduplication,
worktree retirement, package outputs, Cargo targets, native delivery generations,
Rust toolchains or downloaded native sources: their retention requires current
reference and ownership review. Docker pruning and `pnpm store prune` remain
separate owning-tool operations under their existing authorization and idle checks.

The allowlist contains only package-manager and build-tool caches. Never extend
the run ad hoc to Codex state, Docker or Colima data, Git repositories or
worktrees, installed `node_modules` (except the named Vite cache), `target`, `out`, `build`, `dist`, Downloads, user
documents, application data, or merely ignored paths. Investigate those with
their owning tool and current references instead.

The script emits tab-separated records with sizes in KiB. A delete run must end
with `RECLAIMED_KIB`; report skipped paths and failures rather than broadening
the deletion scope.
