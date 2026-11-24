/**
 * The worker's stop on writing caches (FP5): kept across a restart of the same worker, cleared by a new worker's
 * install, and settled only after every write already under way.
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createCachingStop } from '#offline/service-worker-stop.js';

describe('createCachingStop (FP5)', () => {
  it('should run writes until stopped, and none after', async () => {
    const caching = createCachingStop(new IDBFactory());
    const written: string[] = [];
    await caching.write(async () => {
      written.push('before');
    });
    await caching.stop();
    await caching.write(async () => {
      written.push('after');
    });
    expect(caching.isStopped()).toBe(true);
    expect(written).toStrictEqual(['before']);
  });

  it('should settle the stop only after a write already under way has finished', async () => {
    const caching = createCachingStop(new IDBFactory());
    const { promise, resolve } = Promise.withResolvers<void>();
    const order: string[] = [];
    await caching.ready;
    const started = Promise.withResolvers<void>();
    const write = caching.write(async () => {
      started.resolve();
      await promise;
      order.push('write');
    });
    await started.promise;
    const stopped = (async () => {
      await caching.stop();
      order.push('stopped');
    })();
    resolve();
    await Promise.all([write, stopped]);
    expect(order).toStrictEqual(['write', 'stopped']);
  });

  it('should keep the stop for a restart of the worker, and forget it on a new install', async () => {
    const factory = new IDBFactory();
    await createCachingStop(factory).stop();
    const restarted = createCachingStop(factory);
    await restarted.ready;
    expect(restarted.isStopped()).toBe(true);
    const written: string[] = [];
    await restarted.write(async () => {
      written.push('restarted');
    });
    expect(written).toStrictEqual([]);

    const installed = createCachingStop(factory);
    await installed.clear();
    expect(installed.isStopped()).toBe(false);
    const next = createCachingStop(factory);
    await next.ready;
    expect(next.isStopped()).toBe(false);
  });

  it('should hold the stop for this start without IndexedDB', async () => {
    const caching = createCachingStop(undefined);
    await caching.stop();
    expect(caching.isStopped()).toBe(true);
  });
});
