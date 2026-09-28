import { makeCylinder } from 'replicad';

export const defaultParams = {};

/** Purchased bell/magnet-carrier envelope; no claim about vendor magnetic geometry. */
export function buildMotorBell() {
  const vents = Array.from({ length: 6 }, (_, index) => {
    const a = (index * Math.PI) / 3;
    return makeCylinder(1.5, 2.2, [8 * Math.cos(a), 8 * Math.sin(a), 20.6]);
  });
  return makeCylinder(14, 22.7).cutAll([
    makeCylinder(12, 20.8, [0, 0, -0.1]),
    makeCylinder(2.5, 23, [0, 0, -0.1]),
    ...vents,
  ]);
}

export default function main() {
  return [
    {
      shape: buildMotorBell(),
      name: 'motor-bell-envelope',
      color: '#20242b',
      metalness: 0.75,
      roughness: 0.26,
    },
  ];
}
