#!/usr/bin/env node

/**
 * Purpose: Measure one cold Build123d worker against an arbitrary prepared Python tree.
 * Why: Spikes S1 (bytecode), S5 (macOS wheel tier) and S6 (Rosetta) compare trees that
 *   `benchmark-native` cannot address, because that gate reads the fixed desktop resource path.
 * Environment: Node 24+ on macOS; a tree produced by desktop:prepare-build123d-python (or a clone of one).
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/build123d-bench.mts
 *   --root <tree> --label <name> [--loop <n>] [--repo-root <checkout>] [--out <file.json>]
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
import {
  build123dAnalysisSchema,
  build123dArtifactSchema,
  build123dBuildSchema,
  build123dEmptySchema,
} from '../../../packages/plugins/build123d/src/build123d.protocol.ts';
import { PythonSession } from '../../../packages/plugins/build123d/src/python-session.ts';
import { emit, parseFlags, requiredFlag } from './spike-common.mts';
/* eslint-enable @nx/enforce-module-boundaries -- end of the spike-only import block. */
/* oxlint-enable no-restricted-imports */

type ResourceManifest = {
  readonly pythonRelativePath: string;
  readonly pythonSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
};

const boxSource = (width: number): string => `from dataclasses import dataclass
from build123d import Box

@dataclass(frozen=True)
class Params:
    width: float = ${String(width)}
    depth: float = 30.0
    height: float = 20.0

def main(params: Params):
    return Box(params.width, params.depth, params.height)
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
  const flags = parseFlags(['root', 'label', 'loop', 'out', 'repo-root']);
  const resourceRoot = resolve(requiredFlag(flags, 'root'));
  // A bundled copy (S6 runs one under x64 Node) passes the checkout explicitly.
  const repoRoot = resolve(flags.get('repo-root') ?? join(import.meta.dirname, '../../..'));
  const loop = Number(flags.get('loop') ?? '50');
  if (!Number.isInteger(loop) || loop < 0) {
    throw new TypeError('--loop must be a non-negative integer');
  }
  const manifest = JSON.parse(
    readFileSync(join(resourceRoot, 'tau-runtime-manifest.json'), 'utf8'),
  ) as ResourceManifest;
  const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-build123d-spike-')));
  const workspacePath = join(privateRoot, 'workspace');
  const artifactPath = join(privateRoot, 'artifacts');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  writeFileSync(join(workspacePath, 'main.py'), boxSource(40));
  const session = new PythonSession({
    pythonExecutable: join(resourceRoot, manifest.pythonRelativePath),
    pythonSha256: manifest.pythonSha256,
    workerPath: join(resourceRoot, manifest.workerPath),
    workerSha256: manifest.workerSha256,
    supportFiles: manifest.supportFiles.map(({ path, sha256 }) => ({ path: join(resourceRoot, path), sha256 })),
    workspacePath,
    artifactPath,
    requestTimeout: 600_000,
    maxArtifactBytes: 256 * 1024 * 1024,
    logger,
  });
  const { signal } = new AbortController();
  const time: <T>(operation: () => Promise<T>) => Promise<{ milliseconds: number; value: T }> = async (operation) => {
    const started = performance.now();
    const value = await operation();
    return { milliseconds: performance.now() - started, value };
  };
  const analyze = async (): Promise<unknown> =>
    session.request({ method: 'analyze', params: { entryPath: 'main.py' }, schema: build123dAnalysisSchema, signal });
  const build = async (parameters: Record<string, unknown>) =>
    session.request({
      method: 'build',
      params: { entryPath: 'main.py', parameters },
      schema: build123dBuildSchema,
      signal,
    });
  const mesh = async (handleId: string) =>
    session.request({
      method: 'mesh',
      params: { handleId, linearTolerance: 0.1, angularTolerance: 0.1 },
      schema: build123dArtifactSchema,
      signal,
    });
  const exportStep = async (handleId: string) =>
    session.request({
      method: 'export',
      params: { handleId, format: 'step' },
      schema: build123dArtifactSchema,
      signal,
    });
  // The worker retains every built handle until released, as benchmark-native does.
  const release = async (handleId: string) =>
    session.request({ method: 'release', params: { handleId }, schema: build123dEmptySchema, signal });
  try {
    const cold = await time(analyze);
    const firstBox = await time(async () => {
      const result = await build({ width: 40 });
      await session.readArtifact(await mesh(result.handleId));
      return result;
    });
    await release(firstBox.value.handleId);
    let workload: Record<string, number> = {};
    if (loop > 0) {
      writeFileSync(
        join(workspacePath, 'main.py'),
        readFileSync(resolve(repoRoot, 'libs/tau-examples/src/kernels/build123d/v8-engine-brep/main.py'), 'utf8'),
      );
      await analyze();
      const v8Build = await time(async () => build({}));
      const v8Mesh = await time(async () => session.readArtifact(await mesh(v8Build.value.handleId)));
      const v8Export = await time(async () => session.readArtifact(await exportStep(v8Build.value.handleId)));
      await release(v8Build.value.handleId);
      writeFileSync(join(workspacePath, 'main.py'), boxSource(40));
      await analyze();
      const boxLoop = await time(async () => {
        for (let index = 0; index < loop; index += 1) {
          const result = await build({ width: 40 + (index % 20) });
          await session.readArtifact(await mesh(result.handleId));
          await release(result.handleId);
        }
      });
      workload = {
        v8BuildMilliseconds: v8Build.milliseconds,
        v8MeshMilliseconds: v8Mesh.milliseconds,
        v8ExportMilliseconds: v8Export.milliseconds,
        boxLoopMilliseconds: boxLoop.milliseconds,
        warmWorkloadMilliseconds:
          v8Build.milliseconds + v8Mesh.milliseconds + v8Export.milliseconds + boxLoop.milliseconds,
      };
    }
    emit(flags.get('out'), {
      spike: 'build123d-bench',
      label: requiredFlag(flags, 'label'),
      root: resourceRoot,
      target: manifest.target,
      loop,
      coldAnalysisMilliseconds: cold.milliseconds,
      firstBoxBuildMeshMilliseconds: firstBox.milliseconds,
      ...workload,
    });
  } finally {
    await session.cleanup();
    rmSync(privateRoot, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error('build123d spike benchmark failed:', error);
  process.exit(1);
}
