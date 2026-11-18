/**
 * A shared bound on concurrent child processes. Every process a caller starts through one `Slots`
 * waits for a free slot, first come first served, so independent work (mutants, their builds and
 * oracle runs) shares the runner's cores without oversubscribing them.
 */
export type Slots = {
  readonly limit: number;
  readonly run: <T>(work: () => Promise<T>) => Promise<T>;
};

export const processSlots = (limit: number): Slots => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`process slots need a positive integer limit, got ${String(limit)}`);
  }
  let running = 0;
  const waiting: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (running < limit) {
      running += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      running -= 1;
    }
  };
  return {
    limit,
    run: async <T>(work: () => Promise<T>): Promise<T> => {
      await acquire();
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
};

/** Maps `items` through `work` with at most `limit` in flight; the results keep the items' order. */
export const mapBounded = async <T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each lane runs its items one at a time.
      results[index] = await work(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
};
