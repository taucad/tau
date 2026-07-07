/**
 * L4 relationship evidence engine (SB4, master roadmap R3/R4).
 *
 * Every proof consumes two SB3 selector resolutions plus the relationship
 * expectation and returns a {@link RelationshipEvidence} verdict decided by
 * exact BRep evidence only (D3): OCCT extrema with witnesses, pure analytic
 * comparison over SB3 facts, exact solid classification, or exact boolean
 * common volume. AABB comparisons appear only as labeled `broadPhase`
 * records; no tessellation parameter can influence any verdict.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import type { SelectorIndex } from '#selector/index-builder.js';
import type { SelectorTolerances } from '#selector/tolerances.js';
import { serializeSelector } from '#selector/types.js';
import type { GeometryFacts, GeometrySelection, ResolvedEntity } from '#selector/types.js';
import { axisAngleBetweenDegrees, distance, dot, normalize, scale, subtract } from '#selector/vector-math.js';
import { checkBudget } from '#runner/matcher-budget.js';
import type {
  RelationshipBroadPhase,
  RelationshipEvidence,
  RelationshipFinalEvidence,
  RelationshipWitness,
} from '#proofs/types.js';

/**
 * Native proof surface consumed at proof time (SB1 wrapper bindings).
 *
 * @public
 */
export type RelationshipProofNative = Pick<
  GeoSpecNativeXdeReadResult,
  'extrema' | 'classifyPoints' | 'commonVolume' | 'faceFacts'
>;

/**
 * Per-subject proof context: the native handle, the L2 selector index, the
 * occurrence-position table (occurrence index = position in
 * `StepEvidence.xde.occurrences`), and the shared tolerance vocabulary.
 *
 * @public
 */
export type RelationshipProofContext = {
  native: RelationshipProofNative;
  index: SelectorIndex;
  occurrenceIndexByPath: ReadonlyMap<string, number>;
  tolerances: SelectorTolerances;
};

/**
 * Input to one relationship proof.
 *
 * @public
 */
export type RelationshipProofInput = {
  subject: GeometrySelection;
  target: GeometrySelection;
  expectation: GeoSpecSpatialRelationshipExpectation;
  context: RelationshipProofContext;
};

/**
 * Containment sampling density per face: the face-fact centroid plus the
 * eight bounds corners projected onto the analytic surface. The corners
 * bracket the face's full extent on every axis (a wall crossing displaces at
 * least one extreme corner outside the container) and the centroid catches
 * mid-face penetration, while nine exact classifications per face keep
 * whole-occurrence containment linear in face count.
 */
const containmentSamplesPerFace = 9;

/**
 * Insertion-depth stations classified along the declared axis. Depth is
 * quantized to `span / insertionAxisStations` (about 1.6% of the subject's
 * axial span); every station is an exact solid classification, so the
 * measurement is tessellation-independent, and the constant bounds the
 * classification cost per insertion proof.
 */
const insertionAxisStations = 64;

type EndpointRole = 'subject' | 'target';

const endpointReport = (selection: GeometrySelection): Record<string, unknown> => ({
  selector: serializeSelector(selection.selector),
  status: selection.status,
  stability: selection.stability,
  source: selection.source,
  entities: selection.entities.map((entity) => ({
    id: entity.id,
    entityType: entity.entityType,
    ...(entity.occurrencePath === undefined ? {} : { occurrencePath: entity.occurrencePath }),
    ...(entity.topologyRef === undefined ? {} : { topologyRef: entity.topologyRef }),
  })),
});

const firstPointWitness = (witnesses: RelationshipWitness[] | undefined): Vec3 | undefined => {
  const point = witnesses?.find((witness) => witness.kind === 'point');
  if (!point) {
    return undefined;
  }
  const [x, y, z] = point.value;
  return x !== undefined && y !== undefined && z !== undefined ? [x, y, z] : undefined;
};

type EvidenceDraft = {
  input: RelationshipProofInput;
  message: string;
  suggestion: string;
  final?: RelationshipFinalEvidence;
  broadPhase?: RelationshipBroadPhase;
  details?: Record<string, unknown>;
};

const evidenceDiagnostic = (code: string, draft: EvidenceDraft): GeometryDiagnostic => {
  const witnessCenter = firstPointWitness(draft.final?.witnesses);
  return {
    code,
    severity: 'error',
    message: draft.message,
    suggestion: draft.suggestion,
    ...(witnessCenter ? { spatial: { center: witnessCenter } } : {}),
    details: {
      subject: endpointReport(draft.input.subject),
      target: endpointReport(draft.input.target),
      evidence: {
        ...(draft.broadPhase ? { broadPhase: draft.broadPhase } : {}),
        ...(draft.final ? { final: draft.final } : {}),
      },
      ...(draft.final
        ? { measured: draft.final.measured, expected: draft.final.expected, witnesses: draft.final.witnesses }
        : {}),
      ...draft.details,
    },
  };
};

const failEvidence = (draft: EvidenceDraft): RelationshipEvidence => ({
  verdict: 'fail',
  ...(draft.broadPhase ? { broadPhase: draft.broadPhase } : {}),
  ...(draft.final ? { final: draft.final } : {}),
  diagnostics: [evidenceDiagnostic('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH', draft)],
});

const unsupportedEvidence = (draft: EvidenceDraft): RelationshipEvidence => ({
  verdict: 'unsupported',
  ...(draft.broadPhase ? { broadPhase: draft.broadPhase } : {}),
  ...(draft.final ? { final: draft.final } : {}),
  diagnostics: [evidenceDiagnostic(selectorDiagnosticCodes.unsupportedEvidence, draft)],
});

const passEvidence = (options: {
  final: RelationshipFinalEvidence;
  broadPhase?: RelationshipBroadPhase;
}): RelationshipEvidence => ({
  verdict: 'pass',
  ...(options.broadPhase ? { broadPhase: options.broadPhase } : {}),
  final: options.final,
  diagnostics: [],
});

// --- endpoint access ---------------------------------------------------------

type ProofEndpoint = { role: EndpointRole; entity: ResolvedEntity };

/** Single-entity endpoints, or undefined when a proof cannot address them. */
const proofEndpoints = (
  input: RelationshipProofInput,
): { subject: ProofEndpoint; target: ProofEndpoint } | RelationshipEvidence => {
  const roles: Array<{ role: EndpointRole; selection: GeometrySelection }> = [
    { role: 'subject', selection: input.subject },
    { role: 'target', selection: input.target },
  ];
  for (const { role, selection } of roles) {
    if (selection.entities.length !== 1) {
      return unsupportedEvidence({
        input,
        message: `The ${role} selector resolved ${selection.entities.length} entities; relationship proofs take exactly one entity per endpoint.`,
        suggestion: 'Narrow the selector to one entity, or declare one relationship per group member.',
      });
    }
  }
  const subjectEntity = input.subject.entities[0];
  const targetEntity = input.target.entities[0];
  if (!subjectEntity || !targetEntity) {
    return unsupportedEvidence({
      input,
      message: 'Both relationship endpoints must resolve to one entity.',
      suggestion: 'Correct the selectors so each endpoint resolves exactly one entity.',
    });
  }
  return { subject: { role: 'subject', entity: subjectEntity }, target: { role: 'target', entity: targetEntity } };
};

const isEvidence = <Value extends Record<string, unknown>>(
  value: Value | RelationshipEvidence,
): value is RelationshipEvidence => 'verdict' in value;

/**
 * Evidence-policy guard (R6, master acceptance case 8, layer rule 3): an
 * endpoint with stability `'explicit'` that is not bound to resolved geometry
 * can never satisfy a production relationship.
 */
const explicitEndpointRejection = (input: RelationshipProofInput): RelationshipEvidence | undefined => {
  const endpoints: Array<{ role: EndpointRole; selection: GeometrySelection }> = [
    { role: 'subject', selection: input.subject },
    { role: 'target', selection: input.target },
  ];
  for (const { role, selection } of endpoints) {
    const unbound = selection.entities.some(
      (entity) =>
        entity.occurrencePath === undefined || !input.context.occurrenceIndexByPath.has(entity.occurrencePath),
    );
    if (selection.stability === 'explicit' && (unbound || selection.entities.length === 0)) {
      return unsupportedEvidence({
        input,
        message: `The ${role} selector is an explicit fixture selector (stability 'explicit') not bound to resolved geometry; the evidence policy rejects it for production relationship proofs.`,
        suggestion:
          'Select real geometry (authored interface, query, or probe selector) instead of declaring explicit analytic facts.',
      });
    }
  }
  return undefined;
};

type NativeShapeRef = { occurrence: number; face: number };

const shapeRef = (entity: ResolvedEntity, context: RelationshipProofContext): NativeShapeRef | undefined => {
  if (entity.occurrencePath === undefined) {
    return undefined;
  }
  const occurrence = context.occurrenceIndexByPath.get(entity.occurrencePath);
  if (occurrence === undefined) {
    return undefined;
  }
  return { occurrence, face: entity.facts.faceIndex ?? -1 };
};

const requireShapeReferences = (options: {
  input: RelationshipProofInput;
  subject: ResolvedEntity;
  target: ResolvedEntity;
}): { subject: NativeShapeRef; target: NativeShapeRef } | RelationshipEvidence => {
  const subject = shapeRef(options.subject, options.input.context);
  const target = shapeRef(options.target, options.input.context);
  if (!subject || !target) {
    return unsupportedEvidence({
      input: options.input,
      message: 'Both endpoints must be bound to occurrences in the STEP-XDE structure for native BRep proofs.',
      suggestion:
        'Select entities through the artifact (occurrence, interface, face/axis/plane query) so proofs can address their shapes.',
    });
  }
  return { subject, target };
};

// --- broad phase (labeled, never a verdict source) ---------------------------

const aabbGap = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }): number => {
  let squared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const gap = Math.max((b.min[axis] ?? 0) - (a.max[axis] ?? 0), (a.min[axis] ?? 0) - (b.max[axis] ?? 0), 0);
    squared += gap * gap;
  }
  return Math.sqrt(squared);
};

const aabbBroadPhase = (options: {
  subject: ResolvedEntity;
  target: ResolvedEntity;
  linearMm: number;
}): RelationshipBroadPhase | undefined => {
  const subjectBounds = options.subject.facts.bounds;
  const targetBounds = options.target.facts.bounds;
  if (!subjectBounds || !targetBounds) {
    return undefined;
  }
  const gap = aabbGap(subjectBounds, targetBounds);
  return {
    method: 'aabb',
    candidate: gap <= options.linearMm,
    detail: `AABB gap ${gap.toFixed(3)}mm between entity bounds (broad phase only, never a verdict).`,
  };
};

// --- witnesses ----------------------------------------------------------------

const pointWitness = (point: Vec3, topologyRef: string | undefined): RelationshipWitness => ({
  kind: 'point',
  value: [...point],
  ...(topologyRef === undefined ? {} : { topologyRef }),
});

const analyticWitness = (entity: ResolvedEntity): RelationshipWitness | undefined => {
  const { facts } = entity;
  if (facts.surfaceType === 'plane' && facts.normal && facts.offset !== undefined) {
    return {
      kind: 'plane',
      value: [...facts.normal, facts.offset],
      ...(entity.topologyRef === undefined ? {} : { topologyRef: entity.topologyRef }),
    };
  }
  const axisDirection = facts.axisDirection ?? facts.zAxis;
  const axisOrigin = facts.axisOrigin ?? facts.origin ?? facts.centroid;
  if (axisDirection && axisOrigin) {
    return {
      kind: 'axis',
      value: [...axisOrigin, ...axisDirection],
      ...(entity.topologyRef === undefined ? {} : { topologyRef: entity.topologyRef }),
    };
  }
  if (facts.centroid) {
    return pointWitness(facts.centroid, entity.topologyRef);
  }
  return undefined;
};

const analyticWitnesses = (subject: ResolvedEntity, target: ResolvedEntity): RelationshipWitness[] =>
  [analyticWitness(subject), analyticWitness(target)].filter(
    (witness): witness is RelationshipWitness => witness !== undefined,
  );

// --- native JSON parsing --------------------------------------------------------

type ExtremaPayload = { distance: number; pointA: Vec3; pointB: Vec3 };

const parseNativeJson = <Payload>(raw: string): Payload | { error: string } => {
  const parsed = JSON.parse(raw) as Payload & { error?: unknown };
  return typeof parsed.error === 'string' ? { error: parsed.error } : parsed;
};

const nativeError = (input: RelationshipProofInput, call: string, error: string): RelationshipEvidence =>
  unsupportedEvidence({
    input,
    message: `Native ${call} proof failed: ${error}`,
    suggestion: 'Verify the STEP artifact parses cleanly and the selected entities exist in the current geometry.',
    details: { nativeError: error },
  });

// --- extrema proofs (contact, clearance) ---------------------------------------

type ExtremaMeasurement = {
  payload: ExtremaPayload;
  broadPhase?: RelationshipBroadPhase;
  subject: ResolvedEntity;
  target: ResolvedEntity;
};

const measureExtrema = (input: RelationshipProofInput): ExtremaMeasurement | RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const references = requireShapeReferences({
    input,
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
  });
  if (isEvidence(references)) {
    return references;
  }
  const raw = input.context.native.extrema(
    references.subject.occurrence,
    references.subject.face,
    references.target.occurrence,
    references.target.face,
  );
  const payload = parseNativeJson<ExtremaPayload>(raw);
  if ('error' in payload) {
    return nativeError(input, 'extrema', payload.error);
  }
  const broadPhase = aabbBroadPhase({
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
    linearMm: input.context.tolerances.linearMm,
  });
  return {
    payload,
    ...(broadPhase ? { broadPhase } : {}),
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
  };
};

// --- contact-patch area estimate (SB4 frontier: contact-area) -------------------

/**
 * Contact-patch grid density per axis: the subject face's bounds AABB is
 * sampled on a `contactPatchGrid × contactPatchGrid` lattice on its two extent
 * axes. 40² = 1600 exact classifications per endpoint bounds the cost and put
 * the estimate within ~1% of analytic area on the known washer-annulus and
 * flange fixtures (patch 258.9–262.0 vs analytic 260.2; 1600.0 vs 1600).
 */
const contactPatchGrid = 40;

/**
 * Meridian of a conical subject face, fully fixed from exact evidence. The
 * native `faceFacts` payload carries the cone's axis and reference radius
 * (the surface radius at the axis origin's station) but not its half-angle,
 * so the missing meridian slope is recovered from one exact on-surface
 * witness point: radius(station) = refRadius + slope × station.
 */
type ConeMeridian = { origin: Vec3; axis: Vec3; refRadius: number; slope: number };

/**
 * Fix a cone face's meridian from an exact witness point on the surface
 * (an extrema solution point — evaluated from the surface parameterization,
 * never a tessellation vertex). The witness gives a second exact
 * (station, radius) sample beside the reference circle, which determines the
 * meridian line exactly. A witness at the reference station cannot fix the
 * slope, so the meridian is honestly absent and the estimate stays
 * `unsupported` rather than guessed.
 */
const coneMeridianFromWitness = (facts: GeometryFacts, witness: Vec3): ConeMeridian | undefined => {
  if (!facts.axisOrigin || !facts.axisDirection || facts.radius === undefined) {
    return undefined;
  }
  const axis = normalize(facts.axisDirection);
  if (!axis) {
    return undefined;
  }
  const offset = subtract(witness, facts.axisOrigin);
  const station = dot(offset, axis);
  if (Math.abs(station) <= 1e-6) {
    return undefined;
  }
  const radial = distance(offset, scale(axis, station));
  return { origin: facts.axisOrigin, axis, refRadius: facts.radius, slope: (radial - facts.radius) / station };
};

/** Bisection ladder size: one exact classification call brackets the innermost material flip. */
const coneLadderSteps = 64;

/** Bisection rounds converging the flip interval below OCCT's `on` tolerance. */
const coneBisectionRounds = 48;

/**
 * Fix a cone face's meridian without an extrema witness: OCCT's extrema on a
 * coincident seat/valve pair may legally return a rim point AT the reference
 * station, where the slope is 0/0 ({@link coneMeridianFromWitness} honestly
 * declines). The fallback recovers the second exact (station, radius) sample
 * itself: at the band's area centroid station (exact facts, strictly interior
 * to the band), march a radial ray from the axis and bisect the void-to-
 * material flip with exact point classifications until the interval is below
 * the `on` tolerance, then confirm the converged point classifies `on` the
 * subject solid. Every failure path returns `undefined` — the estimate stays
 * `unsupported`, never guessed.
 */
const coneMeridianFromBisection = (options: {
  facts: GeometryFacts;
  native: RelationshipProofNative;
  occurrence: number;
}): ConeMeridian | undefined => {
  const { facts, native, occurrence } = options;
  if (!facts.axisOrigin || !facts.axisDirection || facts.radius === undefined || !facts.centroid || !facts.bounds) {
    return undefined;
  }
  const axis = normalize(facts.axisDirection);
  if (!axis) {
    return undefined;
  }
  const centroidOffset = subtract(facts.centroid, facts.axisOrigin);
  const station = dot(centroidOffset, axis);
  if (Math.abs(station) <= 1e-6) {
    return undefined;
  }
  // Probe direction: the centroid's own radial direction for partial bands;
  // full-revolution bands centre on the axis, so any perpendicular works.
  let probe = normalize(subtract(centroidOffset, scale(axis, station)));
  if (!probe) {
    const seed: Vec3 =
      Math.abs(axis[0]) <= Math.abs(axis[1]) && Math.abs(axis[0]) <= Math.abs(axis[2])
        ? [1, 0, 0]
        : Math.abs(axis[1]) <= Math.abs(axis[2])
          ? [0, 1, 0]
          : [0, 0, 1];
    probe = normalize(subtract(seed, scale(axis, dot(seed, axis))));
  }
  if (!probe) {
    return undefined;
  }
  const stationBase: Vec3 = [
    facts.axisOrigin[0] + axis[0] * station,
    facts.axisOrigin[1] + axis[1] * station,
    facts.axisOrigin[2] + axis[2] * station,
  ];
  // Outer bracket: past the farthest AABB corner's radial distance, the ray is
  // guaranteed outside the solid.
  let outerRadius = 0;
  for (const cx of [facts.bounds.min[0], facts.bounds.max[0]]) {
    for (const cy of [facts.bounds.min[1], facts.bounds.max[1]]) {
      for (const cz of [facts.bounds.min[2], facts.bounds.max[2]]) {
        const cornerOffset = subtract([cx, cy, cz], facts.axisOrigin);
        outerRadius = Math.max(outerRadius, distance(cornerOffset, scale(axis, dot(cornerOffset, axis))));
      }
    }
  }
  outerRadius += 1;
  const pointAt = (radius: number): Vec3 => [
    stationBase[0] + probe[0] * radius,
    stationBase[1] + probe[1] * radius,
    stationBase[2] + probe[2] * radius,
  ];
  const classify = (points: Vec3[]): Array<'in' | 'out' | 'on'> | undefined => {
    const payload = parseNativeJson<ClassificationPayload>(native.classifyPoints(occurrence, JSON.stringify(points)));
    return 'error' in payload ? undefined : payload.states;
  };
  // One-call ladder brackets the innermost not-in -> in flip (bore void up to
  // the cone surface, material beyond it).
  const ladderRadii = Array.from(
    { length: coneLadderSteps + 1 },
    (_, index) => (outerRadius * index) / coneLadderSteps,
  );
  const ladderStates = classify(ladderRadii.map((radius) => pointAt(radius)));
  if (!ladderStates || ladderStates[0] === 'in') {
    return undefined;
  }
  const onIndex = ladderStates.indexOf('on');
  let low: number;
  let high: number;
  if (onIndex !== -1) {
    const onRadius = ladderRadii[onIndex];
    if (onRadius === undefined) {
      return undefined;
    }
    return { origin: facts.axisOrigin, axis, refRadius: facts.radius, slope: (onRadius - facts.radius) / station };
  }
  const flip = ladderStates.findIndex(
    (state, index) => index > 0 && state === 'in' && ladderStates[index - 1] === 'out',
  );
  if (flip <= 0) {
    return undefined;
  }
  low = ladderRadii[flip - 1] ?? 0;
  high = ladderRadii[flip] ?? outerRadius;
  for (let round = 0; round < coneBisectionRounds && high - low > 1e-9; round += 1) {
    const mid = (low + high) / 2;
    const states = classify([pointAt(mid)]);
    if (!states) {
      return undefined;
    }
    if (states[0] === 'on') {
      return { origin: facts.axisOrigin, axis, refRadius: facts.radius, slope: (mid - facts.radius) / station };
    }
    if (states[0] === 'in') {
      high = mid;
    } else {
      low = mid;
    }
  }
  // Converged without an exact `on` hit — confirm the midpoint before trusting it.
  const mid = (low + high) / 2;
  const confirm = classify([pointAt(mid)]);
  if (confirm?.[0] !== 'on') {
    return undefined;
  }
  return { origin: facts.axisOrigin, axis, refRadius: facts.radius, slope: (mid - facts.radius) / station };
};

/**
 * Grid a subject face's bounds AABB on its two widest axes, projecting every
 * lattice point onto the analytic surface. The flat axis (smallest extent) is
 * held at the centroid so a planar face lands on its own plane and a slightly
 * inflated BRep bounding box does not skew the sweep. Curved faces keep their
 * true `faceFacts` area (never a flat projection) because the fraction is
 * multiplied by that area downstream. Cone faces additionally need the
 * witness-fixed meridian; without it their lattice points stay raw and the
 * footprint honestly collapses to zero.
 */
const faceGridPoints = (facts: GeometryFacts, cone?: ConeMeridian): Vec3[] | undefined => {
  const { bounds, centroid } = facts;
  if (!bounds || !centroid) {
    return undefined;
  }
  const axes: Array<0 | 1 | 2> = [0, 1, 2];
  const extent = (axis: 0 | 1 | 2): number => bounds.max[axis] - bounds.min[axis];
  // Flat axis = the smallest-extent axis (the face's out-of-plane direction).
  const flatAxis: 0 | 1 | 2 = extent(0) <= extent(1) && extent(0) <= extent(2) ? 0 : extent(1) <= extent(2) ? 1 : 2;
  const [u, v] = axes.filter((axis) => axis !== flatAxis) as [0 | 1 | 2, 0 | 1 | 2];
  const points: Vec3[] = [];
  for (let i = 0; i < contactPatchGrid; i += 1) {
    for (let j = 0; j < contactPatchGrid; j += 1) {
      const raw: [number, number, number] = [centroid[0], centroid[1], centroid[2]];
      raw[u] = bounds.min[u] + (i + 0.5) * (extent(u) / contactPatchGrid);
      raw[v] = bounds.min[v] + (j + 0.5) * (extent(v) / contactPatchGrid);
      points.push(projectOntoFaceSurface(facts, raw, cone));
    }
  }
  return points;
};

type ContactPatch = {
  /** True face area (mm²) from the resolved SB1 face facts (exact). */
  faceArea: number;
  /** Sampled estimate (mm²): contacting fraction × faceArea. */
  patchArea: number;
  /** Quantization band (mm²): one grid-row of the sampled footprint perimeter. */
  band: number;
  /** Lattice points that landed on the subject face (the sampled footprint). */
  footprint: number;
  /** Footprint points within the contact tolerance of the target boundary. */
  contacting: number;
  /** Footprint points `in` the target solid — penetration, not clean seating. */
  penetrating: number;
  /** A contacting witness point, when any sample seats. */
  witness?: Vec3;
};

/**
 * Surface direction at a projected sample — the bracketing direction for the
 * tolerance probes. The sign is irrelevant (the bracket is symmetric);
 * `undefined` for surfaces the sampler cannot project, whose samples never
 * reach the footprint anyway.
 */
const surfaceNormalAt = (facts: GeometryFacts, point: Vec3, cone?: ConeMeridian): Vec3 | undefined => {
  if (facts.surfaceType === 'plane' && facts.normal) {
    return normalize(facts.normal);
  }
  if (facts.surfaceType === 'cylinder' && facts.axisOrigin && facts.axisDirection) {
    const axis = normalize(facts.axisDirection);
    if (!axis) {
      return undefined;
    }
    const offset = subtract(point, facts.axisOrigin);
    return normalize(subtract(offset, scale(axis, dot(offset, axis))));
  }
  if (facts.surfaceType === 'cone' && cone) {
    // Gradient of radial(P) − slope·station(P): the radial direction tilted
    // against the meridian slope.
    const offset = subtract(point, cone.origin);
    const radialUnit = normalize(subtract(offset, scale(cone.axis, dot(offset, cone.axis))));
    if (!radialUnit) {
      return undefined;
    }
    return normalize(subtract(radialUnit, scale(cone.axis, cone.slope)));
  }
  return undefined;
};

/**
 * Count seating contact over the sampled footprint. A footprint sample seats
 * when the target boundary lies within the contact tolerance of it — the
 * plain contact proof's own gap semantics (gap <= tolerance) — decided by
 * exact classifications of the sample and of two probes bracketing it along
 * the subject's surface direction. Counting `on` alone is a knife edge: two
 * independently STEP-round-tripped coincident surfaces sit within ~1e-7 of
 * each other, inside the shape tolerance, so `on`-only verdicts jitter per
 * sample. A sample strictly `in` the target counts as penetration, never as
 * clean seating.
 */
const countContactSamples = (options: {
  input: RelationshipProofInput;
  target: NativeShapeRef;
  points: Vec3[];
  subjectStates: readonly string[];
  targetStates: readonly string[];
  facts: GeometryFacts;
  cone?: ConeMeridian;
}): Pick<ContactPatch, 'footprint' | 'contacting' | 'penetrating' | 'witness'> | { error: string } => {
  const { input, target, points, subjectStates, targetStates, facts, cone } = options;
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const footprintIndices: number[] = [];
  const probePlus: Vec3[] = [];
  const probeMinus: Vec3[] = [];
  const probePosition = new Map<number, number>();
  for (const [sample, point] of points.entries()) {
    if (subjectStates[sample] !== 'on') {
      continue;
    }
    footprintIndices.push(sample);
    const normal = surfaceNormalAt(facts, point, cone);
    if (normal) {
      probePosition.set(sample, probePlus.length);
      probePlus.push([
        point[0] + normal[0] * tolerance,
        point[1] + normal[1] * tolerance,
        point[2] + normal[2] * tolerance,
      ]);
      probeMinus.push([
        point[0] - normal[0] * tolerance,
        point[1] - normal[1] * tolerance,
        point[2] - normal[2] * tolerance,
      ]);
    }
  }
  let plusStates: readonly string[] = [];
  let minusStates: readonly string[] = [];
  if (probePlus.length > 0) {
    const plusPayload = parseNativeJson<ClassificationPayload>(
      input.context.native.classifyPoints(target.occurrence, JSON.stringify(probePlus)),
    );
    if ('error' in plusPayload) {
      return { error: plusPayload.error };
    }
    const minusPayload = parseNativeJson<ClassificationPayload>(
      input.context.native.classifyPoints(target.occurrence, JSON.stringify(probeMinus)),
    );
    if ('error' in minusPayload) {
      return { error: minusPayload.error };
    }
    plusStates = plusPayload.states;
    minusStates = minusPayload.states;
  }
  let contacting = 0;
  let penetrating = 0;
  let witness: Vec3 | undefined;
  for (const sample of footprintIndices) {
    const state = targetStates[sample];
    if (state === 'in') {
      penetrating += 1;
      continue;
    }
    let seats = state === 'on';
    const position = probePosition.get(sample);
    if (!seats && position !== undefined) {
      const plus = plusStates[position];
      const minus = minusStates[position];
      seats = plus === 'on' || minus === 'on' || (plus !== minus && plus !== undefined && minus !== undefined);
    }
    if (seats) {
      contacting += 1;
      witness ??= points[sample];
    }
  }
  return { footprint: footprintIndices.length, contacting, penetrating, ...(witness ? { witness } : {}) };
};

/**
 * Estimate the contact-patch area between one subject face A and target solid
 * B by exact per-point classification (D3): grid A's face, keep the lattice
 * points that classify `on` A (the sampled footprint — this discards
 * inflated-bounds corners and trimmed-away holes), and count those within the
 * contact tolerance of B's boundary ({@link countContactSamples} — the plain
 * contact proof's own gap semantics). The patch is that contacting fraction
 * times A's exact `faceFacts` area.
 * Penetration (`in` B) is measured separately: a clean seating patch does not
 * penetrate. Cone faces first fix their meridian from the exact extrema
 * witness on the subject face ({@link coneMeridianFromWitness}); a witness at
 * the reference station is degenerate, so {@link coneMeridianFromBisection}
 * then recovers the meridian by exact radial bisection at the centroid
 * station. Returns `undefined` when the face carries no area/bounds to sample
 * or no lattice point lands on the face (an honest `unsupported`, never a
 * guess).
 */
const estimateContactPatch = (options: {
  input: RelationshipProofInput;
  subject: NativeShapeRef;
  target: NativeShapeRef;
  facts: GeometryFacts;
}): ContactPatch | { error: string } | undefined => {
  const { input, subject, target, facts } = options;
  if (facts.area === undefined || facts.area <= 0) {
    return undefined;
  }
  let cone: ConeMeridian | undefined;
  if (facts.surfaceType === 'cone') {
    const witnessPayload = parseNativeJson<ExtremaPayload>(
      input.context.native.extrema(subject.occurrence, subject.face, target.occurrence, target.face),
    );
    if ('error' in witnessPayload) {
      return { error: witnessPayload.error };
    }
    cone =
      coneMeridianFromWitness(facts, witnessPayload.pointA) ??
      coneMeridianFromBisection({ facts, native: input.context.native, occurrence: subject.occurrence });
    if (!cone) {
      return undefined;
    }
  }
  const points = faceGridPoints(facts, cone);
  if (!points || points.length === 0) {
    return undefined;
  }
  const pointsJson = JSON.stringify(points);
  const subjectStates = parseNativeJson<ClassificationPayload>(
    input.context.native.classifyPoints(subject.occurrence, pointsJson),
  );
  if ('error' in subjectStates) {
    return { error: subjectStates.error };
  }
  const targetStates = parseNativeJson<ClassificationPayload>(
    input.context.native.classifyPoints(target.occurrence, pointsJson),
  );
  if ('error' in targetStates) {
    return { error: targetStates.error };
  }
  const counts = countContactSamples({
    input,
    target,
    points,
    subjectStates: subjectStates.states,
    targetStates: targetStates.states,
    facts,
    cone,
  });
  if ('error' in counts) {
    return counts;
  }
  const { footprint, contacting, penetrating, witness } = counts;
  if (footprint === 0) {
    return undefined;
  }
  const patchArea = (contacting / footprint) * facts.area;
  // Quantization band: one grid-row of the footprint perimeter (≈√footprint
  // cells, each carrying faceArea/footprint), the step-tolerance idea the
  // void-continuity and classification proofs use — never fail inside the
  // sampling's own noise. Bounded below by one cell.
  const cellArea = facts.area / footprint;
  const band = Math.max(cellArea, Math.sqrt(footprint) * cellArea);
  return {
    faceArea: facts.area,
    patchArea,
    band,
    footprint,
    contacting,
    penetrating,
    ...(witness ? { witness } : {}),
  };
};

/**
 * Contact-area sub-proof: when the expectation declares `minContactArea`, the
 * seating patch between the subject face(s) and the target solid is estimated
 * by {@link estimateContactPatch} and compared to the threshold with a
 * quantization band — the claim fails only when the estimate plus band still
 * clears below the minimum (never approximated to a pass). The subject may
 * resolve to one face or to a face group (e.g. a bead band split across both
 * gasket sides, or a split ring's interrupted seating face): the group patch
 * is the sum of per-face patch estimates in resolution order, each face
 * sampled exactly like a single-face subject with the same band arithmetic.
 * Faces that never touch the target contribute a zero patch, not an error.
 * A subject face without area/bounds (or with an unsampleable surface) keeps
 * the whole claim `unsupported`: silently dropping it would understate the
 * patch and could fail an honest assembly. The target must resolve to exactly
 * one solid-addressable entity.
 */
const proveContactArea = (input: RelationshipProofInput, minContactArea: number): RelationshipEvidence => {
  const subjectEntities = input.subject.entities;
  const targetEntity = input.target.entities.length === 1 ? input.target.entities[0] : undefined;
  if (!targetEntity) {
    return unsupportedEvidence({
      input,
      message: `The target selector resolved ${input.target.entities.length} entities; minContactArea takes exactly one target entity (the solid the patch seats against).`,
      suggestion: 'Narrow the target selector to one entity, or declare one relationship per target.',
    });
  }
  if (subjectEntities.length === 0) {
    return unsupportedEvidence({
      input,
      message: 'The subject selector resolved no entities; minContactArea needs at least one subject face to sample.',
      suggestion: 'Correct the subject selector so it resolves the seating face (or face group).',
    });
  }
  const bindingDraft = {
    input,
    message: 'Both endpoints must be bound to occurrences in the STEP-XDE structure for native BRep proofs.',
    suggestion:
      'Select entities through the artifact (occurrence, interface, face/axis/plane query) so proofs can address their shapes.',
  };
  const target = shapeRef(targetEntity, input.context);
  if (!target) {
    return unsupportedEvidence(bindingDraft);
  }
  // Sum per-face patches in resolution order (deterministic): faces that do
  // not seat on the target contribute zero, so per-deck claims over a
  // both-sides face group count only the deck-side faces.
  const totals = { patchArea: 0, band: 0, faceArea: 0, footprint: 0, contacting: 0, penetrating: 0 };
  let witness: { point: Vec3; topologyRef?: string } | undefined;
  for (const entity of subjectEntities) {
    // A face-group patch sums one fixed-lattice classification per face, so the
    // cost scales with the group size — check the matcher budget between faces
    // so a large group fails bounded rather than stalling the run (WS-C/C3).
    checkBudget();
    const subject = shapeRef(entity, input.context);
    if (!subject) {
      return unsupportedEvidence(bindingDraft);
    }
    const patch = estimateContactPatch({ input, subject, target, facts: entity.facts });
    if (patch === undefined) {
      return unsupportedEvidence({
        input,
        message: `minContactArea needs every subject face to carry area and bounds; entity '${entity.id}' exposes no samplable face, so the contact patch cannot be estimated.`,
        suggestion:
          'Select a face interface, face query, or face group as the contact-area subject, not a whole occurrence, axis, or datum.',
      });
    }
    if ('error' in patch) {
      return nativeError(input, 'contact-patch', patch.error);
    }
    totals.patchArea += patch.patchArea;
    totals.band += patch.band;
    totals.faceArea += patch.faceArea;
    totals.footprint += patch.footprint;
    totals.contacting += patch.contacting;
    totals.penetrating += patch.penetrating;
    if (!witness && patch.witness) {
      witness = {
        point: patch.witness,
        ...(entity.topologyRef === undefined ? {} : { topologyRef: entity.topologyRef }),
      };
    }
  }
  // Broad phase stays a single-entity AABB comparison; a face group carries
  // no one entity-bounds pair to label honestly, so it is omitted there.
  const singleSubject = subjectEntities.length === 1 ? subjectEntities[0] : undefined;
  const broadPhase = singleSubject
    ? aabbBroadPhase({ subject: singleSubject, target: targetEntity, linearMm: input.context.tolerances.linearMm })
    : undefined;
  const final: RelationshipFinalEvidence = {
    method: 'classification',
    measured: {
      contactArea: totals.patchArea,
      band: totals.band,
      faceArea: totals.faceArea,
      footprintSamples: totals.footprint,
      contactingSamples: totals.contacting,
      penetratingSamples: totals.penetrating,
    },
    expected: { minContactArea },
    witnesses: witness ? [pointWitness(witness.point, witness.topologyRef)] : [],
  };
  if (totals.patchArea + totals.band >= minContactArea) {
    return passEvidence({ final, ...(broadPhase ? { broadPhase } : {}) });
  }
  return failEvidence({
    input,
    message: `expected a contact patch of at least ${minContactArea}mm², but the estimated seating patch is ${totals.patchArea.toFixed(1)}mm² (±${totals.band.toFixed(1)} band; ${totals.contacting}/${totals.footprint} sampled face points seat on the target${totals.penetrating > 0 ? `, ${totals.penetrating} penetrate` : ''}).`,
    suggestion:
      'Enlarge the seating overlap (or re-seat the face flush against the target), or lower the declared minimum contact area.',
    final,
    ...(broadPhase ? { broadPhase } : {}),
  });
};

/**
 * Contact proof: exact extrema distance between the resolved entities must be
 * within the contact tolerance, with witness points on both sides. When the
 * expectation declares `minContactArea`, the seating patch is estimated by
 * exact per-point classification against the target solid ({@link
 * proveContactArea}) and compared to the threshold with a quantization band —
 * a sampled sub-claim, honest about its band, never approximated to a pass.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with extrema (or, for minContactArea, classification) evidence.
 * @public
 */
export const proveContact = (input: RelationshipProofInput): RelationshipEvidence => {
  if (input.expectation.minContactArea !== undefined) {
    return proveContactArea(input, input.expectation.minContactArea);
  }
  const measurement = measureExtrema(input);
  if (isEvidence(measurement)) {
    return measurement;
  }
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const final: RelationshipFinalEvidence = {
    method: 'extrema',
    measured: { distance: measurement.payload.distance },
    expected: { distance: 0, tolerance },
    witnesses: [
      pointWitness(measurement.payload.pointA, measurement.subject.topologyRef),
      pointWitness(measurement.payload.pointB, measurement.target.topologyRef),
    ],
  };
  if (measurement.payload.distance <= tolerance) {
    return passEvidence({ final, ...(measurement.broadPhase ? { broadPhase: measurement.broadPhase } : {}) });
  }
  return failEvidence({
    input,
    message: `expected contact within ${tolerance}mm, but the exact extrema distance is ${measurement.payload.distance}mm.`,
    suggestion: `Translate the subject ${measurement.payload.distance}mm toward the target along the witness-pair direction, or correct the declared interface.`,
    final,
    ...(measurement.broadPhase ? { broadPhase: measurement.broadPhase } : {}),
  });
};

/**
 * Clearance proof: exact extrema distance must lie in the declared band, with
 * the witness pair showing where minimum clearance occurs.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with extrema evidence and witnesses.
 * @public
 */
export const proveClearance = (input: RelationshipProofInput): RelationshipEvidence => {
  const measurement = measureExtrema(input);
  if (isEvidence(measurement)) {
    return measurement;
  }
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const min = input.expectation.min ?? 0;
  const max = input.expectation.max ?? Number.POSITIVE_INFINITY;
  const measuredDistance = measurement.payload.distance;
  const final: RelationshipFinalEvidence = {
    method: 'extrema',
    measured: { distance: measuredDistance },
    expected: {
      ...(input.expectation.min === undefined ? {} : { min }),
      ...(input.expectation.max === undefined ? {} : { max }),
      tolerance,
    },
    witnesses: [
      pointWitness(measurement.payload.pointA, measurement.subject.topologyRef),
      pointWitness(measurement.payload.pointB, measurement.target.topologyRef),
    ],
  };
  if (measuredDistance + tolerance >= min && measuredDistance - tolerance <= max) {
    return passEvidence({ final, ...(measurement.broadPhase ? { broadPhase: measurement.broadPhase } : {}) });
  }
  const direction = measuredDistance < min ? 'too tight' : 'too loose';
  return failEvidence({
    input,
    message: `expected clearance in [${min}, ${max === Number.POSITIVE_INFINITY ? '∞' : max}]mm, but the exact extrema distance is ${measuredDistance}mm (${direction}).`,
    suggestion:
      direction === 'too tight'
        ? `Increase the gap by ${(min - measuredDistance).toFixed(3)}mm at the witness pair, or relax the declared minimum.`
        : `Reduce the gap by ${(measuredDistance - max).toFixed(3)}mm at the witness pair, or relax the declared maximum.`,
    final,
    ...(measurement.broadPhase ? { broadPhase: measurement.broadPhase } : {}),
  });
};

// --- analytic proofs (pure TS over SB3 facts) -----------------------------------

const analyticUnsupported = (input: RelationshipProofInput, role: EndpointRole, needed: string): RelationshipEvidence =>
  unsupportedEvidence({
    input,
    message: `The ${role} entity carries no ${needed} facts, so the '${input.expectation.kind}' claim cannot be evaluated analytically.`,
    suggestion:
      'Select an entity kind that carries the required analytic facts (axis, plane, planar/cylindrical face, or datum).',
  });

const directionFacts = (facts: GeometryFacts): Vec3 | undefined => facts.axisDirection ?? facts.normal ?? facts.zAxis;

const axisLineFacts = (facts: GeometryFacts): { origin: Vec3; direction: Vec3 } | undefined => {
  const direction = facts.axisDirection ?? facts.zAxis;
  const origin = facts.axisOrigin ?? facts.origin;
  if (!direction || !origin) {
    return undefined;
  }
  return { origin, direction };
};

const pointToLineDistance = (point: Vec3, line: { origin: Vec3; direction: Vec3 }): number | undefined => {
  const unit = normalize(line.direction);
  if (!unit) {
    return undefined;
  }
  const offset = subtract(point, line.origin);
  return distance(offset, scale(unit, dot(offset, unit)));
};

/**
 * Coaxial/concentric proof: axis-to-axis angle plus radial offset of the
 * subject axis origin from the target axis line, both within tolerance.
 * Pure analytic comparison over SB3 facts (no wasm).
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with analytic evidence and axis witnesses.
 * @public
 */
export const proveCoaxial = (input: RelationshipProofInput): RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const subjectAxis = axisLineFacts(endpoints.subject.entity.facts);
  const targetAxis = axisLineFacts(endpoints.target.entity.facts);
  if (!subjectAxis) {
    return analyticUnsupported(input, 'subject', 'axis (origin + direction)');
  }
  if (!targetAxis) {
    return analyticUnsupported(input, 'target', 'axis (origin + direction)');
  }
  const angle = axisAngleBetweenDegrees(subjectAxis.direction, targetAxis.direction);
  const radialOffset = pointToLineDistance(subjectAxis.origin, targetAxis);
  if (angle === undefined || radialOffset === undefined) {
    return analyticUnsupported(input, 'subject', 'non-degenerate axis direction');
  }
  const angularTolerance =
    input.expectation.angularToleranceDegrees ?? input.context.tolerances.angularToleranceDegrees;
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { angle, radialOffset },
    expected: { angle: 0, angularTolerance, radialOffset: 0, tolerance },
    witnesses: analyticWitnesses(endpoints.subject.entity, endpoints.target.entity),
  };
  if (angle <= angularTolerance && radialOffset <= tolerance) {
    return passEvidence({ final });
  }
  return failEvidence({
    input,
    message: `expected ${input.expectation.kind} axes within ${angularTolerance}° and ${tolerance}mm radial offset, but measured ${angle.toFixed(4)}° and ${radialOffset.toFixed(4)}mm.`,
    suggestion:
      'Rotate or translate the subject so its axis coincides with the target axis, or correct the declared interface.',
    final,
  });
};

type PlaneComparisonFacts = { normal: Vec3; offset: number; point: Vec3 };

/** Plane facts from a plane/planar-face entity or a datum (zAxis + origin). */
const planeFacts = (facts: GeometryFacts): PlaneComparisonFacts | undefined => {
  const normal = facts.normal ?? facts.zAxis;
  if (!normal) {
    return undefined;
  }
  const offset = facts.offset ?? (facts.origin ? dot(normal, facts.origin) : undefined);
  if (offset === undefined) {
    return undefined;
  }
  const point = facts.centroid ?? facts.origin ?? scale(normalize(normal) ?? normal, offset);
  return { normal, offset, point };
};

/**
 * Coplanar proof: plane-normal angle (orientation-insensitive) plus signed
 * offset delta between the planes, both within tolerance. Pure analytic
 * comparison over SB3 facts.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with analytic evidence and plane witnesses.
 * @public
 */
export const proveCoplanar = (input: RelationshipProofInput): RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const subjectPlane = planeFacts(endpoints.subject.entity.facts);
  if (!subjectPlane) {
    return analyticUnsupported(input, 'subject', 'plane (normal + offset)');
  }
  const targetPlane = planeFacts(endpoints.target.entity.facts);
  if (!targetPlane) {
    return analyticUnsupported(input, 'target', 'plane (normal + offset)');
  }
  const angle = axisAngleBetweenDegrees(subjectPlane.normal, targetPlane.normal);
  const subjectUnit = normalize(subjectPlane.normal);
  if (angle === undefined || !subjectUnit) {
    return analyticUnsupported(input, 'subject', 'non-degenerate plane normal');
  }
  const offsetDelta = Math.abs(dot(subjectUnit, targetPlane.point) - subjectPlane.offset);
  const angularTolerance =
    input.expectation.angularToleranceDegrees ?? input.context.tolerances.angularToleranceDegrees;
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { angle, offsetDelta },
    expected: { angle: 0, angularTolerance, offsetDelta: 0, tolerance },
    witnesses: analyticWitnesses(endpoints.subject.entity, endpoints.target.entity),
  };
  if (angle <= angularTolerance && offsetDelta <= tolerance) {
    return passEvidence({ final });
  }
  return failEvidence({
    input,
    message: `expected coplanar planes within ${angularTolerance}° and ${tolerance}mm offset, but measured ${angle.toFixed(4)}° and offset delta ${offsetDelta.toFixed(4)}mm.`,
    suggestion: `Translate the subject ${offsetDelta.toFixed(3)}mm along the target plane normal (and correct any tilt), or fix the modeled interface offset.`,
    final,
  });
};

/**
 * Parallel/perpendicular/angle proof: orientation-insensitive angle between
 * the endpoint directions compared against the expected angle. Pure analytic
 * comparison over SB3 facts.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with analytic evidence and direction witnesses.
 * @public
 */
export const proveDirectionAngle = (input: RelationshipProofInput): RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const expectedAngle =
    input.expectation.kind === 'parallel'
      ? 0
      : input.expectation.kind === 'perpendicular'
        ? 90
        : input.expectation.angleDegrees;
  if (expectedAngle === undefined) {
    return unsupportedEvidence({
      input,
      message: "kind 'angle' requires the expected angleDegrees to be declared on the relationship.",
      suggestion: 'Declare angleDegrees (0–90, orientation-insensitive) on the angle relationship.',
    });
  }
  const subjectDirection = directionFacts(endpoints.subject.entity.facts);
  const targetDirection = directionFacts(endpoints.target.entity.facts);
  if (!subjectDirection) {
    return analyticUnsupported(input, 'subject', 'direction (axis or normal)');
  }
  if (!targetDirection) {
    return analyticUnsupported(input, 'target', 'direction (axis or normal)');
  }
  const angle = axisAngleBetweenDegrees(subjectDirection, targetDirection);
  if (angle === undefined) {
    return analyticUnsupported(input, 'subject', 'non-degenerate direction');
  }
  const angularTolerance =
    input.expectation.angularToleranceDegrees ?? input.context.tolerances.angularToleranceDegrees;
  const angleError = Math.abs(angle - expectedAngle);
  const final: RelationshipFinalEvidence = {
    method: 'analytic',
    measured: { angle, angleError },
    expected: { angle: expectedAngle, angularTolerance },
    witnesses: analyticWitnesses(endpoints.subject.entity, endpoints.target.entity),
  };
  if (angleError <= angularTolerance) {
    return passEvidence({ final });
  }
  return failEvidence({
    input,
    message: `expected a ${expectedAngle}° angle between directions within ${angularTolerance}°, but measured ${angle.toFixed(4)}°.`,
    suggestion: `Rotate the subject by ${angleError.toFixed(3)}° so the directions meet the declared angle.`,
    final,
  });
};

// --- classification proofs (containment, insertion) ------------------------------

const projectOntoFaceSurface = (facts: GeometryFacts, point: Vec3, cone?: ConeMeridian): Vec3 => {
  if (facts.surfaceType === 'plane' && facts.normal && facts.offset !== undefined) {
    const unit = normalize(facts.normal);
    if (unit) {
      return subtract(point, scale(unit, dot(unit, point) - facts.offset));
    }
  }
  if (facts.surfaceType === 'cylinder' && facts.axisOrigin && facts.axisDirection && facts.radius !== undefined) {
    const unit = normalize(facts.axisDirection);
    if (unit) {
      const offset = subtract(point, facts.axisOrigin);
      const axial = scale(unit, dot(offset, unit));
      const radial = subtract(offset, axial);
      const radialUnit = normalize(radial);
      if (radialUnit) {
        const axisPoint: Vec3 = [
          facts.axisOrigin[0] + axial[0],
          facts.axisOrigin[1] + axial[1],
          facts.axisOrigin[2] + axial[2],
        ];
        const projected = scale(radialUnit, facts.radius);
        return [axisPoint[0] + projected[0], axisPoint[1] + projected[1], axisPoint[2] + projected[2]];
      }
    }
  }
  if (facts.surfaceType === 'cone' && cone) {
    // Mirror of the cylinder branch: keep the point's axial station and
    // radial direction, set the radial distance to the cone's exact radius at
    // that station from the witness-fixed meridian. Stations at or past the
    // apex (radius <= 0) keep the raw point; classification discards them.
    const offset = subtract(point, cone.origin);
    const station = dot(offset, cone.axis);
    const axial = scale(cone.axis, station);
    const radiusAt = cone.refRadius + cone.slope * station;
    const radialUnit = normalize(subtract(offset, axial));
    if (radiusAt > 0 && radialUnit) {
      const axisPoint: Vec3 = [cone.origin[0] + axial[0], cone.origin[1] + axial[1], cone.origin[2] + axial[2]];
      const projected = scale(radialUnit, radiusAt);
      return [axisPoint[0] + projected[0], axisPoint[1] + projected[1], axisPoint[2] + projected[2]];
    }
  }
  // Ponytail: sphere/torus/bspline surfaces keep the raw bounds corner;
  // extend with a sphere projection when a fixture needs it.
  return point;
};

const boundsCorners = (bounds: { min: Vec3; max: Vec3 }): Vec3[] => {
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
 * Pull a sample point toward the anchor by `amount` (or onto the anchor for
 * closer points). BRep face bounds carry the kernel's bounding-gap inflation
 * and trimmed faces over-approximate their corners, so corners contract by
 * the shared linear tolerance — the containment claim's own "within
 * tolerance" allowance — keeping every sample on or inside the true boundary.
 */
const contractToward = (point: Vec3, anchor: Vec3, amount: number): Vec3 => {
  const offset = subtract(anchor, point);
  const length = Math.hypot(offset[0], offset[1], offset[2]);
  if (length <= amount) {
    return anchor;
  }
  const factor = amount / length;
  return [point[0] + offset[0] * factor, point[1] + offset[1] * factor, point[2] + offset[2] * factor];
};

const faceSamplePoints = (facts: GeometryFacts, linearMm: number): Vec3[] => {
  const samples: Vec3[] = [];
  if (facts.centroid) {
    samples.push(facts.centroid);
  }
  if (facts.bounds) {
    const anchor =
      facts.centroid ??
      ([
        (facts.bounds.min[0] + facts.bounds.max[0]) / 2,
        (facts.bounds.min[1] + facts.bounds.max[1]) / 2,
        (facts.bounds.min[2] + facts.bounds.max[2]) / 2,
      ] satisfies Vec3);
    samples.push(
      ...boundsCorners(facts.bounds).map((corner) =>
        contractToward(projectOntoFaceSurface(facts, corner), anchor, linearMm),
      ),
    );
  }
  return samples.slice(0, containmentSamplesPerFace);
};

const containedSampleFacts = (entity: ResolvedEntity, index: SelectorIndex): GeometryFacts[] => {
  if (entity.facts.faceIndex !== undefined) {
    return [entity.facts];
  }
  return index.faces.filter((face) => face.occurrencePath === entity.occurrencePath).map((face) => face.facts);
};

type ClassificationPayload = { states: Array<'in' | 'out' | 'on'> };

/**
 * Axis view of a bore target: a cylindrical interface carrying axis origin,
 * axis direction, radius, and BRep face bounds. Containment/insertion against
 * such a target means occupancy of the bore *void* (the audit's
 * pin-inside-bore family), not of the container material.
 */
type BoreAxisView = { origin: Vec3; direction: Vec3; radius: number; bounds: { min: Vec3; max: Vec3 } };

const boreAxisView = (facts: GeometryFacts): BoreAxisView | undefined => {
  if (facts.radius === undefined || !facts.axisDirection || !facts.axisOrigin || !facts.bounds) {
    return undefined;
  }
  const direction = normalize(facts.axisDirection);
  if (!direction) {
    return undefined;
  }
  return { origin: facts.axisOrigin, direction, radius: facts.radius, bounds: facts.bounds };
};

/** Parameter interval of AABB corners projected onto an axis frame. */
const projectedSpan = (
  bounds: { min: Vec3; max: Vec3 },
  frame: { origin: Vec3; direction: Vec3 },
): { min: number; max: number } => {
  const parameters = boundsCorners(bounds).map((corner) => dot(subtract(corner, frame.origin), frame.direction));
  return { min: Math.min(...parameters), max: Math.max(...parameters) };
};

type InsertionAxisFrame = { origin: Vec3; direction: Vec3 };

const insertionAxisFrame = (entity: ResolvedEntity, declaredAxis: Vec3): InsertionAxisFrame | undefined => {
  const direction = normalize(declaredAxis);
  if (!direction) {
    return undefined;
  }
  const { bounds } = entity.facts;
  const origin =
    entity.facts.axisOrigin ??
    entity.facts.origin ??
    entity.facts.centroid ??
    (bounds
      ? ([
          (bounds.min[0] + bounds.max[0]) / 2,
          (bounds.min[1] + bounds.max[1]) / 2,
          (bounds.min[2] + bounds.max[2]) / 2,
        ] satisfies Vec3)
      : undefined);
  return origin ? { origin, direction } : undefined;
};

/**
 * Engaged span measured by exact solid classification at
 * `insertionAxisStations` midpoint stations along an axis frame, across the
 * subject's projected axial span. A station engages when the subject material
 * is present (`state !== 'out'`) and the target condition holds: material
 * co-occupancy by default (`state !== 'out'`), or — for bore-void targets —
 * absence of container material (`state !== 'in'`) with the station inside
 * the bore's axial `band` (frame parameters from projected BRep face bounds;
 * their kernel bounding-gap inflation is absorbed by the step-quantization
 * tolerance).
 */
const measureEngagedSpan = (options: {
  input: RelationshipProofInput;
  references: { subject: NativeShapeRef; target: NativeShapeRef };
  subjectEntity: ResolvedEntity;
  frame: InsertionAxisFrame;
  /** Bore axial band (frame parameters); stations outside it never engage. */
  band?: { min: number; max: number };
  /** True: engagement means the target *void* (no material at the station). */
  targetVoid?: boolean;
}): { depth: number; step: number } | RelationshipEvidence => {
  const { input, references, subjectEntity, frame, band } = options;
  const { bounds } = subjectEntity.facts;
  if (!bounds) {
    return analyticUnsupported(input, 'subject', 'axis origin and bounds');
  }
  const subjectSpan = projectedSpan(bounds, frame);
  const span = subjectSpan.max - subjectSpan.min;
  if (Number.isNaN(span) || span <= 0) {
    return analyticUnsupported(input, 'subject', 'positive axial span along the axis');
  }
  const step = span / insertionAxisStations;
  const parameters = Array.from(
    { length: insertionAxisStations },
    (_, station) => subjectSpan.min + (station + 0.5) * step,
  );
  const stations: Vec3[] = parameters.map((parameter) => [
    frame.origin[0] + parameter * frame.direction[0],
    frame.origin[1] + parameter * frame.direction[1],
    frame.origin[2] + parameter * frame.direction[2],
  ]);
  const stationsJson = JSON.stringify(stations);
  const subjectStates = parseNativeJson<ClassificationPayload>(
    input.context.native.classifyPoints(references.subject.occurrence, stationsJson),
  );
  if ('error' in subjectStates) {
    return nativeError(input, 'classifyPoints', subjectStates.error);
  }
  const targetStates = parseNativeJson<ClassificationPayload>(
    input.context.native.classifyPoints(references.target.occurrence, stationsJson),
  );
  if ('error' in targetStates) {
    return nativeError(input, 'classifyPoints', targetStates.error);
  }
  const engagedCount = parameters.filter(
    (parameter, station) =>
      subjectStates.states[station] !== 'out' &&
      (options.targetVoid ? targetStates.states[station] !== 'in' : targetStates.states[station] !== 'out') &&
      (band === undefined || (parameter >= band.min && parameter <= band.max)),
  ).length;
  // Ponytail: depth is quantized to one classification step (span/64);
  // raise insertionAxisStations if a fixture needs finer depth resolution.
  return { depth: engagedCount * step, step };
};

/**
 * Containment-in-bore proof (audit family: pin inside the bore void), exact
 * BRep evidence only: (a) radial fit — subject cylindrical radius vs bore
 * radius from SB3 facts, confirmed by the exact extrema between the two
 * lateral surfaces (an extrema gap below the coaxial radial clearance means
 * eccentric contact or wall interference); (b) axial overlap — engaged span
 * along the bore axis via {@link measureEngagedSpan} in void mode, bounded by
 * `min`/`max` when the expectation declares them, otherwise required to be
 * positive. Witnesses: both axis views plus the extrema point pair.
 */
const proveBoreContainment = (options: {
  input: RelationshipProofInput;
  endpoints: { subject: ProofEndpoint; target: ProofEndpoint };
  references: { subject: NativeShapeRef; target: NativeShapeRef };
  bore: BoreAxisView;
}): RelationshipEvidence => {
  const { input, endpoints, references, bore } = options;
  const subjectEntity = endpoints.subject.entity;
  const targetEntity = endpoints.target.entity;
  const subjectRadius = subjectEntity.facts.radius;
  if (subjectRadius === undefined) {
    return analyticUnsupported(input, 'subject', 'cylindrical surface (radius)');
  }
  const tolerance = input.expectation.tolerance ?? input.context.tolerances.linearMm;
  const radialClearance = bore.radius - subjectRadius;
  const extremaPayload = parseNativeJson<ExtremaPayload>(
    input.context.native.extrema(
      references.subject.occurrence,
      references.subject.face,
      references.target.occurrence,
      references.target.face,
    ),
  );
  if ('error' in extremaPayload) {
    return nativeError(input, 'extrema', extremaPayload.error);
  }
  const frame: InsertionAxisFrame = { origin: bore.origin, direction: bore.direction };
  const measured = measureEngagedSpan({
    input,
    references,
    subjectEntity,
    frame,
    band: projectedSpan(bore.bounds, frame),
    targetVoid: true,
  });
  if (isEvidence(measured)) {
    return measured;
  }
  const { depth, step } = measured;
  const depthTolerance = Math.max(tolerance, step);
  const { min, max } = input.expectation;
  const broadPhase = aabbBroadPhase({
    subject: subjectEntity,
    target: targetEntity,
    linearMm: input.context.tolerances.linearMm,
  });
  const final: RelationshipFinalEvidence = {
    method: 'classification',
    measured: { radialClearance, lateralGap: extremaPayload.distance, depth },
    expected: {
      minRadialClearance: 0,
      tolerance,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    },
    witnesses: [
      ...analyticWitnesses(subjectEntity, targetEntity),
      pointWitness(extremaPayload.pointA, subjectEntity.topologyRef),
      pointWitness(extremaPayload.pointB, targetEntity.topologyRef),
    ],
  };
  const draft = { input, final, ...(broadPhase ? { broadPhase } : {}) };
  if (radialClearance + tolerance < 0) {
    return failEvidence({
      ...draft,
      message: `expected the subject to fit the bore radially, but the subject radius ${subjectRadius}mm exceeds the bore radius ${bore.radius}mm by ${(-radialClearance).toFixed(4)}mm.`,
      suggestion: 'Reduce the subject radius or enlarge the bore so the radial clearance is non-negative.',
    });
  }
  if (extremaPayload.distance + tolerance < radialClearance) {
    return failEvidence({
      ...draft,
      message: `expected the lateral surfaces to realize the ${radialClearance.toFixed(4)}mm coaxial radial clearance, but the exact extrema gap is ${extremaPayload.distance}mm — eccentric contact or wall interference.`,
      suggestion: 'Re-centre the subject on the bore axis; the extrema witness pair marks the closest approach.',
    });
  }
  if (min === undefined ? depth <= 0 : depth + depthTolerance < min) {
    const requirement = min === undefined ? 'a positive engaged span' : `an engaged span of at least ${min}mm`;
    return failEvidence({
      ...draft,
      message: `expected ${requirement} along the bore axis, but the classified engaged span inside the bore is ${depth.toFixed(3)}mm.`,
      suggestion:
        'Translate the subject along the bore axis until it occupies the bore, or correct the declared containment target.',
    });
  }
  if (max !== undefined && depth - depthTolerance > max) {
    return failEvidence({
      ...draft,
      message: `expected an engaged span of at most ${max}mm along the bore axis, but the classified engaged span is ${depth.toFixed(3)}mm.`,
      suggestion: 'Withdraw the subject along the bore axis until the engaged span is inside the declared band.',
    });
  }
  return passEvidence({ final, ...(broadPhase ? { broadPhase } : {}) });
};

/**
 * Containment proof, dispatched on the resolved target's entity view:
 *
 * - **Bore target** (cylindrical interface — axis + radius + bounds): proves
 *   containment *in the bore void* — radial fit from SB3 facts, exact extrema
 *   between the two lateral surfaces confirming the coaxial clearance is
 *   realized (no eccentric contact/wall interference), and a positive engaged
 *   span along the bore axis via exact solid classification (subject material
 *   present, container material absent, station inside the bore's axial
 *   band). `min`/`max` on the expectation bound the engaged span.
 * - **Planar target**: `unsupported` — a plane bounds no volume.
 * - **Solid/occurrence target**: exact solid classification of boundary
 *   samples of the contained entity (face-fact centroids plus projected
 *   bounds corners, `containmentSamplesPerFace` per face) against the
 *   container *material*; all samples must classify `in` or `on`. Cavity
 *   containment (subject inside a container's void) is deliberately NOT
 *   proved this way: with the available exact operations, "out of material
 *   plus inside the AABB envelope" cannot distinguish a point in the cavity
 *   from one outside the part (the corpus's `containment.aabb-inside`
 *   premise), so such claims stay honest failures/pending rather than
 *   approximations.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with classification evidence and witnesses.
 * @public
 */
export const proveContainment = (input: RelationshipProofInput): RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const references = requireShapeReferences({
    input,
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
  });
  if (isEvidence(references)) {
    return references;
  }
  const targetEntity = endpoints.target.entity;
  const bore = boreAxisView(targetEntity.facts);
  if (bore) {
    return proveBoreContainment({ input, endpoints, references, bore });
  }
  if (targetEntity.entityType === 'plane' || targetEntity.facts.surfaceType === 'plane') {
    return unsupportedEvidence({
      input,
      message:
        'The containment target resolves to a planar entity, which bounds no volume; containment needs a bore (cylindrical interface) or a solid/occurrence target.',
      suggestion: 'Target the bore interface or the containing occurrence instead of a plane.',
    });
  }
  const points = containedSampleFacts(endpoints.subject.entity, input.context.index).flatMap((facts) =>
    faceSamplePoints(facts, input.context.tolerances.linearMm),
  );
  if (points.length === 0) {
    return analyticUnsupported(input, 'subject', 'boundary face (centroid + bounds)');
  }
  const raw = input.context.native.classifyPoints(references.target.occurrence, JSON.stringify(points));
  const payload = parseNativeJson<ClassificationPayload>(raw);
  if ('error' in payload) {
    return nativeError(input, 'classifyPoints', payload.error);
  }
  const outsideIndex = payload.states.indexOf('out');
  const outsideCount = payload.states.filter((state) => state === 'out').length;
  const broadPhase = aabbBroadPhase({
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
    linearMm: input.context.tolerances.linearMm,
  });
  const outsidePoint = outsideIndex === -1 ? undefined : points[outsideIndex];
  const final: RelationshipFinalEvidence = {
    method: 'classification',
    measured: { samples: points.length, outside: outsideCount },
    expected: { outside: 0 },
    witnesses: outsidePoint ? [pointWitness(outsidePoint, endpoints.subject.entity.topologyRef)] : [],
  };
  if (outsideCount === 0) {
    return passEvidence({ final, ...(broadPhase ? { broadPhase } : {}) });
  }
  return failEvidence({
    input,
    message: `expected the subject boundary inside the target solid, but ${outsideCount} of ${points.length} exact classification samples are outside.`,
    suggestion:
      'Move or resize the subject so its boundary stays inside the target solid; the witness point marks the first escape.',
    final,
    ...(broadPhase ? { broadPhase } : {}),
  });
};

/**
 * Insertion-depth proof: exact solid classifications at
 * `insertionAxisStations` midpoint stations along the declared axis
 * across the subject's axial span; depth is the engaged span, with the exact
 * extrema pair as the engagement witness. When the target resolves to a bore
 * (cylindrical interface), engagement means the bore *void*: subject material
 * present, container material absent, station inside the bore's axial band —
 * the audit's threaded-reach semantics. Otherwise engagement means material
 * co-occupancy of both solids.
 *
 * @param input - Resolved endpoints, expectation (declares `axis`), and context.
 * @returns Verdict with classification evidence, depth, and witnesses.
 * @public
 */
export const proveInsertion = (input: RelationshipProofInput): RelationshipEvidence => {
  const declaredAxis = input.expectation.axis;
  if (!declaredAxis) {
    return unsupportedEvidence({
      input,
      message: "kind 'insertion' requires the expectation to declare the insertion axis.",
      suggestion: 'Declare axis: [x, y, z] on the insertion relationship (subject-frame direction of insertion).',
    });
  }
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const references = requireShapeReferences({
    input,
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
  });
  if (isEvidence(references)) {
    return references;
  }
  const frame = insertionAxisFrame(endpoints.subject.entity, declaredAxis);
  if (!frame) {
    return analyticUnsupported(input, 'subject', 'axis origin and bounds');
  }
  const bore = boreAxisView(endpoints.target.entity.facts);
  const measured = measureEngagedSpan({
    input,
    references,
    subjectEntity: endpoints.subject.entity,
    frame,
    ...(bore ? { band: projectedSpan(bore.bounds, frame), targetVoid: true } : {}),
  });
  if (isEvidence(measured)) {
    return measured;
  }
  const { depth, step } = measured;
  const extremaPayload = parseNativeJson<ExtremaPayload>(
    input.context.native.extrema(
      references.subject.occurrence,
      references.subject.face,
      references.target.occurrence,
      references.target.face,
    ),
  );
  const witnesses: RelationshipWitness[] =
    'error' in extremaPayload
      ? []
      : [
          pointWitness(extremaPayload.pointA, endpoints.subject.entity.topologyRef),
          pointWitness(extremaPayload.pointB, endpoints.target.entity.topologyRef),
        ];
  const tolerance = Math.max(input.expectation.tolerance ?? input.context.tolerances.linearMm, step);
  const min = input.expectation.min ?? 0;
  const max = input.expectation.max ?? Number.POSITIVE_INFINITY;
  const broadPhase = aabbBroadPhase({
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
    linearMm: input.context.tolerances.linearMm,
  });
  const final: RelationshipFinalEvidence = {
    method: 'classification',
    measured: { depth, ...('error' in extremaPayload ? {} : { distance: extremaPayload.distance }) },
    expected: {
      ...(input.expectation.min === undefined ? {} : { min }),
      ...(input.expectation.max === undefined ? {} : { max }),
      tolerance,
    },
    witnesses,
  };
  if (depth + tolerance >= min && depth - tolerance <= max) {
    return passEvidence({ final, ...(broadPhase ? { broadPhase } : {}) });
  }
  return failEvidence({
    input,
    message: `expected insertion depth in [${min}, ${max === Number.POSITIVE_INFINITY ? '∞' : max}]mm along the declared axis, but the classified engaged span is ${depth.toFixed(3)}mm.`,
    suggestion:
      'Translate the subject along the declared axis until the engaged span meets the declared depth, or correct the axis declaration.',
    final,
    ...(broadPhase ? { broadPhase } : {}),
  });
};

// --- boolean-intersection proof (interference) -----------------------------------

type CommonVolumePayload = { volume: number; centroid: Vec3 };

/**
 * Exact interference proof: `BRepAlgoAPI_Common`-class boolean volume of the
 * resolved solid pair. Positive common volume outside the declared allowance
 * band fails with the measured volume and the intersection centroid witness.
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns Verdict with boolean-intersection evidence.
 * @public
 */
export const proveInterference = (input: RelationshipProofInput): RelationshipEvidence => {
  const endpoints = proofEndpoints(input);
  if (isEvidence(endpoints)) {
    return endpoints;
  }
  const references = requireShapeReferences({
    input,
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
  });
  if (isEvidence(references)) {
    return references;
  }
  const payload = parseNativeJson<CommonVolumePayload>(
    input.context.native.commonVolume(references.subject.occurrence, references.target.occurrence),
  );
  if ('error' in payload) {
    return nativeError(input, 'commonVolume', payload.error);
  }
  const { linearMm } = input.context.tolerances;
  // Volume noise floor derived from the shared linear tolerance (a cube of
  // side linearMm), so boolean slivers below manufacturing resolution never
  // decide a verdict — no local tolerance literal.
  const volumeTolerance = linearMm ** 3;
  const min = input.expectation.minVolume ?? 0;
  const max = input.expectation.maxVolume ?? 0;
  const broadPhase = aabbBroadPhase({
    subject: endpoints.subject.entity,
    target: endpoints.target.entity,
    linearMm,
  });
  const final: RelationshipFinalEvidence = {
    method: 'boolean-intersection',
    measured: { volume: payload.volume },
    expected: { minVolume: min, maxVolume: max },
    witnesses: payload.volume > volumeTolerance ? [pointWitness(payload.centroid, undefined)] : [],
  };
  if (payload.volume >= min - volumeTolerance && payload.volume <= max + volumeTolerance) {
    return passEvidence({ final, ...(broadPhase ? { broadPhase } : {}) });
  }
  return failEvidence({
    input,
    message: `expected exact intersection volume in [${min}, ${max}]mm³, but the boolean common volume is ${payload.volume}mm³ centred at [${payload.centroid.join(', ')}].`,
    suggestion:
      payload.volume > max
        ? 'Separate the components at the witness centroid, or declare the intentional interference band with minVolume/maxVolume and a reason.'
        : 'Restore the declared intentional interference, or relax the declared minVolume.',
    final,
    ...(broadPhase ? { broadPhase } : {}),
  });
};

/**
 * Route one relationship expectation to its proof family after the
 * evidence-policy guard: extrema (contact/clearance), analytic
 * (coaxial/concentric/coplanar/parallel/perpendicular/angle), classification
 * (containment/insertion), or boolean intersection (interference).
 *
 * @param input - Resolved endpoints, expectation, and proof context.
 * @returns The relationship verdict with evidence.
 * @public
 */
export const proveRelationship = (input: RelationshipProofInput): RelationshipEvidence => {
  const rejected = explicitEndpointRejection(input);
  if (rejected) {
    return rejected;
  }
  switch (input.expectation.kind) {
    case 'contact': {
      return proveContact(input);
    }
    case 'clearance': {
      return proveClearance(input);
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
    case 'coaxial':
    case 'concentric': {
      return proveCoaxial(input);
    }
    case 'coplanar': {
      return proveCoplanar(input);
    }
    case 'parallel':
    case 'perpendicular':
    case 'angle': {
      return proveDirectionAngle(input);
    }
  }
};
