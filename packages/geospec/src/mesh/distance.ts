import type { GeometryDiagnostic, MeshTriangle } from '#mesh/types.js';
import { resolveDefaultGeoSpecMeshBackend } from '#mesh/native.js';
import type { GeoSpecMeshBackend, GeoSpecNativeTriangleSoup } from '#mesh/native.js';

/**
 * Result of comparing two mesh subjects using deterministic point-to-surface
 * samples.
 *
 * @public
 */
export type MeshDistanceStats = {
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  samples: number;
  algorithm?: string;
  seed?: number;
  directedActualToExpected?: MeshDistanceDistribution;
  directedExpectedToActual?: MeshDistanceDistribution;
};

/**
 * Directional surface-distance distribution.
 *
 * @public
 */
export type MeshDistanceDistribution = {
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  samples: number;
};

/**
 * Options for deterministic Chamfer-style mesh distance analysis.
 *
 * @public
 */
export type AnalyzeChamferDistanceOptions = {
  actual: readonly MeshTriangle[];
  expected: readonly MeshTriangle[];
  samples?: number;
  seed?: number;
  backend?: GeoSpecMeshBackend;
  maxDistanceSamples?: number;
  resolveDefaultBackend?: boolean;
};

/**
 * Typed outcome for mesh distance analysis.
 *
 * @public
 */
export type AnalyzeChamferDistanceResult =
  | { success: true; stats: MeshDistanceStats; diagnostics: GeometryDiagnostic[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

const defaultDistanceSamples = 10_000;
const defaultMaxDistanceSamples = 100_000;

const emptyDistanceStats = (seed: number | undefined): MeshDistanceStats => ({
  min: Number.POSITIVE_INFINITY,
  mean: Number.POSITIVE_INFINITY,
  max: Number.POSITIVE_INFINITY,
  p50: Number.POSITIVE_INFINITY,
  p95: Number.POSITIVE_INFINITY,
  p99: Number.POSITIVE_INFINITY,
  rms: Number.POSITIVE_INFINITY,
  samples: 0,
  algorithm: 'empty',
  seed,
});

const failBudget = (details: Record<string, unknown>): AnalyzeChamferDistanceResult => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_DISTANCE_BUDGET_EXCEEDED',
      severity: 'error',
      message: 'Chamfer distance analysis exceeded the configured native sampling budget.',
      suggestion:
        'Reduce the requested samples only when the test precision budget allows it, or split the comparison target to the feature under test.',
      details,
    },
  ],
});

const failNativeUnavailable = (details: Record<string, unknown>): AnalyzeChamferDistanceResult => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_NATIVE_DISTANCE_UNAVAILABLE',
      severity: 'error',
      message: 'Chamfer distance analysis requires the canonical GeoSpec native/WASM mesh backend.',
      suggestion:
        'Use the bundled geospec/native/opencascade/single build or provide a GeoSpecMeshBackend; GeoSpec does not run a JavaScript triangle-distance fallback in production.',
      details,
    },
  ],
});

const failNative = (error: unknown): AnalyzeChamferDistanceResult => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_NATIVE_DISTANCE_FAILED',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      suggestion:
        'Check that the native/WASM GeoSpec mesh backend was initialized and that the input mesh buffers are valid.',
      details: error,
    },
  ],
});

const toNativeTriangleSoup = (triangles: readonly MeshTriangle[]): GeoSpecNativeTriangleSoup => {
  const buffer = new Float64Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    buffer[offset++] = triangle.a[0];
    buffer[offset++] = triangle.a[1];
    buffer[offset++] = triangle.a[2];
    buffer[offset++] = triangle.b[0];
    buffer[offset++] = triangle.b[1];
    buffer[offset++] = triangle.b[2];
    buffer[offset++] = triangle.c[0];
    buffer[offset++] = triangle.c[1];
    buffer[offset++] = triangle.c[2];
  }
  return { triangles: buffer, triangleCount: triangles.length };
};

const resolveBackend = async (options: AnalyzeChamferDistanceOptions): Promise<GeoSpecMeshBackend | undefined> =>
  options.backend ?? (options.resolveDefaultBackend === false ? undefined : await resolveDefaultGeoSpecMeshBackend());

/**
 * Compute bidirectional Chamfer-style mesh distance through the canonical
 * native/WASM backend.
 *
 * GeoSpec intentionally does not run a production JavaScript triangle-distance
 * fallback. If native evidence is unavailable, callers receive a structured
 * diagnostic so the test infrastructure can be fixed rather than silently
 * switching algorithms.
 *
 * @param options - Meshes, sample count, optional backend, and budgets.
 * @returns Typed analysis outcome.
 * @public
 */
export const analyzeChamferDistance = async (
  options: AnalyzeChamferDistanceOptions,
): Promise<AnalyzeChamferDistanceResult> => {
  const {
    actual,
    expected,
    maxDistanceSamples = defaultMaxDistanceSamples,
    samples = defaultDistanceSamples,
  } = options;
  if (actual.length === 0 || expected.length === 0 || samples <= 0) {
    return { success: true, stats: emptyDistanceStats(options.seed), diagnostics: [] };
  }
  if (samples > maxDistanceSamples) {
    return failBudget({
      requestedSamples: samples,
      maxDistanceSamples,
      actualTriangles: actual.length,
      expectedTriangles: expected.length,
    });
  }

  const backend = await resolveBackend(options);
  if (!backend) {
    return failNativeUnavailable({
      requestedSamples: samples,
      actualTriangles: actual.length,
      expectedTriangles: expected.length,
    });
  }

  try {
    return {
      success: true,
      stats: backend.analyzeChamferDistance({
        actual: toNativeTriangleSoup(actual),
        expected: toNativeTriangleSoup(expected),
        samples,
        seed: options.seed,
      }),
      diagnostics: [],
    };
  } catch (error) {
    return failNative(error);
  }
};
