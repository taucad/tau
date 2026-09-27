import { makeCylinder } from 'replicad';

export const defaultParams = {};

/** Purchased 2207 motor housing envelope; supplier drawing controls actual fit. */
export function buildMotorBase() {
  const flange = makeCylinder(14, 3);
  const bearingCarrier = makeCylinder(5.5, 21.1, [0, 0, 2.9]);
  const holes = [-8, 8].flatMap((x) =>
    [-8, 8].map((y) => makeCylinder(1.5, 3.2, [x, y, -0.1])),
  );
  return flange
    .fuse(bearingCarrier)
    .cutAll([
      makeCylinder(2.6, 24.2, [0, 0, -0.1]),
      makeCylinder(4.55, 21.1, [0, 0, 3]),
      ...holes,
    ]);
}

export default function main() {
  return [
    {
      shape: buildMotorBase(),
      name: 'motor-base',
      color: '#252b33',
      metalness: 0.7,
      roughness: 0.35,
    },
  ];
}
