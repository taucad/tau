import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { Worker } from '@hatchet-dev/typescript-sdk/v1/index.js';
import { createJobProviderHost, createMemoryJobArtifactStore } from '@taucad/jobs';
import type { JobDefinition, JobProviderHost } from '@taucad/jobs';
import { createHatchetJobTaskProfile, hatchetOwnerAffinityLabel } from '@taucad/jobs-hatchet';
import type { HatchetJobProjection, HatchetJobSubmission, HatchetJobTaskOutput } from '@taucad/jobs-hatchet';
import { calculixSolverVersion, createOpenFoamJobDefinition, createOpenFoamJobProvider } from '@taucad/jobs-solvers';
import type {
  SolverInputMaterializer,
  SolverProcessExecution,
  SolverProcessExecutor,
  SolverProcessSpec,
} from '@taucad/jobs-solvers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startHatchetHostJobWorker } from '#hatchet-job-worker.js';
import { createSolverHatchetJobWorkerFactory } from '#solver-job-worker.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const digest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;
const hatchetTestToken = `x.${Buffer.from(
  '{"sub":"tenant-test","server_url":"http://127.0.0.1:8080","grpc_broadcast_address":"127.0.0.1:7077"}',
).toString('base64url')}.x`;

const definition: JobDefinition = {
  type: 'tau.test.worker',
  version: '1.0.0',
  input: { digest, size: 0, mediaType: 'application/test', storageKey: 'test' },
  requirements: [{ key: 'container.engine', condition: 'equals', value: 'docker' }],
  slotCost: 1,
  maxAttempts: 1,
  options: {},
  outputs: [],
};

const host: JobProviderHost = {
  async execute() {
    return { status: 'completed', artifacts: [], result: null };
  },
};

const accepted = async () => ({ accepted: true }) as const;

const projection = (): HatchetJobProjection => ({
  attemptStarted: vi.fn(accepted),
  progress: vi.fn(accepted),
  heartbeat: vi.fn(accepted),
  retrying: vi.fn(accepted),
  finished: vi.fn(accepted),
});

type CapturedTask = {
  readonly fn: (
    input: HatchetJobSubmission,
    context: {
      worker: { id(): string };
      abortController: AbortController;
      taskRunExternalId(): string;
      retryCount(): number;
      workflowRunId(): string;
    },
  ) => Promise<HatchetJobTaskOutput>;
};

const clientHarness = () => {
  const tasks: CapturedTask[] = [];
  const client = {
    task: vi.fn((task: CapturedTask) => {
      tasks.push(task);
      return task;
    }),
  } as unknown as HatchetClient;
  return { client, tasks };
};

const workerHarness = (options: { readonly stopsUnexpectedly?: boolean } = {}) => {
  const stopped = Promise.withResolvers<void>();
  const worker = {
    start: vi.fn(async () => (options.stopsUnexpectedly ? undefined : stopped.promise)),
    waitUntilReady: vi.fn(async () => {
      await Promise.resolve();
    }),
    stop: vi.fn(async () => {
      stopped.resolve();
    }),
  };
  const create = vi.fn(async () => worker);
  return { worker, create };
};

describe('startHatchetHostJobWorker', () => {
  it('advertises exact labels and slots, then drains through Hatchet stop', async () => {
    const client = clientHarness();
    const boundary = workerHarness();
    const profile = createHatchetJobTaskProfile(definition);
    const worker = startHatchetHostJobWorker({
      client: client.client,
      registration: {
        runnerId: 'device-1-solvers',
        capabilities: {
          'container.engine': 'docker',
          'cpu.count': 4,
          'solver.openfoam.version': '2506',
          'provider.tau.openfoam.container.version': '1.0.0',
        },
        slots: 4,
      },
      profiles: [profile],
      host,
      projection: projection(),
      workerFactory: boundary.create,
    });

    await worker.ready;
    expect(boundary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'device-1-solvers',
        slots: 4,
        labels: {
          'container.engine': 'docker',
          'cpu.count': 4,
          'solver.openfoam.version': '2506',
          'provider.tau.openfoam.container.version': '1.0.0',
        },
      }),
    );
    expect(client.tasks).toHaveLength(1);

    await worker.close();
    expect(boundary.worker.stop).toHaveBeenCalledOnce();
    await expect(worker.closed).resolves.toEqual({ cause: 'requested' });
  });

  it('reports an SDK worker that exits without drain as fatal', async () => {
    const client = clientHarness();
    const boundary = workerHarness({ stopsUnexpectedly: true });
    const worker = startHatchetHostJobWorker({
      client: client.client,
      registration: { runnerId: 'device-1-solvers', capabilities: {}, slots: 1 },
      profiles: [createHatchetJobTaskProfile(definition)],
      host,
      projection: projection(),
      workerFactory: boundary.create,
    });

    await worker.ready;
    const result = await worker.closed;
    expect(result.cause).toBe('fatal');
    if (result.cause === 'fatal') {
      expect(result.error.message).toContain('stopped unexpectedly');
    }
  });

  it('propagates Hatchet cancellation to the solver process boundary and projects one cancelled terminal state', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-hatchet-cancel-'));
    const processStarted = Promise.withResolvers<SolverProcessSpec>();
    const executor: SolverProcessExecutor = {
      async execute(spec): Promise<SolverProcessExecution> {
        processStarted.resolve(spec);
        if (!spec.signal.aborted) {
          await new Promise<void>((resolve) => {
            spec.signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
        }
        return { status: 'cancelled', reason: String(spec.signal.reason ?? 'cancelled') };
      },
    };
    const materializer: SolverInputMaterializer = {
      async materialize(input) {
        await mkdir(input.destination, { recursive: true });
      },
    };
    const openFoamDefinition = createOpenFoamJobDefinition({
      input: { digest, size: 0, mediaType: 'application/test', storageKey: 'test' },
      preset: 'block-simple-foam',
    });
    const provider = createOpenFoamJobProvider({ executor, inputMaterializer: materializer, workspaceRoot });
    const client = clientHarness();
    const boundary = workerHarness();
    const sink = projection();
    const worker = startHatchetHostJobWorker({
      client: client.client,
      registration: {
        runnerId: 'device-1-solvers',
        capabilities: {
          'container.engine': 'docker',
          'cpu.count': 1,
          'solver.openfoam.version': '2506',
        },
        slots: 1,
      },
      profiles: [createHatchetJobTaskProfile(openFoamDefinition)],
      host: createJobProviderHost({ providers: [provider], artifactStore: createMemoryJobArtifactStore() }),
      projection: sink,
      workerFactory: boundary.create,
    });
    await worker.ready;
    const task = client.tasks[0];
    if (!task) {
      expect.fail('Expected one registered OpenFOAM task.');
    }
    const abortController = new AbortController();
    const taskResult = task.fn(
      {
        jobId: 'job-1',
        idempotencyKey: 'request-1',
        definitionDigest: digest,
        definition: openFoamDefinition,
      },
      {
        worker: { id: () => 'hatchet-worker-1' },
        abortController,
        taskRunExternalId: () => 'attempt-1',
        retryCount: () => 0,
        workflowRunId: () => 'run-1',
      },
    );
    const processSpec = await processStarted.promise;
    abortController.abort(new Error('cancelled by test'));

    await expect(taskResult).resolves.toMatchObject({ state: 'cancelled' });
    expect(processSpec.signal.aborted).toBe(true);
    expect(sink.finished).toHaveBeenCalledOnce();
    const finishedInput = vi.mocked(sink.finished).mock.calls[0]?.[0];
    expect(finishedInput?.outcome.status).toBe('cancelled');
    await worker.close();
  });
});

describe('createSolverHatchetJobWorkerFactory', () => {
  it('registers every configured static provider/retry profile and advertises exact provider capabilities', async () => {
    const boundary = workerHarness();
    const workerFactory = vi
      .spyOn(HatchetClient.prototype, 'worker')
      .mockResolvedValue(boundary.worker as unknown as Worker);
    const factory = createSolverHatchetJobWorkerFactory({
      hatchetToken: hatchetTestToken,
      hatchetNamespace: 'tau-test',
      fetch: vi.fn(async (input) => {
        const url = String(input);
        if (url.endsWith('/v1/agents/worker-affinity')) {
          return Response.json({ runtimeAffinity: { kind: 'owner', value: `sha256:${'a'.repeat(64)}` } });
        }
        if (url.endsWith('/v1/jobs/runners/register')) {
          return Response.json({ accepted: true });
        }
        if (url.endsWith('/v1/jobs/runners/drain')) {
          return new Response(null, { status: 204 });
        }
        return new Response(null, { status: 500 });
      }),
      slots: 1,
      supportedMaxAttempts: [2, 1, 2],
      openFoamSolverVersion: '2506',
      calculixImage: {
        reference: `registry.example/calculix@sha256:${'a'.repeat(64)}`,
        solverVersion: calculixSolverVersion,
      },
      inputMaterializer: {
        async materialize(input) {
          input.signal.throwIfAborted();
        },
      },
    });

    const worker = await factory.start({
      apiUrl: new URL('https://tau.invalid'),
      credential: { v: 1, deviceId: 'device-1', credential: 'x'.repeat(32) },
    });
    await worker.ready;

    expect(worker.profiles).toHaveLength(4);
    expect(new Set(worker.profiles.map(({ name }) => name)).size).toBe(4);
    expect(worker.registration).toMatchObject({
      runnerId: 'device-1',
      slots: 1,
      capabilities: {
        'container.engine': 'docker',
        'cpu.count': 1,
        'solver.openfoam.version': '2506',
        'solver.calculix.version': '2.23',
        'provider.tau.openfoam.container.id': 'tau.openfoam.container',
        'provider.tau.openfoam.container.version': '1.0.0',
        'provider.tau.calculix.container.id': 'tau.calculix.container',
        'provider.tau.calculix.container.version': '1.0.0',
        [hatchetOwnerAffinityLabel]: `sha256:${'a'.repeat(64)}`,
      },
    });
    const workerCall = workerFactory.mock.calls[0];
    expect(workerCall?.[0]).toBe('device-1');
    expect(workerCall?.[1]).toMatchObject({ slots: 1, handleKill: false });
    const workerOptions = workerCall?.[1];
    if (typeof workerOptions !== 'object') {
      expect.fail('Expected Hatchet worker options.');
    }
    expect(Array.isArray(workerOptions.workflows)).toBe(true);
    expect(workerOptions.workflows).toHaveLength(4);

    await worker.close();
    workerFactory.mockRestore();
  });
});
