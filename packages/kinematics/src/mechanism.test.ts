import { describe, expect, it } from 'vitest';
import { admitMechanism, findLinkByComponent, listDegreesOfFreedom } from '@taucad/kinematics';
import type { IssueCode, Mechanism } from '@taucad/kinematics';
import { unitScale } from '#mechanism.js';
import {
  everyJoint,
  planetaryGearSystem,
  sixAxisArm,
  sliderCrank,
  twoLinkArm,
  wormGearSystem,
} from '#testing/mechanisms.js';

type Draft = Record<string | number, unknown>;

/** Clone the every-joint fixture and set (or delete, for `undefined`) the value at a path. */
const withValue = (path: ReadonlyArray<string | number>, value: unknown): unknown => {
  const clone: Draft = structuredClone(everyJoint());
  let target = clone;
  for (const key of path.slice(0, -1)) {
    target = target[key] as Draft;
  }
  const last = path.at(-1)!;
  if (value === undefined) {
    Reflect.deleteProperty(target, last);
  } else {
    target[last] = value;
  }
  return clone;
};

/** Clone the every-joint fixture and apply a mutation. */
const edited = (edit: (draft: Draft) => void): unknown => {
  const clone: Draft = structuredClone(everyJoint());
  edit(clone);
  return clone;
};

/** Codes and paths of the issues; every issue must also carry a message and a recovery sentence. */
const issuesOf = (input: unknown): ReadonlyArray<{ code: IssueCode; path: string }> => {
  const outcome = admitMechanism(input);
  const issues = outcome.status === 'invalid' ? outcome.issues : [];
  for (const { message, recovery } of issues) {
    expect([message.length > 0, recovery.length > 0]).toEqual([true, true]);
  }
  return issues.map(({ code, path }) => ({ code, path }));
};

describe('admitMechanism', () => {
  describe('valid mechanisms', () => {
    it.each([
      ['every joint type', everyJoint()],
      ['planetary gear system', planetaryGearSystem()],
      ['worm gear system', wormGearSystem()],
      ['two-link arm', twoLinkArm()],
      ['six-axis arm', sixAxisArm()],
    ])('should admit the %s and return the same object', (_name, mechanism) => {
      const outcome = admitMechanism(mechanism);

      expect(outcome).toEqual({ status: 'admitted', mechanism });
      expect(outcome.status === 'admitted' && outcome.mechanism).toBe(mechanism);
    });

    it('should admit parsed JSON of a valid mechanism', () => {
      const text = JSON.stringify(everyJoint());
      const parsed: unknown = JSON.parse(text);

      expect(admitMechanism(parsed).status).toBe('admitted');
    });

    it('should carry a recovery sentence on every issue', () => {
      const outcome = admitMechanism(withValue(['joints', 'arm', 'axis'], [0, 0, 0]));

      const issues = outcome.status === 'invalid' ? outcome.issues : [];

      expect(issues.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
        {
          code: 'INVALID_AXIS',
          path: '/joints/arm/axis',
          message: 'axis must be three finite numbers with a non-zero length; it is never defaulted.',
        },
      ]);
      expect(issues[0]!.recovery).toContain('non-zero length');
    });
  });

  describe('structural issues', () => {
    it.for<[string, unknown, IssueCode, string]>([
      ['a non-object input', null, 'INVALID_SHAPE', ''],
      ['an unknown top-level property', withValue(['extra'], 1), 'INVALID_SHAPE', '/extra'],
      ['an unsupported schema version', withValue(['schemaVersion'], 2), 'UNSUPPORTED_SCHEMA', '/schemaVersion'],
      ['missing units', withValue(['units'], undefined), 'INVALID_UNIT', '/units'],
      ['an unsupported length unit', withValue(['units', 'length'], 'cm'), 'INVALID_UNIT', '/units/length'],
      ['an unsupported angle unit', withValue(['units', 'angle'], 'grad'), 'INVALID_UNIT', '/units/angle'],
      ['an unknown unit property', withValue(['units', 'time'], 's'), 'INVALID_SHAPE', '/units/time'],
      ['a non-string root', withValue(['root'], 3), 'INVALID_SHAPE', '/root'],
      ['non-object links', withValue(['links'], []), 'INVALID_SHAPE', '/links'],
      ['a link without components', withValue(['links', 'weld'], { parts: [] }), 'INVALID_SHAPE', '/links/weld'],
      ['an unknown link property', withValue(['links', 'weld', 'color'], 'red'), 'INVALID_SHAPE', '/links/weld/color'],
      [
        'a non-string component',
        withValue(['links', 'weld', 'components'], [7]),
        'INVALID_SHAPE',
        '/links/weld/components/0',
      ],
      [
        'a component in two links',
        withValue(['links', 'arm', 'components'], ['Base']),
        'DUPLICATE_COMPONENT',
        '/links/arm/components/0',
      ],
      ['non-object joints', withValue(['joints'], 1), 'INVALID_SHAPE', '/joints'],
      ['a non-object joint', withValue(['joints', 'arm'], 'hinge'), 'INVALID_SHAPE', '/joints/arm'],
      [
        'an unsupported joint type',
        withValue(['joints', 'arm', 'type'], 'gear'),
        'UNSUPPORTED_JOINT',
        '/joints/arm/type',
      ],
      ['a misspelt joint property', withValue(['joints', 'arm', 'limit'], {}), 'INVALID_SHAPE', '/joints/arm/limit'],
      [
        'a fixed joint with limits',
        withValue(['joints', 'weld', 'limits'], { lower: 0, upper: 1 }),
        'INVALID_SHAPE',
        '/joints/weld/limits',
      ],
      ['a non-string parent', withValue(['joints', 'arm', 'parent'], 1), 'INVALID_SHAPE', '/joints/arm/parent'],
      [
        'a non-finite origin',
        withValue(['joints', 'arm', 'origin'], [0, Number.NaN, 0]),
        'INVALID_ORIGIN',
        '/joints/arm/origin',
      ],
      ['a zero axis', withValue(['joints', 'slide', 'axis'], [0, 0, 0]), 'INVALID_AXIS', '/joints/slide/axis'],
      ['a missing axis', withValue(['joints', 'arm', 'axis'], undefined), 'INVALID_AXIS', '/joints/arm/axis'],
      [
        'a zero planar normal',
        withValue(['joints', 'puck', 'normal'], [0, 0, 0]),
        'INVALID_AXIS',
        '/joints/puck/normal',
      ],
      [
        'a planar xAxis off the plane',
        withValue(['joints', 'puck', 'xAxis'], [1, 0, 1]),
        'INVALID_AXIS',
        '/joints/puck/xAxis',
      ],
      ['a zero screw lead', withValue(['joints', 'nut', 'lead'], 0), 'INVALID_LEAD', '/joints/nut/lead'],
      [
        'an unknown handedness',
        withValue(['joints', 'nut', 'handedness'], 'up'),
        'INVALID_SHAPE',
        '/joints/nut/handedness',
      ],
      ['non-object limits', withValue(['joints', 'arm', 'limits'], [0, 1]), 'INVALID_LIMITS', '/joints/arm/limits'],
      [
        'asymmetric spherical limits',
        withValue(['joints', 'ball', 'limits'], { lower: -10, upper: 80 }),
        'INVALID_LIMITS',
        '/joints/ball/limits',
      ],
      [
        'inverted limits',
        withValue(['joints', 'arm', 'limits'], { lower: 1, upper: -1 }),
        'INVALID_LIMITS',
        '/joints/arm/limits',
      ],
      [
        'a missing upper limit',
        withValue(['joints', 'arm', 'limits'], { lower: 1 }),
        'INVALID_LIMITS',
        '/joints/arm/limits',
      ],
      [
        'an unknown limit property',
        withValue(['joints', 'arm', 'limits', 'soft'], 1),
        'INVALID_SHAPE',
        '/joints/arm/limits/soft',
      ],
      [
        'non-object nested limits',
        withValue(['joints', 'sleeve', 'limits'], 5),
        'INVALID_LIMITS',
        '/joints/sleeve/limits',
      ],
      [
        'an unknown nested limit',
        withValue(['joints', 'sleeve', 'limits', 'speed'], {}),
        'INVALID_SHAPE',
        '/joints/sleeve/limits/speed',
      ],
      [
        'inverted nested limits',
        withValue(['joints', 'sleeve', 'limits', 'distance'], { lower: 5, upper: 0 }),
        'INVALID_LIMITS',
        '/joints/sleeve/limits/distance',
      ],
      ['non-array couplings', withValue(['couplings'], {}), 'INVALID_SHAPE', '/couplings'],
      [
        'a coupling without a driver',
        withValue(['couplings', 0, 'driver'], undefined),
        'INVALID_SHAPE',
        '/couplings/0',
      ],
      ['an unknown coupling property', withValue(['couplings', 0, 'teeth'], 24), 'INVALID_SHAPE', '/couplings/0/teeth'],
      ['a zero coupling ratio', withValue(['couplings', 0, 'ratio'], 0), 'INVALID_VALUE', '/couplings/0/ratio'],
      [
        'a non-finite coupling offset',
        withValue(['couplings', 0, 'offset'], '1'),
        'INVALID_VALUE',
        '/couplings/0/offset',
      ],
      ['non-array animations', withValue(['animations'], 'sweep'), 'INVALID_SHAPE', '/animations'],
      ['an animation without an id', withValue(['animations', 0, 'id'], undefined), 'INVALID_SHAPE', '/animations/0'],
      ['a reserved animation id', withValue(['animations', 0, 'id'], '__proto__'), 'INVALID_SHAPE', '/animations/0/id'],
      [
        'an unknown animation property',
        withValue(['animations', 0, 'speed'], 2),
        'INVALID_SHAPE',
        '/animations/0/speed',
      ],
      ['a non-string animation name', withValue(['animations', 0, 'name'], 3), 'INVALID_SHAPE', '/animations/0/name'],
      [
        'a duplicate animation id',
        withValue(['animations', 1], { id: 'sweep', duration: 1, keyframes: [{ time: 0, coordinates: {} }] }),
        'DUPLICATE_ID',
        '/animations/1/id',
      ],
      [
        'an unknown loop mode',
        withValue(['animations', 0, 'loop'], 'bounce'),
        'INVALID_ANIMATION',
        '/animations/0/loop',
      ],
      ['a zero duration', withValue(['animations', 0, 'duration'], 0), 'INVALID_ANIMATION', '/animations/0/duration'],
      ['no keyframes', withValue(['animations', 0, 'keyframes'], []), 'INVALID_ANIMATION', '/animations/0/keyframes'],
      [
        'a keyframe without coordinates',
        withValue(['animations', 0, 'keyframes', 0], { time: 0 }),
        'INVALID_SHAPE',
        '/animations/0/keyframes/0',
      ],
      [
        'an unknown keyframe property',
        withValue(['animations', 0, 'keyframes', 0, 'ease'], 'in'),
        'INVALID_SHAPE',
        '/animations/0/keyframes/0/ease',
      ],
      [
        'unsorted keyframes',
        withValue(['animations', 0, 'keyframes', 1, 'time'], -1),
        'INVALID_ANIMATION',
        '/animations/0/keyframes/1/time',
      ],
      [
        'a keyframe after the duration',
        withValue(['animations', 0, 'keyframes', 1, 'time'], 3),
        'INVALID_ANIMATION',
        '/animations/0/keyframes/1/time',
      ],
      [
        'a non-finite keyframe coordinate',
        withValue(['animations', 0, 'keyframes', 0, 'coordinates', 'arm'], Number.POSITIVE_INFINITY),
        'INVALID_VALUE',
        '/animations/0/keyframes/0/coordinates/arm',
      ],
    ])('should report %s', ([, input, code, path]) => {
      expect(issuesOf(input)).toContainEqual({ code, path });
    });

    it('should report "__proto__" link and joint ids, which records keyed by id would drop', () => {
      const input: unknown = JSON.parse(
        '{"schemaVersion":1,"units":{"length":"mm","angle":"deg"},"root":"base","links":{"base":{"components":[]},"__proto__":{"components":["Lid"]}},' +
          '"joints":{"__proto__":{"type":"revolute","parent":"base","child":"__proto__","origin":[0,0,0],"axis":[0,0,1]}}}',
      );

      expect(issuesOf(input)).toEqual([
        { code: 'INVALID_SHAPE', path: '/links/__proto__' },
        { code: 'INVALID_SHAPE', path: '/joints/__proto__' },
      ]);
    });

    const cyclic: Draft = {};
    cyclic['self'] = cyclic;

    it.for<[string, unknown, IssueCode, string]>([
      ['a BigInt screw lead', withValue(['joints', 'nut', 'lead'], 2n), 'INVALID_LEAD', '/joints/nut/lead'],
      [
        'a BigInt limit',
        withValue(['joints', 'arm', 'limits'], { lower: 0n, upper: 90 }),
        'INVALID_LIMITS',
        '/joints/arm/limits',
      ],
      ['a BigInt schema version', withValue(['schemaVersion'], 1n), 'UNSUPPORTED_SCHEMA', '/schemaVersion'],
      ['a cyclic joint type', withValue(['joints', 'arm', 'type'], cyclic), 'UNSUPPORTED_JOINT', '/joints/arm/type'],
      ['a cyclic length unit', withValue(['units', 'length'], cyclic), 'INVALID_UNIT', '/units/length'],
      ['a cyclic coupling ratio', withValue(['couplings', 0, 'ratio'], cyclic), 'INVALID_VALUE', '/couplings/0/ratio'],
    ])('should report %s that JSON cannot represent instead of throwing', ([, input, code, path]) => {
      const outcome = admitMechanism(input);
      const issue =
        outcome.status === 'invalid' ? outcome.issues.find((candidate) => candidate.path === path) : undefined;

      expect(issue?.code).toBe(code);
      expect(issue?.message).toContain('that JSON cannot represent>');
    });

    it('should report every structural issue at once', () => {
      const input = edited((draft) => {
        draft['schemaVersion'] = 0;
        draft['root'] = 1;
      });

      expect(issuesOf(input)).toEqual([
        { code: 'UNSUPPORTED_SCHEMA', path: '/schemaVersion' },
        { code: 'INVALID_SHAPE', path: '/root' },
      ]);
    });
  });

  describe('semantic issues', () => {
    it.for<[string, unknown, IssueCode, string]>([
      [
        'a degree-of-freedom id produced twice',
        withValue(['joints', 'ball/x'], {
          type: 'revolute',
          parent: 'ball',
          child: 'weld',
          origin: [0, 0, 0],
          axis: [1, 0, 0],
        }),
        'DUPLICATE_ID',
        '/joints/ball~1x',
      ],
      ['an unknown root', withValue(['root'], 'ground'), 'UNKNOWN_LINK', '/root'],
      ['an unknown parent link', withValue(['joints', 'arm', 'parent'], 'table'), 'UNKNOWN_LINK', '/joints/arm/parent'],
      [
        'a joint whose child is the root',
        withValue(['joints', 'arm', 'child'], 'base'),
        'CYCLIC_GRAPH',
        '/joints/arm/child',
      ],
      [
        'a joint whose child is its parent',
        withValue(['joints', 'weld', 'parent'], 'weld'),
        'CYCLIC_GRAPH',
        '/joints/weld/child',
      ],
      [
        'a link with two parent joints',
        withValue(['joints', 'slide', 'child'], 'arm'),
        'CYCLIC_GRAPH',
        '/joints/slide/child',
      ],
      ['a link with no joint', withValue(['links', 'spare'], { components: [] }), 'DISCONNECTED_LINK', '/links/spare'],
      [
        'an unknown coupling driver',
        withValue(['couplings', 0, 'driver'], 'motor'),
        'UNKNOWN_DEGREE_OF_FREEDOM',
        '/couplings/0/driver',
      ],
      [
        'a follower driven by two couplings',
        withValue(['couplings', 1], { driver: 'slide', follower: 'sleeve/angle', ratio: 1 }),
        'DRIVEN_FOLLOWER',
        '/couplings/1/follower',
      ],
      ['a self-driving coupling', withValue(['couplings', 0, 'follower'], 'arm'), 'CYCLIC_COUPLING', '/couplings/0'],
      [
        'an animated unknown degree of freedom',
        withValue(['animations', 0, 'keyframes', 0, 'coordinates', 'ghost'], 1),
        'UNKNOWN_DEGREE_OF_FREEDOM',
        '/animations/0/keyframes/0/coordinates/ghost',
      ],
      [
        'an animated follower',
        withValue(['animations', 0, 'keyframes', 0, 'coordinates', 'sleeve/angle'], 1),
        'DRIVEN_FOLLOWER',
        '/animations/0/keyframes/0/coordinates/sleeve~1angle',
      ],
    ])('should report %s', ([, input, code, path]) => {
      expect(issuesOf(input)).toContainEqual({ code, path });
    });

    it.for<[string, unknown, string]>([
      ['a driver', withValue(['joints', 'slide', 'limits'], { lower: 5, upper: 40 }), '/joints/slide/limits'],
      [
        'a follower',
        withValue(['joints', 'sleeve', 'limits', 'angle'], { lower: 2, upper: 360 }),
        '/joints/sleeve/limits/angle',
      ],
    ])('should report limits of %s that exclude its as-built value', ([, input, path]) => {
      expect(issuesOf(input)).toEqual([{ code: 'INVALID_LIMITS', path }]);
    });

    it('should reject follower limits that the driver limits cannot meet, naming the as-built value', () => {
      const outcome = admitMechanism({
        schemaVersion: 1,
        units: { length: 'mm', angle: 'deg' },
        root: 'base',
        links: { base: { components: [] }, a: { components: [] }, b: { components: [] } },
        joints: {
          drive: {
            type: 'revolute',
            parent: 'base',
            child: 'a',
            origin: [0, 0, 0],
            axis: [0, 0, 1],
            limits: { lower: 0, upper: 10 },
          },
          follow: {
            type: 'revolute',
            parent: 'base',
            child: 'b',
            origin: [10, 0, 0],
            axis: [0, 0, 1],
            limits: { lower: 0, upper: 50 },
          },
        },
        couplings: [{ driver: 'drive', follower: 'follow', ratio: 1, offset: 100 }],
      });
      const issues = outcome.status === 'invalid' ? outcome.issues : [];

      expect(issues.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
        {
          code: 'INVALID_LIMITS',
          path: '/joints/follow/limits',
          message: '"follow" is 100 at the as-built pose, outside its limits [0, 50].',
        },
      ]);
      expect(issues[0]!.recovery).toContain('deltas from the as-built pose');
    });

    it('should report malformed curve couplings at their JSON pointers', () => {
      const base = sliderCrank();
      const outcome = admitMechanism({
        ...base,
        couplings: [
          { driver: 'crank', follower: 'piston', curve: { driverPeriod: 0, values: [0] } },
          { driver: 'crank', follower: 'rod', curve: 'slider' },
          { driver: 'crank', follower: 'rod', curve: { driverPeriod: 360, values: [0, Number.NaN] }, ratio: 1 },
        ],
      });

      expect(outcome.status === 'invalid' && outcome.issues.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: 'INVALID_VALUE', path: '/couplings/0/curve/driverPeriod' },
        { code: 'INVALID_VALUE', path: '/couplings/0/curve/values' },
        { code: 'INVALID_SHAPE', path: '/couplings/1/curve' },
        { code: 'INVALID_SHAPE', path: '/couplings/2/ratio' },
        { code: 'INVALID_VALUE', path: '/couplings/2/curve/values' },
      ]);
    });

    it('should list a curve follower with its coupling', () => {
      const [, piston] = listDegreesOfFreedom(sliderCrank(4));

      expect(piston).toEqual(expect.objectContaining({ id: 'piston', role: 'follower' }));
      expect(piston?.coupling?.driver).toBe('crank');
    });

    it('should report a joint cycle apart from links disconnected from the root', () => {
      const input = edited((draft) => {
        const links = draft['links'] as Draft;
        const joints = draft['joints'] as Draft;
        links['loopA'] = { components: [] };
        links['loopB'] = { components: [] };
        links['hanger'] = { components: [] };
        links['orphan'] = { components: [] };
        links['orphanChild'] = { components: [] };
        joints['ab'] = { type: 'fixed', parent: 'loopA', child: 'loopB', origin: [0, 0, 0] };
        joints['ba'] = { type: 'fixed', parent: 'loopB', child: 'loopA', origin: [0, 0, 0] };
        joints['hang'] = { type: 'fixed', parent: 'loopB', child: 'hanger', origin: [0, 0, 0] };
        joints['orphanJoint'] = { type: 'fixed', parent: 'orphan', child: 'orphanChild', origin: [0, 0, 0] };
      });

      expect(issuesOf(input)).toEqual([
        { code: 'CYCLIC_GRAPH', path: '/links/loopA' },
        { code: 'CYCLIC_GRAPH', path: '/links/loopB' },
        { code: 'CYCLIC_GRAPH', path: '/links/hanger' },
        { code: 'DISCONNECTED_LINK', path: '/links/orphan' },
        { code: 'DISCONNECTED_LINK', path: '/links/orphanChild' },
      ]);
    });

    it('should report each coupling on a cycle but not a follower hanging off it', () => {
      const input = withValue(
        ['couplings'],
        [
          { driver: 'slide', follower: 'puck/x', ratio: 1 },
          { driver: 'puck/x', follower: 'slide', ratio: 1 },
          { driver: 'puck/x', follower: 'puck/y', ratio: 1 },
        ],
      );

      expect(issuesOf(input)).toEqual([
        { code: 'CYCLIC_COUPLING', path: '/couplings/0' },
        { code: 'CYCLIC_COUPLING', path: '/couplings/1' },
      ]);
    });
  });
});

describe('listDegreesOfFreedom', () => {
  it('should list degrees of freedom in joint order with suffixes, kinds, limits and roles', () => {
    const mechanism = everyJoint();

    expect(listDegreesOfFreedom(mechanism)).toEqual([
      {
        id: 'arm',
        jointId: 'arm',
        kind: 'angle',
        role: 'driver',
        limits: { lower: -90, upper: 90 },
        coupling: undefined,
      },
      {
        id: 'slide',
        jointId: 'slide',
        kind: 'distance',
        role: 'driver',
        limits: { lower: 0, upper: 50 },
        coupling: undefined,
      },
      {
        id: 'sleeve/angle',
        jointId: 'sleeve',
        kind: 'angle',
        role: 'follower',
        limits: { lower: -360, upper: 360 },
        coupling: { driver: 'arm', follower: 'sleeve/angle', ratio: 2, offset: 1 },
      },
      {
        id: 'sleeve/distance',
        jointId: 'sleeve',
        kind: 'distance',
        role: 'driver',
        limits: { lower: 0, upper: 10 },
        coupling: undefined,
      },
      {
        id: 'nut',
        jointId: 'nut',
        kind: 'angle',
        role: 'driver',
        limits: { lower: 0, upper: 3600 },
        coupling: undefined,
      },
      ...['x', 'y', 'z'].map((axis) => ({
        id: `ball/${axis}`,
        jointId: 'ball',
        kind: 'angle',
        role: 'driver',
        limits: { lower: -45, upper: 45 },
        coupling: undefined,
      })),
      {
        id: 'puck/x',
        jointId: 'puck',
        kind: 'distance',
        role: 'driver',
        limits: { lower: -5, upper: 5 },
        coupling: undefined,
      },
      { id: 'puck/y', jointId: 'puck', kind: 'distance', role: 'driver', limits: undefined, coupling: undefined },
      {
        id: 'puck/angle',
        jointId: 'puck',
        kind: 'angle',
        role: 'driver',
        limits: { lower: -30, upper: 30 },
        coupling: undefined,
      },
    ]);
  });

  it('should mark every planetary follower and leave the sun as the only driver', () => {
    const roles = listDegreesOfFreedom(planetaryGearSystem()).map(({ id, role }) => [id, role]);

    expect(roles).toEqual([
      ['sunSpin', 'driver'],
      ['carrierSpin', 'follower'],
      ['planet1Spin', 'follower'],
      ['planet2Spin', 'follower'],
      ['planet3Spin', 'follower'],
    ]);
  });

  it('should throw with the admission issues when the mechanism is not admissible', () => {
    const invalid = withValue(['root'], 'ground') as Mechanism;

    expect(() => listDegreesOfFreedom(invalid)).toThrow(/not admissible.*UNKNOWN_LINK \/root/);
  });
});

describe('findLinkByComponent', () => {
  it('should return the link that carries a component', () => {
    expect(findLinkByComponent({ mechanism: sixAxisArm(), componentId: 'Gripper' })).toBe('flange');
  });

  it('should return undefined for a component no link carries', () => {
    expect(findLinkByComponent({ mechanism: sixAxisArm(), componentId: 'Table' })).toBeUndefined();
  });
});

describe('unitScale', () => {
  it('should convert through @taucad/units and reuse the factor', () => {
    expect(unitScale('deg', 'rad')).toBe(Math.PI / 180);
    expect(unitScale('deg', 'rad')).toBe(Math.PI / 180);
    expect(unitScale('mm', 'm')).toBe(0.001);
  });

  it.each([
    ['an unknown unit', 'furlong', 'm'],
    ['incompatible dimensions', 'mm', 'rad'],
  ])('should throw for %s', (_name, from, to) => {
    expect(() => unitScale(from, to)).toThrow(`@taucad/kinematics: cannot convert ${from} to ${to}.`);
  });
});
