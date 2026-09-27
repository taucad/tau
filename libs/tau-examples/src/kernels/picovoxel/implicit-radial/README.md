# Implicit Radial

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/802d86da6e6120a472b045fddb306ce0dfa5d5f8) at commit `802d86da6e6120a472b045fddb306ce0dfa5d5f8`.

- Upstream source: `examples/latticelibrary/ex-implicit-radial.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Classification: reference — its 0.5 mm TPMS walls are about one voxel thick, so the lattice has non-manifold edges at every practical voxel size; it stays out of the default model set (`example.json` kind `reference`). The default `voxelSize` is 0.7 mm (upstream 0.5 mm) so the lattice stays under the thumbnail renderer's 4,000,000-index accessor limit (3.42 M indices; 7.0 M at 0.5 mm).
- Expected cost: moderate; increase `voxelSize` for a faster coarse preview.
