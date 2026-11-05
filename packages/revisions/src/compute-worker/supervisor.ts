/**
 * The compute worker under supervision (charter D7): one dedicated worker,
 * spawned on first use, restarted when it dies, and abandoned for the inline
 * fallback when it keeps dying.
 *
 * A worker that dies — an uncaught error, an out-of-memory kill, a message it
 * cannot read — fails every call it held with a typed
 * {@link ComputeWorkerCrashedError} (`crashed`), which a store never mistakes
 * for corrupt bytes, and the next call starts a new worker. More than
 * {@link SupervisorOptions.maxRestarts} restarts inside
 * {@link SupervisorOptions.restartWindow} stop the restarts: later calls go to
 * the fallback when the host gave one, and otherwise fail typed
 * (`unavailable`), so a worker that cannot load is not respawned forever.
 *
 * @module
 */

import { computeMethods, openComputeConnection } from '#compute-worker/compute-worker.js';
import type { ComputeConnection, ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { ComputeWorkerCrashedError } from '#compute-worker/errors.js';
import type { ComputeMethod } from '#compute-worker/errors.js';

/** The part of a `Worker` the supervisor uses. */
export type ComputeWorkerHandle = ComputePort &
  Readonly<{
    addEventListener: (type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void) => void;
    terminate: () => void;
  }>;

/** What the supervisor is told when a worker dies. */
export type ComputeCrashReport = Readonly<{
  /** Calls the dead worker held, each failed typed. */
  failedCalls: number;
  /** Restarts inside the window so far, this one included. */
  restarts: number;
  /** Whether the supervisor gave up restarting. */
  abandoned: boolean;
}>;

/** How the supervisor spawns, restarts and gives up. */
export type SupervisorOptions = Readonly<{
  /** A new worker that serves {@link serveComputeWorker}. */
  spawn: () => ComputeWorkerHandle;
  /** Restarts tolerated inside the window before giving up; 3 by default. */
  maxRestarts?: number;
  /** The window restarts are counted in. Milliseconds; one minute by default. */
  restartWindow?: number;
  /** Where calls go once the supervisor gave up; without one they fail typed. */
  fallback?: ComputeWorker;
  /**
   * How long one call may go unanswered before its worker is taken for dead
   * (a platform kill can end a worker without an error event). Milliseconds;
   * two minutes by default, far above a 64 MiB pack's indexing.
   */
  callDeadline?: number;
  /** Told of each death, for telemetry. */
  onCrash?: (report: ComputeCrashReport) => void;
  /** The clock the window is measured on. */
  now?: () => number;
}>;

/** A supervised compute worker: the contract, plus its lifecycle. */
export type SupervisedComputeWorker = ComputeWorker &
  Readonly<{
    /** Workers spawned so far: the first, then one per restart. */
    spawned: () => number;
    /** Stop the current worker and fail what it holds; the next call starts another. */
    terminate: () => void;
  }>;

/**
 * Supervise one compute worker.
 *
 * @param options - How to spawn it, and when to give up.
 * @returns The compute contract, served by a worker that is restarted when it dies.
 */
export const createSupervisedComputeWorker = (options: SupervisorOptions): SupervisedComputeWorker => {
  const maxRestarts = options.maxRestarts ?? 3;
  const restartWindow = options.restartWindow ?? 60_000;
  const now = options.now ?? Date.now;
  const callDeadline = options.callDeadline ?? 120_000;
  let current: Readonly<{ handle: ComputeWorkerHandle; connection: ComputeConnection }> | undefined;
  let spawned = 0;
  let restarts: number[] = [];
  let abandoned = false;

  const stop = (failure: ComputeWorkerCrashedError['failure'], cause?: unknown): number => {
    const held = current;
    current = undefined;
    if (held === undefined) {
      return 0;
    }
    const failedCalls = held.connection.pending();
    held.connection.close(
      (method) => new ComputeWorkerCrashedError(failure, method, cause === undefined ? undefined : { cause }),
    );
    held.handle.terminate();
    return failedCalls;
  };

  const died = (handle: ComputeWorkerHandle, cause: unknown): void => {
    if (current?.handle !== handle) {
      return;
    }
    const at = now();
    restarts = [...restarts.filter((time) => at - time < restartWindow), at];
    abandoned = restarts.length > maxRestarts;
    const failedCalls = stop('crashed', cause);
    options.onCrash?.({ failedCalls, restarts: restarts.length, abandoned });
  };

  const live = (): ComputeWorker | undefined => {
    if (abandoned) {
      return options.fallback;
    }
    if (current === undefined) {
      const handle = options.spawn();
      spawned += 1;
      const connection = openComputeConnection(handle);
      handle.addEventListener('error', (event) => {
        /* An uncaught error ends the worker for good: what it held never answers. */
        event.preventDefault?.();
        died(handle, (event as ErrorEvent).error ?? (event as ErrorEvent).message);
      });
      handle.addEventListener('messageerror', (event) => {
        died(handle, event);
      });
      current = { handle, connection };
    }
    return current.connection.compute;
  };

  const call =
    (method: ComputeMethod) =>
    async (...args: readonly unknown[]): Promise<unknown> => {
      const compute = live();
      if (compute === undefined) {
        throw new ComputeWorkerCrashedError('unavailable', method);
      }
      const handle = current?.handle;
      /* A worker the platform killed without an error event never answers: past the deadline it is dead. */
      const deadline =
        handle === undefined
          ? undefined
          : setTimeout(() => {
              died(handle, new Error(`${method} passed the ${String(callDeadline)} ms deadline`));
            }, callDeadline);
      (deadline as { unref?: () => void } | undefined)?.unref?.();
      try {
        return await (compute[method] as (...input: readonly unknown[]) => Promise<unknown>)(...args);
      } finally {
        clearTimeout(deadline);
      }
    };

  const contract = Object.fromEntries(
    computeMethods.map((method) => [method, call(method)]),
  ) as unknown as ComputeWorker;
  return Object.freeze({
    ...contract,
    spawned: () => spawned,
    terminate: () => {
      stop('crashed');
    },
  });
};
