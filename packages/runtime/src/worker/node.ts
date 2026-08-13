/**
 * Default Node `worker_threads` entry for `@taucad/runtime`.
 *
 * Composes a {@link KernelRuntimeWorker} with {@link nodeWorkerHost}
 * to acquire `parentPort` from `node:worker_threads`, wire the
 * dispatcher, and install the crash trap. Consumers may target this explicit
 * subpath when its empty runtime definition is appropriate; configured
 * runtimes should use an application-owned worker entry and pass its URL to
 * `nodeWorkerTransport`.
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
 * import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
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
import { createRuntimeWorker, defineRuntime } from '#worker/index.js';

const runtime = defineRuntime({});
const worker = createRuntimeWorker({ runtime });
await nodeWorkerHost({ worker }).open();
