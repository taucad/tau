/**
 * The service worker kill switch as the build writes it (progressive loading PL7, `TAU_SERVICE_WORKER_KILL_SWITCH`):
 * the built `/service-worker.js` is the retiring worker, run here in a recorded worker global.
 */
// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServiceWorker, retiredServiceWorkerFile, serviceWorkerFile } from '#scripts/build-service-worker.js';
import { precacheListFile } from '#scripts/precache-list.js';

type Listener = (event: { waitUntil(promise: Promise<unknown>): void }) => void;

describe('the kill switch build (PL7)', () => {
  let buildDirectory = '';
  let result: Awaited<ReturnType<typeof buildServiceWorker>> | undefined;

  beforeAll(async () => {
    buildDirectory = mkdtempSync(join(tmpdir(), 'tau-kill-switch-'));
    mkdirSync(join(buildDirectory, 'client'));
    result = await buildServiceWorker({
      buildDirectory,
      workerSourcePath: resolve(import.meta.dirname, '../app/offline/service-worker-kill-switch.ts'),
      retiringWorkerSourcePath: resolve(import.meta.dirname, '../app/offline/service-worker-kill-switch.ts'),
      classes: [],
      killSwitch: true,
    });
  }, 60_000);

  afterAll(() => {
    rmSync(buildDirectory, { recursive: true, force: true });
  });

  it('should write the retiring worker and an empty precache list, needing no build manifest', () => {
    expect(result).toStrictEqual({ entries: [], bytes: 0 });
    expect(existsSync(join(buildDirectory, 'client', serviceWorkerFile))).toBe(true);
    // The retired /usage worker's URL carries the same retiring worker.
    expect(readFileSync(join(buildDirectory, 'client', retiredServiceWorkerFile), 'utf8')).toBe(
      readFileSync(join(buildDirectory, 'client', serviceWorkerFile), 'utf8'),
    );
    expect(JSON.parse(readFileSync(join(buildDirectory, precacheListFile), 'utf8'))).toStrictEqual([]);
  });

  it('should activate at once, take every page, delete the worker’s caches and unregister, answering no fetch', async () => {
    const listeners = new Map<string, Listener>();
    const calls: string[] = [];
    const record =
      (name: string) =>
      async (...args: readonly unknown[]): Promise<boolean> => {
        calls.push([name, ...args.map(String)].join(' '));
        return true;
      };
    const worker = {
      addEventListener: (type: string, listener: Listener) => {
        listeners.set(type, listener);
      },
      skipWaiting: record('skipWaiting'),
      clients: { claim: record('claim') },
      caches: {
        keys: async () => ['tau-precache-v2-http://localhost/', 'tau-assets', 'tau-offline-shell-3f9a2c1d', 'other'],
        delete: record('delete'),
      },
      registration: { unregister: record('unregister') },
    };
    // The script's `globalThis` is this context, so the recorded worker global is all it can reach.
    runInNewContext(readFileSync(join(buildDirectory, 'client', serviceWorkerFile), 'utf8'), { ...worker });

    expect([...listeners.keys()].toSorted()).toStrictEqual(['activate', 'install']);
    const run = async (type: string): Promise<void> => {
      const pending: Array<Promise<unknown>> = [];
      listeners.get(type)?.({ waitUntil: (promise) => pending.push(promise) });
      await Promise.all(pending);
    };
    await run('install');
    expect(calls).toStrictEqual(['skipWaiting']);
    await run('activate');
    expect(calls).toStrictEqual([
      'skipWaiting',
      'claim',
      'delete tau-precache-v2-http://localhost/',
      'delete tau-assets',
      'delete tau-offline-shell-3f9a2c1d',
      'unregister',
    ]);
  });
});
