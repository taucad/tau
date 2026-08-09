/**
 * Node pool-worker entry (R3): a `worker_threads` script hosting the serial
 * engine for shards the pool schedules onto it. Self-provisions the same
 * capabilities the CLI builds — Node filesystem, invocation context (model
 * loader with the 300 s build budget + worker-terminate), STEP loader — from
 * `workerData.projectPath`; nothing but structured-clone-safe messages cross
 * the wire.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { flushGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { installNodeEvidenceCache } from '#cache/node-evidence-store.js';
import { createGeoSpecNodeInvocationContext } from '#runner/node/invocation-context.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { startGeoSpecPoolWorkerHost } from '#runner/worker/pool-worker-host.js';
import type { GeoSpecPoolHostMessage } from '#runner/pool/pool-messages.js';
import { loadStep } from '#step/index.js';

const port = parentPort;
if (!port) {
  throw new Error('GeoSpec pool worker entry must run inside a worker_threads Worker.');
}

const { projectPath } = workerData as { projectPath: string };
// R5: each worker consults the same authenticated out-of-tree evidence cache
// — the L5 cross-worker reuse channel (filesystem, never shared memory).
installNodeEvidenceCache(projectPath);
const invocationContext = createGeoSpecNodeInvocationContext({ projectPath });

startGeoSpecPoolWorkerHost({
  filesystem: createNodeVmFileSystem(projectPath),
  projectPath,
  modelLoader: invocationContext.modelLoader,
  stepLoader: async (input) => loadStep(input),
  postMessage: (message) => {
    port.postMessage(message);
  },
  onHostMessage: (listener) => {
    port.on('message', (message: GeoSpecPoolHostMessage) => {
      listener(message);
    });
  },
  measureMemoryBytes: () => {
    // Per-isolate signal: V8 heap plus external (typed arrays + wasm memories
    // of THIS worker). RSS is process-wide and useless per shard.
    const usage = process.memoryUsage();
    return usage.heapUsed + usage.external;
  },
  onShutdown: async () => {
    // R9: pending write-behind evidence must land before the worker exits.
    await flushGeoSpecEvidenceStore();
    await invocationContext.dispose();
    port.close();
  },
});
