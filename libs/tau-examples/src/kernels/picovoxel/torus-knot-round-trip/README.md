# Torus Knot Round Trip

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/11c51188a8f4cc754a25bde77e07c107523f7986) at commit `11c51188a8f4cc754a25bde77e07c107523f7986`.

- Upstream source: `demo/main.ts (buildKnot)`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` builds the torus-knot tube itself (float32-identical to three.js `TorusKnotGeometry(8, 2.5, 128, 24)`) instead of importing `three`, then voxelizes it.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
