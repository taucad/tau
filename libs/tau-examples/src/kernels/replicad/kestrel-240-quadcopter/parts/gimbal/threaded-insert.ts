import { makeCylinder, type Shape3D } from 'replicad';

// Purchased bonded M2 insert envelope. Choose knurl/adhesive from supplier before release.
export const defaultParams = { outerRadius: 1.6, boreRadius: 1.1, length: 4 };
export function buildThreadedInsert(p = defaultParams): Shape3D {
  if (p.boreRadius <= 0 || p.outerRadius <= p.boreRadius || p.length <= 0) {
    throw new Error('Invalid threaded insert envelope.');
  }
  return makeCylinder(p.outerRadius, p.length).cut(
    makeCylinder(p.boreRadius, p.length + 2, [0, 0, -1]),
  );
}
export default function main(p = defaultParams) {
  return buildThreadedInsert(p);
}
