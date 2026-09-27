/**
 * V8 engine layout: dimensions, the cylinder table and the crank-train and valvetrain
 * kinematics shared by the model (`main.ts`), its mechanism and its GeoSpec suite. Pure
 * arithmetic, no CAD kernel.
 *
 * Frame: Z up, crankshaft along +X, timing drive at -X. Each bank has a local frame
 * (x', t, s): s along the bore axis, t across it in the crank plane (positive outboard) and
 * x' along the crank. Both banks share one local geometry: the right bank is R_X(-45°) of it
 * and the left bank R_Z(180°) of the right, so a head, valve or rocker is built once.
 */
import type { Coupling, MechanismSource } from '@taucad/kinematics';

export type Vec3 = [number, number, number];
export type Bank = 'left' | 'right';
export type ValveKind = 'intake' | 'exhaust';

// Crank train (mm, deg).
export const crankRadius = 44;
export const rodLength = 150;
export const compressionHeight = 32;
export const boreRadius = 50;
export const deckHeight = 226.5;
export const gasketThickness = 1;
export const headBottom = deckHeight + gasketThickness;
export const headTop = 322.5;
export const throwX = [-168, -56, 56, 168];
export const throwPhase = [0, 90, 270, 180];
// Main journals sit between the throws and at both ends.
export const mainX = [-224, -112, 0, 112, 224];
// Cylinders of one throw sit 12 mm either side of it (left bank forward).
export const bankOffset = 12;
export const firingOrder = [1, 8, 4, 3, 6, 5, 7, 2];

// Deck slab of each bank in local (t, s): the block, gasket, head and cover share it.
export const deckInboard = -58;
export const deckOutboard = 62;
// Local x' span of a head: the four bores ±62.
export const headSpan: [number, number] = [-218, 242];

// Valvetrain (OHV): one cam in the valley, flat-tappet lifters, pushrods, stud rockers.
export const camHeight = 130;
export const lobe = {
  baseRadius: 16,
  noseRadius: 9,
  noseOffset: 14,
  width: 16,
};
export const maxLift = lobe.noseOffset + lobe.noseRadius - lobe.baseRadius;
export const valveOffset = 23;
export const valveAxisT = 4;
export const valveFace = 231.5;
export const valveSeat = 237.5;
export const chamberRadius = 49;
export const lifterRadius = 12.5;
export const lifterLength = 50;
export const pushrodRadius = 4;
// Rocker in local (t, s): valve contact B, pivot P and pushrod contact A on one bar, arm ratio 1.5.
export const rockerEndRadius = 4;
export const rockerB: [number, number] = [valveAxisT, 364.8];
export const rockerP: [number, number] = [valveAxisT - 27, 364.8 + 2.7];
export const rockerA: [number, number] = [valveAxisT - 45, 364.8 + 4.5];
// Running clearances: valve lash at the tip and pushrod-to-rocker at the cup.
export const valveLash = 0.8;
export const pushrodLash = 0.5;
export const valveTip = rockerB[1] - rockerEndRadius - valveLash;
// Crank angles, after compression TDC, at which each lobe peaks.
export const peakAfterFiring: Record<ValveKind, number> = {
  intake: 468,
  exhaust: 248,
};

const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const sin = (angle: number) => Math.sin(angle * rad);
const cos = (angle: number) => Math.cos(angle * rad);
export const wrap360 = (angle: number) => ((angle % 360) + 360) % 360;
const wrap180 = (angle: number) => wrap360(angle + 180) - 180;

export const rotateX = ([x, y, z]: Vec3, angle: number): Vec3 => [
  x,
  y * cos(angle) - z * sin(angle),
  y * sin(angle) + z * cos(angle),
];
const turnZ = ([x, y, z]: Vec3): Vec3 => [-x, -y, z];
// Bank placement: the rotations `main` applies to local geometry.
export const bankTilt = -45;
export const toWorld = (bank: Bank, local: Vec3): Vec3 => {
  const tilted = rotateX(local, bankTilt);
  return bank === 'left' ? turnZ(tilted) : tilted;
};
export const toLocal = (bank: Bank, world: Vec3): Vec3 =>
  rotateX(bank === 'left' ? turnZ(world) : world, -bankTilt);

// Cylinders in GM order: odd on the left bank, even on the right, 1 at the front left.
export const cylinders = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => {
  const bank: Bank = number % 2 === 1 ? 'left' : 'right';
  const throwIndex = Math.floor((number - 1) / 2);
  const x = throwX[throwIndex]! + (bank === 'left' ? -bankOffset : bankOffset);
  return {
    number,
    bank,
    throwIndex,
    x,
    // Every bore sits at the same four x' on either bank.
    localX: bank === 'left' ? -x : x,
    // Crank angle of compression TDC within the 720° cycle.
    firing: 45 + 90 * firingOrder.indexOf(number),
  };
});
export type Cylinder = (typeof cylinders)[number];

/** Crank-pin centre of a throw with the crank turned by `crankAngle` about +X. */
export const crankPin = (throwIndex: number, crankAngle: number): Vec3 => {
  const angle = crankAngle + throwPhase[throwIndex]!;
  return [
    throwX[throwIndex]!,
    -crankRadius * sin(angle),
    crankRadius * cos(angle),
  ];
};

/** Wrist-pin height along the bore (`pistonS`) and rod swing about local +x (`rodAngle`, deg). */
export const pistonState = (cylinder: Cylinder, crankAngle: number) => {
  const [, t, s] = toLocal(
    cylinder.bank,
    crankPin(cylinder.throwIndex, crankAngle),
  );
  return {
    pistonS: s + Math.sqrt(rodLength ** 2 - t ** 2),
    rodAngle: Math.asin(t / rodLength) * deg,
  };
};

// Cam centre in local (t, s); identical on both banks.
const camLocal = toLocal('right', [0, 0, camHeight]);
export const camT = camLocal[1];
export const camS = camLocal[2];
// Lifter and pushrod axis from the cam centre through the rocker's pushrod contact.
const followerSpan = Math.hypot(rockerA[0] - camT, rockerA[1] - camS);
export const followerAxis: [number, number] = [
  (rockerA[0] - camT) / followerSpan,
  (rockerA[1] - camS) / followerSpan,
];
export const pushrodTop = followerSpan - rockerEndRadius - pushrodLash;
export const followerAxisWorld = (bank: Bank) =>
  toWorld(bank, [0, ...followerAxis]);

export const valves = cylinders.flatMap((cylinder) =>
  (['intake', 'exhaust'] as const).map((kind) => {
    const localX =
      cylinder.localX + (kind === 'intake' ? valveOffset : -valveOffset);
    return {
      cylinder,
      kind,
      localX,
      x: cylinder.bank === 'left' ? -localX : localX,
      peak: wrap360(cylinder.firing + peakAfterFiring[kind]),
    };
  }),
);
export type Valve = (typeof valves)[number];

/** Flat-tappet lift of a two-circle lobe: its support distance along the lifter axis. */
export const liftAt = (valve: Valve, crankAngle: number) =>
  Math.max(
    0,
    lobe.noseOffset * cos(wrap180((crankAngle - valve.peak) / 2)) +
      lobe.noseRadius -
      lobe.baseRadius,
  );

const turn2 = ([t, s]: [number, number], angle: number): [number, number] => [
  t * cos(angle) - s * sin(angle),
  t * sin(angle) + s * cos(angle),
];
const armA: [number, number] = [
  rockerA[0] - rockerP[0],
  rockerA[1] - rockerP[1],
];
const armB: [number, number] = [
  rockerB[0] - rockerP[0],
  rockerB[1] - rockerP[1],
];
const pushAlong = (angle: number) => {
  const [t, s] = turn2(armA, angle);
  return (t - armA[0]) * followerAxis[0] + (s - armA[1]) * followerAxis[1];
};

/** Rocker rotation (deg, about local +x) that lifts its pushrod cup by `lift` along the pushrod. */
export const rockerAngle = (lift: number) => {
  let angle = 0;
  for (let step = 0; step < 30; step++) {
    const slope = (pushAlong(angle + 1e-4) - pushAlong(angle - 1e-4)) / 2e-4;
    angle -= (pushAlong(angle) - lift) / slope;
  }
  return angle;
};

/** Lifter lift, rocker angle and valve opening (downward along the bore) at a crank angle. */
export const valveState = (valve: Valve, crankAngle: number) => {
  const lift = liftAt(valve, crankAngle);
  const rocker = rockerAngle(lift);
  return { lift, rocker, opening: armB[1] - turn2(armB, rocker)[1] };
};

/** Lobe-nose direction about +X (deg from +Z) at a crank angle: it meets the lifter at the peak. */
export const lobeAngle = (valve: Valve, crankAngle: number) => {
  const [, y, z] = followerAxisWorld(valve.cylinder.bank);
  return Math.atan2(-y, z) * deg + (crankAngle - valve.peak) / 2;
};

// Every returned shape name, and the link that carries it.
export const valveLabel = (valve: Valve) =>
  `${valve.kind === 'intake' ? 'Intake' : 'Exhaust'}`;
export const partNames = {
  piston: (cylinder: Cylinder) => [
    `Piston ${cylinder.number}`,
    `Wrist pin ${cylinder.number}`,
  ],
  rod: (cylinder: Cylinder) => [`Connecting rod ${cylinder.number}`],
  lifter: (valve: Valve) => [
    `${valveLabel(valve)} lifter ${valve.cylinder.number}`,
    `${valveLabel(valve)} pushrod ${valve.cylinder.number}`,
  ],
  rocker: (valve: Valve) => [
    `${valveLabel(valve)} rocker ${valve.cylinder.number}`,
  ],
  valve: (valve: Valve) => [
    `${valveLabel(valve)} valve ${valve.cylinder.number}`,
  ],
};
export const crankParts = [
  'Crankshaft',
  'Crank sprocket',
  'Harmonic balancer',
  'Flywheel',
];
export const camParts = ['Camshaft', 'Cam sprocket'];
export const valveId = (valve: Valve) =>
  `${valve.kind}-${valve.cylinder.number}`;

// Curve couplings sample one period of each follower, relative to the as-built crank angle.
const pistonSamples = 180;
const valveSamples = 240;
const sample = (
  count: number,
  driverPeriod: number,
  value: (crankAngle: number) => number,
) =>
  Array.from(
    { length: count },
    (_, index) => Math.round(value((index * driverPeriod) / count) * 1e3) / 1e3,
  );
const spanOf = (values: number[]) => ({
  lower: Math.min(...values),
  upper: Math.max(...values),
});

/**
 * The engine's mechanism in the as-built frame of `main` at `crankAngle`: the crank drives the
 * cam through a 2:1 linear coupling and every piston, rod, lifter, rocker and valve through a
 * curve coupling sampled from the exact kinematics above. Coordinates are deltas from the
 * as-built angle, so a crank coordinate of 720 is one full four-stroke cycle.
 */
export const buildMechanism = (crankAngle: number, staticParts: string[]) => {
  const links: Record<string, { shapes: string[] }> = {
    block: { shapes: staticParts },
    crank: { shapes: crankParts },
    cam: { shapes: camParts },
  };
  const joints: Record<string, MechanismSource['joints'][string]> = {
    crank: {
      type: 'revolute',
      parent: 'block',
      child: 'crank',
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    },
    cam: {
      type: 'revolute',
      parent: 'block',
      child: 'cam',
      origin: [0, 0, camHeight],
      axis: [1, 0, 0],
    },
  };
  const couplings: Coupling[] = [
    { driver: 'crank', follower: 'cam', ratio: 0.5 },
  ];
  const follow = (follower: string, driverPeriod: number, values: number[]) =>
    couplings.push({
      driver: 'crank',
      follower,
      curve: { driverPeriod, values },
    });

  for (const cylinder of cylinders) {
    const built = pistonState(cylinder, crankAngle);
    const at = (delta: number) => pistonState(cylinder, crankAngle + delta);
    const travel = sample(
      pistonSamples,
      360,
      (delta) => at(delta).pistonS - built.pistonS,
    );
    const swing = sample(
      pistonSamples,
      360,
      (delta) => at(delta).rodAngle - built.rodAngle,
    );
    const wrist = toWorld(cylinder.bank, [cylinder.localX, 0, built.pistonS]);
    const piston = `piston-${cylinder.number}`;
    const rod = `rod-${cylinder.number}`;
    links[piston] = { shapes: partNames.piston(cylinder) };
    links[rod] = { shapes: partNames.rod(cylinder) };
    joints[piston] = {
      type: 'prismatic',
      parent: 'block',
      child: piston,
      origin: wrist,
      axis: toWorld(cylinder.bank, [0, 0, 1]),
      limits: spanOf(travel),
    };
    joints[rod] = {
      type: 'revolute',
      parent: piston,
      child: rod,
      origin: wrist,
      axis: toWorld(cylinder.bank, [1, 0, 0]),
      limits: spanOf(swing),
    };
    follow(piston, 360, travel);
    follow(rod, 360, swing);
  }

  for (const valve of valves) {
    const { bank } = valve.cylinder;
    const built = valveState(valve, crankAngle);
    const at = (delta: number) => valveState(valve, crankAngle + delta);
    const lift = sample(
      valveSamples,
      720,
      (delta) => at(delta).lift - built.lift,
    );
    const rock = sample(
      valveSamples,
      720,
      (delta) => at(delta).rocker - built.rocker,
    );
    const open = sample(
      valveSamples,
      720,
      (delta) => built.opening - at(delta).opening,
    );
    const id = valveId(valve);
    for (const [kind, shapes] of [
      ['lifter', partNames.lifter(valve)],
      ['rocker', partNames.rocker(valve)],
      ['valve', partNames.valve(valve)],
    ] as const) {
      links[`${kind}-${id}`] = { shapes: [...shapes] };
    }
    joints[`lifter-${id}`] = {
      type: 'prismatic',
      parent: 'block',
      child: `lifter-${id}`,
      origin: [valve.x, 0, camHeight],
      axis: followerAxisWorld(bank),
      limits: spanOf(lift),
    };
    joints[`rocker-${id}`] = {
      type: 'revolute',
      parent: 'block',
      child: `rocker-${id}`,
      origin: toWorld(bank, [valve.localX, ...rockerP]),
      axis: toWorld(bank, [1, 0, 0]),
      limits: spanOf(rock),
    };
    joints[`valve-${id}`] = {
      type: 'prismatic',
      parent: 'block',
      child: `valve-${id}`,
      origin: toWorld(bank, [valve.localX, valveAxisT, valveTip]),
      axis: toWorld(bank, [0, 0, 1]),
      limits: spanOf(open),
    };
    follow(`lifter-${id}`, 720, lift);
    follow(`rocker-${id}`, 720, rock);
    follow(`valve-${id}`, 720, open);
  }

  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'block',
    links,
    joints,
    couplings,
    animations: [
      {
        id: 'run',
        name: 'Run (one four-stroke cycle)',
        duration: 2,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { crank: 0 } },
          { time: 2, coordinates: { crank: 720 } },
        ],
      },
    ],
  } satisfies MechanismSource;
};
