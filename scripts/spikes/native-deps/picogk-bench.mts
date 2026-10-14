#!/usr/bin/env node

/**
 * Purpose: Measure one cold PicoGK worker (handshake, first compile, first build) against an arbitrary tree.
 * Why: Spike S2 compares the IL-only Tau layer with a ReadyToRun publish; `benchmark-native` has no
 *   first-build timer and reads only the fixed desktop resource path.
 * Environment: Node 24+ on darwin-arm64; a tree produced by desktop:prepare-picogk-dotnet (or a republish of one).
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/picogk-bench.mts
 *   --root <tree> --label <name> [--edits <n>] [--out <file.json>]
 * Exit codes: 0 when the workload completes; 1 on any worker, integrity or argument failure.
 */

/* oxlint-disable no-await-in-loop -- Samples run serially on the single-worker protocol. */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import type { RuntimeLogger } from '@taucad/runtime/kernel';

/* oxlint-disable no-restricted-imports -- spike-only scripts outside a package import their siblings and the kernel sessions, which are not public exports, by relative path; deleted with their W package. */
/* eslint-disable @nx/enforce-module-boundaries -- spike-only: the kernel sessions are not public exports of their packages. */
import { picogkAnalysisSchema, picogkBuildSchema } from '../../../packages/plugins/picogk/src/picogk.protocol.ts';
import { PicogkSession } from '../../../packages/plugins/picogk/src/picogk-session.ts';
import { emit, median, parseFlags, requiredFlag } from './spike-common.mts';
/* eslint-enable @nx/enforce-module-boundaries -- end of the spike-only import block. */
/* oxlint-enable no-restricted-imports */

type ResourceManifest = {
  readonly workerPath: string;
  readonly workerSha256: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
};

const source = (marker: number): string => `using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    const int EditMarker = ${String(marker)};
    _ = EditMarker;
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 12f), 0);
});
`;
// Worker stderr arrives as debug output; keep it on stderr so a failed launch explains itself.
const toStderr = (message: string): void => {
  process.stderr.write(`${message}\n`);
};
const logger: RuntimeLogger = {
  log: () => undefined,
  debug: toStderr,
  trace: () => undefined,
  warn: toStderr,
  error: toStderr,
  custom: () => undefined,
};

const main = async (): Promise<void> => {
  const flags = parseFlags(['root', 'label', 'edits', 'out']);
  const resourceRoot = resolve(requiredFlag(flags, 'root'));
  const edits = Number(flags.get('edits') ?? '5');
  const manifest = JSON.parse(
    readFileSync(join(resourceRoot, 'tau-runtime-manifest.json'), 'utf8'),
  ) as ResourceManifest;
  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-spike-picogk-')));
  const workspacePath = join(privateRoot, 'workspace');
  const artifactPath = join(privateRoot, 'artifacts');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  const sourcePath = join(workspacePath, 'main.cs');
  writeFileSync(sourcePath, source(0));
  const session = new PicogkSession({
    workerExecutable: join(resourceRoot, manifest.workerPath),
    workerSha256: manifest.workerSha256,
    workspacePath,
    artifactPath,
    resourceFiles: manifest.resourceFiles.map(({ path, ...resource }) => ({
      ...resource,
      path: join(resourceRoot, path),
    })),
    requestTimeout: 600_000,
    maxArtifactBytes: 256 * 1024 * 1024,
    logger,
  });
  const { signal } = new AbortController();
  const analyze = async () =>
    session.request({ method: 'analyze', params: { entryPath: 'main.cs' }, schema: picogkAnalysisSchema, signal });
  const build = async () =>
    session.request({
      method: 'build',
      params: { entryPath: 'main.cs', parameters: {} },
      schema: picogkBuildSchema,
      signal,
    });
  try {
    const coldStarted = performance.now();
    const firstAnalysis = await analyze();
    const firstAnalyzeMilliseconds = performance.now() - coldStarted;
    const compile = firstAnalysis.timings;
    const firstCompileMilliseconds = compile.sourceRead + compile.parse + compile.analyze + compile.emit;
    const buildStarted = performance.now();
    const firstBuild = await build();
    await session.readArtifact(firstBuild);
    const firstBuildRequestMilliseconds = performance.now() - buildStarted;
    const warmEdits: number[] = [];
    for (let index = 1; index <= edits; index += 1) {
      writeFileSync(sourcePath, source(index));
      const started = performance.now();
      await analyze();
      await session.readArtifact(await build());
      warmEdits.push(performance.now() - started);
    }
    emit(flags.get('out'), {
      spike: 'picogk-bench',
      label: requiredFlag(flags, 'label'),
      root: resourceRoot,
      // Host-observed first analyze: spawn, launch check, runtime start, ready frame, first Roslyn compile.
      firstAnalyzeMilliseconds,
      // Worker-reported Roslyn time inside that first analyze.
      firstCompileMilliseconds,
      // Derived handshake: everything in the first analyze that is not the worker's compile.
      coldHandshakeMilliseconds: firstAnalyzeMilliseconds - firstCompileMilliseconds,
      // Host-observed first build request (first execution of the compiled model, mesh, artifact read).
      firstBuildRequestMilliseconds,
      // First build as S2 defines it: from ready to the first geometry (first compile + first build).
      firstBuildMilliseconds: firstCompileMilliseconds + firstBuildRequestMilliseconds,
      coldToFirstGeometryMilliseconds: firstAnalyzeMilliseconds + firstBuildRequestMilliseconds,
      firstAnalysisTimings: compile,
      firstBuildTimings: firstBuild.timings,
      warmEditMedianMilliseconds: warmEdits.length > 0 ? median(warmEdits) : undefined,
      warmEditMilliseconds: warmEdits,
    });
  } finally {
    await session.cleanup();
    rmSync(privateRoot, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error('PicoGK spike benchmark failed:', error);
  process.exit(1);
}
