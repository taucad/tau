import type { CapPolygonBooleanBackendInfo } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';

export const sectionCapPerformanceDebugUserDataKey = 'sectionCapPerformanceDiagnostics';

export const sectionCapPerformanceHistoryLimit = 120;

export const sectionCapPerformanceTimingPhaseNames = [
  'frameTotal',
  'sourceCollection',
  'sourceExtraction',
  'topologyBuild',
  'candidateBroadphase',
  'topologySlice',
  'trueCut',
  'borderWrite',
  'worldPointBasis',
  'capPolygonBuild',
  'overlapClassify',
  'renderPartSplit',
  'geometryPack',
  'gpuBufferWrite',
  'workerRoundTrip',
  'materialUpdate',
  'staleHelperCleanup',
] as const;

export type SectionCapPerformanceTimingPhase = (typeof sectionCapPerformanceTimingPhaseNames)[number];

export type SectionCapPerformanceTimings = Record<SectionCapPerformanceTimingPhase, number>;

export type SectionCapPerformanceCounters = {
  sourceCount: number;
  admittedSourceCount: number;
  extensionSourceCount: number;
  fallbackSourceCount: number;
  trueCutComponentCount: number;
  cappedTrueCutComponentCount: number;
  unresolvedTrueCutEdgeCount: number;
  unsupportedSourceCount: number;
  safeSnapshotCurrentCount: number;
  topologyCacheHitCount: number;
  topologyCacheMissCount: number;
  helperCacheHitCount: number;
  helperCacheMissCount: number;
  changedGeometryKeyCount: number;
  closedContourCount: number;
  openPolylineCount: number;
  segmentCount: number;
  capPolygonCount: number;
  capRingCount: number;
  capPointCount: number;
  baseFillVertexCount: number;
  baseBoundarySegmentCount: number;
  rawOpenPolylineSegmentCount: number;
  staleBaseCapFrameCount: number;
  exactDiagnosticPendingFrameCount: number;
  sourcePairCount: number;
  broadphaseCandidatePairCount: number;
  exactIntersectionPairCount: number;
  positiveAreaPairCount: number;
  classifiableSourceCount: number;
  trueCutPrunedRegionCount: number;
  xPrunedPairCount: number;
  ownerPrunedPairCount: number;
  yPrunedPairCount: number;
  candidatePointCount: number;
  trueCutBoundsRejectCount: number;
  trueCutContourEvidenceCount: number;
  trueCutTriangleFallbackCount: number;
  workerRequestCount: number;
  topologyWorkerRequestCount: number;
  workerPendingFrameCount: number;
  workerCurrentResponseCount: number;
  workerStaleResponseCount: number;
  workerTopologyStaleResponseCount: number;
  workerStyleStaleResponseCount: number;
  workerErrorCount: number;
  styleOnlyUpdateCount: number;
  styleInvalidatedWorkerRequestCount: number;
  visibleFillCount: number;
  hiddenFillCount: number;
  diagnosticsCount: number;
  uploadedByteCount: number;
};

export type SectionCapBooleanOperation = 'intersection' | 'union' | 'difference';

export type SectionCapBooleanOperationStats = Record<
  SectionCapBooleanOperation,
  {
    count: number;
    total: number;
  }
>;

export type SectionCapPackingStats = {
  partCount: number;
  triangulatedPolygonCount: number;
  packedVertexCount: number;
  packedIndexCount: number;
  packedByteCount: number;
};

export type SectionCapFramePerformance = {
  sequence: number;
  timestamp: number;
  timings: SectionCapPerformanceTimings;
  counters: SectionCapPerformanceCounters;
  topologyKey?: string;
  styleKey?: string;
  baseCapTopologyKey?: string;
  baseCapFrameTopologyKey?: string;
  baseCapIsCurrent?: boolean;
  exactDiagnosticTopologyKey?: string;
  exactDiagnosticIsCurrent?: boolean;
  committedTopologyKey?: string;
  pendingTopologyKey?: string;
  pendingReason?: 'topology-change' | 'style-change' | 'worker-init' | 'duplicate-in-flight' | 'none';
  booleanOperations: SectionCapBooleanOperationStats;
  booleanBackend?: CapPolygonBooleanBackendInfo;
  packing: SectionCapPackingStats;
};

export type SectionCapPerformanceAggregate = Readonly<{
  count: number;
  p50: number;
  p95: number;
  max: number;
}>;

export type SectionCapPerformanceAggregates = Readonly<{
  frameTotal: SectionCapPerformanceAggregate;
  phases: Record<SectionCapPerformanceTimingPhase, SectionCapPerformanceAggregate>;
}>;

export type SectionCapPerformanceDebugSummary = Readonly<{
  latestFrame: SectionCapFramePerformance;
  history: readonly SectionCapFramePerformance[];
  aggregates: SectionCapPerformanceAggregates;
}>;

export type SectionCapBooleanDebugSink = Readonly<{
  recordBooleanOperation(operation: SectionCapBooleanOperation, elapsed: number): void;
}>;

export type SectionCapPackingDebugSink = Readonly<{
  recordPackedGeometry(stats: SectionCapPackingStats): void;
}>;

export const createSectionCapPerformanceTimings = (): SectionCapPerformanceTimings => ({
  frameTotal: 0,
  sourceCollection: 0,
  sourceExtraction: 0,
  topologyBuild: 0,
  candidateBroadphase: 0,
  topologySlice: 0,
  trueCut: 0,
  borderWrite: 0,
  worldPointBasis: 0,
  capPolygonBuild: 0,
  overlapClassify: 0,
  renderPartSplit: 0,
  geometryPack: 0,
  gpuBufferWrite: 0,
  workerRoundTrip: 0,
  materialUpdate: 0,
  staleHelperCleanup: 0,
});

export const createSectionCapPerformanceCounters = (): SectionCapPerformanceCounters => ({
  sourceCount: 0,
  admittedSourceCount: 0,
  extensionSourceCount: 0,
  fallbackSourceCount: 0,
  trueCutComponentCount: 0,
  cappedTrueCutComponentCount: 0,
  unresolvedTrueCutEdgeCount: 0,
  unsupportedSourceCount: 0,
  safeSnapshotCurrentCount: 0,
  topologyCacheHitCount: 0,
  topologyCacheMissCount: 0,
  helperCacheHitCount: 0,
  helperCacheMissCount: 0,
  changedGeometryKeyCount: 0,
  closedContourCount: 0,
  openPolylineCount: 0,
  segmentCount: 0,
  capPolygonCount: 0,
  capRingCount: 0,
  capPointCount: 0,
  baseFillVertexCount: 0,
  baseBoundarySegmentCount: 0,
  rawOpenPolylineSegmentCount: 0,
  staleBaseCapFrameCount: 0,
  exactDiagnosticPendingFrameCount: 0,
  sourcePairCount: 0,
  broadphaseCandidatePairCount: 0,
  exactIntersectionPairCount: 0,
  positiveAreaPairCount: 0,
  classifiableSourceCount: 0,
  trueCutPrunedRegionCount: 0,
  xPrunedPairCount: 0,
  ownerPrunedPairCount: 0,
  yPrunedPairCount: 0,
  candidatePointCount: 0,
  trueCutBoundsRejectCount: 0,
  trueCutContourEvidenceCount: 0,
  trueCutTriangleFallbackCount: 0,
  workerRequestCount: 0,
  topologyWorkerRequestCount: 0,
  workerPendingFrameCount: 0,
  workerCurrentResponseCount: 0,
  workerStaleResponseCount: 0,
  workerTopologyStaleResponseCount: 0,
  workerStyleStaleResponseCount: 0,
  workerErrorCount: 0,
  styleOnlyUpdateCount: 0,
  styleInvalidatedWorkerRequestCount: 0,
  visibleFillCount: 0,
  hiddenFillCount: 0,
  diagnosticsCount: 0,
  uploadedByteCount: 0,
});

export const createSectionCapBooleanOperationStats = (): SectionCapBooleanOperationStats => ({
  intersection: { count: 0, total: 0 },
  union: { count: 0, total: 0 },
  difference: { count: 0, total: 0 },
});

export const createSectionCapPackingStats = (): SectionCapPackingStats => ({
  partCount: 0,
  triangulatedPolygonCount: 0,
  packedVertexCount: 0,
  packedIndexCount: 0,
  packedByteCount: 0,
});

export const createSectionCapFramePerformance = (sequence: number, timestamp: number): SectionCapFramePerformance => ({
  sequence,
  timestamp,
  timings: createSectionCapPerformanceTimings(),
  counters: createSectionCapPerformanceCounters(),
  booleanOperations: createSectionCapBooleanOperationStats(),
  packing: createSectionCapPackingStats(),
});

export const addSectionCapTiming = (
  frame: SectionCapFramePerformance | undefined,
  phase: SectionCapPerformanceTimingPhase,
  elapsed: number,
): void => {
  if (!frame || !Number.isFinite(elapsed) || elapsed < 0) {
    return;
  }

  frame.timings[phase] += elapsed;
};

export const recordSectionCapBooleanOperation = (
  frame: SectionCapFramePerformance | undefined,
  operation: SectionCapBooleanOperation,
  elapsed: number,
): void => {
  if (!frame) {
    return;
  }

  const stats = frame.booleanOperations[operation];
  stats.count++;
  if (Number.isFinite(elapsed) && elapsed >= 0) {
    stats.total += elapsed;
  }
};

export const recordSectionCapPackedGeometry = (
  frame: SectionCapFramePerformance | undefined,
  stats: SectionCapPackingStats,
): void => {
  if (!frame) {
    return;
  }

  frame.packing.partCount += stats.partCount;
  frame.packing.triangulatedPolygonCount += stats.triangulatedPolygonCount;
  frame.packing.packedVertexCount += stats.packedVertexCount;
  frame.packing.packedIndexCount += stats.packedIndexCount;
  frame.packing.packedByteCount += stats.packedByteCount;
};

const percentile = (values: readonly number[], percentileRatio: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileRatio) - 1));
  return sorted[index]!;
};

const aggregate = (values: readonly number[]): SectionCapPerformanceAggregate => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length === 0 ? 0 : Math.max(...values),
});

const buildAggregates = (history: readonly SectionCapFramePerformance[]): SectionCapPerformanceAggregates => {
  const phases = Object.fromEntries(
    sectionCapPerformanceTimingPhaseNames.map((phase) => [
      phase,
      aggregate(history.map((frame) => frame.timings[phase]).filter((value) => Number.isFinite(value))),
    ]),
  ) as Record<SectionCapPerformanceTimingPhase, SectionCapPerformanceAggregate>;

  return {
    frameTotal: phases.frameTotal,
    phases,
  };
};

export const appendSectionCapPerformanceFrame = (
  previous: SectionCapPerformanceDebugSummary | undefined,
  frame: SectionCapFramePerformance,
  historyLimit = sectionCapPerformanceHistoryLimit,
): SectionCapPerformanceDebugSummary => {
  const boundedLimit = Math.max(1, historyLimit);
  const nextHistory = [...(previous?.history ?? []), frame].slice(-boundedLimit);
  return {
    latestFrame: frame,
    history: nextHistory,
    aggregates: buildAggregates(nextHistory),
  };
};
