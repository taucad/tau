import { describe, expect, it, vi } from 'vitest';
import { IdempotencyCollisionError, WorkerLabelComparator } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { JobDefinition, JobProviderExecutionOutcome, JobProviderHost } from '@taucad/jobs';
import { createHatchetJobTaskProfile, defineHatchetJobTask, submitHatchetJob } from '#hatchet-job-task.js';
import type {
  HatchetJobProjection,
  HatchetJobProjectionMutationOutcome,
  HatchetJobSubmission,
  HatchetJobTaskOutput,
  HatchetJobTaskProfile,
} from '#hatchet-job-task.js';
import { toHatchetDesiredWorkerLabels, toHatchetWorkerLabels } from '#hatchet-job-routing.js';
import {
  createHatchetOwnerAffinity,
  hatchetOwnerAffinityLabel,
  toHatchetRuntimeWorkerLabels,
} from '#hatchet-runtime-affinity.js';

const digest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;

const definition = (overrides: Partial<JobDefinition> = {}): JobDefinition => ({
  type: 'conformance.echo',
  version: '1',
  input: {
    digest,
    size: 0,
    mediaType: 'application/vnd.tau.snapshot',
    storageKey: digest,
  },
  requirements: [
    { key: 'container', condition: 'equals', value: true },
    { key: 'memory', condition: 'at-least', value: 8 },
  ],
  slotCost: 2,
  maxAttempts: 3,
  options: { message: 'hello' },
  outputs: [],
  ...overrides,
});

const profile: HatchetJobTaskProfile = {
  name: 'tau-job-slot-2-attempts-3',
  slotCost: 2,
  maxAttempts: 3,
  executionTimeout: '2h',
  scheduleTimeout: '24h',
  idempotencyTtl: 86_400_000,
};

const job = (overrides: Partial<HatchetJobSubmission> = {}): HatchetJobSubmission => ({
  jobId: 'job-1',
  idempotencyKey: 'request-1',
  definitionDigest: digest,
  definition: definition(),
  ...overrides,
});

const accepted = async (): Promise<HatchetJobProjectionMutationOutcome> => ({ accepted: true });

const projection = (): HatchetJobProjection => ({
  attemptStarted: vi.fn(accepted),
  progress: vi.fn(accepted),
  heartbeat: vi.fn(accepted),
  retrying: vi.fn(accepted),
  finished: vi.fn(accepted),
});

type CapturedTask = {
  readonly retries: number;
  readonly slotCost: number;
  readonly idempotency: { readonly expression: string };
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
  let captured: CapturedTask | undefined;
  const task = {
    runNoWait: vi.fn(),
  };
  const runNoWait = vi.fn(async () => ({ getWorkflowRunId: async () => 'hatchet-run-1' }));
  const client = {
    runNoWait,
    task: vi.fn((input: CapturedTask) => {
      captured = input;
      return task;
    }),
  } as unknown as HatchetClient;
  return { client, runNoWait, captured: () => captured };
};

describe('Hatchet job routing', () => {
  it('maps exact, boolean, and minimum requirements without weakening them', () => {
    expect(toHatchetWorkerLabels({ container: true, memory: 16 })).toEqual({ container: 'true', memory: 16 });
    expect(toHatchetDesiredWorkerLabels(definition().requirements)).toEqual({
      matched: true,
      labels: {
        container: { value: 'true', required: true },
        memory: {
          value: 8,
          required: true,
          comparator: WorkerLabelComparator.LESS_THAN_OR_EQUAL,
        },
      },
    });
  });

  it('fails closed for an OR requirement Hatchet cannot represent', () => {
    expect(toHatchetDesiredWorkerLabels([{ key: 'os', condition: 'one-of', values: ['linux', 'darwin'] }])).toEqual({
      matched: false,
      reason: 'unsupported-one-of',
      key: 'os',
    });
  });
});

describe('Hatchet job task adapter', () => {
  it('derives the same bounded static profile for submitters and workers', () => {
    expect(createHatchetJobTaskProfile(definition())).toEqual({
      name: 'tau-job-Uws96jdj-xYyGA9g-s2-a3',
      slotCost: 2,
      maxAttempts: 3,
      executionTimeout: '168h',
      scheduleTimeout: '168h',
      idempotencyTtl: 604_800_000,
    });
  });

  it('binds profile capacity and projects provider execution by Hatchet attempt identity', async () => {
    const harness = clientHarness();
    const progress = { phase: 'solve', completed: 1, total: 2, message: 'running' };
    const host: JobProviderHost = {
      async execute(input) {
        await input.onProgress(progress);
        return { status: 'completed', artifacts: [], result: { ok: true } };
      },
    };
    const sink = projection();
    defineHatchetJobTask({ client: harness.client, profile, runnerId: 'runner-1', host, projection: sink });
    const task = harness.captured();
    expect(task).toMatchObject({
      retries: 2,
      slotCost: 2,
      idempotency: { expression: 'input.idempotencyKey' },
    });
    if (!task) {
      expect.fail('Hatchet task should be captured');
    }

    await expect(
      task.fn(job(), {
        taskRunExternalId: () => 'attempt-2',
        retryCount: () => 1,
        workflowRunId: () => 'hatchet-run-1',
        worker: { id: () => 'runner-1' },
        abortController: new AbortController(),
      }),
    ).resolves.toEqual({
      jobId: 'job-1',
      attemptId: 'attempt-2',
      attempt: 2,
      runnerId: 'runner-1',
      state: 'completed',
    });
    expect(sink.progress).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2, progress }));
    expect(sink.finished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: { status: 'completed', artifacts: [], result: { ok: true } } }),
    );
  });

  it('asks Hatchet to retry only a retryable provider failure below maxAttempts', async () => {
    const harness = clientHarness();
    const host: JobProviderHost = {
      execute: vi.fn(
        async (): Promise<JobProviderExecutionOutcome> => ({
          status: 'failed',
          failure: { code: 'TRANSIENT', message: 'retry me', retryable: true },
        }),
      ),
    };
    const sink = projection();
    defineHatchetJobTask({ client: harness.client, profile, runnerId: 'runner-1', host, projection: sink });
    const task = harness.captured();
    if (!task) {
      expect.fail('Hatchet task should be captured');
    }

    await expect(
      task.fn(job(), {
        taskRunExternalId: () => 'attempt-1',
        retryCount: () => 0,
        workflowRunId: () => 'hatchet-run-1',
        worker: { id: () => 'runner-1' },
        abortController: new AbortController(),
      }),
    ).rejects.toThrow('retry me');
    expect(sink.retrying).toHaveBeenCalledOnce();
    expect(sink.finished).not.toHaveBeenCalled();
  });

  it('submits with runtime affinity and returns Hatchet idempotency collisions as deduplication', async () => {
    const harness = clientHarness();

    const runtimeAffinity = createHatchetOwnerAffinity('owner-a');
    await expect(submitHatchetJob({ client: harness.client, profile, job: job(), runtimeAffinity })).resolves.toEqual({
      dispatched: true,
      workflowRunId: 'hatchet-run-1',
      deduplicated: false,
    });
    expect(harness.runNoWait).toHaveBeenCalledOnce();
    expect(harness.runNoWait).toHaveBeenCalledWith(profile.name, job(), {
      additionalMetadata: {
        tauJobId: 'job-1',
        definitionDigest: digest,
      },
      desiredWorkerLabels: {
        container: { value: 'true', required: true },
        memory: {
          value: 8,
          required: true,
          comparator: WorkerLabelComparator.LESS_THAN_OR_EQUAL,
        },
        [hatchetOwnerAffinityLabel]: { value: runtimeAffinity.value, required: true },
      },
    });

    harness.runNoWait.mockRejectedValueOnce(new IdempotencyCollisionError('hatchet-run-existing'));
    await expect(submitHatchetJob({ client: harness.client, profile, job: job(), runtimeAffinity })).resolves.toEqual({
      dispatched: true,
      workflowRunId: 'hatchet-run-existing',
      deduplicated: true,
    });
  });

  it('keeps owner affinity outside the job definition and prevents cross-owner worker matching', () => {
    const ownerA = createHatchetOwnerAffinity('owner-a');
    const ownerB = createHatchetOwnerAffinity('owner-b');
    const desiredOwnerA = {
      [hatchetOwnerAffinityLabel]: { value: ownerA.value, required: true },
    };
    const secondOwnerWorkerLabels = toHatchetWorkerLabels(toHatchetRuntimeWorkerLabels(ownerB));
    expect(ownerA.value).not.toBe(ownerB.value);
    expect(toHatchetRuntimeWorkerLabels(ownerA)).toEqual({
      [hatchetOwnerAffinityLabel]: ownerA.value,
    });
    expect(toHatchetRuntimeWorkerLabels(ownerB)).not.toEqual(toHatchetRuntimeWorkerLabels(ownerA));
    expect(secondOwnerWorkerLabels[hatchetOwnerAffinityLabel]).not.toBe(desiredOwnerA[hatchetOwnerAffinityLabel].value);
    expect(definition().requirements).not.toContainEqual(expect.objectContaining({ key: hatchetOwnerAffinityLabel }));
  });
});
