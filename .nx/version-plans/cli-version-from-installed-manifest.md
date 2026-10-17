---
cli: patch
---

`tau --version` and the version in `tau --help` come from the `package.json` the CLI is installed with, rather than the copy inlined at build time, which stays as the fallback when that file cannot be read. A pkg.pr.new preview, whose manifests are rewritten to `0.0.0-preview-<sha>` after the build, now reports that version, so the agent plugin of the same preview runs it as the matching installed `tau`.
