import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import { ConfigService } from '@nestjs/config';
import type { JobDefinition } from '@taucad/jobs';
import { createHatchetOwnerAffinity, hatchetOwnerAffinityLabel } from '@taucad/jobs-hatchet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { JobOrchestratorService } from '#api/jobs/job-orchestrator.service.js';

const hatchetTestToken = `x.${Buffer.from(
  '{"sub":"tenant-test","server_url":"http://127.0.0.1:8080","grpc_broadcast_address":"127.0.0.1:7077"}',
).toString('base64url')}.x`;

describe('JobOrchestratorService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps dispatch durably retryable when Hatchet is not configured', async () => {
    const values: Record<string, unknown> = {};
    Reflect.set(values, 'HATCHET_CLIENT_TOKEN', '');
    Reflect.set(values, 'HATCHET_CLIENT_NAMESPACE', 'tau-test');
    const config = new ConfigService<Environment, true>(values);
    const service = new JobOrchestratorService(config);
    const digest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;

    await expect(
      service.dispatch({
        ownerId: 'owner-1',
        jobId: 'job-1',
        idempotencyKey: 'request-1',
        definitionDigest: digest,
        definition: {
          type: 'conformance.echo',
          version: '1',
          input: { digest, size: 0, mediaType: 'application/json', storageKey: 'inputs/empty' },
          requirements: [],
          slotCost: 1,
          maxAttempts: 1,
          options: {},
          outputs: [],
        },
      }),
    ).resolves.toEqual({
      dispatched: false,
      retryable: true,
      message: 'Durable job orchestration is not configured.',
    });
  });

  it('adds server-owned affinity to Hatchet routing without adding owner identity to the job payload', async () => {
    const getWorkflowRunId = vi.fn(async () => 'hatchet-run-1');
    const runReference = { getWorkflowRunId } as unknown as Awaited<ReturnType<HatchetClient['runNoWait']>>;
    const runNoWait = vi.spyOn(HatchetClient.prototype, 'runNoWait').mockResolvedValue(runReference);
    const values: Record<string, unknown> = {};
    Reflect.set(values, 'HATCHET_CLIENT_TOKEN', hatchetTestToken);
    Reflect.set(values, 'HATCHET_CLIENT_NAMESPACE', 'tau-test');
    const config = new ConfigService<Environment, true>(values);
    const service = new JobOrchestratorService(config);
    const digest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;
    const definition: JobDefinition = {
      type: 'conformance.echo',
      version: '1',
      input: { digest, size: 0, mediaType: 'application/json', storageKey: 'inputs/empty' },
      requirements: [{ key: 'container.engine', condition: 'equals', value: 'docker' }],
      slotCost: 1,
      maxAttempts: 1,
      options: {},
      outputs: [],
    };

    await expect(
      service.dispatch({
        ownerId: 'owner-a',
        jobId: 'job-1',
        idempotencyKey: 'request-1',
        definitionDigest: digest,
        definition,
      }),
    ).resolves.toEqual({ dispatched: true, orchestratorRunId: 'hatchet-run-1', deduplicated: false });

    const affinity = createHatchetOwnerAffinity('owner-a');
    expect(runNoWait).toHaveBeenCalledWith(
      expect.any(String),
      {
        jobId: 'job-1',
        idempotencyKey: 'request-1',
        definitionDigest: digest,
        definition,
      },
      expect.objectContaining({
        desiredWorkerLabels: {
          'container.engine': { value: 'docker', required: true },
          [hatchetOwnerAffinityLabel]: { value: affinity.value, required: true },
        },
      }),
    );
    expect(runNoWait.mock.calls[0]?.[1]).not.toHaveProperty('ownerId');
    expect(definition.requirements).toEqual([{ key: 'container.engine', condition: 'equals', value: 'docker' }]);
  });
});
