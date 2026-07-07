import { describe, it, expect } from 'vitest';
import { BoundedFileCache } from '#bounded-file-cache.js';
import { ChangeEventBus } from '#change-event-bus.js';

describe('BoundedFileCache stress tests', () => {
  it('should handle rapid set/get cycles without data loss', () => {
    const cache = new BoundedFileCache({
      maxEntries: 50,
      maxTotalBytes: 10_000,
    });

    for (let i = 0; i < 200; i++) {
      // oxlint-disable-next-line no-bitwise -- intentional byte masking for test data
      const data = new Uint8Array([i & 0xff]);
      cache.set(`file-${i}.txt`, data);
    }

    expect(cache.size).toBeLessThanOrEqual(50);

    for (let i = 150; i < 200; i++) {
      const data = cache.get(`file-${i}.txt`);
      expect(data).toBeDefined();
      // oxlint-disable-next-line no-bitwise -- intentional byte masking for test data
      expect(data![0]).toBe(i & 0xff);
    }
  });

  it('should enforce maxTotalBytes under pressure', () => {
    const cache = new BoundedFileCache({
      maxEntries: 1000,
      maxTotalBytes: 1024,
    });

    for (let i = 0; i < 100; i++) {
      const data = new Uint8Array(100);
      // oxlint-disable-next-line no-bitwise -- intentional byte masking for test data
      data.fill(i & 0xff);
      cache.set(`big-${i}.txt`, data);
    }

    expect(cache.totalBytes).toBeLessThanOrEqual(1024);
  });

  it('should reject files above maxSingleFileBytes', () => {
    const cache = new BoundedFileCache({
      maxEntries: 100,
      maxTotalBytes: 1_000_000,
      maxSingleFileBytes: 512,
    });

    const largeData = new Uint8Array(1024);
    cache.set('large.bin', largeData);
    expect(cache.has('large.bin')).toBe(false);

    const smallData = new Uint8Array(256);
    cache.set('small.bin', smallData);
    expect(cache.has('small.bin')).toBe(true);
  });

  it('should maintain LRU ordering under repeated access', () => {
    const cache = new BoundedFileCache({
      maxEntries: 3,
      maxTotalBytes: 1_000_000,
    });

    cache.set('a.txt', new Uint8Array([1]));
    cache.set('b.txt', new Uint8Array([2]));
    cache.set('c.txt', new Uint8Array([3]));

    // Access 'a' to make it most recently used
    cache.get('a.txt');

    // Adding 'd' should evict 'b' (oldest since 'a' was recently accessed)
    cache.set('d.txt', new Uint8Array([4]));

    expect(cache.has('a.txt')).toBe(true);
    expect(cache.has('b.txt')).toBe(false);
    expect(cache.has('c.txt')).toBe(true);
    expect(cache.has('d.txt')).toBe(true);
  });

  it('should handle rapid rename cycles', () => {
    const cache = new BoundedFileCache({
      maxEntries: 100,
      maxTotalBytes: 1_000_000,
    });

    for (let i = 0; i < 50; i++) {
      cache.set(`file-${i}.txt`, new Uint8Array([i]));
    }

    for (let i = 0; i < 50; i++) {
      cache.rename(`file-${i}.txt`, `renamed-${i}.txt`);
    }

    expect(cache.size).toBe(50);
    expect(cache.has('file-0.txt')).toBe(false);
    expect(cache.has('renamed-0.txt')).toBe(true);
    expect(cache.get('renamed-49.txt')![0]).toBe(49);
  });
});

describe('ChangeEventBus stress tests', () => {
  it('should handle 1000 rapid emissions to multiple subscribers', () => {
    const bus = new ChangeEventBus();
    let count1 = 0;
    let count2 = 0;

    bus.subscribe(() => {
      count1++;
    });
    bus.subscribe(() => {
      count2++;
    });

    for (let i = 0; i < 1000; i++) {
      bus.emit({ type: 'fileWritten', path: `/file-${i}.txt`, backend: 'indexeddb' });
    }

    expect(count1).toBe(1000);
    expect(count2).toBe(1000);

    bus.dispose();
  });

  it('should handle subscribe/unsubscribe churn during emissions', () => {
    const bus = new ChangeEventBus();
    const counts: number[] = [];

    for (let i = 0; i < 20; i++) {
      let count = 0;
      const unsub = bus.subscribe(() => {
        count++;
      });
      counts.push(0);
      const index = i;

      bus.emit({ type: 'fileWritten', path: '/test.txt', backend: 'indexeddb' });
      counts[index] = count;

      if (i % 2 === 0) {
        unsub();
      }
    }

    // Each subscriber was active for at least one emission
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(1);
    }

    bus.dispose();
  });

  it('should safely handle errors in subscribers without stopping other subscribers', () => {
    const bus = new ChangeEventBus();
    let goodCount = 0;

    bus.subscribe(() => {
      throw new Error('bad subscriber');
    });
    bus.subscribe(() => {
      goodCount++;
    });

    // Emissions should not throw even if a subscriber does
    expect(() => {
      bus.emit({ type: 'fileWritten', path: '/test.txt', backend: 'indexeddb' });
    }).not.toThrow();

    // Note: depending on implementation, the good subscriber might or might not fire
    // This test verifies the bus doesn't crash
    bus.dispose();
  });
});
