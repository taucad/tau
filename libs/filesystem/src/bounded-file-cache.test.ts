import { describe, it, expect, beforeEach } from 'vitest';
import { BoundedFileCache } from '#bounded-file-cache.js';

describe('BoundedFileCache', () => {
  describe('basic operations', () => {
    let cache: BoundedFileCache;

    beforeEach(() => {
      cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
    });

    it('should set and get entries', () => {
      const data = new Uint8Array([1, 2, 3]);
      cache.set('/a', data);
      expect(cache.get('/a')).toEqual(data);
    });

    it('should return undefined for missing path', () => {
      expect(cache.get('/missing')).toBeUndefined();
    });

    it('should remove entry on delete', () => {
      cache.set('/a', new Uint8Array([1, 2, 3]));
      cache.delete('/a');
      expect(cache.has('/a')).toBe(false);
      expect(cache.get('/a')).toBeUndefined();
    });

    it('should be no-op when deleting missing path', () => {
      cache.delete('/missing');
      expect(cache.size).toBe(0);
    });

    it('should return true for cached path', () => {
      cache.set('/a', new Uint8Array([1]));
      expect(cache.has('/a')).toBe(true);
    });

    it('should return false for uncached path', () => {
      expect(cache.has('/missing')).toBe(false);
    });

    it('should remove all entries on clear', () => {
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.totalBytes).toBe(0);
      expect(cache.has('/a')).toBe(false);
      expect(cache.has('/b')).toBe(false);
    });
  });

  describe('LRU eviction when maxEntries exceeded', () => {
    it('should evict oldest entry when adding beyond maxEntries', () => {
      const cache = new BoundedFileCache({ maxEntries: 2, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      cache.set('/c', new Uint8Array([3]));
      expect(cache.has('/a')).toBe(false);
      expect(cache.has('/b')).toBe(true);
      expect(cache.has('/c')).toBe(true);
    });
  });

  describe('LRU eviction when maxTotalBytes exceeded', () => {
    it('should evict oldest entries until totalBytes fits', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 6 });
      cache.set('/a', new Uint8Array([1, 2])); // 2 bytes
      cache.set('/b', new Uint8Array([3, 4])); // 2 bytes
      cache.set('/c', new Uint8Array([5, 6])); // 2 bytes
      cache.set('/d', new Uint8Array([7, 8])); // 2 bytes - evicts a
      expect(cache.has('/a')).toBe(false);
      expect(cache.has('/b')).toBe(true);
      expect(cache.has('/c')).toBe(true);
      expect(cache.has('/d')).toBe(true);
      expect(cache.totalBytes).toBe(6);
    });
  });

  describe('large files exceeding maxSingleFileBytes', () => {
    it('should not cache files larger than maxSingleFileBytes', () => {
      const cache = new BoundedFileCache({
        maxEntries: 10,
        maxTotalBytes: 1000,
        maxSingleFileBytes: 2,
      });
      const large = new Uint8Array([1, 2, 3]);
      cache.set('/large', large);
      expect(cache.has('/large')).toBe(false);
      expect(cache.get('/large')).toBeUndefined();
      expect(cache.size).toBe(0);
      expect(cache.totalBytes).toBe(0);
    });

    it('should cache files exactly at maxSingleFileBytes', () => {
      const cache = new BoundedFileCache({
        maxEntries: 10,
        maxTotalBytes: 100,
        maxSingleFileBytes: 3,
      });
      const data = new Uint8Array([1, 2, 3]);
      cache.set('/exact', data);
      expect(cache.get('/exact')).toEqual(data);
    });

    it('should return false from set when entry exceeds maxSingleFileBytes', () => {
      const cache = new BoundedFileCache({
        maxEntries: 10,
        maxTotalBytes: 1000,
        maxSingleFileBytes: 2,
      });
      const large = new Uint8Array([1, 2, 3]);
      const accepted = cache.set('/large', large);
      expect(accepted).toBe(false);
    });

    it('should return true from set when entry is accepted', () => {
      const cache = new BoundedFileCache({
        maxEntries: 10,
        maxTotalBytes: 100,
        maxSingleFileBytes: 10,
      });
      const accepted = cache.set('/small', new Uint8Array([1, 2, 3]));
      expect(accepted).toBe(true);
    });

    it('should return true from set when accepted after eviction', () => {
      const cache = new BoundedFileCache({ maxEntries: 2, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      const accepted = cache.set('/c', new Uint8Array([3]));
      expect(accepted).toBe(true);
      expect(cache.has('/a')).toBe(false);
      expect(cache.has('/c')).toBe(true);
    });
  });

  describe('peek', () => {
    it('should return cached data without promoting to most-recently-used', () => {
      const cache = new BoundedFileCache({ maxEntries: 3, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      cache.set('/c', new Uint8Array([3]));
      cache.peek('/a');
      cache.set('/d', new Uint8Array([4]));
      expect(cache.has('/a')).toBe(false);
      expect(cache.has('/b')).toBe(true);
      expect(cache.has('/c')).toBe(true);
      expect(cache.has('/d')).toBe(true);
    });

    it('should return undefined on cache miss', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      expect(cache.peek('/missing')).toBeUndefined();
    });

    it('should not mutate internal iteration order', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      cache.set('/c', new Uint8Array([3]));
      const orderBefore = [...cache.entries()].map(([k]) => k);
      cache.peek('/a');
      const orderAfter = [...cache.entries()].map(([k]) => k);
      expect(orderAfter).toEqual(orderBefore);
    });
  });

  describe('get moves entry to end of LRU', () => {
    it('should make entry most recently used on get', () => {
      const cache = new BoundedFileCache({ maxEntries: 3, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2]));
      cache.set('/c', new Uint8Array([3]));
      cache.get('/a'); // Moves a to end
      cache.set('/d', new Uint8Array([4])); // Evicts b (oldest)
      expect(cache.has('/a')).toBe(true);
      expect(cache.has('/b')).toBe(false);
      expect(cache.has('/c')).toBe(true);
      expect(cache.has('/d')).toBe(true);
    });
  });

  describe('rename', () => {
    it('should preserve data under new key', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      const data = new Uint8Array([1, 2, 3]);
      cache.set('/old', data);
      cache.rename('/old', '/new');
      expect(cache.has('/old')).toBe(false);
      expect(cache.get('/new')).toEqual(data);
    });

    it('should be no-op when oldPath and newPath are the same', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      const data = new Uint8Array([1, 2, 3]);
      cache.set('/same', data);
      cache.rename('/same', '/same');
      expect(cache.get('/same')).toEqual(data);
    });

    it('should be no-op when renaming missing path', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.rename('/missing', '/other');
      expect(cache.size).toBe(1);
      expect(cache.has('/a')).toBe(true);
    });
  });

  describe('eviction with empty map but exceeding maxTotalBytes', () => {
    it('should break eviction loop when map is empty but entry exceeds maxTotalBytes', () => {
      const cache = new BoundedFileCache({
        maxEntries: 10,
        maxTotalBytes: 1,
        maxSingleFileBytes: 5,
      });
      cache.set('/big', new Uint8Array([1, 2]));
      expect(cache.has('/big')).toBe(true);
      expect(cache.size).toBe(1);
    });
  });

  describe('entries', () => {
    it('should return all cached entries', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      cache.set('/a', new Uint8Array([1]));
      cache.set('/b', new Uint8Array([2, 3]));
      const entries = [...cache.entries()];
      expect(entries).toHaveLength(2);
      expect(entries.map(([k]) => k).sort()).toEqual(['/a', '/b']);
      expect(entries.find(([k]) => k === '/a')?.[1]).toEqual(new Uint8Array([1]));
      expect(entries.find(([k]) => k === '/b')?.[1]).toEqual(new Uint8Array([2, 3]));
    });
  });

  describe('size and totalBytes', () => {
    it('should reflect entry count in size', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      expect(cache.size).toBe(0);
      cache.set('/a', new Uint8Array([1]));
      expect(cache.size).toBe(1);
      cache.set('/b', new Uint8Array([2]));
      expect(cache.size).toBe(2);
      cache.delete('/a');
      expect(cache.size).toBe(1);
    });

    it('should reflect cached data size in totalBytes', () => {
      const cache = new BoundedFileCache({ maxEntries: 10, maxTotalBytes: 100 });
      expect(cache.totalBytes).toBe(0);
      cache.set('/a', new Uint8Array([1, 2, 3]));
      expect(cache.totalBytes).toBe(3);
      cache.set('/b', new Uint8Array([4, 5]));
      expect(cache.totalBytes).toBe(5);
      cache.set('/a', new Uint8Array([1])); // Update
      expect(cache.totalBytes).toBe(3); // 1 + 2
      cache.delete('/a');
      expect(cache.totalBytes).toBe(2);
    });
  });
});
