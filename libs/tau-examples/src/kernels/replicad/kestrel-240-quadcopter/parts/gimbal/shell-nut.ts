import { drawPolysides, makeCylinder, type Shape3D } from 'replicad';

// Nominal M2 nut envelope. Thread helix is intentionally not a manufacturing definition.
export const defaultParams = { thickness: 1.5 };
export function buildShellNut(p = defaultParams): Shape3D {
  if (p.thickness <= 0) {
    throw new Error('Nut thickness must be positive.');
  }
  return drawPolysides(2.1, 6)
    .sketchOnPlane('XY')
    .extrude(p.thickness)
    .cut(makeCylinder(1.1, p.thickness + 2, [0, 0, -1]));
}
export default function main(p = defaultParams) {
  return buildShellNut(p);
}
