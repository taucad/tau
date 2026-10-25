---
runtime: minor
brep: minor
gltf: minor
opencascade: minor
picovoxel: minor
replicad: minor
zoo: minor
---

A kernel definition may implement `observedHeapBytes(context)`, the bytes of WebAssembly linear memory its instance has committed, read for observation only: unlike `heapBytes(context)` it never reaches `Rendering.heapBytes` and never feeds a host's worker recycling, so nothing about when a worker recycles changes. OpenCascade and Replicad read their OCCT memory, BRep its occt-import-js memory, glTF its Draco decoder's memory once a Draco-compressed import has loaded it, PicoVoxel the memory of each warm runtime, and Zoo its KCL module's memory once a parse has loaded it. No runtime reads the hook yet.
