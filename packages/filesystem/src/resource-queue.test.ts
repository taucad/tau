import { describe, it, expect } from 'vitest';
import { ResourceQueue } from '#resource-queue.js';

describe('ResourceQueue', () => {
  it('should serialize writes to the same file path', async () => {
    const queue = new ResourceQueue();
    const order: number[] = [];

    const op1 = queue.queueFor('/dir/file.txt', async () => {
      order.push(1);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      order.push(2);
    });

    const op2 = queue.queueFor('/dir/file.txt', async () => {
      order.push(3);
      order.push(4);
    });

    await Promise.all([op1, op2]);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('should parallelize writes to different file paths', async () => {
    const queue = new ResourceQueue();
    const log: string[] = [];

    const op1 = queue.queueFor('/dir/fileA.txt', async () => {
      log.push('A-start');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });
      log.push('A-end');
    });

    const op2 = queue.queueFor('/dir/fileB.txt', async () => {
      log.push('B-start');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      log.push('B-end');
    });

    await Promise.all([op1, op2]);

    expect(log.indexOf('A-start')).toBeLessThan(log.indexOf('B-end'));
    expect(log.indexOf('B-start')).toBeLessThan(log.indexOf('A-end'));
  });

  it('should parallelize writes in same parent directory but different files', async () => {
    const queue = new ResourceQueue();
    const log: string[] = [];

    const op1 = queue.queueFor('/dir/file1.txt', async () => {
      log.push('1-start');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30);
      });
      log.push('1-end');
    });

    const op2 = queue.queueFor('/dir/file2.txt', async () => {
      log.push('2-start');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      log.push('2-end');
    });

    await Promise.all([op1, op2]);

    expect(log.indexOf('1-start')).toBeLessThan(log.indexOf('2-end'));
    expect(log.indexOf('2-start')).toBeLessThan(log.indexOf('1-end'));
  });

  it('serializes overlapping multi-resource operations without depending on caller order', async () => {
    const queue = new ResourceQueue();
    const releaseFirst = Promise.withResolvers<void>();
    const firstStarted = Promise.withResolvers<void>();
    const order: string[] = [];
    const first = queue.queueForMany(['/target', '/source'], async () => {
      order.push('first-start');
      firstStarted.resolve();
      await releaseFirst.promise;
      order.push('first-end');
    });
    await firstStarted.promise;
    const second = queue.queueForMany(['/source', '/other'], async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('should auto-cleanup empty queues', async () => {
    const queue = new ResourceQueue();

    // oxlint-disable-next-line no-empty-function -- intentional no-op
    await queue.queueFor('/dir/file.txt', async () => {});

    expect(queue.depth).toBe(0);
  });

  it('should resolve whenDrained when all queues empty', async () => {
    const queue = new ResourceQueue();

    const op = queue.queueFor('/dir/file.txt', async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });

    const drained = queue.whenDrained();

    await op;
    await drained;

    expect(queue.depth).toBe(0);
  });

  it('should resolve concurrent whenDrained waiters together', async () => {
    const queue = new ResourceQueue();

    const op = queue.queueFor('/dir/file.txt', async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });

    const drainedA = queue.whenDrained();
    const drainedB = queue.whenDrained();

    expect(drainedA).toBe(drainedB);

    await op;
    await Promise.all([drainedA, drainedB]);

    expect(queue.depth).toBe(0);
  });

  it('should resolve whenDrained immediately if already empty', async () => {
    const queue = new ResourceQueue();
    await queue.whenDrained();
    expect(queue.depth).toBe(0);
  });

  it('should not block other paths when one operation fails', async () => {
    const queue = new ResourceQueue();

    const failOp = queue.queueFor('/pathA/file.txt', async () => {
      throw new Error('failed');
    });

    const successOp = queue.queueFor('/pathB/file.txt', async () => {
      return 'success';
    });

    await expect(failOp).rejects.toThrow('failed');
    await expect(successOp).resolves.toBe('success');
  });

  it('should not block subsequent operations on the same path when one fails', async () => {
    const queue = new ResourceQueue();
    const results: string[] = [];

    const failOp = queue.queueFor('/file.txt', async () => {
      results.push('before-error');
      throw new Error('op failed');
    });

    const successOp = queue.queueFor('/file.txt', async () => {
      results.push('after-error');
    });

    await expect(failOp).rejects.toThrow('op failed');
    await successOp;

    expect(results).toEqual(['before-error', 'after-error']);
  });

  it('should track depth accurately', async () => {
    const queue = new ResourceQueue();

    expect(queue.depth).toBe(0);

    const op1 = queue.queueFor('/file-a.txt', async () => {
      expect(queue.depth).toBeGreaterThanOrEqual(1);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });

    expect(queue.depth).toBe(1);

    const op2 = queue.queueFor('/file-b.txt', async () => {
      expect(queue.depth).toBeGreaterThanOrEqual(1);
    });

    expect(queue.depth).toBe(2);

    await op1;
    await op2;

    expect(queue.depth).toBe(0);
  });

  it('should return operation result', async () => {
    const queue = new ResourceQueue();
    const result = await queue.queueFor('/file.txt', async () => 42);
    expect(result).toBe(42);
  });

  it('should handle many concurrent operations across different paths', async () => {
    const queue = new ResourceQueue();
    const pathCount = 20;
    const results: number[] = [];

    const operations = Array.from({ length: pathCount }, async (_, index) =>
      queue.queueFor(`/path-${String(index)}.txt`, async () => {
        results.push(index);
        return index;
      }),
    );

    const returnValues = await Promise.all(operations);
    expect(returnValues).toHaveLength(pathCount);
    expect(results).toHaveLength(pathCount);
  });
});
