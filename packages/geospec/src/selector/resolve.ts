/**
 * L3 selector resolution engine (SB3-R3).
 *
 * `resolve(selector, index)` is pure and deterministic: a function of the
 * selector and the per-subject index only — no I/O, no wasm calls, no
 * cross-artifact caching (D1). Results are set-valued with first-class
 * `unmatched | ambiguous | unsupported | stale` outcomes; the engine never
 * silently picks a candidate or downgrades evidence.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import {
  ambiguousDiagnostic,
  missingStampedFactsDiagnostic,
  staleDiagnostic,
  unmatchedDiagnostic,
  unsupportedEvidenceDiagnostic,
} from '#selector/diagnostics.js';
import { parseSelectorPath } from '#selector/grammar.js';
import type {
  SelectorBodyRow,
  SelectorDatumRow,
  SelectorFaceRow,
  SelectorGroupRow,
  SelectorIndex,
  SelectorInterfaceRow,
  SelectorOccurrenceRow,
} from '#selector/index-builder.js';
import { compareStampedFacts } from '#selector/stale.js';
import { resolveTolerances } from '#selector/tolerances.js';
import type { SelectorTolerances } from '#selector/tolerances.js';
import type {
  AxisSelector,
  BodySelector,
  CandidateEntity,
  Cardinality,
  DatumSelector,
  FaceQuery,
  FaceSelector,
  GeometryFacts,
  GeometrySelection,
  GeometrySelectionStability,
  GeometrySelector,
  GroupSelector,
  InterfaceSelector,
  NumericRange,
  OccurrenceSelector,
  PlaneSelector,
  RayPredicate,
  ResolvedEntity,
} from '#selector/types.js';
import {
  angleBetweenDegrees,
  axisAngleBetweenDegrees,
  distance,
  dot,
  normalize,
  scale,
  subtract,
} from '#selector/vector-math.js';

type ResolveContext = {
  index: SelectorIndex;
  tolerances: SelectorTolerances;
};

type QuerySelector = FaceSelector | AxisSelector | PlaneSelector | BodySelector;

/** Structural superset all query shapes evaluate through. */
type QueryLike = FaceQuery;

const rayEpsilon = 1e-9;
const nearMissLimit = 3;

const textMatches = (matcher: string | RegExp, value: string): boolean => {
  if (typeof matcher === 'string') {
    return matcher === value;
  }
  matcher.lastIndex = 0;
  const matched = matcher.test(value);
  matcher.lastIndex = 0;
  return matched;
};

const occurrenceMatchesScope = (occurrence: SelectorOccurrenceRow, scope: string | RegExp): boolean =>
  textMatches(scope, occurrence.path) ||
  textMatches(scope, occurrence.productName) ||
  (occurrence.instanceName !== undefined && textMatches(scope, occurrence.instanceName));

const occurrenceEntity = (row: SelectorOccurrenceRow): ResolvedEntity => ({
  id: `occurrence:${row.path}`,
  entityType: 'occurrence',
  occurrencePath: row.path,
  facts: {
    transform: row.transform,
    productName: row.productName,
    ...(row.bounds ? { bounds: row.bounds } : {}),
  },
  topologyRef: `#o${row.ordinalPath.join('.')}`,
});

const faceEntity = (row: SelectorFaceRow, view: 'face' | 'axis' | 'plane'): ResolvedEntity => ({
  id: view === 'face' ? row.id : `${view}:${row.occurrencePath}#${row.faceIndex}`,
  entityType: view,
  occurrencePath: row.occurrencePath,
  facts: { ...row.facts },
  topologyRef: row.topologyRef,
});

const bodyEntity = (row: SelectorBodyRow): ResolvedEntity => ({
  id: row.id,
  entityType: 'body',
  occurrencePath: row.occurrencePath,
  facts: {
    area: row.area,
    ...(row.centroid ? { centroid: row.centroid } : {}),
    ...(row.bounds ? { bounds: row.bounds } : {}),
  },
});

const datumEntity = (row: SelectorDatumRow): ResolvedEntity => ({
  id: row.id,
  entityType: 'datum',
  occurrencePath: row.occurrencePath,
  facts: { origin: row.origin, xAxis: row.xAxis, zAxis: row.zAxis },
});

const interfaceEntity = (row: SelectorInterfaceRow): ResolvedEntity => ({
  id: row.id,
  entityType: row.face ? 'face' : 'interface',
  occurrencePath: row.occurrencePath,
  facts: row.face ? { ...row.face.facts } : { faceIndex: row.faceIndex },
  ...(row.face ? { topologyRef: row.face.topologyRef } : {}),
});

const rankCandidates = (entities: ResolvedEntity[]): CandidateEntity[] =>
  entities.map((entity, position) => ({ ...entity, rank: position + 1 }));

type SelectionDraft = {
  selector: GeometrySelector;
  expected: Cardinality;
  stability: GeometrySelectionStability;
};

type FailureDraft = SelectionDraft & {
  message: string;
  suggestion: string;
  candidates?: CandidateEntity[];
  details?: Record<string, unknown>;
};

const resolvedSelection = (
  draft: SelectionDraft & { entities: ResolvedEntity[]; diagnostics?: GeometryDiagnostic[] },
): GeometrySelection => ({
  selector: draft.selector,
  status: 'resolved',
  entities: draft.entities,
  expected: draft.expected,
  source: 'step-xde',
  stability: draft.stability,
  diagnostics: draft.diagnostics ?? [],
});

const failedSelection = (status: 'unmatched' | 'ambiguous' | 'unsupported', draft: FailureDraft): GeometrySelection => {
  const builders = {
    unmatched: unmatchedDiagnostic,
    ambiguous: ambiguousDiagnostic,
    unsupported: unsupportedEvidenceDiagnostic,
  } as const;
  return {
    selector: draft.selector,
    status,
    entities: [],
    expected: draft.expected,
    source: 'step-xde',
    stability: draft.stability,
    ...(draft.candidates ? { candidates: draft.candidates } : {}),
    diagnostics: [
      builders[status]({
        selector: draft.selector,
        stability: draft.stability,
        message: draft.message,
        suggestion: draft.suggestion,
        ...(draft.candidates ? { candidates: draft.candidates } : {}),
        ...(draft.details ? { details: draft.details } : {}),
      }),
    ],
  };
};

const staleSelection = (draft: FailureDraft & { staleReason: string }): GeometrySelection => ({
  selector: draft.selector,
  status: 'stale',
  entities: [],
  expected: draft.expected,
  source: 'step-xde',
  stability: draft.stability,
  ...(draft.candidates ? { candidates: draft.candidates } : {}),
  staleReason: draft.staleReason,
  diagnostics: [
    staleDiagnostic({
      selector: draft.selector,
      stability: draft.stability,
      message: draft.message,
      suggestion: draft.suggestion,
      ...(draft.candidates ? { candidates: draft.candidates } : {}),
      ...(draft.details ? { details: draft.details } : {}),
    }),
  ],
});

const cardinalityCount = (expected: Cardinality): { exact?: number; atLeast?: number } => {
  if (expected === 'one') {
    return { exact: 1 };
  }
  if (expected === 'many') {
    return { atLeast: 1 };
  }
  return 'exactly' in expected ? { exact: expected.exactly } : { atLeast: expected.atLeast };
};

const cardinalitySelection = (options: {
  draft: SelectionDraft;
  matches: ResolvedEntity[];
  nearMisses?: CandidateEntity[];
  diagnostics?: GeometryDiagnostic[];
}): GeometrySelection => {
  const { draft, matches } = options;
  const { exact, atLeast } = cardinalityCount(draft.expected);
  if (matches.length === 0) {
    return failedSelection('unmatched', {
      ...draft,
      message: `Selector matched no entities (expected ${JSON.stringify(draft.expected)}).`,
      suggestion:
        'Inspect the near-miss candidates and their excluding predicates, then relax or correct the failing predicate.',
      ...(options.nearMisses ? { candidates: options.nearMisses } : {}),
    });
  }
  if (draft.expected === 'one' && matches.length > 1) {
    return failedSelection('ambiguous', {
      ...draft,
      message: `Selector expected one entity but matched ${matches.length}.`,
      suggestion:
        'Add a disambiguating predicate (surface type, normal/axis direction, offset band, probe) or widen the cardinality expectation.',
      candidates: rankCandidates(matches),
    });
  }
  if ((exact !== undefined && matches.length !== exact) || (atLeast !== undefined && matches.length < atLeast)) {
    return failedSelection('unmatched', {
      ...draft,
      message: `Selector matched ${matches.length} entities but expected ${JSON.stringify(draft.expected)}.`,
      suggestion: 'Check the found-vs-expected counts in the payload; the artifact drifted from the declared contract.',
      candidates: rankCandidates(matches),
      details: { found: matches.length, expected: draft.expected },
    });
  }
  return resolvedSelection({
    ...draft,
    entities: matches,
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
  });
};

// --- query predicate evaluation ------------------------------------------

const rangeMatches = (options: { range: NumericRange; value: number | undefined; linearMm: number }): boolean => {
  const { range, value } = options;
  if (value === undefined) {
    return false;
  }
  if (typeof range === 'number') {
    return Math.abs(value - range) <= options.linearMm;
  }
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
};

const boundsContain = (options: {
  bounds: { min: Vec3; max: Vec3 } | undefined;
  point: Vec3;
  linearMm: number;
}): boolean => {
  const { bounds, point, linearMm } = options;
  if (!bounds) {
    return false;
  }
  return point.every((coordinate, axis) => {
    const min = bounds.min[axis] ?? 0;
    const max = bounds.max[axis] ?? 0;
    return coordinate >= min - linearMm && coordinate <= max + linearMm;
  });
};

const axisDistance = (facts: GeometryFacts, point: Vec3): number | undefined => {
  if (!facts.axisOrigin || !facts.axisDirection) {
    return undefined;
  }
  const direction = normalize(facts.axisDirection);
  if (!direction) {
    return undefined;
  }
  const offsetVector = subtract(point, facts.axisOrigin);
  const projected = scale(direction, dot(offsetVector, direction));
  return distance(offsetVector, projected);
};

const surfaceResidual = (facts: GeometryFacts, point: Vec3): number | undefined => {
  // Ponytail: analytic residual for planes and cylinders only; other surface
  // types fall back to bounds containment (extend with sphere/cone residuals
  // when a fixture needs them).
  if (facts.surfaceType === 'plane' && facts.normal && facts.offset !== undefined) {
    return Math.abs(dot(facts.normal, point) - facts.offset);
  }
  if (facts.surfaceType === 'cylinder' && facts.radius !== undefined) {
    const radial = axisDistance(facts, point);
    return radial === undefined ? undefined : Math.abs(radial - facts.radius);
  }
  return undefined;
};

const containsPointMatches = (options: { facts: GeometryFacts; point: Vec3; linearMm: number }): boolean => {
  if (!boundsContain({ bounds: options.facts.bounds, point: options.point, linearMm: options.linearMm })) {
    return false;
  }
  const residual = surfaceResidual(options.facts, options.point);
  return residual === undefined || residual <= options.linearMm;
};

const nearMatches = (options: {
  near: Partial<{ x: number; y: number; z: number }> & { tolerance?: number };
  centroid: Vec3 | undefined;
  linearMm: number;
}): boolean => {
  const { near, centroid } = options;
  if (!centroid) {
    return false;
  }
  const tolerance = near.tolerance ?? options.linearMm;
  const axes = [near.x, near.y, near.z];
  return axes.every(
    (expected, axis) => expected === undefined || Math.abs((centroid[axis] ?? 0) - expected) <= tolerance,
  );
};

type PredicateInput = { facts: GeometryFacts; tolerances: SelectorTolerances };

type BasePredicate = {
  name: string;
  /** `undefined` when the predicate is absent from the query. */
  matches: (query: QueryLike, input: PredicateInput) => boolean | undefined;
};

const directionPredicate = (options: {
  predicate: { direction: Vec3; angularToleranceDegrees?: number } | undefined;
  observed: Vec3 | undefined;
  input: PredicateInput;
  axisSemantics: boolean;
}): boolean | undefined => {
  const { predicate, observed } = options;
  if (predicate === undefined) {
    return undefined;
  }
  if (!observed) {
    return false;
  }
  const angle = options.axisSemantics
    ? axisAngleBetweenDegrees(observed, predicate.direction)
    : angleBetweenDegrees(observed, predicate.direction);
  const tolerance = predicate.angularToleranceDegrees ?? options.input.tolerances.angularToleranceDegrees;
  return angle !== undefined && angle <= tolerance;
};

const basePredicates: BasePredicate[] = [
  {
    name: 'surfaceType',
    matches: (query, input) =>
      query.surfaceType === undefined ? undefined : input.facts.surfaceType === query.surfaceType,
  },
  {
    name: 'normal',
    // Face normals compare orientation-sensitively; a parallel-but-flipped
    // normal denotes the opposite face of a slab.
    matches: (query, input) =>
      directionPredicate({ predicate: query.normal, observed: input.facts.normal, input, axisSemantics: false }),
  },
  {
    name: 'axis',
    matches: (query, input) =>
      directionPredicate({ predicate: query.axis, observed: input.facts.axisDirection, input, axisSemantics: true }),
  },
  {
    name: 'radius',
    matches: (query, input) =>
      query.radius === undefined
        ? undefined
        : rangeMatches({ range: query.radius, value: input.facts.radius, linearMm: input.tolerances.linearMm }),
  },
  {
    name: 'area',
    matches: (query, input) =>
      query.area === undefined
        ? undefined
        : rangeMatches({ range: query.area, value: input.facts.area, linearMm: input.tolerances.linearMm }),
  },
  {
    name: 'offset',
    matches: (query, input) =>
      query.offset === undefined
        ? undefined
        : rangeMatches({ range: query.offset, value: input.facts.offset, linearMm: input.tolerances.linearMm }),
  },
  {
    name: 'near',
    matches: (query, input) =>
      query.near === undefined
        ? undefined
        : nearMatches({ near: query.near, centroid: input.facts.centroid, linearMm: input.tolerances.linearMm }),
  },
  {
    name: 'containsPoint',
    matches: (query, input) =>
      query.containsPoint === undefined
        ? undefined
        : containsPointMatches({ facts: input.facts, point: query.containsPoint, linearMm: input.tolerances.linearMm }),
  },
];

/**
 * Returns the name of the first failing predicate, or undefined when the
 * entity matches. Nested set-algebra queries evaluate geometric predicates
 * only; probes/ordering are top-level concerns.
 */
const queryPredicateFailure = (query: QueryLike, input: PredicateInput): string | undefined => {
  for (const predicate of basePredicates) {
    if (predicate.matches(query, input) === false) {
      return predicate.name;
    }
  }
  for (const sub of query.allOf ?? []) {
    const failure = queryPredicateFailure(sub, input);
    if (failure !== undefined) {
      return `allOf.${failure}`;
    }
  }
  if (
    query.anyOf &&
    query.anyOf.length > 0 &&
    !query.anyOf.some((sub) => queryPredicateFailure(sub, input) === undefined)
  ) {
    return 'anyOf';
  }
  if (query.not && queryPredicateFailure(query.not, input) === undefined) {
    return 'not';
  }
  return undefined;
};

// --- probes ----------------------------------------------------------------

const planeRayParameter = (options: {
  facts: GeometryFacts;
  ray: RayPredicate;
  linearMm: number;
}): number | undefined => {
  const { facts, ray } = options;
  if (!facts.normal || facts.offset === undefined) {
    return undefined;
  }
  const denominator = dot(facts.normal, ray.direction);
  if (Math.abs(denominator) < rayEpsilon) {
    return undefined;
  }
  const parameter = (facts.offset - dot(facts.normal, ray.origin)) / denominator;
  if (parameter < -options.linearMm) {
    return undefined;
  }
  const point: Vec3 = [
    ray.origin[0] + parameter * ray.direction[0],
    ray.origin[1] + parameter * ray.direction[1],
    ray.origin[2] + parameter * ray.direction[2],
  ];
  return boundsContain({ bounds: facts.bounds, point, linearMm: options.linearMm }) ? parameter : undefined;
};

const cylinderRayParameter = (options: {
  facts: GeometryFacts;
  ray: RayPredicate;
  linearMm: number;
}): number | undefined => {
  const { facts, ray } = options;
  if (!facts.axisOrigin || !facts.axisDirection || facts.radius === undefined) {
    return undefined;
  }
  const axis = normalize(facts.axisDirection);
  if (!axis) {
    return undefined;
  }
  const originOffset = subtract(ray.origin, facts.axisOrigin);
  const originPerpendicular = subtract(originOffset, scale(axis, dot(originOffset, axis)));
  const directionPerpendicular = subtract(ray.direction, scale(axis, dot(ray.direction, axis)));
  const a = dot(directionPerpendicular, directionPerpendicular);
  const b = 2 * dot(originPerpendicular, directionPerpendicular);
  const c = dot(originPerpendicular, originPerpendicular) - facts.radius * facts.radius;
  if (a < rayEpsilon) {
    return undefined; // Ray parallel to the axis never crosses the wall.
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return undefined;
  }
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const roots = [(-b - sqrtDiscriminant) / (2 * a), (-b + sqrtDiscriminant) / (2 * a)];
  const hits = roots.filter((root) => {
    if (root < -options.linearMm) {
      return false;
    }
    const point: Vec3 = [
      ray.origin[0] + root * ray.direction[0],
      ray.origin[1] + root * ray.direction[1],
      ray.origin[2] + root * ray.direction[2],
    ];
    return boundsContain({ bounds: facts.bounds, point, linearMm: options.linearMm });
  });
  return hits.length > 0 ? Math.min(...hits) : undefined;
};

type RayProbeOutcome =
  | { kind: 'hit'; entity: ResolvedEntity }
  | { kind: 'none' }
  | { kind: 'unsupported'; unevaluable: string[] };

const applyRayProbe = (options: {
  matches: ResolvedEntity[];
  ray: RayPredicate;
  linearMm: number;
}): RayProbeOutcome => {
  const unevaluable: string[] = [];
  const hits: Array<{ entity: ResolvedEntity; parameter: number }> = [];
  for (const entity of options.matches) {
    const { surfaceType } = entity.facts;
    if (surfaceType === 'plane') {
      const parameter = planeRayParameter({ facts: entity.facts, ray: options.ray, linearMm: options.linearMm });
      if (parameter !== undefined) {
        hits.push({ entity, parameter });
      }
    } else if (surfaceType === 'cylinder') {
      const parameter = cylinderRayParameter({ facts: entity.facts, ray: options.ray, linearMm: options.linearMm });
      if (parameter !== undefined) {
        hits.push({ entity, parameter });
      }
    } else {
      unevaluable.push(entity.id);
    }
  }
  if (unevaluable.length > 0) {
    // Never approximate a ray hit with AABBs: candidates the analytic probe
    // cannot evaluate make the whole probe unsupported (deferred, not faked).
    return { kind: 'unsupported', unevaluable };
  }
  if (hits.length === 0) {
    return { kind: 'none' };
  }
  hits.sort((a, b) => a.parameter - b.parameter || a.entity.id.localeCompare(b.entity.id));
  const first = hits[0];
  return first ? { kind: 'hit', entity: first.entity } : { kind: 'none' };
};

type NearestOutcome =
  | { kind: 'nearest'; entity: ResolvedEntity }
  | { kind: 'tie'; candidates: CandidateEntity[] }
  | { kind: 'none' };

const applyNearestProbe = (options: { matches: ResolvedEntity[]; point: Vec3; linearMm: number }): NearestOutcome => {
  const measured = options.matches
    .filter((entity) => entity.facts.centroid !== undefined)
    .map((entity) => ({ entity, distance: distance(entity.facts.centroid ?? [0, 0, 0], options.point) }))
    .sort((a, b) => a.distance - b.distance || a.entity.id.localeCompare(b.entity.id));
  const first = measured[0];
  if (!first) {
    return { kind: 'none' };
  }
  const second = measured[1];
  if (second && second.distance - first.distance <= options.linearMm) {
    return {
      kind: 'tie',
      candidates: measured
        .filter((candidate) => candidate.distance - first.distance <= options.linearMm)
        .map((candidate, position) => ({ ...candidate.entity, rank: position + 1, distance: candidate.distance })),
    };
  }
  return { kind: 'nearest', entity: first.entity };
};

// --- ordering and pick -------------------------------------------------------

const orderValue = (entity: ResolvedEntity, query: QueryLike): number => {
  if (query.orderBy === 'radius') {
    return entity.facts.radius ?? Number.POSITIVE_INFINITY;
  }
  if (query.orderBy === 'offsetAlong') {
    const along = normalize(query.along ?? [0, 0, 1]) ?? [0, 0, 1];
    return entity.facts.centroid ? dot(entity.facts.centroid, along) : Number.POSITIVE_INFINITY;
  }
  return entity.facts.area ?? Number.POSITIVE_INFINITY;
};

const applyOrderAndPick = (matches: ResolvedEntity[], query: QueryLike): ResolvedEntity[] => {
  if (query.orderBy === undefined && query.pick === undefined) {
    return matches;
  }
  const ordered = [...matches].sort((a, b) => orderValue(a, query) - orderValue(b, query) || a.id.localeCompare(b.id));
  if (query.pick === undefined) {
    return ordered;
  }
  if (query.pick === 'first') {
    return ordered.slice(0, 1);
  }
  if (query.pick === 'last') {
    return ordered.slice(-1);
  }
  const position = query.pick >= 0 ? query.pick : ordered.length + query.pick;
  const picked = ordered[position];
  return picked ? [picked] : [];
};

// --- pools and scoping -------------------------------------------------------

const scopedOccurrencePaths = (options: {
  of: string | RegExp | undefined;
  context: ResolveContext;
}): Set<string> | undefined => {
  if (options.of === undefined) {
    return undefined;
  }
  const scope = options.of;
  return new Set(
    options.context.index.occurrences
      .filter((occurrence) => occurrenceMatchesScope(occurrence, scope))
      .map((occurrence) => occurrence.path),
  );
};

const withinOccurrencePaths = (options: {
  within: GeometrySelector | undefined;
  context: ResolveContext;
}): Set<string> | undefined => {
  if (options.within === undefined) {
    return undefined;
  }
  const selection = resolveWithContext(options.within, options.context);
  return new Set(
    selection.entities.flatMap((entity) => (entity.occurrencePath === undefined ? [] : [entity.occurrencePath])),
  );
};

const queryEntityPool = (selector: QuerySelector, context: ResolveContext): ResolvedEntity[] => {
  const { index } = context;
  if (selector.kind === 'body') {
    return index.bodies.map((row) => bodyEntity(row));
  }
  if (selector.kind === 'axis') {
    return index.faces
      .filter(
        (row) =>
          row.facts.axisDirection !== undefined &&
          (row.facts.surfaceType === 'cylinder' || row.facts.surfaceType === 'cone'),
      )
      .map((row) => faceEntity(row, 'axis'));
  }
  if (selector.kind === 'plane') {
    return index.faces.filter((row) => row.facts.surfaceType === 'plane').map((row) => faceEntity(row, 'plane'));
  }
  return index.faces.map((row) => faceEntity(row, 'face'));
};

const usesProbe = (query: QueryLike): boolean =>
  query.containsPoint !== undefined || query.nearestTo !== undefined || query.hitByRay !== undefined;

// --- per-kind resolution -----------------------------------------------------

const resolveQuerySelector = (selector: QuerySelector, context: ResolveContext): GeometrySelection => {
  const query = (selector.query ?? {}) as QueryLike;
  const draft: SelectionDraft = {
    selector,
    expected: selector.expect ?? 'one',
    stability: usesProbe(query) ? 'derived-probe' : 'derived-query',
  };
  const scope = scopedOccurrencePaths({ of: selector.of, context });
  const within = withinOccurrencePaths({ within: query.within, context });
  const pool = queryEntityPool(selector, context).filter(
    (entity) =>
      (scope === undefined || (entity.occurrencePath !== undefined && scope.has(entity.occurrencePath))) &&
      (within === undefined || (entity.occurrencePath !== undefined && within.has(entity.occurrencePath))),
  );
  const evaluated = pool.map((entity) => ({
    entity,
    excludedBy: queryPredicateFailure(query, { facts: entity.facts, tolerances: context.tolerances }),
  }));
  let matches = evaluated
    .filter((candidate) => candidate.excludedBy === undefined)
    .map((candidate) => candidate.entity);
  if (query.hitByRay) {
    const outcome = applyRayProbe({ matches, ray: query.hitByRay, linearMm: context.tolerances.linearMm });
    if (outcome.kind === 'unsupported') {
      return failedSelection('unsupported', {
        ...draft,
        message: `hitByRay supports analytic plane and cylinder faces in V1; ${outcome.unevaluable.length} candidate(s) cannot be evaluated.`,
        suggestion:
          'Narrow the query with surfaceType/scope predicates so only analytic faces remain, or select the face by authored name. Non-analytic ray probing is deferred, not approximated.',
        details: { unevaluableCandidates: outcome.unevaluable },
      });
    }
    matches = outcome.kind === 'hit' ? [outcome.entity] : [];
  }
  if (query.nearestTo) {
    const outcome = applyNearestProbe({ matches, point: query.nearestTo, linearMm: context.tolerances.linearMm });
    if (outcome.kind === 'tie') {
      return failedSelection('ambiguous', {
        ...draft,
        message: 'nearestTo probe found equidistant candidates; refusing to auto-pick.',
        suggestion: 'Move the probe point closer to the intended entity or add a disambiguating predicate.',
        candidates: outcome.candidates,
      });
    }
    matches = outcome.kind === 'nearest' ? [outcome.entity] : [];
  }
  matches = applyOrderAndPick(matches, query);
  const nearMisses = evaluated
    .filter((candidate) => candidate.excludedBy !== undefined)
    .slice(0, nearMissLimit)
    .map((candidate, position) => ({
      ...candidate.entity,
      rank: position + 1,
      ...(candidate.excludedBy === undefined ? {} : { excludedBy: candidate.excludedBy }),
    }));
  return cardinalitySelection({ draft, matches, nearMisses });
};

const resolveOccurrenceSelector = (selector: OccurrenceSelector, context: ResolveContext): GeometrySelection => {
  const draft: SelectionDraft = { selector, expected: selector.expect ?? 'one', stability: 'authored' };
  const matches = context.index.occurrences
    .filter(
      (occurrence) =>
        (selector.name === undefined || occurrenceMatchesScope(occurrence, selector.name)) &&
        (selector.path === undefined || textMatches(selector.path, occurrence.path)),
    )
    .map((occurrence) => occurrenceEntity(occurrence));
  const nearMisses = rankCandidates(
    context.index.occurrences.slice(0, nearMissLimit).map((occurrence) => occurrenceEntity(occurrence)),
  ).map((candidate) => ({ ...candidate, excludedBy: 'name' }));
  return cardinalitySelection({ draft, matches, ...(matches.length === 0 ? { nearMisses } : {}) });
};

const interfaceStaleReasons = (row: SelectorInterfaceRow, tolerances: SelectorTolerances): string[] => {
  if (row.dangling) {
    return [`authored faceIndex ${row.faceIndex} no longer exists in the geometry`];
  }
  if (row.stamped && row.face) {
    return compareStampedFacts({ stamped: row.stamped, observed: row.face.facts, tolerances }).reasons;
  }
  return [];
};

const resolveInterfaceRows = (options: {
  draft: SelectionDraft;
  rows: SelectorInterfaceRow[];
  context: ResolveContext;
  requestedName: string;
}): GeometrySelection => {
  const { draft, rows, context } = options;
  const firstStale = rows
    .map((row) => ({ row, reasons: interfaceStaleReasons(row, context.tolerances) }))
    .find((entry) => entry.reasons.length > 0);
  if (firstStale) {
    return staleSelection({
      ...draft,
      message: `Authored interface '${firstStale.row.fullName}' is stale: ${firstStale.reasons.join('; ')}.`,
      suggestion:
        'Re-export the artifact so authored names and stamped facts are re-evaluated; never trust either fact set silently.',
      staleReason: firstStale.reasons.join('; '),
      candidates: rankCandidates(rows.map((row) => interfaceEntity(row))),
      details: {
        stamped: firstStale.row.stamped,
        observed: firstStale.row.face?.facts,
        reasons: firstStale.reasons,
      },
    });
  }
  if (rows.length === 0) {
    if (context.index.interfaces.length === 0) {
      return failedSelection('unsupported', {
        ...draft,
        message: 'The artifact carries no authored interface names; interface selectors cannot resolve.',
        suggestion: `Author the interface in model code and re-export, or fall back to a derived query/probe selector for '${options.requestedName}'.`,
      });
    }
    const lastSegment = options.requestedName.split('.').at(-1) ?? options.requestedName;
    const nearMisses = context.index.interfaces
      .filter((row) => row.name === lastSegment || row.fullName.includes(lastSegment))
      .slice(0, nearMissLimit)
      .map((row, position) => ({ ...interfaceEntity(row), rank: position + 1, excludedBy: 'name' }));
    return failedSelection('unmatched', {
      ...draft,
      message: `No authored interface named '${options.requestedName}' exists in the artifact.`,
      suggestion:
        'Check the composed full name (`<occurrencePath>.<interfaceName>`) against the authored names in the payload.',
      candidates: nearMisses,
      details: { availableInterfaces: context.index.interfaces.map((row) => row.fullName) },
    });
  }
  const diagnostics = rows
    .filter((row) => row.stamped === undefined)
    .map((row) =>
      missingStampedFactsDiagnostic({
        interfaceName: row.fullName,
        reason: row.stampedAbsentReason ?? 'no geospec:facts property is stamped for this interface',
      }),
    );
  return cardinalitySelection({ draft, matches: rows.map((row) => interfaceEntity(row)), diagnostics });
};

const matchNamedRows = <Row extends { fullName: string; name: string; occurrencePath: string }>(options: {
  rows: Row[];
  name: string;
  of: string | RegExp | undefined;
  context: ResolveContext;
}): Row[] => {
  if (options.of === undefined) {
    return options.rows.filter((row) => row.fullName === options.name);
  }
  const scope = scopedOccurrencePaths({ of: options.of, context: options.context }) ?? new Set<string>();
  return options.rows.filter((row) => scope.has(row.occurrencePath) && row.name === options.name);
};

const resolveInterfaceSelector = (selector: InterfaceSelector, context: ResolveContext): GeometrySelection =>
  resolveInterfaceRows({
    draft: { selector, expected: selector.expect ?? 'one', stability: 'authored' },
    rows: matchNamedRows({ rows: context.index.interfaces, name: selector.name, of: selector.of, context }),
    context,
    requestedName: selector.name,
  });

const resolveDatumSelector = (selector: DatumSelector, context: ResolveContext): GeometrySelection => {
  const draft: SelectionDraft = { selector, expected: selector.expect ?? 'one', stability: 'authored' };
  const rows = matchNamedRows({ rows: context.index.datums, name: selector.name, of: selector.of, context });
  // Datums are never stale: the stamped payload is constitutive (profile
  // rule); a missing or unparseable datum property means no row exists here.
  return cardinalitySelection({
    draft,
    matches: rows.map((row) => datumEntity(row)),
    nearMisses: context.index.datums
      .slice(0, nearMissLimit)
      .map((row, position) => ({ ...datumEntity(row), rank: position + 1, excludedBy: 'name' })),
  });
};

const groupCountSelection = (options: {
  draft: SelectionDraft;
  group: SelectorGroupRow;
  context: ResolveContext;
}): GeometrySelection => {
  const { draft, group } = options;
  const { exact, atLeast } = cardinalityCount(draft.expected);
  const found = group.members.length;
  const expectedCount = exact ?? atLeast ?? found;
  if ((exact !== undefined && found !== exact) || (atLeast !== undefined && found < atLeast)) {
    const missingIndices = Array.from({ length: expectedCount }, (_, position) => position + 1).filter(
      (memberIndex) => !group.memberIndices.includes(memberIndex),
    );
    const nearestMember = group.members[0];
    return failedSelection('unmatched', {
      ...draft,
      message: `Group '${group.fullName}' resolved ${found} of ${expectedCount} expected members.`,
      suggestion:
        'The artifact drifted from the declared pattern; inspect the missing members against their siblings’ facts.',
      candidates: rankCandidates(group.members.map((member) => interfaceEntity(member))),
      details: {
        found,
        expected: draft.expected,
        missingMembers: missingIndices.map((memberIndex) => ({
          name: `${group.fullName}[${memberIndex}]`,
          nearestMemberFacts: nearestMember ? interfaceEntity(nearestMember).facts : undefined,
        })),
      },
    });
  }
  return resolvedSelection({ ...draft, entities: group.members.map((member) => interfaceEntity(member)) });
};

const resolveGroupRowsSelection = (options: {
  draft: SelectionDraft;
  rows: SelectorGroupRow[];
  context: ResolveContext;
  requestedName: string;
}): GeometrySelection => {
  const { draft, rows, context } = options;
  const first = rows[0];
  if (!first) {
    return failedSelection('unmatched', {
      ...draft,
      message: `No authored group named '${options.requestedName}' exists in the artifact.`,
      suggestion: 'Groups are derived from contiguous `prefix[i]` member names; check the authored member names.',
      details: { availableGroups: context.index.groups.map((row) => row.fullName) },
    });
  }
  if (rows.length > 1) {
    return failedSelection('ambiguous', {
      ...draft,
      message: `Group name '${options.requestedName}' matches ${rows.length} groups across occurrences.`,
      suggestion: 'Scope the group selector with `of` or use the full composed name.',
      candidates: rankCandidates(
        rows.map(
          (row): ResolvedEntity => ({
            id: row.id,
            entityType: 'group',
            occurrencePath: row.occurrencePath,
            facts: { memberCount: row.members.length },
          }),
        ),
      ),
    });
  }
  return groupCountSelection({ draft, group: first, context });
};

const resolveGroupSelector = (selector: GroupSelector, context: ResolveContext): GeometrySelection =>
  resolveGroupRowsSelection({
    draft: { selector, expected: selector.expect ?? 'many', stability: 'authored' },
    rows: matchNamedRows({ rows: context.index.groups, name: selector.name, of: selector.of, context }),
    context,
    requestedName: selector.name,
  });

// --- string shorthand ---------------------------------------------------------

const snapshotRefPattern = /^#o([1-9]\d*(?:\.[1-9]\d*)*)(?:\.f(\d+))?$/;

const resolveSnapshotRef = (selector: string, context: ResolveContext): GeometrySelection => {
  const draft: SelectionDraft = { selector, expected: 'one', stability: 'derived-ordinal' };
  const match = snapshotRefPattern.exec(selector);
  const ordinalText = match?.[1];
  if (ordinalText === undefined) {
    return failedSelection('unmatched', {
      ...draft,
      message: `'${selector}' is not a valid snapshot topology ref (expected '#o<n>[.<n>...][.f<k>]').`,
      suggestion: 'Use the topologyRef strings reported in resolution diagnostics.',
    });
  }
  const occurrence = context.index.occurrences.find((row) => row.ordinalPath.join('.') === ordinalText);
  if (!occurrence) {
    return failedSelection('unmatched', {
      ...draft,
      message: `Snapshot ref '${selector}' names an occurrence position that does not exist.`,
      suggestion: 'Snapshot refs are positional and snapshot-scoped; re-inspect the current artifact.',
    });
  }
  const faceIndexText = match?.[2];
  if (faceIndexText === undefined) {
    return resolvedSelection({ ...draft, entities: [occurrenceEntity(occurrence)] });
  }
  const face = context.index.faces.find(
    (row) => row.occurrencePath === occurrence.path && row.faceIndex === Number(faceIndexText),
  );
  if (!face) {
    return failedSelection('unmatched', {
      ...draft,
      message: `Snapshot ref '${selector}' names faceIndex ${faceIndexText}, which does not exist on '${occurrence.path}'.`,
      suggestion: 'Snapshot refs are positional and snapshot-scoped; re-inspect the current artifact.',
    });
  }
  return resolvedSelection({ ...draft, entities: [faceEntity(face, 'face')] });
};

const resolveAuthoredPath = (selector: string, context: ResolveContext): GeometrySelection => {
  const draft: SelectionDraft = { selector, expected: 'one', stability: 'authored' };
  const segments = parseSelectorPath(selector);
  if (!segments) {
    return failedSelection('unmatched', {
      ...draft,
      message: `'${selector}' is not a conforming selector path.`,
      suggestion:
        'Use the profile grammar (dot-joined `[A-Za-z][A-Za-z0-9]*` segments with optional 1-based `[n]`), or a typed occurrence selector for non-conforming third-party names.',
    });
  }
  const wildcardPosition = segments.findIndex((segment) => segment.wildcard === true);
  if (wildcardPosition !== -1 && wildcardPosition !== segments.length - 1) {
    return failedSelection('unmatched', {
      ...draft,
      message: `'${selector}' places the '[*]' wildcard on a non-final segment.`,
      suggestion: 'The wildcard denotes group members and is only valid on the final segment.',
    });
  }
  if (wildcardPosition !== -1) {
    const groupName = selector.slice(0, selector.lastIndexOf('['));
    return resolveGroupRowsSelection({
      draft: { selector, expected: 'many', stability: 'authored' },
      rows: context.index.groups.filter((row) => row.fullName === groupName),
      context,
      requestedName: groupName,
    });
  }
  // Priority order: occurrence path, interface, group, datum, then
  // product/instance-name occurrence matches.
  const byPath = context.index.occurrences.find((row) => row.path === selector);
  if (byPath) {
    return resolvedSelection({ ...draft, entities: [occurrenceEntity(byPath)] });
  }
  const interfaces = context.index.interfaces.filter((row) => row.fullName === selector);
  if (interfaces.length > 0) {
    return resolveInterfaceRows({ draft, rows: interfaces, context, requestedName: selector });
  }
  const groups = context.index.groups.filter((row) => row.fullName === selector);
  if (groups.length > 0) {
    return resolveGroupRowsSelection({
      draft: { selector, expected: 'many', stability: 'authored' },
      rows: groups,
      context,
      requestedName: selector,
    });
  }
  const datums = context.index.datums.filter((row) => row.fullName === selector);
  if (datums.length > 0) {
    return cardinalitySelection({ draft, matches: datums.map((row) => datumEntity(row)) });
  }
  const byName = context.index.occurrences
    .filter((row) => occurrenceMatchesScope(row, selector))
    .map((row) => occurrenceEntity(row));
  if (byName.length > 0) {
    return cardinalitySelection({ draft, matches: byName });
  }
  return resolveInterfaceRows({ draft, rows: [], context, requestedName: selector });
};

const resolveWithContext = (selector: GeometrySelector, context: ResolveContext): GeometrySelection => {
  if (typeof selector === 'string') {
    return selector.startsWith('#') ? resolveSnapshotRef(selector, context) : resolveAuthoredPath(selector, context);
  }
  switch (selector.kind) {
    case 'occurrence': {
      return resolveOccurrenceSelector(selector, context);
    }
    case 'interface': {
      return resolveInterfaceSelector(selector, context);
    }
    case 'datum': {
      return resolveDatumSelector(selector, context);
    }
    case 'group': {
      return resolveGroupSelector(selector, context);
    }
    case 'face':
    case 'axis':
    case 'plane':
    case 'body': {
      return resolveQuerySelector(selector, context);
    }
  }
};

/**
 * Resolve a geometry selector against a per-subject selector index.
 *
 * Pure and deterministic (D1): identical selector and index produce a deeply
 * equal {@link GeometrySelection}; no fallback across evidence classes.
 *
 * @param selector - Typed selector or string shorthand (authored path or
 * `#o…` snapshot topology ref).
 * @param index - Selector index built by
 * {@link import('#selector/index-builder.js').buildSelectorIndex}.
 * @returns The structured, set-valued resolution.
 * @public
 */
export const resolve = (selector: GeometrySelector, index: SelectorIndex): GeometrySelection =>
  resolveWithContext(selector, { index, tolerances: resolveTolerances() });
