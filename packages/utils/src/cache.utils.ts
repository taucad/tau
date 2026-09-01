/**
 * Bounded LRU Map with entry-count-based eviction.
 *
 * Uses the native `Map` insertion-order guarantee: on access, entries are
 * deleted and re-inserted to promote them to most-recently-used. When the
 * map exceeds `maxEntries`, the first (oldest) entry is evicted.
 *
 * @example <caption>Content-addressable geometry cache</caption>
 *
 * ```typescript
 * import { LruMap } from '@taucad/utils/cache';
 *
 * const cache = new LruMap<Uint8Array>({ maxEntries: 20 });
 * const dependencyHash = 'sha256-abc123';
 * const glbBuffer = new Uint8Array(1024);
 * cache.set(dependencyHash, glbBuffer);
 * const hit = cache.get(dependencyHash); // promotes to MRU
 * ```
 *
 * @public
 */
export class LruMap<V> {
  private readonly _map = new Map<string, V>();
  private readonly _maxEntries: number;

  /**
   * @param options - Cache configuration.
   * @param options.maxEntries - Maximum number of entries before LRU eviction.
   */
  public constructor(options: { maxEntries: number }) {
    this._maxEntries = options.maxEntries;
  }

  /**
   * Retrieve a cached value and promote the entry to most-recently-used.
   *
   * @param key - Cache key.
   * @returns The cached value, or `undefined` on miss.
   */
  public get(key: string): V | undefined {
    const value = this._map.get(key);
    if (value === undefined) {
      return undefined;
    }
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  /**
   * Retrieve a cached value without promoting the entry in LRU order.
   * Safe for read-only paths where side effects must be avoided.
   *
   * @param key - Cache key.
   * @returns The cached value, or `undefined` on miss.
   */
  public peek(key: string): V | undefined {
    return this._map.get(key);
  }

  /**
   * Insert or update a cache entry. If the cache exceeds `maxEntries`,
   * the least-recently-used entry is evicted.
   *
   * @param key - Cache key.
   * @param value - Value to cache.
   */
  public set(key: string, value: V): void {
    if (this._map.has(key)) {
      this._map.delete(key);
    }

    while (this._map.size >= this._maxEntries) {
      const first = this._map.keys().next();
      if (first.done) {
        break;
      }
      this._map.delete(first.value);
    }

    this._map.set(key, value);
  }

  /**
   * Remove a single entry from the cache.
   *
   * @param key - Cache key to remove.
   * @returns `true` if the entry existed and was removed.
   */
  public delete(key: string): boolean {
    return this._map.delete(key);
  }

  /**
   * Check whether an entry exists in the cache.
   *
   * @param key - Cache key to check.
   * @returns `true` if the entry is cached.
   */
  public has(key: string): boolean {
    return this._map.has(key);
  }

  /** Remove all entries from the cache. */
  public clear(): void {
    this._map.clear();
  }

  /** Number of entries currently in the cache. */
  public get size(): number {
    return this._map.size;
  }
}

/**
 * Create a lazily-initialized async singleton with rejection retry.
 *
 * The returned function calls `factory` on first invocation and caches the
 * resulting promise. Concurrent callers share the same in-flight promise
 * (no stampede). If the promise rejects, the cache is cleared so the next
 * caller retries — unlike the `cached ??= factory()` pattern which
 * permanently caches rejected promises.
 *
 * @param factory - Async function that produces the singleton value.
 * @returns A function that returns the cached or in-flight promise.
 *
 * @example <caption>WASM module singleton</caption>
 *
 * ```typescript
 * import { lazyAsync } from '@taucad/utils/cache';
 *
 * const initNodeIo = async () => ({ read: () => 'data' });
 * const getNodeIo = lazyAsync(() => initNodeIo());
 * const io = await getNodeIo(); // first call: inits
 * const io2 = await getNodeIo(); // same instance
 * ```
 *
 * @public
 */
export const lazyAsync = <T>(factory: () => Promise<T>): (() => Promise<T>) => {
  let cached: Promise<T> | undefined;
  return async () => {
    cached ??= factory();
    try {
      return await cached;
    } catch (error) {
      cached = undefined;
      throw error;
    }
  };
};
