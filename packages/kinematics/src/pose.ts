import type { SpatialMatrix } from '@taucad/spatial';
import type { Plan } from '#mechanism.js';
import { analyzeMechanism, coordinateValue, isFiniteNumber, pointer, problem } from '#mechanism.js';
import type { Animation, EvaluatePoseInput, Issue, Pose, PoseOutcome, SampleAnimationInput } from '#types.js';

// Rigid transforms are 12 floats: a column-major 3×3 rotation followed by a translation.

/** `cos θ`, `sin θ / θ`, `(1 − cos θ) / θ²` and `(θ − sin θ) / θ³` from the last {@link updateCoefficients}. */
export const coefficients = new Float64Array(4);

/**
 * Update {@link coefficients} for a rotation angle.
 *
 * @param angle - Rotation angle in radians, non-negative.
 */
export const updateCoefficients = (angle: number): void => {
  // ponytail: below 1e-8 rad the leading Taylor terms are exact to binary64 and avoid 0/0.
  if (angle < 1e-8) {
    coefficients[0] = 1;
    coefficients[1] = 1;
    coefficients[2] = 0.5;
    coefficients[3] = 1 / 6;
    return;
  }
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  coefficients[0] = cosine;
  coefficients[1] = sine / angle;
  coefficients[2] = (1 - cosine) / (angle * angle);
  coefficients[3] = (angle - sine) / (angle * angle * angle);
};

/**
 * Write `exp([r]×) = cos θ I + (sin θ/θ)[r]× + ((1 − cos θ)/θ²) r rᵀ`, column-major.
 *
 * @param vector - Rotation vector in radians at indices 0–2.
 * @param target - Output array.
 * @param offset - Index of the first output entry.
 */
export const writeRotation = (vector: Float64Array, target: Float64Array, offset: number): void => {
  const x = vector[0]!;
  const y = vector[1]!;
  const z = vector[2]!;
  updateCoefficients(Math.hypot(x, y, z));
  const cosine = coefficients[0]!;
  const sinc = coefficients[1]!;
  const versine = coefficients[2]!;
  target[offset] = cosine + versine * x * x;
  target[offset + 1] = sinc * z + versine * x * y;
  target[offset + 2] = -sinc * y + versine * x * z;
  target[offset + 3] = -sinc * z + versine * x * y;
  target[offset + 4] = cosine + versine * y * y;
  target[offset + 5] = sinc * x + versine * y * z;
  target[offset + 6] = sinc * y + versine * x * z;
  target[offset + 7] = -sinc * x + versine * y * z;
  target[offset + 8] = cosine + versine * z * z;
};

/** Rotation vector (0–2) and displacement (3–5) in internal units from the last {@link writeJointMotion}. */
export const motion = new Float64Array(6);

/** Local rotation (0–8) and translation (9–11) of the joint being composed. */
const local = new Float64Array(12);

/**
 * Write a joint's rotation vector and displacement into {@link motion}.
 *
 * @param plan - Compiled mechanism.
 * @param drivers - Driver values in mechanism units.
 * @param joint - Topological joint index.
 */
export const writeJointMotion = (plan: Plan, drivers: Float64Array, joint: number): void => {
  motion.fill(0);
  const start = plan.jointDofStart[joint]!;
  const end = start + plan.jointDofCount[joint]!;
  for (let dof = start; dof < end; dof += 1) {
    const value = plan.internalScale[dof]! * coordinateValue(plan, drivers, dof);
    for (let axis = 0; axis < 3; axis += 1) {
      motion[axis]! += value * plan.rotationAxis[dof * 3 + axis]!;
      motion[axis + 3]! += value * plan.translationAxis[dof * 3 + axis]!;
    }
  }
};

/**
 * Forward kinematics for baked geometry: `delta(child) = delta(parent) × T(origin) × Motion(q) × T(−origin)`,
 * written as 12 floats per link in topological order.
 *
 * @param plan - Compiled mechanism.
 * @param drivers - Driver values in mechanism units, indexed by degree of freedom (follower slots are ignored).
 * @param transforms - Output, `12 × linkCount` floats.
 */
export const writeTransforms = (plan: Plan, drivers: Float64Array, transforms: Float64Array): void => {
  transforms.fill(0, 0, 12);
  transforms[0] = 1;
  transforms[4] = 1;
  transforms[8] = 1;
  const { jointParent, jointOrigin } = plan;
  const jointCount = jointParent.length;
  for (let joint = 0; joint < jointCount; joint += 1) {
    writeJointMotion(plan, drivers, joint);
    writeRotation(motion, local, 0);
    const parent = jointParent[joint]! * 12;
    const child = (joint + 1) * 12;
    const originX = jointOrigin[joint * 3]!;
    const originY = jointOrigin[joint * 3 + 1]!;
    const originZ = jointOrigin[joint * 3 + 2]!;
    for (let row = 0; row < 3; row += 1) {
      // Local translation: origin + displacement − R × origin.
      local[9 + row] =
        jointOrigin[joint * 3 + row]! +
        motion[3 + row]! -
        (local[row]! * originX + local[3 + row]! * originY + local[6 + row]! * originZ);
    }
    for (let row = 0; row < 3; row += 1) {
      const parentX = transforms[parent + row]!;
      const parentY = transforms[parent + 3 + row]!;
      const parentZ = transforms[parent + 6 + row]!;
      for (let column = 0; column < 4; column += 1) {
        transforms[child + column * 3 + row] =
          parentX * local[column * 3]! + parentY * local[column * 3 + 1]! + parentZ * local[column * 3 + 2]!;
      }
      transforms[child + 9 + row]! += transforms[parent + 9 + row]!;
    }
  }
};

/**
 * Build the public pose from driver values and computed transforms.
 *
 * @param plan - Compiled mechanism.
 * @param drivers - Driver values in mechanism units.
 * @param transforms - Output of {@link writeTransforms}.
 * @returns Column-major link deltas and every degree of freedom's value.
 */
export const toPose = (plan: Plan, drivers: Float64Array, transforms: Float64Array): Pose => {
  const coordinates: Record<string, number> = {};
  for (const [index, dof] of plan.degreesOfFreedom.entries()) {
    coordinates[dof.id] = coordinateValue(plan, drivers, index);
  }
  const linkTransforms: Record<string, SpatialMatrix> = {};
  for (const [index, linkId] of plan.linkIds.entries()) {
    const base = index * 12;
    linkTransforms[linkId] = [
      transforms[base]!,
      transforms[base + 1]!,
      transforms[base + 2]!,
      0,
      transforms[base + 3]!,
      transforms[base + 4]!,
      transforms[base + 5]!,
      0,
      transforms[base + 6]!,
      transforms[base + 7]!,
      transforms[base + 8]!,
      0,
      transforms[base + 9]!,
      transforms[base + 10]!,
      transforms[base + 11]!,
      1,
    ];
  }
  return { linkTransforms, coordinates };
};

/**
 * Validate sparse driver coordinates: known ids, drivers only, finite values.
 *
 * @param plan - Compiled mechanism.
 * @param coordinates - Coordinates to check.
 * @param path - JSON pointer of the coordinates record.
 * @returns Every issue found.
 */
export const checkCoordinates = (plan: Plan, coordinates: Readonly<Record<string, number>>, path: string): Issue[] =>
  Object.entries(coordinates).flatMap(([id, value]) => {
    const index = plan.dofIndex.get(id);
    const at = `${path}${pointer(id)}`;
    if (index === undefined) {
      return [problem('UNKNOWN_DEGREE_OF_FREEDOM', at, `Degree of freedom "${id}" does not exist.`)];
    }
    if (plan.degreesOfFreedom[index]!.role === 'follower') {
      return [problem('DRIVEN_FOLLOWER', at, `"${id}" is a coupling follower; set its driver instead.`)];
    }
    return isFiniteNumber(value)
      ? []
      : [problem('INVALID_VALUE', at, `Coordinate "${id}" must be finite; got ${String(value)}.`)];
  });

/**
 * Driver values in mechanism units: requested coordinates (omitted drivers are zero) clamped to limits.
 *
 * @param plan - Compiled mechanism.
 * @param coordinates - Sparse driver coordinates.
 * @returns Values indexed by degree of freedom; follower slots are zero.
 */
export const clampedDrivers = (plan: Plan, coordinates: Readonly<Record<string, number>>): Float64Array => {
  const drivers = new Float64Array(plan.degreesOfFreedom.length);
  for (const [index, dof] of plan.degreesOfFreedom.entries()) {
    if (dof.role === 'driver') {
      drivers[index] = Math.min(Math.max(coordinates[dof.id] ?? 0, plan.lower[index]!), plan.upper[index]!);
    }
  }
  return drivers;
};

/**
 * Evaluate forward kinematics from the as-built reference for the given driver coordinates.
 * Drivers are clamped to their limits; followers are derived from their couplings in
 * dependency order and are never clamped.
 *
 * @param input - Mechanism and sparse driver coordinates in mechanism units.
 * @returns Link world deltas and resolved coordinates, or issues.
 * @public
 * @example <caption>Pose a hinge</caption>
 * ```typescript
 * import { evaluatePose } from '@taucad/kinematics';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * const mechanism: Mechanism = {
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { components: ['Base'] }, lid: { components: ['Lid'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0] } },
 * };
 * const outcome = evaluatePose({ mechanism, coordinates: { hinge: 45 } });
 * if (outcome.status === 'posed') {
 *   console.log(outcome.pose.linkTransforms['lid']);
 * }
 * ```
 */
export const evaluatePose = ({ mechanism, coordinates }: EvaluatePoseInput): PoseOutcome => {
  const analysis = analyzeMechanism(mechanism);
  if (analysis.status === 'invalid') {
    return analysis;
  }
  const { plan } = analysis;
  const issues = checkCoordinates(plan, coordinates, '/coordinates');
  if (issues.length > 0) {
    return { status: 'invalid', issues };
  }
  const drivers = clampedDrivers(plan, coordinates);
  const atLimit = plan.degreesOfFreedom
    .filter((dof, index) => {
      const value = dof.role === 'driver' ? (coordinates[dof.id] ?? 0) : coordinateValue(plan, drivers, index);
      return value < plan.lower[index]! || value > plan.upper[index]!;
    })
    .map((dof) => dof.id);
  const transforms = new Float64Array(plan.linkIds.length * 12);
  writeTransforms(plan, drivers, transforms);
  return { status: 'posed', pose: toPose(plan, drivers, transforms), atLimit };
};

const loopTime = ({ duration, loop }: Animation, time: number): number => {
  switch (loop ?? 'none') {
    case 'none': {
      return time;
    }
    case 'repeat': {
      return ((time % duration) + duration) % duration;
    }
    case 'pingPong': {
      const roundTrip = 2 * duration;
      const phase = ((time % roundTrip) + roundTrip) % roundTrip;
      return phase > duration ? roundTrip - phase : phase;
    }
  }
};

/**
 * Sample an animation's driver coordinates at a time, honouring its loop mode. Each
 * coordinate interpolates linearly between the keyframes that set it and holds outside them.
 * Take the animation from an admitted mechanism, which guarantees sorted keyframes, a
 * positive duration and known driver ids.
 *
 * @param input - Animation and time in seconds.
 * @returns Driver coordinates in mechanism units for every coordinate the keyframes set.
 * @public
 * @example <caption>Pose a clip at half a second</caption>
 * ```typescript
 * import { evaluatePose, sampleAnimation } from '@taucad/kinematics';
 * import type { Mechanism } from '@taucad/kinematics';
 *
 * const mechanism: Mechanism = {
 *   schemaVersion: 1,
 *   units: { length: 'mm', angle: 'deg' },
 *   root: 'base',
 *   links: { base: { components: ['Base'] }, lid: { components: ['Lid'] } },
 *   joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0, 10], axis: [1, 0, 0] } },
 *   animations: [
 *     {
 *       id: 'open',
 *       duration: 2,
 *       loop: 'pingPong',
 *       keyframes: [
 *         { time: 0, coordinates: { hinge: 0 } },
 *         { time: 2, coordinates: { hinge: 90 } },
 *       ],
 *     },
 *   ],
 * };
 * for (const animation of mechanism.animations ?? []) {
 *   const coordinates = sampleAnimation({ animation, time: 0.5 });
 *   console.log(coordinates, evaluatePose({ mechanism, coordinates }).status);
 * }
 * ```
 */
export const sampleAnimation = ({ animation, time }: SampleAnimationInput): Readonly<Record<string, number>> => {
  const local = loopTime(animation, time);
  const coordinates: Record<string, number> = {};
  const ids = new Set(animation.keyframes.flatMap((keyframe) => Object.keys(keyframe.coordinates)));
  for (const id of ids) {
    const track = animation.keyframes.flatMap((keyframe) => {
      const value = keyframe.coordinates[id];
      return value === undefined ? [] : [{ time: keyframe.time, value }];
    });
    const next = track.findIndex((keyframe) => keyframe.time > local);
    const after = track[next];
    const before = track[next - 1];
    coordinates[id] =
      after === undefined || before === undefined
        ? (after ?? track.at(-1)!).value
        : before.value + ((after.value - before.value) * (local - before.time)) / (after.time - before.time);
  }
  return coordinates;
};
