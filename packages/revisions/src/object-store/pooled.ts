/**
 * Bounded concurrency for the store's reads: a map that runs at most `limit`
 * items at once, and a gate many callers share.
 *
 * @module
 */

/**
 * Run each item through `run`, at most `limit` at once; the answers keep the items' order.
 *
 * @param items - What to run.
 * @param limit - The most items running at once.
 * @param run - The work for one item.
 * @returns Each item's answer, in order.
 */
export const pooled = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item, at: number) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = Array.from({ length: items.length });
  let next = 0;
  let failed = false;
  const lane = async (): Promise<void> => {
    while (next < items.length && !failed) {
      const at = next;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- a lane takes the next item only when its last one landed.
        results[at] = await run(items[at]!, at);
      } catch (error) {
        /* The other lanes start nothing more: the call has failed. */
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};

/** A gate that lets at most a fixed number of tasks run at once, whoever asks. */
export type Limiter = <Result>(task: () => Promise<Result>) => Promise<Result>;

/**
 * A gate shared by every caller that holds it: tasks past the limit wait in order.
 *
 * @param limit - The most tasks running at once.
 * @returns The gate.
 */
export const createLimiter = (limit: number): Limiter => {
  let running = 0;
  const waiting: Array<() => void> = [];
  /* A slot is handed straight to the next waiter, so no newcomer takes it in between. */
  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      running -= 1;
    } else {
      next();
    }
  };
  return async <Result>(task: () => Promise<Result>): Promise<Result> => {
    if (running >= limit) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    } else {
      running += 1;
    }
    try {
      return await task();
    } finally {
      release();
    }
  };
};
