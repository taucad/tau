import { WebIO } from '@gltf-transform/core';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { buildMeshAnalysisRecord, createGeometryStatsFromRecord } from '#mesh/analysis-record.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecModelLoadCacheStats } from '#runner/model-load-cache.js';
import type { GeoSpecNodeInvocationContextStats } from '#runner/node/invocation-context.js';
import type { GeoSpecResourceScopeProfile } from '#runner/profile.js';
import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import { summarizeLoadPathSamples } from '#experiments/load-path/summary.js';
import type { LoadPathBucket, LoadPathSummary, LoadPathTimingSample } from '#experiments/load-path/summary.js';
import type { VmFileSystem } from '@taucad/vm';

export type LoadPathProfileOptions = {
  glbBytes?: Uint8Array;
  exportGlbBytes?: () => Promise<Uint8Array>;
  iterations?: number;
  richDiagnostics?: boolean;
  overlap?: boolean;
  overlapTolerance?: number;
};

export type LoadPathProfileResult = {
  samples: LoadPathTimingSample[];
  summary: LoadPathSummary;
};

export type CanonicalPerTestLoadPathProfileResult = LoadPathProfileResult & {
  authoredLoadModelCalls: number;
  underlyingModelLoaderCalls: number;
  passed: number;
  failed: number;
};

export type NodeCliLoadPathProfileOptions = {
  projectPath: string;
  cliPath?: string;
  nodeExecutable?: string;
  files?: string[];
  testTimeout?: number;
  iterations?: number;
  cwd?: string;
};

export type NodeCliLoadPathProfileRun = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutBytes: number;
  stderrBytes: number;
  profile?: NodeCliInvocationProfile;
};

export type NodeCliInvocationProfile = {
  version: 1;
  runtime: GeoSpecNodeInvocationContextStats;
  runner: {
    aggregateModelLoadCache: GeoSpecModelLoadCacheStats;
    moduleModelLoadCache: GeoSpecModelLoadCacheStats;
    resourceScope: GeoSpecResourceScopeProfile;
  };
};

export type NodeCliLoadPathProfileResult = LoadPathProfileResult & {
  command: {
    nodeExecutable: string;
    cliPath: string;
    projectPath: string;
    args: string[];
  };
  counters: {
    cliInvocations: number;
    successfulInvocations: number;
    failedInvocations: number;
    runtimeCreations: Record<string, number>;
    aggregateModelLoadCache: GeoSpecModelLoadCacheStats;
    moduleModelLoadCache: GeoSpecModelLoadCacheStats;
    resourceScope: GeoSpecResourceScopeProfile;
  };
  runs: NodeCliLoadPathProfileRun[];
};

class MemoryProfileFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(_path: string): Promise<void> {
    return undefined;
  }
}

const measure = async <T>(
  bucket: LoadPathBucket,
  samples: LoadPathTimingSample[],
  callback: () => T | Promise<T>,
): Promise<T> => {
  const start = performance.now();
  try {
    return await callback();
  } finally {
    samples.push({ bucket, ms: performance.now() - start });
  }
};

const defaultCliPath = (): string => fileURLToPath(new URL('../../src/cli.ts', import.meta.url));
const profilePathEnvironmentKey = 'GEOSPEC_PROFILE_JSON_PATH';

const runNodeCli = async (options: {
  nodeExecutable: string;
  cliPath: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NodeCliLoadPathProfileRun> =>
  new Promise((resolve, reject) => {
    const child = spawn(options.nodeExecutable, [options.cliPath, ...options.args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
    });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdoutBytes,
        stderrBytes,
      });
    });
  });

const emptyModelLoadCacheStats = (): GeoSpecModelLoadCacheStats => ({
  hits: 0,
  misses: 0,
  bypasses: 0,
  failures: 0,
});

const emptyResourceScopeProfile = (): GeoSpecResourceScopeProfile => ({
  trackedSubjects: 0,
  registeredDisposables: 0,
  disposedScopes: 0,
  disposedResources: 0,
  overlap: {
    cacheCreations: 0,
    cacheDisposals: 0,
    preparedComponentHits: 0,
    preparedComponentMisses: 0,
    pairVolumeHits: 0,
    pairVolumeMisses: 0,
    invalidDiagnosticHits: 0,
    invalidDiagnosticMisses: 0,
  },
});

const addModelLoadCacheStats = (
  total: GeoSpecModelLoadCacheStats,
  next: GeoSpecModelLoadCacheStats | undefined,
): void => {
  if (!next) {
    return;
  }
  total.hits += next.hits;
  total.misses += next.misses;
  total.bypasses += next.bypasses;
  total.failures += next.failures;
};

const addResourceScopeProfile = (
  total: GeoSpecResourceScopeProfile,
  next: GeoSpecResourceScopeProfile | undefined,
): void => {
  if (!next) {
    return;
  }
  total.trackedSubjects += next.trackedSubjects;
  total.registeredDisposables += next.registeredDisposables;
  total.disposedScopes += next.disposedScopes;
  total.disposedResources += next.disposedResources;
  total.overlap.cacheCreations += next.overlap.cacheCreations;
  total.overlap.cacheDisposals += next.overlap.cacheDisposals;
  total.overlap.preparedComponentHits += next.overlap.preparedComponentHits;
  total.overlap.preparedComponentMisses += next.overlap.preparedComponentMisses;
  total.overlap.pairVolumeHits += next.overlap.pairVolumeHits;
  total.overlap.pairVolumeMisses += next.overlap.pairVolumeMisses;
  total.overlap.invalidDiagnosticHits += next.overlap.invalidDiagnosticHits;
  total.overlap.invalidDiagnosticMisses += next.overlap.invalidDiagnosticMisses;
};

const addRuntimeCreations = (total: Record<string, number>, next: Record<string, number> | undefined): void => {
  if (!next) {
    return;
  }
  for (const [key, value] of Object.entries(next)) {
    total[key] = (total[key] ?? 0) + value;
  }
};

const readNodeCliProfile = async (profilePath: string): Promise<NodeCliInvocationProfile | undefined> => {
  try {
    return JSON.parse(await readFile(profilePath, 'utf8')) as NodeCliInvocationProfile;
  } catch {
    return undefined;
  }
};

const createSubject = (stats: GeometrySubject['mesh']['stats']): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'glb',
    stats,
  },
  provenance: {
    source: { kind: 'file', format: 'glb', path: '<load-path-profiler>' },
    unit: 'mm',
    loader: 'gltf-transform',
  },
  capabilities: [
    { kind: 'mesh', feature: 'triangles' },
    { kind: 'mesh', feature: 'bounding-box' },
    { kind: 'mesh', feature: 'connected-components' },
    { kind: 'mesh', feature: 'watertightness' },
    { kind: 'mesh', feature: 'component-overlap' },
  ],
  diagnostics: [],
});

const createSubjectFromGlb = async (options: {
  bytes: Uint8Array;
  io: WebIO;
  samples: LoadPathTimingSample[];
}): Promise<GeometrySubject> => {
  const document = await measure('glbParse', options.samples, () => options.io.readBinary(options.bytes));
  const record = await measure('recordBuild', options.samples, () => buildMeshAnalysisRecord(document));
  const stats = await measure('statsFacade', options.samples, () => createGeometryStatsFromRecord(record));
  await measure('partition', options.samples, () => record.getComponentPartition());
  return createSubject(stats);
};

export const profileLoadPath = async (options: LoadPathProfileOptions): Promise<LoadPathProfileResult> => {
  const samples: LoadPathTimingSample[] = [];
  const iterations = options.iterations ?? 1;
  const io = new WebIO();

  for (let iteration = 0; iteration < iterations; iteration++) {
    const bytes = options.exportGlbBytes
      ? await measure('runtimeExport', samples, options.exportGlbBytes)
      : options.glbBytes;
    if (!bytes) {
      throw new Error('profileLoadPath requires glbBytes or exportGlbBytes.');
    }

    const document = await measure('glbParse', samples, () => io.readBinary(bytes));
    const record = await measure('recordBuild', samples, () => buildMeshAnalysisRecord(document));
    const stats = await measure('statsFacade', samples, () => createGeometryStatsFromRecord(record));
    await measure('partition', samples, () => record.getComponentPartition());

    if (options.richDiagnostics) {
      await measure('richDiagnostics', samples, () => {
        stats.analyseConnectedComponents(0.1);
        stats.analyseWatertight();
      });
    }

    if (options.overlap) {
      await measure('overlap', samples, async () => {
        await analyzeMeshOverlap({
          subject: createSubject(stats),
          tolerance: options.overlapTolerance ?? 0.1,
        });
      });
    }
  }

  return {
    samples,
    summary: summarizeLoadPathSamples(samples),
  };
};

const canonicalPerTestGeoSpecSource = `import { describe, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('canonical per-test load path', () => {
  it('loads for bounds', async () => {
    await loadModel({ file: 'main.ts', format: 'glb' });
  });

  it('loads for watertightness', async () => {
    await loadModel({ format: 'glb', file: 'main.ts' });
  });

  it('loads for connected components', async () => {
    await loadModel({ file: 'main.ts', format: 'glb' });
  });

  it('loads for overlap', async () => {
    await loadModel({ file: 'main.ts', format: 'glb' });
  });
});
`;

export const profileCanonicalPerTestLoadPath = async (options: {
  glbBytes: Uint8Array;
  iterations?: number;
}): Promise<CanonicalPerTestLoadPathProfileResult> => {
  const samples: LoadPathTimingSample[] = [];
  const iterations = options.iterations ?? 1;
  const io = new WebIO();
  let underlyingModelLoaderCalls = 0;
  let passed = 0;
  let failed = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    const filesystem = new MemoryProfileFileSystem();
    filesystem.setText('/project/main.geospec.ts', canonicalPerTestGeoSpecSource);

    const result = await measure('geospecRun', samples, () =>
      runGeoSpecModule({
        filesystem,
        projectPath: '/project',
        entryPath: '/project/main.geospec.ts',
        modelLoader: async () => {
          underlyingModelLoaderCalls += 1;
          return createSubjectFromGlb({ bytes: options.glbBytes, io, samples });
        },
      }),
    );

    if (result.success) {
      passed += result.tests.filter((test) => test.status === 'passed').length;
      failed += result.tests.filter((test) => test.status === 'failed').length;
    } else {
      failed += 1;
    }
  }

  return {
    authoredLoadModelCalls: iterations * 4,
    underlyingModelLoaderCalls,
    passed,
    failed,
    samples,
    summary: summarizeLoadPathSamples(samples),
  };
};

export const profileNodeCliLoadPath = async (
  options: NodeCliLoadPathProfileOptions,
): Promise<NodeCliLoadPathProfileResult> => {
  const samples: LoadPathTimingSample[] = [];
  const iterations = options.iterations ?? 1;
  const cliPath = options.cliPath ?? defaultCliPath();
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const args = [
    'run',
    options.projectPath,
    '--json',
    ...(options.testTimeout ? ['--test-timeout', String(options.testTimeout)] : []),
    ...(options.files ?? []).flatMap((file) => ['--file', file]),
  ];
  const runs: NodeCliLoadPathProfileRun[] = [];

  for (let iteration = 0; iteration < iterations; iteration++) {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'geospec-node-cli-profile-'));
    const profilePath = join(profileDirectory, 'profile.json');
    try {
      const run = await measure('nodeCli', samples, () =>
        runNodeCli({
          nodeExecutable,
          cliPath,
          args,
          cwd: options.cwd,
          env: {
            [profilePathEnvironmentKey]: profilePath,
          },
        }),
      );
      const profile = await readNodeCliProfile(profilePath);
      runs.push({
        ...run,
        ...(profile ? { profile } : {}),
      });
    } finally {
      await rm(profileDirectory, { recursive: true, force: true });
    }
  }

  const successfulInvocations = runs.filter((run) => run.exitCode === 0).length;
  const runtimeCreations: Record<string, number> = {};
  const aggregateModelLoadCache = emptyModelLoadCacheStats();
  const moduleModelLoadCache = emptyModelLoadCacheStats();
  const resourceScope = emptyResourceScopeProfile();
  for (const run of runs) {
    addRuntimeCreations(runtimeCreations, run.profile?.runtime.runtimeCreations);
    addModelLoadCacheStats(aggregateModelLoadCache, run.profile?.runner.aggregateModelLoadCache);
    addModelLoadCacheStats(moduleModelLoadCache, run.profile?.runner.moduleModelLoadCache);
    addResourceScopeProfile(resourceScope, run.profile?.runner.resourceScope);
  }

  return {
    command: {
      nodeExecutable,
      cliPath,
      projectPath: options.projectPath,
      args,
    },
    counters: {
      cliInvocations: runs.length,
      successfulInvocations,
      failedInvocations: runs.length - successfulInvocations,
      runtimeCreations,
      aggregateModelLoadCache,
      moduleModelLoadCache,
      resourceScope,
    },
    runs,
    samples,
    summary: summarizeLoadPathSamples(samples),
  };
};
