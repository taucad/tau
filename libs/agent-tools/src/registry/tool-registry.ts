/**
 * The one chat tool registry both hosts build.
 *
 * A tool is offered *iff* the dispatcher can actually serve its RPC with the
 * clients handed in. That single rule replaces what used to be two rules in two
 * places — the browser worker listed everything and relied on always supplying
 * every client, while the daemon carried a hand-maintained `geometryTools` set
 * it had to keep in sync with its own capabilities. A tool the model is told
 * about but that cannot work costs a turn and a retry, so the listing is
 * load-bearing and must be derived, not curated.
 *
 * @module
 */

import { rpcClientErrorCode } from '@taucad/chat';
import type { RpcCall, RpcName } from '@taucad/chat';
import { rpcName, toolDescriptions, toolMode, toolName } from '@taucad/chat/constants';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import type {
  RpcFileSystem,
  RpcGeoSpecClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcRuntimeClient,
  RpcSkillResolver,
} from '@taucad/chat/rpc';
import { getProviderFacingToolInputSchemas } from '@taucad/chat/schemas';
import { z } from 'zod';

import type { HostToolDefinition, JsonObject, JsonValue, ToolRegistry } from '@taucad/agent-host';

/** The optional dispatcher client one tool needs beyond the filesystem. */
type ToolClientKey = 'kernelClient' | 'graphics' | 'images' | 'geospec' | 'skillResolver';

/**
 * Every servable tool, its RPC, and the client that must be present for it.
 * Tools with no `needs` require only the filesystem, which is mandatory.
 */
const rpcForTool: Readonly<Record<string, { readonly rpc: RpcName; readonly needs?: ToolClientKey }>> = {
  [toolName.readFile]: { rpc: rpcName.readFile },
  [toolName.editFile]: { rpc: rpcName.editFile },
  [toolName.listDirectory]: { rpc: rpcName.listDirectory },
  [toolName.createFile]: { rpc: rpcName.createFile },
  [toolName.deleteFile]: { rpc: rpcName.deleteFile },
  [toolName.grep]: { rpc: rpcName.grep },
  [toolName.globSearch]: { rpc: rpcName.globSearch },
  [toolName.getKernelResult]: { rpc: rpcName.getKernelResult, needs: 'kernelClient' },
  [toolName.exportGeometry]: { rpc: rpcName.exportGeometry, needs: 'graphics' },
  [toolName.screenshot]: { rpc: rpcName.captureImages, needs: 'images' },
  [toolName.testModel]: { rpc: rpcName.runGeoSpecTests, needs: 'geospec' },
  [toolName.useSkill]: { rpc: rpcName.resolveSkill, needs: 'skillResolver' },
};

const codedErrorSchema = z.object({ code: z.string() });
const errorCode = (error: unknown): string => codedErrorSchema.safeParse(error).data?.code ?? 'AGENT_HOST_ERROR';

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError(signal);
  }
};

/**
 * `RpcDependencies.kernelClient` is not optional, but `get_kernel_result` is
 * unlisted without one and `invoke` refuses unlisted tools, so this is only
 * ever the dispatcher's placeholder.
 */
const unattachedKernelClient: RpcRuntimeClient = {
  async getKernelResult() {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'This host has no CAD runtime attached.',
    };
  },
};

/** Options for {@link createChatToolRegistry}. @public */
export type ChatToolRegistryOptions = {
  /**
   * Filesystem for one invocation, bound to that invocation's cancellation.
   * Always required: the file tools are the floor of every host.
   */
  readonly fileSystemFor: (signal: AbortSignal) => RpcFileSystem;
  /** Backs `get_kernel_result`. */
  readonly kernelClient?: RpcRuntimeClient | undefined;
  /** Backs `export_geometry`. */
  readonly graphics?: RpcGraphicsClient | undefined;
  /** Backs `screenshot`. */
  readonly images?: RpcImageClient | undefined;
  /** Backs `test_model`. */
  readonly geospec?: RpcGeoSpecClient | undefined;
  /** Backs `use_skill`. */
  readonly skillResolver?: RpcSkillResolver | undefined;
  /** `test_model`'s independent policy gate in `@taucad/chat`. */
  readonly testingEnabled: boolean;
};

/**
 * Build a tool registry over the canonical chat RPC dispatcher.
 *
 * @param options - The dispatcher clients this host can serve.
 * @returns A {@link ToolRegistry} listing exactly the servable tools.
 * @public
 *
 * @example <caption>File tools only</caption>
 * ```typescript
 * import { createChatToolRegistry } from '@taucad/agent-tools/registry';
 * import type { RpcFileSystem } from '@taucad/chat/rpc';
 *
 * declare const fileSystem: RpcFileSystem;
 *
 * const registry = createChatToolRegistry({
 *   fileSystemFor: () => fileSystem,
 *   testingEnabled: false,
 * });
 * ```
 */
export const createChatToolRegistry = (options: ChatToolRegistryOptions): ToolRegistry => {
  const servable = (entry: { readonly needs?: ToolClientKey } | undefined): boolean =>
    entry !== undefined && (entry.needs === undefined || options[entry.needs] !== undefined);

  const schemas = getProviderFacingToolInputSchemas({
    toolChoice: toolMode.auto,
    testingEnabled: options.testingEnabled,
  }).filter((entry) => servable(rpcForTool[entry.toolName]));
  const byName = new Map<string, (typeof schemas)[number]>(schemas.map((entry) => [entry.toolName, entry]));
  const definitions: HostToolDefinition[] = schemas.map((entry) => {
    const inputSchema = z.toJSONSchema(entry.schema, { target: 'draft-7', io: 'input' }) as JsonObject & {
      $schema?: unknown;
    };
    delete inputSchema.$schema;
    return {
      name: entry.toolName,
      description: toolDescriptions[entry.toolName as keyof typeof toolDescriptions],
      inputSchema,
    };
  });

  return {
    list: () => definitions,
    async invoke(invocation) {
      assertNotAborted(invocation.signal);
      const entry = byName.get(invocation.toolName);
      const mapped = rpcForTool[invocation.toolName];
      if (!entry || !mapped) {
        return {
          content: { errorCode: 'TOOL_NOT_FOUND', message: `Unknown tool: ${invocation.toolName}` },
          isError: true,
        };
      }
      const parsed = entry.schema.safeParse(invocation.input);
      if (!parsed.success) {
        return {
          content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED', message: z.prettifyError(parsed.error) },
          isError: true,
        };
      }
      try {
        const dispatcher = createRpcDispatcher({
          fileSystem: options.fileSystemFor(invocation.signal),
          kernelClient: options.kernelClient ?? unattachedKernelClient,
          ...(options.graphics === undefined ? {} : { graphics: options.graphics }),
          ...(options.images === undefined ? {} : { images: options.images }),
          ...(options.geospec === undefined ? {} : { geospec: options.geospec }),
          ...(options.skillResolver === undefined ? {} : { skillResolver: options.skillResolver }),
        });
        const aborted = Promise.withResolvers<never>();
        /* Tracked so a rejection that lands after the race is already won is
         * handled rather than surfacing as an unhandled rejection. */
        const settleAborted = async (): Promise<void> => {
          try {
            await aborted.promise;
          } catch {
            /* The dispatch below reports the abort. */
          }
        };
        void settleAborted();
        const onAbort = (): void => {
          aborted.reject(abortError(invocation.signal));
        };
        invocation.signal.addEventListener('abort', onAbort, { once: true });
        let result: Awaited<ReturnType<typeof dispatcher.dispatch>>;
        try {
          result = await Promise.race([
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- schema validation above pins the tool↔RPC input pair.
            dispatcher.dispatch({ rpcName: mapped.rpc, args: parsed.data } as RpcCall),
            aborted.promise,
          ]);
        } finally {
          invocation.signal.removeEventListener('abort', onAbort);
        }
        assertNotAborted(invocation.signal);
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- RPC results are JSON by construction.
        return { content: structuredClone(result) as JsonValue, isError: !result.success };
      } catch (error) {
        if (invocation.signal.aborted) {
          throw abortError(invocation.signal);
        }
        return {
          content: { errorCode: errorCode(error), message: error instanceof Error ? error.message : String(error) },
          isError: true,
        };
      }
    },
  };
};
