/**
 * Default Node `worker_threads` entry for `@taucad/runtime`.
 *
 * Composes a {@link KernelRuntimeWorker} with {@link nodeWorkerHost}
 * to acquire `parentPort` from `node:worker_threads`, wire the
 * dispatcher, and install the crash trap. `nodeWorkerTransport({})`
 * defaults to this entry — consumers never need to construct a `URL`
 * themselves (CLI tools, server apps, Electron utility processes that
 * spawn worker threads).
 *
 * Per `library-api-policy.md` §6 (Subpath Exports) and §10 (High-Level
 * Wrappers + Low-Level Escape Hatches): each environment ships its
 * own self-contained subpath so consumers never branch on `typeof
 * Worker` and the runtime core never imports `node:worker_threads`.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R2):
 * this entry static-imports {@link nodeWorkerHost} from
 * `#transport/node-worker-host.js`. The host file is the structural
 * sibling of `node-worker-client.ts` (which owns the
 * `new URL('../worker/node.js', import.meta.url)` chunk-emit literal),
 * so the worker chunk never reaches its own chunk-emitter — Rolldown's
 * chunk planner is free to plan the bundle in a single pass.
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
