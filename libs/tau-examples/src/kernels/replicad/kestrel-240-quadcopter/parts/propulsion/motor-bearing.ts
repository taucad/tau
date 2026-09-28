import { makeCylinder } from 'replicad';

export const defaultParams = {};

/** 5 x 9 x 3 mm purchased bearing interface envelope; races and balls are opaque. */
export function buildMotorBearing() {
  return makeCylinder(4.5, 3).cut(makeCylinder(2.5, 3.2, [0, 0, -0.1]));
}

export default function main() {
  return [
    {
      shape: buildMotorBearing(),
      name: 'motor-bearing-5x9x3-envelope',
      color: '#8c98a3',
      metalness: 0.9,
      roughness: 0.22,
    },
  ];
}
