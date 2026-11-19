# Simple Fluid Simulation

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/cacb49206a8f6f8f04d09a631ff12fe52b55de7f) at commit `cacb49206a8f6f8f04d09a631ff12fe52b55de7f`.

- Upstream source: `examples/simulation/run.ts`, `examples/simulation/simpleFlowDevice.ts`, `examples/simulation/simpleFluidSimulationInput.ts`, `examples/simulation/simpleFluidSimulationOutput.ts`
- License: CC0-1.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
