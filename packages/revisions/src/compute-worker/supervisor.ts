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
 * (`unavailable`), so a worker that cannot load is not respawned forever. A
 * `spawn` that throws counts as a crash. So does a worker that dies before it
 * sent anything, which never loaded (a blocked `worker-src`, a missing chunk):
 * its held calls go to the fallback when there is one, and fail `crashed` only
 * without one. Pack indexing never runs on the
 * fallback: past the worker it fails typed rather than hold the authority's
 * thread for seconds.
 *
 * Liveness is a heartbeat, not a per-call timer: the worker acknowledges each
 * call as it starts it and answers pings, and is taken for dead only after
 * {@link SupervisorOptions.callDeadline} of silence while it holds calls. At
 * most {@link SupervisorOptions.maxInFlight} calls are sent at once.
 *
 * @module
 */

import { computeMethods, openComputeConnection } from '#compute-worker/compute-worker.js';
import type { ComputeConnection, ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { ComputeWorkerCrashedError } from '#compute-worker/errors.js';
import type { ComputeMethod } from '#compute-worker/errors.js';

/** The part of a `Worker` the supervisor uses. */
export type ComputeWorkerHandle = Readonly<{
  postMessage: ComputePort['postMessage'];
  addEventListener: (type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void) => void;
  terminate: () => void;
}>;

/**
 * What the supervisor is told when a worker dies.
 *
 * @public
 */
export type ComputeCrashReport = Readonly<{
  /** Calls the dead worker held that failed typed; those of a worker that never loaded and went to the fallback are not counted. */
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
   * How long a worker holding calls may stay silent — no call started, no
   * answer, no pong — before it is taken for dead (a platform kill can end a
   * worker without an error event). Milliseconds; two minutes by default, far
   * above a 64 MiB pack's indexing. A queued or slow call alone never trips it.
   */
  callDeadline?: number;
  /** How often a worker holding calls is pinged. Milliseconds; a quarter of the silence window, at most 5 s. */
  heartbeat?: number;
  /** Calls sent to the worker at once; the rest wait unsent. 4 by default. */
  maxInFlight?: number;
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

/** Work that never runs on the fallback: past the worker it fails typed rather than stall the authority's thread. */
const workerOnly: ReadonlySet<ComputeMethod> = new Set(['indexPack']);

/**
 * Supervise one compute worker.
 *
 * @param options - How to spawn it, and when to give up.
 * @returns The compute contract, served by a worker that is restarted when it dies.
 * @public
 */
export const createSupervisedComputeWorker = (options: SupervisorOptions): SupervisedComputeWorker => {
  const maxRestarts = options.maxRestarts ?? 3;
  const restartWindow = options.restartWindow ?? 60_000;
  const now = options.now ?? Date.now;
  const silence = options.callDeadline ?? 120_000;
  const heartbeat = options.heartbeat ?? Math.max(1, Math.min(5000, Math.floor(silence / 4)));
  const maxInFlight = options.maxInFlight ?? 4;
  let current: Readonly<{ handle: ComputeWorkerHandle; connection: ComputeConnection }> | undefined;
  let spawned = 0;
  let restarts: number[] = [];
  let abandoned = false;
  let beat: ReturnType<typeof setInterval> | undefined;
  /* Calls over the in-flight bound wait here, unsent: a queued call is not a silent worker's. */
  let inFlight = 0;
  const queued: Array<() => void> = [];
  /* The failures of calls held by a worker that never loaded: the call sends them on to the fallback. */
  const unloaded = new WeakSet<Error>();

  const stopBeat = (): void => {
    clearInterval(beat);
    beat = undefined;
  };

  /* Answers how many held calls failed; with `reroute`, those the fallback may serve are marked for it instead. */
  const stop = (failure: ComputeWorkerCrashedError['failure'], cause?: unknown, reroute = false): number => {
    const held = current;
    current = undefined;
    stopBeat();
    if (held === undefined) {
      return 0;
    }
    let failedCalls = 0;
    held.connection.close((method) => {
      const error = new ComputeWorkerCrashedError(failure, method, cause === undefined ? undefined : { cause });
      if (reroute && !workerOnly.has(method)) {
        unloaded.add(error);
      } else {
        failedCalls += 1;
      }
      return error;
    });
    held.handle.terminate();
    return failedCalls;
  };

  /* One more death in the window; past the budget the supervisor gives up. Answers whether it has. */
  const counted = (): boolean => {
    const at = now();
    restarts = [...restarts.filter((time) => at - time < restartWindow), at];
    abandoned = restarts.length > maxRestarts;
    return abandoned;
  };

  const died = (handle: ComputeWorkerHandle, cause: unknown): void => {
    if (current?.handle !== handle) {
      return;
    }
    counted();
    /*
     * A worker that dies before it sent anything — no start, no answer, no
     * pong — never loaded (a blocked `worker-src`, a missing chunk, no nested
     * module workers): its calls are not its fault, so they go to the
     * fallback rather than fail. One that had spoken fails what it held.
     */
    const failedCalls = stop('crashed', cause, options.fallback !== undefined && !current.connection.spoke());
    options.onCrash?.({ failedCalls, restarts: restarts.length, abandoned });
  };

  /*
   * While calls are held, ping the worker; a worker heard from by nothing — no
   * start, no answer, no pong — for the silence window is gone (a platform
   * kill can end one without an error event). A worker busy with one long
   * call still answers the calls around it, so it is only taken for dead when
   * the work itself has held its thread for the whole window.
   */
  const watch = (): void => {
    beat ??= setInterval(() => {
      const held = current;
      if (held === undefined || held.connection.pending() === 0) {
        stopBeat();
        return;
      }
      if (now() - held.connection.heard() > silence) {
        died(held.handle, new Error(`The compute worker was silent for ${String(silence)} ms.`));
        return;
      }
      held.connection.ping();
    }, heartbeat);
    (beat as { unref?: () => void }).unref?.();
  };

  const live = (method: ComputeMethod): ComputeWorker | undefined => {
    if (!abandoned && current === undefined) {
      let handle: ComputeWorkerHandle | undefined;
      try {
        handle = options.spawn();
      } catch (error) {
        /* A worker that cannot start is a crash: counted, and past the budget the calls go to the fallback. */
        const gaveUp = counted();
        options.onCrash?.({ failedCalls: 0, restarts: restarts.length, abandoned: gaveUp });
        if (!gaveUp) {
          throw new ComputeWorkerCrashedError('crashed', method, { cause: error });
        }
      }
      if (handle !== undefined) {
        const started = handle;
        spawned += 1;
        const connection = openComputeConnection(
          {
            postMessage: (message, transfer) => {
              started.postMessage(message, transfer);
            },
            addEventListener: (type, listener) => {
              started.addEventListener(type, listener as (event: Event) => void);
            },
          },
          now,
        );
        started.addEventListener('error', (event) => {
          /* An uncaught error ends the worker for good: what it held never answers. */
          event.preventDefault();
          died(started, (event as ErrorEvent).error ?? (event as ErrorEvent).message);
        });
        started.addEventListener('messageerror', (event) => {
          died(started, event);
        });
        current = { handle: started, connection };
      }
    }
    if (current !== undefined) {
      return current.connection.compute;
    }
    return workerOnly.has(method) ? undefined : options.fallback;
  };

  const slot = async (): Promise<void> => {
    if (inFlight < maxInFlight) {
      inFlight += 1;
      return;
    }
    const { promise, resolve } = Promise.withResolvers<undefined>();
    queued.push(() => {
      resolve(undefined);
    });
    await promise;
  };
  const release = (): void => {
    const next = queued.shift();
    if (next === undefined) {
      inFlight -= 1;
    } else {
      next();
    }
  };

  const call =
    (method: ComputeMethod) =>
    async (...args: readonly unknown[]): Promise<unknown> => {
      await slot();
      try {
        const compute = live(method);
        if (compute === undefined) {
          throw new ComputeWorkerCrashedError('unavailable', method);
        }
        if (current?.connection.compute === compute) {
          watch();
        }
        try {
          return await (compute[method] as (...input: readonly unknown[]) => Promise<unknown>)(...args);
        } catch (error) {
          const { fallback } = options;
          if (fallback === undefined || !(error instanceof Error) || !unloaded.has(error)) {
            throw error;
          }
          return await (fallback[method] as (...input: readonly unknown[]) => Promise<unknown>)(...args);
        }
      } finally {
        release();
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
