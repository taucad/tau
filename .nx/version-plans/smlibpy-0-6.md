---
smlibpy: minor
---

Run smlibpy 0.6.2 (from 0.3.5). Models gain the library's new drawing, picture, molding, face and sheet editing, IGES import and OpenCASCADE `.brep` APIs, and the `cad-smlibpy` skill's API reference describes them; the old keyword names (`tol=`, `angle_tol=`, `loc=`, `curvature_tol=`, `round=`) still work for a release with a `DeprecationWarning`. Whole-body meshes of moved tori now close at the seam, so the worker no longer falls back to per-face meshes, and it frees the kernel's polygons as soon as it has read each triangle's face.

Increment the kernel and compute producer versions to invalidate geometry, export and `.smb` caches created with smlibpy 0.3.5.
