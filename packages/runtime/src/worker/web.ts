/**
 * Web-worker helpers for `@taucad/runtime`.
 *
 * Composes a worker-owned runtime definition with {@link webWorkerHost}
 * so app worker entries can stay small while the app bundler still owns
 * the `new Worker(new URL(...))` expression.
 *
 * Per `library-api-policy.md` §6 (Subpath Exports) and §10 (High-Level
 * Wrappers + Low-Level Escape Hatches): each environment ships its
 * own self-contained subpath so consumers never branch on
 * `typeof Worker` and the runtime core never imports
 * `node:worker_threads`.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R1):
 * this entry static-imports {@link webWorkerHost} from
 * `#transport/web-worker-host.js`. The host file is the structural
 * sibling of `web-worker-client.ts`; the client owns only the
 * transport handle, while application code owns the `new Worker(new
 * URL(...))` expression.
 *
 * Worker entries should call the helper explicitly:
 *
 * ```typescript
 * import { defineRuntime } from '@taucad/runtime';
 * import { serveWebWorkerRuntime } from '@taucad/runtime/worker/web';
 *
 * const runtime = defineRuntime({});
 * await serveWebWorkerRuntime({ runtime });
 * ```
 *
 * @public
 */

// oxlint-disable-next-line import-x/no-unassigned-import -- side-effect: stubs `document` before any bundler modulepreload code runs
import '#framework/worker-preload-polyfill.js';

import { webWorkerHost } from '#transport/web-worker-host.js';
import { createRuntimeWorker } from '#worker/index.js';
import type { TransportHostReady } from '#transport/runtime-transport.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

/**
 * Options for serving a runtime from an app-owned browser module worker.
 *
 * @public
 */
export type ServeWebWorkerRuntimeOptions = {
  readonly runtime: AnyRuntimeDefinition;
};

/**
 * Open a web-worker runtime host from a worker-owned runtime definition.
 *
 * This helper has no import-time side effects. App worker entries call it
 * explicitly so importing `@taucad/runtime/worker/web` never boots an empty
 * runtime by accident.
 *
 * @param options - Runtime serving options.
 * @returns The opened host snapshot.
 * @public
 */
export async function serveWebWorkerRuntime(options: ServeWebWorkerRuntimeOptions): Promise<TransportHostReady> {
  const worker = createRuntimeWorker({ runtime: options.runtime });
  return webWorkerHost({ worker }).open();
}
