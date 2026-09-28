import { describe, expect, it } from 'vitest';
import { admitMechanism, evaluatePose, listDegreesOfFreedom, solvePose } from '@taucad/kinematics';
import type {
  Coupling,
  Joint,
  Mechanism,
  MechanismUnits,
  PoseGoal,
  SolvePoseInput,
  SolvePoseOutcome,
} from '@taucad/kinematics';
import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { planOf } from '#mechanism.js';
import { clampedDrivers } from '#pose.js';
import { createProblem, createState } from '#solver.js';
import { maxDifference, rotationAboutZ, transformPoint } from '#testing/geometry.js';
import {
  pistonTravel,
  planetaryGearSystem,
  sixAxisArm,
  sliderCrank,
  transformed,
  twoLinkArm,
  wormGearSystem,
} from '#testing/mechanisms.js';

const tip = (target: SpatialVector): PoseGoal => ({ type: 'point', link: 'lower', localPoint: [2, 0, 0], target });

const solved = (input: SolvePoseInput): Extract<SolvePoseOutcome, { status: 'solved' | 'blocked' }> => {
  const outcome = solvePose(input);
  if (outcome.status === 'invalid') {
    throw new Error(`Expected a solve, got ${JSON.stringify(outcome.issues)}`);
  }
  return outcome;
};

const worldPoint = (
  outcome: Extract<SolvePoseOutcome, { pose: unknown }>,
  link: string,
  point: SpatialVector,
): SpatialVector => transformPoint(outcome.pose.linkTransforms[link]!, point);

const withLimits = (mechanism: Mechanism, jointId: string, limits: Readonly<Record<string, unknown>>): Mechanism => {
  const outcome = admitMechanism({
    ...mechanism,
    joints: { ...mechanism.joints, [jointId]: { ...mechanism.joints[jointId], limits } },
  });
  if (outcome.status === 'invalid') {
    throw new Error(`Expected admissible limits, got ${JSON.stringify(outcome.issues)}`);
  }
  return outcome.mechanism;
};

const flangeTarget = (coordinates: Readonly<Record<string, number>>): SpatialMatrix => {
  const outcome = evaluatePose({ mechanism: sixAxisArm(), coordinates });
  if (outcome.status !== 'posed') {
    throw new Error('Expected a pose');
  }
  return outcome.pose.linkTransforms['flange']!;
};

describe('solvePose', () => {
  describe('two-link arm', () => {
    it('should reach a reachable target within the default tolerance', () => {
      const outcome = solved({ mechanism: twoLinkArm(), seed: { shoulder: 0.1, elbow: 0.3 }, goals: [tip([1, 1, 0])] });

      expect(outcome.status).toBe('solved');
      expect(outcome.iterations).toBeGreaterThan(0);
      expect(outcome.residual).toBeLessThanOrEqual(1e-6);
      expect(maxDifference(worldPoint(outcome, 'lower', [2, 0, 0]), [1, 1, 0])).toBeLessThan(1e-6);
      // Analytic elbow-down solution for |target| = √2 with unit links: elbow = 90°, shoulder = 0.
      expect(outcome.pose.coordinates['elbow']).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should converge from a singular straight-arm seed', () => {
      const outcome = solved({ mechanism: twoLinkArm(), seed: {}, goals: [tip([1.5, 0, 0])] });

      expect(outcome.status).toBe('solved');
      expect(maxDifference(worldPoint(outcome, 'lower', [2, 0, 0]), [1.5, 0, 0])).toBeLessThan(1e-6);
    });

    it('should return the stretched arm pointing at an out-of-reach target', () => {
      const outcome = solved({
        mechanism: twoLinkArm(),
        seed: { shoulder: 0.1, elbow: 0.3 },
        goals: [tip([3, 0.5, 0])],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      expect(outcome.pose.coordinates['elbow']).toBeCloseTo(0, 2);
      expect(outcome.pose.coordinates['shoulder']).toBeCloseTo(Math.atan2(0.5, 3), 3);
      expect(outcome.residual).toBeCloseTo(Math.hypot(3, 0.5) - 2, 6);
    });

    it('should report an out-of-plane target as unreachable with the closest in-plane pose', () => {
      const outcome = solved({
        mechanism: twoLinkArm(),
        seed: { shoulder: 0.1, elbow: 0.3 },
        goals: [tip([1, 1, 0.5])],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      expect(outcome.residual).toBeCloseTo(0.5, 9);
      expect(maxDifference(worldPoint(outcome, 'lower', [2, 0, 0]), [1, 1, 0])).toBeLessThan(1e-6);
    });

    it('should keep the seed when a straight arm already points at an out-of-reach target', () => {
      const outcome = solved({ mechanism: twoLinkArm(), seed: {}, goals: [tip([3, 0, 0])] });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      expect(outcome.pose.coordinates).toEqual({ shoulder: 0, elbow: 0 });
      expect(outcome.residual).toBe(1);
    });

    it('should stop at a joint limit and report it', () => {
      const limited = withLimits(twoLinkArm(), 'shoulder', { lower: -0.2, upper: 0.2 });
      const outcome = solved({ mechanism: limited, seed: {}, goals: [tip([0, 2, 0])] });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'limit' }));
      expect(outcome.pose.coordinates['shoulder']).toBe(0.2);
    });

    it('should report singular when no driver moves the goal', () => {
      const grounded = solved({
        mechanism: twoLinkArm(),
        seed: {},
        goals: [{ type: 'point', link: 'base', localPoint: [0, 0, 0], target: [1, 0, 0] }],
      });

      expect(grounded).toEqual(expect.objectContaining({ status: 'blocked', reason: 'singular' }));
    });

    it('should solve a mechanism without joints', () => {
      const lone: Mechanism = {
        schemaVersion: 1,
        units: { length: 'm', angle: 'rad' },
        root: 'block',
        links: { block: { components: [] } },
        joints: {},
      };
      const outcome = solved({
        mechanism: lone,
        seed: {},
        goals: [{ type: 'point', link: 'block', localPoint: [1, 2, 3], target: [1, 2, 3] }],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'solved', iterations: 0 }));
    });

    it('should finish without iterations when re-seeded from its own solution', () => {
      const first = solved({ mechanism: twoLinkArm(), seed: { shoulder: 0.1, elbow: 0.3 }, goals: [tip([1, 1, 0])] });
      const again = solved({ mechanism: twoLinkArm(), seed: first.pose.coordinates, goals: [tip([1, 1, 0])] });

      expect(again).toEqual(expect.objectContaining({ status: 'solved', iterations: 0 }));
      expect(again.pose).toEqual(first.pose);
    });

    it('should be deterministic', () => {
      const input: SolvePoseInput = { mechanism: twoLinkArm(), seed: { shoulder: 0.4 }, goals: [tip([0.5, 1.2, 0])] };

      expect(solvePose(input)).toEqual(solvePose(input));
    });

    it('should bend a nearly straight metre arm to reach 5 mm inside its reach', () => {
      const outcome = solved({
        mechanism: twoLinkArm(),
        seed: { shoulder: 0, elbow: -0.0005 },
        goals: [tip([1.995, 0, 0])],
      });

      expect(outcome.status).toBe('solved');
      // Unit links: |tip| = 2 cos(elbow / 2).
      expect(Math.abs(outcome.pose.coordinates['elbow']!)).toBeCloseTo(2 * Math.acos(0.9975), 4);
    });
  });

  describe('six-axis arm', () => {
    it('should reach a flange point goal from the as-built pose', () => {
      const outcome = solved({
        mechanism: sixAxisArm(),
        seed: {},
        goals: [{ type: 'point', link: 'flange', localPoint: [380, 0, 400], target: [250, 150, 350] }],
      });

      expect(outcome.status).toBe('solved');
      expect(maxDifference(worldPoint(outcome, 'flange', [380, 0, 400]), [250, 150, 350])).toBeLessThan(1e-6);
    });

    // The straight arm a drag leaves after overshooting the 680 mm reach from the shoulder at [0, 0, 100].
    const straight = {
      baseYaw: 35.5377,
      shoulder: 25.5432,
      elbow: -89.9991,
      forearmRoll: -0.8964,
      wristPitch: -0.0023,
      flangeRoll: 0,
    };
    const direction = [0.35, 0.25, 0.9].map((value) => value / Math.hypot(0.35, 0.25, 0.9));
    const reach = (share: number): SpatialVector => [
      direction[0]! * share * 680,
      direction[1]! * share * 680,
      100 + direction[2]! * share * 680,
    ];

    it.each([0.995, 0.99])('should bend back from a straight seed to a target at %s of full reach', (share) => {
      const target = reach(share);
      const outcome = solved({
        mechanism: sixAxisArm(),
        seed: straight,
        goals: [{ type: 'point', link: 'flange', localPoint: [380, 0, 400], target }],
      });

      expect(outcome.status).toBe('solved');
      expect(maxDifference(worldPoint(outcome, 'flange', [380, 0, 400]), target)).toBeLessThan(1e-6);
    });

    it('should report a far target as unreachable after the same iterations in millimetres and metres', () => {
      const goal = (scale: number): PoseGoal => ({
        type: 'point',
        link: 'flange',
        localPoint: [380 * scale, 0, 400 * scale],
        target: [3000 * scale, 1000 * scale, 500 * scale],
      });
      const millimetres = solved({ mechanism: sixAxisArm(), seed: {}, goals: [goal(1)] });
      const metres = solved({
        mechanism: transformed({ mechanism: sixAxisArm(), units: { length: 'm', angle: 'deg' } }),
        seed: {},
        goals: [goal(0.001)],
      });

      expect(millimetres).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      expect(millimetres.iterations).toBeLessThan(64);
      expect(metres).toEqual(
        expect.objectContaining({ status: 'blocked', reason: 'unreachable', iterations: millimetres.iterations }),
      );
    });

    it('should honour a custom tolerance in mechanism length units', () => {
      const target = transformPoint(flangeTarget({ baseYaw: 5, shoulder: 5, elbow: -5, wristPitch: 5 }), [380, 0, 400]);
      const loose = solved({
        mechanism: sixAxisArm(),
        seed: {},
        tolerance: 0.5,
        goals: [{ type: 'point', link: 'flange', localPoint: [380, 0, 400], target }],
      });
      const strict = solved({
        mechanism: sixAxisArm(),
        seed: {},
        goals: [{ type: 'point', link: 'flange', localPoint: [380, 0, 400], target }],
      });

      expect(loose.status).toBe('solved');
      expect(loose.residual).toBeLessThanOrEqual(0.5);
      expect(loose.iterations).toBeLessThan(strict.iterations);
    });
  });

  describe('couplings', () => {
    it('should drag a planet by solving for the sun through the chain rule', () => {
      const target = transformPoint(rotationAboutZ(10), [24, 0, 0]);
      const outcome = solved({
        mechanism: planetaryGearSystem(),
        seed: {},
        goals: [{ type: 'point', link: 'planet1', localPoint: [24, 0, 0], target }],
      });

      expect(outcome.status).toBe('solved');
      expect(outcome.pose.coordinates['sunSpin']).toBeCloseTo(40, 6);
      expect(outcome.pose.coordinates['carrierSpin']).toBeCloseTo(10, 6);
    });

    it('should keep a follower within its limits by bounding its driver', () => {
      const mechanism = withLimits(wormGearSystem(), 'wheelSpin', { lower: 0, upper: 6 });
      const outcome = solved({
        mechanism,
        seed: {},
        goals: [
          {
            type: 'point',
            link: 'wheel',
            localPoint: [30, 0, 0],
            target: transformPoint(rotationAboutZ(12), [30, 0, 0]),
          },
        ],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'limit' }));
      expect(outcome.pose.coordinates['wormSpin']).toBeCloseTo(180, 9);
      expect(outcome.pose.coordinates['wheelSpin']).toBeCloseTo(6, 9);
    });
  });

  describe('curve couplings', () => {
    it('should turn the crank to drag a piston through its slider-crank curve', () => {
      const target: SpatialVector = [0, 0, 180 + pistonTravel(60)];
      const outcome = solved({
        mechanism: sliderCrank(),
        seed: { crank: 50 },
        goals: [{ type: 'point', link: 'piston', localPoint: [0, 0, 180], target }],
      });

      expect(outcome.status).toBe('solved');
      expect(outcome.pose.coordinates['crank']).toBeCloseTo(60, 6);
    });

    it('should stop at the bottom of the stroke for a target below it', () => {
      const outcome = solved({
        mechanism: sliderCrank(),
        seed: { crank: 150 },
        goals: [{ type: 'point', link: 'piston', localPoint: [0, 0, 180], target: [0, 0, 50] }],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      // The curve is piecewise linear, so the stall lands within the stall share of the stroke end.
      expect(outcome.pose.coordinates['piston']).toBeCloseTo(-80, 3);
    });

    it('should stop on a curve peak where every step off it lowers the piston', () => {
      const outcome = solved({
        mechanism: sliderCrank(),
        seed: {},
        goals: [{ type: 'point', link: 'piston', localPoint: [0, 0, 180], target: [0, 0, 300] }],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable' }));
      expect([outcome.pose.coordinates['crank'], outcome.pose.coordinates['piston']]).toEqual([0, 0]);
      expect(outcome.pose.coordinates['rod']).toBeCloseTo(0, 12);
    });

    it('should report the budget when a coarse curve keeps the solve moving between segments', () => {
      const outcome = solved({
        mechanism: sliderCrank(8),
        seed: { crank: 5.507567359836571 },
        goals: [
          {
            type: 'point',
            link: 'piston',
            localPoint: [0, 0, 180],
            target: [-6.109679644512797, 64.6142146734587, -28.893983179653983],
          },
        ],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'budget', iterations: 64 }));
    });
  });

  describe('every joint type', () => {
    const single = (joint: Joint): Mechanism => ({
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links: { base: { components: [] }, moving: { components: [] } },
      joints: { joint },
    });
    const connection = { parent: 'base', child: 'moving', origin: [1, 2, 3] } as const;

    it.each<[string, Joint, Readonly<Record<string, number>>]>([
      ['prismatic', { ...connection, type: 'prismatic', axis: [1, 1, 0] }, { joint: 7 }],
      [
        'cylindrical',
        { ...connection, type: 'cylindrical', axis: [0, 0, 1] },
        { 'joint/angle': 50, 'joint/distance': -4 },
      ],
      // Within half a turn of the seed: beyond it the orientation error wraps while the lead does not.
      ['screw', { ...connection, type: 'screw', axis: [0, 1, 0], lead: 5, handedness: 'left' }, { joint: 150 }],
      [
        'planar',
        { ...connection, type: 'planar', normal: [0, 0, 1], xAxis: [1, 0, 0] },
        { 'joint/x': 3, 'joint/y': -2, 'joint/angle': 70 },
      ],
      ['spherical', { ...connection, type: 'spherical' }, { 'joint/x': 40, 'joint/y': -60, 'joint/z': 100 }],
    ])('should reach a %s point goal generated by forward kinematics', (_name, joint, coordinates) => {
      const mechanism = single(joint);
      const expected = evaluatePose({ mechanism, coordinates });
      if (expected.status !== 'posed') {
        throw new Error('Expected a pose');
      }
      const localPoint: SpatialVector = [6, -4, 9];
      const target = transformPoint(expected.pose.linkTransforms['moving']!, localPoint);
      const outcome = solved({ mechanism, seed: {}, goals: [{ type: 'point', link: 'moving', localPoint, target }] });

      expect(outcome.status).toBe('solved');
      expect(maxDifference(worldPoint(outcome, 'moving', localPoint), target)).toBeLessThanOrEqual(1e-6);
    });

    it('should report a target perpendicular to a slide as unreachable after trying to escape', () => {
      const mechanism = single({ ...connection, type: 'prismatic', axis: [1, 0, 0] });
      const outcome = solved({
        mechanism,
        seed: {},
        goals: [{ type: 'point', link: 'moving', localPoint: [1, 2, 3], target: [1, 7, 3] }],
      });

      expect(outcome).toEqual(expect.objectContaining({ status: 'blocked', reason: 'unreachable', iterations: 0 }));
      expect(outcome.pose.coordinates).toEqual({ joint: 0 });
    });
  });

  describe('analytic Jacobian', () => {
    const links = Object.fromEntries(
      ['base', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'].map((id) => [id, { components: [] }]),
    );
    // A serial chain with every joint type, off-axis and tilted, in millimetres and degrees.
    const chain = (couplings?: readonly Coupling[]): Mechanism => ({
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links,
      joints: {
        pl: { type: 'planar', parent: 'base', child: 'l1', origin: [3, -2, 1], normal: [1, 1, 1], xAxis: [1, -1, 0] },
        rv: { type: 'revolute', parent: 'l1', child: 'l2', origin: [10, 2, 5], axis: [0.2, 1, 0.3] },
        pr: { type: 'prismatic', parent: 'l2', child: 'l3', origin: [12, 4, 5], axis: [1, 0.5, -0.2] },
        cy: { type: 'cylindrical', parent: 'l3', child: 'l4', origin: [15, 4, 9], axis: [0, 0.3, 1] },
        sc: {
          type: 'screw',
          parent: 'l4',
          child: 'l5',
          origin: [18, 7, 9],
          axis: [1, 0.1, 0.4],
          lead: 3,
          handedness: 'left',
        },
        sp: { type: 'spherical', parent: 'l5', child: 'l6', origin: [22, 7, 12] },
        fx: { type: 'fixed', parent: 'l6', child: 'l7', origin: [25, 9, 12] },
      },
      ...(couplings === undefined ? {} : { couplings }),
    });
    // Couplings: sc follows rv (angle to angle) and pr follows sc (angle to length), a follower of a follower.
    const coupled = chain([
      { driver: 'sc', follower: 'pr', ratio: 0.25, offset: 1 },
      { driver: 'rv', follower: 'sc', ratio: -1.7, offset: 3 },
      { driver: 'rv', follower: 'sp/z', ratio: 0.5 },
      { driver: 'pl/x', follower: 'cy/angle', ratio: 4, offset: -2 },
    ]);
    // Seeds list every driver in degree-of-freedom order, which is the Jacobian's column order.
    const seed = {
      'pl/x': 1.5,
      'pl/y': -2,
      'pl/angle': 25,
      rv: 40,
      pr: 3,
      'cy/angle': -35,
      'cy/distance': 2,
      sc: 70,
      'sp/x': 30,
      'sp/y': -50,
      'sp/z': 80,
    };
    const drivers = { 'pl/x': 1.5, 'pl/y': -2, 'pl/angle': 25, rv: 40, 'cy/distance': 2, 'sp/x': 30, 'sp/y': -50 };
    const inMetres = (mechanism: Mechanism): Mechanism =>
      transformed({ mechanism, units: { length: 'm', angle: 'rad' } });
    const toMetres = (
      mechanism: Mechanism,
      values: Readonly<Record<string, number>>,
    ): Readonly<Record<string, number>> => {
      const kinds = new Map(listDegreesOfFreedom(mechanism).map((dof) => [dof.id, dof.kind]));
      return Object.fromEntries(
        Object.entries(values).map(([id, value]) => [id, value * (kinds.get(id) === 'angle' ? Math.PI / 180 : 0.001)]),
      );
    };
    const goals = (units: MechanismUnits): readonly PoseGoal[] => {
      const scale = units.length === 'm' ? 0.001 : 1;
      return [
        { type: 'point', link: 'l7', localPoint: [30 * scale, 12 * scale, 14 * scale], target: [0, 0, 0] },
        {
          type: 'point',
          link: 'l6',
          localPoint: [24 * scale, 5 * scale, 13 * scale],
          target: [5 * scale, 5 * scale, 5 * scale],
        },
      ];
    };

    /** Central differences of the goal points. */
    const centralDifferences = (input: SolvePoseInput, columns: readonly string[]): number[][] => {
      const { mechanism, seed: at } = input;
      const transformsAt = (coordinates: Readonly<Record<string, number>>): Readonly<Record<string, SpatialMatrix>> => {
        const outcome = evaluatePose({ mechanism, coordinates });
        if (outcome.status !== 'posed') {
          throw new Error('Expected a pose');
        }
        return outcome.pose.linkTransforms;
      };
      return columns.map((id) => {
        const step = 1e-6 * Math.max(1, Math.abs(at[id]!));
        const plus = transformsAt({ ...at, [id]: at[id]! + step });
        const minus = transformsAt({ ...at, [id]: at[id]! - step });
        return input.goals.flatMap((goal) => {
          const ahead = transformPoint(plus[goal.link]!, goal.localPoint);
          const behind = transformPoint(minus[goal.link]!, goal.localPoint);
          return [0, 1, 2].map((axis) => (ahead[axis]! - behind[axis]!) / (2 * step));
        });
      });
    };

    // A curve follower that drives a linear follower in turn: rv → sc (curve) → pr (linear).
    const curved = chain([
      { driver: 'rv', follower: 'sc', curve: { driverPeriod: 360, values: [0, 30, 45, 10, -20, -35, -5] } },
      { driver: 'sc', follower: 'pr', ratio: 0.25, offset: 1 },
    ]);
    it.each<[string, Mechanism, Readonly<Record<string, number>>]>([
      [
        'a curve coupling chained into a linear one',
        curved,
        {
          'pl/x': 1.5,
          'pl/y': -2,
          'pl/angle': 25,
          rv: 40,
          'cy/angle': -35,
          'cy/distance': 2,
          'sp/x': 30,
          'sp/y': -50,
          'sp/z': 80,
        },
      ],
      ['every joint type in millimetres and degrees', chain(), seed],
      ['every joint type in metres and radians', inMetres(chain()), toMetres(chain(), seed)],
      ['a spherical rotation vector of 2.6 rad', chain(), { ...seed, 'sp/x': 100, 'sp/y': -90, 'sp/z': 70 }],
      ['chained and cross-kind couplings in millimetres and degrees', coupled, drivers],
      ['chained and cross-kind couplings in metres and radians', inMetres(coupled), toMetres(coupled, drivers)],
    ])('should match central differences of the pose for %s', (_name, mechanism, coordinates) => {
      const input: SolvePoseInput = { mechanism, seed: coordinates, goals: goals(mechanism.units) };
      const plan = planOf(mechanism);
      const problem = createProblem(plan, input);
      const state = createState(plan, problem.rows);
      state.drivers.set(clampedDrivers(plan, coordinates));
      problem.evaluate(state);
      problem.writeJacobian(state);
      const columns = Array.from(problem.variableIndex, (index) => plan.degreesOfFreedom[index]!.id);
      const expected = centralDifferences(input, columns);
      const errors = expected.flatMap((column, variable) =>
        column.map(
          (value, row) =>
            Math.abs(problem.jacobian[row * columns.length + variable]! - value) / Math.max(1, Math.abs(value)),
        ),
      );

      expect(columns).toEqual(Object.keys(coordinates));
      expect(Math.max(...errors)).toBeLessThan(1e-6);
    });
  });

  describe('issues', () => {
    it('should report every invalid input with a JSON pointer', () => {
      const outcome = solvePose({
        mechanism: planetaryGearSystem(),
        seed: { ghost: 1, carrierSpin: 2, sunSpin: Number.NaN },
        tolerance: 0,
        goals: [
          { type: 'point', link: 'moon', localPoint: [0, Number.NaN, 0], target: [0, 0, 0] },
          { type: 'point', link: 'sun', localPoint: [0, 0, 0], target: [0, 0, Number.POSITIVE_INFINITY] },
        ],
      });

      expect(outcome.status === 'invalid' && outcome.issues.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: 'UNKNOWN_DEGREE_OF_FREEDOM', path: '/seed/ghost' },
        { code: 'DRIVEN_FOLLOWER', path: '/seed/carrierSpin' },
        { code: 'INVALID_VALUE', path: '/seed/sunSpin' },
        { code: 'INVALID_VALUE', path: '/tolerance' },
        { code: 'UNKNOWN_LINK', path: '/goals/0/link' },
        { code: 'INVALID_VALUE', path: '/goals/0/localPoint' },
        { code: 'INVALID_VALUE', path: '/goals/1/target' },
      ]);
    });

    it('should report a seed from a superseded mechanism', () => {
      const outcome = solvePose({ mechanism: twoLinkArm(), seed: { sunSpin: 10 }, goals: [tip([1, 1, 0])] });

      expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
        expect.objectContaining({ code: 'UNKNOWN_DEGREE_OF_FREEDOM', path: '/seed/sunSpin' }),
      );
    });

    it('should return admission issues for an inadmissible mechanism', () => {
      const outcome = solvePose({ mechanism: { ...twoLinkArm(), root: 'ground' }, seed: {}, goals: [] });

      expect(outcome.status === 'invalid' && outcome.issues[0]).toEqual(
        expect.objectContaining({ code: 'UNKNOWN_LINK', path: '/root' }),
      );
    });

    it('should solve immediately without goals', () => {
      expect(solved({ mechanism: twoLinkArm(), seed: { elbow: 0.2 }, goals: [] })).toEqual(
        expect.objectContaining({ status: 'solved', iterations: 0, residual: 0 }),
      );
    });
  });
});
