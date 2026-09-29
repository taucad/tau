/**
 * Planet carrier (output member): a plate above the gear plane carrying three
 * pins on the carrier circle, with an integral output shaft toward +Z.
 */
import { drawCircle, makeCylinder, type Shape3D } from 'replicad';
import {
  CARRIER_R,
  CARRIER_PLATE_R,
  CARRIER_PLATE_Z0,
  CARRIER_PLATE_Z1,
  PIN_D,
  PIN_Z0,
  PIN_Z1,
  N_PLANETS,
  OUTPUT_SHAFT_D,
  OUTPUT_SHAFT_Z,
} from './params.js';

export function makeCarrier(): Shape3D {
  // Top plate
  let carrier = drawCircle(CARRIER_PLATE_R)
    .sketchOnPlane('XY', CARRIER_PLATE_Z0)
    .extrude(CARRIER_PLATE_Z1 - CARRIER_PLATE_Z0) as Shape3D;

  // Three planet pins hanging down from the plate
  for (let k = 0; k < N_PLANETS; k++) {
    const a = (k * 2 * Math.PI) / N_PLANETS;
    const x = CARRIER_R * Math.cos(a);
    const y = CARRIER_R * Math.sin(a);
    const pin = makeCylinder(PIN_D / 2, PIN_Z1 - PIN_Z0).translate([x, y, PIN_Z0]);
    carrier = carrier.fuse(pin);
  }

  // Output shaft toward +Z
  const shaftLen = OUTPUT_SHAFT_Z - CARRIER_PLATE_Z1;
  const shaft = makeCylinder(OUTPUT_SHAFT_D / 2, shaftLen).translateZ(CARRIER_PLATE_Z1);
  carrier = carrier.fuse(shaft);

  return carrier;
}

export default function main(): Shape3D {
  return makeCarrier();
}
