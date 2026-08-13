import { createRuntimeClient } from '#client/runtime-client.js';
import type { RuntimeClientOptions, RuntimeClient } from '#client/runtime-client.js';
import { presets } from '#plugins/presets.js';
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

type PresetRuntime = ReturnType<typeof presets.all>;
type InProcessTransportFor<Runtime extends AnyRuntimeDefinition> = ReturnType<typeof inProcessTransport<Runtime>>;
type PresetRuntimeClient = RuntimeClient<
  RuntimeKernels<PresetRuntime>,
  RuntimeMiddleware<PresetRuntime>,
  RuntimeTranscoders<PresetRuntime>,
  InProcessTransportFor<PresetRuntime>
>;

export type NodeRuntimeClientOptions<Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition> = Omit<
  RuntimeClientOptions<Runtime, InProcessTransportFor<Runtime>>,
  'transport'
> & {
  readonly runtime: Runtime;
};

export type DefaultNodeRuntimeClientOptions = Omit<
  RuntimeClientOptions<PresetRuntime, InProcessTransportFor<PresetRuntime>>,
  'transport'
> & {
  readonly runtime?: never;
};

/**
 * Create a `RuntimeClient` pre-configured for headless Node.js usage.
 *
 * Composes `presets.all()` with the bundled `inProcessTransport` (FS-backed
 * by `fromNodeFs(projectPath)` when supplied, `fromMemoryFs()`
 * otherwise) into a single factory call. The returned client connects
 * on first command.
 *
 * @param projectPath - Host filesystem directory exposed to the runtime as `/`. Omit
 *   for inline-source mode; the client provisions an in-memory filesystem
 *   on the first `render({ source })` / `export({ source })` call.
 * @param options - Override client options. Pass `runtime` to use a custom worker-owned runtime definition.
 * @returns Configured `RuntimeClient` ready for render and export operations
 *
 * @public
 *
 * @example <caption>Inline-code export (no projectPath, auto-connect)</caption>
 * ```typescript
 * import { createNodeClient } from '@taucad/runtime/node';
 *
 * const client = await createNodeClient();
 * const result = await client.export('glb', {
 *   source: { files: { 'main.ts': 'import { makeBaseBox } from "replicad";\nexport default () => makeBaseBox(10, 20, 30);' } },
 * });
 * client.terminate();
 * ```
 *
 * @example <caption>Export a file from disk (filesystem-backed)</caption>
 * ```typescript
 * import { createNodeClient } from '@taucad/runtime/node';
 *
 * const client = await createNodeClient('/path/to/project');
 * const result = await client.export('glb', { source: { path: 'main.ts' } });
 * client.terminate();
 * ```
 */
export async function createNodeClient(
  projectPath?: string,
  options?: DefaultNodeRuntimeClientOptions,
): Promise<PresetRuntimeClient>;
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
>;
export async function createNodeClient(
  projectPath?: string,
  options?: DefaultNodeRuntimeClientOptions | NodeRuntimeClientOptions,
): Promise<unknown> {
  const fileSystem: RuntimeFileSystem = projectPath ? fromNodeFs(projectPath) : fromMemoryFs();
  const runtime = options?.runtime ?? presets.all();
  const { runtime: _runtime, ...clientOptions } = options ?? {};
  const transport = inProcessTransport({ runtime, fileSystem });

  return createRuntimeClient({
    ...clientOptions,
    transport,
  } as RuntimeClientOptions<AnyRuntimeDefinition, typeof transport>) as RuntimeClient;
}
