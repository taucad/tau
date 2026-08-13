/* oxlint-disable no-barrel-files/no-barrel-files -- composition file: re-exports topology types from sibling files */

/**
 * Bundled web-worker transport — composition file.
 *
 * Hosts the kernel inside a dedicated browser `Worker`. The transport
 * advertises the highest-tier wire (SAB-backed memory, signal-slot
 * abort, transferable / pooled geometry) on its descriptor and exposes
 * the client plugin consumed by `createRuntimeClient`.
 *
 * Application code owns the worker module URL through `createWorker`
 * or `url`; the runtime transport owns the client channel mechanics.
 * The standalone worker entry owns `webWorkerHost`. This keeps framework worker chunks in the app graph
 * instead of hiding a bundler-specific URL in the library import graph.
 *
 * @public
 *
 * @example <caption>App-owned worker (recommended)</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeClient } from '@taucad/runtime/client';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const client = createRuntimeClient<typeof runtime>({
 *   transport: webWorkerTransport({
 *     createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
 *     fileSystem: fromMemoryFs(),
 *   }),
 * });
 * ```
 *
 * @example <caption>Explicit worker URL</caption>
 * ```typescript
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 * import { createRuntimeClient } from '@taucad/runtime/client';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 * import { webWorkerTransport } from '@taucad/runtime/transport/web';
 *
 * declare const runtime: AnyRuntimeDefinition;
 *
 * const client = createRuntimeClient<typeof runtime>({
 *   transport: webWorkerTransport({
 *     url: new URL('./runtime.worker.ts', import.meta.url),
 *     fileSystem: fromMemoryFs(),
 *   }),
 * });
 * ```
 */

import { defineRuntimeTransport } from '#transport/define-runtime-transport.js';
import { webWorkerClientOptionsSchema } from '#transport/web-worker-transport.schemas.js';
import { webWorkerId } from '#transport/_internal/web-worker-id.js';
import { webWorkerClient } from '#transport/web-worker-client.js';

export type { WebWorkerLike, WebWorkerTransportOptions } from '#transport/web-worker-client.js';
export type { WebWorkerHostOptions } from '#transport/web-worker-host.js';

/**
 * Bundled web-worker client transport plugin (`webWorkerTransport`).
 *
 * @public
 */
export const webWorkerTransport = defineRuntimeTransport({
  id: webWorkerId,
  clientOptionsSchema: webWorkerClientOptionsSchema,
  client: webWorkerClient,
});
