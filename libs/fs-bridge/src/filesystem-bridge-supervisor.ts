/**
 * Supervision for the authority's compute worker (charter D14, W10).
 *
 * The compute worker holds no storage handles and no durable state, so its
 * death is never a corruption: the calls in flight fail typed
 * (`COMPUTE_RESTARTED`), the supervisor starts a fresh worker, and every
 * rooted connection's event channel hears one `compute-restarted` frame naming
 * the calls that failed. Later calls run on the new worker. A worker that keeps
 * dying is not restarted forever: past the restart budget the supervisor stops
 * and every call fails `COMPUTE_UNAVAILABLE`.
 *
 * The supervisor is generic over the worker's contract: the host says how to
 * start a worker and how to speak to it (for the object store, the revisions
 * package's `connectComputeWorker` over the worker's port), and the supervisor
 * hands back the same contract, supervised.
 */
import { Topic } from '@taucad/events';

/** A compute worker the supervisor started. @public */
export type SupervisedWorker<Connection> = {
  /** What the host speaks to the worker through, such as its port. */
  readonly connection: Connection;
  /** Stop the worker. */
  terminate(): void;
  /** Call `listener` once if the worker dies on its own (exits, crashes, fails to load). */
  onDeath(listener: (reason: unknown) => void): void;
};

/** One event the supervisor reports: calls that failed typed when its worker died. @public */
export type ComputeRestartedEvent = Readonly<{ kind: 'compute-restarted'; failed: readonly number[] }>;

/** Who hears a supervisor's events: the bridge's event channels. @public */
export type ComputeEventSource = {
  subscribe(listener: (event: ComputeRestartedEvent) => void): () => void;
};

/** How a supervisor starts, speaks to and bounds its worker. @public */
export type WorkerSupervisorOptions<Connection, Api> = {
  /** Start one worker. */
  readonly spawn: () => SupervisedWorker<Connection>;
  /** The worker's contract over its connection. */
  readonly connect: (connection: Connection) => Api;
  /** Restarts allowed within {@link WorkerSupervisorOptions.restartWindow} before the supervisor gives up; default 5. */
  readonly maxRestarts?: number;
  /** Milliseconds the restart budget counts over; default 60 000. */
  readonly restartWindow?: number;
  /**
   * Milliseconds one call may run before the worker is taken for hung and
   * restarted; the call fails `ETIMEDOUT`, the others in flight
   * `COMPUTE_RESTARTED`. No deadline when absent: a call's size is the
   * caller's to bound.
   */
  readonly callTimeout?: number;
};

/** A supervised compute worker. @public */
export type WorkerSupervisor<Api> = ComputeEventSource & {
  /** The worker's contract; each call runs on the worker current when it starts. */
  readonly api: Api;
  /** Restarts so far. */
  readonly restarts: number;
  /** Stop the worker now and start another, failing the calls in flight. */
  restart(reason?: unknown): void;
  /** Stop the worker for good; later calls fail `COMPUTE_UNAVAILABLE`. */
  dispose(): void;
};

type AsyncMethods = Readonly<Record<string, (...args: never[]) => Promise<unknown>>>;

type InFlight = {
  readonly reject: (error: Error) => void;
  readonly timer?: ReturnType<typeof setTimeout>;
};

const codedError = (message: string, code: string, cause?: unknown): Error =>
  Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { code });

/**
 * Supervise one compute worker.
 *
 * @param options - How to start the worker, speak to it, and bound it.
 * @returns The supervised contract, its event source and its controls.
 * @public
 */
export const superviseWorker = <Connection, Api extends AsyncMethods>(
  options: WorkerSupervisorOptions<Connection, Api>,
): WorkerSupervisor<Api> => {
  const maxRestarts = options.maxRestarts ?? 5;
  const restartWindow = options.restartWindow ?? 60_000;
  const topic = new Topic<ComputeRestartedEvent>({ name: 'ComputeSupervisor.events' });
  const inFlight = new Map<number, InFlight>();
  const restartTimes: number[] = [];
  let nextCall = 0;
  let restarts = 0;
  let stopped: Error | undefined;
  let current: { worker: SupervisedWorker<Connection>; api: Api } | undefined;

  const start = (): void => {
    const worker = options.spawn();
    const started = { worker, api: options.connect(worker.connection) };
    current = started;
    worker.onDeath((reason) => {
      /* A worker already replaced or stopped has nothing left to fail. */
      if (current === started) {
        replace(codedError('The compute worker died.', 'COMPUTE_RESTARTED', reason));
      }
    });
  };

  /** Fail every call in flight with `failure`, stop the worker, and start another within the budget. */
  const replace = (failure: Error, overrun?: { id: number; error: Error }): void => {
    current?.worker.terminate();
    current = undefined;
    const failed = [...inFlight.keys()].toSorted((left, right) => left - right);
    for (const [id, call] of inFlight) {
      clearTimeout(call.timer);
      call.reject(id === overrun?.id ? overrun.error : failure);
    }
    inFlight.clear();
    const now = performance.now();
    restartTimes.push(now);
    while (restartTimes.length > 0 && now - restartTimes[0]! > restartWindow) {
      restartTimes.shift();
    }
    if (restartTimes.length > maxRestarts) {
      stopped = codedError(
        `The compute worker died ${String(restartTimes.length)} times in ${String(restartWindow)} ms; it is no longer restarted.`,
        'COMPUTE_UNAVAILABLE',
        failure,
      );
    } else {
      restarts += 1;
      start();
    }
    topic.emit({ kind: 'compute-restarted', failed });
  };

  const supervised =
    (method: string) =>
    async (...args: unknown[]): Promise<unknown> =>
      new Promise((resolve, reject) => {
        if (stopped !== undefined || current === undefined) {
          reject(stopped ?? codedError('The compute worker is stopped.', 'COMPUTE_UNAVAILABLE'));
          return;
        }
        const id = nextCall;
        nextCall += 1;
        const timer =
          options.callTimeout === undefined
            ? undefined
            : setTimeout(() => {
                replace(codedError('A compute call overran; its worker was restarted.', 'COMPUTE_RESTARTED'), {
                  id,
                  error: codedError(
                    `Compute call ${method} took longer than ${String(options.callTimeout)} ms.`,
                    'ETIMEDOUT',
                  ),
                });
              }, options.callTimeout);
        inFlight.set(id, { reject, ...(timer === undefined ? {} : { timer }) });
        const run = async (): Promise<void> => {
          try {
            const result = await (current!.api[method] as (...callArgs: unknown[]) => Promise<unknown>)(...args);
            resolve(result);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            /* A call failed by a restart has already left the table. */
            const call = inFlight.get(id);
            if (call !== undefined) {
              clearTimeout(call.timer);
              inFlight.delete(id);
            }
          }
        };
        // async-iife: bootstrap -- every outcome settles this call's own promise.
        void run();
      });

  start();
  const api = new Proxy({} as Api, {
    get(_target, property) {
      /* Not a thenable: awaiting the contract must not call it. */
      return typeof property === 'string' && property !== 'then' ? supervised(property) : undefined;
    },
  });

  return {
    api,
    get restarts() {
      return restarts;
    },
    subscribe(listener) {
      return topic.subscribe(listener);
    },
    restart(reason) {
      if (stopped === undefined) {
        replace(codedError('The compute worker was restarted.', 'COMPUTE_RESTARTED', reason));
      }
    },
    dispose() {
      stopped ??= codedError('The compute worker was disposed.', 'COMPUTE_UNAVAILABLE');
      const worker = current?.worker;
      current = undefined;
      for (const call of inFlight.values()) {
        clearTimeout(call.timer);
        call.reject(stopped);
      }
      inFlight.clear();
      worker?.terminate();
      topic.dispose();
    },
  };
};
