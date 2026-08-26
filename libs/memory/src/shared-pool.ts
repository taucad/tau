/**
 * Generic thread-safe content pool backed by a {@link SharedArrayBuffer}.
 *
 * A single writer stores keyed binary content. Multiple readers resolve
 * content without any IPC — reads are lock-free {@link Atomics.load}
 * lookups into shared memory.
 *
 * - {@link resolve} returns a zero-copy `Uint8Array` view backed by the
 *   `SharedArrayBuffer` — ideal for consumers that accept SAB (e.g., patched
 *   GLTFLoader, custom parsers).
 * - {@link resolveCopy} returns an `ArrayBuffer`-backed copy — use when the
 *   consumer requires a regular `ArrayBuffer` or ownership transfer.
 *
 * @public
 */

/* eslint-disable @typescript-eslint/naming-convention -- default pool limits use conventional UPPER_SNAKE names */

import { SharedMemoryArena, ARENA_ENTRY_STATE } from '#shared-memory-arena.js';
import { fnv1a64 } from '#fnv1a64.js';

const DEFAULT_MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 4096;

/**
 * Options for constructing a {@link SharedPool}.
 * @public
 */
export type SharedPoolOptions = {
  /** Maximum number of cached entries. */
  maxEntries?: number;
  /** Entries larger than this are skipped (default 10 MB). */
  maxEntryBytes?: number;
  /** Eviction policy. `'none'` (default) rejects when full; `'lru'` evicts least-recently-used. */
  eviction?: 'none' | 'lru';
};

/**
 * High-level shared-memory content cache.
 *
 * Wraps a {@link SharedMemoryArena} to provide key-based store/resolve
 * semantics with FNV-1a hashing for O(n) lookup (n = entry count).
 *
 * Thread model:
 * - **Writer** (owning thread): {@link store}, {@link invalidate}, {@link clear}
 * - **Reader** (any thread): {@link resolve}, {@link resolveCopy}, {@link has}
 *
 * The writer maintains a bidirectional key-to-index mapping for
 * O(1) invalidation. Only the storing thread can invalidate entries.
 *
 * @public
 */
export class SharedPool {
  private readonly _arena: SharedMemoryArena;
  private readonly _buffer: SharedArrayBuffer;
  private readonly _maxEntryBytes: number;
  /** Writer-side mapping from key to entry index for O(1) invalidation. */
  private readonly _keyToIndex = new Map<string, number>();
  /** Reverse mapping from entry index to key, kept in sync with {@link _keyToIndex} for eviction cleanup. */
  private readonly _indexToKey = new Map<number, string>();

  /**
   * Create or attach to a shared pool.
   *
   * @param buffer - Pre-allocated {@link SharedArrayBuffer}.
   * @param options - Pool limits.
   */
  public constructor(buffer: SharedArrayBuffer, options?: SharedPoolOptions) {
    this._buffer = buffer;
    this._arena = new SharedMemoryArena(buffer, {
      maxEntries: options?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      eviction: options?.eviction,
    });
    this._maxEntryBytes = options?.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  }

  /**
   * Store binary content in the shared pool.
   *
   * @param key - String key for cache lookup.
   * @param data - Raw content bytes.
   * @returns `true` if stored successfully, `false` if skipped (oversized or arena full).
   */
  // oxlint-disable-next-line enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- accepts content from kernels that may use ArrayBuffer or SharedArrayBuffer
  public store(key: string, data: Uint8Array): boolean {
    if (data.byteLength > this._maxEntryBytes) {
      return false;
    }

    const entryIndex = this._arena.allocateEntry(data.byteLength);
    if (entryIndex === -1) {
      return false;
    }

    const evictedKey = this._indexToKey.get(entryIndex);
    if (evictedKey !== undefined) {
      this._keyToIndex.delete(evictedKey);
    }

    const entry = this._arena.readEntry(entryIndex)!;
    if (data.byteLength > 0) {
      const target = new Uint8Array(this._buffer, entry.dataOffset, entry.dataLength);
      target.set(data);
    }

    const [hashHi, hashLo] = fnv1a64(key);
    this._arena.publishEntry(entryIndex, hashHi, hashLo);
    this._keyToIndex.set(key, entryIndex);
    this._indexToKey.set(entryIndex, key);

    return true;
  }

  /**
   * Resolve content from the shared pool as a zero-copy SAB view.
   *
   * The returned `Uint8Array` is backed by the {@link SharedArrayBuffer};
   * callers must not transfer it. For ownership-safe copies, use
   * {@link resolveCopy}.
   *
   * @param key - String key to look up.
   * @returns SAB-backed view, or `undefined` on cache miss.
   */
  // oxlint-disable-next-line enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- intentionally SAB-backed for zero-copy sharing
  public resolve(key: string): Uint8Array<SharedArrayBuffer> | undefined {
    const [hashHi, hashLo] = fnv1a64(key);
    const entryIndex = this._arena.findEntry(hashHi, hashLo);
    if (entryIndex === -1) {
      return undefined;
    }

    const entry = this._arena.readEntry(entryIndex);
    if (!entry || entry.state !== ARENA_ENTRY_STATE.READY) {
      return undefined;
    }

    return new Uint8Array(this._buffer, entry.dataOffset, entry.dataLength);
  }

  /**
   * Resolve content from the shared pool as an independent `ArrayBuffer`-backed copy.
   *
   * Safe for `postMessage` transfer or consumers that require regular `ArrayBuffer`.
   *
   * @param key - String key to look up.
   * @returns Detached copy, or `undefined` on cache miss.
   */
  public resolveCopy(key: string): Uint8Array<ArrayBuffer> | undefined {
    const view = this.resolve(key);
    if (!view) {
      return undefined;
    }
    return new Uint8Array(view);
  }

  /**
   * Check whether the pool contains a READY entry for the given key.
   *
   * @param key - String key.
   * @returns `true` if a valid entry exists.
   */
  public has(key: string): boolean {
    return this.resolve(key) !== undefined;
  }

  /**
   * Mark a cached entry as stale, causing subsequent reads to miss.
   *
   * Writer-only: uses the local `_keyToIndex` map for O(1) lookup.
   *
   * @param key - String key to invalidate.
   */
  public invalidate(key: string): void {
    const localIndex = this._keyToIndex.get(key);
    if (localIndex === undefined) {
      return;
    }
    this._arena.markStale(localIndex);
    this._keyToIndex.delete(key);
    this._indexToKey.delete(localIndex);
  }

  /**
   * Invalidate all entries in the pool.
   */
  public clear(): void {
    for (const index of this._keyToIndex.values()) {
      this._arena.markStale(index);
    }
    this._keyToIndex.clear();
    this._indexToKey.clear();
  }

  /**
   * Number of entries allocated in the underlying arena.
   * @returns Entry count from the shared arena.
   */
  public get entryCount(): number {
    return this._arena.entryCount;
  }

  /**
   * Bytes consumed in the data region.
   * @returns Bytes used for cached payloads.
   */
  public get usedBytes(): number {
    return this._arena.usedDataBytes;
  }

  /**
   * Total capacity of the backing buffer in bytes.
   * @returns Size of the backing {@link SharedArrayBuffer} in bytes.
   */
  public get capacityBytes(): number {
    return this._arena.capacityBytes;
  }

  /**
   * The underlying {@link SharedArrayBuffer}.
   * @returns The pool's backing buffer.
   */
  public get buffer(): SharedArrayBuffer {
    return this._buffer;
  }
}
