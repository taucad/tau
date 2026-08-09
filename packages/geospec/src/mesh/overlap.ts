import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import { getMeshAnalysisRecord, sweepAxisByCentreVariance } from '#mesh/analysis-record.js';
import type { MeshAnalysisRecord, MeshComponentRecord } from '#mesh/analysis-record.js';
import { arrangementPairVolume } from '#mesh/overlap-arrangement.js';
import { buildComponentDisjointnessData, provePairDisjoint } from '#mesh/overlap-prefilter.js';
import type { ComponentDisjointnessData } from '#mesh/overlap-prefilter.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3, WatertightPrimitiveBreakdown } from '#mesh/types.js';
import { getGeoSpecEvidenceCache } from '#cache/evidence-cache.js';
import { forensicCount, forensicEnabled, forensicLog, forensicSync } from '#runner/forensic.js';
import { chargeBudget } from '#runner/matcher-budget.js';
import { getGeoSpecResourceScope } from '#runner/resource-scope.js';
import type { GeoSpecOverlapCacheProfile } from '#runner/profile.js';

/**
 * Options for component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapOptions = {
  subject: GeometrySubject;
  tolerance?: number;
  pairs?: MeshOverlapPairSelector[];
};

/**
 * Component selector used to narrow overlap analysis to named component pairs.
 *
 * @public
 */
export type MeshOverlapComponentSelector = string | RegExp;

/**
 * Pair selector used to narrow overlap analysis to named component pairs.
 *
 * @public
 */
export type MeshOverlapPairSelector = {
  left: MeshOverlapComponentSelector;
  right: MeshOverlapComponentSelector;
};

/**
 * One overlapping component pair found by {@link analyzeMeshOverlap}.
 *
 * @public
 */
export type MeshComponentOverlap = {
  leftComponentId: number;
  rightComponentId: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
  intersectionVolume: number;
  witnessPoint?: Vec3;
  penetration: 'positive-volume';
};

/**
 * Successful overlap analysis.
 *
 * @public
 */
export type MeshOverlapEvidence = {
  componentSource: 'named' | 'connected';
  componentCount: number;
  selectedPairs?: MeshOverlapSelectedPair[];
  checkedPairs: number;
  tolerance: number;
  overlaps: MeshComponentOverlap[];
};

/**
 * One selector-expanded component pair considered by overlap analysis before
 * AABB pruning.
 *
 * @public
 */
export type MeshOverlapSelectedPair = {
  leftLabel: string;
  rightLabel: string;
};

/**
 * Typed result for component-overlap analysis.
 *
 * @public
 */
export type AnalyzeMeshOverlapResult =
  | { success: true; evidence: MeshOverlapEvidence; diagnostics: GeometryDiagnostic[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

type AabbPair = {
  left: MeshComponentRecord;
  right: MeshComponentRecord;
};

type PairSelectionResult =
  | { success: true; pairs: AabbPair[]; selectedPairs?: MeshOverlapSelectedPair[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

type PreparedManifoldComponent = {
  component: MeshComponentRecord;
  /**
   * Whether {@link ensureComponentManifold} has run. Lazy preparation keeps
   * this `false` until a pair's volume misses the cache; a warm run whose pairs
   * all replay from the persistent cache builds no Manifolds at all.
   */
  built: boolean;
  merged: boolean;
  manifold?: ManifoldSolid;
  status?: unknown;
  error?: {
    message: string;
    code?: string;
  };
  /**
   * SHA-256 of the component's WORLD-FRAME triangle soup (R5/A2): placement is
   * part of the value, so pair evidence keys on participant world geometry —
   * change one part of 650 and the other pairs' keys are unchanged. Computed at
   * (cheap) record preparation so the pair cache can be peeked before the
   * (expensive) Manifold build.
   */
  contentHash?: string;
  /**
   * The world-frame soup gathered for hashing (R18/13b), retained until the
   * Manifold build consumes it or the sweep ends — so builds and the
   * disjointness pre-filter never re-gather.
   */
  soup?: Float32Array<ArrayBuffer>;
  /**
   * R14-lite structures (BVH, islands, winding mesh), built on the first pair
   * miss the component participates in and released with the sweep.
   */
  disjointness?: ComponentDisjointnessData;
  /** CR1 census: the component's own solid volume, fetched once per sweep. */
  solidVolume?: number;
};

type CachedPairVolume = {
  volume: number;
  witnessPoint?: Vec3;
};

type MeshOverlapCache = {
  wasm: ManifoldToplevel;
  preparedComponents: Map<number, PreparedManifoldComponent>;
  pairVolumes: Map<string, CachedPairVolume>;
  invalidDiagnosticsByComponentSet: Map<string, GeometryDiagnostic[]>;
  profile?: GeoSpecOverlapCacheProfile;
  disposed: boolean;
  dispose(): void;
};

type MeshOverlapCacheStats = {
  preparedComponents: number;
  pairVolumes: number;
  invalidDiagnosticSets: number;
  disposed: boolean;
};

const defaultOverlapTolerance = 0.1;
const meshOverlapCacheSymbol = Symbol.for('tau.geospec.meshOverlapCache');

type MeshOverlapCachedSubject = GeometrySubject & {
  [meshOverlapCacheSymbol]?: MeshOverlapCache;
};

// Shared per-process Manifold init (also serves the hybrid void engine).
const loadManifold = ensureManifoldModule;

const disposeMeshOverlapCache = (cache: MeshOverlapCache): void => {
  if (cache.disposed) {
    return;
  }
  cache.disposed = true;
  if (cache.profile) {
    cache.profile.cacheDisposals += 1;
  }
  disposePrepared([...cache.preparedComponents.values()]);
  cache.preparedComponents.clear();
  cache.pairVolumes.clear();
  cache.invalidDiagnosticsByComponentSet.clear();
};

const getOrCreateMeshOverlapCache = (options: {
  subject: GeometrySubject;
  wasm: ManifoldToplevel;
  profile?: GeoSpecOverlapCacheProfile;
}): { cache: MeshOverlapCache; created: boolean } => {
  const cachedSubject = options.subject as MeshOverlapCachedSubject;
  const existing = cachedSubject[meshOverlapCacheSymbol];
  if (existing && !existing.disposed) {
    return { cache: existing, created: false };
  }

  const cache: MeshOverlapCache = {
    wasm: options.wasm,
    preparedComponents: new Map(),
    pairVolumes: new Map(),
    invalidDiagnosticsByComponentSet: new Map(),
    ...(options.profile ? { profile: options.profile } : {}),
    disposed: false,
    dispose(): void {
      disposeMeshOverlapCache(cache);
      if ((options.subject as MeshOverlapCachedSubject)[meshOverlapCacheSymbol] === cache) {
        (options.subject as MeshOverlapCachedSubject)[meshOverlapCacheSymbol] = undefined;
      }
    },
  };
  if (options.profile) {
    options.profile.cacheCreations += 1;
  }
  cachedSubject[meshOverlapCacheSymbol] = cache;
  return { cache, created: true };
};

/**
 * Inspect internal mesh-overlap cache state for tests and opt-in benchmarks.
 *
 * @internal
 */
export const getMeshOverlapCacheStats = (subject: GeometrySubject): MeshOverlapCacheStats | undefined => {
  const cache = (subject as MeshOverlapCachedSubject)[meshOverlapCacheSymbol];
  if (!cache) {
    return undefined;
  }
  return {
    preparedComponents: cache.preparedComponents.size,
    pairVolumes: cache.pairVolumes.size,
    invalidDiagnosticSets: cache.invalidDiagnosticsByComponentSet.size,
    disposed: cache.disposed,
  };
};

const aabbCenter = (component: MeshComponentRecord): Vec3 => [
  (component.aabb.min[0] + component.aabb.max[0]) / 2,
  (component.aabb.min[1] + component.aabb.max[1]) / 2,
  (component.aabb.min[2] + component.aabb.max[2]) / 2,
];

const intersectionAabbCenter = (left: MeshComponentRecord, right: MeshComponentRecord): Vec3 => [
  (Math.max(left.aabb.min[0], right.aabb.min[0]) + Math.min(left.aabb.max[0], right.aabb.max[0])) / 2,
  (Math.max(left.aabb.min[1], right.aabb.min[1]) + Math.min(left.aabb.max[1], right.aabb.max[1])) / 2,
  (Math.max(left.aabb.min[2], right.aabb.min[2]) + Math.min(left.aabb.max[2], right.aabb.max[2])) / 2,
];

const aabbsOverlap = (left: MeshComponentRecord, right: MeshComponentRecord, tolerance: number): boolean =>
  left.aabb.min[0] <= right.aabb.max[0] + tolerance &&
  left.aabb.max[0] + tolerance >= right.aabb.min[0] &&
  left.aabb.min[1] <= right.aabb.max[1] + tolerance &&
  left.aabb.max[1] + tolerance >= right.aabb.min[1] &&
  left.aabb.min[2] <= right.aabb.max[2] + tolerance &&
  left.aabb.max[2] + tolerance >= right.aabb.min[2];

const aabbCandidatePairs = (components: readonly MeshComponentRecord[], tolerance: number): AabbPair[] => {
  const pairs: AabbPair[] = [];
  // R18/13e: sweep along the max-variance centre axis (pure function of the
  // subject; tie order x ≥ y ≥ z) so a colinear-x stack cannot degrade the
  // prune to O(n²). Candidacy stays the 3-axis aabbsOverlap test, so the
  // pair SET is axis-independent.
  const axis = sweepAxisByCentreVariance(components.map((component) => component.aabb));
  const sorted = [...components].sort((left, right) => left.aabb.min[axis] - right.aabb.min[axis]);
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex++) {
    const left = sorted[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex++) {
      const right = sorted[rightIndex]!;
      if (right.aabb.min[axis] > left.aabb.max[axis] + tolerance) {
        break;
      }
      if (aabbsOverlap(left, right, tolerance)) {
        // Canonical internal order (lower id = left) so observable labels and
        // witnesses never depend on which sweep axis enumerated the pair.
        pairs.push(left.id <= right.id ? { left, right } : { left: right, right: left });
      }
    }
  }
  // Canonical enumeration order for the same reason: the first reported
  // overlap supplies the failure witness.
  pairs.sort((first, second) => first.left.id - second.left.id || first.right.id - second.right.id);
  return pairs;
};

const aabbFilteredPairs = (pairs: readonly AabbPair[], tolerance: number): AabbPair[] =>
  pairs.filter((pair) => aabbsOverlap(pair.left, pair.right, tolerance));

const invalidToleranceDiagnostic = (tolerance: unknown): GeometryDiagnostic => ({
  code: 'GEOSPEC_INVALID_EXPECTATION',
  severity: 'error',
  message: 'analyzeMeshOverlap received an invalid tolerance: expected a non-negative finite number.',
  suggestion: 'Use analyzeMeshOverlap({ subject, tolerance: 0.1 }).',
  details: { tolerance },
});

const selectorLabel = (selector: MeshOverlapComponentSelector): string =>
  typeof selector === 'string' ? selector : selector.toString();

const selectorMatches = (selector: MeshOverlapComponentSelector, label: string): boolean =>
  typeof selector === 'string'
    ? label === selector
    : (() => {
        selector.lastIndex = 0;
        const matched = selector.test(label);
        selector.lastIndex = 0;
        return matched;
      })();

const selectorUnmatchedDiagnostic = (options: {
  selector: MeshOverlapComponentSelector;
  side: 'left' | 'right';
  pairIndex: number;
  availableLabels: readonly string[];
}): GeometryDiagnostic => ({
  code: 'GEOSPEC_COMPONENT_PAIR_SELECTOR_UNMATCHED',
  severity: 'error',
  message: `Component overlap pair selector ${options.pairIndex} matched no ${options.side} component labels.`,
  suggestion:
    'Use exact component names from the exported assembly, or a RegExp that matches the intended component labels.',
  details: {
    pairIndex: options.pairIndex,
    side: options.side,
    selector: selectorLabel(options.selector),
    availableLabels: options.availableLabels,
  },
});

const pairKey = (left: MeshComponentRecord, right: MeshComponentRecord): string => {
  const low = Math.min(left.id, right.id);
  const high = Math.max(left.id, right.id);
  return `${low}:${high}`;
};

const selectComponentPairs = (
  components: readonly MeshComponentRecord[],
  selectors: readonly MeshOverlapPairSelector[] | undefined,
): PairSelectionResult => {
  if (!selectors || selectors.length === 0) {
    return { success: true, pairs: [] };
  }

  const availableLabels = components.map((component) => component.label);
  const diagnostics: GeometryDiagnostic[] = [];
  const pairsByKey = new Map<string, AabbPair>();

  for (const [pairIndex, selector] of selectors.entries()) {
    const leftMatches = components.filter((component) => selectorMatches(selector.left, component.label));
    const rightMatches = components.filter((component) => selectorMatches(selector.right, component.label));
    if (leftMatches.length === 0) {
      diagnostics.push(
        selectorUnmatchedDiagnostic({
          selector: selector.left,
          side: 'left',
          pairIndex,
          availableLabels,
        }),
      );
    }
    if (rightMatches.length === 0) {
      diagnostics.push(
        selectorUnmatchedDiagnostic({
          selector: selector.right,
          side: 'right',
          pairIndex,
          availableLabels,
        }),
      );
    }
    for (const left of leftMatches) {
      for (const right of rightMatches) {
        if (left.id === right.id) {
          continue;
        }
        const key = pairKey(left, right);
        if (!pairsByKey.has(key)) {
          pairsByKey.set(key, { left, right });
        }
      }
    }
  }

  if (diagnostics.length > 0) {
    return { success: false, diagnostics };
  }

  const pairs = [...pairsByKey.values()];
  return {
    success: true,
    pairs,
    selectedPairs: pairs.map((pair) => ({
      leftLabel: pair.left.label,
      rightLabel: pair.right.label,
    })),
  };
};

const partitionInconclusiveDiagnostic = (subject: GeometrySubject): GeometryDiagnostic => ({
  code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE',
  severity: 'error',
  message: 'GeoSpec could not identify at least two independently testable mesh components.',
  suggestion:
    'Preserve component names/groups in the exported assembly, or test a source that returns separate closed parts.',
  details: {
    triangleCount: subject.mesh.stats.meshQuality.triangleCount,
    primitiveCount: new Set(subject.mesh.stats.meshQuality.triangles.map((triangle) => triangle.primitive)).size,
    source: subject.provenance.source,
    unit: subject.provenance.unit,
    parameters: subject.provenance.parameters,
  },
});

const manifoldUnavailableDiagnostic = (error: unknown): GeometryDiagnostic => ({
  code: 'GEOSPEC_MANIFOLD_BACKEND_UNAVAILABLE',
  severity: 'error',
  message: error instanceof Error ? error.message : String(error),
  suggestion:
    'Ensure the manifold-3d WASM package is available; GeoSpec does not fall back to OCCT or JavaScript triangle overlap for mesh-solid volume checks.',
  details: error,
});

/**
 * Gather a component's world-frame triangle soup (9 floats/triangle).
 *
 * @param record - The subject mesh analysis record (positions + indices).
 * @param component - The component whose triangles to collect.
 * @returns The component's flat vertex soup, one triangle per 9 floats.
 */
const gatherComponentSoup = (record: MeshAnalysisRecord, component: MeshComponentRecord): Float32Array<ArrayBuffer> => {
  const vertProperties = new Float32Array(component.triangleCount * 9);
  let offset = 0;
  for (const triangleIndex of component.triangleIndices) {
    const triangleOffset = triangleIndex * 3;
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = record.triangleIndices[triangleOffset + corner]!;
      const positionOffset = vertexIndex * 3;
      vertProperties[offset++] = record.positions[positionOffset]!;
      vertProperties[offset++] = record.positions[positionOffset + 1]!;
      vertProperties[offset++] = record.positions[positionOffset + 2]!;
    }
  }
  return vertProperties;
};

/**
 * Build the Manifold solid for one prepared component — the expensive half of
 * preparation (vertex weld, half-edge construction, 2-manifold validation) that
 * lazy preparation defers until a pair's volume actually misses the cache.
 * Mutates `prepared` in place and is idempotent (`built` guards a second call),
 * so a component shared by many pairs is constructed at most once.
 *
 * @param options - The overlap cache, mesh record, and the prepared component
 *   record to populate with its Manifold (or its construction error).
 * @returns The same `prepared` record, now with `built` set.
 */
const ensureComponentManifold = (options: {
  cache: MeshOverlapCache;
  record: MeshAnalysisRecord;
  prepared: PreparedManifoldComponent;
}): PreparedManifoldComponent => {
  const { cache, record, prepared } = options;
  if (prepared.built) {
    return prepared;
  }
  prepared.built = true;
  if (cache.profile) {
    cache.profile.preparedComponentMisses += 1;
  }
  bucketedStep('build', () => {
    // R18/13b: reuse the soup the cheap half gathered for hashing; re-gather
    // only when the sweep already released it.
    const vertProperties = prepared.soup ?? gatherComponentSoup(record, prepared.component);
    delete prepared.soup;
    const triVerts = new Uint32Array(vertProperties.length / 3);
    for (let index = 0; index < triVerts.length; index++) {
      triVerts[index] = index;
    }
    const mesh = new cache.wasm.Mesh({ numProp: 3, vertProperties, triVerts });
    prepared.merged = mesh.merge();
    try {
      const manifold = new cache.wasm.Manifold(mesh);
      prepared.manifold = manifold;
      prepared.status = manifold.status();
    } catch (error) {
      prepared.error = {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
      };
    }
  });
  return prepared;
};

const baseComponentLabel = (label: string): string => label.split('#')[0] ?? label;

const findWatertightBreakdown = (
  perPrimitive: readonly WatertightPrimitiveBreakdown[],
  label: string,
): WatertightPrimitiveBreakdown | undefined => {
  const exact = perPrimitive.find((primitive) => primitive.name === label);
  if (exact) {
    return exact;
  }
  const baseLabel = baseComponentLabel(label);
  return perPrimitive.find(
    (primitive) => primitive.name === baseLabel || baseComponentLabel(primitive.name) === baseLabel,
  );
};

const diagnosticFacetKind = (diagnostic: GeometryDiagnostic): string | undefined => {
  const { details } = diagnostic;
  if (typeof details !== 'object' || details === null || !('facet' in details)) {
    return undefined;
  }
  const { facet } = details as { facet?: unknown };
  if (typeof facet !== 'object' || facet === null || !('kind' in facet)) {
    return undefined;
  }
  const { kind } = facet as { kind?: unknown };
  return typeof kind === 'string' ? kind : undefined;
};

const invalidComponentSuggestion = (subject: GeometrySubject): string =>
  subject.diagnostics.some(
    (diagnostic) => diagnostic.code === 'GEOMETRY_INVALID' || diagnosticFacetKind(diagnostic) === 'source-validity',
  )
    ? 'Fix the source part reported by runtime diagnostics so it exports as a closed oriented 2-manifold mesh before running positive-volume overlap checks.'
    : 'Repair the source CAD so this part exports as a closed oriented 2-manifold mesh before running positive-volume overlap checks.';

const invalidComponentDiagnostics = (options: {
  components: readonly PreparedManifoldComponent[];
  subject: GeometrySubject;
}): GeometryDiagnostic[] => {
  const watertight = options.subject.mesh.stats.analyseWatertight();
  const sourceDiagnostics =
    options.subject.diagnostics.length > 0
      ? options.subject.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
          details: diagnostic.details,
        }))
      : undefined;

  return options.components
    .filter((component) => !component.manifold)
    .map((component) => {
      const primitiveWatertight = findWatertightBreakdown(watertight.perPrimitive, component.component.label);
      return {
        code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID',
        severity: 'error',
        message: `Manifold rejected component '${component.component.label}' as ${component.error?.code ?? 'invalid'}.`,
        suggestion: invalidComponentSuggestion(options.subject),
        spatial: {
          min: component.component.aabb.min,
          max: component.component.aabb.max,
          center: aabbCenter(component.component),
        },
        details: {
          label: component.component.label,
          triangleCount: component.component.triangleCount,
          merged: component.merged,
          error: component.error,
          watertight: {
            global: {
              watertight: watertight.watertight,
              irregularEdges: watertight.irregularEdges,
              openBoundaryEdges: watertight.openBoundaryEdges,
              nonManifoldEdges: watertight.nonManifoldEdges,
              irregularEdgeKindCounts: watertight.irregularEdgeKindCounts,
              irregularEdgeClusters: watertight.irregularEdgeClusters,
              totalEdges: watertight.totalEdges,
              irregularEdgeFraction: watertight.irregularEdgeFraction,
            },
            primitive: primitiveWatertight,
          },
          sourceDiagnostics,
        },
      };
    });
};

const volumeWitness = (manifold: ManifoldSolid, fallback: Vec3): Vec3 => {
  try {
    const box = manifold.boundingBox();
    return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  } catch {
    return fallback;
  }
};

const disposePrepared = (components: readonly PreparedManifoldComponent[]): void => {
  for (const component of components) {
    component.manifold?.delete();
  }
};

const prepareComponentRecord = (options: {
  cache: MeshOverlapCache;
  record: MeshAnalysisRecord;
  component: MeshComponentRecord;
}): PreparedManifoldComponent => {
  const cached = options.cache.preparedComponents.get(options.component.id);
  if (cached) {
    if (options.cache.profile) {
      options.cache.profile.preparedComponentHits += 1;
    }
    return cached;
  }
  // Cheap half of preparation: the world-frame content hash keys the pair
  // cache, so it must exist before any Manifold build — that lets a pair whose
  // volume is already cached skip the build entirely (ensureComponentManifold).
  // R18/13b: the soup gathered for hashing is retained until the sweep ends,
  // so a Manifold build (or the disjointness pre-filter) never re-gathers it.
  const vertProperties = gatherComponentSoup(options.record, options.component);
  const contentHash = getGeoSpecEvidenceCache()?.hashBytes(
    new Uint8Array(vertProperties.buffer, vertProperties.byteOffset, vertProperties.byteLength),
  );
  const prepared: PreparedManifoldComponent = {
    component: options.component,
    built: false,
    merged: false,
    soup: vertProperties,
    ...(contentHash === undefined ? {} : { contentHash }),
  };
  options.cache.preparedComponents.set(options.component.id, prepared);
  return prepared;
};

const componentSetKey = (components: readonly PreparedManifoldComponent[]): string =>
  components
    .map((component) => component.component.id)
    .sort((left, right) => left - right)
    .join(':');

const invalidDiagnosticsForComponents = (options: {
  cache: MeshOverlapCache;
  components: readonly PreparedManifoldComponent[];
  subject: GeometrySubject;
}): GeometryDiagnostic[] => {
  const key = componentSetKey(options.components);
  const cached = options.cache.invalidDiagnosticsByComponentSet.get(key);
  if (cached) {
    if (options.cache.profile) {
      options.cache.profile.invalidDiagnosticHits += 1;
    }
    return cached;
  }
  if (options.cache.profile) {
    options.cache.profile.invalidDiagnosticMisses += 1;
  }
  const diagnostics = invalidComponentDiagnostics({
    components: options.components,
    subject: options.subject,
  });
  options.cache.invalidDiagnosticsByComponentSet.set(key, diagnostics);
  return diagnostics;
};

// CR1: per-sweep step attribution — accumulate milliseconds per step across
// the whole sweep and emit ONE aggregate [FORENSIC] line per bucket at the end
// (per-pair emission would be thousands of stderr lines; the flat one-line
// span format the drivers grep stays intact). Zero timer reads when disabled.
const forensicStepBuckets = new Map<string, number>();

const bucketedStep = <T>(step: string, run: () => T): T => {
  if (!forensicEnabled()) {
    return run();
  }
  const start = performance.now();
  try {
    return run();
  } finally {
    forensicStepBuckets.set(step, (forensicStepBuckets.get(step) ?? 0) + (performance.now() - start));
  }
};

const flushForensicStepBuckets = (): void => {
  for (const [step, ms] of forensicStepBuckets) {
    forensicLog(`overlap.step.${step}`, ms);
  }
  forensicStepBuckets.clear();
};

/**
 * CR1 census: classify what kind of geometry each computed boolean saw, so the
 * corpus histogram can steer the CR2 rung selection (a touching-dominant
 * corpus gains nothing from a transversal clipping engine). Profile-gated and
 * reporting-only — never a verdict input.
 */
const classifyPairOutcome = (options: {
  profile: GeoSpecOverlapCacheProfile;
  left: PreparedManifoldComponent;
  right: PreparedManifoldComponent;
  volume: number;
  volumeEpsilon: number;
}): void => {
  if (options.volume <= 1e-12) {
    options.profile.outcomeSeparated += 1;
    return;
  }
  // Both manifolds exist on the miss path; memoize each participant's own
  // volume so 8.7-pair components pay one wasm call, not one per pair.
  const leftVolume = (options.left.solidVolume ??= options.left.manifold!.volume());
  const rightVolume = (options.right.solidVolume ??= options.right.manifold!.volume());
  const smaller = Math.min(leftVolume, rightVolume);
  // Ponytail: 0.999 nesting heuristic — census histogram only, never evidence.
  if (options.volume >= smaller * 0.999) {
    options.profile.outcomeContainment += 1;
    return;
  }
  if (options.volume <= options.volumeEpsilon) {
    options.profile.outcomeTouching += 1;
    return;
  }
  options.profile.outcomeTransversal += 1;
};

const persistentPairKey = (leftHash: string, rightHash: string): { pair: [string, string] } => ({
  pair: leftHash < rightHash ? [leftHash, rightHash] : [rightHash, leftHash],
});

// R6: sorted-hash map key inside the per-sweep bundle blob.
const bundlePairKey = (leftHash: string, rightHash: string): string =>
  leftHash < rightHash ? `${leftHash}|${rightHash}` : `${rightHash}|${leftHash}`;

// R14-lite: the pre-filter is a pure verdict-preserving proof, so it ships ON;
// `GEOSPEC_INTERFERENCE_PREFILTER=0` forces every miss through the boolean
// (the differential gate uses it to compare the two paths).
const interferencePrefilterEnabled = (): boolean =>
  typeof process === 'undefined' ||
  typeof process.env !== 'object' ||
  process.env['GEOSPEC_INTERFERENCE_PREFILTER'] !== '0';

/** CR2: which engine computes pair volumes on a cache miss. */
type OverlapEngine = 'manifold' | 'arrangement';

// CR2: the arrangement engine resolves containment-class pair volumes in pure
// TS; Manifold stays the default until the differential gate promotes it.
const overlapEngine = (): OverlapEngine =>
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  process.env['GEOSPEC_OVERLAP_ENGINE'] === 'arrangement'
    ? 'arrangement'
    : 'manifold';

// CR2/F-g: engine-scoped store versions — arrangement payloads differ from
// Manifold's in FP low bits, and a flag flip must never replay the other
// engine's bytes, so each engine owns a family version outright.
const engineVersion = (engine: OverlapEngine): number => (engine === 'arrangement' ? 2 : 1);

const exactPairVolume = (options: {
  cache: MeshOverlapCache;
  record: MeshAnalysisRecord;
  left: PreparedManifoldComponent;
  right: PreparedManifoldComponent;
  fallback: Vec3;
  /** R6: this sweep's bundled pair volumes (one authenticated read for all). */
  bundle?: Map<string, CachedPairVolume>;
  /** R14-lite: whether the disjointness pre-filter may prove zero volumes. */
  prefilter: boolean;
  /** CR2: the engine computing this sweep's cache misses. */
  engine: OverlapEngine;
  /** CR1 census: the sweep's reportable-overlap threshold (tolerance³ floor). */
  volumeEpsilon: number;
}): CachedPairVolume | undefined => {
  const key = pairKey(options.left.component, options.right.component);
  const cached = options.cache.pairVolumes.get(key);
  if (cached) {
    if (options.cache.profile) {
      options.cache.profile.pairVolumeHits += 1;
    }
    return cached;
  }

  // R8: pair volumes are pure functions of the two world-frame participant
  // geometries — persist them keyed on sorted participant hashes so the
  // 4,077-pair interference sweep replays warm for unchanged parts. Peek the
  // persistent store BEFORE building either Manifold (lazy prepare): a warm
  // hit here skips the ~12 s of Manifold construction the sweep would otherwise
  // pay every run just to look up a cached scalar.
  const persistent = getGeoSpecEvidenceCache();
  const leftHash = options.left.contentHash;
  const rightHash = options.right.contentHash;
  const canPersist = persistent && leftHash !== undefined && rightHash !== undefined;
  if (canPersist) {
    // R6: the bundle replaces one authenticated file read per pair.
    const bundled = options.bundle?.get(bundlePairKey(leftHash, rightHash));
    if (bundled) {
      if (options.cache.profile) {
        options.cache.profile.pairVolumeHits += 1;
      }
      options.cache.pairVolumes.set(key, bundled);
      return bundled;
    }
    const peeked = bucketedStep('peek', () =>
      persistent.getOrCompute<CachedPairVolume>({
        family: 'overlap-pair-volume',
        version: engineVersion(options.engine),
        key: persistentPairKey(leftHash, rightHash),
        compute: () => undefined,
      }),
    );
    if (peeked) {
      if (options.cache.profile) {
        options.cache.profile.pairVolumeHits += 1;
      }
      options.cache.pairVolumes.set(key, peeked);
      return peeked;
    }
  }

  // R14-lite: on a miss, try to PROVE the volume is exactly 0 before paying
  // the boolean. Every exit except a proof falls through unchanged.
  if (options.prefilter) {
    // Rung 0: candidates were tolerance-inflated, so a genuine axis gap on the
    // uninflated boxes is already a separation proof — free.
    let verdict: 'disjoint' | 'unknown' = aabbsOverlap(options.left.component, options.right.component, 0)
      ? 'unknown'
      : 'disjoint';
    if (verdict === 'unknown') {
      options.left.disjointness ??= bucketedStep('prefilter.build', () =>
        buildComponentDisjointnessData(
          options.left.soup ?? gatherComponentSoup(options.record, options.left.component),
        ),
      );
      options.right.disjointness ??= bucketedStep('prefilter.build', () =>
        buildComponentDisjointnessData(
          options.right.soup ?? gatherComponentSoup(options.record, options.right.component),
        ),
      );
      verdict = bucketedStep('prefilter.prove', () =>
        provePairDisjoint({
          leftAabb: options.left.component.aabb,
          rightAabb: options.right.component.aabb,
          left: options.left.disjointness!,
          right: options.right.disjointness!,
        }),
      );
    }
    if (verdict === 'disjoint') {
      if (options.cache.profile) {
        options.cache.profile.prefilterProven += 1;
      }
      // The boolean on a truly separated pair yields an empty manifold whose
      // volume is exactly 0 with no witness — the identical stored payload.
      const proven: CachedPairVolume = { volume: 0 };
      const stored = canPersist
        ? (bucketedStep('persist', () =>
            persistent.getOrCompute({
              family: 'overlap-pair-volume',
              version: engineVersion(options.engine),
              key: persistentPairKey(leftHash, rightHash),
              compute: () => proven,
            }),
          ) ?? proven)
        : proven;
      options.cache.pairVolumes.set(key, stored);
      return stored;
    }
    if (options.cache.profile) {
      options.cache.profile.prefilterFallthrough += 1;
    }
  }

  // CR2 rung B: under the arrangement engine, containment-class pairs resolve
  // in pure TS before any Manifold exists; every other class falls back to
  // the boolean below, stored under the arrangement version — the fallback is
  // a pure function of the pair's geometry, never of cache history (F-a/F-g).
  if (options.engine === 'arrangement') {
    options.left.disjointness ??= bucketedStep('prefilter.build', () =>
      buildComponentDisjointnessData(options.left.soup ?? gatherComponentSoup(options.record, options.left.component)),
    );
    options.right.disjointness ??= bucketedStep('prefilter.build', () =>
      buildComponentDisjointnessData(
        options.right.soup ?? gatherComponentSoup(options.record, options.right.component),
      ),
    );
    const resolved = bucketedStep('arrangement', () =>
      arrangementPairVolume({
        leftAabb: options.left.component.aabb,
        rightAabb: options.right.component.aabb,
        left: options.left.disjointness!,
        right: options.right.disjointness!,
      }),
    );
    if (resolved) {
      // R13: an arrangement resolution replaces one exact boolean.
      chargeBudget(1);
      if (options.cache.profile) {
        options.cache.profile.arrangementResolved += 1;
      }
      const stored = canPersist
        ? (bucketedStep('persist', () =>
            persistent.getOrCompute({
              family: 'overlap-pair-volume',
              version: engineVersion(options.engine),
              key: persistentPairKey(leftHash, rightHash),
              compute: () => resolved,
            }),
          ) ?? resolved)
        : resolved;
      options.cache.pairVolumes.set(key, stored);
      return stored;
    }
    if (options.cache.profile) {
      options.cache.profile.arrangementFallback += 1;
    }
  }

  // Cache miss: now the exact intersection is unavoidable, so build both
  // participants' Manifolds (idempotent) and compute.
  ensureComponentManifold({ cache: options.cache, record: options.record, prepared: options.left });
  ensureComponentManifold({ cache: options.cache, record: options.record, prepared: options.right });
  if (!options.left.manifold || !options.right.manifold) {
    return undefined;
  }
  if (options.cache.profile) {
    options.cache.profile.pairVolumeMisses += 1;
  }

  const computeExact = (): CachedPairVolume => {
    // R13: one work unit per exact pair volume.
    chargeBudget(1);
    const intersection = bucketedStep('intersection', () =>
      options.cache.wasm.Manifold.intersection(options.left.manifold!, options.right.manifold!),
    );
    try {
      const volume = bucketedStep('volume', () => intersection.volume());
      return {
        volume,
        ...(volume > 1e-12
          ? { witnessPoint: bucketedStep('witness', () => volumeWitness(intersection, options.fallback)) }
          : {}),
      };
    } finally {
      bucketedStep('delete', () => {
        intersection.delete();
      });
    }
  };

  // The 'persist' bucket wraps the whole store round-trip; the boolean steps
  // inside are bucketed separately, so persist − (intersection + volume +
  // witness + delete) is the store's own key-hash/serialize overhead.
  const result = canPersist
    ? (bucketedStep('persist', () =>
        persistent.getOrCompute({
          family: 'overlap-pair-volume',
          version: engineVersion(options.engine),
          key: persistentPairKey(leftHash, rightHash),
          compute: computeExact,
        }),
      ) ?? computeExact())
    : computeExact();
  if (options.cache.profile) {
    classifyPairOutcome({
      profile: options.cache.profile,
      left: options.left,
      right: options.right,
      volume: result.volume,
      volumeEpsilon: options.volumeEpsilon,
    });
  }
  options.cache.pairVolumes.set(key, result);
  return result;
};

/**
 * Sweep every AABB-surviving pair for positive-volume interference, building
 * participant Manifolds lazily (only when a pair's volume misses the cache).
 *
 * @param options - Cache, mesh record, pairs, prepared records, and the volume
 *   threshold below which an intersection is not a reportable overlap.
 * @returns The overlaps found and whether any participant failed Manifold
 *   construction (so the caller can fail closed with an invalid diagnostic).
 */
const computePairOverlaps = (options: {
  cache: MeshOverlapCache;
  record: MeshAnalysisRecord;
  pairs: readonly AabbPair[];
  preparedById: Map<number, PreparedManifoldComponent>;
  volumeEpsilon: number;
  bundle?: Map<string, CachedPairVolume>;
  prefilter: boolean;
  engine: OverlapEngine;
}): { overlaps: MeshComponentOverlap[]; sawInvalidComponent: boolean } => {
  const overlaps: MeshComponentOverlap[] = [];
  let sawInvalidComponent = false;
  // CR1: a budget throw can abort a sweep mid-flight; drop that residue so
  // this sweep's aggregate step lines attribute only its own work.
  forensicStepBuckets.clear();
  for (const pair of options.pairs) {
    // R13: one work unit per exact pair volume (cache hits recharge nothing —
    // see exactPairVolume). Manifolds are built lazily inside on a cache miss.
    const volume = exactPairVolume({
      cache: options.cache,
      record: options.record,
      left: options.preparedById.get(pair.left.id)!,
      right: options.preparedById.get(pair.right.id)!,
      fallback: intersectionAabbCenter(pair.left, pair.right),
      ...(options.bundle ? { bundle: options.bundle } : {}),
      prefilter: options.prefilter,
      engine: options.engine,
      volumeEpsilon: options.volumeEpsilon,
    });
    if (volume === undefined) {
      // A participant failed Manifold construction; fail closed above with the
      // same invalid-component diagnostic the eager path produced.
      sawInvalidComponent = true;
      continue;
    }
    if (volume.volume > options.volumeEpsilon) {
      overlaps.push({
        leftComponentId: pair.left.id,
        rightComponentId: pair.right.id,
        leftLabel: pair.left.label,
        rightLabel: pair.right.label,
        leftColor: pair.left.color,
        rightColor: pair.right.color,
        intersectionVolume: volume.volume,
        ...(volume.witnessPoint ? { witnessPoint: volume.witnessPoint } : {}),
        penetration: 'positive-volume',
      });
    }
  }
  flushForensicStepBuckets();
  return { overlaps, sawInvalidComponent };
};

/**
 * After a lazy sweep saw an unbuildable participant, materialize every
 * component's Manifold — so a component the sweep simply never needed is not
 * mistaken for a non-manifold one — and return the eager path's identical
 * invalid-component diagnostic set (fail closed, no overlaps).
 *
 * @param options - Cache, mesh record, prepared component records, and subject.
 * @returns The invalid-component diagnostics (empty when all build cleanly).
 */
const invalidComponentDiagnosticsAfterSweep = (options: {
  cache: MeshOverlapCache;
  record: MeshAnalysisRecord;
  prepared: readonly PreparedManifoldComponent[];
  subject: GeometrySubject;
}): GeometryDiagnostic[] => {
  for (const component of options.prepared) {
    ensureComponentManifold({ cache: options.cache, record: options.record, prepared: component });
  }
  return invalidDiagnosticsForComponents({
    cache: options.cache,
    components: options.prepared,
    subject: options.subject,
  });
};

/**
 * Analyze whether separate mesh components physically occupy the same solid
 * volume.
 *
 * The production path is canonical: component records, AABB candidate pruning,
 * and Manifold WASM exact intersection volume. Invalid/non-manifold evidence
 * is reported as diagnostics rather than routed through a fallback backend.
 *
 * @param options - Subject and optional tolerance.
 * @returns Typed overlap evidence or diagnostics.
 * @public
 */
export const analyzeMeshOverlap = async (options: AnalyzeMeshOverlapOptions): Promise<AnalyzeMeshOverlapResult> => {
  const tolerance = options.tolerance ?? defaultOverlapTolerance;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return { success: false, diagnostics: [invalidToleranceDiagnostic(tolerance)] };
  }

  const record = getMeshAnalysisRecord(options.subject.mesh.stats);
  const partition = record.getComponentPartition();
  if (!partition) {
    return { success: false, diagnostics: [partitionInconclusiveDiagnostic(options.subject)] };
  }

  const pairSelection = selectComponentPairs(partition.components, options.pairs);
  if (!pairSelection.success) {
    return { success: false, diagnostics: pairSelection.diagnostics };
  }
  const pairs = options.pairs
    ? aabbFilteredPairs(pairSelection.pairs, tolerance)
    : aabbCandidatePairs(partition.components, tolerance);
  if (pairs.length === 0) {
    return {
      success: true,
      evidence: {
        componentSource: partition.source,
        componentCount: partition.components.length,
        ...(pairSelection.selectedPairs ? { selectedPairs: pairSelection.selectedPairs } : {}),
        checkedPairs: 0,
        tolerance,
        overlaps: [],
      },
      diagnostics: [],
    };
  }

  let wasm: ManifoldToplevel;
  try {
    wasm = await loadManifold();
  } catch (error) {
    return { success: false, diagnostics: [manifoldUnavailableDiagnostic(error)] };
  }

  const scope = getGeoSpecResourceScope(options.subject);
  const { cache, created } = getOrCreateMeshOverlapCache({
    subject: options.subject,
    wasm,
    profile: scope?.profile?.overlap,
  });
  if (created && scope) {
    scope.register(() => {
      cache.dispose();
    });
  }

  const componentsById = new Map<number, MeshComponentRecord>();
  for (const pair of pairs) {
    componentsById.set(pair.left.id, pair.left);
    componentsById.set(pair.right.id, pair.right);
  }
  // R2: the interference sweep was counter-only (Finding 6) — span the prepare
  // and pair phases with their sizes so per-pair cost is attributable.
  forensicCount('overlap.components', componentsById.size);
  forensicCount('overlap.pairs', pairs.length);
  // #1 lazy prepare: the cheap half only — one world-frame content hash per
  // component. The Manifold itself (the ~12 s of construction) is built on
  // demand inside exactPairVolume, so a warm run whose pairs all replay from
  // the persistent cache builds no Manifolds at all.
  const prepared = forensicSync('overlap.prepare', () =>
    [...componentsById.values()].map((component) => prepareComponentRecord({ cache, record, component })),
  );
  const preparedById = new Map(prepared.map((component) => [component.component.id, component]));
  // R6: this sweep's pair volumes are readable as ONE authenticated blob —
  // thousands of per-pair reads collapse to a single get. A bundle miss (or a
  // pair missing from a bundle) falls back to the per-pair entries, whose
  // participant-hash keys survive partial subject changes.
  const persistent = getGeoSpecEvidenceCache();
  const subjectHash = options.subject.provenance.contentHash;
  const engine = overlapEngine();
  const bundleKey =
    persistent && subjectHash !== undefined ? { subjectHash, tolerance, pairs: options.pairs ?? null } : undefined;
  const storedBundle =
    persistent && bundleKey
      ? persistent.getOrCompute<Record<string, CachedPairVolume>>({
          family: 'overlap-pair-bundle',
          version: engineVersion(engine),
          key: bundleKey,
          compute: () => undefined,
        })
      : undefined;
  const bundle = storedBundle ? new Map(Object.entries(storedBundle)) : undefined;
  try {
    const volumeEpsilon = Math.max(tolerance * tolerance * tolerance, 1e-12);
    const { overlaps, sawInvalidComponent } = forensicSync('overlap.pairVolumes', () =>
      computePairOverlaps({
        cache,
        record,
        pairs,
        preparedById,
        volumeEpsilon,
        ...(bundle ? { bundle } : {}),
        prefilter: interferencePrefilterEnabled(),
        engine,
      }),
    );

    if (sawInvalidComponent) {
      const invalidDiagnostics = invalidComponentDiagnosticsAfterSweep({
        cache,
        record,
        prepared,
        subject: options.subject,
      });
      if (invalidDiagnostics.length > 0) {
        return { success: false, diagnostics: invalidDiagnostics };
      }
    }

    // R6: after a clean sweep, publish the complete bundle (first writer wins;
    // hits never rewrite). Incomplete sweeps — any unresolved participant —
    // never bundle, so a bundle always answers every pair of its claim shape.
    if (persistent && bundleKey && !storedBundle && pairs.length > 0) {
      const entries: Record<string, CachedPairVolume> = {};
      let complete = true;
      for (const pair of pairs) {
        const left = preparedById.get(pair.left.id);
        const right = preparedById.get(pair.right.id);
        const volume = cache.pairVolumes.get(pairKey(pair.left, pair.right));
        if (!left?.contentHash || !right?.contentHash || !volume) {
          complete = false;
          break;
        }
        entries[bundlePairKey(left.contentHash, right.contentHash)] = volume;
      }
      if (complete) {
        persistent.getOrCompute({
          family: 'overlap-pair-bundle',
          version: engineVersion(engine),
          key: bundleKey,
          compute: () => entries,
        });
      }
    }

    return {
      success: true,
      evidence: {
        componentSource: partition.source,
        componentCount: partition.components.length,
        ...(pairSelection.selectedPairs ? { selectedPairs: pairSelection.selectedPairs } : {}),
        checkedPairs: pairs.length,
        tolerance,
        overlaps,
      },
      diagnostics: [],
    };
  } finally {
    // R18/13b + R14-lite: soups and disjointness structures were retained
    // only for this sweep; release them with it.
    for (const component of prepared) {
      delete component.soup;
      delete component.disjointness;
    }
    if (created && !scope) {
      cache.dispose();
    }
  }
};
