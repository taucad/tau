#!/usr/bin/env tsx
import { loadModel } from '../../src/model/load-model.js';
import type { GeometrySubject } from '../../src/mesh/types.js';
import {
  containedBoxFixture,
  disjointBoxesFixture,
  highTriangleCylindersFixture,
  manyPartSparseGridFixture,
  manifoldVolumeCandidate,
  openBoundaryFixture,
  opencascadeBaselineCandidate,
  overlappingBoxesFixture,
  tangentBoxesFixture,
  threeMeshBvhRelationCandidate,
  vertexContactBoxesFixture,
} from './index.js';
import type { OverlapBackendCandidate, OverlapExperimentResult, OverlapFixture } from './types.js';

type CliOptions = {
  fixture: string;
  backend: string;
  iterations: number;
  tolerance: number;
  projectPath?: string;
  file?: string;
};

type BenchmarkSample = {
  iteration: number;
  result: OverlapExperimentResult;
};

const defaultSparseGridFixture = manyPartSparseGridFixture();

const fixtures: Record<string, OverlapFixture> = {
  [disjointBoxesFixture.id]: disjointBoxesFixture,
  [tangentBoxesFixture.id]: tangentBoxesFixture,
  [overlappingBoxesFixture.id]: overlappingBoxesFixture,
  [containedBoxFixture.id]: containedBoxFixture,
  [vertexContactBoxesFixture.id]: vertexContactBoxesFixture,
  [defaultSparseGridFixture.id]: defaultSparseGridFixture,
  [highTriangleCylindersFixture.id]: highTriangleCylindersFixture,
  [openBoundaryFixture.id]: openBoundaryFixture,
};

const backends: Record<string, OverlapBackendCandidate> = {
  bvh: threeMeshBvhRelationCandidate,
  manifold: manifoldVolumeCandidate,
  occt: opencascadeBaselineCandidate,
};

const readFlag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const parseOptions = (): CliOptions => {
  const args = process.argv.slice(2);
  return {
    fixture: readFlag(args, '--fixture') ?? 'overlapping-boxes',
    backend: readFlag(args, '--backend') ?? 'bvh,manifold',
    iterations: Number(readFlag(args, '--iterations') ?? 10),
    tolerance: Number(readFlag(args, '--tolerance') ?? 0.001),
    projectPath: readFlag(args, '--project'),
    file: readFlag(args, '--file'),
  };
};

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
};

const selectedBackends = (value: string): OverlapBackendCandidate[] => {
  const names = value === 'all' ? Object.keys(backends) : value.split(',').map((name) => name.trim());
  return names.map((name) => {
    const backend = backends[name];
    if (!backend) {
      throw new Error(`Unknown backend '${name}'. Available: ${Object.keys(backends).join(', ')}, all.`);
    }
    return backend;
  });
};

const loadSubject = async (
  options: CliOptions,
): Promise<{ subject: GeometrySubject; loadMs: number; source: string }> => {
  const started = performance.now();
  if (options.projectPath || options.file) {
    if (!options.projectPath || !options.file) {
      throw new Error('Use --project and --file together for project-backed benchmarks.');
    }
    const subject = await loadModel({ projectPath: options.projectPath, file: options.file });
    return { subject, loadMs: performance.now() - started, source: `${options.projectPath}/${options.file}` };
  }
  const fixture = fixtures[options.fixture];
  if (!fixture) {
    throw new Error(`Unknown fixture '${options.fixture}'. Available: ${Object.keys(fixtures).join(', ')}.`);
  }
  const subject = await fixture.loadSubject();
  return { subject, loadMs: performance.now() - started, source: fixture.id };
};

const runBackend = async (
  backend: OverlapBackendCandidate,
  subject: GeometrySubject,
  options: CliOptions,
): Promise<BenchmarkSample[]> => {
  const samples: BenchmarkSample[] = [];
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const prepared = await backend.prepare(subject);
    try {
      samples.push({
        iteration,
        result: await backend.analyze(prepared, { tolerance: options.tolerance }),
      });
    } finally {
      await backend.dispose?.(prepared);
    }
  }
  return samples;
};

const summarize = (samples: readonly BenchmarkSample[]) => {
  const totals = samples.map((sample) => sample.result.timings.totalMs);
  const postLoad = samples.map((sample) => sample.result.timings.analyzeMs + sample.result.timings.prepareMs);
  const last = samples.at(-1)?.result;
  return {
    medianTotalMs: percentile(totals, 50),
    p95TotalMs: percentile(totals, 95),
    medianPostLoadMs: percentile(postLoad, 50),
    p95PostLoadMs: percentile(postLoad, 95),
    last,
  };
};

const main = async (): Promise<void> => {
  const options = parseOptions();
  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error('--iterations must be a positive number.');
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error('--tolerance must be a non-negative number.');
  }
  const loaded = await loadSubject(options);
  const backendResults = [];
  for (const backend of selectedBackends(options.backend)) {
    const samples = await runBackend(backend, loaded.subject, options);
    backendResults.push({
      backend: backend.id,
      description: backend.description,
      samples,
      summary: summarize(samples),
    });
  }

  console.log(
    JSON.stringify(
      {
        source: loaded.source,
        loadMs: loaded.loadMs,
        fixture: options.fixture,
        iterations: options.iterations,
        tolerance: options.tolerance,
        results: backendResults,
      },
      null,
      2,
    ),
  );
};

await main();
