import { WebIO } from '@gltf-transform/core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exposeEngineSubject } from '#engine/subject-store.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { buildMeshAnalysisRecord, recordGeometryStats } from '#mesh/analysis-record.js';
import type { GeometrySubject } from '#mesh/types.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';
import { summarizeLoadPathSamples } from '#experiments/load-path/summary.js';
import type { LoadPathBucket, LoadPathSummary, LoadPathTimingSample } from '#experiments/load-path/summary.js';

/**
 *
 */
export type LoadPathProfileOptions = {
  glbBytes?: Uint8Array<ArrayBuffer>;
  exportGlbBytes?: () => Promise<Uint8Array<ArrayBuffer>>;
  iterations?: number;
  richDiagnostics?: boolean;
  overlap?: boolean;
  overlapTolerance?: number;
};

/**
 *
 */
export type LoadPathProfileResult = {
  samples: LoadPathTimingSample[];
  summary: LoadPathSummary;
};

/**
 *
 */
export type CanonicalPerTestLoadPathProfileResult = LoadPathProfileResult & {
  authoredLoadModelCalls: number;
  underlyingModelLoaderCalls: number;
  passed: number;
  failed: number;
};

/**
 *
 */
export type NodeCliLoadPathProfileOptions = {
  projectPath: string;
  cliPath?: string;
  nodeExecutable?: string;
  files?: string[];
  testTimeout?: number;
  iterations?: number;
  cwd?: string;
};

/**
 *
 */
export type NodeCliLoadPathProfileRun = {
  exitCode: number | undefined;
  signal: NodeJS.Signals | undefined;
  stdoutBytes: number;
  stderrBytes: number;
};

/**
 *
 */
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
  };
  runs: NodeCliLoadPathProfileRun[];
};

class MemoryProfileFileSystem {
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

const defaultCliPath = (): string => fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));

const runNodeCli = async (options: {
  nodeExecutable: string;
  cliPath: string;
  args: readonly string[];
  cwd?: string;
}): Promise<NodeCliLoadPathProfileRun> =>
  new Promise((resolve, reject) => {
    const child = spawn(options.nodeExecutable, [options.cliPath, ...options.args], {
      cwd: options.cwd,
      env: process.env,
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
        exitCode: exitCode ?? undefined,
        signal: signal ?? undefined,
        stdoutBytes,
        stderrBytes,
      });
    });
  });

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
  bytes: Uint8Array<ArrayBuffer>;
  io: WebIO;
  samples: LoadPathTimingSample[];
}): Promise<GeometrySubject> => {
  const document = await measure('glbParse', options.samples, async () => options.io.readBinary(options.bytes));
  const record = await measure('recordBuild', options.samples, () => buildMeshAnalysisRecord(document));
  const stats = await measure('statsFacade', options.samples, () => recordGeometryStats(record));
  await measure('partition', options.samples, () => stats.analyseConnectedComponents(0.1));
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

    const document = await measure('glbParse', samples, async () => io.readBinary(bytes));
    const record = await measure('recordBuild', samples, () => buildMeshAnalysisRecord(document));
    const stats = await measure('statsFacade', samples, () => recordGeometryStats(record));
    await measure('partition', samples, () => stats.analyseConnectedComponents(0.1));

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
  glbBytes: Uint8Array<ArrayBuffer>;
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
    const runner = createSerialGeoSpecRunner({
      filesystem,
      modelLoader: async () => {
        underlyingModelLoaderCalls += 1;
        return exposeEngineSubject(await createSubjectFromGlb({ bytes: options.glbBytes, io, samples }));
      },
    });
    const result = await measure('geospecRun', samples, async () => {
      try {
        return await runner.run({ files: ['/project/main.geospec.ts'] });
      } finally {
        await runner.close();
      }
    });
    passed += result.passed;
    failed += result.failed;
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
    runs.push(
      await measure('nodeCli', samples, async () =>
        runNodeCli({
          nodeExecutable,
          cliPath,
          args,
          cwd: options.cwd,
        }),
      ),
    );
  }

  const successfulInvocations = runs.filter((run) => run.exitCode === 0).length;

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
    },
    runs,
    samples,
    summary: summarizeLoadPathSamples(samples),
  };
};
