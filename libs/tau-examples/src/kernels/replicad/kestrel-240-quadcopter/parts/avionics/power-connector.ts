import { drawRoundedRectangle, makeCylinder } from 'replicad';

export const defaultParams = {};

/** Polarized two-pole connector envelope; supplier current rating must be selected. */
export function buildPowerConnector() {
  return drawRoundedRectangle(10, 10, 2)
    .sketchOnPlane('XY')
    .extrude(5)
    .cutAll(
      [-3, 3].map((y) => makeCylinder(1.25, 1.7, [3.5, y, 2.5], [1, 0, 0])),
    );
}

export default function main() {
  return [
    {
      shape: buildPowerConnector(),
      name: 'power-connector-envelope',
      color: '#e8a721',
      roughness: 0.55,
    },
  ];
}
