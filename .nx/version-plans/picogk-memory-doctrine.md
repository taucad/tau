---
picogk: patch
---

The `cad-picogk` authoring skill now tells agents to free large intermediate `Voxels` at their last use with `using var` or `Dispose()`. The browser kernel holds every grid in one 4 GiB WebAssembly heap and nothing pages them out. When a browser build runs out of memory, agents free live intermediates before coarsening the voxel size.
