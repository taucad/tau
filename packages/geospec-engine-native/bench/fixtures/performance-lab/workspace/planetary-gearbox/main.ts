/**
 * 5:2 (2.5:1) single-stage planetary gearbox in a housing.
 *
 *   Ratio:  i = 1 + zR/zS = 1 + 72/48 = 2.5  (ring fixed, sun in, carrier out)
 *   Teeth:  sun 48, planet 12, ring 72; 3 planets on a 30 mm carrier circle.
 *
 * Assembly tree (exploded by colour):
 *   - Housing  : cup + rear flange + input bore
 *   - Ring gear: fixed internal-tooth annulus seated in the housing
 *   - Sun gear : input shaft (-Z)
 *   - Planets  : 3, on carrier pins
 *   - Carrier  : output shaft (+Z)
 *   - Cover    : front bearing plate, bolted to the housing
 */
import type { ShapeConfig } from 'replicad';
import { makeHousing } from './lib/housing.js';
import { makeRing } from './lib/ring.js';
import { makeSun } from './lib/sun.js';
import { makePlanet } from './lib/planet.js';
import { makeCarrier } from './lib/carrier.js';
import { makeCover } from './lib/cover.js';
import { CARRIER_R, N_PLANETS, Z_PLANET, Z_SUN, Z_RING } from './lib/params.js';

export const defaultParams = {};

export default function main(): ShapeConfig[] {
  const housing = makeHousing();
  const ring = makeRing();
  const sun = makeSun();
  const carrier = makeCarrier();
  const cover = makeCover();

  const basePlanet = makePlanet();
  const planets: ShapeConfig[] = [];
  for (let k = 0; k < N_PLANETS; k++) {
    const a = (k * 2 * Math.PI) / N_PLANETS;
    // Mesh phasing: planet must engage sun and ring simultaneously.
    // Kinematic constraint: planet rotation relative to carrier for proper sun-planet mesh
    //   phi_p = a * (Z_SUN / Z_PLANET) + pi/Z_PLANET (half-tooth offset for tooth-space alignment)
    const phase = a * (Z_SUN / Z_PLANET) + Math.PI / Z_PLANET;
    const p = basePlanet
      .clone()
      .rotate((phase * 180) / Math.PI, [0, 0, 0], [0, 0, 1])
      .translate([CARRIER_R * Math.cos(a), CARRIER_R * Math.sin(a), 0]);
    planets.push({ shape: p, color: '#C0392B', name: `Planet${k + 1}` });
  }

  return [
    { shape: housing, color: '#6B7280', alpha: 0.55, name: 'Housing' },
    { shape: ring, color: '#3B82F6', name: 'RingGear' },
    { shape: sun, color: '#F1C40F', name: 'SunGear' },
    ...planets,
    { shape: carrier, color: '#27AE60', alpha: 0.85, name: 'Carrier' },
    { shape: cover, color: '#9CA3AF', alpha: 0.55, name: 'Cover' },
  ];
}
