---
build123d: minor
cli: minor
runtime: minor
native-process-core: minor
---

Ship Build123d's Python closure as a registry-native `tau-plugin.json` (python-build-standalone plus the target's PyPI wheels and the worker scripts, pinned by digest) with a CycloneDX SBOM and `build123dOptionsFromClosure`. The preparation host gains a plugin seal step that compiles the closure's bytecode inside the kernel sandbox and refuses a host missing a system library. `native-process-core` adds `runInNativeSandbox`. The CLI composes Build123d from a prepared closure and refuses an unprepared `.py` export with `KERNEL_NOT_PREPARED`.
