/**
 * The facade of a deferred child (progressive loading PL1 design review, constraint 3): its logic loads through a
 * D5 loader (`async () => import(...)`) when its owner first needs it, and until then the facade holds every event
 * sent to it in an ordered, bounded queue that it replays, in order, the moment the logic exists. A failed load is
 * the child's first fault: each queued event is rejected with it, never dropped silently, and the fault is kept.
 *
 * The facade owns ordering, so callers never wait on the load themselves: an event sent once the logic exists runs
 * synchronously, as a direct call would.
 */

/** Where a deferred child's logic is. @public */
export type DeferredChildPhase = 'unloaded' | 'loading' | 'loaded' | 'failed' | 'disposed';

/** A deferred child's facade over its logic `T`. @public */
export type DeferredChild<T> = Readonly<{
  /** The logic, once loaded. */
  current: () => T | undefined;
  phase: () => DeferredChildPhase;
  /** The first load failure, kept after a retry. */
  fault: () => unknown;
  /** Events waiting for the logic. */
  pending: () => number;
  /** Start the load if nothing has; idempotent. */
  load: () => void;
  /**
   * Deliver an event: run now when the logic exists, else queue it and start the load. The promise settles with
   * the event's result, or rejects with the load's failure or when the queue is full.
   */
  send: <R>(event: (logic: T) => R) => Promise<Awaited<R>>;
  /** After a failed load, return to `unloaded` so the next event loads again. */
  retry: () => void;
  /** Stop: a load still running creates nothing, and queued events settle without running. */
  dispose: () => void;
}>;

/** The default bound of a deferred child's queue. @public */
export const deferredChildQueueBound = 64;

/** An event refused because the queue already holds its bound. @public */
export class DeferredChildQueueFullError extends Error {
  public constructor(bound: number) {
    super(`A deferred child holds ${bound} events before its logic loaded; this one was refused`);
    this.name = 'DeferredChildQueueFullError';
  }
}

type Queued<T> = Readonly<{
  run: (logic: T) => unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}>;

/**
 * Create a deferred child's facade.
 *
 * @param options - The loader and its synchronous peek, how to build the logic from its module, the queue's bound, and
 *   the hooks the owner
 *   reads: `onLoaded` runs after the logic exists and before the queue replays, `onFault` after a failed load has
 *   rejected the queue.
 * @returns The facade, unloaded.
 * @public
 */
export const createDeferredChild = <M, T>(
  options: Readonly<{
    load: () => Promise<M>;
    /** The module if it has already loaded: the logic is then built at once, as a static child's would be. */
    peek?: () => M | undefined;
    create: (module: M) => T;
    bound?: number;
    onLoaded?: (logic: T) => void;
    onFault?: (error: unknown) => void;
  }>,
): DeferredChild<T> => {
  const bound = options.bound ?? deferredChildQueueBound;
  const queue: Array<Queued<T>> = [];
  let phase: DeferredChildPhase = 'unloaded';
  let logic: T | undefined;
  let fault: unknown;
  let hasFault = false;
  /* The latest failure, which a send to a failed child is rejected with. */
  let failure: unknown;
  /* Each load attempt; a settled attempt a retry or dispose replaced does nothing. */
  let attempt = 0;

  const deliver = (entry: Queued<T>, target: T): void => {
    let result: unknown;
    try {
      result = entry.run(target);
    } catch (error) {
      entry.reject(error);
      return;
    }
    /* The event ran now; only its result settles later. */
    const settleResult = async (): Promise<void> => {
      try {
        entry.resolve(await result);
      } catch (error) {
        entry.reject(error);
      }
    };
    void settleResult();
  };

  const settle = (current: number, module: M): void => {
    if (current !== attempt || phase !== 'loading') {
      return;
    }
    let created: T;
    try {
      created = options.create(module);
      logic = created;
      options.onLoaded?.(created);
    } catch (error) {
      logic = undefined;
      fail(error);
      return;
    }
    /* The owner's callback may have disposed the child: a disposed child stays so and replays nothing. */
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- `onLoaded` can dispose the child, which narrowing cannot see.
    if (current !== attempt || phase !== 'loading') {
      return;
    }
    phase = 'loaded';
    /* Replayed in the order sent; an event a replayed one sends joins the end and runs in turn. */
    while (queue.length > 0) {
      deliver(queue.shift()!, created);
    }
  };

  const runLoad = async (current: number): Promise<void> => {
    let module: M;
    try {
      module = await options.load();
    } catch (error) {
      if (current === attempt && phase === 'loading') {
        fail(error);
      }
      return;
    }
    settle(current, module);
  };

  const load = (): void => {
    if (phase !== 'unloaded') {
      return;
    }
    phase = 'loading';
    attempt += 1;
    const ready = options.peek?.();
    if (ready === undefined) {
      void runLoad(attempt);
    } else {
      settle(attempt, ready);
    }
  };

  const fail = (error: unknown): void => {
    phase = 'failed';
    failure = error;
    if (!hasFault) {
      hasFault = true;
      fault = error;
    }
    for (const entry of queue.splice(0)) {
      entry.reject(error);
    }
    options.onFault?.(error);
  };

  return {
    current: () => logic,
    phase: () => phase,
    fault: () => fault,
    pending: () => queue.length,
    load,
    send: async <R>(event: (target: T) => R): Promise<Awaited<R>> => {
      if (phase === 'loaded' && logic !== undefined && queue.length === 0) {
        /* Runs now, as a direct call would; only its result is awaited. */
        const result = await event(logic);
        return result;
      }
      if (phase === 'failed') {
        throw failure;
      }
      if (phase === 'disposed') {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- A disposed child runs nothing; its events settle empty.
        return undefined as Awaited<R>;
      }
      if (queue.length >= bound) {
        throw new DeferredChildQueueFullError(bound);
      }
      const { promise, resolve, reject } = Promise.withResolvers<Awaited<R>>();
      // oxlint-disable-next-line typescript/consistent-type-assertions -- The entry's result is the event's own.
      queue.push({ run: event, resolve: resolve as (value: unknown) => void, reject });
      load();
      return promise;
    },
    retry: () => {
      if (phase === 'failed') {
        phase = 'unloaded';
      }
    },
    dispose: () => {
      phase = 'disposed';
      attempt++;
      for (const entry of queue.splice(0)) {
        entry.resolve(undefined);
      }
    },
  };
};
