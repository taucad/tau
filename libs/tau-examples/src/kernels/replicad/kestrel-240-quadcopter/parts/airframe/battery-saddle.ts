import { drawRoundedRectangle, makeBox } from 'replicad';
import {
  bodyInner,
  batteryStrapStations,
} from '../../lib/airframe-geometry.js';
import { buildBatteryStrap } from './battery-strap.js';
export const defaultParams = {};
export function buildBatterySaddle() {
  const outer = drawRoundedRectangle(36, 41, 6)
    .sketchOnPlane('YZ', -64)
    .extrude(74);
  const inner = drawRoundedRectangle(33, 36, 1)
    .sketchOnPlane('YZ', -65)
    .extrude(76);
  const straps = batteryStrapStations.map((x) =>
    buildBatteryStrap().translate([x, 0, 0]),
  );
  return outer
    .cut(inner)
    .intersect(makeBox([-65, -30, -24], [11, 30, -13]))
    .intersect(bodyInner().scale(0.995, [-25, 0, 0]))
    .cutAll(straps);
}
export default function main() {
  return buildBatterySaddle();
}
