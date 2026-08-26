/* oxlint-disable no-barrel-files/no-barrel-files -- public topology subpath barrel */

/**
 * Browser-only transport entry — `@taucad/runtime/transport/web`.
 *
 * Hosts {@link webWorkerTransport}, which spawns a dedicated browser
 * `Worker` and acquires its worker-side wire from the worker's global
 * scope (`globalThis.addEventListener('message', …)` /
 * `globalThis.postMessage(…)`). Importing this subpath from a Node
 * bundle pulls in DOM-flavoured runtime calls that have no Node
 * counterpart — Node consumers should reach for
 * `@taucad/runtime/transport/in-process` (same-isolate) or
 * `@taucad/runtime/transport/node` (`worker_threads`) instead.
 *
 * The split mirrors `@taucad/runtime/transport/node` (Node-only) and
 * `@taucad/runtime/transport/in-process` (cross-env): every concrete
 * transport ships behind its own topology-tagged subpath so consumers
 * signal their intent at import time. The universal
 * `@taucad/runtime/transport` barrel intentionally excludes these
 * symbols — it carries only the author API
 * (`defineRuntimeTransport`), wire validators, and types.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R1),
 * the standalone {@link webWorkerHost} factory is also exported here
 * so custom worker entries can import it without pulling in the
 * client's `new URL(...)` chunk-emit literal.
 *
 * @public
 */

import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client-core.js';
import type { AnyRuntimeDefinition, RuntimeConfigInput, RuntimeConfigProvider } from '#worker/runtime-definition.js';
import { webWorkerTransport } from '#transport/web-worker-transport.js';
import type { WebWorkerTransportOptions } from '#transport/web-worker-client.js';

export { webWorkerTransport } from '#transport/web-worker-transport.js';
export type { WebWorkerLike, WebWorkerTransportOptions } from '#transport/web-worker-client.js';
export type { WebWorkerHostOptions } from '#transport/web-worker-host.js';
export { webWorkerHost } from '#transport/web-worker-host.js';
export { webWorkerClient } from '#transport/web-worker-client.js';

/**
 * Options for {@link createWebWorkerClientOptions}.
 *
 * @public
 */
export type CreateWebWorkerClientOptionsOptions<Runtime extends AnyRuntimeDefinition | undefined = undefined> = Omit<
  WebWorkerTransportOptions,
  'fileSystem'
> & {
  /**
   * Optional runtime-path-to-content map for the transport-owned in-memory
   * filesystem. Omitting this still creates an empty memory filesystem for inline source staging.
   * Pass `fileSystem` for custom FS authority.
   */
  readonly files?: Record<string, string>;
  /** Explicit transport-owned filesystem exposed to plugins as runtime `/`. Mutually exclusive with `files`. */
  readonly fileSystem?: RuntimeFileSystem;
  /**
   * Wall-clock deadline applied independently to each preview. Milliseconds.
   * Zero disables timeout enforcement.
   */
  readonly renderTimeout?: number;
} & ([RuntimeConfigInput<Runtime>] extends [never]
    ? { readonly config?: never }
    : undefined extends RuntimeConfigInput<Runtime>
      ? { readonly config?: RuntimeConfigProvider<Runtime> }
      : { readonly config: RuntimeConfigProvider<Runtime> });

/**
 * Builds the runtime-client options object for the common app-owned web worker
 * topology.
 *
 * Keep the result in module scope and pass it to `useRuntime` or
 * `createRuntimeClient`. The worker module still owns the executable runtime
 * definition; this helper assembles the browser transport and a per-session
 * in-memory filesystem for inline source staging.
 *
 * @param options - Worker factory, optional filesystem/config, and client deadline.
 * @returns Module-scope client options for {@link createRuntimeClient} or `useRuntime`.
 * @public
 *
 * @example <caption>Create a browser worker runtime client</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime/client';
 * import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
 *
 * const clientOptions = createWebWorkerClientOptions({
 *   createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
 *   renderTimeout: 60_000,
 * });
 * const client = createRuntimeClient(clientOptions);
 * ```
 */
export const createWebWorkerClientOptions = <Runtime extends AnyRuntimeDefinition | undefined = undefined>(
  options: CreateWebWorkerClientOptionsOptions<Runtime>,
): RuntimeClientOptionsWithTransport<Runtime, ReturnType<typeof webWorkerTransport>> => {
  if (options.files !== undefined && options.fileSystem !== undefined) {
    throw new TypeError('createWebWorkerClientOptions: pass either `files` or `fileSystem`, not both');
  }

  const { config, files, fileSystem, renderTimeout, ...transportOptions } = options;
  const clientOptions = {
    transport: webWorkerTransport({
      ...transportOptions,
      fileSystem: fileSystem ?? fromMemoryFs(files),
    }),
    ...(config === undefined ? {} : { config }),
    ...(renderTimeout === undefined ? {} : { renderTimeout }),
  };
  return clientOptions as RuntimeClientOptionsWithTransport<Runtime, ReturnType<typeof webWorkerTransport>>;
};
