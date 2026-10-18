---
opencascade: patch
replicad: patch
rhino: patch
picovoxel: patch
---

The OpenCascade and Replicad import detectors run in linear time. Their `/import.*from…/s` patterns backtracked from every `import` to the end of the entry, so a 512 KB entry took seconds before a kernel was chosen. They now match the `from` clause itself, and an ESM re-export from the kernel's module is detected too. A y-up Replicad STEP or STL export deletes the rotated copies it makes, instead of leaving a second B-rep of the model to a finalizer. The Rhino loader deletes every rhino3dm object a `.3dm` import obtains. Before, every render leaked the whole parsed file. PicoVoxel keeps only the fast lane's runtime warm: on the multi-threaded build, the serial runtime that an exact render, export or serial retry starts is released after that render.
