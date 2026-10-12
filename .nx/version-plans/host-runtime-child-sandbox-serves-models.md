---
occt-core: patch
esbuild: patch
host: patch
cli: patch
---

The built Tau Host runtime child serves models under Node's permission model, without `--allow-addons`, `--allow-worker` or `--allow-child-process`. Before, it never became ready, because `@gltf-transform/functions` loads the `sharp` native addon at import, and it could not render a replicad model past that. `@taucad/cli`'s runtime child now resolves `sharp` to a module that throws only when called while addons are refused. `@taucad/occt-core`'s `detectMultiThreadSupport` declines the pthread build where the permission model refuses worker threads, so replicad and OpenCascade pick their single-threaded OCCT builds there. `@taucad/esbuild` runs esbuild-wasm on its own thread where the permission model refuses child processes. `@taucad/host` gives each runtime child a private temp directory as its `os.tmpdir()` and lets it read that directory, so a bundling kernel can import the bundle it writes there.
