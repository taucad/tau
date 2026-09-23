/** Sun gear with integral input shaft. */
import { makeCylinder, type Shape3D } from 'replicad';
import { externalGearProfile } from './gear.js';
import { Z_SUN, GEAR_W, INPUT_SHAFT_D, INPUT_SHAFT_Z } from './params.js';

export function makeSun(): Shape3D {
  const gear = externalGearProfile(Z_SUN)
    .sketchOnPlane('XY', -GEAR_W / 2)
    .extrude(GEAR_W) as Shape3D;

  // Input shaft toward -Z, with a small flat (D-shaft) for torque transfer.
  const shaftLen = -GEAR_W / 2 - INPUT_SHAFT_Z;
  let shaft = makeCylinder(INPUT_SHAFT_D / 2, shaftLen).translateZ(INPUT_SHAFT_Z);
  // D-flat
  const flat = makeCylinder(INPUT_SHAFT_D, shaftLen)
    .translate([INPUT_SHAFT_D / 2 + INPUT_SHAFT_D * 0.42, 0, INPUT_SHAFT_Z]);
  shaft = shaft.cut(flat);

  return gear.fuse(shaft);
}

export default function main(): Shape3D {
  return makeSun();
}
