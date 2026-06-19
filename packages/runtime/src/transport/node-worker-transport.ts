/* oxlint-disable no-barrel-files/no-barrel-files -- composition file: re-exports paired client/host types from sibling files */

/**
 * Bundled node-worker transport — composition file.
 *
 * Hosts the kernel inside a `node:worker_threads.Worker`. Mirrors
 * {@link webWorkerTransport} for the Node topology — same fat
 * client/host handles, SAB pools, abort semantics, and FS bridging.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R2),
 * the client factory (and its `new URL('../worker/node.js', ...)`
 * chunk-emit literal) live in `node-worker-client.ts`, and the host
 * factory lives in `node-worker-host.ts`. This file is the *only* place
 * that imports both — the worker entry chunk
 * (`@taucad/runtime/worker/node`) static-imports `nodeWorkerHost`
 * directly to keep the chunk-emitter file structurally outside its own
 * transitive graph.
 *
 * Importable only from the Node-only subpath
 * `@taucad/runtime/transport/node` — the package root and
 * `@taucad/runtime/transport` barrel intentionally exclude this symbol
 * so browser bundles don't externalize `node:worker_threads`.
 *
 * @public
 *
 * @example <caption>App-owned worker</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const client = createRuntimeClient<typeof runtime>({
 *   transport: nodeWorkerTransport({
 *     url: new URL('./runtime.worker.js', import.meta.url),
 *   }),
 * });
 * ```
 *
 * @example <caption>Custom worker module — pass an explicit URL</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const client = createRuntimeClient<typeof runtime>({
 *   transport: nodeWorkerTransport({
 *     url: new URL('./custom-worker.ts', import.meta.url),
 *   }),
 * });
 * ```
 */

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import {
  nodeWorkerClientOptionsSchema,
  nodeWorkerHostOptionsSchema,
} from '#transport/node-worker-transport.schemas.js';
import { nodeWorkerId } from '#transport/_internal/node-worker-id.js';
import { nodeWorkerClient } from '#transport/node-worker-client.js';
import { nodeWorkerHost } from '#transport/node-worker-host.js';

export type { NodeWorkerLike, NodeWorkerClientOptions } from '#transport/node-worker-client.js';
export type { NodeWorkerHostOptions } from '#transport/node-worker-host.js';

/**
 * Bundled node-worker transport plugin (`nodeWorkerTransport`). Pairs
 * {@link nodeWorkerClient} and {@link nodeWorkerHost} via
 * {@link defineRuntimeTransport} so consumers can pass the result to
 * `createRuntimeClient` / `createRuntimeHost` directly.
 *
 * @public
 */
export const nodeWorkerTransport = defineRuntimeTransport({
  id: nodeWorkerId,
  clientOptionsSchema: nodeWorkerClientOptionsSchema,
  hostOptionsSchema: nodeWorkerHostOptionsSchema,
  client: nodeWorkerClient,
  host: nodeWorkerHost,
});
