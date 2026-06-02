import type { GeometryDiagnostic, MeshTriangle, Vec3 } from '#mesh/types.js';
import type { GeoSpecNativeMeshAnalyzer, GeoSpecNativeTriangleSoup } from '#mesh/native.js';

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
  nativeAnalyzer?: GeoSpecNativeMeshAnalyzer;
  maxDistanceSamples?: number;
  maxNaiveTrianglePairs?: number;
  seed?: number;
};

/**
 * Typed outcome for mesh distance analysis.
 *
 * @public
 */
export type AnalyzeChamferDistanceResult =
  | { success: true; stats: MeshDistanceStats; diagnostics: GeometryDiagnostic[] }
  | { success: false; diagnostics: GeometryDiagnostic[] };

type MutableVec3 = [number, number, number];

const subtract = (a: Vec3, b: Vec3): MutableVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): MutableVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, value: number): MutableVec3 => [a[0] * value, a[1] * value, a[2] * value];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distanceSquared = (a: Vec3, b: Vec3): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

const closestPointOnTriangle = (point: Vec3, triangle: MeshTriangle): MutableVec3 => {
  const ab = subtract(triangle.b, triangle.a);
  const ac = subtract(triangle.c, triangle.a);
  const ap = subtract(point, triangle.a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return [...triangle.a];
  }

  const bp = subtract(point, triangle.b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return [...triangle.b];
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return add(triangle.a, scale(ab, d1 / (d1 - d3)));
  }

  const cp = subtract(point, triangle.c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return [...triangle.c];
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return add(triangle.a, scale(ac, d2 / (d2 - d6)));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bc = subtract(triangle.c, triangle.b);
    return add(triangle.b, scale(bc, (d4 - d3) / (d4 - d3 + (d5 - d6))));
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return add(triangle.a, add(scale(ab, v), scale(ac, w)));
};

const distanceToTriangles = (point: Vec3, triangles: readonly MeshTriangle[]): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const triangle of triangles) {
    best = Math.min(best, distanceSquared(point, closestPointOnTriangle(point, triangle)));
  }
  return Math.sqrt(best);
};

const samplePoints = (triangles: readonly MeshTriangle[], sampleLimit: number): Vec3[] => {
  const points: Vec3[] = [];
  for (const triangle of triangles) {
    points.push(triangle.a, triangle.b, triangle.c, triangle.center);
    if (points.length >= sampleLimit) {
      break;
    }
  }
  return points.slice(0, sampleLimit);
};

const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index]!;
};

const summarizeDistances = (values: readonly number[]): MeshDistanceDistribution => {
  if (values.length === 0) {
    return {
      min: Number.POSITIVE_INFINITY,
      mean: Number.POSITIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
      p50: Number.POSITIVE_INFINITY,
      p95: Number.POSITIVE_INFINITY,
      p99: Number.POSITIVE_INFINITY,
      rms: Number.POSITIVE_INFINITY,
      samples: 0,
    };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let sum = 0;
  let sumSquares = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    sumSquares += value * value;
  }

  return {
    min,
    mean: sum / values.length,
    max,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    rms: Math.sqrt(sumSquares / values.length),
    samples: values.length,
  };
};

const defaultDistanceSamples = 10_000;
const defaultMaxDistanceSamples = 100_000;
const defaultMaxNaiveTrianglePairs = 20_000_000;

const failBudget = (details: Record<string, unknown>): AnalyzeChamferDistanceResult => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_DISTANCE_BUDGET_EXCEEDED',
      severity: 'error',
      message: 'Chamfer distance analysis exceeded the configured bounded algorithm budget.',
      suggestion:
        'Use the native GeoSpec OpenCascade C++ metrics analyzer for large meshes, lower samples only when the test precision budget allows it, or narrow the comparison target to the feature under test.',
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
        'Check that the OpenCascade.js build includes GeoSpecMeshMetrics and that the input mesh buffers are valid.',
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

/**
 * Compute bidirectional Chamfer-style mesh distance using deterministic
 * vertex/centroid samples and exact point-to-triangle distances.
 *
 * Uses a native analyzer when one is provided. The JavaScript fallback is
 * deliberately bounded so large triangle soups fail with a diagnostic instead
 * of running an unbounded `samples * triangles` loop.
 *
 * @param options - Meshes, sample count, optional native analyzer, and budgets.
 * @returns Typed analysis outcome.
 * @public
 */
export const analyzeChamferDistance = (options: AnalyzeChamferDistanceOptions): AnalyzeChamferDistanceResult => {
  const {
    actual,
    expected,
    maxDistanceSamples = defaultMaxDistanceSamples,
    samples = defaultDistanceSamples,
  } = options;
  const sampleLimit = samples;
  if (actual.length === 0 || expected.length === 0 || sampleLimit <= 0) {
    return {
      success: true,
      stats: {
        min: Number.POSITIVE_INFINITY,
        mean: Number.POSITIVE_INFINITY,
        max: Number.POSITIVE_INFINITY,
        p50: Number.POSITIVE_INFINITY,
        p95: Number.POSITIVE_INFINITY,
        p99: Number.POSITIVE_INFINITY,
        rms: Number.POSITIVE_INFINITY,
        samples: 0,
        algorithm: 'empty',
        seed: options.seed,
      },
      diagnostics: [],
    };
  }
  if (sampleLimit > maxDistanceSamples) {
    return failBudget({
      requestedSamples: sampleLimit,
      maxDistanceSamples,
      actualTriangles: actual.length,
      expectedTriangles: expected.length,
    });
  }

  if (options.nativeAnalyzer?.analyzeChamferDistance) {
    try {
      return {
        success: true,
        stats: options.nativeAnalyzer.analyzeChamferDistance({
          actual: toNativeTriangleSoup(actual),
          expected: toNativeTriangleSoup(expected),
          samples: sampleLimit,
          seed: options.seed,
        }),
        diagnostics: [],
      };
    } catch (error) {
      return failNative(error);
    }
  }

  const perDirectionLimit = Math.max(1, Math.floor(sampleLimit / 2));
  const actualSamples = samplePoints(actual, perDirectionLimit);
  const expectedSamples = samplePoints(expected, perDirectionLimit);
  const estimatedTrianglePairs = actualSamples.length * expected.length + expectedSamples.length * actual.length;
  const maxNaiveTrianglePairs = options.maxNaiveTrianglePairs ?? defaultMaxNaiveTrianglePairs;
  if (estimatedTrianglePairs > maxNaiveTrianglePairs) {
    return failBudget({
      requestedSamples: sampleLimit,
      actualSamples: actualSamples.length,
      expectedSamples: expectedSamples.length,
      actualTriangles: actual.length,
      expectedTriangles: expected.length,
      estimatedTrianglePairs,
      maxNaiveTrianglePairs,
      nativeAvailable: false,
    });
  }

  const actualToExpectedDistances = actualSamples.map((point) => distanceToTriangles(point, expected));
  const expectedToActualDistances = expectedSamples.map((point) => distanceToTriangles(point, actual));
  const distances = [...actualToExpectedDistances, ...expectedToActualDistances];
  const symmetric = summarizeDistances(distances);

  return {
    success: true,
    stats: {
      ...symmetric,
      algorithm: 'javascript-bounded-point-to-triangle',
      seed: options.seed,
      directedActualToExpected: summarizeDistances(actualToExpectedDistances),
      directedExpectedToActual: summarizeDistances(expectedToActualDistances),
    },
    diagnostics: [],
  };
};
