import type { Pico } from 'picovoxel';
import { presetWheelTask, randomWheelTask } from './run.js';

export const defaultParams = { voxelSize: 2, random: false, seed: 1 };
export default function main(pico: Pico, params = defaultParams) {
  return params.random ? randomWheelTask(pico, params.seed) : presetWheelTask(pico);
}

