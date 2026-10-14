import type { CapMultiPolygon, SectionCapDiagnostic } from '#graphics/three/utils/section-cap-polygon-types.js';
import type {
  SectionCapBooleanDebugSink,
  SectionCapBooleanOperation,
} from '#graphics/three/utils/section-cap-performance-debug.js';

/**
 * The polygons produced by a section cap boolean operation, with any diagnostics it raised.
 *
 * @public
 */
export type SectionCapBooleanResult = Readonly<{
  multiPolygon: CapMultiPolygon;
  diagnostics: SectionCapDiagnostic[];
}>;

/**
 * Identifies the polygon boolean backend in use, its version and target, and whether it replaced a backend that failed
 * to start.
 *
 * @public
 */
export type CapPolygonBooleanBackendInfo = Readonly<{
  name: 'clipper2-wasm' | 'clipper2-ts' | 'polygon-clipping';
  version: string;
  target: 'wasm' | 'js';
  fallbackFrom?: 'clipper2-wasm' | 'clipper2-ts' | 'polygon-clipping';
  /** Milliseconds spent initializing the backend. */
  initializationTime?: number;
  initError?: string;
}>;

/**
 * A polygon boolean engine that section caps use for intersection, union and difference.
 *
 * @public
 */
export type CapPolygonBooleanBackend = Readonly<{
  info: CapPolygonBooleanBackendInfo;
  intersection(first: CapMultiPolygon, second: CapMultiPolygon): SectionCapBooleanResult;
  union(polygons: readonly CapMultiPolygon[]): SectionCapBooleanResult;
  difference(source: CapMultiPolygon, subtractors: readonly CapMultiPolygon[]): SectionCapBooleanResult;
  dispose(): void;
}>;

/**
 * The section cap boolean operations over a backend, each optionally timed through a debug sink.
 *
 * @public
 */
export type SectionCapBooleanOperations = Readonly<{
  info: CapPolygonBooleanBackendInfo;
  intersectCapPolygons(
    first: CapMultiPolygon,
    second: CapMultiPolygon,
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult;
  unionCapPolygons(
    polygons: readonly CapMultiPolygon[],
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult;
  differenceCapPolygon(
    source: CapMultiPolygon,
    subtractors: readonly CapMultiPolygon[],
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult;
}>;

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const runBooleanOperation = (
  operation: SectionCapBooleanOperation,
  debugSink: SectionCapBooleanDebugSink | undefined,
  callback: () => SectionCapBooleanResult,
): SectionCapBooleanResult => {
  const startedAt = debugSink ? now() : 0;
  try {
    return callback();
  } finally {
    debugSink?.recordBooleanOperation(operation, now() - startedAt);
  }
};

/**
 * Wrap a polygon boolean backend in section cap operations that record each call's duration when given a debug sink.
 *
 * @param backend - The engine that performs the boolean operations.
 * @returns Intersection, union and difference operations bound to `backend`.
 * @public
 */
export const createSectionCapBooleanOperations = (backend: CapPolygonBooleanBackend): SectionCapBooleanOperations => ({
  info: backend.info,
  intersectCapPolygons: (
    first: CapMultiPolygon,
    second: CapMultiPolygon,
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult =>
    runBooleanOperation('intersection', debugSink, () => backend.intersection(first, second)),
  unionCapPolygons: (
    polygons: readonly CapMultiPolygon[],
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult => runBooleanOperation('union', debugSink, () => backend.union(polygons)),
  differenceCapPolygon: (
    source: CapMultiPolygon,
    subtractors: readonly CapMultiPolygon[],
    debugSink?: SectionCapBooleanDebugSink,
  ): SectionCapBooleanResult =>
    runBooleanOperation('difference', debugSink, () => backend.difference(source, subtractors)),
});

/**
 * Build an empty boolean result that reports a failed polygon boolean operation as a diagnostic.
 *
 * @param operation - The boolean operation that failed.
 * @param error - The error it threw.
 * @returns An empty result carrying a `polygon-boolean-error` diagnostic.
 * @public
 */
export const sectionCapPolygonBooleanError = (
  operation: SectionCapBooleanOperation,
  error: unknown,
): SectionCapBooleanResult => ({
  multiPolygon: [],
  diagnostics: [
    {
      code: 'polygon-boolean-error',
      message: error instanceof Error ? error.message : `Unknown ${operation} polygon boolean failure.`,
    },
  ],
});
