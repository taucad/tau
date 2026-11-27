---
revisions: minor
host: minor
---

Opening a native-Git store no longer starts git-lfs when the store already holds git-lfs's filter keys. The port lists them with one `git config --local --get-regexp`. With the new `gitLfsInstalled` option, it writes any missing key itself with `git config --local`, using exactly the value `git lfs install --local --skip-repo` writes. Without that option, or for a store whose values differ, the command runs as before. Adopted repositories are unchanged.

In `@taucad/host`, `createProjectRevisionPort` takes `gitLfsInstalled`, and `createProjectRevisions` passes it the toolchain probe's answer.
