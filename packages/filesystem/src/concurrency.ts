/**
 * The one bounded-concurrency shape this library's walks share.
 *
 * Every read pool here is chunked rather than a rolling window: the awaits are
 * what bound the concurrency, and a chunk is all any of the call sites (a
 * provider's batched stats, the index build's recursion, the snapshot rows)
 * ever needed.
 *
 * @module
 */

/** Concurrent `stat`-class reads one directory listing may have in flight. */
export const statConcurrency = 16;

/**
 * Directory listings one tree walk may have in flight.
 *
 * A listing is itself a pool of {@link statConcurrency} metadata reads, none of
 * which opens a file (I3), so the product bounds stat calls rather than open
 * descriptors. A checkout is many small directories, so the listings, not the
 * reads, are the wall: S5's warm open of 2,000 files in several hundred
 * directories measured 2.2 s at 4 and 0.9 s at 16, against its 2 s target.
 */
export const directoryConcurrency = 16;

/**
 * Map `items` with at most `limit` calls in flight, in input order.
 *
 * @param items - Inputs to map.
 * @param limit - Maximum number of concurrent calls.
 * @param map - Per-item work.
 * @returns One result per input, in input order.
 */
export async function mapConcurrent<Item, Result>(
  items: readonly Item[],
  limit: number,
  map: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (let offset = 0; offset < items.length; offset += limit) {
    // oxlint-disable-next-line no-await-in-loop -- Chunked awaits are what bound concurrency to `limit`.
    const chunk = await Promise.all(items.slice(offset, offset + limit).map(async (item) => map(item)));
    results.push(...chunk);
  }
  return results;
}
