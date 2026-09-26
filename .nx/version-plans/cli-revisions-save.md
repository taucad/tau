---
cli: minor
host: minor
---

Add `tau revisions save`, which records a project's files as a revision and backs it up through the same machines as the app's Save, and the `save()` verb on `openProjectRevisions` behind it. Revisions recorded through `openProjectRevisions` are now authored by the person running the host rather than `tau-host`.
