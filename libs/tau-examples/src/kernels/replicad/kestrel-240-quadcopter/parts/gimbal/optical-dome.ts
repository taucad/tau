import { makeSphere, makeCylinder, makeBox, type Shape3D } from 'replicad';

// Purchased optical window envelope; curvature is geometric, not an optical prescription.
export const defaultParams = { radius: 6.1, tailLength: 3 };
export function buildOpticalDome(p = defaultParams): Shape3D {
  if (p.radius <= 0 || p.tailLength <= 0) {
    throw new Error('Optical envelope dimensions must be positive.');
  }
  return makeSphere(p.radius)
    .intersect(makeBox([-20, -20, -20], [0, 20, 20]))
    .fuse(makeCylinder(p.radius, p.tailLength, [0, 0, 0], [1, 0, 0]));
}
export default function main(p = defaultParams) {
  return buildOpticalDome(p);
}
