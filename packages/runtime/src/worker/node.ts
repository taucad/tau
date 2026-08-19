/**
 * Default Node `worker_threads` entry for `@taucad/runtime`.
 *
 * Composes a {@link KernelRuntimeWorker} with {@link nodeWorkerHost}
 * to acquire `parentPort` from `node:worker_threads`, wire the
 * dispatcher, and install the crash trap. This entry hosts the full bundled
 * preset — the same plugin set `createNodeClient` runs in-process — so a Node
 * daemon or CLI gets a crash-isolated runtime without owning a worker entry;
 * write your own entry only when a different plugin set is wanted, and pass its
 * URL to `nodeWorkerTransport`.
 *
 * Per `library-api-policy.md` §6 (Subpath Exports) and §10 (High-Level
 * Wrappers + Low-Level Escape Hatches): each environment ships its
 * own self-contained subpath so consumers never branch on `typeof
 * Worker` and the runtime core never imports `node:worker_threads`.
 *
 * This entry static-imports {@link nodeWorkerHost} and never imports the
 * client transport.
 *
 * Custom worker entries can compose the same primitives directly:
 *
 * ```typescript
 * import { defineRuntime } from '@taucad/runtime';
 * import { createRuntimeWorker } from '@taucad/runtime/worker';
 * import { nodeWorkerHost } from '@taucad/runtime/transport/node';
 *
 * const runtime = defineRuntime({});
 * const worker = createRuntimeWorker({ runtime });
 * await nodeWorkerHost({ worker }).open();
 * ```
 *
 * @public
 */

import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { presets } from '#plugins/presets.js';
import { createRuntimeWorker } from '#worker/index.js';

const worker = createRuntimeWorker({ runtime: presets.all() });
await nodeWorkerHost({ worker }).open();
