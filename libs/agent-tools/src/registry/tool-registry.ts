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
import { mutatingRpcNames, rpcName, toolDescriptions, toolMode, toolName } from '@taucad/chat/constants';
import { createRpcDispatcher } from '@taucad/chat/rpc';
import type {
  RpcFileSystem,
  RpcGeoSpecClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcRevisionsClient,
  RpcParameterClient,
  RpcRuntimeClient,
  RpcSkillResolver,
} from '@taucad/chat/rpc';
import { getProviderFacingToolInputSchemas, toProviderToolJsonSchema } from '@taucad/chat/schemas';
import { sha256String } from '@taucad/utils/hash';
import { z } from 'zod';

import type { HostToolDefinition, JsonObject, JsonValue, ToolRegistry } from '@taucad/agent-host';

/** The optional dispatcher client one tool needs beyond the filesystem. */
type ToolClientKey = 'kernelClient' | 'graphics' | 'images' | 'geospec' | 'skillResolver' | 'revisions' | 'parameters';

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
  [toolName.getKernelResult]: {
    rpc: rpcName.getKernelResult,
    needs: 'kernelClient',
  },
  [toolName.exportGeometry]: { rpc: rpcName.exportGeometry, needs: 'graphics' },
  [toolName.screenshot]: { rpc: rpcName.captureImages, needs: 'images' },
  [toolName.testModel]: { rpc: rpcName.runGeoSpecTests, needs: 'geospec' },
  [toolName.useSkill]: { rpc: rpcName.resolveSkill, needs: 'skillResolver' },
  [toolName.revisions]: { rpc: rpcName.readRevisions, needs: 'revisions' },
  [toolName.getParameters]: { rpc: rpcName.getParameters, needs: 'parameters' },
  [toolName.applyParameterOperation]: {
    rpc: rpcName.applyParameterOperation,
    needs: 'parameters',
  },
};

/**
 * The verdict tools whose answers the gate checks.
 *
 * Each one reports a kernel-computed outcome the agent reasons from, and each
 * carries the source closure it was computed from (blueprint R4). A verdict for
 * bytes the run has already replaced is not a geometry answer.
 */
const verdictRpcNames = new Set<RpcName>([
  rpcName.getKernelResult,
  rpcName.captureImages,
  rpcName.getParameters,
  rpcName.runGeoSpecTests,
]);

/* Loose readers over results the RPC layer has already shaped: `libs/chat`'s
 * `sourceRevisionSchema`/`writeRevisionSchema` own the exact digest grammar, so
 * re-stating it here would be a second source of truth for the same field. The
 * gate only needs "is there a digest at this path". */
const closureSchema = z.object({ files: z.record(z.string(), z.string()) });
const provenanceSchema = z.object({
  sourceRevision: closureSchema.optional(),
  sourceRevisions: z.array(closureSchema).optional(),
});
const writeResultSchema = z.object({ revision: z.object({ path: z.string(), digest: z.string() }) });

/** One path whose evaluated digest disagrees with the digest the run wrote there. */
type RevisionMismatch = {
  readonly expected: { readonly path: string; readonly digest: string };
  readonly actual: { readonly path: string; readonly digest: string };
};

/**
 * Compare a verdict's source closure with the digests this run has written.
 *
 * @param result - Raw RPC result the dispatcher returned.
 * @param written - Latest digest this registry wrote per rooted path.
 * @returns Every path they disagree on, one entry per path.
 */
const revisionMismatches = (result: unknown, written: ReadonlyMap<string, string>): RevisionMismatch[] => {
  const provenance = provenanceSchema.safeParse(result).data;
  if (!provenance) {
    return [];
  }
  const closures = [
    ...(provenance.sourceRevision ? [provenance.sourceRevision] : []),
    ...(provenance.sourceRevisions ?? []),
  ];
  const mismatches = new Map<string, RevisionMismatch>();
  for (const closure of closures) {
    for (const [path, digest] of Object.entries(closure.files)) {
      const expected = written.get(path);
      if (expected !== undefined && expected !== digest) {
        mismatches.set(path, { expected: { path, digest: expected }, actual: { path, digest } });
      }
    }
  }
  return [...mismatches.values()];
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
  /** Host-owned record writer used only to persist `export_geometry` artifacts. */
  readonly recordFileSystemFor?: ((signal: AbortSignal) => RpcFileSystem) | undefined;
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
  /** Backs the read-only `revisions` tool; a host without a revision graph omits it. */
  readonly revisions?: RpcRevisionsClient | undefined;
  /** Backs checked semantic parameter reads and operations. */
  readonly parameters?: RpcParameterClient | undefined;
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
  const definitions: HostToolDefinition[] = schemas.map((entry) => ({
    name: entry.toolName,
    description: toolDescriptions[entry.toolName as keyof typeof toolDescriptions],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
    inputSchema: toProviderToolJsonSchema(entry.schema) as JsonObject,
  }));

  /* The digest this registry last wrote per rooted path, for the life of the
   * registry: one per browser worker session, one per live checkout on the
   * daemon and desktop (`createHostToolRegistry` memoizes by root), and the
   * same instance the MCP server dispatches through. It is a hint, not the
   * authority: an edit made outside these tools — a person typing in the
   * editor, a peer run, a `git checkout` — leaves an entry naming bytes that
   * are gone, so a disagreeing verdict is checked against the bytes on disk
   * before it is refused (`reconcile`). */
  const written = new Map<string, string>();

  return {
    list: () => definitions,
    async invoke(invocation) {
      assertNotAborted(invocation.signal);
      const entry = byName.get(invocation.toolName);
      const mapped = rpcForTool[invocation.toolName];
      if (!entry || !mapped) {
        return {
          content: {
            errorCode: 'TOOL_NOT_FOUND',
            message: `Unknown tool: ${invocation.toolName}`,
          },
          isError: true,
        };
      }
      const parsed = entry.schema.safeParse(invocation.input);
      if (!parsed.success) {
        return {
          content: {
            errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
            message: z.prettifyError(parsed.error),
          },
          isError: true,
        };
      }
      const preserveMutatingOutcome = mutatingRpcNames.has(mapped.rpc);
      try {
        const fileSystemFor =
          mapped.rpc === rpcName.exportGeometry && options.recordFileSystemFor !== undefined
            ? options.recordFileSystemFor
            : options.fileSystemFor;
        const fileSystem = fileSystemFor(invocation.signal);
        const dispatcher = createRpcDispatcher({
          fileSystem,
          kernelClient: options.kernelClient ?? unattachedKernelClient,
          ...(options.graphics === undefined ? {} : { graphics: options.graphics }),
          ...(options.images === undefined ? {} : { images: options.images }),
          ...(options.geospec === undefined ? {} : { geospec: options.geospec }),
          ...(options.skillResolver === undefined ? {} : { skillResolver: options.skillResolver }),
          ...(options.revisions === undefined ? {} : { revisions: options.revisions }),
          ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
        });
        const dispatchOnce = async (): Promise<Awaited<ReturnType<typeof dispatcher.dispatch>>> => {
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
          try {
            if (typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
              throw new TypeError('Tool input schema returned a non-object value');
            }
            const args =
              mapped.rpc === rpcName.exportGeometry
                ? { ...parsed.data, toolCallId: invocation.toolCallId }
                : parsed.data;
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- schema validation above pins the tool↔RPC input pair.
            const dispatch = dispatcher.dispatch({ rpcName: mapped.rpc, args } as RpcCall, {
              signal: invocation.signal,
            });
            return preserveMutatingOutcome ? await dispatch : await Promise.race([dispatch, aborted.promise]);
          } finally {
            invocation.signal.removeEventListener('abort', onAbort);
          }
        };
        /**
         * Drop the disagreements the bytes on disk settle.
         *
         * `written` remembers only this registry's own writes, so anything that
         * edits the checkout outside the tools leaves it naming bytes that no
         * longer exist and would wedge every later verdict. The file itself is
         * the authority: a verdict whose closure matches what is at the path
         * now describes current reality whatever the memory says, and the
         * memory is corrected to it.
         *
         * ponytail: re-reads the disagreeing paths (only ever paths this run
         * wrote, so text and bounded by `edit_file`'s limit) rather than
         * stamping size/mtime beside every write. A file whose bytes the disk
         * read cannot reproduce exactly — today, a UTF-8 BOM, which
         * `RpcFileSystem.readFile` decodes away while the kernel hashes it —
         * simply fails to reconcile and takes the refusing path.
         *
         * @param mismatches - Every path this verdict and the memory disagree on.
         * @returns The first disagreement the disk did not settle.
         */
        const reconcile = async (mismatches: readonly RevisionMismatch[]): Promise<RevisionMismatch | undefined> => {
          const onDisk = await Promise.all(
            mismatches.map(async ({ actual }): Promise<string> => {
              try {
                return `sha256:${await sha256String(await fileSystem.readFile(actual.path))}`;
              } catch {
                /* Gone, or unreadable as text: either way not the verdict's bytes. */
                return 'missing';
              }
            }),
          );
          for (const [index, mismatch] of mismatches.entries()) {
            if (onDisk[index] === mismatch.actual.digest) {
              written.set(mismatch.actual.path, mismatch.actual.digest);
            }
          }
          return mismatches.find((mismatch, index) => onDisk[index] !== mismatch.actual.digest);
        };
        /**
         * Settle one dispatched result under the freshness gate (R5).
         *
         * A verdict that names bytes this run has replaced gets exactly one
         * more chance — the second call runs against the same clients, so a
         * host that revalidates its retained closure (R1) answers freshly here.
         * A second disagreement is a host failure rather than geometry, so it
         * leaves as a typed error and never as a verdict the agent would act on
         * (charter Q2).
         *
         * @param first - Result the first dispatch returned.
         * @returns The tool result the agent sees.
         */
        const settle = async (
          first: Awaited<ReturnType<typeof dispatcher.dispatch>>,
        ): Promise<Awaited<ReturnType<ToolRegistry['invoke']>>> => {
          let result = first;
          if (!verdictRpcNames.has(mapped.rpc)) {
            /* Only the three write tools carry a top-level `revision`; the
             * parameter operation's revision is nested under its outcome. */
            const revision = writeResultSchema.safeParse(result).data?.revision;
            if (revision && result.success) {
              written.set(revision.path, revision.digest);
            }
          } else if (await reconcile(revisionMismatches(result, written))) {
            result = await dispatchOnce();
            assertNotAborted(invocation.signal);
            const mismatch = await reconcile(revisionMismatches(result, written));
            if (mismatch) {
              return {
                content: {
                  errorCode: 'STALE_EVALUATION',
                  message:
                    `${invocation.toolName} answered for ${mismatch.actual.path} at ${mismatch.actual.digest}, ` +
                    `but this run last wrote ${mismatch.expected.digest} there. Re-running returned the same ` +
                    'revision, so the answer describes bytes that no longer exist.',
                  expected: mismatch.expected,
                  actual: mismatch.actual,
                },
                isError: true,
              };
            }
          }
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- RPC results are JSON by construction.
          return {
            content: structuredClone(result) as JsonValue,
            isError: !result.success,
          };
        };
        const dispatched = await dispatchOnce();
        if (!preserveMutatingOutcome) {
          assertNotAborted(invocation.signal);
        }
        return await settle(dispatched);
      } catch (error) {
        if (invocation.signal.aborted && !preserveMutatingOutcome) {
          throw abortError(invocation.signal);
        }
        return {
          content: {
            errorCode: errorCode(error),
            message: error instanceof Error ? error.message : String(error),
          },
          isError: true,
        };
      }
    },
  };
};
