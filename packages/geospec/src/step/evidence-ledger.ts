/**
 * Lazy BRep evidence facet ledger (lazy-evidence blueprint R3).
 *
 * `subject.brep` on a STEP subject is an object of memoizing getters: the
 * first read of an evidence field invokes the owning facet's coarse native
 * call synchronously (geospec-policy §13, §18), memoizes the parsed result
 * for the life of the subject (shared across tests via the model-load
 * cache), and later reads are plain property access. A facet failure
 * memoizes `undefined` plus a per-facet diagnostic — matchers keep emitting
 * unsupported-evidence diagnostics per §5, and the wall-thickness R13
 * work-unit budget maps onto the `MATCHER_TIMEOUT` diagnostic contract via
 * {@link getBrepFacetDiagnostic}.
 *
 * Facet → evidence-field ownership:
 * - `summary` → `topologyCounts`, `boundingBox`
 * - `massProperties` → `massProperties`
 * - `validity` → `validity` (natively memoized: wall thickness gates on it)
 * - `faceFeatures` → `planarFaces`, `cylindricalFaces`, `circularHoles`,
 *   `circularHolePatterns`, `chamferFeatures`, `filletFeatures` (forces
 *   `summary` for the bounding box and reads per-occurrence face facts for
 *   the revolved-chamfer/through-hole normalization — Finding 9's eager
 *   sweep, now demand-driven)
 * - `wallThickness` → `minimumWallThickness` (validity-gated natively)
 *
 * `toJSON` serializes only materialized facets so report serialization can
 * never force analysis. Access after the native handle is deleted memoizes
 * the standard facet-failure diagnostic instead of crossing into freed
 * memory (blueprint A12).
 *
 * @module
 */

import { getGeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import { forensicSync } from '#runner/forensic.js';
import type { BrepEvidence, GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';
import type { SelectorFaceFacts } from '#selector/types.js';

/** Facets the ledger can materialize. @public */
export type BrepFacetName = 'summary' | 'massProperties' | 'validity' | 'faceFeatures' | 'wallThickness';

type SummaryFacet = {
  topologyCounts: BrepEvidence['topologyCounts'];
  boundingBox: BrepEvidence['boundingBox'];
};

type FaceFeaturesFacet = Pick<
  BrepEvidence,
  'planarFaces' | 'cylindricalFaces' | 'circularHoles' | 'circularHolePatterns' | 'chamferFeatures' | 'filletFeatures'
>;

type WallThicknessFacetPayload = {
  minimumWallThickness?: BrepEvidence['minimumWallThickness'];
  budgetExceeded?: { workUnits: number; limit: number };
  error?: string;
};

const facetDiagnosticsByBrep = new WeakMap<BrepEvidence, Map<BrepFacetName, GeometryDiagnostic>>();

/**
 * Diagnostic recorded when a facet failed to materialize (native error,
 * disposed handle, or an exhausted R13 work-unit budget).
 *
 * @param brep - The subject's BRep evidence object.
 * @param facet - Facet name.
 * @returns The recorded diagnostic, or `undefined` when the facet
 * materialized (or was never demanded).
 * @public
 */
export const getBrepFacetDiagnostic = (brep: BrepEvidence, facet: BrepFacetName): GeometryDiagnostic | undefined =>
  facetDiagnosticsByBrep.get(brep)?.get(facet);

// === Feature-evidence normalization (moved verbatim from the eager loader) ===

const axisIndices = { x: 0, y: 1, z: 2 } as const;

const axisValue = (value: readonly [number, number, number], axis: 'x' | 'y' | 'z'): number => value[axisIndices[axis]];

const perpendicularAxes = (axis: 'x' | 'y' | 'z'): Array<'x' | 'y' | 'z'> =>
  axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];

const coordinatesMatch = (options: {
  left: readonly [number, number, number] | undefined;
  right: readonly [number, number, number] | undefined;
  axes: ReadonlyArray<'x' | 'y' | 'z'>;
  tolerance: number;
}): boolean => {
  const { left, right } = options;
  if (!left || !right) {
    return false;
  }
  return options.axes.every((axis) => Math.abs(axisValue(left, axis) - axisValue(right, axis)) <= options.tolerance);
};

const isAxisNormal = (normal: readonly [number, number, number], axis: 'x' | 'y' | 'z'): boolean => {
  const axisMagnitude = Math.abs(axisValue(normal, axis));
  const offAxisMagnitude = perpendicularAxes(axis).reduce(
    (sum, perpendicularAxis) => sum + Math.abs(axisValue(normal, perpendicularAxis)),
    0,
  );
  return axisMagnitude > 0.95 && offAxisMagnitude < 0.05;
};

const touchesBoundingExtent = (options: { value: number; min: number; max: number; tolerance: number }): boolean =>
  Math.abs(options.value - options.min) <= options.tolerance ||
  Math.abs(options.value - options.max) <= options.tolerance;

const hasInternalCircularCap = (options: {
  brep: BrepEvidence;
  diameter: number;
  axis: 'x' | 'y' | 'z';
  center?: readonly [number, number, number];
}): boolean => {
  const { brep, axis, center, diameter } = options;
  if (!brep.boundingBox || !brep.planarFaces || !center) {
    return false;
  }

  const radius = diameter / 2;
  const expectedCapArea = Math.PI * radius * radius;
  const areaTolerance = Math.max(1, expectedCapArea * 0.05);
  const positionTolerance = 0.1;
  const boundaryTolerance = 0.1;
  const min = axisValue(brep.boundingBox.min, axis);
  const max = axisValue(brep.boundingBox.max, axis);

  return brep.planarFaces.some((face) => {
    if (!face.center || face.area === undefined || !isAxisNormal(face.normal, axis)) {
      return false;
    }
    if (
      !coordinatesMatch({
        left: face.center,
        right: center,
        axes: perpendicularAxes(axis),
        tolerance: positionTolerance,
      })
    ) {
      return false;
    }
    if (Math.abs(face.area - expectedCapArea) > areaTolerance) {
      return false;
    }

    return !touchesBoundingExtent({
      value: axisValue(face.center, axis),
      min,
      max,
      tolerance: boundaryTolerance,
    });
  });
};

const holeThroughFromAxisRange = (options: {
  brep: BrepEvidence;
  axis: 'x' | 'y' | 'z';
  axisRange?: { min: number; max: number };
}): boolean | undefined => {
  const { axisRange, brep, axis } = options;
  if (!axisRange || !brep.boundingBox) {
    return undefined;
  }
  const tolerance = 0.1;
  return (
    axisRange.min <= axisValue(brep.boundingBox.min, axis) + tolerance &&
    axisRange.max >= axisValue(brep.boundingBox.max, axis) - tolerance
  );
};

type CircularHole = NonNullable<BrepEvidence['circularHoles']>[number];
type CircularHolePattern = NonNullable<BrepEvidence['circularHolePatterns']>[number];
type ChamferFeature = NonNullable<BrepEvidence['chamferFeatures']>[number];

const axisOf = (direction: readonly [number, number, number] | undefined): 'x' | 'y' | 'z' | undefined => {
  if (!direction) {
    return undefined;
  }
  const abs = direction.map((component) => Math.abs(component));
  const dominant = Math.max(...abs);
  // Axis-aligned means one component dominates and the others are near zero.
  if (dominant <= 0.999 || abs.filter((value) => value > 0.05).length !== 1) {
    return undefined;
  }
  return abs[0] === dominant ? 'x' : abs[1] === dominant ? 'y' : 'z';
};

const axialSpan = (facts: SelectorFaceFacts, axis: 'x' | 'y' | 'z'): number => {
  const index = axisIndices[axis];
  return facts.bounds.max[index] - facts.bounds.min[index];
};

// Re-derive revolved (conical) chamfer features the native planar-only
// recognizer misses (WS-E / Finding 7). A shaft-end or bore-entry chamfer is a
// `cone` face that is axis-aligned, small, and topologically flanked by a
// coaxial `cylinder` face and a coaxial planar end face (normal along the axis).
// Its 45 deg leg length equals its axial span, which is what toHaveChamferFeature
// checks as `distance`.
// C1: emitted only when the cone is small, axis-aligned, and flanked by both a
// coaxial cylinder and a coaxial end plane - the shaft-end / bore chamfer
// signature - so a deep taper or a stray cone is never reported as a chamfer.
// Deterministic: candidates are traversal-ordered and distances rounded to a
// stable key before de-duplication.
const deriveChamferFeaturesFromFaceFacts = (faces: readonly SelectorFaceFacts[]): ChamferFeature[] => {
  const cones = faces.filter((face) => face.surfaceType === 'cone');
  const cylinders = faces.filter((face) => face.surfaceType === 'cylinder');
  const planes = faces.filter((face) => face.surfaceType === 'plane');
  const maxChamferDistance = 10;

  const distances = new Set<number>();
  const derived: ChamferFeature[] = [];
  for (const cone of cones) {
    const axis = axisOf(cone.axisDirection);
    if (!axis) {
      continue;
    }
    const distance = axialSpan(cone, axis);
    if (distance <= 1e-6 || distance > maxChamferDistance) {
      continue;
    }
    // A chamfer bridges a coaxial cylinder wall and a coaxial end face; require
    // both so a stand-alone taper is never surfaced as a chamfer (C1).
    const coaxialCylinder = cylinders.some((cylinder) => axisOf(cylinder.axisDirection) === axis);
    const coaxialEndPlane = planes.some((plane) => axisOf(plane.normal) === axis);
    if (!coaxialCylinder || !coaxialEndPlane) {
      continue;
    }
    // Round to a micrometer-stable key so identical chamfers around a revolve collapse.
    const key = Math.round(distance * 1000) / 1000;
    if (distances.has(key)) {
      continue;
    }
    distances.add(key);
    derived.push({ distance: key, selection: `revolved chamfer (axis ${axis})` });
  }
  return derived;
};

// Axial gap (mm) beyond which two blind holes belong to different pads.
const padSeparationGap = 20;

const holePatternFrom = (group: readonly CircularHole[]): CircularHolePattern => {
  const { axis } = group[0]!;
  const centre: [number, number, number] = [0, 0, 0];
  for (const hole of group) {
    centre[0] += hole.center![0];
    centre[1] += hole.center![1];
    centre[2] += hole.center![2];
  }
  centre[0] /= group.length;
  centre[1] /= group.length;
  centre[2] /= group.length;
  const [px, py] = perpendicularAxes(axis).map((perpendicularAxis) => axisIndices[perpendicularAxis]);
  let radialSum = 0;
  for (const hole of group) {
    radialSum += Math.hypot(hole.center![px!] - centre[px!], hole.center![py!] - centre[py!]);
  }
  return {
    count: group.length,
    holeDiameter: group[0]!.diameter,
    boltCircleDiameter: (2 * radialSum) / group.length,
    axis,
    center: centre,
  };
};

// Split a blind-hole family into per-pad clusters by their entry-face plane:
// sort by axial centre and start a new pad wherever the gap exceeds
// padSeparationGap. Sorting on a scalar coordinate keeps the split deterministic
// (C2).
const splitBlindHolesByPad = (holes: readonly CircularHole[]): CircularHole[][] => {
  const axialIndex = axisIndices[holes[0]!.axis];
  const sorted = [...holes].sort((a, b) => a.center![axialIndex] - b.center![axialIndex]);
  const pads: CircularHole[][] = [];
  let current: CircularHole[] = [];
  let previous: number | undefined;
  for (const hole of sorted) {
    const axial = hole.center![axialIndex];
    if (previous !== undefined && axial - previous > padSeparationGap) {
      pads.push(current);
      current = [];
    }
    current.push(hole);
    previous = axial;
  }
  pads.push(current);
  return pads;
};

// Re-group circular holes into per-pattern families (WS-E / Finding 7). The
// native recognizer keys only by (axis, diameter), so two mirror-symmetric
// blind-tap pads on opposite faces merge into one over-counted pattern. Rule:
//   - Base family = (axis, diameter).
//   - THROUGH holes stay in one family per base key (a through pattern spans the
//     part and legitimately spreads along/around the axis, for example a bolt
//     circle or a row of breathing windows).
//   - BLIND holes (taps) enter from a single face, so a family is split into
//     pads by entry-plane clustering: a large axial gap starts a new pad.
// So two positive/negative-y pads of 3 taps report count 3 each (not a merged
// 6), while a single-face bolt circle of 6 blind taps stays count 6. Shallow
// taps are kept (no depth/aspect floor) so short blind bores still pattern.
// Deterministic: holes are consumed in native traversal order, clusters seeded
// by that order.
const deriveHolePatterns = (holes: readonly CircularHole[]): CircularHolePattern[] => {
  const families = new Map<string, CircularHole[]>();
  for (const hole of holes) {
    if (!hole.center) {
      continue;
    }
    const diameterKey = Math.round(hole.diameter * 1000) / 1000;
    // Through patterns are one family per (axis, diameter); blind taps are split
    // into pads below, keyed apart so a through row and a blind pad never merge.
    const kindKey = hole.through ? 'through' : 'blind';
    const key = `${hole.axis}:${diameterKey}:${kindKey}`;
    families.set(key, [...(families.get(key) ?? []), hole]);
  }

  const patterns: CircularHolePattern[] = [];
  for (const [key, family] of families) {
    const groups = key.endsWith(':blind') ? splitBlindHolesByPad(family) : [family];
    for (const group of groups) {
      if (group.length >= 2) {
        patterns.push(holePatternFrom(group));
      }
    }
  }
  return patterns;
};

// Chamfer/hole re-derivation is a per-part feature check; the rev2
// chamfer/pattern REQs load individual parts. Cap face-fact collection to
// part-scale occurrence counts so a 650-occurrence assembly load never pays a
// native faceFacts() call per occurrence (Finding 9 — and now the sweep only
// runs when the feature facet itself is demanded).
const maxPartOccurrences = 8;

const collectSelectorFaceFacts = (native: GeoSpecNativeXdeReadResult, occurrenceCount: number): SelectorFaceFacts[] => {
  if (occurrenceCount > maxPartOccurrences) {
    return [];
  }
  const facts: SelectorFaceFacts[] = [];
  for (let position = 0; position < occurrenceCount; position++) {
    try {
      const parsed = JSON.parse(native.faceFacts(position)) as { faces?: SelectorFaceFacts[] };
      if (Array.isArray(parsed.faces)) {
        facts.push(...parsed.faces);
      }
    } catch {
      // A single occurrence's fact read failing must not drop the facet.
    }
  }
  return facts;
};

const normalizeFeatureEvidence = (
  raw: FaceFeaturesFacet,
  boundingBox: BrepEvidence['boundingBox'],
  faceFacts: readonly SelectorFaceFacts[],
): FaceFeaturesFacet => {
  // The through-state and cap heuristics read only boundingBox + planarFaces;
  // hand them a context shaped like the eager loader's full brep object.
  const context: BrepEvidence = { boundingBox, planarFaces: raw.planarFaces };

  const circularHoles = raw.circularHoles?.map((hole) => {
    const rangeThrough = holeThroughFromAxisRange({ brep: context, axis: hole.axis, axisRange: hole.axisRange });
    const cappedBlindHole = hasInternalCircularCap({
      brep: context,
      diameter: hole.diameter,
      axis: hole.axis,
      center: hole.center,
    });
    return {
      ...hole,
      through: rangeThrough ?? (hole.through && !cappedBlindHole),
    };
  });

  // Re-derive pattern grouping from the corrected through-state so mirror-
  // symmetric pads and single-face bolt circles are grouped per the rule above.
  const circularHolePatterns = circularHoles ? deriveHolePatterns(circularHoles) : raw.circularHolePatterns;

  // Union the native (planar-bevel) chamfers with revolved cone chamfers the
  // native recognizer cannot see.
  const derivedChamfers = deriveChamferFeaturesFromFaceFacts(faceFacts);
  const chamferFeatures =
    derivedChamfers.length > 0 ? [...(raw.chamferFeatures ?? []), ...derivedChamfers] : raw.chamferFeatures;

  return {
    ...raw,
    ...(circularHoles ? { circularHoles } : {}),
    ...(circularHolePatterns ? { circularHolePatterns } : {}),
    ...(chamferFeatures ? { chamferFeatures } : {}),
  };
};

// === Ledger ===

/** Options for {@link createBrepEvidenceLedger}. @public */
export type CreateBrepEvidenceLedgerOptions = {
  native: GeoSpecNativeXdeReadResult;
  /** Occurrence count from the XDE read (caps the face-facts sweep). */
  occurrenceCount: number;
  /** Options JSON for parameterless-facet calls (forensic flag). */
  facetOptionsJson: string;
  /** Options JSON for the wall-thickness facet (adds the R13 work-unit budget). */
  wallThicknessOptionsJson: string;
  /** SHA-256 of the subject artifact bytes (R5 persistent facet identity). */
  contentHash?: string;
};

const parseFacetJson = <T>(json: string): T => {
  const parsed = JSON.parse(json) as T & { error?: string };
  if (parsed.error !== undefined) {
    throw new Error(parsed.error);
  }
  return parsed;
};

/**
 * Create the lazily-materialized `subject.brep` evidence object for a STEP
 * subject over its retained native XDE handle.
 *
 * @param options - Native handle plus per-load facet options.
 * @returns The BRep evidence object whose fields materialize on first read.
 * @public
 */
export const createBrepEvidenceLedger = (options: CreateBrepEvidenceLedgerOptions): BrepEvidence => {
  const { native } = options;
  const memo = new Map<BrepFacetName, unknown>();
  const diagnostics = new Map<BrepFacetName, GeometryDiagnostic>();

  const recordFailure = (facet: BrepFacetName, message: string): void => {
    diagnostics.set(facet, {
      code: 'GEOSPEC_FACET_FAILED',
      severity: 'error',
      message: `GeoSpec ${facet} facet failed: ${message}`,
      details: { facet },
    });
  };

  const force = <T>(facet: BrepFacetName, materialize: () => T | undefined): T | undefined => {
    if (memo.has(facet)) {
      return memo.get(facet) as T | undefined;
    }
    let value: T | undefined;
    try {
      if (native.isDeleted?.()) {
        throw new Error('the native XDE handle was disposed before this facet was demanded');
      }
      // R5: persist successful facet values subject-scoped (L4 of the caching
      // ladder). Failures throw past the cache and are never stored; the
      // facet's options JSON is part of the key, so a work-unit budget change
      // (wall thickness) is a different entry, never a stale read.
      const evidenceCache = getGeoSpecEvidenceCache();
      value =
        evidenceCache && options.contentHash !== undefined
          ? evidenceCache.getOrCompute({
              family: 'brep-facet',
              version: 1,
              key: {
                subjectHash: options.contentHash,
                facet,
                options: facet === 'wallThickness' ? options.wallThicknessOptionsJson : options.facetOptionsJson,
              },
              compute: () => forensicSync(`facet.${facet}`, materialize),
            })
          : forensicSync(`facet.${facet}`, materialize);
    } catch (error) {
      recordFailure(facet, error instanceof Error ? error.message : String(error));
      value = undefined;
    }
    memo.set(facet, value);
    return value;
  };

  const summary = (): SummaryFacet | undefined =>
    force('summary', () => parseFacetJson<SummaryFacet>(native.analysisSummaryJson()));

  const massProperties = (): BrepEvidence['massProperties'] =>
    force('massProperties', () => {
      const parsed = parseFacetJson<{ massProperties?: BrepEvidence['massProperties'] }>(
        native.analysisMassPropertiesJson(),
      );
      return parsed.massProperties;
    });

  const validity = (): BrepEvidence['validity'] =>
    force('validity', () => {
      const parsed = parseFacetJson<{ validity?: BrepEvidence['validity'] }>(
        native.analysisValidityJson(options.facetOptionsJson),
      );
      return parsed.validity;
    });

  const faceFeatures = (): FaceFeaturesFacet | undefined =>
    force('faceFeatures', () => {
      const raw = parseFacetJson<FaceFeaturesFacet>(native.analysisFaceFeaturesJson());
      const boundingBox = summary()?.boundingBox;
      const faceFacts = collectSelectorFaceFacts(native, options.occurrenceCount);
      return normalizeFeatureEvidence(raw, boundingBox, faceFacts);
    });

  const wallThickness = (): BrepEvidence['minimumWallThickness'] =>
    force('wallThickness', () => {
      const parsed = parseFacetJson<WallThicknessFacetPayload>(
        native.analysisWallThicknessJson(options.wallThicknessOptionsJson),
      );
      if (parsed.budgetExceeded) {
        // R13: deterministic bounded failure on the MATCHER_TIMEOUT contract —
        // a partial minimum is not a verdict, so no evidence is reported.
        const { workUnits, limit } = parsed.budgetExceeded;
        diagnostics.set('wallThickness', {
          code: 'MATCHER_TIMEOUT',
          severity: 'error',
          message: `GeoSpec wall-thickness facet exceeded its ${limit} work-unit budget after ${workUnits} units (exact extrema + material-interval proofs) and was abandoned; no partial minimum is reported.`,
          suggestion:
            'Narrow the claim, simplify the subject geometry, or raise GEOSPEC_WALL_WORK_UNIT_BUDGET if a healthy heavy subject legitimately needs more work.',
          details: { facet: 'wallThickness', workUnits, limit },
        });
        return undefined;
      }
      return parsed.minimumWallThickness;
    });

  const brep: BrepEvidence = {};
  const defineLazy = (field: keyof BrepEvidence, read: () => unknown): void => {
    Object.defineProperty(brep, field, { enumerable: true, configurable: true, get: read });
  };

  defineLazy('topologyCounts', () => summary()?.topologyCounts);
  defineLazy('boundingBox', () => summary()?.boundingBox);
  defineLazy('massProperties', () => massProperties());
  defineLazy('validity', () => validity());
  defineLazy('planarFaces', () => faceFeatures()?.planarFaces);
  defineLazy('cylindricalFaces', () => faceFeatures()?.cylindricalFaces);
  defineLazy('circularHoles', () => faceFeatures()?.circularHoles);
  defineLazy('circularHolePatterns', () => faceFeatures()?.circularHolePatterns);
  defineLazy('chamferFeatures', () => faceFeatures()?.chamferFeatures);
  defineLazy('filletFeatures', () => faceFeatures()?.filletFeatures);
  defineLazy('minimumWallThickness', () => wallThickness());

  // Serialization guard: only materialized facets appear, so JSON.stringify
  // of a subject (reports, debug dumps) can never force full analysis.
  Object.defineProperty(brep, 'toJSON', {
    enumerable: false,
    configurable: true,
    value: (): Record<string, unknown> => {
      const snapshot: Record<string, unknown> = {};
      if (memo.has('summary')) {
        const value = memo.get('summary') as SummaryFacet | undefined;
        snapshot['topologyCounts'] = value?.topologyCounts;
        snapshot['boundingBox'] = value?.boundingBox;
      }
      if (memo.has('massProperties')) {
        snapshot['massProperties'] = memo.get('massProperties');
      }
      if (memo.has('validity')) {
        snapshot['validity'] = memo.get('validity');
      }
      if (memo.has('faceFeatures')) {
        const value = memo.get('faceFeatures') as FaceFeaturesFacet | undefined;
        snapshot['planarFaces'] = value?.planarFaces;
        snapshot['cylindricalFaces'] = value?.cylindricalFaces;
        snapshot['circularHoles'] = value?.circularHoles;
        snapshot['circularHolePatterns'] = value?.circularHolePatterns;
        snapshot['chamferFeatures'] = value?.chamferFeatures;
        snapshot['filletFeatures'] = value?.filletFeatures;
      }
      if (memo.has('wallThickness')) {
        snapshot['minimumWallThickness'] = memo.get('wallThickness');
      }
      return snapshot;
    },
  });

  facetDiagnosticsByBrep.set(brep, diagnostics);
  return brep;
};
