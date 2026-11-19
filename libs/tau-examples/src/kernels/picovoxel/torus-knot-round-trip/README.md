# Torus Knot Round Trip

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/cacb49206a8f6f8f04d09a631ff12fe52b55de7f) at commit `cacb49206a8f6f8f04d09a631ff12fe52b55de7f`.

- Upstream source: `demo/main.ts (buildKnot)`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` builds the torus-knot tube itself (float32-identical to three.js `TorusKnotGeometry(8, 2.5, 128, 24)`) instead of importing `three`, then voxelizes it.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
