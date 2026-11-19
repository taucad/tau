---
host: minor
cli: minor
---

The durable compute store is keyed by project identity, not by where the project lives. `computeStoreWorkspace(root)` from `@taucad/host` names a root's store by its `.tau/project.json` identity, reading the main worktree's identity for a linked Git worktree, so a project's worktrees, Tau's linked checkouts and plain copies share one store and start warm. A root with no identity keeps its path, as before. `tau mcp`, `tau serve` and Tau Desktop connect through it. Stores that were keyed by a project's path are left behind in the `compute` folder and are not migrated.
