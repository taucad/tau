# Implicit Random

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/802d86da6e6120a472b045fddb306ce0dfa5d5f8) at commit `802d86da6e6120a472b045fddb306ce0dfa5d5f8`.

- Upstream source: `examples/latticelibrary/ex-implicit-random.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Classification: reference — its thin random-lattice walls meet in non-manifold edges (753 at 0.5 mm, 207 at 0.35 mm); it stays out of the default model set (`example.json` kind `reference`).
- Expected cost: moderate; increase `voxelSize` for a faster coarse preview.
