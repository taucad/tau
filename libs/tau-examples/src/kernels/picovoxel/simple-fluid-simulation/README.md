# Simple Fluid Simulation

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/802d86da6e6120a472b045fddb306ce0dfa5d5f8) at commit `802d86da6e6120a472b045fddb306ce0dfa5d5f8`.

- Upstream source: `examples/simulation/run.ts`, `examples/simulation/simpleFlowDevice.ts`, `examples/simulation/simpleFluidSimulationInput.ts`, `examples/simulation/simpleFluidSimulationOutput.ts`
- License: CC0-1.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
