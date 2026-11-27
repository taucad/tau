# Implicit Super Ellipsoid

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/cacb49206a8f6f8f04d09a631ff12fe52b55de7f) at commit `cacb49206a8f6f8f04d09a631ff12fe52b55de7f`.

- Upstream source: `examples/shapekernel/ex-implicit-super-ellipsoid.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Classification: reference — the pointed variant (exponents 0.25) is not a distance field the voxelizer can sample faithfully: its volume moves by up to 45% between nearby voxel sizes and its mesh stays open (1,248 open edges at 0.02 mm, also with padded bounds); it stays out of the default model set (`example.json` kind `reference`).
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
