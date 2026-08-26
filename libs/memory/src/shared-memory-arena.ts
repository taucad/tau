/**
 * Arena allocator over a {@link SharedArrayBuffer} for lock-free cross-thread
 * file content caching.
 *
 * Layout (all multi-byte values are little-endian u32 accessed via {@link Atomics}):
 *
 * ```text
 * ┌──────────────────────────────┐  offset 0
 * │  Header  (64 bytes)         │
 * │  version · entryCount       │
 * │  dataWriteHead · capacity   │
 * ├──────────────────────────────┤  offset 64
 * │  Index   (maxEntries × 32)  │
 * │  [pathHashHi, pathHashLo,   │
 * │   dataOffset, dataLength,   │
 * │   state, pad, pad, pad]     │
 * ├──────────────────────────────┤
 * │  Data Region (bump-alloc)   │
 * └──────────────────────────────┘
 * ```
 *
 * @public
 */

/* eslint-disable @typescript-eslint/naming-convention -- Shared-memory ABI uses UPPER_SNAKE layout constants and enum-like state keys */

/**
 * Entry lifecycle states stored in the `state` slot of each index entry.
 * @public
 */
export const ARENA_ENTRY_STATE = {
  FREE: 0,
  WRITING: 1,
  READY: 2,
  STALE: 3,
} as const;

/**
 * Number of bytes reserved for the arena header.
 * @public
 */
export const ARENA_HEADER_BYTES = 64;

/**
 * Number of bytes per index entry (8 u32 slots × 4 bytes).
 * @public
 */
export const ARENA_ENTRY_BYTES = 32;

const HEADER_VERSION_OFFSET = 0;
const HEADER_ENTRY_COUNT_OFFSET = 1;
const HEADER_DATA_WRITE_HEAD_OFFSET = 2;

const ARENA_VERSION = 1;

const ENTRY_FIELD_PATH_HASH_HI = 0;
const ENTRY_FIELD_PATH_HASH_LO = 1;
const ENTRY_FIELD_DATA_OFFSET = 2;
const ENTRY_FIELD_DATA_LENGTH = 3;
const ENTRY_FIELD_STATE = 4;
const ENTRY_FIELD_LRU_SEQ = 5;

const ALIGNMENT = 8;

/**
 * Readable snapshot of a single arena index entry.
 * @public
 */
export type ArenaEntry = {
  pathHashHi: number;
  pathHashLo: number;
  dataOffset: number;
  dataLength: number;
  state: number;
};

/**
 * Options for constructing a {@link SharedMemoryArena}.
 * @public
 */
export type SharedMemoryArenaOptions = {
  /** Maximum number of index entries. Determines the size of the index region. */
  maxEntries: number;
  /** Eviction policy. `'none'` (default) rejects when full; `'lru'` evicts least-recently-used. */
  eviction?: 'none' | 'lru';
};

/**
 * Low-level bump allocator over a {@link SharedArrayBuffer} that manages
 * a fixed-size index of entries and a contiguous data region.
 *
 * Thread safety:
 * - A single writer allocates entries and publishes them.
 * - Multiple readers can concurrently scan the index via {@link Atomics.load}.
 * - Entries are immutable once published (state transitions: FREE → WRITING → READY → STALE).
 *
 * @public
 */
export class SharedMemoryArena {
  private readonly _header: Int32Array;
  private readonly _index: Int32Array;
  private readonly _buffer: SharedArrayBuffer;
  private readonly _maxEntries: number;
  private readonly _dataRegionStart: number;
  private readonly _eviction: 'none' | 'lru';
  private _lruSeq = 0;

  /**
   * Create or attach to a shared memory arena.
   *
   * @param buffer - Pre-allocated {@link SharedArrayBuffer} backing the arena.
   * @param options - Arena configuration (entry capacity).
   */
  public constructor(buffer: SharedArrayBuffer, options: SharedMemoryArenaOptions) {
    this._buffer = buffer;
    this._maxEntries = options.maxEntries;
    this._eviction = options.eviction ?? 'none';

    const headerSlots = ARENA_HEADER_BYTES / 4;
    this._header = new Int32Array(buffer, 0, headerSlots);

    const indexByteOffset = ARENA_HEADER_BYTES;
    const indexSlots = (this._maxEntries * ARENA_ENTRY_BYTES) / 4;
    this._index = new Int32Array(buffer, indexByteOffset, indexSlots);

    this._dataRegionStart = ARENA_HEADER_BYTES + this._maxEntries * ARENA_ENTRY_BYTES;

    const existingVersion = Atomics.load(this._header, HEADER_VERSION_OFFSET);
    if (existingVersion === 0) {
      Atomics.store(this._header, HEADER_VERSION_OFFSET, ARENA_VERSION);
      Atomics.store(this._header, HEADER_ENTRY_COUNT_OFFSET, 0);
      Atomics.store(this._header, HEADER_DATA_WRITE_HEAD_OFFSET, this._dataRegionStart);
    }
  }

  /**
   * Allocate space for a new entry with the given data size.
   *
   * @param dataSize - Number of bytes to reserve in the data region.
   * @returns Index of the allocated entry, or `-1` if the arena is full.
   */
  public allocateEntry(dataSize: number): number {
    let entryIndex = Atomics.load(this._header, HEADER_ENTRY_COUNT_OFFSET);
    let reusingSlot = false;

    if (entryIndex >= this._maxEntries) {
      if (this._eviction !== 'lru') {
        return -1;
      }
      const victimIndex = this._findEvictionCandidate();
      if (victimIndex === -1) {
        return -1;
      }
      this.markStale(victimIndex);
      entryIndex = victimIndex;
      reusingSlot = true;
    }

    const alignedSize = align(dataSize, ALIGNMENT);
    const dataOffset = Atomics.add(this._header, HEADER_DATA_WRITE_HEAD_OFFSET, alignedSize);

    if (dataOffset + alignedSize > this._buffer.byteLength) {
      Atomics.sub(this._header, HEADER_DATA_WRITE_HEAD_OFFSET, alignedSize);
      return -1;
    }

    const slotBase = entryIndex * (ARENA_ENTRY_BYTES / 4);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_PATH_HASH_HI, 0);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_PATH_HASH_LO, 0);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_DATA_OFFSET, dataOffset);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_DATA_LENGTH, dataSize);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_STATE, ARENA_ENTRY_STATE.WRITING);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_LRU_SEQ, 0);

    if (!reusingSlot) {
      Atomics.add(this._header, HEADER_ENTRY_COUNT_OFFSET, 1);
    }

    return entryIndex;
  }

  /**
   * Publish an allocated entry, making it visible to readers.
   * Sets the path hash and transitions the entry state from WRITING to READY.
   *
   * @param entryIndex - Index returned by {@link allocateEntry}.
   * @param pathHashHi - Upper 32 bits of the 64-bit path hash.
   * @param pathHashLo - Lower 32 bits of the 64-bit path hash.
   */
  public publishEntry(entryIndex: number, pathHashHi: number, pathHashLo: number): void {
    const slotBase = entryIndex * (ARENA_ENTRY_BYTES / 4);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_PATH_HASH_HI, pathHashHi);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_PATH_HASH_LO, pathHashLo);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_LRU_SEQ, ++this._lruSeq);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_STATE, ARENA_ENTRY_STATE.READY);
  }

  /**
   * Read entry metadata by index.
   *
   * @param entryIndex - Index of the entry to read.
   * @returns Entry snapshot or `undefined` if out of range.
   */
  public readEntry(entryIndex: number): ArenaEntry | undefined {
    if (entryIndex < 0 || entryIndex >= this._maxEntries) {
      return undefined;
    }

    const slotBase = entryIndex * (ARENA_ENTRY_BYTES / 4);
    const state = Atomics.load(this._index, slotBase + ENTRY_FIELD_STATE);

    if (this._eviction === 'lru' && state === ARENA_ENTRY_STATE.READY) {
      Atomics.store(this._index, slotBase + ENTRY_FIELD_LRU_SEQ, ++this._lruSeq);
    }

    return {
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      pathHashHi: Atomics.load(this._index, slotBase + ENTRY_FIELD_PATH_HASH_HI) >>> 0,
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      pathHashLo: Atomics.load(this._index, slotBase + ENTRY_FIELD_PATH_HASH_LO) >>> 0,
      dataOffset: Atomics.load(this._index, slotBase + ENTRY_FIELD_DATA_OFFSET),
      dataLength: Atomics.load(this._index, slotBase + ENTRY_FIELD_DATA_LENGTH),
      state,
    };
  }

  /**
   * Find an entry by its 64-bit path hash. Only READY entries are matched.
   *
   * @param pathHashHi - Upper 32 bits.
   * @param pathHashLo - Lower 32 bits.
   * @returns Entry index, or `-1` if not found.
   */
  public findEntry(pathHashHi: number, pathHashLo: number): number {
    const count = Atomics.load(this._header, HEADER_ENTRY_COUNT_OFFSET);
    for (let i = 0; i < count; i++) {
      const slotBase = i * (ARENA_ENTRY_BYTES / 4);
      const state = Atomics.load(this._index, slotBase + ENTRY_FIELD_STATE);
      if (state !== ARENA_ENTRY_STATE.READY) {
        continue;
      }
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      const hi = Atomics.load(this._index, slotBase + ENTRY_FIELD_PATH_HASH_HI) >>> 0;
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      const lo = Atomics.load(this._index, slotBase + ENTRY_FIELD_PATH_HASH_LO) >>> 0;
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      const pathHiUnsigned = pathHashHi >>> 0;
      // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- unsigned 32-bit conversion
      const pathLoUnsigned = pathHashLo >>> 0;
      if (hi === pathHiUnsigned && lo === pathLoUnsigned) {
        if (this._eviction === 'lru') {
          Atomics.store(this._index, slotBase + ENTRY_FIELD_LRU_SEQ, ++this._lruSeq);
        }
        return i;
      }
    }
    return -1;
  }

  /**
   * Mark an entry as stale, making it invisible to readers.
   *
   * @param entryIndex - Entry index to invalidate.
   */
  public markStale(entryIndex: number): void {
    if (entryIndex < 0 || entryIndex >= this._maxEntries) {
      return;
    }
    const slotBase = entryIndex * (ARENA_ENTRY_BYTES / 4);
    Atomics.store(this._index, slotBase + ENTRY_FIELD_STATE, ARENA_ENTRY_STATE.STALE);
  }

  /**
   * Find the best candidate for eviction: prefer STALE slots, then the READY
   * entry with the lowest LRU sequence counter.
   *
   * @returns Entry index of the eviction candidate, or `-1` if none found.
   */
  private _findEvictionCandidate(): number {
    const count = Atomics.load(this._header, HEADER_ENTRY_COUNT_OFFSET);
    let lruIndex = -1;
    let lruMin = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < count; i++) {
      const slotBase = i * (ARENA_ENTRY_BYTES / 4);
      const state = Atomics.load(this._index, slotBase + ENTRY_FIELD_STATE);

      if (state === ARENA_ENTRY_STATE.STALE || state === ARENA_ENTRY_STATE.FREE) {
        return i;
      }
      if (state === ARENA_ENTRY_STATE.READY) {
        const seq = Atomics.load(this._index, slotBase + ENTRY_FIELD_LRU_SEQ);
        if (seq < lruMin) {
          lruMin = seq;
          lruIndex = i;
        }
      }
    }

    return lruIndex;
  }

  /**
   * Number of entries currently allocated (including STALE).
   * @returns Current entry count from the arena header.
   */
  public get entryCount(): number {
    return Atomics.load(this._header, HEADER_ENTRY_COUNT_OFFSET);
  }

  /**
   * Number of data bytes consumed (write head minus data region start).
   * @returns Bytes used in the bump-allocated data region.
   */
  public get usedDataBytes(): number {
    return Atomics.load(this._header, HEADER_DATA_WRITE_HEAD_OFFSET) - this._dataRegionStart;
  }

  /**
   * Total capacity of the backing buffer in bytes.
   * @returns Size of the backing {@link SharedArrayBuffer} in bytes.
   */
  public get capacityBytes(): number {
    return this._buffer.byteLength;
  }

  /**
   * The underlying {@link SharedArrayBuffer}.
   * @returns The arena's backing buffer.
   */
  public get buffer(): SharedArrayBuffer {
    return this._buffer;
  }
}

function align(value: number, alignment: number): number {
  // oxlint-disable-next-line no-bitwise -- round up to a multiple of `alignment` via bit mask
  return (value + alignment - 1) & ~(alignment - 1);
}
