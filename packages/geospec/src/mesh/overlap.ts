import initManifold from 'manifold-3d';
import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import { getMeshAnalysisRecord } from '#mesh/analysis-record.js';
import type { MeshAnalysisRecord, MeshComponentRecord } from '#mesh/analysis-record.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3, WatertightPrimitiveBreakdown } from '#mesh/types.js';
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
  merged: boolean;
  manifold?: ManifoldSolid;
  status?: unknown;
  error?: {
    message: string;
    code?: string;
  };
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
let manifoldModulePromise: Promise<ManifoldToplevel> | undefined;
const meshOverlapCacheSymbol = Symbol.for('tau.geospec.meshOverlapCache');

type MeshOverlapCachedSubject = GeometrySubject & {
  [meshOverlapCacheSymbol]?: MeshOverlapCache;
};

const loadManifold = async (): Promise<ManifoldToplevel> => {
  manifoldModulePromise ??= (async () => {
    const wasm = await initManifold();
    wasm.setup();
    return wasm;
  })();
  return manifoldModulePromise;
};

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
  const sorted = [...components].sort((left, right) => left.aabb.min[0] - right.aabb.min[0]);
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex++) {
    const left = sorted[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex++) {
      const right = sorted[rightIndex]!;
      if (right.aabb.min[0] > left.aabb.max[0] + tolerance) {
        break;
      }
      if (aabbsOverlap(left, right, tolerance)) {
        pairs.push({ left, right });
      }
    }
  }
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

const componentTrianglesToManifold = (options: {
  wasm: ManifoldToplevel;
  record: MeshAnalysisRecord;
  component: MeshComponentRecord;
}): PreparedManifoldComponent => {
  const vertProperties = new Float32Array(options.component.triangleCount * 9);
  let offset = 0;
  for (const triangleIndex of options.component.triangleIndices) {
    const triangleOffset = triangleIndex * 3;
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = options.record.triangleIndices[triangleOffset + corner]!;
      const positionOffset = vertexIndex * 3;
      vertProperties[offset++] = options.record.positions[positionOffset]!;
      vertProperties[offset++] = options.record.positions[positionOffset + 1]!;
      vertProperties[offset++] = options.record.positions[positionOffset + 2]!;
    }
  }
  const triVerts = new Uint32Array(vertProperties.length / 3);
  for (let index = 0; index < triVerts.length; index++) {
    triVerts[index] = index;
  }
  const mesh = new options.wasm.Mesh({ numProp: 3, vertProperties, triVerts });
  const merged = mesh.merge();
  try {
    const manifold = new options.wasm.Manifold(mesh);
    return {
      component: options.component,
      merged,
      manifold,
      status: manifold.status(),
    };
  } catch (error) {
    return {
      component: options.component,
      merged,
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
      },
    };
  }
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

const prepareManifoldComponent = (options: {
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
  if (options.cache.profile) {
    options.cache.profile.preparedComponentMisses += 1;
  }
  const prepared = componentTrianglesToManifold({
    wasm: options.cache.wasm,
    record: options.record,
    component: options.component,
  });
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

const exactPairVolume = (options: {
  cache: MeshOverlapCache;
  left: PreparedManifoldComponent;
  right: PreparedManifoldComponent;
  fallback: Vec3;
}): CachedPairVolume | undefined => {
  const key = pairKey(options.left.component, options.right.component);
  const cached = options.cache.pairVolumes.get(key);
  if (cached) {
    if (options.cache.profile) {
      options.cache.profile.pairVolumeHits += 1;
    }
    return cached;
  }
  if (options.cache.profile) {
    options.cache.profile.pairVolumeMisses += 1;
  }
  if (!options.left.manifold || !options.right.manifold) {
    return undefined;
  }

  const intersection = options.cache.wasm.Manifold.intersection(options.left.manifold, options.right.manifold);
  try {
    const volume = intersection.volume();
    const result: CachedPairVolume = {
      volume,
      ...(volume > 1e-12 ? { witnessPoint: volumeWitness(intersection, options.fallback) } : {}),
    };
    options.cache.pairVolumes.set(key, result);
    return result;
  } finally {
    intersection.delete();
  }
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
  const prepared = [...componentsById.values()].map((component) =>
    prepareManifoldComponent({ cache, record, component }),
  );
  try {
    const invalidDiagnostics = invalidDiagnosticsForComponents({
      cache,
      components: prepared,
      subject: options.subject,
    });
    if (invalidDiagnostics.length > 0) {
      return { success: false, diagnostics: invalidDiagnostics };
    }

    const preparedById = new Map(prepared.map((component) => [component.component.id, component]));
    const volumeEpsilon = Math.max(tolerance * tolerance * tolerance, 1e-12);
    const overlaps: MeshComponentOverlap[] = [];
    for (const pair of pairs) {
      const left = preparedById.get(pair.left.id)?.manifold;
      const right = preparedById.get(pair.right.id)?.manifold;
      if (!left || !right) {
        continue;
      }
      const volume = exactPairVolume({
        cache,
        left: preparedById.get(pair.left.id)!,
        right: preparedById.get(pair.right.id)!,
        fallback: intersectionAabbCenter(pair.left, pair.right),
      });
      if (volume && volume.volume > volumeEpsilon) {
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
    if (created && !scope) {
      cache.dispose();
    }
  }
};
