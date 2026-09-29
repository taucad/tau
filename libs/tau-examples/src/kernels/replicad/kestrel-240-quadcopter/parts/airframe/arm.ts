import { makeCylinder } from 'replicad';
import { nacaProfile } from '../../lib/naca.js';
import { rootClampBlank } from './root-clamp.js';
export const defaultParams = { sweep: 28.6 };
export function buildArmBlank(p = defaultParams) {
  return nacaProfile(48, 0.24, 0.9)
    .sketchOnPlane('XZ')
    .extrude(Math.hypot(p.sweep, 65), { extrusionDirection: [p.sweep, 65, 0] })
    .translate([-14.4, 0, 0]);
}
export function buildArm(p = defaultParams) {
  const length = Math.hypot(p.sweep, 65);
  return buildArmBlank(p).cutAll([
    makeCylinder(
      4.2,
      length + 4,
      [(-p.sweep * 2) / 65, -2, 0],
      [p.sweep, 65, 0],
    ),
    // Clearance pocket for a qualified bonded joint; bond strength is a release gate.
    makeCylinder(16.15, 16, [p.sweep, 65, -8]),
    rootClampBlank()
      .scale(1.01)
      .rotate((Math.atan2(-p.sweep, 65) * 180) / Math.PI)
      .translate([(p.sweep * 12) / 65, 12, 0]),
    // Front fairings pass through the shell fastener stations.
    ...(p.sweep < 0 ? [makeCylinder(2.65, 32, [13.4, 3, -16])] : []),
  ]);
}
export default function main(p = defaultParams) {
  return buildArm(p);
}
