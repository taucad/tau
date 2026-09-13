import { describe, expect, it, vi } from 'vitest';

import { actionDigest, CacheCorruptionError, contentDigest } from '@taucad/cache-core';
import { runOwnerScopedStoreConformance } from '@taucad/cache-core/testing';

import { createMemoryJobArtifactStore, maximumJobActionRecordBytes } from '#job-artifact-store.js';
import { matchJobCapabilities } from '#job-capability-matching.js';
import { createJobClient } from '#job-client.js';
import { createJobConformanceProvider, jobConformanceType } from '#job-conformance-provider.js';
import { digestJobDefinition } from '#job-definition-digest.js';
import { createInMemoryJobCoordinator } from '#job-coordinator.js';
import { createMemoryJobEventStore } from '#job-event-store.js';
import { createJobComputeStores } from '#job-compute-reuse.js';
import { createJobProviderHost, defineJobProvider } from '#job-provider.js';
import type { JobComputeActionRecord } from '#job-artifact-store.js';
import type { JobDefinition, JobJsonObject } from '#job.types.js';

const inputDigest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;

const createDefinition = (overrides: Partial<JobDefinition> = {}): JobDefinition => ({
  type: 'conformance.echo',
  version: '1',
  input: {
    digest: inputDigest,
    size: 0,
    mediaType: 'application/vnd.tau.snapshot',
    storageKey: inputDigest,
  },
  requirements: [{ key: 'executor', condition: 'equals', value: 'deterministic' }],
  slotCost: 1,
  maxAttempts: 2,
  options: { message: 'hello' },
  outputs: [{ role: 'result', logicalPath: 'result.txt', mediaType: 'text/plain' }],
  ...overrides,
});

const createSubmission = async (definition = createDefinition(), idempotencyKey = 'submission-1') => ({
  idempotencyKey,
  definitionDigest: await digestJobDefinition(definition),
  definition,
});

describe('job provider author API', () => {
  it('should expose serializable metadata while executing through the host boundary', async () => {
    type EchoOptions = JobJsonObject & { readonly message: string };
    const progress = vi.fn();
    const artifactStore = createMemoryJobArtifactStore();
    const provider = defineJobProvider<EchoOptions>({
      id: 'deterministic',
      name: 'Deterministic provider',
      version: '1.0.0',
      types: ['conformance.echo'],
      async execute({ lease }, runtime) {
        await runtime.emitProgress({
          phase: 'echo',
          completed: 1,
          total: 1,
          message: lease.definition.options.message,
        });
        const artifact = await runtime.writeArtifact({
          role: 'result',
          logicalPath: 'result.txt',
          mediaType: 'text/plain',
          bytes: new TextEncoder().encode(lease.definition.options.message),
        });
        return { status: 'completed', artifacts: [artifact], result: { echoed: lease.definition.options.message } };
      },
    });

    expect(structuredClone(provider)).toEqual({
      id: 'deterministic',
      name: 'Deterministic provider',
      version: '1.0.0',
      types: ['conformance.echo'],
    });

    const host = createJobProviderHost({ providers: [provider], artifactStore });
    const outcome = await host.execute({
      lease: {
        jobId: 'job-1',
        attemptId: 'attempt-1',
        attempt: 1,
        runnerId: 'runner-1',
        definition: createDefinition(),
        leaseExpiresAt: 1000,
      },
      signal: new AbortController().signal,
      onProgress: async (event) => {
        progress(event);
      },
    });

    expect(progress).toHaveBeenCalledWith({ phase: 'echo', completed: 1, total: 1, message: 'hello' });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') {
      expect.fail('provider should have completed');
    }
    expect(outcome.result).toEqual({ echoed: 'hello' });
    expect(outcome.artifacts).toHaveLength(1);
    const artifact = outcome.artifacts[0];
    expect(artifact?.artifactId).toBe('attempt-1:artifact:1');
    expect(artifact?.provenance).toMatchObject({
      jobId: 'job-1',
      attemptId: 'attempt-1',
      providerId: 'deterministic',
      inputDigest,
    });
    if (!artifact) {
      expect.fail('provider should have emitted an artifact');
    }
    const read = await artifactStore.read({ digest: artifact.digest });
    expect(read.found).toBe(true);
    if (read.found) {
      expect(new TextDecoder().decode(read.bytes)).toBe('hello');
    }
  });

  it('should deduplicate content while returning defensive byte copies', async () => {
    const store = createMemoryJobArtifactStore();
    const bytes = new Uint8Array([1, 2, 3]);
    const first = await store.put({ bytes, mediaType: 'application/octet-stream' });
    bytes[0] = 9;
    const second = await store.put({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'application/octet-stream' });

    expect(second).toEqual(first);
    const read = await store.read({ digest: first.digest });
    expect(read.found).toBe(true);
    if (read.found) {
      read.bytes[0] = 7;
    }
    const reread = await store.read({ digest: first.digest });
    expect(reread).toEqual({ found: true, bytes: new Uint8Array([1, 2, 3]) });
  });

  it('should not expose an unowned artifact through an owner-scoped read', async () => {
    const store = createMemoryJobArtifactStore();
    const stored = await store.put({
      bytes: new TextEncoder().encode('unscoped fixture'),
      mediaType: 'text/plain',
    });

    await expect(
      store.read({
        digest: stored.digest,
        attempt: { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
      }),
    ).resolves.toEqual({ found: false, reason: 'not-found' });
  });

  it('should pass the shared owner-scoped host-store conformance suite', async () => {
    const artifactStore = createMemoryJobArtifactStore();

    await expect(
      runOwnerScopedStoreConformance({
        createStores: () => ({
          primary: createJobComputeStores({
            artifactStore,
            attempt: { jobId: 'job-owner', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
          }),
          sameOwner: createJobComputeStores({
            artifactStore,
            attempt: { jobId: 'job-owner', attemptId: 'attempt-2', attempt: 2, runnerId: 'runner-2' },
          }),
          otherOwner: createJobComputeStores({
            artifactStore,
            attempt: { jobId: 'job-other', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' },
          }),
        }),
      }),
    ).resolves.toBeUndefined();
  });

  it('should reject oversized host action records without making them visible', async () => {
    const store = createMemoryJobArtifactStore();
    if (store.computeReuse.status !== 'supported') {
      expect.fail('The memory job artifact store should support deterministic action records.');
    }
    const attempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };
    const stored = await store.put({
      bytes: new Uint8Array([1]),
      mediaType: 'application/octet-stream',
      attempt,
    });
    const record: JobComputeActionRecord = {
      schemaVersion: 1,
      actionDigest: actionDigest({ value: `sha256:${'d'.repeat(64)}` }),
      codec: { id: 'x'.repeat(maximumJobActionRecordBytes), version: '1' },
      output: {
        digest: contentDigest({ value: stored.digest }),
        size: stored.size,
        mediaType: 'application/octet-stream',
      },
      dependencies: [],
    };

    await expect(store.computeReuse.publishAction({ record, attempt })).resolves.toEqual({
      status: 'rejected',
      reason: 'entry-too-large',
    });
    await expect(store.computeReuse.readAction({ digest: record.actionDigest, attempt })).resolves.toEqual({
      status: 'miss',
    });
  });

  it('should publish action records only after owned content and reuse them across attempts of the same job', async () => {
    const store = createMemoryJobArtifactStore();
    if (store.computeReuse.status !== 'supported') {
      expect.fail('The memory job artifact store should support deterministic action records.');
    }
    const actionStore = store.computeReuse;
    const firstAttempt = {
      jobId: 'job-reuse',
      attemptId: 'attempt-1',
      attempt: 1,
      runnerId: 'runner-1',
    };
    const retryAttempt = {
      jobId: 'job-reuse',
      attemptId: 'attempt-2',
      attempt: 2,
      runnerId: 'runner-2',
    };
    const otherJobAttempt = {
      jobId: 'job-other',
      attemptId: 'attempt-1',
      attempt: 1,
      runnerId: 'runner-1',
    };
    const bytes = new TextEncoder().encode('successful stage');
    const stored = await store.put({ bytes, mediaType: 'application/octet-stream', attempt: firstAttempt });
    const record: JobComputeActionRecord = {
      schemaVersion: 1,
      actionDigest: actionDigest({ value: `sha256:${'a'.repeat(64)}` }),
      codec: { id: 'stage', version: '1' },
      output: {
        digest: contentDigest({ value: stored.digest }),
        size: stored.size,
        mediaType: 'application/octet-stream',
      },
      dependencies: [],
    };

    await expect(actionStore.publishAction({ record, attempt: firstAttempt })).resolves.toEqual({
      status: 'published',
    });
    await expect(actionStore.readAction({ digest: record.actionDigest, attempt: retryAttempt })).resolves.toEqual({
      status: 'hit',
      record,
    });
    await expect(actionStore.readAction({ digest: record.actionDigest, attempt: otherJobAttempt })).resolves.toEqual({
      status: 'miss',
    });
  });

  it('should reject an action record before its output content is owned by that job', async () => {
    const store = createMemoryJobArtifactStore();
    if (store.computeReuse.status !== 'supported') {
      expect.fail('The memory job artifact store should support deterministic action records.');
    }
    const attempt = { jobId: 'job-1', attemptId: 'attempt-1', attempt: 1, runnerId: 'runner-1' };
    await expect(
      store.computeReuse.publishAction({
        attempt,
        record: {
          schemaVersion: 1,
          actionDigest: actionDigest({ value: `sha256:${'b'.repeat(64)}` }),
          codec: { id: 'stage', version: '1' },
          output: {
            digest: contentDigest({ value: `sha256:${'c'.repeat(64)}` }),
            size: 1,
            mediaType: 'application/octet-stream',
          },
          dependencies: [],
        },
      }),
    ).rejects.toBeInstanceOf(CacheCorruptionError);
  });

  it('should provide deterministic output for backend conformance suites', async () => {
    const artifactStore = createMemoryJobArtifactStore();
    const host = createJobProviderHost({
      providers: [createJobConformanceProvider()],
      artifactStore,
    });
    const definition = createDefinition({ type: jobConformanceType });
    const execute = async (attempt: number) =>
      host.execute({
        lease: {
          jobId: 'job-1',
          attemptId: `attempt-${String(attempt)}`,
          attempt,
          runnerId: 'runner-1',
          definition,
          leaseExpiresAt: 1000,
        },
        signal: new AbortController().signal,
        onProgress: async () => undefined,
      });

    const first = await execute(1);
    const second = await execute(2);
    expect(first).toMatchObject({ status: 'completed', result: { echoed: 'hello' } });
    expect(second).toMatchObject({ status: 'completed', result: { echoed: 'hello' } });
    if (first.status !== 'completed' || second.status !== 'completed') {
      expect.fail('conformance provider should complete');
    }
    expect(second.artifacts[0]?.digest).toBe(first.artifacts[0]?.digest);
  });

  it('should hash equivalent option objects identically across insertion order', async () => {
    const first = createDefinition({ options: { beta: 2, alpha: 1 } });
    const second = createDefinition({ options: { alpha: 1, beta: 2 } });

    expect(await digestJobDefinition(first)).toBe(await digestJobDefinition(second));
  });
});

describe('job capability matching', () => {
  it('should enforce scalar requirements and available slots', () => {
    const runner = {
      runnerId: 'runner-1',
      capabilities: { executor: 'deterministic', memory: 16, container: true },
      slots: 4,
    };
    expect(
      matchJobCapabilities({
        runner,
        occupiedSlots: 1,
        slotCost: 2,
        requirements: [
          { key: 'executor', condition: 'one-of', values: ['deterministic', 'native'] },
          { key: 'memory', condition: 'at-least', value: 8 },
          { key: 'container', condition: 'equals', value: true },
        ],
      }),
    ).toEqual({ matched: true, slotCost: 2 });
    expect(
      matchJobCapabilities({
        runner,
        occupiedSlots: 3,
        slotCost: 2,
        requirements: [],
      }),
    ).toEqual({ matched: false, reason: 'insufficient-slots' });
  });
});

describe('durable job event store', () => {
  it('should sequence appends, reject stale writers, and subscribe at any time', async () => {
    const store = createMemoryJobEventStore();
    const observed = vi.fn();
    const unsubscribe = store.on('event', observed);
    const event: { type: 'job-cancelled'; reason: string } = { type: 'job-cancelled', reason: 'done' };
    const first = await store.append({
      jobId: 'job-1',
      expectedSequence: 0,
      recordedAt: 10,
      event,
    });
    event.reason = 'mutated after append';
    const stale = await store.append({
      jobId: 'job-1',
      expectedSequence: 0,
      recordedAt: 11,
      event: { type: 'job-cancelled', reason: 'stale' },
    });
    unsubscribe();
    unsubscribe();

    expect(first).toMatchObject({ appended: true, record: { sequence: 1 } });
    expect(stale).toEqual({ appended: false, reason: 'sequence-conflict', actualSequence: 1 });
    expect(observed).toHaveBeenCalledOnce();
    expect(await store.read({ jobId: 'job-1', afterSequence: 0 })).toEqual([
      expect.objectContaining({ event: { type: 'job-cancelled', reason: 'done' } }),
    ]);
  });
});

describe('in-memory job coordinator conformance', () => {
  it('should lease, heartbeat, reconnect, cancel, and reject late completion deterministically', async () => {
    let currentTime = 100;
    let nextId = 0;
    const coordinator = createInMemoryJobCoordinator({
      now: () => currentTime,
      createId: (kind) => `${kind}-${String(++nextId)}`,
    });
    const client = createJobClient({ coordinator });
    const observed = vi.fn();
    const unsubscribe = client.on('event', observed);

    expect(
      await coordinator.registerRunner({
        runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 2 },
        heartbeatExpiresAt: 10_000,
      }),
    ).toEqual({ accepted: true, replaced: false });
    const submission = await createSubmission(createDefinition(), 'cancel-flow');
    expect(await client.submit({ ...submission, definitionDigest: inputDigest })).toMatchObject({
      accepted: false,
      reason: 'definition-digest-mismatch',
    });
    const submitted = await client.submit(submission);
    expect(submitted.accepted).toBe(true);
    if (!submitted.accepted) {
      expect.fail('definition should have been accepted');
    }
    expect(await client.submit(structuredClone(submission))).toMatchObject({
      accepted: true,
      deduplicated: true,
      job: { jobId: submitted.job.jobId },
    });
    const conflict = await createSubmission(createDefinition({ options: { message: 'different' } }), 'cancel-flow');
    expect(await client.submit(conflict)).toMatchObject({
      accepted: false,
      reason: 'idempotency-conflict',
    });
    const leased = await coordinator.leaseNext({ runnerId: 'runner-1', leaseDuration: 1000 });
    expect(leased.leased).toBe(true);
    if (!leased.leased) {
      expect.fail('job should have been leased');
    }
    expect(await coordinator.startAttempt(leased.lease)).toMatchObject({ accepted: true });
    await coordinator.reportProgress({
      ...leased.lease,
      progress: { phase: 'work', completed: 1, total: 2, message: 'halfway' },
    });
    await client.cancel({ jobId: submitted.job.jobId, reason: 'user requested' });
    currentTime = 200;
    const heartbeat = await coordinator.heartbeatAttempt({ ...leased.lease, leaseDuration: 1000 });
    expect(heartbeat).toMatchObject({ accepted: true, cancellationRequested: true, leaseExpiresAt: 1200 });
    expect(await coordinator.cancelAttempt({ ...leased.lease, reason: 'user requested' })).toMatchObject({
      accepted: true,
      job: { state: 'cancelled' },
    });
    const late = await coordinator.completeAttempt({ ...leased.lease, artifacts: [], result: null });
    expect(late).toMatchObject({ accepted: false, reason: 'attempt-not-active' });

    const events = await client.readEvents({ jobId: submitted.job.jobId, afterSequence: 2 });
    expect(events.map((record) => record.sequence)).toEqual([3, 4, 5, 6, 7]);
    expect(events.map((record) => record.event.type)).toEqual([
      'attempt-started',
      'attempt-progress',
      'cancellation-requested',
      'attempt-heartbeat',
      'attempt-cancelled',
    ]);
    expect(observed).toHaveBeenCalledTimes(7);
    unsubscribe();
  });

  it('should requeue a lost retryable attempt and fence its stale result', async () => {
    let currentTime = 0;
    let nextId = 0;
    const coordinator = createInMemoryJobCoordinator({
      now: () => currentTime,
      createId: (kind) => `${kind}-${String(++nextId)}`,
    });
    await coordinator.registerRunner({
      runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 1 },
      heartbeatExpiresAt: 10_000,
    });
    const submitted = await coordinator.submit(await createSubmission(createDefinition(), 'lost-attempt'));
    expect(submitted.accepted).toBe(true);
    const first = await coordinator.leaseNext({ runnerId: 'runner-1', leaseDuration: 100 });
    expect(first.leased).toBe(true);
    if (!first.leased) {
      expect.fail('first attempt should have been leased');
    }
    await coordinator.startAttempt(first.lease);
    currentTime = 101;
    expect(await coordinator.expireLeases()).toEqual({ lostAttempts: 1, expiredRunners: [] });
    expect(await coordinator.completeAttempt({ ...first.lease, artifacts: [], result: null })).toMatchObject({
      accepted: false,
      reason: 'attempt-not-active',
    });
    const second = await coordinator.leaseNext({ runnerId: 'runner-1', leaseDuration: 100 });
    expect(second).toMatchObject({ leased: true, lease: { attempt: 2 } });
  });

  it('should reject invalid heartbeats and prevent an expired lease from being revived', async () => {
    let currentTime = 10;
    const coordinator = createInMemoryJobCoordinator({
      now: () => currentTime,
      createId: (kind) => `${kind}-1`,
    });
    await coordinator.registerRunner({
      runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 1 },
      heartbeatExpiresAt: 100,
    });
    const submitted = await coordinator.submit(await createSubmission(createDefinition(), 'expired-attempt'));
    expect(submitted.accepted).toBe(true);
    const leased = await coordinator.leaseNext({ runnerId: 'runner-1', leaseDuration: 20 });
    expect(leased.leased).toBe(true);
    if (!leased.leased) {
      expect.fail('job should have been leased');
    }

    expect(await coordinator.heartbeatAttempt({ ...leased.lease, leaseDuration: 0 })).toEqual({
      accepted: false,
      reason: 'invalid-duration',
    });
    currentTime = 31;
    expect(await coordinator.startAttempt(leased.lease)).toMatchObject({
      accepted: false,
      reason: 'lease-expired',
    });
    currentTime = 101;
    expect(await coordinator.heartbeatRunner({ runnerId: 'runner-1', heartbeatExpiresAt: 200 })).toEqual({
      accepted: false,
      reason: 'runner-expired',
    });
  });
});
