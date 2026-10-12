/**
 * Canonical GeoSpec selector type system (SB3-R1).
 *
 * Types follow the master blueprint's "Canonical Selector Catalog" section
 * verbatim; deviations are escalations, not local decisions. V1 entity scope
 * per D4: occurrence, body, face, axis, plane, datum, interface, group.
 * Edge/vertex/wire/mate are V2. The native engine resolves selectors.
 *
 * @module
 */

import type { Vec3 } from '#mesh/types.js';

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
 * Body query predicates over available source facts. The STEP index currently
 * exposes per-occurrence solid aggregates. Qualified mesh Bodies are material
 * roots, including their cavities; disconnected roots and cavity islands stay
 * separate. Mesh measure, probe and ordering predicates without the required
 * facts refuse, including inside boolean queries.
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
 * Body selector over source-backed solid evidence. Qualified mesh input exposes
 * one material root with its cavities; the STEP index currently exposes one
 * solid aggregate per occurrence. These are not interchangeable body counts.
 *
 * @public
 */
export type BodySelector = {
  kind: 'body';
  /** STEP occurrence scope, or the exact retained mesh primitive label including any ordinal suffix. */
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
