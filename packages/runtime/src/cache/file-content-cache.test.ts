// @vitest-environment node
/**
 * Tests for {@link FileContentCache} (TR11) — runtime-side cache abstraction
 * over file-content reads. Covers the two v1 implementations:
 *
 *   - {@link sharedPoolCache} — same-cluster, zero-copy reads via `SharedPool`.
 *   - {@link lruCache} — cross-process, in-memory copy via `LruMap`.
 *
 * Both implementations satisfy the same {@link FileContentCache} contract so
 * the filesystem bridge can substitute either without any caller-side
 * branches. Broadcast invalidation (OQ12 v1) is exercised separately via
 * {@link FileContentCache.invalidate} / {@link FileContentCache.clear}; the
 * downstream `listen('fileChange')` wiring is tested at the bridge layer.
 */

import { describe, expect, it } from 'vitest';
import type { FileContentCache } from '#cache/file-content-cache.js';
import { lruCache, sharedPoolCache } from '#cache/file-content-cache.js';

const sharedPoolBufferBytes = 4 * 1024 * 1024;

function bytes(...values: number[]): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(values.length);
  const view = new Uint8Array(buffer);
  view.set(values);
  return view;
}

const implementations: ReadonlyArray<{
  readonly name: string;
  readonly create: () => FileContentCache;
}> = [
  {
    name: 'lruCache',
    create: () => lruCache({ maxEntries: 16 }),
  },
  {
    name: 'sharedPoolCache',
    create: () => sharedPoolCache(new SharedArrayBuffer(sharedPoolBufferBytes)),
  },
];

describe.each(implementations)('FileContentCache: $name', ({ create }) => {
  it('should miss before any store call', () => {
    const cache = create();

    expect(cache.get('/missing.ts')).toBeUndefined();
  });

  it('should round-trip a stored entry', () => {
    const cache = create();
    cache.store('/box.ts', bytes(1, 2, 3, 4));

    const result = cache.get('/box.ts');

    expect(result).toBeDefined();
    expect([...result!]).toEqual([1, 2, 3, 4]);
  });

  it('should overwrite the previous entry on re-store', () => {
    const cache = create();
    cache.store('/box.ts', bytes(1, 2, 3));
    cache.store('/box.ts', bytes(9, 8));

    const result = cache.get('/box.ts');

    expect([...result!]).toEqual([9, 8]);
  });

  it('should miss after invalidate', () => {
    const cache = create();
    cache.store('/box.ts', bytes(1, 2, 3));

    cache.invalidate('/box.ts');

    expect(cache.get('/box.ts')).toBeUndefined();
  });

  it('should miss every entry after clear', () => {
    const cache = create();
    cache.store('/a.ts', bytes(1));
    cache.store('/b.ts', bytes(2));

    cache.clear();

    expect(cache.get('/a.ts')).toBeUndefined();
    expect(cache.get('/b.ts')).toBeUndefined();
  });

  it('should return a defensive copy so caller mutation cannot poison the cache', () => {
    const cache = create();
    cache.store('/box.ts', bytes(1, 2, 3));

    const first = cache.get('/box.ts')!;
    first[0] = 99;
    const second = cache.get('/box.ts')!;

    expect(second[0]).toBe(1);
  });
});

describe('lruCache eviction policy', () => {
  it('should evict the least-recently-used entry when the entry count exceeds maxEntries', () => {
    const cache = lruCache({ maxEntries: 2 });

    cache.store('/a.ts', bytes(1));
    cache.store('/b.ts', bytes(2));
    cache.get('/a.ts');
    cache.store('/c.ts', bytes(3));

    expect(cache.get('/b.ts')).toBeUndefined();
    expect(cache.get('/a.ts')).toBeDefined();
    expect(cache.get('/c.ts')).toBeDefined();
  });
});
