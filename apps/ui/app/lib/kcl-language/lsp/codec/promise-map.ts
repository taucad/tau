/**
 * A map that stores promises and resolves them when values are set.
 * Used for matching LSP responses to their requests by ID.
 *
 * Entries are automatically removed from the map when resolved to prevent memory leaks.
 *
 * **Timeout Handling:**
 * - A default TTL (time-to-live) can be set via the constructor.
 * - Per-entry TTL can be specified when calling `get()`.
 * - When a TTL expires, the entry is automatically removed and the promise is rejected
 *   with a `PromiseMapTimeoutError`.
 * - Callers may also call `delete(key)` manually to remove entries on timeout or cancellation.
 *   This will reject the pending promise with a `PromiseMapDeletedError`.
 */

/**
 * Error thrown when a promise is deleted before being resolved.
 */
export class PromiseMapDeletedError extends Error {
  public constructor(message = 'Promise was deleted before being resolved') {
    super(message);
    this.name = 'PromiseMapDeletedError';
  }
}

/**
 * Error thrown when a promise times out before being resolved.
 */
export class PromiseMapTimeoutError extends Error {
  public constructor(message = 'Promise timed out before being resolved') {
    super(message);
    this.name = 'PromiseMapTimeoutError';
  }
}

type PromiseMapEntry<V> = {
  resolve: (item: V) => void;
  reject: (error: Error) => void;
  promise: Promise<V>;
  timerId: ReturnType<typeof setTimeout> | undefined;
};

type PromiseMapOptions = {
  /**
   * Default TTL for all entries. Milliseconds.
   * If undefined, entries will not expire automatically.
   * Per-entry TTL can override this value.
   */
  defaultTtl?: number;
};

export class PromiseMap<K, V> {
  private readonly map = new Map<K, PromiseMapEntry<V>>();
  /** Milliseconds. */
  private readonly defaultTtl: number | undefined;

  public constructor(options: PromiseMapOptions = {}) {
    this.defaultTtl = options.defaultTtl;
  }

  /**
   * Get or create a promise for the given key.
   * The promise will resolve when `set()` is called with the same key.
   *
   * @param key - The key to get or create a promise for.
   * @param entryTtl - Optional TTL for this entry. Overrides the default TTL. Milliseconds.
   *                If the TTL expires before `set()` is called, the promise will be rejected
   *                with a `PromiseMapTimeoutError` and the entry will be removed.
   * @returns A promise that resolves when `set()` is called with the same key.
   */
  public async get(key: K, entryTtl?: number): Promise<V> {
    const existingEntry = this.map.get(key);
    if (existingEntry) {
      return existingEntry.promise;
    }

    const entry = this.createEntry(key, entryTtl ?? this.defaultTtl);
    return entry.promise;
  }

  /**
   * Resolve the promise for the given key with the provided value.
   * If no promise exists for the key, this is a no-op (the value is discarded).
   * Clears any pending timeout timer for the entry.
   */
  public set(key: K, value: V): this {
    const entry = this.map.get(key);

    if (entry) {
      // Clear timeout timer if set
      if (entry.timerId !== undefined) {
        clearTimeout(entry.timerId);
      }

      // Remove entry from map before resolving to prevent memory leaks
      this.map.delete(key);
      entry.resolve(value);
    }
    // If no entry exists, no one is waiting for this value - discard it

    return this;
  }

  /**
   * Delete an entry from the map and reject its associated promise.
   * Use this to clean up entries that will never be resolved (e.g., on timeout or cancellation).
   * Clears any pending timeout timer for the entry.
   *
   * @param key - The key to delete.
   * @param error - Optional custom error to reject the promise with.
   *                Defaults to `PromiseMapDeletedError`.
   * @returns `true` if an entry was deleted, `false` if no entry existed for the key.
   */
  public delete(key: K, error?: Error): boolean {
    const entry = this.map.get(key);

    if (!entry) {
      return false;
    }

    // Clear timeout timer if set
    if (entry.timerId !== undefined) {
      clearTimeout(entry.timerId);
    }

    // Remove entry from map before rejecting
    this.map.delete(key);

    // Reject the promise so callers are notified
    entry.reject(error ?? new PromiseMapDeletedError());

    return true;
  }

  /** Reject every unresolved response when its transport stops. */
  public clear(error: Error): void {
    for (const key of this.map.keys()) {
      this.delete(key, error);
    }
  }

  public get size(): number {
    return this.map.size;
  }

  private createEntry(key: K, entryTtl: number | undefined): PromiseMapEntry<V> {
    let resolve: (item: V) => void = () => {
      // Placeholder - will be replaced by Promise constructor
    };

    let reject: (error: Error) => void = () => {
      // Placeholder - will be replaced by Promise constructor
    };

    const promise = new Promise<V>((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    let timerId: ReturnType<typeof setTimeout> | undefined;

    if (entryTtl !== undefined) {
      timerId = setTimeout(() => {
        this.map.delete(key);
        reject(new PromiseMapTimeoutError());
      }, entryTtl);
    }

    const entry: PromiseMapEntry<V> = {
      resolve,
      reject,
      promise,
      timerId,
    };

    this.map.set(key, entry);

    return entry;
  }
}
