/**
 * Stamped-fact parsing and stale detection (SB3-R5, master R8).
 *
 * Authored interfaces export with their resolved facts stamped as
 * `geospec:facts` AP242 properties in the **part-local frame**. At resolution
 * the stamped vectors are mapped through the owning occurrence's transform
 * into the subject frame and compared against the index row under the shared
 * tolerance contract. Material disagreement resolves `stale` with both fact
 * sets — never silently following either side. Absent stamps are not
 * staleness; datum stamps are constitutive and never stale.
 *
 * @module
 */

import type { Vec3 } from '#mesh/types.js';
import type { SelectorFaceFacts, SelectorSurfaceType } from '#selector/types.js';
import type { SelectorTolerances } from '#selector/tolerances.js';
import {
  axisAngleBetweenDegrees,
  angleBetweenDegrees,
  dot,
  scale,
  transformDirection,
  transformPoint,
} from '#selector/vector-math.js';

/**
 * Stamped facts for a face/axis interface (`geospec:facts` v1, kind `face` or
 * `axis`).
 *
 * @public
 */
export type StampedFaceFacts = {
  kind: 'face' | 'axis';
  surfaceType?: SelectorSurfaceType;
  normal?: Vec3;
  offset?: number;
  axisOrigin?: Vec3;
  axisDirection?: Vec3;
  radius?: number;
  area?: number;
  centroid?: Vec3;
};

/**
 * Stamped facts for a datum interface (`geospec:facts` v1, kind `datum`).
 * The payload is constitutive — it *is* the datum.
 *
 * @public
 */
export type StampedDatumFacts = {
  kind: 'datum';
  origin: Vec3;
  xAxis: Vec3;
  zAxis: Vec3;
};

/**
 * Parsed `geospec:facts` payload.
 *
 * @public
 */
export type StampedFacts = StampedFaceFacts | StampedDatumFacts;

/**
 * Result of parsing a stamped `geospec:facts` payload. An unrecognized `v`
 * or `kind` degrades to `absent` per the profile — exactly like a missing
 * stamp, with an informational reason.
 *
 * @public
 */
export type ParsedStampedFacts = { status: 'parsed'; facts: StampedFacts } | { status: 'absent'; reason: string };

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number');

const asVec3 = (value: unknown): Vec3 | undefined => (isVec3(value) ? [value[0], value[1], value[2]] : undefined);

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

const surfaceTypes: ReadonlySet<unknown> = new Set<SelectorSurfaceType>([
  'plane',
  'cylinder',
  'cone',
  'sphere',
  'torus',
  'bspline',
  'other',
]);

const asSurfaceType = (value: unknown): SelectorSurfaceType | undefined =>
  surfaceTypes.has(value) ? (value as SelectorSurfaceType) : undefined;

const parseDatumFacts = (payload: Record<string, unknown>): ParsedStampedFacts => {
  const origin = asVec3(payload['origin']);
  const xAxis = asVec3(payload['xAxis']);
  const zAxis = asVec3(payload['zAxis']);
  if (!origin || !xAxis || !zAxis) {
    return { status: 'absent', reason: 'datum geospec:facts payload is missing origin/xAxis/zAxis frame fields' };
  }
  return { status: 'parsed', facts: { kind: 'datum', origin, xAxis, zAxis } };
};

const parseFaceFacts = (payload: Record<string, unknown>, kind: 'face' | 'axis'): ParsedStampedFacts => {
  const facts: StampedFaceFacts = { kind };
  const surfaceType = asSurfaceType(payload['surfaceType']);
  if (surfaceType) {
    facts.surfaceType = surfaceType;
  }
  const vectors = ['normal', 'axisOrigin', 'axisDirection', 'centroid'] as const;
  for (const field of vectors) {
    const value = asVec3(payload[field]);
    if (value) {
      facts[field] = value;
    }
  }
  const scalars = ['offset', 'radius', 'area'] as const;
  for (const field of scalars) {
    const value = asNumber(payload[field]);
    if (value !== undefined) {
      facts[field] = value;
    }
  }
  return { status: 'parsed', facts };
};

/**
 * Parse a stamped `geospec:facts` JSON payload against the profile's v1
 * schema. Unknown extra fields are ignored (forward compatibility).
 *
 * @param payload - Raw JSON payload from the AP242 property row.
 * @returns Parsed facts, or `absent` with a reason.
 * @public
 */
export const parseStampedFacts = (payload: string): ParsedStampedFacts => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { status: 'absent', reason: 'geospec:facts payload is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'absent', reason: 'geospec:facts payload is not a JSON object' };
  }
  const record = parsed as Record<string, unknown>;
  if (record['v'] !== 1) {
    return { status: 'absent', reason: `unrecognized geospec:facts version ${JSON.stringify(record['v'])}` };
  }
  const { kind } = record;
  if (kind === 'datum') {
    return parseDatumFacts(record);
  }
  if (kind === 'face' || kind === 'axis') {
    return parseFaceFacts(record, kind);
  }
  return { status: 'absent', reason: `unrecognized geospec:facts kind ${JSON.stringify(kind)}` };
};

const mapFaceFactsToSubjectFrame = (facts: StampedFaceFacts, transform: number[]): StampedFaceFacts => {
  const mapped: StampedFaceFacts = { ...facts };
  if (facts.normal) {
    mapped.normal = transformDirection(transform, facts.normal);
    if (facts.offset !== undefined) {
      // A plane's offset is frame-dependent: recompute it from a mapped
      // point on the plane rather than carrying the part-local scalar.
      const pointOnPlane = transformPoint(transform, scale(facts.normal, facts.offset));
      mapped.offset = dot(mapped.normal, pointOnPlane);
    }
  }
  if (facts.axisDirection) {
    mapped.axisDirection = transformDirection(transform, facts.axisDirection);
  }
  if (facts.axisOrigin) {
    mapped.axisOrigin = transformPoint(transform, facts.axisOrigin);
  }
  if (facts.centroid) {
    mapped.centroid = transformPoint(transform, facts.centroid);
  }
  return mapped;
};

/**
 * Map stamped part-local facts through the owning occurrence's placement
 * transform into the subject frame. On tau's flat exports the transform is
 * identity; transformed instances are where a missing mapping shows up.
 *
 * @param facts - Parsed stamped facts in the part-local frame.
 * @param transform - 4x4 row-major placement transform.
 * @returns Facts expressed in the subject frame.
 * @public
 */
export const mapStampedFactsToSubjectFrame = (facts: StampedFacts, transform: number[]): StampedFacts => {
  if (facts.kind === 'datum') {
    return {
      kind: 'datum',
      origin: transformPoint(transform, facts.origin),
      xAxis: transformDirection(transform, facts.xAxis),
      zAxis: transformDirection(transform, facts.zAxis),
    };
  }
  return mapFaceFactsToSubjectFrame(facts, transform);
};

/**
 * Outcome of comparing stamped facts against observed index facts.
 *
 * @public
 */
export type StaleComparison = {
  stale: boolean;
  /** Human-readable disagreement descriptions (empty when not stale). */
  reasons: string[];
};

const compareDirections = (options: {
  stamped: StampedFaceFacts;
  observed: SelectorFaceFacts;
  angularToleranceDegrees: number;
}): string[] => {
  const reasons: string[] = [];
  const { stamped, observed } = options;
  if (stamped.normal && observed.normal) {
    // Face normals are orientation-sensitive (outward convention is part of
    // the export contract); a flipped normal is a material change.
    const angle = angleBetweenDegrees(stamped.normal, observed.normal);
    if (angle === undefined || angle > options.angularToleranceDegrees) {
      reasons.push(
        `normal deviates ${angle === undefined ? 'degenerately' : `${angle.toFixed(3)}°`} from the stamped direction`,
      );
    }
  }
  if (stamped.axisDirection && observed.axisDirection) {
    // Axes are orientation-insensitive: an axis and its reverse are one line.
    const angle = axisAngleBetweenDegrees(stamped.axisDirection, observed.axisDirection);
    if (angle === undefined || angle > options.angularToleranceDegrees) {
      reasons.push(
        `axis deviates ${angle === undefined ? 'degenerately' : `${angle.toFixed(3)}°`} from the stamped direction`,
      );
    }
  }
  return reasons;
};

const compareScalars = (options: {
  stamped: StampedFaceFacts;
  observed: SelectorFaceFacts;
  tolerances: SelectorTolerances;
}): string[] => {
  const reasons: string[] = [];
  const { stamped, observed, tolerances } = options;
  if (stamped.area !== undefined) {
    const drift = Math.abs(observed.area - stamped.area) / Math.max(Math.abs(stamped.area), Number.EPSILON);
    if (drift > tolerances.staleAreaRatio) {
      reasons.push(`area drifted ${(drift * 100).toFixed(1)}% (stamped ${stamped.area}, observed ${observed.area})`);
    }
  }
  if (
    stamped.radius !== undefined &&
    observed.radius !== undefined &&
    Math.abs(stamped.radius - observed.radius) > tolerances.linearMm
  ) {
    reasons.push(`radius changed from stamped ${stamped.radius} to observed ${observed.radius}`);
  }
  if (
    stamped.offset !== undefined &&
    observed.offset !== undefined &&
    Math.abs(stamped.offset - observed.offset) > tolerances.linearMm
  ) {
    reasons.push(`plane offset changed from stamped ${stamped.offset} to observed ${observed.offset}`);
  }
  return reasons;
};

/**
 * Compare subject-frame stamped facts against the observed index facts under
 * the shared tolerance contract. Datum facts are constitutive and must not be
 * passed here — a datum is never stale.
 *
 * @param options - Subject-frame stamped facts, observed face facts, and tolerances.
 * @returns Whether the interface is stale, with disagreement reasons.
 * @public
 */
export const compareStampedFacts = (options: {
  stamped: StampedFaceFacts;
  observed: SelectorFaceFacts;
  tolerances: SelectorTolerances;
}): StaleComparison => {
  const reasons: string[] = [];
  const { stamped, observed, tolerances } = options;
  if (stamped.surfaceType !== undefined && stamped.surfaceType !== observed.surfaceType) {
    reasons.push(`surface type changed from stamped '${stamped.surfaceType}' to observed '${observed.surfaceType}'`);
  }
  reasons.push(
    ...compareDirections({ stamped, observed, angularToleranceDegrees: tolerances.angularToleranceDegrees }),
    ...compareScalars({ stamped, observed, tolerances }),
  );
  return { stale: reasons.length > 0, reasons };
};
