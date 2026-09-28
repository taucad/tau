import { drawRoundedRectangle, makeCylinder } from 'replicad';

export const defaultParams = {};

/** Populated 4-in-1 ESC assembly envelope; electronic internals are opaque. */
export function buildEsc() {
  const board = drawRoundedRectangle(25, 25, 2)
    .sketchOnPlane('XY')
    .extrude(1.6);
  const components = drawRoundedRectangle(20, 16, 2)
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
      shape: buildEsc(),
      name: 'esc-envelope',
      color: '#18352e',
      roughness: 0.65,
    },
  ];
}
