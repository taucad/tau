import { drawRoundedRectangle } from 'replicad';
export const defaultParams = {};
export function buildBatteryStrap() {
  // Closed-loop envelope of a purchased adjustable nylon webbing strap.
  const outer = drawRoundedRectangle(35.4, 37.4, 3.5)
    .sketchOnPlane('YZ')
    .extrude(10);
  const inner = drawRoundedRectangle(32.4, 34.4, 0.2)
    .sketchOnPlane('YZ', -1)
    .extrude(12);
  return outer.cut(inner).translate([-5, 0, 0]);
}
export default function main() {
  return buildBatteryStrap();
}
