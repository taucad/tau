import type { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { JobProviderHost, JobRunnerRegistration } from '@taucad/jobs';
import { defineHatchetJobTask, toHatchetWorkerLabels } from '@taucad/jobs-hatchet';
import type { HatchetJobProjection, HatchetJobTaskProfile, HatchetJobTaskRegistration } from '@taucad/jobs-hatchet';

import type { HostJobWorkerCloseResult, HostJobWorkerHandle } from '#job-worker.js';

/** Narrow Hatchet SDK worker lifecycle used by daemon tests. @internal */
type HostHatchetWorkerBoundary = {
  start(): Promise<unknown>;
  waitUntilReady(): Promise<void>;
  stop(): Promise<unknown>;
};

/** Injectable factory for the narrow Hatchet worker lifecycle. @internal */
type HostHatchetWorkerBoundaryFactory = (input: {
  readonly client: HatchetClient;
  readonly name: string;
  readonly workflows: ReadonlyArray<HatchetJobTaskRegistration['task']>;
  readonly slots: number;
  readonly labels: Readonly<Record<string, string | number>>;
}) => Promise<HostHatchetWorkerBoundary>;

const defaultWorkerFactory: HostHatchetWorkerBoundaryFactory = async (input) =>
  input.client.worker(input.name, {
    workflows: [...input.workflows],
    slots: input.slots,
    labels: input.labels,
    handleKill: false,
  });

const assertRegistration = (registration: JobRunnerRegistration): void => {
  if (!registration.runnerId.trim()) {
    throw new TypeError('startHatchetHostJobWorker: runnerId must be non-empty.');
  }
  if (!Number.isSafeInteger(registration.slots) || registration.slots < 1) {
    throw new TypeError('startHatchetHostJobWorker: slots must be a positive safe integer.');
  }
};

/**
 * Start a Hatchet worker whose tasks execute through a Tau provider host.
 *
 * `close()` delegates to Hatchet's worker stop operation, which first pauses
 * assignment and then waits for active task futures to drain.
 *
 * @param options - Hatchet client, exact registration, static profiles, provider host, and durable projection.
 * @returns A lazy daemon lifecycle handle.
 * @internal
 */
export const startHatchetHostJobWorker = (options: {
  readonly client: HatchetClient;
  readonly registration: JobRunnerRegistration;
  readonly profiles: readonly HatchetJobTaskProfile[];
  readonly host: JobProviderHost;
  readonly projection: HatchetJobProjection;
  readonly workerFactory?: HostHatchetWorkerBoundaryFactory;
}): HostJobWorkerHandle => {
  assertRegistration(options.registration);
  if (options.profiles.length === 0) {
    throw new TypeError('startHatchetHostJobWorker: at least one static task profile is required.');
  }
  const profileNames = new Set(options.profiles.map((profile) => profile.name));
  if (profileNames.size !== options.profiles.length) {
    throw new TypeError('startHatchetHostJobWorker: static task profile names must be unique.');
  }

  const registration = Object.freeze({
    runnerId: options.registration.runnerId,
    capabilities: Object.freeze({ ...options.registration.capabilities }),
    slots: options.registration.slots,
  });
  const profiles = Object.freeze(options.profiles.map((profile) => Object.freeze({ ...profile })));
  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<HostJobWorkerCloseResult>();
  let worker: HostHatchetWorkerBoundary | undefined;
  let closeRequested = false;
  let closePromise: Promise<void> | undefined;
  let isReady = false;
  const wasCloseRequested = (): boolean => closeRequested;

  const run = async (): Promise<HostJobWorkerCloseResult> => {
    try {
      const registrations = profiles.map((profile) =>
        defineHatchetJobTask({
          client: options.client,
          profile,
          runnerId: registration.runnerId,
          host: options.host,
          projection: options.projection,
        }),
      );
      worker = await (options.workerFactory ?? defaultWorkerFactory)({
        client: options.client,
        name: registration.runnerId,
        workflows: registrations.map(({ task }) => task),
        slots: registration.slots,
        labels: toHatchetWorkerLabels(registration.capabilities),
      });
      if (wasCloseRequested()) {
        ready.reject(new Error('Hatchet worker was closed before becoming ready.'));
        await worker.stop();
        return { cause: 'requested' };
      }
      const started = worker.start();
      await worker.waitUntilReady();
      isReady = true;
      ready.resolve();
      await started;
      if (wasCloseRequested()) {
        return { cause: 'requested' };
      }
      return {
        cause: 'fatal',
        error: new Error(`Hatchet worker ${JSON.stringify(registration.runnerId)} stopped unexpectedly.`),
      };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (wasCloseRequested()) {
        return { cause: 'requested' };
      }
      ready.reject(normalized);
      return { cause: 'fatal', error: normalized };
    }
  };

  const execute = async (): Promise<HostJobWorkerCloseResult> => {
    const result = await run();
    closed.resolve(result);
    return result;
  };
  const runPromise = execute();

  return Object.freeze({
    registration,
    profiles,
    ready: ready.promise,
    closed: closed.promise,
    async close() {
      if (closePromise) {
        return closePromise;
      }
      closeRequested = true;
      if (!isReady) {
        ready.reject(new Error('Hatchet worker was closed before becoming ready.'));
      }
      closePromise = (async () => {
        await worker?.stop();
        await runPromise;
      })();
      return closePromise;
    },
  });
};
