/**
 * The grep matcher worker for Node hosts (charter D14, W10).
 *
 * A filesystem bridge runs a caller's `grep` pattern in a worker it can
 * terminate, so a catastrophic pattern costs one worker and an `ETIMEDOUT`
 * rather than the authority's thread. Browsers start that worker as a web
 * `Worker`; Node and Electron's utility process have none, so a Node host
 * hands the bridge this factory, which runs the same script on a
 * `worker_threads` thread. Without it, a regex `grep` on a Node host is
 * refused with `ENOTSUP`.
 *
 * Lives on the runtime's Node subpaths, never in `@taucad/fs-bridge`, whose
 * source stays free of Node built-ins.
 */
import { Worker } from 'node:worker_threads';
import type { GrepMatcherWorkerFactory } from '@taucad/fs-bridge';

/**
 * Wrap a web-worker script so it runs on a `worker_threads` thread: `self`
 * posts to the parent port, and the parent's messages reach `self.onmessage`.
 *
 * @param source - The classic web-worker script the bridge hands the factory.
 * @returns A CommonJS script for `new Worker(script, { eval: true })`.
 */
const workerThreadScript = (source: string): string => `const { parentPort } = require("node:worker_threads");
globalThis.self = { postMessage: (message) => parentPort.postMessage(message) };
parentPort.on("message", (data) => self.onmessage({ data }));
${source}`;

/**
 * Start a grep matcher worker on a `worker_threads` thread. Pass it as
 * `grepMatcherWorker` to `exposeFileSystem`, `serveFileSystemBridgePort` or
 * `createFileSystemBridgePort` on a Node host.
 *
 * @param source - The matcher script the bridge serializes.
 * @param events - Where the worker's answers and failures go.
 * @returns The channel the bridge posts to and terminates.
 * @public
 */
export const nodeGrepMatcherWorker: GrepMatcherWorkerFactory = (source, events) => {
  const worker = new Worker(workerThreadScript(source), { eval: true });
  worker.on('message', events.onMessage);
  worker.on('error', events.onError);
  return {
    post(message) {
      worker.postMessage(message);
    },
    terminate() {
      void worker.terminate();
    },
  };
};
