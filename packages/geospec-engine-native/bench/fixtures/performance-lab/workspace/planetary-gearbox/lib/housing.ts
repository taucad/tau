/**
 * Housing: a cup that holds the fixed ring gear, with a back wall carrying the
 * input-shaft bore, a rear mounting flange, and bolt bosses for the cover.
 */
import { drawCircle, makeCylinder, type Shape3D } from 'replicad';
import {
  HOUSE_IN_R,
  HOUSE_OUT_R,
  FLANGE_R,
  BACK_Z0,
  BACK_Z1,
  WALL_Z1,
  INPUT_BORE_D,
  N_BOLTS,
  BOLT_CIRCLE_R,
  BOLT_SHAFT_D,
  MOUNT_HOLE_D,
  MOUNT_CIRCLE_R,
} from './params.js';

export function makeHousing(): Shape3D {
  // Outer cup (solid), then bore the cavity
  let body = drawCircle(HOUSE_OUT_R)
    .sketchOnPlane('XY', BACK_Z0)
    .extrude(WALL_Z1 - BACK_Z0) as Shape3D;

  // Rear mounting flange
  const flange = drawCircle(FLANGE_R)
    .sketchOnPlane('XY', BACK_Z0)
    .extrude(BACK_Z1 - BACK_Z0) as Shape3D;
  body = body.fuse(flange);

  // Internal cavity that seats the ring gear, from inner back face to front rim
  const cavity = makeCylinder(HOUSE_IN_R, WALL_Z1 - BACK_Z1 + 1).translateZ(BACK_Z1);
  body = body.cut(cavity);

  // Input-shaft bore through back wall
  const bore = makeCylinder(INPUT_BORE_D / 2, BACK_Z1 - BACK_Z0 + 2).translateZ(BACK_Z0 - 1);
  body = body.cut(bore);

  // Cover bolt holes (blind tapped bosses, modelled as through for simplicity of seat)
  for (let k = 0; k < N_BOLTS; k++) {
    const a = (k * 2 * Math.PI) / N_BOLTS + Math.PI / N_BOLTS;
    const x = BOLT_CIRCLE_R * Math.cos(a);
    const y = BOLT_CIRCLE_R * Math.sin(a);
    const h = makeCylinder(BOLT_SHAFT_D / 2, WALL_Z1 - BACK_Z1 + 1).translate([x, y, BACK_Z1]);
    body = body.cut(h);
  }

  // Rear mounting holes through the flange
  for (let k = 0; k < N_BOLTS; k++) {
    const a = (k * 2 * Math.PI) / N_BOLTS;
    const x = MOUNT_CIRCLE_R * Math.cos(a);
    const y = MOUNT_CIRCLE_R * Math.sin(a);
    const h = makeCylinder(MOUNT_HOLE_D / 2, BACK_Z1 - BACK_Z0 + 2).translate([x, y, BACK_Z0 - 1]);
    body = body.cut(h);
  }

  return body;
}

export default function main(): Shape3D {
  return makeHousing();
}
