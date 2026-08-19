/* oxlint-disable no-barrel-files/no-barrel-files -- composition file: re-exports topology types from sibling files */

/**
 * Bundled node-worker transport — composition file.
 *
 * Hosts the kernel inside a `node:worker_threads.Worker`. Mirrors
 * {@link webWorkerTransport} for the Node topology — the same client
 * contract, SAB pools, abort semantics, and FS bridging.
 *
 * The client factory lives in `node-worker-client.ts`, while the host factory
 * lives in `node-worker-host.ts`. This file imports only the client; an
 * application-owned worker entry imports `nodeWorkerHost` directly.
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
 *     url: new URL('./runtime.worker.ts', import.meta.url),
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
 *
 * @example <caption>Bundled full-preset entry — no app-owned worker file</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
 *
 * // `node:worker_threads.Worker` rejects a bare `file://` string, so the
 * // resolved specifier is handed over as a URL.
 * const client = createRuntimeClient({
 *   transport: nodeWorkerTransport({
 *     url: new URL(import.meta.resolve('@taucad/runtime/worker/node')),
 *   }),
 * });
 * ```
 */

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import { nodeWorkerClientOptionsSchema } from '#transport/node-worker-transport.schemas.js';
import { nodeWorkerId } from '#transport/_internal/node-worker-id.js';
import { nodeWorkerClient } from '#transport/node-worker-client.js';

export type { NodeWorkerLike, NodeWorkerClientOptions } from '#transport/node-worker-client.js';
export type { NodeWorkerHostOptions } from '#transport/node-worker-host.js';

/**
 * Bundled node-worker client transport plugin (`nodeWorkerTransport`).
 *
 * ponytail: `import.meta.resolve` is the platform's answer to naming the bundled
 * entry; a `nodeWorkerEntryUrl` export is a one-liner the day a bundler-hosted
 * consumer proves resolve insufficient.
 *
 * @public
 */
export const nodeWorkerTransport = defineRuntimeTransport({
  id: nodeWorkerId,
  clientOptionsSchema: nodeWorkerClientOptionsSchema,
  client: nodeWorkerClient,
});
