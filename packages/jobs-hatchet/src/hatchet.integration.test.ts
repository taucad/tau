import { randomUUID } from 'node:crypto';
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import {
  createJobConformanceProvider,
  createJobProviderHost,
  createMemoryJobArtifactStore,
  digestJobDefinition,
  jobConformanceType,
} from '@taucad/jobs';
import type { JobDefinition } from '@taucad/jobs';
import { afterEach, describe, expect, it } from 'vitest';
import { createHatchetJobTaskProfile, defineHatchetJobTask, submitHatchetJob } from '#hatchet-job-task.js';
import { toHatchetWorkerLabels } from '#hatchet-job-routing.js';
import { createHatchetOwnerAffinity, toHatchetRuntimeWorkerLabels } from '#hatchet-runtime-affinity.js';
import type { HatchetJobProjection, HatchetJobTaskOutput } from '#hatchet-job-task.js';

const integrationTest = process.env['TAU_HATCHET_INTEGRATION'] === '1' ? it : it.skip;
let stopWorker: (() => Promise<unknown>) | undefined;

afterEach(async () => {
  await stopWorker?.();
  stopWorker = undefined;
});

describe('local Hatchet integration', () => {
  integrationTest(
    'dispatches a labeled Tau job through a real worker and returns its durable result',
    async () => {
      const token = process.env['HATCHET_CLIENT_TOKEN'];
      if (!token) {
        throw new TypeError('TAU_HATCHET_INTEGRATION requires HATCHET_CLIENT_TOKEN.');
      }

      const client = new HatchetClient({
        token,
        namespace: process.env['HATCHET_CLIENT_NAMESPACE'] ?? 'tau-local',
      });
      const definition: JobDefinition = {
        type: jobConformanceType,
        version: '1.0.0',
        input: {
          digest: `sha256:${'1'.repeat(64)}`,
          size: 0,
          mediaType: 'application/json',
          storageKey: 'integration/input.json',
        },
        requirements: [],
        slotCost: 1,
        maxAttempts: 1,
        options: { message: 'real-hatchet' },
        outputs: [{ role: 'result', logicalPath: 'result.txt', mediaType: 'text/plain' }],
      };
      const completed = Promise.withResolvers<void>();
      const projection: HatchetJobProjection = {
        async attemptStarted() {
          return { accepted: true };
        },
        async progress() {
          return { accepted: true };
        },
        async heartbeat() {
          return { accepted: true };
        },
        async retrying() {
          return { accepted: true };
        },
        async finished() {
          completed.resolve();
          return { accepted: true };
        },
      };
      const profile = createHatchetJobTaskProfile(definition);
      const registration = defineHatchetJobTask({
        client,
        profile,
        runnerId: 'local-integration-runner',
        host: createJobProviderHost({
          providers: [createJobConformanceProvider()],
          artifactStore: createMemoryJobArtifactStore(),
        }),
        projection,
      });
      const affinity = createHatchetOwnerAffinity('local-integration-owner');
      const worker = await client.worker(`tau-integration-${randomUUID()}`, {
        workflows: [registration.task],
        slots: 1,
        labels: toHatchetWorkerLabels(toHatchetRuntimeWorkerLabels(affinity)),
        handleKill: false,
      });
      const running = worker.start();
      stopWorker = async () => {
        await worker.stop();
        await running;
      };
      await worker.waitUntilReady();

      const outcome = await submitHatchetJob({
        client,
        profile,
        runtimeAffinity: affinity,
        job: {
          jobId: `job-${randomUUID()}`,
          idempotencyKey: randomUUID(),
          definitionDigest: await digestJobDefinition(definition),
          definition,
        },
      });
      if (!outcome.dispatched) {
        expect.fail(outcome.message);
      }
      const result = await client.runRef<Record<string, HatchetJobTaskOutput>>(outcome.workflowRunId).output;
      await completed.promise;

      expect(Object.values(result)).toEqual([expect.objectContaining({ state: 'completed', attempt: 1 })]);
      await stopWorker();
      stopWorker = undefined;
    },
    30_000,
  );
});
