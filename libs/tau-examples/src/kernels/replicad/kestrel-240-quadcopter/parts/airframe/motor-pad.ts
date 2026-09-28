import { makeCylinder } from 'replicad';
export const defaultParams = { socketAngle: 0 };
export function buildMotorPad(p = defaultParams) {
  return makeCylinder(16, 12, [0, 0, -5])
    .fillet(1)
    .cutAll([
      makeCylinder(4.2, 14, [0, 0, -6]),
      ...[-8, 8].flatMap((x) =>
        [-8, 8].map((y) => makeCylinder(1.65, 14, [x, y, -6])),
      ),
      // M3 socket heads sit at Z1..3; leave a 4 mm mounting web above the seat.
      ...[-8, 8].flatMap((x) =>
        [-8, 8].map((y) => makeCylinder(2.9, 9, [x, y, -6])),
      ),
      // Radial spar socket opens at the inboard side; tube stops at the shaft bore.
      makeCylinder(4.2, 12.2, [0, -17, 0], [0, 1, 0]).rotate(
        p.socketAngle,
        [0, 0, 0],
        [0, 0, 1],
      ),
    ]);
}
export default function main(p = defaultParams) {
  return buildMotorPad(p);
}
