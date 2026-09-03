#!/usr/bin/env node

/**
 * Purpose: Measure the shipped Build123d process protocol and native CAD workload.
 * Why: Release thresholds need a repeatable baseline from the exact bundled interpreter.
 * Environment: Node 24+, macOS/Linux, and a prepared Build123d Python resource for the host target.
 * Usage: node --import @oxc-node/core/register packages/plugins/build123d/scripts/benchmark-native.mts [--iterations 200]
 * Exit codes: 0 when every workload and cancellation completes; non-zero on integrity or runtime failure.
 */

/* oxlint-disable no-await-in-loop -- Benchmark samples must run serially on the single-worker protocol. */
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { RuntimeLogger } from '@taucad/runtime/kernel';

import {
  build123dAnalysisSchema,
  build123dArtifactSchema,
  build123dBuildSchema,
  build123dEmptySchema,
} from '#build123d.protocol.js';
import { PythonSession } from '#python-session.js';

type ResourceManifest = {
  readonly pythonRelativePath: string;
  readonly pythonSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  readonly target: string;
  readonly workerPath: string;
  readonly workerSha256: string;
};

const repoRoot = resolve(import.meta.dirname, '../../../..');
const target = `${process.platform}-${process.arch}`;
const resourceRoot = resolve(repoRoot, `apps/desktop/resources/python/${target}`);
const manifest = JSON.parse(
  readFileSync(resolve(resourceRoot, 'tau-runtime-manifest.json'), 'utf8'),
) as ResourceManifest;
const arguments_ = process.argv.slice(2);
const iterations =
  arguments_.length === 0 ? 200 : arguments_[0] === '--iterations' ? Number(arguments_[1]) : Number.NaN;
if (!Number.isInteger(iterations) || iterations < 100 || arguments_.length > 2) {
  throw new TypeError('Usage: benchmark-native.mts [--iterations <integer >= 100>]');
}
if (manifest.target !== target) {
  throw new Error(`Build123d resource target mismatch: expected ${target}, received ${manifest.target}`);
}

const source = (defaultWidth = 40): string => `from dataclasses import dataclass
from build123d import Box

@dataclass(frozen=True)
class Params:
    width: float = ${String(defaultWidth)}
    depth: float = 30.0
    height: float = 20.0

def main(params: Params):
    return Box(params.width, params.depth, params.height)
`;
const hangingSource = `from dataclasses import dataclass
import time
from build123d import Box

@dataclass(frozen=True)
class Params:
    width: float = 1.0

def main(params: Params):
    time.sleep(60)
    return Box(params.width, 1, 1)
`;
const logger: RuntimeLogger = {
  log: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  custom: () => undefined,
};
const median = (values: readonly number[]): number =>
  [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
const measure: <T>(
  operation: () => Promise<T>,
) => Promise<{ readonly milliseconds: number; readonly value: T }> = async (operation) => {
  const started = performance.now();
  const value = await operation();
  return { milliseconds: performance.now() - started, value };
};
const bytesUnder = (root: string): number => {
  let total = 0;
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const metadata = lstatSync(path);
    total += metadata.isDirectory() ? bytesUnder(path) : metadata.size;
  }
  return total;
};
const workerResidentKilobytes = (workspacePath: string): number | undefined => {
  if (process.platform === 'win32') {
    return undefined;
  }
  const row = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8' })
    .split('\n')
    .find((line) => line.includes('tau-worker/worker.py') && line.includes(workspacePath));
  const rss = row ? Number(/^\s*(\d+)/u.exec(row)?.[1]) : Number.NaN;
  return Number.isFinite(rss) ? rss : undefined;
};

const privateRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-build123d-benchmark-')));
const workspacePath = join(privateRoot, 'workspace');
const artifactPath = join(privateRoot, 'artifacts');
const trustFile = join(privateRoot, 'trust.json');
mkdirSync(workspacePath);
mkdirSync(artifactPath);
writeFileSync(trustFile, '{"version":1,"trusted":true}\n', { mode: 0o600 });
writeFileSync(join(workspacePath, 'main.py'), source());
const session = new PythonSession({
  pythonExecutable: resolve(resourceRoot, manifest.pythonRelativePath),
  pythonSha256: manifest.pythonSha256,
  workerPath: resolve(resourceRoot, manifest.workerPath),
  workerSha256: manifest.workerSha256,
  supportFiles: manifest.supportFiles.map(({ path, sha256 }) => ({ path: resolve(resourceRoot, path), sha256 })),
  workspacePath,
  artifactPath,
  trustFile,
  requestTimeout: 120_000,
  maxArtifactBytes: 256 * 1024 * 1024,
  logger,
});
const { signal } = new AbortController();
const analysis = async (): Promise<unknown> =>
  session.request({ method: 'analyze', params: { entryPath: 'main.py' }, schema: build123dAnalysisSchema, signal });
const build = async (width: number) =>
  session.request({
    method: 'build',
    params: { entryPath: 'main.py', parameters: { width } },
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
const release = async (handleId: string) =>
  session.request({ method: 'release', params: { handleId }, schema: build123dEmptySchema, signal });

try {
  const coldAnalysis = await measure(analysis);
  const warmAnalysis: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    const sample = await measure(analysis);
    warmAnalysis.push(sample.milliseconds);
  }
  const boxBuild = await measure(async () => build(40));
  const boxMesh = await measure(async () => mesh(boxBuild.value.handleId));
  const boxArtifactRead = await measure(async () => session.readArtifact(boxMesh.value));
  const boxExport = await measure(async () => exportStep(boxBuild.value.handleId));
  const boxExportRead = await measure(async () => session.readArtifact(boxExport.value));
  const ipc: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    const sample = await measure(async () => release(`missing-${String(index)}`));
    ipc.push(sample.milliseconds);
  }
  await release(boxBuild.value.handleId);

  writeFileSync(
    join(workspacePath, 'main.py'),
    readFileSync(resolve(repoRoot, 'libs/tau-examples/src/kernels/build123d/v8-engine-brep/main.py'), 'utf8'),
  );
  const v8Build = await measure(async () =>
    session.request({
      method: 'build',
      params: { entryPath: 'main.py', parameters: {} },
      schema: build123dBuildSchema,
      signal,
    }),
  );
  const v8Mesh = await measure(async () => mesh(v8Build.value.handleId));
  const v8ArtifactRead = await measure(async () => session.readArtifact(v8Mesh.value));
  const v8Export = await measure(async () => exportStep(v8Build.value.handleId));
  const v8ExportRead = await measure(async () => session.readArtifact(v8Export.value));
  await release(v8Build.value.handleId);

  const longSessionStarted = performance.now();
  const initialResidentKilobytes = workerResidentKilobytes(workspacePath);
  let peakResidentKilobytes = initialResidentKilobytes;
  writeFileSync(join(workspacePath, 'main.py'), source());
  for (let index = 0; index < iterations; index += 1) {
    if (index % 10 === 0) {
      writeFileSync(join(workspacePath, 'main.py'), source(40 + (index % 20)));
      await analysis();
    }
    const result = await build(40 + (index % 20));
    const artifact = await mesh(result.handleId);
    await session.readArtifact(artifact);
    await release(result.handleId);
    const resident = workerResidentKilobytes(workspacePath);
    peakResidentKilobytes =
      resident === undefined ? peakResidentKilobytes : Math.max(peakResidentKilobytes ?? 0, resident);
  }
  const steadyResidentKilobytes = workerResidentKilobytes(workspacePath);
  const longSessionMilliseconds = performance.now() - longSessionStarted;

  writeFileSync(join(workspacePath, 'main.py'), hangingSource);
  const cancellation = new AbortController();
  let cancellationStarted = Number.NaN;
  setTimeout(() => {
    cancellationStarted = performance.now();
    cancellation.abort(new DOMException('Benchmark cancellation', 'AbortError'));
  }, 50).unref();
  let cancelled = false;
  try {
    await session.request({
      method: 'build',
      params: { entryPath: 'main.py', parameters: {} },
      schema: build123dBuildSchema,
      signal: cancellation.signal,
    });
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'AbortError') {
      throw error;
    }
    cancelled = true;
  }
  if (!cancelled) {
    throw new Error('Hanging Build123d benchmark unexpectedly completed.');
  }

  console.log(
    JSON.stringify(
      {
        target,
        iterations,
        coldAnalysisMilliseconds: coldAnalysis.milliseconds,
        warmAnalysisMedianMilliseconds: median(warmAnalysis),
        boxBuildMilliseconds: boxBuild.milliseconds,
        boxMeshMilliseconds: boxMesh.milliseconds,
        boxArtifactReadMilliseconds: boxArtifactRead.milliseconds,
        boxExportMilliseconds: boxExport.milliseconds,
        boxExportReadMilliseconds: boxExportRead.milliseconds,
        ipcMedianMilliseconds: median(ipc),
        v8BuildMilliseconds: v8Build.milliseconds,
        v8MeshMilliseconds: v8Mesh.milliseconds,
        v8ArtifactReadMilliseconds: v8ArtifactRead.milliseconds,
        v8ExportMilliseconds: v8Export.milliseconds,
        v8ExportReadMilliseconds: v8ExportRead.milliseconds,
        longSessionMilliseconds,
        initialResidentKilobytes,
        peakResidentKilobytes,
        steadyResidentKilobytes,
        cancellationMilliseconds: performance.now() - cancellationStarted,
        runtimeResourceBytes: bytesUnder(resourceRoot),
      },
      undefined,
      2,
    ),
  );
} finally {
  await session.cleanup();
  rmSync(privateRoot, { recursive: true, force: true });
}
