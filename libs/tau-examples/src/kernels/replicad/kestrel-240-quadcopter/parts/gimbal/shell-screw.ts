import {
  makeSphere,
  makeBox,
  makeCylinder,
  drawPolysides,
  type Shape3D,
} from 'replicad';

// Nominal M2 fastener with smooth thread envelope and domed socket head.
export const defaultParams = { length: 10 };
export function buildShellScrew(p = defaultParams): Shape3D {
  if (p.length <= 0) {
    throw new Error('Screw length must be positive.');
  }
  return makeSphere(1.8)
    .intersect(makeBox([-3, -3, -3], [3, 3, 0]))
    .fuse(makeCylinder(1, p.length))
    .cut(drawPolysides(0.8, 6).sketchOnPlane('XY', [0, 0, -2]).extrude(1.2));
}
export default function main(p = defaultParams) {
  return buildShellScrew(p);
}
