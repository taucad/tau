/** Internal ring gear: an annulus with an involute internal-tooth bore. */
import { drawCircle, type Shape3D } from 'replicad';
import { ringHoleProfile } from './gear.js';
import { RING_W, RING_OUTER_R, Z_RING } from './params.js';

export function makeRing(): Shape3D {
  const blank = drawCircle(RING_OUTER_R)
    .sketchOnPlane('XY', -RING_W / 2)
    .extrude(RING_W) as Shape3D;

  const hole = ringHoleProfile(Z_RING)
    .sketchOnPlane('XY', -RING_W / 2 - 1)
    .extrude(RING_W + 2) as Shape3D;

  return blank.cut(hole);
}

export default function main(): Shape3D {
  return makeRing();
}
