import { describe, expect, it } from 'vitest';

import { digestJobDefinition } from '#job-definition-digest.js';
import { createInMemoryJobCoordinator } from '#job-coordinator.js';
import type { JobAttemptLease, JobDefinition } from '#job.types.js';

const scaleIt = process.env['TAU_SCALE_TESTS'] === '1' ? it : it.skip;
const inputDigest: `sha256:${string}` = `sha256:${'0'.repeat(64)}`;

const definition: JobDefinition = {
  type: 'conformance.scale',
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
  options: {},
  outputs: [],
};

describe('durable job scale conformance', () => {
  scaleIt('processes 1,000 queued jobs through 64 bounded slots and replays exact cursors', async () => {
    let nextId = 0;
    const coordinator = createInMemoryJobCoordinator({
      now: () => 1,
      createId: (kind) => `${kind}-${String(++nextId)}`,
    });
    const runnerIds = Array.from({ length: 8 }, (_, index) => `runner-${String(index + 1)}`);
    await Promise.all(
      runnerIds.map(async (runnerId) =>
        coordinator.registerRunner({
          runner: { runnerId, capabilities: { executor: 'deterministic' }, slots: 8 },
          heartbeatExpiresAt: 10_000,
        }),
      ),
    );

    const definitionDigest = await digestJobDefinition(definition);
    const submitted = await Promise.all(
      Array.from({ length: 1000 }, async (_, index) =>
        coordinator.submit({ idempotencyKey: `scale-${String(index)}`, definitionDigest, definition }),
      ),
    );
    expect(submitted.every((outcome) => outcome.accepted && !outcome.deduplicated)).toBe(true);

    const completedJobIds: string[] = [];
    let peakActive = 0;
    while (completedJobIds.length < submitted.length) {
      const leases: JobAttemptLease[] = [];
      for (const runnerId of runnerIds) {
        for (let slot = 0; slot < 8; slot += 1) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- reference coordinator defines deterministic lease order.
          const outcome = await coordinator.leaseNext({ runnerId, leaseDuration: 1000 });
          if (outcome.leased) {
            leases.push(outcome.lease);
          }
        }
      }
      peakActive = Math.max(peakActive, leases.length);
      expect(leases.length).toBeGreaterThan(0);
      expect(runnerIds.every((runnerId) => leases.filter((lease) => lease.runnerId === runnerId).length <= 8)).toBe(
        true,
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- one completed batch releases slots for the next batch.
      await Promise.all(leases.map(async (lease) => coordinator.startAttempt(lease)));
      // oxlint-disable-next-line eslint/no-await-in-loop -- one completed batch releases slots for the next batch.
      await Promise.all(
        leases.map(async (lease) => {
          const outcome = await coordinator.completeAttempt({ ...lease, artifacts: [], result: null });
          expect(outcome).toMatchObject({ accepted: true, job: { state: 'completed' } });
          completedJobIds.push(lease.jobId);
        }),
      );
    }

    expect(peakActive).toBe(64);
    expect(new Set(completedJobIds).size).toBe(1000);
    await Promise.all(
      completedJobIds.slice(0, 100).map(async (jobId, index) => {
        const afterSequence = index % 4;
        const events = await coordinator.readEvents({ jobId, afterSequence });
        expect(events.map(({ sequence }) => sequence)).toEqual(
          Array.from({ length: 4 - afterSequence }, (_, offset) => afterSequence + offset + 1),
        );
      }),
    );
  });
});
