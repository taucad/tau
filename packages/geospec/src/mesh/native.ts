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
 * Optional native acceleration surface used by GeoSpec mesh algorithms.
 *
 * Implementations should be backed by batched C++/WASM code and must not make
 * per-triangle embind calls.
 *
 * @public
 */
export type GeoSpecNativeMeshAnalyzer = {
  analyzeChamferDistance?(options: GeoSpecNativeChamferDistanceOptions): MeshDistanceStats;
};

type GeoSpecOpenCascadeMeshDistanceStats = MeshDistanceStats & {
  delete?(): void;
};

/**
 * Minimal OpenCascade.js module shape required by
 * {@link createOpenCascadeMeshAnalyzer}.
 *
 * @public
 */
export type GeoSpecOpenCascadeMeshModule = {
  HEAPF64: Float64Array<ArrayBuffer>;
  GeoSpecMeshMetrics: {
    chamferDistanceFromTrianglePointers(
      actualPointer: number,
      actualTriangleCount: number,
      expectedPointer: number,
      expectedTriangleCount: number,
      samples: number,
    ): GeoSpecOpenCascadeMeshDistanceStats;
  };
  _malloc(bytes: number): number;
  _free(pointer: number): void;
};

const allocateFloat64 = (module: GeoSpecOpenCascadeMeshModule, values: Float64Array<ArrayBuffer>): number => {
  const pointer = module._malloc(values.byteLength);
  module.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT);
  return pointer;
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
});
