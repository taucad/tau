/**
 * Runtime-side file content cache abstraction (TR11).
 *
 * The runtime filesystem bridge previously assumed the host always provided a
 * `SharedPool`-backed file pool, which only works when the renderer and the
 * kernel share a V8 cluster (browser worker, Electron worker_thread). The
 * `FileContentCache` interface lifts that constraint: any cache implementation
 * that satisfies `store`/`get`/`invalidate`/`clear` slots into the bridge
 * regardless of locality.
 *
 * Two v1 implementations ship inline:
 *
 *   - {@link sharedPoolCache} — wraps `SharedPool` for same-cluster topologies
 *     (T1 browser, T3 Electron renderer + worker_thread). Reads still execute
 *     as zero-IPC `Atomics.load` lookups against shared memory; this layer
 *     only adapts the API surface.
 *   - {@link lruCache} — wraps `LruMap` for cross-process topologies
 *     (T2 in-process Node, T5+ subprocess/remote runners). Each entry is held
 *     as an in-memory `Uint8Array` copy.
 *
 * Both implementations return defensive copies from {@link FileContentCache.get}
 * so caller-side mutation cannot poison the cache. Invalidation is currently
 * caller-driven (broadcast over `listen('fileChange')`); ETag/mtime per entry
 * is deferred to v2 (OQ12 — see `docs/research/runtime-transport-target-architecture.md`).
 *
 * @public
 */

import { LruMap } from '@taucad/utils/cache';
import { SharedPool } from '@taucad/memory';

/**
 * Generic content cache contract used by the runtime filesystem bridge.
 *
 * The bridge calls {@link get} on every read before issuing the underlying
 * RPC; on a miss it forwards to the host and {@link store}s the result. The
 * cache owns its keying / eviction / locality semantics — callers stay
 * implementation-agnostic.
 *
 * @public
 */
export type FileContentCache = {
  /**
   * Look up a previously stored entry. Returns a defensive `Uint8Array<ArrayBuffer>`
   * copy on hit so callers can mutate the result without poisoning the cache;
   * returns `undefined` on miss.
   */
  get(key: string): Uint8Array<ArrayBuffer> | undefined;
  /**
   * Insert or overwrite the cached bytes for `key`. Implementations may
   * reject oversized entries or evict older entries to make room.
   */
  store(key: string, data: Uint8Array<ArrayBuffer>): void;
  /** Drop the entry for `key`, if any. Idempotent. */
  invalidate(key: string): void;
  /** Drop every entry. Idempotent. */
  clear(): void;
};

/**
 * Options for {@link lruCache}.
 * @public
 */
export type LruCacheOptions = {
  /** Maximum number of cached entries before LRU eviction. */
  maxEntries: number;
};

/**
 * In-memory LRU implementation of {@link FileContentCache}, backed by
 * `LruMap`. Suited to cross-process topologies (T2, T5+) where the renderer
 * and host live in distinct V8 clusters and `SharedArrayBuffer` is unavailable
 * or undesirable.
 *
 * @param options - Cache size configuration.
 * @returns An LRU-backed {@link FileContentCache}.
 * @public
 */
export const lruCache = (options: LruCacheOptions): FileContentCache => {
  const map = new LruMap<Uint8Array<ArrayBuffer>>({ maxEntries: options.maxEntries });
  return {
    get(key) {
      const value = map.get(key);
      return value === undefined ? undefined : new Uint8Array(value);
    },
    store(key, data) {
      map.set(key, new Uint8Array(data));
    },
    invalidate(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
};

/**
 * Shared-memory implementation of {@link FileContentCache}, backed by the
 * `SharedPool` writer-side API. Same-cluster only (T1 browser worker, T3
 * Electron renderer + worker_thread); reads on the consumer side stay
 * zero-copy via `pool.resolve()`.
 *
 * The cache adapts {@link FileContentCache.get} onto `pool.resolveCopy()` so
 * callers receive a defensive copy; `pool.resolve()` is still available for
 * downstream consumers that explicitly opt into the SAB-view fast-path
 * (see `@taucad/fs-bridge`).
 *
 * @param buffer - Pre-allocated `SharedArrayBuffer` backing the pool.
 * @returns A `SharedPool`-backed {@link FileContentCache}.
 * @public
 */
export const sharedPoolCache = (buffer: SharedArrayBuffer): FileContentCache => {
  const pool = new SharedPool(buffer, { eviction: 'lru' });
  return {
    get(key) {
      return pool.resolveCopy(key);
    },
    store(key, data) {
      /*
       * `SharedPool.store` allocates a fresh arena slot every call without
       * coalescing duplicate keys, so consecutive writes leave the prior entry
       * resolvable until the arena cycles around. Invalidate first so the
       * cache surface honours overwrite semantics that the LRU peer also
       * provides.
       */
      pool.invalidate(key);
      pool.store(key, data);
    },
    invalidate(key) {
      pool.invalidate(key);
    },
    clear() {
      pool.clear();
    },
  };
};
