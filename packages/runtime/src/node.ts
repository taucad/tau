import { createRuntimeClient } from '#client/runtime-client.js';
import type { RuntimeClientOptions, RuntimeClient } from '#client/runtime-client.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';
import type {
  AnyRuntimeDefinition,
  RuntimeKernels,
  RuntimeMiddleware,
  RuntimeTranscoders,
} from '#worker/runtime-definition.js';

export { isSafeRelativePath } from '@taucad/utils/path';

type InProcessTransportFor<Runtime extends AnyRuntimeDefinition> = ReturnType<typeof inProcessTransport<Runtime>>;

/** Options for a Node client backed by a custom runtime definition. @public */
export type NodeRuntimeClientOptions<Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition> = Omit<
  RuntimeClientOptions<Runtime, InProcessTransportFor<Runtime>>,
  'transport'
> & {
  readonly runtime: Runtime;
};

/**
 * Create a `RuntimeClient` pre-configured for headless Node.js usage.
 *
 * Composes a caller-owned runtime with `inProcessTransport`, backed by
 * `fromNodeFs(projectPath)` when supplied or `fromMemoryFs()` otherwise.
 *
 * @param projectPath - Host filesystem directory exposed to the runtime as `/`. Omit
 *   for inline-source mode; the client provisions an in-memory filesystem
 *   on the first `render({ source })` / `export({ source })` call.
 * @param options - Runtime definition and client options.
 * @returns Configured `RuntimeClient` ready for render and export operations
 *
 * @public
 *
 * @example <caption>Inline-code export (no projectPath, auto-connect)</caption>
 * ```typescript
 * import { createNodeClient } from '@taucad/runtime/node';
 * import { defineRuntime } from '@taucad/runtime/worker';
 * import type { AnyPluginInstance } from '@taucad/runtime/plugin';
 *
 * declare const kernelPlugin: AnyPluginInstance;
 * declare const bundlerPlugin: AnyPluginInstance;
 * const runtime = defineRuntime({ plugins: [kernelPlugin, bundlerPlugin] });
 * const client = await createNodeClient(undefined, { runtime });
 * const result = await client.export('glb', {
 *   source: { files: { 'main.ts': 'import { makeBaseBox } from "replicad";\nexport default () => makeBaseBox(10, 20, 30);' } },
 * });
 * client.terminate();
 * ```
 *
 * @example <caption>Export a file from disk (filesystem-backed)</caption>
 * ```typescript
 * import { createNodeClient } from '@taucad/runtime/node';
 * import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
 *
 * declare const runtime: AnyRuntimeDefinition;
 * const client = await createNodeClient('/path/to/project', { runtime });
 * const result = await client.export('glb', { source: { path: 'main.ts' } });
 * client.terminate();
 * ```
 */
export async function createNodeClient<const Runtime extends AnyRuntimeDefinition>(
  projectPath: string | undefined,
  options: NodeRuntimeClientOptions<Runtime>,
): Promise<
  RuntimeClient<
    RuntimeKernels<Runtime>,
    RuntimeMiddleware<Runtime>,
    RuntimeTranscoders<Runtime>,
    InProcessTransportFor<Runtime>
  >
> {
  const fileSystem: RuntimeFileSystem = projectPath ? fromNodeFs(projectPath) : fromMemoryFs();
  const { runtime, ...clientOptions } = options;
  const transport = inProcessTransport({ runtime, fileSystem });

  return createRuntimeClient({
    ...clientOptions,
    transport,
  } as RuntimeClientOptions<Runtime, typeof transport>) as RuntimeClient<
    RuntimeKernels<Runtime>,
    RuntimeMiddleware<Runtime>,
    RuntimeTranscoders<Runtime>,
    InProcessTransportFor<Runtime>
  >;
}
