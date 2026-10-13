---
revisions: patch
host: patch
---

A chat asked to resolve a conflict can now read both sides of it. `createProjectRevisionsActor` in `@taucad/revisions` returns `readConflict(revision)`, which answers a conflicted revision's files as text (`RevisionConflictRead`: `base`, `ours`, `theirs`, with parametric, binary and other choose-one files marked `chooseOne` and carrying none). It reads the same terms as the Revisions pane's _Edit manually_.

`@taucad/host`'s `ProjectRevisions.history` gains `conflict(revision)`, so the agent's `revisions` tool answers its new `conflict` action on a disk host. With no revision, it reads the conflict waiting on the current branch.
