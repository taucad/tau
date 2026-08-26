/**
 * Bore-region semantics for a cylindrical-face relationship target.
 *
 * A claim like `containment wristPin.body → bossA.bore` names a *face*, not a
 * solid, and the honest reading of it is the one an engineer means: the pin
 * sits in the BORE. Classifying the pin's samples against the boss's
 * occurrence solid answers the opposite question — the bore is void, so every
 * sample reads `out` and a correctly assembled pin fails.
 *
 * So a cylindrical-face target denotes the **bore region**: the finite
 * cylinder the face bounds (its own radius, its own axial extent). Membership
 * is exact analytic algebra over `faceFacts` — no tessellation can influence
 * it (D3), and no solid classification is involved.
 *
 * Containment of a cylinder in a bore is then two exact comparisons: the
 * subject must FIT (its radius plus the axis-to-axis offset within the bore
 * radius) and it must ENGAGE (its axial extent must overlap the bore's). The
 * second one is what separates `pin-through-boss` (the pin reaches all three
 * bores) from `pin-partial-insertion` (it reaches only the first).
 *
 * @module
 */

import type { Vec3 } from '#mesh/types.js';
import type { ProofEndpoint } from '#proofs/context.js';

/** The finite cylinder a cylindrical face bounds. */
export type BoreRegion = {
  origin: Vec3;
  /** Unit axis direction. */
  direction: Vec3;
  radius: number;
  /** Axial interval, as coordinates along `direction` from the origin. */
  from: number;
  to: number;
};

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalized = (v: Vec3): Vec3 | undefined => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? undefined : [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * The axial interval a bounds box spans along a direction.
 *
 * The interval is read from the face's OWN exact bounds, so a bore's extent is
 * exactly the length of the face the STEP file carries — never an assumption
 * about the part around it.
 */
const axialExtent = (bounds: { min: Vec3; max: Vec3 }, origin: Vec3, direction: Vec3): { from: number; to: number } => {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const along = dot([x - origin[0], y - origin[1], z - origin[2]], direction);
        from = Math.min(from, along);
        to = Math.max(to, along);
      }
    }
  }
  return { from, to };
};

/**
 * Read the bore region a cylindrical-face endpoint denotes.
 *
 * @param endpoint - The relationship endpoint.
 * @returns The bore region, or `undefined` when the endpoint is not a
 * cylindrical face with complete analytic facts.
 * @public
 */
export const boreRegionOf = (endpoint: ProofEndpoint): BoreRegion | undefined => {
  const { facts } = endpoint;
  const direction = facts.axisDirection ? normalized(facts.axisDirection) : undefined;
  if (
    endpoint.face < 0 ||
    facts.surfaceType !== 'cylinder' ||
    !facts.axisOrigin ||
    !direction ||
    facts.radius === undefined ||
    !facts.bounds
  ) {
    return undefined;
  }
  const origin = facts.axisOrigin;
  return { origin, direction, radius: facts.radius, ...axialExtent(facts.bounds, origin, direction) };
};

/** Perpendicular distance from a point to a bore's axis. */
const radialOffset = (bore: BoreRegion, point: Vec3): number => {
  const delta: Vec3 = [point[0] - bore.origin[0], point[1] - bore.origin[1], point[2] - bore.origin[2]];
  const along = dot(delta, bore.direction);
  return Math.hypot(
    delta[0] - along * bore.direction[0],
    delta[1] - along * bore.direction[1],
    delta[2] - along * bore.direction[2],
  );
};

/**
 * Whether a point lies in the bore region: inside the radius, and inside the
 * face's own axial extent.
 *
 * @param bore - The bore region.
 * @param point - Subject-frame point.
 * @returns True when the point is in the bore.
 * @public
 */
export const pointInBore = (bore: BoreRegion, point: Vec3): boolean => {
  const along = dot([point[0] - bore.origin[0], point[1] - bore.origin[1], point[2] - bore.origin[2]], bore.direction);
  return along >= bore.from && along <= bore.to && radialOffset(bore, point) <= bore.radius;
};

/** What an exact cylinder-in-bore comparison measured. */
export type BoreFitMeasurement = {
  /** How much room is left: `bore radius − (subject radius + axis offset)`. */
  clearance: number;
  /** Length of the axial overlap between the subject and the bore (mm). */
  engagement: number;
  /** Axis-to-axis perpendicular offset (mm). */
  offset: number;
  /** Fold of the axis-to-axis angle into [0, 90] degrees. */
  angle: number;
  /** The overlap's midpoint, as a witness. */
  witness: Vec3;
};

/**
 * Compare a cylindrical subject face against a bore region, exactly.
 *
 * @param subject - The subject endpoint; must itself be a cylindrical face.
 * @param bore - The bore region the target denotes.
 * @param angularToleranceDegrees - How far from parallel the two axes may sit
 * before the comparison stops meaning anything.
 * @returns The measurement, or `undefined` when the subject is not an
 * analytic cylinder or the two axes are not parallel.
 * @public
 */
export const measureBoreFit = (
  subject: ProofEndpoint,
  bore: BoreRegion,
  angularToleranceDegrees: number,
): BoreFitMeasurement | undefined => {
  const subjectBore = boreRegionOf(subject);
  if (!subjectBore) {
    return undefined;
  }
  const cosine = Math.min(1, Math.abs(dot(subjectBore.direction, bore.direction)));
  const angle = (Math.acos(cosine) * 180) / Math.PI;
  if (angle > angularToleranceDegrees) {
    return undefined;
  }
  const offset = radialOffset(bore, subjectBore.origin);
  // Re-express the subject's extent in the bore's own axial coordinate: the
  // two axes are parallel, so one projection is enough.
  const base = dot(
    [
      subjectBore.origin[0] - bore.origin[0],
      subjectBore.origin[1] - bore.origin[1],
      subjectBore.origin[2] - bore.origin[2],
    ],
    bore.direction,
  );
  const sign = dot(subjectBore.direction, bore.direction) < 0 ? -1 : 1;
  const ends = [base + sign * subjectBore.from, base + sign * subjectBore.to];
  const low = Math.max(bore.from, Math.min(...ends));
  const high = Math.min(bore.to, Math.max(...ends));
  const middle = (low + high) / 2;
  return {
    clearance: bore.radius - (subjectBore.radius + offset),
    engagement: Math.max(0, high - low),
    offset,
    angle,
    witness: [
      bore.origin[0] + bore.direction[0] * middle,
      bore.origin[1] + bore.direction[1] * middle,
      bore.origin[2] + bore.direction[2] * middle,
    ],
  };
};
