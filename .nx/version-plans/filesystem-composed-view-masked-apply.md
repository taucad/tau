---
filesystem: minor
---

`@taucad/filesystem`'s composed view now serves `apply(changeset)` over a checkout whose rooted surface applies changesets. Every entry's paths go through the view's mask before the mutation pipeline sees any of them: a hidden path refuses the whole changeset with `EPERM`, an agent's records path with `EROFS` (both with reason `WORKSPACE_MASKED_PATH`), and nothing is applied. A recursive delete and a move's source are checked for hidden paths below them, as `rmdir` and `rename` are. A checkout without `apply` still yields a view without one.
