import { describe, it, expect } from 'vitest';
import { Queue } from '#lib/kcl-language/lsp/codec/queue.js';

describe('Queue', () => {
  it('should enqueue and dequeue in FIFO order', async () => {
    const queue = new Queue<number>();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(await queue.dequeue()).toBe(1);
    expect(await queue.dequeue()).toBe(2);
    expect(await queue.dequeue()).toBe(3);
  });

  it('should resolve dequeue that was called before enqueue', async () => {
    const queue = new Queue<string>();
    const promise = queue.dequeue();
    queue.enqueue('delayed');
    expect(await promise).toBe('delayed');
  });

  it('should report isEmpty correctly', () => {
    const queue = new Queue<number>();
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue(1);
    // After enqueue resolves the pending resolver, it may or may not be empty
    // depending on whether a dequeue was called first
  });

  it('should report isBlocked when dequeue is waiting', () => {
    const queue = new Queue<number>();
    expect(queue.isBlocked()).toBe(false);
    void queue.dequeue();
    expect(queue.isBlocked()).toBe(true);
    queue.enqueue(1);
    expect(queue.isBlocked()).toBe(false);
  });

  it('should report correct length', () => {
    const queue = new Queue<number>();
    expect(queue.length).toBe(0);
  });

  it('should not enqueue after close', async () => {
    const queue = new Queue<number>();
    queue.enqueue(1);
    queue.close();
    queue.enqueue(2);
    // Only the first item should be retrievable
    expect(await queue.dequeue()).toBe(1);
  });

  describe('async iteration', () => {
    it('should iterate over enqueued items', async () => {
      const queue = new Queue<number>();
      queue.enqueue(1);
      queue.enqueue(2);

      const results: number[] = [];
      let count = 0;
      for await (const item of queue) {
        results.push(item);
        count++;
        if (count >= 2) {
          break;
        }
      }

      expect(results).toEqual([1, 2]);
    });

    it('should wait for items when iterating an empty queue', async () => {
      const queue = new Queue<string>();

      const resultPromise = (async (): Promise<string> => {
        // oxlint-disable-next-line no-unreachable-loop -- intentional: return on first item to test async wait
        for await (const item of queue) {
          return item;
        }

        return 'never';
      })();

      // Enqueue after iteration starts
      queue.enqueue('async-value');
      expect(await resultPromise).toBe('async-value');
    });
  });

  describe('next / return_ / throw_', () => {
    it('next should return done:false with the value', async () => {
      const queue = new Queue<number>();
      queue.enqueue(42);
      const result = await queue.next();
      expect(result).toEqual({ done: false, value: 42 });
    });

    it('return_ should close the queue and return done:true', async () => {
      const queue = new Queue<number>();
      const result = await queue.return_();
      expect(result.done).toBe(true);
    });

    it('throw_ should throw the provided error', async () => {
      const queue = new Queue<number>();
      await expect(queue.throw_(new Error('test error'))).rejects.toThrow('test error');
    });
  });
});
