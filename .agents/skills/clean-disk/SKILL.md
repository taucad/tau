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
.agents/skills/clean-disk/scripts/clean-disk.sh "${1:-dry}"
```

`/clean-disk` and `/clean-disk dry` are read-only. Report the available space
before and after, the candidate total, and each candidate path. Do not describe
the candidate total as guaranteed recovery.

Run `/clean-disk delete` only when the current user explicitly requests
deletion and has seen a current dry run. The script skips open cache trees and
revalidates every fixed path immediately before deletion.

The allowlist contains only package-manager and build-tool caches. Never extend
the run ad hoc to Codex state, Docker or Colima data, Git repositories or
worktrees, `node_modules`, `target`, `out`, `build`, `dist`, Downloads, user
documents, application data, or merely ignored paths. Investigate those with
their owning tool and current references instead.

The script emits tab-separated records with sizes in KiB. A delete run must end
with `RECLAIMED_KIB`; report skipped paths and failures rather than broadening
the deletion scope.
