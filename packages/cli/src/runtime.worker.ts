/**
 * The CLI runtime in its own thread: one realm per connection or project
 * (kernel-realm-shared-state blueprint, invariant I8).
 *
 * Started by `webSocketHost({ worker })` in the Tau Host runtime child and by a
 * `nodeWorkerTransport` client. It composes the CLI runtime from `workerData`
 * `{ projectRoot, plugin?, config? }`; `nodeWorkerHost` reads the connection's
 * own ports from the same `workerData`.
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
});

const options = runtimeWorkerDataSchema.safeParse(workerData);
if (!options.success) {
  throw new TypeError(`Tau runtime worker received invalid workerData: ${z.prettifyError(options.error)}`);
}

const runtime = await loadCliRuntime({
  projectRoot: options.data.projectRoot,
  plugin: options.data.plugin,
  ...(options.data.config === undefined ? {} : { config: options.data.config }),
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
