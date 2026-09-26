import { describe, expect, it } from 'vitest';
import { admitMechanism, evaluatePose, resolveMechanismComponents, transformMechanism } from '@taucad/kinematics';
import type { JointLimits, Mechanism, MechanismSource, Pose } from '@taucad/kinematics';
import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { maxDifference, rotationAboutZ, transformPoint } from '#testing/geometry.js';
import { everyJoint, sixAxisArm, sliderCrank, transformed } from '#testing/mechanisms.js';

/** Z-up to Y-up (x, y, z) → (x, z, −y), then lifted by 5 along the new Z. */
const yUpFrame: SpatialMatrix = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 5, 1];

const poseOf = (mechanism: Mechanism, coordinates: Readonly<Record<string, number>>): Pose => {
  const outcome = evaluatePose({ mechanism, coordinates });
  if (outcome.status !== 'posed') {
    throw new Error(`Expected a pose, got ${JSON.stringify(outcome.issues)}`);
  }
  return outcome.pose;
};

/** Revolute pinion driving a prismatic rack: 0.5 mm of rack travel per degree, offset 3 mm. */
const rackAndPinion = (): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'frame',
  links: { frame: { components: [] }, pinion: { components: ['Pinion'] }, rack: { components: ['Rack'] } },
  joints: {
    pinionSpin: {
      type: 'revolute',
      parent: 'frame',
      child: 'pinion',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -90, upper: 90 },
    },
    rackSlide: { type: 'prismatic', parent: 'frame', child: 'rack', origin: [0, -10, 0], axis: [1, 0, 0] },
  },
  couplings: [{ driver: 'pinionSpin', follower: 'rackSlide', ratio: 0.5, offset: 3 }],
  animations: [{ id: 'swing', duration: 1, keyframes: [{ time: 0, coordinates: { pinionSpin: 30 } }] }],
});

/**
 * A ball on an arm whose yaw turns a flap, whose pitch follows the arm and whose roll follows a
 * keyframed socket: spherical components as coupling drivers, followers and sparse keyframes.
 */
const ballAndSocket = (limits: JointLimits): Mechanism => ({
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: {
    base: { components: [] },
    arm: { components: [] },
    ball: { components: [] },
    flap: { components: [] },
    cup: { components: [] },
  },
  joints: {
    arm: { type: 'revolute', parent: 'base', child: 'arm', origin: [10, 0, 0], axis: [0, 0, 1] },
    ball: { type: 'spherical', parent: 'arm', child: 'ball', origin: [20, 0, 0], limits },
    flap: { type: 'revolute', parent: 'ball', child: 'flap', origin: [30, 0, 5], axis: [0, 1, 0] },
    socket: { type: 'spherical', parent: 'base', child: 'cup', origin: [0, 10, 0] },
  },
  couplings: [
    { driver: 'ball/z', follower: 'flap', ratio: 1 },
    { driver: 'arm', follower: 'ball/y', ratio: 0.5, offset: 2 },
    { driver: 'socket/y', follower: 'ball/x', ratio: 0.25 },
  ],
  animations: [
    {
      id: 'wobble',
      duration: 1,
      keyframes: [
        { time: 0, coordinates: { 'socket/y': 20 } },
        { time: 1, coordinates: { 'socket/x': 5, 'socket/z': 10 } },
      ],
    },
  ],
});

/**
 * Expect every link to move the same after the frame change: `after(F p) = F before(p)`.
 *
 * @param before - Pose in the source frame.
 * @param after - Pose of the transformed mechanism.
 * @param frame - The frame change.
 */
const expectSameMotion = (before: Pose, after: Pose, frame: SpatialMatrix): void => {
  const probe: SpatialVector = [7, -3, 11];
  for (const [link, matrix] of Object.entries(before.linkTransforms)) {
    const expected = transformPoint(frame, transformPoint(matrix, probe));
    const actual = transformPoint(after.linkTransforms[link]!, transformPoint(frame, probe));
    expect([link, maxDifference(actual, expected)]).toEqual([link, expect.closeTo(0, 9)]);
  }
};

describe('transformMechanism', () => {
  it('should scale distances, leads and distance limits from millimetres to metres and keep angles', () => {
    const mechanism = everyJoint();
    const original = structuredClone(mechanism);
    const metres = transformed({ mechanism, units: { length: 'm', angle: 'deg' } });

    expect(mechanism).toEqual(original);
    expect(metres.units).toEqual({ length: 'm', angle: 'deg' });
    const millimetre = (value: number): unknown => expect.closeTo(value / 1000, 15);
    expect(metres.joints['arm']).toEqual({ ...mechanism.joints['arm'], origin: [millimetre(10), 0, 0] });
    expect(metres.joints['slide']).toEqual({
      ...mechanism.joints['slide'],
      limits: { lower: 0, upper: millimetre(50) },
    });
    expect(metres.joints['nut']).toEqual(
      expect.objectContaining({
        origin: [0, 0, millimetre(30)],
        lead: millimetre(2),
        limits: { lower: 0, upper: 3600 },
      }),
    );
    expect(metres.joints['sleeve']).toEqual(
      expect.objectContaining({
        limits: { angle: { lower: -360, upper: 360 }, distance: { lower: 0, upper: millimetre(10) } },
      }),
    );
    expect(metres.joints['puck']).toEqual(
      expect.objectContaining({
        limits: { x: { lower: millimetre(-5), upper: millimetre(5) }, angle: { lower: -30, upper: 30 } },
      }),
    );
    expect(metres.couplings).toEqual(mechanism.couplings);
    expect(metres.animations).toEqual(mechanism.animations);
  });

  it('should reproduce the same motion in metres', () => {
    const mechanism = everyJoint();
    const metres = transformed({ mechanism, units: { length: 'm', angle: 'deg' } });
    const millimetrePose = poseOf(mechanism, { arm: 30, slide: 20, nut: 400, 'puck/x': 2 });
    const metrePose = poseOf(metres, { arm: 30, slide: 0.02, nut: 400, 'puck/x': 0.002 });

    for (const [link, matrix] of Object.entries(millimetrePose.linkTransforms)) {
      const scaled = [...matrix.slice(0, 12), matrix[12] / 1000, matrix[13] / 1000, matrix[14] / 1000, 1];
      expect(maxDifference(metrePose.linkTransforms[link]!, scaled)).toBeLessThan(1e-12);
    }
  });

  it('should scale distance keyframes by the length factor and angle keyframes by the angle factor', () => {
    const mechanism: Mechanism = {
      ...everyJoint(),
      animations: [{ id: 'push', duration: 1, keyframes: [{ time: 0, coordinates: { slide: 50, arm: 30 } }] }],
    };
    const converted = transformed({ mechanism, units: { length: 'm', angle: 'rad' } });
    const close = (value: number): unknown => expect.closeTo(value, 15);

    expect(converted.animations![0]!.keyframes[0]!.coordinates).toEqual({
      slide: close(0.05),
      arm: close(Math.PI / 6),
    });
  });

  it('should rescale coupling ratios and offsets that cross units', () => {
    const converted = transformed({ mechanism: rackAndPinion(), units: { length: 'm', angle: 'rad' } });
    const degree = Math.PI / 180;

    const close = (value: number): unknown => expect.closeTo(value, 15);

    expect(converted.couplings).toEqual([
      { driver: 'pinionSpin', follower: 'rackSlide', ratio: close(0.0005 / degree), offset: close(0.003) },
    ]);
    expect(converted.joints['pinionSpin']).toEqual(
      expect.objectContaining({ limits: { lower: close(-Math.PI / 2), upper: close(Math.PI / 2) } }),
    );
    expect(converted.animations![0]!.keyframes[0]!.coordinates['pinionSpin']).toBeCloseTo(Math.PI / 6, 15);
    expect(poseOf(converted, { pinionSpin: Math.PI / 6 }).coordinates['rackSlide']).toBeCloseTo(0.018, 15);
  });

  it('should move the mechanism rigidly into another frame', () => {
    const mechanism = everyJoint();
    const moved = transformed({ mechanism, units: mechanism.units, matrix: yUpFrame });
    const coordinates = {
      arm: 30,
      slide: 20,
      nut: 400,
      'sleeve/distance': 4,
      'puck/x': 2,
      'puck/y': 3,
      'puck/angle': 10,
    };
    const before = poseOf(mechanism, { ...coordinates, 'ball/x': 10, 'ball/y': 20 });
    const after = poseOf(moved, { ...coordinates, 'ball/x': 10, 'ball/z': -20 });

    expect(moved.joints['puck']).toEqual(
      expect.objectContaining({ origin: [0, -10, 5], normal: [0, 1, 0], xAxis: [1, 0, 0] }),
    );
    expectSameMotion(before, after, yUpFrame);
  });

  it('should rename spherical coupling and keyframe components to the Z-up to Y-up axes with their signs', () => {
    const mechanism = ballAndSocket({ lower: -45, upper: 45 });
    const moved = transformed({ mechanism, units: mechanism.units, matrix: yUpFrame });
    // The source frame's (x, y, z) are the new frame's (x, −z, y).
    const before = poseOf(mechanism, { arm: 30, 'ball/z': 30, 'socket/x': 5, 'socket/y': 20, 'socket/z': -15 });
    const after = poseOf(moved, { arm: 30, 'ball/y': 30, 'socket/x': 5, 'socket/z': -20, 'socket/y': -15 });

    expect(admitMechanism(moved).status).toBe('admitted');
    expect(moved.joints['ball']).toEqual(expect.objectContaining({ limits: { lower: -45, upper: 45 } }));
    expect(moved.couplings).toEqual([
      { driver: 'ball/y', follower: 'flap', ratio: 1 },
      { driver: 'arm', follower: 'ball/z', ratio: -0.5, offset: -2 },
      { driver: 'socket/z', follower: 'ball/x', ratio: -0.25 },
    ]);
    expect(moved.animations![0]!.keyframes.map((keyframe) => keyframe.coordinates)).toEqual([
      { 'socket/z': -20 },
      { 'socket/x': 5, 'socket/y': 10 },
    ]);
    // Yaw about the source Z (the new Y) still turns the flap, and every link moves the same.
    expect([before.coordinates['flap'], after.coordinates['flap']]).toEqual([30, 30]);
    expectSameMotion(before, after, yUpFrame);
  });

  it('should reject asymmetric spherical limits, which no box in the Y-up frame could express', () => {
    const mechanism = ballAndSocket({ lower: -10, upper: 80 });

    expect(admitMechanism(mechanism)).toEqual({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'INVALID_LIMITS', path: '/joints/ball/limits' })],
    });
    expect(transformMechanism({ mechanism, units: mechanism.units, matrix: yUpFrame })).toEqual({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'INVALID_LIMITS', path: '/joints/ball/limits' })],
    });
  });

  it('should re-express a spherical joint without limits, couplings or keyframes under any rotation', () => {
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links: { base: { components: [] }, ball: { components: [] } },
      joints: { ball: { type: 'spherical', parent: 'base', child: 'ball', origin: [4, -2, 7] } },
    };
    const frame = rotationAboutZ(30);
    // Spherical ids name the new frame's axes, so the same rotation vector is rotated by the frame.
    const [x, y, z] = transformPoint(rotationAboutZ(30), [10, 20, -30]);

    expectSameMotion(
      poseOf(mechanism, { 'ball/x': 10, 'ball/y': 20, 'ball/z': -30 }),
      poseOf(transformed({ mechanism, units: mechanism.units, matrix: frame }), {
        'ball/x': x,
        'ball/y': y,
        'ball/z': z,
      }),
      frame,
    );
  });

  const { couplings, animations, ...unlimited } = ballAndSocket({ lower: -45, upper: 45 });
  const withoutLimits: Mechanism = {
    ...unlimited,
    joints: { ...unlimited.joints, ball: { type: 'spherical', parent: 'arm', child: 'ball', origin: [20, 0, 0] } },
  };

  it.each<[string, Mechanism, string]>([
    ['limits', unlimited, 'ball'],
    ['a coupling', { ...withoutLimits, couplings }, 'ball'],
    ['a keyframe', { ...withoutLimits, animations }, 'socket'],
  ])('should report a spherical joint with %s under a rotation that mixes the axes', (_name, mechanism, jointId) => {
    const outcome = transformMechanism({ mechanism, units: mechanism.units, matrix: rotationAboutZ(30) });

    expect(admitMechanism(mechanism).status).toBe('admitted');
    expect(outcome.status === 'invalid' && outcome.issues).toContainEqual(
      expect.objectContaining({ code: 'INVALID_TRANSFORM', path: `/joints/${jointId}` }),
    );
  });

  it.each<[string, SpatialMatrix, RegExp]>([
    ['a mirror', [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], /mirrors/],
    ['a non-uniform scale', [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], /not orthonormal/],
    ['a non-finite entry', [Number.NaN, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], /not finite/],
    ['a projective bottom row', [1, 0, 0, 0.5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], /bottom row/],
  ])('should report %s instead of returning a wrong mechanism', (_name, matrix, reason) => {
    const outcome = transformMechanism({ mechanism: everyJoint(), units: everyJoint().units, matrix });

    expect(outcome.status === 'invalid' && outcome.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_TRANSFORM', path: '/matrix' }),
    ]);
    expect(outcome.status === 'invalid' && outcome.issues[0]?.message).toMatch(reason);
  });

  it('should move sparse spherical keyframes to the permuted components', () => {
    const mechanism: Mechanism = {
      ...everyJoint(),
      animations: [
        {
          id: 'wobble',
          duration: 1,
          keyframes: [
            { time: 0, coordinates: { 'ball/y': 20 } },
            { time: 0.5, coordinates: { 'ball/x': 5 } },
            { time: 1, coordinates: { arm: 5 } },
          ],
        },
      ],
    };
    const moved = transformed({ mechanism, units: mechanism.units, matrix: yUpFrame });

    expect(moved.animations![0]!.keyframes.map((keyframe) => keyframe.coordinates)).toEqual([
      { 'ball/z': -20 },
      { 'ball/x': 5 },
      { arm: 5 },
    ]);
  });

  it('should scale a curve coupling and reproduce the slider-crank in metres and Y-up', () => {
    const mechanism = sliderCrank();
    const metres = transformed({ mechanism, units: { length: 'm', angle: 'rad' } });
    const moved = transformed({ mechanism: metres, units: metres.units, matrix: yUpFrame });
    const curve = moved.couplings![0]!;

    expect('curve' in curve && curve.curve.driverPeriod).toBeCloseTo(2 * Math.PI, 12);
    for (const crank of [0, 37, 200]) {
      const radians = (crank * Math.PI) / 180;
      const before = poseOf(metres, { crank: radians });

      expect(before.coordinates['piston']).toBeCloseTo(poseOf(mechanism, { crank }).coordinates['piston']! / 1000, 12);
      expect(before.coordinates['rod']).toBeCloseTo(
        (poseOf(mechanism, { crank }).coordinates['rod']! * Math.PI) / 180,
        12,
      );
      expectSameMotion(before, poseOf(moved, { crank: radians }), yUpFrame);
    }
  });

  it('should read a curve backwards when an axis permutation negates its spherical driver', () => {
    const mechanism: Mechanism = {
      ...ballAndSocket({ lower: -45, upper: 45 }),
      couplings: [{ driver: 'ball/y', follower: 'flap', curve: { driverPeriod: 90, values: [0, 10, 25, 5] } }],
      animations: [],
    };
    const moved = transformed({ mechanism, units: mechanism.units, matrix: yUpFrame });
    // The source frame's (x, y, z) are the new frame's (x, −z, y), so source ball/y is new −ball/z.
    const before = poseOf(mechanism, { 'ball/y': 30 });
    const after = poseOf(moved, { 'ball/z': -30 });

    expect(moved.couplings).toEqual([
      { driver: 'ball/z', follower: 'flap', curve: { driverPeriod: 90, values: [0, 5, 25, 10] } },
    ]);
    expect(after.coordinates['flap']).toBeCloseTo(before.coordinates['flap']!, 12);
    expectSameMotion(before, after, yUpFrame);
  });

  it('should keep optional sections absent', () => {
    const converted = transformed({ mechanism: sixAxisArm(), units: { length: 'm', angle: 'rad' } });

    expect(Object.keys(converted)).toEqual(['schemaVersion', 'units', 'root', 'links', 'joints']);
    expect(transformed({ mechanism: rackAndPinion(), units: rackAndPinion().units }).couplings).toEqual([
      { driver: 'pinionSpin', follower: 'rackSlide', ratio: 0.5, offset: 3 },
    ]);
  });

  it('should keep a coupling without an offset free of one', () => {
    const mechanism = { ...rackAndPinion(), couplings: [{ driver: 'pinionSpin', follower: 'rackSlide', ratio: 0.5 }] };

    expect(transformed({ mechanism, units: { length: 'm', angle: 'deg' } }).couplings).toEqual([
      { driver: 'pinionSpin', follower: 'rackSlide', ratio: 0.0005 },
    ]);
  });

  it('should return admission issues for an inadmissible mechanism', () => {
    const outcome = transformMechanism({
      mechanism: { ...sixAxisArm(), root: 'ground' },
      units: { length: 'm', angle: 'deg' },
    });

    expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
      expect.objectContaining({ code: 'UNKNOWN_LINK', path: '/root' }),
    );
  });
});

describe('resolveMechanismComponents', () => {
  const componentIds: Readonly<Record<string, string>> = Object.fromEntries(
    ['Base', 'Turret', 'Upper Arm', 'Forearm', 'Wrist Housing', 'Wrist', 'Flange', 'Gripper'].map((name) => [
      name,
      `component-${name.toLowerCase().replace(' ', '-')}`,
    ]),
  );
  /** The six-axis arm as authored: its links name shapes. */
  const source = (): MechanismSource => {
    const mechanism = sixAxisArm();
    return {
      ...mechanism,
      links: Object.fromEntries(
        Object.entries(mechanism.links).map(([id, { components }]) => [id, { shapes: components }]),
      ),
    };
  };

  it('should replace shape names by component ids and admit the result', () => {
    const authored = source();
    const outcome = resolveMechanismComponents({ source: authored, componentIds });

    expect(outcome.status).toBe('resolved');
    expect(outcome.status === 'resolved' && outcome.mechanism.links['flange']).toEqual({
      components: ['component-flange', 'component-gripper'],
    });
    expect(authored.links['flange']).toEqual({ shapes: ['Flange', 'Gripper'] });
  });

  it('should report every unknown name', () => {
    const known = Object.fromEntries(
      Object.entries(componentIds).filter(([name]) => name !== 'Gripper' && name !== 'Base'),
    );
    const outcome = resolveMechanismComponents({ source: source(), componentIds: known });

    expect(outcome.status === 'invalid' && outcome.issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'UNKNOWN_COMPONENT', path: '/links/base/shapes/0' },
      { code: 'UNKNOWN_COMPONENT', path: '/links/flange/shapes/1' },
    ]);
  });

  it('should not resolve a name through the prototype chain', () => {
    const authored = source();
    const outcome = resolveMechanismComponents({
      source: { ...authored, links: { ...authored.links, base: { shapes: ['toString'] } } },
      componentIds,
    });

    expect(outcome.status === 'invalid' && outcome.issues).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_COMPONENT', path: '/links/base/shapes/0' }),
    ]);
  });

  it('should report two names that resolve to one component at the authored path', () => {
    const shared = Object.fromEntries(Object.keys(componentIds).map((name) => [name, 'component-shared']));
    const outcome = resolveMechanismComponents({ source: source(), componentIds: shared });

    expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
      expect.objectContaining({ code: 'DUPLICATE_COMPONENT', path: '/links/turret/shapes/0' }),
    );
  });

  it('should report a shape name that is not a string', () => {
    const authored = source();
    const outcome = resolveMechanismComponents({
      source: { ...authored, links: { ...authored.links, base: { shapes: [7] } } },
      componentIds,
    });

    expect(outcome.status === 'invalid' && outcome.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_SHAPE', path: '/links/base/shapes/0' }),
    ]);
  });

  it('should reject a link written in the resolved form', () => {
    const outcome = resolveMechanismComponents({ source: sixAxisArm(), componentIds });

    expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
      expect.objectContaining({ code: 'INVALID_SHAPE', path: '/links/base' }),
    );
    expect(outcome.status === 'invalid' && outcome.issues[0]?.message).toContain('{ shapes: string[] }');
  });

  it('should return admission issues for a malformed top level', () => {
    expect(resolveMechanismComponents({ source: 42, componentIds })).toEqual({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'INVALID_SHAPE' })],
    });
  });
});
