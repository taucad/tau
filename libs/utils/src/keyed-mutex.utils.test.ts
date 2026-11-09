import { describe, it, expect } from 'vitest';
import { KeyedMutex } from '#keyed-mutex.utils.js';

// ===========================================================================
// Helpers
// ===========================================================================

const deferred = <T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} => {
  let outerResolve!: (value: T) => void;
  let outerReject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    outerResolve = resolve;
    outerReject = reject;
  });
  return { promise, resolve: outerResolve, reject: outerReject };
};

describe('KeyedMutex', () => {
  // =========================================================================
  // Strict per-key serialisation
  // =========================================================================
  describe('serialisation per key', () => {
    it('should run two tasks for the same key in submission order', async () => {
      const mutex = new KeyedMutex<string>();
      const order: string[] = [];
      const taskA = deferred();
      const taskB = deferred();

      const aPromise = mutex.run('chat-1', async () => {
        order.push('a:start');
        await taskA.promise;
        order.push('a:end');
      });

      const bPromise = mutex.run('chat-1', async () => {
        order.push('b:start');
        await taskB.promise;
        order.push('b:end');
      });

      // Yield so 'a:start' definitely runs before we resolve B
      await Promise.resolve();
      // Try to release B first; should be queued behind A.
      taskB.resolve();
      await Promise.resolve();
      expect(order).toEqual(['a:start']);

      // Release A; B should now run.
      taskA.resolve();
      await Promise.all([aPromise, bPromise]);

      expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
    });
  });

  // =========================================================================
  // Independence across keys
  // =========================================================================
  describe('parallelism across distinct keys', () => {
    it('should overlap tasks scheduled for different keys', async () => {
      const mutex = new KeyedMutex<string>();
      const order: string[] = [];
      const taskA = deferred();
      const taskB = deferred();

      const aPromise = mutex.run('chat-1', async () => {
        order.push('a:start');
        await taskA.promise;
        order.push('a:end');
      });

      const bPromise = mutex.run('chat-2', async () => {
        order.push('b:start');
        await taskB.promise;
        order.push('b:end');
      });

      await Promise.resolve();
      // Both tasks should be running concurrently; resolve B first.
      taskB.resolve();
      await bPromise;
      expect(order).toEqual(['a:start', 'b:start', 'b:end']);

      taskA.resolve();
      await aPromise;
      expect(order).toEqual(['a:start', 'b:start', 'b:end', 'a:end']);
    });
  });

  // =========================================================================
  // Error isolation
  // =========================================================================
  describe('error isolation', () => {
    it('should run a queued task even if the previous task for the same key rejects', async () => {
      const mutex = new KeyedMutex<string>();
      const ranSecond = { value: false };

      const failing = mutex.run('chat-1', async () => {
        throw new Error('boom');
      });

      const subsequent = mutex.run('chat-1', async () => {
        ranSecond.value = true;
        return 'ok';
      });

      await expect(failing).rejects.toThrow('boom');
      await expect(subsequent).resolves.toBe('ok');
      expect(ranSecond.value).toBe(true);
    });
  });

  // =========================================================================
  // No leak after queue drains
  // =========================================================================
  describe('memory hygiene', () => {
    it('should drop the key entry once its queue drains', async () => {
      const mutex = new KeyedMutex<string>();

      await mutex.run('chat-1', async () => 'first');
      expect(mutex.size).toBe(0);

      await mutex.run('chat-1', async () => 'second');
      expect(mutex.size).toBe(0);
    });

    it('should retain the key entry while a task is queued behind a running one', async () => {
      const mutex = new KeyedMutex<string>();
      const release = deferred();

      const running = mutex.run('chat-1', async () => {
        await release.promise;
      });
      const queued = mutex.run('chat-1', async () => {
        // Queued behind running.
      });

      await Promise.resolve();
      expect(mutex.size).toBe(1);

      release.resolve();
      await Promise.all([running, queued]);
      expect(mutex.size).toBe(0);
    });
  });

  // =========================================================================
  // Value propagation
  // =========================================================================
  describe('value propagation', () => {
    it('should resolve with the value returned by the task', async () => {
      const mutex = new KeyedMutex<string>();
      const result = await mutex.run('chat-1', async () => ({ ok: true, n: 42 }));
      expect(result).toEqual({ ok: true, n: 42 });
    });
  });
});
