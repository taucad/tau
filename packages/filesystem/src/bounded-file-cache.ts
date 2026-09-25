const defaultMaxSingleFileBytes = 1024 * 1024;

/**
 * LRU file cache with configurable entry count, total byte, and
 * single-file size limits. Evicts the oldest entries when limits are exceeded.
 * @public
 */
export class BoundedFileCache {
  private readonly _map = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number;
  private readonly maxSingleFileBytes: number;
  private _totalBytes = 0;

  /**
   * Create a bounded file cache.
   * @param options - Cache size limits.
   */
  public constructor(options: { maxEntries: number; maxTotalBytes: number; maxSingleFileBytes?: number }) {
    this.maxEntries = options.maxEntries;
    this.maxTotalBytes = options.maxTotalBytes;
    this.maxSingleFileBytes = options.maxSingleFileBytes ?? defaultMaxSingleFileBytes;
  }

  /**
   * Retrieve cached file data without promoting the entry in the LRU order.
   * Safe to call inside React selectors and render paths where side effects
   * must be avoided.
   *
   * @param path - Cache key (absolute file path).
   * @returns Cached bytes or `undefined` on miss.
   */
  public peek(path: string): Uint8Array<ArrayBuffer> | undefined {
    return this._map.get(path);
  }

  /**
   * Retrieve cached file data, promoting the entry to most-recently-used.
   *
   * @param path - Cache key (absolute file path).
   * @returns Cached bytes or `undefined` on miss.
   */
  public get(path: string): Uint8Array<ArrayBuffer> | undefined {
    const data = this._map.get(path);
    if (data === undefined) {
      return undefined;
    }
    this._map.delete(path);
    this._map.set(path, data);
    return data;
  }

  /**
   * Insert or update a cache entry, evicting oldest entries if limits are exceeded.
   * Returns `false` (without storing) when the entry exceeds `maxSingleFileBytes`,
   * so callers can take action instead of swallowing the rejection silently.
   *
   * @param path - Cache key (absolute file path).
   * @param data - File content bytes.
   * @returns `true` when the entry was stored; `false` when rejected.
   */
  public set(path: string, data: Uint8Array<ArrayBuffer>): boolean {
    if (data.byteLength > this.maxSingleFileBytes) {
      return false;
    }

    const existing = this._map.get(path);
    const existingLength = existing?.byteLength ?? 0;
    const newLength = data.byteLength;
    const isUpdate = existing !== undefined;

    if (isUpdate) {
      this._map.delete(path);
      this._totalBytes -= existingLength;
    }

    while (this._map.size >= this.maxEntries || this._totalBytes + newLength > this.maxTotalBytes) {
      const first = this._map.keys().next();
      if (first.done) {
        break;
      }
      const key = first.value;
      const value = this._map.get(key)!;
      this._map.delete(key);
      this._totalBytes -= value.byteLength;
    }

    this._map.set(path, data);
    this._totalBytes += newLength;
    return true;
  }

  /**
   * Remove a single entry from the cache.
   *
   * @param path - Cache key to remove.
   */
  public delete(path: string): void {
    const data = this._map.get(path);
    if (data === undefined) {
      return;
    }
    this._map.delete(path);
    this._totalBytes -= data.byteLength;
  }

  /**
   * Re-key a cache entry, preserving insertion order.
   *
   * @param oldPath - Current cache key.
   * @param newPath - New cache key.
   */
  public rename(oldPath: string, newPath: string): void {
    const data = this._map.get(oldPath);
    if (data === undefined) {
      return;
    }
    if (oldPath === newPath) {
      return;
    }
    const entries = [...this._map];
    this._map.clear();
    for (const [k, v] of entries) {
      this._map.set(k === oldPath ? newPath : k, v);
    }
  }

  /**
   * Check whether an entry exists in the cache.
   *
   * @param path - Cache key to check.
   * @returns `true` if the entry is cached.
   */
  public has(path: string): boolean {
    return this._map.has(path);
  }

  /** Remove all entries from the cache. */
  public clear(): void {
    this._map.clear();
    this._totalBytes = 0;
  }

  /**
   * Number of entries currently in the cache.
   * @returns Entry count.
   */
  public get size(): number {
    return this._map.size;
  }

  /**
   * Total byte size of all cached entries.
   * @returns Byte count.
   */
  public get totalBytes(): number {
    return this._totalBytes;
  }

  /**
   * Iterate over all cached `[path, data]` pairs.
   * @returns Iterator of `[path, bytes]` tuples.
   */
  public entries(): IterableIterator<[string, Uint8Array<ArrayBuffer>]> {
    return this._map.entries();
  }
}
