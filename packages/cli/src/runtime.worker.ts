/**
 * The CLI runtime in its own thread: one realm per project
 * (kernel-realm-shared-state blueprint, invariant I8).
 *
 * Started by a `nodeWorkerTransport` client. It composes the CLI runtime from
 * `workerData` `{ projectRoot, plugin?, config?, zooProxyUrl? }`.
 */
import { workerData } from 'node:worker_threads';

import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker } from '@taucad/runtime/worker';
import { z } from 'zod';

import { loadCliRuntime } from '#runtime-options.js';

const runtimeWorkerDataSchema = z.object({
  projectRoot: z.string().min(1),
  plugin: z.array(z.string()).optional(),
  config: z.string().optional(),
  zooProxyUrl: z.string().optional(),
});

const options = runtimeWorkerDataSchema.safeParse(workerData);
if (!options.success) {
  throw new TypeError(`Tau runtime worker received invalid workerData: ${z.prettifyError(options.error)}`);
}

const runtime = await loadCliRuntime({
  projectRoot: options.data.projectRoot,
  plugin: options.data.plugin,
  ...(options.data.config === undefined ? {} : { config: options.data.config }),
  ...(options.data.zooProxyUrl === undefined ? {} : { zooProxyUrl: options.data.zooProxyUrl }),
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
