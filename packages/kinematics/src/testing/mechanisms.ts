import assert from 'node:assert';
import { transformMechanism } from '@taucad/kinematics';
import type { Joint, Link, Mechanism, TransformMechanismInput } from '@taucad/kinematics';

/**
 * Planetary gear system with a grounded 72T ring, 24T sun and three 24T planets on a carrier
 * (module 1: planet centres at 24 mm). The carrier turns at sun/4 and each planet at −3/4 sun
 * relative to the carrier, so four sun turns return the whole structure.
 *
 * @returns The mechanism in millimetres and degrees.
 */
export const planetaryGearSystem = (): Mechanism => {
  const planets = [0, 120, 240].map((angle, index) => {
    const radians = (angle * Math.PI) / 180;
    return { id: `planet${index + 1}`, origin: [24 * Math.cos(radians), 24 * Math.sin(radians), 0] as const };
  });
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'ring',
    links: {
      ring: { components: ['Ring Gear'] },
      sun: { components: ['Sun Gear'] },
      carrier: { components: ['Carrier'] },
      ...Object.fromEntries(planets.map(({ id }) => [id, { components: [`Planet ${id}`] }])),
    },
    joints: {
      sunSpin: { type: 'revolute', parent: 'ring', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
      carrierSpin: { type: 'revolute', parent: 'ring', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
      ...Object.fromEntries(
        planets.map(({ id, origin }) => [
          `${id}Spin`,
          { type: 'revolute', parent: 'carrier', child: id, origin, axis: [0, 0, 1] } satisfies Joint,
        ]),
      ),
    },
    couplings: [
      // Ring grounded: carrier = Ns / (Ns + Nr) × sun; planet relative to carrier = −(Ns / Np)(sun − carrier).
      { driver: 'sunSpin', follower: 'carrierSpin', ratio: 24 / (24 + 72) },
      ...planets.map(({ id }) => ({
        driver: 'sunSpin',
        follower: `${id}Spin`,
        ratio: -(24 / 24) * (1 - 24 / (24 + 72)),
      })),
    ],
    animations: [
      {
        id: 'structuralLoop',
        name: 'Four sun turns',
        duration: 8,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { sunSpin: 0 } },
          { time: 8, coordinates: { sunSpin: 1440 } },
        ],
      },
    ],
  };
};

/**
 * Single-start worm driving a 30-tooth wheel: one worm turn advances the wheel 12°.
 *
 * @returns The mechanism in millimetres and degrees.
 */
export const wormGearSystem = (): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'housing',
  links: {
    housing: { components: ['Housing'] },
    worm: { components: ['Worm'] },
    wheel: { components: ['Worm Wheel'] },
  },
  joints: {
    wormSpin: { type: 'revolute', parent: 'housing', child: 'worm', origin: [0, 0, 20], axis: [1, 0, 0] },
    wheelSpin: { type: 'revolute', parent: 'housing', child: 'wheel', origin: [0, 0, 0], axis: [0, 0, 1] },
  },
  couplings: [{ driver: 'wormSpin', follower: 'wheelSpin', ratio: 1 / 30 }],
});

/**
 * Planar two-link arm in metres and radians: shoulder at the origin, elbow at x = 1, tip at x = 2,
 * both rotating about +Z.
 *
 * @returns The mechanism.
 */
export const twoLinkArm = (): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['Base'] }, upper: { components: ['Upper Arm'] }, lower: { components: ['Forearm'] } },
  joints: {
    shoulder: { type: 'revolute', parent: 'base', child: 'upper', origin: [0, 0, 0], axis: [0, 0, 1] },
    elbow: { type: 'revolute', parent: 'upper', child: 'lower', origin: [1, 0, 0], axis: [0, 0, 1] },
  },
});

/**
 * Six-revolute arm in millimetres and degrees, as built with the upper arm vertical and the
 * forearm horizontal along +X: base yaw, shoulder and elbow pitch, forearm roll, wrist pitch
 * and flange roll. The flange face sits at x = 380 mm, z = 400 mm.
 *
 * @returns The mechanism.
 */
export const sixAxisArm = (): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: {
    base: { components: ['Base'] },
    turret: { components: ['Turret'] },
    upperArm: { components: ['Upper Arm'] },
    forearm: { components: ['Forearm'] },
    wristHousing: { components: ['Wrist Housing'] },
    wrist: { components: ['Wrist'] },
    flange: { components: ['Flange', 'Gripper'] },
  },
  joints: {
    baseYaw: {
      type: 'revolute',
      parent: 'base',
      child: 'turret',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -170, upper: 170 },
    },
    shoulder: {
      type: 'revolute',
      parent: 'turret',
      child: 'upperArm',
      origin: [0, 0, 100],
      axis: [0, 1, 0],
      limits: { lower: -120, upper: 120 },
    },
    elbow: {
      type: 'revolute',
      parent: 'upperArm',
      child: 'forearm',
      origin: [0, 0, 400],
      axis: [0, 1, 0],
      limits: { lower: -150, upper: 150 },
    },
    forearmRoll: {
      type: 'revolute',
      parent: 'forearm',
      child: 'wristHousing',
      origin: [0, 0, 400],
      axis: [1, 0, 0],
      limits: { lower: -180, upper: 180 },
    },
    wristPitch: {
      type: 'revolute',
      parent: 'wristHousing',
      child: 'wrist',
      origin: [300, 0, 400],
      axis: [0, 1, 0],
      limits: { lower: -120, upper: 120 },
    },
    flangeRoll: { type: 'revolute', parent: 'wrist', child: 'flange', origin: [300, 0, 400], axis: [1, 0, 0] },
  },
});

/**
 * Serial chain of revolute links 10 mm apart along +X, alternating Z and Y axes; used by the
 * benchmark and scale tests.
 *
 * @param count - Number of moving links.
 * @returns The mechanism in millimetres and degrees.
 */
export const linearChain = (count: number): Mechanism => {
  const links: Record<string, Link> = { link0: { components: ['Link 0'] } };
  const joints: Record<string, Joint> = {};
  for (let index = 1; index <= count; index += 1) {
    links[`link${index}`] = { components: [`Link ${index}`] };
    joints[`joint${index}`] = {
      type: 'revolute',
      parent: `link${index - 1}`,
      child: `link${index}`,
      origin: [10 * index, 0, 0],
      axis: index % 2 === 0 ? [0, 1, 0] : [0, 0, 1],
    };
  }
  return { schemaVersion: 1, units: { length: 'mm', angle: 'deg' }, root: 'link0', links, joints };
};

/**
 * One joint of every type off a common base, with a coupling and a ping-pong animation; the
 * admission tests mutate it one property at a time.
 *
 * @returns A valid mechanism in millimetres and degrees.
 */
export const everyJoint = (): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: {
    base: { components: ['Base'] },
    weld: { components: ['Weld'] },
    arm: { components: ['Arm'] },
    slide: { components: ['Slide'] },
    sleeve: { components: ['Sleeve'] },
    nut: { components: ['Nut'] },
    ball: { components: ['Ball'] },
    puck: { components: ['Puck'] },
  },
  joints: {
    weld: { type: 'fixed', parent: 'base', child: 'weld', origin: [0, 0, 0] },
    arm: {
      type: 'revolute',
      parent: 'base',
      child: 'arm',
      origin: [10, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -90, upper: 90 },
    },
    slide: {
      type: 'prismatic',
      parent: 'base',
      child: 'slide',
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: { lower: 0, upper: 50 },
    },
    sleeve: {
      type: 'cylindrical',
      parent: 'base',
      child: 'sleeve',
      origin: [0, 20, 0],
      axis: [0, 1, 0],
      limits: { angle: { lower: -360, upper: 360 }, distance: { lower: 0, upper: 10 } },
    },
    nut: {
      type: 'screw',
      parent: 'base',
      child: 'nut',
      origin: [0, 0, 30],
      axis: [0, 0, 1],
      lead: 2,
      handedness: 'right',
      limits: { lower: 0, upper: 3600 },
    },
    ball: { type: 'spherical', parent: 'arm', child: 'ball', origin: [20, 0, 0], limits: { lower: -45, upper: 45 } },
    puck: {
      type: 'planar',
      parent: 'base',
      child: 'puck',
      origin: [0, 0, -10],
      normal: [0, 0, 1],
      xAxis: [1, 0, 0],
      limits: { x: { lower: -5, upper: 5 }, angle: { lower: -30, upper: 30 } },
    },
  },
  couplings: [{ driver: 'arm', follower: 'sleeve/angle', ratio: 2, offset: 1 }],
  animations: [
    {
      id: 'sweep',
      duration: 2,
      loop: 'pingPong',
      keyframes: [
        { time: 0, coordinates: { arm: 0 } },
        { time: 2, coordinates: { arm: 90, nut: 720 } },
      ],
    },
  ],
});

/**
 * Transform a mechanism that is expected to transform.
 *
 * @param input - Input of `transformMechanism`.
 * @returns The transformed mechanism.
 * @throws AssertionError listing the issues when the transform is invalid.
 */
export const transformed = (input: TransformMechanismInput): Mechanism => {
  const outcome = transformMechanism(input);
  assert.ok(outcome.status === 'transformed', `Expected a transform, got ${JSON.stringify(outcome)}`);
  return outcome.mechanism;
};

/** Crank throw of {@link sliderCrank}, in millimetres. */
export const crankRadius = 40;
/** Connecting-rod length of {@link sliderCrank}, centre to centre, in millimetres. */
export const rodLength = 140;

/**
 * Exact piston travel of {@link sliderCrank} from top dead centre.
 *
 * @param crank - Crank angle in degrees; 0 is top dead centre.
 * @returns Wrist-pin travel along +Z in millimetres (zero or negative).
 */
export const pistonTravel = (crank: number): number => {
  const radians = (crank * Math.PI) / 180;
  return (
    crankRadius * Math.cos(radians) +
    Math.sqrt(rodLength ** 2 - (crankRadius * Math.sin(radians)) ** 2) -
    crankRadius -
    rodLength
  );
};

/**
 * Exact connecting-rod swing of {@link sliderCrank} about the wrist pin.
 *
 * @param crank - Crank angle in degrees.
 * @returns Rod angle about +Y in degrees.
 */
export const rodSwing = (crank: number): number =>
  (-Math.asin((crankRadius * Math.sin((crank * Math.PI) / 180)) / rodLength) * 180) / Math.PI;

/**
 * One cylinder's slider-crank, which a tree of joints cannot close: the crank turns about +Y at
 * the origin, the piston slides on +Z and the rod swings about the wrist pin, both following the
 * crank through sampled curves. At the as-built pose the crank pin is at (0, 0, 40) and the wrist
 * pin at (0, 0, 180).
 *
 * @param samples - Curve samples per crank turn.
 * @returns The mechanism in millimetres and degrees.
 */
export const sliderCrank = (samples = 72): Mechanism => {
  const sampled = (curve: (crank: number) => number): number[] =>
    Array.from({ length: samples }, (_, index) => curve((index * 360) / samples));
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'block',
    links: {
      block: { components: ['Block'] },
      crank: { components: ['Crank'] },
      piston: { components: ['Piston'] },
      rod: { components: ['Rod'] },
    },
    joints: {
      crank: { type: 'revolute', parent: 'block', child: 'crank', origin: [0, 0, 0], axis: [0, 1, 0] },
      piston: {
        type: 'prismatic',
        parent: 'block',
        child: 'piston',
        origin: [0, 0, 180],
        axis: [0, 0, 1],
        limits: { lower: -80, upper: 0 },
      },
      rod: { type: 'revolute', parent: 'piston', child: 'rod', origin: [0, 0, 180], axis: [0, 1, 0] },
    },
    couplings: [
      { driver: 'crank', follower: 'piston', curve: { driverPeriod: 360, values: sampled(pistonTravel) } },
      { driver: 'crank', follower: 'rod', curve: { driverPeriod: 360, values: sampled(rodSwing) } },
    ],
  };
};
