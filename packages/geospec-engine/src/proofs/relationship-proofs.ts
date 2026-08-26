/**
 * L4 relationship proofs (SB4) — the engine half.
 *
 * Every verdict is decided by exact BRep evidence (D3): OCCT extrema for
 * contact/clearance, analytic comparison of SB3 face facts for
 * coaxial/coplanar/direction-angle, exact solid classification for
 * containment/insertion, and the exact boolean common volume for interference.
 * The AABB broad phase is *recorded* on every verdict and *decides* none of
 * them.
 *
 * No tessellation parameter reaches an analytic verdict: coaxial, coplanar and
 * direction-angle read `faceFacts` only, which the kernel pins to the analytic
 * (never triangulated) surface.
 *
 * @module
 */

import { boreRegionOf, measureBoreFit, pointInBore } from '#proofs/bore-region.js';
import type { BoreRegion } from '#proofs/bore-region.js';
import { classifyPoints, commonVolume, measureExtrema } from '#proofs/native-evidence.js';
import { selectorLabel } from '#proofs/context.js';
import type {
  ProofEndpoint as Endpoint,
  RelationshipProofContext as ProofContext,
  RelationshipProofInput as ProofInput,
} from '#proofs/context.js';
import type {
  RelationshipBroadPhase,
  RelationshipEvidence,
  RelationshipFinalEvidence,
  RelationshipWitness,
} from '#proofs/types.js';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeometryFacts, GeometrySelection } from '#selector/types.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';

/** Re-published for the proof surface: {@link ProofContext}. @public */
export type RelationshipProofContext = ProofContext;
/** Re-published for the proof surface: {@link ProofInput}. @public */
export type RelationshipProofInput = ProofInput;
/** Re-published for the proof surface: {@link Endpoint}. @public */
export type ProofEndpoint = Endpoint;

/** The diagnostic code every failed relationship verdict carries. */
export const relationshipMismatchCode = 'GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH';

/** The diagnostic code an endpoint the evidence policy refuses carries. */
export const unsupportedEvidenceCode = 'GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE';

type Bounds = { min: Vec3; max: Vec3 };

const label = (expectation: GeoSpecSpatialRelationshipExpectation, role: 'subject' | 'target'): string =>
  selectorLabel(role === 'subject' ? expectation.subject : expectation.target);

const unsupported = (message: string, suggestion: string, details?: unknown): RelationshipEvidence => ({
  verdict: 'unsupported',
  diagnostics: [
    { code: unsupportedEvidenceCode, severity: 'error', message, suggestion, ...(details ? { details } : {}) },
  ],
});

/**
 * Resolve one selection to exact proof operands.
 *
 * @param selection - The resolved selection.
 * @param context - The proof context.
 * @param role - Which endpoint this is, for the diagnostic.
 * @returns The operands, or the refusal evidence.
 * @public
 */
export const resolveEndpoints = (
  selection: GeometrySelection,
  context: RelationshipProofContext,
  role: 'subject' | 'target',
): { endpoints: ProofEndpoint[] } | { refusal: RelationshipEvidence } => {
  if (selection.stability === 'explicit' || selection.source === 'explicit') {
    return {
      refusal: unsupported(
        `The GeoSpec evidence policy rejects the explicit ${role} fixture: a production relationship must resolve against authored or derived geometry evidence, never a hand-supplied frame.`,
        'Replace the explicit axis/plane fixture with an authored interface, a face query, or a datum selector.',
        { role, stability: selection.stability },
      ),
    };
  }
  if (selection.status !== 'resolved') {
    return {
      refusal: unsupported(
        `The relationship ${role} did not resolve (status '${selection.status}').`,
        'Repair the selector using the resolution diagnostics before asserting a relationship over it.',
        { role, status: selection.status },
      ),
    };
  }
  const endpoints: ProofEndpoint[] = [];
  for (const entity of selection.entities) {
    const occurrence =
      entity.occurrencePath === undefined ? undefined : context.occurrenceIndexByPath.get(entity.occurrencePath);
    if (occurrence === undefined) {
      return {
        refusal: unsupported(
          `The relationship ${role} resolved to '${entity.id}', which carries no occurrence this subject's STEP-XDE structure knows.`,
          'Re-export the artifact so occurrence paths and selector evidence come from the same STEP graph.',
          { role, entity: entity.id },
        ),
      };
    }
    endpoints.push({ occurrence, face: entity.facts.faceIndex ?? -1, facts: entity.facts });
  }
  if (endpoints.length === 0) {
    return {
      refusal: unsupported(
        `The relationship ${role} resolved to no entities.`,
        'Widen the selector or lower its cardinality expectation.',
        { role },
      ),
    };
  }
  return { endpoints };
};

const unionBounds = (endpoints: readonly ProofEndpoint[]): Bounds | undefined => {
  let union: Bounds | undefined;
  for (const endpoint of endpoints) {
    const { bounds } = endpoint.facts;
    if (!bounds) {
      continue;
    }
    union = union
      ? {
          min: [
            Math.min(union.min[0], bounds.min[0]),
            Math.min(union.min[1], bounds.min[1]),
            Math.min(union.min[2], bounds.min[2]),
          ],
          max: [
            Math.max(union.max[0], bounds.max[0]),
            Math.max(union.max[1], bounds.max[1]),
            Math.max(union.max[2], bounds.max[2]),
          ],
        }
      : { min: [...bounds.min] as Vec3, max: [...bounds.max] as Vec3 };
  }
  return union;
};

/**
 * The labelled AABB broad-phase record.
 *
 * Recorded on every verdict and decisive on none of them (D3): it names the
 * gap between the two endpoints' bounds and whether that gap clears the
 * claim's own margin.
 *
 * @param subject - Subject endpoints.
 * @param target - Target endpoints.
 * @param margin - The claim's margin in millimetres.
 * @returns The broad-phase record.
 * @public
 */
export const broadPhase = (
  subject: readonly ProofEndpoint[],
  target: readonly ProofEndpoint[],
  margin: number,
): RelationshipBroadPhase => {
  const a = unionBounds(subject);
  const b = unionBounds(target);
  if (!a || !b) {
    return { method: 'aabb', candidate: true, detail: 'no bounds on one endpoint; every pair stays a candidate' };
  }
  let gap = 0;
  for (let axis = 0; axis < 3; axis++) {
    gap = Math.max(gap, a.min[axis]! - b.max[axis]!, b.min[axis]! - a.max[axis]!);
  }
  return {
    method: 'aabb',
    candidate: gap <= margin,
    detail: `bounds gap ${gap.toFixed(4)} mm against a ${margin.toFixed(4)} mm margin`,
  };
};

const pointWitness = (value: Vec3): RelationshipWitness => ({
  kind: 'point',
  value: [...value],
});

const midpoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Build the mismatch diagnostic every failed verdict carries.
 *
 * @param message - What failed, in millimetres/degrees.
 * @param suggestion - The repair.
 * @param center - Where it failed, when the proof produced a witness.
 * @returns The diagnostic.
 * @public
 */
export const mismatchDiagnostic = (message: string, suggestion: string, center?: Vec3): GeometryDiagnostic => ({
  code: relationshipMismatchCode,
  severity: 'error',
  message,
  suggestion,
  ...(center ? { spatial: { center: [...center] as Vec3 } } : {}),
});

const evidence = (options: {
  verdict: 'pass' | 'fail';
  final: RelationshipFinalEvidence;
  broadPhase: RelationshipBroadPhase;
  diagnostic?: GeometryDiagnostic;
}): RelationshipEvidence => ({
  verdict: options.verdict,
  broadPhase: options.broadPhase,
  final: options.final,
  diagnostics: options.diagnostic ? [options.diagnostic] : [],
});

const extremaFailure = (role: string): RelationshipEvidence =>
  unsupported(
    `The exact OCCT extrema computation for ${role} did not converge.`,
    'Repair or re-export the geometry: an exact minimum-distance proof needs valid BRep faces on both endpoints.',
  );

/**
 * Minimum exact distance over every subject/target operand pair.
 *
 * @param context - The proof context.
 * @param subject - Subject endpoints.
 * @param target - Target endpoints.
 * @returns The minimising measurement, or `undefined` when every crossing
 * failed.
 * @public
 */
export const nearestExtrema = (
  context: RelationshipProofContext,
  subject: readonly ProofEndpoint[],
  target: readonly ProofEndpoint[],
): { distance: number; pointA: Vec3; pointB: Vec3 } | undefined => {
  let best: { distance: number; pointA: Vec3; pointB: Vec3 } | undefined;
  for (const a of subject) {
    for (const b of target) {
      const measured = measureExtrema({
        native: context.native,
        ...(context.subjectContentHash === undefined ? {} : { contentHash: context.subjectContentHash }),
        ...(context.forensic === undefined ? {} : { forensic: context.forensic }),
        a,
        b,
      });
      if (measured && (best === undefined || measured.distance < best.distance)) {
        best = measured;
      }
    }
  }
  return best;
};

const linearTolerance = (input: RelationshipProofInput): number =>
  input.expectation.tolerance ?? input.context.tolerances.linearMm;

const angularTolerance = (input: RelationshipProofInput): number =>
  input.expectation.angularToleranceDegrees ?? input.context.tolerances.angularToleranceDegrees;

const unit = (value: Vec3): Vec3 => {
  const length = Math.hypot(...value);
  return length === 0 ? [0, 0, 0] : [value[0] / length, value[1] / length, value[2] / length];
};

/** Reject a planar face pair that cannot seat across a non-degenerate face. */
const planarContactSeatingFailure = (options: {
  input: RelationshipProofInput;
  subject: readonly ProofEndpoint[];
  target: readonly ProofEndpoint[];
  record: RelationshipBroadPhase;
  tolerance: number;
}): RelationshipEvidence | undefined => {
  const { input, subject, target, record, tolerance } = options;
  if (subject.length !== 1 || target.length !== 1) {
    return undefined;
  }
  const a = subject[0]!.facts;
  const b = target[0]!.facts;
  if (a.surfaceType !== 'plane' || b.surfaceType !== 'plane' || !a.normal || !b.normal) {
    return undefined;
  }
  if (!a.centroid || !a.bounds || !a.area || a.area <= 0 || b.offset === undefined) {
    return unsupported(
      'A planar face contact needs a positive-area subject face with analytic centroid, bounds, normal and target-plane offset.',
      'Re-export the STEP artifact with complete analytic face facts before asserting face contact.',
    );
  }
  const subjectNormal = unit(a.normal);
  const targetNormal = unit(b.normal);
  const cosine = Math.max(-1, Math.min(1, dot(subjectNormal, targetNormal)));
  const normalAngle = (Math.acos(-cosine) * 180) / Math.PI;
  const tangent = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const radius = Math.max(
    ...boundsCorners(a.bounds).map((corner) =>
      Math.hypot(corner[0] - a.centroid![0], corner[1] - a.centroid![1], corner[2] - a.centroid![2]),
    ),
  );
  const centroidSeparation = Math.abs(dot(targetNormal, a.centroid) - b.offset);
  const maxSeparationBound = centroidSeparation + radius * tangent;
  const angular = angularTolerance(input);
  // An aligned uniform stand-off keeps the exact-extrema evidence path. A
  // tilted face never escapes merely because its centroid is far from the
  // target plane: that is the edge-only-contact false positive this guard owns.
  if (normalAngle <= angular && (centroidSeparation > tolerance || maxSeparationBound <= tolerance)) {
    return undefined;
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final: {
      method: 'analytic',
      measured: { distance: centroidSeparation, maxSeparationBound, normalAngle, faceArea: a.area },
      expected: { tolerance, angularToleranceDegrees: angular },
      witnesses: [
        { kind: 'plane', value: [...subjectNormal, a.offset ?? dot(subjectNormal, a.centroid)] },
        { kind: 'plane', value: [...targetNormal, b.offset] },
      ],
    },
    diagnostic: mismatchDiagnostic(
      `Planar contact between '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' has ${normalAngle.toFixed(4)}° normal-opposition error and a ${maxSeparationBound.toFixed(4)} mm full-face separation bound, outside the ${angular}° / ${tolerance} mm seating band.`,
      'Align the face normals and seat the full interface; a single near-zero edge witness is not face contact.',
      a.centroid,
    ),
  });
};

/**
 * Prove a contact claim.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveContact = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const { subject, target } = operands;
  const tolerance = linearTolerance(input);
  const record = broadPhase(subject, target, tolerance);
  const seatingFailure = planarContactSeatingFailure({ input, subject, target, record, tolerance });
  if (seatingFailure) {
    return seatingFailure;
  }
  const measured = nearestExtrema(input.context, subject, target);
  if (!measured) {
    return extremaFailure('contact');
  }
  const witnesses = [pointWitness(measured.pointA), pointWitness(measured.pointB)];
  const final: RelationshipFinalEvidence = {
    method: 'extrema',
    measured: { distance: measured.distance },
    expected: { tolerance },
    witnesses,
  };
  if (measured.distance <= tolerance) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `Contact between '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' measured ${measured.distance.toFixed(4)} mm, over the ${tolerance} mm tolerance.`,
      'Close the joint, or widen the contact tolerance if the stand-off is intended.',
      midpoint(measured.pointA, measured.pointB),
    ),
  });
};

/**
 * Prove a clearance claim.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveClearance = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const { subject, target } = operands;
  const { expectation } = input;
  const band = expectation.tolerance ?? 0;
  const minimum = expectation.min ?? Number.NEGATIVE_INFINITY;
  const maximum = expectation.max ?? Number.POSITIVE_INFINITY;
  const low = minimum - band;
  const high = maximum + band;
  const record = broadPhase(subject, target, Number.isFinite(high) ? high : linearTolerance(input));
  const expected: Record<string, number> = {
    ...(expectation.min === undefined ? {} : { min: expectation.min }),
    ...(expectation.max === undefined ? {} : { max: expectation.max }),
    ...(expectation.tolerance === undefined ? {} : { tolerance: expectation.tolerance }),
  };

  const measured = nearestExtrema(input.context, subject, target);
  if (!measured) {
    return extremaFailure('clearance');
  }
  const final: RelationshipFinalEvidence = {
    method: 'extrema',
    measured: { distance: measured.distance },
    expected,
    witnesses: [pointWitness(measured.pointA), pointWitness(measured.pointB)],
  };
  if (measured.distance >= low && measured.distance <= high) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return clearanceFailure({
    input,
    record,
    expected,
    witness: [measured.pointA, measured.pointB],
    direction: measured.distance < low ? 'too tight' : 'too loose',
    final,
  });
};

const clearanceFailure = (options: {
  input: RelationshipProofInput;
  record: RelationshipBroadPhase;
  expected: Record<string, number>;
  witness: [Vec3, Vec3];
  direction: 'too tight' | 'too loose';
  final: RelationshipFinalEvidence;
}): RelationshipEvidence => {
  const { input, direction, witness } = options;
  return evidence({
    verdict: 'fail',
    broadPhase: options.record,
    final: options.final,
    diagnostic: mismatchDiagnostic(
      `Clearance between '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' is ${direction} for the declared band ${JSON.stringify(options.expected)}.`,
      direction === 'too tight'
        ? 'Open the fit, or lower the declared minimum if the tighter clearance is intended.'
        : 'Close the fit, or raise the declared maximum if the looser clearance is intended.',
      midpoint(witness[0], witness[1]),
    ),
  });
};

/**
 * The rotation axis of an endpoint.
 *
 * A cylindrical/conical face carries `axisOrigin`/`axisDirection`; an authored
 * axis interface or a datum carries the same line as its frame `origin`/`zAxis`.
 * Both are analytic evidence for a rotation axis, so requiring the face spelling
 * alone silently downgraded every datum-endpoint coaxial claim to
 * "unsupported evidence".
 */
const axisOf = (facts: GeometryFacts): { origin: Vec3; direction: Vec3 } | undefined => {
  const origin = facts.axisOrigin ?? facts.origin;
  const direction = facts.axisDirection ?? facts.zAxis;
  return origin && direction ? { origin, direction } : undefined;
};

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Angle between two directions in degrees, folded into `[0, 90]`.
 *
 * Orientation-insensitive: a reversed normal is the same geometry.
 *
 * @param a - First direction.
 * @param b - Second direction.
 * @returns The folded angle in degrees.
 * @public
 */
export const foldedAngleDegrees = (a: Vec3, b: Vec3): number => {
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  const cosine = lengths === 0 ? 1 : Math.min(1, Math.abs(dot(a, b)) / lengths);
  return (Math.acos(cosine) * 180) / Math.PI;
};

/**
 * Prove a coaxiality (or concentricity) claim.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveCoaxial = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const a = axisOf(operands.subject[0]!.facts);
  const b = axisOf(operands.target[0]!.facts);
  if (!a || !b) {
    return unsupported(
      'A coaxial claim needs an analytic rotation axis on both endpoints.',
      'Select cylindrical or conical faces (or axis interfaces); planar and freeform faces carry no axis.',
    );
  }
  const tolerance = linearTolerance(input);
  const angular = angularTolerance(input);
  const angle = foldedAngleDegrees(a.direction, b.direction);
  const offset: Vec3 = [b.origin[0] - a.origin[0], b.origin[1] - a.origin[1], b.origin[2] - a.origin[2]];
  const along = dot(offset, a.direction) / (dot(a.direction, a.direction) || 1);
  const radialOffset = Math.hypot(
    offset[0] - along * a.direction[0],
    offset[1] - along * a.direction[1],
    offset[2] - along * a.direction[2],
  );
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { radialOffset, angle },
    expected: { tolerance, angularToleranceDegrees: angular },
    witnesses: [
      { kind: 'axis', value: [...a.origin, ...a.direction] },
      { kind: 'axis', value: [...b.origin, ...b.direction] },
    ],
  };
  const record = broadPhase(operands.subject, operands.target, tolerance);
  if (radialOffset <= tolerance && angle <= angular) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `Axes of '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' are ${radialOffset.toFixed(4)} mm apart at ${angle.toFixed(4)}°, outside the ${tolerance} mm / ${angular}° coaxiality band.`,
      'Re-locate the mating feature, or widen the coaxiality tolerance if the offset is intended.',
      a.origin,
    ),
  });
};

/**
 * Prove a coplanarity claim.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveCoplanar = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const a = operands.subject[0]!.facts;
  const b = operands.target[0]!.facts;
  if (!a.normal || !b.normal || a.offset === undefined || b.offset === undefined) {
    return unsupported(
      'A coplanar claim needs an analytic plane on both endpoints.',
      'Select planar faces or plane interfaces; curved and freeform faces carry no plane.',
    );
  }
  const tolerance = linearTolerance(input);
  const angular = angularTolerance(input);
  const angle = foldedAngleDegrees(a.normal, b.normal);
  // Opposed normals describe the same plane, so compare the offsets in the
  // subject plane's own orientation.
  const opposed = dot(a.normal, b.normal) < 0;
  const offsetDelta = Math.abs(a.offset - (opposed ? -b.offset : b.offset));
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { angle, offsetDelta },
    expected: { tolerance, angularToleranceDegrees: angular },
    witnesses: [
      { kind: 'plane', value: [...a.normal, a.offset] },
      { kind: 'plane', value: [...b.normal, b.offset] },
    ],
  };
  const record = broadPhase(operands.subject, operands.target, tolerance);
  if (angle <= angular && offsetDelta <= tolerance) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `Planes of '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' differ by ${angle.toFixed(4)}° and ${offsetDelta.toFixed(4)} mm, outside the ${angular}° / ${tolerance} mm coplanarity band.`,
      'Align the faces, or widen the coplanarity tolerance if the step is intended.',
      a.centroid,
    ),
  });
};

// Axis before normal: an endpoint carrying both is an axis-bearing surface, and
// its rotation axis is the direction the claim is about.
const directionOf = (facts: GeometryFacts): Vec3 | undefined => facts.axisDirection ?? facts.normal ?? facts.zAxis;

/**
 * Prove a direction-angle claim (`parallel`, `perpendicular`, `angle`).
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveDirectionAngle = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const a = directionOf(operands.subject[0]!.facts);
  const b = directionOf(operands.target[0]!.facts);
  if (!a || !b) {
    return unsupported(
      'An angular claim needs an analytic direction (plane normal, rotation axis or datum frame) on both endpoints.',
      'Select analytic faces, axis interfaces or datums for both endpoints.',
    );
  }
  const angular = angularTolerance(input);
  const expectedAngle = input.expectation.kind === 'perpendicular' ? 90 : (input.expectation.angleDegrees ?? 0);
  const angle = foldedAngleDegrees(a, b);
  const deviation = Math.abs(angle - expectedAngle);
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { angle, deviation },
    expected: { angleDegrees: expectedAngle, angularToleranceDegrees: angular },
    witnesses: [
      { kind: 'axis', value: [0, 0, 0, ...a] },
      { kind: 'axis', value: [0, 0, 0, ...b] },
    ],
  };
  const record = broadPhase(operands.subject, operands.target, input.context.tolerances.linearMm);
  if (deviation <= angular) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `Directions of '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' meet at ${angle.toFixed(4)}°, ${deviation.toFixed(4)}° from the declared ${expectedAngle}°.`,
      'Re-orient the feature, or widen the angular tolerance if the deviation is intended.',
    ),
  });
};

const boundsCorners = (bounds: Bounds): Vec3[] => {
  const corners: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        corners.push([x, y, z]);
      }
    }
  }
  return corners;
};

/**
 * The nine containment samples of one endpoint: the analytic centroid plus the
 * eight corners of its exact bounds.
 *
 * A planar face's bounds are flat along its normal, so every corner lies on the
 * face's own plane — the samples are analytic, never tessellated (D3).
 *
 * @param endpoint - The endpoint to sample.
 * @param context - The proof context, for the occurrence's face rows.
 * @returns The sample points, in deterministic order.
 * @public
 */
export const containmentSamples = (endpoint: ProofEndpoint, context: RelationshipProofContext): Vec3[] => {
  const { facts } = endpoint;
  if (endpoint.face >= 0) {
    const { centroid } = facts;
    if (!centroid || !facts.bounds) {
      return centroid ? [centroid] : [];
    }
    const corners = boundsCorners(facts.bounds).map((corner) => inset(corner, centroid));
    return [
      centroid,
      ...(facts.normal && facts.offset !== undefined
        ? corners.map((corner) => onPlane(corner, facts.normal!, facts.offset!))
        : corners),
    ];
  }
  const samples: Vec3[] = [];
  for (const row of context.index.faces) {
    if (context.occurrenceIndexByPath.get(row.occurrencePath) === endpoint.occurrence) {
      samples.push(row.facts.centroid);
    }
  }
  const { bounds } = facts;
  if (!bounds) {
    return samples;
  }
  const centre: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return [...samples, ...boundsCorners(bounds).map((corner) => inset(corner, centre))];
};

/**
 * Exact bounds are reported with a 1e-7 pad, so a raw corner sits *outside* the
 * geometry it belongs to. Pulling it a thousandth of the way to the centre puts
 * it back inside without leaving the feature.
 */
const boundsInsetFraction = 1e-3;

const inset = (corner: Vec3, centre: Vec3): Vec3 => [
  centre[0] + (corner[0] - centre[0]) * (1 - boundsInsetFraction),
  centre[1] + (corner[1] - centre[1]) * (1 - boundsInsetFraction),
  centre[2] + (corner[2] - centre[2]) * (1 - boundsInsetFraction),
];

/** Drop a point onto a face's analytic plane, cancelling the bounds pad exactly. */
const onPlane = (point: Vec3, normal: Vec3, offset: number): Vec3 => {
  const residual = dot(point, normal) - offset;
  return [point[0] - residual * normal[0], point[1] - residual * normal[1], point[2] - residual * normal[2]];
};

/**
 * Containment against a bore region: exact analytic fit plus engagement.
 *
 * @param options - The claim, the subject operands, the bore and the recorded
 * broad phase.
 * @returns The verdict.
 */
const containmentInBore = (options: {
  input: RelationshipProofInput;
  subject: readonly ProofEndpoint[];
  bore: BoreRegion;
  broadPhase: RelationshipBroadPhase;
}): RelationshipEvidence => {
  const { input, subject, bore } = options;
  if (subject.length !== 1) {
    return unsupported(
      'A bore-region containment claim needs exactly one subject operand.',
      'Select a single cylindrical face (or assert one relationship per face).',
    );
  }
  const fit = measureBoreFit(subject[0]!, bore, input.context.tolerances.angularToleranceDegrees);
  if (!fit) {
    return unsupported(
      `Containment in the bore '${label(input.expectation, 'target')}' needs a coaxial analytic cylinder on the subject: exact bore membership is radius-and-extent algebra, and neither a non-cylindrical face nor a skewed axis has one.`,
      'Select a cylindrical subject face aligned with the bore, or assert containment against the occurrence solid instead.',
    );
  }
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { clearance: fit.clearance, engagement: fit.engagement, radialOffset: fit.offset, angle: fit.angle },
    expected: { clearance: 0, engagement: 0 },
    witnesses: [pointWitness(fit.witness)],
  };
  if (fit.clearance >= 0 && fit.engagement > 0) {
    return evidence({ verdict: 'pass', broadPhase: options.broadPhase, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: options.broadPhase,
    final,
    diagnostic: mismatchDiagnostic(
      fit.engagement > 0
        ? `'${label(input.expectation, 'subject')}' does not fit the bore '${label(input.expectation, 'target')}': it overruns the bore radius by ${(-fit.clearance).toFixed(4)} mm.`
        : `'${label(input.expectation, 'subject')}' never enters the bore '${label(input.expectation, 'target')}': the two axial extents do not overlap.`,
      'Re-position the part along the bore axis, or assert the relationship against the bore the part actually engages.',
      fit.witness,
    ),
  });
};

/**
 * Prove a containment claim by exact solid classification.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveContainment = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const { subject, target } = operands;
  const record = broadPhase(subject, target, input.context.tolerances.linearMm);
  const bore = target.length === 1 ? boreRegionOf(target[0]!) : undefined;
  if (bore) {
    return containmentInBore({ input, subject, bore, broadPhase: record });
  }
  const points = subject.flatMap((endpoint) => containmentSamples(endpoint, input.context));
  if (points.length === 0) {
    return unsupported(
      'A containment claim needs analytic sample points on the subject.',
      'Select an occurrence, body or analytic face whose exact bounds and centroid are known.',
    );
  }
  let bestInside = -1;
  let outsideWitness: Vec3 | undefined;
  for (const endpoint of target) {
    const classified = classifyPoints({
      native: input.context.native,
      ...(input.context.subjectContentHash === undefined ? {} : { contentHash: input.context.subjectContentHash }),
      ...(input.context.forensic === undefined ? {} : { forensic: input.context.forensic }),
      occurrence: endpoint.occurrence,
      points,
    });
    if (!classified) {
      return unsupported(
        'The exact point classification against the containment target failed.',
        'Repair or re-export the geometry: containment needs a valid closed solid on the target.',
      );
    }
    let localInside = 0;
    let localWitness: Vec3 | undefined;
    for (const [position, state] of classified.states.entries()) {
      if (state === 'out') {
        localWitness ??= points[position];
      } else {
        localInside += 1;
      }
    }
    // A multi-entity target contains the subject when ANY of its solids does.
    if (localInside > bestInside) {
      bestInside = localInside;
      outsideWitness = localWitness;
    }
  }
  const inside = bestInside;
  const outside = points.length - inside;
  const final: RelationshipFinalEvidence = {
    method: 'classification',
    measured: { inside, outside, samples: points.length },
    expected: { outside: 0 },
    witnesses: outsideWitness ? [pointWitness(outsideWitness)] : [],
  };
  if (outside === 0) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `'${label(input.expectation, 'subject')}' is not contained by '${label(input.expectation, 'target')}': ${outside} of ${points.length} exact samples classified outside.`,
      'Re-position the part, or assert a clearance/insertion relationship if partial engagement is intended.',
      outsideWitness,
    ),
  });
};

/** Insertion stations along the declared axis — the pinned sampling density. */
export const insertionStations = 64;

/**
 * Prove an insertion claim: the engaged span along the declared axis, measured
 * by exact classification at 64 stations.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveInsertion = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const { subject, target } = operands;
  const declared = input.expectation.axis;
  const bounds = unionBounds(subject);
  const targetEndpoint = target[0];
  if (!declared || !bounds || !targetEndpoint) {
    return unsupported(
      'An insertion claim needs a declared axis and exact subject bounds.',
      'Declare `axis` on the expectation and select endpoints whose analytic bounds are known.',
    );
  }
  const length = Math.hypot(...declared);
  if (length === 0) {
    return unsupported('The declared insertion axis is degenerate.', 'Declare a non-zero direction vector for `axis`.');
  }
  const direction: Vec3 = [declared[0] / length, declared[1] / length, declared[2] / length];
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const corners = boundsCorners(bounds).map((corner) => dot(corner, direction));
  const from = Math.min(...corners);
  const to = Math.max(...corners);
  const base = dot(center, direction);
  // Station CENTRES, not endpoints: exact bounds carry a 1e-7 pad, so a station
  // sitting on the extreme would classify outside the very solid it belongs to
  // and shorten every engaged span by two stations.
  const step = (to - from) / insertionStations;
  const points: Vec3[] = [];
  for (let station = 0; station < insertionStations; station++) {
    const along = from + step * (station + 0.5) - base;
    points.push([center[0] + direction[0] * along, center[1] + direction[1] * along, center[2] + direction[2] * along]);
  }
  // A cylindrical-face target denotes the BORE, so a station is engaged when it
  // is in the bore region — never when it is in the boss's material, which is
  // the complement of what the claim means.
  const bore = boreRegionOf(targetEndpoint);
  const states = bore
    ? points.map((point) => (pointInBore(bore, point) ? 'in' : 'out'))
    : classifyPoints({
        native: input.context.native,
        ...(input.context.subjectContentHash === undefined ? {} : { contentHash: input.context.subjectContentHash }),
        ...(input.context.forensic === undefined ? {} : { forensic: input.context.forensic }),
        occurrence: targetEndpoint.occurrence,
        points,
      })?.states;
  if (!states) {
    return unsupported(
      'The exact point classification along the insertion axis failed.',
      'Repair or re-export the geometry: insertion depth needs a valid closed solid on the target.',
    );
  }
  let first = -1;
  let last = -1;
  let engaged = 0;
  for (const [station, state] of states.entries()) {
    if (state !== 'out') {
      first = first === -1 ? station : first;
      last = station;
      engaged += 1;
    }
  }
  // The engaged span is the total engaged length, one station's worth per
  // station that classified inside the target.
  const depth = engaged * step;
  const measuredExtrema = nearestExtrema(input.context, subject, target);
  const minimum = input.expectation.min ?? 0;
  const maximum = input.expectation.max ?? Number.POSITIVE_INFINITY;
  const final: RelationshipFinalEvidence = {
    method: bore ? 'analytic' : 'classification',
    measured: { depth, ...(measuredExtrema ? { distance: measuredExtrema.distance } : {}) },
    expected: {
      ...(input.expectation.min === undefined ? {} : { min: input.expectation.min }),
      ...(input.expectation.max === undefined ? {} : { max: input.expectation.max }),
    },
    witnesses: first === -1 ? [] : [pointWitness(points[first]!), pointWitness(points[last]!)],
  };
  const record = broadPhase(subject, target, input.context.tolerances.linearMm);
  if (depth >= minimum && depth <= maximum) {
    return evidence({ verdict: 'pass', broadPhase: record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: record,
    final,
    diagnostic: mismatchDiagnostic(
      `Insertion of '${label(input.expectation, 'subject')}' into '${label(input.expectation, 'target')}' engaged ${depth.toFixed(4)} mm along the declared axis, outside the ${minimum}–${maximum} mm band.`,
      'Seat the part deeper, or adjust the declared engagement band.',
      first === -1 ? undefined : points[first],
    ),
  });
};

/** Volume comparisons are exact; this only absorbs `double` formatting noise. */
const volumeEpsilon = 1e-9;

/**
 * Prove an interference claim by exact boolean common volume.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveInterference = (input: RelationshipProofInput): RelationshipEvidence => {
  const operands = endpointsOrRefusal(input);
  if ('refusal' in operands) {
    return operands.refusal;
  }
  const { subject, target } = operands;
  const record = broadPhase(subject, target, input.context.tolerances.linearMm);
  const minVolume = input.expectation.minVolume ?? 0;
  const maxVolume = input.expectation.maxVolume ?? 0;
  const expected = { minVolume, maxVolume };

  let volume = 0;
  let centroid: Vec3 | undefined;
  for (const a of subject) {
    for (const b of target) {
      const measured = commonVolume({
        native: input.context.native,
        ...(input.context.subjectContentHash === undefined ? {} : { contentHash: input.context.subjectContentHash }),
        ...(input.context.forensic === undefined ? {} : { forensic: input.context.forensic }),
        a: a.occurrence,
        b: b.occurrence,
      });
      if (!measured) {
        return unsupported(
          'The exact boolean common volume failed.',
          'Repair or re-export the geometry: interference needs valid closed solids on both endpoints.',
        );
      }
      if (measured.volume > volume) {
        volume = measured.volume;
        centroid = measured.centroid;
      }
    }
  }
  return interferenceVerdict({
    input,
    record,
    volume,
    ...(centroid === undefined ? {} : { centroid }),
    expected,
    method: 'boolean-intersection',
  });
};

const interferenceVerdict = (options: {
  input: RelationshipProofInput;
  record: RelationshipBroadPhase;
  volume: number;
  centroid?: Vec3;
  expected: { minVolume: number; maxVolume: number };
  method: RelationshipFinalEvidence['method'];
}): RelationshipEvidence => {
  const { input, volume, centroid, expected } = options;
  const final: RelationshipFinalEvidence = {
    method: options.method,
    measured: { volume },
    expected,
    witnesses: centroid ? [pointWitness(centroid)] : [],
  };
  if (volume >= expected.minVolume - volumeEpsilon && volume <= expected.maxVolume + volumeEpsilon) {
    return evidence({ verdict: 'pass', broadPhase: options.record, final });
  }
  return evidence({
    verdict: 'fail',
    broadPhase: options.record,
    final,
    diagnostic: mismatchDiagnostic(
      `Interference between '${label(input.expectation, 'subject')}' and '${label(input.expectation, 'target')}' measured ${volume.toFixed(6)} mm³, outside the declared ${expected.minVolume}–${expected.maxVolume} mm³ allowance.`,
      volume > expected.maxVolume
        ? 'Relieve the overlap, or declare the intended press-fit allowance with `minVolume`/`maxVolume`.'
        : 'Increase the press-fit overlap, or lower the declared `minVolume`.',
      centroid,
    ),
  });
};

const endpointsOrRefusal = (
  input: RelationshipProofInput,
): { subject: ProofEndpoint[]; target: ProofEndpoint[] } | { refusal: RelationshipEvidence } => {
  const subject = resolveEndpoints(input.subject, input.context, 'subject');
  if ('refusal' in subject) {
    return subject;
  }
  const target = resolveEndpoints(input.target, input.context, 'target');
  if ('refusal' in target) {
    return target;
  }
  return { subject: subject.endpoints, target: target.endpoints };
};

/**
 * Dispatch a relationship claim to the proof its expectation names.
 *
 * @param input - Subject and target selections plus the expectation.
 * @returns The relationship verdict with its evidence.
 * @public
 */
export const proveRelationship = (input: RelationshipProofInput): RelationshipEvidence => {
  switch (input.expectation.kind) {
    case 'contact': {
      return proveContact(input);
    }
    case 'clearance': {
      return proveClearance(input);
    }
    case 'coaxial':
    case 'concentric': {
      return proveCoaxial(input);
    }
    case 'coplanar': {
      return proveCoplanar(input);
    }
    case 'containment': {
      return proveContainment(input);
    }
    case 'insertion': {
      return proveInsertion(input);
    }
    case 'interference': {
      return proveInterference(input);
    }
    default: {
      return proveDirectionAngle(input);
    }
  }
};
