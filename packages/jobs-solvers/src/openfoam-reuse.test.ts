import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJobProviderHost, createMemoryJobArtifactStore } from '@taucad/jobs';
import type { JobArtifactStore, JobAttemptLease, JobDefinition, JobProviderExecutionOutcome } from '@taucad/jobs';
import { afterEach, describe, expect, it } from 'vitest';

import { createOpenFoamJobDefinition } from '#openfoam-definition.js';
import { createOpenFoamJobProvider } from '#openfoam.js';
import type {
  SolverInputMaterializer,
  SolverProcessExecution,
  SolverProcessExecutor,
  SolverProcessSpec,
} from '#solver-host.js';

const inputDigest: `sha256:${string}` = `sha256:${'1'.repeat(64)}`;

const materializer: SolverInputMaterializer = {
  async materialize(input) {
    await mkdir(input.destination, { recursive: true });
    await writeFile(join(input.destination, 'case.in'), `input=${input.snapshot.digest}\n`, 'utf8');
  },
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

const createWorkspaceRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-openfoam-reuse-'));
  roots.push(root);
  return root;
};

const definitionFor = (
  preset: 'block-rho-central-foam' | 'block-simple-foam',
  options: { readonly ranks?: number } = {},
): JobDefinition =>
  createOpenFoamJobDefinition({
    input: {
      digest: inputDigest,
      size: 128,
      mediaType: 'application/vnd.tau.openfoam-case',
      storageKey: 'opaque/input-1',
    },
    preset,
    ranks: options.ranks,
    maxAttempts: 3,
  });

const leaseFor = (
  definition: JobDefinition,
  input: { readonly jobId: string; readonly attempt: number },
): JobAttemptLease => ({
  jobId: input.jobId,
  attemptId: `${input.jobId}-attempt-${String(input.attempt)}`,
  attempt: input.attempt,
  runnerId: `runner-${String(input.attempt)}`,
  definition,
  leaseExpiresAt: Date.now() + 60_000,
});

const stageCommand = (spec: SolverProcessSpec): string => {
  const imageIndex = spec.arguments.findIndex((argument) => argument.includes('@sha256:'));
  if (imageIndex === -1) {
    throw new Error('OpenFOAM stage command was not present in the daemon-authored argument vector.');
  }
  const command = spec.arguments[imageIndex + 1];
  if (command === undefined) {
    throw new Error('OpenFOAM stage command was not present in the daemon-authored argument vector.');
  }
  return command;
};

const createStageExecutor = (
  options: {
    readonly cancelOn?: string;
    readonly failOn?: string;
    readonly loseOn?: string;
  } = {},
): { readonly commands: string[]; readonly executor: SolverProcessExecutor } => {
  const commands: string[] = [];
  return {
    commands,
    executor: {
      async execute(spec): Promise<SolverProcessExecution> {
        const command = stageCommand(spec);
        commands.push(command);
        await writeFile(join(spec.cwd, `completed-${command}`), `${command}\n`, 'utf8');
        await spec.onOutput({ stream: 'stdout', text: `${command}\n` });
        if (options.loseOn === command) {
          throw new Error(`runner lost while executing ${command}`);
        }
        if (options.cancelOn === command) {
          return { status: 'cancelled', reason: `cancelled ${command}` };
        }
        return { status: 'exited', exitCode: options.failOn === command ? 17 : 0 };
      },
    },
  };
};

const executeAttempt = async (input: {
  readonly artifactStore: JobArtifactStore;
  readonly definition: JobDefinition;
  readonly executor: SolverProcessExecutor;
  readonly workspaceRoot: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly image?: string;
}): Promise<JobProviderExecutionOutcome> => {
  const provider = createOpenFoamJobProvider({
    executor: input.executor,
    inputMaterializer: materializer,
    workspaceRoot: input.workspaceRoot,
    ...(input.image === undefined ? {} : { images: { '2506': input.image } }),
  });
  const host = createJobProviderHost({ providers: [provider], artifactStore: input.artifactStore });
  return host.execute({
    lease: leaseFor(input.definition, { jobId: input.jobId, attempt: input.attempt }),
    signal: new AbortController().signal,
    onProgress: async () => undefined,
  });
};

const artifactDigests = (outcome: JobProviderExecutionOutcome): Readonly<Record<string, string>> => {
  if (outcome.status !== 'completed') {
    expect.fail('OpenFOAM attempt should have completed.');
  }
  return Object.fromEntries(outcome.artifacts.map((artifact) => [artifact.logicalPath, artifact.digest]));
};

describe('OpenFOAM deterministic stage reuse', () => {
  it('should resume the longest valid stage prefix after runner loss', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const lost = createStageExecutor({ loseOn: 'checkMesh' });

    const first = await executeAttempt({
      artifactStore,
      definition,
      executor: lost.executor,
      workspaceRoot,
      jobId: 'job-retry',
      attempt: 1,
    });
    expect(first.status).toBe('failed');
    expect(lost.commands).toEqual(['blockMesh', 'checkMesh']);

    const retry = createStageExecutor();
    const second = await executeAttempt({
      artifactStore,
      definition,
      executor: retry.executor,
      workspaceRoot,
      jobId: 'job-retry',
      attempt: 2,
    });
    expect(second.status).toBe('completed');
    expect(retry.commands).toEqual(['checkMesh', 'simpleFoam']);
  });

  it('should preserve prefix hits when only the late solver command changes', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const cold = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition: definitionFor('block-simple-foam'),
      executor: cold.executor,
      workspaceRoot,
      jobId: 'job-late-edit',
      attempt: 1,
    });

    const edited = createStageExecutor();
    const outcome = await executeAttempt({
      artifactStore,
      definition: definitionFor('block-rho-central-foam'),
      executor: edited.executor,
      workspaceRoot,
      jobId: 'job-late-edit',
      attempt: 2,
    });
    expect(outcome.status).toBe('completed');
    expect(edited.commands).toEqual(['rhoCentralFoam']);
  });

  it('should invalidate stages when the exact container execution environment changes', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const cold = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition: definitionFor('block-simple-foam'),
      executor: cold.executor,
      workspaceRoot,
      jobId: 'job-environment',
      attempt: 1,
    });

    const edited = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition: definitionFor('block-simple-foam', { ranks: 2 }),
      executor: edited.executor,
      workspaceRoot,
      jobId: 'job-environment',
      attempt: 2,
    });
    expect(edited.commands).toEqual(['blockMesh', 'checkMesh', 'decomposePar', 'mpirun', 'reconstructPar']);
  });

  it('should invalidate every stage when the pinned solver image changes', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const cold = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: cold.executor,
      workspaceRoot,
      jobId: 'job-image',
      attempt: 1,
    });

    const edited = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: edited.executor,
      workspaceRoot,
      jobId: 'job-image',
      attempt: 2,
      image: `example.invalid/openfoam@sha256:${'f'.repeat(64)}`,
    });
    expect(edited.commands).toEqual(['blockMesh', 'checkMesh', 'simpleFoam']);
  });

  it('should not expose one job owner stage records to another job owner', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const first = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: first.executor,
      workspaceRoot,
      jobId: 'job-owner-a',
      attempt: 1,
    });

    const second = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: second.executor,
      workspaceRoot,
      jobId: 'job-owner-b',
      attempt: 1,
    });
    expect(second.commands).toEqual(['blockMesh', 'checkMesh', 'simpleFoam']);
  });

  it('should preserve successful stages without publishing a failed stage', async () => {
    const backingStore = createMemoryJobArtifactStore();
    const publications: string[] = [];
    if (backingStore.computeReuse.status !== 'supported') {
      expect.fail('Memory job artifact store should support action records.');
    }
    const { computeReuse } = backingStore;
    const artifactStore: JobArtifactStore = {
      async put(input) {
        publications.push('content');
        return backingStore.put(input);
      },
      async read(input) {
        return backingStore.read(input);
      },
      computeReuse: {
        status: 'supported',
        async readAction(input) {
          return computeReuse.readAction(input);
        },
        async publishAction(input) {
          publications.push('action');
          return computeReuse.publishAction(input);
        },
      },
    };
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const failed = createStageExecutor({ failOn: 'checkMesh' });
    const first = await executeAttempt({
      artifactStore,
      definition,
      executor: failed.executor,
      workspaceRoot,
      jobId: 'job-failure',
      attempt: 1,
    });
    expect(first).toMatchObject({
      status: 'failed',
      failure: { code: 'OPENFOAM_STAGE_FAILED', retryable: false },
    });
    expect(publications.filter((event) => event === 'action')).toHaveLength(1);
    expect(publications.slice(0, 2)).toEqual(['content', 'action']);

    const retry = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: retry.executor,
      workspaceRoot,
      jobId: 'job-failure',
      attempt: 2,
    });
    expect(retry.commands).toEqual(['checkMesh', 'simpleFoam']);
  });

  it('should preserve successful stages without publishing an aborted stage', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const cancelled = createStageExecutor({ cancelOn: 'checkMesh' });
    const first = await executeAttempt({
      artifactStore,
      definition,
      executor: cancelled.executor,
      workspaceRoot,
      jobId: 'job-cancelled',
      attempt: 1,
    });
    expect(first.status).toBe('cancelled');

    const retry = createStageExecutor();
    await executeAttempt({
      artifactStore,
      definition,
      executor: retry.executor,
      workspaceRoot,
      jobId: 'job-cancelled',
      attempt: 2,
    });
    expect(retry.commands).toEqual(['checkMesh', 'simpleFoam']);
  });

  it('should produce exact terminal artifact bytes on a fully reused attempt', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const workspaceRoot = await createWorkspaceRoot();
    const definition = definitionFor('block-simple-foam');
    const cold = createStageExecutor();
    const coldOutcome = await executeAttempt({
      artifactStore,
      definition,
      executor: cold.executor,
      workspaceRoot,
      jobId: 'job-parity',
      attempt: 1,
    });

    const warm = createStageExecutor();
    const warmOutcome = await executeAttempt({
      artifactStore,
      definition,
      executor: warm.executor,
      workspaceRoot,
      jobId: 'job-parity',
      attempt: 2,
    });
    expect(warm.commands).toEqual([]);
    expect(warmOutcome.status).toBe('completed');
    expect(warmOutcome.status === 'completed' && coldOutcome.status === 'completed' && warmOutcome.result).toEqual(
      coldOutcome.status === 'completed' ? coldOutcome.result : undefined,
    );
    expect(artifactDigests(warmOutcome)).toEqual(artifactDigests(coldOutcome));
  });
});
