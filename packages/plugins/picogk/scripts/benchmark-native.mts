#!/usr/bin/env node

/**
 * Purpose: Run the PicoGK 200-edit soak and report native C# pipeline performance.
 * Why: Release decisions need measured cache, JIT, mesh, memory, descriptor, and latency evidence.
 * Environment: Node 24+ on darwin-arm64 with desktop:prepare-picogk-dotnet completed.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/benchmark-native.mts [--iterations 200]
 * Exit codes: 0 when the soak, high-resolution build, and lifecycle gates pass; non-zero otherwise.
 */

/* oxlint-disable no-await-in-loop -- One warm worker intentionally serializes every edit. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import type { RuntimeLogger } from '@taucad/runtime/kernel';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
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
  arguments_.length === 0 ? 200 : arguments_[0] === '--iterations' ? Number(arguments_[1]) : Number.NaN;
const sourceSaveBudget = { p50: 50, p95: 100 } as const;

const source = (marker: number, voxelSize = 1): string => `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
using Tau.PicoGK;
public sealed record Params
{
    [Range(0.25, 4.0)] public float VoxelSizeMm { get; init; } = ${String(voxelSize)}f;
    [Range(5.0, 40.0)] public float RadiusMm { get; init; } = 12f;
    public int EditMarker { get; init; } = ${String(marker)};
}
public static class Model
{
    public static TauModel Build(Params p) => TauModel.Create(
        TauComponent.FromVoxels("Sphere", Voxels.voxSphere(Vector3.Zero, p.RadiusMm), "#4f7dd9ff"));
}
`;

const logger: RuntimeLogger = {
  log: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  custom: () => undefined,
};

const percentile = (values: readonly number[], fraction: number): number => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))]!;
};

const assertNotMonotonicallyGrowing = (name: string, values: readonly number[]): void => {
  const warmed = values.slice(Math.min(20, Math.floor(values.length / 4)));
  const monotonic = warmed.every((value, index) => index === 0 || value >= warmed[index - 1]!);
  if (monotonic && warmed.at(-1)! > warmed[0]!) {
    throw new Error(`${name} grew monotonically throughout the warmed soak.`);
  }
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

const radiusParameters = (radius: number): Record<string, unknown> => Object.fromEntries([['RadiusMm', radius]]);

const workerStats = (workspacePath: string): WorkerStats => {
  const row = execFileSync('ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf8' })
    .split('\n')
    .find((line) => line.includes('Tau.PicoGK.Worker --workspace') && line.includes(workspacePath));
  const match = row ? /^\s*(\d+)\s+(\d+)\s+/u.exec(row) : undefined;
  if (!match) {
    throw new Error('The PicoGK soak worker process was not found.');
  }
  const pid = Number(match[1]);
  const descriptors =
    execFileSync('lsof', ['-n', '-p', String(pid)], { encoding: 'utf8' })
      .trim()
      .split('\n').length - 1;
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

const main = async (): Promise<void> => {
  if (target !== 'darwin-arm64') {
    throw new Error(`PicoGK native soak requires darwin-arm64; received ${target}.`);
  }
  if (!Number.isInteger(iterations) || iterations < 200 || arguments_.length > 2) {
    throw new TypeError('Usage: benchmark-native.mts [--iterations <integer >= 200>]');
  }
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

  try {
    for (let index = 0; index < iterations; index += 1) {
      const settledStarted = performance.now();
      writeFileSync(sourcePath, source(index + 1));
      const analyzed = await measure(async () => {
        const result = await session.request({
          method: 'analyze',
          params: { entryPath: 'main.cs' },
          schema: picogkAnalysisSchema,
          signal,
        });
        return result;
      });
      if (analyzed.value.timings.cacheHit) {
        throw new Error(`Edit ${String(index + 1)} unexpectedly reused a stale analysis compilation.`);
      }
      if (index === 0) {
        coldHandshakeMilliseconds = analyzed.milliseconds;
      }
      analyze.push(analyzed.milliseconds);
      const built = await measure(async () => {
        const result = await session.request({
          method: 'build',
          params: { entryPath: 'main.cs', parameters: radiusParameters(12) },
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
      if (remainingArtifacts.some((name) => name.endsWith('.tau-mesh'))) {
        throw new Error(
          `Edit ${String(index + 1)} left consumed mesh artifacts behind: ${remainingArtifacts.join(', ')}.`,
        );
      }
    }

    writeFileSync(sourcePath, source(iterations + 1, 0.25));
    const highResolution = await measure(async () => {
      await session.request({
        method: 'analyze',
        params: { entryPath: 'main.cs' },
        schema: picogkAnalysisSchema,
        signal,
      });
      const built = await session.request({
        method: 'build',
        params: { entryPath: 'main.cs', parameters: radiusParameters(20) },
        schema: picogkBuildSchema,
        signal,
      });
      const artifact = await session.readArtifact(built);
      const glb = picogkArtifactToGlb(artifact, built);
      validateGlb(glb);
      return { bytes: glb.byteLength, timings: built.timings, metrics: built.metrics };
    });

    if (pids.size !== 1) {
      throw new Error(`The normal soak used ${String(pids.size)} worker generations instead of one.`);
    }
    if (nativeMemory.some((bytes) => bytes !== 0)) {
      throw new Error('PicoGK retained native allocations after a settled edit.');
    }
    assertNotMonotonicallyGrowing('worker RSS', resident);
    assertNotMonotonicallyGrowing('managed heap', managedHeap);
    assertNotMonotonicallyGrowing('file descriptors', descriptors);
    assertNotMonotonicallyGrowing('temporary files', temporaryFiles);

    const sourceSaveToSettled = { p50: percentile(settled, 0.5), p95: percentile(settled, 0.95) };
    if (sourceSaveToSettled.p50 > sourceSaveBudget.p50 || sourceSaveToSettled.p95 > sourceSaveBudget.p95) {
      throw new Error(
        `Source-save latency exceeded the ${String(sourceSaveBudget.p50)}ms p50 / ${String(sourceSaveBudget.p95)}ms p95 budget: ${String(sourceSaveToSettled.p50)}ms / ${String(sourceSaveToSettled.p95)}ms.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          target,
          iterations,
          coldHandshakeMilliseconds,
          sourceSaveToSettled,
          analyze: { p50: percentile(analyze, 0.5), p95: percentile(analyze, 0.95) },
          build: { p50: percentile(build, 0.5), p95: percentile(build, 0.95) },
          artifactRead: { p50: percentile(artifactRead, 0.5), p95: percentile(artifactRead, 0.95) },
          glbTransform: { p50: percentile(glbTransform, 0.5), p95: percentile(glbTransform, 0.95) },
          firstWorkerTimings,
          warmWorkerTimings,
          highResolution: { milliseconds: highResolution.milliseconds, ...highResolution.value },
          worker: {
            generations: pids.size,
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
