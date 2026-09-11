import { randomUUID } from 'node:crypto';
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import {
  createJobProviderHost,
  createMemoryJobArtifactStore,
  defineJobProvider,
  digestJobDefinition,
} from '@taucad/jobs';
import type { JobAttemptIdentity, JobDefinition, JobProviderExecutionOutcome } from '@taucad/jobs';
import { afterEach, describe, expect, it } from 'vitest';
import { toHatchetWorkerLabels } from '#hatchet-job-routing.js';
import { createHatchetJobTaskProfile, defineHatchetJobTask, submitHatchetJob } from '#hatchet-job-task.js';
import type {
  HatchetJobProjection,
  HatchetJobProjectionMutationOutcome,
  HatchetJobSubmission,
  HatchetJobTaskOutput,
} from '#hatchet-job-task.js';
import { createHatchetOwnerAffinity, toHatchetRuntimeWorkerLabels } from '#hatchet-runtime-affinity.js';

const chaosTest = process.env['TAU_HATCHET_CHAOS_INTEGRATION'] === '1' ? it : it.skip;
const digest: `sha256:${string}` = `sha256:${'c'.repeat(64)}`;
const testType = 'tau.test.hatchet-chaos';
const accepted = async (): Promise<HatchetJobProjectionMutationOutcome> => ({ accepted: true });

type WorkerHandle = {
  readonly worker: Awaited<ReturnType<HatchetClient['worker']>>;
  readonly running: Promise<void>;
  stopping?: Promise<void>;
};

const workers: WorkerHandle[] = [];

const stopWorker = async (handle: WorkerHandle): Promise<void> => {
  handle.stopping ??= (async () => {
    await handle.worker.stop();
    await handle.running;
  })();
  await handle.stopping;
};

afterEach(async () => {
  await Promise.allSettled(workers.splice(0).map(async (handle) => stopWorker(handle)));
});

const createDefinition = (mode: string): JobDefinition => ({
  type: testType,
  version: '1.0.0',
  input: {
    digest,
    size: 0,
    mediaType: 'application/json',
    storageKey: `chaos/${mode}.json`,
  },
  requirements: [],
  slotCost: 1,
  maxAttempts: 1,
  options: { mode },
  outputs: [],
});

const createSubmission = async (input: {
  readonly definition: JobDefinition;
  readonly idempotencyKey?: string;
}): Promise<HatchetJobSubmission> => ({
  jobId: `job-${randomUUID()}`,
  idempotencyKey: input.idempotencyKey ?? randomUUID(),
  definitionDigest: await digestJobDefinition(input.definition),
  definition: input.definition,
});

const createClient = (): HatchetClient => {
  const token = process.env['HATCHET_CLIENT_TOKEN'];
  if (!token) {
    throw new TypeError('TAU_HATCHET_CHAOS_INTEGRATION requires HATCHET_CLIENT_TOKEN.');
  }
  return new HatchetClient({
    token,
    namespace: process.env['HATCHET_CLIENT_NAMESPACE'] ?? 'tau-local',
  });
};

const createProjection = (overrides: Partial<HatchetJobProjection> = {}): HatchetJobProjection => ({
  attemptStarted: accepted,
  progress: accepted,
  heartbeat: accepted,
  retrying: accepted,
  finished: accepted,
  ...overrides,
});

const startWorker = async (input: {
  readonly client: HatchetClient;
  readonly registration: ReturnType<typeof defineHatchetJobTask>;
  readonly affinity: ReturnType<typeof createHatchetOwnerAffinity>;
  readonly name: string;
}): Promise<WorkerHandle> => {
  const worker = await input.client.worker(`${input.name}-${randomUUID()}`, {
    workflows: [input.registration.task],
    slots: 1,
    labels: toHatchetWorkerLabels(toHatchetRuntimeWorkerLabels(input.affinity)),
    handleKill: false,
  });
  const handle: WorkerHandle = { worker, running: worker.start() };
  workers.push(handle);
  await worker.waitUntilReady();
  return handle;
};

const submit = async (input: {
  readonly client: HatchetClient;
  readonly definition: JobDefinition;
  readonly submission: HatchetJobSubmission;
  readonly affinity: ReturnType<typeof createHatchetOwnerAffinity>;
}) =>
  submitHatchetJob({
    client: input.client,
    profile: createHatchetJobTaskProfile(input.definition),
    runtimeAffinity: input.affinity,
    job: input.submission,
  });

const outputFor = async (client: HatchetClient, workflowRunId: string): Promise<HatchetJobTaskOutput> => {
  const output = await client.runRef<Record<string, HatchetJobTaskOutput>>(workflowRunId).output;
  const [attempt] = Object.values(output);
  if (!attempt) {
    throw new TypeError(`Hatchet run ${workflowRunId} returned no task output.`);
  }
  return attempt;
};

describe('local Hatchet chaos conformance', () => {
  chaosTest(
    'deduplicates an identical in-flight submission and executes it once',
    async () => {
      const client = createClient();
      const definition = createDefinition('idempotency');
      const affinity = createHatchetOwnerAffinity(`chaos-idempotency-${randomUUID()}`);
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let executions = 0;
      const provider = defineJobProvider({
        id: 'hatchet-chaos-idempotency',
        name: 'Hatchet chaos idempotency provider',
        version: '1.0.0',
        types: [testType],
        async execute() {
          executions += 1;
          started.resolve();
          await release.promise;
          return { status: 'completed', artifacts: [], result: { executions } };
        },
      });
      const registration = defineHatchetJobTask({
        client,
        profile: createHatchetJobTaskProfile(definition),
        runnerId: 'chaos-idempotency-runner',
        host: createJobProviderHost({
          providers: [provider],
          artifactStore: createMemoryJobArtifactStore(),
        }),
        projection: createProjection(),
      });
      await startWorker({ client, registration, affinity, name: 'tau-chaos-idempotency' });
      const submission = await createSubmission({ definition, idempotencyKey: `same-${randomUUID()}` });

      const first = await submit({ client, definition, submission, affinity });
      if (!first.dispatched) {
        expect.fail(first.message);
      }
      await started.promise;
      const duplicate = await submit({ client, definition, submission, affinity });
      if (!duplicate.dispatched) {
        expect.fail(duplicate.message);
      }

      expect(duplicate).toEqual({
        dispatched: true,
        workflowRunId: first.workflowRunId,
        deduplicated: true,
      });
      release.resolve();
      await expect(outputFor(client, first.workflowRunId)).resolves.toMatchObject({ state: 'completed' });
      expect(executions).toBe(1);
    },
    60_000,
  );

  chaosTest(
    'drains an in-flight worker while a replacement accepts new work',
    async () => {
      const client = createClient();
      const definition = createDefinition('drain');
      const affinity = createHatchetOwnerAffinity(`chaos-drain-${randomUUID()}`);
      const firstStarted = Promise.withResolvers<void>();
      const releaseFirst = Promise.withResolvers<void>();
      const runners = new Map<string, string>();
      const provider = defineJobProvider({
        id: 'hatchet-chaos-drain',
        name: 'Hatchet chaos drain provider',
        version: '1.0.0',
        types: [testType],
        async execute({ lease }) {
          if (lease.definition.options['mode'] === 'drain-first') {
            firstStarted.resolve();
            await releaseFirst.promise;
          }
          return { status: 'completed', artifacts: [], result: { runnerId: lease.runnerId } };
        },
      });
      const projection = createProjection({
        async attemptStarted(input) {
          runners.set(input.jobId, input.runnerId);
          return { accepted: true };
        },
      });
      const firstDefinition = createDefinition('drain-first');
      const registration = defineHatchetJobTask({
        client,
        profile: createHatchetJobTaskProfile(definition),
        runnerId: 'chaos-drain-runner',
        host: createJobProviderHost({
          providers: [provider],
          artifactStore: createMemoryJobArtifactStore(),
        }),
        projection,
      });
      const firstWorker = await startWorker({ client, registration, affinity, name: 'tau-chaos-drain-a' });
      const firstSubmission = await createSubmission({ definition: firstDefinition });
      const first = await submit({ client, definition: firstDefinition, submission: firstSubmission, affinity });
      if (!first.dispatched) {
        expect.fail(first.message);
      }
      await firstStarted.promise;

      let drainSettled = false;
      const draining = (async () => {
        await stopWorker(firstWorker);
        drainSettled = true;
      })();
      await startWorker({ client, registration, affinity, name: 'tau-chaos-drain-b' });
      const replacementSubmission = await createSubmission({ definition });
      const replacement = await submit({ client, definition, submission: replacementSubmission, affinity });
      if (!replacement.dispatched) {
        expect.fail(replacement.message);
      }
      await expect(outputFor(client, replacement.workflowRunId)).resolves.toMatchObject({ state: 'completed' });

      expect(drainSettled).toBe(false);
      expect(runners.get(firstSubmission.jobId)).toBe('chaos-drain-runner');
      expect(runners.get(replacementSubmission.jobId)).toBe('chaos-drain-runner');
      releaseFirst.resolve();
      await expect(outputFor(client, first.workflowRunId)).resolves.toMatchObject({ state: 'completed' });
      await draining;
    },
    90_000,
  );

  chaosTest(
    'propagates cancellation and fences an uncooperative late completion',
    async () => {
      const client = createClient();
      const definition = createDefinition('cancellation');
      const affinity = createHatchetOwnerAffinity(`chaos-cancel-${randomUUID()}`);
      const started = Promise.withResolvers<void>();
      const abortObserved = Promise.withResolvers<unknown>();
      const release = Promise.withResolvers<void>();
      const fenced = Promise.withResolvers<JobAttemptIdentity & { readonly outcome: JobProviderExecutionOutcome }>();
      let cancellationRequested = false;
      const provider = defineJobProvider({
        id: 'hatchet-chaos-cancellation',
        name: 'Hatchet chaos cancellation provider',
        version: '1.0.0',
        types: [testType],
        async execute(_input, runtime) {
          const observeAbort = () => {
            abortObserved.resolve(runtime.signal.reason);
          };
          runtime.signal.addEventListener('abort', observeAbort, { once: true });
          if (runtime.signal.aborted) {
            observeAbort();
          }
          started.resolve();
          // Deliberately model non-cooperative native work. Hatchet can signal it,
          // but only the durable Tau projection can fence its late completion.
          await release.promise;
          return { status: 'completed', artifacts: [], result: { late: true } };
        },
      });
      const projection = createProjection({
        async finished(input) {
          if (!cancellationRequested) {
            return { accepted: true };
          }
          fenced.resolve(input);
          return { accepted: false, reason: 'job cancellation already won the terminal fence' };
        },
      });
      const registration = defineHatchetJobTask({
        client,
        profile: createHatchetJobTaskProfile(definition),
        runnerId: 'chaos-cancellation-runner',
        host: createJobProviderHost({
          providers: [provider],
          artifactStore: createMemoryJobArtifactStore(),
        }),
        projection,
      });
      await startWorker({ client, registration, affinity, name: 'tau-chaos-cancellation' });
      const submission = await createSubmission({ definition });
      const dispatched = await submit({ client, definition, submission, affinity });
      if (!dispatched.dispatched) {
        expect.fail(dispatched.message);
      }
      await started.promise;

      cancellationRequested = true;
      await client.runs.cancel({ ids: [dispatched.workflowRunId] });
      await expect(abortObserved.promise).resolves.toBeDefined();
      release.resolve();
      const late = await fenced.promise;

      expect(late.jobId).toBe(submission.jobId);
      expect(late.outcome).toEqual({
        status: 'completed',
        artifacts: [],
        result: { late: true },
      });
    },
    60_000,
  );
});
