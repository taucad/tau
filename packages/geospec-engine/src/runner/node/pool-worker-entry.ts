/**
 * The Node pool worker's entry module.
 *
 * A worker thread loads this URL directly, so it must be a leaf: it wires the
 * thread's message port to {@link startGeoSpecPoolWorkerHost} and nothing else.
 * Everything it constructs — the filesystem, the model loader, the engine
 * registration — is exactly what the serial Node host constructs, because a
 * shard must execute identically to the same file run serially (R3).
 *
 * The wiring is a named export rather than top-level statements so it can be
 * exercised against a fake port: vitest cannot host a TypeScript worker thread
 * (D-8), and an untested worker entry is where a pool silently stops working.
 *
 * @module
 */

import { memoryUsage } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
// oxlint-disable-next-line import/no-unassigned-import -- Every worker installs the engine for its own isolate; the import is the installation.
import '#register-node.js';
import { flushEvidenceStore } from '#cache/evidence-cache.js';
import { installNodeEvidenceStore } from '#cache/node-evidence-store.js';
import { createModelLoader } from '#model/load-model.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';

/** The slice of a worker's `MessagePort` the host needs. */
export type PoolWorkerPort = {
  postMessage(message: GeoSpecPoolWorkerMessage): void;
  on(event: 'message', listener: (message: GeoSpecPoolHostMessage) => void): void;
};

/**
 * Serve pool shards over one worker port.
 *
 * @param port - The thread's parent port.
 * @param projectPath - Absolute project root passed as worker data.
 * @public
 */
export const startNodePoolWorker = (
  port: PoolWorkerPort,
  options: { projectPath: string; cache?: boolean; cacheDirectory?: string },
): void => {
  const { projectPath } = options;
  installNodeEvidenceStore(options);
  startGeoSpecPoolWorkerHost({
    // The VM world is rooted at `/` over a filesystem confined to the real
    // project directory; the model loader keeps the host path because it drives
    // the Tau runtime on disk. Handing the VM the host path too resolves it
    // twice under the root.
    filesystem: createNodeVmFileSystem(projectPath),
    projectPath: '/',
    modelLoader: createModelLoader({ projectPath }),
    postMessage: (message) => {
      port.postMessage(message);
    },
    onHostMessage: (listener) => {
      port.on('message', listener);
    },
    // Heap plus external is the isolate's real footprint: an OCCT module's
    // 13 MB of wasm memory is external, not heap.
    measureMemoryBytes: () => {
      const usage = memoryUsage();
      return usage.heapUsed + usage.external;
    },
    onShutdown: async () => {
      // The write-behind overlay must drain before the thread dies, or the
      // evidence this shard computed is lost and the next run recomputes it.
      await flushEvidenceStore();
    },
  });
};

/* v8 ignore start -- The thread binding. `parentPort` is null outside a worker, which is what makes importing this module in a test a no-op; `startNodePoolWorker` above is what the tests drive. */
if (parentPort !== null) {
  startNodePoolWorker(parentPort, workerData as { projectPath: string; cache?: boolean; cacheDirectory?: string });
}
/* v8 ignore stop */
