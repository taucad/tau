import { BufferGeometry, Float32BufferAttribute, Matrix4 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { ExtendedTriangle } from 'three-mesh-bvh';
import type { GeometrySubject, MeshTriangle } from '../../src/mesh/types.js';
import { aabbCandidatePairs, buildComponentRecords } from './component-records.js';
import type {
  OverlapBackendCandidate,
  OverlapExperimentPair,
  OverlapExperimentRecordSet,
  PreparedOverlapExperiment,
} from './types.js';

type BvhComponent = {
  label: string;
  geometry: BufferGeometry;
  bvh: MeshBVH;
};

type PreparedBvhRelation = PreparedOverlapExperiment & {
  records: OverlapExperimentRecordSet;
  components: BvhComponent[];
};

const now = (): number => performance.now();

const geometryFromTriangles = (triangles: readonly MeshTriangle[]): BufferGeometry => {
  const positions = new Float32Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point[0];
      positions[offset++] = point[1];
      positions[offset++] = point[2];
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, index) => index));
  return geometry;
};

const surfaceIntersectingPairs = (
  records: OverlapExperimentRecordSet,
  components: readonly BvhComponent[],
  pairs: readonly OverlapExperimentPair[],
): OverlapExperimentPair[] => {
  const identity = new Matrix4();
  const relationPairs: OverlapExperimentPair[] = [];
  for (const pair of pairs) {
    const left = components[pair.leftComponentId];
    const right = components[pair.rightComponentId];
    if (!left || !right) {
      continue;
    }
    const intersects = left.bvh.bvhcast(right.bvh, identity, {
      intersectsTriangles: (triangle1: ExtendedTriangle, triangle2: ExtendedTriangle) =>
        triangle1.intersectsTriangle(triangle2),
    });
    if (intersects) {
      relationPairs.push(records.pairs.find((candidate) => candidate === pair) ?? pair);
    }
  }
  return relationPairs;
};

export const threeMeshBvhRelationCandidate: OverlapBackendCandidate<PreparedBvhRelation> = {
  id: 'three-mesh-bvh-relation',
  description: 'Reference JS BVH-BVH surface relation candidate. It prunes pairs but does not produce volume evidence.',
  async prepare(subject: GeometrySubject): Promise<PreparedBvhRelation> {
    const started = now();
    const partitionStarted = now();
    const records = buildComponentRecords(subject);
    const partitionMs = now() - partitionStarted;
    const bvhStarted = now();
    const components = records.components.map((component) => {
      const geometry = geometryFromTriangles(component.triangles);
      return {
        label: component.label,
        geometry,
        bvh: new MeshBVH(geometry),
      };
    });
    return {
      records,
      components,
      timings: {
        prepareMs: now() - started,
        partitionMs,
        bvhBuildMs: now() - bvhStarted,
      },
    };
  },
  async analyze(prepared: PreparedBvhRelation, options: { tolerance: number }) {
    const started = now();
    const aabbStarted = now();
    const aabbPairs = aabbCandidatePairs(prepared.records, options.tolerance);
    const aabbMs = now() - aabbStarted;
    const queryStarted = now();
    const relationPairs = surfaceIntersectingPairs(prepared.records, prepared.components, aabbPairs);
    const bvhQueryMs = now() - queryStarted;
    const analyzeMs = now() - started;
    return {
      backend: threeMeshBvhRelationCandidate.id,
      success: true,
      componentSource: prepared.records.source,
      componentCount: prepared.records.components.length,
      totalTriangles: prepared.records.totalTriangles,
      pairCount: prepared.records.pairs.length,
      aabbCandidatePairs: aabbPairs.length,
      relationCandidatePairs: relationPairs.length,
      exactVolumePairs: 0,
      overlapCount: 0,
      overlaps: [],
      diagnostics: [],
      timings: {
        ...prepared.timings,
        aabbMs,
        bvhQueryMs,
        exactVolumeMs: 0,
        analyzeMs,
        totalMs: prepared.timings.prepareMs + analyzeMs,
      },
    };
  },
  dispose(prepared: PreparedBvhRelation): void {
    for (const component of prepared.components) {
      component.geometry.dispose();
    }
  },
};
