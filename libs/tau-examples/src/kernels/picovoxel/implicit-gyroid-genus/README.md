# Implicit Gyroid Genus

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/cacb49206a8f6f8f04d09a631ff12fe52b55de7f) at commit `cacb49206a8f6f8f04d09a631ff12fe52b55de7f`.

- Upstream source: `examples/shapekernel/ex-implicit-gyroid-genus.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Classification: reference — the genus sheet (0.05 mm gap) is thinner than a voxel at any practical size, so the mesh stays open (52 open edges at 0.35 mm, more when finer); it stays out of the default model set (`example.json` kind `reference`).
- Expected cost: moderate; increase `voxelSize` for a faster coarse preview.
