/**
 * Canonical GeoSpec selector type system (SB3-R1).
 *
 * Types follow the master blueprint's "Canonical Selector Catalog" and
 * "Resolution Contract and Diagnostics" sections verbatim; deviations are
 * escalations, not local decisions. V1 entity scope per D4: occurrence, body,
 * face, axis, plane, datum, interface, group. Edge/vertex/wire/mate are V2.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';

/**
 * Surface classification carried by selector face facts, matching the
 * verification kernel's `faceFacts` payload vocabulary.
 *
 * @public
 */
export type SelectorSurfaceType = 'plane' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'bspline' | 'other';

/**
 * Inclusive numeric band. A bare number matches within the linear tolerance.
 *
 * @public
 */
export type NumericRange = number | { min?: number; max?: number };

/**
 * Cartesian coordinate record used by coordinate-band (`near`) predicates.
 *
 * @public
 */
export type Vec3Record = { x: number; y: number; z: number };

/**
 * Cardinality expectation for a selector resolution (master catalog G7).
 * `'one'` is the default for relationship endpoints; `'many'` for groups.
 *
 * @public
 */
export type Cardinality = 'one' | 'many' | { exactly: number } | { atLeast: number };

/**
 * Direction predicate with optional angular tolerance in degrees.
 *
 * @public
 */
export type DirectionPredicate = {
  direction: Vec3;
  angularToleranceDegrees?: number;
};

/**
 * Ray probe predicate (world-space origin and direction, millimetres).
 *
 * @public
 */
export type RayPredicate = {
  origin: Vec3;
  direction: Vec3;
};

/**
 * Face query predicates (master catalog G1/G2): geometric fact predicates,
 * world-space probes, scoping, ordering with deterministic pick, and set
 * algebra. All tolerances default to the shared tolerance contract.
 *
 * @public
 */
export type FaceQuery = {
  surfaceType?: SelectorSurfaceType;
  /** Face normal parallelism (planar faces). */
  normal?: DirectionPredicate;
  /** Rotation-axis parallelism (cylindrical/conical faces). */
  axis?: DirectionPredicate;
  radius?: NumericRange;
  area?: NumericRange;
  /** Plane offset band: signed distance of the plane from the origin. */
  offset?: NumericRange;
  /** Centroid coordinate bands, per-axis. */
  near?: Partial<Vec3Record> & { tolerance?: number };
  /** Probe: point lying on the face surface (bounds + analytic residual). */
  containsPoint?: Vec3;
  /** Probe: face whose centroid is nearest to the point; ties are ambiguous. */
  nearestTo?: Vec3;
  /** Probe: first face hit by the ray (analytic plane/cylinder only in V1). */
  hitByRay?: RayPredicate;
  /** Restrict candidates to entities resolved by another selector. */
  within?: GeometrySelector;
  /** Deterministic ordering; `offsetAlong` projects centroids on `along`. */
  orderBy?: 'area' | 'radius' | 'offsetAlong';
  /** Projection direction for `orderBy: 'offsetAlong'`. */
  along?: Vec3;
  /** Deterministic pick after ordering: `'first' | 'last'` or 0-based index. */
  pick?: 'first' | 'last' | number;
  allOf?: FaceQuery[];
  anyOf?: FaceQuery[];
  not?: FaceQuery;
};

/**
 * Axis query predicates over cylindrical/conical face facts.
 *
 * @public
 */
export type AxisQuery = {
  /** Axis direction parallelism. */
  axis?: DirectionPredicate;
  radius?: NumericRange;
  near?: Partial<Vec3Record> & { tolerance?: number };
  containsPoint?: Vec3;
  nearestTo?: Vec3;
  within?: GeometrySelector;
  orderBy?: 'radius' | 'offsetAlong';
  along?: Vec3;
  pick?: 'first' | 'last' | number;
  allOf?: AxisQuery[];
  anyOf?: AxisQuery[];
  not?: AxisQuery;
};

/**
 * Plane query predicates over planar face facts.
 *
 * @public
 */
export type PlaneQuery = {
  normal?: DirectionPredicate;
  offset?: NumericRange;
  area?: NumericRange;
  near?: Partial<Vec3Record> & { tolerance?: number };
  containsPoint?: Vec3;
  nearestTo?: Vec3;
  within?: GeometrySelector;
  orderBy?: 'area' | 'offsetAlong';
  along?: Vec3;
  pick?: 'first' | 'last' | number;
  allOf?: PlaneQuery[];
  anyOf?: PlaneQuery[];
  not?: PlaneQuery;
};

/**
 * Body query predicates over per-occurrence solid aggregates.
 *
 * @public
 */
export type BodyQuery = {
  area?: NumericRange;
  near?: Partial<Vec3Record> & { tolerance?: number };
  nearestTo?: Vec3;
  within?: GeometrySelector;
  orderBy?: 'area' | 'offsetAlong';
  along?: Vec3;
  pick?: 'first' | 'last' | number;
  allOf?: BodyQuery[];
  anyOf?: BodyQuery[];
  not?: BodyQuery;
};

/**
 * Occurrence selector: a placed instance in the assembly tree.
 *
 * @public
 */
export type OccurrenceSelector = {
  kind: 'occurrence';
  /** Product or instance name to match. */
  name?: string | RegExp;
  /** Occurrence path (dot-joined instance segments, root omitted) to match. */
  path?: string | RegExp;
  expect?: Cardinality;
};

/**
 * Body selector: one solid within an occurrence.
 *
 * @public
 */
export type BodySelector = {
  kind: 'body';
  of?: string | RegExp;
  query?: BodyQuery;
  expect?: Cardinality;
};

/**
 * Face selector resolved via query/probe predicates.
 *
 * @public
 */
export type FaceSelector = {
  kind: 'face';
  of?: string | RegExp;
  query?: FaceQuery;
  expect?: Cardinality;
};

/**
 * Axis selector resolved from cylindrical/conical face facts.
 *
 * @public
 */
export type AxisSelector = {
  kind: 'axis';
  of?: string | RegExp;
  query?: AxisQuery;
  expect?: Cardinality;
};

/**
 * Plane selector resolved from planar face facts.
 *
 * @public
 */
export type PlaneSelector = {
  kind: 'plane';
  of?: string | RegExp;
  query?: PlaneQuery;
  expect?: Cardinality;
};

/**
 * Datum selector: a named coordinate frame authored as a native AP242 datum
 * placement.
 *
 * @public
 */
export type DatumSelector = {
  kind: 'datum';
  /** Full datum name, or part-relative name when `of` scopes an occurrence. */
  name: string;
  of?: string | RegExp;
  expect?: Cardinality;
};

/**
 * Interface selector: an authored named interface transported as a STEP
 * `SHAPE_ASPECT` subshape name — the production-preferred selector.
 *
 * @public
 */
export type InterfaceSelector = {
  kind: 'interface';
  /** Full interface name, or part-relative name when `of` scopes an occurrence. */
  name: string;
  of?: string | RegExp;
  expect?: Cardinality;
};

/**
 * Group selector: an ordered shared-name family (`bore[1]`…`bore[N]`).
 *
 * @public
 */
export type GroupSelector = {
  kind: 'group';
  /** Full group prefix, or part-relative prefix when `of` scopes an occurrence. */
  name: string;
  of?: string | RegExp;
  expect?: Cardinality;
};

/**
 * The V1 geometry selector union (D4 scope). Strings are shorthand: authored
 * paths (`'block.deck.left'`, `'headL.boltHole[*]'`) or snapshot topology
 * refs (`'#o1.2.f7'`, always `stability: 'derived-ordinal'`).
 *
 * @public
 */
export type GeometrySelector =
  | string
  | OccurrenceSelector
  | BodySelector
  | FaceSelector
  | AxisSelector
  | PlaneSelector
  | DatumSelector
  | InterfaceSelector
  | GroupSelector;

/**
 * Entity kind a resolved entity denotes. Derived from geometry at resolution
 * time.
 *
 * @public
 */
export type ResolvedEntityType = 'occurrence' | 'body' | 'face' | 'axis' | 'plane' | 'datum' | 'interface' | 'group';

/**
 * Typed geometric facts carried by a resolved entity — full `Vec3`
 * normals/axes in the subject frame, never principal-axis projections.
 *
 * @public
 */
export type GeometryFacts = {
  surfaceType?: SelectorSurfaceType;
  normal?: Vec3;
  offset?: number;
  axisOrigin?: Vec3;
  axisDirection?: Vec3;
  radius?: number;
  area?: number;
  centroid?: Vec3;
  bounds?: { min: Vec3; max: Vec3 };
  /** Datum frame origin (subject frame). */
  origin?: Vec3;
  /** Datum frame x axis (subject frame). */
  xAxis?: Vec3;
  /** Datum frame z axis (subject frame). */
  zAxis?: Vec3;
  /** Occurrence placement transform (4x4 row-major, part-local → subject). */
  transform?: number[];
  productName?: string;
  faceIndex?: number;
  /** Group member count. */
  memberCount?: number;
};

/**
 * Per-face analytic facts in the subject frame, matching the verification
 * kernel's `faceFacts(occurrence)` JSON payload (SB1). Consumed as plain data
 * so resolution stays pure (no wasm calls).
 *
 * @public
 */
export type SelectorFaceFacts = {
  faceIndex: number;
  surfaceType: SelectorSurfaceType;
  normal?: Vec3;
  offset?: number;
  axisOrigin?: Vec3;
  axisDirection?: Vec3;
  radius?: number;
  area: number;
  centroid: Vec3;
  bounds: { min: Vec3; max: Vec3 };
};

/**
 * One resolved geometry entity (index-local, snapshot-scoped identity).
 *
 * @public
 */
export type ResolvedEntity = {
  id: string;
  entityType: ResolvedEntityType;
  occurrencePath?: string;
  facts: GeometryFacts;
  /** Snapshot topology ref (`'#o1.2.f7'`) for diagnostics and pinning. */
  topologyRef?: string;
};

/**
 * Ranked candidate reported on ambiguous/unmatched resolutions, with the
 * disambiguating facts and — for near-misses — the excluding predicate.
 *
 * @public
 */
export type CandidateEntity = ResolvedEntity & {
  /** 1-based deterministic rank. */
  rank: number;
  /** Name of the predicate that excluded this near-miss candidate. */
  excludedBy?: string;
  /** Probe distance in millimetres, when a probe ranked this candidate. */
  distance?: number;
};

/**
 * Resolution status. First-class, machine-actionable outcomes per D1/E4 —
 * `ambiguous` and `unsupported` are correct results, never errors to paper
 * over.
 *
 * @public
 */
export type GeometrySelectionStatus = 'resolved' | 'unmatched' | 'ambiguous' | 'unsupported';

/**
 * Evidence source a selection resolved against.
 *
 * @public
 */
export type GeometrySelectionSource = 'step-xde' | 'brep' | 'mesh' | 'explicit';

/**
 * Durability-ladder stability class of a resolution.
 *
 * @public
 */
export type GeometrySelectionStability =
  | 'authored'
  | 'derived-query'
  | 'derived-probe'
  | 'derived-ordinal'
  | 'explicit';

/**
 * Structured result of resolving one selector against a selector index.
 *
 * @public
 */
export type GeometrySelection = {
  selector: GeometrySelector;
  status: GeometrySelectionStatus;
  /** Set-valued result (E4). */
  entities: ResolvedEntity[];
  expected: Cardinality;
  source: GeometrySelectionSource;
  stability: GeometrySelectionStability;
  /** Ranked candidates with facts — ambiguous/unmatched repair data. */
  candidates?: CandidateEntity[];
  diagnostics: GeometryDiagnostic[];
};

/**
 * JSON-serialized RegExp representation used by selector serialization.
 *
 * @public
 */
export type SerializedRegExp = { pattern: string; flags: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSerializedRegExp = (value: unknown): value is SerializedRegExp =>
  isRecord(value) &&
  typeof value['pattern'] === 'string' &&
  typeof value['flags'] === 'string' &&
  Object.keys(value).length === 2;

const serializeValue = (value: unknown): unknown => {
  if (value instanceof RegExp) {
    return { pattern: value.source, flags: value.flags } satisfies SerializedRegExp;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }
  return value;
};

const deserializeValue = (value: unknown): unknown => {
  if (isSerializedRegExp(value)) {
    return new RegExp(value.pattern, value.flags);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deserializeValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deserializeValue(entry)]));
  }
  return value;
};

/**
 * Serialize a selector to a JSON-safe value (RegExp as `{ pattern, flags }`)
 * so diagnostics, agents, and tooling can exchange selectors.
 *
 * @param selector - Selector to serialize.
 * @returns JSON-safe representation of the selector.
 * @public
 */
export const serializeSelector = (selector: GeometrySelector): unknown => serializeValue(selector);

/**
 * Reconstruct a selector from its JSON-safe serialized form.
 *
 * @param serialized - Value produced by {@link serializeSelector} (possibly
 * round-tripped through JSON).
 * @returns The reconstructed selector.
 * @public
 */
export const deserializeSelector = (serialized: unknown): GeometrySelector =>
  deserializeValue(serialized) as GeometrySelector;
