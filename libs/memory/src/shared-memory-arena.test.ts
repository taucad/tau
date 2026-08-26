import { describe, it, expect } from 'vitest';
import { SharedMemoryArena, ARENA_ENTRY_STATE, ARENA_HEADER_BYTES, ARENA_ENTRY_BYTES } from '#shared-memory-arena.js';

function createArena(totalBytes = 64 * 1024, maxEntries = 128): SharedMemoryArena {
  const buffer = new SharedArrayBuffer(totalBytes);
  return new SharedMemoryArena(buffer, { maxEntries });
}

describe('SharedMemoryArena', () => {
  it('should allocate an entry and return a valid offset', () => {
    const arena = createArena();
    const dataSize = 256;
    const index = arena.allocateEntry(dataSize);

    expect(index).toBeGreaterThanOrEqual(0);

    const entry = arena.readEntry(index);
    expect(entry).toBeDefined();
    expect(entry!.dataLength).toBe(dataSize);
    expect(entry!.dataOffset).toBeGreaterThanOrEqual(0);
    expect(entry!.state).toBe(ARENA_ENTRY_STATE.WRITING);
  });

  it('should publish an entry making it visible to readers', () => {
    const arena = createArena();
    const index = arena.allocateEntry(64);
    expect(index).toBeGreaterThanOrEqual(0);

    arena.publishEntry(index, 0xde_ad_be_ef, 0xca_fe_ba_be);

    const entry = arena.readEntry(index);
    expect(entry).toBeDefined();
    expect(entry!.state).toBe(ARENA_ENTRY_STATE.READY);
    expect(entry!.pathHashHi).toBe(0xde_ad_be_ef);
    expect(entry!.pathHashLo).toBe(0xca_fe_ba_be);
  });

  it('should find an entry by path hash after publishing', () => {
    const arena = createArena();
    const index = arena.allocateEntry(128);
    arena.publishEntry(index, 0x12_34_56_78, 0x9a_bc_de_f0);

    const found = arena.findEntry(0x12_34_56_78, 0x9a_bc_de_f0);
    expect(found).toBe(index);
  });

  it('should return -1 for an unknown hash', () => {
    const arena = createArena();
    const found = arena.findEntry(0xff_ff_ff_ff, 0xff_ff_ff_ff);
    expect(found).toBe(-1);
  });

  it('should see published entry from a second arena instance sharing the same buffer', () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const writer = new SharedMemoryArena(buffer, { maxEntries: 128 });
    const reader = new SharedMemoryArena(buffer, { maxEntries: 128 });

    const index = writer.allocateEntry(64);
    const data = new Uint8Array(buffer, writer.readEntry(index)!.dataOffset, 64);
    data.set(new TextEncoder().encode('hello shared memory'));

    writer.publishEntry(index, 0xaa_aa, 0xbb_bb);

    const foundIndex = reader.findEntry(0xaa_aa, 0xbb_bb);
    expect(foundIndex).toBe(index);

    const entry = reader.readEntry(foundIndex);
    expect(entry).toBeDefined();
    expect(entry!.state).toBe(ARENA_ENTRY_STATE.READY);

    const readData = new Uint8Array(buffer, entry!.dataOffset, entry!.dataLength);
    const text = new TextDecoder().decode(readData);
    expect(text.startsWith('hello shared memory')).toBe(true);
  });

  it('should reject allocation when data region is full', () => {
    const totalBytes = ARENA_HEADER_BYTES + ARENA_ENTRY_BYTES * 4 + 128;
    const arena = createArena(totalBytes, 4);

    const index1 = arena.allocateEntry(64);
    expect(index1).toBeGreaterThanOrEqual(0);

    const index2 = arena.allocateEntry(64);
    expect(index2).toBeGreaterThanOrEqual(0);

    const index3 = arena.allocateEntry(64);
    expect(index3).toBe(-1);
  });

  it('should reject allocation when entry slots are exhausted', () => {
    const arena = createArena(1024 * 1024, 2);

    const index1 = arena.allocateEntry(32);
    expect(index1).toBeGreaterThanOrEqual(0);

    const index2 = arena.allocateEntry(32);
    expect(index2).toBeGreaterThanOrEqual(0);

    const index3 = arena.allocateEntry(32);
    expect(index3).toBe(-1);
  });

  it('should mark entries as STALE via markStale', () => {
    const arena = createArena();
    const index = arena.allocateEntry(64);
    arena.publishEntry(index, 0x11_11, 0x22_22);

    expect(arena.readEntry(index)!.state).toBe(ARENA_ENTRY_STATE.READY);

    arena.markStale(index);
    expect(arena.readEntry(index)!.state).toBe(ARENA_ENTRY_STATE.STALE);

    const found = arena.findEntry(0x11_11, 0x22_22);
    expect(found).toBe(-1);
  });

  it('should report correct entryCount and usedBytes', () => {
    const arena = createArena();

    expect(arena.entryCount).toBe(0);
    expect(arena.usedDataBytes).toBe(0);

    const index1 = arena.allocateEntry(100);
    arena.publishEntry(index1, 1, 1);

    expect(arena.entryCount).toBe(1);
    expect(arena.usedDataBytes).toBeGreaterThanOrEqual(100);

    const index2 = arena.allocateEntry(200);
    arena.publishEntry(index2, 2, 2);

    expect(arena.entryCount).toBe(2);
    expect(arena.usedDataBytes).toBeGreaterThanOrEqual(300);
  });

  it('should align data allocations to 8 bytes', () => {
    const arena = createArena();
    const index1 = arena.allocateEntry(3);
    const index2 = arena.allocateEntry(5);

    const entry1 = arena.readEntry(index1)!;
    const entry2 = arena.readEntry(index2)!;

    expect(entry1.dataOffset % 8).toBe(0);
    expect(entry2.dataOffset % 8).toBe(0);
    expect(entry2.dataOffset).toBe(entry1.dataOffset + 8);
  });

  it('should report capacityBytes from the buffer', () => {
    const totalBytes = 64 * 1024;
    const arena = createArena(totalBytes, 128);
    expect(arena.capacityBytes).toBe(totalBytes);
  });

  describe('LRU eviction', () => {
    function createLruArena(totalBytes = 64 * 1024, maxEntries = 4): SharedMemoryArena {
      const buffer = new SharedArrayBuffer(totalBytes);
      return new SharedMemoryArena(buffer, { maxEntries, eviction: 'lru' });
    }

    it('should reclaim STALE slot for new allocation when eviction is lru', () => {
      const arena = createLruArena(64 * 1024, 3);

      const i0 = arena.allocateEntry(32);
      arena.publishEntry(i0, 0x10, 0x10);

      const i1 = arena.allocateEntry(32);
      arena.publishEntry(i1, 0x20, 0x20);

      const i2 = arena.allocateEntry(32);
      arena.publishEntry(i2, 0x30, 0x30);

      // All slots used — mark first as stale
      arena.markStale(i0);

      // New allocation should succeed by reusing the stale slot
      const i3 = arena.allocateEntry(32);
      expect(i3).toBeGreaterThanOrEqual(0);
      arena.publishEntry(i3, 0x40, 0x40);

      expect(arena.findEntry(0x40, 0x40)).toBe(i3);
      expect(arena.findEntry(0x10, 0x10)).toBe(-1);
    });

    it('should evict the least-recently-used entry when arena is full', () => {
      const arena = createLruArena(64 * 1024, 3);

      const i0 = arena.allocateEntry(32);
      arena.publishEntry(i0, 0xaa, 0xaa);

      const i1 = arena.allocateEntry(32);
      arena.publishEntry(i1, 0xbb, 0xbb);

      const i2 = arena.allocateEntry(32);
      arena.publishEntry(i2, 0xcc, 0xcc);

      // All 3 slots full, no stale entries — LRU should auto-evict oldest
      const i3 = arena.allocateEntry(32);
      expect(i3).toBeGreaterThanOrEqual(0);
      arena.publishEntry(i3, 0xdd, 0xdd);

      // Entry 0 (oldest / least recently used) should be evicted
      expect(arena.findEntry(0xaa, 0xaa)).toBe(-1);
      // Newer entries should survive
      expect(arena.findEntry(0xbb, 0xbb)).toBeGreaterThanOrEqual(0);
      expect(arena.findEntry(0xcc, 0xcc)).toBeGreaterThanOrEqual(0);
      expect(arena.findEntry(0xdd, 0xdd)).toBeGreaterThanOrEqual(0);
    });

    it('should update LRU access order on readEntry', () => {
      const arena = createLruArena(64 * 1024, 3);

      const i0 = arena.allocateEntry(32);
      arena.publishEntry(i0, 0x11, 0x11);

      const i1 = arena.allocateEntry(32);
      arena.publishEntry(i1, 0x22, 0x22);

      const i2 = arena.allocateEntry(32);
      arena.publishEntry(i2, 0x33, 0x33);

      // Touch entry 0 to make it recently used
      arena.readEntry(i0);

      // Allocate a new entry — should evict entry 1 (least recently used)
      const i3 = arena.allocateEntry(32);
      expect(i3).toBeGreaterThanOrEqual(0);
      arena.publishEntry(i3, 0x44, 0x44);

      // Entry 0 was touched, should survive
      expect(arena.findEntry(0x11, 0x11)).toBeGreaterThanOrEqual(0);
      // Entry 1 was the LRU candidate
      expect(arena.findEntry(0x22, 0x22)).toBe(-1);
      // Entry 2 and new entry 3 survive
      expect(arena.findEntry(0x33, 0x33)).toBeGreaterThanOrEqual(0);
      expect(arena.findEntry(0x44, 0x44)).toBeGreaterThanOrEqual(0);
    });

    it('should not evict when eviction is none (default)', () => {
      const arena = createArena(64 * 1024, 2);

      const i0 = arena.allocateEntry(32);
      arena.publishEntry(i0, 0x10, 0x10);

      const i1 = arena.allocateEntry(32);
      arena.publishEntry(i1, 0x20, 0x20);

      // Arena is full, eviction is 'none' → should fail
      const i2 = arena.allocateEntry(32);
      expect(i2).toBe(-1);
    });
  });
});
