---
bundler-core: patch
---

Install places peers as npm does: a package nests with its peer when that peer conflicts with a version beside it, and a peer that fits no level of a package the project does not depend on directly nests under that package, instead of refusing the install with `peer-conflict`.
