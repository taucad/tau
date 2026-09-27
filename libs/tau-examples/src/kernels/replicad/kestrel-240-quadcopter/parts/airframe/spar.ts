import { makeCylinder } from 'replicad';
export const defaultParams = { length: 64 };
export function buildSpar(p = defaultParams) {
  if (p.length < 20) {
    throw new Error('Spar length must exceed 20 mm');
  }
  return makeCylinder(4, p.length, [0, 0, 0], [0, 1, 0]).cut(
    makeCylinder(2.5, p.length + 2, [0, -1, 0], [0, 1, 0]),
  );
}
export default function main(p = defaultParams) {
  return buildSpar(p);
}
