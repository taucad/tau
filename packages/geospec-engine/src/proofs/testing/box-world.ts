/**
 * A synthetic native proof surface over axis-aligned boxes.
 *
 * The proof engine's branch table — refusals, gate legs, seating states,
 * classification outcomes — is far wider than any STEP fixture exercises, and
 * a fixture answers in tens of milliseconds of wasm. A box world answers the
 * same four embind methods exactly, in microseconds, with geometry the test
 * states in one line.
 *
 * @module
 */

import type { RelationshipProofNative } from '#proofs/native-evidence.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import type { GeometryFacts, GeometrySelection, ResolvedEntity } from '#selector/types.js';
import type { Vec3 } from '#mesh/types.js';

/** One axis-aligned solid in the world. */
export type Box = { min: Vec3; max: Vec3 };

const surfaceEpsilon = 1e-9;

const state = (box: Box, point: Vec3): 'in' | 'on' | 'out' => {
  let onBoundary = false;
  for (let axis = 0; axis < 3; axis++) {
    const value = point[axis]!;
    if (value < box.min[axis]! - surfaceEpsilon || value > box.max[axis]! + surfaceEpsilon) {
      return 'out';
    }
    onBoundary ||=
      Math.abs(value - box.min[axis]!) <= surfaceEpsilon || Math.abs(value - box.max[axis]!) <= surfaceEpsilon;
  }
  return onBoundary ? 'on' : 'in';
};

const axisGap = (a: Box, b: Box, axis: number): number =>
  Math.max(a.min[axis]! - b.max[axis]!, b.min[axis]! - a.max[axis]!, 0);

/**
 * Build the native surface for a set of boxes.
 *
 * @param boxes - The world, indexed by occurrence.
 * @param options - `fail` makes every method answer the kernel's error shape;
 * `failExtrema` refuses only the distance measurement.
 * @returns The four-method native surface plus a per-method call counter.
 * @public
 */
export const boxWorld = (
  boxes: Box[],
  options?: { fail?: boolean; failExtrema?: boolean },
): RelationshipProofNative & { calls: { extrema: number; classifyPoints: number; commonVolume: number } } => {
  const calls = { extrema: 0, classifyPoints: 0, commonVolume: 0 };
  const error = '{"error":"box world refused"}';
  return {
    calls,
    faceFacts: () => '{"faces":[]}',
    extrema: (occurrenceA, _faceA, occurrenceB) => {
      calls.extrema += 1;
      if (options?.fail === true || options?.failExtrema === true) {
        return error;
      }
      const a = boxes[occurrenceA]!;
      const b = boxes[occurrenceB]!;
      const gaps = [axisGap(a, b, 0), axisGap(a, b, 1), axisGap(a, b, 2)];
      return JSON.stringify({
        distance: Math.hypot(...gaps),
        pointA: [a.max[0], a.max[1], a.max[2]],
        pointB: [b.min[0], b.min[1], b.min[2]],
      });
    },
    classifyPoints: (occurrence, pointsJson) => {
      calls.classifyPoints += 1;
      if (options?.fail) {
        return error;
      }
      const points = JSON.parse(pointsJson) as Vec3[];
      return JSON.stringify({ states: points.map((point) => state(boxes[occurrence]!, point)) });
    },
    commonVolume: (occurrenceA, occurrenceB) => {
      calls.commonVolume += 1;
      if (options?.fail) {
        return error;
      }
      const a = boxes[occurrenceA]!;
      const b = boxes[occurrenceB]!;
      let volume = 1;
      const middles: number[] = [];
      for (let axis = 0; axis < 3; axis++) {
        const low = Math.max(a.min[axis]!, b.min[axis]!);
        const high = Math.min(a.max[axis]!, b.max[axis]!);
        volume *= Math.max(high - low, 0);
        middles.push((low + high) / 2);
      }
      const centroid: Vec3 = [middles[0]!, middles[1]!, middles[2]!];
      return JSON.stringify({ volume, centroid });
    },
  };
};

/**
 * Build a proof context over a box world.
 *
 * @param boxes - The world, indexed by occurrence.
 * @param overrides - Context members to replace.
 * @returns The context.
 * @public
 */
export const boxContext = (boxes: Box[], overrides?: Partial<RelationshipProofContext>): RelationshipProofContext => ({
  index: { occurrences: [], faces: [], bodies: [], interfaces: [], datums: [], groups: [], diagnostics: [] },
  occurrenceIndexByPath: new Map(boxes.map((_unused, position) => [`box${position}`, position])),
  tolerances: { linearMm: 0.02, angularToleranceDegrees: 0.5 },
  native: boxWorld(boxes),
  ...overrides,
});

/**
 * Build a resolved selection over one occurrence of a box world.
 *
 * @param occurrence - Occurrence index (its path is `box<index>`).
 * @param facts - Facts the entity carries.
 * @param overrides - Selection members to replace.
 * @returns The selection.
 * @public
 */
export const boxSelection = (
  occurrence: number,
  facts: GeometryFacts,
  overrides?: Partial<GeometrySelection>,
): GeometrySelection => {
  const entity: ResolvedEntity = {
    id: `entity:${occurrence}`,
    entityType: facts.faceIndex === undefined ? 'occurrence' : 'face',
    occurrencePath: `box${occurrence}`,
    facts,
  };
  return {
    selector: { kind: 'occurrence', name: `box${occurrence}` },
    status: 'resolved',
    entities: [entity],
    expected: 'one',
    source: 'step-xde',
    stability: 'authored',
    diagnostics: [],
    ...overrides,
  };
};

/**
 * Facts for a whole box: its exact bounds and centre.
 *
 * @param box - The box.
 * @returns The facts.
 * @public
 */
export const boxFacts = (box: Box): GeometryFacts => ({
  bounds: box,
  centroid: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2],
});
