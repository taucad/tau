// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  activateRetirement,
  isWorkerCache,
  retireServiceWorker,
  workboxExpirationDatabase,
} from '#offline/service-worker-retire.js';
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

  it('should own only the caches named with the worker’s prefix', () => {
    expect(isWorkerCache('tau-precache-v2-https://tau.new/')).toBe(true);
    expect(isWorkerCache('tau-offline-shell-v3')).toBe(true);
    expect(isWorkerCache('taunt')).toBe(false);
    expect(isWorkerCache('workbox-precache-v2')).toBe(false);
  });
});
