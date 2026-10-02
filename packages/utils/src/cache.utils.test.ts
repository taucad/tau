import { describe, it, expect, vi } from 'vitest';
import { LruMap, lazyAsync } from '#cache.utils.js';

describe('LruMap', () => {
  it('should store and retrieve values', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('should return undefined for missing keys', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should evict the least-recently-used entry when full', () => {
    const cache = new LruMap<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.set('d', 4);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('should promote accessed entries to MRU on get', () => {
    const cache = new LruMap<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a');

    cache.set('d', 4);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should not promote on peek', () => {
    const cache = new LruMap<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.peek('a');

    cache.set('d', 4);

    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBe(2);
  });

  it('should return undefined from peek on miss', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    expect(cache.peek('missing')).toBeUndefined();
  });

  it('should overwrite existing keys and promote to MRU', () => {
    const cache = new LruMap<number>({ maxEntries: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.set('a', 10);

    cache.set('d', 4);

    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(3);
  });

  it('should delete entries', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('should return false when deleting non-existent entry', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    expect(cache.delete('missing')).toBe(false);
  });

  it('should report has correctly', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('should clear all entries', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('should track size correctly', () => {
    const cache = new LruMap<number>({ maxEntries: 10 });
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    expect(cache.size).toBe(1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
    cache.delete('a');
    expect(cache.size).toBe(1);
  });

  it('should handle maxEntries of 1', () => {
    const cache = new LruMap<string>({ maxEntries: 1 });
    cache.set('a', 'first');
    cache.set('b', 'second');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('second');
    expect(cache.size).toBe(1);
  });
});

describe('lazyAsync', () => {
  it('should call factory on first invocation', async () => {
    const factory = vi.fn().mockResolvedValue('result');
    const getter = lazyAsync(factory);

    const result = await getter();

    expect(factory).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('should call factory once for concurrent calls and resolve both', async () => {
    const factory = vi.fn().mockResolvedValue('result');
    const getter = lazyAsync(factory);

    const promise1 = getter();
    const promise2 = getter();

    expect(factory).toHaveBeenCalledOnce();

    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
  });

  it('should not re-call factory after success', async () => {
    const factory = vi.fn().mockResolvedValue('result');
    const getter = lazyAsync(factory);

    await getter();
    await getter();
    await getter();

    expect(factory).toHaveBeenCalledOnce();
  });

  it('should retry after rejection', async () => {
    const factory = vi.fn().mockRejectedValueOnce(new Error('network failure')).mockResolvedValue('recovered');
    const getter = lazyAsync(factory);

    await expect(getter()).rejects.toThrow('network failure');

    const result = await getter();
    expect(result).toBe('recovered');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('should resolve on success after multiple prior failures', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    const getter = lazyAsync(factory);

    await expect(getter()).rejects.toThrow('fail 1');
    await expect(getter()).rejects.toThrow('fail 2');

    const result = await getter();
    expect(result).toBe('success');
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('should share the same rejection across concurrent callers', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('shared failure'));
    const getter = lazyAsync(factory);

    const p1 = getter();
    const p2 = getter();

    await expect(p1).rejects.toThrow('shared failure');
    await expect(p2).rejects.toThrow('shared failure');
    expect(factory).toHaveBeenCalledOnce();
  });
});
