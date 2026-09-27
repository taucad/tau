import { drawRoundedRectangle, makeCylinder } from 'replicad';
export const defaultParams = {};
export function rootClampBlank() {
  return drawRoundedRectangle(24, 18, 5)
    .sketchOnPlane('XY', -8)
    .extrude(16)
    .fillet(1);
}
export function buildRootClamp() {
  return rootClampBlank().cutAll([
    makeCylinder(4.15, 20, [0, -10, 0], [0, 1, 0]),
    ...[-8.5, 8.5].map((x) => makeCylinder(1.4, 18, [x, 0, -9])),
  ]);
}
export default function main() {
  return buildRootClamp();
}
