---
runtime: patch
---

`tauRuntime()` now excludes the kernel glue loaders (`replicad-opencascadejs/{single,multi}/init`, `libcascade/init` and `libcascade/{single,multi}/init`) from Vite's dependency optimizer. A prebundled loader was copied into `.vite/deps/` without its Emscripten glue, so a Vite development server failed to load the OpenCascade kernel with "Failed to fetch dynamically imported module …/replicad_single.js".
