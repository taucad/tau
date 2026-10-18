/**
 * The CLI runtime in its own thread: one realm per project
 * (kernel-realm-shared-state blueprint, invariant I8).
 *
 * Started by a `nodeWorkerTransport` client. It composes the CLI runtime from
 * `workerData` `{ projectRoot, plugin?, config?, zooProxyUrl? }`. Native kernels in the runtime bind to their sealed
 * closures themselves, reading the payload store's launch indexes from this thread's environment; nothing here
 * downloads (D4).
 *
 * With `describe`, it builds the runtime, posts what it lists (`{ type: 'described', report, plugins }`: the native
 * deployments and every plugin's name) and serves nothing, so a parent can prepare the runtime's native kernels
 * without loading a kernel module itself.
 */
import { parentPort, workerData } from 'node:worker_threads';

import { reportNativeDeployments } from '@taucad/native-process-core/store';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import { createRuntimeWorker, defineRuntime, resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { z } from 'zod';

import { loadCliPlugins } from '#runtime-options.js';

const runtimeWorkerDataSchema = z.object({
  projectRoot: z.string().min(1),
  plugin: z.array(z.string()).optional(),
  config: z.string().optional(),
  zooProxyUrl: z.string().optional(),
  describe: z.boolean().optional(),
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

const plugins = await loadCliPlugins({
  projectRoot: options.data.projectRoot,
  plugin: options.data.plugin,
  ...(options.data.config === undefined ? {} : { config: options.data.config }),
  ...(options.data.zooProxyUrl === undefined ? {} : { zooProxyUrl: options.data.zooProxyUrl }),
});
const runtime = defineRuntime({ plugins });
if (options.data.describe === true) {
  const resolved = await resolveRuntimeDefinition(runtime, undefined);
  parentPort?.postMessage({
    type: 'described',
    report: reportNativeDeployments(resolved),
    plugins: plugins.map(({ meta }) => meta.name),
  });
} else {
  await nodeWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
}
