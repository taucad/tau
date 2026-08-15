/**
 * Component interference: the exact pair-volume sweep.
 *
 * The ladder for one component pair, in order, each rung only ever *skipping*
 * work the rung below would have done:
 *
 * 1. **R6 bundle** — one blob per (subject content, tolerance) holding
 *    every pair volume of a full sweep. A repeat sweep answers every pair from
 *    one read; partial sweeps (a `pairs` selector) never bundle, because a
 *    partial answer must never be replayed as a complete one. First writer wins.
 * 2. **Per-pair persistent volume**, keyed on the two participants' content
 *    digests — so identical world-frame geometry in a brand-new subject replays
 *    without building a single Manifold (#1 lazy prepare).
 * 3. **Certified disjointness pre-filter** — a proof of zero, never a verdict
 *    of anything else.
 * 4. **Exact boolean** — Manifold intersection, the only rung allowed to decide
 *    an arbitrary pair.
 *
 * Prepared solids and computed volumes live in a per-subject cache owned by the
 * run's resource scope, so a matcher file that asks twice pays once.
 *
 * @module
 */

import { getGeoSpecEvidenceStore, readEvidenceJson, writeEvidenceJson } from '#cache/evidence-cache.js';
import { sweepAxisByCentreVariance } from '#mesh/_internal/sweep-axis.js';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import { preparePrefilterComponent, provePairDisjoint } from '#mesh/overlap-prefilter.js';
import type { PrefilterComponent } from '#mesh/overlap-prefilter.js';
import { buildSoupTriangles } from '#mesh/soup.js';
import type { GeometryDiagnostic, GeometrySubject, MeshTriangle, Vec3, WatertightResult } from '#mesh/types.js';
import { createForensicBuckets } from '#runner/forensic.js';
import type { ForensicBuckets, ForensicSink } from '#runner/forensic.js';
import { createGeoSpecOverlapCacheProfile } from '#runner/profile.js';
import type { GeoSpecOverlapCacheProfile } from '#runner/profile.js';
import { getGeoSpecResourceScopeFor } from '#runner/resource-scope.js';
import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import type {
  AnalyzeMeshOverlapOptions as SubstrateAnalyzeMeshOverlapOptions,
  AnalyzeMeshOverlapResult as SubstrateAnalyzeMeshOverlapResult,
  MeshComponentOverlap,
} from 'geospec/mesh';

/** Re-published substrate contract: overlap analysis options. @public */
export type AnalyzeMeshOverlapOptions = Omit<SubstrateAnalyzeMeshOverlapOptions, 'subject'> & {
  subject: GeometrySubject;
};
/** Re-published substrate contract: overlap analysis result. @public */
export type AnalyzeMeshOverlapResult = SubstrateAnalyzeMeshOverlapResult;
/**
 * One selector-restricted pair, derived from the substrate's options so the two
 * shapes cannot drift (`geospec/mesh` does not publish the element types).
 */
type MeshOverlapPairSelector = NonNullable<AnalyzeMeshOverlapOptions['pairs']>[number];
type MeshOverlapSelectedPair = NonNullable<
  Extract<AnalyzeMeshOverlapResult, { success: true }>['evidence']['selectedPairs']
>[number];

/** Default linear tolerance when a claim does not pin one. */
const defaultTolerance = 0.001;

type Aabb = { min: [number, number, number]; max: [number, number, number] };

type ComponentRecord = {
  id: number;
  label: string;
  color?: string;
  triangles: MeshTriangle[];
  positions?: Float64Array<ArrayBuffer>;
  aabb: Aabb;
  centre: [number, number, number];
};

type PairVolume = { volume: number; witnessPoint?: Vec3 };

type BundlePayload = {
  pairs: Array<{ left: number; right: number; volume: number; witnessPoint?: Vec3 }>;
};

type OverlapCache = {
  prepared: Map<number, ManifoldSolid>;
  pairVolumes: Map<string, PairVolume>;
  participantVolumes: Map<number, number>;
  prefilter: Map<number, PrefilterComponent>;
  digests: Map<number, string>;
  invalidDiagnostics: Map<string, GeometryDiagnostic[]>;
  profile: GeoSpecOverlapCacheProfile;
  disposed: boolean;
};

/**
 * Per-subject overlap cache occupancy.
 *
 * @public
 */
export type MeshOverlapCacheStats = {
  preparedComponents: number;
  pairVolumes: number;
  invalidDiagnosticSets: number;
  disposed: boolean;
};

const caches = new WeakMap<GeometrySubject, OverlapCache>();

/**
 * Inspect a subject's overlap cache.
 *
 * @param subject - The subject.
 * @returns Cache occupancy, or `undefined` when the subject holds no cache.
 * @public
 */
export const getMeshOverlapCacheStats = (subject: GeometrySubject): MeshOverlapCacheStats | undefined => {
  const cache = caches.get(subject);
  if (!cache) {
    return undefined;
  }
  return {
    preparedComponents: cache.prepared.size,
    pairVolumes: cache.pairVolumes.size,
    invalidDiagnosticSets: cache.invalidDiagnostics.size,
    disposed: cache.disposed,
  };
};

// Called exactly once per cache — by the owning scope's disposer, or by the
// standalone call that created it. Clearing the prepared map is what makes it
// idempotent in effect: double-deleting an Emscripten handle aborts the whole
// wasm instance (D-10), and there is nothing left to delete on a second pass.
const disposeCache = (subject: GeometrySubject, cache: OverlapCache): void => {
  cache.disposed = true;
  for (const manifold of cache.prepared.values()) {
    manifold.delete();
  }
  cache.prepared.clear();
  caches.delete(subject);
  cache.profile.cacheDisposals += 1;
};

const acquireCache = (subject: GeometrySubject): { cache: OverlapCache; release: () => void } => {
  const existing = caches.get(subject);
  if (existing) {
    return { cache: existing, release: () => undefined };
  }
  const scope = getGeoSpecResourceScopeFor(subject);
  const cache: OverlapCache = {
    prepared: new Map(),
    pairVolumes: new Map(),
    participantVolumes: new Map(),
    prefilter: new Map(),
    digests: new Map(),
    invalidDiagnostics: new Map(),
    profile: scope?.profile?.overlap ?? createGeoSpecOverlapCacheProfile(),
    disposed: false,
  };
  caches.set(subject, cache);
  cache.profile.cacheCreations += 1;
  if (scope) {
    scope.register(() => {
      disposeCache(subject, cache);
    });
    return { cache, release: () => undefined };
  }
  // No scope owns the subject: the cache lives exactly as long as this call.
  return {
    cache,
    release: () => {
      disposeCache(subject, cache);
    },
  };
};

const emptyAabb = (): Aabb => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });

const expand = (aabb: Aabb, point: readonly [number, number, number]): void => {
  for (const axis of [0, 1, 2] as const) {
    aabb.min[axis] = Math.min(aabb.min[axis], point[axis]);
    aabb.max[axis] = Math.max(aabb.max[axis], point[axis]);
  }
};

const componentPositions = (triangles: readonly MeshTriangle[]): Float64Array<ArrayBuffer> => {
  const positions = new Float64Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point[0];
      positions[offset++] = point[1];
      positions[offset++] = point[2];
    }
  }
  return positions;
};

const positionsFor = (component: ComponentRecord): Float64Array<ArrayBuffer> => {
  component.positions ??= componentPositions(component.triangles);
  return component.positions;
};

const makeRecord = (record: {
  id: number;
  label: string;
  triangles: MeshTriangle[];
  color: string | undefined;
}): ComponentRecord => {
  const { id, label, triangles, color } = record;
  const aabb = emptyAabb();
  for (const triangle of triangles) {
    expand(aabb, triangle.a);
    expand(aabb, triangle.b);
    expand(aabb, triangle.c);
  }
  return {
    id,
    label,
    ...(color === undefined ? {} : { color }),
    triangles,
    aabb,
    centre: [(aabb.min[0] + aabb.max[0]) / 2, (aabb.min[1] + aabb.max[1]) / 2, (aabb.min[2] + aabb.max[2]) / 2],
  };
};

const primitiveColors = (subject: GeometrySubject): Map<string, string> => {
  const colors = new Map<string, string>();
  for (const primitive of subject.mesh.stats.boundingBox?.primitives ?? []) {
    if (primitive.color) {
      colors.set(primitive.name, primitive.color);
    }
  }
  return colors;
};

const namedPartition = (
  triangles: readonly MeshTriangle[],
  colors: ReadonlyMap<string, string>,
): ComponentRecord[] | undefined => {
  const groups = new Map<string, MeshTriangle[]>();
  for (const triangle of triangles) {
    const label = triangle.primitive.trim();
    if (!label) {
      return undefined;
    }
    const group = groups.get(label);
    if (group) {
      group.push(triangle);
    } else {
      groups.set(label, [triangle]);
    }
  }
  if (groups.size < 2) {
    return undefined;
  }
  return [...groups.entries()].map(([label, group], id) =>
    makeRecord({ id, label, triangles: group, color: colors.get(label) }),
  );
};

const hasComponentOverlapCapability = (subject: GeometrySubject): boolean =>
  subject.capabilities.some((capability) => capability.kind === 'mesh' && capability.feature === 'component-overlap');

const occurrenceLabel = (
  occurrence: { path?: string; instanceName?: string; productName?: string },
  index: number,
): string => {
  for (const label of [occurrence.path, occurrence.instanceName, occurrence.productName]) {
    const trimmed = label?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return `step-occurrence-${index}`;
};

const stepOccurrencePartition = (subject: GeometrySubject): ComponentRecord[] | undefined => {
  if (!hasComponentOverlapCapability(subject) || !subject.occurrenceMesh) {
    return undefined;
  }
  const occurrences = subject.step?.xde?.occurrences ?? [];
  if (occurrences.length < 2) {
    return undefined;
  }
  const components: ComponentRecord[] = [];
  for (const [index, occurrence] of occurrences.entries()) {
    const mesh = subject.occurrenceMesh(index);
    if (!mesh || mesh.triangleCount === 0) {
      continue;
    }
    const label = occurrenceLabel(occurrence, index);
    const triangles = buildSoupTriangles(mesh.positions, mesh.triangleCount, label);
    components.push(makeRecord({ id: components.length, label, triangles, color: undefined }));
  }
  return components.length < 2 ? undefined : components;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const sourceDiagnosticsFor = (subject: GeometrySubject, label: string): GeometryDiagnostic[] =>
  subject.diagnostics.filter((diagnostic) => {
    const { details } = diagnostic;
    if (!isRecord(details) || !isRecord(details['facet'])) {
      return false;
    }
    return details['facet']['partName'] === label;
  });

const invalidComponentDiagnostics = (
  subject: GeometrySubject,
  components: readonly ComponentRecord[],
  watertight: WatertightResult,
): GeometryDiagnostic[] => {
  const global = {
    watertight: watertight.watertight,
    irregularEdges: watertight.irregularEdges,
    openBoundaryEdges: watertight.openBoundaryEdges,
    nonManifoldEdges: watertight.nonManifoldEdges,
    totalEdges: watertight.totalEdges,
    irregularEdgeFraction: watertight.irregularEdgeFraction,
  };
  const diagnostics: GeometryDiagnostic[] = [];
  for (const component of components) {
    const primitive = watertight.perPrimitive.find((entry) => entry.name === component.label);
    if (!primitive || primitive.boundaryEdges === 0) {
      continue;
    }
    diagnostics.push({
      code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID',
      severity: 'error',
      message: `Component '${component.label}' is not a closed oriented solid, so no exact intersection volume exists.`,
      suggestion:
        'Repair the source geometry so every component is a closed oriented solid; GeoSpec never substitutes an approximate backend for an exact interference verdict.',
      spatial: {
        min: component.aabb.min,
        max: component.aabb.max,
        center: component.centre,
      },
      details: {
        label: component.label,
        triangleCount: component.triangles.length,
        watertight: { global, primitive },
        sourceDiagnostics: sourceDiagnosticsFor(subject, component.label),
      },
    });
  }
  return diagnostics;
};

const overlapsWithin = (left: Aabb, right: Aabb, tolerance: number): boolean => {
  for (const axis of [0, 1, 2] as const) {
    if (left.min[axis] > right.max[axis] + tolerance || right.min[axis] > left.max[axis] + tolerance) {
      return false;
    }
  }
  return true;
};

const matchesSelector = (label: string, selector: string | RegExp): boolean =>
  typeof selector === 'string' ? label === selector : selector.test(label);

const selectedPairSet = (
  components: readonly ComponentRecord[],
  selectors: readonly MeshOverlapPairSelector[],
): { allowed: Set<string>; selected: MeshOverlapSelectedPair[] } => {
  const allowed = new Set<string>();
  const selected: MeshOverlapSelectedPair[] = [];
  for (let left = 0; left < components.length; left++) {
    for (let right = left + 1; right < components.length; right++) {
      const a = components[left]!;
      const b = components[right]!;
      const matched = selectors.some(
        (selector) =>
          (matchesSelector(a.label, selector.left) && matchesSelector(b.label, selector.right)) ||
          (matchesSelector(b.label, selector.left) && matchesSelector(a.label, selector.right)),
      );
      if (matched) {
        allowed.add(`${a.id}:${b.id}`);
        selected.push({ leftLabel: a.label, rightLabel: b.label });
      }
    }
  }
  return { allowed, selected };
};

/**
 * Sweep-and-prune candidate pairs, in canonical component-id order.
 *
 * @param components - Component records.
 * @param tolerance - Linear tolerance inflating the boxes.
 * @param allowed - Optional selector-restricted pair keys.
 * @returns Candidate pairs, `left.id < right.id`, ordered by id.
 */
const candidatePairs = (
  components: readonly ComponentRecord[],
  tolerance: number,
  allowed: Set<string> | undefined,
): Array<[ComponentRecord, ComponentRecord]> => {
  const axis = sweepAxisByCentreVariance(components.map((component) => component.centre));
  const bySweep = [...components].sort(
    (left, right) => left.aabb.min[axis] - right.aabb.min[axis] || left.id - right.id,
  );
  const pairs: Array<[ComponentRecord, ComponentRecord]> = [];
  for (let index = 0; index < bySweep.length; index++) {
    const current = bySweep[index]!;
    for (let next = index + 1; next < bySweep.length; next++) {
      const candidate = bySweep[next]!;
      if (candidate.aabb.min[axis] > current.aabb.max[axis] + tolerance) {
        break;
      }
      if (!overlapsWithin(current.aabb, candidate.aabb, tolerance)) {
        continue;
      }
      const [left, right] = current.id < candidate.id ? [current, candidate] : [candidate, current];
      if (allowed && !allowed.has(`${left.id}:${right.id}`)) {
        continue;
      }
      pairs.push([left, right]);
    }
  }
  pairs.sort((left, right) => left[0].id - right[0].id || left[1].id - right[1].id);
  return pairs;
};

const componentDigest = (cache: OverlapCache, component: ComponentRecord): string | undefined => {
  const store = getGeoSpecEvidenceStore();
  if (!store) {
    return undefined;
  }
  const cached = cache.digests.get(component.id);
  if (cached !== undefined) {
    return cached;
  }
  const digest = store.hashBytes(
    new Uint8Array(
      positionsFor(component).buffer,
      positionsFor(component).byteOffset,
      positionsFor(component).byteLength,
    ),
  );
  cache.digests.set(component.id, digest);
  return digest;
};

const prefilterFor = (
  cache: OverlapCache,
  component: ComponentRecord,
  buckets: ForensicBuckets,
): PrefilterComponent => {
  const existing = cache.prefilter.get(component.id);
  if (existing) {
    return existing;
  }
  const prepared = buckets.time('overlap.step.prefilter.build', () =>
    preparePrefilterComponent(positionsFor(component), component.triangles.length),
  );
  cache.prefilter.set(component.id, prepared);
  return prepared;
};

const prepareManifold = (context: {
  wasm: ManifoldToplevel;
  cache: OverlapCache;
  component: ComponentRecord;
  buckets: ForensicBuckets;
}): ManifoldSolid | undefined => {
  const { wasm, cache, component, buckets } = context;
  const existing = cache.prepared.get(component.id);
  if (existing) {
    cache.profile.preparedComponentHits += 1;
    return existing;
  }
  cache.profile.preparedComponentMisses += 1;
  return buckets.time('overlap.step.build', () => {
    const vertProperties = Float32Array.from(positionsFor(component));
    const triVerts = Uint32Array.from({ length: vertProperties.length / 3 }, (_unused, index) => index);
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties, triVerts });
    mesh.merge();
    try {
      const manifold = new wasm.Manifold(mesh);
      cache.prepared.set(component.id, manifold);
      return manifold;
    } catch {
      // Manifold rejected the soup: the pair has no exact volume, and GeoSpec
      // never substitutes an approximate backend for an exact verdict.
      return undefined;
    }
  });
};

const solidVolume = (context: {
  cache: OverlapCache;
  component: ComponentRecord;
  manifold: ManifoldSolid;
  buckets: ForensicBuckets;
}): number => {
  const { cache, component, manifold, buckets } = context;
  const existing = cache.participantVolumes.get(component.id);
  if (existing !== undefined) {
    return existing;
  }
  const volume = buckets.time('overlap.step.volume', () => manifold.volume());
  cache.participantVolumes.set(component.id, volume);
  return volume;
};

const recordCensus = (census: {
  profile: GeoSpecOverlapCacheProfile;
  volume: number;
  volumeEpsilon: number;
  participants: [number, number];
}): void => {
  const { profile, volume, volumeEpsilon, participants } = census;
  if (volume === 0) {
    profile.outcomeSeparated += 1;
    return;
  }
  if (volume <= volumeEpsilon) {
    profile.outcomeTouching += 1;
    return;
  }
  const smallest = Math.min(participants[0], participants[1]);
  if (Math.abs(volume - smallest) <= volumeEpsilon) {
    profile.outcomeContainment += 1;
    return;
  }
  profile.outcomeTransversal += 1;
};

const inconclusive = (subject: GeometrySubject, primitiveCount: number): AnalyzeMeshOverlapResult => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE',
      severity: 'error',
      message: 'GeoSpec could not partition this subject into two or more components.',
      suggestion:
        'Name the parts in the source model (one glTF node per part) so component interference has identifiable components.',
      details: {
        primitiveCount,
        source: subject.provenance.source,
        parameters: subject.provenance.parameters,
      },
    },
  ],
});

/**
 * Find positive-volume intersections between a subject's components.
 *
 * @param options - Subject, tolerance, and optional pair selectors.
 * @returns Typed overlap evidence, or a structured failure.
 * @public
 */
export const analyzeMeshOverlap = async (
  options: AnalyzeMeshOverlapOptions,
  forensic?: ForensicSink,
): Promise<AnalyzeMeshOverlapResult> => {
  const { subject } = options;
  if (!hasComponentOverlapCapability(subject)) {
    return inconclusive(subject, 0);
  }
  const tolerance = options.tolerance ?? defaultTolerance;
  const { triangles } = subject.mesh.stats.meshQuality;
  const primitiveCount = new Set(triangles.map((triangle) => triangle.primitive)).size;
  const colors = primitiveColors(subject);
  const components = namedPartition(triangles, colors) ?? stepOccurrencePartition(subject);
  if (!components) {
    return inconclusive(subject, primitiveCount);
  }

  const { cache, release } = acquireCache(subject);
  const buckets = createForensicBuckets(forensic);
  try {
    // A component Manifold cannot accept is not a pair the boolean can decide:
    // report it, never substitute an approximate backend. Only a subject that
    // actually fails the watertight analysis touches the diagnostic cache, so a
    // clean assembly pays nothing.
    const watertight = subject.mesh.stats.analyseWatertight();
    if (!watertight.watertight) {
      const cached = cache.invalidDiagnostics.get('components');
      if (cached) {
        cache.profile.invalidDiagnosticHits += 1;
      } else {
        cache.profile.invalidDiagnosticMisses += 1;
      }
      const diagnostics = cached ?? invalidComponentDiagnostics(subject, components, watertight);
      cache.invalidDiagnostics.set('components', diagnostics);
      if (diagnostics.length > 0) {
        return { success: false, diagnostics };
      }
    }

    const selection = options.pairs ? selectedPairSet(components, options.pairs) : undefined;
    const pairs = candidatePairs(components, tolerance, selection?.allowed);
    const volumeEpsilon = Math.max(tolerance ** 3, 1e-12);

    // R6: a complete sweep over known content can answer from one blob.
    const { contentHash } = subject.provenance;
    const bundleKey =
      selection === undefined && contentHash !== undefined
        ? {
            tolerance,
            subject: contentHash,
            componentCount: components.length,
          }
        : undefined;
    const bundle =
      bundleKey === undefined
        ? undefined
        : buckets.time('overlap.step.peek', () => readEvidenceJson<BundlePayload>('overlap-pair-bundle', bundleKey));
    const bundled = new Map<string, PairVolume>();
    for (const entry of bundle?.pairs ?? []) {
      bundled.set(`${entry.left}:${entry.right}`, {
        volume: entry.volume,
        ...(entry.witnessPoint === undefined ? {} : { witnessPoint: entry.witnessPoint }),
      });
    }

    let wasm: ManifoldToplevel | undefined;
    const overlaps: MeshComponentOverlap[] = [];
    const sweptVolumes: BundlePayload['pairs'] = [];

    for (const [left, right] of pairs) {
      const runKey = `${left.id}:${right.id}`;
      let persistentKey: { left: string; right: string } | undefined;
      let resolved = bundled.get(runKey);
      if (resolved) {
        cache.profile.pairVolumeHits += 1;
      }
      if (!resolved) {
        const leftDigest = componentDigest(cache, left);
        const rightDigest = componentDigest(cache, right);
        persistentKey =
          leftDigest === undefined || rightDigest === undefined ? undefined : { left: leftDigest, right: rightDigest };
        if (persistentKey !== undefined) {
          resolved = buckets.time('overlap.step.peek', () =>
            readEvidenceJson<PairVolume>('overlap-pair-volume', persistentKey),
          );
          if (resolved) {
            cache.profile.pairVolumeHits += 1;
          }
        }
      }

      let persist = false;
      if (!resolved) {
        const separation = buckets.time('overlap.step.prefilter.prove', () =>
          provePairDisjoint(prefilterFor(cache, left, buckets), prefilterFor(cache, right, buckets)),
        );
        if (separation.proven) {
          cache.profile.prefilterProven += 1;
          resolved = { volume: 0 };
          persist = true;
        } else {
          cache.profile.prefilterFallthrough += 1;
        }
      }

      if (!resolved) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- The Manifold module is only ever loaded by a pair that actually needs the boolean; hoisting it out would pay for a wasm instance every prefilter-proven sweep.
        wasm ??= await ensureManifoldModule();
        const leftSolid = prepareManifold({ wasm, cache, component: left, buckets });
        const rightSolid = prepareManifold({ wasm, cache, component: right, buckets });
        if (!leftSolid || !rightSolid) {
          return {
            success: false,
            diagnostics: [
              {
                code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID',
                severity: 'error',
                message: `Manifold rejected component '${(leftSolid ? right : left).label}' as not a closed oriented solid.`,
                suggestion: 'Repair the source geometry so every component is a closed oriented solid.',
                details: {
                  label: (leftSolid ? right : left).label,
                  triangleCount: (leftSolid ? right : left).triangles.length,
                },
              },
            ],
          };
        }
        const inRun = cache.pairVolumes.get(runKey);
        if (inRun) {
          cache.profile.pairVolumeHits += 1;
          resolved = inRun;
        } else {
          cache.profile.pairVolumeMisses += 1;
          const solids = { left: leftSolid, right: rightSolid, wasm };
          resolved = buckets.time('overlap.step.intersection', () => {
            const intersection = solids.wasm.Manifold.intersection(solids.left, solids.right);
            try {
              const volume = buckets.time('overlap.step.volume', () => intersection.volume());
              if (volume <= volumeEpsilon) {
                return { volume };
              }
              const box = buckets.time('overlap.step.witness', () => intersection.boundingBox());
              return {
                volume,
                witnessPoint: [
                  (box.min[0] + box.max[0]) / 2,
                  (box.min[1] + box.max[1]) / 2,
                  (box.min[2] + box.max[2]) / 2,
                ] as Vec3,
              };
            } finally {
              buckets.time('overlap.step.delete', () => {
                intersection.delete();
              });
            }
          });
          recordCensus({
            profile: cache.profile,
            volume: resolved.volume,
            volumeEpsilon,
            participants: [
              solidVolume({ cache, component: left, manifold: leftSolid, buckets }),
              solidVolume({ cache, component: right, manifold: rightSolid, buckets }),
            ],
          });
          persist = true;
        }
      }

      cache.pairVolumes.set(runKey, resolved);
      if (persist && persistentKey !== undefined) {
        const payload = resolved;
        buckets.time('overlap.step.persist', () => {
          writeEvidenceJson('overlap-pair-volume', persistentKey, payload);
        });
      }
      if (bundleKey !== undefined) {
        sweptVolumes.push({
          left: left.id,
          right: right.id,
          volume: resolved.volume,
          ...(resolved.witnessPoint === undefined ? {} : { witnessPoint: resolved.witnessPoint }),
        });
      }

      if (resolved.volume > volumeEpsilon) {
        overlaps.push({
          leftComponentId: left.id,
          rightComponentId: right.id,
          leftLabel: left.label,
          rightLabel: right.label,
          ...(left.color === undefined ? {} : { leftColor: left.color }),
          ...(right.color === undefined ? {} : { rightColor: right.color }),
          intersectionVolume: resolved.volume,
          ...(resolved.witnessPoint === undefined ? {} : { witnessPoint: resolved.witnessPoint }),
          penetration: 'positive-volume',
        });
      }
    }

    // First writer wins: a bundle we read is never rewritten. A cross-process
    // race is harmless rather than guarded — the key is content-addressed, so
    // both writers frame byte-identical payloads for identical content.
    if (bundleKey !== undefined && bundle === undefined && sweptVolumes.length === pairs.length) {
      buckets.time('overlap.step.persist', () => {
        writeEvidenceJson('overlap-pair-bundle', bundleKey, {
          pairs: [...sweptVolumes].sort((a, b) => a.left - b.left || a.right - b.right),
        } satisfies BundlePayload);
      });
    }

    return {
      success: true,
      evidence: {
        componentSource: 'named',
        componentCount: components.length,
        ...(selection === undefined ? {} : { selectedPairs: selection.selected }),
        checkedPairs: pairs.length,
        tolerance,
        overlaps,
      },
      diagnostics: [],
    };
  } finally {
    // The pre-filter structures (world-frame soup, BVH, islands, winding mesh)
    // are sweep-local scratch: on a 650-component assembly they are ~1 GB of
    // Float64/Int32 arrays, and the cache that holds them lives for the whole
    // RUN (it is registered with the run's resource scope), so keeping them
    // charged every later file for a sweep that has finished. Every pair the
    // sweep decided is already in `pairVolumes` and in the persistent
    // `overlap-pair-volume`/`overlap-pair-bundle` families, so a second sweep
    // answers from those without touching the pre-filter at all; only a sweep
    // that genuinely re-proves pairs rebuilds, which is exactly the cost the
    // prepared Manifold solids (kept) were already paying for.
    cache.prefilter.clear();
    buckets.flush();
    release();
  }
};
