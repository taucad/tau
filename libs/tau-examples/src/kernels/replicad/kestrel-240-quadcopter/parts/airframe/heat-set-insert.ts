import { makeCylinder } from 'replicad';
export const defaultParams = {};
export function buildInsert() {
  // Purchased M2.5 insert envelope; supplier controls knurl and thread geometry.
  return makeCylinder(1.75, 4).cut(makeCylinder(1.025, 6, [0, 0, -1]));
}
export default function main() {
  return buildInsert();
}
