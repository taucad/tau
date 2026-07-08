/**
 * Valvetrain kinematics (bank coordinates: x along the crank, a lateral
 * outboard+, s up the bank axis from the crank axis).
 *
 * Lobe form is the spec 3.6 three-arc cam (base r16, nose r3.5 at 19,
 * flanks R60). Follower lift uses exact sphere-arc tangency for the R700
 * crowned foot. The chain is solved per valve at the modeled crank angle 0
 * (cyl 1 TDC compression) with the realizable firing map (see params).
 */
import {
  bankOf,
  bankSlot,
  boreX,
  cam,
  deckHeight,
  fireAngles,
  gasketT,
  lifter,
  lobeX,
  valve,
} from './params.js';

export type Vec2 = [number, number];

/** Lobe arc set in the nose frame (nose along +n at angle 0). */
const noseCenter = 19;
const flankCenterD = cam.flankR - cam.baseR; // 44 from the axis.
const flankCenterZ =
  (flankCenterD * flankCenterD +
    noseCenter * noseCenter -
    (cam.flankR - cam.noseR) ** 2) /
  (2 * noseCenter);
const flankCenterY = Math.sqrt(
  flankCenterD * flankCenterD - flankCenterZ * flankCenterZ,
);

/** Base/nose tangency half-angles (from the nose direction). */
const baseTangencyHalf = Math.acos(8.567 / cam.baseR); // Computed below exactly.
void baseTangencyHalf;
const baseTangency: Vec2 = [-flankCenterD, 0]; // Placeholder; real values below.
void baseTangency;

/** Tangency points between arcs (nose frame; +second coordinate = nose). */
const tangencyBaseFlank = (side: 1 | -1): Vec2 => {
  // Internal tangency point of base (r16) and flank arc: at -F * 16/44.
  return [
    (-side * flankCenterY * cam.baseR) / flankCenterD,
    (-flankCenterZ * cam.baseR) / flankCenterD,
  ];
};
const tangencyNoseFlank = (side: 1 | -1): Vec2 => {
  const f: Vec2 = [side * flankCenterY, flankCenterZ];
  const n: Vec2 = [0, noseCenter];
  const d = Math.hypot(n[0] - f[0], n[1] - f[1]);
  return [
    f[0] + ((n[0] - f[0]) * cam.flankR) / d,
    f[1] + ((n[1] - f[1]) * cam.flankR) / d,
  ];
};

const angleOf = (p: Vec2, c: Vec2): number =>
  Math.atan2(p[0] - c[0], p[1] - c[1]);

/** Arc list with angular spans (angles measured atan2(y, z) about each centre). */
type LobeArc = { c: Vec2; r: number; spans: Array<[number, number]> };
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const lobeArcs: LobeArc[] = (() => {
  const tbfP = tangencyBaseFlank(1);
  const tbfM = tangencyBaseFlank(-1);
  const tnfP = tangencyNoseFlank(1);
  const tnfM = tangencyNoseFlank(-1);
  const baseStart = angleOf(tbfP, [0, 0]);
  const noseHalf = Math.abs(angleOf(tnfP, [0, noseCenter]));
  return [
    // Base circle: the long way round from +tangency to -tangency.
    {
      c: [0, 0],
      r: cam.baseR,
      spans: [
        [baseStart, Math.PI],
        [-Math.PI, -baseStart],
      ],
    },
    { c: [0, noseCenter], r: cam.noseR, spans: [[-noseHalf, noseHalf]] },
    {
      c: [flankCenterY, flankCenterZ],
      r: cam.flankR,
      spans: [
        [
          angleOf(tnfP, [flankCenterY, flankCenterZ]),
          angleOf(tbfP, [flankCenterY, flankCenterZ]),
        ],
      ],
    },
    {
      c: [-flankCenterY, flankCenterZ],
      r: cam.flankR,
      spans: [
        [
          angleOf(tbfM, [-flankCenterY, flankCenterZ]),
          angleOf(tnfM, [-flankCenterY, flankCenterZ]),
        ],
      ],
    },
  ];
})();

const inSpan = (angle: number, spans: Array<[number, number]>): boolean =>
  spans.some(([a0, a1]) => {
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);
    return angle >= lo - 1e-9 && angle <= hi + 1e-9;
  });

/**
 * Crowned-foot (R700) follower height above the cam axis for a lobe whose
 * nose is at angle gamma from the follower direction, with the follower
 * axis offset `e` laterally from the cam axis. Exact per-arc sphere-circle
 * tangency with arc-span validity; returns the tangency arc for stamping.
 */
export const followerHeight = (
  gammaDeg: number,
  e = lifter.axisOffset,
): { h: number; arc: number } => {
  const g = (gammaDeg * Math.PI) / 180;
  let best = { h: -Infinity, arc: 0 };
  for (const [index, arc] of lobeArcs.entries()) {
    // Rotate the arc centre by -gamma (nose frame -> follower frame, w = +Z).
    const cy = arc.c[0] * Math.cos(-g) - arc.c[1] * Math.sin(-g);
    const cz = arc.c[0] * Math.sin(-g) + arc.c[1] * Math.cos(-g);
    const rr = lifter.footR + arc.r;
    const disc = rr * rr - (e - cy) * (e - cy);
    if (disc <= 0) {
      continue;
    }
    const h = cz + Math.sqrt(disc);
    // Tangency direction in the nose frame: un-rotate by +gamma.
    const ty = (e - cy) / rr;
    const tz = (h - cz) / rr;
    const noseTy = ty * Math.cos(g) - tz * Math.sin(g);
    const noseTz = ty * Math.sin(g) + tz * Math.cos(g);
    const tangencyAngle = wrap(Math.atan2(noseTy, noseTz));
    if (!inSpan(tangencyAngle, arc.spans)) {
      continue;
    }
    if (h > best.h) {
      best = { h, arc: index };
    }
  }
  return best;
};

const baseHeight =
  Math.sqrt((lifter.footR + cam.baseR) ** 2 - lifter.axisOffset ** 2) -
  lifter.footR +
  cam.baseR +
  lifter.footR -
  700; // = sqrt(716^2-e^2) exact.
const baseHeightExact = Math.sqrt(
  (lifter.footR + cam.baseR) ** 2 - lifter.axisOffset ** 2,
);
void baseHeight;

/** Cam-relative nose angle gamma for valve v at modeled crank 0. */
export const lobeGamma = (
  cylinder: number,
  slot: 'Intake' | 'Exhaust',
): number => {
  const fire = fireAngles[cylinder]!;
  const centerline = slot === 'Intake' ? fire + 460 : fire + 250;
  // Cam angle from the event centerline (crank/2), wrapped to [-180, 180].
  let gamma = -centerline / 2;
  gamma = (((gamma % 360) + 360 + 180) % 360) - 180;
  return gamma;
};

export type ValveChain = {
  cylinder: number;
  slot: 'Intake' | 'Exhaust';
  valveOrdinal: number;
  bank: 'R' | 'L';
  /** Lobe nose angle from the follower direction at modeled phase (deg). */
  gamma: number;
  /** Contact arc index at modeled phase (0 base, 1 nose, 2/3 flanks). */
  contactArc: number;
  /** Lifter rise above base-circle height. */
  lift: number;
  /** Valve lift = rocker ratio x lifter rise. */
  valveLift: number;
  /** Lifter foot-sphere centre height along the lifter axis from the cam axis. */
  footCenterH: number;
  /** Lobe x station. */
  x: number;
};

export const solveValveChain = (
  cylinder: number,
  slot: 'Intake' | 'Exhaust',
): ValveChain => {
  const gamma = lobeGamma(cylinder, slot);
  const { h, arc } = followerHeight(gamma);
  const lift = h - baseHeightExact;
  return {
    cylinder,
    slot,
    valveOrdinal: slot === 'Intake' ? 2 * cylinder - 1 : 2 * cylinder,
    bank: bankOf(cylinder),
    gamma,
    contactArc: arc,
    lift,
    valveLift: valve.rockerRatio * lift,
    footCenterH: h,
    x: lobeX(cylinder, slot),
  };
};

export const allValveChains = (): ValveChain[] => {
  const chains: ValveChain[] = [];
  for (let cylinder = 1; cylinder <= 8; cylinder++) {
    for (const slot of ['Intake', 'Exhaust'] as const) {
      chains.push(solveValveChain(cylinder, slot));
    }
  }
  return chains;
};

// -- Head-station geometry (head local frame: deck z=0, +y outboard) ---------

/** Valve axis direction in head-local coordinates (tops lean outboard). */
export const valveDirLocal: [number, number, number] = [
  0,
  Math.sin((valve.tiltDeg * Math.PI) / 180),
  Math.cos((valve.tiltDeg * Math.PI) / 180),
];

/** Deck crossing of the valve axis (head local y). */
export const valveDeckY = (slot: 'Intake' | 'Exhaust'): number =>
  slot === 'Intake' ? valve.inSeatA : valve.exSeatA;

/** Point on the valve axis at station t (from the deck plane, along the axis). */
export const valveAxisPoint = (
  slot: 'Intake' | 'Exhaust',
  t: number,
): [number, number, number] => [
  0,
  valveDeckY(slot) + t * valveDirLocal[1],
  t * valveDirLocal[2],
];

/** Axial station (along the valve axis) of the seat cone mid-line. */
export const seatConeT = 9.4;
/** Spring pocket floor station along the valve axis (pocket cut along w). */
export const springPocketT = 104;
/** Retainer underside at installed height above the pocket floor. */
export const retainerT = springPocketT + valve.installedHeight;
/** Closed-valve tip station (tip land above the keeper groove). */
export const valveTipT = (slot: 'Intake' | 'Exhaust'): number =>
  seatConeT + (slot === 'Intake' ? valve.inLen : valve.exLen) - 4.4;

/** Head deck s-station (block deck + compressed head gasket). */
export const headDeckS = deckHeight + gasketT.head;

/** Bank (a, s) of a head-local (y, z) point for bank R. */
export const headLocalToBank = (
  y: number,
  z: number,
): { a: number; s: number } => ({ a: y, s: headDeckS + z });

export { baseHeightExact as baseHeight };
export const camCenterA = -84.9;
export const lifterAxisA = camCenterA + lifter.axisOffset;
export const camCenterS = 84.9;
/** Foot-sphere sag over the Ø22 body rim. */
export const footSag = 700 - Math.sqrt(700 * 700 - 11 * 11);
/** Lifter body bottom rim height along its axis at closed valve. */
export const lifterRimH = baseHeightExact - 700 + footSag;
/** Pushrod cup-centre distance (ball centres 199.5 + 2 x 0.25 nesting). */
export const pushrodCupDist = valve.pushrodLen;

/**
 * Shared lifter-cup height solved so the INTAKE pushrod is exactly 200
 * between cup centres at closed valve; the lifter body length follows.
 */
const intakeCupForLength = ((): [number, number, number] => {
  const w = valveDirLocal;
  const tipIn = valveAxisPoint('Intake', valveTipT('Intake'));
  const palletIn: [number, number, number] = [
    0,
    tipIn[1] + 20 * w[1],
    tipIn[2] + 20 * w[2],
  ];
  const arm = valve.rockerPalletArm + valve.rockerCupArm;
  const planar = Math.sqrt(arm * arm - 24 * 24);
  const dzIn = -6;
  const dyIn = -Math.sqrt(planar * planar - dzIn * dzIn);
  return [24, palletIn[1] + dyIn, palletIn[2] + dzIn];
})();

/** Rocker/pushrod chain solved in head-local coordinates for one valve. */
export type RockerChain = {
  /** Pallet sphere centre (closed). */
  pallet: [number, number, number];
  /** Pivot ball centre. */
  pivot: [number, number, number];
  /** Rocker pushrod-cup sphere centre (closed). */
  cup: [number, number, number];
  /** Lifter cup sphere centre (head local, closed). */
  lifterCup: [number, number, number];
  /** Stud axis deck crossing (head local). */
  studY: number;
  studX: number;
  cupDx: number;
};

export const lifterCupYLocal = lifterAxisA;
/** Head-local z of the lifter cup centre (closed, from the intake 200). */
export const lifterCupZLocal =
  intakeCupForLength[2] -
  Math.sqrt(
    pushrodCupDist ** 2 - (intakeCupForLength[1] - lifterCupYLocal) ** 2,
  );
/** Lifter cup sphere centre height along its axis (closed). */
export const lifterCupH = headDeckS + lifterCupZLocal - camCenterS;
/** Derived lifter body length realizing the 200 pushrod (spec: geometry must realize it). */
export const lifterLength =
  lifterCupH - lifterRimH + lifter.cupDepth - lifter.cupR;

/**
 * Closed-valve rocker geometry for a bank-R head-local valve at bore x = 0.
 * The intake cup hangs 6 below its pallet; the exhaust cup angle is solved
 * so BOTH pushrods are exactly the spec 200 between cup centres.
 */
export const solveRockerChain = (slot: 'Intake' | 'Exhaust'): RockerChain => {
  const w = valveDirLocal;
  const arm = valve.rockerPalletArm + valve.rockerCupArm;
  const cupDx = slot === 'Intake' ? 24 : -24;
  const planar = Math.sqrt(arm * arm - cupDx * cupDx);

  const tipIn = valveAxisPoint('Intake', valveTipT('Intake'));
  const palletIn: [number, number, number] = [
    0,
    tipIn[1] + 20 * w[1],
    tipIn[2] + 20 * w[2],
  ];
  const dzIn = -6;
  const dyIn = -Math.sqrt(planar * planar - dzIn * dzIn);
  const cupIn: [number, number, number] = [
    24,
    palletIn[1] + dyIn,
    palletIn[2] + dzIn,
  ];
  const zB = lifterCupZLocal;

  const finish = (
    pallet: [number, number, number],
    cup: [number, number, number],
  ): RockerChain => {
    const along = (f: number): [number, number, number] => [
      pallet[0] + (cup[0] - pallet[0]) * f,
      pallet[1] + (cup[1] - pallet[1]) * f,
      pallet[2] + (cup[2] - pallet[2]) * f,
    ];
    const pivot = along(valve.rockerPalletArm / arm);
    const tPivot = pivot[2] / w[2];
    return {
      pallet,
      pivot,
      cup,
      lifterCup: [cup[0], lifterCupYLocal, zB],
      studY: pivot[1] - tPivot * w[1],
      studX: pivot[0],
      cupDx,
    };
  };

  if (slot === 'Intake') {
    return finish(palletIn, cupIn);
  }
  const tip = valveAxisPoint('Exhaust', valveTipT('Exhaust'));
  const pallet: [number, number, number] = [
    0,
    tip[1] + 20 * w[1],
    tip[2] + 20 * w[2],
  ];
  // Solve cup angle phi: |cup - B| = 200 with cup on the arm circle.
  const u0 = pallet[1] - lifterCupYLocal;
  const v0 = pallet[2] - zB;
  const target =
    (pushrodCupDist ** 2 - u0 * u0 - v0 * v0 - planar * planar) / (2 * planar);
  const bigR = Math.hypot(u0, v0);
  const psi = Math.atan2(v0, u0);
  const delta = Math.acos(Math.max(-1, Math.min(1, target / bigR)));
  // Two solutions; take the valley-side (larger angle) branch.
  const phi = psi + delta;
  const cup: [number, number, number] = [
    -24,
    pallet[1] + planar * Math.cos(phi),
    pallet[2] + planar * Math.sin(phi),
  ];
  return finish(pallet, cup);
};

export const bankOfSlot = { bankOf, bankSlot, boreX };
