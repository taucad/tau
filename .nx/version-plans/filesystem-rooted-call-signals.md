---
filesystem: minor
---

Rooted and composed views now take an abort signal on `copyTree`, `duplicate`, `search` and `statTree`, and `withReadContentOps` takes one on `archive` and `contents` (the new `Abortable` type).

- `copyTree` checks the signal before it starts and hands it to each bounded changeset, so an abort stops the copy before the next changeset is applied.
- `duplicate` checks the signal before it reads and again before it writes.
- `search` and `statTree` check the signal once the root's index is open.
- `archive` and `contents` check the signal before reading each file.
