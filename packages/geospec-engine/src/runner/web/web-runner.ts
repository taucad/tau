/**
 * The browser runner hosts.
 *
 * The browser has no `worker_threads`, no `os.totalmem()` and no shared cache
 * root, but it has the same execution model: one isolate runs files serially,
 * and a pool parallelizes across isolates. Both bindings here are thin — the
 * serial shell and the host-agnostic pool are shared with Node, which is what
 * makes "the same spec produces the same verdict in a browser" a structural
 * property rather than a promise.
 *
 * The public surface deliberately hides `Worker` and `MessagePort`: an
 * application supplies a factory and receives compact results.
 *
 * @module
 */

import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunner,
  GeoSpecRunnerOptions,
} from 'geospec/runner/worker';
import type { GeoSpecWebPoolRunnerOptions } from 'geospec/runner/web';
import { createGeoSpecPoolRunner } from '#runner/pool/pool.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';
import { compileWasmStreaming } from '@taucad/runtime/kernel';
import { openCascadeWasmUrl } from '#native/opencascade-wasm.js';

/**
 * The subset of the browser `Worker` API the pool drives.
 *
 * The substrate declares the same shape on its `web-pool-runner` module but
 * publishes it on no subpath, so it is declared here structurally — the
 * factory the caller supplies satisfies both.
 *
 * @public
 */
export type WebWorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: GeoSpecPoolWorkerMessage }) => void): void;
  terminate(): void;
};

/**
 * Create a serial GeoSpec runner for the browser.
 *
 * @param options - Filesystem, project root, loaders, and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecWebRunner = (options: GeoSpecRunnerOptions): GeoSpecRunner =>
  createSerialGeoSpecRunner(options);

/**
 * Adapt a browser `Worker` to the pool's host-agnostic handle.
 *
 * A `Worker` has no exit event, so the handle reports one only on
 * `terminate()` — a browser worker that dies takes the page's own error
 * channel with it, and the per-shard watchdog is what bounds the wait.
 *
 * @param worker - The spawned worker.
 * @returns The pool handle.
 * @public
 */
export const createWebWorkerHandle = (worker: WebWorkerLike): GeoSpecPoolWorkerHandle => {
  let notifyExit: ((details: { unexpected: boolean; message?: string }) => void) | undefined;
  return {
    postMessage(message: GeoSpecPoolHostMessage) {
      worker.postMessage(message);
    },
    onMessage(listener) {
      worker.addEventListener('message', (event: { data: GeoSpecPoolWorkerMessage }) => {
        listener(event.data);
      });
    },
    onExit(listener) {
      notifyExit = listener;
    },
    terminate() {
      worker.terminate();
      notifyExit?.({ unexpected: false });
    },
  };
};

/**
 * Auto-sized worker count for the browser: leave two cores for the UI thread
 * and the compositor, and never exceed four — a browser tab's memory ceiling,
 * not its core count, is the binding constraint on loaded assemblies.
 *
 * @param hardwareConcurrency - `navigator.hardwareConcurrency`, when known.
 * @returns At least one worker.
 * @public
 */
export const webWorkerCount = (hardwareConcurrency: number | undefined): number =>
  Math.max(1, Math.min((hardwareConcurrency ?? 4) - 2, 4));

/**
 * Create a worker-pool GeoSpec runner for the browser.
 *
 * @param options - Worker factory, worker count, watchdog and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecWebPoolRunner = (options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner => {
  let compiledModule: Promise<WebAssembly.Module> | undefined;
  const prepareModule = async (): Promise<WebAssembly.Module> => {
    compiledModule ??= compileWasmStreaming(openCascadeWasmUrl);
    return compiledModule;
  };
  return createGeoSpecPoolRunner({
    createWorker: async () => createWebWorkerHandle(await options.createWorker()),
    initializeWorker: async (worker) => {
      worker.postMessage({ type: 'initialize', compiledWasmModule: await prepareModule() });
    },
    workers:
      options.workers ??
      webWorkerCount((globalThis.navigator as { hardwareConcurrency?: number } | undefined)?.hardwareConcurrency),
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
};
