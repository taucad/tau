import nativeFactory from '../../native/opencascade/dist/init.js';
import type { GeometryDiagnostic, GeometrySubject } from '../../src/mesh/types.js';
import { aabbCandidatePairs, buildComponentRecords, toTriangleSoup } from './component-records.js';
import type { OverlapBackendCandidate, OverlapExperimentRecordSet, PreparedOverlapExperiment } from './types.js';

type PreparedOpenCascadeBaseline = PreparedOverlapExperiment & {
  records: OverlapExperimentRecordSet;
  analyzer: OpenCascadeBaselineAnalyzer;
};

type OpenCascadeBaselineOverlap = {
  leftComponentId: number;
  rightComponentId: number;
  intersectionVolume: number;
  witnessPoint?: [number, number, number];
};

type OpenCascadeBaselineResult = {
  success: boolean;
  componentCount: number;
  checkedPairs: number;
  overlaps: OpenCascadeBaselineOverlap[];
  diagnostics?: Array<{
    code: string;
    message: string;
    details?: unknown;
  }>;
};

type OpenCascadeBaselineEmbindResult = {
  success: boolean;
  evidenceJson(): string;
  delete?(): void;
};

type OpenCascadeBaselineModule = {
  HEAP32: Int32Array<ArrayBuffer>;
  HEAPF64: Float64Array<ArrayBuffer>;
  GeoSpecMeshMetrics: {
    componentOverlapFromTrianglePointers(
      trianglePointer: number,
      triangleCount: number,
      componentIdPointer: number,
      componentCount: number,
      tolerance: number,
    ): OpenCascadeBaselineEmbindResult;
  };
  _malloc(bytes: number): number;
  _free(pointer: number): void;
};

type OpenCascadeBaselineOptions = ReturnType<typeof toTriangleSoup> & {
  tolerance: number;
};

type OpenCascadeBaselineAnalyzer = {
  analyzeMeshOverlap(options: OpenCascadeBaselineOptions): OpenCascadeBaselineResult;
};

const now = (): number => performance.now();

const allocateFloat64 = (module: OpenCascadeBaselineModule, values: Float64Array<ArrayBuffer>): number => {
  const pointer = module._malloc(values.byteLength);
  module.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT);
  return pointer;
};

const allocateInt32 = (module: OpenCascadeBaselineModule, values: Int32Array<ArrayBuffer>): number => {
  const pointer = module._malloc(values.byteLength);
  module.HEAP32.set(values, pointer / Int32Array.BYTES_PER_ELEMENT);
  return pointer;
};

const validateBaselineOptions = (options: OpenCascadeBaselineOptions): void => {
  if (options.subject.triangles.length !== options.subject.triangleCount * 9) {
    throw new Error('OpenCascade baseline received malformed triangle soup.');
  }
  if (options.componentIds.length !== options.subject.triangleCount) {
    throw new Error('OpenCascade baseline component id count must match triangle count.');
  }
};

const createOpenCascadeBaselineAnalyzer = (module: OpenCascadeBaselineModule): OpenCascadeBaselineAnalyzer => ({
  analyzeMeshOverlap(options) {
    validateBaselineOptions(options);
    const trianglePointer = allocateFloat64(module, options.subject.triangles);
    const componentIdPointer = allocateInt32(module, options.componentIds);
    try {
      const result = module.GeoSpecMeshMetrics.componentOverlapFromTrianglePointers(
        trianglePointer,
        options.subject.triangleCount,
        componentIdPointer,
        options.components.length,
        options.tolerance,
      );
      try {
        const parsed = JSON.parse(result.evidenceJson()) as OpenCascadeBaselineResult;
        return {
          ...parsed,
          success: Boolean(result.success && parsed.success),
        };
      } finally {
        result.delete?.();
      }
    } finally {
      module._free(componentIdPointer);
      module._free(trianglePointer);
    }
  },
});

const nativeDiagnostics = (
  diagnostics: ReadonlyArray<{ code: string; message: string; details?: unknown }> | undefined,
): GeometryDiagnostic[] =>
  (diagnostics ?? []).map((diagnostic) => ({
    code: diagnostic.code,
    severity: 'error',
    message: diagnostic.message,
    details: diagnostic.details,
  }));

export const opencascadeBaselineCandidate: OverlapBackendCandidate<PreparedOpenCascadeBaseline> = {
  id: 'opencascade-all-pairs-baseline',
  description: 'Current OpenCascade analyzer path: faceted solids plus BRepAlgoAPI_Common for every component pair.',
  async prepare(subject: GeometrySubject): Promise<PreparedOpenCascadeBaseline> {
    const started = now();
    const partitionStarted = now();
    const records = buildComponentRecords(subject);
    const partitionMs = now() - partitionStarted;
    const nativeStarted = now();
    const module = (await nativeFactory()) as unknown as OpenCascadeBaselineModule;
    const analyzer = createOpenCascadeBaselineAnalyzer(module);
    const nativeInitMs = now() - nativeStarted;
    return {
      records,
      analyzer,
      timings: {
        prepareMs: now() - started,
        partitionMs,
        nativeInitMs,
      },
    };
  },
  async analyze(prepared: PreparedOpenCascadeBaseline, options: { tolerance: number }) {
    const started = now();
    const aabbStarted = now();
    const aabbPairs = aabbCandidatePairs(prepared.records, options.tolerance);
    const aabbMs = now() - aabbStarted;
    const exactStarted = now();
    const native = prepared.analyzer.analyzeMeshOverlap({
      ...toTriangleSoup(prepared.records),
      tolerance: options.tolerance,
    });
    const exactVolumeMs = now() - exactStarted;
    const overlaps = native.overlaps.map((overlap) => {
      const left = prepared.records.components[overlap.leftComponentId]!;
      const right = prepared.records.components[overlap.rightComponentId]!;
      return {
        leftComponentId: overlap.leftComponentId,
        rightComponentId: overlap.rightComponentId,
        leftLabel: left.label,
        rightLabel: right.label,
        intersectionVolume: overlap.intersectionVolume,
        witnessPoint: overlap.witnessPoint,
        backend: opencascadeBaselineCandidate.id,
      };
    });
    const analyzeMs = now() - started;
    return {
      backend: opencascadeBaselineCandidate.id,
      success: native.success,
      componentSource: prepared.records.source,
      componentCount: prepared.records.components.length,
      totalTriangles: prepared.records.totalTriangles,
      pairCount: prepared.records.pairs.length,
      aabbCandidatePairs: aabbPairs.length,
      relationCandidatePairs: prepared.records.pairs.length,
      exactVolumePairs: native.checkedPairs,
      overlapCount: overlaps.length,
      overlaps,
      diagnostics: nativeDiagnostics(native.diagnostics),
      timings: {
        ...prepared.timings,
        aabbMs,
        exactVolumeMs,
        analyzeMs,
        totalMs: prepared.timings.prepareMs + analyzeMs,
      },
    };
  },
};
