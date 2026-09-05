import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { asc, eq } from 'drizzle-orm';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { JobArtifactManifest, JobDefinition } from '@taucad/jobs';
import { digestJobDefinition } from '@taucad/jobs';
import type { Environment } from '#config/environment.config.js';
import { durableStreamEvent, jobArtifact, user } from '#database/schema.js';
import { DatabaseService } from '#database/database.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { DurableEventsService } from '#api/durable-events/durable-events.service.js';
import { jobArtifactStorageKey } from '#api/jobs/job-artifacts.js';
import { JobsService } from '#api/jobs/jobs.service.js';

const runIntegration = process.env['TAU_JOBS_INTEGRATION'] === '1';
const ownerId = `jobs-integration-${randomUUID()}`;

const createDefinition = (storageKey = 'inputs/fixture.json'): JobDefinition => ({
  type: 'conformance.echo',
  version: '1',
  input: {
    digest: `sha256:${'1'.repeat(64)}`,
    size: 2,
    mediaType: 'application/json',
    storageKey,
  },
  requirements: [{ key: 'os', condition: 'equals', value: 'linux' }],
  slotCost: 1,
  maxAttempts: 2,
  options: { value: 'ok' },
  outputs: [{ role: 'result', logicalPath: 'result.json', mediaType: 'application/json' }],
});

describe.skipIf(!runIntegration)('JobsService PostgreSQL integration', () => {
  let databaseService: DatabaseService;
  let initialized = false;
  let jobs: JobsService;
  const objectStorage = mockDeep<ObjectStorageService>();

  beforeAll(async () => {
    if (!runIntegration) {
      return;
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('TAU_JOBS_INTEGRATION requires DATABASE_URL.');
    }
    const configValues: Record<string, unknown> = {};
    Reflect.set(configValues, 'DATABASE_URL', databaseUrl);
    const config = new ConfigService<Environment>(configValues) as unknown as ConfigService<Environment, true>;
    databaseService = new DatabaseService(config, mockDeep<PinoLogger>());
    await databaseService.onModuleInit();
    await databaseService.database.insert(user).values({
      id: ownerId,
      name: 'Jobs integration',
      email: `${ownerId}@example.invalid`,
    });
    initialized = true;
    objectStorage.headBlob.mockResolvedValue({
      contentType: 'application/json',
      size: 2,
      etag: 'etag',
      cacheControl: '',
    });
    objectStorage.getBlob.mockImplementation(async () => ({
      body: Readable.from([Buffer.from('{}')]),
      contentType: 'application/json',
      etag: 'etag',
      contentLength: 2,
    }));
    jobs = new JobsService(databaseService, mockDeep<DurableEventsService>(), objectStorage);
  });

  afterAll(async () => {
    if (!initialized) {
      return;
    }
    await databaseService.database.delete(user).where(eq(user.id, ownerId));
    await databaseService.onModuleDestroy();
  });

  it('atomically deduplicates admission, fences attempts, and publishes one ordered result', async () => {
    const projectId = `project-${randomUUID()}`;
    const idempotencyKey = randomUUID();
    const definition = createDefinition();
    const definitionDigest = await digestJobDefinition(definition);
    const input = { ownerId, projectId, idempotencyKey, definition, definitionDigest };

    const submissions = await Promise.all(Array.from({ length: 20 }, async () => jobs.submit(input)));
    const jobIds = new Set(submissions.map(({ job }) => job['jobId']));
    expect(jobIds).toHaveLength(1);
    expect(submissions.filter(({ deduplicated }) => !deduplicated)).toHaveLength(1);

    const conflictingDefinition = createDefinition('inputs/conflict.json');
    await expect(
      jobs.submit({
        ...input,
        definition: conflictingDefinition,
        definitionDigest: await digestJobDefinition(conflictingDefinition),
      }),
    ).rejects.toMatchObject({ response: { code: 'JOB_IDEMPOTENCY_CONFLICT' } });

    const jobId = [...jobIds][0];
    expect(jobId).toEqual(expect.any(String));
    if (typeof jobId !== 'string') {
      throw new TypeError('Job admission did not return a job ID.');
    }

    const claims = await Promise.all(Array.from({ length: 8 }, async () => jobs.claimDispatch()));
    const claim = claims.find((candidate) => candidate !== undefined);
    expect(claims.filter((candidate) => candidate !== undefined)).toHaveLength(1);
    if (!claim) {
      throw new Error('Dispatch claim was not created.');
    }
    const workflowRunId = `workflow-${randomUUID()}`;
    await jobs.reportDispatch({
      claim,
      outcome: { dispatched: true, orchestratorRunId: workflowRunId, deduplicated: false },
    });

    const identity = {
      ownerId,
      jobId,
      attemptId: `attempt-${randomUUID()}`,
      attempt: 1,
      runnerId: `runner-${randomUUID()}`,
    };
    await expect(
      jobs.registerRunner({
        ownerId,
        runnerId: identity.runnerId,
        capabilities: { os: 'linux' },
        slots: 1,
      }),
    ).resolves.toEqual({ accepted: true });
    await expect(jobs.startAttempt({ ...identity, workflowRunId, definitionDigest })).resolves.toEqual({
      accepted: true,
    });
    await expect(jobs.startAttempt({ ...identity, workflowRunId, definitionDigest })).resolves.toEqual({
      accepted: true,
    });
    await expect(
      jobs.startAttempt({ ...identity, runnerId: 'runner-conflict', workflowRunId, definitionDigest }),
    ).resolves.toEqual({ accepted: false, reason: 'attempt-conflict' });
    await expect(
      jobs.reportProgress({
        ...identity,
        progress: { phase: 'execute', completed: 1, total: 2, message: 'halfway' },
      }),
    ).resolves.toEqual({ accepted: true });

    const artifactDigest = `sha256:${createHash('sha256').update('{}').digest('hex')}` as const;
    const artifact: JobArtifactManifest = {
      artifactId: `artifact-${randomUUID()}`,
      digest: artifactDigest,
      size: 2,
      mediaType: 'application/json',
      role: 'result',
      logicalPath: 'result.json',
      storageKey: jobArtifactStorageKey(ownerId, artifactDigest),
      provenance: {
        jobId,
        attemptId: identity.attemptId,
        attempt: identity.attempt,
        runnerId: identity.runnerId,
        providerId: definition.type,
        providerVersion: definition.version,
        inputDigest: definition.input.digest,
      },
    };
    await expect(
      jobs.finishAttempt({
        ...identity,
        outcome: { status: 'completed', artifacts: [artifact], result: { ok: true } },
      }),
    ).resolves.toEqual({ accepted: true });
    await expect(
      jobs.reportProgress({
        ...identity,
        progress: { phase: 'late', completed: 2, total: 2, message: 'stale' },
      }),
    ).resolves.toEqual({ accepted: false, reason: 'attempt-not-active' });

    const snapshot = await jobs.get({ ownerId, jobId });
    expect(snapshot).toMatchObject({ state: 'completed', currentAttempt: 1, artifacts: [artifact] });
    const events = await databaseService.database
      .select({ sequence: durableStreamEvent.sequence, type: durableStreamEvent.type })
      .from(durableStreamEvent)
      .where(eq(durableStreamEvent.streamId, snapshot!['streamId'] as string))
      .orderBy(asc(durableStreamEvent.sequence));
    expect(events).toEqual([
      { sequence: 1, type: 'job.submitted' },
      { sequence: 2, type: 'job.dispatched' },
      { sequence: 3, type: 'job.attempt-started' },
      { sequence: 4, type: 'job.progress' },
      { sequence: 5, type: 'job.completed' },
    ]);
    await expect(
      databaseService.database.select().from(jobArtifact).where(eq(jobArtifact.id, artifact.artifactId)),
    ).resolves.toHaveLength(1);
  });

  it('cancels a queued job without dispatching it', async () => {
    const definition = createDefinition();
    const submission = await jobs.submit({
      ownerId,
      projectId: `project-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      definition,
      definitionDigest: await digestJobDefinition(definition),
    });
    const { jobId } = submission.job;
    if (typeof jobId !== 'string') {
      throw new TypeError('Job admission did not return a job ID.');
    }

    await expect(jobs.requestCancellation({ ownerId, jobId, reason: 'integration-test' })).resolves.toBe('accepted');
    await expect(jobs.get({ ownerId, jobId })).resolves.toMatchObject({ state: 'cancelled' });
    await expect(jobs.claimDispatch()).resolves.toBeUndefined();
  });
});
