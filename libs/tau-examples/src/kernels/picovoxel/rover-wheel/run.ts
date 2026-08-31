// Port of LEAP71_RoverWheel Examples/Ex_WheelShowCase.cs (Apache-2.0, © LEAP 71).
// Headless: preview/screenshot/STL-path plumbing is dropped — the tasks
// return the constructed voxel fields (export via voxels.toMesh().toStl()).

import type { Pico, Voxels } from 'picovoxel';
import { randomWheel } from './randomWheel.ts';
import { wheel02 } from './wheels.ts';

/** C# `PresetWheelTask` — builds Wheel_02, the upstream showcase default. */
export function presetWheelTask(pk: Pico): Voxels {
  return wheel02(pk);
}

/** C# `RandomWheelTask` — one seeded randomized wheel (seed replaces the C# index). */
export function randomWheelTask(pk: Pico, seed: number): Voxels {
  return randomWheel(pk, seed);
}
