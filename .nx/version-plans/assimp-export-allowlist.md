---
assimp: minor
---

Show only the export options a CAD export dialog offers: binary for STL, PLY and FBX, materials for OBJ, and unit and require manifold for 3MF. STL now defaults to binary. Every other libassimp option is hidden, and tau either leaves it at libassimp's default or sets it itself: 3MF files record Tau as their application, and a model whose meshes are only points exports with point clouds on. Size-limit and manifold failures now say what to change.

Increment the transcoder implementation version to invalidate export caches made with the previous options.
