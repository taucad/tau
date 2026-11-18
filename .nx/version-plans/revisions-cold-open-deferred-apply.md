---
revisions: patch
---

A hosted project's files appear sooner on a cold open. The first tree write begins from the store's listing of paths, modes and sizes: it announces every file it will write, lands `tau.json` and the files it names as a changeset of their own, then reads each other file's bytes from the store one bounded changeset at a time as it lands them, instead of reading the whole tree into memory first. A file whose read fails fails the write, which puts the checkout back as before. `@taucad/revisions/apply-tree` exports `DeferredRevisionTree`, `isDeferredRevisionTree` and `readDeferredRevisionTree`, and a path-scoped tree read reads each tree object once. Files the write did not keep in memory are checked against the blob ids the store listed, hashed without holding up the worker's other reads.
