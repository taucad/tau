/**
 * The Node runner hosts.
 *
 * `createGeoSpecNodeRunner` is the serial shell with nothing added: the CLI,
 * an embedded harness and a pool worker all execute the same way, and the only
 * thing that differs between them is who owns the isolate.
 *
 * The pool binding lives here too because spawning is the only Node-specific
 * part of it — scheduling is host-agnostic
 * ({@link import('#runner/pool/pool.js').createGeoSpecPoolRunner}).
 *
 * @module
 */

import { availableParallelism, totalmem } from 'node:os';
import { Worker } from 'node:worker_threads';
import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunner,
} from 'geospec/runner/worker';
import type { GeoSpecNodePoolRunnerOptions, GeoSpecNodeRunnerOptions } from 'geospec/runner/node';
import { openShardTimings } from '#cache/timings.js';
import { installNodeEvidenceStore } from '#cache/node-evidence-store.js';
import { autoWorkerCount } from '#runner/pool/shard-planner.js';
import { createGeoSpecPoolRunner } from '#runner/pool/pool.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';
import { compileWasmStreaming } from '@taucad/runtime/kernel';
import { openCascadeWasmUrl } from '#native/opencascade-wasm.js';

/**
 * Create a serial GeoSpec runner for Node.
 *
 * @param options - Filesystem, project root, loaders, and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecNodeRunner = (options: GeoSpecNodeRunnerOptions): GeoSpecRunner => {
  installNodeEvidenceStore(options);
  return createSerialGeoSpecRunner(options);
};

/**
 * The slice of `node:worker_threads`' `Worker` the pool drives.
 *
 * Declared structurally so the adapter can be exercised against a stub as well
 * as against a real thread (D-8: vitest cannot host a TypeScript worker).
 *
 * @public
 */
export type NodeWorkerLike = {
  postMessage(value: unknown): void;
  on(event: 'message', listener: (value: GeoSpecPoolWorkerMessage) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  terminate(): Promise<number> | number;
};

/**
 * Adapt a Node worker thread to the pool's host-agnostic handle.
 *
 * @param worker - The spawned worker.
 * @returns The pool handle.
 * @public
 */
export const createNodeWorkerHandle = (worker: NodeWorkerLike): GeoSpecPoolWorkerHandle => {
  let shuttingDown = false;
  let lastError: string | undefined;
  return {
    postMessage(message: GeoSpecPoolHostMessage) {
      if (message.type === 'shutdown') {
        shuttingDown = true;
      }
      worker.postMessage(message);
    },
    onMessage(listener) {
      worker.on('message', listener);
    },
    onExit(listener) {
      worker.on('error', (error: Error) => {
        lastError = error.message;
      });
      worker.on('exit', (code: number) => {
        // An exit during shutdown is the expected end of a worker's life; an
        // exit at any other time killed a shard, and the pool must hear about
        // it rather than wait forever for a reply that will not come.
        listener({
          unexpected: !shuttingDown && code !== 0,
          ...(lastError === undefined ? {} : { message: lastError }),
        });
      });
    },
    async terminate() {
      shuttingDown = true;
      await worker.terminate();
    },
  };
};

/**
 * Where the pool worker's entry module lives.
 *
 * A worker thread loads a URL, not a module graph, so the entry must be a real
 * sibling file. In the published package that is `pool-worker-entry.mjs`; in
 * the source tree it is the `.ts` beside this module, which only a host with a
 * TypeScript loader can run.
 *
 * @returns The worker entry URL.
 * @public
 */
export const poolWorkerEntryUrl = (): URL => new URL(poolWorkerEntryName(import.meta.url), import.meta.url);

/**
 * The entry's filename beside a given module.
 *
 * Pure, and separate from {@link poolWorkerEntryUrl}, because the two cases it
 * distinguishes — running from source and running from the published package —
 * cannot both exist in one process.
 *
 * @param moduleUrl - The importing module's own URL.
 * @returns The sibling filename to load.
 * @public
 */
export const poolWorkerEntryName = (moduleUrl: string): string =>
  moduleUrl.endsWith('.ts') ? './pool-worker-entry.ts' : './pool-worker-entry.mjs';

/**
 * Create a worker-pool GeoSpec runner for Node.
 *
 * @param options - Project root, worker count, watchdog and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecNodePoolRunner = (options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner => {
  const cacheRoot = installNodeEvidenceStore(options);
  const timings = openShardTimings(cacheRoot);
  const workers =
    options.workers ??
    autoWorkerCount({ shards: availableParallelism(), cpus: availableParallelism(), totalMemoryBytes: totalmem() });
  let compiledModule: Promise<WebAssembly.Module> | undefined;
  const prepareModule = async (): Promise<WebAssembly.Module> => {
    compiledModule ??= compileWasmStreaming(openCascadeWasmUrl);
    return compiledModule;
  };
  return createGeoSpecPoolRunner({
    createWorker: async () =>
      createNodeWorkerHandle(
        new Worker(poolWorkerEntryUrl(), {
          workerData: {
            projectPath: options.projectPath,
            cache: options.cache ?? true,
            ...(options.cacheDirectory === undefined ? {} : { cacheDirectory: options.cacheDirectory }),
            compiledWasmModule: await prepareModule(),
          },
        }) as NodeWorkerLike,
      ),
    workers,
    timings,
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
};
