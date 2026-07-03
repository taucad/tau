/**
 * Harmonic damper / pulley as one revolved profile. Belt grooves, hub relief,
 * and the snout bore are encoded into the section.
 */
import type { Shape3D } from 'replicad';
import { revolvedX, type Point2 } from './helpers.js';
import { defaultParams, type Params } from './params.js';

export function makeDamper(p: Params = defaultParams): Shape3D {
  const radius = p.damperOuterDia / 2;
  const boreR = p.snoutDia / 2;
  const t = p.damperThk;
  const groovePitch = (t - 6) / p.damperGrooves;

  const points: Point2[] = [
    [0, boreR],
    [0, radius],
  ];
  for (let groove = 0; groove < p.damperGrooves; groove++) {
    const x = 3 + groove * groovePitch;
    points.push(
      [x, radius],
      [x + groovePitch * 0.24, radius - 5],
      [x + groovePitch * 0.56, radius - 5],
      [x + groovePitch * 0.8, radius],
    );
  }

  points.push(
    [t, radius],
    [t, boreR + 13],
    [8, boreR + 13],
    [8, boreR],
    [0, boreR],
  );
  return revolvedX(points);
}

export default makeDamper;
