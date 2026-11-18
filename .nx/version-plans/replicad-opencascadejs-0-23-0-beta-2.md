---
replicad: patch
---

Use `@taulabs/replicad-opencascadejs` 0.23.0-beta.2. A superseded render now stops inside a long batch boolean (`fuse`, `cut`, `cutAll`, `intersect`) or a mesh within milliseconds instead of finishing it first: the native progress break reads the same abort state the kernel already checks before every OpenCascade call. When nothing aborts, the delivered geometry is unchanged.
