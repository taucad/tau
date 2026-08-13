/**
 * Canonical topological void-claim resolution.
 *
 * A void claim names waypoints, a material set and a region. Resolving it is
 * pure bookkeeping over the selector index.
 *
 * The two defaults lean on each other and are never both taken: `material`
 * defaults to every occurrence, `bounds` defaults to the material's inflated
 * union — so a claim that declares NEITHER has no anchor at all and is refused
 * rather than silently using the whole assembly's envelope.
 *
 * @module
 */

import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import type { GeoSpecVoidContinuityExpectation, GeoSpecVoidWaypoint } from '#runner/types.js';

/** The diagnostic code a failed void-continuity verdict carries. */
export const voidMismatchCode = 'GEOSPEC_VOID_CONTINUITY_MISMATCH';

/** The diagnostic code a void claim the engine refuses to decide carries. */
export const voidUnsupportedCode = 'GEOSPEC_VOID_CONTINUITY_UNSUPPORTED';

/** Fixed padding around a region derived from material bounds. */
export const voidRegionPaddingMm = 2;

/** An axis-aligned region in the subject frame. */
export type VoidRegion = { min: Vec3; max: Vec3 };

/**
 * A void claim with every default applied and every name resolved.
 *
 * @public
 */
export type ResolvedVoidClaim = {
  /** Ordered waypoints, in the subject frame. */
  waypoints: Vec3[];
  /** Material occurrence indices, ascending. */
  materials: number[];
  /** Material occurrence paths, in `materials` order (for diagnostics). */
  materialPaths: string[];
  /** The region used by the Boolean proof. */
  region: VoidRegion;
  /** Probes that must be unreachable from the path void. */
  isolatedFrom: Vec3[];
  /** Minimum required bottleneck cross-section (mm²), when declared. */
  minCrossSection?: number;
};

/**
 * Build the refusal diagnostic the canonical engine answers with.
 *
 * @param message - Why the claim cannot be decided.
 * @param suggestion - The repair.
 * @param details - Structured payload.
 * @returns The single-element diagnostic list.
 * @public
 */
export const voidUnsupported = (
  message: string,
  suggestion: string,
  details?: Record<string, unknown>,
): GeometryDiagnostic[] => [
  {
    code: voidUnsupportedCode,
    severity: 'error',
    message,
    suggestion,
    ...(details ? { details } : {}),
  },
];

/**
 * Build the mismatch diagnostic a decided-and-failed void claim carries.
 *
 * @param options - Message, suggestion, and the failure's location plus any
 * measured payload.
 * @returns The single-element diagnostic list.
 * @public
 */
export const voidMismatch = (options: {
  message: string;
  suggestion: string;
  center?: Vec3;
  details?: Record<string, unknown>;
}): GeometryDiagnostic[] => [
  {
    code: voidMismatchCode,
    severity: 'error',
    message: options.message,
    suggestion: options.suggestion,
    ...(options.center ? { spatial: { center: [...options.center] as Vec3 } } : {}),
    details: { engine: 'topological', ...options.details },
  },
];

const unionBounds = (boxes: readonly VoidRegion[]): VoidRegion | undefined => {
  let union: VoidRegion | undefined;
  for (const box of boxes) {
    union = union
      ? {
          min: [
            Math.min(union.min[0], box.min[0]),
            Math.min(union.min[1], box.min[1]),
            Math.min(union.min[2], box.min[2]),
          ],
          max: [
            Math.max(union.max[0], box.max[0]),
            Math.max(union.max[1], box.max[1]),
            Math.max(union.max[2], box.max[2]),
          ],
        }
      : { min: [...box.min] as Vec3, max: [...box.max] as Vec3 };
  }
  return union;
};

const inflate = (region: VoidRegion, by: number): VoidRegion => ({
  min: [region.min[0] - by, region.min[1] - by, region.min[2] - by],
  max: [region.max[0] + by, region.max[1] + by, region.max[2] + by],
});

/**
 * Whether a point lies inside a region (closed).
 *
 * @param point - Subject-frame point.
 * @param region - The region.
 * @returns True when every coordinate is within the region's interval.
 * @public
 */
export const regionContains = (point: Vec3, region: VoidRegion): boolean =>
  point[0] >= region.min[0] &&
  point[0] <= region.max[0] &&
  point[1] >= region.min[1] &&
  point[1] <= region.max[1] &&
  point[2] >= region.min[2] &&
  point[2] <= region.max[2];

const isOccurrenceWaypoint = (waypoint: GeoSpecVoidWaypoint): waypoint is { occurrence: string } =>
  !Array.isArray(waypoint);

const occurrenceBounds = (context: RelationshipProofContext, path: string): VoidRegion | undefined =>
  context.index.occurrences.find((row) => row.path === path)?.bounds;

/**
 * Resolve a void-continuity expectation to the claim both engines run.
 *
 * @param expectation - The authored claim.
 * @param context - The subject's proof context.
 * @returns The resolved claim, or the refusal diagnostics.
 * @public
 */
export const resolveVoidClaim = (
  expectation: GeoSpecVoidContinuityExpectation,
  context: RelationshipProofContext,
): { claim: ResolvedVoidClaim } | { diagnostics: GeometryDiagnostic[] } => {
  if (expectation.path.length === 0) {
    return {
      diagnostics: voidUnsupported(
        'A void-continuity claim needs at least one path waypoint.',
        'Declare `path` with the subject-frame points (or occurrences) known to lie in the void.',
      ),
    };
  }
  if (expectation.material === undefined && expectation.bounds === undefined) {
    return {
      diagnostics: voidUnsupported(
        'A void-continuity claim needs a material set or explicit bounds: with neither, the void has no boundary and no region to prove it in.',
        'Declare `material` with the occurrences that bound the void, or `bounds` with the region to prove it in.',
      ),
    };
  }
  const materialPaths = expectation.material ?? context.index.occurrences.map((row) => row.path);
  const materials: number[] = [];
  const resolvedPaths: string[] = [];
  for (const path of materialPaths) {
    const occurrence = context.occurrenceIndexByPath.get(path);
    if (occurrence === undefined) {
      return {
        diagnostics: voidUnsupported(
          `The void claim names material occurrence '${path}', which this subject's STEP-XDE structure does not contain.`,
          'Name occurrences exactly as the assembly exports them, or drop the material entry.',
          { occurrence: path },
        ),
      };
    }
    materials.push(occurrence);
    resolvedPaths.push(path);
  }
  if (materials.length === 0) {
    return {
      diagnostics: voidUnsupported(
        'The void claim resolved to an empty material set, so nothing bounds the void.',
        'Name at least one occurrence in `material`.',
      ),
    };
  }

  const waypoints: Vec3[] = [];
  for (const waypoint of expectation.path) {
    if (!isOccurrenceWaypoint(waypoint)) {
      waypoints.push([waypoint[0], waypoint[1], waypoint[2]]);
      continue;
    }
    const bounds = occurrenceBounds(context, waypoint.occurrence);
    if (!bounds) {
      return {
        diagnostics: voidUnsupported(
          `The void claim's waypoint occurrence '${waypoint.occurrence}' has no exact bounds in this subject.`,
          'Use an explicit [x, y, z] waypoint, or name an occurrence the STEP export carries faces for.',
          { occurrence: waypoint.occurrence },
        ),
      };
    }
    waypoints.push([
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ]);
  }

  let region = expectation.bounds
    ? { min: [...expectation.bounds.min] as Vec3, max: [...expectation.bounds.max] as Vec3 }
    : undefined;
  if (!region) {
    const boxes: VoidRegion[] = [];
    for (const path of resolvedPaths) {
      const bounds = occurrenceBounds(context, path);
      if (bounds) {
        boxes.push(bounds);
      }
    }
    const union = unionBounds(boxes);
    if (!union) {
      return {
        diagnostics: voidUnsupported(
          'The void claim declared no bounds and its material occurrences carry no exact bounds to derive them from.',
          'Declare `bounds` explicitly.',
        ),
      };
    }
    // Padding guarantees the material sits strictly inside the region, which
    // makes `region − ⋃material` a closed shell set.
    region = inflate(union, voidRegionPaddingMm);
  }

  const isolatedFrom = (expectation.isolatedFrom ?? []).map((point): Vec3 => [point[0], point[1], point[2]]);
  for (const point of [...waypoints, ...isolatedFrom]) {
    if (!regionContains(point, region)) {
      return {
        diagnostics: voidUnsupported(
          `The void claim's point [${point.join(', ')}] lies outside the proven region, so no engine can decide it.`,
          'Widen `bounds`, or move the waypoint inside the region the material set spans.',
          { point, region },
        ),
      };
    }
  }

  return {
    claim: {
      waypoints,
      materials,
      materialPaths: resolvedPaths,
      region,
      isolatedFrom,
      ...(expectation.minCrossSection === undefined ? {} : { minCrossSection: expectation.minCrossSection }),
    },
  };
};
