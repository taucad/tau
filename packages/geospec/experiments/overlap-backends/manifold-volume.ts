import initManifold from 'manifold-3d';
import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '../../src/mesh/types.js';
import { aabbCandidatePairs, aabbCenter, buildComponentRecords, intersectAabb } from './component-records.js';
import type {
  OverlapBackendCandidate,
  OverlapExperimentComponent,
  OverlapExperimentRecordSet,
  PreparedOverlapExperiment,
} from './types.js';

type PreparedManifoldComponent = {
  component: OverlapExperimentComponent;
  merged: boolean;
  convertMs: number;
  manifold?: ManifoldSolid;
  status?: unknown;
  error?: {
    message: string;
    code?: string;
  };
};

type PreparedManifoldVolume = PreparedOverlapExperiment & {
  records: OverlapExperimentRecordSet;
  wasm: ManifoldToplevel;
  components: PreparedManifoldComponent[];
};

const now = (): number => performance.now();

const componentToManifold = (
  wasm: ManifoldToplevel,
  component: OverlapExperimentComponent,
): PreparedManifoldComponent => {
  const started = now();
  const vertProperties = new Float32Array(component.triangles.length * 9);
  let offset = 0;
  for (const triangle of component.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      vertProperties[offset++] = point[0];
      vertProperties[offset++] = point[1];
      vertProperties[offset++] = point[2];
    }
  }
  const triVerts = new Uint32Array(vertProperties.length / 3).map((_, index) => index);
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties,
    triVerts,
  });
  const merged = mesh.merge();
  try {
    const manifold = new wasm.Manifold(mesh);
    return {
      component,
      merged,
      manifold,
      status: manifold.status(),
      convertMs: now() - started,
    };
  } catch (error) {
    return {
      component,
      merged,
      convertMs: now() - started,
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined,
      },
    };
  }
};

const invalidComponentDiagnostics = (components: readonly PreparedManifoldComponent[]): GeometryDiagnostic[] =>
  components
    .filter((component) => !component.manifold)
    .map((component) => ({
      code: 'GEOSPEC_POC_MANIFOLD_COMPONENT_INVALID',
      severity: 'error',
      message: `Manifold rejected component '${component.component.label}' as ${component.error?.code ?? 'invalid'}.`,
      suggestion:
        'Use this PoC result to decide whether mesh repair/normalization is sufficient before considering Manifold as the canonical exact-volume backend.',
      spatial: {
        min: component.component.aabb.min,
        max: component.component.aabb.max,
        center: aabbCenter(component.component.aabb),
      },
      details: {
        label: component.component.label,
        triangleCount: component.component.triangleCount,
        merged: component.merged,
        error: component.error,
      },
    }));

const volumeWitness = (manifold: ManifoldSolid, fallback: Vec3): Vec3 => {
  try {
    const box = manifold.boundingBox();
    return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  } catch {
    return fallback;
  }
};

export const manifoldVolumeCandidate: OverlapBackendCandidate<PreparedManifoldVolume> = {
  id: 'manifold-exact-volume',
  description:
    'Manifold WASM exact-volume candidate using Mesh.merge(), Manifold construction, intersection(), and volume().',
  async prepare(subject: GeometrySubject): Promise<PreparedManifoldVolume> {
    const started = now();
    const partitionStarted = now();
    const records = buildComponentRecords(subject);
    const partitionMs = now() - partitionStarted;
    const initStarted = now();
    const wasm = await initManifold();
    wasm.setup();
    const manifoldInitMs = now() - initStarted;
    const convertStarted = now();
    const components = records.components.map((component) => componentToManifold(wasm, component));
    const manifoldConvertMs = now() - convertStarted;
    return {
      records,
      wasm,
      components,
      timings: {
        prepareMs: now() - started,
        partitionMs,
        manifoldInitMs,
        manifoldConvertMs,
      },
    };
  },
  async analyze(prepared: PreparedManifoldVolume, options: { tolerance: number }) {
    const started = now();
    const diagnostics = invalidComponentDiagnostics(prepared.components);
    const aabbStarted = now();
    const aabbPairs = aabbCandidatePairs(prepared.records, options.tolerance);
    const aabbMs = now() - aabbStarted;
    if (diagnostics.length > 0) {
      const analyzeMs = now() - started;
      return {
        backend: manifoldVolumeCandidate.id,
        success: false,
        componentSource: prepared.records.source,
        componentCount: prepared.records.components.length,
        totalTriangles: prepared.records.totalTriangles,
        pairCount: prepared.records.pairs.length,
        aabbCandidatePairs: aabbPairs.length,
        relationCandidatePairs: 0,
        exactVolumePairs: 0,
        overlapCount: 0,
        overlaps: [],
        diagnostics,
        timings: {
          ...prepared.timings,
          aabbMs,
          exactVolumeMs: 0,
          analyzeMs,
          totalMs: prepared.timings.prepareMs + analyzeMs,
        },
      };
    }

    const exactStarted = now();
    const overlaps = [];
    const volumeEpsilon = Math.max(options.tolerance * options.tolerance * options.tolerance, 1e-12);
    for (const pair of aabbPairs) {
      const left = prepared.components[pair.leftComponentId]?.manifold;
      const right = prepared.components[pair.rightComponentId]?.manifold;
      if (!left || !right) {
        continue;
      }
      const intersection = prepared.wasm.Manifold.intersection(left, right);
      try {
        const volume = intersection.volume();
        if (volume > volumeEpsilon) {
          const fallback = aabbCenter(
            intersectAabb(
              prepared.records.components[pair.leftComponentId]!.aabb,
              prepared.records.components[pair.rightComponentId]!.aabb,
            ),
          );
          overlaps.push({
            ...pair,
            intersectionVolume: volume,
            witnessPoint: volumeWitness(intersection, fallback),
            backend: manifoldVolumeCandidate.id,
          });
        }
      } finally {
        intersection.delete();
      }
    }
    const exactVolumeMs = now() - exactStarted;
    const analyzeMs = now() - started;
    return {
      backend: manifoldVolumeCandidate.id,
      success: true,
      componentSource: prepared.records.source,
      componentCount: prepared.records.components.length,
      totalTriangles: prepared.records.totalTriangles,
      pairCount: prepared.records.pairs.length,
      aabbCandidatePairs: aabbPairs.length,
      relationCandidatePairs: aabbPairs.length,
      exactVolumePairs: aabbPairs.length,
      overlapCount: overlaps.length,
      overlaps,
      diagnostics: [],
      timings: {
        ...prepared.timings,
        aabbMs,
        exactVolumeMs,
        analyzeMs,
        totalMs: prepared.timings.prepareMs + analyzeMs,
      },
    };
  },
  dispose(prepared: PreparedManifoldVolume): void {
    for (const component of prepared.components) {
      component.manifold?.delete();
    }
  },
};
