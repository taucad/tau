---
geometry-core: minor
replicad: minor
smlib: minor
smlibpy: minor
jscad: minor
picovoxel: minor
opencascade: minor
brep: minor
tscircuit: minor
zoo: minor
openrscad: minor
python-kernel-core: minor
build123d: minor
viewer: minor
---

Draw closed solids one-sided. Every kernel now writes the opaque material of a closed, outward-facing surface with `doubleSided: false`, using the new `isClosedTriangleMesh`, `markClosedMeshesSingleSided` and `markClosedGlbMeshesSingleSided` from `@taucad/geometry-core`, so the viewer culls back faces it could never see. That removes the dark dashes the surface depth bias let through at silhouettes and cuts GPU time per frame. A section cut shows a source's back faces while its census is pending, so a one-sided solid shades its cut instead of opening a hole until its caps land.

Section caps build again in React StrictMode: the viewer's topology scheduler used to stay disposed after StrictMode's simulated unmount, so every census was discarded and cuts stayed uncapped; a submit after `dispose` now starts afresh.

Ambient occlusion fades out on faces seen within a few degrees of edge-on, where GTAO reports full occlusion; a one-pixel rim no longer prints as black dashes now that a solid's back faces no longer cover it.
