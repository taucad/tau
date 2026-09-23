/** Planet gear with a central bore that rides on a carrier pin. */
import { makeCylinder, type Shape3D } from 'replicad';
import { externalGearProfile } from './gear.js';
import { Z_PLANET, GEAR_W, PLANET_BORE_D } from './params.js';

export function makePlanet(): Shape3D {
  const gear = externalGearProfile(Z_PLANET)
    .sketchOnPlane('XY', -GEAR_W / 2)
    .extrude(GEAR_W) as Shape3D;

  const bore = makeCylinder(PLANET_BORE_D / 2, GEAR_W + 2).translateZ(-GEAR_W / 2 - 1);
  return gear.cut(bore);
}

export default function main(): Shape3D {
  return makePlanet();
}
