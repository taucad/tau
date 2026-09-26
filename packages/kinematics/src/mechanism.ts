import { convert, createQuantity } from '@taucad/units/quantity';
import type { SpatialVector } from '@taucad/spatial';
import type {
  AdmitMechanismOutcome,
  Coupling,
  DegreeOfFreedom,
  FindLinkByComponentInput,
  Issue,
  IssueCode,
  Joint,
  JointLimits,
  JointType,
  Mechanism,
} from '#types.js';

/** One degree of freedom of a joint type: id suffix, kind and the key of its limits. */
type DegreeOfFreedomSpec = Readonly<{ suffix: string; kind: 'angle' | 'distance'; limitKey: string | undefined }>;

type JointSpec = Readonly<{
  keys: readonly string[];
  limitKeys: readonly string[];
  dofs: readonly DegreeOfFreedomSpec[];
}>;

const single = (kind: 'angle' | 'distance'): readonly DegreeOfFreedomSpec[] => [
  { suffix: '', kind, limitKey: undefined },
];

/** Degrees of freedom and allowed keys per joint type, in the order `listDegreesOfFreedom` reports them. */
export const jointSpecs: Readonly<Record<JointType, JointSpec>> = {
  fixed: { keys: [], limitKeys: [], dofs: [] },
  revolute: { keys: ['axis', 'limits'], limitKeys: [], dofs: single('angle') },
  prismatic: { keys: ['axis', 'limits'], limitKeys: [], dofs: single('distance') },
  cylindrical: {
    keys: ['axis', 'limits'],
    limitKeys: ['angle', 'distance'],
    dofs: [
      { suffix: 'angle', kind: 'angle', limitKey: 'angle' },
      { suffix: 'distance', kind: 'distance', limitKey: 'distance' },
    ],
  },
  screw: { keys: ['axis', 'lead', 'handedness', 'limits'], limitKeys: [], dofs: single('angle') },
  spherical: {
    keys: ['limits'],
    limitKeys: [],
    dofs: ['x', 'y', 'z'].map((suffix) => ({ suffix, kind: 'angle', limitKey: undefined })),
  },
  planar: {
    keys: ['normal', 'xAxis', 'limits'],
    limitKeys: ['x', 'y', 'angle'],
    dofs: [
      { suffix: 'x', kind: 'distance', limitKey: 'x' },
      { suffix: 'y', kind: 'distance', limitKey: 'y' },
      { suffix: 'angle', kind: 'angle', limitKey: 'angle' },
    ],
  },
};

const isJointType = (value: unknown): value is JointType =>
  typeof value === 'string' && Object.hasOwn(jointSpecs, value);

/**
 * Degree-of-freedom id for a joint and a spec suffix.
 *
 * @param jointId - Joint id.
 * @param suffix - Spec suffix, empty for single-DOF joints.
 * @returns The degree-of-freedom id.
 */
export const dofId = (jointId: string, suffix: string): string => (suffix === '' ? jointId : `${jointId}/${suffix}`);

/**
 * Limits of one degree of freedom of a joint.
 *
 * @param joint - An admitted joint.
 * @param spec - The degree of freedom's spec.
 * @returns The limits, or `undefined` when the joint declares none.
 */
export const dofLimits = (joint: Joint, spec: DegreeOfFreedomSpec): JointLimits | undefined => {
  const limits: unknown = 'limits' in joint ? joint.limits : undefined;
  // Admission establishes that a joint's limits (or each nested entry) are JointLimits.
  return (spec.limitKey === undefined || !isRecord(limits) ? limits : limits[spec.limitKey]) as JointLimits | undefined;
};

// Issue codes are wire-visible constants, so the table is keyed by code rather than property names.
const recoveries = new Map<IssueCode, string>([
  ['INVALID_SHAPE', 'Match the mechanism schema: check the property name and value type at this path.'],
  ['UNSUPPORTED_SCHEMA', 'Set schemaVersion to 1.'],
  ['DUPLICATE_ID', 'Give every degree of freedom and every animation a unique id.'],
  ['DUPLICATE_COMPONENT', 'List each component in exactly one link.'],
  ['UNKNOWN_LINK', 'Reference a link declared under links.'],
  ['UNKNOWN_COMPONENT', 'Name a shape that the model returns.'],
  ['UNKNOWN_DEGREE_OF_FREEDOM', 'Use a degree-of-freedom id reported by listDegreesOfFreedom.'],
  [
    'UNSUPPORTED_JOINT',
    'Use fixed, revolute, prismatic, cylindrical, screw, spherical or planar; compose other joints from these and couplings.',
  ],
  [
    'INVALID_AXIS',
    'Give three finite numbers with a non-zero length, such as [0, 0, 1]; a planar xAxis must be perpendicular to normal.',
  ],
  ['INVALID_ORIGIN', 'Give the joint origin as three finite numbers in mechanism length units.'],
  ['INVALID_LEAD', 'Give the screw lead as a positive distance per turn (thread pitch × number of starts).'],
  [
    'INVALID_LIMITS',
    "Give limits as { lower, upper }: finite deltas from the as-built pose with lower ≤ upper that contain the degree of freedom's as-built value (0 for a driver). Spherical limits bound each rotation-vector component symmetrically, such as { lower: -30, upper: 30 }.",
  ],
  [
    'INVALID_VALUE',
    'Give a finite number; coupling ratios must be non-zero, curve driver periods and tolerances positive, and a curve needs at least two values.',
  ],
  ['INVALID_UNIT', "Use length 'm' or 'mm' and angle 'rad' or 'deg'."],
  [
    'INVALID_TRANSFORM',
    'Pass a rotation without mirror plus a translation and change lengths through units; a spherical joint with limits, couplings or keyframes moves only under a rotation that permutes the frame axes, such as Z-up to Y-up.',
  ],
  [
    'INVALID_ANIMATION',
    'Give a positive duration, a loop of none, repeat or pingPong, and at least one keyframe with times sorted within [0, duration].',
  ],
  [
    'CYCLIC_GRAPH',
    'Connect links as a tree: each non-root link is the child of exactly one joint and the root has no parent. Closed loops are not supported yet.',
  ],
  ['DISCONNECTED_LINK', 'Add a joint that connects this link, directly or through other links, to the root.'],
  ['CYCLIC_COUPLING', 'Break the coupling cycle so every follower traces back to a driver.'],
  [
    'DRIVEN_FOLLOWER',
    'Set the value of the coupling driver instead; a follower takes its value from exactly one coupling.',
  ],
]);

// Escape one JSON-pointer reference token.
const escapeToken = (token: string | number): string => `${token}`.replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * Build a JSON pointer from reference tokens, for example `pointer('joints', 'a/b')` → `/joints/a~1b`.
 *
 * @param tokens - Reference tokens.
 * @returns The JSON pointer.
 */
export const pointer = (...tokens: ReadonlyArray<string | number>): string =>
  tokens.map((token) => `/${escapeToken(token)}`).join('');

/**
 * Create an issue with the standard recovery sentence for its code.
 *
 * @param code - Issue code.
 * @param path - JSON pointer into the input.
 * @param message - What is wrong.
 * @returns The issue.
 */
export const problem = (code: IssueCode, path: string, message: string): Issue => ({
  code,
  path,
  message,
  recovery: recoveries.get(code)!,
});

/**
 * Render an unknown input value for a diagnostic message; never throws.
 *
 * @param value - Any input value.
 * @returns Its JSON text, or its type for a value JSON cannot represent (a BigInt or a cyclic object).
 */
const show = (value: unknown): string => {
  if (typeof value === 'number') {
    return `${value}`;
  }
  try {
    return String(JSON.stringify(value));
  } catch {
    return `<${typeof value} that JSON cannot represent>`;
  }
};

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isVector = (value: unknown): value is SpatialVector =>
  Array.isArray(value) && value.length === 3 && value.every((component) => isFiniteNumber(component));

const vectorLength = (vector: SpatialVector): number => Math.hypot(vector[0], vector[1], vector[2]);

const unknownKeys = (record: Readonly<Record<string, unknown>>, allowed: readonly string[], path: string): Issue[] =>
  Object.keys(record)
    .filter((key) => !allowed.includes(key))
    .map((key) =>
      problem('INVALID_SHAPE', `${path}${pointer(key)}`, `Unknown property "${key}"; allowed: ${allowed.join(', ')}.`),
    );

const scales = new Map<string, number>();

/**
 * Multiplicative factor from one unit to another through `@taucad/units`.
 *
 * @param from - UCUM code of the source unit.
 * @param to - UCUM code of the target unit.
 * @returns The value of one `from` expressed in `to`.
 */
export const unitScale = (from: string, to: string): number => {
  const key = `${from}>${to}`;
  const cached = scales.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const quantity = createQuantity({ value: 1, unit: from, space: 'linear' });
  const converted = quantity.status === 'success' ? convert({ quantity: quantity.value, to }) : quantity;
  if (converted.status !== 'success' || typeof converted.value.value !== 'number') {
    throw new Error(`@taucad/kinematics: cannot convert ${from} to ${to}.`);
  }
  scales.set(key, converted.value.value);
  return converted.value.value;
};

/**
 * An admitted mechanism compiled for evaluation. Links are in topological order (root
 * first) and joint `k` of the topological order has child link `k + 1`. Degrees of freedom
 * keep declaration order; each joint's degrees of freedom are contiguous.
 */
export type Plan = Readonly<{
  mechanism: Mechanism;
  linkIds: readonly string[];
  linkIndex: ReadonlyMap<string, number>;
  /** Per topological joint: parent link index, degree-of-freedom start and count, and origin (3). */
  jointParent: Int32Array;
  jointDofStart: Int32Array;
  jointDofCount: Int32Array;
  jointOrigin: Float64Array;
  /** Per link: index of the topological joint whose child it is, `-1` for the root. */
  parentJoint: Int32Array;
  degreesOfFreedom: readonly DegreeOfFreedom[];
  dofIndex: ReadonlyMap<string, number>;
  /** Per degree of freedom (3 each): rotation-vector and translation contribution per internal unit. */
  rotationAxis: Float64Array;
  translationAxis: Float64Array;
  /** Per degree of freedom: mechanism unit → internal unit (radians or mechanism length). */
  internalScale: Float64Array;
  lower: Float64Array;
  upper: Float64Array;
  /** Per degree of freedom: its root driver, and `value = gain × drivers[source] + bias` where `linear` is 1. */
  source: Int32Array;
  gain: Float64Array;
  bias: Float64Array;
  /** Per degree of freedom: 1 when no curve coupling lies between it and its root driver. */
  linear: Uint8Array<ArrayBuffer>;
  /** Per follower: its own coupling step, which {@link coordinateValue} walks where `linear` is 0. */
  steps: ReadonlyArray<CouplingStep | undefined>;
  /** Mechanism angle unit → radians. */
  angleScale: number;
}>;

/** One coupling applied to its immediate driver: a curve, or `ratio × driver + offset`. */
export type CouplingStep = Readonly<{
  driver: number;
  ratio: number;
  offset: number;
  driverPeriod: number;
  values: Float64Array | undefined;
}>;

/**
 * Where a driver value falls on a coupling curve: the sample below it and the fraction to the next.
 *
 * @param step - A curve step.
 * @param values - The step's samples.
 * @param driver - Driver value in mechanism units.
 * @returns The lower sample index, the next index (wrapping) and the fraction between them.
 */
const curvePosition = (
  step: CouplingStep,
  values: Float64Array,
  driver: number,
): Readonly<{ index: number; next: number; fraction: number }> => {
  const count = values.length;
  const scaled = ((driver / step.driverPeriod) * count) % count;
  const wrapped = scaled < 0 ? scaled + count : scaled;
  // Rounding can land a wrapped negative value exactly on `count`.
  const index = Math.min(Math.floor(wrapped), count - 1);
  return { index, next: (index + 1) % count, fraction: wrapped - index };
};

/**
 * Value of a degree of freedom in mechanism units; followers follow their couplings.
 *
 * @param plan - Compiled mechanism.
 * @param drivers - Driver values in mechanism units, indexed by degree of freedom.
 * @param index - Degree-of-freedom index.
 * @returns The value in mechanism units.
 */
export const coordinateValue = (plan: Plan, drivers: Float64Array, index: number): number => {
  if (plan.linear[index] === 1) {
    return plan.gain[index]! * drivers[plan.source[index]!]! + plan.bias[index]!;
  }
  const step = plan.steps[index]!;
  const input = coordinateValue(plan, drivers, step.driver);
  if (step.values === undefined) {
    return step.ratio * input + step.offset;
  }
  const { index: lower, next, fraction } = curvePosition(step, step.values, input);
  return step.values[lower]! + fraction * (step.values[next]! - step.values[lower]!);
};

/**
 * Derivative of a degree of freedom's value with respect to its root driver, in mechanism units.
 *
 * @param plan - Compiled mechanism.
 * @param drivers - Driver values in mechanism units, indexed by degree of freedom.
 * @param index - Degree-of-freedom index.
 * @returns `d value / d root`; a curve contributes the slope of the segment the driver lies on.
 */
export const coordinateSlope = (plan: Plan, drivers: Float64Array, index: number): number => {
  if (plan.linear[index] === 1) {
    return plan.gain[index]!;
  }
  const step = plan.steps[index]!;
  const inner = coordinateSlope(plan, drivers, step.driver);
  if (step.values === undefined) {
    return inner * step.ratio;
  }
  const { index: lower, next } = curvePosition(step, step.values, coordinateValue(plan, drivers, step.driver));
  return (inner * (step.values[next]! - step.values[lower]!) * step.values.length) / step.driverPeriod;
};

type Analysis =
  | Readonly<{ status: 'admitted'; plan: Plan }>
  | Readonly<{ status: 'invalid'; issues: readonly Issue[] }>;

const mechanismKeys = ['schemaVersion', 'units', 'root', 'links', 'joints', 'couplings', 'animations'];
const loops = new Set<unknown>(['none', 'repeat', 'pingPong']);

// "__proto__" as a record key sets the prototype instead of an entry, so records keyed by the id would lose it.
const checkId = (id: string, path: string, kind: string): Issue[] =>
  id === '__proto__' ? [problem('INVALID_SHAPE', path, `"__proto__" is reserved and cannot be a ${kind} id.`)] : [];

const checkLimits = (value: unknown, path: string, symmetric: boolean): Issue[] => {
  if (!isRecord(value)) {
    return [problem('INVALID_LIMITS', path, 'Limits must be an object { lower, upper }.')];
  }
  const issues = unknownKeys(value, ['lower', 'upper'], path);
  const { lower, upper } = value;
  if (!isFiniteNumber(lower) || !isFiniteNumber(upper) || lower > upper) {
    issues.push(
      problem('INVALID_LIMITS', path, `Limits need finite lower ≤ upper; got ${show(lower)} and ${show(upper)}.`),
    );
  } else if (symmetric && lower !== -upper) {
    // One box shared by the three rotation-vector components stays one box only if it is symmetric.
    issues.push(
      problem('INVALID_LIMITS', path, `Spherical limits must be symmetric, lower = −upper; got ${lower} and ${upper}.`),
    );
  }
  return issues;
};

const checkAxis = (value: unknown, path: string, name: string): Issue[] =>
  isVector(value) && vectorLength(value) > 0
    ? []
    : [
        problem(
          'INVALID_AXIS',
          path,
          `${name} must be three finite numbers with a non-zero length; it is never defaulted.`,
        ),
      ];

const checkJoint = (joint: unknown, path: string): Issue[] => {
  if (!isRecord(joint)) {
    return [problem('INVALID_SHAPE', path, 'A joint must be an object.')];
  }
  const { type } = joint;
  if (!isJointType(type)) {
    return [problem('UNSUPPORTED_JOINT', `${path}/type`, `Joint type ${show(type)} is not supported.`)];
  }
  const spec = jointSpecs[type];
  const issues = unknownKeys(joint, ['type', 'parent', 'child', 'origin', ...spec.keys], path);
  for (const key of ['parent', 'child']) {
    if (typeof joint[key] !== 'string') {
      issues.push(problem('INVALID_SHAPE', `${path}/${key}`, `Joint ${key} must be a link id string.`));
    }
  }
  if (!isVector(joint['origin'])) {
    issues.push(problem('INVALID_ORIGIN', `${path}/origin`, 'The joint origin must be three finite numbers.'));
  }
  for (const key of ['axis', 'normal', 'xAxis'].filter((name) => spec.keys.includes(name))) {
    issues.push(...checkAxis(joint[key], `${path}/${key}`, key));
  }
  const { normal, xAxis, lead, handedness, limits } = joint;
  if (type === 'planar' && isVector(normal) && isVector(xAxis)) {
    const cosine =
      (normal[0] * xAxis[0] + normal[1] * xAxis[1] + normal[2] * xAxis[2]) /
      (vectorLength(normal) * vectorLength(xAxis));
    if (Math.abs(cosine) > 1e-9) {
      issues.push(
        problem('INVALID_AXIS', `${path}/xAxis`, 'The planar xAxis must lie in the plane, perpendicular to normal.'),
      );
    }
  }
  if (type === 'screw') {
    if (!isFiniteNumber(lead) || lead <= 0) {
      issues.push(problem('INVALID_LEAD', `${path}/lead`, `Screw lead must be positive; got ${show(lead)}.`));
    }
    if (handedness !== 'right' && handedness !== 'left') {
      issues.push(problem('INVALID_SHAPE', `${path}/handedness`, "Screw handedness must be 'right' or 'left'."));
    }
  }
  if (limits === undefined || type === 'fixed') {
    return issues;
  }
  if (spec.limitKeys.length === 0) {
    return [...issues, ...checkLimits(limits, `${path}/limits`, type === 'spherical')];
  }
  if (!isRecord(limits)) {
    return [
      ...issues,
      problem('INVALID_LIMITS', `${path}/limits`, `Limits must be an object keyed by ${spec.limitKeys.join(', ')}.`),
    ];
  }
  issues.push(...unknownKeys(limits, spec.limitKeys, `${path}/limits`));
  for (const key of spec.limitKeys.filter((name) => limits[name] !== undefined)) {
    issues.push(...checkLimits(limits[key], `${path}/limits/${key}`, false));
  }
  return issues;
};

const checkLinks = (links: Readonly<Record<string, unknown>>): Issue[] => {
  const issues: Issue[] = [];
  const owners = new Map<string, string>();
  for (const [linkId, link] of Object.entries(links)) {
    const path = pointer('links', linkId);
    issues.push(...checkId(linkId, path, 'link'));
    if (!isRecord(link) || !Array.isArray(link['components'])) {
      issues.push(problem('INVALID_SHAPE', path, 'A link must be an object { components: string[] }.'));
      continue;
    }
    issues.push(...unknownKeys(link, ['components'], path));
    for (const [index, component] of (link['components'] as unknown[]).entries()) {
      const componentPath = `${path}/components/${index}`;
      if (typeof component !== 'string') {
        issues.push(problem('INVALID_SHAPE', componentPath, 'A component must be a string.'));
      } else if (owners.has(component)) {
        issues.push(
          problem(
            'DUPLICATE_COMPONENT',
            componentPath,
            `Component "${component}" is already carried by link "${owners.get(component)}".`,
          ),
        );
      } else {
        owners.set(component, linkId);
      }
    }
  }
  return issues;
};

const checkCurve = (curve: unknown, path: string): Issue[] => {
  if (!isRecord(curve) || !Array.isArray(curve['values'])) {
    return [problem('INVALID_SHAPE', path, 'A coupling curve must be an object { driverPeriod, values: number[] }.')];
  }
  const issues = unknownKeys(curve, ['driverPeriod', 'values'], path);
  const { driverPeriod, values } = curve;
  if (!isFiniteNumber(driverPeriod) || driverPeriod <= 0) {
    issues.push(
      problem(
        'INVALID_VALUE',
        `${path}/driverPeriod`,
        `Curve driverPeriod must be positive and finite; got ${show(driverPeriod)}.`,
      ),
    );
  }
  if (values.length < 2 || !values.every((value) => isFiniteNumber(value))) {
    issues.push(
      problem(
        'INVALID_VALUE',
        `${path}/values`,
        `Curve values must be at least two finite numbers; got ${values.length} entries.`,
      ),
    );
  }
  return issues;
};

const checkCouplingShapes = (couplings: unknown): Issue[] => {
  if (couplings === undefined) {
    return [];
  }
  if (!Array.isArray(couplings)) {
    return [problem('INVALID_SHAPE', '/couplings', 'Couplings must be an array.')];
  }
  return couplings.flatMap((coupling: unknown, index) => {
    const path = pointer('couplings', index);
    if (!isRecord(coupling) || typeof coupling['driver'] !== 'string' || typeof coupling['follower'] !== 'string') {
      return [
        problem(
          'INVALID_SHAPE',
          path,
          'A coupling must be an object { driver, follower, ratio, offset? } or { driver, follower, curve }.',
        ),
      ];
    }
    if ('curve' in coupling) {
      return [
        ...unknownKeys(coupling, ['driver', 'follower', 'curve'], path),
        ...checkCurve(coupling['curve'], `${path}/curve`),
      ];
    }
    const issues = unknownKeys(coupling, ['driver', 'follower', 'ratio', 'offset'], path);
    const { ratio, offset } = coupling;
    if (!isFiniteNumber(ratio) || ratio === 0) {
      issues.push(
        problem('INVALID_VALUE', `${path}/ratio`, `Coupling ratio must be finite and non-zero; got ${show(ratio)}.`),
      );
    }
    if (offset !== undefined && !isFiniteNumber(offset)) {
      issues.push(problem('INVALID_VALUE', `${path}/offset`, `Coupling offset must be finite; got ${show(offset)}.`));
    }
    return issues;
  });
};

const checkKeyframes = (keyframes: unknown, path: string, duration: number): Issue[] => {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return [problem('INVALID_ANIMATION', path, 'An animation needs a non-empty keyframes array.')];
  }
  let previous = 0;
  return keyframes.flatMap((keyframe: unknown, index) => {
    const keyframePath = `${path}/${index}`;
    if (!isRecord(keyframe) || !isRecord(keyframe['coordinates'])) {
      return [problem('INVALID_SHAPE', keyframePath, 'A keyframe must be an object { time, coordinates }.')];
    }
    const issues = unknownKeys(keyframe, ['time', 'coordinates'], keyframePath);
    const { time } = keyframe;
    if (!isFiniteNumber(time) || time < previous || time > duration) {
      issues.push(
        problem(
          'INVALID_ANIMATION',
          `${keyframePath}/time`,
          `Keyframe time ${show(time)} must be sorted and within [0, ${duration}].`,
        ),
      );
    } else {
      previous = time;
    }
    for (const [id, value] of Object.entries(keyframe['coordinates'])) {
      if (!isFiniteNumber(value)) {
        issues.push(
          problem('INVALID_VALUE', `${keyframePath}/coordinates${pointer(id)}`, `Coordinate "${id}" must be finite.`),
        );
      }
    }
    return issues;
  });
};

const checkAnimationShapes = (animations: unknown): Issue[] => {
  if (animations === undefined) {
    return [];
  }
  if (!Array.isArray(animations)) {
    return [problem('INVALID_SHAPE', '/animations', 'Animations must be an array.')];
  }
  const ids = new Set<string>();
  return animations.flatMap((animation: unknown, index) => {
    const path = pointer('animations', index);
    if (!isRecord(animation) || typeof animation['id'] !== 'string') {
      return [problem('INVALID_SHAPE', path, 'An animation must be an object with a string id.')];
    }
    const issues = unknownKeys(animation, ['id', 'name', 'duration', 'loop', 'keyframes'], path);
    const { id, name, duration, loop, keyframes } = animation;
    issues.push(...checkId(id, `${path}/id`, 'animation'));
    if (ids.has(id)) {
      issues.push(problem('DUPLICATE_ID', `${path}/id`, `Animation id "${id}" is already used.`));
    }
    ids.add(id);
    if (name !== undefined && typeof name !== 'string') {
      issues.push(problem('INVALID_SHAPE', `${path}/name`, 'An animation name must be a string.'));
    }
    if (loop !== undefined && !loops.has(loop)) {
      issues.push(problem('INVALID_ANIMATION', `${path}/loop`, `Loop ${show(loop)} is not none, repeat or pingPong.`));
    }
    if (!isFiniteNumber(duration) || duration <= 0) {
      return [
        ...issues,
        problem('INVALID_ANIMATION', `${path}/duration`, `Duration must be positive seconds; got ${show(duration)}.`),
      ];
    }
    return [...issues, ...checkKeyframes(keyframes, `${path}/keyframes`, duration)];
  });
};

const checkShape = (input: unknown): Issue[] => {
  if (!isRecord(input)) {
    return [problem('INVALID_SHAPE', '', 'A mechanism must be an object.')];
  }
  const issues = unknownKeys(input, mechanismKeys, '');
  const { schemaVersion, units, root, links, joints } = input;
  if (schemaVersion !== 1) {
    issues.push(
      problem('UNSUPPORTED_SCHEMA', '/schemaVersion', `Schema version ${show(schemaVersion)} is not supported.`),
    );
  }
  if (isRecord(units)) {
    issues.push(...unknownKeys(units, ['length', 'angle'], '/units'));
    if (units['length'] !== 'm' && units['length'] !== 'mm') {
      issues.push(problem('INVALID_UNIT', '/units/length', `Length unit ${show(units['length'])} is not supported.`));
    }
    if (units['angle'] !== 'rad' && units['angle'] !== 'deg') {
      issues.push(problem('INVALID_UNIT', '/units/angle', `Angle unit ${show(units['angle'])} is not supported.`));
    }
  } else {
    issues.push(problem('INVALID_UNIT', '/units', 'Units must be an object { length, angle }.'));
  }
  if (typeof root !== 'string') {
    issues.push(problem('INVALID_SHAPE', '/root', 'The root must be a link id string.'));
  }
  if (isRecord(links)) {
    issues.push(...checkLinks(links));
  } else {
    issues.push(problem('INVALID_SHAPE', '/links', 'Links must be an object keyed by link id.'));
  }
  if (isRecord(joints)) {
    for (const [jointId, joint] of Object.entries(joints)) {
      issues.push(
        ...checkId(jointId, pointer('joints', jointId), 'joint'),
        ...checkJoint(joint, pointer('joints', jointId)),
      );
    }
  } else {
    issues.push(problem('INVALID_SHAPE', '/joints', 'Joints must be an object keyed by joint id.'));
  }
  return [...issues, ...checkCouplingShapes(input['couplings']), ...checkAnimationShapes(input['animations'])];
};

type Tree = Readonly<{ order: readonly string[]; issues: readonly Issue[] }>;

/**
 * Order joints parent-first from the root and report every link that is not on the tree.
 *
 * @param mechanism - A structurally valid mechanism.
 * @returns Topological joint order and tree issues.
 */
const checkTree = (mechanism: Mechanism): Tree => {
  const { root, links, joints } = mechanism;
  const issues: Issue[] = [];
  if (!Object.hasOwn(links, root)) {
    issues.push(problem('UNKNOWN_LINK', '/root', `Root "${root}" is not a declared link.`));
  }
  const parentOf = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const [jointId, joint] of Object.entries(joints)) {
    const path = pointer('joints', jointId);
    const known = [joint.parent, joint.child].every((link) => Object.hasOwn(links, link));
    for (const key of ['parent', 'child'] as const) {
      if (!Object.hasOwn(links, joint[key])) {
        issues.push(problem('UNKNOWN_LINK', `${path}/${key}`, `Link "${joint[key]}" is not declared.`));
      }
    }
    if (joint.child === root || joint.child === joint.parent || parentOf.has(joint.child)) {
      issues.push(
        problem('CYCLIC_GRAPH', `${path}/child`, `Link "${joint.child}" cannot be the child of joint "${jointId}".`),
      );
    } else if (known) {
      parentOf.set(joint.child, jointId);
      children.set(joint.parent, [...(children.get(joint.parent) ?? []), jointId]);
    }
  }
  const order: string[] = [];
  const reached = new Set([root]);
  const queue = [root];
  for (let link = queue.shift(); link !== undefined; link = queue.shift()) {
    for (const jointId of children.get(link) ?? []) {
      const { child } = joints[jointId]!;
      order.push(jointId);
      reached.add(child);
      queue.push(child);
    }
  }
  for (const linkId of Object.keys(links).filter((id) => !reached.has(id))) {
    const visited = new Set<string>();
    let current: string | undefined = linkId;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const jointId = parentOf.get(current);
      current = jointId === undefined ? undefined : joints[jointId]!.parent;
    }
    issues.push(
      current === undefined
        ? problem('DISCONNECTED_LINK', pointer('links', linkId), `Link "${linkId}" is not connected to root "${root}".`)
        : problem('CYCLIC_GRAPH', pointer('links', linkId), `Link "${linkId}" lies on or below a cycle of joints.`),
    );
  }
  return { order, issues };
};

type Relations = Readonly<{ issues: readonly Issue[]; couplingOf: ReadonlyMap<string, Coupling> }>;

const checkRelations = (mechanism: Mechanism, dofs: ReadonlyMap<string, DegreeOfFreedomSpec>): Relations => {
  const issues: Issue[] = [];
  const couplingOf = new Map<string, Coupling>();
  const couplings = mechanism.couplings ?? [];
  for (const [index, coupling] of couplings.entries()) {
    const path = pointer('couplings', index);
    for (const key of ['driver', 'follower'] as const) {
      if (!dofs.has(coupling[key])) {
        issues.push(
          problem(
            'UNKNOWN_DEGREE_OF_FREEDOM',
            `${path}/${key}`,
            `Degree of freedom "${coupling[key]}" does not exist.`,
          ),
        );
      }
    }
    if (couplingOf.has(coupling.follower)) {
      issues.push(
        problem(
          'DRIVEN_FOLLOWER',
          `${path}/follower`,
          `"${coupling.follower}" is already the follower of another coupling.`,
        ),
      );
    } else {
      couplingOf.set(coupling.follower, coupling);
    }
  }
  for (const [index, coupling] of couplings.entries()) {
    let current: string | undefined = coupling.driver;
    for (let step = 0; current !== undefined && step <= couplings.length; step += 1) {
      if (current === coupling.follower) {
        issues.push(
          problem(
            'CYCLIC_COUPLING',
            pointer('couplings', index),
            `"${coupling.follower}" drives itself through couplings.`,
          ),
        );
        break;
      }
      current = couplingOf.get(current)?.driver;
    }
  }
  for (const [index, animation] of (mechanism.animations ?? []).entries()) {
    for (const [keyframeIndex, keyframe] of animation.keyframes.entries()) {
      for (const id of Object.keys(keyframe.coordinates)) {
        const path = pointer('animations', index, 'keyframes', keyframeIndex, 'coordinates', id);
        if (!dofs.has(id)) {
          issues.push(problem('UNKNOWN_DEGREE_OF_FREEDOM', path, `Degree of freedom "${id}" does not exist.`));
        } else if (couplingOf.has(id)) {
          issues.push(problem('DRIVEN_FOLLOWER', path, `"${id}" is a coupling follower; animate its driver instead.`));
        }
      }
    }
  }
  return { issues, couplingOf };
};

const normalized = (vector: SpatialVector): SpatialVector => {
  const length = vectorLength(vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

export const cross = (left: SpatialVector, right: SpatialVector): SpatialVector => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

type Motion = Readonly<{ rotation?: SpatialVector; translation?: SpatialVector }>;

/**
 * Rotation-vector and translation contribution per internal unit of each degree of freedom of a joint.
 *
 * @param joint - An admitted joint.
 * @returns One motion per degree of freedom.
 */
const jointMotions = (joint: Joint): readonly Motion[] => {
  switch (joint.type) {
    case 'fixed': {
      return [];
    }
    case 'revolute': {
      return [{ rotation: normalized(joint.axis) }];
    }
    case 'prismatic': {
      return [{ translation: normalized(joint.axis) }];
    }
    case 'cylindrical': {
      const axis = normalized(joint.axis);
      return [{ rotation: axis }, { translation: axis }];
    }
    case 'screw': {
      const axis = normalized(joint.axis);
      const advance = ((joint.handedness === 'right' ? 1 : -1) * joint.lead) / (2 * Math.PI);
      return [{ rotation: axis, translation: [axis[0] * advance, axis[1] * advance, axis[2] * advance] }];
    }
    case 'spherical': {
      return [{ rotation: [1, 0, 0] }, { rotation: [0, 1, 0] }, { rotation: [0, 0, 1] }];
    }
    case 'planar': {
      const normal = normalized(joint.normal);
      const xAxis = normalized(joint.xAxis);
      return [{ translation: xAxis }, { translation: cross(normal, xAxis) }, { rotation: normal }];
    }
  }
};

/**
 * Resolve a degree of freedom to its root driver: `value = gain × root + bias` while every coupling
 * on the way is linear; a curve anywhere on the chain leaves `linear` false.
 *
 * @param id - Degree-of-freedom id.
 * @param couplingOf - Coupling per follower id (acyclic).
 * @returns The root driver id, and the gain and bias of a linear chain.
 */
const resolveSource = (
  id: string,
  couplingOf: ReadonlyMap<string, Coupling>,
): Readonly<{ root: string; gain: number; bias: number; linear: boolean }> => {
  const coupling = couplingOf.get(id);
  if (coupling === undefined) {
    return { root: id, gain: 1, bias: 0, linear: true };
  }
  const driver = resolveSource(coupling.driver, couplingOf);
  if ('curve' in coupling || !driver.linear) {
    return { root: driver.root, gain: 0, bias: 0, linear: false };
  }
  return {
    root: driver.root,
    gain: coupling.ratio * driver.gain,
    bias: coupling.ratio * driver.bias + (coupling.offset ?? 0),
    linear: true,
  };
};

const compile = (mechanism: Mechanism, order: readonly string[], couplingOf: ReadonlyMap<string, Coupling>): Plan => {
  const angleScale = unitScale(mechanism.units.angle, 'rad');
  const degreesOfFreedom: DegreeOfFreedom[] = [];
  const motions: Motion[] = [];
  const firstDof = new Map<string, number>();
  for (const [jointId, joint] of Object.entries(mechanism.joints)) {
    firstDof.set(jointId, degreesOfFreedom.length);
    motions.push(...jointMotions(joint));
    for (const spec of jointSpecs[joint.type].dofs) {
      const id = dofId(jointId, spec.suffix);
      const coupling = couplingOf.get(id);
      degreesOfFreedom.push({
        id,
        jointId,
        kind: spec.kind,
        role: coupling === undefined ? 'driver' : 'follower',
        limits: dofLimits(joint, spec),
        coupling,
      });
    }
  }
  const dofIndex = new Map(degreesOfFreedom.map((dof, index) => [dof.id, index]));
  const count = degreesOfFreedom.length;
  const rotationAxis = new Float64Array(count * 3);
  const translationAxis = new Float64Array(count * 3);
  const internalScale = new Float64Array(count);
  const lower = new Float64Array(count);
  const upper = new Float64Array(count);
  const source = new Int32Array(count);
  const gain = new Float64Array(count);
  const bias = new Float64Array(count);
  const linear = new Uint8Array(count);
  const steps: Array<CouplingStep | undefined> = [];
  for (const [index, dof] of degreesOfFreedom.entries()) {
    rotationAxis.set(motions[index]!.rotation ?? [0, 0, 0], index * 3);
    translationAxis.set(motions[index]!.translation ?? [0, 0, 0], index * 3);
    internalScale[index] = dof.kind === 'angle' ? angleScale : 1;
    lower[index] = dof.limits?.lower ?? -Infinity;
    upper[index] = dof.limits?.upper ?? Infinity;
    const resolved = resolveSource(dof.id, couplingOf);
    source[index] = dofIndex.get(resolved.root)!;
    gain[index] = resolved.gain;
    bias[index] = resolved.bias;
    linear[index] = resolved.linear ? 1 : 0;
    const { coupling } = dof;
    steps.push(
      coupling === undefined
        ? undefined
        : 'curve' in coupling
          ? {
              driver: dofIndex.get(coupling.driver)!,
              ratio: 0,
              offset: 0,
              driverPeriod: coupling.curve.driverPeriod,
              values: Float64Array.from(coupling.curve.values),
            }
          : {
              driver: dofIndex.get(coupling.driver)!,
              ratio: coupling.ratio,
              offset: coupling.offset ?? 0,
              driverPeriod: 0,
              values: undefined,
            },
    );
  }
  const linkIds = [mechanism.root, ...order.map((jointId) => mechanism.joints[jointId]!.child)];
  const linkIndex = new Map(linkIds.map((linkId, index) => [linkId, index]));
  const parentJoint = new Int32Array(linkIds.length).fill(-1);
  const jointParent = new Int32Array(order.length);
  const jointDofStart = new Int32Array(order.length);
  const jointDofCount = new Int32Array(order.length);
  const jointOrigin = new Float64Array(order.length * 3);
  for (const [index, jointId] of order.entries()) {
    const joint = mechanism.joints[jointId]!;
    parentJoint[index + 1] = index;
    jointParent[index] = linkIndex.get(joint.parent)!;
    jointDofStart[index] = firstDof.get(jointId)!;
    jointDofCount[index] = jointSpecs[joint.type].dofs.length;
    jointOrigin.set(joint.origin, index * 3);
  }
  return {
    mechanism,
    linkIds,
    linkIndex,
    jointParent,
    jointDofStart,
    jointDofCount,
    jointOrigin,
    parentJoint,
    degreesOfFreedom,
    dofIndex,
    rotationAxis,
    translationAxis,
    internalScale,
    lower,
    upper,
    source,
    gain,
    bias,
    linear,
    steps,
    angleScale,
  };
};

/**
 * Limits are deltas from the as-built pose, which Reset returns to, so each degree of freedom's
 * value there (0 for a driver, its couplings evaluated at zero drivers for a follower) must lie within them.
 *
 * @param plan - A compiled mechanism.
 * @returns An issue per degree of freedom whose limits exclude its as-built value.
 */
const checkReference = (plan: Plan): Issue[] => {
  const asBuilt = new Float64Array(plan.degreesOfFreedom.length);
  return Object.entries(plan.mechanism.joints).flatMap(([jointId, joint]) =>
    jointSpecs[joint.type].dofs.flatMap((spec) => {
      const id = dofId(jointId, spec.suffix);
      const index = plan.dofIndex.get(id)!;
      const [reference, lower, upper] = [coordinateValue(plan, asBuilt, index), plan.lower[index]!, plan.upper[index]!];
      const path = pointer('joints', jointId, 'limits', ...(spec.limitKey === undefined ? [] : [spec.limitKey]));
      return reference >= lower && reference <= upper
        ? []
        : [
            problem(
              'INVALID_LIMITS',
              path,
              `"${id}" is ${reference} at the as-built pose, outside its limits [${lower}, ${upper}].`,
            ),
          ];
    }),
  );
};

const analyze = (input: unknown): Analysis => {
  const shapeIssues = checkShape(input);
  if (shapeIssues.length > 0) {
    return { status: 'invalid', issues: shapeIssues };
  }
  // The structural checks above establish every field `Mechanism` declares.
  const mechanism = input as Mechanism;
  const dofs = new Map<string, DegreeOfFreedomSpec>();
  const issues: Issue[] = [];
  for (const [jointId, joint] of Object.entries(mechanism.joints)) {
    for (const spec of jointSpecs[joint.type].dofs) {
      const id = dofId(jointId, spec.suffix);
      if (dofs.has(id)) {
        issues.push(
          problem(
            'DUPLICATE_ID',
            pointer('joints', jointId),
            `Degree-of-freedom id "${id}" is produced by two joints.`,
          ),
        );
      }
      dofs.set(id, spec);
    }
  }
  const tree = checkTree(mechanism);
  const relations = checkRelations(mechanism, dofs);
  issues.push(...tree.issues, ...relations.issues);
  if (issues.length > 0) {
    return { status: 'invalid', issues };
  }
  const plan = compile(mechanism, tree.order, relations.couplingOf);
  const outside = checkReference(plan);
  return outside.length > 0 ? { status: 'invalid', issues: outside } : { status: 'admitted', plan };
};

const analyses = new WeakMap<Readonly<Record<string, unknown>>, Analysis>();

/**
 * Admit and compile a mechanism once per object identity.
 *
 * @param input - Unknown input; objects are cached by identity, so treat admitted mechanisms as immutable.
 * @returns The compiled plan or every issue found.
 */
export const analyzeMechanism = (input: unknown): Analysis => {
  if (!isRecord(input)) {
    return analyze(input);
  }
  const cached = analyses.get(input);
  if (cached !== undefined) {
    return cached;
  }
  const analysis = analyze(input);
  analyses.set(input, analysis);
  return analysis;
};

/**
 * Compiled plan of a mechanism that must already be admissible.
 *
 * @param mechanism - A mechanism expected to pass admission.
 * @returns The compiled plan.
 * @throws Error listing the issues when the mechanism is not admissible.
 */
export const planOf = (mechanism: Mechanism): Plan => {
  const analysis = analyzeMechanism(mechanism);
  if (analysis.status === 'invalid') {
    const details = analysis.issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join(' ');
    throw new Error(`@taucad/kinematics: the mechanism is not admissible; call admitMechanism first. ${details}`);
  }
  return analysis.plan;
};

/**
 * Admit unknown input (parsed JSON or an authored value) as a valid mechanism: structure,
 * units, axes, limits, the joint tree, couplings and animations. Every issue carries a
 * JSON-pointer path into the input and a recovery sentence.
 *
 * @param input - Unknown value to validate structurally and semantically.
 * @returns The admitted mechanism (the same object) or every issue found.
 * @public
 * @example <caption>Admit parsed JSON</caption>
 * ```typescript
 * import { admitMechanism } from '@taucad/kinematics';
 *
 * const outcome = admitMechanism({
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { components: ['Base'] }, lid: { components: ['Lid'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0] } },
 * });
 * if (outcome.status === 'invalid') {
 *   console.error(outcome.issues.map((issue) => `${issue.path}: ${issue.message}`));
 * }
 * ```
 */
export const admitMechanism = (input: unknown): AdmitMechanismOutcome => {
  const analysis = analyzeMechanism(input);
  return analysis.status === 'admitted' ? { status: 'admitted', mechanism: analysis.plan.mechanism } : analysis;
};

/**
 * List every degree of freedom of an admitted mechanism in joint order. Single-DOF joints
 * use the joint id; cylindrical joints add `/angle` and `/distance`, spherical joints
 * `/x`, `/y` and `/z`, planar joints `/x`, `/y` and `/angle`.
 *
 * @param mechanism - An admitted mechanism.
 * @returns Drivers and followers with their limits and couplings.
 * @throws Error when the mechanism is not admissible.
 * @public
 * @example <caption>One slider per driver</caption>
 * ```typescript
 * import { admitMechanism, listDegreesOfFreedom } from '@taucad/kinematics';
 *
 * const outcome = admitMechanism({
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { components: ['Base'] }, lid: { components: ['Lid'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0], limits: { lower: 0, upper: 110 } } },
 * });
 * if (outcome.status === 'admitted') {
 *   const drivers = listDegreesOfFreedom(outcome.mechanism).filter((dof) => dof.role === 'driver');
 *   console.log(drivers.map((dof) => `${dof.id}: ${dof.kind} ${dof.limits?.lower} to ${dof.limits?.upper}`));
 * }
 * ```
 */
export const listDegreesOfFreedom = (mechanism: Mechanism): readonly DegreeOfFreedom[] =>
  planOf(mechanism).degreesOfFreedom;

/**
 * Find the link that rigidly carries a component.
 *
 * @param input - A resolved mechanism and a canonical component id.
 * @returns The link id, or `undefined` when no link carries the component.
 * @public
 * @example <caption>Find the link a picked part moves with</caption>
 * ```typescript
 * import { findLinkByComponent } from '@taucad/kinematics';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * const mechanism: Mechanism = {
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { components: ['component-base'] }, lid: { components: ['component-lid', 'component-handle'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0] } },
 * };
 * console.log(findLinkByComponent({ mechanism, componentId: 'component-handle' })); // 'lid'
 * ```
 */
export const findLinkByComponent = ({ mechanism, componentId }: FindLinkByComponentInput): string | undefined =>
  Object.entries(mechanism.links).find(([, { components }]) => components.includes(componentId))?.[0];
