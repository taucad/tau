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
  RpcWorkbenchClient,
  RpcSkillResolver,
} from '@taucad/chat/rpc';
import { getProviderFacingToolInputSchemas, toProviderToolJsonSchema } from '@taucad/chat/schemas';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import { sha256String } from '@taucad/utils/hash';
import { z } from 'zod';

import type {
  HostToolDefinition,
  HostToolInvocation,
  HostToolResult,
  JsonObject,
  JsonValue,
  ToolRegistry,
} from '@taucad/agent-host';
import { createMachinePrintPlanner } from '#registry/machine-print-planner.js';
import type { MachinePrintPlannerDependencies } from '#registry/machine-print-planner.js';
import { createMachineToolRegistry, isMachineToolName } from '#registry/machine-tool-registry.js';
import { createRuntimeWorkbenchClient } from '#registry/workbench-client.js';

/** The optional dispatcher client one tool needs beyond the filesystem. */
type ToolClientKey =
  | 'kernelClient'
  | 'graphics'
  | 'images'
  | 'geospec'
  | 'skillResolver'
  | 'revisions'
  | 'parameters'
  | 'workbench';

/**
 * Every servable tool, its RPC, and the client that must be present for it.
 * Tools with no `needs` require only the filesystem, which is mandatory. A
 * tool whose one call writes more than one path, or state outside the
 * workspace, is `sequential`: its batch runs in call order (EQ6).
 */
const rpcForTool: Readonly<
  Record<string, { readonly rpc: RpcName; readonly needs?: ToolClientKey; readonly sequential?: true }>
> = {
  [toolName.readFile]: { rpc: rpcName.readFile },
  [toolName.editFile]: { rpc: rpcName.editFile },
  [toolName.listDirectory]: { rpc: rpcName.listDirectory },
  [toolName.createFile]: { rpc: rpcName.createFile },
  [toolName.deleteFile]: { rpc: rpcName.deleteFile },
  [toolName.grep]: { rpc: rpcName.grep },
  [toolName.globSearch]: { rpc: rpcName.globSearch },
  [toolName.evaluateModel]: {
    rpc: rpcName.evaluateModel,
    needs: 'kernelClient',
  },
  /* Writes the export and its artifact record outside the workspace. */
  [toolName.exportModel]: { rpc: rpcName.exportModel, needs: 'graphics', sequential: true },
  [toolName.screenshot]: { rpc: rpcName.captureImages, needs: 'images' },
  [toolName.testModel]: { rpc: rpcName.runGeoSpecTests, needs: 'geospec' },
  [toolName.useSkill]: { rpc: rpcName.resolveSkill, needs: 'skillResolver' },
  [toolName.revisions]: { rpc: rpcName.readRevisions, needs: 'revisions' },
  [toolName.getParameters]: { rpc: rpcName.getParameters, needs: 'parameters' },
  /* Rewrites the source and its parameter record together. */
  [toolName.applyParameterOperation]: {
    rpc: rpcName.applyParameterOperation,
    needs: 'parameters',
    sequential: true,
  },
  [toolName.updateTodos]: { rpc: rpcName.writeTodos },
  [toolName.arrangeWorkbench]: { rpc: rpcName.arrangeWorkbench, needs: 'workbench' },
};

const geospecAuthoringRecipes = {
  legacy:
    "Selected GeoSpec API: legacy. Import describe, it, and expectGeo from 'geospec'; import loadModel from 'geospec/model'. Load with await loadModel({ file: 'main.ts' }) and assert with expectGeo(model).",
  native:
    "Selected GeoSpec API: native. Import describe, it, and expectNativeGeo from 'geospec'; import loadNativeModel from 'geospec/runner/native'. Load with await loadNativeModel({ file: 'main.ts' }) and await every expectNativeGeo(model) assertion.",
} as const;

/**
 * Records Tau writes on the agent's behalf. The agent's own composed view keeps
 * `.tau/artifacts` and `.tau/chats` read-only, so these writes go through the
 * host's record filesystem; each handler fences its own target path.
 */
const recordRpcNames = new Set<RpcName>([rpcName.exportModel, rpcName.writeTodos, rpcName.arrangeWorkbench]);

/**
 * The verdict tools whose answers the gate checks.
 *
 * Each one reports a kernel-computed outcome the agent reasons from, and each
 * carries the source closure it was computed from (blueprint R4). A verdict for
 * bytes the run has already replaced is not a geometry answer.
 */
const verdictRpcNames = new Set<RpcName>([
  rpcName.evaluateModel,
  rpcName.exportModel,
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

/** Give an arrange schema refusal the field location and correction the agent needs. */
const arrangeValidationMessage = (error: z.ZodError, input: unknown): string => {
  const issue = error.issues[0];
  if (issue === undefined) {
    return 'Invalid workbench arrangement. Nothing was written.';
  }
  let path = '';
  for (const part of issue.path) {
    path = typeof part === 'number' ? `${path}[${part}]` : path === '' ? String(part) : `${path}.${String(part)}`;
  }
  let value: unknown = input;
  for (const part of issue.path) {
    if (Array.isArray(value) && typeof part === 'number') {
      value = value[part];
    } else if (value !== null && typeof value === 'object' && typeof part === 'string' && part in value) {
      value = Reflect.get(value, part) as unknown;
    } else {
      value = undefined;
      break;
    }
  }
  const detail =
    (issue.code === 'too_small' || issue.code === 'too_big') &&
    issue.origin === 'array' &&
    (issue.code === 'too_small' ? issue.minimum : issue.maximum) === 3 &&
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number')
      ? `expected ${issue.code === 'too_small' ? issue.minimum : issue.maximum} numbers, received ${value.length}`
      : issue.message;
  return `${path || 'input'}: ${detail.replace(/\.$/u, '')}. Nothing was written.`;
};

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw abortError(signal);
  }
};

/**
 * `RpcDependencies.kernelClient` is not optional, but `evaluate_model` is
 * unlisted without one and `invoke` refuses unlisted tools, so this is only
 * ever the dispatcher's placeholder.
 */
const unattachedKernelClient: RpcRuntimeClient = {
  async evaluateModel() {
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
  /**
   * Host-owned record writer, used only for the records Tau writes on the
   * agent's behalf: `export_model` artifacts under `.tau/artifacts` and the
   * `update_todos` list at `.tau/chats/<chatId>/todo.yaml`, both read-only in
   * the agent's own view. Without it those writes go through `fileSystemFor`.
   */
  readonly recordFileSystemFor?: ((signal: AbortSignal) => RpcFileSystem) | undefined;
  /** Live project root for workbench records, including candidate runs. */
  readonly workbenchFileSystemFor?: ((signal: AbortSignal) => RpcFileSystem) | undefined;
  /** Backs `evaluate_model`. */
  readonly kernelClient?: RpcRuntimeClient | undefined;
  /** Backs `export_model`. */
  readonly graphics?: RpcGraphicsClient | undefined;
  /** Backs `screenshot`. */
  readonly images?: RpcImageClient | undefined;
  /** Backs `test_model`. */
  readonly geospec?: RpcGeoSpecClient | undefined;
  /** Authoring API served by `geospec`; the caller pairs it with the selected runner. Defaults to legacy. */
  readonly geospecAuthoringMode?: 'legacy' | 'native' | undefined;
  /** Backs `use_skill`. */
  readonly skillResolver?: RpcSkillResolver | undefined;
  /** Backs the read-only `revisions` tool; a host without a revision graph omits it. */
  readonly revisions?: RpcRevisionsClient | undefined;
  /** Explicit machine tools, offered only after transport capability and route grant negotiation. */
  readonly machines?: RuntimeTransportFacet<MachineClient> | undefined;
  /**
   * The host's part of printing: the `tau.json` id of the project the agent
   * works in, which names every print artifact, and a binary read of the
   * recorded slice. The registry slices through its own `export_model`
   * route, so `request_print` is offered only with these, a `graphics` client
   * and an available `machines` facet. A host that cannot name its project
   * omits this, and neither `request_print` nor `prepare_machine_print` is
   * offered.
   */
  readonly print?: Pick<MachinePrintPlannerDependencies, 'projectId' | 'readArtifact'> | undefined;
  /** Backs checked semantic parameter reads and operations. */
  readonly parameters?: RpcParameterClient | undefined;
  /** Connected runtime model-file check; filesystem-only hosts can omit it. */
  readonly workbench?: RpcWorkbenchClient | undefined;
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
  const workbench = options.workbench ?? createRuntimeWorkbenchClient();
  const servable = (entry: { readonly needs?: ToolClientKey } | undefined): boolean =>
    entry !== undefined &&
    (entry.needs === undefined || entry.needs === 'workbench' || options[entry.needs] !== undefined);

  const schemas = getProviderFacingToolInputSchemas({
    toolChoice: toolMode.auto,
    testingEnabled: options.testingEnabled,
  }).filter((entry) => servable(rpcForTool[entry.toolName]));
  const byName = new Map<string, (typeof schemas)[number]>(schemas.map((entry) => [entry.toolName, entry]));
  const definitions: HostToolDefinition[] = schemas.map((entry) => ({
    name: entry.toolName,
    description:
      entry.toolName === toolName.testModel
        ? `${toolDescriptions[toolName.testModel]}\n\n${geospecAuthoringRecipes[options.geospecAuthoringMode ?? 'legacy']}`
        : toolDescriptions[entry.toolName as keyof typeof toolDescriptions],
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- draft-7 JSON Schema is JSON by construction.
    inputSchema: toProviderToolJsonSchema(entry.schema) as JsonObject,
    ...(rpcForTool[entry.toolName]?.sequential === true ? { executionMode: 'sequential' } : {}),
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

  /**
   * One chat RPC tool call: validate the input against the tool's own schema,
   * then dispatch it through the canonical dispatcher.
   *
   * @param invocation - The call, from the model or from this registry's own
   *   print planner.
   * @returns The tool result.
   */
  const invokeRpcTool = async (invocation: HostToolInvocation): Promise<HostToolResult> => {
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
      const arrange = invocation.toolName === toolName.arrangeWorkbench;
      return {
        content: {
          ...(arrange ? { success: false } : {}),
          errorCode: arrange ? 'VALIDATION_ERROR' : 'TOOL_INPUT_VALIDATION_FAILED',
          message: arrange ? arrangeValidationMessage(parsed.error, invocation.input) : z.prettifyError(parsed.error),
        },
        isError: true,
      };
    }
    const preserveMutatingOutcome = mutatingRpcNames.has(mapped.rpc);
    try {
      const fileSystemFor =
        mapped.rpc === rpcName.arrangeWorkbench && options.workbenchFileSystemFor !== undefined
          ? options.workbenchFileSystemFor
          : recordRpcNames.has(mapped.rpc) && options.recordFileSystemFor !== undefined
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
        workbench,
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
          /* The trusted ID joins after parsing; model input cannot choose it. */
          const args =
            mapped.rpc === rpcName.exportModel
              ? {
                  ...parsed.data,
                  toolCallId: invocation.toolCallId,
                }
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
  };

  const { machines, print } = options;
  const machineRegistry = machines?.available
    ? createMachineToolRegistry(machines, {
        projectId: print?.projectId,
        /* The agent's own view, the one its edits to the print intent go through. */
        fileSystemFor: options.fileSystemFor,
        planPrint:
          print === undefined || !servable(rpcForTool[toolName.exportModel])
            ? undefined
            : createMachinePrintPlanner({
                ...print,
                machines,
                /* This registry's own route, so the slice is validated and recorded exactly as an export is. */
                exportModel: async (input) =>
                  invokeRpcTool({
                    toolCallId: input.toolCallId,
                    toolName: toolName.exportModel,
                    input: {
                      targetFile: input.targetFile,
                      to: input.to,
                      ...(input.options === undefined ? {} : { options: input.options }),
                    },
                    signal: input.signal,
                  }),
              }),
      })
    : undefined;
  definitions.push(...(machineRegistry?.list() ?? []));

  return {
    list: () => definitions,
    /* Only the machine tools ask for approvals (D5). */
    answerApproval: async (answer) => machineRegistry?.answerApproval?.(answer),
    async invoke(invocation) {
      assertNotAborted(invocation.signal);
      if (isMachineToolName(invocation.toolName)) {
        return (
          machineRegistry?.invoke(invocation) ?? {
            content: { errorCode: 'TOOL_NOT_FOUND', message: `Unknown tool: ${invocation.toolName}` },
            isError: true,
          }
        );
      }
      return invokeRpcTool(invocation);
    },
  };
};
