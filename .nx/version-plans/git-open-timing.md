---
revisions: minor
host: minor
---

Opening a native-Git store no longer starts git-lfs when the store already holds git-lfs's filter keys. The port reads them from the store's `config` first. With the new `gitLfsInstalled` option, a store with none of the keys gets them written directly, exactly as `git lfs install --local --skip-repo` writes them, under Git's own `config.lock`. Without that option, or for a store whose values differ, the command runs as before. Adopted repositories are unchanged.

In `@taucad/host`, `createProjectRevisionPort` takes `gitLfsInstalled`, and `createProjectRevisions` passes it the toolchain probe's answer.
