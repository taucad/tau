---
runtime: minor
---

A comment-only or formatting-only edit to a model is now a build-cache hit for every kernel that resolves its sources through the runtime bundler. The build key carries a new `bundle` dependency (`BundleDependency`, the SHA-256 of the bundled output) in place of those sources' content hashes; the files stay in `dependencies` with their content hashes and enter the key by path. Requested view `content` is keyed with its operation defaults applied. An executed module is kept across an edit that prints the same bundle. Keys change shape, so durable compute stores rebuild their entries once after the upgrade.
