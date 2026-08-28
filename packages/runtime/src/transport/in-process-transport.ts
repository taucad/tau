/**
 * Bundled in-process transport.
 *
 * Same V8 isolate; no wire crossing — a *passthrough* transport in the
 * `definePassthroughTransport` sense. The live client logic lives in
 * {@link inProcessClient}.
 *
 * @public
 */

import { definePassthroughTransport } from '#transport/define-runtime-transport.js';
import { inProcessClient } from '#transport/in-process-client.js';
import type { InProcessClientOptions, inProcessId } from '#transport/in-process-client.js';
import { inProcessClientOptionsSchema } from '#transport/in-process-transport.schemas.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { TransportPlugin } from '#transport/runtime-transport.types.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

/**
 * Bundled in-process transport.
 *
 * Importable from the cross-environment subpath
 * `@taucad/runtime/transport/in-process` — the package root and
 * `@taucad/runtime/transport` barrel intentionally exclude this
 * symbol so every concrete transport ships behind its own
 * topology-tagged import path.
 *
 * @public
 *
 * @example <caption>Spin up an in-process kernel for tests</caption>
 * ```typescript
 * import { createRuntimeClient } from '@taucad/runtime';
 * import { defineRuntime } from '@taucad/runtime/worker';
 * import type { AnyPluginInstance } from '@taucad/runtime/plugin';
 * import { inProcessTransport } from '@taucad/runtime/transport/in-process';
 * import { fromMemoryFs } from '@taucad/runtime/filesystem';
 *
 * declare const kernelPlugin: AnyPluginInstance;
 * declare const bundlerPlugin: AnyPluginInstance;
 * const runtime = defineRuntime({ plugins: [kernelPlugin, bundlerPlugin] });
 * const client = createRuntimeClient({
 *   transport: inProcessTransport({
 *     runtime,
 *     fileSystem: fromMemoryFs({ 'main.ts': 'export default () => "hi";' }),
 *   }),
 * });
 * ```
 */
const makeInProcessTransport = definePassthroughTransport({
  id: 'in-process',
  clientOptionsSchema: inProcessClientOptionsSchema,
  client: inProcessClient,
});

/**
 * Create a same-isolate transport whose host owns the supplied runtime.
 *
 * @public
 */
export const inProcessTransport = <const Runtime extends AnyRuntimeDefinition>(
  options: InProcessClientOptions<Runtime>,
): TransportPlugin<RuntimeProtocol, Readonly<Record<never, never>>, typeof inProcessId, Runtime> =>
  makeInProcessTransport(options) as unknown as TransportPlugin<
    RuntimeProtocol,
    Readonly<Record<never, never>>,
    typeof inProcessId,
    Runtime
  >;

export type { InProcessClientOptions } from '#transport/in-process-client.js';

export { inProcessClient, inProcessClientDescribe } from '#transport/in-process-client.js';
