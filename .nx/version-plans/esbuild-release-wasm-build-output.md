---
esbuild: patch
---

Release each build's output files, source map and metafile once the bundler has read them, so esbuild-wasm's browser service no longer keeps every edit's output alive.
