#!/usr/bin/env node

/**
 * Purpose: Run PicoGK unique-edit and steady-state soaks and report native C# pipeline performance.
 * Why: Release decisions need measured cache, JIT, mesh, memory, descriptor, and latency evidence.
 * Environment: Node 24+ on darwin-arm64 with desktop:prepare-picogk-dotnet completed.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/benchmark-native.mts [--iterations 600]
 * Exit codes: 0 when the soak, high-resolution build, and lifecycle gates pass; non-zero otherwise.
 */

/* oxlint-disable no-await-in-loop -- One warm worker intentionally serializes every edit. */
import { strictEqual } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { digestContent } from '@taucad/cache-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
import type { PicogkBuild, PicogkComputePublication, PicogkPreparedCompute } from '#picogk.protocol.js';
import { PicogkSession } from '#picogk-session.js';

type ResourceManifest = {
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
};

type WorkerStats = { readonly pid: number; readonly residentKilobytes: number; readonly descriptors: number };

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const target = `${process.platform}-${process.arch}`;
const resourceRoot = resolve(workspaceRoot, `apps/desktop/resources/picogk/${target}`);
const arguments_ = process.argv.slice(2);
const iterations =
  arguments_.length === 0 ? 600 : arguments_[0] === '--iterations' ? Number(arguments_[1]) : Number.NaN;
const sourceSaveBudget = { p50: 50, p95: 100 } as const;
const steadyStateRuns = 200;

const source = (marker: number, voxelSize = 1, radius = 12): string => `using System.Numerics;
using PicoGK;
Library.Go(${String(voxelSize)}f, () =>
{
    const int EditMarker = ${String(marker)};
    _ = EditMarker;
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, ${String(radius)}f), 0);
});
`;

const logger: RuntimeLogger = {
  log: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  custom: () => undefined,
};

const singlePublication = (result: PicogkBuild): PicogkComputePublication => {
  const publications = result.computePublications ?? [];
  if (publications.length !== 1) {
    throw new Error('Changed geometry must publish exactly one new component materialization.');
  }
  return publications[0]!;
};

const assertMaterializationHit = (result: PicogkBuild): void => {
  if (
    result.computePublications?.length !== 0 ||
    result.timings.meshConstruction !== 0 ||
    result.timings.meshExtraction !== 0
  ) {
    throw new Error('Unchanged geometry repeated component materialization.');
  }
};

const percentile = (values: readonly number[], fraction: number): number => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))]!;
};

const median = (values: readonly number[]): number => {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = (ordered.length - 1) / 2;
  return (ordered[Math.floor(middle)]! + ordered[Math.ceil(middle)]!) / 2;
};

const resourceConvergence = (values: readonly number[], resolution = 0) => {
  // A warm-up step is not a leak; one downward sample does not disprove a leak.
  // Examine the final 100 runs at the declared detection resolution. A failure
  // means nonconvergence in this observation window, not proof of a memory leak.
  const tail = values.slice(-100);
  const blockMedians = Array.from({ length: 5 }, (_, index) => median(tail.slice(index * 20, (index + 1) * 20)));
  const slopes = blockMedians.flatMap((value, index) =>
    blockMedians.slice(index + 1).map((next, offset) => (next - value) / ((offset + 1) * 20)),
  );
  const growthPerEdit = median(slopes);
  const lastBlockGrowth = blockMedians[4]! - median(tail.slice(40, 80));
  const spread = Math.max(...blockMedians) - Math.min(...blockMedians);
  return {
    blockMedians,
    growthPerEdit,
    lastBlockGrowth,
    spread,
    resolution,
    converged: !((growthPerEdit > 0 && spread > resolution) || lastBlockGrowth > resolution),
  };
};

const validateGlb = (bytes: Uint8Array<ArrayBuffer>): void => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46_54_6c_67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    throw new Error('PicoGK soak produced an invalid GLB container.');
  }
};

const countFileDescriptors = (fields: string): number =>
  fields.split('\n').filter((field) => /^f\d+$/u.test(field)).length;

const workerStats = (workspacePath: string): WorkerStats => {
  const row = execFileSync('ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf8' })
    .split('\n')
    .find((line) => line.includes('Tau.PicoGK.Worker --workspace') && line.includes(workspacePath));
  const match = row ? /^\s*(\d+)\s+(\d+)\s+/u.exec(row) : undefined;
  if (!match) {
    throw new Error('The PicoGK soak worker process was not found.');
  }
  const pid = Number(match[1]);
  const descriptors = countFileDescriptors(
    execFileSync('lsof', ['-n', '-p', String(pid), '-F', 'f'], { encoding: 'utf8' }),
  );
  return { pid, residentKilobytes: Number(match[2]), descriptors };
};

type Measure = <Value>(
  operation: () => Promise<Value>,
) => Promise<{ readonly milliseconds: number; readonly value: Value }>;
const measure: Measure = async (operation) => {
  const started = performance.now();
  const value = await operation();
  return { milliseconds: performance.now() - started, value };
};

const verifyMeasurements = (): void => {
  // The lsof output also lists cwd and mapped executable images; neither is an open file descriptor.
  strictEqual(countFileDescriptors('p42\nfcwd\nftxt\nftxt\nf0\nf1\nf10\n'), 3);
  const convergenceCases = [
    ['plateau', Array.from({ length: 200 }, (_, index) => Math.min(index, 40)), 0, true],
    ['bounded sawtooth', Array.from({ length: 200 }, (_, index) => index % 10), 0, true],
    ['interrupted growth', Array.from({ length: 200 }, (_, index) => (index === 150 ? 148 : index)), 0, false],
    ['rising sawtooth', Array.from({ length: 200 }, (_, index) => (index % 10) + Math.floor(index / 20)), 0, false],
    ['late step', Array.from({ length: 200 }, (_, index) => (index >= 180 ? 1 : 0)), 0, false],
    ['one-page resolution', Array.from({ length: 200 }, (_, index) => (index >= 140 ? 16 : 0)), 16, true],
    ['two-page step', Array.from({ length: 200 }, (_, index) => (index >= 180 ? 32 : 0)), 16, false],
    ['growth above resolution', Array.from({ length: 200 }, (_, index) => (index === 150 ? 148 : index)), 16, false],
  ] as const;
  for (const [name, values, resolution, expected] of convergenceCases) {
    strictEqual(resourceConvergence(values, resolution).converged, expected, name);
  }
};

const main = async (): Promise<void> => {
  verifyMeasurements();
  if (target !== 'darwin-arm64') {
    throw new Error(`PicoGK native soak requires darwin-arm64; received ${target}.`);
  }
  if (!Number.isInteger(iterations) || iterations < 200 || arguments_.length > 2) {
    throw new TypeError('Usage: benchmark-native.mts [--iterations <integer >= 200>]');
  }
  const pageSizeBytes = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }));
  strictEqual(Number.isSafeInteger(pageSizeBytes) && pageSizeBytes > 0, true, 'Host page size must be valid.');
  const manifest = JSON.parse(
    readFileSync(join(resourceRoot, 'tau-runtime-manifest.json'), 'utf8'),
  ) as ResourceManifest;
  if (manifest.target !== target) {
    throw new Error(`PicoGK resource target mismatch: expected ${target}, received ${manifest.target}.`);
  }

  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-picogk-soak-')));
  const workspacePath = join(privateRoot, 'workspace');
  const artifactPath = join(privateRoot, 'artifacts');
  const trustFile = join(privateRoot, 'trust.json');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  writeFileSync(trustFile, '{"version":1,"trusted":true}\n', { mode: 0o600 });
  const sourcePath = join(workspacePath, 'main.cs');
  writeFileSync(sourcePath, source(0));
  const session = new PicogkSession({
    workerExecutable: join(resourceRoot, manifest.workerPath),
    workerSha256: manifest.workerSha256,
    workspacePath,
    artifactPath,
    trustFile,
    resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
      ...resource,
      path: join(resourceRoot, path),
    })),
    requestTimeout: 120_000,
    maxArtifactBytes: 256 * 1024 * 1024,
    logger,
  });
  const { signal } = new AbortController();
  const settled: number[] = [];
  const analyze: number[] = [];
  const build: number[] = [];
  const artifactRead: number[] = [];
  const glbTransform: number[] = [];
  const resident: number[] = [];
  const descriptors: number[] = [];
  const managedHeap: number[] = [];
  const nativeMemory: number[] = [];
  const temporaryFiles: number[] = [];
  const pids = new Set<number>();
  let coldHandshakeMilliseconds = 0;
  let firstWorkerTimings: unknown;
  let warmWorkerTimings: unknown;
  let prepared: readonly PicogkPreparedCompute[] = [];
  const prepare = async (publication: PicogkComputePublication): Promise<readonly PicogkPreparedCompute[]> => {
    const bytes = await session.readArtifact(publication);
    return session.prehydrateCompute([{ identity: publication, bytes, contentDigest: await digestContent({ bytes }) }]);
  };

  try {
    for (let index = 0; index < iterations + steadyStateRuns; index += 1) {
      const settledStarted = performance.now();
      // Roslyn's bounded syntax caches intentionally retain distinct source
      // nodes. After measuring unique edits, repeat the final source to measure
      // model-run cleanup without attributing compiler-cache warm-up to a leak.
      const content = source(Math.min(index + 1, iterations));
      writeFileSync(sourcePath, content);
      const modelDigest = await digestContent({ bytes: new TextEncoder().encode(content) });
      const analyzed = await measure(async () => {
        const result = await session.request({
          method: 'analyze',
          params: { entryPath: 'main.cs' },
          schema: picogkAnalysisSchema,
          signal,
        });
        return result;
      });
      if (analyzed.value.timings.cacheHit !== index >= iterations) {
        throw new Error(`Run ${String(index + 1)} did not follow the expected compilation-cache lifecycle.`);
      }
      if (index === 0) {
        coldHandshakeMilliseconds = analyzed.milliseconds;
      }
      analyze.push(analyzed.milliseconds);
      const preparedForBuild = prepared;
      const built = await measure(async () => {
        const result = await session.request({
          method: 'build',
          params: { entryPath: 'main.cs', parameters: {}, compute: { modelDigest, prepared: preparedForBuild } },
          schema: picogkBuildSchema,
          signal,
        });
        return result;
      });
      if (!built.value.timings.compileCacheHit) {
        throw new Error(`Edit ${String(index + 1)} did not reuse its analyzed compilation for build.`);
      }
      build.push(built.milliseconds);
      firstWorkerTimings ??= built.value.timings;
      warmWorkerTimings = built.value.timings;
      if (index === 0) {
        prepared = await prepare(singlePublication(built.value));
      } else {
        assertMaterializationHit(built.value);
      }
      const read = await measure(async () => {
        const result = await session.readArtifact(built.value);
        return result;
      });
      artifactRead.push(read.milliseconds);
      const transformed = await measure(async () => picogkArtifactToGlb(read.value, built.value));
      glbTransform.push(transformed.milliseconds);
      validateGlb(transformed.value);
      settled.push(performance.now() - settledStarted);
      const stats = workerStats(workspacePath);
      pids.add(stats.pid);
      resident.push(stats.residentKilobytes);
      descriptors.push(stats.descriptors);
      managedHeap.push(built.value.metrics.managedHeapBytes);
      nativeMemory.push(built.value.metrics.picoGkNativeBytes);
      const remainingArtifacts = readdirSync(artifactPath);
      temporaryFiles.push(remainingArtifacts.length);
      if (remainingArtifacts.some((name) => name.endsWith('.tau-mesh') || name.endsWith('.vdb'))) {
        throw new Error(
          `Edit ${String(index + 1)} left consumed mesh artifacts behind: ${remainingArtifacts.join(', ')}.`,
        );
      }
    }

    const highResolutionSource = source(iterations + 1, 0.25, 20);
    writeFileSync(sourcePath, highResolutionSource);
    const highResolutionDigest = await digestContent({ bytes: new TextEncoder().encode(highResolutionSource) });
    const highResolution = await measure(async () => {
      await session.request({
        method: 'analyze',
        params: { entryPath: 'main.cs' },
        schema: picogkAnalysisSchema,
        signal,
      });
      const built = await session.request({
        method: 'build',
        params: {
          entryPath: 'main.cs',
          parameters: {},
          compute: { modelDigest: highResolutionDigest, prepared },
        },
        schema: picogkBuildSchema,
        signal,
      });
      const artifact = await session.readArtifact(built);
      const glb = picogkArtifactToGlb(artifact, built);
      validateGlb(glb);
      prepared = await prepare(singlePublication(built));
      return {
        digest: await digestContent({ bytes: glb }),
        bytes: glb.byteLength,
        timings: built.timings,
        metrics: built.metrics,
      };
    });
    const highResolutionWarm = await measure(async () => {
      const built = await session.request({
        method: 'build',
        params: {
          entryPath: 'main.cs',
          parameters: {},
          compute: { modelDigest: highResolutionDigest, prepared },
        },
        schema: picogkBuildSchema,
        signal,
      });
      assertMaterializationHit(built);
      const glb = picogkArtifactToGlb(await session.readArtifact(built), built);
      validateGlb(glb);
      return {
        digest: await digestContent({ bytes: glb }),
        bytes: glb.byteLength,
        timings: built.timings,
        metrics: built.metrics,
      };
    });
    if (highResolution.value.digest !== highResolutionWarm.value.digest) {
      throw new Error('Warm PicoGK materialization changed the final geometry bytes.');
    }

    if (pids.size !== 1) {
      throw new Error(`The normal soak used ${String(pids.size)} worker generations instead of one.`);
    }
    if (nativeMemory.some((bytes) => !Number.isFinite(bytes) || bytes < 0)) {
      throw new Error('PicoGK reported invalid native-allocation telemetry.');
    }
    const convergence = {
      // A one-page detection limit, not an allowance for measurement error or a claim of zero growth.
      residentKilobytes: resourceConvergence(resident, pageSizeBytes / 1024),
      managedHeapBytes: resourceConvergence(managedHeap),
      descriptors: resourceConvergence(descriptors),
      temporaryFiles: resourceConvergence(temporaryFiles),
    };

    const sourceSaveToSettled = {
      p50: percentile(settled.slice(0, iterations), 0.5),
      p95: percentile(settled.slice(0, iterations), 0.95),
    };

    console.log(
      JSON.stringify(
        {
          target,
          iterations,
          steadyStateRuns,
          coldHandshakeMilliseconds,
          sourceSaveToSettled,
          steadyStateRender: {
            p50: percentile(settled.slice(iterations), 0.5),
            p95: percentile(settled.slice(iterations), 0.95),
          },
          analyze: { p50: percentile(analyze, 0.5), p95: percentile(analyze, 0.95) },
          build: { p50: percentile(build, 0.5), p95: percentile(build, 0.95) },
          artifactRead: { p50: percentile(artifactRead, 0.5), p95: percentile(artifactRead, 0.95) },
          glbTransform: { p50: percentile(glbTransform, 0.5), p95: percentile(glbTransform, 0.95) },
          firstWorkerTimings,
          warmWorkerTimings,
          highResolution: { milliseconds: highResolution.milliseconds, ...highResolution.value },
          highResolutionWarm: { milliseconds: highResolutionWarm.milliseconds, ...highResolutionWarm.value },
          worker: {
            generations: pids.size,
            convergence,
            uniqueEditsManagedHeapBytes: {
              first: managedHeap[0],
              peak: Math.max(...managedHeap.slice(0, iterations)),
              last: managedHeap[iterations - 1],
            },
            residentKilobytes: { first: resident[0], peak: Math.max(...resident), last: resident.at(-1) },
            descriptors: { first: descriptors[0], peak: Math.max(...descriptors), last: descriptors.at(-1) },
            managedHeapBytes: { first: managedHeap[0], peak: Math.max(...managedHeap), last: managedHeap.at(-1) },
            picoGkNativeBytes: { peak: Math.max(...nativeMemory), last: nativeMemory.at(-1) },
            temporaryFiles: {
              first: temporaryFiles[0],
              peak: Math.max(...temporaryFiles),
              last: temporaryFiles.at(-1),
            },
          },
        },
        undefined,
        2,
      ),
    );
    const unconverged = Object.fromEntries(Object.entries(convergence).filter(([, resource]) => !resource.converged));
    if (Object.keys(unconverged).length > 0) {
      throw new Error(`Resources did not reach steady state in the final 100 runs: ${JSON.stringify(unconverged)}.`);
    }
    if (sourceSaveToSettled.p50 > sourceSaveBudget.p50 || sourceSaveToSettled.p95 > sourceSaveBudget.p95) {
      throw new Error(
        `Source-save latency exceeded the ${String(sourceSaveBudget.p50)}ms p50 / ${String(sourceSaveBudget.p95)}ms p95 budget: ${String(sourceSaveToSettled.p50)}ms / ${String(sourceSaveToSettled.p95)}ms.`,
      );
    }
  } finally {
    await session.cleanup();
    rmSync(privateRoot, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error('PicoGK native soak failed:', error);
  process.exit(1);
}
