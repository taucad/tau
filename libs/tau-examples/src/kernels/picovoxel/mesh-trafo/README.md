# Mesh Trafo

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/11c51188a8f4cc754a25bde77e07c107523f7986) at commit `11c51188a8f4cc754a25bde77e07c107523f7986`.

- Upstream source: `examples/shapekernel/ex-mesh-trafo.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and names the returned geometry at the final output boundary.
- Expected cost: moderate; increase `voxelSize` for a faster coarse preview.

The helper geometry is unchanged. Names are display labels and do not establish assembly identity.
