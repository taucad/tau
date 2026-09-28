import { makeCylinder, makeSphere } from 'replicad';

export const defaultParams = {};

/** Purchased protected antenna envelope; no RF tuning claim. */
export function buildAntenna() {
  return makeCylinder(1.2, 38.6, [1.2, 0, 0], [1, 0, 0]).fuseAll([
    makeSphere(1.2).translate([1.2, 0, 0]),
    makeSphere(1.2).translate([39.8, 0, 0]),
  ]);
}

export default function main() {
  return [
    {
      shape: buildAntenna(),
      name: 'antenna-envelope',
      color: '#242a31',
      roughness: 0.8,
    },
  ];
}
