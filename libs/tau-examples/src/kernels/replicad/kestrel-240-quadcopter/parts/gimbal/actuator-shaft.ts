import { makeCylinder, type Shape3D } from 'replicad';

// Ø2.9 swept drive envelope; coupling, shaft shoulder and keyed drive await vendor selection.
export const defaultParams = { radius: 1.45, length: 4.6 };
export function buildActuatorShaft(p = defaultParams): Shape3D {
  if (p.radius <= 0 || p.length <= 0) {
    throw new Error('Drive envelope dimensions must be positive.');
  }
  return makeCylinder(p.radius, p.length);
}
export default function main(p = defaultParams) {
  return buildActuatorShaft(p);
}
