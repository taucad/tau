/*
 * How many chat refs one fetch projects at once (L4-F10, R34). Each reads up to
 * three trees, and a second device's first open can bring every chat the
 * project has, so an unbounded fan-out held every tree in memory at once — the
 * shape `readTree`'s own fan-out bug had before C49.
 *
 * ponytail: the base tree is still read whole for its `chat.json`; reading that
 * one file needs a single-path read on `RevisionPort` (both legs), which is the
 * upgrade path if second-device opens measure slow (L4 E9).
 */
export const chatProjectionConcurrency = 16;

/**
 * `Promise.allSettled` over `items`, with at most `limit` running at once.
 *
 * @param items - The work, in order.
 * @param limit - The most that may run together.
 * @param run - One item's work.
 * @returns One settled result per item, in the items' order.
 */
export const settleBounded = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<ReadonlyArray<PromiseSettledResult<Result>>> => {
  const results: Array<PromiseSettledResult<Result>> = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane is one sequential slot of the bounded pool.
        results[index] = { status: 'fulfilled', value: await run(items[index]!) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};
