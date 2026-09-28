# Rover Wheel

Tau adapter for the PicoVoxel community example from [taucad/picovoxel](https://github.com/taucad/picovoxel/tree/11c51188a8f4cc754a25bde77e07c107523f7986) at commit `11c51188a8f4cc754a25bde77e07c107523f7986`.

- Upstream source: `examples/roverwheel/randomWheel.ts`, `examples/roverwheel/run.ts`, `examples/roverwheel/treadPatterns.ts`, `examples/roverwheel/wheelContext.ts`, `examples/roverwheel/wheelElements.ts`, `examples/roverwheel/wheelTread.ts`, `examples/roverwheel/wheels.ts`
- License: Apache-2.0; the copied source headers remain authoritative.
- Adaptation: `main.ts` supplies Tau's injected `Pico` session and returns only renderable geometry.
- Expected cost: heavy; increase `voxelSize` for a faster coarse preview.
