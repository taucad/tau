import type { SpatialMatrix, SpatialVector } from '@taucad/spatial';
import {
  admitMechanism,
  analyzeMechanism,
  cross,
  dofId,
  dofLimits,
  isRecord,
  jointSpecs,
  pointer,
  problem,
  unitScale,
} from '#mechanism.js';
import type {
  Coupling,
  Issue,
  Joint,
  JointLimits,
  ResolveMechanismComponentsInput,
  ResolveMechanismComponentsOutcome,
  TransformMechanismInput,
  TransformMechanismOutcome,
} from '#types.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const axisNames: readonly string[] = ['x', 'y', 'z'];
/** Tolerance of the rigid-matrix checks. */
const rigidTolerance = 1e-9;

const dot = (left: SpatialVector, right: SpatialVector): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

/**
 * Why a matrix is not a proper rigid transform.
 *
 * @param matrix - Column-major 4×4 matrix.
 * @returns The first violated condition, or `undefined` for a rotation without mirror plus a translation.
 */
const rigidityDefect = (matrix: SpatialMatrix): string | undefined => {
  const small = (values: readonly number[]): boolean => values.every((value) => Math.abs(value) <= rigidTolerance);
  const columns = [0, 4, 8].map((start): SpatialVector => [matrix[start]!, matrix[start + 1]!, matrix[start + 2]!]);
  if (!matrix.every((value) => Number.isFinite(value))) {
    return 'an entry is not finite';
  }
  if (!small([matrix[3], matrix[7], matrix[11], matrix[15] - 1])) {
    return 'its bottom row is not 0 0 0 1';
  }
  if (
    !small(columns.flatMap((left, row) => columns.map((right, column) => dot(left, right) - (row === column ? 1 : 0))))
  ) {
    return 'its rotation block is not orthonormal, so it scales or shears';
  }
  return dot(cross(columns[0]!, columns[1]!), columns[2]!) < 0
    ? 'its rotation block mirrors (determinant −1)'
    : undefined;
};

/**
 * Where each frame axis goes under a rotation that permutes the axes with signs, as Z-up to Y-up does.
 *
 * @param matrix - A proper rigid transform.
 * @returns Per source axis, its target axis and sign, or `undefined` for any other rotation.
 */
const axisPermutation = (
  matrix: SpatialMatrix,
): ReadonlyArray<Readonly<{ axis: number; sign: number }>> | undefined => {
  const images: Array<Readonly<{ axis: number; sign: number }>> = [];
  for (const source of [0, 1, 2]) {
    const axis = [0, 1, 2].find((target) => Math.abs(Math.abs(matrix[source * 4 + target]!) - 1) <= rigidTolerance);
    if (axis === undefined) {
      return undefined;
    }
    images.push({ axis, sign: Math.sign(matrix[source * 4 + axis]!) });
  }
  return images;
};

/**
 * Re-express a mechanism in another frame and length unit. Origins are scaled then moved by
 * `matrix`; axes, normals and plane axes are rotated; distance limits, screw leads, distance
 * keyframes and coupling ratios and offsets follow their degrees of freedom's units. Angle
 * values change only when `units.angle` differs. The input is not mutated.
 *
 * Spherical coordinates are rotation-vector components along the frame axes, so the result's
 * spherical ids name the new frame's axes. Under a rotation that permutes the axes with signs,
 * such as Z-up to Y-up, couplings and keyframes move to the renamed components with their signs
 * and the symmetric spherical limits carry over.
 *
 * @param input - Mechanism, target units and an optional column-major rigid transform.
 * @returns A new mechanism in the target frame and units; the mechanism's admission issues; or
 * an `INVALID_TRANSFORM` issue when `matrix` has a non-finite entry, a bottom row other than
 * `0 0 0 1`, or a rotation block that is not orthonormal with determinant +1 (a scale or a
 * mirror), or when a spherical joint with limits, couplings or keyframes meets a rotation that
 * does not permute the axes.
 * @public
 * @example <caption>Convert an authored millimetre mechanism to metres</caption>
 * ```typescript
 * import { transformMechanism } from '@taucad/kinematics';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * const mechanism: Mechanism = {
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'frame',
 *   links: { frame: { components: [] }, slide: { components: ['Slide'] } },
 *   joints: { rail: { type: 'prismatic', parent: 'frame', child: 'slide', origin: [0, 0, 0], axis: [1, 0, 0], limits: { lower: 0, upper: 250 } } },
 * };
 * const outcome = transformMechanism({ mechanism, units: { length: 'm', angle: 'deg' } });
 * console.log(outcome.status === 'transformed' ? outcome.mechanism.joints['rail'] : outcome.issues);
 * ```
 */
export const transformMechanism = ({
  mechanism,
  units,
  matrix = identity,
}: TransformMechanismInput): TransformMechanismOutcome => {
  const analysis = analyzeMechanism(mechanism);
  if (analysis.status === 'invalid') {
    return analysis;
  }
  const { plan } = analysis;
  const defect = rigidityDefect(matrix);
  if (defect !== undefined) {
    return {
      status: 'invalid',
      issues: [problem('INVALID_TRANSFORM', '/matrix', `The matrix is not a proper rigid transform: ${defect}.`)],
    };
  }
  // A spherical joint with limits, couplings or keyframes needs a rotation that renames its axes.
  const permutation = axisPermutation(matrix);
  if (permutation === undefined) {
    const referenced = new Set(
      [
        ...(mechanism.couplings ?? []).flatMap(({ driver, follower }) => [driver, follower]),
        ...(mechanism.animations ?? []).flatMap(({ keyframes }) =>
          keyframes.flatMap(({ coordinates }) => Object.keys(coordinates)),
        ),
      ].map((id) => plan.degreesOfFreedom[plan.dofIndex.get(id)!]!.jointId),
    );
    const issues = Object.entries(mechanism.joints).flatMap(([jointId, joint]) =>
      joint.type === 'spherical' && (joint.limits !== undefined || referenced.has(jointId))
        ? [
            problem(
              'INVALID_TRANSFORM',
              pointer('joints', jointId),
              `Spherical joint "${jointId}" has limits, couplings or keyframes, which follow only a rotation that permutes the frame axes.`,
            ),
          ]
        : [],
    );
    if (issues.length > 0) {
      return { status: 'invalid', issues };
    }
  }
  const lengthScale = unitScale(mechanism.units.length, units.length);
  const angleScale = unitScale(mechanism.units.angle, units.angle);
  const kindScale = (id: string): number =>
    plan.degreesOfFreedom[plan.dofIndex.get(id)!]!.kind === 'angle' ? angleScale : lengthScale;
  const rotate = (vector: SpatialVector): SpatialVector => [
    matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2],
    matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2],
    matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2],
  ];
  const place = (point: SpatialVector): SpatialVector => {
    const [x, y, z] = rotate([point[0] * lengthScale, point[1] * lengthScale, point[2] * lengthScale]);
    return [x + matrix[12], y + matrix[13], z + matrix[14]];
  };
  const scaleLimits = (limits: JointLimits, scale: number): JointLimits => ({
    lower: limits.lower * scale,
    upper: limits.upper * scale,
  });
  // Spherical coordinates are components along the frame axes: a signed axis permutation renames them to the
  // new frame's axes with a sign. Any other rotation would mix them, which the check above rules out.
  const mapDof = (id: string): Readonly<{ id: string; sign: number }> => {
    const { jointId } = plan.degreesOfFreedom[plan.dofIndex.get(id)!]!;
    if (mechanism.joints[jointId]!.type !== 'spherical') {
      return { id, sign: 1 };
    }
    const { axis, sign } = permutation![axisNames.indexOf(id.slice(jointId.length + 1))]!;
    return { id: dofId(jointId, axisNames[axis]!), sign };
  };

  const transformJoint = (jointId: string, joint: Joint): Joint => {
    const record: Record<string, unknown> = { ...joint, origin: place(joint.origin) };
    for (const key of ['axis', 'normal', 'xAxis']) {
      const value = record[key];
      if (value !== undefined) {
        record[key] = rotate(value as SpatialVector);
      }
    }
    if (joint.type === 'screw') {
      record['lead'] = joint.lead * lengthScale;
    }
    if ('limits' in joint && joint.limits !== undefined) {
      const spec = jointSpecs[joint.type];
      const scaled = spec.dofs.flatMap((dof) => {
        const value = dofLimits(joint, dof);
        return value === undefined
          ? []
          : [[dof.limitKey, scaleLimits(value, kindScale(dofId(jointId, dof.suffix)))] as const];
      });
      record['limits'] = spec.limitKeys.length === 0 ? scaled[0]![1] : Object.fromEntries(scaled);
    }
    // The record keeps every property of `joint` with values of the same types.
    return record as Joint;
  };

  const { couplings, animations } = mechanism;
  const transformed = {
    ...mechanism,
    units: { length: units.length, angle: units.angle },
    joints: Object.fromEntries(
      Object.entries(mechanism.joints).map(([jointId, joint]) => [jointId, transformJoint(jointId, joint)]),
    ),
    ...(couplings === undefined
      ? {}
      : {
          couplings: couplings.map((coupling): Coupling => {
            const driver = mapDof(coupling.driver);
            const follower = mapDof(coupling.follower);
            const followerScale = follower.sign * kindScale(coupling.follower);
            if ('curve' in coupling) {
              const { driverPeriod, values } = coupling.curve;
              // A negated driver reads the period backwards: the sample at k becomes the one at −k.
              const ordered =
                driver.sign > 0 ? values : values.map((_, index) => values[(values.length - index) % values.length]!);
              return {
                driver: driver.id,
                follower: follower.id,
                curve: {
                  driverPeriod: driverPeriod * kindScale(coupling.driver),
                  values: ordered.map((value) => value * followerScale),
                },
              };
            }
            return {
              ...coupling,
              driver: driver.id,
              follower: follower.id,
              ratio: (coupling.ratio * followerScale * driver.sign) / kindScale(coupling.driver),
              ...(coupling.offset === undefined ? {} : { offset: coupling.offset * followerScale }),
            };
          }),
        }),
    ...(animations === undefined
      ? {}
      : {
          animations: animations.map((animation) => ({
            ...animation,
            keyframes: animation.keyframes.map((keyframe) => ({
              ...keyframe,
              coordinates: Object.fromEntries(
                Object.entries(keyframe.coordinates).map(([id, value]) => {
                  const target = mapDof(id);
                  return [target.id, target.sign * value * kindScale(id)];
                }),
              ),
            })),
          })),
        }),
  };
  return { status: 'transformed', mechanism: transformed };
};

/**
 * Rewrite an admission issue path from a resolved link's `components` back to the authored `shapes`.
 *
 * @param issue - Admission issue of the resolved mechanism.
 * @returns The issue with its path into the authored source.
 */
const toSourcePath = (issue: Issue): Issue => ({
  ...issue,
  path: issue.path.replace(/^(\/links\/[^/]+)\/components(?=\/|$)/, '$1/shapes'),
});

/**
 * Admit an authored {@link MechanismSource}: replace each link's shape names by canonical
 * component ids, then admit the result as a {@link Mechanism}. Every issue points into the
 * source, so link issues name `/links/<id>/shapes`.
 *
 * @param input - Authored source and the component id of each shape name.
 * @returns The resolved mechanism, `UNKNOWN_COMPONENT` issues, or admission issues of the result.
 * @public
 * @example <caption>Bind shape names to a build's component ids</caption>
 * ```typescript
 * import { resolveMechanismComponents } from '@taucad/kinematics';
 * import type { MechanismSource } from '@taucad/kinematics';
 *
 * const source = {
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { shapes: ['Base'] }, lid: { shapes: ['Lid'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0] } },
 * } satisfies MechanismSource;
 * const outcome = resolveMechanismComponents({ source, componentIds: { Base: 'component-base', Lid: 'component-lid' } });
 * console.log(outcome.status === 'resolved' ? outcome.mechanism.links : outcome.issues);
 * ```
 */
export const resolveMechanismComponents = ({
  source,
  componentIds,
}: ResolveMechanismComponentsInput): ResolveMechanismComponentsOutcome => {
  const authoredLinks = isRecord(source) && isRecord(source['links']) ? source['links'] : {};
  const issues: Issue[] = [];
  const links = Object.fromEntries(
    Object.entries(authoredLinks).map(([linkId, authored]) => {
      const path = pointer('links', linkId);
      if (
        !isRecord(authored) ||
        !Array.isArray(authored['shapes']) ||
        Object.keys(authored).some((key) => key !== 'shapes')
      ) {
        issues.push(
          problem(
            'INVALID_SHAPE',
            path,
            'An authored link must be an object { shapes: string[] } naming returned shapes.',
          ),
        );
        return [linkId, authored];
      }
      const components = (authored['shapes'] as unknown[]).map((name, index) => {
        if (typeof name !== 'string') {
          issues.push(problem('INVALID_SHAPE', `${path}/shapes/${index}`, 'A shape name must be a string.'));
          return name;
        }
        if (!Object.hasOwn(componentIds, name)) {
          issues.push(problem('UNKNOWN_COMPONENT', `${path}/shapes/${index}`, `No returned shape is named "${name}".`));
          return name;
        }
        return componentIds[name];
      });
      return [linkId, { components }];
    }),
  );
  if (issues.length > 0) {
    return { status: 'invalid', issues };
  }
  // Admission reports a missing or malformed top level, or links, at its usual paths.
  const outcome = admitMechanism(isRecord(source) && isRecord(source['links']) ? { ...source, links } : source);
  return outcome.status === 'admitted'
    ? { status: 'resolved', mechanism: outcome.mechanism }
    : { status: 'invalid', issues: outcome.issues.map(toSourcePath) };
};
