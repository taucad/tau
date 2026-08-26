import type {
  CapMultiPolygon,
  SectionCapDiagnostic,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';
import type {
  SectionCapBooleanDebugSink,
  SectionCapBooleanOperation,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';

export type SectionCapBooleanResult = Readonly<{
  multiPolygon: CapMultiPolygon;
  diagnostics: SectionCapDiagnostic[];
}>;

export type CapPolygonBooleanBackendInfo = Readonly<{
  name: 'clipper2-wasm' | 'clipper2-ts' | 'polygon-clipping';
  version: string;
  target: 'wasm' | 'js';
  fallbackFrom?: 'clipper2-wasm' | 'clipper2-ts' | 'polygon-clipping';
  /** Milliseconds spent initializing the backend. */
  initializationTime?: number;
  initError?: string;
}>;

export type CapPolygonBooleanBackend = Readonly<{
  info: CapPolygonBooleanBackendInfo;
  intersection(first: CapMultiPolygon, second: CapMultiPolygon): SectionCapBooleanResult;
  union(polygons: readonly CapMultiPolygon[]): SectionCapBooleanResult;
  difference(source: CapMultiPolygon, subtractors: readonly CapMultiPolygon[]): SectionCapBooleanResult;
  dispose(): void;
}>;

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
