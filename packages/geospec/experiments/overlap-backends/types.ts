import type { GeometryDiagnostic, GeometrySubject, MeshTriangle, Vec3 } from '../../src/mesh/types.js';

export type OverlapExperimentAabb = {
  min: [number, number, number];
  max: [number, number, number];
};

export type OverlapExperimentComponent = {
  id: number;
  label: string;
  color?: string;
  triangles: MeshTriangle[];
  triangleCount: number;
  aabb: OverlapExperimentAabb;
};

export type OverlapExperimentPair = {
  leftComponentId: number;
  rightComponentId: number;
  leftLabel: string;
  rightLabel: string;
};

export type OverlapExperimentRecordSet = {
  source: 'named' | 'connected';
  components: OverlapExperimentComponent[];
  pairs: OverlapExperimentPair[];
  totalTriangles: number;
};

export type OverlapExperimentTimings = {
  prepareMs: number;
  partitionMs?: number;
  aabbMs?: number;
  bvhBuildMs?: number;
  bvhQueryMs?: number;
  manifoldInitMs?: number;
  manifoldConvertMs?: number;
  nativeInitMs?: number;
  exactVolumeMs?: number;
  analyzeMs: number;
  totalMs: number;
};

export type OverlapExperimentOverlap = OverlapExperimentPair & {
  intersectionVolume: number;
  witnessPoint?: Vec3;
  backend: string;
};

export type OverlapExperimentResult = {
  backend: string;
  success: boolean;
  componentSource: 'named' | 'connected';
  componentCount: number;
  totalTriangles: number;
  pairCount: number;
  aabbCandidatePairs: number;
  relationCandidatePairs: number;
  exactVolumePairs: number;
  overlapCount: number;
  overlaps: OverlapExperimentOverlap[];
  diagnostics: GeometryDiagnostic[];
  timings: OverlapExperimentTimings;
};

export type PreparedOverlapExperiment = {
  records: OverlapExperimentRecordSet;
  timings: Pick<OverlapExperimentTimings, 'prepareMs'> & Partial<OverlapExperimentTimings>;
};

export type OverlapBackendCandidate<Prepared extends PreparedOverlapExperiment = PreparedOverlapExperiment> = {
  id: string;
  description: string;
  prepare(subject: GeometrySubject): Promise<Prepared>;
  analyze(prepared: Prepared, options: { tolerance: number }): Promise<OverlapExperimentResult>;
  dispose?(prepared: Prepared): void | Promise<void>;
};

export type OverlapFixtureExpectation = {
  overlaps: Array<{
    leftLabel: string;
    rightLabel: string;
    volume: number;
    tolerance: number;
  }>;
};

export type OverlapFixture = {
  id: string;
  description: string;
  expected: OverlapFixtureExpectation;
  loadSubject(): Promise<GeometrySubject>;
};
