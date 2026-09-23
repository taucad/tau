/**
 * Front cover / output-bearing plate. Locates into the housing rim with a lip,
 * carries the output-shaft bore, counterbored bolt holes, and a central boss.
 */
import { drawCircle, makeCylinder, type Shape3D } from 'replicad';
import {
  COVER_R,
  COVER_Z0,
  COVER_Z1,
  COVER_LIP_Z,
  HOUSE_IN_R,
  OUTPUT_BORE_D,
  N_BOLTS,
  BOLT_CIRCLE_R,
  BOLT_SHAFT_D,
  BOLT_HEAD_D,
  BOLT_HEAD_H,
} from './params.js';

export function makeCover(): Shape3D {
  // Main plate
  let cover = drawCircle(COVER_R)
    .sketchOnPlane('XY', COVER_Z0)
    .extrude(COVER_Z1 - COVER_Z0) as Shape3D;

  // Locating lip that drops into the housing bore
  const lip = makeCylinder(HOUSE_IN_R - 0.15, COVER_Z0 - COVER_LIP_Z).translateZ(COVER_LIP_Z);
  cover = cover.fuse(lip);

  // Output-shaft bore through the cover
  const bore = makeCylinder(OUTPUT_BORE_D / 2, (COVER_Z1 - COVER_LIP_Z) + 2).translateZ(COVER_LIP_Z - 1);
  cover = cover.cut(bore);

  // Counterbored bolt holes
  for (let k = 0; k < N_BOLTS; k++) {
    const a = (k * 2 * Math.PI) / N_BOLTS + Math.PI / N_BOLTS;
    const x = BOLT_CIRCLE_R * Math.cos(a);
    const y = BOLT_CIRCLE_R * Math.sin(a);
    const shaft = makeCylinder(BOLT_SHAFT_D / 2, COVER_Z1 - COVER_Z0 + 2).translate([x, y, COVER_Z0 - 1]);
    const head = makeCylinder(BOLT_HEAD_D / 2, BOLT_HEAD_H + 0.01).translate([x, y, COVER_Z1 - BOLT_HEAD_H]);
    cover = cover.cut(shaft).cut(head);
  }

  return cover;
}

export default function main(): Shape3D {
  return makeCover();
}
