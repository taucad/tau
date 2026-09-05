import { describe, expect, it, vi } from 'vitest';

import { startHostJobAttemptHost } from '#job-attempt-host.js';
import type {
  HostJobAttemptLease,
  HostJobCoordinatorPort,
  HostJobExecutionOutcome,
  HostJobExecutor,
} from '#job-attempt-host.js';

type TestDefinition = { readonly value: string };
type TestArtifact = { readonly path: string };
type TestResult = { readonly value: string };

const lease: HostJobAttemptLease<TestDefinition> = {
  jobId: 'job-1',
  attemptId: 'attempt-1',
  attempt: 1,
  runnerId: 'runner-1',
  definition: { value: 'hello' },
  leaseExpiresAt: Date.now() + 10_000,
};

const createCoordinator = (options: {
  readonly onComplete: () => void;
  readonly onCancel: () => void;
  readonly cancellationRequested?: boolean;
}): HostJobCoordinatorPort<TestDefinition, TestArtifact, TestResult> => {
  let available = true;
  return {
    registerRunner: async () => ({ accepted: true }),
    heartbeatRunner: async () => ({ accepted: true }),
    async leaseNext() {
      if (!available) {
        return { leased: false, reason: 'none-available' };
      }
      available = false;
      return { leased: true, lease };
    },
    startAttempt: async () => ({ accepted: true }),
    heartbeatAttempt: async () => ({
      accepted: true,
      cancellationRequested: options.cancellationRequested ?? false,
      leaseExpiresAt: Date.now() + 10_000,
    }),
    reportProgress: async () => ({ accepted: true }),
    async completeAttempt() {
      options.onComplete();
      return { accepted: true };
    },
    failAttempt: async () => ({ accepted: true }),
    async cancelAttempt() {
      options.onCancel();
      return { accepted: true };
    },
  };
};

describe('host job attempt host', () => {
  it('should execute a lease and report its completed outcome through one shared host', async () => {
    const completed = Promise.withResolvers<void>();
    const events = vi.fn();
    const coordinator = createCoordinator({ onComplete: completed.resolve, onCancel: vi.fn() });
    const executor: HostJobExecutor<TestDefinition, TestArtifact, TestResult> = {
      async execute({ lease: input, onProgress }) {
        await onProgress({ phase: 'echo', completed: 1, total: 1, message: input.definition.value });
        return {
          status: 'completed',
          artifacts: [{ path: 'result.txt' }],
          result: { value: input.definition.value },
        };
      },
    };
    const host = startHostJobAttemptHost({
      runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 2 },
      coordinator,
      executor,
      pollInterval: 1,
      heartbeatInterval: 5,
      heartbeatTtl: 100,
      leaseDuration: 100,
      onEvent: events,
    });

    await host.ready;
    await completed.promise;
    await host.close();

    expect(await host.closed).toEqual({ cause: 'requested' });
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: 'attempt', state: 'completed' }));
  });

  it('should forward durable cancellation intent to the active executor signal', async () => {
    const cancelled = Promise.withResolvers<void>();
    const coordinator = createCoordinator({
      onComplete: vi.fn(),
      onCancel: cancelled.resolve,
      cancellationRequested: true,
    });
    const executor: HostJobExecutor<TestDefinition, TestArtifact, TestResult> = {
      async execute({ signal }) {
        return new Promise<HostJobExecutionOutcome<TestArtifact, TestResult>>((resolve) => {
          const onAbort = (): void => {
            resolve({ status: 'cancelled', reason: String(signal.reason) });
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        });
      },
    };
    const host = startHostJobAttemptHost({
      runner: { runnerId: 'runner-1', capabilities: { executor: 'deterministic' }, slots: 1 },
      coordinator,
      executor,
      pollInterval: 1,
      heartbeatInterval: 1,
      heartbeatTtl: 100,
      leaseDuration: 100,
    });

    await host.ready;
    await cancelled.promise;
    await host.dispose();

    expect(await host.closed).toEqual({ cause: 'requested' });
  });
});
