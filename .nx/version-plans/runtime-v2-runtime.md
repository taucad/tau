---
runtime: minor
---

fix(runtime)!: Replace the kernel and middleware authoring ABI with declared views/exports and resolve/describe/evaluate/render/write hooks. Registration metadata is serializable, write results are nonempty, and lifecycle teardown uses onDispose. Existing plugin-side geometry hook names and compatibility aliases are removed; the current client keeps only its temporary default-view bridge until W3.
