// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  deleteOrphanWorkerCaches,
  isPreFixWorkerCache,
  isRetiredWorkerCache,
  isWorkerCache,
  workerCacheNamePattern,
} from '#offline/pwa-caches.js';
import { activateRetirement, retireServiceWorker, workboxExpirationDatabase } from '#offline/service-worker-retire.js';
import type { RetiringWorkerScope } from '#offline/service-worker-retire.js';

/** A worker global whose calls are recorded in order. */
const createScope = (
  cacheNames: readonly string[],
  database: 'success' | 'blocked' | 'error' | 'throws' = 'success',
): { scope: RetiringWorkerScope; calls: string[] } => {
  const calls: string[] = [];
  const scope: RetiringWorkerScope = {
    caches: {
      keys: vi.fn(async () => [...cacheNames]),
      delete: vi.fn(async (name: string) => {
        calls.push(`delete ${name}`);
        return true;
      }),
    },
    clients: {
      claim: vi.fn(async () => {
        calls.push('claim');
      }),
    },
    registration: {
      unregister: vi.fn(async () => {
        calls.push('unregister');
        return true;
      }),
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- The worker global's own `indexedDB`.
    indexedDB: {
      deleteDatabase: vi.fn((name: string) => {
        if (database === 'throws') {
          throw new Error('blocked by policy');
        }
        calls.push(`delete database ${name}`);
        const request = new EventTarget() as IDBOpenDBRequest;
        queueMicrotask(() => request.dispatchEvent(new Event(database)));
        return request;
      }),
    },
    skipWaiting: vi.fn(async () => {
      calls.push('skip waiting');
    }),
  };
  return { scope, calls };
};

describe('the service worker kill switch (PL7)', () => {
  it('should activate at once on install, never waiting for the replaced worker’s pages to close', async () => {
    const { scope, calls } = createScope([]);

    await activateRetirement(scope);

    expect(calls).toStrictEqual(['skip waiting']);
  });

  it('should take every page, delete the web app’s worker’s caches and its expiration database, then unregister', async () => {
    const { scope, calls } = createScope([
      'tau-precache-v2-https://tau.new/',
      'tau-runtime-https://tau.new/',
      'tau-assets',
      'tau-offline-shell-v3',
      'another-app-cache',
    ]);

    const deleted = await retireServiceWorker(scope);

    expect(deleted).toStrictEqual([
      'tau-precache-v2-https://tau.new/',
      'tau-runtime-https://tau.new/',
      'tau-assets',
      'tau-offline-shell-v3',
    ]);
    expect(calls).toStrictEqual([
      'claim',
      'delete tau-precache-v2-https://tau.new/',
      'delete tau-runtime-https://tau.new/',
      'delete tau-assets',
      'delete tau-offline-shell-v3',
      `delete database ${workboxExpirationDatabase}`,
      'unregister',
    ]);
  });

  it.each(['blocked', 'error', 'throws'] as const)(
    'should still unregister when deleting the expiration database is %s',
    async (outcome) => {
      const { scope, calls } = createScope(['tau-assets'], outcome);

      await retireServiceWorker(scope);

      expect(calls.at(-1)).toBe('unregister');
    },
  );

  it('should own exactly the web app’s worker’s caches and the retired /usage worker’s', () => {
    for (const name of [
      'tau-precache-v2-https://tau.new/',
      'tau-runtime-https://tau.new/',
      'tau-assets',
      // A fixed worker's (FP3): its precache and asset cache carry the cache version.
      'tau-precache-v3-https://tau.new/',
      'tau-assets-v3',
      // The worker's state (the last build floor, FP2).
      'tau-state-v3',
      // The retired worker's cache for one shell version (`offlineShellCacheName`, shipped up to ui@0.3.0).
      'tau-offline-shell-3f9a2c1d0b7e',
    ]) {
      expect(isWorkerCache(name), name).toBe(true);
    }
    for (const name of ['taunt', 'tau-billing', 'tau-assets-old', 'workbox-precache-v2', 'tau-offline']) {
      expect(isWorkerCache(name), name).toBe(false);
    }
    expect(isRetiredWorkerCache('tau-offline-shell-3f9a2c1d0b7e')).toBe(true);
    expect(isRetiredWorkerCache('tau-precache-v2-https://tau.new/')).toBe(false);
  });

  it('should tell a pre-fix worker’s caches from a fixed worker’s (FP3)', () => {
    for (const name of ['tau-precache-v2-https://tau.new/', 'tau-runtime-https://tau.new/', 'tau-assets']) {
      expect(isPreFixWorkerCache(name), name).toBe(true);
    }
    for (const name of ['tau-precache-v3-https://tau.new/', 'tau-assets-v3', 'tau-offline-shell-3f9a', 'other']) {
      expect(isPreFixWorkerCache(name), name).toBe(false);
    }
  });

  it('should delete every worker cache and nothing else when no worker owns them', async () => {
    const { scope, calls } = createScope(['tau-assets', 'tau-precache-v3-https://tau.new/', 'another-app-cache']);

    const deleted = await deleteOrphanWorkerCaches(scope.caches);

    expect(deleted).toStrictEqual(['tau-assets', 'tau-precache-v3-https://tau.new/']);
    expect(calls).toStrictEqual(['delete tau-assets', 'delete tau-precache-v3-https://tau.new/']);
  });

  it('should give the boot watchdog a pattern that owns exactly the caches isWorkerCache owns (FP5)', () => {
    const pattern = new RegExp(workerCacheNamePattern, 'u');
    for (const name of [
      'tau-precache-v2-https://tau.new/',
      'tau-precache-v3-https://tau.new/',
      'tau-runtime-https://tau.new/',
      'tau-assets',
      'tau-assets-v3',
      'tau-state-v3',
      'tau-offline-shell-3f9a2c1d0b7e',
      'taunt',
      'tau-billing',
      'tau-assets-old',
      'workbox-precache-v2',
      'tau-offline',
      'another-app-cache',
    ]) {
      expect(pattern.test(name), name).toBe(isWorkerCache(name));
    }
  });
});
