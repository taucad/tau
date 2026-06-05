import type { MeshDistanceStats } from '#mesh/distance.js';

/**
 * Flat triangle-soup input accepted by native mesh analyzers.
 *
 * Triangles are encoded as `ax, ay, az, bx, by, bz, cx, cy, cz` per triangle.
 *
 * @public
 */
export type GeoSpecNativeTriangleSoup = {
  triangles: Float64Array<ArrayBuffer>;
  triangleCount: number;
};

/**
 * Input for a native Chamfer-style mesh distance implementation.
 *
 * @public
 */
export type GeoSpecNativeChamferDistanceOptions = {
  actual: GeoSpecNativeTriangleSoup;
  expected: GeoSpecNativeTriangleSoup;
  samples: number;
  seed?: number;
};

/**
 * Metadata for one mesh component passed to native overlap analysis.
 *
 * @public
 */
export type GeoSpecNativeMeshComponent = {
  id: number;
  label: string;
  color?: string;
  triangleCount: number;
};

/**
 * Overlap reported by a native component-overlap analyzer.
 *
 * @public
 */
export type GeoSpecNativeMeshOverlap = {
  leftComponentId: number;
  rightComponentId: number;
  intersectionVolume: number;
  witnessPoint?: [number, number, number];
};

/**
 * Native component-overlap analysis evidence.
 *
 * @public
 */
export type GeoSpecNativeMeshOverlapResult = {
  success: boolean;
  componentCount: number;
  checkedPairs: number;
  overlaps: GeoSpecNativeMeshOverlap[];
  diagnostics?: Array<{
    code: string;
    message: string;
    details?: unknown;
  }>;
};

/**
 * Input for native component-overlap analysis.
 *
 * @public
 */
export type GeoSpecNativeMeshOverlapOptions = {
  subject: GeoSpecNativeTriangleSoup;
  componentIds: Int32Array<ArrayBuffer>;
  components: GeoSpecNativeMeshComponent[];
  tolerance: number;
};

/**
 * Optional native acceleration surface used by GeoSpec mesh algorithms.
 *
 * Implementations should be backed by batched C++/WASM code and must not make
 * per-triangle embind calls.
 *
 * @public
 */
export type GeoSpecNativeMeshAnalyzer = {
  analyzeChamferDistance?(options: GeoSpecNativeChamferDistanceOptions): MeshDistanceStats;
  analyzeMeshOverlap?(options: GeoSpecNativeMeshOverlapOptions): GeoSpecNativeMeshOverlapResult;
};

type GeoSpecOpenCascadeMeshDistanceStats = MeshDistanceStats & {
  delete?(): void;
};

type GeoSpecOpenCascadeMeshOverlapResult = {
  success: boolean;
  evidenceJson(): string;
  delete?(): void;
};

/**
 * Minimal OpenCascade.js module shape required by
 * {@link createOpenCascadeMeshAnalyzer}.
 *
 * @public
 */
export type GeoSpecOpenCascadeMeshModule = {
  HEAP32: Int32Array<ArrayBuffer>;
  HEAPF64: Float64Array<ArrayBuffer>;
  GeoSpecMeshMetrics: {
    chamferDistanceFromTrianglePointers(
      actualPointer: number,
      actualTriangleCount: number,
      expectedPointer: number,
      expectedTriangleCount: number,
      samples: number,
    ): GeoSpecOpenCascadeMeshDistanceStats;
    componentOverlapFromTrianglePointers(
      trianglePointer: number,
      triangleCount: number,
      componentIdPointer: number,
      componentCount: number,
      tolerance: number,
    ): GeoSpecOpenCascadeMeshOverlapResult;
  };
  _malloc(bytes: number): number;
  _free(pointer: number): void;
};

const allocateFloat64 = (module: GeoSpecOpenCascadeMeshModule, values: Float64Array<ArrayBuffer>): number => {
  const pointer = module._malloc(values.byteLength);
  module.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT);
  return pointer;
};

const allocateInt32 = (module: GeoSpecOpenCascadeMeshModule, values: Int32Array<ArrayBuffer>): number => {
  const pointer = module._malloc(values.byteLength);
  module.HEAP32.set(values, pointer / Int32Array.BYTES_PER_ELEMENT);
  return pointer;
};

const validateTriangleSoup = (name: string, soup: GeoSpecNativeTriangleSoup): void => {
  const expectedLength = soup.triangleCount * 9;
  if (!Number.isInteger(soup.triangleCount) || soup.triangleCount < 0) {
    throw new Error(`${name}.triangleCount must be a non-negative integer.`);
  }
  if (soup.triangles.length !== expectedLength) {
    throw new Error(
      `${name}.triangles length (${soup.triangles.length}) must equal triangleCount * 9 (${expectedLength}).`,
    );
  }
};

const validateComponentIds = (options: GeoSpecNativeMeshOverlapOptions): void => {
  if (options.componentIds.length !== options.subject.triangleCount) {
    throw new Error(
      `componentIds length (${options.componentIds.length}) must equal subject.triangleCount (${options.subject.triangleCount}).`,
    );
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error('tolerance must be a non-negative finite number.');
  }
  if (options.components.length < 2) {
    throw new Error('At least two components are required for overlap analysis.');
  }
};

/**
 * Create a GeoSpec native mesh analyzer from an OpenCascade.js build that
 * includes GeoSpec's `GeoSpecMeshMetrics` C++ wrapper.
 *
 * @param module - Initialized OpenCascade.js module.
 * @returns Native analyzer suitable for `analyzeChamferDistance`.
 * @public
 */
export const createOpenCascadeMeshAnalyzer = (module: GeoSpecOpenCascadeMeshModule): GeoSpecNativeMeshAnalyzer => ({
  analyzeChamferDistance(options) {
    validateTriangleSoup('actual', options.actual);
    validateTriangleSoup('expected', options.expected);
    const actualPointer = allocateFloat64(module, options.actual.triangles);
    const expectedPointer = allocateFloat64(module, options.expected.triangles);
    try {
      const stats = module.GeoSpecMeshMetrics.chamferDistanceFromTrianglePointers(
        actualPointer,
        options.actual.triangleCount,
        expectedPointer,
        options.expected.triangleCount,
        options.samples,
      );
      try {
        return {
          min: stats.min,
          mean: stats.mean,
          max: stats.max,
          p50: stats.p50,
          p95: stats.p95,
          p99: stats.p99,
          rms: stats.rms,
          samples: stats.samples,
          algorithm: 'opencascade-bvh',
          seed: options.seed,
        };
      } finally {
        stats.delete?.();
      }
    } finally {
      module._free(expectedPointer);
      module._free(actualPointer);
    }
  },
  analyzeMeshOverlap(options) {
    validateTriangleSoup('subject', options.subject);
    validateComponentIds(options);
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
        const parsed = JSON.parse(result.evidenceJson()) as GeoSpecNativeMeshOverlapResult;
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
