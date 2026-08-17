import { describe, it, expect } from 'vitest';
import { SharedPool } from '#shared-pool.js';
import { ARENA_HEADER_BYTES, ARENA_ENTRY_BYTES } from '#shared-memory-arena.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function createPool(totalBytes = 256 * 1024, maxEntries = 256): SharedPool {
  const buffer = new SharedArrayBuffer(totalBytes);
  return new SharedPool(buffer, { maxEntries });
}

describe('SharedPool', () => {
  it('should round-trip content via store and resolveCopy', () => {
    const pool = createPool();
    const data = encoder.encode('hello world');
    const stored = pool.store('main.ts', new Uint8Array(data.buffer));
    expect(stored).toBe(true);

    const resolved = pool.resolveCopy('main.ts');
    expect(resolved).toBeDefined();
    expect(decoder.decode(resolved)).toBe('hello world');
  });

  it('should return undefined for unknown keys', () => {
    const pool = createPool();
    const resolved = pool.resolve('unknown-key');
    expect(resolved).toBeUndefined();
  });

  it('should invalidate an entry so resolve returns undefined', () => {
    const pool = createPool();
    pool.store('file.ts', encoder.encode('content'));

    expect(pool.resolve('file.ts')).toBeDefined();

    pool.invalidate('file.ts');

    expect(pool.resolve('file.ts')).toBeUndefined();
  });

  it('should return false when storing data exceeding maxEntryBytes', () => {
    const pool = createPool(256 * 1024, 256);
    const oversized = new Uint8Array(11 * 1024 * 1024);
    const stored = pool.store('huge.bin', oversized);
    expect(stored).toBe(false);
  });

  it('should store and resolve multiple independent entries', () => {
    const pool = createPool();

    pool.store('alpha', encoder.encode('alpha'));
    pool.store('bravo', encoder.encode('bravo'));
    pool.store('charlie', encoder.encode('charlie'));

    expect(decoder.decode(pool.resolveCopy('alpha'))).toBe('alpha');
    expect(decoder.decode(pool.resolveCopy('bravo'))).toBe('bravo');
    expect(decoder.decode(pool.resolveCopy('charlie'))).toBe('charlie');
  });

  it('should clear all entries', () => {
    const pool = createPool();

    pool.store('x', encoder.encode('x'));
    pool.store('y', encoder.encode('y'));
    expect(pool.entryCount).toBe(2);

    pool.clear();

    expect(pool.resolve('x')).toBeUndefined();
    expect(pool.resolve('y')).toBeUndefined();
  });

  it('should share data between two pool instances on the same buffer', () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const writer = new SharedPool(buffer, { maxEntries: 128 });
    const reader = new SharedPool(buffer, { maxEntries: 128 });

    writer.store('shared', encoder.encode('shared data'));

    const resolved = reader.resolveCopy('shared');
    expect(resolved).toBeDefined();
    expect(decoder.decode(resolved)).toBe('shared data');
  });

  it('should report correct entryCount', () => {
    const pool = createPool();
    expect(pool.entryCount).toBe(0);

    pool.store('one', encoder.encode('1'));
    expect(pool.entryCount).toBe(1);

    pool.store('two', encoder.encode('2'));
    expect(pool.entryCount).toBe(2);
  });

  it('should report usedBytes growing with stored content', () => {
    const pool = createPool();
    const initial = pool.usedBytes;

    pool.store('data', encoder.encode('some content here'));
    expect(pool.usedBytes).toBeGreaterThan(initial);
  });

  it('should report capacityBytes from the buffer', () => {
    const totalBytes = 128 * 1024;
    const pool = createPool(totalBytes);
    expect(pool.capacityBytes).toBe(totalBytes);
  });

  it('should report has correctly', () => {
    const pool = createPool();
    expect(pool.has('missing')).toBe(false);

    pool.store('present', encoder.encode('data'));
    expect(pool.has('present')).toBe(true);

    pool.invalidate('present');
    expect(pool.has('present')).toBe(false);
  });

  it('should return false when arena is full', () => {
    const totalBytes = ARENA_HEADER_BYTES + ARENA_ENTRY_BYTES * 2 + 128;
    const pool = new SharedPool(new SharedArrayBuffer(totalBytes), { maxEntries: 2 });

    expect(pool.store('a', encoder.encode('aa'))).toBe(true);
    expect(pool.store('b', encoder.encode('bb'))).toBe(true);
    expect(pool.store('c', encoder.encode('cc'))).toBe(false);
  });

  it('should handle empty content', () => {
    const pool = createPool();
    const stored = pool.store('empty', new Uint8Array(0));
    expect(stored).toBe(true);

    const resolved = pool.resolve('empty');
    expect(resolved).toBeDefined();
    expect(resolved?.byteLength).toBe(0);
  });

  it('should produce consistent hashes for the same key', () => {
    const pool = createPool();
    pool.store('consistent', encoder.encode('data1'));

    const result = pool.resolveCopy('consistent');
    expect(result).toBeDefined();
    expect(decoder.decode(result)).toBe('data1');
  });

  it('should return SAB-backed view from resolve()', () => {
    const pool = createPool();
    pool.store('sab-test', encoder.encode('sab content'));

    const view = pool.resolve('sab-test');
    expect(view).toBeDefined();
    expect(view?.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(decoder.decode(view)).toBe('sab content');
  });

  it('should return ArrayBuffer-backed copy from resolveCopy()', () => {
    const pool = createPool();
    pool.store('copy-test', encoder.encode('copy content'));

    const copy = pool.resolveCopy('copy-test');
    expect(copy).toBeDefined();
    expect(copy!.buffer).toBeInstanceOf(ArrayBuffer);
    expect(copy!.buffer).not.toBeInstanceOf(SharedArrayBuffer);

    // Modifying the copy should not affect pool data
    copy![0] = 0xff;
    const freshCopy = pool.resolveCopy('copy-test');
    expect(decoder.decode(freshCopy)).toBe('copy content');
  });

  it('should no-op when reader-side instance calls invalidate (writer-only invariant)', () => {
    const buffer = new SharedArrayBuffer(256 * 1024);
    const writer = new SharedPool(buffer, { maxEntries: 128 });
    const reader = new SharedPool(buffer, { maxEntries: 128 });

    writer.store('params.json', encoder.encode('{"version":1}'));
    expect(decoder.decode(reader.resolveCopy('params.json'))).toBe('{"version":1}');

    reader.invalidate('params.json');

    expect(reader.resolve('params.json')).toBeDefined();
    expect(writer.resolve('params.json')).toBeDefined();
  });

  it('should no-op when invalidating a key that does not exist', () => {
    const pool = createPool();
    expect(() => {
      pool.invalidate('nonexistent');
    }).not.toThrow();
  });

  it('should accept maxEntryBytes option', () => {
    const pool = new SharedPool(new SharedArrayBuffer(256 * 1024), {
      maxEntries: 256,
      maxEntryBytes: 100,
    });

    const small = new Uint8Array(50);
    expect(pool.store('small', small)).toBe(true);

    const oversized = new Uint8Array(101);
    expect(pool.store('oversized', oversized)).toBe(false);
  });

  describe('LRU eviction', () => {
    function createLruPool(totalBytes = 256 * 1024, maxEntries = 3): SharedPool {
      const buffer = new SharedArrayBuffer(totalBytes);
      return new SharedPool(buffer, { maxEntries, eviction: 'lru' });
    }

    it('should evict least-recently-used entry when pool is full', () => {
      const pool = createLruPool();

      pool.store('a', encoder.encode('alpha'));
      pool.store('b', encoder.encode('bravo'));
      pool.store('c', encoder.encode('charlie'));

      pool.store('d', encoder.encode('delta'));

      expect(pool.resolve('a')).toBeUndefined();
      expect(decoder.decode(pool.resolveCopy('b'))).toBe('bravo');
      expect(decoder.decode(pool.resolveCopy('c'))).toBe('charlie');
      expect(decoder.decode(pool.resolveCopy('d'))).toBe('delta');
    });

    it('should not corrupt _keyToIndex when LRU evicts an entry', () => {
      const pool = createLruPool();

      pool.store('a', encoder.encode('alpha'));
      pool.store('b', encoder.encode('bravo'));
      pool.store('c', encoder.encode('charlie'));

      pool.store('d', encoder.encode('delta'));

      pool.invalidate('a');

      expect(decoder.decode(pool.resolveCopy('b'))).toBe('bravo');
      expect(decoder.decode(pool.resolveCopy('c'))).toBe('charlie');
      expect(decoder.decode(pool.resolveCopy('d'))).toBe('delta');
    });

    it('should allow re-storing a key after its slot was LRU-evicted', () => {
      const pool = createLruPool();

      pool.store('a', encoder.encode('original'));
      pool.store('b', encoder.encode('bravo'));
      pool.store('c', encoder.encode('charlie'));

      pool.store('d', encoder.encode('delta'));
      expect(pool.resolve('a')).toBeUndefined();

      pool.store('a', encoder.encode('updated'));
      expect(decoder.decode(pool.resolveCopy('a'))).toBe('updated');
    });
  });
});
