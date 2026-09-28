import { drawRoundedRectangle, makeCylinder } from 'replicad';

export const defaultParams = {};

/** Populated flight-controller envelope; not an electronic fabrication design. */
export function buildFlightController() {
  const board = drawRoundedRectangle(25, 25, 2)
    .sketchOnPlane('XY')
    .extrude(1.6);
  const components = drawRoundedRectangle(14, 14, 2)
    .sketchOnPlane('XY', 1.5)
    .extrude(3.1);
  return board
    .fuse(components)
    .cutAll(
      [-10, 10].flatMap((x) =>
        [-10, 10].map((y) => makeCylinder(1.1, 5, [x, y, -0.1])),
      ),
    );
}

export default function main() {
  return [
    {
      shape: buildFlightController(),
      name: 'flight-controller-envelope',
      color: '#18453d',
      roughness: 0.65,
    },
  ];
}
