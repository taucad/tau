/**
 * A moving assembly for the viewer page e2e: the Codex 4:1 planetary project (from
 * `libs/tau-examples/src/kernels/replicad/planetary-gear-system`) trimmed to the ring, the sun, the carrier and one
 * planet, with one coupling and one animation. The gears are pitch-circle discs: the test checks that the mechanism
 * reaches the page, not the tooth form.
 */

import { drawCircle } from 'replicad';
import type { ShapeConfig } from 'replicad';

/** Sun and planet pitch radius, 24 teeth at module 2 (mm). */
const gearRadius = 24;
/** Planet centre distance, sun plus planet pitch radius (mm). */
const centreDistance = 2 * gearRadius;
const faceWidth = 14;

/**
 * The four parts, as built.
 *
 * @returns The ring, the sun, the carrier and the planet.
 */
export default function main(): ShapeConfig[] {
  const ring = drawCircle(87).cut(drawCircle(73)).sketchOnPlane('XY').extrude(faceWidth);
  const sun = drawCircle(gearRadius - 1)
    .sketchOnPlane('XY')
    .extrude(faceWidth);
  const carrier = drawCircle(centreDistance + 8)
    .sketchOnPlane('XY', -8)
    .extrude(5);
  const planet = drawCircle(gearRadius - 1)
    .translate(centreDistance, 0)
    .sketchOnPlane('XY')
    .extrude(faceWidth);
  return [
    { name: 'Internal Ring Gear', shape: ring, color: '#718293' },
    { name: 'Sun Gear', shape: sun, color: '#D0D6DD' },
    { name: 'Carrier', shape: carrier, color: '#285E88' },
    { name: 'Planet Gear', shape: planet, color: '#B7C1CA' },
  ];
}

/** The ring grounded; the sun drives the carrier at a quarter of its angle (Willis, 24 and 72 teeth). */
export const mechanism = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'ring',
  links: {
    ring: { shapes: ['Internal Ring Gear'] },
    sun: { shapes: ['Sun Gear'] },
    carrier: { shapes: ['Carrier'] },
    planet: { shapes: ['Planet Gear'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'ring', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
    carrier: { type: 'revolute', parent: 'ring', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
    planet: { type: 'revolute', parent: 'carrier', child: 'planet', origin: [centreDistance, 0, 0], axis: [0, 0, 1] },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 1 / 4 }],
  animations: [
    {
      id: 'four-sun-turns',
      name: 'Four sun turns',
      duration: 8,
      loop: 'repeat',
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 8, coordinates: { sun: 1440 } },
      ],
    },
  ],
};
