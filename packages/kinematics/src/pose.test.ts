import { describe, expect, it } from 'vitest';
import { admitMechanism, evaluatePose, sampleAnimation } from '@taucad/kinematics';
import type { Animation, Joint, Mechanism, Pose } from '@taucad/kinematics';
import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { identityMatrix, maxDifference, rotationAboutZ, transformPoint } from '#testing/geometry.js';
import {
  crankRadius,
  everyJoint,
  linearChain,
  pistonTravel,
  planetaryGearSystem,
  rodLength,
  rodSwing,
  sliderCrank,
  wormGearSystem,
} from '#testing/mechanisms.js';

const posed = (
  mechanism: Mechanism,
  coordinates: Readonly<Record<string, number>>,
): Pose & { atLimit: readonly string[] } => {
  const outcome = evaluatePose({ mechanism, coordinates });
  if (outcome.status !== 'posed') {
    throw new Error(`Expected a pose, got ${JSON.stringify(outcome.issues)}`);
  }
  return { ...outcome.pose, atLimit: outcome.atLimit };
};

const linkMatrix = (pose: Pose, link: string): SpatialMatrix => pose.linkTransforms[link]!;

/** A mechanism with one joint of each listed shape hanging off a `base` link. */
const withJoints = (joints: Readonly<Record<string, Joint>>): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: Object.fromEntries(
    ['base', ...Object.values(joints).map((joint) => joint.child)].map((link) => [link, { components: [] }]),
  ),
  joints,
});

describe('evaluatePose', () => {
  describe('reference pose', () => {
    it('should return an exact identity for every link without a coupling offset when all drivers are zero', () => {
      const pose = posed(everyJoint(), {});

      for (const [name, matrix] of Object.entries(pose.linkTransforms).filter(([linkId]) => linkId !== 'sleeve')) {
        expect([name, matrix]).toEqual([name, identityMatrix]);
      }
      expect(pose.coordinates['sleeve/angle']).toBe(1);
      expect(maxDifference(transformPoint(pose.linkTransforms['sleeve']!, [0, 20, 0]), [0, 20, 0])).toBeLessThan(1e-15);
      expect(Object.keys(pose.linkTransforms)).toEqual([
        'base',
        'weld',
        'arm',
        'slide',
        'sleeve',
        'nut',
        'puck',
        'ball',
      ]);
    });

    it('should return to the reference exactly after evaluating another pose', () => {
      const mechanism = everyJoint();
      posed(mechanism, { arm: 45, slide: 10 });

      expect(linkMatrix(posed(mechanism, {}), 'arm')).toEqual(identityMatrix);
    });
  });

  describe('planetary gear system 24/24/72', () => {
    it('should turn the carrier at a quarter and each planet at −3/4 of the sun relative to the carrier', () => {
      const pose = posed(planetaryGearSystem(), { sunSpin: 90 });

      expect(pose.coordinates).toEqual({
        sunSpin: 90,
        carrierSpin: 22.5,
        planet1Spin: -67.5,
        planet2Spin: -67.5,
        planet3Spin: -67.5,
      });
      expect(maxDifference(linkMatrix(pose, 'carrier'), rotationAboutZ(22.5))).toBeLessThan(1e-12);
      expect(maxDifference(linkMatrix(pose, 'sun'), rotationAboutZ(90))).toBeLessThan(1e-12);
    });

    it('should carry each planet centre with the carrier while the planet turns −sun/2 in the world', () => {
      const pose = posed(planetaryGearSystem(), { sunSpin: 90 });
      const planet = linkMatrix(pose, 'planet1');
      const world = rotationAboutZ(-45);

      expect(
        maxDifference([planet[0], planet[1], planet[4], planet[5]], [world[0], world[1], world[4], world[5]]),
      ).toBeLessThan(1e-12);
      expect(
        maxDifference(transformPoint(planet, [24, 0, 0]), transformPoint(rotationAboutZ(22.5), [24, 0, 0])),
      ).toBeLessThan(1e-12);
    });

    it('should return every link to the reference after four sun turns (one carrier turn)', () => {
      const pose = posed(planetaryGearSystem(), { sunSpin: 1440 });

      expect(pose.coordinates['carrierSpin']).toBe(360);
      expect(pose.coordinates['planet2Spin']).toBe(-1080);
      for (const matrix of Object.values(pose.linkTransforms)) {
        expect(maxDifference(matrix, identityMatrix)).toBeLessThan(1e-9);
      }
    });

    it('should not return the structure after one sun turn', () => {
      const pose = posed(planetaryGearSystem(), { sunSpin: 360 });

      expect(maxDifference(linkMatrix(pose, 'carrier'), rotationAboutZ(90))).toBeLessThan(1e-12);
      expect(maxDifference(linkMatrix(pose, 'planet1'), identityMatrix)).toBeGreaterThan(1);
    });
  });

  describe('worm gear system 1:30', () => {
    it('should advance the wheel 12° per worm turn and return it after thirty turns', () => {
      const mechanism = wormGearSystem();

      expect(maxDifference(linkMatrix(posed(mechanism, { wormSpin: 360 }), 'wheel'), rotationAboutZ(12))).toBeLessThan(
        1e-12,
      );
      const thirtyTurns = posed(mechanism, { wormSpin: 10_800 });
      expect(thirtyTurns.coordinates['wheelSpin']).toBeCloseTo(360, 10);
      expect(maxDifference(linkMatrix(thirtyTurns, 'wheel'), identityMatrix)).toBeLessThan(1e-9);
      expect(maxDifference(linkMatrix(thirtyTurns, 'worm'), identityMatrix)).toBeLessThan(1e-9);
    });
  });

  describe('screw joints', () => {
    const screw = (
      child: string,
      thread: Readonly<{ lead: number; handedness: 'right' | 'left'; axis: SpatialVector }>,
    ): Joint => ({
      type: 'screw',
      parent: 'base',
      child,
      origin: [5, 0, 0],
      ...thread,
    });
    // Pitch 1.5 mm: one start gives a 1.5 mm lead, two starts a 3 mm lead.
    const screws = withJoints({
      single: screw('singleNut', { lead: 1.5, handedness: 'right', axis: [0, 0, 1] }),
      double: screw('doubleNut', { lead: 1.5 * 2, handedness: 'right', axis: [0, 0, 1] }),
      left: screw('leftNut', { lead: 1.5, handedness: 'left', axis: [0, 0, 1] }),
      reversed: screw('reversedNut', { lead: 1.5, handedness: 'right', axis: [0, 0, -2] }),
    });

    it.for([
      ['a right-hand single start', 'single', 'singleNut', 1.5],
      ['a right-hand double start with the same pitch', 'double', 'doubleNut', 3],
      ['a left-hand single start', 'left', 'leftNut', -1.5],
      ['a right-hand thread on a reversed axis', 'reversed', 'reversedNut', -1.5],
    ] as const)('should advance %s by its lead per turn', ([, joint, nut, advance]) => {
      const turn = linkMatrix(posed(screws, { [joint]: 360 }), nut);
      const halfTurn = linkMatrix(posed(screws, { [joint]: 180 }), nut);

      expect(maxDifference(turn, [...identityMatrix.slice(0, 14), advance, 1])).toBeLessThan(1e-12);
      expect(halfTurn[14]).toBeCloseTo(advance / 2, 12);
      expect(maxDifference(transformPoint(halfTurn, [5, 0, 0]), [5, 0, advance / 2])).toBeLessThan(1e-12);
    });
  });

  describe('off-origin and nested joints', () => {
    it('should rotate a hinge about its own origin', () => {
      const hinge = withJoints({
        hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [10, 0, 0], axis: [0, 0, 1] },
      });
      const matrix = linkMatrix(posed(hinge, { hinge: 90 }), 'lid');

      expect(maxDifference(matrix, rotationAboutZ(90, [10, 0, 0]))).toBeLessThan(1e-12);
      expect(maxDifference(transformPoint(matrix, [20, 0, 0]), [10, 10, 0])).toBeLessThan(1e-12);
      expect(maxDifference(transformPoint(matrix, [10, 0, 5]), [10, 0, 5])).toBeLessThan(1e-12);
    });

    const gimbal: Mechanism = {
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links: {
        base: { components: [] },
        yawFrame: { components: [] },
        pitchFrame: { components: [] },
        camera: { components: ['Camera'] },
      },
      joints: {
        yaw: { type: 'revolute', parent: 'base', child: 'yawFrame', origin: [0, 0, 0], axis: [0, 0, 1] },
        pitch: { type: 'revolute', parent: 'yawFrame', child: 'pitchFrame', origin: [0, 0, 10], axis: [0, 1, 0] },
        mount: { type: 'fixed', parent: 'pitchFrame', child: 'camera', origin: [0, 0, 20] },
      },
    };

    it('should carry pitch and its descendants with yaw', () => {
      const pose = posed(gimbal, { yaw: 90 });

      expect(linkMatrix(pose, 'pitchFrame')).toEqual(linkMatrix(pose, 'yawFrame'));
      expect(linkMatrix(pose, 'camera')).toEqual(linkMatrix(pose, 'yawFrame'));
      expect(maxDifference(transformPoint(linkMatrix(pose, 'camera'), [5, 0, 20]), [0, 5, 20])).toBeLessThan(1e-12);
    });

    it('should move only the pitch descendants with pitch', () => {
      const pose = posed(gimbal, { pitch: 90 });

      expect(linkMatrix(pose, 'yawFrame')).toEqual(identityMatrix);
      expect(maxDifference(transformPoint(linkMatrix(pose, 'camera'), [0, 0, 20]), [10, 0, 10])).toBeLessThan(1e-12);
    });

    it('should compose yaw after pitch for a camera point', () => {
      const pose = posed(gimbal, { yaw: 90, pitch: 90 });

      expect(maxDifference(transformPoint(linkMatrix(pose, 'camera'), [0, 0, 20]), [0, 10, 10])).toBeLessThan(1e-12);
    });
  });

  describe('multi-degree-of-freedom joints', () => {
    const cylinder = withJoints({
      sleeve: { type: 'cylindrical', parent: 'base', child: 'sleeve', origin: [0, 20, 0], axis: [0, 1, 0] },
    });

    it('should keep cylindrical rotation and translation independent', () => {
      const rotated = linkMatrix(posed(cylinder, { 'sleeve/angle': 90 }), 'sleeve');
      const slid = linkMatrix(posed(cylinder, { 'sleeve/distance': 5 }), 'sleeve');
      const both = linkMatrix(posed(cylinder, { 'sleeve/angle': 90, 'sleeve/distance': 5 }), 'sleeve');

      expect(maxDifference(transformPoint(rotated, [1, 20, 0]), [0, 20, -1])).toBeLessThan(1e-12);
      expect(slid).toEqual([...identityMatrix.slice(0, 12), 0, 5, 0, 1]);
      expect(maxDifference(transformPoint(both, [1, 20, 0]), [0, 25, -1])).toBeLessThan(1e-12);
    });

    const axis: SpatialVector = [1 / 3, 2 / 3, 2 / 3];
    const ball = withJoints({
      ball: { type: 'spherical', parent: 'base', child: 'ball', origin: [4, -2, 7] },
      hinge: { type: 'revolute', parent: 'base', child: 'hinge', origin: [4, -2, 7], axis: [1, 2, 2] },
    });

    it.each([
      ['a tiny', 1e-7],
      ['a small', 1e-3],
      ['a large', 140],
    ])('should agree with a revolute joint for %s rotation about the same axis', (_name, degrees) => {
      const pose = posed(ball, {
        'ball/x': axis[0] * degrees,
        'ball/y': axis[1] * degrees,
        'ball/z': axis[2] * degrees,
        hinge: degrees,
      });

      expect(maxDifference(linkMatrix(pose, 'ball'), linkMatrix(pose, 'hinge'))).toBeLessThan(1e-12);
    });

    it('should match the first-order rotation for a tiny spherical rotation vector', () => {
      const radians = (1e-7 * Math.PI) / 180;
      const matrix = linkMatrix(posed(ball, { 'ball/z': 1e-7 }), 'ball');

      expect(maxDifference(matrix.slice(0, 11), [1, radians, 0, 0, -radians, 1, 0, 0, 0, 0, 1])).toBeLessThan(1e-15);
    });

    it('should rotate a planar joint about its normal and then translate it in the plane', () => {
      const matrix = linkMatrix(posed(everyJoint(), { 'puck/x': 3, 'puck/y': 4, 'puck/angle': 30 }), 'puck');
      const cosine = Math.cos(Math.PI / 6);

      expect(maxDifference(transformPoint(matrix, [1, 0, -10]), [3 + cosine, 4.5, -10])).toBeLessThan(1e-12);
    });

    it('should take the planar y direction as normal × xAxis', () => {
      const tilted = withJoints({
        puck: { type: 'planar', parent: 'base', child: 'puck', origin: [0, 0, 0], normal: [0, 2, 0], xAxis: [0, 0, 3] },
      });

      expect(linkMatrix(posed(tilted, { 'puck/x': 2, 'puck/y': 7 }), 'puck')).toEqual([
        ...identityMatrix.slice(0, 12),
        7,
        0,
        2,
        1,
      ]);
    });

    it('should translate a prismatic joint along its normalised axis', () => {
      const slide = withJoints({
        slide: { type: 'prismatic', parent: 'base', child: 'slide', origin: [0, 0, 0], axis: [3, 4, 0] },
      });

      expect(
        maxDifference(linkMatrix(posed(slide, { slide: 10 }), 'slide'), [...identityMatrix.slice(0, 12), 6, 8, 0, 1]),
      ).toBeLessThan(1e-12);
    });
  });

  describe('limits and couplings', () => {
    it('should clamp drivers to their limits and report them', () => {
      const pose = posed(everyJoint(), { arm: 120, slide: 50, nut: -10 });

      expect(pose.coordinates['arm']).toBe(90);
      expect(pose.coordinates['slide']).toBe(50);
      expect(pose.coordinates['nut']).toBe(0);
      expect(pose.coordinates['sleeve/angle']).toBe(181);
      expect(pose.atLimit).toEqual(['arm', 'nut']);
    });

    it('should report a follower outside its limits without clamping it', () => {
      const mechanism = everyJoint();
      const outcome = admitMechanism({
        ...mechanism,
        joints: {
          ...mechanism.joints,
          sleeve: { ...mechanism.joints['sleeve'], limits: { angle: { lower: -100, upper: 100 } } },
        },
      });
      const pose = posed(outcome.status === 'admitted' ? outcome.mechanism : mechanism, { arm: 80 });

      expect(pose.coordinates['sleeve/angle']).toBe(161);
      expect(pose.atLimit).toEqual(['sleeve/angle']);
    });

    it('should resolve coupling chains in dependency order regardless of declaration order', () => {
      const chain: Mechanism = {
        ...withJoints({
          a: { type: 'revolute', parent: 'base', child: 'first', origin: [0, 0, 0], axis: [0, 0, 1] },
          b: { type: 'revolute', parent: 'first', child: 'second', origin: [1, 0, 0], axis: [0, 0, 1] },
          c: { type: 'prismatic', parent: 'second', child: 'third', origin: [2, 0, 0], axis: [1, 0, 0] },
        }),
        couplings: [
          { driver: 'b', follower: 'c', ratio: 3, offset: 1 },
          { driver: 'a', follower: 'b', ratio: 2, offset: 4 },
        ],
      };
      const pose = posed(chain, { a: 5 });

      expect(pose.coordinates).toEqual({ a: 5, b: 14, c: 43 });
      expect(pose.linkTransforms['third']![12]).toBeCloseTo(
        transformPoint(linkMatrix(pose, 'second'), [43, 0, 0])[0],
        12,
      );
    });
  });

  describe('issues', () => {
    it('should report unknown, follower and non-finite coordinates with JSON pointers', () => {
      const outcome = evaluatePose({
        mechanism: everyJoint(),
        coordinates: { ghost: 1, 'sleeve/angle': 2, arm: Number.NaN },
      });

      expect(outcome.status === 'invalid' && outcome.issues.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: 'UNKNOWN_DEGREE_OF_FREEDOM', path: '/coordinates/ghost' },
        { code: 'DRIVEN_FOLLOWER', path: '/coordinates/sleeve~1angle' },
        { code: 'INVALID_VALUE', path: '/coordinates/arm' },
      ]);
    });

    it('should return admission issues for an inadmissible mechanism', () => {
      const outcome = evaluatePose({ mechanism: { ...everyJoint(), root: 'ground' }, coordinates: {} });

      expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
        expect.objectContaining({ code: 'UNKNOWN_LINK', path: '/root' }),
      );
    });
  });

  describe('scale', () => {
    it('should pose a thousand-link chain with orthonormal rotations', () => {
      const mechanism = linearChain(1000);
      const coordinates = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`joint${index + 1}`, 1]));
      const last = linkMatrix(posed(mechanism, coordinates), 'link1000');
      const columns = [last.slice(0, 3), last.slice(4, 7), last.slice(8, 11)];

      expect(columns.map((column) => Math.hypot(...column))).toEqual([
        expect.closeTo(1, 12),
        expect.closeTo(1, 12),
        expect.closeTo(1, 12),
      ]);
      expect(linkMatrix(posed(mechanism, {}), 'link1000')).toEqual(identityMatrix);
    });
  });
});

describe('sampleAnimation', () => {
  const sweep = everyJoint().animations![0]!;

  it('should interpolate linearly and hold a coordinate set by one keyframe', () => {
    expect(sampleAnimation({ animation: sweep, time: 1 })).toEqual({ arm: 45, nut: 720 });
  });

  it.each([
    [2.5, 67.5],
    [3, 45],
    [4, 0],
    [-1, 45],
  ])('should mirror ping-pong playback at %s s', (time, arm) => {
    expect(sampleAnimation({ animation: sweep, time })['arm']).toBeCloseTo(arm, 12);
  });

  it.each([
    [10, 360],
    [-2, 1080],
    [8, 0],
  ])('should wrap repeat playback at %s s', (time, sunSpin) => {
    const planetary = planetaryGearSystem();

    expect(sampleAnimation({ animation: planetary.animations![0]!, time })).toEqual({ sunSpin });
  });

  const clip: Animation = {
    id: 'clip',
    duration: 4,
    keyframes: [
      { time: 1, coordinates: { arm: 10 } },
      { time: 3, coordinates: { arm: 30, slide: 5 } },
    ],
  };

  it.each([
    [-1, 10],
    [0.5, 10],
    [2, 20],
    [3.5, 30],
    [9, 30],
  ])('should hold outside the keyframes without looping at %s s', (time, arm) => {
    expect(sampleAnimation({ animation: clip, time })['arm']).toBe(arm);
  });

  it('should pose the planetary clip back to the reference at the end of the loop', () => {
    const planetary = planetaryGearSystem();
    const coordinates = sampleAnimation({ animation: planetary.animations![0]!, time: 7.9999 });
    const pose = posed(planetary, coordinates);

    expect(maxDifference(linkMatrix(pose, 'planet3'), identityMatrix)).toBeLessThan(0.02);
  });
});

describe('curve couplings', () => {
  /** Where the rod's big end is: its as-built position carried by the rod's transform. */
  const bigEnd = (pose: Pose): SpatialVector => transformPoint(linkMatrix(pose, 'rod'), [0, 0, crankRadius]);
  const crankPin = (pose: Pose): SpatialVector => transformPoint(linkMatrix(pose, 'crank'), [0, 0, crankRadius]);

  it('should reproduce every sample exactly', () => {
    for (let crank = 0; crank < 360; crank += 5) {
      const pose = posed(sliderCrank(), { crank });

      expect([crank, pose.coordinates['piston']]).toEqual([crank, pistonTravel(crank)]);
      expect([crank, pose.coordinates['rod']]).toEqual([crank, rodSwing(crank)]);
    }
  });

  it('should keep the rod on the crank pin between samples within the interpolation error', () => {
    for (const crank of [2.5, 37, 91, 178, 263.3, 359]) {
      const pose = posed(sliderCrank(), { crank });

      expect(maxDifference(bigEnd(pose), crankPin(pose))).toBeLessThan(0.1);
      expect(Math.abs(pose.coordinates['piston']! - pistonTravel(crank))).toBeLessThan(0.06);
    }
  });

  it('should close the loop more tightly with more samples', () => {
    const coarse = posed(sliderCrank(24), { crank: 97 });
    const fine = posed(sliderCrank(720), { crank: 97 });

    expect(maxDifference(bigEnd(fine), crankPin(fine))).toBeLessThan(
      maxDifference(bigEnd(coarse), crankPin(coarse)) / 50,
    );
  });

  it('should repeat every period in both directions', () => {
    const mechanism = sliderCrank();

    expect(posed(mechanism, { crank: 365 }).coordinates['piston']).toBeCloseTo(
      posed(mechanism, { crank: 5 }).coordinates['piston']!,
      12,
    );
    expect(posed(mechanism, { crank: -5 }).coordinates['piston']).toBeCloseTo(
      posed(mechanism, { crank: 355 }).coordinates['piston']!,
      12,
    );
    expect(posed(mechanism, { crank: -720 }).coordinates['rod']).toBeCloseTo(0, 12);
    expect(posed(mechanism, { crank: -1e-13 }).coordinates['piston']).toBeCloseTo(0, 9);
  });

  it('should chain a linear follower after a curve follower', () => {
    const base = sliderCrank();
    const mechanism: Mechanism = {
      ...base,
      links: { ...base.links, gauge: { components: ['Gauge'] } },
      joints: {
        ...base.joints,
        gauge: { type: 'revolute', parent: 'block', child: 'gauge', origin: [60, 0, 0], axis: [0, 1, 0] },
      },
      couplings: [...base.couplings!, { driver: 'rod', follower: 'gauge', ratio: -2, offset: 1 }],
    };

    expect(posed(mechanism, { crank: 30 }).coordinates['gauge']).toBeCloseTo(-2 * rodSwing(30) + 1, 12);
  });

  it('should report a curve follower outside its limits without clamping it', () => {
    const base = sliderCrank();
    const piston: Joint = {
      type: 'prismatic',
      parent: 'block',
      child: 'piston',
      origin: [0, 0, 180],
      axis: [0, 0, 1],
      limits: { lower: -50, upper: 0 },
    };
    const mechanism: Mechanism = { ...base, joints: { ...base.joints, piston } };
    const pose = posed(mechanism, { crank: 180 });

    expect(pose.atLimit).toEqual(['piston']);
    expect(pose.coordinates['piston']).toBeCloseTo(-2 * crankRadius, 12);
  });

  it('should reject a curve whose as-built value lies outside the follower limits', () => {
    const base = sliderCrank();
    const outcome = admitMechanism({
      ...base,
      couplings: [
        { driver: 'crank', follower: 'piston', curve: { driverPeriod: 360, values: [5, -80] } },
        base.couplings![1],
      ],
    });

    expect(outcome.status === 'invalid' && outcome.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_LIMITS',
        path: '/joints/piston/limits',
        message: '"piston" is 5 at the as-built pose, outside its limits [-80, 0].',
      }),
    ]);
  });

  it('should hold the rod length on a coarse two-sample curve only at the samples', () => {
    expect(rodLength).toBeGreaterThan(crankRadius);
    const pose = posed(sliderCrank(2), { crank: 180 });

    expect(maxDifference(bigEnd(pose), crankPin(pose))).toBeLessThan(1e-9);
  });
});
