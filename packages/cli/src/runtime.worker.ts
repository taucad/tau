/**
 * The CLI runtime in its own thread: one realm per project
 * (kernel-realm-shared-state blueprint, invariant I8).
 *
 * Started by a `nodeWorkerTransport` client. It composes the CLI runtime from
 * `workerData` `{ projectRoot, plugin?, config?, zooProxyUrl?, native? }`; `native` is the parent's composition of
 * the native kernels from the payload store, which this thread never reads (D4).
 */
import { workerData } from 'node:worker_threads';

import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker } from '@taucad/runtime/worker';
import { z } from 'zod';

import { nativeCompositionSchema } from '@taucad/native-kernels';

import { loadCliRuntime } from '#runtime-options.js';

const runtimeWorkerDataSchema = z.object({
  projectRoot: z.string().min(1),
  plugin: z.array(z.string()).optional(),
  config: z.string().optional(),
  zooProxyUrl: z.string().optional(),
  /* Composed by the parent from sealed receipts and structured-cloned; each row is checked against its adopter. */
  native: nativeCompositionSchema.optional(),
});

/**
 * What a client hands this entry as `workerData`. Senders check against it with
 * `satisfies`; the schema stays the only definition.
 */
export type RuntimeWorkerData = z.input<typeof runtimeWorkerDataSchema>;

const options = runtimeWorkerDataSchema.safeParse(workerData);
if (!options.success) {
  throw new TypeError(`Tau runtime worker received invalid workerData: ${z.prettifyError(options.error)}`);
}

const runtime = await loadCliRuntime({
  projectRoot: options.data.projectRoot,
  plugin: options.data.plugin,
  ...(options.data.config === undefined ? {} : { config: options.data.config }),
  ...(options.data.zooProxyUrl === undefined ? {} : { zooProxyUrl: options.data.zooProxyUrl }),
  ...(options.data.native === undefined ? {} : { native: options.data.native }),
});
await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
