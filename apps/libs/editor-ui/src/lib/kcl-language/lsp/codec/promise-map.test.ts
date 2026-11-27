import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromiseMap, PromiseMapDeletedError, PromiseMapTimeoutError } from '#lib/kcl-language/lsp/codec/promise-map.js';

describe('PromiseMap', () => {
  it('rejects all pending responses when their transport fails', async () => {
    const map = new PromiseMap<number, string>();
    const first = map.get(1);
    const second = map.get(2);
    map.clear(new Error('worker failed'));
    await expect(first).rejects.toThrow('worker failed');
    await expect(second).rejects.toThrow('worker failed');
    expect(map.size).toBe(0);
  });
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve when set is called after get', async () => {
    const map = new PromiseMap<number, string>();
    const promise = map.get(1);
    map.set(1, 'hello');
    await expect(promise).resolves.toBe('hello');
  });

  it('should resolve when set is called before get awaits', async () => {
    const map = new PromiseMap<number, string>();
    const promise = map.get(1);
    map.set(1, 'value');
    expect(await promise).toBe('value');
  });

  it('should handle multiple independent keys', async () => {
    const map = new PromiseMap<number, string>();
    const p1 = map.get(1);
    const p2 = map.get(2);
    map.set(2, 'second');
    map.set(1, 'first');
    expect(await p1).toBe('first');
    expect(await p2).toBe('second');
  });

  it('should resolve both callers when get is called twice for the same key', async () => {
    const map = new PromiseMap<number, string>();
    const p1 = map.get(1);
    const p2 = map.get(1);
    map.set(1, 'value');
    expect(await p1).toBe('value');
    expect(await p2).toBe('value');
  });

  it('should discard set with no pending get', () => {
    const map = new PromiseMap<number, string>();
    // Should not throw
    map.set(999, 'orphan');
    expect(map.size).toBe(0);
  });

  it('should remove entry after resolution', async () => {
    const map = new PromiseMap<number, string>();
    const promise = map.get(1);
    expect(map.size).toBe(1);
    map.set(1, 'value');
    await promise;
    expect(map.size).toBe(0);
  });

  describe('delete', () => {
    it('should reject the pending promise with PromiseMapDeletedError', async () => {
      const map = new PromiseMap<number, string>();
      const promise = map.get(1);
      let caught: unknown;
      try {
        map.delete(1);
        await promise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PromiseMapDeletedError);
    });

    it('should reject with custom error when provided', async () => {
      const map = new PromiseMap<number, string>();
      const promise = map.get(1);
      let caught: unknown;
      try {
        map.delete(1, new Error('custom'));
        await promise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('custom');
    });

    it('should return false when key does not exist', () => {
      const map = new PromiseMap<number, string>();
      expect(map.delete(999)).toBe(false);
    });

    it('should return true when key exists', async () => {
      const map = new PromiseMap<number, string>();
      const promise = map.get(1);
      expect(map.delete(1)).toBe(true);
      try {
        await promise;
      } catch {
        // Expected rejection
      }
    });
  });

  describe('timeout (defaultTtl)', () => {
    it('should reject after default TTL expires', async () => {
      const map = new PromiseMap<number, string>({ defaultTtl: 5000 });
      const promise = map.get(1);
      let caught: unknown;

      vi.advanceTimersByTime(5000);

      try {
        await promise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PromiseMapTimeoutError);
      expect(map.size).toBe(0);
    });

    it('should not reject before TTL expires', async () => {
      const map = new PromiseMap<number, string>({ defaultTtl: 5000 });
      const promise = map.get(1);

      vi.advanceTimersByTime(4999);
      // Still pending — resolve it before it times out
      map.set(1, 'in time');
      await expect(promise).resolves.toBe('in time');
    });
  });

  describe('timeout (per-entry ttl)', () => {
    it('should use per-entry TTL over default', async () => {
      const map = new PromiseMap<number, string>({ defaultTtl: 10_000 });
      const promise = map.get(1, 2000);
      let caught: unknown;

      vi.advanceTimersByTime(2000);

      try {
        await promise;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PromiseMapTimeoutError);
    });

    it('should clear timeout on successful set', async () => {
      const map = new PromiseMap<number, string>({ defaultTtl: 5000 });
      const promise = map.get(1);
      map.set(1, 'value');

      // Advance past the TTL — should not throw because timer was cleared
      vi.advanceTimersByTime(10_000);
      await expect(promise).resolves.toBe('value');
    });

    it('should clear timeout on delete', async () => {
      const map = new PromiseMap<number, string>({ defaultTtl: 5000 });
      const promise = map.get(1);
      let caught: unknown;
      try {
        map.delete(1);
        await promise;
      } catch (error) {
        caught = error;
      }

      // Advance past the TTL — should not double-reject
      vi.advanceTimersByTime(10_000);
      expect(caught).toBeInstanceOf(PromiseMapDeletedError);
    });
  });
});
