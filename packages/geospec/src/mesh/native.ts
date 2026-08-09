import type { MeshDistanceStats } from '#mesh/types.js';
import { ensureOpenCascadeModule } from '#native/opencascade-module.js';

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
 * Canonical production mesh-analysis backend.
 *
 * JavaScript owns orchestration and diagnostics; triangle-heavy metrics must be
 * implemented by batched native/WASM calls behind this interface.
 *
 * @public
 */
export type GeoSpecMeshBackend = {
  analyzeChamferDistance(options: GeoSpecNativeChamferDistanceOptions): MeshDistanceStats;
  dispose?(): void;
};

type GeoSpecOpenCascadeMeshDistanceStats = MeshDistanceStats & {
  delete?(): void;
};

/**
 * Minimal OpenCascade.js module shape required by the GeoSpec mesh backend.
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

/**
 * Compute Chamfer distance through the GeoSpec OpenCascade.js metrics wrapper.
 *
 * @param module - Initialized OpenCascade.js module with GeoSpec mesh metrics.
 * @param options - Triangle soups and sampling settings.
 * @returns Native Chamfer distance statistics.
 */
const analyzeOpenCascadeChamferDistance = (
  module: GeoSpecOpenCascadeMeshModule,
  options: GeoSpecNativeChamferDistanceOptions,
): MeshDistanceStats => {
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
};

/**
 * Create the canonical GeoSpec mesh backend from an OpenCascade.js build that
 * includes GeoSpec's mesh metrics wrapper.
 *
 * @param module - Initialized OpenCascade.js module.
 * @returns Owning mesh backend for production matchers.
 * @public
 */
export const createOpenCascadeMeshBackend = (module: GeoSpecOpenCascadeMeshModule): GeoSpecMeshBackend => {
  return {
    analyzeChamferDistance(options) {
      return analyzeOpenCascadeChamferDistance(module, options);
    },
  };
};

/**
 * Resolve the bundled native/WASM GeoSpec mesh backend.
 *
 * @returns Initialized backend, or `undefined` when the native bundle is unavailable.
 * @public
 */
export const resolveDefaultGeoSpecMeshBackend = async (): Promise<GeoSpecMeshBackend | undefined> => {
  try {
    return createOpenCascadeMeshBackend((await ensureOpenCascadeModule()) as GeoSpecOpenCascadeMeshModule);
  } catch {
    return undefined;
  }
};
