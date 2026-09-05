import { setTimeout as delay } from 'node:timers/promises';

/** Scalar capability advertised by a host job runner. @public */
export type HostJobCapabilityValue = boolean | number | string;

/** Serializable runner identity, capabilities, and capacity. @public */
export type HostJobRunnerRegistration = {
  readonly runnerId: string;
  readonly capabilities: Readonly<Record<string, HostJobCapabilityValue>>;
  readonly slots: number;
};

/** Identity shared by all coordinator mutations for one attempt. @public */
export type HostJobAttemptIdentity = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly attempt: number;
  readonly runnerId: string;
};

/** Leased definition received by the host's multi-attempt host. @public */
export type HostJobAttemptLease<Definition> = HostJobAttemptIdentity & {
  readonly definition: Definition;
  readonly leaseExpiresAt: number;
};

/** Progress shape forwarded from an attempt executor to its coordinator. @public */
export type HostJobProgress = {
  readonly phase: string;
  readonly completed: number;
  readonly total: number;
  readonly message: string;
};

/** Persistable provider failure forwarded by an attempt host. @public */
export type HostJobFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
};

/** Terminal outcome returned by a host-side provider executor. @public */
export type HostJobExecutionOutcome<Artifact, Result> =
  | { readonly status: 'completed'; readonly artifacts: readonly Artifact[]; readonly result: Result }
  | { readonly status: 'cancelled'; readonly reason: string }
  | { readonly status: 'failed'; readonly failure: HostJobFailure };

type HostJobMutationOutcome = { readonly accepted: true } | { readonly accepted: false; readonly reason: string };

/**
 * Structural coordinator port consumed by the host attempt host.
 * It intentionally has no package import so orchestration adapters can satisfy it without coupling the daemon package.
 *
 * @public
 */
export type HostJobCoordinatorPort<Definition, Artifact, Result> = {
  registerRunner(input: {
    readonly runner: HostJobRunnerRegistration;
    readonly heartbeatExpiresAt: number;
  }): Promise<HostJobMutationOutcome>;
  heartbeatRunner(input: {
    readonly runnerId: string;
    readonly heartbeatExpiresAt: number;
  }): Promise<HostJobMutationOutcome>;
  leaseNext(input: {
    readonly runnerId: string;
    readonly leaseDuration: number;
  }): Promise<
    | { readonly leased: true; readonly lease: HostJobAttemptLease<Definition> }
    | { readonly leased: false; readonly reason: string }
  >;
  startAttempt(input: HostJobAttemptIdentity): Promise<HostJobMutationOutcome>;
  heartbeatAttempt(
    input: HostJobAttemptIdentity & {
      readonly leaseDuration: number;
    },
  ): Promise<
    | { readonly accepted: true; readonly cancellationRequested: boolean; readonly leaseExpiresAt: number }
    | { readonly accepted: false; readonly reason: string }
  >;
  reportProgress(
    input: HostJobAttemptIdentity & { readonly progress: HostJobProgress },
  ): Promise<HostJobMutationOutcome>;
  completeAttempt(
    input: HostJobAttemptIdentity & {
      readonly artifacts: readonly Artifact[];
      readonly result: Result;
    },
  ): Promise<HostJobMutationOutcome>;
  failAttempt(input: HostJobAttemptIdentity & { readonly failure: HostJobFailure }): Promise<HostJobMutationOutcome>;
  cancelAttempt(input: HostJobAttemptIdentity & { readonly reason: string }): Promise<HostJobMutationOutcome>;
};

/** Host-side provider executor used by one shared host attempt host. @public */
export type HostJobExecutor<Definition, Artifact, Result> = {
  /**
   * Execute one leased definition and honor the supplied cancellation signal.
   *
   * @param input - Immutable lease, per-attempt signal, and durable progress sink.
   * @returns A discriminated completed, failed, or cancelled outcome.
   */
  execute(input: {
    readonly lease: HostJobAttemptLease<Definition>;
    readonly signal: AbortSignal;
    readonly onProgress: (progress: HostJobProgress) => Promise<void>;
  }): Promise<HostJobExecutionOutcome<Artifact, Result>>;
};

/** Observable events emitted by a host attempt host. @public */
export type HostJobAttemptHostEvent =
  | { readonly type: 'runner'; readonly state: 'registered' | 'heartbeat' }
  | (HostJobAttemptIdentity & {
      readonly type: 'attempt';
      readonly state: 'leased' | 'started' | 'completed' | 'failed' | 'cancelled';
    })
  | { readonly type: 'warning'; readonly code: 'ATTEMPT_REPORT_REJECTED'; readonly message: string };

/** Final lifecycle result for a host attempt host. @public */
export type HostJobAttemptHostCloseResult =
  | { readonly cause: 'requested' }
  | { readonly cause: 'fatal'; readonly error: Error };

/** Owning lifecycle handle for one shared, multi-attempt host job host. @public */
export type HostJobAttemptHostHandle = {
  readonly ready: Promise<void>;
  readonly closed: Promise<HostJobAttemptHostCloseResult>;
  /**
   * Stop admission, abort active attempts, and await their cooperative teardown.
   *
   * @returns When every active executor has settled and the polling loop has closed.
   */
  close(): Promise<void>;
  /**
   * Dispose the host through the universal cleanup protocol.
   *
   * @returns When {@link HostJobAttemptHostHandle.close} has completed.
   */
  dispose(): Promise<void>;
};

type ActiveAttempt<Definition> = {
  readonly lease: HostJobAttemptLease<Definition>;
  readonly controller: AbortController;
  readonly settled: Promise<void>;
};

const toIdentity = <Definition>(lease: HostJobAttemptLease<Definition>): HostJobAttemptIdentity => ({
  jobId: lease.jobId,
  attemptId: lease.attemptId,
  attempt: lease.attempt,
  runnerId: lease.runnerId,
});

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * Start one host-owned host that executes many leased attempts without creating a worker per job.
 * Provider implementations remain responsible for forwarding cancellation to their leaf process, container, or engine.
 *
 * @param options - Runner identity, coordinator/executor ports, timing, capacity, and observability.
 * @returns A lifecycle handle with explicit readiness and closure outcomes.
 * @public
 *
 * @example <caption>Run a persistent daemon attempt host</caption>
 * ```typescript
 * import { startHostJobAttemptHost } from '@taucad/host';
 * import type { HostJobCoordinatorPort, HostJobExecutor } from '@taucad/host';
 *
 * declare const coordinator: HostJobCoordinatorPort<unknown, unknown, unknown>;
 * declare const executor: HostJobExecutor<unknown, unknown, unknown>;
 * const host = startHostJobAttemptHost({
 *   runner: { runnerId: 'desktop', capabilities: { container: true }, slots: 4 },
 *   coordinator,
 *   executor,
 * });
 * void host.close();
 * ```
 */
export const startHostJobAttemptHost = <Definition, Artifact, Result>(options: {
  readonly runner: HostJobRunnerRegistration;
  readonly coordinator: HostJobCoordinatorPort<Definition, Artifact, Result>;
  readonly executor: HostJobExecutor<Definition, Artifact, Result>;
  readonly maxConcurrentAttempts?: number;
  readonly pollInterval?: number;
  readonly heartbeatInterval?: number;
  readonly heartbeatTtl?: number;
  readonly leaseDuration?: number;
  readonly onEvent?: (event: HostJobAttemptHostEvent) => void;
}): HostJobAttemptHostHandle => {
  const maxConcurrentAttempts = options.maxConcurrentAttempts ?? options.runner.slots;
  const pollInterval = options.pollInterval ?? 500;
  const heartbeatInterval = options.heartbeatInterval ?? 5000;
  const heartbeatTtl = options.heartbeatTtl ?? 15_000;
  const leaseDuration = options.leaseDuration ?? 15_000;
  for (const [name, value] of Object.entries({
    maxConcurrentAttempts,
    pollInterval,
    heartbeatInterval,
    heartbeatTtl,
    leaseDuration,
  })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`startHostJobAttemptHost: ${name} must be positive.`);
    }
  }
  if (!Number.isInteger(maxConcurrentAttempts)) {
    throw new TypeError('startHostJobAttemptHost: maxConcurrentAttempts must be an integer.');
  }

  const shutdown = new AbortController();
  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<HostJobAttemptHostCloseResult>();
  const active = new Map<string, ActiveAttempt<Definition>>();
  let isStopping = false;
  let isReady = false;

  const emit = (event: HostJobAttemptHostEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // Observability callbacks cannot own attempt-host lifecycle.
    }
  };

  const reportRejected = (operation: string, outcome: HostJobMutationOutcome): void => {
    if (outcome.accepted) {
      return;
    }
    emit({
      type: 'warning',
      code: 'ATTEMPT_REPORT_REJECTED',
      message: `${operation} was rejected: ${outcome.reason}`,
    });
  };

  const runAttempt = async (lease: HostJobAttemptLease<Definition>, controller: AbortController): Promise<void> => {
    const identity = toIdentity(lease);
    const started = await options.coordinator.startAttempt(identity);
    if (!started.accepted) {
      reportRejected('startAttempt', started);
      return;
    }
    emit({ type: 'attempt', state: 'started', ...identity });
    try {
      const outcome = await options.executor.execute({
        lease,
        signal: controller.signal,
        onProgress: async (progress) => {
          const reported = await options.coordinator.reportProgress({ ...identity, progress });
          reportRejected('reportProgress', reported);
        },
      });
      if (outcome.status === 'completed') {
        const reported = await options.coordinator.completeAttempt({
          ...identity,
          artifacts: outcome.artifacts,
          result: outcome.result,
        });
        reportRejected('completeAttempt', reported);
        emit({ type: 'attempt', state: 'completed', ...identity });
        return;
      }
      if (outcome.status === 'cancelled') {
        const reported = await options.coordinator.cancelAttempt({ ...identity, reason: outcome.reason });
        reportRejected('cancelAttempt', reported);
        emit({ type: 'attempt', state: 'cancelled', ...identity });
        return;
      }
      const reported = await options.coordinator.failAttempt({ ...identity, failure: outcome.failure });
      reportRejected('failAttempt', reported);
      emit({ type: 'attempt', state: 'failed', ...identity });
    } catch (error) {
      if (controller.signal.aborted) {
        const reported = await options.coordinator.cancelAttempt({
          ...identity,
          reason: String(controller.signal.reason ?? 'cancelled'),
        });
        reportRejected('cancelAttempt', reported);
        emit({ type: 'attempt', state: 'cancelled', ...identity });
        return;
      }
      const failure: HostJobFailure = {
        code: 'ATTEMPT_HOST_EXECUTION_FAILED',
        message: asError(error).message,
        retryable: false,
      };
      const reported = await options.coordinator.failAttempt({ ...identity, failure });
      reportRejected('failAttempt', reported);
      emit({ type: 'attempt', state: 'failed', ...identity });
    }
  };

  const admit = (lease: HostJobAttemptLease<Definition>): void => {
    const controller = new AbortController();
    const settleAttempt = async (): Promise<void> => {
      try {
        await runAttempt(lease, controller);
      } catch {
        // RunAttempt reports provider failures; coordinator transport loss is retried by a future lease.
      } finally {
        active.delete(lease.attemptId);
      }
    };
    const settled = settleAttempt();
    active.set(lease.attemptId, { lease, controller, settled });
    emit({ type: 'attempt', state: 'leased', ...toIdentity(lease) });
  };

  const heartbeatAttempts = async (): Promise<void> => {
    await Promise.all(
      [...active.values()].map(async (attempt) => {
        const outcome = await options.coordinator.heartbeatAttempt({
          ...toIdentity(attempt.lease),
          leaseDuration,
        });
        if (!outcome.accepted) {
          attempt.controller.abort(new Error(`Attempt heartbeat was rejected: ${outcome.reason}`));
          return;
        }
        if (outcome.cancellationRequested && !attempt.controller.signal.aborted) {
          attempt.controller.abort(new Error('Job cancellation was requested.'));
        }
      }),
    );
  };

  const run = async (): Promise<HostJobAttemptHostCloseResult> => {
    const registration = await options.coordinator.registerRunner({
      runner: options.runner,
      heartbeatExpiresAt: Date.now() + heartbeatTtl,
    });
    if (!registration.accepted) {
      throw new Error(`Host job runner registration was rejected: ${registration.reason}`);
    }
    emit({ type: 'runner', state: 'registered' });
    isReady = true;
    ready.resolve();
    let nextHeartbeat = 0;

    while (!shutdown.signal.aborted) {
      const currentTime = Date.now();
      if (currentTime >= nextHeartbeat) {
        // The daemon loop deliberately sequences heartbeat, cancellation propagation, and admission.
        // oxlint-disable-next-line eslint/no-await-in-loop -- The host orders heartbeat and admission phases deliberately.
        const heartbeat = await options.coordinator.heartbeatRunner({
          runnerId: options.runner.runnerId,
          heartbeatExpiresAt: currentTime + heartbeatTtl,
        });
        if (!heartbeat.accepted) {
          throw new Error(`Host job runner heartbeat was rejected: ${heartbeat.reason}`);
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- Cancellation propagation completes before new admissions.
        await heartbeatAttempts();
        emit({ type: 'runner', state: 'heartbeat' });
        nextHeartbeat = currentTime + heartbeatInterval;
      }

      let admitted = false;
      while (active.size < maxConcurrentAttempts) {
        // Each lease changes coordinator capacity; admissions must remain sequential.
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each lease changes the capacity used by the next admission.
        const outcome = await options.coordinator.leaseNext({
          runnerId: options.runner.runnerId,
          leaseDuration,
        });
        if (!outcome.leased) {
          break;
        }
        admit(outcome.lease);
        admitted = true;
      }
      if (!admitted) {
        // Abortable polling delay is the daemon's idle wait primitive.
        // oxlint-disable-next-line eslint/no-await-in-loop -- The abortable delay is the host's intentional poll boundary.
        await delay(pollInterval, undefined, { signal: shutdown.signal });
      }
    }
    return { cause: 'requested' };
  };

  const settleRun = async (): Promise<HostJobAttemptHostCloseResult> => {
    let result: HostJobAttemptHostCloseResult;
    try {
      result = await run();
    } catch (error) {
      result = shutdown.signal.aborted ? { cause: 'requested' } : { cause: 'fatal', error: asError(error) };
    }
    for (const attempt of active.values()) {
      if (!attempt.controller.signal.aborted) {
        attempt.controller.abort(new Error('Host job attempt host stopped.'));
      }
    }
    await Promise.allSettled(
      [...active.values()].map(async (attempt) => {
        await attempt.settled;
      }),
    );
    if (!isReady && result.cause === 'fatal') {
      ready.reject(result.error);
    }
    closed.resolve(result);
    return result;
  };
  const running = settleRun();

  const close = async (): Promise<void> => {
    if (!isStopping) {
      isStopping = true;
      shutdown.abort(new Error('Host job attempt host stopped.'));
    }
    await running;
  };

  return { ready: ready.promise, closed: closed.promise, close, dispose: close };
};
