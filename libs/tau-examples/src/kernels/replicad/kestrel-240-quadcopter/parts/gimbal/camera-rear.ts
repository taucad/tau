import { makeSphere, makeCylinder, makeBox, type Shape3D } from 'replicad';

export const defaultParams = { radius: 15.5, wall: 1.8 };
export function buildCameraRear(p = defaultParams): Shape3D {
  if (p.radius < 15.5 || p.wall < 1.8 || p.wall > 3) {
    throw new Error('Camera radius must be >=15.5 and wall 1.8..3 mm.');
  }
  const shell = makeSphere(p.radius).cut(makeSphere(p.radius - p.wall));
  return shell
    .fuseAll([
      ...[-10.5, 10.5].map((z) => makeCylinder(3.6, 8, [-4, 0, z], [1, 0, 0])),
      makeCylinder(3.3, 4, [5, 13.4, 0], [0, 1, 0]),
      makeCylinder(3.3, 4, [5, -13.4, 0], [0, -1, 0]),
    ])
    .intersect(makeBox([0.15, -30, -30], [30, 30, 30]))
    .cutAll([
      makeCylinder(1.55, 40, [5, -20, 0], [0, 1, 0]),
      ...[-10.5, 10.5].map((z) => makeCylinder(1.1, 12, [-6, 0, z], [1, 0, 0])),
    ]);
}
export default function main(p = defaultParams) {
  return buildCameraRear(p);
}
