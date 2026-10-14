import type { CapPolygonBooleanBackendInfo } from '#graphics/three/utils/section-cap-polygon-boolean-backend.js';

/**
 * The `userData` key under which the section-cap fill root stores its performance debug summary.
 *
 * @public
 */
export const sectionCapPerformanceDebugUserDataKey = 'sectionCapPerformanceDiagnostics';

/**
 * The default number of frames kept in a section-cap performance history.
 *
 * @public
 */
export const sectionCapPerformanceHistoryLimit = 120;

/**
 * The names of the timed phases of a section-cap frame, in pipeline order.
 *
 * @public
 */
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
  'capTrim',
  'overlapClassify',
  'renderPartSplit',
  'geometryPack',
  'gpuBufferWrite',
  'workerRoundTrip',
  'materialUpdate',
  'staleHelperCleanup',
] as const;

/**
 * One timed phase of a section-cap frame.
 *
 * @public
 */
export type SectionCapPerformanceTimingPhase = (typeof sectionCapPerformanceTimingPhaseNames)[number];

/**
 * The time spent in each phase of a section-cap frame, in milliseconds.
 *
 * @public
 */
export type SectionCapPerformanceTimings = Record<SectionCapPerformanceTimingPhase, number>;

/**
 * The work counts recorded for a section-cap frame, such as sources, contours, cache hits and worker responses.
 *
 * @public
 */
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
  /** Caps trimmed to their group this frame; the rest reused the trim they were drawn with. */
  capTrimCount: number;
  /** Clipper calls those trims made; a cap wholly inside or outside a region or footprint needs none for it. */
  capTrimClipperCount: number;
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
  /** 1 on a frame that left the drawn caps as they were because nothing they are drawn from changed. */
  skippedFrameCount: number;
};

/**
 * A polygon boolean operation run while building section caps.
 *
 * @public
 */
export type SectionCapBooleanOperation = 'intersection' | 'union' | 'difference';

/**
 * The number of calls to, and total time spent in, each polygon boolean operation during a frame.
 *
 * @public
 */
export type SectionCapBooleanOperationStats = Record<
  SectionCapBooleanOperation,
  {
    count: number;
    total: number;
  }
>;

/**
 * The counts of parts, polygons, vertices, indices and bytes packed into cap geometry during a frame.
 *
 * @public
 */
export type SectionCapPackingStats = {
  partCount: number;
  triangulatedPolygonCount: number;
  packedVertexCount: number;
  packedIndexCount: number;
  packedByteCount: number;
};

/**
 * One cut face's share of a frame's cap work, so a diagnostic can attribute costs per face.
 *
 * @public
 */
export type SectionCapFacePerformance = {
  faceKey: string;
  timings: SectionCapPerformanceTimings;
  /** Sources sliced through the face this frame; the rest reused the face's slices. */
  slicedSourceCount: number;
  capPointCount: number;
  boundarySegmentCount: number;
};

/**
 * The timings, counters and cache keys recorded for one section-cap frame.
 *
 * @public
 */
export type SectionCapFramePerformance = {
  sequence: number;
  timestamp: number;
  /** The whole frame; {@link SectionCapFramePerformance.faces} splits the per-face phases by face. */
  timings: SectionCapPerformanceTimings;
  counters: SectionCapPerformanceCounters;
  faces: SectionCapFacePerformance[];
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

/**
 * The sample count, median, 95th percentile and maximum of one timing across the frame history.
 *
 * @public
 */
export type SectionCapPerformanceAggregate = Readonly<{
  count: number;
  p50: number;
  p95: number;
  max: number;
}>;

/**
 * The aggregates of the frame total and of every timed phase across the frame history.
 *
 * @public
 */
export type SectionCapPerformanceAggregates = Readonly<{
  frameTotal: SectionCapPerformanceAggregate;
  phases: Record<SectionCapPerformanceTimingPhase, SectionCapPerformanceAggregate>;
}>;

/**
 * The latest section-cap frame, the bounded frame history and the aggregates over that history.
 *
 * @public
 */
export type SectionCapPerformanceDebugSummary = Readonly<{
  latestFrame: SectionCapFramePerformance;
  history: readonly SectionCapFramePerformance[];
  aggregates: SectionCapPerformanceAggregates;
}>;

/**
 * Receives the timing of each polygon boolean operation run while building caps.
 *
 * @public
 */
export type SectionCapBooleanDebugSink = Readonly<{
  recordBooleanOperation(operation: SectionCapBooleanOperation, elapsed: number): void;
}>;

/**
 * Receives the packing stats of each piece of cap geometry packed during a frame.
 *
 * @public
 */
export type SectionCapPackingDebugSink = Readonly<{
  recordPackedGeometry(stats: SectionCapPackingStats): void;
}>;

/**
 * Create a timings record with every phase set to zero.
 *
 * @returns Zeroed section-cap timings.
 * @public
 */
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
  capTrim: 0,
  overlapClassify: 0,
  renderPartSplit: 0,
  geometryPack: 0,
  gpuBufferWrite: 0,
  workerRoundTrip: 0,
  materialUpdate: 0,
  staleHelperCleanup: 0,
});

/**
 * Create a counters record with every count set to zero.
 *
 * @returns Zeroed section-cap counters.
 * @public
 */
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
  capTrimCount: 0,
  capTrimClipperCount: 0,
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
  skippedFrameCount: 0,
});

/**
 * Create boolean operation stats with every count and total set to zero.
 *
 * @returns Zeroed boolean operation stats.
 * @public
 */
export const createSectionCapBooleanOperationStats = (): SectionCapBooleanOperationStats => ({
  intersection: { count: 0, total: 0 },
  union: { count: 0, total: 0 },
  difference: { count: 0, total: 0 },
});

/**
 * Create packing stats with every count set to zero.
 *
 * @returns Zeroed packing stats.
 * @public
 */
export const createSectionCapPackingStats = (): SectionCapPackingStats => ({
  partCount: 0,
  triangulatedPolygonCount: 0,
  packedVertexCount: 0,
  packedIndexCount: 0,
  packedByteCount: 0,
});

/**
 * Create an empty performance record for a section-cap frame.
 *
 * @param sequence - The frame's sequence number.
 * @param timestamp - When the frame started.
 * @returns A frame record with zeroed timings, counters and stats and no faces.
 * @public
 */
export const createSectionCapFramePerformance = (sequence: number, timestamp: number): SectionCapFramePerformance => ({
  sequence,
  timestamp,
  timings: createSectionCapPerformanceTimings(),
  counters: createSectionCapPerformanceCounters(),
  faces: [],
  booleanOperations: createSectionCapBooleanOperationStats(),
  packing: createSectionCapPackingStats(),
});

/**
 * The face's entry in the frame, added on first use.
 *
 * @public
 */
export const getSectionCapFacePerformance = (
  frame: SectionCapFramePerformance,
  faceKey: string,
): SectionCapFacePerformance => {
  let face = frame.faces.find((candidate) => candidate.faceKey === faceKey);
  if (!face) {
    face = {
      faceKey,
      timings: createSectionCapPerformanceTimings(),
      slicedSourceCount: 0,
      capPointCount: 0,
      boundarySegmentCount: 0,
    };
    frame.faces.push(face);
  }
  return face;
};

/**
 * Add elapsed time to a phase of the frame. Does nothing without a frame or when the time is negative or not finite.
 *
 * @param frame - The frame being measured, if any.
 * @param phase - The phase to add to.
 * @param elapsed - The elapsed time in milliseconds.
 * @public
 */
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

/**
 * Adds to a phase of the frame and to the face's share of it.
 *
 * @public
 */
export const addSectionCapFaceTiming = (
  frame: SectionCapFramePerformance | undefined,
  { faceKey, phase, elapsed }: Readonly<{ faceKey: string; phase: SectionCapPerformanceTimingPhase; elapsed: number }>,
): void => {
  if (!frame || !Number.isFinite(elapsed) || elapsed < 0) {
    return;
  }

  frame.timings[phase] += elapsed;
  getSectionCapFacePerformance(frame, faceKey).timings[phase] += elapsed;
};

/**
 * Count a polygon boolean operation in the frame and add its elapsed time when that is valid.
 *
 * @param frame - The frame being measured, if any.
 * @param operation - The boolean operation that ran.
 * @param elapsed - The time it took in milliseconds.
 * @public
 */
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

/**
 * Add the stats of a piece of packed cap geometry to the frame's packing totals.
 *
 * @param frame - The frame being measured, if any.
 * @param stats - The packing stats to add.
 * @public
 */
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

/**
 * Appends a frame to the history the aggregates cover. A skipped frame joins the history, so the phases are measured
 * over every rendered frame, but `latestFrame` stays the frame that built what is drawn.
 * @public
 */
export const appendSectionCapPerformanceFrame = (
  previous: SectionCapPerformanceDebugSummary | undefined,
  frame: SectionCapFramePerformance,
  historyLimit = sectionCapPerformanceHistoryLimit,
): SectionCapPerformanceDebugSummary => {
  const boundedLimit = Math.max(1, historyLimit);
  const nextHistory = [...(previous?.history ?? []), frame].slice(-boundedLimit);
  return {
    latestFrame: frame.counters.skippedFrameCount > 0 && previous ? previous.latestFrame : frame,
    history: nextHistory,
    aggregates: buildAggregates(nextHistory),
  };
};
