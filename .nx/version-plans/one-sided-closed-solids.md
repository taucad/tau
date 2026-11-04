---
geometry-core: minor
replicad: patch
smlib: patch
smlibpy: patch
jscad: patch
picovoxel: patch
opencascade: patch
brep: patch
rhino: patch
tscircuit: patch
zoo: patch
openrscad: patch
python-kernel-core: patch
build123d: patch
viewer: patch
---

Draw closed solids one-sided. Every kernel now writes the opaque material of a closed, outward-facing surface with `doubleSided: false`, using the new `isClosedTriangleMesh`, `markClosedMeshesSingleSided` and `markClosedGlbMeshesSingleSided` from `@taucad/geometry-core`, so the viewer culls back faces it could never see. That removes the dark dashes the surface depth bias let through at silhouettes and cuts GPU time per frame. A section cut shows a source's back faces while its census is pending, so a one-sided solid shades its cut instead of opening a hole until its caps land.
