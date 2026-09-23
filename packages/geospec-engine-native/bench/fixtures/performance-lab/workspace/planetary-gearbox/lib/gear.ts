/**
 * Involute gear profile generator (2D drawings) for spur external and
 * internal (ring) gears. Standard full-depth 20-degree involute system.
 */
import { draw, drawCircle, type Drawing } from 'replicad';
import { MODULE, PRESSURE_ANGLE, BACKLASH } from './params.js';

const inv = (a: number) => Math.tan(a) - a; // involute function
const DEG = Math.PI / 180;

type Pt = [number, number];

/**
 * Builds the closed toothed loop (CCW) for a gear with `z` teeth.
 * For external gears the loop is the outer material boundary.
 * For internal gears the loop is the inner (hole) boundary.
 */
function toothedLoop(z: number, internal: boolean): Pt[] {
  const m = MODULE;
  const alpha = PRESSURE_ANGLE * DEG;
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(alpha);
  const betaP = inv(alpha); // involute spread at pitch circle

  // Tip / root radii (standard full-depth involute system)
  // Increase addendum to compensate for polyline approximation of the tip curve
  const rTip = internal ? rp - 1.08 * m : rp + 1.08 * m;
  const rRoot = internal ? rp + 1.25 * m : rp - 1.25 * m;
  // The "land" sits between teeth at the root radius.
  const rLand = rRoot;

  // Half tooth thickness angle at pitch (with backlash relief)
  const s = Math.PI / (2 * z) - BACKLASH / 2;

  // Flank angular offset from tooth centre at radius r
  const beta = (r: number) => {
    const ar = Math.acos(Math.min(1, Math.max(-1, rb / r)));
    return inv(ar);
  };
  const theta = (r: number) =>
    internal ? s + (beta(r) - betaP) : s - (beta(r) - betaP);

  const FLANK_PTS = 20; // increased for better tip accuracy
  const ARC_PTS = 8; // more points on tip arc for circular fidelity
  const LAND_PTS = 3;

  // Flank sampled from the land radius up/down to the tip radius. The same
  // ordering (land -> tip) works for both external (land small, tip large)
  // and internal (land large, tip small) gears, keeping the loop continuous.
  const flankRadii: number[] = [];
  for (let i = 0; i <= FLANK_PTS; i++) {
    flankRadii.push(rLand + ((rTip - rLand) * i) / FLANK_PTS);
  }

  const pts: Pt[] = [];
  const at = (r: number, ang: number): Pt => [r * Math.cos(ang), r * Math.sin(ang)];

  for (let k = 0; k < z; k++) {
    const a0 = (k * 2 * Math.PI) / z;
    const a1 = ((k + 1) * 2 * Math.PI) / z;

    // Left flank: land -> tip
    for (const r of flankRadii) {
      pts.push(at(r, a0 - theta(r)));
    }
    // Tip arc across the tooth crown
    const tA = theta(rTip);
    for (let i = 1; i < ARC_PTS; i++) {
      const ang = a0 - tA + (2 * tA * i) / ARC_PTS;
      pts.push(at(rTip, ang));
    }
    // Right flank: tip -> land
    for (let i = flankRadii.length - 1; i >= 0; i--) {
      const r = flankRadii[i];
      pts.push(at(r, a0 + theta(r)));
    }
    // Root land to the next tooth
    const angA = a0 + theta(rLand);
    const angB = a1 - theta(rLand);
    for (let i = 1; i < LAND_PTS; i++) {
      const ang = angA + ((angB - angA) * i) / LAND_PTS;
      pts.push(at(rLand, ang));
    }
  }
  return pts;
}

function loopToDrawing(pts: Pt[]): Drawing {
  let pen = draw(pts[0]);
  for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
  return pen.close();
}

/** External spur gear cross-section (full disk with teeth). */
export function externalGearProfile(z: number): Drawing {
  return loopToDrawing(toothedLoop(z, false));
}

/** Internal (ring) gear toothed-hole boundary. */
export function ringHoleProfile(z: number): Drawing {
  return loopToDrawing(toothedLoop(z, true));
}
