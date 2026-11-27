# Helix Heat X

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/cacb49206a8f6f8f04d09a631ff12fe52b55de7f) at commit `cacb49206a8f6f8f04d09a631ff12fe52b55de7f`.

- Upstream source: `examples/helixheatx/helixHeatX.ts`, `examples/helixheatx/helpers.ts`, `examples/helixheatx/run.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry. `helixHeatX.ts` skips the preview-only thread cutters the C# Task discards; the part is byte-identical.
- Memory: every intermediate is freed at its last use (`dispose()`, `{ consume: true }`, `pico.scope()`), so the part builds at finer voxel sizes inside the 4 GiB heap; the output is byte-identical to the version that frees nothing.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
