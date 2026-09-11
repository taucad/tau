import { mkdtemp, mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJobProviderHost, createMemoryJobArtifactStore } from '@taucad/jobs';
import type { JobAttemptLease, JobDefinition, JobInputSnapshot } from '@taucad/jobs';
import { describe, expect, it } from 'vitest';

import { calculixSolverVersion, createCalculixCantileverJobDefinition } from '#calculix-definition.js';
import { createCalculixJobProvider } from '#calculix.js';
import { createOpenFoamJobDefinition } from '#openfoam-definition.js';
import { createOpenFoamJobProvider } from '#openfoam.js';
import type {
  SolverInputMaterializer,
  SolverProcessExecution,
  SolverProcessExecutor,
  SolverProcessSpec,
} from '#solver-host.js';
import { createNodeSolverProcessExecutor } from '#solver-host.js';

const snapshot: JobInputSnapshot = {
  digest: 'sha256:0123456789abcdef',
  size: 64,
  mediaType: 'application/vnd.tau.solver-input',
  storageKey: 'cas/01/23',
};

const leaseFor = (definition: JobDefinition): JobAttemptLease => ({
  jobId: 'job-1',
  attemptId: 'attempt-1',
  attempt: 1,
  runnerId: 'runner-1',
  definition,
  leaseExpiresAt: Date.now() + 60_000,
});

const materializer: SolverInputMaterializer = {
  async materialize(input) {
    await mkdir(input.destination, { recursive: true });
    await writeFile(join(input.destination, 'snapshot.txt'), input.snapshot.digest, 'utf8');
  },
};

const createRecordingExecutor = (
  writeOutputs?: (spec: SolverProcessSpec, invocation: number) => Promise<void>,
): { readonly executor: SolverProcessExecutor; readonly specs: SolverProcessSpec[] } => {
  const specs: SolverProcessSpec[] = [];
  return {
    specs,
    executor: {
      async execute(spec): Promise<SolverProcessExecution> {
        specs.push(spec);
        await writeOutputs?.(spec, specs.length);
        await spec.onOutput({ stream: 'stdout', text: 'fake solver output\n' });
        return spec.signal.aborted
          ? { status: 'cancelled', reason: String(spec.signal.reason ?? 'cancelled') }
          : { status: 'exited', exitCode: 0 };
      },
    },
  };
};

const execute = async (definition: JobDefinition, provider: ReturnType<typeof createOpenFoamJobProvider>) => {
  const progress: string[] = [];
  const host = createJobProviderHost({ providers: [provider], artifactStore: createMemoryJobArtifactStore() });
  const outcome = await host.execute({
    lease: leaseFor(definition),
    signal: new AbortController().signal,
    async onProgress(value) {
      progress.push(value.phase);
    },
  });
  return { outcome, progress };
};

describe('OpenFOAM provider', () => {
  it('defaults definitions to pinned v2506 and emits only daemon-authored argv', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-openfoam-test-'));
    const recording = createRecordingExecutor();
    const definition = createOpenFoamJobDefinition({ input: snapshot, preset: 'block-simple-foam' });
    const canonicalWorkspaceRoot = await realpath(workspaceRoot);
    expect(definition.options.solverVersion).toBe('2506');

    const { outcome, progress } = await execute(
      definition,
      createOpenFoamJobProvider({ executor: recording.executor, inputMaterializer: materializer, workspaceRoot }),
    );

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') {
      return;
    }
    expect(recording.specs).toHaveLength(3);
    for (const spec of recording.specs) {
      expect(spec.executable).toBe('docker');
      expect(spec.arguments).toContain(
        'opencfd/openfoam-default:2506@sha256:1578f5ded8bcbc68aa6a98dedd0693c3990bbab3bd6f1c01984e911c681f4e63',
      );
      expect(spec.arguments).not.toContain('bash');
      expect(spec.arguments).not.toContain('-lc');
      expect(spec.arguments).toEqual(
        expect.arrayContaining([
          '--network',
          'none',
          '--cpus',
          '1',
          '--memory',
          '8g',
          '--pids-limit',
          '512',
          '--read-only',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
        ]),
      );
      expect(spec.outputLimit).toBe(64 * 1024 * 1024);
      expect(spec.cwd.startsWith(canonicalWorkspaceRoot)).toBe(true);
    }
    expect(outcome.artifacts.every((artifact) => artifact.artifactId.startsWith('attempt-1:artifact:'))).toBe(true);
    expect(outcome.artifacts.map((artifact) => artifact.logicalPath)).toContain('openfoam/conversion.json');
    expect(progress).toContain('complete');
    await expect(stat(recording.specs[0]?.cwd ?? '')).rejects.toThrow();
  });

  it('uses v2606 only when the definition explicitly opts in', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-openfoam-2606-test-'));
    const recording = createRecordingExecutor();
    const definition = createOpenFoamJobDefinition({
      input: snapshot,
      preset: 'block-rho-central-foam',
      solverVersion: '2606',
    });
    const { outcome } = await execute(
      definition,
      createOpenFoamJobProvider({
        executor: recording.executor,
        inputMaterializer: materializer,
        workspaceRoot,
        images: { '2606': `registry.example/openfoam@sha256:${'b'.repeat(64)}` },
      }),
    );
    expect(outcome.status).toBe('completed');
    expect(
      recording.specs.every((spec) => spec.arguments.includes(`registry.example/openfoam@sha256:${'b'.repeat(64)}`)),
    ).toBe(true);
  });
});

describe('CalculiX provider', () => {
  it('authors coarse/refined decks and persists validated raw evidence', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-calculix-test-'));
    const recording = createRecordingExecutor(async (spec) => {
      const refined = spec.cwd.endsWith('refined');
      const displacement = refined ? 1.85e-4 : 1.7e-4;
      await writeFile(
        join(spec.cwd, 'cantilever.dat'),
        [
          'displacements (vx,vy,vz) for set TIP',
          `1 0 0 -${String(displacement)}`,
          'forces (fx,fy,fz) for set FIXED',
          '1 0 0 1000',
          '',
        ].join('\n'),
        'utf8',
      );
      await writeFile(join(spec.cwd, 'cantilever.frd'), 'fake FRD evidence\n', 'utf8');
    });
    const definition = createCalculixCantileverJobDefinition({
      input: snapshot,
      parameters: {
        length: 1,
        width: 0.1,
        height: 0.1,
        elasticModulus: 210e9,
        poissonRatio: 0.3,
        tipLoad: -1000,
      },
    });
    const image = `registry.example/calculix@sha256:${'a'.repeat(64)}`;
    const provider = createCalculixJobProvider({
      executor: recording.executor,
      inputMaterializer: materializer,
      image: { reference: image, solverVersion: calculixSolverVersion },
      workspaceRoot,
    });
    const { outcome, progress } = await execute(definition, provider);

    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') {
      return;
    }
    expect(recording.specs).toHaveLength(2);
    expect(recording.specs.every((spec) => spec.arguments.includes(image))).toBe(true);
    expect(recording.specs.every((spec) => spec.arguments.slice(-3).join(' ') === 'ccx -i cantilever')).toBe(true);
    expect(recording.specs.every((spec) => !spec.arguments.includes('bash') && !spec.arguments.includes('-lc'))).toBe(
      true,
    );
    expect(
      recording.specs.every(
        (spec) =>
          spec.outputLimit === 64 * 1024 * 1024 &&
          ['--network', 'none', '--memory', '4g', '--pids-limit', '256', '--read-only', '--cap-drop', 'ALL'].every(
            (argument) => spec.arguments.includes(argument),
          ),
      ),
    ).toBe(true);
    expect(outcome.artifacts.map((artifact) => artifact.logicalPath)).toEqual(
      expect.arrayContaining([
        'calculix/coarse/cantilever.inp',
        'calculix/coarse/cantilever.dat',
        'calculix/coarse/cantilever.frd',
        'calculix/refined/cantilever.inp',
        'calculix/refined/cantilever.dat',
        'calculix/refined/cantilever.frd',
        'calculix/summary.json',
        'calculix/report.md',
        'calculix/undeformed-input.glb',
        'calculix/conversion.json',
      ]),
    );
    expect(outcome.artifacts.find(({ logicalPath }) => logicalPath === 'calculix/undeformed-input.glb')).toMatchObject({
      role: 'geometry-input',
      mediaType: 'model/gltf-binary',
    });
    expect(outcome.result).toMatchObject({
      solverVersion: '2.23',
      image,
      geometry: {
        logicalPath: 'calculix/undeformed-input.glb',
        geometryState: 'undeformed-input',
        deformationApplied: false,
        resultFieldsIncluded: false,
      },
      validation: { status: 'passed' },
    });
    expect(progress).toContain('validate');
    await expect(stat(recording.specs[0]?.cwd ?? '')).rejects.toThrow();
  });

  it('rejects an image that claims the wrong solver release', () => {
    const recording = createRecordingExecutor();
    expect(() =>
      createCalculixJobProvider({
        executor: recording.executor,
        inputMaterializer: materializer,
        image: {
          reference: 'calculix/ccx:latest',
          // @ts-expect-error The public contract only accepts reviewed CalculiX 2.23 images.
          solverVersion: '2.16',
        },
      }),
    ).toThrow('requires solver version 2.23');
  });

  it('rejects mutable CalculiX image tags', () => {
    const recording = createRecordingExecutor();
    expect(() =>
      createCalculixJobProvider({
        executor: recording.executor,
        inputMaterializer: materializer,
        image: { reference: 'calculix/ccx:2.23', solverVersion: '2.23' },
      }),
    ).toThrow('immutable image reference');
  });
});

describe('native solver process isolation', () => {
  it.each([1, 4, 16])('contains %i crashing attempts and remains able to run the next process', async (count) => {
    const executor = createNodeSolverProcessExecutor();
    const cwd = await mkdtemp(join(tmpdir(), 'tau-solver-crash-blast-'));
    const executeChild = async (exitCode: number) =>
      executor.execute({
        executable: process.execPath,
        arguments: ['-e', `process.exit(${String(exitCode)})`],
        cwd,
        environment: {},
        signal: new AbortController().signal,
        terminationGrace: 1000,
        outputLimit: 1024,
        onOutput: async () => undefined,
      });

    await expect(Promise.all(Array.from({ length: count }, async () => executeChild(17)))).resolves.toEqual(
      Array.from({ length: count }, () => ({ status: 'exited', exitCode: 17 })),
    );
    await expect(executeChild(0)).resolves.toEqual({ status: 'exited', exitCode: 0 });
  });

  it('kills a process tree when combined stdout and stderr exceeds its bound', async () => {
    const executor = createNodeSolverProcessExecutor();
    const cwd = await mkdtemp(join(tmpdir(), 'tau-solver-output-limit-'));
    await expect(
      executor.execute({
        executable: process.execPath,
        arguments: ['-e', "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000)"],
        cwd,
        environment: {},
        signal: new AbortController().signal,
        terminationGrace: 100,
        outputLimit: 128,
        onOutput: async () => undefined,
      }),
    ).rejects.toThrow('output exceeded 128 bytes');
  });
});
