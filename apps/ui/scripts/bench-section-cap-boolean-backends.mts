/**
 * Benchmarks section-cap polygon boolean backends against locally captured slice data.
 *
 * Inputs:
 * - `TAU_SECTION_CAP_BENCH_CACHE_DIR`: directory containing one or more JSON fixtures.
 * - `TAU_SECTION_CAP_BENCH_GLB`: optional local model path recorded as metadata only.
 *
 * Fixture JSON may be either `{ "slices": [...] }` or a single slice object. Each slice
 * contains `sources`, and each source contains `sourceKey`, `ownerKey`, and
 * `multiPolygon`.
 */
import os from 'node:os';
import process from 'node:process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon as PolygonClippingMultiPolygon, Pair as PolygonClippingPair } from 'polygon-clipping';
import { createClipper2TsBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.js';
import { createClipper2WasmBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-wasm.js';
import {
  createSectionCapBooleanOperations,
  sectionCapPolygonBooleanError,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import {
  boundsForCapMultiPolygon,
  measureCapMultiPolygonArea,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import { classifySectionCapOverlaps } from '#components/geometry/graphics/three/utils/section-cap-overlap.js';
import { buildSectionCapRenderParts } from '#components/geometry/graphics/three/utils/section-cap-render-parts.js';
import { createSectionCapBooleanOperationStats } from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import type {
  CapPolygonBooleanBackend,
  SectionCapBooleanResult,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type { SectionCapPolygon } from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type {
  CapMultiPolygon,
  CapPoint2,
  CapRing,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

type BenchmarkFixtureSource = Readonly<{
  sourceKey: string;
  ownerKey?: string;
  geometryKey?: string;
  multiPolygon: CapMultiPolygon;
  tintHex?: number;
  trueCut?: boolean;
}>;

type BenchmarkSlice = Readonly<{
  sliceKey: string;
  sources: readonly BenchmarkFixtureSource[];
}>;

type BenchmarkFixtureSlice = Readonly<{
  sliceKey?: string;
  sources: readonly BenchmarkFixtureSource[];
}>;

type BenchmarkFixtureFile = Readonly<{
  fixtureName?: string;
  slices?: readonly BenchmarkFixtureSlice[];
  sliceKey?: string;
  sources?: readonly BenchmarkFixtureSource[];
}>;

type BackendTimingSummary = Readonly<{
  backend: string;
  version: string;
  target: string;
  fallbackFrom?: string;
  initializationTime?: number;
  iterations: number;
  timings: {
    p50: number;
    p95: number;
    max: number;
  };
  operationCounts: ReturnType<typeof createSectionCapBooleanOperationStats>;
  positiveAreaPairCount: number;
  renderedOverlapArea: number;
  diagnosticsCount: number;
}>;

type BenchmarkReport = Readonly<{
  packages: Record<string, string>;
  host: {
    platform: string;
    arch: string;
    cpus: number;
    node: string;
  };
  input: {
    cacheDirectory: string;
    glb?: string;
  };
  selectedSlice: {
    sliceKey: string;
    sourceCount: number;
    sourcePairCount: number;
    pointCount: number;
  };
  summaries: readonly BackendTimingSummary[];
  parity: {
    referenceBackend: string;
    maxRenderedOverlapAreaDelta: number;
    failures: string[];
  };
  styleSweep: {
    topologyWorkerRequestCount: number;
  };
}>;

const defaultIterations = 15;
const polygonClippingVersion = '0.15.7';

type PolygonClippingModule = Readonly<{
  intersection(first: PolygonClippingMultiPolygon, ...rest: PolygonClippingMultiPolygon[]): PolygonClippingMultiPolygon;
  union(first: PolygonClippingMultiPolygon, ...rest: PolygonClippingMultiPolygon[]): PolygonClippingMultiPolygon;
  difference(first: PolygonClippingMultiPolygon, ...rest: PolygonClippingMultiPolygon[]): PolygonClippingMultiPolygon;
}>;

const polygonClippingModule = polygonClipping as unknown as PolygonClippingModule;

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const isSamePoint = (a: CapPoint2, b: CapPoint2): boolean =>
  Math.abs(a[0] - b[0]) <= 1e-10 && Math.abs(a[1] - b[1]) <= 1e-10;

const stripClosingPoint = (ring: CapRing): CapRing => {
  if (ring.length > 1 && isSamePoint(ring[0]!, ring.at(-1)!)) {
    return ring.slice(0, -1);
  }

  return ring;
};

const closeRing = (ring: readonly CapPoint2[]): PolygonClippingPair[] => {
  const points = ring.map(([x, y]) => [x, y] satisfies PolygonClippingPair);
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && !isSamePoint(first, last)) {
    points.push([first[0], first[1]]);
  }

  return points;
};

const toPolygonClippingInput = (multiPolygon: CapMultiPolygon): PolygonClippingMultiPolygon =>
  multiPolygon
    .map((polygon) => polygon.map((ring) => closeRing(ring)).filter((ring) => ring.length >= 4))
    .filter((polygon) => polygon.length > 0);

const fromPolygonClippingOutput = (multiPolygon: PolygonClippingMultiPolygon): CapMultiPolygon =>
  multiPolygon
    .map((polygon) =>
      polygon
        .map((ring) =>
          stripClosingPoint(
            ring
              .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
              .map(([x, y]) => [x, y] satisfies CapPoint2),
          ),
        )
        .filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length > 0);

const createPolygonClippingBenchmarkBackend = (): CapPolygonBooleanBackend => {
  const { difference, intersection, union } = polygonClippingModule;
  const run = (
    operation: 'intersection' | 'union' | 'difference',
    inputs: readonly CapMultiPolygon[],
  ): SectionCapBooleanResult => {
    try {
      const prepared = inputs.map((input) => toPolygonClippingInput(input));
      if (operation !== 'difference' && prepared.some((input) => input.length === 0)) {
        return { multiPolygon: [], diagnostics: [] };
      }

      const [first, ...rest] = prepared;
      if (!first || first.length === 0) {
        return { multiPolygon: [], diagnostics: [] };
      }

      if (operation === 'intersection') {
        return { multiPolygon: fromPolygonClippingOutput(intersection(first, ...rest)), diagnostics: [] };
      }

      if (operation === 'union') {
        return { multiPolygon: fromPolygonClippingOutput(union(first, ...rest)), diagnostics: [] };
      }

      return { multiPolygon: fromPolygonClippingOutput(difference(first, ...rest)), diagnostics: [] };
    } catch (error) {
      return sectionCapPolygonBooleanError(operation, error);
    }
  };

  return {
    info: {
      name: 'polygon-clipping',
      version: polygonClippingVersion,
      target: 'js',
    },
    intersection: (first, second) => run('intersection', [first, second]),
    union: (polygons) => run('union', polygons),
    difference: (source, subtractors) => run('difference', [source, ...subtractors]),
    dispose: () => undefined,
  };
};

const sourcePointCount = (source: BenchmarkFixtureSource): number => {
  let pointCount = 0;
  for (const polygon of source.multiPolygon) {
    for (const ring of polygon) {
      pointCount += ring.length;
    }
  }

  return pointCount;
};

const slicePointCount = (slice: BenchmarkSlice): number => {
  let pointCount = 0;
  for (const source of slice.sources) {
    pointCount += sourcePointCount(source);
  }

  return pointCount;
};

const toRegion = (source: BenchmarkFixtureSource): SectionCapPolygon => ({
  sourceKey: source.sourceKey,
  ownerKey: source.ownerKey ?? source.sourceKey,
  geometryKey: source.geometryKey ?? source.sourceKey,
  multiPolygon: source.multiPolygon,
  bbox: boundsForCapMultiPolygon(source.multiPolygon),
  area: measureCapMultiPolygonArea(source.multiPolygon),
  trueCut: source.trueCut ?? true,
  diagnostics: [],
});

const finiteStats = (values: readonly number[]): { p50: number; p95: number; max: number } => {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((first, second) => first - second);
  if (sorted.length === 0) {
    return { p50: 0, p95: 0, max: 0 };
  }

  const atPercentile = (ratio: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
  return {
    p50: atPercentile(0.5),
    p95: atPercentile(0.95),
    max: Math.max(...sorted),
  };
};

const measureBackend = (
  backend: CapPolygonBooleanBackend,
  slice: BenchmarkSlice,
  iterations: number,
): BackendTimingSummary => {
  const operations = createSectionCapBooleanOperations(backend);
  const timings: number[] = [];
  let latestPositiveAreaPairCount = 0;
  let latestRenderedOverlapArea = 0;
  let latestDiagnosticsCount = 0;
  const operationCounts = createSectionCapBooleanOperationStats();

  for (let iteration = 0; iteration < iterations; iteration++) {
    const iterationStats = createSectionCapBooleanOperationStats();
    const debugSink = {
      recordBooleanOperation(operation: keyof typeof iterationStats, elapsed: number): void {
        iterationStats[operation].count++;
        iterationStats[operation].total += Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
      },
    };
    const startedAt = now();
    const regions = slice.sources.map((source) => toRegion(source));
    const overlap = classifySectionCapOverlaps(regions, { booleanOperations: operations, debugSink });
    const renderParts = buildSectionCapRenderParts({
      sources: slice.sources.map((source) => ({
        sourceKey: source.sourceKey,
        sourcePolygon: source.multiPolygon,
        overlapPolygon: overlap.overlapBySourceKey.get(source.sourceKey),
        visibleOverlapPolygon: overlap.visibleOverlapBySourceKey.get(source.sourceKey),
        tintHex: source.tintHex ?? 0x88_99_aa,
      })),
      stripeFrequency: 8,
      stripeWidth: 0.4,
      booleanOperations: operations,
      debugSink,
    });
    timings.push(now() - startedAt);
    latestPositiveAreaPairCount = overlap.positiveAreaPairCount;
    latestRenderedOverlapArea = renderParts.renderedOverlapArea;
    latestDiagnosticsCount = overlap.diagnostics.length + renderParts.diagnostics.length;

    for (const operation of ['intersection', 'union', 'difference'] as const) {
      operationCounts[operation].count += iterationStats[operation].count;
      operationCounts[operation].total += iterationStats[operation].total;
    }
  }

  return {
    backend: backend.info.name,
    version: backend.info.version,
    target: backend.info.target,
    fallbackFrom: backend.info.fallbackFrom,
    initializationTime: backend.info.initializationTime,
    iterations,
    timings: finiteStats(timings),
    operationCounts,
    positiveAreaPairCount: latestPositiveAreaPairCount,
    renderedOverlapArea: latestRenderedOverlapArea,
    diagnosticsCount: latestDiagnosticsCount,
  };
};

const parseFixtureFile = (contents: string, filename: string): BenchmarkSlice[] => {
  const parsed = JSON.parse(contents) as BenchmarkFixtureFile;
  if (parsed.slices) {
    return parsed.slices.map((slice, index) => ({
      sliceKey: slice.sliceKey ?? `${filename}#${index}`,
      sources: slice.sources,
    }));
  }

  if (parsed.sources) {
    return [
      {
        sliceKey: parsed.sliceKey ?? filename,
        sources: parsed.sources,
      },
    ];
  }

  throw new Error(`${filename} did not contain a section-cap benchmark slice.`);
};

const loadSlicesFromCacheDirectory = async (cacheDirectory: string): Promise<BenchmarkSlice[]> => {
  const directoryEntries = await readdir(cacheDirectory);
  const sliceGroups = await Promise.all(
    directoryEntries.map(async (entry): Promise<BenchmarkSlice[]> => {
      if (!entry.endsWith('.json')) {
        return [];
      }

      const path = join(cacheDirectory, entry);
      const pathStat = await stat(path);
      if (!pathStat.isFile()) {
        return [];
      }

      return parseFixtureFile(await readFile(path, 'utf8'), entry);
    }),
  );

  return sliceGroups.flat();
};

const selectHeaviestSlice = (slices: readonly BenchmarkSlice[]): BenchmarkSlice => {
  const [first] = slices;
  if (!first) {
    throw new Error('No section-cap benchmark slices were found in TAU_SECTION_CAP_BENCH_CACHE_DIR.');
  }

  let best = first;
  let bestWeight = slicePointCount(first);
  for (const candidate of slices.slice(1)) {
    const candidateWeight = slicePointCount(candidate);
    if (candidateWeight > bestWeight) {
      best = candidate;
      bestWeight = candidateWeight;
    }
  }

  return best;
};

export const buildSectionCapBooleanBenchmarkReport = async (
  options: Readonly<{
    cacheDirectory: string;
    glb?: string;
    iterations?: number;
  }>,
): Promise<BenchmarkReport> => {
  const slices = await loadSlicesFromCacheDirectory(options.cacheDirectory);
  const slice = selectHeaviestSlice(slices);
  const iterations = Math.max(1, options.iterations ?? defaultIterations);
  const backends = [
    createPolygonClippingBenchmarkBackend(),
    createClipper2TsBackend(),
    await createClipper2WasmBackend(),
  ];

  try {
    const summaries = backends.map((backend) => measureBackend(backend, slice, iterations));
    const reference = summaries.find((summary) => summary.backend === 'clipper2-wasm') ?? summaries[0]!;
    const parityFailures: string[] = [];
    let maxRenderedOverlapAreaDelta = 0;
    for (const summary of summaries) {
      const delta = Math.abs(summary.renderedOverlapArea - reference.renderedOverlapArea);
      maxRenderedOverlapAreaDelta = Math.max(maxRenderedOverlapAreaDelta, delta);
      if (delta > 1e-6) {
        parityFailures.push(`${summary.backend}: rendered overlap area delta ${delta}`);
      }
    }

    return {
      packages: {
        'polygon-clipping': polygonClippingVersion,
        'clipper2-ts': '2.0.1-17',
        'clipper2-wasm': '0.4.0',
      },
      host: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        node: process.version,
      },
      input: {
        cacheDirectory: options.cacheDirectory,
        glb: options.glb,
      },
      selectedSlice: {
        sliceKey: slice.sliceKey,
        sourceCount: slice.sources.length,
        sourcePairCount: (slice.sources.length * (slice.sources.length - 1)) / 2,
        pointCount: slicePointCount(slice),
      },
      summaries,
      parity: {
        referenceBackend: reference.backend,
        maxRenderedOverlapAreaDelta,
        failures: parityFailures,
      },
      styleSweep: {
        topologyWorkerRequestCount: 0,
      },
    };
  } finally {
    for (const backend of backends) {
      backend.dispose();
    }
  }
};

const parseIterations = (raw: string | undefined): number | undefined => {
  if (!raw) {
    return undefined;
  }

  const iterations = Number.parseInt(raw, 10);
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error(`TAU_SECTION_CAP_BENCH_ITERATIONS must be a positive integer, received "${raw}".`);
  }

  return iterations;
};

const main = async (): Promise<void> => {
  const cacheDirectory = process.env['TAU_SECTION_CAP_BENCH_CACHE_DIR'];
  if (!cacheDirectory) {
    throw new Error(
      [
        'Missing TAU_SECTION_CAP_BENCH_CACHE_DIR.',
        'Capture or export local section-cap slice JSON first; large V8/planetary assets must remain outside the repo.',
        'Optional metadata: TAU_SECTION_CAP_BENCH_GLB=/absolute/path/to/model.glb.',
      ].join(' '),
    );
  }

  const report = await buildSectionCapBooleanBenchmarkReport({
    cacheDirectory,
    glb: process.env['TAU_SECTION_CAP_BENCH_GLB'],
    iterations: parseIterations(process.env['TAU_SECTION_CAP_BENCH_ITERATIONS']),
  });
  console.info(JSON.stringify(report, null, 2));
};

if (process.argv[1]?.endsWith('bench-section-cap-boolean-backends.mts')) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
