/**
 * @vitest-environment node
 *
 * Phase 3 / R3 — Node-environment integration smoke for the
 * `nodeWorkerTransport` host wiring under a real
 * `node:worker_threads.Worker`.
 *
 * Spawns a real worker thread that:
 *
 *   1. Imports the canonical worker bootstrap (`@taucad/runtime/worker/node`),
 *      which in turn calls `nodeWorkerHost(...).open()`,
 *      acquires the real `parentPort` from `node:worker_threads`,
 *      and wires the `KernelRuntimeWorker` dispatcher onto it.
 *   2. Drives a `nodeWorkerTransport({...})` handshake from the
 *      parent thread through `connect()` and `terminate()`.
 *
 * The unit-level coverage in `node-worker-transport.host.test.ts`
 * stubs `parentPort` via `acquireNodeParentPort`; this smoke covers
 * the integration with the *real* `parentPort` and the per-env
 * `worker/node` subpath bootstrap end-to-end.
 *
 * The worker source is loaded via `tsx/esm` so the TS source is
 * transformed inside the worker thread; the `#imports` package alias
 * resolves through Node's native package-imports field.
 */

import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, it, expect } from 'vitest';
import { createRuntimeClient } from '#client/runtime-client.js';
import { nodeWorkerTransport } from '#transport/node-worker-transport.js';

const workerEntryUrl = new URL('../worker/node.ts', import.meta.url);

describe('@taucad/runtime/worker/node bootstrap (Node integration)', () => {
  it.skip(
    'spawns a real worker_threads.Worker that completes the v6 hello handshake',
    { timeout: 30_000 },
    async () => {
      /*
       * SKIP REASON: tsx/esm `--import` hook does not propagate `.js` → `.ts`
       * extension substitution inside spawned `worker_threads.Worker` workers
       * with `execArgv: ['--import', 'tsx/esm']`, even though the same import
       * works at top level. Real coverage of this codepath comes from:
       *
       *   - `apps/ui-e2e` Playwright (browser worker bootstrap via
       *     `@taucad/runtime/worker/web`).
       *   - `examples/electron-tau` Playwright e2e (Electron utility process
       *     hosting `KernelRuntimeWorker` via `electronUtilityTransport`,
       *     which exercises the same `createWorkerDispatcher` +
       *     `installWorkerCrashTrap` wiring).
       *   - `node-worker-transport.host.test.ts` (host port-acquisition
       *     unit-level via `acquireNodeParentPort` mock).
       *
       * Re-enabling this test requires bundling the worker (e.g. via tsdown
       * dist/esm output) or using a pre-compiled JS fixture.
       */
      const client = createRuntimeClient({
        kernels: [],
        transport: nodeWorkerTransport({
          url: fileURLToPath(workerEntryUrl),
          workerCtor: class TsxWorker extends NodeWorker {
            public constructor(url: string | URL) {
              super(url, {
                execArgv: ['--import', 'tsx/esm'],
              });
            }
          },
        }),
      });

      try {
        await client.connect();
        const { capabilities } = client;
        expect(capabilities?.transport.descriptor.id).toBe('node-worker');
      } finally {
        client.terminate();
      }
    },
  );

  it('the worker/node bootstrap module is importable in non-worker context (smoke)', async () => {
    /*
     * Loading `worker/node.ts` from the main thread MUST throw a clear
     * `parentPort unavailable` error from `acquireNodeParentPort` — this
     * proves the bootstrap is reachable through `#imports` resolution AND
     * that the host correctly refuses to operate outside a worker context.
     */
    await expect(import(fileURLToPath(workerEntryUrl))).rejects.toThrow(/parentPort.*unavailable/);
  });
});
